# retype-this

Self-hosted web app for learning touch typing by retyping books (FB2/EPUB).

Upload a book, read it in small pages, and retype each block. Forward pages stay locked until you finish the current typing progress. Progress (including mid-block drafts) is saved on the server.

See [PLAN.md](PLAN.md) for detailed status (done vs still to do).

## Features

- Upload **EPUB / FB2** with magic-byte validation
- Pandoc conversion into heading / paragraph / blockquote / verse blocks
- Forward-locked reading; free navigation backward
- Typing overlay with live mismatch highlighting and normalized match
- Configurable **character mappings** (smart quotes, dashes, etc.)
- Progress + mid-block draft persistence (server + local draft cache)
- Light / dark theme
- Session countdown timer with alarm
- Single-user auth from `config.yaml` (SHA256 password hash)
- Docker or local Python + Node development

## Project layout

```
backend/     FastAPI app, SQLite, Pandoc ingestion
frontend/    Vue 3 + Vite client
docker/      Container entrypoint
```

## Quick start (Docker)

```bash
docker compose up --build
```

Open http://localhost:8000 — default login from the baked-in example config: username `me`, password `password`.

Data persists in the `retype-data` volume. To use your own config:

```bash
cp backend/config.yaml.example backend/config.yaml
# edit username / password_hash / secret_key
```

Then mount it in `docker-compose.yml` (uncomment the config volume line) and restart.

## Quick start (local)

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Pandoc](https://pandoc.org/) on `PATH`

### Backend

```bash
cd backend
cp config.yaml.example config.yaml   # edit username/password hash if needed
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --app-dir .
```

Default login from `config.yaml.example`: username `me`, password `password`.

Generate a new password hash:

```bash
python -c "import hashlib; p='yourpassword'; print('sha256:' + hashlib.sha256(p.encode()).hexdigest())"
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies `/api` to the backend on port 8000.

### Production static serve (local)

Build the frontend, then serve it from FastAPI:

```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app --app-dir .
```

## Config notes

`backend/config.yaml`:

- `auth.username` / `auth.password_hash` — single user
- `server.secret_key` — JWT signing key (change in production)
- `server.data_dir` — SQLite + uploads directory
- `typing.char_mappings` — book punctuation → what you type

Stress marks (U+0301) are stripped automatically during text normalization.

## Not implemented yet

- WPM / accuracy statistics
- Multi-user accounts
- Book content hashing / upload dedup

Details and API checklist: [PLAN.md](PLAN.md).
