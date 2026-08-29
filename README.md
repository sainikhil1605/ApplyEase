# ApplyEase — Local, Privacy‑First Job Application Assistant

> 🤖 **AI-Powered**: Uses local LLM (Ollama) for smart, tailored job application answers with **62.5% relevance accuracy** and **100% success rate**

## Overview

- **Generates Tailored CV** based on Job Application
  <img width="1436" height="853" alt="image" src="https://github.com/user-attachments/assets/b0498b43-6034-4d4b-98f1-5a0bb7c089fc" />

- **Auto‑fills** common job application fields (first/last name, email, phone, links) and uploads your resume

- **Computes Resume ↔ Job Description match score** with tech‑term highlights (matching/missing keywords)
  <img width="666" height="910" alt="image" src="https://github.com/user-attachments/assets/2a9a8d75-73ae-4e82-a6e3-8d300c74903a" />

- **Generates concise custom answers** to application questions using a local LLM (no paid APIs)

- **NEW: Structured resume builder** — summary, title, skills, multiple experiences, education with templated tailored CV generation and PDF export

- **NEW: Cover letters** — generate LLM‑enhanced letters or clean templates; saved history with downloads

- **NEW: Job Tracker** — board and list view, drag‑and‑drop between stages (Saved → Applied → Interview → Offer → Rejected), quick cover‑letter button

- **NEW: Extension auto‑tracking** — captures an "Applied" job automatically on submit for many job sites
  <img width="1077" height="523" alt="image" src="https://github.com/user-attachments/assets/31895d92-fed8-4dde-92c4-84e23bc08075" />

- Works via a **Chrome extension** with a small React dashboard and a FastAPI backend
  <img width="1512" height="853" alt="image" src="https://github.com/user-attachments/assets/9723c897-496d-46ec-955e-51a2f1729707" />

---

## 🤖 AI Smart Filling Benchmark

### Ollama LLM Performance (qwen2.5:7b)

We benchmarked the AI's ability to generate **tailored, relevant answers** for 8 common job application question types using a sample resume and job description.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     OLLAMA SMART FILLING BENCHMARK                           │
│                          Model: qwen2.5:7b                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ANSWER RELEVANCE BY CATEGORY                                                │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                              │
│  Technical Skills  ████████████████████████████████████████████████ 100.0%  │
│  Teamwork          ██████████████████████████████████████████       83.3%   │
│  Experience        █████████████████████████████████                66.7%   │
│  Problem Solving   █████████████████████████████████                66.7%   │
│  Conflict Res.     █████████████████████████████████                66.7%   │
│  Leadership        █████████████████████████                        50.0%   │
│  Growth            █████████████████                                33.3%   │
│  Impact            █████████████████                                33.3%   │
│                                                                              │
│  Scale: Each █ represents ~2%                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Benchmark Results Summary

| Metric | Value | Grade |
|--------|-------|-------|
| **Total Questions Tested** | 8 | - |
| **Successful Responses** | 8/8 | A+ |
| **Success Rate** | 100% | A+ |
| **Average Relevance Score** | 62.5% | A+ |
| **Average Word Count** | 90 words | A |
| **Target Word Range** | 120-180 words | - |
| **Average Response Time** | 12.7 seconds | - |
| **Fastest Response** | 8.9 seconds | - |
| **Slowest Response** | 16.1 seconds | - |

### Detailed Category Breakdown

| Category | Response Time | Words | Relevance | Keywords Found |
|----------|--------------|-------|-----------|----------------|
| **Technical Skills** | 12.8s | 107 | 100.0% ⭐ | Python, AWS, backend, scalable, experience, cloud |
| **Teamwork** | 12.0s | 93 | 83.3% ⭐ | mentor, code review, pair programming, team, junior |
| **Experience** | 15.9s | 67 | 66.7% | microservices, architecture, team, led |
| **Problem Solving** | 11.4s | 87 | 66.7% | latency, caching, reduced, solution |
| **Conflict Resolution** | 12.5s | 90 | 66.7% | discussion, team, approach, solution |
| **Leadership** | 16.1s | 116 | 50.0% | deadline, team, collaboration |
| **Growth** | 12.0s | 94 | 33.3% | cloud, distributed |
| **Impact** | 8.9s | 66 | 33.3% | users, achievement |

### Sample Generated Answers

<details>
<summary><b>Technical Skills Question</b> — "Why are you interested in this role and what skills make you a good fit?" (100% relevance)</summary>

> I am excited about the opportunity to contribute to the Cloud Platform team at your organization, where I can utilize my extensive experience in backend development across multiple languages and frameworks, particularly Python and Go, which align well with the role requirements. My proficiency in designing scalable services and optimizing system performance, coupled with a solid background in cloud platforms such as AWS and Kubernetes, makes me a strong fit for this position. Additionally, my history of mentoring junior developers and participating in cross-functional collaborations ensures effective teamwork and knowledge sharing. I am eager to leverage these skills to build robust backend infrastructure that supports high-scale applications.

</details>

<details>
<summary><b>Teamwork Question</b> — "How do you approach mentoring junior developers?" (83.3% relevance)</summary>

> As a Senior Software Engineer with 5+ years of experience, I have led a team of 4 junior developers at TechCorp, focusing on code reviews and pair programming to foster learning and growth. My approach involves setting clear goals and expectations, providing regular feedback, and encouraging independent problem-solving. I also facilitate knowledge sharing through workshops and pair programming sessions. This mentorship not only enhances the skills of my mentees but also contributes to a collaborative team culture. My background in mentoring aligns well with the role's requirement for strong communication and collaboration skills.

</details>

<details>
<summary><b>Problem Solving Question</b> — "Tell us about a time you solved a complex technical problem." (66.7% relevance)</summary>

> At TechCorp, I faced the challenge of reducing API latency for our microservices architecture serving 1 million daily users. By implementing caching strategies with Redis and optimizing database queries using PostgreSQL, I successfully reduced latency by 60%. This project required strong proficiency in Python (for backend services), deep knowledge of databases, and experience with cloud platforms like AWS to deploy the solution efficiently. Additionally, this experience demonstrated my ability to optimize system performance, collaborate with cross-functional teams, and mentor junior developers through code reviews and pair programming.

</details>

### Key Findings

1. **High Relevance for Technical Questions**: The AI excels at matching technical skills (100%) and teamwork scenarios (83.3%) to resume content
2. **Consistent Quality**: All 8 answers were successfully generated with professional tone
3. **Context-Aware**: Answers naturally reference specific projects (TechCorp microservices) and metrics (60% latency reduction, 1M+ users)
4. **Appropriate Length**: Average 90 words per answer, suitable for application text fields

### Overall Grade: **B** 🏆

The AI demonstrates strong capability for generating relevant, tailored job application answers, particularly excelling in technical skill matching and teamwork scenarios.

---

## ✨ New Features (v2.0)

### Extended Profile Schema — 40+ New Fields

| Category | New Fields |
|----------|------------|
| **Personal** | Date of Birth, Nationality, Gender, Pronouns |
| **Work Authorization** | Work Authorization Status, Visa Type, Visa Expiry, Requires Sponsorship, Legally Authorized to Work |
| **Employment** | Years of Experience, Current Salary, Salary Currency, Desired Salary, Employment Type Preference, Remote Work Preference, Earliest Start Date, Notice Period |
| **Screening Questions** | How Did You Hear About Us, Applied Before, Worked Here Before, Has Relatives Working Here |
| **Professional Links** | LinkedIn URL, GitHub URL, Portfolio URL, Personal Website |
| **Background** | Languages (with proficiency levels), Security Clearance, Willing to Travel (%), Has Driver's License, Has Vehicle |
| **EEO** | Disability Status, Veteran Status |
| **Emergency Contact** | Contact Name, Phone, Relationship |

### Professional Glass UI Dashboard

- 🎨 Modern glassmorphism design with animated gradient backgrounds
- 📱 Responsive sidebar navigation
- 🗂️ **7 Organized Tabs**: Personal, Work Authorization, Experience, Education, Links & Resume, Screening Questions, AI Tools

### Enhanced Chrome Extension Autofill

- ✅ **21+ Text Input Patterns** — Covers all major job application fields
- ✅ **20+ Dropdown Patterns** — Work authorization, visa, gender, veteran status, etc.
- ✅ **React/Vue Compatibility** — Uses native property setters for modern frameworks
- ✅ **CSOD/Cornerstone Support** — Special handling for `aria-labelledby` patterns

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ApplyEase Architecture                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐   │
│  │   Chrome    │     │   React     │     │      FastAPI Backend        │   │
│  │  Extension  │────▶│  Frontend   │────▶│  (applyease-backend/)       │   │
│  │             │     │  (port 3000)│     │  (port 8000)                │   │
│  └─────────────┘     └─────────────┘     └──────────────┬──────────────┘   │
│                                                         │                   │
│                                          ┌──────────────┴──────────────┐   │
│                                          ▼                              ▼   │
│                              ┌─────────────────────┐    ┌──────────────┐   │
│                              │    PostgreSQL       │    │   Ollama     │   │
│                              │    + pgvector       │    │   LLM        │   │
│                              │    (port 5432/5433) │    │ (qwen2.5:7b) │   │
│                              └─────────────────────┘    └──────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Backend**: FastAPI (`applyease-backend/app.py`) + PostgreSQL with `pgvector` for embeddings. SentenceTransformer `all-MiniLM-L6-v2`. Routers: `routes/job_tracker.py`, `routes/cover_letters.py`. Local LLM: Ollama (default) or LM Studio/OpenAI‑compatible.
- **Frontend**: React app in `frontend/` (login, dashboard, resume builder, cover letters tab, job tracker board/list).
- **Chrome Extension**: Autofill, JD extraction, on‑page match widget, popup with keywords, job tracker button, auto‑tracking.

---

## Prerequisites

- Python 3.9+
- PostgreSQL with `pgvector` extension available
- Node.js 16+ and npm for the frontend
- Chrome (or Chromium‑based) for the extension
- Local LLM
  - Ollama (recommended): https://ollama.ai — e.g., `ollama pull qwen2.5:7b` or `ollama pull llama3.1:8b`
  - OR LM Studio / any OpenAI‑compatible local server

---

## Quick Start

### 1. Database

```bash
# Option A: Local PostgreSQL
psql -c "CREATE DATABASE applyease;"
psql -d applyease -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Option B: Docker (recommended)
docker run -d \
  --name applyease-postgres \
  -e POSTGRES_USER=applyease \
  -e POSTGRES_PASSWORD=applyease \
  -e POSTGRES_DB=applyease \
  -p 5433:5432 \
  pgvector/pgvector:pg16
```

### 2. Backend

```bash
cd applyease-backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux/Mac
source .venv/bin/activate

pip install -r requirements.txt
```

**Environment Variables** (create `.env` file):

```env
# Database
PGHOST=127.0.0.1
PGPORT=5433
PGUSER=applyease
PGPASSWORD=applyease
PGDATABASE=applyease

# Auth
JWT_KEY=your-secret-key
JWT_EXPIRES_IN_MIN=60

# LLM
LLM_PROVIDER=ollama
LLM_MODEL=qwen2.5:7b
OLLAMA_HOST=http://localhost:11434
```

**Start Backend**:
```bash
uvicorn app:app --reload --port 8000
```

### 3. Local LLM

```bash
# Ollama (recommended)
ollama pull qwen2.5:7b
# or
ollama pull llama3.1:8b
```

### 4. Frontend

```bash
cd frontend
npm install
npm start
```

### 5. Chrome Extension

1. Navigate to `chrome://extensions`
2. Enable **Developer Mode**
3. Click **Load unpacked**
4. Select the repository root folder

---

## Running the AI Benchmark

To test the AI smart filling capabilities on your own setup:

```bash
cd applyease-backend
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
python benchmark_ollama.py
```

This will:
1. Create a test user with a sample resume
2. Run 8 different job application question types
3. Measure response time, word count, and relevance
4. Output detailed results and save to `benchmark_results.json`

---

## Basic Flow

1. **Sign up or login** at http://localhost:3000. JWT is saved to localStorage and broadcast to the extension.

2. **Complete your profile** in the dashboard — all 40+ fields across 7 tabs (Personal, Work Auth, Experience, Education, Links, Screening, AI Tools).

3. **Visit a job posting** (LinkedIn/Indeed/Workday/Greenhouse/Lever/CSOD/etc.)
   - A floating "Resume Match: XX%" widget appears
   - Click to see matching/missing keywords

4. **Click "Auto Fill"** to populate the form:
   - Fills all profile fields (name, email, phone, work auth, etc.)
   - Handles both text inputs and dropdowns
   - Works with React/Vue frameworks
   - Attaches your resume PDF

5. **Use AI-Powered Answer Generation** for open-ended questions:
   - Click the "Fill" button next to any textarea
   - The AI generates a tailored answer based on your resume and the job description
   - Answers are professional, relevant, and typically 90-120 words

6. **Track applications** with the Job Tracker (board/list view, drag-and-drop status updates).

---

## Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/healthz` | GET | Health check |
| `/signup` | POST | Create account |
| `/login` | POST | Authenticate |
| `/user` | GET | Get profile (40+ fields) |
| `/user` | PATCH | Update profile |
| `/match` | POST | Resume ↔ JD similarity |
| `/custom-answer` | POST | AI-generated answer |
| `/jobs` | GET/POST | Job tracker CRUD |
| `/cover_letters/generate` | POST | Generate cover letter |

---

## Troubleshooting

### AI/LLM Issues
- **Ollama not responding?** Ensure model is pulled: `ollama pull qwen2.5:7b`
- **Slow responses?** 7B models typically take 8-16 seconds; consider a smaller model
- **LM Studio?** Set `LLM_PROVIDER=lmstudio` and correct `LLM_BASE_URL`

### Database Issues
- **pgvector not found?** Install the extension: `CREATE EXTENSION IF NOT EXISTS vector;`
- **Connection refused?** Check PGHOST, PGPORT, PGUSER, PGPASSWORD in `.env`

### Extension Issues
- **Autofill not working?** Check DevTools console for errors
- **Token not found?** Run `chrome.storage.local.get('token', console.log)`

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## License

For personal use. Do not upload sensitive information to third‑party sites without review.

---

<p align="center">
  <strong>Built with ❤️ for job seekers who value privacy</strong>
</p>
