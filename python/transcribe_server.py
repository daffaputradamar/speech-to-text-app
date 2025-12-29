"""
Local Speech-to-Text Transcription Server

Uses faster-whisper for efficient local transcription.
Supports concurrent processing and audio segmentation for long files.
Exposes a simple FastAPI endpoint for Next.js to call.
"""

import os
import sys
import tempfile
import logging
import asyncio
import subprocess
import shutil
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor
import threading

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Configuration
MAX_SEGMENT_DURATION = int(os.getenv("MAX_SEGMENT_DURATION", "600"))  # 10 minutes default
MAX_CONCURRENT_TASKS = int(os.getenv("MAX_CONCURRENT_TASKS", "4"))
SEGMENT_OVERLAP = 1  # 1 second overlap between segments

# Thread pool for concurrent transcription
executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_TASKS)

# Model lock for thread-safe access
_model = None
_model_lock = threading.Lock()


def get_model():
    """Load the Whisper model lazily with thread safety."""
    global _model
    if _model is None:
        with _model_lock:
            # Double-check after acquiring lock
            if _model is None:
                logger.info("Loading Whisper model...")
                from faster_whisper import WhisperModel
                
                model_size = os.getenv("WHISPER_MODEL", "base")
                device = os.getenv("WHISPER_DEVICE", "cpu")
                compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
                
                # Use more CPU threads for faster processing
                cpu_threads = int(os.getenv("WHISPER_CPU_THREADS", "4"))
                
                logger.info(f"Model: {model_size}, Device: {device}, Compute: {compute_type}, Threads: {cpu_threads}")
                
                _model = WhisperModel(
                    model_size,
                    device=device,
                    compute_type=compute_type,
                    cpu_threads=cpu_threads,
                )
                logger.info("Whisper model loaded successfully!")
    return _model


def get_audio_duration(file_path: str) -> float:
    """Get audio duration using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path
            ],
            capture_output=True,
            text=True,
            check=True
        )
        return float(result.stdout.strip())
    except Exception as e:
        logger.error(f"Failed to get audio duration: {e}")
        return 0


def segment_audio(input_path: str, output_dir: str, segment_duration: int) -> list[dict]:
    """
    Split audio into segments using ffmpeg.
    Returns list of segment info with file path and start time.
    """
    duration = get_audio_duration(input_path)
    if duration <= 0:
        raise ValueError("Could not determine audio duration")
    
    segments = []
    current_time = 0
    segment_index = 0
    
    file_ext = Path(input_path).suffix
    
    while current_time < duration:
        segment_path = os.path.join(output_dir, f"segment_{segment_index:04d}{file_ext}")
        segment_end = min(current_time + segment_duration, duration)
        
        # Use ffmpeg to extract segment
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-ss", str(current_time),
            "-t", str(segment_duration + SEGMENT_OVERLAP),  # Add overlap
            "-c", "copy",  # Fast copy without re-encoding
            "-avoid_negative_ts", "1",
            segment_path
        ]
        
        try:
            subprocess.run(cmd, capture_output=True, check=True)
            segments.append({
                "path": segment_path,
                "start_time": current_time,
                "index": segment_index
            })
            logger.info(f"Created segment {segment_index}: {current_time:.1f}s - {segment_end:.1f}s")
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to create segment {segment_index}: {e}")
        
        current_time += segment_duration
        segment_index += 1
    
    return segments


def transcribe_segment_sync(segment_info: dict, language: Optional[str] = None) -> dict:
    """
    Transcribe a single audio segment synchronously.
    This runs in a thread pool.
    """
    model = get_model()
    segment_path = segment_info["path"]
    start_offset = segment_info["start_time"]
    
    try:
        segments_list, info = model.transcribe(
            segment_path,
            language=language,
            beam_size=5,
            word_timestamps=False,
            vad_filter=True,
        )
        
        # Collect segments with adjusted timestamps
        segments = []
        for segment in segments_list:
            segments.append({
                "start": round(segment.start + start_offset, 2),
                "end": round(segment.end + start_offset, 2),
                "text": segment.text.strip(),
            })
        
        return {
            "segments": segments,
            "language": info.language,
            "index": segment_info["index"],
            "success": True
        }
    except Exception as e:
        logger.error(f"Failed to transcribe segment {segment_info['index']}: {e}")
        return {
            "segments": [],
            "language": None,
            "index": segment_info["index"],
            "success": False,
            "error": str(e)
        }


async def transcribe_segments_concurrent(
    segment_infos: list[dict],
    language: Optional[str] = None
) -> list[dict]:
    """Transcribe multiple segments concurrently using thread pool."""
    loop = asyncio.get_event_loop()
    
    # Create tasks for each segment
    tasks = [
        loop.run_in_executor(
            executor,
            transcribe_segment_sync,
            segment_info,
            language
        )
        for segment_info in segment_infos
    ]
    
    # Wait for all tasks to complete
    results = await asyncio.gather(*tasks)
    
    # Sort by segment index to maintain order
    results.sort(key=lambda x: x["index"])
    
    return results


app = FastAPI(title="Local Speech-to-Text API")

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://web:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranscriptionResponse(BaseModel):
    text: str
    segments: list[dict]
    language: str
    duration: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    max_concurrent_tasks: int
    max_segment_duration: int


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        model_loaded=_model is not None,
        max_concurrent_tasks=MAX_CONCURRENT_TASKS,
        max_segment_duration=MAX_SEGMENT_DURATION
    )


@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = None
):
    """
    Transcribe an audio file to text.
    Long audio files are automatically segmented and processed concurrently.
    
    Args:
        audio: The audio file to transcribe
        language: Optional language code (e.g., "en", "id"). Auto-detected if not provided.
    
    Returns:
        Transcription result with text, segments, detected language, and duration.
    """
    allowed_extensions = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".webm", ".aac", ".aiff"}
    file_ext = Path(audio.filename or "").suffix.lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format: {file_ext}. Supported: {', '.join(allowed_extensions)}"
        )
    
    temp_dir = None
    temp_path = None
    
    try:
        # Create temp directory for this request
        temp_dir = tempfile.mkdtemp(prefix="transcribe_")
        temp_path = os.path.join(temp_dir, f"input{file_ext}")
        
        # Save uploaded file
        content = await audio.read()
        with open(temp_path, "wb") as f:
            f.write(content)
        
        file_size_mb = len(content) / 1024 / 1024
        logger.info(f"Processing file: {audio.filename} ({file_size_mb:.2f} MB)")
        
        # Get audio duration
        duration = get_audio_duration(temp_path)
        logger.info(f"Audio duration: {duration:.1f}s")
        
        # Decide whether to segment
        if duration > MAX_SEGMENT_DURATION:
            logger.info(f"Audio exceeds {MAX_SEGMENT_DURATION}s, segmenting...")
            
            # Segment the audio
            segment_infos = segment_audio(temp_path, temp_dir, MAX_SEGMENT_DURATION)
            logger.info(f"Created {len(segment_infos)} segments")
            
            # Transcribe segments concurrently
            results = await transcribe_segments_concurrent(segment_infos, language)
            
            # Merge results
            all_segments = []
            detected_language = None
            
            for result in results:
                if result["success"]:
                    all_segments.extend(result["segments"])
                    if detected_language is None and result["language"]:
                        detected_language = result["language"]
            
            # Sort segments by start time and remove duplicates from overlap
            all_segments.sort(key=lambda x: x["start"])
            all_segments = remove_overlap_duplicates(all_segments)
            
            full_text = " ".join(seg["text"] for seg in all_segments if seg["text"])
            
            logger.info(f"Transcription complete: {len(all_segments)} segments from {len(segment_infos)} audio chunks")
            
            return TranscriptionResponse(
                text=full_text,
                segments=all_segments,
                language=detected_language or "unknown",
                duration=duration,
            )
        else:
            # Short audio - transcribe directly
            model = get_model()
            
            segments_list, info = model.transcribe(
                temp_path,
                language=language,
                beam_size=5,
                word_timestamps=False,
                vad_filter=True,
            )
            
            segments = []
            full_text_parts = []
            
            for segment in segments_list:
                segment_dict = {
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": segment.text.strip(),
                }
                segments.append(segment_dict)
                full_text_parts.append(segment.text.strip())
            
            full_text = " ".join(full_text_parts)
            
            logger.info(f"Transcription complete: {len(segments)} segments, {info.language} detected")
            
            return TranscriptionResponse(
                text=full_text,
                segments=segments,
                language=info.language,
                duration=info.duration,
            )
        
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    
    finally:
        # Clean up temp directory
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to clean up temp dir: {e}")


def remove_overlap_duplicates(segments: list[dict], tolerance: float = 0.5) -> list[dict]:
    """
    Remove duplicate segments that might occur due to overlap between audio chunks.
    """
    if not segments:
        return segments
    
    filtered = [segments[0]]
    
    for seg in segments[1:]:
        last = filtered[-1]
        # Skip if this segment starts very close to where the last one ended
        # and has similar text (likely duplicate from overlap)
        if abs(seg["start"] - last["end"]) < tolerance:
            # Check text similarity - if very similar, skip
            if seg["text"].lower().strip() == last["text"].lower().strip():
                continue
        filtered.append(seg)
    
    return filtered


@app.post("/transcribe-with-timestamps")
async def transcribe_with_timestamps(
    audio: UploadFile = File(...),
    language: Optional[str] = None
):
    """
    Transcribe audio and return formatted text with timestamps.
    
    Returns text in format:
    [00:00:05] First sentence here.
    [00:00:12] Second sentence here.
    """
    result = await transcribe_audio(audio, language)
    
    # Format with timestamps
    formatted_lines = []
    for segment in result.segments:
        start_seconds = int(segment["start"])
        hours = start_seconds // 3600
        minutes = (start_seconds % 3600) // 60
        seconds = start_seconds % 60
        
        if hours > 0:
            timestamp = f"[{hours:02d}:{minutes:02d}:{seconds:02d}]"
        else:
            timestamp = f"[{minutes:02d}:{seconds:02d}]"
        
        formatted_lines.append(f"{timestamp} {segment['text']}")
    
    return {
        "text": result.text,
        "formatted_text": "\n".join(formatted_lines),
        "segments": result.segments,
        "language": result.language,
        "duration": result.duration,
    }


@app.on_event("startup")
async def startup_event():
    """Pre-load the model on startup."""
    logger.info("Pre-loading Whisper model...")
    get_model()
    logger.info("Server ready for transcription requests!")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on shutdown."""
    executor.shutdown(wait=True)
    logger.info("Server shutdown complete")


if __name__ == "__main__":
    port = int(os.getenv("TRANSCRIBE_PORT", "8000"))
    workers = int(os.getenv("UVICORN_WORKERS", "1"))
    
    logger.info(f"Starting transcription server on port {port}...")
    logger.info(f"Max concurrent tasks: {MAX_CONCURRENT_TASKS}")
    logger.info(f"Max segment duration: {MAX_SEGMENT_DURATION}s")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
    )
