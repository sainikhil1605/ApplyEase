from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import os
import jwt
import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool
from threading import Lock


router = APIRouter()
security = HTTPBearer(auto_error=True)


# --- Minimal shared DB helpers (decoupled from app.py to avoid circular imports) ---
_pool = None
_pool_lock = Lock()


def _db_dsn() -> str:
    host = os.getenv("PGHOST", "localhost")
    port = os.getenv("PGPORT", "5432")
    user = os.getenv("PGUSER", os.getenv("USER", "postgres"))
    password = os.getenv("PGPASSWORD", "")
    dbname = os.getenv("PGDATABASE", "applyease")
    if password:
        return f"host={host} port={port} dbname={dbname} user={user} password={password}"
    else:
        return f"host={host} port={port} dbname={dbname} user={user}"


def _conn():
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = SimpleConnectionPool(minconn=1, maxconn=5, dsn=_db_dsn())
    conn = _pool.getconn()
    conn.autocommit = True
    return conn


def _put_conn(conn):
    global _pool
    if _pool is not None:
        _pool.putconn(conn)


def _ensure_schema():
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS job_applications (
                    id text PRIMARY KEY,
                    user_id text NOT NULL,
                    company text NOT NULL,
                    title text NOT NULL,
                    location text,
                    source text,
                    url text,
                    status text NOT NULL DEFAULT 'saved', -- saved|applied|interview|offer|rejected
                    notes text,
                    jd_text text,
                    next_action_date date,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now()
                );
                """
            )
            try:
                cur.execute("CREATE INDEX IF NOT EXISTS job_applications_user_idx ON job_applications (user_id, updated_at DESC);")
            except Exception:
                pass
    finally:
        _put_conn(conn)


JWT_KEY = os.getenv("JWT_KEY", "dev-secret")


def _current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_KEY, algorithms=["HS256"])
        return payload.get("_id")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


class JobCreate(BaseModel):
    company: str
    title: str
    location: Optional[str] = None
    source: Optional[str] = None
    url: Optional[str] = None
    status: Optional[str] = "saved"
    notes: Optional[str] = None
    jd_text: Optional[str] = None
    next_action_date: Optional[str] = None  # YYYY-MM-DD


class JobUpdate(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    location: Optional[str] = None
    source: Optional[str] = None
    url: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    jd_text: Optional[str] = None
    next_action_date: Optional[str] = None


class JobOut(JobCreate):
    id: str
    created_at: str
    updated_at: str


@router.on_event("startup")
def _startup():
    _ensure_schema()


@router.get("/jobs", response_model=List[JobOut])
def list_jobs(user_id: str = Depends(_current_user)):
    _ensure_schema()
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute("SELECT * FROM job_applications WHERE user_id = %s ORDER BY updated_at DESC", (user_id,))
            rows = cur.fetchall() or []
            out = []
            for r in rows:
                out.append(JobOut(
                    id=r["id"], company=r["company"], title=r["title"], location=r["location"], source=r["source"],
                    url=r["url"], status=r["status"], notes=r["notes"], jd_text=r["jd_text"],
                    next_action_date=str(r["next_action_date"]) if r["next_action_date"] else None,
                    created_at=str(r["created_at"]), updated_at=str(r["updated_at"])
                ))
            return out
    finally:
        _put_conn(conn)


@router.post("/jobs", response_model=JobOut)
def create_job(body: JobCreate, user_id: str = Depends(_current_user)):
    _ensure_schema()
    import uuid
    jid = str(uuid.uuid4())
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(
                """
                INSERT INTO job_applications (id, user_id, company, title, location, source, url, status, notes, jd_text, next_action_date)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
                """,
                (
                    jid, user_id, body.company, body.title, body.location, body.source, body.url,
                    body.status or 'saved', body.notes, body.jd_text,
                    body.next_action_date if body.next_action_date else None,
                ),
            )
            r = cur.fetchone()
            return JobOut(
                id=r["id"], company=r["company"], title=r["title"], location=r["location"], source=r["source"],
                url=r["url"], status=r["status"], notes=r["notes"], jd_text=r["jd_text"],
                next_action_date=str(r["next_action_date"]) if r["next_action_date"] else None,
                created_at=str(r["created_at"]), updated_at=str(r["updated_at"])
            )
    finally:
        _put_conn(conn)


@router.patch("/jobs/{id}", response_model=JobOut)
def update_job(id: str, body: JobUpdate, user_id: str = Depends(_current_user)):
    _ensure_schema()
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            # Build dynamic SET clause
            fields = [
                ("company", body.company), ("title", body.title), ("location", body.location), ("source", body.source),
                ("url", body.url), ("status", body.status), ("notes", body.notes), ("jd_text", body.jd_text),
            ]
            set_cols, params = [], []
            for col, val in fields:
                if val is not None:
                    set_cols.append(f"{col} = %s")
                    params.append(val)
            if body.next_action_date is not None:
                set_cols.append("next_action_date = %s")
                params.append(body.next_action_date or None)
            if not set_cols:
                raise HTTPException(status_code=400, detail="No fields to update")
            params.extend([id, user_id])
            cur.execute(
                f"UPDATE job_applications SET {', '.join(set_cols)}, updated_at = now() WHERE id = %s AND user_id = %s RETURNING *",
                params,
            )
            r = cur.fetchone()
            if not r:
                raise HTTPException(status_code=404, detail="Not found")
            return JobOut(
                id=r["id"], company=r["company"], title=r["title"], location=r["location"], source=r["source"],
                url=r["url"], status=r["status"], notes=r["notes"], jd_text=r["jd_text"],
                next_action_date=str(r["next_action_date"]) if r["next_action_date"] else None,
                created_at=str(r["created_at"]), updated_at=str(r["updated_at"])
            )
    finally:
        _put_conn(conn)


@router.delete("/jobs/{id}")
def delete_job(id: str, user_id: str = Depends(_current_user)):
    _ensure_schema()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM job_applications WHERE id = %s AND user_id = %s", (id, user_id))
            return {"ok": True}
    finally:
        _put_conn(conn)


@router.get("/jobs/stats")
def job_stats(user_id: str = Depends(_current_user)):
    _ensure_schema()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT status, COUNT(*) FROM job_applications WHERE user_id = %s GROUP BY status", (user_id,))
            counts = {row[0]: int(row[1]) for row in (cur.fetchall() or [])}
            return {"counts": counts}
    finally:
        _put_conn(conn)
