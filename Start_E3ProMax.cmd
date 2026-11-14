@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
title E3ProMax — Локальный запуск САПР и сервера

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "RUNTIME_BASE=%ROOT%\.runtime"
set "PORTABLE_NODE_VER=v22.14.0"
set "PORTABLE_NODE_DIR=%RUNTIME_BASE%\node-%PORTABLE_NODE_VER%-win-x64"
set "PORTABLE_NODE_EXE=%PORTABLE_NODE_DIR%\node.exe"
set "DATA_DIR=%ROOT%\data"
set "LOG_DIR=%ROOT%\logs"
set "LAUNCHER_LOG=%LOG_DIR%\launcher.log"
set "NODE_EXE="

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%" >nul 2>&1
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

call :log "===================================================================="
call :log "[BOOT] Запуск E3ProMax из исходной кодовой базы: %ROOT%"

echo.
echo [E3ProMax] Подготовка локального запуска...
echo [E3ProMax] Каталог проекта: %ROOT%

if exist "%PORTABLE_NODE_EXE%" (
  set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
  set "NODE_EXE=%PORTABLE_NODE_EXE%"
  call :log "[NODE] Используется локальный Node.js: %PORTABLE_NODE_EXE%"
  goto :check_deps
)

where node >nul 2>&1
if errorlevel 1 (
  call :log "[NODE] Системный Node.js не найден."
  goto :install_portable_node
)

for /f "delims=" %%V in ('node -p "parseInt(process.versions.node,10)" 2^>nul') do set "NODE_MAJ=%%V"
if not defined NODE_MAJ set "NODE_MAJ=0"
call :log "[NODE] Обнаружен системный Node.js major=%NODE_MAJ%"

if %NODE_MAJ% GEQ 20 (
  where npm >nul 2>&1
  if not errorlevel 1 (
    set "NODE_EXE=node"
    goto :check_deps
  )
)

call :log "[NODE] Требуется Node.js >= 20 с npm, скачивается портативный runtime..."

:install_portable_node
echo [E3ProMax] Node.js ^>= 20 не найден. Первичная загрузка портативного Node.js %PORTABLE_NODE_VER% Win64...
if not exist "%RUNTIME_BASE%" mkdir "%RUNTIME_BASE%" >nul 2>&1
set "NODE_ZIP=%RUNTIME_BASE%\node-%PORTABLE_NODE_VER%-win-x64.zip"
set "NODE_URL=https://nodejs.org/dist/%PORTABLE_NODE_VER%/node-%PORTABLE_NODE_VER%-win-x64.zip"
call :log "[NODE] Загрузка %NODE_URL%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ProgressPreference = 'SilentlyContinue'; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_ZIP%' -UseBasicParsing; Expand-Archive -Path '%NODE_ZIP%' -DestinationPath '%RUNTIME_BASE%' -Force; Remove-Item '%NODE_ZIP%' -Force -ErrorAction SilentlyContinue } catch { Write-Error $_.Exception.ToString(); exit 1 }" >> "%LAUNCHER_LOG%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Не удалось загрузить или распаковать Node.js."
  echo [E3ProMax] ОШИБКА: не удалось автоматически скачать Node.js.
  echo Установите Node.js 20+ вручную с https://nodejs.org/ и запустите этот файл снова.
  goto :fail_pause
)
if not exist "%PORTABLE_NODE_EXE%" (
  call :log "[ERROR] Не найден %PORTABLE_NODE_EXE% после распаковки."
  echo [E3ProMax] ОШИБКА: не найден node.exe после распаковки.
  goto :fail_pause
)
set "PATH=%PORTABLE_NODE_DIR%;%PATH%"
set "NODE_EXE=%PORTABLE_NODE_EXE%"
call :log "[NODE] Портативный Node.js установлен в %PORTABLE_NODE_DIR%"

:check_deps
if exist "%ROOT%\node_modules\vite\package.json" if exist "%ROOT%\node_modules\tsx\dist\cli.mjs" (
  call :log "[DEPS] Зависимости node_modules уже установлены."
  goto :run_server
)

echo [E3ProMax] Первый запуск: установка npm-зависимостей (npm install)...
call :log "[DEPS] Запуск npm install --no-audit --no-fund"
pushd "%ROOT%"
call npm install --no-audit --no-fund
set "NPM_ERR=%errorlevel%"
if not "%NPM_ERR%"=="0" (
  call :log "[WARN] npm install вернул код %NPM_ERR%, повтор с --legacy-peer-deps"
  echo [E3ProMax] Повторная установка зависимостей (--legacy-peer-deps)...
  call npm install --no-audit --no-fund --legacy-peer-deps
  set "NPM_ERR=%errorlevel%"
)
popd
if not "%NPM_ERR%"=="0" (
  call :log "[ERROR] npm install завершился с кодом %NPM_ERR%"
  echo [E3ProMax] ОШИБКА: npm install завершился с кодом %NPM_ERR%.
  goto :fail_pause
)
call :log "[DEPS] Зависимости успешно установлены."

:run_server
echo.
echo [E3ProMax] Запуск САПР E3ProMax...
echo [E3ProMax] Проекты сохраняются в: %DATA_DIR%\project.json
echo [E3ProMax] Логи сервера:          %LOG_DIR%\e3promax-server.log
echo [E3ProMax] Браузер откроется автоматически. Для остановки закройте это окно или нажмите Ctrl+C.
echo.

set "PORT=3000"
set "FLUX_AUTO_PORT=1"
set "FLUX_OPEN_BROWSER=1"
set "FLUX_DATA_DIR=%DATA_DIR%"
set "FLUX_LOG_DIR=%LOG_DIR%"
set "FLUX_DEBUG=1"

pushd "%ROOT%"
if exist "%ROOT%\node_modules\tsx\dist\cli.mjs" (
  call :log "[START] "%NODE_EXE%" "%ROOT%\node_modules\tsx\dist\cli.mjs" server.ts"
  "%NODE_EXE%" "%ROOT%\node_modules\tsx\dist\cli.mjs" server.ts
) else (
  call :log "[START] npm run dev"
  call npm run dev
)
set "EXIT_CODE=%errorlevel%"
popd

call :log "[EXIT] Сервер завершился с кодом %EXIT_CODE%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo [E3ProMax] ОШИБКА: сервер завершился с кодом %EXIT_CODE%.
  goto :fail_pause
)
exit /b 0

:fail_pause
echo.
echo Подробности сохранены в %LAUNCHER_LOG%
pause
exit /b 1

:log
>> "%LAUNCHER_LOG%" echo [%DATE% %TIME%] %~1
exit /b 0
