import type { E3Project, SheetFormat } from './e3Types.ts';

export type CommandPaletteCategory = 'tool' | 'action' | 'view' | 'device' | 'sheet';

export type CommandPaletteAction =
  | { type: 'set-tool'; tool: 'select' | 'wire' | 'pan' }
  | { type: 'copy-selected' }
  | { type: 'paste-clipboard' }
  | { type: 'duplicate-selected' }
  | { type: 'delete-selected' }
  | { type: 'rotate-selected' }
  | { type: 'align-selected'; align: 'left' | 'center-x' }
  | { type: 'zoom-fit' }
  | { type: 'zoom-delta'; delta: number }
  | { type: 'zoom-percent'; percent: number }
  | { type: 'toggle-snap' }
  | { type: 'toggle-guides' }
  | { type: 'toggle-grid' }
  | { type: 'toggle-crosshair' }
  | { type: 'autoroute' }
  | { type: 'open-erc' }
  | { type: 'open-health' }
  | { type: 'open-bom' }
  | { type: 'open-terminals' }
  | { type: 'open-autonum' }
  | { type: 'open-catalog' }
  | { type: 'open-hvac-wizard' }
  | { type: 'open-symbol-designer' }
  | { type: 'insert-sheet-table'; tableKind: 'bom' | 'cables' }
  | { type: 'save-session' }
  | { type: 'add-sheet' }
  | { type: 'export-dxf' }
  | { type: 'export-pdf' }
  | { type: 'open-publish' }
  | { type: 'open-stamp' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'open-find'; initialQuery?: string }
  | { type: 'jump-device'; deviceId: string }
  | { type: 'jump-wire'; wireId: string }
  | { type: 'jump-annotation'; annotationId: string }
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
    hasClipboard?: boolean;
    selectedDeviceCount?: number;
    canUndo?: boolean;
    canRedo?: boolean;
    snapToGrid?: boolean;
    smartGuides?: boolean;
    showGrid?: boolean;
    showCrosshair?: boolean;
  } = {}
): CommandPaletteItem[] {
  const hasSel = Boolean(opts.hasSelection);
  const multiSel = (opts.selectedDeviceCount ?? 0) >= 2;
  const sheetById = new Map(project.sheets.map((s) => [s.id, s]));

  const commands: CommandPaletteItem[] = [
    {
      id: 'cmd-find',
      title: 'Найти в проекте: аппарат, цепь, текст (НАЙТИ / FIND)',
      subtitle: 'Поиск по ОУО, маркировке жил, наименованию или тексту аннотаций',
      category: 'action',
      keywords: ['найти', 'поиск', 'find', 'search', 'f', 'ctrl+k'],
      shortcut: 'НАЙТИ <текст>',
      action: { type: 'open-find' },
    },
    {
      id: 'cmd-wire',
      title: 'Провод / Линия / Отрезок (WIRE / ПРОВОД / ЛИНИЯ)',
      subtitle: 'Переключиться в режим проведения электрических связей',
      category: 'tool',
      keywords: ['wire', 'line', 'провод', 'линия', 'отрезок', 'проводка', 'цепь', 'трасса', 'w', 'l', 'л'],
      shortcut: 'W / Space',
      action: { type: 'set-tool', tool: 'wire' },
    },
    {
      id: 'cmd-select',
      title: 'Выбор и перенос (MOVE / SELECT / ПЕРЕНЕСТИ)',
      subtitle: 'Инструмент выделения рамкой и перемещения объектов',
      category: 'tool',
      keywords: ['move', 'select', 'выбор', 'перенести', 'переместить', 'сдвиг', 'm', 'v', 'п'],
      shortcut: 'V',
      action: { type: 'set-tool', tool: 'select' },
    },
    {
      id: 'cmd-pan',
      title: 'Панорамирование холста (PAN / ПАНОРАМА)',
      subtitle: 'Перемещение камеры по полю чертежа',
      category: 'tool',
      keywords: ['pan', 'hand', 'панорама', 'рука', 'сдвинуть', 'h', 'p'],
      shortcut: 'H',
      action: { type: 'set-tool', tool: 'pan' },
    },
    {
      id: 'cmd-rotate',
      title: 'Повернуть выделенное на 90° (ROTATE / ПОВЕРНУТЬ)',
      subtitle: hasSel
        ? 'Повернуть выбранные аппараты на 90° по часовой стрелке'
        : 'Требуется выделить изделие на схеме',
      category: 'action',
      keywords: ['rotate', 'ro', 'поворот', 'повернуть', 'вращать', 'r'],
      shortcut: 'R',
      disabled: !hasSel,
      action: { type: 'rotate-selected' },
    },
    {
      id: 'cmd-copy',
      title: 'Копировать выделенное (COPY / КОПИРОВАТЬ)',
      subtitle: 'Скопировать выделенные аппараты, внутренние провода и аннотации',
      category: 'action',
      keywords: ['copy', 'co', 'cp', 'копировать', 'копия', 'кп'],
      shortcut: 'Ctrl+C',
      disabled: !hasSel,
      action: { type: 'copy-selected' },
    },
    {
      id: 'cmd-paste',
      title: 'Вставить из буфера обмена (PASTE / ВСТАВИТЬ)',
      subtitle: 'Вставить скопированный фрагмент схемы со сдвигом',
      category: 'action',
      keywords: ['paste', 'pasteclip', 'вставить', 'вставка'],
      shortcut: 'Ctrl+V',
      disabled: opts.hasClipboard === false,
      action: { type: 'paste-clipboard' },
    },
    {
      id: 'cmd-duplicate',
      title: 'Дублировать выделенное (DUPLICATE / ДУБЛЬ)',
      subtitle: 'Быстрое создание копии выделенных элементов на активном листе',
      category: 'action',
      keywords: ['duplicate', 'дублировать', 'дубль', 'клонировать'],
      shortcut: 'Ctrl+D',
      disabled: !hasSel,
      action: { type: 'duplicate-selected' },
    },
    {
      id: 'cmd-delete',
      title: 'Удалить выделенное (ERASE / УДАЛИТЬ / СТЕРЕТЬ)',
      subtitle: 'Удалить выбранные аппараты, провода или аннотации',
      category: 'action',
      keywords: ['erase', 'delete', 'del', 'e', 'удалить', 'стереть', 'уд'],
      shortcut: 'Del',
      disabled: !hasSel,
      action: { type: 'delete-selected' },
    },
    {
      id: 'cmd-align-left',
      title: 'Выровнять по левому краю (ALIGN LEFT / ВЫРОВНЯТЬ)',
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
      title: 'Показать весь лист (ZOOM EXTENTS / ПОКАЗАТЬ)',
      subtitle: 'Вписать рамку ГОСТ активного листа в окно просмотра',
      category: 'view',
      keywords: ['zoom', 'fit', 'extents', 'z', 'ze', 'масштаб', 'лист', 'показать', 'вписать', 'всё'],
      action: { type: 'zoom-fit' },
    },
    {
      id: 'cmd-zoom-in',
      title: 'Увеличить масштаб +15% (ZOOM IN / ПРИБЛИЗИТЬ)',
      subtitle: 'Приблизить активную область схемы',
      category: 'view',
      keywords: ['zoom', 'in', 'приблизить', 'увеличить', 'z+'],
      action: { type: 'zoom-delta', delta: 0.15 },
    },
    {
      id: 'cmd-zoom-out',
      title: 'Уменьшить масштаб -15% (ZOOM OUT / ОТДАЛИТЬ)',
      subtitle: 'Отдалить активную область схемы',
      category: 'view',
      keywords: ['zoom', 'out', 'отдалить', 'уменьшить', 'z-'],
      action: { type: 'zoom-delta', delta: -0.15 },
    },
    {
      id: 'cmd-snap',
      title: `Привязка к сетке: ${opts.snapToGrid ? 'ВКЛ' : 'ВЫКЛ'} (OSNAP / ПРИВЯЗКА / F3)`,
      subtitle: 'Включить или отключить привязку координат к шагу сетки',
      category: 'view',
      keywords: ['snap', 'osnap', 'f3', 'привязка', 'шаг', 'привязать'],
      shortcut: 'F3',
      action: { type: 'toggle-snap' },
    },
    {
      id: 'cmd-ortho',
      title: `Направляющие / Орто: ${opts.smartGuides !== false ? 'ВКЛ' : 'ВЫКЛ'} (ORTHO / ОРТО / F8)`,
      subtitle: 'Умные направляющие по осям выводов и центрам блоков',
      category: 'view',
      keywords: ['ortho', 'guides', 'f8', 'орто', 'направляющие'],
      shortcut: 'F8',
      action: { type: 'toggle-guides' },
    },
    {
      id: 'cmd-grid',
      title: `Сетка чертежа: ${opts.showGrid !== false ? 'ПОКАЗАНА' : 'СКРЫТА'} (GRID / СЕТКА / F9)`,
      subtitle: 'Показать или скрыть координатную сетку на листе',
      category: 'view',
      keywords: ['grid', 'f9', 'сетка'],
      shortcut: 'F9',
      action: { type: 'toggle-grid' },
    },
    {
      id: 'cmd-crosshair',
      title: `Перекрестие курсора: ${opts.showCrosshair !== false ? 'ВКЛ' : 'ВЫКЛ'} (CROSSHAIR / ПРИЦЕЛ)`,
      subtitle: 'Глобальные линии перекрестия на всё поле чертежа',
      category: 'view',
      keywords: ['crosshair', 'прицел', 'перекрестие'],
      action: { type: 'toggle-crosshair' },
    },
    {
      id: 'cmd-autoroute',
      title: 'Автотрассировка проводов на листе (REROUTE / ТРАССА)',
      subtitle: 'Перестроить маршруты цепей с обходом блоков УГО',
      category: 'action',
      keywords: ['route', 'reroute', 'автотрассировка', 'трассировка', 'автотрасса'],
      action: { type: 'autoroute' },
    },
    {
      id: 'cmd-symbol-designer',
      title: 'Редактор пользовательских УГО (SYMBOL / УГО)',
      subtitle: 'Визуальное рисование контуров и выводов нового символа по сетке',
      category: 'action',
      keywords: ['symbol', 'block', 'уго', 'редакторуго', 'конструкторуго', 'символ', 'блок'],
      action: { type: 'open-symbol-designer' },
    },
    {
      id: 'cmd-table-bom',
      title: 'Вставить таблицу ПЭ3 на лист ГОСТ (BOMTABLE / ТАБЛИЦАПЭ3)',
      subtitle: 'Разместить автообновляемый перечень элементов прямо на чертеже',
      category: 'action',
      keywords: ['bomtable', 'table', 'таблицапэ3', 'таблица', 'пэ3налист'],
      action: { type: 'insert-sheet-table', tableKind: 'bom' },
    },
    {
      id: 'cmd-table-cables',
      title: 'Вставить кабельный журнал на лист (CABLETABLE / ТАБЛИЦАКАБ)',
      subtitle: 'Разместить автообновляемую таблицу кабелей прямо на чертеже',
      category: 'action',
      keywords: ['cabletable', 'таблицакаб', 'кабжурнал', 'кабелиналист'],
      action: { type: 'insert-sheet-table', tableKind: 'cables' },
    },
    {
      id: 'cmd-add-sheet',
      title: 'Добавить новый лист схемы (ADDSHEET / НОВЫЙЛИСТ)',
      subtitle: 'Создать дополнительный лист ГОСТ в проекте',
      category: 'action',
      keywords: ['addsheet', 'layout', 'новыйлист', 'добавитьлист'],
      action: { type: 'add-sheet' },
    },
    {
      id: 'cmd-save-session',
      title: 'Сохранить сессию проекта (SAVE / СОХРАНИТЬ)',
      subtitle: 'Зафиксировать проект в локальной сессии и списке недавних',
      category: 'action',
      keywords: ['save', 'qsave', 'сохранить', 'сессия'],
      action: { type: 'save-session' },
    },
    {
      id: 'cmd-catalog',
      title: 'Открыть базу изделий и УГО (CATALOG / КАТАЛОГ / БАЗА)',
      subtitle: 'Переключиться в библиотеку стандартных и пользовательских УГО',
      category: 'action',
      keywords: ['catalog', 'insert', 'каталог', 'база', 'библиотека', 'изделия'],
      action: { type: 'open-catalog' },
    },
    {
      id: 'cmd-hvac',
      title: 'Мастер схем ФСА / КИПиА вентиляции (HVAC / ФСА)',
      subtitle: 'Автоматическая генерация принципиальной схемы установки',
      category: 'action',
      keywords: ['hvac', 'fsa', 'фса', 'мастер', 'вентиляция'],
      action: { type: 'open-hvac-wizard' },
    },
    {
      id: 'cmd-erc',
      title: 'Открыть диагностику ERC (ERC / AUDIT / ПРОВЕРКА)',
      subtitle: 'Проверка электрических правил, потенциалов и сечений',
      category: 'action',
      keywords: ['erc', 'audit', 'check', 'диагностика', 'ошибки', 'проверка', 'аудит'],
      action: { type: 'open-erc' },
    },
    {
      id: 'cmd-health',
      title: 'Монитор здоровья и телеметрия процессов (HEALTH / ТЕЛЕМЕТРИЯ / ЛАГИ)',
      subtitle: 'График частоты логов, производительность кадров, длительность процессов и трассировка UI',
      category: 'action',
      keywords: ['health', 'telemetry', 'logs', 'perf', 'fps', 'здоровье', 'телеметрия', 'логи', 'лаги', 'производительность'],
      action: { type: 'open-health' },
    },
    {
      id: 'cmd-bom',
      title: 'Открыть спецификацию ПЭ3 (BOM / ПЭ3)',
      subtitle: 'Перейти во вкладку ведомости элементов ПЭ3',
      category: 'action',
      keywords: ['bom', 'pe3', 'пэ3', 'спецификация', 'ведомость'],
      action: { type: 'open-bom' },
    },
    {
      id: 'cmd-terminals',
      title: 'Редактор клеммных рядов (TERMINAL / КЛЕММЫ / XT)',
      subtitle: 'Управление перемычками, резервами и листом клеммника',
      category: 'action',
      keywords: ['terminal', 'xt', 'клеммы', 'клеммник'],
      action: { type: 'open-terminals' },
    },
    {
      id: 'cmd-autonum',
      title: 'Автонумерация цепей и ОУО (NUMBER / НУМЕРАЦИЯ)',
      subtitle: 'Пакетная маркировка проводов и переиндексация позиций ГОСТ 2.710',
      category: 'action',
      keywords: ['number', 'renumber', 'num', 'автонумерация', 'нумерация', 'маркировка'],
      action: { type: 'open-autonum' },
    },
    {
      id: 'cmd-dxf',
      title: 'Экспорт активного листа в AutoCAD (.dxf) (DXF / DXFOUT)',
      subtitle: 'Выгрузить чертёж с блоками INSERT + ATTRIB и слоями ГОСТ',
      category: 'action',
      keywords: ['dxf', 'autocad', 'dxfout', 'экспорт', 'дхф', 'автокад'],
      action: { type: 'export-dxf' },
    },
    {
      id: 'cmd-pdf',
      title: 'Быстрый экспорт многостраничного PDF (PDF / ПДФ)',
      subtitle: 'Сформировать векторный PDF всего проекта',
      category: 'action',
      keywords: ['pdf', 'пдф'],
      action: { type: 'export-pdf' },
    },
    {
      id: 'cmd-publish',
      title: 'Пакетная публикация PDF / DXF (PLOT / ПЕЧАТЬ)',
      subtitle: 'Настроить и выгрузить многостраничный PDF или архив DXF',
      category: 'action',
      keywords: ['plot', 'publish', 'печать', 'публикация'],
      action: { type: 'open-publish' },
    },
    {
      id: 'cmd-stamp',
      title: 'Редактор основной надписи ГОСТ 2.104 (STAMP / ШТАМП)',
      subtitle: 'Редактировать графы штампа и конструкторы шаблонов',
      category: 'action',
      keywords: ['stamp', 'titleblock', 'штамп', 'надпись'],
      action: { type: 'open-stamp' },
    },
    {
      id: 'cmd-undo',
      title: 'Отменить последнее действие (UNDO / ОТМЕНИТЬ / ОТКАТ)',
      subtitle: 'Откатить предыдущее изменение схемы',
      category: 'action',
      keywords: ['undo', 'u', 'отменить', 'откат', 'назад'],
      shortcut: 'Ctrl+Z',
      disabled: opts.canUndo === false,
      action: { type: 'undo' },
    },
    {
      id: 'cmd-redo',
      title: 'Повторить действие (REDO / ПОВТОРИТЬ)',
      subtitle: 'Вернуть отменённое изменение схемы',
      category: 'action',
      keywords: ['redo', 'повторить', 'вперёд', 'вперед'],
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
    keywords: ['лист', 'sheet', `л.${s.number}`, `л${s.number}`, String(s.number), s.name],
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
    if (item.keywords.some((k) => k.toLowerCase() === q)) score += 140;
    else if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) score += 85;
    if (lowerTitle.includes(q)) score += 40;
    if (item.category === 'tool' || item.category === 'action' || item.category === 'view') score += 15;
    if (!item.disabled) score += 10;
    scored.push({ item, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

export interface CommandLineResolution {
  status: 'ok' | 'disabled' | 'not_found';
  message: string;
  action?: CommandPaletteAction;
}

export function resolveCommandLineInput(
  rawInput: string,
  items: CommandPaletteItem[],
  project: E3Project
): CommandLineResolution {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { status: 'not_found', message: 'Введите команду (например: НАЙТИ -KM1, ПРОВОД, СЕТКА, УГО)' };
  }

  const parts = trimmed.split(/\s+/);
  const head = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ').trim();

  // 1. Explicit FIND / НАЙТИ / ПОИСК with optional argument
  if (head === 'найти' || head === 'поиск' || head === 'find' || head === 'search') {
    if (!rest) {
      return {
        status: 'ok',
        message: 'Открыта палитра поиска (введите ОУО, цепь или текст)',
        action: { type: 'open-find' },
      };
    }
    const q = rest.toLowerCase();
    const devMatch =
      project.devices.find((d) => d.designation.toLowerCase() === q || d.designation.replace(/^-/, '').toLowerCase() === q) ||
      project.devices.find(
        (d) =>
          d.designation.toLowerCase().includes(q) ||
          d.componentName.toLowerCase().includes(q) ||
          d.article.toLowerCase().includes(q)
      );
    if (devMatch) {
      return {
        status: 'ok',
        message: `Найдено изделие ${devMatch.designation} (${devMatch.componentName})`,
        action: { type: 'jump-device', deviceId: devMatch.id },
      };
    }
    const wireMatch =
      project.wires.find((w) => w.wireNumber.toLowerCase() === q || w.netName.toLowerCase() === q) ||
      project.wires.find(
        (w) => w.wireNumber.toLowerCase().includes(q) || w.netName.toLowerCase().includes(q)
      );
    if (wireMatch) {
      return {
        status: 'ok',
        message: `Найдена цепь ${wireMatch.wireNumber} (${wireMatch.netName})`,
        action: { type: 'jump-wire', wireId: wireMatch.id },
      };
    }
    const annMatch = (project.annotations || []).find((a) =>
      (a.text || '').toLowerCase().includes(q)
    );
    if (annMatch) {
      return {
        status: 'ok',
        message: `Найдена надпись «${annMatch.text.slice(0, 32)}»`,
        action: { type: 'jump-annotation', annotationId: annMatch.id },
      };
    }
    const sheetMatch = project.sheets.find(
      (s) => String(s.number) === q || s.name.toLowerCase().includes(q)
    );
    if (sheetMatch) {
      return {
        status: 'ok',
        message: `Переход на Лист ${sheetMatch.number}: ${sheetMatch.name}`,
        action: { type: 'jump-sheet', sheetId: sheetMatch.id },
      };
    }
    return { status: 'not_found', message: `Объект «${rest}» не найден в проекте` };
  }

  // 2. Sheet jump: ЛИСТ <N|название> / SHEET <N>
  if ((head === 'лист' || head === 'sheet') && rest) {
    const q = rest.toLowerCase();
    const sh =
      project.sheets.find((s) => String(s.number) === q) ||
      project.sheets.find((s) => s.name.toLowerCase().includes(q));
    if (sh) {
      return {
        status: 'ok',
        message: `Лист ${sh.number}: ${sh.name}`,
        action: { type: 'jump-sheet', sheetId: sh.id },
      };
    }
    return { status: 'not_found', message: `Лист «${rest}» не найден` };
  }

  // 3. Zoom numeric percentage: МАСШТАБ <N> / ZOOM <N>
  if ((head === 'масштаб' || head === 'zoom' || head === 'z') && rest) {
    const numMatch = rest.match(/^\d{2,3}/);
    if (numMatch) {
      const pct = Math.max(16, Math.min(250, Number(numMatch[0])));
      return {
        status: 'ok',
        message: `Масштаб ${pct}%`,
        action: { type: 'zoom-percent', percent: pct },
      };
    }
  }

  // 4. Exact keyword match (English or Russian AutoCAD alias)
  const lowerFull = trimmed.toLowerCase();
  const exactItem = items.find(
    (item) =>
      item.keywords.some((k) => k.toLowerCase() === lowerFull || k.toLowerCase() === head)
  );
  if (exactItem && !rest) {
    if (exactItem.disabled) {
      return { status: 'disabled', message: exactItem.subtitle };
    }
    return {
      status: 'ok',
      message: exactItem.title,
      action: exactItem.action,
    };
  }

  // 5. Prefix / filtered match
  const filtered = filterCommandPaletteItems(items, trimmed);
  if (filtered.length > 0) {
    const top = filtered.find((i) => !i.disabled) || filtered[0];
    if (top.disabled) {
      return { status: 'disabled', message: top.subtitle };
    }
    return {
      status: 'ok',
      message: top.title,
      action: top.action,
    };
  }

  return {
    status: 'not_found',
    message: `Неизвестная команда «${trimmed}». Попробуйте: НАЙТИ, ПРОВОД, СЕТКА, УГО, ТАБЛИЦАПЭ3, DXF`,
  };
}

export function pushCommandHistory(
  history: string[],
  rawCommand: string,
  maxSize = 60
): string[] {
  const clean = rawCommand.trim();
  if (!clean) return history;
  if (history[history.length - 1] === clean) return history;
  const next = [...history, clean];
  return next.length > maxSize ? next.slice(next.length - maxSize) : next;
}

export function stepCommandHistory(
  history: string[],
  currentIndex: number,
  direction: 'up' | 'down',
  currentDraft: string,
  savedDraft: string
): {
  nextIndex: number;
  nextValue: string;
  nextSavedDraft: string;
} {
  if (history.length === 0) {
    return {
      nextIndex: -1,
      nextValue: currentDraft,
      nextSavedDraft: savedDraft,
    };
  }

  if (direction === 'up') {
    if (currentIndex === -1) {
      const idx = history.length - 1;
      return {
        nextIndex: idx,
        nextValue: history[idx],
        nextSavedDraft: currentDraft,
      };
    }
    const idx = Math.max(0, currentIndex - 1);
    return {
      nextIndex: idx,
      nextValue: history[idx],
      nextSavedDraft: savedDraft,
    };
  }

  // direction === 'down'
  if (currentIndex === -1) {
    return {
      nextIndex: -1,
      nextValue: currentDraft,
      nextSavedDraft: savedDraft,
    };
  }
  if (currentIndex >= history.length - 1) {
    return {
      nextIndex: -1,
      nextValue: savedDraft,
      nextSavedDraft: savedDraft,
    };
  }
  const idx = currentIndex + 1;
  return {
    nextIndex: idx,
    nextValue: history[idx],
    nextSavedDraft: savedDraft,
  };
}
