# E3ProMax: opyt #6 - sozdanie probnogo simvola FLUX_TEST v BD E3 cherez COM redaktora BD.
# Pered zapis'yu delaet kopii components.mdb / symbols.mdb (*.bak_E3ProMax).
# Udalenie probnogo simvola/komponenta:  e3_diag6.cmd cleanup
param([string]$Mode = '')
$out = Join-Path $PSScriptRoot 'e3_diag6.txt'
"=== $(Get-Date) mode=$Mode ===" | Out-File $out -Encoding utf8
function W($s){ $s | Out-File $out -Append -Encoding utf8 }
function Try1($label, [scriptblock]$b){ try { $r = & $b; W ("{0} = {1}" -f $label, ($r -join ',')); return $r } catch { W ("{0} -> ERR {1}" -f $label, $_.Exception.Message); return $null } }

$dbe = New-Object -ComObject CT.DbeApplication
W ("DBE " + $dbe.GetVersion())
Try1 'SetEnableInteractiveDialogs(0)' { $dbe.SetEnableInteractiveDialogs(0) } | Out-Null

if ($Mode -eq 'cleanup') {
  Try1 'DeleteSymbol(FLUX_TEST,1)' { $dbe.DeleteSymbol('FLUX_TEST','1') } | Out-Null
  Try1 'DeleteComponent(FLUX_TEST_COMP,1)' { $dbe.DeleteComponent('FLUX_TEST_COMP','1') } | Out-Null
  W '=== konec ==='; Write-Host "Gotovo: $out"; exit
}

# 0. Rezervnye kopii BD
foreach ($cs in @($dbe.GetSymbolDatabase(), $dbe.GetComponentDatabase())) {
  if ($cs -match 'Data Source=([^;]+)') {
    $f = $Matches[1]; $bak = $f + '.bak_E3ProMax'
    if (-not (Test-Path $bak)) { Copy-Item $f $bak; W "Backup: $bak" } else { W "Backup uzhe est': $bak" }
  }
}

# 1. Tablitsy BD simvolov i primery simvolov-vyvodov
try {
  $cn = New-Object -ComObject ADODB.Connection; $cn.Open($dbe.GetSymbolDatabase())
  $rs = $cn.OpenSchema(20); $t = @()
  while (-not $rs.EOF) { if ($rs.Fields.Item('TABLE_TYPE').Value -eq 'TABLE') { $t += $rs.Fields.Item('TABLE_NAME').Value }; $rs.MoveNext() }
  W ("Tablitsy SymbolDB: " + ($t -join ', '))
  foreach ($tb in $t) {
    try {
      $rs = $cn.Execute("SELECT TOP 1 * FROM [$tb]"); $cols = @(); foreach ($fl in $rs.Fields) { $cols += $fl.Name }
      W ("  [$tb] " + ($cols -join ','))
    } catch {}
  }
  $cn.Close()
} catch { W "SymbolDB: $($_.Exception.Message)" }

# 2. Novyy simvol
$r = Try1 'NewSymbol(FLUX_TEST,1,"","",0)' { $dbe.NewSymbol('FLUX_TEST','1','','',0) }
$sid = Try1 'GetActiveSymbolId' { $dbe.GetActiveSymbolId() }
$sym = $dbe.CreateDbeSymbolObject()
if ($sid -gt 0) {
  Try1 'Sym.SetId' { $sym.SetId($sid) } | Out-Null
  Try1 'Sym.GetName' { $sym.GetName() } | Out-Null
  Try1 'Sym.GetSymbolType' { $sym.GetSymbolType() } | Out-Null
  $g = $dbe.CreateDbeGraphObject()
  Try1 'Graph.CreateRectangle(sid,0,0,20,10)' { $g.CreateRectangle($sid, 0.0, 0.0, 20.0, 10.0) } | Out-Null
  Try1 'Graph.CreateLine(sid,-5,5,0,5)' { $g.CreateLine($sid, -5.0, 5.0, 0.0, 5.0) } | Out-Null
  Try1 'Graph.CreateLine(sid,20,5,25,5)' { $g.CreateLine($sid, 20.0, 5.0, 25.0, 5.0) } | Out-Null
  $tx = $dbe.CreateDbeTextObject()
  Try1 'Text.Create(sid,0,2,2,FLUX)' { $tx.Create($sid, 0, 2.0, 2.0, 'FLUX') } | Out-Null

  # 3. DXF s liniey i tochkami na sloe NODE / bloke s atributom - proverka, sozdayutsya li vyvody
  $dxf = Join-Path $env:TEMP 'flux_test_nodes.dxf'
  $lines = @('0','SECTION','2','ENTITIES',
    '0','LINE','8','0','10','30','20','0','30','0','11','40','21','0','31','0',
    '0','POINT','8','NODE','10','30','20','0','30','0',
    '0','POINT','8','NODE','10','40','20','0','30','0',
    '0','ENDSEC','0','EOF')
  [IO.File]::WriteAllText($dxf, ($lines -join "`r`n"))
  Try1 'Sym.ImportDXF(dxf,1,0,0,0,"",0)' { $sym.ImportDXF($dxf, 1.0, 0.0, 0.0, 0, '', 0) } | Out-Null

  # 4. Vyvod cherez vstavku simvola (pervyy simvol, gde v imeni est' NODE/PIN/CONN)
  foreach ($cand in @('NODE','PIN','CONNECT','ANSCHLUSS')) {
    $r = Try1 "Sym.PlaceSymbol($cand,1,0,5,'',0)" { $sym.PlaceSymbol($cand, '1', 0.0, 5.0, '', 0) }
  }
  $ids = $null
  Try1 'Sym.GetNodeIds' { $sym.GetNodeIds([ref]$ids, 0) } | Out-Null
  $gids = $null
  Try1 'Sym.GetGraphicIds' { $sym.GetGraphicIds([ref]$gids) } | Out-Null
  Try1 'Sym.Save' { $sym.Save() } | Out-Null
}

# 5. Komponent
Try1 'NewComponent(FLUX_TEST_COMP,1,"","",0)' { $dbe.NewComponent('FLUX_TEST_COMP','1','','',0) } | Out-Null
$cid = Try1 'GetActiveComponentId' { $dbe.GetActiveComponentId() }
if ($cid -gt 0) {
  $c = $dbe.CreateDbeComponentObject()
  Try1 'Comp.SetId' { $c.SetId($cid) } | Out-Null
  Try1 'Comp.GetName' { $c.GetName() } | Out-Null
  Try1 'Comp.GetComponentType' { $c.GetComponentType() } | Out-Null
  Try1 'Comp.AddAttributeValue(Description)' { $c.AddAttributeValue('Description', 'E3ProMax test', 0) } | Out-Null
  Try1 'Comp.Save' { $c.Save() } | Out-Null
}
Try1 'GetErrorCount' { $dbe.GetErrorCount() } | Out-Null
Try1 'GetWarningCount' { $dbe.GetWarningCount() } | Out-Null
W '=== konec ==='
Write-Host "Gotovo: $out"
