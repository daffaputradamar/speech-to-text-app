"""
Database Poller for Transcription Tasks

Polls the database for pending transcription tasks and processes them.
No HTTP timeouts - updates database directly.
"""

import os
import time
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from pathlib import Path
import sys

# Add parent directory to path to import transcribe_server
sys.path.insert(0, str(Path(__file__).parent))
from transcribe_server import get_model, transcribe_segments_concurrent, segment_audio, get_audio_duration, remove_overlap_duplicates

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "2"))  # seconds
MAX_SEGMENT_DURATION = int(os.getenv("MAX_SEGMENT_DURATION", "900"))
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/uploads")

def get_db_connection():
    """Get database connection."""
    return psycopg2.connect(DATABASE_URL)

def fetch_pending_task(conn):
    """Fetch a pending task from database."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            UPDATE tasks 
            SET status = 'processing', 
                progress = 10,
                updated_at = NOW()
            WHERE id = (
                SELECT id FROM tasks 
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING *
        """)
        conn.commit()
        return cur.fetchone()

def update_task_progress(conn, task_id, progress):
    """Update task progress."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE tasks 
            SET progress = %s, updated_at = NOW()
            WHERE id = %s
        """, (progress, task_id))
        conn.commit()

def update_task_success(conn, task_id, result):
    """Mark task as completed."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE tasks 
            SET status = 'completed',
                progress = 100,
                result = %s,
                error = NULL,
                updated_at = NOW()
            WHERE id = %s
        """, (result, task_id))
        conn.commit()

def update_task_failure(conn, task_id, error):
    """Mark task as failed."""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE tasks 
            SET status = 'failed',
                progress = 0,
                error = %s,
                updated_at = NOW()
            WHERE id = %s
        """, (str(error), task_id))
        conn.commit()

def find_task_file(task_id: str) -> str | None:
    """Find the uploaded file for a task (may have various extensions)."""
    import glob
    pattern = os.path.join(UPLOAD_DIR, f"{task_id}.*")
    matches = glob.glob(pattern)
    if matches:
        return matches[0]
    # Fallback to no extension (legacy)
    no_ext = os.path.join(UPLOAD_DIR, task_id)
    if os.path.exists(no_ext):
        return no_ext
    return None


async def process_task(conn, task):
    """Process a transcription task."""
    task_id = task['id']
    file_path = find_task_file(task_id)
    
    if not file_path:
        logger.error(f"File not found for task {task_id}")
        update_task_failure(conn, task_id, "Upload file not found")
        return
    
    try:
        # Check if task was cancelled
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT status FROM tasks WHERE id = %s", (task_id,))
            result = cur.fetchone()
            if result and result['status'] == 'cancelled':
                logger.info(f"Task {task_id} was cancelled, skipping")
                # Clean up file
                if os.path.exists(file_path):
                    os.unlink(file_path)
                return
        
        logger.info(f"Processing task {task_id}: {task['file_name']}")
        
        # Get audio duration
        duration = get_audio_duration(file_path)
        logger.info(f"Audio duration: {duration:.1f}s")
        
        update_task_progress(conn, task_id, 30)
        
        # Decide whether to segment
        if duration > MAX_SEGMENT_DURATION:
            logger.info(f"Segmenting audio...")
            import tempfile
            temp_dir = tempfile.mkdtemp(prefix="transcribe_")
            
            segment_infos = segment_audio(file_path, temp_dir, MAX_SEGMENT_DURATION)
            logger.info(f"Created {len(segment_infos)} segments")
            
            # Transcribe concurrently
            results = await transcribe_segments_concurrent(segment_infos)
            
            # Merge results
            all_segments = []
            detected_language = None
            
            for result in results:
                if result["success"]:
                    all_segments.extend(result["segments"])
                    if detected_language is None and result["language"]:
                        detected_language = result["language"]
            
            all_segments.sort(key=lambda x: x["start"])
            all_segments = remove_overlap_duplicates(all_segments)
            
            # Clean up temp dir
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
        else:
            # Short audio - transcribe directly
            model = get_model()
            segments_list, info = model.transcribe(
                file_path,
                beam_size=5,
                word_timestamps=False,
                vad_filter=True,
            )
            
            all_segments = []
            for segment in segments_list:
                all_segments.append({
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": segment.text.strip(),
                })
            detected_language = info.language
        
        # Format result with timestamps
        formatted_lines = []
        for segment in all_segments:
            start_seconds = int(segment["start"])
            hours = start_seconds // 3600
            minutes = (start_seconds % 3600) // 60
            seconds = start_seconds % 60
            
            if hours > 0:
                timestamp = f"[{hours:02d}:{minutes:02d}:{seconds:02d}]"
            else:
                timestamp = f"[{minutes:02d}:{seconds:02d}]"
            
            formatted_lines.append(f"{timestamp} {segment['text']}")
        
        result = "\n".join(formatted_lines)
        
        # Update database
        update_task_success(conn, task_id, result)
        logger.info(f"✅ Task {task_id} completed: {len(all_segments)} segments")
        
    except Exception as e:
        logger.error(f"❌ Task {task_id} failed: {e}")
        update_task_failure(conn, task_id, str(e))
    finally:
        # Clean up file
        if os.path.exists(file_path):
            os.unlink(file_path)

def main():
    """Main polling loop."""
    logger.info("Starting transcription task poller...")
    logger.info(f"Database: {DATABASE_URL[:30]}...")
    logger.info(f"Poll interval: {POLL_INTERVAL}s")
    
    # Pre-load model
    get_model()
    
    conn = get_db_connection()
    
    try:
        while True:
            try:
                task = fetch_pending_task(conn)
                
                if task:
                    import asyncio
                    asyncio.run(process_task(conn, task))
                else:
                    time.sleep(POLL_INTERVAL)
                    
            except Exception as e:
                logger.error(f"Error in polling loop: {e}")
                time.sleep(POLL_INTERVAL)
                
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
