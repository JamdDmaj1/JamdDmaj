@echo off
cd /d "%~dp0"
node bot.mjs --top 10 --allow-shorts
if errorlevel 1 exit /b %errorlevel%
set PAPER_STATE=paper-state-shorts.json
node track.mjs
