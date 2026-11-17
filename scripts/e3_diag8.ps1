# E3ProMax: opyt #8. Dobavlyaet vyvody k probnomu simvolu FLUX_TEST i strukturu (gate + 2 pina) komponentu FLUX_TEST_COMP,
# zatem v otkrytom proekte E3 sozdaet izdelie -FT1 iz FLUX_TEST_COMP i proveryaet chislo vyvodov.
# Pishet TOL'KO stroki dlya FLUX_TEST / FLUX_TEST_COMP. Kopii BD (*.bak_E3ProMax) uzhe sdelany opytom #6.
$out = Join-Path $PSScriptRoot 'e3_diag8.txt'
"=== $(Get-Date) ===" | Out-File $out -Encoding utf8
function W($s){ $s | Out-File $out -Append -Encoding utf8 }
function Q($cn, $sql){ try { $ra = 0; $cn.Execute($sql, [ref]$ra) | Out-Null; W "OK  $sql" } catch { W "ERR $sql -> $($_.Exception.Message)" } }
function Rows($cn, $sql){ $rs = $cn.Execute($sql); $res = @(); while (-not $rs.EOF) { $h=@{}; foreach ($f in $rs.Fields) { $h[$f.Name] = $f.Value }; $res += $h; $rs.MoveNext() }; return ,$res }

$csS = ''; $csC = ''
$app = $null
try { $app = [Runtime.InteropServices.Marshal]::GetActiveObject('CT.Application') } catch {}
if ($app) { $csS = $app.GetSymbolDatabase(); $csC = $app.GetComponentDatabase() } else {
  $dbe = New-Object -ComObject CT.DbeApplication; $csS = $dbe.GetSymbolDatabase(); $csC = $dbe.GetComponentDatabase() }
$sdb = New-Object -ComObject ADODB.Connection; $sdb.Open($csS)
$cdb = New-Object -ComObject ADODB.Connection; $cdb.Open($csC)

# Blokirovki
foreach ($l in @(Rows $sdb "SELECT * FROM LOCKINFO WHERE ENTRY='FLUX_TEST'") + @(Rows $cdb "SELECT * FROM LOCKINFO WHERE ENTRY='FLUX_TEST_COMP'")) {
  $alive = Get-Process -Id $l.PID -ErrorAction SilentlyContinue
  W ("LOCK " + $l.ENTRY + " PID=" + $l.PID + " zhiv=" + [bool]$alive)
  if ($alive) { W 'STOP: obekt otkryt v redaktore BD E3. Zakroyte okno redaktora BD i zapustite snova.'; Write-Host 'Zakroyte redaktor BD E3 i zapustite snova'; exit }
}

# 1. Simvol: LPNTR i ego grafika
$sd = Rows $sdb "SELECT ENTRY, LPNTR, LSHTYP FROM SymbolData WHERE ENTRY='FLUX_TEST'"
if ($sd.Count -eq 0) { W 'Net simvola FLUX_TEST'; exit }
$lp = $sd[0].LPNTR; W "FLUX_TEST LPNTR=$lp LSHTYP=$($sd[0].LSHTYP)"
$keys = @('FLUX_TEST'); if ($lp) { $keys += $lp }
$pts = @()
foreach ($k in $keys) {
  foreach ($g in (Rows $sdb "SELECT * FROM SymbolGraphic WHERE ENTRY='$k' ORDER BY COPY")) {
    $b = [byte[]]$g.GraphicData; $d = @(); for ($i=0; $i -le $b.Length-8; $i+=8) { $d += [BitConverter]::ToDouble($b, $i) }
    W ("Grafika ENTRY=$k COPY=" + $g.COPY + " Type=" + $g.GraphicType + " data=" + ($d -join ';'))
    if ($g.GraphicType -eq 1 -and $d.Count -ge 4) { $pts += ,@($d[0],$d[1]); $pts += ,@($d[2],$d[3]); $gEntry = $k }
  }
  foreach ($n in (Rows $sdb "SELECT * FROM SymbolNodes WHERE ENTRY='$k'")) { W ("Uzhe est' uzel " + ($n.Values -join ',')) }
}
if ($pts.Count -lt 4) { W 'Ne naydeny linii-nozhki - stop'; exit }
$left = $pts | Sort-Object { $_[0] } | Select-Object -First 1
$right = $pts | Sort-Object { $_[0] } | Select-Object -Last 1
W ("Vyvody v tochkakh: (" + ($left -join ',') + ") i (" + ($right -join ',') + ") ENTRY=$gEntry")

# 2. Uzly simvola (kak u 264-701T: LBSTUB=14, LIBNTY=0)
Q $sdb "DELETE FROM SymbolNodes WHERE ENTRY='$gEntry'"
Q $sdb ("INSERT INTO SymbolNodes (COPY, ENTRY, LBNNUM, LBSTUB, LIBNTY, LIBNX, LIBNY) VALUES (1, '$gEntry', 1, 0, 0, " + [math]::Round($left[0]) + ", " + [math]::Round($left[1]) + ")")
Q $sdb ("INSERT INTO SymbolNodes (COPY, ENTRY, LBNNUM, LBSTUB, LIBNTY, LIBNX, LIBNY) VALUES (2, '$gEntry', 2, 0, 0, " + [math]::Round($right[0]) + ", " + [math]::Round($right[1]) + ")")

# 3. Struktura komponenta: LPNTR -> Gate(FLUX_TEST) -> Pin 1,2 -> GatePinRelation uzel->pin
$cd = Rows $cdb "SELECT LPNTR, Flags FROM ComponentData WHERE ENTRY='FLUX_TEST_COMP'"
if ($cd.Count -eq 0) { W 'Net komponenta FLUX_TEST_COMP'; exit }
$lc = [string]$cd[0].LPNTR
if (-not $lc) { $lc = 'LC-' + [guid]::NewGuid().ToString().ToUpper() }
W "FLUX_TEST_COMP LPNTR=$lc Flags(do)=$($cd[0].Flags)"
W ("Proverka: CCTNAME primera 'ZUK03-02-18' est' v SymbolData = " + ((Rows $sdb "SELECT ENTRY FROM SymbolData WHERE ENTRY='ZUK03-02-18'").Count))
Q $cdb "UPDATE ComponentData SET LPNTR='$lc', ENTRYTYP='0' WHERE ENTRY='FLUX_TEST_COMP'"
Q $cdb "DELETE FROM Gate WHERE ENTRY='$lc'"
Q $cdb "DELETE FROM Pin WHERE ENTRY='$lc'"
Q $cdb "DELETE FROM GatePinRelation WHERE ENTRY='$lc'"
Q $cdb "INSERT INTO Gate (CCTNAME, COPY, ENTRY) VALUES ('FLUX_TEST', 1, '$lc')"
foreach ($p in 1,2) {
  Q $cdb "INSERT INTO Pin (COPY, ENTRY, Flags, FUNCT, LPINEQV, NPINEQV, PHYSPIN, PINEQUIV, PINNAME, TPNPRIO, FLAGS2) VALUES ($p, '$lc', 0, 0, $p, $p, '$p', 0, '$p', 0, 0)"
  Q $cdb "INSERT INTO GatePinRelation (ENTRY, GateNumber, NodeNumber, PinNumber, Representation) VALUES ('$lc', 1, $p, $p, 0)"
}
$sdb.Close(); $cdb.Close()

# 4. Proverka v proekte E3
if (-not $app) { W 'E3 (proekt) ne zapushchen - shag 4 propushchen'; W '=== konec ==='; exit }
$prj = $app.CreateJobObject(); W ("Proekt ID=" + $prj.GetId() + " " + $prj.GetName())
$dev = $prj.CreateDeviceObject(); $sym = $prj.CreateSymbolObject(); $sh = $prj.CreateSheetObject()
$did = $dev.Create('-FT1', '', '', 'FLUX_TEST_COMP', '1', 0); W "Device.Create(-FT1, FLUX_TEST_COMP) = $did"
if ($did -gt 0) {
  $sids = $null; $ns = $dev.GetSymbolIds([ref]$sids); W "Simvolov u izdeliya: $ns"
  $pids = $null; $np = $dev.GetPinIds([ref]$pids); W "Vyvodov u izdeliya: $np"
  $shIds = $null; $nsh = $prj.GetSheetIds([ref]$shIds)
  if ($ns -gt 0 -and $nsh -gt 0) {
    $sym.SetId($sids[1]) | Out-Null
    $r = $sym.Place($shIds[1], 100.0, 100.0, ''); W "Symbol.Place(list1,100,100) = '$r'"
    $lx=0;$ly=0;$lg='';$lc2='';$lr=''; W ("GetSchemaLocation = " + $sym.GetSchemaLocation([ref]$lx,[ref]$ly,[ref]$lg,[ref]$lc2,[ref]$lr) + " x=$lx y=$ly")
  }
}
W '=== konec ==='
Write-Host "Gotovo: $out"
