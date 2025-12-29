"""
API Poller for Transcription Tasks

Polls the Next.js API for pending transcription tasks and processes them.
Used when worker doesn't have direct database access.
"""

import os
import time
import requests
import logging
from pathlib import Path
import sys
import tempfile

# Add parent directory to path to import transcribe_server
sys.path.insert(0, str(Path(__file__).parent))
from transcribe_server import get_model, transcribe_segments_concurrent, segment_audio, get_audio_duration, remove_overlap_duplicates

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:3000")
WORKER_API_KEY = os.getenv("WORKER_API_KEY", "")
POLL_INTERVAL = int(os.getenv("POLL_INTERVAL", "2"))
MAX_SEGMENT_DURATION = int(os.getenv("MAX_SEGMENT_DURATION", "900"))
TEMP_DIR = os.getenv("TEMP_DIR", "/tmp/worker")

# Ensure temp directory exists
os.makedirs(TEMP_DIR, exist_ok=True)

def get_headers():
    """Get request headers with authentication."""
    headers = {"Content-Type": "application/json"}
    if WORKER_API_KEY:
        headers["Authorization"] = f"Bearer {WORKER_API_KEY}"
    return headers

def fetch_pending_task():
    """Fetch a pending task from API."""
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/worker/tasks",
            headers=get_headers(),
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        return data.get("task")
    except Exception as e:
        logger.error(f"Error fetching task: {e}")
        return None

def update_task_progress(task_id, progress):
    """Update task progress via API."""
    try:
        response = requests.patch(
            f"{API_BASE_URL}/api/worker/tasks",
            headers=get_headers(),
            json={"taskId": task_id, "progress": progress},
            timeout=30
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Error updating progress: {e}")

def update_task_success(task_id, result):
    """Mark task as completed via API."""
    try:
        response = requests.patch(
            f"{API_BASE_URL}/api/worker/tasks",
            headers=get_headers(),
            json={
                "taskId": task_id,
                "status": "completed",
                "progress": 100,
                "result": result
            },
            timeout=30
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Error marking task success: {e}")

def update_task_failure(task_id, error):
    """Mark task as failed via API."""
    try:
        response = requests.patch(
            f"{API_BASE_URL}/api/worker/tasks",
            headers=get_headers(),
            json={
                "taskId": task_id,
                "status": "failed",
                "progress": 0,
                "error": str(error)
            },
            timeout=30
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Error marking task failure: {e}")

def check_task_cancelled(task_id):
    """Check if task was cancelled."""
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/worker/tasks/{task_id}",
            headers=get_headers(),
            timeout=30
        )
        response.raise_for_status()
        data = response.json()
        return data.get("status") == "cancelled"
    except Exception as e:
        logger.error(f"Error checking task status: {e}")
        return False

def download_task_file(task_id):
    """Download the audio file for a task."""
    try:
        headers = {}
        if WORKER_API_KEY:
            headers["Authorization"] = f"Bearer {WORKER_API_KEY}"
        
        response = requests.get(
            f"{API_BASE_URL}/api/worker/tasks/{task_id}/file",
            headers=headers,
            timeout=300,  # 5 min timeout for large files
            stream=True
        )
        response.raise_for_status()
        
        # Get filename from Content-Disposition header
        content_disp = response.headers.get("Content-Disposition", "")
        if "filename=" in content_disp:
            filename = content_disp.split("filename=")[-1].strip('"')
        else:
            filename = f"{task_id}.audio"
        
        # Save to temp directory
        file_path = os.path.join(TEMP_DIR, filename)
        with open(file_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        return file_path
    except Exception as e:
        logger.error(f"Error downloading file: {e}")
        return None

def delete_task_file(task_id):
    """Delete the audio file from server after processing."""
    try:
        headers = {}
        if WORKER_API_KEY:
            headers["Authorization"] = f"Bearer {WORKER_API_KEY}"
        
        response = requests.delete(
            f"{API_BASE_URL}/api/worker/tasks/{task_id}/file",
            headers=headers,
            timeout=30
        )
        response.raise_for_status()
    except Exception as e:
        logger.error(f"Error deleting remote file: {e}")

async def process_task(task):
    """Process a transcription task."""
    task_id = task['id']
    file_name = task.get('file_name', 'unknown')
    
    # Download the file
    logger.info(f"Downloading file for task {task_id}...")
    file_path = download_task_file(task_id)
    
    if not file_path:
        logger.error(f"Failed to download file for task {task_id}")
        update_task_failure(task_id, "Failed to download file")
        return
    
    try:
        # Check if task was cancelled
        if check_task_cancelled(task_id):
            logger.info(f"Task {task_id} was cancelled, skipping")
            return
        
        logger.info(f"Processing task {task_id}: {file_name}")
        
        # Get audio duration
        duration = get_audio_duration(file_path)
        logger.info(f"Audio duration: {duration:.1f}s")
        
        update_task_progress(task_id, 30)
        
        # Decide whether to segment
        if duration > MAX_SEGMENT_DURATION:
            logger.info(f"Segmenting audio...")
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
        
        # Update via API
        update_task_success(task_id, result)
        logger.info(f"✅ Task {task_id} completed: {len(all_segments)} segments")
        
    except Exception as e:
        logger.error(f"❌ Task {task_id} failed: {e}")
        update_task_failure(task_id, str(e))
    finally:
        # Clean up local file
        if os.path.exists(file_path):
            os.unlink(file_path)
        # Clean up remote file
        delete_task_file(task_id)

def main():
    """Main polling loop."""
    logger.info("Starting API-based transcription worker...")
    logger.info(f"API Base URL: {API_BASE_URL}")
    logger.info(f"Poll interval: {POLL_INTERVAL}s")
    
    # Pre-load model
    get_model()
    
    try:
        while True:
            try:
                task = fetch_pending_task()
                
                if task:
                    import asyncio
                    asyncio.run(process_task(task))
                else:
                    time.sleep(POLL_INTERVAL)
                    
            except Exception as e:
                logger.error(f"Error in polling loop: {e}")
                time.sleep(POLL_INTERVAL)
                
    except KeyboardInterrupt:
        logger.info("Shutting down...")

if __name__ == "__main__":
    main()
