@echo off
chcp 65001 >nul
title Turno da Noite - servidor de rede local
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js nao encontrado. Instale em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)
echo Abrindo o jogo no navegador...
start "" "http://localhost:8765"
echo.
echo Se o Windows perguntar sobre o Firewall, permita "Redes privadas" para os outros computadores conectarem.
node tools\servidor.js 8765
pause
