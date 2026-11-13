import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCommandPaletteItems,
  pushCommandHistory,
  resolveCommandLineInput,
  stepCommandHistory,
} from './commandPalette.ts';
import { createSeedProject } from './e3Seed.ts';
import type { E3Annotation, E3Project } from './e3Types.ts';
import { buildGostTableRenderModel, estimateGostTableBounds } from './gostTables.ts';
import {
  ACTIVE_SESSION_STORAGE_KEY,
  RECENT_PROJECTS_STORAGE_KEY,
  clearActiveSession,
  loadActiveSession,
  loadRecentProjects,
  removeRecentProject,
  saveActiveSession,
  upsertRecentProject,
} from './sessionStorage.ts';
import {
  buildSymbolDesignerPreset,
  inferPinDirection,
  nextPinName,
  normalizeCustomSymbolSpec,
  snapSymbolCoord,
} from './symbolDesigner.ts';

function createMemoryStorage(maxCharsPerKey?: number): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      if (maxCharsPerKey !== undefined && value.length > maxCharsPerKey) {
        throw new Error('QuotaExceededError');
      }
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

// --- Stage 7.1: Symbol Designer ---

test('symbolDesigner snaps coordinates, infers pin direction and generates next pin names', () => {
  assert.equal(snapSymbolCoord(14, 10), 10);
  assert.equal(snapSymbolCoord(16, 10), 20);
  assert.equal(snapSymbolCoord(13, 5), 15);

  assert.equal(inferPinDirection(40, 0, 100, 100), 'top');
  assert.equal(inferPinDirection(40, 100, 100, 100), 'bottom');
  assert.equal(inferPinDirection(0, 50, 100, 100), 'left');
  assert.equal(inferPinDirection(100, 50, 100, 100), 'right');

  assert.equal(nextPinName([]), '1');
  assert.equal(nextPinName([{ name: '1' }, { name: '3' }]), '2');
  assert.equal(nextPinName([{ name: '1' }, { name: '2' }, { name: '3' }]), '4');
});

test('normalizeCustomSymbolSpec clamps geometry and snaps pins onto symbol bounds', () => {
  const preset = buildSymbolDesignerPreset('sensor_circle');
  assert.equal(preset.width, 100);
  assert.ok(preset.shapes.length >= 4);
  assert.equal(preset.pins.length, 2);

  const normalized = normalizeCustomSymbolSpec(
    23, // clamps to min 40
    117, // snaps to 120
    [
      { id: 's1', kind: 'line', x1: -10, y1: 15, x2: 999, y2: 40 },
      { id: 's2', kind: 'rect', x: 5, y: 5, width: 30, height: 40 },
      { id: 's3', kind: 'circle', cx: 20, cy: 50, r: 99 },
      { id: 's4', kind: 'text', x: 20, y: 20, text: '   ' },
    ],
    [{ name: '  ', dx: 18, dy: 0, direction: 'top', signalType: 'dc24' }]
  );

  assert.equal(normalized.width, 40);
  assert.equal(normalized.height, 120);
  assert.equal(normalized.customSymbol.showBodyBorder, false);
  const line = normalized.customSymbol.shapes[0];
  assert.equal(line.kind, 'line');
  if (line.kind === 'line') {
    assert.equal(line.x1, 0);
    assert.equal(line.x2, 40);
  }
  const circle = normalized.customSymbol.shapes[2];
  if (circle.kind === 'circle') {
    assert.ok(circle.r <= 20);
  }
  const txt = normalized.customSymbol.shapes[3];
  if (txt.kind === 'text') {
    assert.equal(txt.text, 'УГО');
  }
  assert.equal(normalized.pins[0].name, '1');
  assert.equal(normalized.pins[0].dx, 20);
});

// --- Stage 7.2: Live GOST Tables ---

test('buildGostTableRenderModel generates live BOM and cable tables with sheetOnly and maxRows', () => {
  const project = createSeedProject();
  const s1Id = project.sheets[0].id;

  const fullBom = buildGostTableRenderModel(
    { kind: 'bom_table', sheetId: s1Id, text: '', tableConfig: {} },
    project
  );
  assert.equal(fullBom.kind, 'bom_table');
  assert.ok(fullBom.totalRows >= 3);
  assert.equal(fullBom.rows.length, fullBom.totalRows);
  assert.equal(fullBom.truncatedCount, 0);
  assert.ok(fullBom.height > fullBom.titleHeight + fullBom.headerHeight);

  const limitedSheetBom = buildGostTableRenderModel(
    {
      kind: 'bom_table',
      sheetId: s1Id,
      text: 'ПЭ3 листа 1',
      tableConfig: { sheetOnly: true, maxRows: 2, rowHeight: 24 },
    },
    project
  );
  assert.equal(limitedSheetBom.title, 'ПЭ3 листа 1');
  assert.equal(limitedSheetBom.rows.length, 2);
  assert.equal(limitedSheetBom.truncatedCount, Math.max(0, limitedSheetBom.totalRows - 2));
  assert.equal(limitedSheetBom.rowHeight, 24);

  const cableTable = buildGostTableRenderModel(
    { kind: 'cable_table', sheetId: s1Id, text: '' },
    project
  );
  assert.equal(cableTable.kind, 'cable_table');
  assert.equal(cableTable.columns.length, 7);

  const annForBounds: Pick<E3Annotation, 'kind' | 'width' | 'height' | 'tableConfig'> = {
    kind: 'cable_table',
    width: 100,
    height: 20,
  };
  const bounds = estimateGostTableBounds(annForBounds);
  assert.ok(bounds.width >= 500);
  assert.ok(bounds.height >= 88);
});

// --- Stage 7.3: Session Persistence & Recent Projects ---

test('sessionStorage persists active session, maintains max-8 recent LRU and handles quota pruning', () => {
  const store = createMemoryStorage();
  const base = createSeedProject();

  const saved = saveActiveSession(base, base.sheets[0].id, store);
  assert.ok(saved.savedAt.length > 10);
  assert.equal(saved.recent.length, 1);

  const restored = loadActiveSession(store);
  assert.ok(restored);
  assert.equal(restored!.project.id, base.id);
  assert.equal(restored!.activeSheetId, base.sheets[0].id);

  // Add 9 more unique projects -> capped at 8
  for (let i = 1; i <= 9; i++) {
    const p: E3Project = {
      ...base,
      id: `proj-rec-${i}`,
      name: `Проект ${i}`,
      projectCode: `PRJ-${i}`,
    };
    upsertRecentProject(p, p.sheets[0].id, store, `2099-01-0${i}T12:00:00.000Z`);
  }
  const recentAll = loadRecentProjects(store);
  assert.equal(recentAll.length, 8);
  assert.equal(recentAll[0].id, 'proj-rec-9');

  const afterRemove = removeRecentProject('proj-rec-9', store);
  assert.equal(afterRemove.length, 7);
  assert.equal(afterRemove.some((e) => e.id === 'proj-rec-9'), false);

  clearActiveSession(store);
  assert.equal(loadActiveSession(store), null);

  // Quota exceeding store drops oldest entries instead of throwing
  const tightStore = createMemoryStorage(40000);
  upsertRecentProject(base, base.sheets[0].id, tightStore, '2026-02-01T10:00:00.000Z');
  const p2: E3Project = { ...base, id: 'proj-tight-2', name: 'Tight 2' };
  const afterQuota = upsertRecentProject(p2, p2.sheets[0].id, tightStore, '2026-02-02T10:00:00.000Z');
  assert.ok(afterQuota.length >= 1);
  assert.ok(ACTIVE_SESSION_STORAGE_KEY.length > 0);
  assert.ok(RECENT_PROJECTS_STORAGE_KEY.length > 0);
});

// --- AutoCAD Command Line & ArrowUp History ---

test('resolveCommandLineInput supports Russian/English AutoCAD commands, FIND/НАЙТИ, ЛИСТ, МАСШТАБ and history stepping', () => {
  const project = createSeedProject();
  const items = buildCommandPaletteItems(project, {
    hasSelection: true,
    hasClipboard: true,
    selectedDeviceCount: 2,
    canUndo: true,
    canRedo: true,
  });

  // НАЙТИ -KM1 finds exact device
  const findKm1 = resolveCommandLineInput('НАЙТИ -KM1', items, project);
  assert.equal(findKm1.status, 'ok');
  assert.equal(findKm1.action?.type, 'jump-device');

  // Empty FIND opens interactive search
  const openFind = resolveCommandLineInput('FIND', items, project);
  assert.equal(openFind.status, 'ok');
  assert.equal(openFind.action?.type, 'open-find');

  // ПРОВОД switches to wire tool
  const wireCmd = resolveCommandLineInput('ПРОВОД', items, project);
  assert.equal(wireCmd.status, 'ok');
  assert.deepEqual(wireCmd.action, { type: 'set-tool', tool: 'wire' });

  // СЕТКА toggles grid
  const gridCmd = resolveCommandLineInput('СЕТКА', items, project);
  assert.equal(gridCmd.status, 'ok');
  assert.deepEqual(gridCmd.action, { type: 'toggle-grid' });

  // УГО opens symbol designer
  const ugoCmd = resolveCommandLineInput('УГО', items, project);
  assert.equal(ugoCmd.status, 'ok');
  assert.deepEqual(ugoCmd.action, { type: 'open-symbol-designer' });

  // ТАБЛИЦАПЭ3 inserts BOM table
  const bomTblCmd = resolveCommandLineInput('ТАБЛИЦАПЭ3', items, project);
  assert.equal(bomTblCmd.status, 'ok');
  assert.deepEqual(bomTblCmd.action, { type: 'insert-sheet-table', tableKind: 'bom' });

  // МАСШТАБ 75 sets 75% zoom
  const zoomCmd = resolveCommandLineInput('МАСШТАБ 75', items, project);
  assert.equal(zoomCmd.status, 'ok');
  assert.deepEqual(zoomCmd.action, { type: 'zoom-percent', percent: 75 });

  // ЛИСТ 2 switches to sheet 2
  const sheetCmd = resolveCommandLineInput('ЛИСТ 2', items, project);
  assert.equal(sheetCmd.status, 'ok');
  assert.equal(sheetCmd.action?.type, 'jump-sheet');

  // Unknown command returns not_found
  const unknownCmd = resolveCommandLineInput('НЕИЗВЕСТНАЯКОМАНДА999', items, project);
  assert.equal(unknownCmd.status, 'not_found');

  // History deduplication & ArrowUp / ArrowDown draft preservation
  let hist = pushCommandHistory([], 'НАЙТИ -KM1');
  hist = pushCommandHistory(hist, 'НАЙТИ -KM1'); // consecutive duplicate ignored
  hist = pushCommandHistory(hist, 'СЕТКА');
  assert.deepEqual(hist, ['НАЙТИ -KM1', 'СЕТКА']);

  const step1 = stepCommandHistory(hist, -1, 'up', 'ПР', '');
  assert.equal(step1.nextIndex, 1);
  assert.equal(step1.nextValue, 'СЕТКА');
  assert.equal(step1.nextSavedDraft, 'ПР');

  const step2 = stepCommandHistory(hist, step1.nextIndex, 'up', step1.nextValue, step1.nextSavedDraft);
  assert.equal(step2.nextIndex, 0);
  assert.equal(step2.nextValue, 'НАЙТИ -KM1');

  const stepBack1 = stepCommandHistory(hist, step2.nextIndex, 'down', step2.nextValue, step2.nextSavedDraft);
  assert.equal(stepBack1.nextIndex, 1);
  assert.equal(stepBack1.nextValue, 'СЕТКА');

  const stepBackDraft = stepCommandHistory(
    hist,
    stepBack1.nextIndex,
    'down',
    stepBack1.nextValue,
    stepBack1.nextSavedDraft
  );
  assert.equal(stepBackDraft.nextIndex, -1);
  assert.equal(stepBackDraft.nextValue, 'ПР');
});
