# [AI-LOCKED] Рабочий отлаженный скрипт E3.series. НЕ изменять без явного запроса пользователя (см. AI_DO_NOT_TOUCH_E3_SCRIPTS.md).
﻿# E3ProMax: podgotovka BD E3 pered perenosom (vyzyvaetsya serverom pered "V E3.series" i agentom).
# 1) simvoly UGO + vyvody (redaktor BD), 2) zavershenie fonovykh redaktorov BD, zapushchennykh etim skriptom,
# 3) snyatie zavisshikh blokirovok FLX_, 4) komponenty (izdeliya), 5) opredeleniya atributov.
param([string]$Project = 'data\project.json')
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
function E3Pids { @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'E3*' -or (($_.Path -as [string]) -like '*\Zuken\*') } | ForEach-Object { $_.Id }) }
$before = E3Pids
node node_modules\tsx\dist\cli.mjs scripts\e3SymbolsToDbe.ts --project $Project 2>&1 | Out-Null
Start-Sleep -Seconds 2
foreach ($id in (E3Pids | Where-Object { $before -notcontains $_ })) { try { Stop-Process -Id $id -Force -ErrorAction Stop } catch {} }
Start-Sleep -Seconds 1
& "$PSScriptRoot\e3_dbe_unlock.ps1" -Auto 2>&1 | Out-Null
node node_modules\tsx\dist\cli.mjs scripts\e3SymbolsToDbe.ts --components --project $Project 2>&1 | Out-Null
& "$PSScriptRoot\e3_ensure_attrs.ps1" -Project $Project 2>&1 | Where-Object { $_ -match 'SUMMARY|propusk' }
$log = Join-Path $root 'logs\e3-dbe-symbols.log'
if (Test-Path $log) { Get-Content $log -Encoding Unicode -Tail 120 | Where-Object { $_ -match 'E3_DBE_SYMBOLS_SUMMARY|E3_DBE_COMPONENTS_SUMMARY|ОШИБКА' } | Select-Object -Last 4 }
