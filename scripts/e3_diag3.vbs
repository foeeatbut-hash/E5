' E3ProMax: diagnostika #3. Zapuskat' pri otkrytom proekte. Rezul'tat: e3_diag3.txt
Option Explicit
Dim fso, out, App, Prj, Sh, Dev, Sym, r, ids, n, shId, c0, c1, sids, cn, rs, arts, i, q
Set fso = CreateObject("Scripting.FileSystemObject")
Set out = fso.CreateTextFile(fso.GetParentFolderName(WScript.ScriptFullName) & "\e3_diag3.txt", True, True)
Sub L(s)
  out.WriteLine s
End Sub
Sub T(label)
  If Err.Number <> 0 Then
    L "  " & label & " -> ERR #" & Err.Number & " " & Err.Description
    Err.Clear
  End If
End Sub
On Error Resume Next
Set App = GetObject(, "CT.Application")
Set Prj = App.CreateJobObject()
Set Sh = Prj.CreateSheetObject()
Set Dev = Prj.CreateDeviceObject()
Set Sym = Prj.CreateSymbolObject()
L "Job ID=" & Prj.GetId() & " Name=" & Prj.GetName()

shId = Sh.Create(0, "DG3", "DINA3", 0, 0) : T "Sheet.Create"
If shId <= 0 Then
  n = Prj.GetSheetIds(ids) : shId = ids(1)
End If
L "List ID=" & shId
Sh.SetId shId

' 1. PlaceBlock: vozmozhno 0 = uspekh, ID v Sym.GetId()
c0 = Sh.GetSymbolIds(sids) : T "GetSymbolIds0"
Sym.SetId 0 : Err.Clear
r = Sym.PlaceBlock(shId, 100, 100, 40, 30) : T "PlaceBlock"
c1 = Sh.GetSymbolIds(sids) : T "GetSymbolIds1"
L "PlaceBlock ret=" & r & " Sym.GetId()=" & Sym.GetId() & " simvolov na liste: do=" & c0 & " posle=" & c1
If Sym.GetId() > 0 Then L "  Sym.GetDevId()=" & Sym.GetDevId() & " Sym.GetName()=" & Sym.GetName()
L "Prj.GetAllDeviceIds po bloku: " & Prj.GetAllDeviceIds(ids)

' 2. Device.Create s ENTRY iz BD
r = Dev.Create("DIAG5", "", "", "870-169_WAGO", "1", 0) : T "Create5"
L "Device.Create('DIAG5','870-169_WAGO','1') = " & r & " Dev.GetId()=" & Dev.GetId()
r = Dev.Create("-DIAG6", "", "", "870-169_WAGO", "1", 0) : T "Create6"
L "Device.Create('-DIAG6','870-169_WAGO','1') = " & r
r = Dev.Create("DIAG7", "", "", "870-169_WAGO", "", 0) : T "Create7"
L "Device.Create('DIAG7','870-169_WAGO','') = " & r
r = Dev.Create("DIAG8", "", "", "", "", 0) : T "Create8"
L "Device.Create('DIAG8', bez komponenta) = " & r & " Dev.GetId()=" & Dev.GetId()

' 3. Est' li artikuly proekta v BD
arts = Array("A9F74325", "LC1D25BD", "FC-051P5K5T4E20H", "A9F74110", "RXM2AB2BD", "XB4BVB3", "UT 4", "UT4", "3044102")
Set cn = CreateObject("ADODB.Connection")
cn.Open App.GetComponentDatabase() : T "Open DB"
For i = 0 To UBound(arts)
  q = "SELECT TOP 3 ENTRY, VERSION, ArticleNumber FROM ComponentData WHERE ENTRY LIKE '%" & arts(i) & "%' OR ArticleNumber LIKE '%" & arts(i) & "%'"
  Set rs = cn.Execute(q) : T "Q " & arts(i)
  If rs.EOF Then
    L "BD: '" & arts(i) & "' net"
  Else
    Do While Not rs.EOF
      L "BD: '" & arts(i) & "' -> ENTRY=" & rs("ENTRY") & " VERSION=" & rs("VERSION") & " Art=" & rs("ArticleNumber")
      rs.MoveNext
    Loop
  End If
Next
Set rs = cn.Execute("SELECT COUNT(*) FROM ComponentData") : L "Vsego komponentov v BD: " & rs(0)
cn.Close
L "Gotovo. Zakroyte proekt bez sohraneniya i soobshchite, poyavilis' li na liste DG3 blok i chto v okne soobshcheniy."
out.Close
WScript.Echo "Gotovo"
