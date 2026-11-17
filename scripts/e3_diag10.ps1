# E3ProMax: diagnostika #10 (TOL'KO CHTENIE): vyvody simvola FLUX_TEST posle ruchnogo dobavleniya v E3.
$out = Join-Path $PSScriptRoot 'e3_diag10.txt'
"=== $(Get-Date) ===" | Out-File $out -Encoding utf8
function W($s){ $s | Out-File $out -Append -Encoding utf8 }
function Dump($cn, $sql, $label){
  try {
    $rs = $cn.Execute($sql); $n = 0
    while (-not $rs.EOF) {
      $v = @(); foreach ($f in $rs.Fields) { $x = $f.Value; if ($x -is [byte[]]) { $d=@(); for($i=0;$i -le $x.Length-8;$i+=8){ $d += [BitConverter]::ToDouble($x,$i) }; $x = 'D[' + ($d -join ';') + ']' }; $v += ($f.Name + '=' + $x) }
      W ("  [$label] " + ($v -join ' | ')); $rs.MoveNext(); $n++
    }
    if ($n -eq 0) { W "  [$label] (net strok)" }
  } catch { W "  [$label] ERR: $($_.Exception.Message)" }
}
$s = 'Provider=Microsoft.ACE.OLEDB.16.0;Data Source=C:\Users\Public\Documents\Zuken\E3.series_2022\cdb\symbols.mdb'
$sdb = New-Object -ComObject ADODB.Connection
try { $sdb.Open($s); W "Open OK: $s" } catch { W "Open ERR: $($_.Exception.Message)"; exit }
Dump $sdb "SELECT ENTRY, VERSION, LPNTR, LSHTYP, LASTUPDT FROM SymbolData WHERE ENTRY LIKE 'FLUX%' OR ENTRY LIKE 'FLX[_]GOST[_]QF[_]1%'" 'SymbolData'
foreach ($e in 'FLUX_TEST','FLX_GOST_QF_1P_10A','264-701T') {
  $rs = $sdb.Execute("SELECT LPNTR FROM SymbolData WHERE ENTRY='$e'")
  if ($rs.EOF) { W "### $e : net v SymbolData"; continue }
  $lp = [string]$rs.Fields.Item(0).Value
  W "### $e (LPNTR=$lp)"
  foreach ($t in 'SymbolNodes','SymbolText','SymbolPoints','SymbolDimension','SymbolGraphic','SYMBOL_FUNCTION') {
    $col = if ($t -eq 'SYMBOL_FUNCTION') { 'LPNTR' } else { 'ENTRY' }
    Dump $sdb "SELECT * FROM [$t] WHERE [$col]='$lp' OR [$col]='$e'" $t
  }
}
$sdb.Close()
W '=== konec ==='
Write-Host "Gotovo: $out"
