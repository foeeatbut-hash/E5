# E3ProMax: diagnostika #7 (TOL'KO CHTENIE). Kak v BD E3 khranyatsya vyvody simvola i svyaz' simvol-komponent.
$out = Join-Path $PSScriptRoot 'e3_diag7.txt'
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

# 1. Nash probnyy simvol i komponent
FindKey $sdb 'FLUX_TEST' 20
FindKey $cdb 'FLUX_TEST_COMP' 20

# 2. Sushchestvuyushchiy prostoy simvol s 2 vyvodami
$rs = $sdb.Execute("SELECT TOP 1 ENTRY FROM SymbolNodes GROUP BY ENTRY HAVING COUNT(*)=2")
$sym2 = $rs.Fields.Item(0).Value
W "Primer simvola s 2 vyvodami: $sym2"
FindKey $sdb $sym2 30

# 3. Komponent, ispol'zuyushchiy etot simvol (poisk imeni simvola v BD komponentov)
FindKey $cdb $sym2 10
# 4. Prostoy komponent-klemma s vyvodami: ENTRY i vse ego stroki
$rs = $cdb.Execute("SELECT TOP 1 ENTRY, LPNTR FROM ComponentData WHERE Class='Terminal'")
if (-not $rs.EOF) {
  $ce = $rs.Fields.Item('ENTRY').Value; $lp = $rs.Fields.Item('LPNTR').Value
  W "Primer komponenta: $ce LPNTR=$lp"
  FindKey $cdb $ce 20
  if ($lp) { FindKey $cdb $lp 20; FindKey $sdb $lp 20 }
}
W '=== konec ==='
Write-Host "Gotovo: $out"
