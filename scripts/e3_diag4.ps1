# E3ProMax: diagnostika COM-interfeysa redaktora BD E3 (DBE). Tol'ko chtenie, v BD nichego ne pishet.
$out = Join-Path $PSScriptRoot 'e3_diag4.txt'
"=== $(Get-Date) ===" | Out-File $out -Encoding utf8
function W($s){ $s | Out-File $out -Append -Encoding utf8 }
W "--- ProgID CT.* v reestre ---"
Get-ChildItem 'Registry::HKEY_CLASSES_ROOT' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like 'CT.*' } | ForEach-Object { W $_.PSChildName }
function Dump($label, $obj){
  W "--- $label ---"
  if ($null -eq $obj) { W "(null)"; return }
  try { $obj | Get-Member -MemberType Method | ForEach-Object { W ("  " + $_.Definition) } } catch { W "  Get-Member: $_" }
}
$dbe = $null
try { $dbe = New-Object -ComObject CT.DbeApplication; W "CT.DbeApplication: OK" } catch { W "CT.DbeApplication: $_" }
Dump 'DbeApplication' $dbe
if ($dbe) {
  $job = $null
  foreach ($m in 'CreateDbeJobObject','CreateJobObject') { if (-not $job) { try { $job = $dbe.$m(); W "$m(): OK" } catch { W "$m(): $_" } } }
  Dump 'DbeJob' $job
  if ($job) {
    $names = ($job | Get-Member -MemberType Method | Where-Object { $_.Name -like 'Create*Object' }).Name
    foreach ($n in $names) { try { $o = $job.$n(); Dump "$n()" $o } catch { W "$n(): $_" } }
  }
}
W "=== konec ==="
Write-Host "Gotovo: $out"
