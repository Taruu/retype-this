from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=256)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProgressOut(BaseModel):
    reading_page: int
    typing_block_index: int
    char_offset: int
    draft_text: str = ""
    updated_at: datetime


class ProgressUpdate(BaseModel):
    reading_page: int = Field(ge=0)
    typing_block_index: int = Field(ge=0)
    char_offset: int = Field(ge=0, default=0)
    draft_text: str = ""


class BookSummary(BaseModel):
    id: int
    title: str
    author: str | None
    format: str
    block_count: int
    page_size: int
    created_at: datetime
    progress: ProgressOut | None

    model_config = {"from_attributes": True}


class BookDetail(BaseModel):
    id: int
    title: str
    author: str | None
    format: str
    filename: str
    block_count: int
    page_size: int
    created_at: datetime

    model_config = {"from_attributes": True}


class BlockOut(BaseModel):
    index: int
    kind: str
    html: str
    text_plain: str
    char_count: int


class PageOut(BaseModel):
    page: int
    page_size: int
    block_count: int
    typing_block_index: int
    max_unlocked_page: int
    blocks: list[BlockOut]


class PageCountOut(BaseModel):
    page_count: int
    page_size: int
    block_count: int


class CompleteBlockRequest(BaseModel):
    typed_text: str


class BookUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=512)


class SettingsOut(BaseModel):
    char_mappings: dict[str, str]
