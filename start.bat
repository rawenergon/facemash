@echo off
cd /d "%~dp0"
echo Starting FaceMash on http://localhost:3000 ...
node server.js
echo.
echo Server stopped. Press any key to close.
pause >nul
