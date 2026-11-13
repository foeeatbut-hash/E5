import type {
  E3Project,
  E3Sheet,
  E3TitleBlock,
  GostStampForm,
  GostStampTemplate,
  StampTextFieldKey,
} from './e3Types.ts';

export type StampFieldKey = StampTextFieldKey;

export const GOST_ZONE_COLS = ['1', '2', '3', '4', '5', '6'] as const;
export const GOST_ZONE_ROWS = ['А', 'Б', 'В', 'Г', 'Д'] as const;

export const CUSTOM_STAMPS_STORAGE_KEY = 'flux_e3_custom_stamps_v1';

export const STAMP_FIELD_OPTIONS: Array<{ key: StampFieldKey; label: string; shortLabel: string }> = [
  { key: 'documentCode', label: 'Обозначение документа (Графа 2)', shortLabel: 'Шифр' },
  { key: 'projectTitle', label: 'Наименование изделия / проекта (Графа 1)', shortLabel: 'Проект' },
  { key: 'sheetTitle', label: 'Наименование схемы / листа', shortLabel: 'Лист' },
  { key: 'organization', label: 'Организация / Предприятие (Графа 9)', shortLabel: 'Орг.' },
  { key: 'designer', label: 'Разработал', shortLabel: 'Разраб.' },
  { key: 'checker', label: 'Проверил', shortLabel: 'Пров.' },
  { key: 'techControl', label: 'Т. контроль', shortLabel: 'Т.контр.' },
  { key: 'normControl', label: 'Н. контроль', shortLabel: 'Н.контр.' },
  { key: 'approver', label: 'Утвердил', shortLabel: 'Утв.' },
  { key: 'litera', label: 'Литера', shortLabel: 'Лит.' },
  { key: 'mass', label: 'Масса', shortLabel: 'Масса' },
  { key: 'scale', label: 'Масштаб', shortLabel: 'Масш.' },
  { key: 'date', label: 'Дата выпуска', shortLabel: 'Дата' },
  { key: 'invOriginal', label: 'Инв. № подл.', shortLabel: 'Подл.' },
  { key: 'invDuplicate', label: 'Инв. № дубл.', shortLabel: 'Дубл.' },
];

function buildChangeTableCells(
  prefix: 'f1' | 'f2a',
  sx: number,
  sy: number,
  c1: number,
  c2: number,
  c3: number,
  c4: number,
  rx: number,
  _sheet: E3Sheet
): GostStampCell[] {
  // Листовые ревизии ведутся строго внутри программы и не заполняются в штамп листа
  // Row 0 = sy+18..36 (bottom row, right above header), Row 1 = sy+0..18 (top row)
  const out: GostStampCell[] = [];
  for (let rowIdx = 0; rowIdx < 2; rowIdx++) {
    const ry = rowIdx === 0 ? sy + 18 : sy;
    out.push(
      {
        id: `${prefix}-chg-izm-${rowIdx}`,
        x: sx,
        y: ry,
        width: c1 - sx,
        height: 18,
        text: '',
        align: 'center',
        fontSize: 7.5,
      },
      {
        id: `${prefix}-chg-list-${rowIdx}`,
        x: c1,
        y: ry,
        width: c2 - c1,
        height: 18,
        text: '',
        align: 'center',
        fontSize: 7,
      },
      {
        id: `${prefix}-chg-doc-${rowIdx}`,
        x: c2,
        y: ry,
        width: c3 - c2,
        height: 18,
        text: '',
        align: 'center',
        fontSize: 7,
      },
      {
        id: `${prefix}-chg-sign-${rowIdx}`,
        x: c3,
        y: ry,
        width: c4 - c3,
        height: 18,
        text: '',
        align: 'center',
        fontSize: 7,
      },
      {
        id: `${prefix}-chg-date-${rowIdx}`,
        x: c4,
        y: ry,
        width: rx - c4,
        height: 18,
        text: '',
        align: 'center',
        fontSize: 7,
      }
    );
  }
  return out;
}

export const DEFAULT_CUSTOM_STAMP_PRESETS: GostStampTemplate[] = [
  {
    id: 'preset-kip-3col',
    name: 'Штамп КИПиА (3-колоночный)',
    description: 'Компактная основная надпись для схем автоматизации, АТХ и щитов КИП (185×42 мм)',
    width: 540,
    height: 118,
    showArchivalStrip: true,
    isPreset: true,
    cells: [
      { id: 'c1', xPct: 0, yPct: 0, wPct: 14, hPct: 33.33, staticText: 'Разраб.', align: 'left', fontSize: 7.5 },
      { id: 'c2', xPct: 14, yPct: 0, wPct: 18, hPct: 33.33, label: 'Разработал', fieldKey: 'designer', align: 'left', fontSize: 8.5 },
      { id: 'c3', xPct: 0, yPct: 33.33, wPct: 14, hPct: 33.33, staticText: 'Пров.', align: 'left', fontSize: 7.5 },
      { id: 'c4', xPct: 14, yPct: 33.33, wPct: 18, hPct: 33.33, label: 'Проверил', fieldKey: 'checker', align: 'left', fontSize: 8.5 },
      { id: 'c5', xPct: 0, yPct: 66.66, wPct: 14, hPct: 33.34, staticText: 'Утв.', align: 'left', fontSize: 7.5 },
      { id: 'c6', xPct: 14, yPct: 66.66, wPct: 18, hPct: 33.34, label: 'Утвердил', fieldKey: 'approver', align: 'left', fontSize: 8.5 },
      { id: 'c7', xPct: 32, yPct: 0, wPct: 43, hPct: 32, label: 'Обозначение документа', fieldKey: 'documentCode', align: 'center', fontSize: 12, bold: true },
      { id: 'c8', xPct: 32, yPct: 32, wPct: 43, hPct: 36, label: 'Наименование проекта', fieldKey: 'projectTitle', align: 'center', fontSize: 10, bold: true },
      { id: 'c9', xPct: 32, yPct: 68, wPct: 43, hPct: 32, label: 'Наименование листа', fieldKey: 'sheetTitle', align: 'center', fontSize: 9 },
      { id: 'c10', xPct: 75, yPct: 0, wPct: 11, hPct: 26, staticText: 'Лит.', align: 'center', fontSize: 7.5 },
      { id: 'c11', xPct: 86, yPct: 0, wPct: 14, hPct: 26, staticText: 'Дата', align: 'center', fontSize: 7.5 },
      { id: 'c12', xPct: 75, yPct: 26, wPct: 11, hPct: 26, label: 'Литера', fieldKey: 'litera', align: 'center', fontSize: 9.5, bold: true },
      { id: 'c13', xPct: 86, yPct: 26, wPct: 14, hPct: 26, label: 'Дата', fieldKey: 'date', align: 'center', fontSize: 8 },
      { id: 'c14', xPct: 75, yPct: 52, wPct: 25, hPct: 22, staticText: '{SHEET_INFO}', align: 'center', fontSize: 8.5 },
      { id: 'c15', xPct: 75, yPct: 74, wPct: 25, hPct: 26, label: 'Организация', fieldKey: 'organization', align: 'center', fontSize: 8.5, bold: true },
    ],
  },
  {
    id: 'preset-corp-wide',
    name: 'Корпоративный штамп (расширенный)',
    description: 'Штамп с расширенным блоком подписи и местом под шифр заказчика (185×60 мм)',
    width: 540,
    height: 164,
    showArchivalStrip: true,
    isPreset: true,
    cells: [
      { id: 'cw1', xPct: 0, yPct: 0, wPct: 32, hPct: 24, staticText: 'Согласовано / ТК', align: 'center', fontSize: 7.5 },
      { id: 'cw2', xPct: 0, yPct: 24, wPct: 14, hPct: 19, staticText: 'Разраб.', align: 'left', fontSize: 7.5 },
      { id: 'cw3', xPct: 14, yPct: 24, wPct: 18, hPct: 19, label: 'Разработал', fieldKey: 'designer', align: 'left', fontSize: 8.5 },
      { id: 'cw4', xPct: 0, yPct: 43, wPct: 14, hPct: 19, staticText: 'Пров.', align: 'left', fontSize: 7.5 },
      { id: 'cw5', xPct: 14, yPct: 43, wPct: 18, hPct: 19, label: 'Проверил', fieldKey: 'checker', align: 'left', fontSize: 8.5 },
      { id: 'cw6', xPct: 0, yPct: 62, wPct: 14, hPct: 19, staticText: 'Н.контр.', align: 'left', fontSize: 7.5 },
      { id: 'cw7', xPct: 14, yPct: 62, wPct: 18, hPct: 19, label: 'Нормоконтроль', fieldKey: 'normControl', align: 'left', fontSize: 8.5 },
      { id: 'cw8', xPct: 0, yPct: 81, wPct: 14, hPct: 19, staticText: 'Утв.', align: 'left', fontSize: 7.5 },
      { id: 'cw9', xPct: 14, yPct: 81, wPct: 18, hPct: 19, label: 'Утвердил', fieldKey: 'approver', align: 'left', fontSize: 8.5 },
      { id: 'cw10', xPct: 32, yPct: 0, wPct: 68, hPct: 24, label: 'Обозначение документа', fieldKey: 'documentCode', align: 'center', fontSize: 13.5, bold: true },
      { id: 'cw11', xPct: 32, yPct: 24, wPct: 44, hPct: 44, label: 'Наименование проекта', fieldKey: 'projectTitle', align: 'center', fontSize: 10.5, bold: true },
      { id: 'cw12', xPct: 32, yPct: 68, wPct: 44, hPct: 32, label: 'Наименование листа', fieldKey: 'sheetTitle', align: 'center', fontSize: 9.5 },
      { id: 'cw13', xPct: 76, yPct: 24, wPct: 8, hPct: 22, staticText: 'Лит.', align: 'center', fontSize: 7.5 },
      { id: 'cw14', xPct: 84, yPct: 24, wPct: 16, hPct: 22, staticText: 'Масштаб', align: 'center', fontSize: 7.5 },
      { id: 'cw15', xPct: 76, yPct: 46, wPct: 8, hPct: 22, label: 'Литера', fieldKey: 'litera', align: 'center', fontSize: 9.5, bold: true },
      { id: 'cw16', xPct: 84, yPct: 46, wPct: 16, hPct: 22, label: 'Масштаб', fieldKey: 'scale', align: 'center', fontSize: 8.5 },
      { id: 'cw17', xPct: 76, yPct: 68, wPct: 24, hPct: 14, staticText: '{SHEET_INFO}', align: 'center', fontSize: 8 },
      { id: 'cw18', xPct: 76, yPct: 82, wPct: 24, hPct: 18, label: 'Организация', fieldKey: 'organization', align: 'center', fontSize: 9.5, bold: true },
    ],
  },
];

export function loadCustomStampTemplates(): GostStampTemplate[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(CUSTOM_STAMPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomStampTemplates(list: GostStampTemplate[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CUSTOM_STAMPS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore storage quota errors
  }
}

export function mergeStampTemplates(
  project?: E3Project,
  localList: GostStampTemplate[] = []
): GostStampTemplate[] {
  const byId = new Map<string, GostStampTemplate>();
  for (const t of DEFAULT_CUSTOM_STAMP_PRESETS) byId.set(t.id, t);
  for (const t of localList) byId.set(t.id, t);
  for (const t of project?.customStampTemplates || []) byId.set(t.id, t);
  return Array.from(byId.values());
}

export interface GostStampCell {
  id: string;
  fieldKey?: StampFieldKey;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  text: string;
  align?: 'left' | 'center';
  fontSize?: number;
  bold?: boolean;
  editable?: boolean;
}

export interface GostSheetGeometry {
  frame: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  archivalBox: {
    visible: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    rows: Array<{ label: string; value: string; h: number }>;
  };
  stamp: {
    form: GostStampForm;
    templateId?: string;
    templateName?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    lines: Array<{ x1: number; y1: number; x2: number; y2: number; thick?: boolean }>;
    cells: GostStampCell[];
  };
}

/**
 * Computes canonical GOST 2.104-2006 sheet border, coordinate zones, left archival strip,
 * Form 1 / Form 2a, or custom user-designed title block geometry.
 */
export function buildGostSheetGeometry(
  sheet: E3Sheet,
  project: E3Project,
  overrideTemplate?: GostStampTemplate
): GostSheetGeometry {
  const tb = sheet.titleBlock;
  const availableTemplates = mergeStampTemplates(project);
  const customTpl =
    overrideTemplate ||
    (tb.stampForm === 'custom'
      ? availableTemplates.find((t) => t.id === tb.customTemplateId) || availableTemplates[0]
      : undefined);

  const form: GostStampForm = customTpl
    ? 'custom'
    : tb.stampForm === 'form2a' || (tb.stampForm === undefined && sheet.number > 1)
      ? 'form2a'
      : 'form1';

  const left = 56;
  const top = 18;
  const right = Math.max(left + 600, sheet.width - 18);
  const bottom = Math.max(top + 320, sheet.height - 18);

  const rawStampW = customTpl ? customTpl.width : 540;
  const stampW = Math.min(rawStampW, right - left - 20);
  const stampH = customTpl ? Math.min(customTpl.height, bottom - top - 40) : form === 'form1' ? 150 : 54;
  const sx = right - stampW;
  const sy = bottom - stampH;

  // Scale horizontal columns proportionally if stampW < 540
  const k = stampW / 540;
  const col = (mm3: number) => Math.round(mm3 * k);

  // Archival strip along left border (GOST 2.104 Графы 19..23 rotated/compact table)
  const archW = 36;
  const archRows = [
    { label: 'Инв. № подл.', value: tb.invOriginal || 'ПВА-2026', h: 72 },
    { label: 'Подп. и дата', value: tb.date || '11.2026', h: 66 },
    { label: 'Взам. инв. №', value: '', h: 52 },
    { label: 'Инв. № дубл.', value: tb.invDuplicate || '', h: 58 },
    { label: 'Подп. и дата', value: '', h: 62 },
  ];
  const archTotalH = archRows.reduce((s, r) => s + r.h, 0);
  const archBox = {
    visible: customTpl ? customTpl.showArchivalStrip : true,
    x: left - archW,
    y: bottom - archTotalH,
    width: archW,
    height: archTotalH,
    rows: archRows,
  };

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number; thick?: boolean }> = [];
  const cells: GostStampCell[] = [];
  const totalSheets = Math.max(1, project.sheets.length);

  if (customTpl) {
    const lineKeys = new Set<string>();
    const addLine = (x1: number, y1: number, x2: number, y2: number, thick = false) => {
      const rx1 = Math.round(x1 * 10) / 10;
      const ry1 = Math.round(y1 * 10) / 10;
      const rx2 = Math.round(x2 * 10) / 10;
      const ry2 = Math.round(y2 * 10) / 10;
      if (Math.abs(rx1 - rx2) < 0.2 && Math.abs(ry1 - ry2) < 0.2) return;
      const key =
        rx1 < rx2 || (rx1 === rx2 && ry1 <= ry2)
          ? `${rx1},${ry1}-${rx2},${ry2}`
          : `${rx2},${ry2}-${rx1},${ry1}`;
      if (lineKeys.has(key)) return;
      lineKeys.add(key);
      lines.push({ x1: rx1, y1: ry1, x2: rx2, y2: ry2, thick });
    };

    for (const cDef of customTpl.cells) {
      const cx = sx + (cDef.xPct / 100) * stampW;
      const cy = sy + (cDef.yPct / 100) * stampH;
      const cw = Math.max(8, (cDef.wPct / 100) * stampW);
      const ch = Math.max(8, (cDef.hPct / 100) * stampH);

      addLine(cx, cy, cx + cw, cy);
      addLine(cx, cy + ch, cx + cw, cy + ch);
      addLine(cx, cy, cx, cy + ch);
      addLine(cx + cw, cy, cx + cw, cy + ch);

      let text = '';
      if (cDef.fieldKey) {
        if (cDef.fieldKey === 'projectTitle') text = tb.projectTitle || project.name;
        else if (cDef.fieldKey === 'sheetTitle') text = tb.sheetTitle || sheet.name;
        else text = String(tb[cDef.fieldKey] ?? '');
      } else {
        text = (cDef.staticText || '')
          .replace('{SHEET_INFO}', `Лист ${sheet.number} / ${totalSheets}`)
          .replace('{SHEET_NUM}', String(sheet.number))
          .replace('{SHEETS_TOTAL}', String(totalSheets));
      }

      cells.push({
        id: cDef.id,
        fieldKey: cDef.fieldKey,
        label: cDef.label || cDef.staticText,
        x: cx,
        y: cy,
        width: cw,
        height: ch,
        text,
        align: cDef.align || 'center',
        fontSize: cDef.fontSize || 8.5,
        bold: cDef.bold,
        editable: Boolean(cDef.fieldKey),
      });
    }

    return {
      frame: {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      },
      archivalBox: archBox,
      stamp: {
        form: 'custom',
        templateId: customTpl.id,
        templateName: customTpl.name,
        x: sx,
        y: sy,
        width: stampW,
        height: stampH,
        lines,
        cells,
      },
    };
  }

  if (form === 'form1') {
    // Left part (180 px width in 540px stamp = ~65mm scaled): Change table + Signatures
    // Columns in left block: [Изм(24), Лист(30), № докум.(46), Подп.(40), Дата(40)] = 180
    // Signatures rows (bottom 6 rows): Role(50), Name(66), Sign(32), Date(32) = 180
    const leftBlockW = col(190);
    const rightBlockW = stampW - leftBlockW;
    const rx = sx + leftBlockW;

    // 11 rows of 13.6px height (~150px total): top 5 rows change-history + labels, bottom 6 rows signatures
    const topChangeH = 54; // 3 rows x 18
    const sigRowH = (stampH - topChangeH) / 6; // 16px per row

    // Vertical divider between change/signature area and title/code area
    lines.push({ x1: rx, y1: sy, x2: rx, y2: sy + stampH, thick: true });

    // Top-left change table (3 rows: 2 empty + header row)
    const c1 = sx + col(26);
    const c2 = c1 + col(32);
    const c3 = c2 + col(56);
    const c4 = c3 + col(38);
    lines.push({ x1: sx, y1: sy + 18, x2: rx, y2: sy + 18 });
    lines.push({ x1: sx, y1: sy + 36, x2: rx, y2: sy + 36 });
    lines.push({ x1: sx, y1: sy + topChangeH, x2: rx, y2: sy + topChangeH, thick: true });

    for (const xLine of [c1, c2, c3, c4]) {
      lines.push({ x1: xLine, y1: sy, x2: xLine, y2: sy + topChangeH });
    }
    cells.push(
      ...buildChangeTableCells('f1', sx, sy, c1, c2, c3, c4, rx, sheet),
      { id: 'f1-hdr-izm', x: sx, y: sy + 36, width: c1 - sx, height: 18, text: 'Изм.', align: 'center', fontSize: 7.5 },
      { id: 'f1-hdr-list', x: c1, y: sy + 36, width: c2 - c1, height: 18, text: 'Лист', align: 'center', fontSize: 7.5 },
      { id: 'f1-hdr-doc', x: c2, y: sy + 36, width: c3 - c2, height: 18, text: '№ докум.', align: 'center', fontSize: 7.5 },
      { id: 'f1-hdr-sign', x: c3, y: sy + 36, width: c4 - c3, height: 18, text: 'Подп.', align: 'center', fontSize: 7.5 },
      { id: 'f1-hdr-date', x: c4, y: sy + 36, width: rx - c4, height: 18, text: 'Дата', align: 'center', fontSize: 7.5 }
    );

    // Signature block vertical lines: Role(52), Surname(72), Sign(34), Date(32)
    const sRoleX = sx + col(54);
    const sNameX = sRoleX + col(70);
    const sSignX = sNameX + col(34);
    for (const xLine of [sRoleX, sNameX, sSignX]) {
      lines.push({ x1: xLine, y1: sy + topChangeH, x2: xLine, y2: sy + stampH });
    }

    const sigRows: Array<{ role: string; fieldKey: StampFieldKey; value: string; label: string }> = [
      { role: 'Разраб.', fieldKey: 'designer', value: tb.designer || '', label: 'Разработал' },
      { role: 'Пров.', fieldKey: 'checker', value: tb.checker || '', label: 'Проверил' },
      { role: 'Т.контр.', fieldKey: 'techControl', value: tb.techControl || '', label: 'Тех. контроль' },
      { role: '', fieldKey: 'projectTitle', value: '', label: '' },
      { role: 'Н.контр.', fieldKey: 'normControl', value: tb.normControl || '', label: 'Нормоконтроль' },
      { role: 'Утв.', fieldKey: 'approver', value: tb.approver || '', label: 'Утвердил' },
    ];

    sigRows.forEach((sr, idx) => {
      const ry = sy + topChangeH + idx * sigRowH;
      if (idx > 0) {
        lines.push({ x1: sx, y1: ry, x2: rx, y2: ry });
      }
      if (sr.role) {
        cells.push({
          id: `f1-role-${idx}`,
          x: sx,
          y: ry,
          width: sRoleX - sx,
          height: sigRowH,
          text: sr.role,
          align: 'left',
          fontSize: 7.5,
        });
        cells.push({
          id: `f1-sig-${sr.fieldKey}`,
          fieldKey: sr.fieldKey,
          label: sr.label,
          x: sRoleX,
          y: ry,
          width: sNameX - sRoleX,
          height: sigRowH,
          text: sr.value,
          align: 'left',
          fontSize: 8.5,
          editable: true,
        });
        cells.push({
          id: `f1-date-${idx}`,
          fieldKey: 'date',
          label: 'Дата выпуска',
          x: sSignX,
          y: ry,
          width: rx - sSignX,
          height: sigRowH,
          text: idx === 0 ? tb.date || '' : '',
          align: 'center',
          fontSize: 7.5,
          editable: idx === 0,
        });
      }
    });

    // Right side (rightBlockW = ~350px):
    // Row A (top 40px): Обозначение (documentCode)
    // Row B (next 62px): Left=Наименование изделия/листа (210px) | Right=Лит/Масса/Масштаб + Лист/Листов
    // Row C (bottom 48px): Left=sheetTitle/projectTitle | Right=Организация
    const rowA_H = 38;
    const rowB_H = 62;
    const rowC_H = stampH - rowA_H - rowB_H; // 50
    const metaW = col(144);
    const metaX = sx + stampW - metaW;

    lines.push({ x1: rx, y1: sy + rowA_H, x2: sx + stampW, y2: sy + rowA_H, thick: true });
    lines.push({ x1: rx, y1: sy + rowA_H + rowB_H, x2: sx + stampW, y2: sy + rowA_H + rowB_H });
    lines.push({ x1: metaX, y1: sy + rowA_H, x2: metaX, y2: sy + stampH, thick: true });

    // Inside meta block (rowB_H = 62, divided at +20 and +40)
    const mY1 = sy + rowA_H + 18;
    const mY2 = sy + rowA_H + 40;
    lines.push({ x1: metaX, y1: mY1, x2: sx + stampW, y2: mY1 });
    lines.push({ x1: metaX, y1: mY2, x2: sx + stampW, y2: mY2, thick: true });

    // Litera / Mass / Scale columns
    const mCol1 = metaX + col(44);
    const mCol2 = mCol1 + col(50);
    lines.push({ x1: mCol1, y1: sy + rowA_H, x2: mCol1, y2: mY2 });
    lines.push({ x1: mCol2, y1: sy + rowA_H, x2: mCol2, y2: mY2 });

    // Lit / Mass / Scale top headers vs values
    // List / Listov split at metaX + metaW * 0.5
    const mMidX = metaX + Math.round(metaW * 0.48);
    lines.push({ x1: mMidX, y1: mY2, x2: mMidX, y2: sy + rowA_H + rowB_H });

    // Editable cells in Right side
    cells.push(
      {
        id: 'f1-doc-code',
        fieldKey: 'documentCode',
        label: 'Обозначение документа',
        x: rx,
        y: sy,
        width: rightBlockW,
        height: rowA_H,
        text: tb.documentCode,
        align: 'center',
        fontSize: 13,
        bold: true,
        editable: true,
      },
      {
        id: 'f1-project-title',
        fieldKey: 'projectTitle',
        label: 'Наименование изделия / проекта',
        x: rx,
        y: sy + rowA_H,
        width: metaX - rx,
        height: rowB_H,
        text: tb.projectTitle || project.name,
        align: 'center',
        fontSize: 10.5,
        bold: true,
        editable: true,
      },
      {
        id: 'f1-sheet-title',
        fieldKey: 'sheetTitle',
        label: 'Наименование схемы / листа',
        x: rx,
        y: sy + rowA_H + rowB_H,
        width: metaX - rx,
        height: rowC_H,
        text: tb.sheetTitle || sheet.name,
        align: 'center',
        fontSize: 9.5,
        editable: true,
      },
      {
        id: 'f1-hdr-lit',
        x: metaX,
        y: sy + rowA_H,
        width: mCol1 - metaX,
        height: 18,
        text: 'Лит.',
        align: 'center',
        fontSize: 7.5,
      },
      {
        id: 'f1-hdr-mass',
        x: mCol1,
        y: sy + rowA_H,
        width: mCol2 - mCol1,
        height: 18,
        text: 'Масса',
        align: 'center',
        fontSize: 7.5,
      },
      {
        id: 'f1-hdr-scale',
        x: mCol2,
        y: sy + rowA_H,
        width: sx + stampW - mCol2,
        height: 18,
        text: 'Масштаб',
        align: 'center',
        fontSize: 7.5,
      },
      {
        id: 'f1-val-lit',
        fieldKey: 'litera',
        label: 'Литера',
        x: metaX,
        y: mY1,
        width: mCol1 - metaX,
        height: mY2 - mY1,
        text: tb.litera || 'Р',
        align: 'center',
        fontSize: 9.5,
        bold: true,
        editable: true,
      },
      {
        id: 'f1-val-mass',
        fieldKey: 'mass',
        label: 'Масса',
        x: mCol1,
        y: mY1,
        width: mCol2 - mCol1,
        height: mY2 - mY1,
        text: tb.mass || '—',
        align: 'center',
        fontSize: 8.5,
        editable: true,
      },
      {
        id: 'f1-val-scale',
        fieldKey: 'scale',
        label: 'Масштаб',
        x: mCol2,
        y: mY1,
        width: sx + stampW - mCol2,
        height: mY2 - mY1,
        text: tb.scale || 'б/м',
        align: 'center',
        fontSize: 8.5,
        editable: true,
      },
      {
        id: 'f1-sheet-num',
        x: metaX,
        y: mY2,
        width: mMidX - metaX,
        height: sy + rowA_H + rowB_H - mY2,
        text: `Лист ${sheet.number}`,
        align: 'center',
        fontSize: 8.5,
      },
      {
        id: 'f1-sheet-total',
        x: mMidX,
        y: mY2,
        width: sx + stampW - mMidX,
        height: sy + rowA_H + rowB_H - mY2,
        text: `Листов ${totalSheets}`,
        align: 'center',
        fontSize: 8.5,
      },
      {
        id: 'f1-org',
        fieldKey: 'organization',
        label: 'Организация / Предприятие',
        x: metaX,
        y: sy + rowA_H + rowB_H,
        width: metaW,
        height: rowC_H,
        text: tb.organization || '',
        align: 'center',
        fontSize: 9.5,
        bold: true,
        editable: true,
      }
    );
  } else {
    // GOST 2.104-2006 Form 2a (subsequent sheets: 15mm height x 185mm width -> 54 x 540 px)
    // Columns: [Изм(24) | Лист(28) | № докум.(56) | Подп.(34) | Дата(34)] + [Обозначение + Лист/Название] + [Лист N]
    const leftBlockW = col(176);
    const listColW = col(54);
    const rx = sx + leftBlockW;
    const lx = sx + stampW - listColW;

    const c1 = sx + col(24);
    const c2 = c1 + col(28);
    const c3 = c2 + col(56);
    const c4 = c3 + col(34);

    lines.push({ x1: rx, y1: sy, x2: rx, y2: sy + stampH, thick: true });
    lines.push({ x1: lx, y1: sy, x2: lx, y2: sy + stampH, thick: true });
    lines.push({ x1: sx, y1: sy + 18, x2: rx, y2: sy + 18 });
    lines.push({ x1: sx, y1: sy + 36, x2: rx, y2: sy + 36 });
    lines.push({ x1: rx, y1: sy + 27, x2: lx, y2: sy + 27 });
    lines.push({ x1: lx, y1: sy + 18, x2: sx + stampW, y2: sy + 18 });
    for (const xLine of [c1, c2, c3, c4]) {
      lines.push({ x1: xLine, y1: sy, x2: xLine, y2: sy + stampH });
    }

    cells.push(
      ...buildChangeTableCells('f2a', sx, sy, c1, c2, c3, c4, rx, sheet),
      { id: 'f2a-hdr-izm', x: sx, y: sy + 36, width: c1 - sx, height: 18, text: 'Изм.', align: 'center', fontSize: 7.5 },
      { id: 'f2a-hdr-list', x: c1, y: sy + 36, width: c2 - c1, height: 18, text: 'Лист', align: 'center', fontSize: 7.5 },
      { id: 'f2a-hdr-doc', x: c2, y: sy + 36, width: c3 - c2, height: 18, text: '№ докум.', align: 'center', fontSize: 7.5 },
      { id: 'f2a-hdr-sign', x: c3, y: sy + 36, width: c4 - c3, height: 18, text: 'Подп.', align: 'center', fontSize: 7.5 },
      { id: 'f2a-hdr-date', x: c4, y: sy + 36, width: rx - c4, height: 18, text: 'Дата', align: 'center', fontSize: 7.5 },
      {
        id: 'f2a-doc-code',
        fieldKey: 'documentCode',
        label: 'Обозначение документа',
        x: rx,
        y: sy,
        width: lx - rx,
        height: 27,
        text: tb.documentCode,
        align: 'center',
        fontSize: 12,
        bold: true,
        editable: true,
      },
      {
        id: 'f2a-sheet-title',
        fieldKey: 'sheetTitle',
        label: 'Наименование листа',
        x: rx,
        y: sy + 27,
        width: lx - rx,
        height: 27,
        text: tb.sheetTitle || sheet.name,
        align: 'center',
        fontSize: 9.5,
        editable: true,
      },
      {
        id: 'f2a-hdr-sheet',
        x: lx,
        y: sy,
        width: listColW,
        height: 18,
        text: 'Лист',
        align: 'center',
        fontSize: 7.5,
      },
      {
        id: 'f2a-val-sheet',
        x: lx,
        y: sy + 18,
        width: listColW,
        height: 36,
        text: String(sheet.number),
        align: 'center',
        fontSize: 12,
        bold: true,
      }
    );
  }

  return {
    frame: {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    },
    archivalBox: archBox,
    stamp: {
      form,
      x: sx,
      y: sy,
      width: stampW,
      height: stampH,
      lines,
      cells,
    },
  };
}

export interface FittedStampText {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

export function estimateStampTextWidth(text: string, fontSize: number, bold?: boolean): number {
  let widthUnits = 0;
  for (const ch of text) {
    if (ch === ' ' || ch === '.' || ch === ',' || ch === ':' || ch === '-' || ch === '/' || ch === '|') {
      widthUnits += 0.36;
    } else if ((ch >= 'А' && ch <= 'Я') || ch === 'Ё') {
      widthUnits += 0.78;
    } else if ((ch >= 'а' && ch <= 'я') || ch === 'ё') {
      widthUnits += 0.62;
    } else if (ch >= 'A' && ch <= 'Z') {
      widthUnits += 0.72;
    } else if (ch === '«' || ch === '»' || ch === '"' || ch === '№') {
      widthUnits += 0.68;
    } else {
      widthUnits += 0.62;
    }
  }
  return widthUnits * fontSize * (bold ? 1.08 : 1.0);
}

/**
 * Fits text inside a GOST/custom stamp cell without overflowing boundaries:
 * wraps onto 2 lines when tall enough, scales font down proportionally, and truncates with ellipsis as last resort.
 */
export function fitStampCellText(
  text: string,
  cellWidth: number,
  cellHeight: number,
  baseFontSize = 8.5,
  bold?: boolean
): FittedStampText {
  const clean = text.trim();
  const maxW = Math.max(8, cellWidth - 8);
  const maxH = Math.max(8, cellHeight - 4);
  if (!clean) {
    return { lines: [], fontSize: baseFontSize, lineHeight: baseFontSize * 1.15 };
  }

  const singleEstW = estimateStampTextWidth(clean, baseFontSize, bold);
  if (singleEstW <= maxW && baseFontSize <= maxH) {
    return { lines: [clean], fontSize: baseFontSize, lineHeight: baseFontSize * 1.15 };
  }

  const canWrap2 = maxH >= 17 && (clean.includes(' ') || clean.includes('«'));
  if (canWrap2) {
    const normalized = clean.replace(/([^\s])(«)/g, '$1 $2');
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      let bestSplit: [string, string] = [words[0], words.slice(1).join(' ')];
      let bestMaxRatio = Infinity;
      for (let i = 1; i < words.length; i++) {
        const l1 = words.slice(0, i).join(' ');
        const l2 = words.slice(i).join(' ');
        const wMax = Math.max(
          estimateStampTextWidth(l1, baseFontSize, bold),
          estimateStampTextWidth(l2, baseFontSize, bold)
        );
        if (wMax < bestMaxRatio) {
          bestMaxRatio = wMax;
          bestSplit = [l1, l2];
        }
      }

      const maxTwoLineFs = Math.min(baseFontSize, maxH / 2.35);
      const longestLine =
        estimateStampTextWidth(bestSplit[0], 1, bold) >= estimateStampTextWidth(bestSplit[1], 1, bold)
          ? bestSplit[0]
          : bestSplit[1];
      const estAt1 = Math.max(1, estimateStampTextWidth(longestLine, 1, bold));
      const fitFs = Math.min(maxTwoLineFs, maxW / estAt1);
      if (fitFs >= 5.2) {
        const finalFs = Number(fitFs.toFixed(2));
        return {
          lines: bestSplit,
          fontSize: finalFs,
          lineHeight: Number((finalFs * 1.16).toFixed(2)),
        };
      }
    }
  }

  const estAt1 = Math.max(1, estimateStampTextWidth(clean, 1, bold));
  const rawFs = Math.min(baseFontSize, maxH * 0.86, maxW / estAt1);
  const finalFs = Math.max(4.8, Number(rawFs.toFixed(2)));
  let line = clean;
  if (estimateStampTextWidth(line, finalFs, bold) > maxW) {
    while (line.length > 3 && estimateStampTextWidth(`${line}…`, finalFs, bold) > maxW) {
      line = line.slice(0, -1);
    }
    line = `${line.trimEnd()}…`;
  }
  return {
    lines: [line],
    fontSize: finalFs,
    lineHeight: Number((finalFs * 1.15).toFixed(2)),
  };
}
