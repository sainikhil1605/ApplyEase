"""
SQLite Database Layer for ApplyEase Desktop Release
Replaces PostgreSQL for zero-dependency distribution
"""

import sqlite3
import os
import json
import numpy as np
from pathlib import Path
from threading import Lock
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

# Determine app data directory
def get_app_data_dir() -> Path:
    """Get the application data directory based on OS"""
    if os.name == 'nt':  # Windows
        base = Path(os.environ.get('APPDATA', Path.home() / 'AppData' / 'Roaming'))
    elif os.name == 'posix':
        if 'darwin' in os.sys.platform:  # macOS
            base = Path.home() / 'Library' / 'Application Support'
        else:  # Linux
            base = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local' / 'share'))
    else:
        base = Path.home()
    
    app_dir = base / 'ApplyEase'
    app_dir.mkdir(parents=True, exist_ok=True)
    return app_dir


APP_DATA_DIR = get_app_data_dir()
DB_PATH = APP_DATA_DIR / 'applyease.db'
RESUMES_DIR = APP_DATA_DIR / 'resumes'
RESUMES_DIR.mkdir(parents=True, exist_ok=True)

_db_lock = Lock()


def get_connection() -> sqlite3.Connection:
    """Get a database connection with proper settings"""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def get_db():
    """Context manager for database connections"""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_database():
    """Initialize the database schema"""
    with _db_lock:
        with get_db() as conn:
            cur = conn.cursor()
            
            # Users table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    first_name TEXT NOT NULL,
                    last_name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    phone TEXT,
                    location TEXT,
                    urls TEXT DEFAULT '[]',
                    eeo TEXT DEFAULT '[]',
                    
                    -- Address
                    address_line1 TEXT,
                    address_line2 TEXT,
                    city TEXT,
                    state TEXT,
                    country TEXT,
                    zip_code TEXT,
                    
                    -- Employment
                    current_company TEXT,
                    desired_salary TEXT,
                    notice_period TEXT,
                    relocation TEXT,
                    available_start_date TEXT,
                    work_experience TEXT DEFAULT '[]',
                    education TEXT DEFAULT '[]',
                    skills TEXT DEFAULT '[]',
                    certifications TEXT DEFAULT '[]',
                    custom_answers TEXT DEFAULT '{}',
                    
                    -- Personal
                    date_of_birth TEXT,
                    nationality TEXT,
                    gender TEXT,
                    pronouns TEXT,
                    
                    -- Work Authorization
                    work_authorization TEXT,
                    visa_type TEXT,
                    visa_expiry TEXT,
                    requires_sponsorship TEXT,
                    legally_authorized TEXT,
                    
                    -- Employment Details
                    years_of_experience TEXT,
                    current_salary TEXT,
                    salary_currency TEXT,
                    employment_type TEXT,
                    remote_preference TEXT,
                    
                    -- Screening
                    hear_about_us TEXT,
                    applied_before TEXT,
                    worked_here_before TEXT,
                    has_relatives_here TEXT,
                    
                    -- Links
                    linkedin_url TEXT,
                    github_url TEXT,
                    portfolio_url TEXT,
                    website_url TEXT,
                    
                    -- Background
                    languages TEXT DEFAULT '[]',
                    security_clearance TEXT,
                    willing_to_travel TEXT,
                    has_drivers_license TEXT,
                    has_vehicle TEXT,
                    
                    -- EEO
                    disability_status TEXT,
                    veteran_status TEXT,
                    
                    -- Emergency
                    emergency_contact_name TEXT,
                    emergency_contact_phone TEXT,
                    emergency_contact_relationship TEXT,
                    
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Resumes table (embeddings stored as JSON array)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS resumes (
                    user_id TEXT PRIMARY KEY,
                    resume_text TEXT NOT NULL,
                    embedding TEXT NOT NULL,
                    resume_keywords TEXT NOT NULL,
                    resume_blob BLOB,
                    resume_mime TEXT,
                    resume_filename TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Job applications table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS job_applications (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    company TEXT NOT NULL,
                    title TEXT NOT NULL,
                    location TEXT,
                    source TEXT,
                    url TEXT,
                    status TEXT DEFAULT 'saved',
                    notes TEXT,
                    jd_text TEXT,
                    next_action_date TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Cover letters table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS cover_letters (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    job_id TEXT,
                    company TEXT,
                    title TEXT,
                    letter_text TEXT,
                    letter_blob BLOB,
                    letter_mime TEXT,
                    filename TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Tailored resumes table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tailored_resumes (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    job_description TEXT NOT NULL,
                    resume_text TEXT NOT NULL,
                    resume_blob BLOB,
                    resume_mime TEXT,
                    resume_filename TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create indexes
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_jobs_user ON job_applications(user_id, updated_at DESC)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_cover_user ON cover_letters(user_id)")
            
            conn.commit()
            print(f"Database initialized at: {DB_PATH}")


# ============ Helper Functions ============

def json_dumps(obj) -> str:
    """Safely serialize to JSON string"""
    if obj is None:
        return '[]' if isinstance(obj, list) else '{}'
    return json.dumps(obj)


def json_loads(s: str, default=None):
    """Safely parse JSON string"""
    if not s:
        return default if default is not None else []
    try:
        return json.loads(s)
    except:
        return default if default is not None else []


def embedding_to_json(embedding: np.ndarray) -> str:
    """Convert numpy embedding to JSON string"""
    return json.dumps(embedding.tolist())


def json_to_embedding(s: str) -> np.ndarray:
    """Convert JSON string to numpy embedding"""
    return np.array(json.loads(s), dtype=np.float32)


# ============ User Operations ============

def create_user(user_id: str, first_name: str, last_name: str, email: str, 
                password_hash: str, phone: str = None, location: str = None,
                urls: list = None, eeo: list = None) -> Dict[str, Any]:
    """Create a new user"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO users (id, first_name, last_name, email, password_hash, phone, location, urls, eeo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, first_name, last_name, email.lower(), password_hash, 
              phone, location, json_dumps(urls or []), json_dumps(eeo or [])))
        
        return get_user_by_id(user_id)


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """Get user by email"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE email = ?", (email.lower(),))
        row = cur.fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user by ID"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        user = dict(row)
        # Parse JSON fields
        for field in ['urls', 'eeo', 'work_experience', 'education', 'skills', 
                      'certifications', 'custom_answers', 'languages']:
            if user.get(field):
                user[field] = json_loads(user[field], [] if field != 'custom_answers' else {})
        return user


def update_user(user_id: str, **fields) -> bool:
    """Update user fields"""
    if not fields:
        return False
    
    # JSON fields that need serialization
    json_fields = ['urls', 'eeo', 'work_experience', 'education', 'skills', 
                   'certifications', 'custom_answers', 'languages']
    
    set_parts = []
    values = []
    for key, value in fields.items():
        if value is not None:
            set_parts.append(f"{key} = ?")
            if key in json_fields:
                values.append(json_dumps(value))
            else:
                values.append(value)
    
    if not set_parts:
        return False
    
    set_parts.append("updated_at = CURRENT_TIMESTAMP")
    values.append(user_id)
    
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"UPDATE users SET {', '.join(set_parts)} WHERE id = ?", values)
        return cur.rowcount > 0


# ============ Resume Operations ============

def upsert_resume(user_id: str, resume_text: str, embedding: np.ndarray, 
                  keywords: List[str], blob: bytes = None, mime: str = None, 
                  filename: str = None) -> bool:
    """Insert or update resume"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO resumes (user_id, resume_text, embedding, resume_keywords, 
                                resume_blob, resume_mime, resume_filename, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                resume_text = excluded.resume_text,
                embedding = excluded.embedding,
                resume_keywords = excluded.resume_keywords,
                resume_blob = excluded.resume_blob,
                resume_mime = excluded.resume_mime,
                resume_filename = excluded.resume_filename,
                updated_at = CURRENT_TIMESTAMP
        """, (user_id, resume_text, embedding_to_json(embedding), 
              json_dumps(keywords), blob, mime, filename))
        return True


def get_resume(user_id: str) -> Optional[Dict[str, Any]]:
    """Get resume for user"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM resumes WHERE user_id = ?", (user_id,))
        row = cur.fetchone()
        if not row:
            return None
        resume = dict(row)
        resume['embedding'] = json_to_embedding(resume['embedding'])
        resume['resume_keywords'] = json_loads(resume['resume_keywords'], [])
        return resume


# ============ Job Operations ============

def create_job(job_id: str, user_id: str, company: str, title: str, 
               location: str = None, source: str = None, url: str = None,
               status: str = 'saved', notes: str = None, jd_text: str = None,
               next_action_date: str = None) -> Dict[str, Any]:
    """Create a job application"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO job_applications 
            (id, user_id, company, title, location, source, url, status, notes, jd_text, next_action_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (job_id, user_id, company, title, location, source, url, status, notes, jd_text, next_action_date))
        return get_job(job_id, user_id)


def get_job(job_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Get a single job"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM job_applications WHERE id = ? AND user_id = ?", (job_id, user_id))
        row = cur.fetchone()
        return dict(row) if row else None


def list_jobs(user_id: str) -> List[Dict[str, Any]]:
    """List all jobs for user"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM job_applications 
            WHERE user_id = ? 
            ORDER BY updated_at DESC
        """, (user_id,))
        return [dict(row) for row in cur.fetchall()]


def update_job(job_id: str, user_id: str, **fields) -> Optional[Dict[str, Any]]:
    """Update a job"""
    if not fields:
        return None
    
    set_parts = [f"{k} = ?" for k in fields.keys()]
    set_parts.append("updated_at = CURRENT_TIMESTAMP")
    values = list(fields.values()) + [job_id, user_id]
    
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(f"""
            UPDATE job_applications 
            SET {', '.join(set_parts)} 
            WHERE id = ? AND user_id = ?
        """, values)
        if cur.rowcount > 0:
            return get_job(job_id, user_id)
        return None


def delete_job(job_id: str, user_id: str) -> bool:
    """Delete a job"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM job_applications WHERE id = ? AND user_id = ?", (job_id, user_id))
        return cur.rowcount > 0


def get_job_stats(user_id: str) -> Dict[str, int]:
    """Get job statistics"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT status, COUNT(*) as count 
            FROM job_applications 
            WHERE user_id = ? 
            GROUP BY status
        """, (user_id,))
        return {row['status']: row['count'] for row in cur.fetchall()}


# ============ Cover Letter Operations ============

def create_cover_letter(letter_id: str, user_id: str, company: str = None,
                        title: str = None, letter_text: str = None,
                        letter_blob: bytes = None, letter_mime: str = None,
                        filename: str = None, job_id: str = None) -> Dict[str, Any]:
    """Create a cover letter"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO cover_letters 
            (id, user_id, job_id, company, title, letter_text, letter_blob, letter_mime, filename)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (letter_id, user_id, job_id, company, title, letter_text, letter_blob, letter_mime, filename))
        return get_cover_letter(letter_id, user_id)


def get_cover_letter(letter_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Get a cover letter"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM cover_letters WHERE id = ? AND user_id = ?", (letter_id, user_id))
        row = cur.fetchone()
        return dict(row) if row else None


def list_cover_letters(user_id: str) -> List[Dict[str, Any]]:
    """List all cover letters for user"""
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, user_id, job_id, company, title, filename, created_at 
            FROM cover_letters 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        """, (user_id,))
        return [dict(row) for row in cur.fetchall()]


# Initialize on import
init_database()
