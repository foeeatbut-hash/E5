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
  options?: { forceNewTab?: boolean }
): SymbolTabsState {
  const resolvedOrigin = origin ?? state.origin;
  const openDraft: SymbolWorkspaceDraft = { ...draft, open: true };

  if (!options?.forceNewTab) {
    const existingIdx = findMatchingTabIndex(state.tabs, openDraft);
    if (existingIdx >= 0) {
      const existing = state.tabs[existingIdx];
      return {
        ...state,
        open: true,
        origin: resolvedOrigin,
        activeTabId: existing.tabId,
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
