"""
ApplyEase Desktop Application
Single-file FastAPI backend with SQLite database
Serves both API and static frontend files
"""

import os
import sys
import uuid
import json
import re
import webbrowser
import threading
from pathlib import Path
from typing import Optional, List
from io import BytesIO

# Add the directory to path for imports
if getattr(sys, 'frozen', False):
    # Running as compiled
    BASE_DIR = Path(sys._MEIPASS)
else:
    # Running as script
    BASE_DIR = Path(__file__).parent

# Load .env file if it exists (for development)
env_file = BASE_DIR / '.env'
if env_file.exists():
    try:
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip())
    except Exception:
        pass

# Set defaults for production (standalone exe)
os.environ.setdefault('LLM_PROVIDER', 'ollama')
os.environ.setdefault('OLLAMA_HOST', 'http://localhost:11434')
os.environ.setdefault('LLM_MODEL', 'qwen2.5:7b')

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import numpy as np
import bcrypt
import jwt
from datetime import datetime, timedelta

# Import our SQLite database module
import database as db

# Lazy load heavy dependencies
_model = None
_model_lock = threading.Lock()

def get_embedding_model():
    """Lazy load the sentence transformer model"""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from sentence_transformers import SentenceTransformer
                _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def embed_text(text: str) -> np.ndarray:
    """Generate embedding for text"""
    model = get_embedding_model()
    return np.asarray(model.encode(text), dtype=np.float32)


def normalize_embedding(vec: np.ndarray) -> np.ndarray:
    """L2 normalize embedding for cosine similarity"""
    v = vec.astype(np.float32, copy=True)
    norm = float(np.linalg.norm(v))
    if norm == 0.0:
        return v
    return v / norm


# ============ App Setup ============

app = FastAPI(
    title="ApplyEase Desktop",
    description="Local, Privacy-First Job Application Assistant",
    version="2.0.0"
)

# CORS for extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

security = HTTPBearer(auto_error=True)

# JWT Configuration
JWT_KEY = os.environ.get('JWT_KEY', 'applyease-desktop-local-key-' + str(uuid.uuid4())[:8])
JWT_EXPIRES_MIN = int(os.environ.get('JWT_EXPIRES_IN_MIN', '1440'))  # 24 hours default


# ============ Auth Helpers ============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except:
        return False


def create_token(user_id: str, email: str) -> str:
    payload = {
        "_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRES_MIN),
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, JWT_KEY, algorithm="HS256")


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)) -> str:
    payload = verify_token(creds.credentials)
    return payload["_id"]


# ============ Keyword Extraction ============

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

TECH_TERMS = {
    "python", "java", "javascript", "typescript", "go", "golang", "ruby", "rust", "scala", "kotlin",
    "node", "nodejs", "express", "django", "flask", "fastapi", "spring", "react", "vue", "angular",
    "aws", "azure", "gcp", "kubernetes", "k8s", "docker", "terraform", "ansible",
    "postgres", "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "kafka",
    "pandas", "numpy", "pytorch", "tensorflow", "spark", "airflow",
    "git", "github", "gitlab", "jenkins", "cicd", "devops",
    "graphql", "rest", "grpc", "microservices", "api"
}

STOP_WORDS = ENGLISH_STOP_WORDS.union({
    "experience", "work", "company", "role", "team", "developer", "engineer",
    "looking", "opportunity", "position", "candidate", "requirements"
})


def extract_keywords(text: str) -> List[str]:
    """Extract technical keywords from text"""
    if not text:
        return []
    tokens = re.findall(r'[a-zA-Z0-9][a-zA-Z0-9+.#\-]*', text.lower())
    keywords = set()
    for t in tokens:
        t = t.strip(".,;:!?")
        if t in TECH_TERMS or (len(t) > 2 and t not in STOP_WORDS and t.isalpha()):
            if t in TECH_TERMS:
                keywords.add(t)
    return sorted(keywords)


def match_keywords(resume_text: str, jd_text: str):
    """Find matching and missing keywords"""
    resume_kw = set(extract_keywords(resume_text))
    jd_kw = set(extract_keywords(jd_text))
    matching = sorted(resume_kw & jd_kw)[:50]
    missing = sorted(jd_kw - resume_kw)[:50]
    return matching, missing


# ============ API Models ============

class SignupRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str
    phone: Optional[str] = None
    location: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class MatchRequest(BaseModel):
    jobDescription: str


class CustomAnswerRequest(BaseModel):
    jobDescription: str
    applicationQuestion: str


class JobCreate(BaseModel):
    company: str
    title: str
    location: Optional[str] = None
    source: Optional[str] = None
    url: Optional[str] = None
    status: Optional[str] = "saved"
    notes: Optional[str] = None
    jd_text: Optional[str] = None
    next_action_date: Optional[str] = None


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


# ============ Health & Status ============

@app.get("/healthz")
def health_check():
    return {"status": "ok", "version": "2.0.0", "mode": "desktop"}


@app.get("/api/status")
def api_status():
    """Return system status for extension"""
    return {
        "backend": "running",
        "database": str(db.DB_PATH),
        "data_dir": str(db.APP_DATA_DIR)
    }


# ============ Auth Endpoints ============

@app.post("/signup")
def signup(req: SignupRequest):
    # Validate password
    if len(req.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not any(c.isupper() for c in req.password):
        raise HTTPException(400, "Password must contain uppercase letter")
    if not any(c.islower() for c in req.password):
        raise HTTPException(400, "Password must contain lowercase letter")
    if not any(c.isdigit() for c in req.password):
        raise HTTPException(400, "Password must contain a number")
    
    # Check if email exists
    if db.get_user_by_email(req.email):
        raise HTTPException(400, "Email already registered")
    
    user_id = str(uuid.uuid4())
    pw_hash = hash_password(req.password)
    
    user = db.create_user(
        user_id=user_id,
        first_name=req.first_name,
        last_name=req.last_name,
        email=req.email,
        password_hash=pw_hash,
        phone=req.phone,
        location=req.location
    )
    
    token = create_token(user_id, req.email)
    return {"token": token, "user": user}


@app.post("/login")
def login(req: LoginRequest):
    user = db.get_user_by_email(req.email)
    if not user:
        raise HTTPException(400, "User not found")
    if not verify_password(req.password, user['password_hash']):
        raise HTTPException(400, "Invalid credentials")
    
    token = create_token(user['id'], user['email'])
    return {"token": token}


# ============ User Endpoints ============

@app.get("/user")
def get_user(user_id: str = Depends(get_current_user)):
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(404, "User not found")
    # Remove password hash from response
    user.pop('password_hash', None)
    return user


@app.patch("/user")
async def update_user(
    user_id: str = Depends(get_current_user),
    first_name: Optional[str] = Form(None),
    last_name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    urls: Optional[str] = Form(None),
    address_line1: Optional[str] = Form(None),
    address_line2: Optional[str] = Form(None),
    city: Optional[str] = Form(None),
    state: Optional[str] = Form(None),
    country: Optional[str] = Form(None),
    zip_code: Optional[str] = Form(None),
    current_company: Optional[str] = Form(None),
    desired_salary: Optional[str] = Form(None),
    notice_period: Optional[str] = Form(None),
    date_of_birth: Optional[str] = Form(None),
    nationality: Optional[str] = Form(None),
    gender: Optional[str] = Form(None),
    pronouns: Optional[str] = Form(None),
    work_authorization: Optional[str] = Form(None),
    visa_type: Optional[str] = Form(None),
    visa_expiry: Optional[str] = Form(None),
    requires_sponsorship: Optional[str] = Form(None),
    legally_authorized: Optional[str] = Form(None),
    years_of_experience: Optional[str] = Form(None),
    current_salary: Optional[str] = Form(None),
    salary_currency: Optional[str] = Form(None),
    employment_type: Optional[str] = Form(None),
    remote_preference: Optional[str] = Form(None),
    linkedin_url: Optional[str] = Form(None),
    github_url: Optional[str] = Form(None),
    portfolio_url: Optional[str] = Form(None),
    website_url: Optional[str] = Form(None),
    languages: Optional[str] = Form(None),
    disability_status: Optional[str] = Form(None),
    veteran_status: Optional[str] = Form(None),
    emergency_contact_name: Optional[str] = Form(None),
    emergency_contact_phone: Optional[str] = Form(None),
    emergency_contact_relationship: Optional[str] = Form(None),
    resume: Optional[UploadFile] = File(None)
):
    # Build update dict
    fields = {}
    local_vars = locals()
    string_fields = [
        'first_name', 'last_name', 'email', 'phone', 'location',
        'address_line1', 'address_line2', 'city', 'state', 'country', 'zip_code',
        'current_company', 'desired_salary', 'notice_period',
        'date_of_birth', 'nationality', 'gender', 'pronouns',
        'work_authorization', 'visa_type', 'visa_expiry', 'requires_sponsorship', 'legally_authorized',
        'years_of_experience', 'current_salary', 'salary_currency', 'employment_type', 'remote_preference',
        'linkedin_url', 'github_url', 'portfolio_url', 'website_url',
        'disability_status', 'veteran_status',
        'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'
    ]
    
    for field in string_fields:
        val = local_vars.get(field)
        if val is not None:
            fields[field] = val
    
    # Handle JSON fields
    if urls:
        fields['urls'] = json.loads(urls)
    if languages:
        fields['languages'] = json.loads(languages)
    
    if fields:
        db.update_user(user_id, **fields)
    
    # Handle resume upload
    if resume and resume.filename:
        content = await resume.read()
        if content:
            # Parse PDF
            try:
                from pdfminer.high_level import extract_text
                import tempfile
                with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                    tmp.write(content)
                    tmp_path = tmp.name
                resume_text = extract_text(tmp_path)
                os.unlink(tmp_path)
            except Exception as e:
                raise HTTPException(400, f"Failed to parse resume: {e}")
            
            # Generate embedding
            embedding = normalize_embedding(embed_text(resume_text))
            keywords = extract_keywords(resume_text)
            
            db.upsert_resume(
                user_id=user_id,
                resume_text=resume_text,
                embedding=embedding,
                keywords=keywords,
                blob=content,
                mime=resume.content_type or 'application/pdf',
                filename=resume.filename
            )
    
    return {"ok": True}


# ============ Resume Endpoints ============

@app.get("/resume")
def get_resume_text(user_id: str = Depends(get_current_user)):
    resume = db.get_resume(user_id)
    if not resume:
        raise HTTPException(404, "No resume found")
    return {"resume_text": resume['resume_text']}


@app.get("/resume_file")
def get_resume_file(user_id: str = Depends(get_current_user)):
    resume = db.get_resume(user_id)
    if not resume or not resume.get('resume_blob'):
        raise HTTPException(404, "No resume file found")
    
    return StreamingResponse(
        BytesIO(resume['resume_blob']),
        media_type=resume.get('resume_mime', 'application/pdf'),
        headers={"Content-Disposition": f"inline; filename={resume.get('resume_filename', 'resume.pdf')}"}
    )


@app.get("/resume_pdf")
def get_resume_pdf(user_id: str = Depends(get_current_user)):
    resume = db.get_resume(user_id)
    if not resume:
        raise HTTPException(404, "No resume found")
    
    if resume.get('resume_blob'):
        return StreamingResponse(
            BytesIO(resume['resume_blob']),
            media_type='application/pdf',
            headers={"Content-Disposition": "inline; filename=resume.pdf"}
        )
    
    # Generate PDF from text
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    text = resume['resume_text'] or ""
    y = 750
    for line in text.split('\n')[:100]:
        if y < 50:
            c.showPage()
            y = 750
        c.drawString(72, y, line[:90])
        y -= 14
    c.save()
    buffer.seek(0)
    
    return StreamingResponse(
        buffer,
        media_type='application/pdf',
        headers={"Content-Disposition": "inline; filename=resume.pdf"}
    )


# ============ Match Endpoint ============

@app.post("/match")
def compute_match(req: MatchRequest, user_id: str = Depends(get_current_user)):
    if not req.jobDescription:
        raise HTTPException(400, "Job description required")
    
    resume = db.get_resume(user_id)
    if not resume:
        raise HTTPException(404, "No resume found. Please upload your resume first.")
    
    # Compute similarity
    resume_vec = resume['embedding']
    jd_vec = normalize_embedding(embed_text(req.jobDescription))
    score = float(np.dot(resume_vec, jd_vec))
    
    matching, missing = match_keywords(resume['resume_text'], req.jobDescription)
    
    return {
        "score": score,
        "percent": round(score * 100, 2),
        "matchingWords": matching,
        "missingWords": missing
    }


# ============ Custom Answer (LLM) ============

@app.post("/custom-answer")
def generate_custom_answer(req: CustomAnswerRequest, user_id: str = Depends(get_current_user)):
    resume = db.get_resume(user_id)
    resume_text = resume['resume_text'] if resume else ""
    
    provider = os.environ.get('LLM_PROVIDER', 'ollama')
    ollama_host = os.environ.get('OLLAMA_HOST', 'http://localhost:11434')
    model = os.environ.get('LLM_MODEL', 'qwen2.5:7b')
    
    prompt = f"""You are an assistant that writes concise, specific answers for job applications.
Resume:
{resume_text}

Job Description:
{req.jobDescription}

Question:
{req.applicationQuestion}

Write a tailored answer (120-180 words), highlight relevant skills, and keep a professional tone. Give only the response."""

    try:
        import requests
        if provider == 'ollama':
            r = requests.post(
                f"{ollama_host.rstrip('/')}/api/chat",
                json={"model": model, "messages": [{"role": "user", "content": prompt}], "stream": False},
                timeout=60
            )
            if r.status_code != 200:
                raise HTTPException(502, f"Ollama error: {r.text}")
            data = r.json()
            content = data.get('message', {}).get('content') or data.get('response', '')
            return {"answer": content}
        else:
            raise HTTPException(400, "Only Ollama provider is supported in desktop mode")
    except requests.exceptions.ConnectionError:
        raise HTTPException(503, "Cannot connect to Ollama. Make sure Ollama is running.")
    except Exception as e:
        raise HTTPException(502, f"LLM error: {e}")


# ============ Job Tracker Endpoints ============

@app.get("/jobs")
def list_jobs(user_id: str = Depends(get_current_user)):
    return db.list_jobs(user_id)


@app.post("/jobs")
def create_job(body: JobCreate, user_id: str = Depends(get_current_user)):
    job_id = str(uuid.uuid4())
    return db.create_job(
        job_id=job_id,
        user_id=user_id,
        company=body.company,
        title=body.title,
        location=body.location,
        source=body.source,
        url=body.url,
        status=body.status or 'saved',
        notes=body.notes,
        jd_text=body.jd_text,
        next_action_date=body.next_action_date
    )


@app.patch("/jobs/{job_id}")
def update_job(job_id: str, body: JobUpdate, user_id: str = Depends(get_current_user)):
    fields = {k: v for k, v in body.dict().items() if v is not None}
    job = db.update_job(job_id, user_id, **fields)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str, user_id: str = Depends(get_current_user)):
    db.delete_job(job_id, user_id)
    return {"ok": True}


@app.get("/jobs/stats")
def job_stats(user_id: str = Depends(get_current_user)):
    return {"counts": db.get_job_stats(user_id)}


# ============ Serve Frontend ============

# Check for built frontend
FRONTEND_DIR = BASE_DIR / "frontend_build"
if not FRONTEND_DIR.exists():
    FRONTEND_DIR = BASE_DIR.parent / "frontend" / "build"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR / "static")), name="static")
    
    @app.get("/", response_class=HTMLResponse)
    @app.get("/{path:path}", response_class=HTMLResponse)
    async def serve_frontend(request: Request, path: str = ""):
        # API routes are handled above, this catches frontend routes
        if path.startswith("api/") or path in ["healthz", "signup", "login", "user", "resume", "match", "jobs", "custom-answer"]:
            raise HTTPException(404)
        
        index_file = FRONTEND_DIR / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
        raise HTTPException(404, "Frontend not found")


# ============ Main Entry Point ============

def open_browser():
    """Open browser after short delay"""
    import time
    time.sleep(1.5)
    webbrowser.open("http://127.0.0.1:8000")


def main():
    """Main entry point for desktop app"""
    import uvicorn
    
    print("=" * 50)
    print("  ApplyEase Desktop v2.0.0")
    print("=" * 50)
    print(f"  Data directory: {db.APP_DATA_DIR}")
    print(f"  Database: {db.DB_PATH}")
    print("  Starting server on http://127.0.0.1:8000")
    print("=" * 50)
    
    # Open browser in background thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Run server
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
