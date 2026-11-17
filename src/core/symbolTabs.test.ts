import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addBlankSymbolTab,
  clearSymbolWorkspaceAutosave,
  closeSymbolTab,
  commitActiveTabGeometry,
  createInitialSymbolTabsState,
  createPlaceholderSymbolDraft,
  getActiveSymbolTab,
  getEffectiveSymbolDraft,
  loadSymbolWorkspaceAutosave,
  openOrFocusSymbolTab,
  redoActiveSymbolTab,
  saveSymbolWorkspaceAutosave,
  selectSymbolTab,
  summarizeSymbolTabs,
  SYMBOL_WORKSPACE_AUTOSAVE_KEY,
  undoActiveSymbolTab,
  updateActiveSymbolTabDraft,
} from './symbolTabs.ts';

function makeMemoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

test('symbolTabs: opens multiple UGO tabs and prevents duplicate tabs for same symbol', () => {
  let state = createInitialSymbolTabsState();
  assert.equal(state.open, false);

  const symA = createPlaceholderSymbolDraft({
    symbolId: 'sym-a',
    name: 'Автомат QF',
    e3BlockName: 'GOST_QF_1P',
  });
  state = openOrFocusSymbolTab(state, symA, 'hub');
  assert.equal(state.open, true);
  assert.equal(state.origin, 'hub');
  assert.equal(state.tabs.length, 1);

  const symB = createPlaceholderSymbolDraft({
    symbolId: 'sym-b',
    name: 'Катушка KA',
    e3BlockName: 'GOST_KA_COIL',
  });
  state = openOrFocusSymbolTab(state, symB, 'hub');
  assert.equal(state.tabs.length, 2);
  assert.equal(getEffectiveSymbolDraft(state).symbolId, 'sym-b');

  // Re-opening symA focuses existing tab 1 instead of duplicating
  state = openOrFocusSymbolTab(state, symA, 'hub');
  assert.equal(state.tabs.length, 2);
  assert.equal(getEffectiveSymbolDraft(state).symbolId, 'sym-a');
});

test('symbolTabs: supports creating new blank UGO tabs and isolated per-tab undo/redo', () => {
  let state = createInitialSymbolTabsState();
  state = addBlankSymbolTab(state, 'hub');
  state = addBlankSymbolTab(state, 'hub');
  assert.equal(state.tabs.length, 2);

  const tab1Id = state.tabs[0].tabId;
  const tab2Id = state.tabs[1].tabId;

  // Edit Tab 1 geometry
  state = selectSymbolTab(state, tab1Id);
  const initialTab1ShapeCount = getEffectiveSymbolDraft(state).shapes.length;
  state = commitActiveTabGeometry(
    state,
    [{ id: 'rect-1', kind: 'rect', x: 10, y: 10, width: 60, height: 40 }],
    [{ name: '1', dx: 0, dy: 20, direction: 'left', signalType: 'power' }]
  );
  assert.equal(getActiveSymbolTab(state)?.undoStack.length, 1);
  assert.equal(getEffectiveSymbolDraft(state).shapes.length, 1);

  // Switch to Tab 2 and verify Tab 2 has untouched undo stack
  state = selectSymbolTab(state, tab2Id);
  assert.equal(getActiveSymbolTab(state)?.undoStack.length, 0);
  state = updateActiveSymbolTabDraft(state, (d) => ({ ...d, name: 'Второй блок' }));

  // Switch back to Tab 1 and verify undo/redo works cleanly on Tab 1
  state = selectSymbolTab(state, tab1Id);
  assert.equal(getEffectiveSymbolDraft(state).shapes.length, 1);
  state = undoActiveSymbolTab(state);
  assert.equal(getEffectiveSymbolDraft(state).shapes.length, initialTab1ShapeCount);
  state = redoActiveSymbolTab(state);
  assert.equal(getEffectiveSymbolDraft(state).shapes.length, 1);

  const summary = summarizeSymbolTabs(state);
  assert.equal(summary.length, 2);
  assert.equal(summary[1].title, 'Второй блок');
});

test('symbolTabs: closing active tab selects neighbor and closing last closes workspace', () => {
  let state = createInitialSymbolTabsState();
  state = addBlankSymbolTab(state, 'project');
  state = addBlankSymbolTab(state, 'project');
  state = addBlankSymbolTab(state, 'project');
  const [t1, t2, t3] = state.tabs.map((t) => t.tabId);

  assert.equal(state.activeTabId, t3);
  state = closeSymbolTab(state, t3);
  assert.equal(state.open, true);
  assert.equal(state.activeTabId, t2);

  state = closeSymbolTab(state, t2);
  assert.equal(state.open, true);
  assert.equal(state.activeTabId, t1);

  state = closeSymbolTab(state, t1);
  assert.equal(state.open, false);
  assert.equal(state.activeTabId, null);
  assert.equal(state.tabs.length, 0);
});

test('symbolTabs: autosaves and restores active UGO draft, tabs, and undo stack across reload', () => {
  const store = makeMemoryStorage();
  let state = createInitialSymbolTabsState();
  state = addBlankSymbolTab(state, 'hub');
  state = commitActiveTabGeometry(
    state,
    [
      { id: 'r-1', kind: 'rect', x: 10, y: 10, width: 80, height: 60 },
      { id: 'c-1', kind: 'circle', cx: 50, cy: 40, r: 12 },
    ],
    [{ name: 'A1', dx: 0, dy: 20, direction: 'left', signalType: 'dc24' }],
    { width: 100, height: 80 }
  );
  state = updateActiveSymbolTabDraft(state, (d) => ({
    ...d,
    name: 'Автосохранённый контактор',
    e3BlockName: 'GOST_KM_AUTOSAVE',
  }));

  const savedAt = saveSymbolWorkspaceAutosave(state, store, '2026-11-15T12:30:00.000Z');
  assert.equal(savedAt, '2026-11-15T12:30:00.000Z');

  const loaded = loadSymbolWorkspaceAutosave(store);
  assert.ok(loaded);
  assert.equal(loaded.savedAt, '2026-11-15T12:30:00.000Z');
  assert.equal(loaded.state.open, true);
  assert.equal(loaded.state.origin, 'hub');
  assert.equal(loaded.state.tabs.length, 1);
  assert.equal(loaded.state.tabs[0].undoStack.length, 1);
  const restoredDraft = getEffectiveSymbolDraft(loaded.state);
  assert.equal(restoredDraft.name, 'Автосохранённый контактор');
  assert.equal(restoredDraft.e3BlockName, 'GOST_KM_AUTOSAVE');
  assert.equal(restoredDraft.shapes.length, 2);
  assert.equal(restoredDraft.pins.length, 1);

  // Corrupted storage should degrade safely
  store.setItem(SYMBOL_WORKSPACE_AUTOSAVE_KEY, '{broken json');
  assert.equal(loadSymbolWorkspaceAutosave(store), null);

  clearSymbolWorkspaceAutosave(store);
  assert.equal(loadSymbolWorkspaceAutosave(store), null);
});

test('symbolTabs: openOrFocusSymbolTab refreshes clean tabs and respects refreshExisting modes', () => {
  let state = createInitialSymbolTabsState();
  const v1 = createPlaceholderSymbolDraft({
    deviceId: 'dev-qf1',
    symbolId: 'sym-qf1',
    name: 'QF1 v1',
    width: 120,
    shapes: [{ id: 's1', kind: 'rect', x: 10, y: 10, width: 40, height: 40 }],
    dirty: false,
  });
  state = openOrFocusSymbolTab(state, v1, 'project');
  state = updateActiveSymbolTabDraft(state, (d) => ({ ...d, tool: 'rect', snapToGrid: false }));
  // Re-clear dirty as tool toggle should keep clean semantics for this test
  state = {
    ...state,
    tabs: state.tabs.map((t) => ({ ...t, draft: { ...t.draft, dirty: false } })),
  };

  // Reopen clean tab with updated v2 geometry -> should refresh draft while preserving tool/snap
  const v2 = createPlaceholderSymbolDraft({
    deviceId: 'dev-qf1',
    symbolId: 'sym-qf1',
    name: 'QF1 v2',
    width: 240,
    shapes: [
      { id: 's1', kind: 'rect', x: 10, y: 10, width: 40, height: 40 },
      { id: 's2', kind: 'circle', cx: 80, cy: 60, r: 20 },
    ],
    dirty: false,
  });
  state = openOrFocusSymbolTab(state, v2, 'project');
  let activeDraft = getEffectiveSymbolDraft(state);
  assert.equal(activeDraft.name, 'QF1 v2');
  assert.equal(activeDraft.width, 240);
  assert.equal(activeDraft.shapes.length, 2);
  assert.equal(activeDraft.tool, 'rect');
  assert.equal(activeDraft.snapToGrid, false);

  // Make tab dirty, reopen with default ifClean -> must preserve unsaved edits
  state = commitActiveTabGeometry(
    state,
    [{ id: 'unsaved', kind: 'line', x1: 0, y1: 0, x2: 50, y2: 50 }],
    []
  );
  assert.equal(getEffectiveSymbolDraft(state).dirty, true);
  state = openOrFocusSymbolTab(state, v1, 'project');
  activeDraft = getEffectiveSymbolDraft(state);
  assert.equal(activeDraft.shapes[0].id, 'unsaved');
  assert.equal(activeDraft.dirty, true);

  // Explicit refreshExisting: 'always' (used by CatalogItemModal -> edit UGO) replaces even dirty tab
  const freshCatalogSeed = createPlaceholderSymbolDraft({
    deviceId: 'dev-qf1',
    symbolId: 'sym-qf1',
    name: 'QF1 Fresh Seed',
    width: 180,
    shapes: [{ id: 'fresh-rect', kind: 'rect', x: 0, y: 0, width: 100, height: 60 }],
    dirty: false,
  });
  state = openOrFocusSymbolTab(state, freshCatalogSeed, 'project', {
    refreshExisting: 'always',
  });
  activeDraft = getEffectiveSymbolDraft(state);
  assert.equal(activeDraft.name, 'QF1 Fresh Seed');
  assert.equal(activeDraft.shapes[0].id, 'fresh-rect');
  assert.equal(activeDraft.dirty, false);
  assert.equal(getActiveSymbolTab(state)?.undoStack.length, 0);
});
