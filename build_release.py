#!/usr/bin/env python3
"""
ApplyEase Release Builder
Creates distributable .exe for Windows

Usage:
    python build_release.py

This will:
1. Build the React frontend
2. Package everything with PyInstaller
3. Create ApplyEase.exe in the dist folder
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path

# Paths
ROOT_DIR = Path(__file__).parent
BACKEND_DIR = ROOT_DIR / "applyease-backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"


def run_command(cmd, cwd=None, shell=True):
    """Run a command and print output"""
    print(f"\n{'='*50}")
    print(f"Running: {cmd}")
    print(f"{'='*50}\n")
    result = subprocess.run(cmd, cwd=cwd, shell=shell)
    if result.returncode != 0:
        print(f"Command failed with code {result.returncode}")
        return False
    return True


def build_frontend():
    """Build React frontend"""
    print("\n" + "="*60)
    print("  STEP 1: Building React Frontend")
    print("="*60)
    
    if not (FRONTEND_DIR / "package.json").exists():
        print("Frontend not found, skipping...")
        return True
    
    # Install dependencies
    if not run_command("npm install", cwd=FRONTEND_DIR):
        return False
    
    # Build for production
    if not run_command("npm run build", cwd=FRONTEND_DIR):
        return False
    
    # Copy build to backend
    frontend_build = FRONTEND_DIR / "build"
    dest = BACKEND_DIR / "frontend_build"
    
    if dest.exists():
        shutil.rmtree(dest)
    
    if frontend_build.exists():
        shutil.copytree(frontend_build, dest)
        print(f"Frontend built and copied to {dest}")
    
    return True


def create_pyinstaller_spec():
    """Create PyInstaller spec file"""
    spec_content = '''# -*- mode: python ; coding: utf-8 -*-
import sys
from pathlib import Path

block_cipher = None

# Paths
backend_dir = Path('applyease-backend')
frontend_build = backend_dir / 'frontend_build'

# Collect data files
datas = []
if frontend_build.exists():
    datas.append((str(frontend_build), 'frontend_build'))

# Hidden imports for sentence-transformers and related
hidden_imports = [
    'sentence_transformers',
    'transformers',
    'torch',
    'sklearn',
    'sklearn.feature_extraction.text',
    'sklearn.metrics.pairwise',
    'pdfminer',
    'pdfminer.high_level',
    'reportlab',
    'reportlab.pdfgen',
    'reportlab.lib.pagesizes',
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'starlette',
    'pydantic',
    'bcrypt',
    'jwt',
    'numpy',
    'huggingface_hub',
    'tokenizers',
    'safetensors',
]

a = Analysis(
    ['applyease-backend/desktop_app.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'PIL'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ApplyEase',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Set to False for no console window
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='popup/icon2.png' if Path('popup/icon2.png').exists() else None,
)
'''
    
    spec_file = ROOT_DIR / "ApplyEase.spec"
    spec_file.write_text(spec_content)
    print(f"Created PyInstaller spec: {spec_file}")
    return spec_file


def build_exe():
    """Build executable with PyInstaller"""
    print("\n" + "="*60)
    print("  STEP 2: Building Executable with PyInstaller")
    print("="*60)
    
    # Create spec file
    spec_file = create_pyinstaller_spec()
    
    # Clean previous builds
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
    
    # Run PyInstaller
    cmd = f"pyinstaller --clean {spec_file}"
    if not run_command(cmd):
        return False
    
    exe_path = DIST_DIR / "ApplyEase.exe"
    if exe_path.exists():
        print(f"\n{'='*60}")
        print(f"  SUCCESS! Executable created at:")
        print(f"  {exe_path}")
        print(f"  Size: {exe_path.stat().st_size / 1024 / 1024:.1f} MB")
        print(f"{'='*60}")
        return True
    else:
        print("ERROR: Executable not found after build")
        return False


def create_release_package():
    """Create release package with extension"""
    print("\n" + "="*60)
    print("  STEP 3: Creating Release Package")
    print("="*60)
    
    release_dir = ROOT_DIR / "release" / "ApplyEase"
    if release_dir.exists():
        shutil.rmtree(release_dir)
    release_dir.mkdir(parents=True)
    
    # Copy executable
    exe_src = DIST_DIR / "ApplyEase.exe"
    if exe_src.exists():
        shutil.copy(exe_src, release_dir / "ApplyEase.exe")
    
    # Copy extension files
    ext_dir = release_dir / "chrome-extension"
    ext_dir.mkdir()
    
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
            dest = ext_dir / f
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dest)
    
    # Create README for release
    readme = '''# ApplyEase Desktop

## Quick Start

1. **Run ApplyEase.exe** - This starts the backend server and opens your browser

2. **Install the Chrome Extension**:
   - Open Chrome and go to `chrome://extensions`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `chrome-extension` folder

3. **Create an Account** - Sign up at http://localhost:8000

4. **Upload Your Resume** - Go to Dashboard and upload your PDF resume

5. **Start Applying!** - Visit any job posting and click the extension

## Features

- ✨ Auto-fill job applications
- 📊 Resume match scoring
- 🤖 AI-powered answer generation (requires Ollama)
- 📋 Job tracker
- 🔒 100% local - your data never leaves your computer

## Requirements

- Windows 10/11
- Chrome browser
- Ollama (optional, for AI features): https://ollama.ai

## Data Location

Your data is stored in: `%APPDATA%\\ApplyEase`

## Troubleshooting

- **Extension can't connect**: Make sure ApplyEase.exe is running
- **AI features not working**: Install Ollama and run `ollama pull qwen2.5:7b`
'''
    
    (release_dir / "README.txt").write_text(readme)
    
    print(f"Release package created at: {release_dir}")
    
    # Create ZIP
    zip_path = ROOT_DIR / "release" / "ApplyEase-Windows"
    shutil.make_archive(str(zip_path), 'zip', release_dir.parent, "ApplyEase")
    print(f"ZIP archive created: {zip_path}.zip")
    
    return True


def main():
    print("\n" + "="*60)
    print("  ApplyEase Release Builder")
    print("="*60)
    
    # Check for required tools
    print("\nChecking requirements...")
    
    # Check PyInstaller
    try:
        import PyInstaller
        print(f"  PyInstaller: {PyInstaller.__version__}")
    except ImportError:
        print("  PyInstaller not found. Installing...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"])
    
    # Check Node.js
    result = subprocess.run("node --version", shell=True, capture_output=True, text=True)
    if result.returncode == 0:
        print(f"  Node.js: {result.stdout.strip()}")
    else:
        print("  WARNING: Node.js not found, frontend build may fail")
    
    # Build steps
    steps = [
        ("Frontend", build_frontend),
        ("Executable", build_exe),
        ("Package", create_release_package),
    ]
    
    for name, func in steps:
        if not func():
            print(f"\n❌ {name} build failed!")
            return 1
    
    print("\n" + "="*60)
    print("  ✅ BUILD COMPLETE!")
    print("="*60)
    print(f"\n  Release files are in: {ROOT_DIR / 'release'}")
    print(f"  Distribute: ApplyEase-Windows.zip")
    print()
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
