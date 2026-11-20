@echo off
if not exist .env copy .env.example .env
docker compose config
if errorlevel 1 exit /b 1
docker compose up --build
