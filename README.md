# Sentinelle OSINT — Universal Monitoring Tool

> This tool is provided for educational and administrative purposes only. The author is not responsible for any misuse. This software **must not** be used to stalk, harass, or maliciously track individuals, or for any action that violates the terms of service of the monitored websites. Use responsibly and legally.

Web-based OSINT monitoring dashboard that tracks changes on target web pages using screenshots, text hashing, and visual diffing. Alerts are delivered via Slack/Discord webhooks.

## Features

- **Visual + text change detection** — captures full-page screenshots and hashes cleaned text to detect changes
- **Anti-bot measures** — randomized delays, mouse simulation, cookie banner dismissal
- **Crop / CSS selector targeting** — monitor specific page regions instead of the full page
- **Webhook integrations** — Slack, Discord, and generic JSON webhooks for alerts and daily reports
- **Scheduled auto-scans** — configurable interval with persistent next-scan tracking
- **Modern SPA frontend** — vanilla JS dashboard with real-time stats

## Project Structure

```
├── app/                     # Python package (FastAPI backend)
│   ├── main.py              # App creation, lifespan, frontend serving
│   ├── config.py            # Central configuration (env-var overrides)
│   ├── database.py          # Async SQLite layer (aiosqlite)
│   ├── monitor.py           # Core engine: capture, hash, compare, alert
│   ├── scheduler.py         # Auto-scan & daily report background loops
│   ├── webhooks.py          # Webhook dispatch & integration helpers
│   ├── schemas.py           # Pydantic request models
│   ├── state.py             # Shared runtime state (scan lock, etc.)
│   └── routes/              # API route modules
│       ├── targets.py       # /api/targets, /api/stats
│       ├── alerts.py        # /api/alerts
│       ├── snapshots.py     # /api/snapshots (image serving)
│       ├── settings.py      # /api/settings (integrations, daily report)
│       └── scan.py          # /api/scan, /api/preview
├── frontend/                # Static SPA (HTML/CSS/JS)
├── migrations/              # One-off DB migration scripts
├── tests/                   # Test utilities
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── auth.json.example        # Template for browser cookies (copy to auth.json)
```

## Quick Start

### Local Development

```bash
# Clone the repository
# git clone <repository-url>
# cd <repository-directory>

# Install dependencies
pip install -r requirements.txt
playwright install chromium

# (Optional) Set up authenticated captures
cp auth.json.example auth.json
# Edit auth.json to add browser cookies if needed

# Run the server
python -m app
# or
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload
```

Open **http://localhost:8765** in your browser.

### Docker

```bash
# Build and run
docker compose up -d

# View logs
docker compose logs -f sentinelle
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SENTINELLE_DATA_DIR` | `./data` | Directory for persistent data |
| `SENTINELLE_DB_PATH` | `$DATA_DIR/sentinelle.db` | SQLite database path |
| `SCAN_INTERVAL_HOURS` | `6` | Hours between automatic scans |
| `VISUAL_TOLERANCE_PERCENT` | `5.0` | Visual change threshold (%) |

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/targets` | List all targets |
| `POST` | `/api/targets` | Create a target |
| `DELETE` | `/api/targets/:id` | Delete a target |
| `PATCH` | `/api/targets/:id/pause` | Pause monitoring |
| `PATCH` | `/api/targets/:id/resume` | Resume monitoring |
| `GET` | `/api/targets/:id/history` | Snapshot history |
| `GET` | `/api/alerts` | List alerts |
| `PATCH` | `/api/alerts/:id/read` | Mark alert read |
| `POST` | `/api/scan` | Trigger manual scan |
| `GET` | `/api/stats` | Dashboard statistics |
| `GET/POST` | `/api/settings/integrations` | Webhook config |

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0). See the [LICENSE](LICENSE) file for details.