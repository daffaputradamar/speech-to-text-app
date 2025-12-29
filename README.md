# Speech to Text App

A local speech-to-text transcription app using **Whisper** (via faster-whisper) for transcription and **Next.js** for the frontend.

## Features

- 🎤 **Local Transcription** - No cloud API needed, runs entirely on your machine
- 🌍 **Multi-language Support** - Auto-detects language or specify manually
- ⏱️ **Timestamps** - Includes timestamps in transcription output
- 🎯 **Multiple Formats** - Supports MP3, WAV, M4A, FLAC, OGG, WEBM, AAC, AIFF
- 🚀 **Fast** - Uses faster-whisper with optimized inference
- ⚡ **Concurrent Processing** - Process multiple transcription requests simultaneously
- ✂️ **Auto Segmentation** - Long audio files are automatically split for faster processing

## Prerequisites

- **Node.js** 18+ and **pnpm**
- **Python** 3.10+
- **FFmpeg** installed and in PATH

## Setup

### 1. Install Node.js Dependencies

```bash
pnpm install
```

### 2. Install Python Dependencies

```bash
cd python
pip install -r requirements.txt
```

### 3. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
# Database (Neon PostgreSQL)
DATABASE_URL=your_database_url

# Optional: Whisper model settings
WHISPER_MODEL=base          # tiny, base, small, medium, large-v2, large-v3
WHISPER_DEVICE=cpu          # cpu or cuda (for NVIDIA GPU)
WHISPER_COMPUTE_TYPE=int8   # int8, float16, float32
WHISPER_CPU_THREADS=4       # Number of CPU threads

# Concurrency settings
MAX_CONCURRENT_TASKS=4      # Max parallel transcriptions
MAX_SEGMENT_DURATION=600    # Split audio longer than 10 minutes

# Transcription server port
TRANSCRIBE_PORT=8000
TRANSCRIBE_API_URL=http://localhost:8000
```

### 4. Setup Database

```bash
pnpm db:push
```

## Running the App

### Option 1: Frontend locally + Backend in Docker

**Terminal 1 - Start Python backend (in Docker Compose):**
```bash
docker-compose -f docker-compose.backend.yml up -d --build
```

**Terminal 2 - Run Next.js frontend locally:**
```bash
pnpm dev
```

The frontend will run on `http://localhost:3000` and connect to the Python poller via the shared database.

### Option 2: Frontend in Docker + Backend in Docker

```bash
docker-compose up -d --build
```

Both services will start in Docker containers.

### Option 3: Both servers locally

Terminal 1 - Python transcription poller:
```bash
cd python
python task_poller.py
```

Terminal 2 - Next.js frontend:
```bash
pnpm dev
```

Or combined:
```bash
pnpm dev:all
```

## Audio Segmentation

For long audio files (> 10 minutes by default), the server automatically:

1. **Splits** the audio into smaller segments using FFmpeg
2. **Transcribes** segments concurrently using a thread pool
3. **Merges** results while maintaining correct timestamps
4. **Deduplicates** overlapping content at segment boundaries

This significantly speeds up transcription for long recordings (podcasts, meetings, lectures).

Configure via environment variables:
- `MAX_SEGMENT_DURATION` - Segment length in seconds (default: 600 = 10 min)
- `MAX_CONCURRENT_TASKS` - Parallel segments to process (default: 4)

## Whisper Model Options

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| tiny | ~75MB | Fastest | Basic |
| base | ~150MB | Fast | Good |
| small | ~500MB | Medium | Better |
| medium | ~1.5GB | Slow | Great |
| large-v2/v3 | ~3GB | Slowest | Best |

For GPU acceleration (NVIDIA), set:
```
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
```

## API Endpoints

### Python Server (port 8000)

- `GET /health` - Health check
- `POST /transcribe` - Transcribe audio file
- `POST /transcribe-with-timestamps` - Transcribe with formatted timestamps

### Next.js API (port 3000)

- `GET /api/tasks` - List all transcription tasks
- `POST /api/tasks` - Upload audio and start transcription
- `DELETE /api/tasks?id=<taskId>` - Delete a task

## Docker Deployment

### Quick Start with Docker Compose

1. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your DATABASE_URL
   ```

2. **Build and run:**
   ```bash
   docker-compose up -d
   ```

3. Open `http://localhost:3000` in your browser

### Docker Commands

```bash
# Build and start containers
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop containers
docker-compose down

# Stop and remove volumes (clears Whisper model cache)
docker-compose down -v
```

### Environment Variables for Docker

Configure in `.env` file:

```bash
DATABASE_URL=postgresql://user:password@host/dbname
WHISPER_MODEL=base
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

### GPU Support (NVIDIA)

For GPU acceleration, modify `docker-compose.yml`:

```yaml
services:
  transcribe:
    # ... existing config ...
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    environment:
      - WHISPER_DEVICE=cuda
      - WHISPER_COMPUTE_TYPE=float16
```

And install [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html).