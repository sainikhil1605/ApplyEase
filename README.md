ApplyEase — Local, Privacy‑First Job Application Assistant

Overview

- Auto‑fills common job application fields (first/last name, email, phone, links) and uploads your resume.
- Computes a Resume ↔ Job Description match score with tech‑term highlights (matching/missing keywords).
- <img width="416" height="661" alt="image" src="https://github.com/user-attachments/assets/a02d9cf1-a874-4732-94d6-0380c93fde44" />

- Generates concise custom answers to application questions using a local LLM (no paid APIs).
- Works via a Chrome extension with a small React dashboard and a FastAPI backend.

Architecture

- Backend: FastAPI (`applyease-backend/app.py`) + PostgreSQL with `pgvector` for embeddings. SentenceTransformer model `all-MiniLM-L6-v2` for resume/JD similarity. Local LLM support: Ollama (default) or LM Studio/vLLM (OpenAI‑compatible API).
- Frontend: React app in `frontend/` (login, dashboard, profile, upload resume, compute match, generate answers).
- Chrome Extension: Autofill on job sites, JD extraction, on‑page match widget, popup with keywords.

Prerequisites

- Python 3.9+
- PostgreSQL with `pgvector` extension available
- Node.js 16+ and npm for the frontend
- Chrome (or Chromium‑based) for the extension
- Local LLM
  - Ollama (recommended): https://ollama.ai — e.g., `ollama pull llama3.1:8b`
  - OR LM Studio / any OpenAI‑compatible local server

Quick Start

1. Database

   - Create DB `applyease` and ensure pgvector is installed/enabled
     - psql: `CREATE DATABASE applyease; \c applyease; CREATE EXTENSION IF NOT EXISTS vector;`

2. Backend

   - `cd applyease-backend`
   - `python3 -m venv .venv && source .venv/bin/activate`
   - `pip install -r requirements.txt`
   - Optional env (defaults in parentheses):
     - DB: `PGHOST` (localhost), `PGPORT` (5432), `PGUSER` (your OS user or postgres), `PGDATABASE` (applyease), `PGPASSWORD` (empty)
     - Auth: `JWT_KEY` (dev-secret), `JWT_EXPIRES_IN_MIN` (60)
     - LLM: `LLM_PROVIDER` (ollama|lmstudio), `LLM_MODEL` (e.g., llama3.1:8b), `OLLAMA_HOST` (http://localhost:11434), `LLM_BASE_URL` (http://localhost:1234/v1)
   - Start: `uvicorn app:app --reload --port 8000`
   - On first run, the service will create tables `users`, `resumes` and try to create the `vector` extension and an IVFFlat index.

3. Local LLM

   - Ollama (recommended):
     - Install Ollama and run: `ollama pull llama3.1:8b`
     - `export LLM_PROVIDER=ollama` and `export LLM_MODEL=llama3.1:8b`
   - LM Studio (or compatible):
     - Start local server (usually `http://localhost:1234/v1`) with your model
     - `export LLM_PROVIDER=lmstudio`, `export LLM_BASE_URL=http://localhost:1234/v1`, `export LLM_MODEL=<your-model-name>`

4. Frontend

   - `cd frontend`
   - `npm install`
   - Optional: `export REACT_APP_API_BASE=http://localhost:8000`
   - Run: `npm start` (dev server on http://localhost:3000)

5. Chrome Extension
   - Go to chrome://extensions → Enable Developer Mode → Load unpacked → select this repo folder.
   - The extension injects on all frames at document_end for better compatibility.

Basic Flow

1. Sign up or login in the web app (http://localhost:3000). JWT is saved to localStorage and also broadcast to the extension.
2. In the dashboard, upload your resume (PDF) and update profile fields. This embeds and stores the resume in Postgres.
3. Visit a job posting (LinkedIn/Indeed/Workday/Greenhouse/Lever/etc.).
   - A floating “Resume Match: XX%” widget appears on the page (computed from the JD on load).
   - Click the widget to open the extension popup, which shows matching/missing keywords.
4. Click “Auto Fill” in the popup to fill the form.
   - Fills first/last name (or full name field), email, phone, location, URLs.
   - Attaches your resume as a PDF from the backend (`/resume_pdf`).
   - Adds “Fill” buttons next to textareas to generate tailored answers locally.

Key Endpoints (Backend on :8000)

- POST `/signup` → `{ token, user }`
- POST `/login` → `{ token }`
- GET `/user` (Bearer)
- PATCH `/user` (Bearer, multipart: `resume` file + fields `first_name`,`last_name`,`urls` JSON, etc.)
- GET `/resume` (Bearer) → `{ resume_text }`
- GET `/resume_pdf` (Bearer) → stream of generated PDF
- POST `/match` (Bearer) → `{ percent, matchingWords, missingWords, score }`
- POST `/custom-answer` (Bearer, local LLM only) → `{ answer }`
- POST `/upsert_resume` (service) → `{ ok, user_id }`

Database Schema (auto‑created)

- `users(id text pk, first_name, last_name, email unique, password_hash, phone, location, urls jsonb, eeo jsonb, created_at, updated_at)`
- `resumes(user_id text pk, resume_text text, embedding vector(384), resume_keywords text[], updated_at)`

Smoke‑Test (curl)

- Signup: `curl -sS -X POST http://localhost:8000/signup -H 'Content-Type: application/json' -d '{"first_name":"Test","last_name":"User","email":"test@example.com","password":"pass123"}'`
- Upsert resume (text): `curl -sS -X POST http://localhost:8000/upsert_resume -H 'Content-Type: application/json' -d '{"user_id":"<USER_ID>","resume_text":"Software engineer skilled in Python, AWS, and Docker."}'`
- Health: `curl -sS http://localhost:8000/healthz`
- Match (Bearer): `curl -sS -X POST http://localhost:8000/match -H "Authorization: Bearer <TOKEN>" -H 'Content-Type: application/json' -d '{"jobDescription":"Looking for backend developer with AWS and Python."}'`
- Custom answer (Bearer, local LLM): `curl -sS -X POST http://localhost:8000/custom-answer -H "Authorization: Bearer <TOKEN>" -H 'Content-Type: application/json' -d '{"jobDescription":"...","applicationQuestion":"Describe a project that demonstrates your impact."}'`

Troubleshooting

- Postgres/pgvector: If startup fails creating the `vector` extension, install pgvector on your DB and retry. Ensure env `PG*` vars point to the right DB.
- Autocommit error: We set autocommit before using pgvector; ensure you’re on the latest `applyease-backend/app.py`.
- Local LLM:
  - Ollama: ensure the model is pulled and `LLM_MODEL` is set (e.g., `llama3.1:8b`).
  - LM Studio: verify base URL `/v1` and the model name; set envs as above.
- CORS: The backend enables permissive CORS so the web app and content scripts can call it. Restart the server after installing deps.
- Extension not autofilling:
  - Confirm token: open DevTools on the job page and run `chrome.storage.local.get('token', console.log)`.
  - Some sites load forms in iframes; we inject into all frames (`all_frames: true`).
  - Hidden file inputs: we click associated labels/buttons to reveal, then upload `/resume_pdf`. If a specific site still resists, capture its DOM and adjust selectors.
- Matching seems low with all terms: The score is cosine similarity of embeddings, not a keyword count. Keywords are diagnostic only.

Notes

- Embeddings model: `all-MiniLM-L6-v2` (384‑dim). Vectors stored normalized; cosine via dot product.
- Keywords: tech‑focused extraction with curated allowlist + heuristics; generic job terms ignored.
- Data lives in Postgres; to reset, drop the `resumes` and `users` tables.

License

- For personal use. Do not upload sensitive information to third‑party sites without review.
