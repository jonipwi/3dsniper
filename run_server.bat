@echo off
cd /d "%~dp0"
echo.
echo ==========================================
echo   Sniper Range V1 - Local Web Server
echo ==========================================
echo.
echo Starting server at:
echo http://localhost:8000
echo.
echo Press CTRL+C to stop the server.
echo.
python -m http.server 8000
if errorlevel 1 (
    echo.
    echo Python command failed. Trying py launcher...
    py -m http.server 8000
)
pause
