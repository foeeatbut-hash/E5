export type FocusQuickActionId =
  | 'tool_select'
  | 'tool_wire'
  | 'tool_measure'
  | 'tool_pan'
  | 'tool_rect'
  | 'tool_callout'
  | 'tool_text'
  | 'tool_offpage'
  | 'open_symbol_designer'
  | 'auto_route'
  | 'edit_copy'
  | 'edit_paste'
  | 'action_rotate'
  | 'edit_delete'
  | 'mirror_x'
  | 'mirror_y'
  | 'align_left'
  | 'align_center'
  | 'align_top'
  | 'align_middle'
  | 'open_catalog_tab'
  | 'open_add_catalog'
  | 'run_erc'
  | 'open_bom'
  | 'open_report'
  | 'toggle_grid'
  | 'toggle_snap'
  | 'toggle_crosshair'
  | 'insert_bom_table'
  | 'insert_cable_table'
  | 'toggle_pins'
  | 'toggle_wires'
  | 'toggle_crossrefs'
  | 'toggle_frame'
  | 'toggle_bridges'
  | 'open_visual_settings'
  | 'add_sheet'
  | 'duplicate_sheet'
  | 'delete_sheet'
  | 'open_stamp_editor'
  | 'open_stamp_designer'
  | 'open_hvac_wizard'
  | 'open_terminals'
  | 'open_autonumber'
  | 'viewport_single'
  | 'viewport_two'
  | 'viewport_three'
  | 'viewport_four'
  | 'action_fit'
  | 'toggle_minimap'
  | 'open_layers'
  | 'reset_dock'
  | 'flux_push'
  | 'flux_bus'
  | 'flux_publish'
  | 'flux_zip'
  | 'export_bridge_json'
  | 'e3_open_file'
  | 'e3_direct'
  | 'e3_exchange'
  | 'open_publish'
  | 'export_dxf'
  | 'export_bom_csv'
  | 'export_cables_csv'
  | 'open_portable'
  | 'download_codebase';

export interface FocusQuickActionDef {
  id: FocusQuickActionId;
  label: string;
  title: string;
  shortcut?: string;
  group: 'tool' | 'edit' | 'draft' | 'sheet' | 'view' | 'flux';
  danger?: boolean;
}

export const FOCUS_QUICK_ACTIONS: Record<FocusQuickActionId, FocusQuickActionDef> = {
  tool_select: { id: 'tool_select', label: 'Выбор', title: 'Выбор и перетаскивание элементов', shortcut: 'V', group: 'tool' },
  tool_wire: { id: 'tool_wire', label: 'Провод', title: 'Соединить выводы проводом', shortcut: 'W', group: 'tool' },
  tool_measure: { id: 'tool_measure', label: 'Линейка', title: 'Измерить расстояние и дельту координат', group: 'tool' },
  tool_pan: { id: 'tool_pan', label: 'Панорама', title: 'Перемещение листа', shortcut: 'H', group: 'tool' },
  tool_rect: { id: 'tool_rect', label: 'Рамка / зона', title: 'Начертить пунктирный контур / зону шкафа', group: 'draft' },
  tool_callout: { id: 'tool_callout', label: 'Выноска', title: 'Поставить выноску со стрелкой', group: 'draft' },
  tool_text: { id: 'tool_text', label: 'Текст', title: 'Добавить текстовую надпись на лист', group: 'draft' },
  tool_offpage: { id: 'tool_offpage', label: 'Ссылка Л↔Л', title: 'Межлистовая ссылка потенциала E3', group: 'draft' },
  open_symbol_designer: { id: 'open_symbol_designer', label: 'Редактор УГО', title: 'Открыть редактор пользовательских УГО', group: 'draft' },
  auto_route: { id: 'auto_route', label: 'Выровнять провода', title: 'Автотрассировка и выравнивание проводов', group: 'draft' },
  edit_copy: { id: 'edit_copy', label: 'Копировать', title: 'Копировать выделенные объекты', shortcut: 'Ctrl+C', group: 'edit' },
  edit_paste: { id: 'edit_paste', label: 'Вставить', title: 'Вставить фрагмент схемы', shortcut: 'Ctrl+V', group: 'edit' },
  action_rotate: { id: 'action_rotate', label: 'Поворот 90°', title: 'Повернуть выделенное на 90°', shortcut: 'R', group: 'edit' },
  edit_delete: { id: 'edit_delete', label: 'Удалить', title: 'Удалить выделенные элементы', shortcut: 'Del', group: 'edit', danger: true },
  mirror_x: { id: 'mirror_x', label: 'Отразить X', title: 'Отразить по горизонтали', group: 'edit' },
  mirror_y: { id: 'mirror_y', label: 'Отразить Y', title: 'Отразить по вертикали', group: 'edit' },
  align_left: { id: 'align_left', label: 'Выровн. слева', title: 'Выровнять выбранные изделия по левому краю', group: 'edit' },
  align_center: { id: 'align_center', label: 'Выровн. центр X', title: 'Выровнять выбранные изделия по вертикальной оси', group: 'edit' },
  align_top: { id: 'align_top', label: 'Выровн. сверху', title: 'Выровнять выбранные изделия по верхнему краю', group: 'edit' },
  align_middle: { id: 'align_middle', label: 'Выровн. центр Y', title: 'Выровнять выбранные изделия по горизонтальной оси', group: 'edit' },
  open_catalog_tab: { id: 'open_catalog_tab', label: 'База изделий', title: 'Открыть каталог изделий в навигаторе', group: 'sheet' },
  open_add_catalog: { id: 'open_add_catalog', label: '+ Изделие', title: 'Создать новое изделие в базе', group: 'sheet' },
  run_erc: { id: 'run_erc', label: 'Проверка ERC', title: 'Открыть диагностику электрических правил (ERC)', group: 'sheet' },
  open_bom: { id: 'open_bom', label: 'Спецификация ПЭ3', title: 'Открыть таблицу спецификации ПЭ3', group: 'sheet' },
  open_report: { id: 'open_report', label: 'Отчёт ПЭ3', title: 'Печатная форма перечня элементов ГОСТ', group: 'sheet' },
  toggle_grid: { id: 'toggle_grid', label: 'Сетка', title: 'Показать/скрыть чертёжную сетку', shortcut: 'F9', group: 'view' },
  toggle_snap: { id: 'toggle_snap', label: 'Привязка', title: 'Магнитная привязка к сетке', shortcut: 'F3', group: 'view' },
  toggle_crosshair: { id: 'toggle_crosshair', label: 'Прицел', title: 'Глобальное перекрестие курсора (Crosshair)', group: 'view' },
  insert_bom_table: { id: 'insert_bom_table', label: 'Таблица ПЭ3 на лист', title: 'Вставить автообновляемую таблицу ПЭ3 на чертёж', group: 'draft' },
  insert_cable_table: { id: 'insert_cable_table', label: 'Каб. журнал на лист', title: 'Вставить таблицу кабельного журнала на лист', group: 'draft' },
  toggle_pins: { id: 'toggle_pins', label: 'Номера выводов', title: 'Показывать номера контактов', group: 'view' },
  toggle_wires: { id: 'toggle_wires', label: 'Маркировка проводов', title: 'Показывать маркировку проводов', group: 'view' },
  toggle_crossrefs: { id: 'toggle_crossrefs', label: 'Перекрёстные ссылки', title: 'Перекрёстные ссылки между листами', group: 'view' },
  toggle_frame: { id: 'toggle_frame', label: 'Рамка ГОСТ', title: 'Показать/скрыть рамку и штамп ГОСТ', group: 'view' },
  toggle_bridges: { id: 'toggle_bridges', label: 'Мостики цепей', title: 'Перемычки (дуги) на пересечении несвязанных цепей', group: 'view' },
  open_visual_settings: { id: 'open_visual_settings', label: 'Все стили и настройки', title: 'Параметры графики, мини-карты и палитры', group: 'view' },
  add_sheet: { id: 'add_sheet', label: '+ Лист', title: 'Добавить новый лист схемы', group: 'sheet' },
  duplicate_sheet: { id: 'duplicate_sheet', label: 'Копия листа', title: 'Дублировать текущий лист', group: 'sheet' },
  delete_sheet: { id: 'delete_sheet', label: 'Удалить лист', title: 'Удалить активный лист', group: 'sheet', danger: true },
  open_stamp_editor: { id: 'open_stamp_editor', label: 'Штамп ГОСТ', title: 'Редактор основной надписи ГОСТ 2.104', group: 'sheet' },
  open_stamp_designer: { id: 'open_stamp_designer', label: 'Создать штамп', title: 'Конструктор пользовательских штампов', group: 'sheet' },
  open_hvac_wizard: { id: 'open_hvac_wizard', label: 'Собрать ФСА', title: 'Мастер автоматической сборки ФСА / ОВиК', group: 'sheet' },
  open_terminals: { id: 'open_terminals', label: 'Клеммы XT', title: 'Редактор клеммных рядов (-XT)', group: 'sheet' },
  open_autonumber: { id: 'open_autonumber', label: 'Нумерация ГОСТ', title: 'Пакетная автонумерация цепей и ОУО', group: 'sheet' },
  viewport_single: { id: 'viewport_single', label: '1 лист', title: 'Один активный лист в центре', group: 'view' },
  viewport_two: { id: 'viewport_two', label: '2 листа', title: 'Расположить 2 листа рядом', group: 'view' },
  viewport_three: { id: 'viewport_three', label: '3 листа', title: 'Расположить 3 листа одновременно', group: 'view' },
  viewport_four: { id: 'viewport_four', label: '4 листа', title: 'Расположить 4 листа сеткой 2×2', group: 'view' },
  action_fit: { id: 'action_fit', label: 'По листу', title: 'Вписать лист в окно', shortcut: 'Z', group: 'view' },
  toggle_minimap: { id: 'toggle_minimap', label: 'Мини-карта', title: 'Показать/скрыть мини-карту листа', group: 'view' },
  open_layers: { id: 'open_layers', label: 'Слои чертежа', title: 'Диспетчер слоёв чертежа', group: 'view' },
  reset_dock: { id: 'reset_dock', label: 'Сброс окон', title: 'Вернуть панели в стандартное положение', group: 'view' },
  flux_push: { id: 'flux_push', label: 'Во Flux Host', title: 'Синхронизировать проект по шине Flux Studio', group: 'flux' },
  flux_bus: { id: 'flux_bus', label: 'Шина Flux Bus', title: 'Открыть консоль обмена Flux Bus', group: 'flux' },
  flux_publish: { id: 'flux_publish', label: 'Регистрация модуля', title: 'Регистрация подпрограммы во Flux Studio', group: 'flux' },
  flux_zip: { id: 'flux_zip', label: 'Пакет Flux (.zip)', title: 'Скачать архив модуля Flux Studio (.zip)', group: 'flux' },
  export_bridge_json: { id: 'export_bridge_json', label: 'Мост (.json)', title: 'Экспортировать пакет обмена flux-e3-bridge/v1 JSON', group: 'flux' },
  e3_open_file: { id: 'e3_open_file', label: 'Открыть .e3s', title: 'Открыть файл .e3s / .e3d / XML / JSON', group: 'flux' },
  e3_direct: { id: 'e3_direct', label: 'В E³.series', title: 'Открыть проект напрямую в E³.series', group: 'flux' },
  e3_exchange: { id: 'e3_exchange', label: 'Обмен E3', title: 'Центр обмена E3.series и импорт пакетов', group: 'flux' },
  open_publish: { id: 'open_publish', label: 'Пакет PDF/DXF', title: 'Пакетная публикация листов в PDF и DXF', group: 'flux' },
  export_dxf: { id: 'export_dxf', label: 'Лист DXF', title: 'Экспорт активного листа в AutoCAD (.dxf)', group: 'flux' },
  export_bom_csv: { id: 'export_bom_csv', label: 'Список ПЭ3 (CSV)', title: 'Выгрузить спецификацию ПЭ3 в CSV', group: 'flux' },
  export_cables_csv: { id: 'export_cables_csv', label: 'Каб. журнал (CSV)', title: 'Выгрузить кабельный журнал в CSV', group: 'flux' },
  open_portable: { id: 'open_portable', label: 'Portable (.zip)', title: 'Сборка автономной Windows Portable (.zip)', group: 'flux' },
  download_codebase: { id: 'download_codebase', label: 'Исходники (.zip)', title: 'Скачать архив исходного кода', group: 'flux' },
};

export const FOCUS_QUICK_ACCESS_STORAGE_KEY = 'e3promax.focusQuickAccess.v1';

export const DEFAULT_FOCUS_QUICK_ACCESS_IDS: FocusQuickActionId[] = [
  'tool_select',
  'tool_wire',
  'tool_measure',
  'tool_pan',
  'tool_text',
  'tool_callout',
  'tool_rect',
  'tool_offpage',
  'action_rotate',
  'action_fit',
  'toggle_grid',
];

export function isFocusQuickActionId(val: unknown): val is FocusQuickActionId {
  return typeof val === 'string' && Object.prototype.hasOwnProperty.call(FOCUS_QUICK_ACTIONS, val);
}

export function normalizeFocusQuickAccessIds(raw: unknown): FocusQuickActionId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_FOCUS_QUICK_ACCESS_IDS];
  const seen = new Set<FocusQuickActionId>();
  const result: FocusQuickActionId[] = [];
  for (const item of raw) {
    if (isFocusQuickActionId(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

export function loadFocusQuickAccess(storage?: Pick<Storage, 'getItem'> | null): FocusQuickActionId[] {
  const targetStorage =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!targetStorage) return [...DEFAULT_FOCUS_QUICK_ACCESS_IDS];
  try {
    const raw = targetStorage.getItem(FOCUS_QUICK_ACCESS_STORAGE_KEY);
    if (!raw) return [...DEFAULT_FOCUS_QUICK_ACCESS_IDS];
    return normalizeFocusQuickAccessIds(JSON.parse(raw));
  } catch {
    return [...DEFAULT_FOCUS_QUICK_ACCESS_IDS];
  }
}

export function saveFocusQuickAccess(
  ids: FocusQuickActionId[],
  storage?: Pick<Storage, 'setItem'> | null
): void {
  const targetStorage =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
  if (!targetStorage) return;
  try {
    targetStorage.setItem(
      FOCUS_QUICK_ACCESS_STORAGE_KEY,
      JSON.stringify(normalizeFocusQuickAccessIds(ids))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function hasQuickAccessAction(
  ids: FocusQuickActionId[],
  id: FocusQuickActionId
): boolean {
  return ids.includes(id);
}

export function addQuickAccessAction(
  ids: FocusQuickActionId[],
  id: FocusQuickActionId
): FocusQuickActionId[] {
  if (!isFocusQuickActionId(id) || ids.includes(id)) return ids;
  return [...ids, id];
}

export function removeQuickAccessAction(
  ids: FocusQuickActionId[],
  id: FocusQuickActionId
): FocusQuickActionId[] {
  if (!ids.includes(id)) return ids;
  return ids.filter((item) => item !== id);
}

export function moveQuickAccessAction(
  ids: FocusQuickActionId[],
  id: FocusQuickActionId,
  delta: -1 | 1
): FocusQuickActionId[] {
  const idx = ids.indexOf(id);
  if (idx === -1) return ids;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= ids.length) return ids;
  const copy = [...ids];
  const [moved] = copy.splice(idx, 1);
  copy.splice(nextIdx, 0, moved);
  return copy;
}

export function resetFocusQuickAccess(): FocusQuickActionId[] {
  return [...DEFAULT_FOCUS_QUICK_ACCESS_IDS];
}

export function getFocusQuickActionDef(id: FocusQuickActionId): FocusQuickActionDef {
  return FOCUS_QUICK_ACTIONS[id];
}
