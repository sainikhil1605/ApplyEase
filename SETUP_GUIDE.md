# ApplyEase Local Setup Guide (Windows)

## Prerequisites Status
- ✅ Python 3.14.3 - Installed
- ✅ Node.js 24.15.0 - Installed  
- ✅ npm 11.12.1 - Installed
- ✅ Backend Python dependencies - Installed
- ✅ Frontend npm dependencies - Installed
- ✅ Backend .env file - Created
- ❌ PostgreSQL - **Needs installation**
- ❌ Ollama - **Needs installation**

---

## Step 1: Install PostgreSQL with pgvector

### Option A: Using Docker (Recommended - Easiest)
```powershell
# Install Docker Desktop first from https://www.docker.com/products/docker-desktop/
# Then run:
docker run -d --name applyease-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=applyease -p 5432:5432 pgvector/pgvector:pg16
```

### Option B: Native PostgreSQL Installation
1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
2. Run the installer (include pgAdmin)
3. Set password for postgres user
4. After install, add pgvector extension:
   ```powershell
   # Open pgAdmin or psql and run:
   CREATE DATABASE applyease;
   \c applyease
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

---

## Step 2: Install Ollama

1. Download from: https://ollama.com/download/windows
2. Run the installer
3. After installation, open a new terminal and run:
   ```powershell
   ollama pull llama3.1:8b
   ```
   This downloads the recommended model (~4.7GB)

**Alternative smaller models:**
- `ollama pull llama3.2:3b` - Faster, less accurate (~2GB)
- `ollama pull phi3:mini` - Very fast, good for testing (~2.3GB)

---

## Step 3: Set Up Backend (Python FastAPI)

**Already done!** The virtual environment and dependencies are installed.

To activate the backend environment:
```powershell
cd ApplyEase/applyease-backend
.\.venv\Scripts\Activate.ps1
```

### Environment File
**Already created!** See `ApplyEase/applyease-backend/.env`

You can modify it if needed:
- Change `PGPASSWORD` to match your PostgreSQL password
- Change `LLM_MODEL` if using a different Ollama model

### Start Backend
```powershell
cd ApplyEase/applyease-backend
.\.venv\Scripts\Activate.ps1
uvicorn app:app --reload --port 8000
```

---

## Step 4: Set Up Frontend (React)

**Dependencies already installed!**

### Start Frontend
```powershell
cd ApplyEase/frontend
npm start
```

The frontend will be available at http://localhost:3000

---

## Step 5: Load Chrome Extension

1. Open Chrome and go to: `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `ApplyEase` folder (the root folder containing manifest.json)

---

## Quick Start Checklist

1. [ ] PostgreSQL running with `applyease` database
2. [ ] Ollama running with model pulled
3. [ ] Backend running on http://localhost:8000
4. [ ] Frontend running on http://localhost:3000
5. [ ] Chrome extension loaded

---

## Usage

1. Open http://localhost:3000
2. Sign up for an account
3. Upload your resume (PDF)
4. Fill in your profile details
5. Go to any job posting page
6. Click the ApplyEase extension icon
7. Click "Auto Fill" to populate the form

---

## Troubleshooting

### Backend won't start
- Check PostgreSQL is running
- Verify `.env` file has correct database credentials
- Check pgvector extension is installed

### Ollama errors
- Ensure Ollama is running: `ollama serve`
- Check model is downloaded: `ollama list`

### Extension not working
- Check you're logged in at http://localhost:3000
- Verify token in DevTools: `chrome.storage.local.get('token', console.log)`
- Make sure backend is running on port 8000
