@echo off
cd /d "%~dp0"
node bot.mjs --top 10
if errorlevel 1 exit /b %errorlevel%
node evaluate.mjs
if errorlevel 1 exit /b %errorlevel%
node track.mjs
