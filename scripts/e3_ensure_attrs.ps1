# [AI-LOCKED] Рабочий отлаженный скрипт E3.series. НЕ изменять без явного запроса пользователя (см. AI_DO_NOT_TOUCH_E3_SCRIPTS.md).
﻿# E3ProMax: zavodit v BD atributov E3 (configuration.mdb) atributy, kotorye E3ProMax pishet pri perenose.
# Vladel'tsy (bity Owner, opredeleny po standartnym atributam E3): proekt 0x4000, list 0x12000000, izdelie 0x820, vyvod 0x40.
# Novye opredeleniya klonirujutsya s atributa 'Rack' i pomechayutsya Usage_Description='E3ProMax'. Chuzhie opredeleniya ne menyayutsya.
param([string]$Project = 'data\project.json', [switch]$Dry)
$ErrorActionPreference = 'Stop'
$OWN = @{ project = 0x4000; sheet = 0x12000000; device = 395302; cable = 393222; pin = 0x40 }
$want = @{}
function Add($name, $kind) { $n = ([string]$name).Trim(); if (-not $n) { return }; if ($n.Length -gt 64) { return }; if (-not $want.ContainsKey($n)) { $want[$n] = 0 }; $want[$n] = $want[$n] -bor $OWN[$kind] }
$raw = Get-Content $Project -Raw -Encoding UTF8 | ConvertFrom-Json
$p = if ($raw.project) { $raw.project } else { $raw }
'FLUX_PROJECT','Наименование','Автор','FLUX_META_FILE' | ForEach-Object { Add $_ 'project' }
'Обозначение','Наименование','Разработал','Проверил','Н.контр.','Утвердил','Организация','Литера','Дата','Масштаб','FLUX_SHEET_ID','FLUX_FOLDER' | ForEach-Object { Add $_ 'sheet' }
'Артикул','Производитель','Наименование','Категория','FLUX_ELEMENT_ID','FLUX_BLOCK','FLUX_CUSTOM_SYMBOL' | ForEach-Object { Add $_ 'device' }
'Наименование','Марка кабеля','Длина','Откуда','Куда','Число жил','Сечение','Экранированный','FLUX_CABLE_ID' | ForEach-Object { Add $_ 'cable' }
foreach ($d in $p.devices) {
  $pinNames = @($d.pins | ForEach-Object { ([string]$_.name).Trim().ToUpper() })
  foreach ($a in $d.attributes) {
    if ($a.service) { continue }
    $o = ([string]$a.owner).Trim()
    if (-not $o) { Add $a.name 'device' } elseif ($pinNames -contains $o.ToUpper()) { Add $a.name 'pin' } else { Add ("[$o] " + $a.name) 'device' }
  }
}
$cn = New-Object -ComObject ADODB.Connection
$cn.Open('Provider=Microsoft.ACE.OLEDB.16.0;Data Source=C:\Users\Public\Documents\Zuken\E3.series_2022\cdb\configuration.mdb')
$tpl = $cn.Execute("SELECT * FROM AttributeDefinition WHERE AttributeName='Rack'")
if ($tpl.EOF) { throw "Net shablona 'Rack' v AttributeDefinition" }
$cols = @(); foreach ($f in $tpl.Fields) { $cols += $f.Name }
$tv = @{}; foreach ($f in $tpl.Fields) { $tv[$f.Name] = $f.Value }
$created = 0; $updated = 0; $skipped = 0; $same = 0
foreach ($name in ($want.Keys | Sort-Object)) {
  $mask = [int64]$want[$name]
  $esc = $name.Replace("'", "''")
  $r = $cn.Execute("SELECT AttributeID, Owner, Usage_Description FROM AttributeDefinition WHERE AttributeName='$esc'")
  if (-not $r.EOF) {
    $own = [int64]$r.Fields.Item('Owner').Value; $mine = ([string]$r.Fields.Item('Usage_Description').Value) -eq 'E3ProMax'
    if (($own -band $mask) -eq $mask) { $same++; continue }
    if (-not $mine) { "  ne nash, vladel'tsy ne sovpadayut: $name (Owner=$own, nuzhno +$mask) - propusk"; $skipped++; continue }
    if (-not $Dry) { $cn.Execute("UPDATE AttributeDefinition SET Owner=" + ($own -bor $mask) + " WHERE AttributeName='$esc'") | Out-Null }
    "  obnovlen: $name Owner=" + ($own -bor $mask); $updated++; continue
  }
  $id = [int]$cn.Execute("SELECT MAX(AttributeID) FROM AttributeDefinition").Fields.Item(0).Value + 1
  $names = @(); $vals = @()
  foreach ($c in $cols) {
    $v = $tv[$c]
    switch -regex ($c) {
      '^AttributeID$' { $v = $id }
      '^AttributeName$' { $v = $name }
      '^Owner$' { $v = $mask }
      '^Owner2$' { $v = 0 }
      '^Usage_Description$' { $v = 'E3ProMax' }
      '^ASSIGNED_LIST$' { $v = $null }
      '^DESCRIPTION_' { $v = $name }
    }
    if ($null -eq $v -or $v -is [DBNull]) { continue }
    $names += "[$c]"
    if ($v -is [string]) { $vals += "'" + $v.Replace("'", "''") + "'" } elseif ($v -is [bool]) { $vals += $(if ($v) { 'True' } else { 'False' }) } else { $vals += [string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0}', $v) }
  }
  if (-not $Dry) { $cn.Execute("INSERT INTO AttributeDefinition (" + ($names -join ',') + ") VALUES (" + ($vals -join ',') + ")") | Out-Null }
  "  sozdan: $name (ID=$id, Owner=0x{0:X})" -f $mask; $created++
}
$cn.Close()
"E3_ATTR_DEFS_SUMMARY {""wanted"":$($want.Count),""created"":$created,""updated"":$updated,""alreadyOk"":$same,""skipped"":$skipped}"
