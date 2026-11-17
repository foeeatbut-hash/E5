# E3ProMax: diagnostika #5 - metody ob'ektov redaktora BD E3 (DbeSymbol, DbeComponent, DbeGraph, DbeNode...). Tol'ko chtenie.
$out = Join-Path $PSScriptRoot 'e3_diag5.txt'
"=== $(Get-Date) ===" | Out-File $out -Encoding utf8
function W($s){ $s | Out-File $out -Append -Encoding utf8 }
$dbe = $null
try { $dbe = [Runtime.InteropServices.Marshal]::GetActiveObject('CT.DbeApplication'); W 'GetActiveObject: OK' } catch { W "GetActiveObject: $_" }
if (-not $dbe) { try { $dbe = New-Object -ComObject CT.DbeApplication; W 'New-Object: OK' } catch { W "New-Object: $_" } }
if ($dbe) {
  W ("Version=" + $dbe.GetVersion() + " Build=" + $dbe.GetBuild() + " IsSchema=" + $dbe.IsSchema())
  foreach ($n in 'CreateDbeComponentObject','CreateDbeSymbolObject','CreateDbeGraphObject','CreateDbeNodeObject','CreateDbeTextObject','CreateDbeAttributeObject','CreateDbeModelObject','CreateDbeModelPinObject') {
    W "--- $n ---"
    try {
      $o = $dbe.$n()
      $o | Get-Member -MemberType Method | ForEach-Object { W ("  " + $_.Definition) }
    } catch { W "  ERR: $_" }
  }
}
W '=== konec ==='
Write-Host "Gotovo: $out"
