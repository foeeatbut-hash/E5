// [AI-LOCKED] Рабочий отлаженный модуль переноса E3.series. НЕ изменять без явного запроса пользователя (см. AI_DO_NOT_TOUCH_E3_SCRIPTS.md).
/**
 * E3ProMax -> E3.series Database Editor: перенос рисунка (УГО) изделий в базу символов E3.
 *
 * Этап 1: графика (линии, прямоугольники, окружности, дуги, полилинии).
 * Этап 2: выводы символа (таблица SymbolNodes, координаты в 0,1 мм) и габарит (SymbolDimension).
 * Тексты и компонент пока не создаются.
 *
 * Запуск (из папки проекта):
 *   node node_modules\tsx\dist\cli.mjs scripts\e3SymbolsToDbe.ts [-QF1 -KM1 ...] [--scale 0.25] [--project data\project.json] [--dry] [--check]
 *   --components: записать компоненты (изделия) в БД E3 (запускать, когда редактор БД закрыт)
 *   --check: только проверка (свежий экземпляр редактора БД), сколько выводов E3 видит у FLX_-символов
 * Без обозначений переносятся все изделия проекта (по одному символу на e3BlockName).
 * Символы создаются с префиксом FLX_ (FLX_<e3BlockName>, версия 1); у существующего FLX_-символа графика и выводы перерисовываются.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { extractBuiltInSymbolShapes, sampleArcPoints } from '../src/core/symbolLibrary.ts';
import { buildComponentGroups, cableCores, cableEntryName, dbeSymbolName, gostFormatName } from '../src/core/e3DbNames.ts';
import { buildGostSheetGeometry } from '../src/core/gostFrame.ts';
import type { E3Cable, E3Project, E3Sheet } from '../src/core/e3Types.ts';
import type { CustomSymbolShape, E3Device, E3SymbolDef } from '../src/core/e3Types.ts';

interface Args {
  designations: string[];
  scale: number;
  projectPath: string;
  dry: boolean;
  check: boolean;
  components: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { designations: [], scale: 0, projectPath: 'data/project.json', dry: false, check: false, components: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--scale') a.scale = Number(argv[++i]) || a.scale;
    else if (v === '--project') a.projectPath = argv[++i];
    else if (v === '--dry') a.dry = true;
    else if (v === '--check') a.check = true;
    else if (v === '--components') a.components = true;
    else a.designations.push(v.toUpperCase());
  }
  return a;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ближайший цвет палитры E3 (0 — чёрный/по умолчанию, 1 красный, 2 жёлтый, 3 зелёный, 4 синий, 8 серый). */
export function e3ColourIndex(hex?: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return 0;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 70) return 0; // почти чёрный
  if (max - min < 8) return max > 240 ? -1 : 8; // белый / серый
  const h = (() => {
    const d = max - min;
    let x = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    x *= 60;
    return x < 0 ? x + 360 : x;
  })();
  if (h < 20 || h >= 330) return 1;
  if (h < 70) return 2;
  if (h < 170) return 3;
  if (h < 260) return 4;
  return 1;
}
const vbsStr = (s: string) => '"' + String(s).replace(/"/g, '""') + '"';
const vbsNum = (n: number) => String(r2(n)); // в исходнике VBS десятичный разделитель всегда точка
const DEFAULT_COMPONENT_DB = 'Provider=Microsoft.ACE.OLEDB.16.0;Data Source=C:\\Users\\Public\\Documents\\Zuken\\E3.series_2022\\cdb\\components.mdb';
const DEFAULT_SYMBOL_DB = 'Provider=Microsoft.ACE.OLEDB.16.0;Data Source=C:\\Users\\Public\\Documents\\Zuken\\E3.series_2022\\cdb\\symbols.mdb';

export { dbeSymbolName };

export interface DbeComponentItem {
  entry: string;
  dev: E3Device;
  gates: Array<{ symbol: string; dev: E3Device }>;
}

/** Компоненты БД E3 для изделий проекта: одно на ENTRY (артикул + набор символов), с несколькими гейтами. */
export function collectComponents(devs: E3Device[], all: E3Device[] = devs): DbeComponentItem[] {
  const groups = buildComponentGroups(all);
  const picked = new Set(devs.map((d) => String(d.designation || '').trim().toUpperCase()));
  const m = new Map<string, DbeComponentItem>();
  for (const [des, g] of groups) {
    if (!picked.has(des) || m.has(g.entry)) continue;
    m.set(g.entry, { entry: g.entry, dev: g.dev, gates: g.gates });
  }
  return [...m.values()];
}

const letterCode = (des: string) => (String(des).replace(/^[-=+]/, '').match(/^[A-Za-zА-Яа-яЁё]+/)?.[0] || '').slice(0, 8);

function buildComponentCalls(comps: DbeComponentItem[]): string {
  return comps
    .map((c) => {
      const d = c.dev;
      // гейты: "символ=>вывод|вывод##символ=>вывод|..."
      const gates = c.gates
        .map((g) => g.symbol + '=>' + (g.dev.pins || []).map((p) => String(p.name || '').replace(/[|#]/g, '/').trim() || '?').join('|'))
        .join('##');
      return `Call Comp(${vbsStr(c.entry)}, ${vbsStr(gates)}, ${vbsStr(d.componentName || '')}, ${vbsStr(d.article || '')}, ${vbsStr(d.manufacturer || '')}, ${vbsStr(letterCode(d.designation))}, ${vbsStr(String(d.category || ''))})`;
    })
    .join('\r\n');
}

export function resolveDeviceShapes(dev: E3Device, library: E3SymbolDef[] = []): CustomSymbolShape[] {
  if (dev.customSymbol?.shapes?.length) return dev.customSymbol.shapes;
  const lib = library.find((s) => (dev.symbolId && s.id === dev.symbolId) || (s.e3BlockName && s.e3BlockName === dev.e3BlockName));
  if (lib?.shapes?.length) return lib.shapes;
  return extractBuiltInSymbolShapes(dev.category, dev.width, dev.height, dev.e3BlockName, dev.pins);
}

/** VBS-код рисования одного символа. Координаты: мм, начало в центре, ось Y вверх (как в E3). */
export function buildSymbolVbs(name: string, dev: E3Device, shapes: CustomSymbolShape[], scaleIn: number): string {
  const scale = scaleIn > 0 ? scaleIn : (dev as E3Device & { _scale?: number })._scale || 0.25;
  const w = dev.width > 0 ? dev.width : 100;
  const h = dev.height > 0 ? dev.height : 100;
  const X = (x: number) => (x - w / 2) * scale;
  const Y = (y: number) => (h / 2 - y) * scale;
  const lw = (s: CustomSymbolShape) => ('strokeWidth' in s && s.strokeWidth ? Math.max(0.18, Math.min(1, s.strokeWidth * scale)) : 0.25);
  const out: string[] = [];
  out.push(`  Call BeginSymbol(${vbsStr(name)}, ${vbsStr(dev.designation + ' ' + (dev.componentName || ''))})`);
  out.push('  If sid > 0 Then');
  const line = (x1: number, y1: number, x2: number, y2: number, wmm: number) =>
    out.push(`    Call L(${vbsNum(X(x1))}, ${vbsNum(Y(y1))}, ${vbsNum(X(x2))}, ${vbsNum(Y(y2))}, ${vbsNum(wmm)})`);
  for (const s of shapes) {
    const sc = e3ColourIndex((s as { strokeColor?: string }).strokeColor);
    const fl = (s as { filled?: boolean; fillColor?: string }).filled && (s as { fillColor?: string }).fillColor ? e3ColourIndex((s as { fillColor?: string }).fillColor) : -1;
    out.push(`    Call Sty(${Math.max(0, sc)}, ${fl})`);
    switch (s.kind) {
      case 'line':
        line(s.x1, s.y1, s.x2, s.y2, lw(s));
        break;
      case 'rect':
        out.push(`    Call R(${vbsNum(X(s.x))}, ${vbsNum(Y(s.y + s.height))}, ${vbsNum(X(s.x + s.width))}, ${vbsNum(Y(s.y))}, ${vbsNum(lw(s))})`);
        break;
      case 'circle':
        out.push(`    Call C(${vbsNum(X(s.cx))}, ${vbsNum(Y(s.cy))}, ${vbsNum(s.r * scale)}, ${vbsNum(lw(s))})`);
        break;
      case 'arc': {
        const pts = sampleArcPoints(s.cx, s.cy, s.r, s.startAngle, s.endAngle);
        for (let i = 1; i < pts.length; i++) line(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, lw(s));
        break;
      }
      case 'polyline': {
        const p = s.points || [];
        if (p.length < 2) break;
        if (s.closed && s.filled && p.length >= 3) {
          out.push(`    ReDim px(${p.length}), py(${p.length})`);
          p.forEach((pt, i) => out.push(`    px(${i + 1}) = ${vbsNum(X(pt.x))} : py(${i + 1}) = ${vbsNum(Y(pt.y))}`));
          out.push(`    Call P(${p.length}, ${vbsNum(lw(s))})`);
        } else {
          for (let i = 1; i < p.length; i++) line(p[i - 1].x, p[i - 1].y, p[i].x, p[i].y, lw(s));
          if (s.closed) line(p[p.length - 1].x, p[p.length - 1].y, p[0].x, p[0].y, lw(s));
        }
        break;
      }
      case 'text': {
        // Фиксированный текст символа (тип 11 «Text fix»); динамические подписи обозначения пишутся отдельно (тип 12)
        const txt = String(s.text || '').replace(/[\r\n]+/g, ' ').trim();
        if (!txt || s.attrKey === 'designation' || /^\{.*\}$/.test(txt)) break;
        const ht = Math.max(1.8, Math.min(5, (s.fontSize || 10) * scale));
        const just = s.align === 'left' ? 1 : s.align === 'right' ? 3 : 2;
        out.push(`    Call FT(${vbsNum(X(s.x))}, ${vbsNum(Y(s.y) - ht / 2)}, ${vbsNum(ht)}, ${just}, ${vbsStr(txt)})`);
        break;
      }
    }
  }
  if (dev.category === 'io_matrix') {
    const rawJson = (dev.attributes || []).find((a) => a.name === 'FSA_MATRIX_JSON')?.value;
    if (rawJson) {
      try {
        const data = JSON.parse(rawJson);
        const cols = Array.isArray(data?.columns) ? data.columns : [];
        const leftW = Math.min(240, w * 0.35);
        const headerH = Math.min(110, h * 0.36);
        const colW = cols.length > 0 ? Math.max(36, (w - leftW - 12) / cols.length) : 60;
        const rowNames = ['DI', 'DO', 'AI', 'AO', 'Цифр. шина', 'Измерение', 'Регулиров.', 'Сигнализ.', 'Управление'];
        const rowH = Math.min(21, (h - headerH - 8) / rowNames.length);
        const tblTop = headerH;
        const tblBot = tblTop + rowNames.length * rowH;
        out.push('    Call Sty(0, -1)');
        line(8, tblTop, leftW, tblTop, 0.35);
        line(8, tblBot, leftW, tblBot, 0.35);
        line(8, tblTop, 8, tblBot, 0.35);
        line(52, tblTop, 52, tblBot, 0.25);
        line(leftW, tblTop, leftW, tblBot, 0.35);
        out.push(`    Call FTR(${vbsNum(X(30))}, ${vbsNum(Y((tblTop + tblBot) / 2))}, 2.2, 2, ${vbsStr(String(data?.cabinetTag || dev.designation || ''))}, 90)`);
        out.push('    Call Sty(8, -1)');
        out.push(`    Call FT(${vbsNum(X(leftW - 45))}, ${vbsNum(Y(tblTop - 8))}, 1.8, 3, "Итого (+20%):")`);
        const tKeys = ['di', 'do', 'ai', 'ao'];
        rowNames.forEach((rn, ri) => {
          const ry = tblTop + ri * rowH;
          if (ri > 0) {
            out.push('    Call Sty(8, -1)');
            line(52, ry, w - 8, ry, 0.18);
          }
          out.push('    Call Sty(0, -1)');
          out.push(`    Call FT(${vbsNum(X(56))}, ${vbsNum(Y(ry + rowH * 0.72))}, 1.8, 1, ${vbsStr(rn)})`);
          if (ri < 4 && data?.totals) {
            const k = tKeys[ri];
            const tot = `${data.totals[k] ?? 0} (${data.reserve20?.[k] ?? 0})`;
            out.push('    Call Sty(3, -1)');
            out.push(`    Call FT(${vbsNum(X(leftW - 6))}, ${vbsNum(Y(ry + rowH * 0.72))}, 1.8, 3, ${vbsStr(tot)})`);
          }
        });
        cols.forEach((col: any, ci: number) => {
          const cx = leftW + (ci + 0.5) * colW;
          out.push('    Call Sty(3, -1)');
          line(cx, 8, cx, tblBot, 0.25);
          const tag = String(col.tag || '');
          out.push(`    Call FTR(${vbsNum(X(cx - 2))}, ${vbsNum(Y(tblTop - 6))}, 1.7, 1, ${vbsStr(tag.slice(0, 22))}, 90)`);
          const vals = [col.di, col.do, col.ai, col.ao];
          const bools = [!!col.digitalBus, !!col.measure, !!col.regulate, !!col.alarm, !!col.control];
          for (let ri = 0; ri < 4; ri++) {
            const v = Number(vals[ri]) || 0;
            if (v > 0) {
              const cy = tblTop + (ri + 0.5) * rowH;
              out.push('    Call Sty(3, 3)');
              out.push(`    Call C(${vbsNum(X(cx))}, ${vbsNum(Y(cy))}, 0.85, 0.25)`);
              out.push('    Call Sty(0, -1)');
              out.push(`    Call FT(${vbsNum(X(cx - 8))}, ${vbsNum(Y(cy + 3))}, 1.7, 3, ${vbsStr(String(v))})`);
            }
          }
          for (let bi = 0; bi < 5; bi++) {
            if (bools[bi]) {
              const cy = tblTop + (4 + bi + 0.5) * rowH;
              out.push('    Call Sty(3, 3)');
              out.push(`    Call C(${vbsNum(X(cx))}, ${vbsNum(Y(cy))}, 0.85, 0.25)`);
            }
          }
        });
      } catch {}
    }
  }
  (dev.pins || []).forEach((pin, i) => {
    out.push(`    Call N(${i + 1}, ${vbsNum(X(pin.dx))}, ${vbsNum(Y(pin.dy))}) ' ${String(pin.name).replace(/[\r\n]/g, ' ')}`);
    // Номер вывода (тип 3) рядом с выводом, смещение — внутрь символа
    const dir = String((pin as { direction?: string }).direction || '');
    const ox = dir === 'right' ? -1 : 1;
    const oy = dir === 'top' ? -2.5 : dir === 'bottom' ? 1 : 0.8;
    out.push(`    Call T(3, ${vbsNum(X(pin.dx) + ox)}, ${vbsNum(Y(pin.dy) + oy)}, 2, ${dir === 'right' ? 3 : 1}, ${i + 1}, "")`);
  });
  // Подпись блока под символом (как в E3ProMax)
  if (dev.e3BlockName && dev.category !== 'io_matrix') out.push(`    Call Sty(8, -1)\r\n    Call FT(0, ${vbsNum(Y(h) - 5.5)}, 1.8, 2, ${vbsStr(dev.e3BlockName)})`);
  // Позиционное обозначение изделия (тип 12) над символом
  out.push(`    Call T(12, 0, ${vbsNum(Y(0) + 1.5)}, 3, 2, 0, "")`);
  out.push(`    Call Bounds(${vbsNum(X(0))}, ${vbsNum(Y(h))}, ${vbsNum(X(w))}, ${vbsNum(Y(0))})`);
  out.push('    Call EndSymbol()');
  out.push('  End If');
  return out.join('\r\n');
}

const FORMAT_MM_W: Record<string, number> = { A0: 1189, A1: 841, A2: 594, A3: 420, A4: 297 };

/** Формат листа (рамка ГОСТ 2.104 + графы штампа + надписи граф) как символ E3 в мм; значения граф пишет перенос. */
export function buildFormatVbs(sheet: E3Sheet, project: E3Project): string {
  const name = gostFormatName(sheet, project);
  const g = buildGostSheetGeometry(sheet, project);
  const mmW = FORMAT_MM_W[String(sheet.format || 'A3').toUpperCase().replace('А', 'A')] || 420;
  const k = mmW / (sheet.width || 1400);
  const W = (sheet.width || 1400) * k;
  const H = (sheet.height || 920) * k;
  const X = (x: number) => x * k;
  const Y = (y: number) => H - y * k;
  const out: string[] = [];
  out.push(`  Call BeginSymbol(${vbsStr(name)}, "формат листа ${sheet.format} ${g.stamp.form}")`);
  out.push('  If sid > 0 Then');
  out.push('    Call Sty(0, -1)');
  out.push(`    Call R(0, 0, ${vbsNum(W)}, ${vbsNum(H)}, 0.18)`);
  const f = g.frame;
  out.push(`    Call R(${vbsNum(X(f.left))}, ${vbsNum(Y(f.bottom))}, ${vbsNum(X(f.right))}, ${vbsNum(Y(f.top))}, 0.7)`);
  for (const l of g.stamp.lines) out.push(`    Call L(${vbsNum(X(l.x1))}, ${vbsNum(Y(l.y1))}, ${vbsNum(X(l.x2))}, ${vbsNum(Y(l.y2))}, ${l.thick ? 0.7 : 0.25})`);
  for (const c of g.stamp.cells) {
    const t = String(c.text || '').trim();
    if (c.fieldKey || !t) continue;
    const ht = Math.max(1.6, (c.fontSize || 7.5) * k * 0.75);
    const x = c.align === 'center' ? c.x + c.width / 2 : c.x + 4;
    out.push(`    Call FT(${vbsNum(X(x))}, ${vbsNum(Y(c.y + c.height / 2) - ht / 2)}, ${vbsNum(ht)}, ${c.align === 'center' ? 2 : 1}, ${vbsStr(t)})`);
  }
  const a = g.archivalBox;
  if (a.visible) {
    out.push(`    Call R(${vbsNum(X(a.x))}, ${vbsNum(Y(a.y + a.height))}, ${vbsNum(X(a.x + a.width))}, ${vbsNum(Y(a.y))}, 0.7)`);
    out.push(`    Call L(${vbsNum(X(a.x + a.width * 0.4))}, ${vbsNum(Y(a.y))}, ${vbsNum(X(a.x + a.width * 0.4))}, ${vbsNum(Y(a.y + a.height))}, 0.7)`);
    let yy = a.y;
    for (const r of a.rows) {
      const y2 = yy + r.h;
      out.push(`    Call L(${vbsNum(X(a.x))}, ${vbsNum(Y(y2))}, ${vbsNum(X(a.x + a.width))}, ${vbsNum(Y(y2))}, 0.7)`);
      out.push(`    Call FTR(${vbsNum(X(a.x + a.width * 0.28))}, ${vbsNum(Y(yy + r.h / 2))}, ${vbsNum(Math.max(1.6, 7 * k * 0.75))}, 2, ${vbsStr(r.label)}, 90)`);
      yy = y2;
    }
  }
  out.push(`    Call Bounds(0, 0, ${vbsNum(W)}, ${vbsNum(H)})`);
  out.push('    Call EndSymbol()');
  out.push(`    fmtNames = fmtNames & "|" & ${vbsStr(name)}`);
  out.push('  End If');
  return out.join('\r\n');
}

export function buildDbeScript(items: Array<{ name: string; dev: E3Device; shapes: CustomSymbolShape[] }>, scale: number, logPath: string, comps: DbeComponentItem[] = [], formatsVbs = ''): string {
  const body = items.map((it) => buildSymbolVbs(it.name, it.dev, it.shapes, scale)).join('\r\n') + '\r\n' + formatsVbs;
  return `' E3ProMax -> E3 DBE: перенос УГО (сгенерировано автоматически)
Option Explicit
Dim dbe, sym, g, sid, gOk, gErr, skippedText, px(), py(), fso, logF, totalOk, totalSym
Dim nCnt, nNum(), nX(), nY(), bX1, bY1, bX2, bY2, curName, sdb, pend(), pendCnt, tCnt, tArr()
pendCnt = 0 : ReDim pend(0)
Set fso = CreateObject("Scripting.FileSystemObject")
Set logF = fso.OpenTextFile(${vbsStr(logPath)}, 8, True, -1)
totalOk = 0 : totalSym = 0

Sub LogL(s)
  ' WScript.Echo в перенаправленный вывод (node/агент) даёт ошибку "Incorrect function" — не даём ей «утечь» в Err вызывающего кода
  On Error Resume Next
  logF.WriteLine "[" & Now & "] " & s
  WScript.Echo s
  Err.Clear
End Sub

On Error Resume Next
Set dbe = CreateObject("CT.DbeApplication")
If dbe Is Nothing Then
  LogL "ОШИБКА: не удалось запустить редактор БД E3 (CT.DbeApplication): #" & Err.Number & " " & Err.Description
  WScript.Quit 1
End If
Err.Clear
Dim targetDb
targetDb = ResolveTargetDb()
LogL "Целевая БД символов: " & targetDb
If Not SelectDb(dbe, targetDb) Then
  LogL "ОШИБКА: редактор БД открыт с другой базой (" & dbe.GetSymbolDatabase() & "), переключить на целевую не удалось. Перенос остановлен, ничего не записано."
  dbe.Quit
  logF.Close
  WScript.Quit 2
End If
LogL "Редактор БД E3 " & dbe.GetVersion() & ", БД символов: " & dbe.GetSymbolDatabase()

Function DbFile(cs)
  ' Путь к файлу/источнику из строки подключения (для сравнения без учёта провайдера и регистра)
  Dim m, p
  m = LCase(CStr(cs))
  p = InStr(m, "data source=")
  If p > 0 Then
    m = Mid(m, p + 12)
    If InStr(m, ";") > 0 Then m = Left(m, InStr(m, ";") - 1)
  End If
  DbFile = Trim(m)
End Function

Function ResolveTargetDb()
  ' БД символов основного E3 (той, что использует проект); если E3 не запущен — стандартная symbols.mdb
  On Error Resume Next
  Dim app
  ResolveTargetDb = ${vbsStr(DEFAULT_SYMBOL_DB)}
  Set app = GetObject(, "CT.Application")
  If Err.Number = 0 And Not app Is Nothing Then
    If app.GetSymbolDatabase() <> "" Then ResolveTargetDb = app.GetSymbolDatabase()
  End If
  Err.Clear
End Function

Function SelectDb(d, target)
  ' Если редактор БД открыт с другой базой — переключаем на ту из настроенных, у которой та же БД символов
  On Error Resume Next
  Dim names, n, i, c, sy, f
  SelectDb = (DbFile(d.GetSymbolDatabase()) = DbFile(target))
  If SelectDb Then Exit Function
  names = Empty
  n = d.GetDefinedDatabases(names)
  For i = 0 To n
    If Not IsEmpty(names) Then
      If i <= UBound(names) Then
        c = "" : sy = "" : f = ""
        Call d.GetDefinedDatabaseConnectionStrings(CStr(names(i)), c, sy, f)
        If DbFile(sy) = DbFile(target) And CStr(names(i)) <> "" Then
          Call d.SetActualDatabase(CStr(names(i)))
          LogL "Редактор БД переключён на базу '" & names(i) & "'"
          Exit For
        End If
      End If
    End If
  Next
  Err.Clear
  SelectDb = (DbFile(d.GetSymbolDatabase()) = DbFile(target))
End Function
Set sym = dbe.CreateDbeSymbolObject()
Set g = dbe.CreateDbeGraphObject()
Set sdb = Nothing

Sub BeginSymbol(name, info)
  ' Новый символ: NewSymbol. Уже есть в БД: EditSymbol + очистка старой графики (символ не удаляется).
  On Error Resume Next
  Dim r, r2, ids, cnt, i, how
  gOk = 0 : gErr = 0 : skippedText = 0 : sid = 0
  nCnt = 0 : ReDim nNum(0), nX(0), nY(0)
  tCnt = 0 : ReDim tArr(0)
  curName = name
  Err.Clear
  how = "создан"
  r = dbe.NewSymbol(name, "1", "", "", 0)
  If Err.Number <> 0 Or r <> 0 Then
    Err.Clear
    how = "обновлён"
    r2 = dbe.EditSymbol(name, "1")
  End If
  sid = dbe.GetActiveSymbolId()
  If sid > 0 Then
    sym.SetId sid
    If UCase(sym.GetName()) <> UCase(name) Then sid = 0
  End If
  If Err.Number <> 0 Or sid <= 0 Then
    LogL "Символ " & name & " (" & info & "): не открыт, NewSymbol=" & r & ", EditSymbol=" & r2 & " #" & Err.Number & " " & Err.Description & " — возможно, он открыт во вкладке редактора БД"
    Err.Clear
    sid = 0
    Exit Sub
  End If
  If how = "обновлён" Then
    cnt = 0
    cnt = sym.GetGraphicIds(ids)
    For i = 1 To cnt
      g.SetId ids(i)
      g.Delete
    Next
    Err.Clear
  End If
  LogL "Символ " & name & ": " & how & " (ID=" & sid & ")"
  totalSym = totalSym + 1
End Sub

Dim curCol, curFill, tx, ftOk, ftErr
curCol = 0 : curFill = -1 : ftOk = 0 : ftErr = 0
Set tx = dbe.CreateDbeTextObject()

Sub Sty(c, f)
  curCol = c : curFill = f
End Sub

Dim fmtNames
fmtNames = ""

Sub FTR(x, y, ht, just, txt, rot)
  On Error Resume Next
  Dim id
  Err.Clear
  id = tx.Create(sid, 11, x, y, txt)
  If Err.Number = 0 And id > 0 Then
    tx.SetId id
    tx.SetHeight ht
    tx.SetAlignment just
    tx.SetRotation rot
    ftOk = ftOk + 1
  Else
    ftErr = ftErr + 1
  End If
  Err.Clear
End Sub

Sub FT(x, y, ht, just, txt)
  ' Постоянная надпись символа средствами редактора БД (тип текста 11)
  On Error Resume Next
  Dim id
  Err.Clear
  id = tx.Create(sid, 11, x, y, txt)
  If Err.Number = 0 And id > 0 Then
    tx.SetId id
    tx.SetHeight ht
    tx.SetAlignment just
    If curCol > 0 Then tx.SetColour curCol
    ftOk = ftOk + 1
  Else
    ftErr = ftErr + 1
  End If
  Err.Clear
End Sub

Sub Done(gid, wmm)
  On Error Resume Next
  If Err.Number = 0 And gid > 0 Then
    gOk = gOk + 1
    g.SetId gid
    If wmm > 0 Then g.SetLineWidth wmm
    If curCol > 0 Then
      g.SetColour curCol
      g.SetLineColour curCol
    End If
    If curFill >= 0 Then
      g.SetHatchPattern 1, 1.5, 45
      g.SetHatchColour curFill
    End If
    Err.Clear
  Else
    gErr = gErr + 1
  End If
  Err.Clear
End Sub

Sub L(x1, y1, x2, y2, wmm)
  On Error Resume Next
  Err.Clear
  Call Done(g.CreateLine(sid, x1, y1, x2, y2), wmm)
End Sub

Sub R(x1, y1, x2, y2, wmm)
  On Error Resume Next
  Err.Clear
  Call Done(g.CreateRectangle(sid, x1, y1, x2, y2), wmm)
End Sub

Sub C(cx, cy, rr, wmm)
  On Error Resume Next
  Err.Clear
  Call Done(g.CreateCircle(sid, cx, cy, rr), wmm)
End Sub

Sub P(n, wmm)
  Dim gid, i
  On Error Resume Next
  Err.Clear
  gid = g.CreatePolygon(sid, n, px, py)
  If Err.Number <> 0 Or gid <= 0 Then
    Err.Clear
    For i = 2 To n
      Call L(px(i - 1), py(i - 1), px(i), py(i), wmm)
    Next
    Call L(px(n), py(n), px(1), py(1), wmm)
  Else
    Call Done(gid, wmm)
  End If
End Sub

Sub N(num, x, y)
  nCnt = nCnt + 1
  ReDim Preserve nNum(nCnt), nX(nCnt), nY(nCnt)
  nNum(nCnt) = num : nX(nCnt) = x : nY(nCnt) = y
End Sub

Sub T(typ, x, y, ht, just, node, txt)
  tCnt = tCnt + 1
  ReDim Preserve tArr(tCnt)
  tArr(tCnt) = Array(typ, x, y, ht, just, node, txt)
End Sub

Sub Bounds(x1, y1, x2, y2)
  bX1 = x1 : bY1 = y1 : bX2 = x2 : bY2 = y2
End Sub

Function T10(v)
  ' мм -> единицы БД E3 (0,1 мм), целое
  T10 = CLng(Round(CDbl(v) * 10, 0))
End Function

Function WriteNodes(curName, nCnt, nNum, nX, nY, bX1, bY1, bX2, bY2, tc, ta)
  ' Выводы символа: строки SymbolNodes (ENTRY = LPNTR символа), как у символов из стандартной БД E3
  On Error Resume Next
  Dim rs, lp, i
  WriteNodes = -1
  If sdb Is Nothing Then Exit Function
  Set rs = sdb.Execute("SELECT LPNTR FROM SymbolData WHERE ENTRY='" & Replace(curName, "'", "''") & "' AND VERSION='1'")
  If Err.Number <> 0 Or rs.EOF Then
    LogL "  выводы: символ " & curName & " не найден в SymbolData #" & Err.Number & " " & Err.Description
    Err.Clear
    Exit Function
  End If
  lp = CStr(rs(0).Value)
  rs.Close
  If lp = "" Then lp = curName
  sdb.Execute "DELETE FROM SymbolNodes WHERE ENTRY='" & lp & "'"
  For i = 1 To nCnt
    sdb.Execute "INSERT INTO SymbolNodes (COPY, ENTRY, LBNNUM, LBSTUB, LIBNTY, LIBNX, LIBNY) VALUES (" & i & ", '" & lp & "', " & nNum(i) & ", 0, 0, " & T10(nX(i)) & ", " & T10(nY(i)) & ")"
  Next
  ' Тексты символа (SymbolText): номера выводов (3), обозначение (12), фиксированные надписи (11) — формат как у символов стандартной БД
  sdb.Execute "DELETE FROM SymbolText WHERE ENTRY='" & lp & "' AND TTYPE IN (3, 12)"
  Dim k, tt, tnode
  For k = 1 To tc
    tt = ta(k)
    tnode = "NULL"
    If tt(5) > 0 Then tnode = CStr(tt(5))
    sdb.Execute "INSERT INTO SymbolText (COPY, ENTRY, FontName, LBNNUM, THT, TJUST, TLEV, TMOD, TROT, TSTR, TTYPE, TX, TY, Flags2) VALUES (" & k & ", '" & lp & "', 'Arial', " & tnode & ", " & T10(tt(3)) & ", " & tt(4) & ", " & tt(0) & ", 1, 0, '" & Replace(tt(6), "'", "''") & "', " & tt(0) & ", " & T10(tt(1)) & ", " & T10(tt(2)) & ", 512)"
  Next
  sdb.Execute "UPDATE SymbolDimension SET LSHX1=" & T10(bX1) & ", LSHY1=" & T10(bY1) & ", LSHX2=" & T10(bX2) & ", LSHY2=" & T10(bY2) & " WHERE ENTRY='" & lp & "'"
  If Err.Number <> 0 Then
    LogL "  выводы: ошибка записи #" & Err.Number & " " & Err.Description
    Err.Clear
    Exit Function
  End If
  WriteNodes = nCnt
End Function

Sub EndSymbol()
  On Error Resume Next
  Dim r, wn
  Err.Clear
  r = sym.Save()
  ' Save=-3 бывает, когда E3 ещё занят предыдущей операцией: повторяем с паузой
  Dim tries
  tries = 0
  Do While r <> 1 And tries < 4
    WScript.Sleep 800
    Err.Clear
    r = sym.Save()
    tries = tries + 1
  Loop
  ' Выводы пишем в БД только после закрытия редактора (dbe.Quit): иначе редактор при закрытии
  ' пересохраняет символ из памяти и стирает строки SymbolNodes
  pendCnt = pendCnt + 1
  ReDim Preserve pend(pendCnt)
  pend(pendCnt) = Array(curName, nCnt, nNum, nX, nY, bX1, bY1, bX2, bY2, tCnt, tArr)
  LogL "Символ " & sym.GetName() & " ID=" & sid & ": графика " & gOk & " шт., ошибок " & gErr & ", надписей " & ftOk & "/" & (ftOk + ftErr) & ", выводов к записи " & nCnt & ", текстов пропущено " & skippedText & ", Save=" & r & IIf(Err.Number <> 0, " #" & Err.Number & " " & Err.Description, "")
  If gOk > 0 Then totalOk = totalOk + 1
  Err.Clear
End Sub

Function IIf(c, a, b)
  If c Then IIf = a Else IIf = b
End Function

${body}

LogL "Итог: символов создано " & totalSym & ", с графикой " & totalOk & " из ${items.length}"
LogL "E3_DBE_SYMBOLS_SUMMARY {""created"":" & totalSym & ",""withGraphics"":" & totalOk & ",""total"":${items.length}}"
' Закрываем свой экземпляр редактора БД: иначе он остаётся в фоне и держит блокировку символов (EditSymbol=-3)
Err.Clear
Dim symDbCs, compDbCs, pi, pr, wn
symDbCs = dbe.GetSymbolDatabase()
compDbCs = dbe.GetComponentDatabase()
dbe.Quit
LogL "Редактор БД закрыт (Quit)" & IIf(Err.Number <> 0, " #" & Err.Number & " " & Err.Description, "")
Err.Clear
Set dbe = Nothing
WScript.Sleep 3000
' Выводы и габариты: запись в БД символов после закрытия редактора
Set sdb = Nothing
Set sdb = CreateObject("ADODB.Connection")
sdb.Open symDbCs
If Err.Number <> 0 Then
  LogL "ОШИБКА: нет доступа к БД символов для записи выводов: #" & Err.Number & " " & Err.Description
  Err.Clear
  Set sdb = Nothing
End If
For pi = 1 To pendCnt
  pr = pend(pi)
  wn = WriteNodes(pr(0), pr(1), pr(2), pr(3), pr(4), pr(5), pr(6), pr(7), pr(8), pr(9), pr(10))
  LogL "  выводы " & pr(0) & ": записано " & wn & " из " & pr(1)
Next
' Форматы листов: тип символа «лист» (как DINA3: LSHTYP=1, Class=Misc_Sheet)
Dim fArr, fi
If Not sdb Is Nothing And fmtNames <> "" Then
  fArr = Split(Mid(fmtNames, 2), "|")
  For fi = 0 To UBound(fArr)
    Err.Clear
    sdb.Execute "UPDATE SymbolData SET LSHTYP=1, Class='Misc_Sheet' WHERE ENTRY='" & fArr(fi) & "'"
    LogL "  формат листа " & fArr(fi) & IIf(Err.Number <> 0, ": ОШИБКА #" & Err.Number & " " & Err.Description, ": тип «лист» задан")
  Next
  Err.Clear
End If
If Not sdb Is Nothing Then sdb.Close

' Компоненты пишутся отдельным запуском --components: редактор БД держит components.mdb открытой монопольно

' Проверка выводов и изделий — отдельным запуском --check (свежий экземпляр редактора БД)
logF.Close
`;
}

/** Отдельная проверка (новый запуск, свежий экземпляр редактора БД): сколько выводов E3 видит у символов. */
export function buildCheckScript(items: Array<{ name: string; dev: E3Device }>, logPath: string, comps: DbeComponentItem[] = []): string {
  const list = items.map((it) => `Call Chk(${vbsStr(it.name)}, ${(it.dev.pins || []).length})`).join('\r\n');
  return `' E3ProMax: проверка выводов символов FLX_ в БД E3 (только чтение)
Option Explicit
Dim dbe, s2, fso, logF, ok, total
Set fso = CreateObject("Scripting.FileSystemObject")
Set logF = fso.OpenTextFile(${vbsStr(logPath)}, 8, True, -1)
Sub LogL(t)
  ' WScript.Echo в перенаправленный вывод (node/агент) даёт ошибку "Incorrect function" — не даём ей «утечь» в Err вызывающего кода
  On Error Resume Next
  logF.WriteLine "[" & Now & "] " & t
  WScript.Echo t
  Err.Clear
End Sub
On Error Resume Next
Set dbe = CreateObject("CT.DbeApplication")
dbe.SetEnableInteractiveDialogs 0
LogL "Проверка выводов. БД символов: " & dbe.GetSymbolDatabase()
Set s2 = dbe.CreateDbeSymbolObject()
ok = 0 : total = 0
Sub Chk(name, expected)
  On Error Resume Next
  Dim er, aid, an, ids, cnt
  total = total + 1
  cnt = -1 : an = ""
  er = dbe.EditSymbol(name, "1")
  aid = dbe.GetActiveSymbolId()
  If aid > 0 Then
    s2.SetId aid
    an = s2.GetName()
    If UCase(an) = UCase(name) Then cnt = s2.GetNodeIds(ids, 0)
  End If
  LogL "  " & name & ": E3 видит выводов " & cnt & " из " & expected & " (EditSymbol=" & er & ", активный=" & an & ")"
  If cnt = expected Then ok = ok + 1
  Err.Clear
End Sub
${list}
LogL "E3_DBE_NODES_CHECK {""symbols"":" & total & ",""nodesOk"":" & ok & "}"
dbe.Quit

' Проверка изделий: в отдельном фоновом E3 с временным проектом (если основной E3 запущен — пропуск, чтобы не трогать ваш проект)
Dim app, prj, dv, dOk, dTot, tmpApp
dOk = 0 : dTot = 0
Err.Clear
Set tmpApp = GetObject(, "CT.Application")
If Err.Number = 0 Then
  LogL "Проверка изделий пропущена: запущен основной E3 (закройте его, чтобы проверить в фоновом)"
Else
  Err.Clear
  Set app = CreateObject("CT.Application")
  Set prj = app.CreateJobObject()
  prj.Create "FLX_CHECK_PRJ"
  Set dv = prj.CreateDeviceObject()
${comps
  .map(
    (c, i) => `  Call DevChk(${vbsStr(c.entry)}, ${c.gates.reduce((n, g) => n + (g.dev.pins || []).length, 0)}, ${i + 1})`
  )
  .join('\r\n')}
  LogL "E3_DEVICE_CHECK {""components"":" & dTot & ",""ok"":" & dOk & "}"
  ' фоновый E3 завершит агент (или закройте вручную); проект не сохраняется
End If

Sub DevChk(entry, expPins, n)
  On Error Resume Next
  Dim id, sids, pids, ns, np
  dTot = dTot + 1
  id = dv.Create("-CHK" & n, "", "", entry, "", 0)
  ns = -1 : np = -1
  If id > 0 Then
    dv.SetId id
    ns = dv.GetSymbolIds(sids)
    np = dv.GetPinIds(pids)
  End If
  LogL "  изделие из " & entry & ": Device.Create=" & id & ", символов " & ns & ", выводов " & np & " из " & expPins
  If id > 0 And ns > 0 And np = expPins Then dOk = dOk + 1
  Err.Clear
End Sub
logF.Close
`;
}

/** Компоненты (изделия) в БД E3 — отдельный запуск без редактора БД (он держит components.mdb монопольно). */
function buildCableCalls(cables: E3Cable[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of cables) {
    const e = cableEntryName(c);
    if (seen.has(e)) continue;
    seen.add(e);
    const spec = cableCores(c).map((k) => `${k.name}:${k.section}`).join('|');
    out.push(`Call Cab(${vbsStr(e)}, ${vbsStr(c.cableType || '')}, ${vbsStr(spec)}, ${c.shielded ? 'True' : 'False'})`);
  }
  return out.join('\r\n');
}

export function buildComponentsScript(comps: DbeComponentItem[], logPath: string, cables: E3Cable[] = []): string {
  return `' E3ProMax: компоненты в БД E3 (сгенерировано автоматически)
Option Explicit
Dim fso, logF
Set fso = CreateObject("Scripting.FileSystemObject")
Set logF = fso.OpenTextFile(${vbsStr(logPath)}, 8, True, -1)
Sub LogL(t)
  ' WScript.Echo в перенаправленный вывод (node/агент) даёт ошибку "Incorrect function" — не даём ей «утечь» в Err вызывающего кода
  On Error Resume Next
  logF.WriteLine "[" & Now & "] " & t
  WScript.Echo t
  Err.Clear
End Sub
On Error Resume Next
' ===== Компоненты (изделия) БД E3: структура как у стандартных компонентов (Gate, Pin, GatePinRelation, COMPONENT_PINS) =====
Dim cdb, compOk, compSkip, compErr
compOk = 0 : compSkip = 0 : compErr = 0
Set cdb = Nothing
Set cdb = CreateObject("ADODB.Connection")
LogL "БД компонентов: " & ${vbsStr(DEFAULT_COMPONENT_DB)}
Err.Clear
cdb.Open ${vbsStr(DEFAULT_COMPONENT_DB)}
If Err.Number <> 0 Then
  LogL "ОШИБКА: нет доступа к БД компонентов: #" & Err.Number & " " & Err.Description
  Err.Clear
  Set cdb = Nothing
End If

Function IIf(c, a, b)
  If c Then IIf = a Else IIf = b
End Function

Function SqlS(v)
  SqlS = "'" & Replace(CStr(v), "'", "''") & "'"
End Function

Function NewGuid()
  On Error Resume Next
  Dim g, i, h
  g = ""
  g = UCase(Mid(CreateObject("Scriptlet.TypeLib").Guid, 2, 36))
  If Len(g) <> 36 Then
    h = Rnd(-(Hour(Now) * 3600 + Minute(Now) * 60 + Second(Now) + 1))
    h = ""
    For i = 1 To 32
      h = h & Hex(Int(Rnd * 16))
    Next
    g = Mid(h, 1, 8) & "-" & Mid(h, 9, 4) & "-4" & Mid(h, 14, 3) & "-A" & Mid(h, 18, 3) & "-" & Mid(h, 21, 12)
  End If
  Err.Clear
  NewGuid = g
End Function

Sub Comp(entry, gatesSpec, descr, art, supp, letter, cls)
  On Error Resume Next
  Dim rs, lc, cid, arr, i, how, gArr, gi, gp, symName, pinNo, symList
  If cdb Is Nothing Then Exit Sub
  Err.Clear
  Set rs = cdb.Execute("SELECT LPNTR, ID, VersionText FROM ComponentData WHERE ENTRY=" & SqlS(entry) & " AND VERSION='1'")
  If Not rs.EOF Then
    If CStr(rs("VersionText").Value & "") <> "E3ProMax" Then
      LogL "  компонент " & entry & ": уже есть в БД (создан не E3ProMax) — не трогаем"
      compSkip = compSkip + 1
      Exit Sub
    End If
    lc = CStr(rs("LPNTR").Value) : cid = CStr(rs("ID").Value)
    rs.Close
    cdb.Execute "DELETE FROM Gate WHERE ENTRY=" & SqlS(lc)
    cdb.Execute "DELETE FROM Pin WHERE ENTRY=" & SqlS(lc)
    cdb.Execute "DELETE FROM GatePinRelation WHERE ENTRY=" & SqlS(lc)
    cdb.Execute "DELETE FROM COMPONENT_PINS WHERE COMPONENT_ID=" & SqlS(cid)
    cdb.Execute "UPDATE ComponentData SET ArticleNumber=" & SqlS(art) & ", Class=" & SqlS(cls) & ", Description=" & SqlS(descr) & ", DeviceLetterCode=" & SqlS(letter) & ", Supplier=" & SqlS(supp) & ", LASTUPDT=Now() WHERE ENTRY=" & SqlS(entry) & " AND VERSION='1'"
    how = "обновлён"
  Else
    rs.Close
    lc = "LC-" & NewGuid() : cid = NewGuid()
    cdb.Execute "INSERT INTO ComponentData (ENTRY, VERSION, LPNTR, ID, ArticleNumber, Class, [Class-main], Description, DeviceLetterCode, Supplier, VersionText, VSTATUS, DATEMAIN, LASTUPDT) VALUES (" & SqlS(entry) & ", '1', " & SqlS(lc) & ", " & SqlS(cid) & ", " & SqlS(art) & ", " & SqlS(cls) & ", 'Electric', " & SqlS(descr) & ", " & SqlS(letter) & ", " & SqlS(supp) & ", 'E3ProMax', 'C', Now(), Now())"
    how = "создан"
  End If
  ' Гейт = символ; выводы нумеруются сквозь все гейты, узел = номер вывода внутри символа
  gArr = Split(gatesSpec, "##")
  pinNo = 0 : symList = ""
  For gi = 1 To UBound(gArr) + 1
    gp = Split(gArr(gi - 1), "=>")
    symName = gp(0)
    symList = symList & IIf(symList = "", "", "+") & symName
    cdb.Execute "INSERT INTO Gate (CCTNAME, COPY, ENTRY) VALUES (" & SqlS(symName) & ", " & gi & ", " & SqlS(lc) & ")"
    arr = Array()
    If UBound(gp) >= 1 Then
      If gp(1) <> "" Then arr = Split(gp(1), "|")
    End If
    For i = 1 To UBound(arr) + 1
      pinNo = pinNo + 1
      cdb.Execute "INSERT INTO Pin (COPY, ENTRY, Flags, FUNCT, LPINEQV, NPINEQV, PHYSPIN, PINEQUIV, TPNPRIO, FLAGS2) VALUES (" & pinNo & ", " & SqlS(lc) & ", 0, 0, 0, 0, " & SqlS(arr(i - 1)) & ", 0, 0, 0)"
      cdb.Execute "INSERT INTO GatePinRelation (ENTRY, GateNumber, NodeNumber, PinNumber, Representation) VALUES (" & SqlS(lc) & ", " & gi & ", " & i & ", " & pinNo & ", 0)"
      cdb.Execute "INSERT INTO COMPONENT_PINS (COMPONENT_ID, GATE_NUMBER, PIN_NUMBER, NODE_NUMBER, ID) VALUES (" & SqlS(cid) & ", " & gi & ", " & pinNo & ", " & i & ", " & SqlS(NewGuid()) & ")"
    Next
  Next
  If Err.Number <> 0 Then
    LogL "  компонент " & entry & ": ОШИБКА #" & Err.Number & " " & Err.Description
    compErr = compErr + 1
    Err.Clear
  Else
    LogL "  компонент " & entry & ": " & how & " (символы " & symList & ", выводов " & pinNo & ")"
    compOk = compOk + 1
  End If
End Sub

${buildComponentCalls(comps)}

Sub CAttr(entry, cid, nm, val, cp)
  cdb.Execute "INSERT INTO ComponentAttribute (AttributeName, AttributeValue, Copy, ENTRY, VERSION, BundleID, NODENO, Flags, ID) VALUES (" & SqlS(nm) & ", " & SqlS(val) & ", " & cp & ", " & SqlS(entry) & ", '1', 0, 0, 1, " & SqlS(cid) & ")"
End Sub

' ===== Кабели: компонент ENTRYTYP=22 + элементы Cable (оболочка, экран, жилы), как у стандартных кабелей БД =====
Sub Cab(entry, descr, coresSpec, shielded)
  On Error Resume Next
  Dim rs, lc, cid, arr, i, kp, cp, parent, how
  If cdb Is Nothing Then Exit Sub
  Err.Clear
  Set rs = cdb.Execute("SELECT LPNTR, VersionText FROM ComponentData WHERE ENTRY=" & SqlS(entry) & " AND VERSION='1'")
  If Not rs.EOF Then
    If CStr(rs("VersionText").Value & "") <> "E3ProMax" Then
      LogL "  кабель " & entry & ": уже есть в БД (создан не E3ProMax) — не трогаем"
      compSkip = compSkip + 1
      Exit Sub
    End If
    lc = CStr(rs("LPNTR").Value)
    rs.Close
    Set rs = cdb.Execute("SELECT ID FROM ComponentData WHERE ENTRY=" & SqlS(entry) & " AND VERSION='1'")
    cid = CStr(rs("ID").Value) : rs.Close
    cdb.Execute "DELETE FROM Cable WHERE ENTRY=" & SqlS(lc)
    cdb.Execute "DELETE FROM CABLE_ELEMENTS WHERE COMPONENT_ID=" & SqlS(cid)
    cdb.Execute "DELETE FROM ComponentAttribute WHERE ENTRY=" & SqlS(entry)
    cdb.Execute "UPDATE ComponentData SET Description=" & SqlS(descr) & ", ArticleNumber=" & SqlS(descr) & ", LASTUPDT=Now() WHERE ENTRY=" & SqlS(entry) & " AND VERSION='1'"
    how = "обновлён"
  Else
    rs.Close
    lc = "LC-" & NewGuid() : cid = NewGuid()
    cdb.Execute "INSERT INTO ComponentData (ENTRY, VERSION, LPNTR, ID, ArticleNumber, Class, [Class-main], Description, DeviceLetterCode, Supplier, VersionText, VSTATUS, ENTRYTYP, DATEMAIN, LASTUPDT) VALUES (" & SqlS(entry) & ", '1', " & SqlS(lc) & ", " & SqlS(cid) & ", " & SqlS(descr) & ", 'Cable', 'Electric', " & SqlS(descr) & ", 'W', 'E3ProMax', 'E3ProMax', 'C', 22, Now(), Now())"
    how = "создан"
  End If
  arr = Split(coresSpec, "|")
  ' как у стандартных кабелей: оболочка (Flags 16), экран (32), жилы с узлами с 4-го; на каждый элемент — строка CABLE_ELEMENTS
  cdb.Execute "INSERT INTO Cable (BundleID, COPY, ENTRY, Name, NODENO, ParentID, Flags, OuterDia) VALUES (1, 1, " & SqlS(lc) & ", 'Mantel', 0, 0, 16, " & (30 + 8 * (UBound(arr) + 1)) & ")"
  cdb.Execute "INSERT INTO CABLE_ELEMENTS (COMPONENT_ID, COPY, ID) VALUES (" & SqlS(cid) & ", 1, " & SqlS(NewGuid()) & ")"
  kp = 1 : parent = 1
  If shielded Then
    kp = 2 : parent = 2
    cdb.Execute "INSERT INTO Cable (BundleID, COPY, ENTRY, Name, NODENO, ParentID, Flags, OuterDia) VALUES (2, 2, " & SqlS(lc) & ", 'SCHIRM1', 0, 1, 32, 0)"
    cdb.Execute "INSERT INTO CABLE_ELEMENTS (COMPONENT_ID, COPY, ID) VALUES (" & SqlS(cid) & ", 2, " & SqlS(NewGuid()) & ")"
  End If
  For i = 0 To UBound(arr)
    cp = Split(arr(i), ":")
    kp = kp + 1
    cdb.Execute "INSERT INTO Cable (BundleID, Color, COPY, CrossSection, ENTRY, Name, NODENO, ParentID, Flags, OuterDia) VALUES (0, 2, " & kp & ", " & cp(1) & ", " & SqlS(lc) & ", " & SqlS(cp(0)) & ", " & (i + 4) & ", " & parent & ", 0, 9.6)"
    cdb.Execute "INSERT INTO CABLE_ELEMENTS (COMPONENT_ID, COPY, ID) VALUES (" & SqlS(cid) & ", " & kp & ", " & SqlS(NewGuid()) & ")"
  Next
  Call CAttr(entry, cid, ".SCHEMATIC_TYPE", "0", 1)
  Call CAttr(entry, cid, ".SCHEMATIC_TYPE", "3", 2)
  Call CAttr(entry, cid, "ArticleType", entry, 1)
  Call CAttr(entry, cid, "CompClass_NumOfCores", CStr(UBound(arr) + 1), 1)
  Call CAttr(entry, cid, "CompClass_Shield", IIf(shielded, "1", "0"), 1)
  Call CAttr(entry, cid, "CompClass_CoreIdent", "Numeric", 1)
  Call CAttr(entry, cid, "CompClass_Diameter", "1.5", 1)
  Call CAttr(entry, cid, "OuterDiameter", "10.0", 1)
  If Err.Number <> 0 Then
    LogL "  кабель " & entry & ": ОШИБКА #" & Err.Number & " " & Err.Description
    compErr = compErr + 1
    Err.Clear
  Else
    LogL "  кабель " & entry & ": " & how & " (жил " & (UBound(arr) + 1) & IIf(shielded, ", экран", "") & ")"
    compOk = compOk + 1
  End If
End Sub

${buildCableCalls(cables)}
If Not cdb Is Nothing Then cdb.Close
LogL "E3_DBE_COMPONENTS_SUMMARY {""ok"":" & compOk & ",""skipped"":" & compSkip & ",""errors"":" & compErr & ",""total"":${comps.length + new Set(cables.map((c) => cableEntryName(c))).size}}"
logF.Close
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projPath = resolve(args.projectPath);
  if (!existsSync(projPath)) throw new Error('Не найден файл проекта: ' + projPath);
  const raw = JSON.parse(readFileSync(projPath, 'utf8'));
  const project = raw.project ?? raw;
  const devices: E3Device[] = project.devices ?? [];
  const library: E3SymbolDef[] = project.symbolLibrary ?? [];

  const picked = args.designations.length
    ? devices.filter((d) => args.designations.includes(String(d.designation).toUpperCase()))
    : devices;
  if (!picked.length) throw new Error('Нет изделий для переноса (проверьте обозначения): ' + args.designations.join(' '));

  // Масштаб символа = мм на пиксель листа, где изделие показано (формат листа / ширина холста), как при переносе
  const FORMAT_MM: Record<string, number> = { A0: 1189, A1: 841, A2: 594, A3: 420, A4: 297 };
  const sheetScale = new Map<string, number>();
  for (const sh of (project.sheets || []) as Array<{ id: string; format?: string; width?: number }>) {
    const mm = FORMAT_MM[String(sh.format || 'A3').toUpperCase().replace('А', 'A')] || 420;
    // как MapX в генераторе переноса: поля 3% (не меньше 4 мм) с каждой стороны
    const pad = Math.max(4, mm * 0.03);
    if (sh.width && sh.width > 0) sheetScale.set(sh.id, (mm - 2 * pad) / sh.width);
  }
  for (const d of picked) (d as E3Device & { _scale?: number })._scale = sheetScale.get(d.sheetId) || 0.25;
  const byName = new Map<string, { name: string; dev: E3Device; shapes: CustomSymbolShape[] }>();
  for (const dev of picked) {
    const name = dbeSymbolName(dev);
    if (!byName.has(name)) byName.set(name, { name, dev, shapes: resolveDeviceShapes(dev, library) });
  }
  const items = [...byName.values()];

  const logDir = resolve('logs');
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const logPath = join(logDir, 'e3-dbe-symbols.log');
  const comps = collectComponents(picked, devices);
  const vbs = args.check
    ? buildCheckScript(items, logPath, comps)
    : args.components
      ? buildComponentsScript(comps, logPath, (project.cables || []) as E3Cable[])
      : buildDbeScript(
          items,
          args.scale,
          logPath,
          comps,
          // форматы листов (ГОСТ-рамка): по одному на уникальное имя
          [...new Map(((project.sheets || []) as E3Sheet[]).map((sh) => [gostFormatName(sh, project as E3Project), sh])).values()]
            .map((sh) => buildFormatVbs(sh, project as E3Project))
            .join('\r\n')
        );
  const vbsPath = join(tmpdir(), 'flux-dbe-symbols.vbs');
  // UTF-16LE с BOM: cscript корректно читает кириллицу независимо от кодовой страницы
  writeFileSync(vbsPath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(vbs.replace(/\r?\n/g, '\r\n'), 'utf16le')]));
  console.log(`Символов к переносу: ${items.length} (${items.map((i) => i.name).join(', ')})`);
  console.log('Скрипт: ' + vbsPath);
  if (args.dry || process.platform !== 'win32') {
    console.log('Режим --dry: E3 не запускается.');
    return;
  }
  execFileSync('cscript.exe', ['//Nologo', '//U', vbsPath], { stdio: 'inherit' });
  console.log('Лог: ' + logPath);
}

const isDirect = process.argv[1] && /e3SymbolsToDbe\.ts$/.test(process.argv[1]);
if (isDirect) {
  try {
    main();
  } catch (e) {
    console.error('ОШИБКА: ' + (e instanceof Error ? e.message : String(e)));
    process.exit(1);
  }
}
