from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Book(Base):
    __tablename__ = "books"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    author: Mapped[str | None] = mapped_column(String(512), nullable=True)
    format: Mapped[str] = mapped_column(String(16), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    block_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_size: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    blocks: Mapped[list[Block]] = relationship(
        "Block", back_populates="book", cascade="all, delete-orphan"
    )
    progress: Mapped[Progress | None] = relationship(
        "Progress", back_populates="book", uselist=False, cascade="all, delete-orphan"
    )


class Block(Base):
    __tablename__ = "blocks"
    __table_args__ = (UniqueConstraint("book_id", "index", name="uq_book_block_index"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    html: Mapped[str] = mapped_column(String, nullable=False)
    text_plain: Mapped[str] = mapped_column(String, nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, nullable=False)

    book: Mapped[Book] = relationship("Book", back_populates="blocks")


class Progress(Base):
    __tablename__ = "progress"

    book_id: Mapped[int] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"), primary_key=True
    )
    reading_page: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    typing_block_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    char_offset: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    draft_text: Mapped[str] = mapped_column(String, default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    book: Mapped[Book] = relationship("Book", back_populates="progress")
