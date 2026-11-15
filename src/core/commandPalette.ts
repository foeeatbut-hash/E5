import type { E3Project, SheetFormat } from './e3Types.ts';
import { isMinimapEnabled } from './focusLayout.ts';
import type { UiWorkspaceMode } from './uiMode.ts';

export type CommandPaletteCategory =
  | 'tool'
  | 'action'
  | 'view'
  | 'section'
  | 'feature'
  | 'device'
  | 'sheet';

export type TopSearchCategory = 'section' | 'feature' | 'sheet' | 'device';
export type CommandPaletteScope = 'bottom' | 'top' | 'both';

export type CommandPaletteAction =
  | { type: 'set-tool'; tool: 'select' | 'wire' | 'pan' | 'measure' }
  | { type: 'set-ui-mode'; mode: UiWorkspaceMode }
  | { type: 'toggle-canvas-focus' }
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
  | { type: 'toggle-minimap' }
  | { type: 'autoroute' }
  | { type: 'open-explorer' }
  | { type: 'open-console-tab'; tab: 'bom' | 'cables' | 'erc' | 'logs' | 'api' }
  | { type: 'open-erc' }
  | { type: 'open-health' }
  | { type: 'open-bom' }
  | { type: 'open-terminals' }
  | { type: 'open-autonum' }
  | { type: 'open-catalog' }
  | { type: 'open-hvac-wizard' }
  | { type: 'open-symbol-designer' }
  | { type: 'open-exchange' }
  | { type: 'open-visual-settings' }
  | { type: 'open-shortcuts' }
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
  scope?: CommandPaletteScope;
  /** Canonical command syntax shown and completed in the bottom CAD command line */
  commandKeyword?: string;
  /** Brief description for bottom command bar autocomplete */
  commandHint?: string;
  /** True when the command expects a parameter after completion (e.g. "НАЙТИ ", "МАСШТАБ ") */
  requiresArg?: boolean;
  action: CommandPaletteAction;
}

export const COMMAND_CATEGORY_LABELS: Record<CommandPaletteCategory, string> = {
  tool: 'Инструмент',
  action: 'Команда',
  view: 'Вид и сетка',
  section: 'Разделы',
  feature: 'Функции',
  sheet: 'Листы',
  device: 'ОУО и аппараты',
};

export const TOP_SEARCH_CATEGORY_LABELS: Record<TopSearchCategory, string> = {
  section: 'Разделы и панели',
  feature: 'Функции и мастера',
  sheet: 'Листы схемы',
  device: 'Аппараты и ОУО',
};

const FORMAT_LABELS: Record<SheetFormat, string> = {
  A4: 'А4',
  A3: 'А3',
  A2: 'А2',
  A1: 'А1',
};

export interface BottomCommandBuildOptions {
  hasSelection?: boolean;
  hasClipboard?: boolean;
  selectedDeviceCount?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  snapToGrid?: boolean;
  smartGuides?: boolean;
  showGrid?: boolean;
  showCrosshair?: boolean;
  showMinimap?: boolean;
}

/**
 * Builds commands strictly for the bottom CAD command line.
 * Contains drafting tools, canvas edit commands, grid/snap toggles, viewport zoom, and CLI syntax commands.
 */
export function buildBottomCommandItems(
  opts: BottomCommandBuildOptions = {}
): CommandPaletteItem[] {
  const hasSel = Boolean(opts.hasSelection);
  const multiSel = (opts.selectedDeviceCount ?? 0) >= 2;

  return [
    {
      id: 'cmd-wire',
      title: 'Провод / Линия / Отрезок (WIRE / ПРОВОД / ЛИНИЯ)',
      subtitle: 'Переключиться в режим проведения электрических связей',
      commandKeyword: 'ПРОВОД',
      commandHint: 'Проведение цепей · WIRE',
      category: 'tool',
      scope: 'bottom',
      keywords: ['wire', 'line', 'провод', 'линия', 'отрезок', 'проводка', 'цепь', 'трасса', 'w', 'l', 'л'],
      shortcut: 'W / Space',
      action: { type: 'set-tool', tool: 'wire' },
    },
    {
      id: 'cmd-select',
      title: 'Выбор и перенос (MOVE / SELECT / ПЕРЕНЕСТИ)',
      subtitle: 'Инструмент выделения рамкой и перемещения объектов',
      commandKeyword: 'ВЫБОР',
      commandHint: 'Выделение и перенос · SELECT / MOVE',
      category: 'tool',
      scope: 'bottom',
      keywords: ['move', 'select', 'выбор', 'перенести', 'переместить', 'сдвиг', 'm', 'v', 'п'],
      shortcut: 'V',
      action: { type: 'set-tool', tool: 'select' },
    },
    {
      id: 'cmd-pan',
      title: 'Панорамирование холста (PAN / ПАНОРАМА)',
      subtitle: 'Перемещение камеры по полю чертежа',
      commandKeyword: 'ПАНОРАМА',
      commandHint: 'Перемещение камеры · PAN',
      category: 'tool',
      scope: 'bottom',
      keywords: ['pan', 'hand', 'панорама', 'рука', 'сдвинуть', 'h', 'p'],
      shortcut: 'H',
      action: { type: 'set-tool', tool: 'pan' },
    },
    {
      id: 'cmd-measure',
      title: 'Линейка / Измерить расстояние (MEASURE / DIST)',
      subtitle: 'Замер расстояния и дельты X/Y по схеме',
      commandKeyword: 'ЛИНЕЙКА',
      commandHint: 'Замер расстояния · MEASURE / DIST',
      category: 'tool',
      scope: 'bottom',
      keywords: ['measure', 'dist', 'ruler', 'линейка', 'размер', 'измерить'],
      action: { type: 'set-tool', tool: 'measure' },
    },
    {
      id: 'cmd-zoom-fit',
      title: 'Показать весь лист (ZOOM EXTENTS / ВПИСАТЬ)',
      subtitle: 'Вписать рамку ГОСТ активного листа в окно просмотра',
      commandKeyword: 'ВПИСАТЬ',
      commandHint: 'Вписать лист в экран · ZOOM FIT',
      category: 'view',
      scope: 'bottom',
      keywords: ['вписать', 'zoom', 'fit', 'extents', 'z', 'ze', 'показать', 'всё'],
      action: { type: 'zoom-fit' },
    },
    {
      id: 'cmd-zoom-in',
      title: 'Увеличить масштаб +15% (ZOOM IN / ПРИБЛИЗИТЬ)',
      subtitle: 'Приблизить активную область схемы',
      commandKeyword: 'ПРИБЛИЗИТЬ',
      commandHint: 'Масштаб +15% · ZOOM IN',
      category: 'view',
      scope: 'bottom',
      keywords: ['приблизить', 'zoom', 'in', 'увеличить', 'z+'],
      action: { type: 'zoom-delta', delta: 0.15 },
    },
    {
      id: 'cmd-zoom-out',
      title: 'Уменьшить масштаб -15% (ZOOM OUT / ОТДАЛИТЬ)',
      subtitle: 'Отдалить активную область схемы',
      commandKeyword: 'ОТДАЛИТЬ',
      commandHint: 'Масштаб -15% · ZOOM OUT',
      category: 'view',
      scope: 'bottom',
      keywords: ['отдалить', 'zoom', 'out', 'уменьшить', 'z-'],
      action: { type: 'zoom-delta', delta: -0.15 },
    },
    {
      id: 'cmd-zoom-percent',
      title: 'Задать масштаб в % (МАСШТАБ <N> / ZOOM <N>)',
      subtitle: 'Установить точный масштаб листа от 16% до 250%',
      commandKeyword: 'МАСШТАБ ',
      commandHint: 'Точный масштаб (напр. МАСШТАБ 75)',
      requiresArg: true,
      category: 'view',
      scope: 'bottom',
      keywords: ['масштаб', 'zoom', 'процент'],
      shortcut: 'МАСШТАБ <N>',
      action: { type: 'zoom-percent', percent: 100 },
    },
    {
      id: 'cmd-grid',
      title: `Сетка чертежа: ${opts.showGrid !== false ? 'ПОКАЗАНА' : 'СКРЫТА'} (GRID / СЕТКА / F9)`,
      subtitle: 'Показать или скрыть координатную сетку на листе',
      commandKeyword: 'СЕТКА',
      commandHint: `${opts.showGrid !== false ? 'Скрыть' : 'Показать'} сетку · GRID`,
      category: 'view',
      scope: 'bottom',
      keywords: ['сетка', 'grid', 'f9'],
      shortcut: 'F9',
      action: { type: 'toggle-grid' },
    },
    {
      id: 'cmd-snap',
      title: `Привязка к сетке: ${opts.snapToGrid ? 'ВКЛ' : 'ВЫКЛ'} (OSNAP / ПРИВЯЗКА / F3)`,
      subtitle: 'Включить или отключить привязку координат к шагу сетки',
      commandKeyword: 'ПРИВЯЗКА',
      commandHint: `${opts.snapToGrid ? 'Выключить' : 'Включить'} шаг сетки · OSNAP`,
      category: 'view',
      scope: 'bottom',
      keywords: ['привязка', 'snap', 'osnap', 'f3', 'шаг', 'привязать'],
      shortcut: 'F3',
      action: { type: 'toggle-snap' },
    },
    {
      id: 'cmd-ortho',
      title: `Направляющие / Орто: ${opts.smartGuides !== false ? 'ВКЛ' : 'ВЫКЛ'} (ORTHO / ОРТО / F8)`,
      subtitle: 'Умные направляющие по осям выводов и центрам блоков',
      commandKeyword: 'ОРТО',
      commandHint: `${opts.smartGuides !== false ? 'Выключить' : 'Включить'} направляющие · ORTHO`,
      category: 'view',
      scope: 'bottom',
      keywords: ['орто', 'ortho', 'guides', 'f8', 'направляющие'],
      shortcut: 'F8',
      action: { type: 'toggle-guides' },
    },
    {
      id: 'cmd-crosshair',
      title: `Перекрестие курсора: ${opts.showCrosshair !== false ? 'ВКЛ' : 'ВЫКЛ'} (CROSSHAIR / ПРИЦЕЛ)`,
      subtitle: 'Глобальные линии перекрестия на всё поле чертежа',
      commandKeyword: 'ПРИЦЕЛ',
      commandHint: 'Перекрестие на холсте · CROSSHAIR',
      category: 'view',
      scope: 'bottom',
      keywords: ['прицел', 'crosshair', 'перекрестие'],
      action: { type: 'toggle-crosshair' },
    },
    {
      id: 'cmd-minimap',
      title: `Мини-карта листа: ${isMinimapEnabled(opts.showMinimap) ? 'ПОКАЗАНА' : 'СКРЫТА'} (MINIMAP / МИНИКАРТА)`,
      subtitle: 'Показать или скрыть компактную мини-карту навигации по листу',
      commandKeyword: 'МИНИКАРТА',
      commandHint: 'Мини-карта навигации · MINIMAP',
      category: 'view',
      scope: 'bottom',
      keywords: ['миникарта', 'minimap', 'map', 'мини-карта', 'карта'],
      action: { type: 'toggle-minimap' },
    },
    {
      id: 'cmd-autoroute',
      title: 'Автотрассировка проводов на листе (REROUTE / ТРАССА)',
      subtitle: 'Перестроить маршруты цепей с обходом блоков УГО',
      commandKeyword: 'ТРАССА',
      commandHint: 'Автотрассировка цепей · REROUTE',
      category: 'action',
      scope: 'bottom',
      keywords: ['трасса', 'route', 'reroute', 'автотрассировка', 'трассировка', 'автотрасса'],
      action: { type: 'autoroute' },
    },
    {
      id: 'cmd-rotate',
      title: 'Повернуть выделенное на 90° (ROTATE / ПОВЕРНУТЬ)',
      subtitle: hasSel
        ? 'Повернуть выбранные аппараты на 90° по часовой стрелке'
        : 'Требуется выделить изделие на схеме',
      commandKeyword: 'ПОВЕРНУТЬ',
      commandHint: hasSel ? 'Поворот на 90° · ROTATE' : 'Выделите изделие на схеме',
      category: 'action',
      scope: 'bottom',
      keywords: ['повернуть', 'rotate', 'ro', 'поворот', 'вращать', 'r'],
      shortcut: 'R',
      disabled: !hasSel,
      action: { type: 'rotate-selected' },
    },
    {
      id: 'cmd-copy',
      title: 'Копировать выделенное (COPY / КОПИРОВАТЬ)',
      subtitle: 'Скопировать выделенные аппараты, внутренние провода и аннотации',
      commandKeyword: 'КОПИРОВАТЬ',
      commandHint: hasSel ? 'Копировать фрагмент · COPY' : 'Выделите объекты на схеме',
      category: 'action',
      scope: 'bottom',
      keywords: ['копировать', 'copy', 'co', 'cp', 'копия', 'кп'],
      shortcut: 'Ctrl+C',
      disabled: !hasSel,
      action: { type: 'copy-selected' },
    },
    {
      id: 'cmd-paste',
      title: 'Вставить из буфера обмена (PASTE / ВСТАВИТЬ)',
      subtitle: 'Вставить скопированный фрагмент схемы со сдвигом',
      commandKeyword: 'ВСТАВИТЬ',
      commandHint: 'Вставить из буфера · PASTE',
      category: 'action',
      scope: 'bottom',
      keywords: ['вставить', 'paste', 'pasteclip', 'вставка'],
      shortcut: 'Ctrl+V',
      disabled: opts.hasClipboard === false,
      action: { type: 'paste-clipboard' },
    },
    {
      id: 'cmd-duplicate',
      title: 'Дублировать выделенное (DUPLICATE / ДУБЛЬ)',
      subtitle: 'Быстрое создание копии выделенных элементов на активном листе',
      commandKeyword: 'ДУБЛЬ',
      commandHint: hasSel ? 'Клонировать выделенное · DUPLICATE' : 'Выделите объекты на схеме',
      category: 'action',
      scope: 'bottom',
      keywords: ['дубль', 'duplicate', 'дублировать', 'клонировать'],
      shortcut: 'Ctrl+D',
      disabled: !hasSel,
      action: { type: 'duplicate-selected' },
    },
    {
      id: 'cmd-delete',
      title: 'Удалить выделенное (ERASE / УДАЛИТЬ / СТЕРЕТЬ)',
      subtitle: 'Удалить выбранные аппараты, провода или аннотации',
      commandKeyword: 'УДАЛИТЬ',
      commandHint: hasSel ? 'Удалить выделенное · ERASE' : 'Выделите объекты на схеме',
      category: 'action',
      scope: 'bottom',
      keywords: ['удалить', 'erase', 'delete', 'del', 'e', 'стереть', 'уд'],
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
      commandKeyword: 'ВЫРОВНЯТЬ',
      commandHint: multiSel ? 'Выровнять по левому краю · ALIGN' : 'Выделите ≥2 аппаратов',
      category: 'action',
      scope: 'bottom',
      keywords: ['выровнять', 'align', 'al', 'лево'],
      disabled: !multiSel,
      action: { type: 'align-selected', align: 'left' },
    },
    {
      id: 'cmd-align-center',
      title: 'Выровнять по центру X (ALIGN CENTER)',
      subtitle: multiSel
        ? 'Выровнять выделенные аппараты по вертикальной оси'
        : 'Выделите 2 или более аппаратов для выравнивания',
      commandKeyword: 'ЦЕНТР',
      commandHint: multiSel ? 'Выровнять по оси X · ALIGN CENTER' : 'Выделите ≥2 аппаратов',
      category: 'action',
      scope: 'bottom',
      keywords: ['центр', 'align', 'center', 'выровнять'],
      disabled: !multiSel,
      action: { type: 'align-selected', align: 'center-x' },
    },
    {
      id: 'cmd-table-bom',
      title: 'Вставить таблицу ПЭ3 на лист ГОСТ (BOMTABLE / ТАБЛИЦАПЭ3)',
      subtitle: 'Разместить автообновляемый перечень элементов прямо на чертеже',
      commandKeyword: 'ТАБЛИЦАПЭ3',
      commandHint: 'Вставить таблицу ПЭ3 на лист',
      category: 'action',
      scope: 'bottom',
      keywords: ['таблицапэ3', 'bomtable', 'table', 'таблица', 'пэ3налист'],
      action: { type: 'insert-sheet-table', tableKind: 'bom' },
    },
    {
      id: 'cmd-table-cables',
      title: 'Вставить кабельный журнал на лист (CABLETABLE / ТАБЛИЦАКАБ)',
      subtitle: 'Разместить автообновляемую таблицу кабелей прямо на чертеже',
      commandKeyword: 'ТАБЛИЦАКАБ',
      commandHint: 'Вставить таблицу кабелей на лист',
      category: 'action',
      scope: 'bottom',
      keywords: ['таблицакаб', 'cabletable', 'кабжурнал', 'кабелиналист'],
      action: { type: 'insert-sheet-table', tableKind: 'cables' },
    },
    {
      id: 'cmd-undo',
      title: 'Отменить последнее действие (UNDO / ОТМЕНИТЬ / ОТКАТ)',
      subtitle: 'Откатить предыдущее изменение схемы',
      commandKeyword: 'ОТМЕНИТЬ',
      commandHint: 'Откат шага · UNDO',
      category: 'action',
      scope: 'bottom',
      keywords: ['отменить', 'undo', 'u', 'откат', 'назад'],
      shortcut: 'Ctrl+Z',
      disabled: opts.canUndo === false,
      action: { type: 'undo' },
    },
    {
      id: 'cmd-redo',
      title: 'Повторить действие (REDO / ПОВТОРИТЬ)',
      subtitle: 'Вернуть отменённое изменение схемы',
      commandKeyword: 'ПОВТОРИТЬ',
      commandHint: 'Вернуть шаг · REDO',
      category: 'action',
      scope: 'bottom',
      keywords: ['повторить', 'redo', 'вперёд', 'вперед'],
      shortcut: 'Ctrl+Y',
      disabled: opts.canRedo === false,
      action: { type: 'redo' },
    },
    {
      id: 'cmd-save-session',
      title: 'Сохранить сессию проекта (SAVE / СОХРАНИТЬ)',
      subtitle: 'Зафиксировать проект в локальной сессии и списке недавних',
      commandKeyword: 'СОХРАНИТЬ',
      commandHint: 'Сохранить проект · SAVE',
      category: 'action',
      scope: 'bottom',
      keywords: ['сохранить', 'save', 'qsave', 'сессия'],
      shortcut: 'Ctrl+S',
      action: { type: 'save-session' },
    },
    {
      id: 'cmd-find',
      title: 'Найти в проекте: аппарат, цепь, текст (НАЙТИ / FIND)',
      subtitle: 'Переход на схеме по ОУО, номеру жилы или надписи',
      commandKeyword: 'НАЙТИ ',
      commandHint: 'Поиск на схеме (напр. НАЙТИ -KM1)',
      requiresArg: true,
      category: 'action',
      scope: 'bottom',
      keywords: ['найти', 'find', 'поиск', 'search', 'f'],
      shortcut: 'НАЙТИ <ОУО>',
      action: { type: 'open-find' },
    },
    {
      id: 'cmd-sheet-jump',
      title: 'Перейти к листу по номеру (ЛИСТ <N> / SHEET <N>)',
      subtitle: 'Переключиться на указанный лист схемы',
      commandKeyword: 'ЛИСТ ',
      commandHint: 'Переход на лист (напр. ЛИСТ 2)',
      requiresArg: true,
      category: 'view',
      scope: 'bottom',
      keywords: ['лист', 'sheet'],
      shortcut: 'ЛИСТ <N>',
      action: { type: 'open-find' },
    },
  ];
}

/**
 * Builds items strictly for the top global search bar / popover:
 * sections, program features & masters, UI modes, sheets, and schematic devices.
 * Excludes low-level CAD drawing/grid/edit commands handled by the bottom command bar.
 */
export function buildTopSearchItems(project: E3Project): CommandPaletteItem[] {
  const sheetById = new Map(project.sheets.map((s) => [s.id, s]));

  const sections: CommandPaletteItem[] = [
    {
      id: 'section-explorer',
      title: 'Навигатор проекта',
      subtitle: 'Дерево листов, разделы проекта и быстрая навигация',
      category: 'section',
      scope: 'top',
      keywords: ['навигатор', 'проект', 'дерево', 'листы', 'explorer', 'project'],
      shortcut: 'Ctrl+\\',
      action: { type: 'open-explorer' },
    },
    {
      id: 'section-catalog',
      title: 'База изделий и УГО',
      subtitle: 'Библиотека стандартных, модульных и пользовательских символов',
      category: 'section',
      scope: 'top',
      keywords: ['база', 'каталог', 'изделия', 'библиотека', 'catalog', 'library'],
      action: { type: 'open-catalog' },
    },
    {
      id: 'section-bom',
      title: 'Спецификация ПЭ3',
      subtitle: 'Перечень элементов проекта по ГОСТ 2.701 с группировкой',
      category: 'section',
      scope: 'top',
      keywords: ['пэ3', 'спецификация', 'ведомость', 'перечень', 'bom', 'pe3'],
      action: { type: 'open-console-tab', tab: 'bom' },
    },
    {
      id: 'section-cables',
      title: 'Кабели и длины цепей',
      subtitle: 'Кабельный журнал, жилы, резервы и расчёт трасс',
      category: 'section',
      scope: 'top',
      keywords: ['кабели', 'журнал', 'длины', 'жилы', 'cables', 'клеммник'],
      action: { type: 'open-console-tab', tab: 'cables' },
    },
    {
      id: 'section-erc',
      title: 'Диагностика ERC',
      subtitle: 'Проверка электрических правил, конфликтов потенциалов и сечений',
      category: 'section',
      scope: 'top',
      keywords: ['erc', 'диагностика', 'ошибки', 'проверка', 'аудит', 'audit'],
      action: { type: 'open-console-tab', tab: 'erc' },
    },
    {
      id: 'section-logs',
      title: 'Логи процессов',
      subtitle: 'Журнал операций, импорта, автотрассировки и предупреждений',
      category: 'section',
      scope: 'top',
      keywords: ['логи', 'журнал', 'события', 'история', 'logs'],
      action: { type: 'open-console-tab', tab: 'logs' },
    },
    {
      id: 'section-api',
      title: 'API, Flux Studio и интеграции',
      subtitle: 'REST-эндпоинты, шина Flux Bus и внешние вебхуки',
      category: 'section',
      scope: 'top',
      keywords: ['api', 'flux', 'синхронизация', 'интеграция', 'webhook', 'апи'],
      action: { type: 'open-console-tab', tab: 'api' },
    },
    {
      id: 'section-health',
      title: 'Монитор здоровья системы',
      subtitle: 'Частота кадров FPS, память, длительные задачи и телеметрия',
      category: 'section',
      scope: 'top',
      keywords: ['здоровье', 'монитор', 'телеметрия', 'fps', 'health', 'perf', 'лаги'],
      action: { type: 'open-health' },
    },
  ];

  const features: CommandPaletteItem[] = [
    {
      id: 'feat-hvac',
      title: 'Мастер схем ФСА / ОВиК',
      subtitle: 'Автоматическая генерация принципиальных схем вентиляции и КИПиА',
      category: 'feature',
      scope: 'top',
      keywords: ['фса', 'овик', 'hvac', 'fsa', 'мастер', 'вентиляция', 'генерация'],
      action: { type: 'open-hvac-wizard' },
    },
    {
      id: 'feat-symbol-designer',
      title: 'Редактор блоков и УГО',
      subtitle: 'Конструктор графических обозначений, контуров и выводов по сетке',
      category: 'feature',
      scope: 'top',
      keywords: ['уго', 'символ', 'блок', 'редактор', 'конструктор', 'symbol', 'block'],
      action: { type: 'open-symbol-designer' },
    },
    {
      id: 'feat-stamp',
      title: 'Редактор штампа ГОСТ 2.104',
      subtitle: 'Заполнение граф основной надписи, разработчика, шифра и шаблонов',
      category: 'feature',
      scope: 'top',
      keywords: ['штамп', 'основная надпись', 'гост', 'stamp', 'titleblock'],
      action: { type: 'open-stamp' },
    },
    {
      id: 'feat-terminals',
      title: 'Редактор клеммных рядов (-XT)',
      subtitle: 'Клеммники, перемычки, резервы и генерация листа клеммных рядов',
      category: 'feature',
      scope: 'top',
      keywords: ['клеммы', 'клеммник', 'xt', 'terminal', 'перемычки'],
      action: { type: 'open-terminals' },
    },
    {
      id: 'feat-autonum',
      title: 'Автонумерация цепей и ОУО (ГОСТ 2.710)',
      subtitle: 'Пакетная маркировка проводов и переиндексация позиционных обозначений',
      category: 'feature',
      scope: 'top',
      keywords: ['автонумерация', 'нумерация', 'маркировка', 'number', 'renumber'],
      action: { type: 'open-autonum' },
    },
    {
      id: 'feat-publish',
      title: 'Пакетная публикация PDF / DXF',
      subtitle: 'Мастер выпуска многостраничного альбома, ПЭ3 и кабельного журнала',
      category: 'feature',
      scope: 'top',
      keywords: ['публикация', 'выпуск', 'печать', 'pdf', 'dxf', 'plot', 'publish'],
      action: { type: 'open-publish' },
    },
    {
      id: 'feat-dxf',
      title: 'Экспорт листа в AutoCAD (DXF / DWG)',
      subtitle: 'Выгрузка чертежа со слоями ГОСТ, блоками INSERT и атрибутами',
      category: 'feature',
      scope: 'top',
      keywords: ['dxf', 'dwg', 'autocad', 'экспорт', 'автокад', 'чертеж'],
      action: { type: 'export-dxf' },
    },
    {
      id: 'feat-pdf',
      title: 'Быстрый экспорт проекта в PDF',
      subtitle: 'Сформировать многостраничный векторный PDF со всеми листами',
      category: 'feature',
      scope: 'top',
      keywords: ['pdf', 'пдф', 'экспорт'],
      action: { type: 'export-pdf' },
    },
    {
      id: 'feat-exchange',
      title: 'Обмен и экспорт E³.series / Flux',
      subtitle: 'Выгрузка и импорт .e3s, XML, Flux-архивов и сборка Portable',
      category: 'feature',
      scope: 'top',
      keywords: ['e3', 'e3s', 'e3series', 'xml', 'импорт', 'экспорт', 'portable', 'обмен'],
      action: { type: 'open-exchange' },
    },
    {
      id: 'feat-visual',
      title: 'Настройки оформления, сетки и масштаба',
      subtitle: 'Шаг сетки, умные направляющие, масштаб интерфейса и тема',
      category: 'feature',
      scope: 'top',
      keywords: ['настройки', 'оформление', 'параметры', 'тема', 'масштаб', 'settings'],
      action: { type: 'open-visual-settings' },
    },
    {
      id: 'feat-add-sheet',
      title: 'Добавить новый лист схемы',
      subtitle: 'Создать дополнительный лист ГОСТ в активном проекте',
      category: 'feature',
      scope: 'top',
      keywords: ['новый лист', 'добавить лист', 'лист', 'addsheet', 'создать лист'],
      action: { type: 'add-sheet' },
    },
    {
      id: 'feat-canvas-focus',
      title: 'Режим «Фокус холст» (на весь экран)',
      subtitle: 'Скрыть боковые и нижние панели для максимального поля чертежа',
      category: 'feature',
      scope: 'top',
      keywords: ['фокус холст', 'полноэкранный', 'скрыть панели', 'пространство'],
      action: { type: 'toggle-canvas-focus' },
    },
    {
      id: 'feat-ui-classic',
      title: 'Интерфейс: Классический E3ProMax',
      subtitle: 'Минерально-зелёная лента инструментов и классические доки',
      category: 'feature',
      scope: 'top',
      keywords: ['интерфейс', 'классический', 'classic', 'режим', 'лента'],
      action: { type: 'set-ui-mode', mode: 'classic' },
    },
    {
      id: 'feat-ui-hybrid',
      title: 'Интерфейс: Новый — Гибрид (Вариант А)',
      subtitle: 'Боковой рельс, 2-колоночный каталог, сплит ПЭ3 | ERC',
      category: 'feature',
      scope: 'top',
      keywords: ['интерфейс', 'новый', 'гибрид', 'hybrid', 'режим'],
      action: { type: 'set-ui-mode', mode: 'hybrid' },
    },
    {
      id: 'feat-ui-focus',
      title: 'Интерфейс: Новый — Фокус-холст (Вариант Б)',
      subtitle: 'Плавающие стеклянные доки и максимум площади схемы',
      category: 'feature',
      scope: 'top',
      keywords: ['интерфейс', 'новый', 'фокус', 'focus', 'режим'],
      action: { type: 'set-ui-mode', mode: 'focus' },
    },
    {
      id: 'feat-shortcuts',
      title: 'Справка и горячие клавиши',
      subtitle: 'Таблица сочетаний клавиш, инструментов и навигации по холсту',
      category: 'feature',
      scope: 'top',
      keywords: ['справка', 'горячие клавиши', 'клавиши', 'помощь', 'f1', 'shortcuts'],
      shortcut: 'F1',
      action: { type: 'open-shortcuts' },
    },
  ];

  const sheetItems: CommandPaletteItem[] = project.sheets.map((s) => ({
    id: `sheet-${s.id}`,
    title: `Лист ${s.number}: ${s.name}`,
    subtitle: `Формат ${FORMAT_LABELS[s.format] || s.format} · ${s.width}×${s.height} мм${s.folder ? ` · ${s.folder}` : ''}`,
    category: 'sheet',
    scope: 'top',
    keywords: ['лист', 'sheet', `л.${s.number}`, `л${s.number}`, String(s.number), s.name, s.folder || ''],
    action: { type: 'jump-sheet', sheetId: s.id },
  }));

  const deviceItems: CommandPaletteItem[] = project.devices.map((d) => {
    const sh = sheetById.get(d.sheetId);
    const shInfo = sh ? `Л.${sh.number} (${sh.name})` : 'Схема';
    return {
      id: `dev-${d.id}`,
      title: `${d.designation} — ${d.componentName}`,
      subtitle: `${shInfo}${d.article ? ` · ${d.article}` : ''}`,
      category: 'device',
      scope: 'top',
      keywords: [d.designation, d.designation.replace(/^-/, ''), d.componentName, d.article, d.manufacturer, 'оуо'],
      action: { type: 'jump-device', deviceId: d.id },
    };
  });

  return [...sections, ...features, ...sheetItems, ...deviceItems];
}

/**
 * Legacy/unified builder kept compatible with existing CLI & test contracts.
 * Combines bottom CAD commands with top search items while preserving legacy alias lookups.
 */
export function buildCommandPaletteItems(
  project: E3Project,
  opts: BottomCommandBuildOptions = {}
): CommandPaletteItem[] {
  const bottom = buildBottomCommandItems(opts);
  const top = buildTopSearchItems(project);
  return [...bottom, ...top];
}

function scoreMatchedItem(item: CommandPaletteItem, q: string, tokens: string[]): number | null {
  const haystack = [item.title, item.subtitle, item.commandKeyword || '', ...item.keywords]
    .join(' ')
    .toLowerCase();
  const matchesAll = tokens.every((t) => haystack.includes(t));
  if (!matchesAll) return null;

  let score = 0;
  const lowerTitle = item.title.toLowerCase();
  const lowerCmd = (item.commandKeyword || '').trim().toLowerCase();
  if (lowerCmd && lowerCmd === q) score += 170;
  else if (lowerCmd && lowerCmd.startsWith(q)) score += 120;
  if (item.keywords.some((k) => k.toLowerCase() === q)) score += 140;
  else if (item.keywords.some((k) => k.toLowerCase().startsWith(q))) score += 85;
  if (lowerTitle.startsWith(q)) score += 60;
  else if (lowerTitle.includes(q)) score += 40;
  if (item.category === 'tool' || item.category === 'action' || item.category === 'view') score += 15;
  if (item.category === 'section') score += 18;
  if (item.category === 'feature') score += 12;
  if (!item.disabled) score += 10;
  return score;
}

function scoreBottomCommandItem(
  item: CommandPaletteItem,
  q: string,
  tokens: string[]
): number | null {
  const cmdStr = (item.commandKeyword || '').trim().toLowerCase();
  const hintStr = (item.commandHint || '').toLowerCase();
  const kwList = item.keywords.map((k) => k.toLowerCase());
  const haystack = [cmdStr, hintStr, ...kwList].join(' ');
  const matchesAll = tokens.every((t) => haystack.includes(t));
  if (!matchesAll) return null;

  let score = 0;
  if (cmdStr === q) score += 200;
  else if (cmdStr.startsWith(q)) score += 150;
  if (kwList.some((k) => k === q)) score += 140;
  else if (kwList.some((k) => k.startsWith(q))) score += 100;
  if (hintStr.startsWith(q)) score += 60;
  else if (hintStr.includes(q)) score += 30;
  if (!item.disabled) score += 15;
  return score;
}

/**
 * Filters ONLY bottom CAD commands as the user types in the bottom command input.
 */
export function filterBottomCommandItems(
  items: CommandPaletteItem[],
  rawQuery: string
): CommandPaletteItem[] {
  const bottomOnly = items.filter(
    (i) => i.scope === 'bottom' || i.category === 'tool' || i.category === 'action' || i.category === 'view'
  );
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    const enabled = bottomOnly.filter((i) => !i.disabled);
    const disabled = bottomOnly.filter((i) => i.disabled);
    return [...enabled, ...disabled];
  }

  const head = q.split(/\s+/)[0];
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ item: CommandPaletteItem; score: number }> = [];

  for (const item of bottomOnly) {
    let score = scoreBottomCommandItem(item, q, tokens);
    // Keep parameterized commands visible while typing arguments (e.g. "МАСШТАБ 75", "НАЙТИ -QF1", "ЛИСТ 2")
    if (score === null && item.requiresArg) {
      const cmdHead = (item.commandKeyword || '').trim().toLowerCase();
      if (
        (cmdHead && cmdHead === head) ||
        item.keywords.some((k) => k.toLowerCase() === head)
      ) {
        score = 135;
      }
    }
    if (score !== null) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

/**
 * Filters ONLY top search items (sections, features, sheets, devices) — excluding bottom CAD commands.
 */
export function filterTopSearchItems(
  items: CommandPaletteItem[],
  rawQuery: string,
  categoryFilter: 'all' | TopSearchCategory = 'all'
): CommandPaletteItem[] {
  const topOnly = items.filter(
    (i) =>
      i.scope === 'top' ||
      i.category === 'section' ||
      i.category === 'feature' ||
      i.category === 'sheet' ||
      i.category === 'device'
  );
  const scoped =
    categoryFilter === 'all' ? topOnly : topOnly.filter((i) => i.category === categoryFilter);

  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    if (categoryFilter !== 'all') return scoped;
    const sections = scoped.filter((i) => i.category === 'section');
    const features = scoped.filter((i) => i.category === 'feature').slice(0, 8);
    const sheets = scoped.filter((i) => i.category === 'sheet');
    const devices = scoped.filter((i) => i.category === 'device').slice(0, 6);
    return [...sections, ...features, ...sheets, ...devices];
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ item: CommandPaletteItem; score: number }> = [];
  for (const item of scoped) {
    const score = scoreMatchedItem(item, q, tokens);
    if (score !== null) scored.push({ item, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
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
    const sectionsAndFeatures = items.filter(
      (i) => i.category === 'section' || i.category === 'feature'
    );
    const sheets = items.filter((i) => i.category === 'sheet');
    const devices = items.filter((i) => i.category === 'device').slice(0, 8);
    return [...toolsAndActions, ...sectionsAndFeatures, ...sheets, ...devices];
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored: Array<{ item: CommandPaletteItem; score: number }> = [];

  for (const item of items) {
    const score = scoreMatchedItem(item, q, tokens);
    if (score !== null) scored.push({ item, score });
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
    return {
      status: 'not_found',
      message: 'Введите команду чертежа (например: ПРОВОД, ВЫБОР, СЕТКА, ВПИСАТЬ, НАЙТИ -KM1)',
    };
  }

  const parts = trimmed.split(/\s+/);
  const head = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ').trim();

  // 1. Explicit FIND / НАЙТИ / ПОИСК with optional argument
  if (head === 'найти' || head === 'поиск' || head === 'find' || head === 'search') {
    if (!rest) {
      return {
        status: 'ok',
        message: 'Открыт поиск по проекту (введите ОУО, цепь или раздел)',
        action: { type: 'open-find' },
      };
    }
    const q = rest.toLowerCase();
    const devMatch =
      project.devices.find(
        (d) =>
          d.designation.toLowerCase() === q || d.designation.replace(/^-/, '').toLowerCase() === q
      ) ||
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
      (item.commandKeyword || '').trim().toLowerCase() === lowerFull ||
      item.keywords.some((k) => k.toLowerCase() === lowerFull || k.toLowerCase() === head)
  );
  if (exactItem && !rest) {
    if (exactItem.disabled) {
      return { status: 'disabled', message: exactItem.subtitle };
    }
    return {
      status: 'ok',
      message: exactItem.commandHint || exactItem.title,
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
      message: top.commandHint || top.title,
      action: top.action,
    };
  }

  return {
    status: 'not_found',
    message: `Команда «${trimmed}» не распознана. Доступны: ПРОВОД, ВЫБОР, СЕТКА, ВПИСАТЬ, ПОВЕРНУТЬ, НАЙТИ <ОУО>`,
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
