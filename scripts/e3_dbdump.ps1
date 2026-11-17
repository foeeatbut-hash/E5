# E3ProMax: dump vsekh strok BD komponentov/simvolov, svyazannykh s komponentom (TOL'KO CHTENIE).
# -Component <ENTRY> ili -Pick (avto: prostoy standartnyy komponent s 1 gate i 2-4 pinami)
param([string]$Component = '', [switch]$Pick)
$cdbCs = 'Provider=Microsoft.ACE.OLEDB.16.0;Data Source=C:\Users\Public\Documents\Zuken\E3.series_2022\cdb\components.mdb'
$sdbCs = 'Provider=Microsoft.ACE.OLEDB.16.0;Data Source=C:\Users\Public\Documents\Zuken\E3.series_2022\cdb\symbols.mdb'
$cdb = New-Object -ComObject ADODB.Connection; $cdb.Open($cdbCs)
$sdb = New-Object -ComObject ADODB.Connection; $sdb.Open($sdbCs)
function Tables($cn){ $rs=$cn.OpenSchema(20); $t=@(); while(-not $rs.EOF){ if($rs.Fields.Item('TABLE_TYPE').Value -eq 'TABLE'){ $t+=$rs.Fields.Item('TABLE_NAME').Value }; $rs.MoveNext() }; ,$t }
function Val($v){ if ($v -is [byte[]]) { 'BIN' + $v.Length } elseif ($null -eq $v -or $v -is [DBNull]) { '' } else { [string]$v } }
function Find($cn, $label, $key){
  foreach ($t in (Tables $cn)) {
    try {
      $rs0 = $cn.Execute("SELECT TOP 1 * FROM [$t]"); $conds=@()
      foreach ($f in $rs0.Fields) { if ($f.Type -in 8,129,130,200,201,202,203) { $conds += "[" + $f.Name + "]='" + $key.Replace("'","''") + "'" } }
      if (-not $conds) { continue }
      $rs = $cn.Execute("SELECT * FROM [$t] WHERE " + ($conds -join ' OR ')); $n=0
      while (-not $rs.EOF -and $n -lt 40) { $v=@(); foreach($f in $rs.Fields){ $x = Val $f.Value; if ($x -ne '') { $v += ($f.Name + '=' + $x) } }; "  $label.$t | " + ($v -join ' | '); $rs.MoveNext(); $n++ }
    } catch {}
  }
}
if ($Pick) {
  $rs = $cdb.Execute("SELECT TOP 400 c.ENTRY, c.LPNTR, c.Class FROM ComponentData c WHERE c.LPNTR LIKE 'LC-%' AND c.Class NOT LIKE '%erminal%' AND c.Class NOT LIKE '%onnector%' AND c.Class NOT LIKE '%able%'")
  while (-not $rs.EOF) {
    $lp = [string]$rs.Fields.Item('LPNTR').Value
    $g = $cdb.Execute("SELECT COUNT(*) FROM Gate WHERE ENTRY='$lp'").Fields.Item(0).Value
    $p = $cdb.Execute("SELECT COUNT(*) FROM Pin WHERE ENTRY='$lp'").Fields.Item(0).Value
    if ($g -eq 1 -and $p -ge 2 -and $p -le 4) { $Component = [string]$rs.Fields.Item('ENTRY').Value; "Vybran: $Component Class=$($rs.Fields.Item('Class').Value) gate=$g pins=$p"; break }
    $rs.MoveNext()
  }
}
if (-not $Component) { 'Komponent ne vybran'; exit 1 }
$cd = $cdb.Execute("SELECT * FROM ComponentData WHERE ENTRY='$Component'")
$lp = [string]$cd.Fields.Item('LPNTR').Value; $id = [string]$cd.Fields.Item('ID').Value
"### $Component LPNTR=$lp ID=$id"
Find $cdb 'C' $Component
if ($lp) { Find $cdb 'C' $lp }
if ($id) { Find $cdb 'C' $id }
$gs = $cdb.Execute("SELECT CCTNAME FROM Gate WHERE ENTRY='$lp'")
while (-not $gs.EOF) {
  $sym = [string]$gs.Fields.Item(0).Value; "### simvol $sym"
  $sd = $sdb.Execute("SELECT LPNTR FROM SymbolData WHERE ENTRY='$sym'")
  if (-not $sd.EOF) { $sl = [string]$sd.Fields.Item(0).Value; Find $sdb 'S' $sym; if ($sl -and $sl -ne $sym) { Find $sdb 'S' $sl } }
  $gs.MoveNext()
}
