from __future__ import annotations

import math
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import Block, Book, Progress
from app.services.file_validator import validate_upload
from app.services.html_splitter import (
    convert_with_pandoc,
    extract_metadata,
    split_html_to_blocks,
)

from app.services.text_normalizer import texts_match as _texts_match

DEFAULT_PAGE_SIZE = 4


def texts_match(
    expected: str,
    typed: str,
    char_mappings: dict[str, str] | None = None,
) -> bool:
    return _texts_match(expected, typed, char_mappings)


def page_count(block_count: int, page_size: int) -> int:
    if block_count == 0:
        return 0
    return math.ceil(block_count / page_size)


def max_unlocked_page(typing_block_index: int, page_size: int) -> int:
    if typing_block_index <= 0:
        return 0
    return typing_block_index // page_size


def get_progress_or_create(db: Session, book: Book) -> Progress:
    if book.progress is None:
        progress = Progress(book_id=book.id)
        db.add(progress)
        db.flush()
        book.progress = progress
    return book.progress


def ingest_book(db: Session, data_dir: Path, filename: str, data: bytes) -> Book:
    book_format = validate_upload(filename, data)
    uploads_dir = data_dir / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    stored_name = f"{uuid.uuid4().hex}_{Path(filename).name}"
    stored_path = uploads_dir / stored_name
    stored_path.write_bytes(data)

    html = convert_with_pandoc(stored_path, book_format)
    title, author = extract_metadata(html)
    parsed_blocks = split_html_to_blocks(html)
    if not parsed_blocks:
        stored_path.unlink(missing_ok=True)
        raise ValueError("No readable blocks found in book")

    book = Book(
        title=title,
        author=author,
        format=book_format,
        filename=stored_name,
        block_count=len(parsed_blocks),
        page_size=DEFAULT_PAGE_SIZE,
    )
    db.add(book)
    db.flush()

    for index, parsed in enumerate(parsed_blocks):
        db.add(
            Block(
                book_id=book.id,
                index=index,
                kind=parsed.kind,
                html=parsed.html,
                text_plain=parsed.text_plain,
                char_count=len(parsed.text_plain),
            )
        )

    db.add(Progress(book_id=book.id))
    db.commit()
    db.refresh(book)
    return book


def get_page_blocks(db: Session, book: Book, page: int) -> list[Block]:
    start = page * book.page_size
    end = start + book.page_size
    return (
        db.query(Block)
        .filter(Block.book_id == book.id, Block.index >= start, Block.index < end)
        .order_by(Block.index)
        .all()
    )


def delete_book_files(data_dir: Path, book: Book) -> None:
    path = data_dir / "uploads" / book.filename
    path.unlink(missing_ok=True)
