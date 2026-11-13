export interface PortableBuildMeta {
  projectName: string;
  projectCode: string;
  revision: number;
  builtAt: string;
  version: string;
}

/**
 * Generates a rock-solid Windows .cmd launcher using goto labels (safe with spaces/parens in paths).
 * Checks ./runtime/node.exe -> system Node >= 18 -> auto-downloads official portable node.exe into ./runtime/.
 */
export function generatePortableLauncherCmd(): string {
  const lines = [
    '@echo off',
    'chcp 65001 >nul',
    'setlocal EnableExtensions',
    'title Flux E3 Portable — ECAD & E3.series 2022 Bridge',
    'set "ROOT=%~dp0"',
    'if "%ROOT:~-1%"=="\\" set "ROOT=%ROOT:~0,-1%"',
    'set "APP_DIR=%ROOT%\\app"',
    'set "DATA_DIR=%ROOT%\\data"',
    'set "RUNTIME_DIR=%ROOT%\\runtime"',
    'set "NODE_EXE=%RUNTIME_DIR%\\node.exe"',
    '',
    'if not exist "%DATA_DIR%" mkdir "%DATA_DIR%" >nul 2>&1',
    '',
    'if exist "%NODE_EXE%" goto :run_app',
    '',
    'where node >nul 2>&1',
    'if errorlevel 1 goto :fetch_node',
    'for /f "delims=" %%V in (\'node -p "parseInt(process.versions.node,10)" 2^>nul\') do set "NODE_MAJ=%%V"',
    'if defined NODE_MAJ if %NODE_MAJ% GEQ 18 (',
    '  set "NODE_EXE=node"',
    '  goto :run_app',
    ')',
    '',
    ':fetch_node',
    'echo [Flux E3 Portable] Локальный Node.js >= 18 не найден.',
    'echo [Flux E3 Portable] Первичная загрузка портативного Node.js v22.14.0 Win64 в папку runtime\\ ...',
    'if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%" >nul 2>&1',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri \'https://nodejs.org/dist/v22.14.0/win-x64/node.exe\' -OutFile \'%RUNTIME_DIR%\\node.exe\'"',
    'if not exist "%RUNTIME_DIR%\\node.exe" (',
    '  echo [Flux E3 Portable] ОШИБКА: не удалось скачать runtime\\node.exe. Проверьте доступ в интернет или установите Node.js >= 18.',
    '  pause',
    '  exit /b 1',
    ')',
    'set "NODE_EXE=%RUNTIME_DIR%\\node.exe"',
    '',
    ':run_app',
    'echo [Flux E3 Portable] Запуск сервера из %APP_DIR% ...',
    'echo [Flux E3 Portable] После старта браузер откроется автоматически. Для остановки закройте это окно.',
    'set "NODE_ENV=production"',
    'set "FLUX_PORTABLE=1"',
    'set "FLUX_OPEN_BROWSER=1"',
    'set "FLUX_DATA_DIR=%DATA_DIR%"',
    'set "PORT=3000"',
    'pushd "%APP_DIR%"',
    '"%NODE_EXE%" "%APP_DIR%\\server.cjs"',
    'set "EXIT_CODE=%errorlevel%"',
    'popd',
    'if not "%EXIT_CODE%"=="0" (',
    '  echo.',
    '  echo [Flux E3 Portable] Сервер завершился с кодом %EXIT_CODE%.',
    '  pause',
    ')',
    'exit /b %EXIT_CODE%',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Generates a silent VBS wrapper to launch FluxE3_Portable.cmd cleanly. */
export function generatePortableSilentVbs(): string {
  const lines = [
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set sh = CreateObject("WScript.Shell")',
    'here = fso.GetParentFolderName(WScript.ScriptFullName)',
    'cmdPath = fso.BuildPath(here, "FluxE3_Portable.cmd")',
    'sh.Run Chr(34) & cmdPath & Chr(34), 1, False',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Generates Russian portable documentation bundled inside FluxE3-Portable.zip. */
export function generatePortableReadme(meta: PortableBuildMeta): string {
  const lines = [
    '====================================================================',
    '  Flux E3 Portable — Автономная сборка САПР электросхем (Win64)',
    '====================================================================',
    '',
    `Проект в сборке: ${meta.projectName} (${meta.projectCode}, рев. ${meta.revision})`,
    `Дата сборки:     ${meta.builtAt}`,
    `Версия пакета:   ${meta.version}`,
    '',
    'КАК ЗАПУСТИТЬ:',
    '  1. Распакуйте весь архив в любую папку (например, D:\\FluxE3_Portable).',
    '  2. Запустите файл FluxE3_Portable.cmd.',
    '     (Если на ПК нет Node.js >= 18, лаунчер один раз автоматически',
    '      скачает официальный портативный node.exe в папку runtime\\).',
    '  3. Программа сама откроется в браузере по адресу http://127.0.0.1:3000',
    '     (при занятом порте 3000 автоматически выберет 3001..3020).',
    '',
    'ПРЯМАЯ РАБОТА С ZUKEN E3.SERIES 2022 SP2:',
    '  В портативной версии сервер работает локально на вашем Windows-ПК,',
    '  поэтому кнопка «В E³.series» в шапке вызывает COM-мост напрямую',
    '  (без необходимости запускать отдельный FluxE3_Connector.cmd).',
    '',
    'СОХРАНЕНИЕ ДАННЫХ:',
    '  Все ваши изменения схемы сохраняются локально в папку data\\project.json.',
    '',
    'СТРУКТУРА ПАПКИ:',
    '  FluxE3_Portable.cmd       — главный запуск портативной версии',
    '  app\\server.cjs            — собранный сервер и API (без node_modules)',
    '  app\\dist\\                 — собранный интерфейс React + Tailwind',
    '  app\\seed-project.json     — снимок проекта на момент сборки',
    '  e3-series-2022-sync.vbs   — автономный COM-скрипт (UTF-16LE BOM)',
    '  data\\                     — локальное хранилище изменений проекта',
  ];
  return lines.join('\r\n') + '\r\n';
}
