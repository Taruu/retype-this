from __future__ import annotations

EPUB_MAGIC = b"PK\x03\x04"
FB2_XML_PREFIXES = (b"<?xml", b"\xef\xbb\xbf<?xml")
MAX_SNIFF = 4096


class FileValidationError(ValueError):
    pass


def _sniff_header(data: bytes) -> bytes:
    return data[:MAX_SNIFF]


def detect_format(filename: str, data: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".epub"):
        expected = "epub"
    elif lower.endswith(".fb2"):
        expected = "fb2"
    else:
        raise FileValidationError("Only .epub and .fb2 files are supported")

    header = _sniff_header(data)
    if expected == "epub":
        if not header.startswith(EPUB_MAGIC):
            raise FileValidationError("EPUB content does not match ZIP magic bytes")
        return "epub"

    if not any(header.startswith(prefix) for prefix in FB2_XML_PREFIXES):
        raise FileValidationError("FB2 content does not look like XML")
    if b"FictionBook" not in header:
        raise FileValidationError("FB2 content missing FictionBook root element")
    return "fb2"


def validate_upload(filename: str, data: bytes) -> str:
    if not data:
        raise FileValidationError("Uploaded file is empty")
    return detect_format(filename, data)
