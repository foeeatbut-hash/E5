# E3ProMax: snyatie zavisshikh blokirovok simvolov/komponentov FLX_* i FLUX_* v BD E3.
# 1) Pokazyvaet processy E3, kotorye derzhat blokirovki, i (s vashego soglasiya) zavershaet ikh.
# 2) Udalyaet iz LOCKINFO stroki FLX_/FLUX_, ch'i processy uzhe ne sushchestvuyut.
param([switch]$Auto)
# -Auto: bez voprosov zavershaet processy-derzhateli blokirovok, krome okon s otkrytym proektom (*.e3s v zagolovke)
$ErrorActionPreference = 'Continue'
$sdbPath = 'C:\Users\Public\Documents\Zuken\E3.series_2022\cdb\symbols.mdb'
$cdbPath = 'C:\Users\Public\Documents\Zuken\E3.series_2022\cdb\components.mdb'
foreach ($db in $sdbPath, $cdbPath) {
  $cn = New-Object -ComObject ADODB.Connection
  $cn.Open("Provider=Microsoft.ACE.OLEDB.16.0;Data Source=$db")
  $rs = $cn.Execute("SELECT ENTRY, PID FROM LOCKINFO WHERE ENTRY LIKE 'FLX[_]%' OR ENTRY LIKE 'FLUX[_]%'")
  $locks = @()
  while (-not $rs.EOF) { $locks += [pscustomobject]@{ Entry = [string]$rs.Fields.Item('ENTRY').Value; Pid = [int]("0" + $rs.Fields.Item('PID').Value) }; $rs.MoveNext() }
  Write-Host "`n$([IO.Path]::GetFileName($db)): blokirovok FLX_/FLUX_: $($locks.Count)"
  foreach ($grp in ($locks | Group-Object Pid)) {
    $p = if ($grp.Name -ne '0') { Get-Process -Id ([int]$grp.Name) -ErrorAction SilentlyContinue } else { $null }
    $names = ($grp.Group.Entry | Select-Object -First 5) -join ', '
    if ($p) {
      Write-Host ("  PID {0} ({1}, okno: '{2}', zapushchen {3}) derzhit: {4}" -f $p.Id, $p.ProcessName, $p.MainWindowTitle, $p.StartTime, $names)
      if ($Auto) { $ans = if ($p.MainWindowTitle -match '\.e3s') { 'n' } else { 'y' }; Write-Host "  auto: $ans" } else { $ans = Read-Host "  Zavershit' process $($p.Id)? (y/n) [eto NE dolzhno byt' osnovnoe okno E3 s proektom]" }
      if ($ans -eq 'y') { Stop-Process -Id $p.Id -Force; Start-Sleep -Seconds 2; Write-Host "  zavershen" }
    } else {
      Write-Host "  PID $($grp.Name) uzhe ne sushchestvuet, derzhit: $names -> udalyayu zavisshie stroki"
      $cn.Execute("DELETE FROM LOCKINFO WHERE PID=" + [int]$grp.Name + " AND (ENTRY LIKE 'FLX[_]%' OR ENTRY LIKE 'FLUX[_]%')") | Out-Null
    }
  }
  # povtornaya chistka posle zaversheniya processov
  $rs = $cn.Execute("SELECT DISTINCT PID FROM LOCKINFO WHERE ENTRY LIKE 'FLX[_]%' OR ENTRY LIKE 'FLUX[_]%'")
  while (-not $rs.EOF) { $pid2 = [int]("0" + $rs.Fields.Item(0).Value); if (-not (Get-Process -Id $pid2 -ErrorAction SilentlyContinue)) { $cn.Execute("DELETE FROM LOCKINFO WHERE PID=$pid2 AND (ENTRY LIKE 'FLX[_]%' OR ENTRY LIKE 'FLUX[_]%')") | Out-Null }; $rs.MoveNext() }
  $cn.Close()
}
Write-Host "`nGotovo."
