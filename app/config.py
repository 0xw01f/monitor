"""
Sentinelle OSINT — Central Configuration

All tunables in one place. Key paths support environment variable overrides
for Docker / production deployments.
"""
import os
from pathlib import Path

# ── Paths ────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATA_DIR = Path(os.getenv("SENTINELLE_DATA_DIR", str(PROJECT_ROOT / "data")))
FRONTEND_DIR = PROJECT_ROOT / "frontend"
AUTH_FILE = PROJECT_ROOT / "auth.json"
TARGETS_CSV = PROJECT_ROOT / "targets.csv"

DATABASE_PATH = Path(os.getenv("SENTINELLE_DB_PATH", str(DATA_DIR / "sentinelle.db")))

# ── Monitoring Thresholds ────────────────────────────────

VISUAL_TOLERANCE_PERCENT = float(os.getenv("VISUAL_TOLERANCE_PERCENT", "5.0"))
HASH_CHANGE_ALERT_SEVERITY = "high"
VISUAL_CHANGE_ALERT_SEVERITY = "medium"

# ── Anti-Bot Settings ────────────────────────────────────

JITTER_MIN_SECONDS = 2.0
JITTER_MAX_SECONDS = 7.0
PAGE_LOAD_TIMEOUT_MS = 30_000

# ── Screenshot Settings ─────────────────────────────────

SCREENSHOT_QUALITY = 90
VIEWPORT_WIDTH = 1920
VIEWPORT_HEIGHT = 1080

# ── Noise Filters ────────────────────────────────────────
# Regex patterns removed from page text before hashing to reduce false positives.

NOISE_PATTERNS = [
    r"\d+\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s*ago",
    r"il y a\s*\d+\s*(secondes?|minutes?|heures?|jours?|semaines?|mois|ans?)",
    r"\d{1,3}[.,]\d{3}\s*(views?|vues?|likes?|followers?|abonnés?)",
    r"\d+\s*(views?|vues?|likes?|followers?|abonnés?|comments?|commentaires?|shares?|partages?)",
    r"(Sponsored|Sponsorisé|Ad|Publicité|Promoted)",
    r"Cookie\s*(consent|banner|policy|politique)",
    r"\b\d{1,2}:\d{2}\s*(AM|PM)?\b",
]

# ── Scheduler ────────────────────────────────────────────

SCAN_INTERVAL_HOURS = int(os.getenv("SCAN_INTERVAL_HOURS", "6"))

# ── Bootstrap ────────────────────────────────────────────

DATA_DIR.mkdir(parents=True, exist_ok=True)
