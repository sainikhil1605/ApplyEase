from dotenv import load_dotenv
load_dotenv()  # Load .env file before any other imports that use env vars

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import os
from threading import Lock
import re
from typing import List, Set, Optional
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool
from pgvector.psycopg2 import register_vector
import jwt
import bcrypt
from datetime import datetime, timedelta
import uuid


class SimilarityRequest(BaseModel):
    resume_text: str
    job_description: str


class SimilarityResponse(BaseModel):
    score: float
    percent: float
    matching_words: List[str]
    missing_words: List[str]


app = FastAPI(title="ApplyEase Embeddings Service", version="0.2.0")
try:
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,  # allow wildcard origin for content-script fetches
        allow_methods=["*"],
        allow_headers=["*"]
    )
except Exception:
    pass
security = HTTPBearer(auto_error=True)

# Include additional routers (job tracker, cover letters)
try:
    from .routes.job_tracker import router as job_router
    from .routes.cover_letters import router as cover_router
except Exception:
    try:
        from routes.job_tracker import router as job_router
        from routes.cover_letters import router as cover_router
    except Exception:
        job_router = None
        cover_router = None
if job_router is not None:
    app.include_router(job_router)
if cover_router is not None:
    app.include_router(cover_router)


@app.on_event("startup")
def startup():
    # Load a compact, high-quality general-purpose model
    # Cached locally by sentence-transformers after first download
    global model, dim
    model = SentenceTransformer("all-MiniLM-L6-v2")
    dim = 384  # all-MiniLM-L6-v2 embedding size

    # Init Postgres connection pool
    _init_db()
    _ensure_schema()
    # Include additional routers (job tracker, cover letters)
    try:
        from .routes.job_tracker import router as job_router
        from .routes.cover_letters import router as cover_router
    except Exception:
        from routes.job_tracker import router as job_router
        from routes.cover_letters import router as cover_router
    app.include_router(job_router)
    app.include_router(cover_router)


def _embed(text: str) -> np.ndarray:
    return np.asarray(model.encode(text), dtype=np.float32)


def _normalize(vec: np.ndarray) -> np.ndarray:
    # L2 normalization for cosine similarity
    v = vec.astype(np.float32, copy=True)
    norm = float(np.linalg.norm(v))
    if norm == 0.0:
        return v
    return v / norm


def _db_dsn() -> str:
    host = os.getenv("PGHOST", "localhost")
    port = os.getenv("PGPORT", "5432")
    user = os.getenv("PGUSER", os.getenv("USER", "postgres"))
    password = os.getenv("PGPASSWORD", "")
    dbname = os.getenv("PGDATABASE", "applyease")
    # psycopg2 DSN
    if password:
        return f"host={host} port={port} dbname={dbname} user={user} password={password}"
    else:
        return f"host={host} port={port} dbname={dbname} user={user}"


_pool: Optional[SimpleConnectionPool] = None
_pool_lock = Lock()


def _init_db():
    global _pool
    with _pool_lock:
        if _pool is None:
            dsn = _db_dsn()
            _pool = SimpleConnectionPool(minconn=1, maxconn=5, dsn=dsn)


def _conn():
    assert _pool is not None
    conn = _pool.getconn()
    # Enable autocommit before any operations that might open a transaction
    conn.autocommit = True
    try:
        register_vector(conn)
    except Exception:
        # safe to ignore if already registered
        pass
    return conn


def _put_conn(conn):
    assert _pool is not None
    _pool.putconn(conn)


def _ensure_schema():
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS resumes (
                    user_id text PRIMARY KEY,
                    resume_text text NOT NULL,
                    embedding vector({dim}) NOT NULL,
                    resume_keywords text[] NOT NULL,
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                """
            )
            # Add blob columns for storing original resume file
            cur.execute("ALTER TABLE resumes ADD COLUMN IF NOT EXISTS resume_blob bytea;")
            cur.execute("ALTER TABLE resumes ADD COLUMN IF NOT EXISTS resume_mime text;")
            cur.execute("ALTER TABLE resumes ADD COLUMN IF NOT EXISTS resume_filename text;")
            # Users table for migrated Node backend
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id text PRIMARY KEY,
                    first_name text NOT NULL,
                    last_name text NOT NULL,
                    email text UNIQUE NOT NULL,
                    password_hash text NOT NULL,
                    phone text,
                    location text,
                    urls jsonb DEFAULT '[]'::jsonb,
                    eeo jsonb DEFAULT '[]'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                """
            )
            # Extended profile fields
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line1 text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line2 text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS city text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS state text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS country text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS zip_code text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS current_company text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS desired_salary text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS notice_period text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS relocation text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS available_start_date text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS work_experience jsonb DEFAULT '[]'::jsonb;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS education jsonb DEFAULT '[]'::jsonb;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS skills jsonb DEFAULT '[]'::jsonb;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS certifications jsonb DEFAULT '[]'::jsonb;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_answers jsonb DEFAULT '{}'::jsonb;")
            
            # === NEW EXTENDED PROFILE FIELDS ===
            # Personal Details
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS nationality text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS gender text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns text;")
            
            # Work Authorization
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS work_authorization text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS visa_type text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS visa_expiry text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_sponsorship text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS legally_authorized text;")
            
            # Employment Details
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS years_of_experience text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS current_salary text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS salary_currency text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS remote_preference text;")
            
            # Application Questions
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS hear_about_us text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS applied_before text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS worked_here_before text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_relatives_here text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_url text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS github_url text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS portfolio_url text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS website_url text;")
            
            # Additional Background
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS languages jsonb DEFAULT '[]'::jsonb;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS security_clearance text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS willing_to_travel text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_drivers_license text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS has_vehicle text;")
            
            # Disability & Veteran Status
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS disability_status text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS veteran_status text;")
            
            # Emergency Contact
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone text;")
            cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relationship text;")
            # Optional ANN index for later nearest-neighbor queries
            try:
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS resumes_embedding_idx ON resumes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);"
                )
            except Exception:
                # Older pgvector may not support vector_cosine_ops; ignore
                pass
            # Tailored resumes history (optional persistence)
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tailored_resumes (
                    id text PRIMARY KEY,
                    user_id text NOT NULL,
                    job_description text NOT NULL,
                    resume_text text NOT NULL,
                    resume_blob bytea,
                    resume_mime text,
                    resume_filename text,
                    created_at timestamptz NOT NULL DEFAULT now()
                );
                """
            )
    finally:
        _put_conn(conn)


_TOKEN_RE = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9+.#\-]*")
_EXTRA_STOP = {
    "experience",
    "experiences",
    "responsibility",
    "responsibilities",
    "requirements",
    "requirement",
    "work",
    "works",
    "company",
    "role",
    "roles",
    "candidate",
    "candidates",
    "job",
    "jobs",
    "team",
    "teams",
    "developer",
    "developers",
    "engineer",
    "engineers",
    "backend",
    "front-end",
    "frontend",
    "fullstack",
    "full-stack",
    "experienced",
    "looking",
    "opportunity",
    "position",
    "applicant",
    "applicants",
    "employee",
    "employees",
    "employer",
    "employers",
    "candidate",
    "candidates",
    "culture",
    "stakeholder",
    "stakeholders",
    "collaborate",
    "collaboration",
    "communication",
    "communications",
    "benefits",
    "salary",
    # Generic JD adjectives/phrases we don't want as tech terms
    "consumer-facing",
    "customer-obsessed",
    "results-driven",
    "revenue-generating",
    "self-directed",
    "self-starter",
    "people-first",
    "world-class",
    "in-house",
    "event-driven",
    "well-being",
    "know-how",
    "unit-testing",
}

# Curated technical terms and acronyms to keep
_TECH_TERMS = {
    # Languages
    "python", "java", "javascript", "typescript", "go", "golang", "ruby", "rust", "scala", "kotlin", "c", "c++", "c#",
    # Web/Frameworks
    "node", "nodejs", "express", "django", "flask", "fastapi", "spring", "springboot", "rails", "react", "vue", "angular", "nextjs", "nuxt", "svelte",
    # Cloud/DevOps
    "aws", "azure", "gcp", "kubernetes", "k8s", "docker", "terraform", "ansible", "helm", "serverless", "lambda", "ec2", "s3", "rds", "eks", "ecs", "cloudformation",
    # Databases/Queues/Caches
    "postgres", "postgresql", "mysql", "mariadb", "mongodb", "dynamodb", "redis", "elastic", "elasticsearch", "kafka", "rabbitmq", "sqs", "sns",
    # Data/ML
    "pandas", "numpy", "scikit-learn", "sklearn", "pytorch", "tensorflow", "keras", "spark", "hadoop", "airflow", "dbt", "snowflake", "databricks",
    # Testing/Build/Tools
    "pytest", "unittest", "junit", "maven", "gradle", "webpack", "vite", "babel", "eslint", "prettier", "git", "github", "gitlab", "jenkins", "circleci", "travisci",
    # APIs/Protocols
    "grpc", "graphql", "rest", "soap", "http", "https", "websocket", "oauth", "oidc",
    # Concepts
    "microservices", "monolith", "ci", "cd", "cicd", "oop", "tdd", "redux", "rxjs", "asyncio", "multithreading", "concurrency", "distributed",
}


def _normalize_token(tok: str) -> str:
    # Trim common trailing punctuation and quotes
    t = tok.strip(".,;:!?()[]{}\"'`)“”’“”")
    t = t.lower()
    # Collapse common hyphenated variants to canonical tokens
    hyphen_map = {
        "back-end": "backend",
        "front-end": "frontend",
        "full-stack": "fullstack",
    }
    t = hyphen_map.get(t, t)
    return t


def _is_tech_term(tok: str) -> bool:
    # Explicit allow
    if tok in _TECH_TERMS:
        return True

    # Block pure numbers or mostly numeric tokens
    if tok.isdigit() or re.fullmatch(r"\d+(?:\.\d+)?", tok):
        return False

    # Allow specific digit-bearing tech tokens
    if tok in {"s3", "ec2", "rds", "sqs", "sns", "k8s"}:
        return True

    # Drop other digit-mixed tokens
    if any(ch.isdigit() for ch in tok):
        return False

    # Allow well-known acronyms
    if tok in {"api", "sql", "nosql", "ml", "ai", "nlp", "etl", "sre", "devops", "tls", "ssl", "jwt", "grpc", "rest", "http", "https", "tdd"}:
        return True

    # Only allow hyphenated tokens if in allowlist (avoid adjectives like consumer-facing)
    if "-" in tok:
        return tok in _TECH_TERMS

    # Allow tokens with special signs only for known tech spellings
    if tok in {"c++", "c#", ".net", "node.js", "next.js"}:
        return True

    return False


def _keywords(text: str) -> Set[str]:
    if not text:
        return set()
    raw = _TOKEN_RE.findall(text)
    tokens = {_normalize_token(t.lower()) for t in raw}
    stop = ENGLISH_STOP_WORDS.union(_EXTRA_STOP)
    return {t for t in tokens if t and t not in stop and len(t) > 1 and _is_tech_term(t)}


def _match_and_missing(resume_text: str, jd_text: str, limit: int = 50):
    r_set = _keywords(resume_text)
    j_set = _keywords(jd_text)
    matching = sorted(r_set.intersection(j_set))[:limit]
    missing = sorted(j_set.difference(r_set))[:limit]
    return matching, missing


def _sanitize_for_pdf(text: str) -> str:
    # Replace common unicode punctuation with ASCII equivalents to avoid PDF encoding issues
    if not text:
        return ""
    repl = {
        "\u2013": "-",  # en dash
        "\u2014": "-",  # em dash
        "\u2018": "'",  # left single quote
        "\u2019": "'",  # right single quote
        "\u201c": '"',  # left double quote
        "\u201d": '"',  # right double quote
        "\u2022": "-",  # bullet
        "\u00a0": " ",  # non-breaking space
    }
    for k, v in repl.items():
        text = text.replace(k, v)
    # Best-effort fallback to latin-1 to satisfy ReportLab's standard fonts
    try:
        return text.encode("latin-1", "ignore").decode("latin-1")
    except Exception:
        return text.encode("ascii", "ignore").decode("ascii")


def _clip_text(text: str, max_chars: int = 4000) -> str:
    if not text:
        return ""
    t = re.sub(r"\s+", " ", str(text)).strip()
    if len(t) <= max_chars:
        return t
    # Keep start and end to preserve context
    head = t[: max_chars // 2]
    tail = t[-max_chars // 2 :]
    return head + " ... " + tail


def _render_text_to_pdf_stream(text: str, filename: str = "document.pdf"):
    # Render long text across multiple pages with simple word-wrap and page breaks
    from io import BytesIO
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin_x = 72
    margin_top = 72
    margin_bottom = 72
    max_line_chars = 95  # rough wrap by characters; adequate for mono-like body

    def new_textobject():
        t = c.beginText(margin_x, height - margin_top)
        t.setLeading(14)
        return t

    safe_text = _sanitize_for_pdf(text or "")
    textobject = new_textobject()
    for paragraph in safe_text.splitlines() or [""]:
        if not paragraph:
            if textobject.getY() <= margin_bottom:
                c.drawText(textobject)
                c.showPage()
                textobject = new_textobject()
            textobject.textLine("")
            continue
        line = ""
        for word in paragraph.split(" "):
            if len(line) + len(word) + 1 > max_line_chars:
                if textobject.getY() <= margin_bottom:
                    c.drawText(textobject)
                    c.showPage()
                    textobject = new_textobject()
                textobject.textLine(line)
                line = word
            else:
                line = (line + " " + word).strip()
        if line:
            if textobject.getY() <= margin_bottom:
                c.drawText(textobject)
                c.showPage()
                textobject = new_textobject()
            textobject.textLine(line)
    c.drawText(textobject)
    c.showPage()
    c.save()
    buffer.seek(0)
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return buffer, headers


@app.post("/similarity", response_model=SimilarityResponse)
def similarity(req: SimilarityRequest):
    vec_resume = _embed(req.resume_text)
    vec_jd = _embed(req.job_description)
    # cosine_similarity expects 2D arrays
    score = float(cosine_similarity([vec_resume], [vec_jd])[0][0])
    matching, missing = _match_and_missing(req.resume_text, req.job_description)
    return SimilarityResponse(
        score=score,
        percent=round(score * 100.0, 2),
        matching_words=matching,
        missing_words=missing,
    )



@app.get("/healthz")
def healthz():
    return {"status": "ok"}


class UpsertRequest(BaseModel):
    user_id: str
    resume_text: str


@app.post("/upsert_resume")
def upsert_resume(req: UpsertRequest):
    vec = _normalize(_embed(req.resume_text))
    keywords = sorted(_keywords(req.resume_text))
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO resumes (user_id, resume_text, embedding, resume_keywords, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (user_id) DO UPDATE SET
                  resume_text = EXCLUDED.resume_text,
                  embedding = EXCLUDED.embedding,
                  resume_keywords = EXCLUDED.resume_keywords,
                  updated_at = now()
                """,
                (req.user_id, req.resume_text, vec.tolist(), keywords),
            )
    finally:
        _put_conn(conn)
    return {"ok": True, "user_id": req.user_id}


class MatchForUserRequest(BaseModel):
    user_id: str
    job_description: str


@app.post("/match_for_user", response_model=SimilarityResponse)
def match_for_user(req: MatchForUserRequest):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT embedding, resume_text FROM resumes WHERE user_id = %s", (req.user_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User resume embedding not found")
            emb_list, resume_text = row[0], row[1]
    finally:
        _put_conn(conn)

    # Handle pgvector Vector object - convert to list if needed
    # The Vector class from pgvector doesn't have tolist() but can be converted via numpy or iteration
    try:
        if hasattr(emb_list, 'tolist'):
            emb_list = emb_list.tolist()
        elif hasattr(emb_list, '__array__'):
            # numpy array or array-like
            emb_list = np.array(emb_list).tolist()
        elif hasattr(emb_list, '__iter__') and not isinstance(emb_list, (list, tuple, str)):
            # Try converting to list by iterating
            emb_list = [float(x) for x in emb_list]
    except Exception:
        # Fallback: try direct string conversion for pgvector Vector
        try:
            emb_list = [float(x) for x in str(emb_list).strip('[]').split(',')]
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to convert stored embedding")
    
    resume_vec = np.asarray(emb_list, dtype=np.float32)
    jd_vec = _normalize(_embed(req.job_description))
    score = float(np.dot(jd_vec, resume_vec))
    matching, missing = _match_and_missing(resume_text, req.job_description)
    return SimilarityResponse(
        score=score,
        percent=round(score * 100.0, 2),
        matching_words=matching,
        missing_words=missing,
    )


# ===== Auth & Users (migrated from Node) =====

JWT_KEY = os.getenv("JWT_KEY")
if not JWT_KEY:
    import warnings
    warnings.warn("JWT_KEY not set! Using insecure default. Set JWT_KEY in .env for production!")
    JWT_KEY = "dev-secret-CHANGE-ME"
JWT_EXPIRES_IN_MIN = int(os.getenv("JWT_EXPIRES_IN_MIN", "60"))


class SignupRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str
    phone: Optional[str] = None
    location: Optional[str] = None
    urls: Optional[list] = None
    eeo: Optional[list] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    urls: Optional[list] = None
    eeo: Optional[list] = None
    # Extended profile fields
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    current_company: Optional[str] = None
    desired_salary: Optional[str] = None
    notice_period: Optional[str] = None
    relocation: Optional[str] = None
    available_start_date: Optional[str] = None
    work_experience: Optional[list] = None
    education: Optional[list] = None
    skills: Optional[list] = None
    certifications: Optional[list] = None
    custom_answers: Optional[dict] = None
    # Personal Details
    date_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    gender: Optional[str] = None
    pronouns: Optional[str] = None
    # Work Authorization
    work_authorization: Optional[str] = None
    visa_type: Optional[str] = None
    visa_expiry: Optional[str] = None
    requires_sponsorship: Optional[str] = None
    legally_authorized: Optional[str] = None
    # Employment Details
    years_of_experience: Optional[str] = None
    current_salary: Optional[str] = None
    salary_currency: Optional[str] = None
    employment_type: Optional[str] = None
    remote_preference: Optional[str] = None
    # Application Questions
    hear_about_us: Optional[str] = None
    applied_before: Optional[str] = None
    worked_here_before: Optional[str] = None
    has_relatives_here: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    website_url: Optional[str] = None
    # Additional Background
    languages: Optional[list] = None
    security_clearance: Optional[str] = None
    willing_to_travel: Optional[str] = None
    has_drivers_license: Optional[str] = None
    has_vehicle: Optional[str] = None
    # Disability & Veteran Status
    disability_status: Optional[str] = None
    veteran_status: Optional[str] = None
    # Emergency Contact
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    emergency_contact_relationship: Optional[str] = None


def _hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def _check_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _jwt_create(user_id: str, email: str) -> str:
    payload = {
        "_id": user_id,
        "email": email,
        "role": "user",
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRES_IN_MIN),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_KEY, algorithm="HS256")


def _jwt_verify(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def _current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = creds.credentials
    payload = _jwt_verify(token)
    return payload["_id"]


def _user_row_to_out(row) -> UserOut:
    return UserOut(
        id=row[0],
        first_name=row[1],
        last_name=row[2],
        email=row[3],
        phone=row[5],
        location=row[6],
        urls=row[7] or [],
        eeo=row[8] or [],
        address_line1=row[9] if len(row) > 9 else None,
        address_line2=row[10] if len(row) > 10 else None,
        city=row[11] if len(row) > 11 else None,
        state=row[12] if len(row) > 12 else None,
        country=row[13] if len(row) > 13 else None,
        zip_code=row[14] if len(row) > 14 else None,
        current_company=row[15] if len(row) > 15 else None,
        desired_salary=row[16] if len(row) > 16 else None,
        notice_period=row[17] if len(row) > 17 else None,
        relocation=row[18] if len(row) > 18 else None,
        available_start_date=row[19] if len(row) > 19 else None,
        work_experience=row[20] if len(row) > 20 else [],
        education=row[21] if len(row) > 21 else [],
        skills=row[22] if len(row) > 22 else [],
        certifications=row[23] if len(row) > 23 else [],
        custom_answers=row[24] if len(row) > 24 else {},
        # New fields
        date_of_birth=row[25] if len(row) > 25 else None,
        nationality=row[26] if len(row) > 26 else None,
        gender=row[27] if len(row) > 27 else None,
        pronouns=row[28] if len(row) > 28 else None,
        work_authorization=row[29] if len(row) > 29 else None,
        visa_type=row[30] if len(row) > 30 else None,
        visa_expiry=row[31] if len(row) > 31 else None,
        requires_sponsorship=row[32] if len(row) > 32 else None,
        legally_authorized=row[33] if len(row) > 33 else None,
        years_of_experience=row[34] if len(row) > 34 else None,
        current_salary=row[35] if len(row) > 35 else None,
        salary_currency=row[36] if len(row) > 36 else None,
        employment_type=row[37] if len(row) > 37 else None,
        remote_preference=row[38] if len(row) > 38 else None,
        hear_about_us=row[39] if len(row) > 39 else None,
        applied_before=row[40] if len(row) > 40 else None,
        worked_here_before=row[41] if len(row) > 41 else None,
        has_relatives_here=row[42] if len(row) > 42 else None,
        linkedin_url=row[43] if len(row) > 43 else None,
        github_url=row[44] if len(row) > 44 else None,
        portfolio_url=row[45] if len(row) > 45 else None,
        website_url=row[46] if len(row) > 46 else None,
        languages=row[47] if len(row) > 47 else [],
        security_clearance=row[48] if len(row) > 48 else None,
        willing_to_travel=row[49] if len(row) > 49 else None,
        has_drivers_license=row[50] if len(row) > 50 else None,
        has_vehicle=row[51] if len(row) > 51 else None,
        disability_status=row[52] if len(row) > 52 else None,
        veteran_status=row[53] if len(row) > 53 else None,
        emergency_contact_name=row[54] if len(row) > 54 else None,
        emergency_contact_phone=row[55] if len(row) > 55 else None,
        emergency_contact_relationship=row[56] if len(row) > 56 else None,
    )


@app.post("/signup")
def signup(req: SignupRequest):
    # Password strength validation
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not any(c.isupper() for c in req.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not any(c.islower() for c in req.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one lowercase letter")
    if not any(c.isdigit() for c in req.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    
    user_id = str(uuid.uuid4())
    pw_hash = _hash_password(req.password)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (id, first_name, last_name, email, password_hash, phone, location, urls, eeo)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id, first_name, last_name, email, password_hash, phone, location, urls, eeo
                """,
                (
                    user_id,
                    req.first_name,
                    req.last_name,
                    req.email.lower(),
                    pw_hash,
                    req.phone,
                    req.location,
                    psycopg2.extras.Json(req.urls or []),
                    psycopg2.extras.Json(req.eeo or []),
                ),
            )
            row = cur.fetchone()
    except psycopg2.errors.UniqueViolation:
        raise HTTPException(status_code=400, detail="Email already exists")
    finally:
        _put_conn(conn)
    token = _jwt_create(user_id, req.email.lower())
    user_out = _user_row_to_out(row)
    return {"token": token, "user": user_out}


@app.post("/login")
def login(req: LoginRequest):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, first_name, last_name, email, password_hash, phone, location, urls, eeo FROM users WHERE email = %s",
                (req.email.lower(),),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=400, detail="User not found")
            if not _check_password(req.password, row[4]):
                raise HTTPException(status_code=400, detail="Invalid credentials")
    finally:
        _put_conn(conn)
    token = _jwt_create(row[0], row[3])
    return {"token": token}


@app.get("/user", response_model=UserOut)
def get_user(user_id: str = Depends(_current_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, first_name, last_name, email, password_hash, phone, location, urls, eeo,
                   address_line1, address_line2, city, state, country, zip_code,
                   current_company, desired_salary, notice_period, relocation, available_start_date,
                   work_experience, education, skills, certifications, custom_answers,
                   date_of_birth, nationality, gender, pronouns,
                   work_authorization, visa_type, visa_expiry, requires_sponsorship, legally_authorized,
                   years_of_experience, current_salary, salary_currency, employment_type, remote_preference,
                   hear_about_us, applied_before, worked_here_before, has_relatives_here,
                   linkedin_url, github_url, portfolio_url, website_url,
                   languages, security_clearance, willing_to_travel, has_drivers_license, has_vehicle,
                   disability_status, veteran_status,
                   emergency_contact_name, emergency_contact_phone, emergency_contact_relationship
                   FROM users WHERE id = %s""",
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")
            return _user_row_to_out(row)
    finally:
        _put_conn(conn)


@app.patch("/user")
async def update_user(
    user_id: str = Depends(_current_user),
    first_name: Optional[str] = Form(None),
    last_name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    urls: Optional[str] = Form(None),  # JSON string array
    eeo: Optional[str] = Form(None),   # JSON string array
    # Extended profile fields
    address_line1: Optional[str] = Form(None),
    address_line2: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    zip_code: Optional[str] = Form(None),
    current_company: Optional[str] = Form(None),
    desired_salary: Optional[str] = Form(None),
    notice_period: Optional[str] = Form(None),
    relocation: Optional[str] = Form(None),
    available_start_date: Optional[str] = Form(None),
    work_experience: Optional[str] = Form(None),  # JSON string array
    education: Optional[str] = Form(None),  # JSON string array
    skills: Optional[str] = Form(None),  # JSON string array
    certifications: Optional[str] = Form(None),  # JSON string array
    custom_answers: Optional[str] = Form(None),  # JSON string object
    # Personal Details
    date_of_birth: Optional[str] = Form(None),
    nationality: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    pronouns: Optional[str] = Form(None),
    # Work Authorization
    work_authorization: Optional[str] = Form(None),
    visa_type: Optional[str] = Form(None),
    visa_expiry: Optional[str] = Form(None),
    requires_sponsorship: Optional[str] = Form(None),
    legally_authorized: Optional[str] = Form(None),
    # Employment Details
    years_of_experience: Optional[str] = Form(None),
    current_salary: Optional[str] = Form(None),
    salary_currency: Optional[str] = Form(None),
    employment_type: Optional[str] = Form(None),
    remote_preference: Optional[str] = Form(None),
    # Application Questions
    hear_about_us: Optional[str] = Form(None),
    applied_before: Optional[str] = Form(None),
    worked_here_before: Optional[str] = Form(None),
    has_relatives_here: Optional[str] = Form(None),
    linkedin_url: Optional[str] = Form(None),
    github_url: Optional[str] = Form(None),
    portfolio_url: Optional[str] = Form(None),
    website_url: Optional[str] = Form(None),
    # Additional Background
    languages: Optional[str] = Form(None),  # JSON string array
    security_clearance: Optional[str] = Form(None),
    willing_to_travel: Optional[str] = Form(None),
    has_drivers_license: Optional[str] = Form(None),
    has_vehicle: Optional[str] = Form(None),
    # Disability & Veteran Status
    disability_status: Optional[str] = Form(None),
    veteran_status: Optional[str] = Form(None),
    # Emergency Contact
    emergency_contact_name: Optional[str] = Form(None),
    emergency_contact_phone: Optional[str] = Form(None),
    emergency_contact_relationship: Optional[str] = Form(None),
    # Resume file
    resume: Optional[UploadFile] = File(None),
):
    # Parse optional JSON fields
    import json as _json
    urls_val = None
    eeo_val = None
    work_exp_val = None
    edu_val = None
    skills_val = None
    certs_val = None
    custom_ans_val = None
    languages_val = None
    try:
        if urls:
            urls_val = _json.loads(urls)
        if eeo:
            eeo_val = _json.loads(eeo)
        if work_experience:
            work_exp_val = _json.loads(work_experience)
        if education:
            edu_val = _json.loads(education)
        if skills:
            skills_val = _json.loads(skills)
        if certifications:
            certs_val = _json.loads(certifications)
        if custom_answers:
            custom_ans_val = _json.loads(custom_answers)
        if languages:
            languages_val = _json.loads(languages)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON in one of the fields")

    # Update user profile
    conn = _conn()
    try:
        with conn.cursor() as cur:
            set_cols = []
            params = []
            def add(col, val):
                if val is not None:
                    set_cols.append(f"{col} = %s")
                    params.append(val)
            add("first_name", first_name)
            add("last_name", last_name)
            add("email", email)
            add("phone", phone)
            add("location", location)
            add("address_line1", address_line1)
            add("address_line2", address_line2)
            add("city", city)
            add("state", state)
            add("country", country)
            add("zip_code", zip_code)
            add("current_company", current_company)
            add("desired_salary", desired_salary)
            add("notice_period", notice_period)
            add("relocation", relocation)
            add("available_start_date", available_start_date)
            # Personal Details
            add("date_of_birth", date_of_birth)
            add("nationality", nationality)
            add("gender", gender)
            add("pronouns", pronouns)
            # Work Authorization
            add("work_authorization", work_authorization)
            add("visa_type", visa_type)
            add("visa_expiry", visa_expiry)
            add("requires_sponsorship", requires_sponsorship)
            add("legally_authorized", legally_authorized)
            # Employment Details
            add("years_of_experience", years_of_experience)
            add("current_salary", current_salary)
            add("salary_currency", salary_currency)
            add("employment_type", employment_type)
            add("remote_preference", remote_preference)
            # Application Questions
            add("hear_about_us", hear_about_us)
            add("applied_before", applied_before)
            add("worked_here_before", worked_here_before)
            add("has_relatives_here", has_relatives_here)
            add("linkedin_url", linkedin_url)
            add("github_url", github_url)
            add("portfolio_url", portfolio_url)
            add("website_url", website_url)
            # Additional Background
            add("security_clearance", security_clearance)
            add("willing_to_travel", willing_to_travel)
            add("has_drivers_license", has_drivers_license)
            add("has_vehicle", has_vehicle)
            # Disability & Veteran Status
            add("disability_status", disability_status)
            add("veteran_status", veteran_status)
            # Emergency Contact
            add("emergency_contact_name", emergency_contact_name)
            add("emergency_contact_phone", emergency_contact_phone)
            add("emergency_contact_relationship", emergency_contact_relationship)
            # JSON fields
            if urls_val is not None:
                set_cols.append("urls = %s")
                params.append(psycopg2.extras.Json(urls_val))
            if eeo_val is not None:
                set_cols.append("eeo = %s")
                params.append(psycopg2.extras.Json(eeo_val))
            if work_exp_val is not None:
                set_cols.append("work_experience = %s")
                params.append(psycopg2.extras.Json(work_exp_val))
            if edu_val is not None:
                set_cols.append("education = %s")
                params.append(psycopg2.extras.Json(edu_val))
            if skills_val is not None:
                set_cols.append("skills = %s")
                params.append(psycopg2.extras.Json(skills_val))
            if certs_val is not None:
                set_cols.append("certifications = %s")
                params.append(psycopg2.extras.Json(certs_val))
            if custom_ans_val is not None:
                set_cols.append("custom_answers = %s")
                params.append(psycopg2.extras.Json(custom_ans_val))
            if languages_val is not None:
                set_cols.append("languages = %s")
                params.append(psycopg2.extras.Json(languages_val))
            if set_cols:
                params.extend([user_id])
                cur.execute(
                    f"UPDATE users SET {', '.join(set_cols)}, updated_at = now() WHERE id = %s",
                    params,
                )
    finally:
        _put_conn(conn)

    # If resume file uploaded, parse and upsert embedding
    if resume is not None:
        from pdfminer.high_level import extract_text
        try:
            # Skip if no file actually provided
            if not getattr(resume, "filename", None):
                content = b""
            else:
                content = await resume.read()
            if not content:
                return {"ok": True}
            # Persist: parse to text for embedding
            import tempfile
            suffix = ""
            try:
                # Guess suffix from filename
                if resume.filename and "." in resume.filename:
                    suffix = "." + resume.filename.rsplit(".", 1)[-1]
            except Exception:
                suffix = ""
            # On Windows, NamedTemporaryFile keeps file locked, so use delete=False
            tmp = tempfile.NamedTemporaryFile(suffix=suffix or ".pdf", delete=False)
            tmp_path = tmp.name
            try:
                tmp.write(content)
                tmp.close()  # Close before reading on Windows
                resume_text = extract_text(tmp_path) or ""
            finally:
                # Clean up temp file
                try:
                    os.unlink(tmp_path)
                except Exception:
                    pass
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse resume: {e}")

        # Compute embedding + keywords
        vec = _normalize(_embed(resume_text))
        keywords = sorted(_keywords(resume_text))
        # Upsert everything including blob
        conn2 = _conn()
        try:
            with conn2.cursor() as cur2:
                cur2.execute(
                    """
                    INSERT INTO resumes (user_id, resume_text, embedding, resume_keywords, resume_blob, resume_mime, resume_filename, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, now())
                    ON CONFLICT (user_id) DO UPDATE SET
                      resume_text = EXCLUDED.resume_text,
                      embedding = EXCLUDED.embedding,
                      resume_keywords = EXCLUDED.resume_keywords,
                      resume_blob = EXCLUDED.resume_blob,
                      resume_mime = EXCLUDED.resume_mime,
                      resume_filename = EXCLUDED.resume_filename,
                      updated_at = now()
                    """,
                    (
                        user_id,
                        resume_text,
                        vec.tolist(),
                        keywords,
                        psycopg2.Binary(content),
                        getattr(resume, "content_type", None) or "application/pdf",
                        resume.filename or "resume.pdf",
                    ),
                )
        finally:
            _put_conn(conn2)

    return {"ok": True}


@app.get("/resume")
def get_resume(user_id: str = Depends(_current_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT resume_text FROM resumes WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="No resume stored")
            return {"resume_text": row[0]}
    finally:
        _put_conn(conn)


@app.get("/resume_file")
def get_resume_file(user_id: str = Depends(_current_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT resume_blob, resume_mime, resume_filename FROM resumes WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            if not row or row[0] is None:
                raise HTTPException(status_code=404, detail="No resume file stored")
            blob, mime, fname = row
    finally:
        _put_conn(conn)
    try:
        from io import BytesIO
        bio = BytesIO(blob)
        headers = {"Content-Disposition": f"inline; filename={fname or 'resume.pdf'}"}
        return StreamingResponse(bio, media_type=mime or "application/pdf", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream resume: {e}")


@app.get("/resume_pdf")
def get_resume_pdf(user_id: str = Depends(_current_user)):
    # Prefer stored PDF blob if present; otherwise render text to PDF
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT resume_blob, resume_mime, resume_filename, resume_text FROM resumes WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="No resume stored")
            blob, mime, fname, resume_text = row[0], row[1], row[2], row[3] or ""
    finally:
        _put_conn(conn)
    try:
        if blob and (mime or "").lower().startswith("application/pdf"):
            from io import BytesIO
            headers = {"Content-Disposition": f"inline; filename={fname or 'resume.pdf'}"}
            return StreamingResponse(BytesIO(blob), media_type=mime or "application/pdf", headers=headers)
        buffer, headers = _render_text_to_pdf_stream(resume_text, filename=fname or "resume.pdf")
        return StreamingResponse(buffer, media_type="application/pdf", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to render PDF: {e}")


class MatchBody(BaseModel):
    jobDescription: str


@app.post("/match")
def match(req: MatchBody, user_id: str = Depends(_current_user)):
    # Mirror Node's /match: use stored resume embedding + provided JD
    if not req.jobDescription or not req.jobDescription.strip():
        raise HTTPException(status_code=400, detail="jobDescription is required")
    resp = match_for_user(MatchForUserRequest(user_id=user_id, job_description=req.jobDescription))
    return {
        "score": resp.score,
        "percent": resp.percent,
        "matchingWords": resp.matching_words,
        "missingWords": resp.missing_words,
    }


class CustomAnswerBody(BaseModel):
    jobDescription: str
    applicationQuestion: str


@app.post("/custom-answer")
def custom_answer(req: CustomAnswerBody, user_id: str = Depends(_current_user)):
    # Local-only LLMs: Ollama (default) or LM Studio/vLLM (OpenAI-compatible)
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()
    ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    base_url = os.getenv("LLM_BASE_URL", "http://localhost:1234/v1")
    model = os.getenv("LLM_MODEL","llama3.1:8b") 
    # Fetch resume text
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT resume_text FROM resumes WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            resume_text = row[0] if row else ""
    finally:
        _put_conn(conn)

    prompt = (
        "You are an assistant that writes concise, specific answers for job applications.\n"
        f"Resume:\n{resume_text}\n\n"
        f"Job Description:\n{req.jobDescription}\n\n"
        f"Question:\n{req.applicationQuestion}\n\n"
        "Write a tailored answer (120-180 words), highlight relevant skills, and keep a professional tone and give only response do not write any other text."
    )

    try:
        if provider == "ollama":
            # Use Ollama chat API
            model_name = model or "llama3.1:8b"
            import requests as _rq
            r = _rq.post(
                f"{ollama_host.rstrip('/')}/api/chat",
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                },
                timeout=35,
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Ollama error: {r.text}")
            data = r.json()
            content = None
            if isinstance(data, dict):
                if isinstance(data.get("message"), dict):
                    content = data["message"].get("content")
                if not content and "response" in data:
                    content = data.get("response")
            return {"answer": content or ""}

        elif provider in ("lmstudio", "openai_compatible", "vllm"):
            # Use OpenAI-compatible endpoint via direct HTTP
            if not model:
                raise HTTPException(status_code=400, detail="Set LLM_MODEL to your local model name for LM Studio/vLLM")
            import requests as _rq
            url = f"{base_url.rstrip('/')}/chat/completions"
            r = _rq.post(
                url,
                headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', 'lm-studio')}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}]},
                timeout=15,
            )
            if r.status_code != 200:
                raise HTTPException(status_code=502, detail=f"LM Studio error: {r.text}")
            data = r.json()
            try:
                answer = data["choices"][0]["message"]["content"]
            except Exception:
                answer = ""
            return {"answer": answer}

        else:
            raise HTTPException(status_code=400, detail="Unsupported LLM_PROVIDER. Use 'ollama' (default) or 'lmstudio'.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM error: {e}")


def _llm_complete(prompt: str) -> str:
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()
    ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    base_url = os.getenv("LLM_BASE_URL", "http://localhost:1234/v1")
    model = os.getenv("LLM_MODEL")
    timeout_s = int(os.getenv("LLM_TIMEOUT_SECONDS", "50"))
    if provider in {"off", "none", "disabled"}:
        return ""
    try:
        if provider == "ollama":
            model_name = model or "llama3.1:8b"
            import requests as _rq
            r = _rq.post(
                f"{ollama_host.rstrip('/')}/api/chat",
                json={
                    "model": model_name,
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "options": { "num_ctx": 8192, "temperature": 0.2 }
                },
                timeout=timeout_s,
            )
            if r.status_code != 200:
                return ""
            data = r.json()
            if isinstance(data, dict):
                if isinstance(data.get("message"), dict):
                    return data["message"].get("content") or ""
                if "response" in data:
                    return data.get("response") or ""
            return ""
        elif provider in ("lmstudio", "openai_compatible", "vllm"):
            if not model:
                raise RuntimeError("Set LLM_MODEL for lmstudio/vLLM provider")
            import requests as _rq
            url = f"{base_url.rstrip('/')}/chat/completions"
            r = _rq.post(
                url,
                headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', 'lm-studio')}", "Content-Type": "application/json"},
                json={"model": model, "messages": [{"role": "user", "content": prompt}]},
                timeout=timeout_s,
            )
            if r.status_code != 200:
                return ""
            data = r.json()
            return data.get("choices", [{}])[0].get("message", {}).get("content", "")
        else:
            raise RuntimeError("Unsupported LLM_PROVIDER")
    except Exception:
        return ""


class TailoredResumeBody(BaseModel):
    jobDescription: str
    save: Optional[bool] = False


@app.post("/tailored_resume")
def tailored_resume(req: TailoredResumeBody, user_id: str = Depends(_current_user)):
    # Fetch resume text
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT resume_text FROM resumes WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="No resume stored")
            resume_text = row[0] or ""
    finally:
        _put_conn(conn)

    matching, missing = _match_and_missing(resume_text, req.jobDescription)
    target_terms = missing[:20]

    # Clip inputs to avoid overwhelming local LLM servers
    max_chars = int(os.getenv("LLM_TAILOR_MAX_CHARS", "4000"))
    jd_clip = _clip_text(req.jobDescription, max_chars)
    resume_clip = _clip_text(resume_text, max_chars)

    base_prompt = (
        "Rewrite the resume text to naturally include the given technical keywords if and only if they reflect true experience.\n Return only the rewritten resume text. Do not add any explanations or other text."
        "Preserve factual accuracy, avoid keyword stuffing, and keep a concise professional tone.\n"
        "Return ONLY the rewritten resume text and donot add any prefix text describing the job done.\n\n"
        f"Target keywords: {', '.join(target_terms)}\n\n"
        f"Job description (context): {jd_clip}\n\n"
        f"Resume:\n{resume_clip}\n"
    )
    new_text = _llm_complete(base_prompt).strip()
    if not new_text:
        # Fallback: append a compact skills block
        if target_terms:
            new_text = resume_text + "\n\nSkills Highlight: " + ", ".join(target_terms)
        else:
            new_text = resume_text

    if req.save:
        conn2 = _conn()
        try:
            with conn2.cursor() as cur:
                tid = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO tailored_resumes (id, user_id, job_description, resume_text)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (tid, user_id, req.jobDescription, new_text),
                )
        finally:
            _put_conn(conn2)

    return {"resume_text": new_text, "matching_words": matching, "missing_words": target_terms}


@app.post("/tailored_resume_pdf")
def tailored_resume_pdf(req: TailoredResumeBody, user_id: str = Depends(_current_user)):
    resp = tailored_resume(req, user_id)  # generate text (and maybe save row)
    text = resp.get("resume_text", "")
    try:
        buffer, headers = _render_text_to_pdf_stream(text, filename="tailored_resume.pdf")
        # Optionally save to history with blob
        if req.save:
            pdf_bytes = buffer.getvalue()
            conn = _conn()
            try:
                with conn.cursor() as cur:
                    tid = str(uuid.uuid4())
                    cur.execute(
                        """
                        INSERT INTO tailored_resumes (id, user_id, job_description, resume_text, resume_blob, resume_mime, resume_filename)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        """,
                        (
                            tid,
                            user_id,
                            req.jobDescription,
                            text,
                            psycopg2.Binary(pdf_bytes),
                            "application/pdf",
                            "tailored_resume.pdf",
                        ),
                    )
            finally:
                _put_conn(conn)
        return StreamingResponse(buffer, media_type="application/pdf", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to render PDF: {e}")


class RenderPdfBody(BaseModel):
    text: str
    filename: Optional[str] = None


@app.post("/render_pdf")
def render_pdf(req: RenderPdfBody, user_id: str = Depends(_current_user)):
    # Render arbitrary text to PDF (no LLM call). Used by dashboard after generating tailored CV text.
    try:
        fname = (req.filename or "document.pdf").replace("\n", " ")
        buffer, headers = _render_text_to_pdf_stream(req.text or "", filename=fname)
        return StreamingResponse(buffer, media_type="application/pdf", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to render PDF: {e}")


@app.get("/tailored_resumes")
def list_tailored_resumes(user_id: str = Depends(_current_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, created_at, resume_filename, (resume_blob IS NOT NULL) AS has_blob FROM tailored_resumes WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,),
            )
            rows = cur.fetchall() or []
            items = [
                {
                    "id": r[0],
                    "created_at": str(r[1]),
                    "filename": r[2] or "tailored_resume.pdf",
                    "has_blob": bool(r[3]),
                }
                for r in rows
            ]
            return {"items": items}
    finally:
        _put_conn(conn)


@app.get("/tailored_resume_download")
def download_tailored_resume(id: str, user_id: str = Depends(_current_user)):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT resume_blob, resume_mime, resume_filename, resume_text FROM tailored_resumes WHERE id = %s AND user_id = %s",
                (id, user_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            blob, mime, fname, text = row
            if blob:
                from io import BytesIO
                headers = {"Content-Disposition": f"attachment; filename={fname or 'tailored_resume.pdf'}"}
                return StreamingResponse(BytesIO(blob), media_type=mime or "application/pdf", headers=headers)
            buffer, headers = _render_text_to_pdf_stream(text or "", filename=fname or "tailored_resume.pdf")
            return StreamingResponse(buffer, media_type="application/pdf", headers=headers)
    finally:
        _put_conn(conn)


class UseTailoredBody(BaseModel):
    id: str


@app.post("/use_tailored")
def use_tailored(body: UseTailoredBody, user_id: str = Depends(_current_user)):
    # Replace current resume with a tailored one (text + embedding + optional blob)
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT resume_text, resume_blob, resume_mime, resume_filename FROM tailored_resumes WHERE id = %s AND user_id = %s",
                (body.id, user_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Tailored resume not found")
            text, blob, mime, fname = row
    finally:
        _put_conn(conn)

    text = text or ""
    vec = _normalize(_embed(text))
    keywords = sorted(_keywords(text))
    conn2 = _conn()
    try:
        with conn2.cursor() as cur2:
            cur2.execute(
                """
                INSERT INTO resumes (user_id, resume_text, embedding, resume_keywords, resume_blob, resume_mime, resume_filename, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (user_id) DO UPDATE SET
                  resume_text = EXCLUDED.resume_text,
                  embedding = EXCLUDED.embedding,
                  resume_keywords = EXCLUDED.resume_keywords,
                  resume_blob = EXCLUDED.resume_blob,
                  resume_mime = EXCLUDED.resume_mime,
                  resume_filename = EXCLUDED.resume_filename,
                  updated_at = now()
                """,
                (
                    user_id,
                    text,
                    vec.tolist(),
                    keywords,
                    psycopg2.Binary(blob) if blob else None,
                    mime or ("application/pdf" if blob else None),
                    fname or ("resume.pdf" if blob else None),
                ),
            )
    finally:
        _put_conn(conn2)
    return {"ok": True}


# ===== Resume Parsing with LLM =====

@app.post("/extract_profile")
def extract_profile_from_resume(user_id: str = Depends(_current_user)):
    """
    Use LLM to extract structured profile data from the user's uploaded resume.
    Returns work_experience, education, skills, and basic info.
    """
    import json as _json
    
    # Fetch resume text
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT resume_text FROM resumes WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            if not row or not row[0]:
                raise HTTPException(status_code=404, detail="No resume found. Please upload a resume first.")
            resume_text = row[0]
    finally:
        _put_conn(conn)

    # Clip resume to avoid token limits
    resume_clip = _clip_text(resume_text, 6000)

    extraction_prompt = f"""Extract structured information from this resume and return ONLY a valid JSON object (no markdown, no explanation, no code blocks).

Resume:
{resume_clip}

Return this exact JSON structure with the extracted data:
{{
  "first_name": "extracted first name or empty string",
  "last_name": "extracted last name or empty string",
  "email": "extracted email or empty string",
  "phone": "extracted phone number or empty string",
  "location": "extracted city/location or empty string",
  "current_company": "most recent employer or empty string",
  "work_experience": [
    {{
      "position": "job title",
      "company": "company name",
      "start_date": "MM/YYYY format",
      "end_date": "MM/YYYY or Current",
      "details": "bullet points of responsibilities/achievements as a single string"
    }}
  ],
  "education": [
    {{
      "degree": "degree type (e.g., Bachelor's, Master's)",
      "major": "field of study",
      "institution": "school/university name",
      "graduation_date": "MM/YYYY format"
    }}
  ],
  "skills": [
    {{
      "name": "skill name",
      "proficiency": "Beginner/Intermediate/Advanced/Expert"
    }}
  ],
  "certifications": [
    {{
      "name": "certification name",
      "issuer": "issuing organization",
      "date": "MM/YYYY"
    }}
  ]
}}

Extract ALL work experiences, education entries, and skills mentioned. For proficiency, estimate based on context (years of experience, how prominently featured, etc.).
Return ONLY the JSON object, nothing else."""

    llm_response = _llm_complete(extraction_prompt)
    
    if not llm_response:
        raise HTTPException(status_code=502, detail="LLM failed to process resume. Please try again.")

    # Try to parse JSON from response
    try:
        # Clean up common LLM response issues
        cleaned = llm_response.strip()
        # Remove markdown code blocks if present
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            # Find the JSON content between ``` markers
            json_lines = []
            in_json = False
            for line in lines:
                if line.startswith("```") and not in_json:
                    in_json = True
                    continue
                elif line.startswith("```") and in_json:
                    break
                elif in_json:
                    json_lines.append(line)
            cleaned = "\n".join(json_lines)
        
        # Try to find JSON object in the response
        start_idx = cleaned.find("{")
        end_idx = cleaned.rfind("}") + 1
        if start_idx != -1 and end_idx > start_idx:
            cleaned = cleaned[start_idx:end_idx]
        
        extracted = _json.loads(cleaned)
    except _json.JSONDecodeError as e:
        # Return partial response for debugging
        raise HTTPException(status_code=502, detail=f"Failed to parse LLM response as JSON: {str(e)[:100]}. Raw response: {llm_response[:500]}")

    return {
        "extracted": extracted,
        "message": "Profile data extracted from resume. Review and save to apply."
    }


class ApplyExtractedBody(BaseModel):
    extracted: dict
    merge: Optional[bool] = True  # If True, merge with existing; if False, replace


@app.post("/apply_extracted_profile")
def apply_extracted_profile(body: ApplyExtractedBody, user_id: str = Depends(_current_user)):
    """
    Apply the extracted profile data to the user's profile.
    Can either merge with existing data or replace it.
    """
    import json as _json
    
    data = body.extracted
    
    conn = _conn()
    try:
        with conn.cursor() as cur:
            if body.merge:
                # Fetch existing data first
                cur.execute(
                    """SELECT first_name, last_name, email, phone, location, current_company,
                       work_experience, education, skills, certifications
                       FROM users WHERE id = %s""",
                    (user_id,)
                )
                row = cur.fetchone()
                if row:
                    existing_work = row[6] or []
                    existing_edu = row[7] or []
                    existing_skills = row[8] or []
                    existing_certs = row[9] or []
                    
                    # Merge arrays (add new items that don't seem to already exist)
                    new_work = data.get("work_experience", [])
                    new_edu = data.get("education", [])
                    new_skills = data.get("skills", [])
                    new_certs = data.get("certifications", [])
                    
                    # Simple dedup by checking if company+position already exists
                    existing_work_keys = {(w.get("company", "").lower(), w.get("position", "").lower()) for w in existing_work}
                    for w in new_work:
                        key = (w.get("company", "").lower(), w.get("position", "").lower())
                        if key not in existing_work_keys:
                            existing_work.append(w)
                    
                    existing_edu_keys = {(e.get("institution", "").lower(), e.get("degree", "").lower()) for e in existing_edu}
                    for e in new_edu:
                        key = (e.get("institution", "").lower(), e.get("degree", "").lower())
                        if key not in existing_edu_keys:
                            existing_edu.append(e)
                    
                    existing_skill_names = {s.get("name", "").lower() for s in existing_skills}
                    for s in new_skills:
                        if s.get("name", "").lower() not in existing_skill_names:
                            existing_skills.append(s)
                    
                    existing_cert_names = {c.get("name", "").lower() for c in existing_certs}
                    for c in new_certs:
                        if c.get("name", "").lower() not in existing_cert_names:
                            existing_certs.append(c)
                    
                    data["work_experience"] = existing_work
                    data["education"] = existing_edu
                    data["skills"] = existing_skills
                    data["certifications"] = existing_certs
            
            # Build update query
            set_parts = []
            params = []
            
            # Only update fields that are present and non-empty in extracted data
            simple_fields = ["first_name", "last_name", "email", "phone", "location", "current_company"]
            for field in simple_fields:
                val = data.get(field)
                if val and str(val).strip():
                    set_parts.append(f"{field} = %s")
                    params.append(str(val).strip())
            
            json_fields = ["work_experience", "education", "skills", "certifications"]
            for field in json_fields:
                val = data.get(field)
                if val and isinstance(val, list) and len(val) > 0:
                    set_parts.append(f"{field} = %s")
                    params.append(psycopg2.extras.Json(val))
            
            if set_parts:
                params.append(user_id)
                cur.execute(
                    f"UPDATE users SET {', '.join(set_parts)}, updated_at = now() WHERE id = %s",
                    params
                )
    finally:
        _put_conn(conn)
    
    return {"ok": True, "message": "Profile updated with extracted data"}
