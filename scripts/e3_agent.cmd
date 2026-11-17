@echo off
title E3ProMax agent
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0e3_agent.ps1"
pause
