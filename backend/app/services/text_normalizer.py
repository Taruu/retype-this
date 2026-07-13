from __future__ import annotations

import unicodedata

STRESS_MARK = "\u0301"


def is_unicode_space_char(ch: str) -> bool:
    """True for Unicode whitespace except line breaks."""
    if not ch:
        return False
    if ch in "\n\r":
        return False
    if ch.isspace():
        return True
    cp = ord(ch)
    return cp == 0x00A0 or 0x2000 <= cp <= 0x200B or cp in (0x202F, 0x205F, 0x3000)


def order_char_mappings(mappings: dict[str, str]) -> dict[str, str]:
    """Apply punctuation mappings before whitespace source chars (e.g. \\xa0)."""
    if not mappings:
        return {}

    whitespace_items: list[tuple[str, str]] = []
    punctuation_items: list[tuple[str, str]] = []
    for src, dst in mappings.items():
        if len(src) == 1 and is_unicode_space_char(src):
            whitespace_items.append((src, dst))
        else:
            punctuation_items.append((src, dst))

    punctuation_items.sort(key=lambda item: (-len(item[0]), item[0]))
    whitespace_items.sort(key=lambda item: item[0])
    return dict(punctuation_items + whitespace_items)


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

    mappings = order_char_mappings(char_mappings or {})
    for original, replacement in mappings.items():
        text = text.replace(original, replacement)

    text = unicodedata.normalize("NFC", text)
    text = text.replace(STRESS_MARK, "")
    return text


def normalize_whitespace(text: str, *, trim: bool) -> str:
    chars: list[str] = []
    for ch in text:
        if ch in "\n\r":
            chars.append("\n")
        elif is_unicode_space_char(ch):
            chars.append(" ")
        else:
            chars.append(ch)
    normalized = "".join(chars)
    if not trim:
        return normalized
    lines = [line.strip() for line in normalized.split("\n")]
    return "\n".join(lines).strip("\n")


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
        typed, char_mappings, trim=False
    )
