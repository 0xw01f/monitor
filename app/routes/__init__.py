"""
Sentinelle OSINT — Route Aggregation

Import and expose all API sub-routers so the main app can include them
with a single ``from .routes import all_routers``.
"""
from .targets import router as targets_router
from .alerts import router as alerts_router
from .snapshots import router as snapshots_router
from .settings import router as settings_router
from .scan import router as scan_router

all_routers = [
    targets_router,
    alerts_router,
    snapshots_router,
    settings_router,
    scan_router,
]
