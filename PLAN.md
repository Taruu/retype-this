# retype-this — MVP Plan

Self-hosted web app: upload FB2/EPUB, server splits into blocks, Vue3 client for retyping while reading. Learn touch typing via sensorimotor memory.

## Stack

- **Backend:** FastAPI, SQLAlchemy, SQLite, Pandoc
- **Frontend:** Vue 3, Vite, Vue Router, Pinia
- **Auth:** Single user from config file; password stored as SHA256 hash
- **Transport:** HTTP only, no WebSockets or real-time sync

## Core loop

1. Upload FB2/EPUB (magic-byte validated)
2. Server converts with Pandoc → HTML → ordered blocks (headings + paragraphs)
3. Client fetches pages (1–3 blocks per page) from server — never loads full book
4. User retypes current block in a free-edit textarea (arrows, backspace, insert)
5. Progress auto-saved: `reading_page`, `typing_block_index`, optional `char_offset`

## Reading vs typing rules

- **Forward locked:** user cannot flip to next page until current typing block is complete
- **Backward allowed:** user can go back to earlier pages to re-read or re-type
- `max_unlocked_page = floor(typing_block_index / page_size)`
- `reading_page` must be `<= max_unlocked_page`
- Server enforces on `GET /pages/{page}` and `PUT /progress`

## Auth (config file)

```yaml
auth:
  username: "me"
  password_hash: "sha256:<hex>"   # SHA256 of plain password
server:
  secret_key: "..."               # JWT/session signing (separate from password)
```

- SHA256 used **only** for password hash in config — not for book files
- `POST /api/auth/login` → Bearer token on other routes

## File upload validation

| Format | Magic bytes |
|--------|-------------|
| EPUB | ZIP `PK\x03\x04`; optional mimetype check |
| FB2 | XML `<?xml` (with optional BOM); sniff `FictionBook` in first ~4 KB |

Reject on extension/content mismatch. No file content hashing.

## Parsing pipeline

```
upload → validate magic bytes → save file
  → pandoc -f epub|fb2 -t html --standalone
  → parse HTML into blocks
  → store sanitized HTML + plain text for comparison
```

### Block types

| kind | source | display |
|------|--------|---------|
| `heading` | h1–h3 | chapter titles, readable |
| `paragraph` | p | body text |
| `blockquote` | blockquote | optional later |

### Split rules

- One `<p>` → one block by default
- Headings always separate blocks
- If `<p>` > 8000 chars → split on sentence boundaries
- Target 200–2000 chars typical; >2k OK; whole book in one block is not OK
- Drop empty blocks

## Database schema

```sql
books
  id, title, author, format, filename
  block_count, page_size DEFAULT 3, created_at

blocks
  id, book_id, index, kind, html, text_plain, char_count
  UNIQUE(book_id, index)

progress
  book_id PK
  reading_page DEFAULT 0
  typing_block_index DEFAULT 0
  char_offset DEFAULT 0
  updated_at
```

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Login |
| GET | `/api/books` | List books + progress |
| POST | `/api/books` | Upload file |
| GET | `/api/books/{id}` | Metadata |
| DELETE | `/api/books/{id}` | Remove book |
| GET | `/api/books/{id}/page-count` | Total pages |
| GET | `/api/books/{id}/pages/{page}` | 1–3 blocks; 403 if page > max_unlocked |
| GET | `/api/books/{id}/progress` | Current progress |
| PUT | `/api/books/{id}/progress` | Save progress; reject invalid reading_page |

## Frontend routes

| Route | Purpose |
|-------|---------|
| `/login` | Auth |
| `/` | Library + upload |
| `/book/:id` | Redirect to saved page |
| `/book/:id/page/:page` | Reader + typer |

### Typing editor

- `<textarea>` with full cursor/edit behavior (not rigid typing tutor)
- Complete on normalized string match (Done / Next)
- Auto-save progress debounced (~3s) + on page/block change + beforeunload
- Blocks before `typing_block_index`: done (✓); current: active editor; after: locked on current page

### Client data window

- Keep only current page (+ optional ±1 cache)
- No full book in Pinia/memory

## Project layout

```
backend/
  app/
    main.py, config.py, auth.py, database.py
    models/, schemas/, routers/
    services/
      file_validator.py
      pandoc_parser.py
      html_splitter.py
      page_service.py
  config.yaml
  data/                  # gitignored
frontend/
  src/
    api/, stores/, views/, components/
```

## Implementation phases

1. **Skeleton** — config auth (SHA256 password), DB models, Vue login shell
2. **Ingest** — pandoc pipeline, magic-byte check, pages API with forward lock
3. **Reader UI** — page nav (back only until typed), 1–3 block scroll, heading styles
4. **Typing UI** — free-edit textarea, complete → advance, server-fed chunks
5. **Polish** — errors, delete book, production static serve

## Deferred

- WPM / accuracy stats
- Mid-paragraph server draft
- Multi-user accounts
- Docker
- Fancy diff highlighting
- Book file hashing / dedup

## MVP success criteria

1. Upload EPUB/FB2 with magic-byte check
2. Book splits into many blocks; chapter titles visible
3. User cannot read forward past unfinished typing block; can go back
4. User retypes in free-edit textarea; progress survives refresh
5. Client never holds full book in memory
