@echo off
REM ============================================================
REM  Kindar — App Store Connect Automation (Windows)
REM  Faz tudo sozinho: clona repo se precisar, roda automacao
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ===============================================
echo   Kindar - ASC Automation
echo ===============================================
echo.

REM ── Verificar Node.js ──
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERRO] Node.js nao instalado.
  echo Baixe em: https://nodejs.org/
  pause
  exit /b 1
)

REM ── Verificar git ──
where git >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERRO] Git nao instalado.
  echo Baixe em: https://git-scm.com/
  pause
  exit /b 1
)

REM ── Definir diretorio de trabalho ──
set "WORK_DIR=%~dp0"
REM Remove trailing backslash
if "%WORK_DIR:~-1%"=="\" set "WORK_DIR=%WORK_DIR:~0,-1%"

echo [INFO] Pasta: %WORK_DIR%
cd /d "%WORK_DIR%"

REM ── Verificar se eh um repo git ──
if not exist ".git" (
  echo.
  echo [WARN] Esta pasta nao eh um repo git.
  echo Clonando repo Kindar...
  echo.

  REM Salva o .p8 se existir
  if exist "AuthKey_736GBBC4YY.p8" (
    echo [INFO] Backup do .p8...
    copy "AuthKey_736GBBC4YY.p8" "%TEMP%\AuthKey_736GBBC4YY.p8" >nul
    set "P8_BACKED_UP=1"
  )

  REM Move pasta atual pra trash
  cd ..
  for %%I in ("%WORK_DIR%") do set "FOLDER_NAME=%%~nxI"
  ren "!FOLDER_NAME!" "!FOLDER_NAME!_backup_%RANDOM%"

  REM Clona fresco
  git clone https://github.com/hdpedro/copais.git "!FOLDER_NAME!"
  if %errorlevel% neq 0 (
    echo [ERRO] Falha ao clonar. Verifique sua conexao e credenciais GitHub.
    pause
    exit /b 1
  )

  cd "!FOLDER_NAME!"
  set "WORK_DIR=%CD%"

  REM Restaura o .p8
  if defined P8_BACKED_UP (
    echo [INFO] Restaurando .p8...
    copy "%TEMP%\AuthKey_736GBBC4YY.p8" "AuthKey_736GBBC4YY.p8" >nul
    del "%TEMP%\AuthKey_736GBBC4YY.p8"
  )
) else (
  echo [INFO] Repo git detectado. Fazendo pull...
  git pull origin main
  if %errorlevel% neq 0 (
    echo [WARN] Pull falhou, continuando com a versao atual...
  )
)

echo.

REM ── Verificar se o .p8 existe ──
if not exist "AuthKey_736GBBC4YY.p8" (
  echo [ERRO] Arquivo AuthKey_736GBBC4YY.p8 nao encontrado em:
  echo        %CD%
  echo.
  echo Coloque o arquivo nessa pasta e rode de novo.
  pause
  exit /b 1
)

echo [OK] AuthKey_736GBBC4YY.p8 encontrado
echo.

REM ── Instalar deps se precisar ──
if not exist "node_modules" (
  echo [INFO] Instalando dependencias...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERRO] npm install falhou.
    pause
    exit /b 1
  )
)

REM ── Definir env vars ──
set ASC_KEY_ID=736GBBC4YY
set ASC_ISSUER_ID=52e31db4-ca31-4a2c-b99d-86b8b599b29e

echo.
echo ===============================================
echo   DRY RUN - testando sem fazer mudancas
echo ===============================================
echo.

node scripts/asc-automation/run.mjs --dry-run

echo.
echo ===============================================
echo.
set /p CONFIRM="Dry run terminou. Executar de verdade? (s/n): "
if /i not "%CONFIRM%"=="s" (
  echo Cancelado.
  pause
  exit /b 0
)

echo.
echo ===============================================
echo   EXECUCAO REAL
echo ===============================================
echo.

node scripts/asc-automation/run.mjs

echo.
echo ===============================================
echo   FINALIZADO
echo ===============================================
echo.
echo Verifique no App Store Connect:
echo   https://appstoreconnect.apple.com/apps
echo.
pause
