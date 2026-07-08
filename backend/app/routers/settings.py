from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import get_config, get_current_user
from app.config import AppConfig
from app.schemas.schemas import SettingsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings(
    config: AppConfig = Depends(get_config),
    _: str = Depends(get_current_user),
) -> SettingsOut:
    return SettingsOut(char_mappings=config.typing.char_mappings)
