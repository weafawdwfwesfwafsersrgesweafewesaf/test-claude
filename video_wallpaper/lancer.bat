@echo off
REM Lanceur rapide pour Video Wallpaper (Windows).
REM Double-clique sur ce fichier pour demarrer l'app.

cd /d "%~dp0"

REM Installe les dependances si besoin (une seule fois).
python -c "import PySide6" 2>nul
if errorlevel 1 (
    echo Installation des dependances...
    python -m pip install -r requirements.txt
)

REM Lance sans fenetre de console (pythonw).
start "" pythonw main.py
