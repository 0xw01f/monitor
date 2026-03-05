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

# Install Playwright dependencies and Chromium browser
RUN apt-get update && \
    playwright install-deps chromium && \
    playwright install chromium && \
    rm -rf /var/lib/apt/lists/*

# Copy application source
COPY app/          app/
COPY frontend/     frontend/
COPY requirements.txt targets.csv auth.json.example ./

# Provide default auth.json from template (overridable via volume mount)
RUN cp auth.json.example auth.json

# Persistent data (DB + snapshots) lives here
VOLUME /app/data

ENV PYTHONUNBUFFERED=1 \
    SENTINELLE_DATA_DIR=/app/data \
    SENTINELLE_DB_PATH=/app/data/sentinelle.db

EXPOSE 8765

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765"]
