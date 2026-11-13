import type { E3Project, SheetFormat } from './e3Types.ts';

export type CommandPaletteCategory = 'tool' | 'action' | 'view' | 'device' | 'sheet';

export type CommandPaletteAction =
  | { type: 'set-tool'; tool: 'select' | 'wire' | 'pan' }
  | { type: 'rotate-selected' }
  | { type: 'align-selected'; align: 'left' | 'center-x' }
  | { type: 'zoom-fit' }
  | { type: 'zoom-delta'; delta: number }
  | { type: 'toggle-snap' }
  | { type: 'toggle-guides' }
  | { type: 'toggle-grid' }
  | { type: 'autoroute' }
  | { type: 'open-erc' }
  | { type: 'open-bom' }
  | { type: 'open-terminals' }
  | { type: 'open-autonum' }
  | { type: 'export-dxf' }
  | { type: 'open-publish' }
  | { type: 'open-stamp' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'jump-device'; deviceId: string }
  | { type: 'jump-sheet'; sheetId: string };

export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle: string;
  category: CommandPaletteCategory;
  keywords: string[];
  shortcut?: string;
  disabled?: boolean;
  action: CommandPaletteAction;
}

export const COMMAND_CATEGORY_LABELS: Record<CommandPaletteCategory, string> = {
  tool: 'Инструмент',
  action: 'Команда',
  view: 'Вид и Сетка',
  device: 'Аппарат / ОУО',
  sheet: 'Лист',
};

const FORMAT_LABELS: Record<SheetFormat, string> = {
  A4: 'А4',
  A3: 'А3',
  A2: 'А2',
  A1: 'А1',
};

export function buildCommandPaletteItems(
  project: E3Project,
  opts: {
    hasSelection?: boolean;
    selectedDeviceCount?: number;
    canUndo?: boolean;
    canRedo?: boolean;
    snapToGrid?: boolean;
    smartGuides?: boolean;
    showGrid?: boolean;
  } = {}
): CommandPaletteItem[] {
  const hasSel = Boolean(opts.hasSelection);
  const multiSel = (opts.selectedDeviceCount ?? 0) >= 2;
  const sheetById = new Map(project.sheets.map((s) => [s.id, s]));

  const commands: CommandPaletteItem[] = [
    {
      id: 'cmd-wire',
      title: 'Провод / Трассировка цепи (WIRE)',
      subtitle: 'Переключиться в режим проведения электрических связей',
      category: 'tool',
      keywords: ['wire', 'line', 'провод', 'цепь', 'трасса', 'w', 'l'],
      shortcut: 'W / Space',
      action: { type: 'set-tool', tool: 'wire' },
    },
    {
      id: 'cmd-select',
      title: 'Выбор и перемещение (MOVE / SELECT)',
      subtitle: 'Инструмент выделения рамкой и переноса объектов',
      category: 'tool',
      keywords: ['move', 'select', 'выбор', 'переместить', 'm', 'v'],
      shortcut: 'V',
      action: { type: 'set-tool', tool: 'select' },
    },
    {
      id: 'cmd-pan',
      title: 'Панорамирование холста (PAN)',
      subtitle: 'Перемещение камеры по полю чертежа',
      category: 'tool',
      keywords: ['pan', 'hand', 'панорама', 'рука', 'h'],
      shortcut: 'H',
      action: { type: 'set-tool', tool: 'pan' },
    },
    {
      id: 'cmd-rotate',
      title: 'Повернуть выделенное на 90° (ROTATE)',
      subtitle: hasSel
        ? 'Повернуть выбранные аппараты на 90° по часовой стрелке'
        : 'Требуется выделить изделие на схеме',
      category: 'action',
      keywords: ['rotate', 'ro', 'поворот', 'повернуть', 'r'],
      shortcut: 'R',
      disabled: !hasSel,
      action: { type: 'rotate-selected' },
    },
    {
      id: 'cmd-align-left',
      title: 'Выровнять по левому краю (ALIGN LEFT)',
      subtitle: multiSel
        ? 'Выровнять выделенные аппараты по левой границе'
        : 'Выделите 2 или более аппаратов для выравнивания',
      category: 'action',
      keywords: ['align', 'al', 'выровнять', 'лево'],
      disabled: !multiSel,
      action: { type: 'align-selected', align: 'left' },
    },
    {
      id: 'cmd-align-center',
      title: 'Выровнять по центру X (ALIGN CENTER)',
      subtitle: multiSel
        ? 'Выровнять выделенные аппараты по вертикальной оси'
        : 'Выделите 2 или более аппаратов для выравнивания',
      category: 'action',
      keywords: ['align', 'center', 'выровнять', 'центр'],
      disabled: !multiSel,
      action: { type: 'align-selected', align: 'center-x' },
    },
    {
      id: 'cmd-zoom-fit',
      title: 'Показать весь лист (ZOOM EXTENTS)',
      subtitle: 'Вписать рамку ГОСТ активного листа в окно просмотра',
      category: 'view',
      keywords: ['zoom', 'fit', 'extents', 'z', 'масштаб', 'лист'],
      action: { type: 'zoom-fit' },
    },
    {
      id: 'cmd-zoom-in',
      title: 'Увеличить масштаб +15% (ZOOM IN)',
      subtitle: 'Приблизить активную область схемы',
      category: 'view',
      keywords: ['zoom', 'in', 'приблизить', 'увеличить'],
      action: { type: 'zoom-delta', delta: 0.15 },
    },
    {
      id: 'cmd-zoom-out',
      title: 'Уменьшить масштаб -15% (ZOOM OUT)',
      subtitle: 'Отдалить активную область схемы',
      category: 'view',
      keywords: ['zoom', 'out', 'отдалить', 'уменьшить'],
      action: { type: 'zoom-delta', delta: -0.15 },
    },
    {
      id: 'cmd-snap',
      title: `Привязка к сетке: ${opts.snapToGrid ? 'ВКЛ' : 'ВЫКЛ'} (OSNAP / F3)`,
      subtitle: 'Включить или отключить привязку координат к шагу сетки',
      category: 'view',
      keywords: ['snap', 'osnap', 'f3', 'привязка', 'шаг'],
      shortcut: 'F3',
      action: { type: 'toggle-snap' },
    },
    {
      id: 'cmd-ortho',
      title: `Направляющие выравнивания / Орто: ${opts.smartGuides !== false ? 'ВКЛ' : 'ВЫКЛ'} (ORTHO / F8)`,
      subtitle: 'Умные направляющие по осям выводов и центрам блоков',
      category: 'view',
      keywords: ['ortho', 'guides', 'f8', 'орто', 'направляющие'],
      shortcut: 'F8',
      action: { type: 'toggle-guides' },
    },
    {
      id: 'cmd-grid',
      title: `Сетка чертежа: ${opts.showGrid !== false ? 'ПОКАЗАНА' : 'СКРЫТА'} (GRID / F9)`,
      subtitle: 'Показать или скрыть координатную сетку на листе',
      category: 'view',
      keywords: ['grid', 'f9', 'сетка'],
      shortcut: 'F9',
      action: { type: 'toggle-grid' },
    },
    {
      id: 'cmd-autoroute',
      title: 'Автотрассировка проводов на листе (REROUTE)',
      subtitle: 'Перестроить маршруты цепей с обходом блоков УГО',
      category: 'action',
      keywords: ['route', 'reroute', 'автотрассировка', 'выровнять'],
      action: { type: 'autoroute' },
    },
    {
      id: 'cmd-erc',
      title: 'Открыть диагностику ERC (ERC / AUDIT)',
      subtitle: 'Проверка электрических правил, потенциалов и сечений',
      category: 'action',
      keywords: ['erc', 'audit', 'check', 'диагностика', 'ошибки', 'проверка'],
      action: { type: 'open-erc' },
    },
    {
      id: 'cmd-bom',
      title: 'Открыть спецификацию ПЭ3 (BOM)',
      subtitle: 'Перейти во вкладку ведомости элементов ПЭ3',
      category: 'action',
      keywords: ['bom', 'pe3', 'пэ3', 'спецификация'],
      action: { type: 'open-bom' },
    },
    {
      id: 'cmd-terminals',
      title: 'Редактор клеммных рядов (-XT)',
      subtitle: 'Управление перемычками, резервами и листом клеммника',
      category: 'action',
      keywords: ['terminal', 'xt', 'клеммы', 'клеммник'],
      action: { type: 'open-terminals' },
    },
    {
      id: 'cmd-autonum',
      title: 'Автонумерация цепей и ОУО (ГОСТ 2.710)',
      subtitle: 'Пакетная маркировка проводов и переиндексация позиций',
      category: 'action',
      keywords: ['number', 'renumber', 'num', 'автонумерация', 'маркировка'],
      action: { type: 'open-autonum' },
    },
    {
      id: 'cmd-dxf',
      title: 'Экспорт активного листа в AutoCAD (.dxf)',
      subtitle: 'Выгрузить чертёж с блоками INSERT + ATTRIB и слоями ГОСТ',
      category: 'action',
      keywords: ['dxf', 'autocad', 'dxfout', 'экспорт'],
      action: { type: 'export-dxf' },
    },
    {
      id: 'cmd-pdf',
      title: 'Пакетная публикация PDF / DXF (PLOT)',
      subtitle: 'Сформировать многостраничный PDF или архив DXF',
      category: 'action',
      keywords: ['pdf', 'plot', 'publish', 'печать', 'публикация'],
      action: { type: 'open-publish' },
    },
    {
      id: 'cmd-stamp',
      title: 'Редактор основной надписи ГОСТ 2.104 (STAMP)',
      subtitle: 'Редактировать графы штампа и конструкторы шаблонов',
      category: 'action',
      keywords: ['stamp', 'titleblock', 'штамп', 'надпись'],
      action: { type: 'open-stamp' },
    },
    {
      id: 'cmd-undo',
      title: 'Отменить последнее действие (UNDO)',
      subtitle: 'Откатить предыдущее изменение схемы',
      category: 'action',
      keywords: ['undo', 'отменить'],
      shortcut: 'Ctrl+Z',
      disabled: opts.canUndo === false,
      action: { type: 'undo' },
    },
    {
      id: 'cmd-redo',
      title: 'Повторить действие (REDO)',
      subtitle: 'Вернуть отменённое изменение схемы',
      category: 'action',
      keywords: ['redo', 'повторить'],
      shortcut: 'Ctrl+Y',
      disabled: opts.canRedo === false,
      action: { type: 'redo' },
    },
  ];

  const sheetItems: CommandPaletteItem[] = project.sheets.map((s) => ({
    id: `sheet-${s.id}`,
    title: `Лист ${s.number}: ${s.name}`,
    subtitle: `Перейти на лист · Формат ${FORMAT_LABELS[s.format] || s.format} (${s.width}×${s.height})`,
    category: 'sheet',
    keywords: ['лист', 'sheet', `л.${s.number}`, String(s.number), s.name],
    action: { type: 'jump-sheet', sheetId: s.id },
  }));

  const deviceItems: CommandPaletteItem[] = project.devices.map((d) => {
    const sh = sheetById.get(d.sheetId);
    const shInfo = sh ? `Лист ${sh.number} (${sh.name})` : 'Схема';
    return {
      id: `dev-${d.id}`,
      title: `Перейти к ${d.designation} — ${d.componentName}`,
      subtitle: `${shInfo}${d.article ? ` · ${d.article}` : ''}`,
      category: 'device',
      keywords: [d.designation, d.designation.replace(/^-/, ''), d.componentName, d.article, d.manufacturer, 'оуо'],
      action: { type: 'jump-device', deviceId: d.id },
    };
  });

  return [...commands, ...sheetItems, ...deviceItems];
}

export function filterCommandPaletteItems(
  items: CommandPaletteItem[],
  rawQuery: string
): CommandPaletteItem[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    // Show actionable tools/commands + sheets + first few devices when query is empty
    const toolsAndActions = items.filter(
      (i) => i.category === 'tool' || i.category === 'action' || i.category === 'view'
    );
    const sheets = items.filter((i) => i.category === 'sheet');
    const devices = items.filter((i) => i.category === 'device').slice(0, 8);
    return [...toolsAndActions, ...sheets, ...devices];
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ item: CommandPaletteItem; score: number }> = [];

  for (const item of items) {
    const haystack = [item.title, item.subtitle, ...item.keywords].join(' ').toLowerCase();
    const matchesAll = tokens.every((t) => haystack.includes(t));
    if (!matchesAll) continue;

    let score = 0;
    const lowerTitle = item.title.toLowerCase();
    if (item.keywords.some((k) => k.toLowerCase() === q)) score += 120;
    else if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) score += 80;
    if (lowerTitle.includes(q)) score += 40;
    if (item.category === 'tool' || item.category === 'action' || item.category === 'view') score += 15;
    if (!item.disabled) score += 10;
    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
