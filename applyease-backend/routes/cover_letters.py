from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import os
import jwt
import psycopg2
import psycopg2.extras
from psycopg2.pool import SimpleConnectionPool
from threading import Lock
import uuid


router = APIRouter()
security = HTTPBearer(auto_error=True)


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
                CREATE TABLE IF NOT EXISTS cover_letters (
                    id text PRIMARY KEY,
                    user_id text NOT NULL,
                    job_id text,
                    company text,
                    title text,
                    letter_text text NOT NULL,
                    letter_blob bytea,
                    letter_mime text,
                    filename text,
                    created_at timestamptz NOT NULL DEFAULT now()
                );
                """
            )
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


def _render_text_to_pdf_stream(text: str, filename: str = "cover_letter.pdf"):
    from io import BytesIO
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter
    margin_x = 72
    margin_top = 72
    margin_bottom = 72
    def new_textobject():
        t = c.beginText(margin_x, height - margin_top)
        t.setLeading(14)
        return t
    t = new_textobject()
    text = str(text or "")
    for line in text.splitlines() or [""]:
        if t.getY() <= margin_bottom:
            c.drawText(t)
            c.showPage()
            t = new_textobject()
        t.textLine(line)
    c.drawText(t)
    c.showPage()
    c.save()
    buffer.seek(0)
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return buffer, headers


class GenerateCoverBody(BaseModel):
    company: Optional[str] = None
    title: Optional[str] = None
    job_id: Optional[str] = None
    job_url: Optional[str] = None
    job_description: Optional[str] = None
    filename: Optional[str] = None
    save: Optional[bool] = True
    use_llm: Optional[bool] = True


def _get_user_and_sections(user_id: str):
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT first_name, last_name, email, phone, location, urls FROM users WHERE id = %s", (user_id,))
            u = cur.fetchone()
            cur.execute("SELECT summary, experiences, skills FROM resumes WHERE user_id = %s", (user_id,))
            s = cur.fetchone()
            return u, s
    finally:
        _put_conn(conn)


def _format_cover_letter(user_row, sections_row, body: GenerateCoverBody) -> str:
    first, last, email, phone, location, urls = (user_row or ["", "", "", "", "", []])
    summary = (sections_row[0] if sections_row else "") or ""
    experiences = (sections_row[1] if sections_row else []) or []
    skills = (sections_row[2] if sections_row else []) or []
    company = body.company or "Hiring Manager"
    title = body.title or ""
    url_line = f"Job: {body.job_url}\n" if body.job_url else ""
    intro = f"Dear {company} Team,\n\n"
    intro += f"I’m excited to apply for the {title} role. " if title else "I’m excited to apply. "
    if summary:
        intro += summary.strip() + "\n\n"
    core = ""
    for e in (experiences[:3] or []):
        line = " - " + " at ".join(filter(None, [e.get("title"), e.get("company")]))
        bl = e.get("bullets") or []
        metric = (bl[0] if bl else "").strip()
        if metric:
            line += f": {metric}"
        core += line + "\n"
    if skills:
        core += "\nKey skills: " + ", ".join(skills[:12]) + "\n"
    close = "\nThank you for your time and consideration. I would welcome the opportunity to discuss how I can contribute.\n\n"
    sig = f"{first} {last}\n{email} | {phone} | {location}\n"
    if urls:
        try:
            urls_line = " | ".join([f"{u['type']}: {u['url']}" if isinstance(u, dict) else str(u) for u in urls])
            sig += urls_line
        except Exception:
            pass
    return (url_line + intro + core + close + sig).strip()


def _llm_complete(prompt: str) -> str:
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()
    ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    base_url = os.getenv("LLM_BASE_URL", "http://localhost:1234/v1")
    model = os.getenv("LLM_MODEL")
    timeout_s = int(os.getenv("LLM_TIMEOUT_SECONDS", "45"))
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
                    "options": {"temperature": 0.4, "num_ctx": 8192},
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
                return ""
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
            return ""
    except Exception:
        return ""


@router.post("/cover_letters/generate")
def generate_cover_letter(body: GenerateCoverBody, user_id: str = Depends(_current_user)):
    _ensure_schema()
    u, s = _get_user_and_sections(user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    # Try LLM-enhanced generation if requested and job description present
    text = ""
    if body.use_llm and (body.job_description or "").strip():
        first, last, email, phone, location, urls = (u or ["", "", "", "", "", []])
        summary = (s[0] if s else "") or ""
        experiences = (s[1] if s else []) or []
        skills = (s[2] if s else []) or []
        # Build a compact profile context
        ex_lines = []
        for e in experiences[:5]:
            h = " - ".join([x for x in [e.get("title"), e.get("company")] if x])
            b = (e.get("bullets") or [""])[0]
            ex_lines.append(f"{h}: {b}")
        profile = (
            f"Name: {first} {last}\nEmail: {email}\nPhone: {phone}\nLocation: {location}\n"
            f"Title: {(s and s[0]) or ''}\nSummary: {summary}\nSkills: {', '.join(skills[:20])}\nExperience bullets:\n- "
            + "\n- ".join(ex_lines)
        )
        prompt = (
            "Write a concise, professional cover letter (180-250 words).\n"
            "Personalize to the company and role using the job description.\n"
            "Focus on impact, relevant skills, and 1-2 quantifiable achievements.\n"
            "Use first person, active voice, and avoid generic fluff.\n"
            "Return ONLY the letter text without any extra labels.\n\n"
            f"Company: {body.company or ''}\nRole: {body.title or ''}\nJob Description:\n{body.job_description}\n\n"
            f"Candidate Profile:\n{profile}\n"
        )
        llm_text = _llm_complete(prompt).strip()
        if llm_text:
            text = llm_text
    if not text:
        text = _format_cover_letter(u, s, body)
    filename = (body.filename or "cover_letter.pdf").replace("\n", " ")
    buffer, headers = _render_text_to_pdf_stream(text, filename=filename)
    if body.save:
        pdf_bytes = buffer.getvalue()
        conn = _conn()
        try:
            with conn.cursor() as cur:
                cid = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO cover_letters (id, user_id, job_id, company, title, letter_text, letter_blob, letter_mime, filename)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (cid, user_id, body.job_id, body.company, body.title, text, psycopg2.Binary(pdf_bytes), "application/pdf", filename),
                )
        finally:
            _put_conn(conn)
    return StreamingResponse(buffer, media_type="application/pdf", headers=headers)


@router.get("/cover_letters")
def list_cover_letters(user_id: str = Depends(_current_user)):
    _ensure_schema()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, company, title, filename, created_at FROM cover_letters WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
            rows = cur.fetchall() or []
            items = [ { "id": r[0], "company": r[1], "title": r[2], "filename": r[3] or "cover_letter.pdf", "created_at": str(r[4]) } for r in rows ]
            return {"items": items}
    finally:
        _put_conn(conn)


@router.get("/cover_letters/download")
def download_cover_letter(id: str, user_id: str = Depends(_current_user)):
    _ensure_schema()
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT letter_blob, letter_mime, filename, letter_text FROM cover_letters WHERE id = %s AND user_id = %s", (id, user_id))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Not found")
            blob, mime, fname, text = row
            if blob:
                from io import BytesIO
                headers = {"Content-Disposition": f"attachment; filename={fname or 'cover_letter.pdf'}"}
                return StreamingResponse(BytesIO(blob), media_type=mime or "application/pdf", headers=headers)
            buffer, headers = _render_text_to_pdf_stream(text or "", filename=fname or "cover_letter.pdf")
            return StreamingResponse(buffer, media_type="application/pdf", headers=headers)
    finally:
        _put_conn(conn)
