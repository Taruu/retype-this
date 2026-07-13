from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_config, get_current_user
from app.config import AppConfig
from app.database import get_db
from app.models import Block, Book, Progress
from app.schemas.schemas import (
    BookDetail,
    BookSummary,
    BookUpdate,
    CompleteBlockRequest,
    PageCountOut,
    PageOut,
    ProgressOut,
    ProgressUpdate,
    BlockOut,
)
from app.services.file_validator import FileValidationError
from app.services.page_service import (
    delete_book_files,
    get_page_blocks,
    get_progress_or_create,
    ingest_book,
    max_unlocked_page,
    page_count,
    texts_match,
)

router = APIRouter(prefix="/api/books", tags=["books"])


def _get_book_or_404(db: Session, book_id: int) -> Book:
    book = (
        db.query(Book)
        .options(joinedload(Book.progress))
        .filter(Book.id == book_id)
        .first()
    )
    if book is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


def _progress_out(progress: Progress) -> ProgressOut:
    return ProgressOut(
        reading_page=progress.reading_page,
        typing_block_index=progress.typing_block_index,
        char_offset=progress.char_offset,
        draft_text=progress.draft_text or "",
        updated_at=progress.updated_at,
    )


@router.get("", response_model=list[BookSummary])
def list_books(
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
) -> list[BookSummary]:
    books = db.query(Book).options(joinedload(Book.progress)).order_by(Book.created_at.desc()).all()
    return [
        BookSummary(
            id=book.id,
            title=book.title,
            author=book.author,
            format=book.format,
            block_count=book.block_count,
            page_size=book.page_size,
            created_at=book.created_at,
            progress=_progress_out(book.progress) if book.progress else None,
        )
        for book in books
    ]


@router.post("", response_model=BookDetail, status_code=status.HTTP_201_CREATED)
async def upload_book(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    config: AppConfig = Depends(get_config),
    _: str = Depends(get_current_user),
) -> BookDetail:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    data = await file.read()
    try:
        book = ingest_book(
            db, config.server.data_dir, file.filename, data, char_mappings=config.typing.char_mappings
        )
    except FileValidationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return BookDetail.model_validate(book)


@router.get("/{book_id}", response_model=BookDetail)
def get_book(
    book_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
) -> BookDetail:
    book = _get_book_or_404(db, book_id)
    return BookDetail.model_validate(book)


@router.patch("/{book_id}", response_model=BookDetail)
def update_book(
    book_id: int,
    body: BookUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
) -> BookDetail:
    book = _get_book_or_404(db, book_id)
    book.title = body.title.strip()
    db.commit()
    db.refresh(book)
    return BookDetail.model_validate(book)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    config: AppConfig = Depends(get_config),
    _: str = Depends(get_current_user),
) -> None:
    book = _get_book_or_404(db, book_id)
    delete_book_files(config.server.data_dir, book)
    db.delete(book)
    db.commit()


@router.get("/{book_id}/page-count", response_model=PageCountOut)
def get_page_count(
    book_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
) -> PageCountOut:
    book = _get_book_or_404(db, book_id)
    return PageCountOut(
        page_count=page_count(book.block_count, book.page_size),
        page_size=book.page_size,
        block_count=book.block_count,
    )


@router.get("/{book_id}/pages/{page}", response_model=PageOut)
def get_page(
    book_id: int,
    page: int,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
) -> PageOut:
    if page < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid page")
    book = _get_book_or_404(db, book_id)
    progress = get_progress_or_create(db, book)
    unlocked = max_unlocked_page(progress.typing_block_index, book.page_size)
    if page > unlocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Page locked until typing progress catches up",
        )
    blocks = get_page_blocks(db, book, page)
    return PageOut(
        page=page,
        page_size=book.page_size,
        block_count=book.block_count,
        typing_block_index=progress.typing_block_index,
        max_unlocked_page=unlocked,
        blocks=[
            BlockOut(
                index=b.index,
                kind=b.kind,
                html=b.html,
                text_plain=b.text_plain,
                char_count=b.char_count,
            )
            for b in blocks
        ],
    )


@router.get("/{book_id}/progress", response_model=ProgressOut)
def get_progress(
    book_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
) -> ProgressOut:
    book = _get_book_or_404(db, book_id)
    progress = get_progress_or_create(db, book)
    db.commit()
    return _progress_out(progress)


@router.put("/{book_id}/progress", response_model=ProgressOut)
def update_progress(
    book_id: int,
    body: ProgressUpdate,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
) -> ProgressOut:
    book = _get_book_or_404(db, book_id)
    progress = get_progress_or_create(db, book)
    if body.typing_block_index > progress.typing_block_index:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use POST /complete-block to advance typing progress",
        )
    if body.typing_block_index > book.block_count:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid block index")
    unlocked = max_unlocked_page(progress.typing_block_index, book.page_size)
    if body.reading_page > unlocked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reading_page exceeds max_unlocked_page",
        )
    progress.reading_page = body.reading_page
    progress.char_offset = body.char_offset
    progress.draft_text = body.draft_text
    db.commit()
    db.refresh(progress)
    return _progress_out(progress)


@router.post("/{book_id}/complete-block", response_model=ProgressOut)
def complete_block(
    book_id: int,
    body: CompleteBlockRequest,
    db: Session = Depends(get_db),
    config: AppConfig = Depends(get_config),
    _: str = Depends(get_current_user),
) -> ProgressOut:
    book = _get_book_or_404(db, book_id)
    progress = get_progress_or_create(db, book)
    if progress.typing_block_index >= book.block_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All blocks already completed",
        )

    block = (
        db.query(Block)
        .filter(Block.book_id == book.id, Block.index == progress.typing_block_index)
        .first()
    )
    if block is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found")

    if not texts_match(block.text_plain, body.typed_text, config.typing.char_mappings):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Typed text does not match the block (plain text comparison)",
        )

    progress.typing_block_index += 1
    progress.char_offset = 0
    progress.draft_text = ""
    db.commit()
    db.refresh(progress)
    return _progress_out(progress)


@router.post("/{book_id}/reset-progress", response_model=ProgressOut)
def reset_progress(
    book_id: int,
    db: Session = Depends(get_db),
    _: str = Depends(get_current_user),
) -> ProgressOut:
    book = _get_book_or_404(db, book_id)
    progress = get_progress_or_create(db, book)
    progress.reading_page = 0
    progress.typing_block_index = 0
    progress.char_offset = 0
    progress.draft_text = ""
    db.commit()
    db.refresh(progress)
    return _progress_out(progress)
