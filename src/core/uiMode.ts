export type UiWorkspaceMode = 'classic' | 'hybrid' | 'focus';

export const DEFAULT_UI_MODE: UiWorkspaceMode = 'focus';

export interface UiWorkspaceModeMeta {
  id: UiWorkspaceMode;
  label: string;
  shortLabel: string;
  title: string;
  groupLabel: 'Этот интерфейс' | 'Новый интерфейс';
  description: string;
}

export const UI_MODE_STORAGE_KEY = 'e3promax.uiMode.v1';

export const UI_MODE_OPTIONS: ReadonlyArray<UiWorkspaceModeMeta> = [
  {
    id: 'classic',
    label: 'Этот интерфейс (Классический)',
    shortLabel: 'Классический',
    title: 'Этот интерфейс (Классический)',
    groupLabel: 'Этот интерфейс',
    description: 'Оригинальная панель и лента E3ProMax с изумрудной палитрой и классической раскладкой.',
  },
  {
    id: 'hybrid',
    label: 'Гибрид (Вариант А)',
    shortLabel: 'Гибрид (А)',
    title: 'Новый · Гибрид (Вариант А)',
    groupLabel: 'Новый интерфейс',
    description: 'Рейка режимов 40 px, сплит ПЭ3 | ERC, 2-колоночная база и нижний док на холсте.',
  },
  {
    id: 'focus',
    label: 'Фокус-холст (Вариант Б)',
    shortLabel: 'Фокус-холст (Б)',
    title: 'Новый · Фокус-холст (Вариант Б)',
    groupLabel: 'Новый интерфейс',
    description: 'Максимальный чертёж, плавающий вертикальный рельс инструментов и командная строка Ctrl+K.',
  },
];

export function isNewUiMode(mode: UiWorkspaceMode): boolean {
  return mode !== 'classic';
}

export function normalizeUiWorkspaceMode(raw: unknown): UiWorkspaceMode {
  if (raw === 'classic' || raw === 'hybrid' || raw === 'focus') {
    return raw;
  }
  return DEFAULT_UI_MODE;
}

export function getUiModeMeta(mode: UiWorkspaceMode): UiWorkspaceModeMeta {
  return (
    UI_MODE_OPTIONS.find((m) => m.id === mode) ??
    UI_MODE_OPTIONS.find((m) => m.id === DEFAULT_UI_MODE) ??
    UI_MODE_OPTIONS[0]
  );
}

export function defaultRibbonCollapsedForMode(mode: UiWorkspaceMode): boolean {
  return mode !== 'classic';
}

export function loadUiMode(
  storage?: Pick<Storage, 'getItem'> | null
): UiWorkspaceMode {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return DEFAULT_UI_MODE;
    const raw = store.getItem(UI_MODE_STORAGE_KEY);
    return normalizeUiWorkspaceMode(raw);
  } catch {
    return DEFAULT_UI_MODE;
  }
}

export function saveUiMode(
  mode: UiWorkspaceMode,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return;
    store.setItem(UI_MODE_STORAGE_KEY, normalizeUiWorkspaceMode(mode));
  } catch {
    // Ignore storage quota errors
  }
}

export function applyUiModeToDocument(mode: UiWorkspaceMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.uiMode = normalizeUiWorkspaceMode(mode);
}
