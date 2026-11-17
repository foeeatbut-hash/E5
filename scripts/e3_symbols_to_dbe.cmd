@echo off
rem E3ProMax: transfer device drawings (UGO) to the E3 symbol database (Database Editor).
rem Examples: e3_symbols_to_dbe.cmd        - all devices of the project
rem           e3_symbols_to_dbe.cmd -QF1   - only -QF1
chcp 65001 >nul
cd /d "%~dp0.."
node node_modules\tsx\dist\cli.mjs scripts\e3SymbolsToDbe.ts %*
pause
