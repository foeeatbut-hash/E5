import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_SHEETS_SLOT_STEP_X,
  CANVAS_VIEW_MODE_STORAGE_KEY,
  computeAllSheetsLayout,
  computeSheetViewportFitTransform,
  DEFAULT_CANVAS_VIEW_MODE,
  findSheetSlotAtCanvasPoint,
  getSheetCanvasOrigin,
  loadCanvasViewMode,
  normalizeCanvasViewMode,
  saveCanvasViewMode,
} from './canvasSheetLayout';
import type { E3Sheet } from './e3Types';

function makeSheet(id: string, number: number, width: number, height: number): E3Sheet {
  return {
    id,
    number,
    name: `Лист ${number}`,
    format: width >= 3360 ? 'A1' : width >= 2380 ? 'A2' : width >= 1680 ? 'A3' : 'A4',
    width,
    height,
    titleBlock: {
      stampForm: number === 1 ? 'form1' : 'form2a',
      documentCode: 'DOC-001',
      projectTitle: 'Тест',
      organization: 'Тест',
      designer: 'Иванов',
      checker: '',
      techControl: '',
      normControl: '',
      approver: '',
      litera: 'Р',
      mass: '—',
      scale: 'б/м',
      date: '',
      invOriginal: '',
      invDuplicate: '',
      sheetTitle: `Лист ${number}`,
    },
  };
}

test('canvas view mode normalization and storage persistence', () => {
  assert.equal(DEFAULT_CANVAS_VIEW_MODE, 'single');
  assert.equal(normalizeCanvasViewMode('all'), 'all');
  assert.equal(normalizeCanvasViewMode('single'), 'single');
  assert.equal(normalizeCanvasViewMode('invalid'), 'single');

  const bag = new Map<string, string>();
  const mockStore = {
    getItem: (k: string) => bag.get(k) ?? null,
    setItem: (k: string, v: string) => {
      bag.set(k, v);
    },
  };

  assert.equal(loadCanvasViewMode(mockStore), 'single');
  saveCanvasViewMode('all', mockStore);
  assert.equal(bag.get(CANVAS_VIEW_MODE_STORAGE_KEY), 'all');
  assert.equal(loadCanvasViewMode(mockStore), 'all');
  saveCanvasViewMode('single', mockStore);
  assert.equal(loadCanvasViewMode(mockStore), 'single');
});

test('computeAllSheetsLayout keeps following sheets anchored when resizing earlier sheets across A4..A1', () => {
  const s1Small = makeSheet('s1', 1, 1200, 848); // A4
  const s2 = makeSheet('s2', 2, 1680, 1188); // A3
  const s3 = makeSheet('s3', 3, 2380, 1684); // A2

  const layoutA4 = computeAllSheetsLayout([s1Small, s2, s3]);
  assert.equal(layoutA4.slots.length, 3);
  assert.equal(layoutA4.bySheetId.get('s1')?.originX, 0);
  assert.equal(layoutA4.bySheetId.get('s2')?.originX, ALL_SHEETS_SLOT_STEP_X);
  assert.equal(layoutA4.bySheetId.get('s3')?.originX, ALL_SHEETS_SLOT_STEP_X * 2);

  // Resize Sheet 1 to A1 (3360x2376) -> Sheets 2 and 3 MUST NOT move!
  const s1Large = makeSheet('s1', 1, 3360, 2376);
  const layoutA1 = computeAllSheetsLayout([s1Large, s2, s3]);
  assert.equal(layoutA1.bySheetId.get('s1')?.originX, 0);
  assert.equal(layoutA1.bySheetId.get('s2')?.originX, layoutA4.bySheetId.get('s2')?.originX);
  assert.equal(layoutA1.bySheetId.get('s3')?.originX, layoutA4.bySheetId.get('s3')?.originX);

  // Zero overlap between adjacent sheets
  for (let i = 0; i < layoutA1.slots.length - 1; i++) {
    const cur = layoutA1.slots[i];
    const next = layoutA1.slots[i + 1];
    assert.ok(cur.originX + cur.width < next.originX);
  }
});

test('computeAllSheetsLayout guards against huge custom sheet overlap while preserving slot pitch thereafter', () => {
  const huge = makeSheet('s1', 1, 4500, 2400);
  const s2 = makeSheet('s2', 2, 1680, 1188);
  const s3 = makeSheet('s3', 3, 1200, 848);
  const layout = computeAllSheetsLayout([huge, s2, s3]);
  const slot1 = layout.bySheetId.get('s1')!;
  const slot2 = layout.bySheetId.get('s2')!;
  const slot3 = layout.bySheetId.get('s3')!;
  assert.equal(slot1.originX, 0);
  assert.ok(slot2.originX >= slot1.originX + slot1.width + 240);
  assert.equal(slot3.originX, ALL_SHEETS_SLOT_STEP_X * 2);
});

test('getSheetCanvasOrigin, hit-testing, and camera fit transform target the clicked sheet in all mode', () => {
  const s1 = makeSheet('s1', 1, 1680, 1188);
  const s2 = makeSheet('s2', 2, 1200, 848);
  const layout = computeAllSheetsLayout([s1, s2]);

  assert.deepEqual(getSheetCanvasOrigin(layout, 's2', 'single'), { x: 0, y: 0 });
  const origin2 = getSheetCanvasOrigin(layout, 's2', 'all');
  assert.deepEqual(origin2, { x: ALL_SHEETS_SLOT_STEP_X, y: 0 });

  assert.equal(findSheetSlotAtCanvasPoint(layout, 400, 300)?.sheet.id, 's1');
  assert.equal(findSheetSlotAtCanvasPoint(layout, ALL_SHEETS_SLOT_STEP_X + 300, 200)?.sheet.id, 's2');
  assert.equal(findSheetSlotAtCanvasPoint(layout, ALL_SHEETS_SLOT_STEP_X - 60, 200), null);

  const fit2 = computeSheetViewportFitTransform(s2, origin2, 1280, 760);
  const centeredSheetLeft = origin2.x * fit2.zoom + fit2.pan.x;
  const centeredSheetRight = (origin2.x + s2.width) * fit2.zoom + fit2.pan.x;
  const midX = (centeredSheetLeft + centeredSheetRight) / 2;
  assert.ok(Math.abs(midX - 1280 / 2) <= 2, `Expected sheet 2 centered around 640, got ${midX}`);
});
