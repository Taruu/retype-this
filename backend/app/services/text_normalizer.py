from __future__ import annotations

import re
import unicodedata

DEFAULT_CHAR_MAPPINGS: dict[str, str] = {
    "\u00ab": '"',  # «
    "\u00bb": '"',  # »
    "\u201e": '"',  # „
    "\u201c": '"',  # "
    "\u201d": '"',  # "
    "\u2018": "'",  # '
    "\u2019": "'",  # '
}


def apply_char_mappings(text: str, mappings: dict[str, str]) -> str:
    if not mappings:
        return text
    result = text
    for src, dst in mappings.items():
        result = result.replace(src, dst)
    return result


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
    mappings = char_mappings if char_mappings is not None else DEFAULT_CHAR_MAPPINGS
    normalized = unicodedata.normalize("NFC", text or "")
    normalized = apply_char_mappings(normalized, mappings)
    return normalize_whitespace(normalized, trim=trim)


def texts_match(
    expected: str,
    typed: str,
    char_mappings: dict[str, str] | None = None,
) -> bool:
    return normalize_typed_text(expected, char_mappings, trim=True) == normalize_typed_text(
        typed, char_mappings, trim=True
    )
