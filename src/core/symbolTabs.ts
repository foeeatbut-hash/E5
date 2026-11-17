import type { CustomSymbolShape, E3Pin } from './e3Types';
import { buildSymbolDesignerPreset } from './symbolDesigner';
import { applyAttributeTemplate } from './symbolLibrary';
import type {
  SymbolActiveDrawStyle,
  SymbolGeoSnapshot,
  SymbolTabSummary,
  SymbolWorkspaceDraft,
  SymbolWorkspaceOrigin,
} from './symbolWorkspaceTypes';

export interface SymbolWorkspaceTab {
  tabId: string;
  draft: SymbolWorkspaceDraft;
  undoStack: SymbolGeoSnapshot[];
  redoStack: SymbolGeoSnapshot[];
}

export interface SymbolTabsState {
  open: boolean;
  origin: SymbolWorkspaceOrigin;
  activeTabId: string | null;
  tabs: SymbolWorkspaceTab[];
  nextTabSeq: number;
}

export const DEFAULT_SYMBOL_ACTIVE_STYLE: SymbolActiveDrawStyle = {
  strokeColor: '#111827',
  strokeWidth: 1.8,
  strokeStyle: 'solid',
  filled: true,
  fillColor: '',
};

export function createPlaceholderSymbolDraft(
  overrides: Partial<SymbolWorkspaceDraft> = {}
): SymbolWorkspaceDraft {
  return {
    open: false,
    targetMode: 'component',
    symbolId: 'sym-new',
    name: 'Новый блок УГО',
    e3BlockName: 'E3_NEW_BLK',
    category: 'relay',
    width: 120,
    height: 100,
    shapes: [],
    pins: [],
    componentName: 'Новое изделие',
    article: 'E3-NEW-01',
    manufacturer: 'Собств. база',
    defaultPrefix: 'K',
    defaultCable: 'ВВГнг(А)-LS 3х1,5',
    attributes: [],
    tool: 'select',
    activeStyle: { ...DEFAULT_SYMBOL_ACTIVE_STYLE },
    activeAttrTagKey: 'designation',
    activePinSignal: 'signal',
    gridStep: 10,
    snapToGrid: true,
    selectedShapeId: null,
    selectedPinIndex: null,
    dirty: false,
    ...overrides,
  };
}

export function createBlankSymbolDraft(indexSeq = 1): SymbolWorkspaceDraft {
  const preset = buildSymbolDesignerPreset('blank_box');
  const code = String(indexSeq).padStart(2, '0');
  const uniqueStamp = `${Date.now().toString(36).slice(-4).toUpperCase()}_${code}`;
  return createPlaceholderSymbolDraft({
    open: true,
    targetMode: 'symbol',
    symbolId: `sym-custom-${Date.now().toString(36)}-${indexSeq}`,
    catalogItemId: undefined,
    deviceId: undefined,
    name: `Новое УГО ${indexSeq}`,
    e3BlockName: `E3_BLK_${uniqueStamp}`,
    category: 'relay',
    width: preset.width,
    height: preset.height,
    shapes: structuredClone(preset.shapes),
    pins: structuredClone(preset.pins),
    componentName: `Новое изделие ${indexSeq}`,
    article: `ART-${uniqueStamp}`,
    manufacturer: 'Собств. база',
    defaultPrefix: 'K',
    defaultCable: 'ВВГнг(А)-LS 3х1,5',
    attributes: applyAttributeTemplate([], 'gost_base'),
    dirty: true,
  });
}

export function createInitialSymbolTabsState(): SymbolTabsState {
  return {
    open: false,
    origin: 'project',
    activeTabId: null,
    tabs: [],
    nextTabSeq: 1,
  };
}

export function getActiveSymbolTab(state: SymbolTabsState): SymbolWorkspaceTab | null {
  if (!state.open || state.tabs.length === 0) return null;
  if (state.activeTabId) {
    const found = state.tabs.find((t) => t.tabId === state.activeTabId);
    if (found) return found;
  }
  return state.tabs[0];
}

export function getEffectiveSymbolDraft(state: SymbolTabsState): SymbolWorkspaceDraft {
  const active = getActiveSymbolTab(state);
  if (!active) return createPlaceholderSymbolDraft({ open: false });
  return { ...active.draft, open: state.open };
}

export function summarizeSymbolTabs(state: SymbolTabsState): SymbolTabSummary[] {
  return state.tabs.map((t) => ({
    tabId: t.tabId,
    title: t.draft.name.trim() || t.draft.e3BlockName.trim() || 'Блок УГО',
    blockName: t.draft.e3BlockName,
    dirty: t.draft.dirty,
    targetMode: t.draft.targetMode,
    symbolId: t.draft.symbolId,
  }));
}

function findMatchingTabIndex(
  tabs: SymbolWorkspaceTab[],
  draft: SymbolWorkspaceDraft
): number {
  return tabs.findIndex((t) => {
    if (draft.deviceId && t.draft.deviceId === draft.deviceId) return true;
    if (draft.catalogItemId && t.draft.catalogItemId === draft.catalogItemId) {
      return !t.draft.deviceId && !draft.deviceId;
    }
    if (
      !draft.deviceId &&
      !draft.catalogItemId &&
      !t.draft.deviceId &&
      !t.draft.catalogItemId &&
      draft.symbolId &&
      t.draft.symbolId === draft.symbolId
    ) {
      return true;
    }
    return false;
  });
}

export function openOrFocusSymbolTab(
  state: SymbolTabsState,
  draft: SymbolWorkspaceDraft,
  origin?: SymbolWorkspaceOrigin,
  options?: { forceNewTab?: boolean; refreshExisting?: 'always' | 'ifClean' }
): SymbolTabsState {
  const resolvedOrigin = origin ?? state.origin;
  const openDraft: SymbolWorkspaceDraft = { ...draft, open: true };
  const refreshMode = options?.refreshExisting ?? 'ifClean';

  if (!options?.forceNewTab) {
    const existingIdx = findMatchingTabIndex(state.tabs, openDraft);
    if (existingIdx >= 0) {
      const existing = state.tabs[existingIdx];
      const shouldRefresh =
        refreshMode === 'always' || (refreshMode === 'ifClean' && !existing.draft.dirty);
      const nextTabs = shouldRefresh
        ? state.tabs.map((tab, idx) =>
            idx === existingIdx
              ? {
                  ...tab,
                  draft: {
                    ...openDraft,
                    open: true,
                    tool: tab.draft.tool,
                    activeStyle: openDraft.activeStyle || tab.draft.activeStyle,
                    gridStep: openDraft.gridStep || tab.draft.gridStep,
                    snapToGrid: tab.draft.snapToGrid,
                  },
                  undoStack: [],
                  redoStack: [],
                }
              : tab
          )
        : state.tabs;
      return {
        ...state,
        open: true,
        origin: resolvedOrigin,
        activeTabId: existing.tabId,
        tabs: nextTabs,
      };
    }
  }

  const tabId = `ugo-tab-${state.nextTabSeq}`;
  const nextTab: SymbolWorkspaceTab = {
    tabId,
    draft: openDraft,
    undoStack: [],
    redoStack: [],
  };

  return {
    open: true,
    origin: resolvedOrigin,
    activeTabId: tabId,
    tabs: [...state.tabs, nextTab],
    nextTabSeq: state.nextTabSeq + 1,
  };
}

export function addBlankSymbolTab(
  state: SymbolTabsState,
  origin?: SymbolWorkspaceOrigin
): SymbolTabsState {
  const blankDraft = createBlankSymbolDraft(state.nextTabSeq);
  return openOrFocusSymbolTab(state, blankDraft, origin ?? state.origin, { forceNewTab: true });
}

export function selectSymbolTab(state: SymbolTabsState, tabId: string): SymbolTabsState {
  if (!state.tabs.some((t) => t.tabId === tabId)) return state;
  return {
    ...state,
    open: true,
    activeTabId: tabId,
  };
}

export function closeSymbolTab(state: SymbolTabsState, tabId: string): SymbolTabsState {
  const idx = state.tabs.findIndex((t) => t.tabId === tabId);
  if (idx < 0) return state;

  const nextTabs = state.tabs.filter((t) => t.tabId !== tabId);
  if (nextTabs.length === 0) {
    return {
      ...state,
      open: false,
      activeTabId: null,
      tabs: [],
    };
  }

  let nextActiveId = state.activeTabId;
  if (state.activeTabId === tabId || !nextTabs.some((t) => t.tabId === nextActiveId)) {
    const fallbackIdx = Math.min(idx, nextTabs.length - 1);
    nextActiveId = nextTabs[fallbackIdx].tabId;
  }

  return {
    ...state,
    open: true,
    activeTabId: nextActiveId,
    tabs: nextTabs,
  };
}

export function closeAllSymbolWorkspace(state: SymbolTabsState): SymbolTabsState {
  return {
    ...state,
    open: false,
  };
}

export function updateActiveSymbolTab(
  state: SymbolTabsState,
  updater: (tab: SymbolWorkspaceTab) => SymbolWorkspaceTab
): SymbolTabsState {
  const active = getActiveSymbolTab(state);
  if (!active) return state;
  const updated = updater(active);
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.tabId === active.tabId ? updated : t)),
  };
}

export function updateActiveSymbolTabDraft(
  state: SymbolTabsState,
  updater: (draft: SymbolWorkspaceDraft) => SymbolWorkspaceDraft
): SymbolTabsState {
  return updateActiveSymbolTab(state, (tab) => ({
    ...tab,
    draft: { ...updater(tab.draft), open: true },
  }));
}

export function commitActiveTabGeometry(
  state: SymbolTabsState,
  nextShapes: CustomSymbolShape[],
  nextPins: Omit<E3Pin, 'id'>[],
  bounds?: { width?: number; height?: number }
): SymbolTabsState {
  return updateActiveSymbolTab(state, (tab) => {
    const snap: SymbolGeoSnapshot = {
      width: tab.draft.width,
      height: tab.draft.height,
      shapes: structuredClone(tab.draft.shapes),
      pins: structuredClone(tab.draft.pins),
    };
    return {
      ...tab,
      undoStack: [...tab.undoStack.slice(-29), snap],
      redoStack: [],
      draft: {
        ...tab.draft,
        open: true,
        width: bounds?.width ?? tab.draft.width,
        height: bounds?.height ?? tab.draft.height,
        shapes: nextShapes,
        pins: nextPins,
        dirty: true,
      },
    };
  });
}

export function undoActiveSymbolTab(state: SymbolTabsState): SymbolTabsState {
  const active = getActiveSymbolTab(state);
  if (!active || active.undoStack.length === 0) return state;
  const prevSnap = active.undoStack[active.undoStack.length - 1];
  const redoEntry: SymbolGeoSnapshot = {
    width: active.draft.width,
    height: active.draft.height,
    shapes: structuredClone(active.draft.shapes),
    pins: structuredClone(active.draft.pins),
  };
  return updateActiveSymbolTab(state, (tab) => ({
    ...tab,
    undoStack: tab.undoStack.slice(0, -1),
    redoStack: [redoEntry, ...tab.redoStack.slice(0, 29)],
    draft: {
      ...tab.draft,
      open: true,
      width: prevSnap.width,
      height: prevSnap.height,
      shapes: prevSnap.shapes,
      pins: prevSnap.pins,
      selectedShapeId: null,
      selectedPinIndex: null,
      dirty: true,
    },
  }));
}

export function redoActiveSymbolTab(state: SymbolTabsState): SymbolTabsState {
  const active = getActiveSymbolTab(state);
  if (!active || active.redoStack.length === 0) return state;
  const nextSnap = active.redoStack[0];
  const undoEntry: SymbolGeoSnapshot = {
    width: active.draft.width,
    height: active.draft.height,
    shapes: structuredClone(active.draft.shapes),
    pins: structuredClone(active.draft.pins),
  };
  return updateActiveSymbolTab(state, (tab) => ({
    ...tab,
    undoStack: [...tab.undoStack.slice(-29), undoEntry],
    redoStack: tab.redoStack.slice(1),
    draft: {
      ...tab.draft,
      open: true,
      width: nextSnap.width,
      height: nextSnap.height,
      shapes: nextSnap.shapes,
      pins: nextSnap.pins,
      selectedShapeId: null,
      selectedPinIndex: null,
      dirty: true,
    },
  }));
}

export const SYMBOL_WORKSPACE_AUTOSAVE_KEY = 'e3promax.symbolWorkspaceAutosave.v1';

export interface SymbolWorkspaceAutosaveSnapshot {
  version: 1;
  savedAt: string;
  state: SymbolTabsState;
}

function getSafeLocalStorage(
  explicit?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  if (explicit !== undefined) return explicit;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore SSR/privacy errors
  }
  return null;
}

function sanitizeGeoSnapshot(raw: unknown): SymbolGeoSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const shapes = Array.isArray(r.shapes) ? (r.shapes as CustomSymbolShape[]) : [];
  const pins = Array.isArray(r.pins) ? (r.pins as Omit<E3Pin, 'id'>[]) : [];
  const width = typeof r.width === 'number' && Number.isFinite(r.width) && r.width > 0 ? r.width : 120;
  const height = typeof r.height === 'number' && Number.isFinite(r.height) && r.height > 0 ? r.height : 100;
  return { width, height, shapes, pins };
}

function sanitizeSymbolDraft(raw: unknown): SymbolWorkspaceDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const base = createPlaceholderSymbolDraft();
  const rawStyle =
    r.activeStyle && typeof r.activeStyle === 'object'
      ? (r.activeStyle as Partial<SymbolActiveDrawStyle>)
      : {};
  return {
    ...base,
    open: Boolean(r.open),
    targetMode:
      r.targetMode === 'symbol' || r.targetMode === 'component' || r.targetMode === 'device'
        ? r.targetMode
        : base.targetMode,
    symbolId: typeof r.symbolId === 'string' && r.symbolId.trim() ? r.symbolId : base.symbolId,
    catalogItemId: typeof r.catalogItemId === 'string' ? r.catalogItemId : undefined,
    deviceId: typeof r.deviceId === 'string' ? r.deviceId : undefined,
    name: typeof r.name === 'string' ? r.name : base.name,
    e3BlockName: typeof r.e3BlockName === 'string' ? r.e3BlockName : base.e3BlockName,
    category: typeof r.category === 'string' ? (r.category as SymbolWorkspaceDraft['category']) : base.category,
    width: typeof r.width === 'number' && Number.isFinite(r.width) && r.width >= 20 ? r.width : base.width,
    height: typeof r.height === 'number' && Number.isFinite(r.height) && r.height >= 20 ? r.height : base.height,
    shapes: Array.isArray(r.shapes) ? (r.shapes as CustomSymbolShape[]) : [],
    pins: Array.isArray(r.pins) ? (r.pins as Omit<E3Pin, 'id'>[]) : [],
    componentName: typeof r.componentName === 'string' ? r.componentName : base.componentName,
    article: typeof r.article === 'string' ? r.article : base.article,
    manufacturer: typeof r.manufacturer === 'string' ? r.manufacturer : base.manufacturer,
    defaultPrefix: typeof r.defaultPrefix === 'string' ? r.defaultPrefix : base.defaultPrefix,
    defaultCable: typeof r.defaultCable === 'string' ? r.defaultCable : base.defaultCable,
    attributes: Array.isArray(r.attributes) ? (r.attributes as SymbolWorkspaceDraft['attributes']) : [],
    tool: typeof r.tool === 'string' ? (r.tool as SymbolWorkspaceDraft['tool']) : base.tool,
    activeStyle: {
      strokeColor:
        typeof rawStyle.strokeColor === 'string' && rawStyle.strokeColor
          ? rawStyle.strokeColor
          : DEFAULT_SYMBOL_ACTIVE_STYLE.strokeColor,
      strokeWidth:
        typeof rawStyle.strokeWidth === 'number' && Number.isFinite(rawStyle.strokeWidth)
          ? rawStyle.strokeWidth
          : DEFAULT_SYMBOL_ACTIVE_STYLE.strokeWidth,
      strokeStyle:
        rawStyle.strokeStyle === 'solid' ||
        rawStyle.strokeStyle === 'dashed' ||
        rawStyle.strokeStyle === 'dotted' ||
        rawStyle.strokeStyle === 'dashdot'
          ? rawStyle.strokeStyle
          : DEFAULT_SYMBOL_ACTIVE_STYLE.strokeStyle,
      filled: typeof rawStyle.filled === 'boolean' ? rawStyle.filled : DEFAULT_SYMBOL_ACTIVE_STYLE.filled,
      fillColor: typeof rawStyle.fillColor === 'string' ? rawStyle.fillColor : DEFAULT_SYMBOL_ACTIVE_STYLE.fillColor,
    },
    activeAttrTagKey: typeof r.activeAttrTagKey === 'string' ? r.activeAttrTagKey : base.activeAttrTagKey,
    activePinSignal:
      typeof r.activePinSignal === 'string'
        ? (r.activePinSignal as SymbolWorkspaceDraft['activePinSignal'])
        : base.activePinSignal,
    gridStep:
      typeof r.gridStep === 'number' && Number.isFinite(r.gridStep) && r.gridStep >= 1
        ? r.gridStep
        : base.gridStep,
    snapToGrid: typeof r.snapToGrid === 'boolean' ? r.snapToGrid : base.snapToGrid,
    selectedShapeId: typeof r.selectedShapeId === 'string' ? r.selectedShapeId : null,
    selectedPinIndex: typeof r.selectedPinIndex === 'number' ? r.selectedPinIndex : null,
    dirty: Boolean(r.dirty),
  };
}

export function sanitizeSymbolTabsStateForAutosave(raw: unknown): SymbolTabsState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.tabs)) return null;
  const tabs: SymbolWorkspaceTab[] = [];
  for (let i = 0; i < r.tabs.length; i++) {
    const item = r.tabs[i];
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const draft = sanitizeSymbolDraft(t.draft);
    if (!draft) continue;
    const undoStack = Array.isArray(t.undoStack)
      ? t.undoStack.map(sanitizeGeoSnapshot).filter((x): x is SymbolGeoSnapshot => x !== null)
      : [];
    const redoStack = Array.isArray(t.redoStack)
      ? t.redoStack.map(sanitizeGeoSnapshot).filter((x): x is SymbolGeoSnapshot => x !== null)
      : [];
    tabs.push({
      tabId: typeof t.tabId === 'string' && t.tabId ? t.tabId : `ugo-tab-${i + 1}`,
      draft,
      undoStack: undoStack.slice(-20),
      redoStack: redoStack.slice(0, 20),
    });
  }
  if (tabs.length === 0) return null;
  const origin: SymbolWorkspaceOrigin = r.origin === 'hub' ? 'hub' : 'project';
  const activeTabId =
    typeof r.activeTabId === 'string' && tabs.some((t) => t.tabId === r.activeTabId)
      ? r.activeTabId
      : tabs[0].tabId;
  const nextTabSeq =
    typeof r.nextTabSeq === 'number' && Number.isFinite(r.nextTabSeq) && r.nextTabSeq > tabs.length
      ? Math.floor(r.nextTabSeq)
      : tabs.length + 1;
  return {
    open: Boolean(r.open),
    origin,
    activeTabId,
    tabs,
    nextTabSeq,
  };
}

export function saveSymbolWorkspaceAutosave(
  state: SymbolTabsState,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  nowIso = new Date().toISOString()
): string | null {
  const store = getSafeLocalStorage(storage);
  if (!store) return null;
  try {
    if (state.tabs.length === 0) {
      store.removeItem(SYMBOL_WORKSPACE_AUTOSAVE_KEY);
      return null;
    }
    const payload: SymbolWorkspaceAutosaveSnapshot = {
      version: 1,
      savedAt: nowIso,
      state: {
        ...state,
        tabs: state.tabs.map((t) => ({
          ...t,
          undoStack: t.undoStack.slice(-15),
          redoStack: t.redoStack.slice(0, 15),
        })),
      },
    };
    store.setItem(SYMBOL_WORKSPACE_AUTOSAVE_KEY, JSON.stringify(payload));
    return nowIso;
  } catch {
    return null;
  }
}

export function loadSymbolWorkspaceAutosave(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): SymbolWorkspaceAutosaveSnapshot | null {
  const store = getSafeLocalStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(SYMBOL_WORKSPACE_AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const cleanState = sanitizeSymbolTabsStateForAutosave(parsed.state);
    if (!cleanState) return null;
    return {
      version: 1,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      state: cleanState,
    };
  } catch {
    return null;
  }
}

export function clearSymbolWorkspaceAutosave(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): void {
  const store = getSafeLocalStorage(storage);
  if (!store) return;
  try {
    store.removeItem(SYMBOL_WORKSPACE_AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}

