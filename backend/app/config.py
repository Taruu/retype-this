from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from app.services.text_normalizer import DEFAULT_CHAR_MAPPINGS

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config.yaml"


@dataclass(frozen=True)
class AuthConfig:
    username: str
    password_hash: str


@dataclass(frozen=True)
class ServerConfig:
    secret_key: str
    data_dir: Path


@dataclass(frozen=True)
class TypingConfig:
    char_mappings: dict[str, str]


@dataclass(frozen=True)
class AppConfig:
    auth: AuthConfig
    server: ServerConfig
    typing: TypingConfig


def load_config(path: Path | None = None) -> AppConfig:
    config_path = path or CONFIG_PATH
    if not config_path.exists():
        raise FileNotFoundError(
            f"Config not found at {config_path}. "
            f"Copy config.yaml.example to config.yaml and edit it."
        )
    with config_path.open(encoding="utf-8") as f:
        raw = yaml.safe_load(f)

    data_dir = Path(raw["server"].get("data_dir", "data"))
    if not data_dir.is_absolute():
        data_dir = config_path.parent / data_dir

    typing_raw = raw.get("typing") or {}
    char_mappings = typing_raw.get("char_mappings") or DEFAULT_CHAR_MAPPINGS
    if not isinstance(char_mappings, dict):
        raise ValueError("typing.char_mappings must be a mapping of source to target characters")

    return AppConfig(
        auth=AuthConfig(
            username=raw["auth"]["username"],
            password_hash=raw["auth"]["password_hash"],
        ),
        server=ServerConfig(
            secret_key=raw["server"]["secret_key"],
            data_dir=data_dir,
        ),
        typing=TypingConfig(char_mappings={str(k): str(v) for k, v in char_mappings.items()}),
    )
