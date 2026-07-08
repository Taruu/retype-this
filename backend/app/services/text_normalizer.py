from __future__ import annotations

import re
import unicodedata

STRESS_MARK = "\u0301"


def apply_char_mappings(text: str, mappings: dict[str, str]) -> str:
    if not mappings:
        return text
    result = text
    for src, dst in mappings.items():
        result = result.replace(src, dst)
    return result


def clean_multilingual_text(text: str, char_mappings: dict[str, str] | None = None) -> str:
    if not text:
        return ""

    mappings = char_mappings or {}
    for original, replacement in mappings.items():
        text = text.replace(original, replacement)

    text = unicodedata.normalize("NFC", text)
    text = text.replace(STRESS_MARK, "")
    return text


def normalize_whitespace(text: str, *, trim: bool) -> str:
    normalized = re.sub(r"[\u00a0\u2000-\u200b\u202f\u205f\u3000]", " ", text)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip() if trim else normalized


def normalize_typed_text(
    text: str,
    char_mappings: dict[str, str] | None = None,
    *,
    trim: bool = True,
) -> str:
    normalized = clean_multilingual_text(text, char_mappings)
    return normalize_whitespace(normalized, trim=trim)


def prepare_display_text(text: str, char_mappings: dict[str, str] | None = None) -> str:
    """Normalize book text so stored view/expected text matches what the user types."""
    return normalize_typed_text(text, char_mappings, trim=True)


def texts_match(
    expected: str,
    typed: str,
    char_mappings: dict[str, str] | None = None,
) -> bool:
    return normalize_typed_text(expected, char_mappings, trim=True) == normalize_typed_text(
        typed, char_mappings, trim=True
    )
