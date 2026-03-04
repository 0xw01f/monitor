"""
Sentinelle OSINT — Pydantic Request / Response Schemas
"""
from pydantic import BaseModel


class TargetCreate(BaseModel):
    name: str
    url: str
    category: str = "general"
    css_selector: str | None = None
    crop_x: int | None = None
    crop_y: int | None = None
    crop_w: int | None = None
    crop_h: int | None = None


class ScanRequest(BaseModel):
    target_id: int | None = None


class IntegrationTestRequest(BaseModel):
    integration_id: str


class PreviewRequest(BaseModel):
    url: str
