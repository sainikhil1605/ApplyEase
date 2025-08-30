ApplyEase Embeddings Service

Overview
- FastAPI microservice that computes cosine similarity between a user's resume text and a job description using `sentence-transformers` (`all-MiniLM-L6-v2`).
- Maintains a FAISS CPU index for resume embeddings (in-memory with on-disk persistence).
- Called by the Node backend to upsert embeddings on resume upload and to compute Match % on demand.
 - Replaces the Node backend: includes signup/login, JWT auth, user profile update with resume PDF upload and embedding upsert, match scoring, and optional custom answer generation.

Run Locally
- Ensure PostgreSQL is running and a database named `applyease` exists (no password is fine if your local setup uses trust auth).
- Create a virtualenv and install requirements from `applyease-backend/requirements.txt`.
- Optional: set env vars
  - DB: `PGHOST` (localhost), `PGPORT` (5432), `PGUSER` (your OS user or `postgres`), `PGDATABASE` (applyease), `PGPASSWORD` (empty)
  - Auth: `JWT_KEY` (default `dev-secret`), `JWT_EXPIRES_IN_MIN` (default `60`)
  - OpenAI (optional): `OPENAI_API_KEY` or `API_KEY`
- Start the service: `uvicorn app:app --reload --port 8000`.
- Health check: `GET http://localhost:8000/healthz` -> `{ "status": "ok" }`.

API
- POST `/similarity`
  - Body: `{ "resume_text": string, "job_description": string }`
  - Response: `{ "score": float, "percent": number, "matching_words": string[], "missing_words": string[] }`
- POST `/upsert_resume`
  - Body: `{ "user_id": string, "resume_text": string }`
  - Action: Embeds and stores/resets the user's resume vector in FAISS; persists to disk.
- POST `/match_for_user`
  - Body: `{ "user_id": string, "job_description": string }`
  - Response: `{ "score": float, "percent": number, "matching_words": string[], "missing_words": string[] }`
 - POST `/signup`
   - Body: `{ first_name, last_name, email, password, phone?, location?, urls?, eeo? }`
   - Response: `{ token, user }`
 - POST `/login`
   - Body: `{ email, password }`
   - Response: `{ token }`
 - GET `/user`
   - Auth: `Authorization: Bearer <token>`
   - Response: user profile
 - PATCH `/user`
   - Auth: Bearer
   - Content-Type: `multipart/form-data` with optional fields and `resume` file (PDF). Updates profile; on resume upload, parses text and upserts embedding.
 - GET `/resume`
   - Auth: Bearer
   - Response: `{ resume_text }` (stored text)
 - POST `/match`
   - Auth: Bearer
   - Body: `{ jobDescription }` -> mirrors Node `/match` output
 - POST `/custom-answer` (optional OpenAI)
   - Auth: Bearer
   - Body: `{ jobDescription, applicationQuestion }` -> `{ answer }`

Notes
- The model is cached locally on first run by `sentence-transformers`.
- This service stores resume embeddings and text in PostgreSQL with `pgvector`.
- On startup, it creates the `vector` extension and ensures `resumes` and `users` tables. It also tries to create an IVFFlat index for cosine distance.
