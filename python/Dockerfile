# Python Transcription Task Poller Dockerfile
FROM python:3.11-slim

# Install system dependencies including ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY transcribe_server.py .
COPY task_poller.py .

# Create uploads directory with world-writable permissions for shared volume
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

# Run the task poller (no HTTP server, run as root for volume access)
CMD ["python", "task_poller.py"]
