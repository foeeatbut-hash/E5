# E3ProMax: diagnostika #9 (TOL'KO CHTENIE). Sravnenie komponenta FLUX_REF (sozdan v E3 vruchnuyu) i FLUX_TEST_COMP (sozdan programmoy).
$out = Join-Path $PSScriptRoot 'e3_diag9.txt'
"=== $(Get-Date) ===" | Out-File $out -Encoding utf8
function W($s){ $s | Out-File $out -Append -Encoding utf8 }
$dbe = New-Object -ComObject CT.DbeApplication
function Open($cs){ $c = New-Object -ComObject ADODB.Connection; $c.Open($cs); return $c }
$sdb = Open $dbe.GetSymbolDatabase()
$cdb = Open $dbe.GetComponentDatabase()

function Tables($cn){ $rs = $cn.OpenSchema(20); $t=@(); while(-not $rs.EOF){ if($rs.Fields.Item('TABLE_TYPE').Value -eq 'TABLE'){ $t += $rs.Fields.Item('TABLE_NAME').Value }; $rs.MoveNext() }; return $t }
function DumpRs($label, $rs, $max){
  $n = 0
  while (-not $rs.EOF -and $n -lt $max) {
    $vals = @(); foreach ($f in $rs.Fields) { $v = $f.Value; if ($v -is [byte[]]) { $v = 'BIN[' + $v.Length + ']:' + (($v | Select-Object -First 48 | ForEach-Object { $_.ToString('X2') }) -join '') }; $vals += ($f.Name + '=' + $v) }
    W ("  [$label] " + ($vals -join ' | ')); $rs.MoveNext(); $n++
  }
}
# Vse stroki vo vsekh tablitsakh, gde kakoy-libo tekstovyy stolbets = $key
function FindKey($cn, $key, $max){
  W "### Poisk '$key'"
  foreach ($t in (Tables $cn)) {
    try {
      $rs0 = $cn.Execute("SELECT TOP 1 * FROM [$t]"); $conds = @()
      foreach ($f in $rs0.Fields) { if ($f.Type -in 8,129,130,200,201,202,203) { $conds += "[" + $f.Name + "]='" + $key.Replace("'","''") + "'" } }
      if ($conds.Count -eq 0) { continue }
      $rs = $cn.Execute("SELECT TOP $max * FROM [$t] WHERE " + ($conds -join ' OR '))
      if (-not $rs.EOF) { DumpRs $t $rs $max }
    } catch {}
  }
}


foreach ($ce in 'FLUX_REF','FLUX_TEST_COMP') {
  FindKey $cdb $ce 40
  $rs = $cdb.Execute("SELECT LPNTR FROM ComponentData WHERE ENTRY='$ce'")
  if (-not $rs.EOF) { $lp = [string]$rs.Fields.Item(0).Value; if ($lp) { FindKey $cdb $lp 40; FindKey $sdb $lp 40 } }
}
FindKey $sdb 'FLUX_TEST' 40
$rs = $sdb.Execute("SELECT LPNTR FROM SymbolData WHERE ENTRY='FLUX_TEST'")
if (-not $rs.EOF) { FindKey $sdb ([string]$rs.Fields.Item(0).Value) 40 }
W '=== konec ==='
Write-Host "Gotovo: $out"
