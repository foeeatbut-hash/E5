' E3ProMax: diagnostika sozdaniya ob'ektov v E3.series
' Zapusk: dvoynoy klik ili  cscript //Nologo e3_diag.vbs
' Rezul'tat pishetsya v e3_diag.txt ryadom so skriptom.
Option Explicit
Dim fso, out, App, Prj, Sh, Dev, Sym, r, ids, n, outPath
Set fso = CreateObject("Scripting.FileSystemObject")
outPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\e3_diag.txt"
Set out = fso.CreateTextFile(outPath, True, True)

Sub L(s)
  out.WriteLine s
End Sub

Sub T(label)
  If Err.Number <> 0 Then
    L label & " -> ERR #" & Err.Number & " " & Err.Description
    Err.Clear
  End If
End Sub

On Error Resume Next
Set App = GetObject(, "CT.Application")
If App Is Nothing Then Err.Clear : Set App = CreateObject("CT.Application")
If App Is Nothing Then
  L "Net podklyucheniya k CT.Application"
  out.Close : WScript.Quit 1
End If
L "Version: " & App.GetVersion() : T "GetVersion"
L "BuildNumber: " & App.GetBuildNumber() : T "GetBuildNumber"
L "ComponentDB: " & App.GetComponentDatabase() : T "GetComponentDatabase"
L "SymbolDB: " & App.GetSymbolDatabase() : T "GetSymbolDatabase"
L "ConfigDB: " & App.GetConfigurationDatabase() : T "GetConfigurationDatabase"
L "Licenses: " & App.GetLicenses() : T "GetLicenses"

Set Prj = App.CreateJobObject()
L "Job ID=" & Prj.GetId() & " Name=" & Prj.GetName() & " ReadOnly=" & Prj.IsReadOnly() : T "Job"
If Prj.GetId() <= 0 Then
  L "Net otkrytogo proekta. Otkroyte/sozdayte proekt v E3 i zapustite snova."
  out.Close : WScript.Quit 1
End If

Set Sh = Prj.CreateSheetObject()
Set Dev = Prj.CreateDeviceObject()
Set Sym = Prj.CreateSymbolObject()

n = Prj.GetSheetIds(ids) : T "GetSheetIds"
L "Sheets: " & n
If n > 0 Then Sh.SetId ids(1) : L "Sheet1 format='" & Sh.GetFormat() & "'" : T "GetFormat"

r = Sh.Create(0, "DIAG_1", "DINA3", 0, 0) : T "Sheet.Create(DINA3)"
L "Sheet.Create(0,'DIAG_1','DINA3',0,0) = " & r
r = Sh.Create(0, "DIAG_2", "", 0, 0) : T "Sheet.Create('')"
L "Sheet.Create(0,'DIAG_2','',0,0) = " & r

r = Dev.Create("-DIAG1", "", "", "", "", 0) : T "Device.Create(empty)"
L "Device.Create('-DIAG1', no component) = " & r
r = Dev.CreateDeviceFromSymbol("-DIAG2", "", "", "", "", 0) : T "CreateDeviceFromSymbol"

If n > 0 Then
  r = Sym.PlaceBlock(ids(1), 50, 50, 30, 20) : T "PlaceBlock"
  L "Sym.PlaceBlock(sheet1,50,50,30,20) = " & r
End If

L "Gotovo. Nichego iz sozdannogo (DIAG_*) ne nuzhno: udalite vruchnuyu ili zakroyte proekt bez sohraneniya."
out.Close
WScript.Echo "Gotovo: " & outPath
