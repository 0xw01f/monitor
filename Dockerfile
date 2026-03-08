# ── Build stage: install Python deps ─────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Runtime stage ────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Copy installed Python packages from builder
COPY --from=builder /install /usr/local

# Install system dependencies for Playwright Chromium
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
        libdrm2 libxcomposite1 libxdamage1 libxrandr2 \
        libgbm1 libpango-1.0-0 libcairo2 libasound2 \
        libxshmfence1 libx11-xcb1 fonts-liberation \
        libxkbcommon0 libxfixes3 \
    && rm -rf /var/lib/apt/lists/*

# Install Playwright Chromium browser
RUN playwright install chromium

# Copy application source
COPY app/          app/
COPY frontend/     frontend/
COPY requirements.txt auth.json.example ./

# Provide default auth.json from template (overridable via volume mount)
RUN cp auth.json.example auth.json

# Persistent data (DB + snapshots) lives here
VOLUME /app/data

ENV PYTHONUNBUFFERED=1 \
    SENTINELLE_DATA_DIR=/app/data \
    SENTINELLE_DB_PATH=/app/data/sentinelle.db

EXPOSE 8765

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
