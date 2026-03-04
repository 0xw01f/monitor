"""
Sentinelle OSINT — FastAPI Application

Entry point: creates the app, wires up routers, serves the frontend.

    uvicorn app.main:app --host 0.0.0.0 --port 8765
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import FRONTEND_DIR, SCAN_INTERVAL_HOURS
from .database import init_db
from .csv_loader import load_targets_from_csv
from .scheduler import auto_scan_loop, daily_report_loop
from .routes import all_routers

# ── Logging ──────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("sentinelle.api")


# ── Lifespan ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize DB, load CSV targets, start background schedulers."""
    await init_db()
    await load_targets_from_csv()

    scan_task = asyncio.create_task(auto_scan_loop())
    report_task = asyncio.create_task(daily_report_loop())
    logger.info(f"Sentinelle OSINT initialized. Auto-scan every {SCAN_INTERVAL_HOURS}h.")

    try:
        yield
    finally:
        scan_task.cancel()
        report_task.cancel()
        for task in (scan_task, report_task):
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info("Sentinelle OSINT shutting down.")


# ── App ──────────────────────────────────────────────────

app = FastAPI(
    title="Sentinelle OSINT",
    description="Universal OSINT Monitoring Tool",
    version="1.0.0",
    lifespan=lifespan,
)

for router in all_routers:
    app.include_router(router)


# ── Frontend Serving ─────────────────────────────────────

@app.get("/favicon.ico")
async def favicon():
    return Response(status_code=204)


@app.get("/")
async def serve_frontend():
    index_file = FRONTEND_DIR / "index.html"
    if not index_file.exists():
        return JSONResponse({"error": "Frontend not found"}, status_code=404)
    return FileResponse(str(index_file))


if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# ── CLI Entry Point ──────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8765, reload=True)
