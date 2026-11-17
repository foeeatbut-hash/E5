# E3ProMax agent: vypolnyaet zadaniya iz papki scripts\queue (*.job.ps1), kotorye kladet Claude.
# Kazhdoe zadanie: zapusk v papke proekta, taym-aut, log v queue\done\<imya>.log,
# posle zadaniya zavershayutsya TOL'KO te processy E3, kotorye eto zadanie samo zapustilo (fonovye redaktory BD).
# Ostanovka: zakryt' okno ili Ctrl+C.
param([int]$TimeoutSec = 240)
$root = Split-Path $PSScriptRoot -Parent
$q = Join-Path $PSScriptRoot 'queue'
$done = Join-Path $q 'done'
New-Item -ItemType Directory -Force -Path $q, $done | Out-Null
function Get-E3Pids {
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $_.ProcessName -like 'E3*' -or (($_.Path -as [string]) -like '*\Zuken\*')
  } | ForEach-Object { $_.Id }
}
$selfStamp = (Get-Item $PSCommandPath).LastWriteTime
$roadmap = Join-Path $PSScriptRoot 'e3_roadmap.txt'
$script:rmStamp = $null
function Show-Progress([string]$current = '') {
  if (-not (Test-Path $roadmap)) { return }
  $lines = Get-Content $roadmap -Encoding UTF8 | Where-Object { $_ -match '^\[( |x|~)\]' }
  if (-not $lines) { return }
  $doneN = ($lines | Where-Object { $_ -like '[x]*' }).Count
  $halfN = ($lines | Where-Object { $_ -like '[~]*' }).Count
  $pct = [math]::Round((($doneN + 0.5 * $halfN) / $lines.Count) * 100)
  $now = ($lines | Where-Object { $_ -like '[~]*' } | Select-Object -First 1)
  if (-not $now) { $now = ($lines | Where-Object { $_ -like '[ ]*' } | Select-Object -First 1) }
  $now = ($now -replace '^\[.\]\s*', '')
  $host.UI.RawUI.WindowTitle = "E3ProMax agent | $pct% | $now" + $(if ($current) { " | $current" } else { '' })
  $st = (Get-Item $roadmap).LastWriteTime
  if ($st -ne $script:rmStamp) {
    $script:rmStamp = $st
    Write-Host ''
    Write-Host ("==== Progress: $pct%  (" + $doneN + ' of ' + $lines.Count + ' done) ====') -ForegroundColor Cyan
    $bar = ('#' * [math]::Round($pct / 5)).PadRight(20, '.')
    Write-Host "[$bar]" -ForegroundColor Cyan
    foreach ($l in $lines) {
      $c = if ($l -like '[x]*') { 'Green' } elseif ($l -like '[~]*') { 'Yellow' } else { 'Gray' }
      Write-Host "  $l" -ForegroundColor $c
    }
    Write-Host ''
  }
}
Write-Host "E3ProMax agent: zhdu zadaniy v $q (Ctrl+C - stop)"
"[$(Get-Date -Format s)] agent start PID=$PID" | Out-File (Join-Path $done 'agent.log') -Append -Encoding utf8
while ($true) {
  if ((Get-Item $PSCommandPath).LastWriteTime -ne $selfStamp) { Write-Host 'Agent obnovlen - perezapusk...' -ForegroundColor Cyan; powershell -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath; exit }
  Show-Progress
  foreach ($job in (Get-ChildItem $q -Filter '*.job.ps1' | Sort-Object Name)) {
    $log = Join-Path $done ($job.BaseName + '.log')
    Write-Host "[$(Get-Date -Format T)] -> $($job.Name)"
    Show-Progress $job.BaseName
    $before = @(Get-E3Pids)
    $p = Start-Process powershell -PassThru -WindowStyle Hidden -WorkingDirectory $root `
      -RedirectStandardOutput $log -RedirectStandardError ($log + '.err') `
      -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$($job.FullName)`"")
    $ok = $p.WaitForExit($TimeoutSec * 1000)
    if (-not $ok) { try { $p.Kill() } catch {} }
    Start-Sleep -Seconds 2
    $spawned = @(Get-E3Pids | Where-Object { $before -notcontains $_ })
    foreach ($id in $spawned) { try { Stop-Process -Id $id -Force -ErrorAction Stop } catch {} }
    $tail = "`r`n=== EXIT=$(if ($ok) { $p.ExitCode } else { 'TIMEOUT' }) killedE3=[$($spawned -join ',')] $(Get-Date -Format s) ==="
    Add-Content -Path $log -Value $tail -Encoding utf8
    if (Test-Path ($log + '.err')) { $e = Get-Content ($log + '.err') -Raw; if ($e) { Add-Content $log ("STDERR:`r`n" + $e) -Encoding utf8 }; Remove-Item ($log + '.err') -Force }
    Move-Item $job.FullName (Join-Path $done $job.Name) -Force
    Write-Host "[$(Get-Date -Format T)] <- $($job.Name) $tail"
  }
  Start-Sleep -Seconds 2
}
