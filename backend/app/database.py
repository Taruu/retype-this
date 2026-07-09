from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

_engine = None
_SessionLocal = None


class Base(DeclarativeBase):
    pass


def _prepare_data_dir(data_dir: Path) -> Path:
    resolved = data_dir.expanduser().resolve()
    resolved.mkdir(parents=True, exist_ok=True)
    (resolved / "uploads").mkdir(parents=True, exist_ok=True)
    return resolved


def init_db(data_dir: Path) -> None:
    global _engine, _SessionLocal
    data_dir = _prepare_data_dir(data_dir)
    db_path = data_dir / "retype.db"
    _engine = create_engine(
        f"sqlite:///{db_path.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=_engine)
    _migrate_schema(_engine)


def _migrate_schema(engine) -> None:
    inspector = inspect(engine)
    if "progress" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("progress")}
    if "draft_text" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE progress ADD COLUMN draft_text TEXT NOT NULL DEFAULT ''"))


def get_db() -> Generator[Session, None, None]:
    if _SessionLocal is None:
        raise RuntimeError("Database not initialized")
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()
