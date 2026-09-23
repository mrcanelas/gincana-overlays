@echo off
cd /d "%~dp0.."
echo Iniciando XXII Gincana Cultural - Sistema de Transmissao
echo.
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)
node server.js
pause
