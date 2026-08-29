#!/usr/bin/env python3
"""
ApplyEase Portable Release Creator
Creates a portable folder distribution without PyInstaller

This is faster than the full PyInstaller build and creates a folder
that users can simply extract and run.

Usage:
    python create_portable_release.py
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

ROOT_DIR = Path(__file__).parent
BACKEND_DIR = ROOT_DIR / "applyease-backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
RELEASE_DIR = ROOT_DIR / "release" / "ApplyEase-Portable"


def build_frontend():
    """Build React frontend if not already built"""
    print("\n" + "="*60)
    print("  STEP 1: Building React Frontend")
    print("="*60)
    
    frontend_build = FRONTEND_DIR / "build"
    
    if not (FRONTEND_DIR / "package.json").exists():
        print("Frontend not found, skipping...")
        return True
    
    # Check if already built
    if frontend_build.exists() and (frontend_build / "index.html").exists():
        print("Frontend already built, skipping rebuild...")
    else:
        # Install and build
        print("Building frontend...")
        subprocess.run("npm install", cwd=FRONTEND_DIR, shell=True, check=True)
        subprocess.run("npm run build", cwd=FRONTEND_DIR, shell=True, check=True)
    
    # Copy to backend
    dest = BACKEND_DIR / "frontend_build"
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(frontend_build, dest)
    print(f"Frontend copied to {dest}")
    
    return True


def create_portable_release():
    """Create portable release folder"""
    print("\n" + "="*60)
    print("  STEP 2: Creating Portable Release")
    print("="*60)
    
    # Clean and create release dir
    if RELEASE_DIR.exists():
        shutil.rmtree(RELEASE_DIR)
    RELEASE_DIR.mkdir(parents=True)
    
    # Create backend folder
    backend_dest = RELEASE_DIR / "backend"
    backend_dest.mkdir()
    
    # Copy backend Python files
    backend_files = [
        "desktop_app.py",
        "database.py",
        "requirements.txt",
    ]
    
    for f in backend_files:
        src = BACKEND_DIR / f
        if src.exists():
            shutil.copy(src, backend_dest / f)
    
    # Copy frontend build
    frontend_src = BACKEND_DIR / "frontend_build"
    if frontend_src.exists():
        shutil.copytree(frontend_src, backend_dest / "frontend_build")
    
    # Copy extension
    ext_dest = RELEASE_DIR / "chrome-extension"
    ext_dest.mkdir()
    
    ext_files = [
        "manifest.json",
        "background.js", 
        "contentscript.js",
        "popup/popup.html",
        "popup/popup.css",
        "popup/popup.js",
        "popup/icon.png",
        "popup/icon2.png",
        "popup/Loading_2.gif",
    ]
    
    for f in ext_files:
        src = ROOT_DIR / f
        if src.exists():
            dest = ext_dest / f
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dest)
    
    # Create launcher batch file
    launcher = '''@echo off
title ApplyEase Desktop
echo ============================================================
echo   ApplyEase Desktop - Local Job Application Assistant
echo ============================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://python.org
    pause
    exit /b 1
)

:: Check/create venv
if not exist "backend\\.venv" (
    echo Creating Python virtual environment...
    python -m venv backend\\.venv
)

:: Activate venv and install requirements
echo Checking dependencies...
call backend\\.venv\\Scripts\\activate.bat
pip install -q -r backend\\requirements.txt

:: Run the app
echo.
echo Starting ApplyEase...
echo Your browser will open automatically.
echo Press Ctrl+C to stop the server.
echo.
python backend\\desktop_app.py
'''
    
    (RELEASE_DIR / "Start-ApplyEase.bat").write_text(launcher, encoding='utf-8')
    
    # Create README
    readme = '''# ApplyEase Desktop - Portable Edition

## Quick Start

### First Time Setup:

1. **Install Python** (if not already installed)
   - Download from https://python.org
   - Make sure to check "Add Python to PATH" during installation

2. **Install Ollama** (optional, for AI features)
   - Download from https://ollama.ai
   - After install, run: `ollama pull qwen2.5:7b`

### Running ApplyEase:

1. **Double-click `Start-ApplyEase.bat`**
   - First run will install Python dependencies (takes ~2 minutes)
   - Browser opens automatically to http://127.0.0.1:8000

2. **Install Chrome Extension:**
   - Open Chrome > Extensions (chrome://extensions)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

3. **Create Account & Upload Resume**
   - Sign up at http://127.0.0.1:8000
   - Go to Dashboard and upload your PDF resume

4. **Start Applying!**
   - Visit any job posting
   - Click the ApplyEase extension
   - Click "Auto Fill" to fill the application

## Features

✨ Auto-fill job applications
📊 Resume match scoring  
🤖 AI-powered answer generation (requires Ollama)
📋 Job tracker
🔒 100% local - your data never leaves your computer

## Data Location

Your data is stored in: `%APPDATA%\\ApplyEase`
- Database: `applyease.db`
- Resumes: `resumes/`

## Troubleshooting

**Extension can't connect:**
- Make sure ApplyEase is running (Start-ApplyEase.bat)
- Check if http://127.0.0.1:8000 is accessible

**AI features not working:**
- Install Ollama: https://ollama.ai
- Run: `ollama pull qwen2.5:7b`
- Check Ollama is running: `ollama serve`

**Slow first startup:**
- First run downloads ML models (~400MB)
- Subsequent starts are much faster

## Support

GitHub: https://github.com/sainikhil1605/ApplyEase
'''
    
    (RELEASE_DIR / "README.txt").write_text(readme, encoding='utf-8')
    
    print(f"Portable release created at: {RELEASE_DIR}")
    return True


def create_zip():
    """Create ZIP archive"""
    print("\n" + "="*60)
    print("  STEP 3: Creating ZIP Archive")
    print("="*60)
    
    zip_path = ROOT_DIR / "release" / "ApplyEase-Portable-Windows"
    shutil.make_archive(str(zip_path), 'zip', RELEASE_DIR.parent, "ApplyEase-Portable")
    print(f"ZIP created: {zip_path}.zip")
    
    return True


def main():
    print("\n" + "="*60)
    print("  ApplyEase Portable Release Creator")
    print("="*60)
    
    try:
        build_frontend()
        create_portable_release()
        create_zip()
        
        print("\n" + "="*60)
        print("  ✅ PORTABLE RELEASE CREATED!")
        print("="*60)
        print(f"\n  Folder: {RELEASE_DIR}")
        print(f"  ZIP: {ROOT_DIR / 'release' / 'ApplyEase-Portable-Windows.zip'}")
        print("\n  Users need:")
        print("  - Python installed")
        print("  - Double-click Start-ApplyEase.bat to run")
        print()
        
        return 0
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
