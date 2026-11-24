FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# 姿态模型建议在本地下载后放到 models/ 目录，再由 docker-compose 挂载进来。
# 这里尝试下载一次作为兜底；国内网络失败属正常，按文档手动下载即可。
RUN mkdir -p models && \
    python -c "import urllib.request; urllib.request.urlretrieve('https://huggingface.co/litert-community/MediaPipe-PoseLandmarker-Lite/resolve/main/pose_landmarker_lite.task', 'models/pose_landmarker_lite.task')" || true

EXPOSE 8011

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8011"]
