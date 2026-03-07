@echo off
title VegaClaw VPS Connect
cd /d "%~dp0\.."
node scripts\vps-tunnel.js
pause
