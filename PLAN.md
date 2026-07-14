# retype-this — Plan & status

Self-hosted web app: upload FB2/EPUB, server splits into blocks, Vue3 client for retyping while reading. Learn touch typing via sensorimotor memory.

## Status overview

| Area | Status |
|------|--------|
| MVP core loop | **Done** |
| Auth (single user, config SHA256) | **Done** |
| Ingest (Pandoc + magic bytes + blocks) | **Done** |
| Pages API + forward lock | **Done** |
| Reader / typing UI | **Done** |
| Progress + mid-block draft | **Done** |
| Production static serve | **Done** |
| Docker | **Done** |
| Char mappings / normalization | **Done** |
| Theme toggle | **Done** |
| Session countdown timer | **Done** |
| WPM / accuracy stats | **Not done** |
| Multi-user accounts | **Not done** |
| Book file hashing / dedup | **Not done** |

## Stack

- **Backend:** FastAPI, SQLAlchemy, SQLite, Pandoc, BeautifulSoup
- **Frontend:** Vue 3, Vite, Vue Router, Pinia
- **Auth:** Single user from config file; password stored as SHA256 hash
- **Transport:** HTTP only, no WebSockets or real-time sync
- **Deploy:** Dockerfile + `docker-compose.yml` (optional local Node/Python dev)

## Core loop (implemented)

1. Upload FB2/EPUB (magic-byte validated)
2. Server converts with Pandoc → HTML → ordered blocks (headings, paragraphs, blockquotes, verse)
3. Client fetches pages (`page_size` blocks per page, default **4**) — never loads full book
4. User retypes the current block in the overlay editor (arrows, backspace, insert)
5. Progress auto-saved: `reading_page`, `typing_block_index`, `char_offset`, `draft_text`
6. Completing a block requires server-side normalized match (`POST …/complete-block`)

## Reading vs typing rules

- **Forward locked:** user cannot flip to next page until current typing block is past that page
- **Backward allowed:** user can go back to earlier pages to re-read
- `max_unlocked_page = floor(typing_block_index / page_size)` (when book complete → last page)
- `reading_page` must be `<= max_unlocked_page`
- Server enforces on `GET /pages/{page}` and `PUT /progress`
- Finishing the last block on a page does **not** auto-advance; next page is manual (Enter / Page Down / UI)

## Auth (config file)

```yaml
auth:
  username: "me"
  password_hash: "sha256:<hex>"   # SHA256 of plain password
server:
  secret_key: "..."               # JWT signing (separate from password)
  data_dir: "data"
typing:
  char_mappings:                  # book chars → keyboard chars
    "«": '"'
    "—": "-"
    # …
```

- SHA256 used **only** for password hash in config — not for book files
- `POST /api/auth/login` → Bearer token on other routes
- Char mappings exposed via `GET /api/settings`

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
  → parse HTML into blocks (html_splitter.py)
  → store sanitized HTML + plain text for comparison
```

### Block types

| kind | source | status |
|------|--------|--------|
| `heading` | h1–h3 | Done |
| `paragraph` | p | Done |
| `blockquote` | blockquote | Done |
| `verse` | `div.line-block` | Done |

### Split rules

- One `<p>` → one block by default
- Headings always separate blocks
- If text > 8000 chars → split on sentence boundaries
- Drop empty blocks

## Database schema (current)

```sql
books
  id, title, author, format, filename
  block_count, page_size DEFAULT 4, created_at

blocks
  id, book_id, index, kind, html, text_plain, char_count
  UNIQUE(book_id, index)

progress
  book_id PK
  reading_page DEFAULT 0
  typing_block_index DEFAULT 0
  char_offset DEFAULT 0
  draft_text DEFAULT ''      -- mid-block draft on server
  updated_at
```

## API endpoints

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| POST | `/api/auth/login` | Login | Done |
| GET | `/api/health` | Health check | Done |
| GET | `/api/settings` | Char mappings | Done |
| GET | `/api/books` | List books + progress | Done |
| POST | `/api/books` | Upload file | Done |
| GET | `/api/books/{id}` | Metadata | Done |
| PATCH | `/api/books/{id}` | Rename title | Done |
| DELETE | `/api/books/{id}` | Remove book | Done |
| GET | `/api/books/{id}/page-count` | Total pages | Done |
| GET | `/api/books/{id}/pages/{page}` | Page blocks; 403 if locked | Done |
| GET | `/api/books/{id}/progress` | Current progress | Done |
| PUT | `/api/books/{id}/progress` | Save page/draft; no typing advance | Done |
| POST | `/api/books/{id}/complete-block` | Verify typed text, advance index | Done |
| POST | `/api/books/{id}/reset-progress` | Reset progress to start | Done |

## Frontend routes

| Route | Purpose | Status |
|-------|---------|--------|
| `/login` | Auth | Done |
| `/` | Library + upload | Done |
| `/book/:id` | Redirect to saved page | Done |
| `/book/:id/page/:page` | Reader + typer | Done |

### Typing editor (current)

- Overlay editor with guide text + per-character mismatch highlighting (`TypingOverlay.vue`)
- Complete on normalized string match (client + server); Done / Next
- Auto-save draft: idle/debounce + localStorage + server `draft_text`
- Blocks before `typing_block_index`: done; current: active editor; later blocks on page: hidden until unlocked
- Client page cache (±1); no full book in Pinia

### Extra UI (post-MVP, done)

- Light/dark theme toggle
- Foldable session countdown timer (localStorage, alarm on finish)
- Library: drag-and-drop upload, rename, delete, keyboard selection
- Reader: keyboard page nav, save-status indicator, finish banner

## Project layout

```
backend/
  app/
    main.py, config.py, auth.py, database.py, spa_static.py
    models/, schemas/, routers/   # auth, books, settings
    services/
      file_validator.py
      html_splitter.py            # Pandoc + HTML → blocks
      page_service.py
      text_normalizer.py
  config.yaml.example
  data/                           # gitignored
frontend/
  src/
    api/, stores/, views/, components/, utils/
Dockerfile
docker-compose.yml
docker/entrypoint.sh
```

## Implementation phases

1. **Skeleton** — config auth (SHA256 password), DB models, Vue login shell — **Done**
2. **Ingest** — pandoc pipeline, magic-byte check, pages API with forward lock — **Done**
3. **Reader UI** — page nav (back only until typed), block scroll, heading styles — **Done**
4. **Typing UI** — free-edit overlay, complete → advance, server-fed chunks — **Done**
5. **Polish** — errors, delete/rename book, production static serve — **Done**
6. **Deploy** — Docker image + compose volume for data — **Done**
7. **UX extras** — theme, char mappings, session timer, draft persistence, typing guide — **Done**

## Still to do (deferred / future)

- [ ] **WPM / accuracy stats** — per-session or per-book typing metrics (session timer is countdown only)
- [ ] **Multi-user accounts** — beyond single config user
- [ ] **Book file hashing / dedup** — skip re-upload of identical files

Optional nice-to-haves (not started):

- [ ] Per-book or global page_size setting in UI
- [ ] Export / backup of progress
- [ ] Mobile-friendly typing layout refinements?
- [ ] Tests (API + critical frontend match logic)

## MVP success criteria

All met:

1. Upload EPUB/FB2 with magic-byte check
2. Book splits into many blocks; chapter titles visible
3. User cannot read forward past unfinished typing block; can go back
4. User retypes in free-edit editor; progress survives refresh
5. Client never holds full book in memory
