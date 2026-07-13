from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from bs4 import BeautifulSoup

MAX_BLOCK_CHARS = 8000


@dataclass(frozen=True)
class ParsedBlock:
    kind: str
    html: str
    text_plain: str


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[^\S\n]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(lines).strip()


def _element_plain_text(element) -> str:
    for br in element.find_all("br"):
        br.replace_with("\n")
    return element.get_text("", strip=False)


def _split_long_text(text: str) -> list[str]:
    if len(text) <= MAX_BLOCK_CHARS:
        return [text] if text else []
    parts: list[str] = []
    current = text
    while len(current) > MAX_BLOCK_CHARS:
        chunk = current[:MAX_BLOCK_CHARS]
        split_at = chunk.rfind(". ")
        if split_at < MAX_BLOCK_CHARS // 2:
            split_at = chunk.rfind(" ")
        if split_at < 1:
            split_at = MAX_BLOCK_CHARS
        else:
            split_at += 1
        parts.append(current[:split_at].strip())
        current = current[split_at:].strip()
    if current:
        parts.append(current)
    return parts


def _paragraph_blocks(element) -> list[ParsedBlock]:
    text = _normalize_text(_element_plain_text(element))
    if not text:
        return []
    chunks = _split_long_text(text)
    blocks: list[ParsedBlock] = []
    for chunk in chunks:
        html = f"<p>{chunk}</p>"
        blocks.append(ParsedBlock(kind="paragraph", html=html, text_plain=chunk))
    return blocks


def _heading_block(element, tag: str) -> ParsedBlock | None:
    text = _normalize_text(_element_plain_text(element))
    if not text:
        return None
    html = f"<{tag}>{text}</{tag}>"
    return ParsedBlock(kind="heading", html=html, text_plain=text)


def split_html_to_blocks(html: str) -> list[ParsedBlock]:
    soup = BeautifulSoup(html, "html.parser")
    body = soup.body or soup
    blocks: list[ParsedBlock] = []

    for element in body.find_all(["h1", "h2", "h3", "p", "blockquote"]):
        parent_tags = {parent.name for parent in element.parents if getattr(parent, "name", None)}
        if parent_tags & {"p", "blockquote", "h1", "h2", "h3", "li", "td"}:
            continue
        if element.name in {"h1", "h2", "h3"}:
            block = _heading_block(element, element.name)
            if block:
                blocks.append(block)
        elif element.name == "p":
            blocks.extend(_paragraph_blocks(element))
        elif element.name == "blockquote":
            text = _normalize_text(_element_plain_text(element))
            if text:
                blocks.append(
                    ParsedBlock(
                        kind="blockquote",
                        html=f"<blockquote>{text}</blockquote>",
                        text_plain=text,
                    )
                )

    if not blocks:
        text = _normalize_text(body.get_text(" ", strip=True))
        if text:
            for chunk in _split_long_text(text):
                blocks.append(
                    ParsedBlock(kind="paragraph", html=f"<p>{chunk}</p>", text_plain=chunk)
                )

    return blocks


def convert_with_pandoc(source_path: Path, book_format: str) -> str:
    pandoc_format = "epub" if book_format == "epub" else "fb2"
    result = subprocess.run(
        [
            "pandoc",
            str(source_path),
            "-f",
            pandoc_format,
            "-t",
            "html",
            "--standalone",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        stderr = result.stderr.strip() or "unknown pandoc error"
        raise RuntimeError(f"Pandoc conversion failed: {stderr}")
    return result.stdout


def extract_metadata(html: str) -> tuple[str, str | None]:
    soup = BeautifulSoup(html, "html.parser")
    title_tag = soup.find("title")
    title = _normalize_text(title_tag.get_text()) if title_tag else "Untitled"
    author = None
    meta_author = soup.find("meta", attrs={"name": re.compile("author", re.I)})
    if meta_author and meta_author.get("content"):
        author = _normalize_text(meta_author["content"])
    if not author:
        h1 = soup.find("h1")
        if h1:
            title = _normalize_text(h1.get_text())
    return title or "Untitled", author
