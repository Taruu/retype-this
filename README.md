# retype-this

Self-hosted web app for learning touch typing by retyping books (FB2/EPUB).

See [PLAN.md](PLAN.md) for the MVP implementation plan.

## Project layout

```
backend/     FastAPI app, SQLite, Pandoc ingestion
frontend/    Vue 3 + Vite client
```

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Pandoc](https://pandoc.org/) installed and available on `PATH`

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

### Production static serve

Build the frontend, then serve it from FastAPI:

```bash
cd frontend && npm run build
cd ../backend && uvicorn app.main:app --app-dir .
```

## MVP features

- Upload EPUB/FB2 with magic-byte validation
- Pandoc conversion into heading/paragraph blocks
- Forward-locked reading with backward navigation
- Free-edit textarea retyping with progress persistence
- Client keeps only the current page (±1 cache) in memory
