"""
Sentinelle OSINT — Shared Runtime State

Holds objects that need to be accessed across multiple modules
(scheduler, routes, etc.) without creating circular imports.
"""
import asyncio

scan_lock = asyncio.Lock()
next_scan_at: str | None = None
