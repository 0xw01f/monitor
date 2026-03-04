"""
Sentinelle OSINT — Scheduler

Background tasks: periodic auto-scan and daily report delivery.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from .config import SCAN_INTERVAL_HOURS
from .database import get_db, get_setting, set_setting
from .monitor import run_scan
from .webhooks import dispatch_daily_report
from . import state

logger = logging.getLogger("sentinelle.scheduler")

AUTO_SCAN_SETTING_KEY = "next_scan_at"
DAILY_REPORT_ENABLED_KEY = "daily_report_enabled"
DAILY_REPORT_LAST_SENT_KEY = "daily_report_last_sent_utc"


# ── Helpers ──────────────────────────────────────────────

def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _isoformat(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def _utc_date_str() -> str:
    return _utc_now().strftime("%Y-%m-%d")


# ── Auto-Scan Loop ──────────────────────────────────────

async def _ensure_next_scan_time() -> datetime:
    db = await get_db()
    try:
        raw = await get_setting(db, AUTO_SCAN_SETTING_KEY)
        next_dt = _parse_iso(raw)
        now = _utc_now()
        if not next_dt or next_dt <= now:
            next_dt = now + timedelta(hours=SCAN_INTERVAL_HOURS)
            await set_setting(db, AUTO_SCAN_SETTING_KEY, _isoformat(next_dt))
        return next_dt
    finally:
        await db.close()


async def _store_next_scan_time(dt: datetime) -> str:
    iso = _isoformat(dt)
    db = await get_db()
    try:
        await set_setting(db, AUTO_SCAN_SETTING_KEY, iso)
    finally:
        await db.close()
    return iso


async def auto_scan_loop():
    """Periodically run a full scan on all active targets."""
    try:
        while True:
            next_dt = await _ensure_next_scan_time()
            state.next_scan_at = _isoformat(next_dt)
            logger.info(f"[Scheduler] Next auto-scan at {state.next_scan_at}")

            delay = max(0, (next_dt - _utc_now()).total_seconds())
            try:
                await asyncio.sleep(delay)
            except asyncio.CancelledError:
                logger.info("[Scheduler] Sleep cancelled; shutting down scheduler loop.")
                state.next_scan_at = _isoformat(next_dt)
                raise

            state.next_scan_at = None
            logger.info("[Scheduler] Starting scheduled scan...")

            try:
                async with state.scan_lock:
                    await run_scan()
            except Exception as e:
                logger.error(f"[Scheduler] Auto-scan failed: {e}")

            next_dt = _utc_now() + timedelta(hours=SCAN_INTERVAL_HOURS)
            state.next_scan_at = await _store_next_scan_time(next_dt)
    except asyncio.CancelledError:
        logger.info("[Scheduler] Auto-scan loop cancelled.")
        raise


# ── Daily Report Loop ───────────────────────────────────

async def daily_report_loop():
    """Check once per minute whether the daily report should be sent."""
    try:
        while True:
            db = await get_db()
            try:
                enabled = (await get_setting(db, DAILY_REPORT_ENABLED_KEY) or "false").lower() == "true"
                last_sent = await get_setting(db, DAILY_REPORT_LAST_SENT_KEY)
                today = _utc_date_str()
            finally:
                await db.close()

            if enabled and last_sent != today:
                logger.info("[DailyReport] Sending daily report to configured webhooks...")
                await dispatch_daily_report()
                db = await get_db()
                try:
                    await set_setting(db, DAILY_REPORT_LAST_SENT_KEY, today)
                finally:
                    await db.close()

            await asyncio.sleep(60)
    except asyncio.CancelledError:
        logger.info("[DailyReport] Loop cancelled.")
        raise
