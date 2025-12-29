FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install Python 3.11 + build deps
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-distutils \
    python3-pip \
    ffmpeg \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Force python + pip to be 3.11
RUN ln -sf /usr/bin/python3.11 /usr/bin/python

WORKDIR /app

COPY requirements.txt .

# 🚨 THIS LINE IS THE KEY
RUN python3.11 -m pip install --upgrade pip \
 && python3.11 -m pip install --no-cache-dir -r requirements.txt

COPY transcribe_server.py .
COPY task_poller.py .

RUN mkdir -p /app/uploads && chmod 777 /app/uploads

CMD ["python", "task_poller.py"]