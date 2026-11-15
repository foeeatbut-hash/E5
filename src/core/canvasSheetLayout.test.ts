import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_SHEETS_MARGIN,
  ALL_SHEETS_MIN_GAP,
  CANVAS_VIEW_MODE_STORAGE_KEY,
  clampAllSheetsStripPan,
  computeAllSheetsLayout,
  computeAllSheetsStripMetrics,
  computePanForStripProgress,
  computeSheetViewportFitTransform,
  DEFAULT_CANVAS_VIEW_MODE,
  findSheetSlotAtCanvasPoint,
  getSheetCanvasOrigin,
  loadCanvasViewMode,
  normalizeCanvasViewMode,
  reindexAllSheetsLayout,
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
  assert.equal(ALL_SHEETS_MIN_GAP, 0);
  assert.equal(ALL_SHEETS_MARGIN, 0);
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

test('computeAllSheetsLayout places heterogeneous sheets linearly edge-to-edge with zero spacing or overlap', () => {
  const s1Small = makeSheet('s1', 1, 1200, 848); // A4
  const s2 = makeSheet('s2', 2, 1680, 1188); // A3
  const s3 = makeSheet('s3', 3, 2380, 1684); // A2

  const layoutA4 = computeAllSheetsLayout([s1Small, s2, s3]);
  assert.equal(layoutA4.slots.length, 3);
  assert.equal(layoutA4.bySheetId.get('s1')?.originX, 0);
  assert.equal(layoutA4.bySheetId.get('s2')?.originX, 1200);
  assert.equal(layoutA4.bySheetId.get('s3')?.originX, 1200 + 1680);
  assert.equal(layoutA4.totalWidth, 1200 + 1680 + 2380);

  // Resize Sheet 1 to A1 (3360x2376) -> subsequent sheets shift sequentially with zero gap and zero overlap
  const s1Large = makeSheet('s1', 1, 3360, 2376);
  const layoutA1 = reindexAllSheetsLayout([s1Large, s2, s3]);
  assert.equal(layoutA1.bySheetId.get('s1')?.originX, 0);
  assert.equal(layoutA1.bySheetId.get('s2')?.originX, 3360);
  assert.equal(layoutA1.bySheetId.get('s3')?.originX, 3360 + 1680);

  for (let i = 0; i < layoutA1.slots.length - 1; i++) {
    const cur = layoutA1.slots[i];
    const next = layoutA1.slots[i + 1];
    assert.equal(next.originX, cur.originX + cur.width);
  }
});

test('inserting or reordering sheets dynamically re-indexes all subsequent canvas positions cleanly with zero spacing', () => {
  const s1 = makeSheet('s1', 1, 1200, 848);
  const s2 = makeSheet('s2', 2, 1400, 920);
  const s3 = makeSheet('s3', 3, 1680, 1188);
  const inserted = makeSheet('s-new', 2, 1400, 920);

  const before = computeAllSheetsLayout([s1, s2, s3]);
  assert.equal(before.bySheetId.get('s2')?.originX, 1200);

  const afterInsert = reindexAllSheetsLayout([s1, inserted, { ...s2, number: 3 }, { ...s3, number: 4 }]);
  assert.equal(afterInsert.bySheetId.get('s1')?.originX, 0);
  assert.equal(afterInsert.bySheetId.get('s-new')?.originX, 1200);
  assert.equal(afterInsert.bySheetId.get('s2')?.originX, 1200 + 1400);
  assert.equal(afterInsert.bySheetId.get('s3')?.originX, 1200 + 1400 + 1400);

  // Reorder s3 to front -> positions re-index seamlessly
  const afterReorder = reindexAllSheetsLayout([{ ...s3, number: 1 }, { ...s1, number: 2 }, { ...s2, number: 3 }]);
  assert.equal(afterReorder.bySheetId.get('s3')?.originX, 0);
  assert.equal(afterReorder.bySheetId.get('s1')?.originX, 1680);
  assert.equal(afterReorder.bySheetId.get('s2')?.originX, 1680 + 1200);
});

test('getSheetCanvasOrigin, hit-testing, zero-margin fit, and infinite-strip scroll calculations work seamlessly', () => {
  const s1 = makeSheet('s1', 1, 1680, 1188);
  const s2 = makeSheet('s2', 2, 1200, 848);
  const s3 = makeSheet('s3', 3, 1200, 848);
  const layout = computeAllSheetsLayout([s1, s2, s3]);
  const expectedS2OriginX = 1680;

  assert.deepEqual(getSheetCanvasOrigin(layout, 's2', 'single'), { x: 0, y: 0 });
  const origin2 = getSheetCanvasOrigin(layout, 's2', 'all');
  assert.deepEqual(origin2, { x: expectedS2OriginX, y: 0 });

  assert.equal(findSheetSlotAtCanvasPoint(layout, 400, 300)?.sheet.id, 's1');
  assert.equal(findSheetSlotAtCanvasPoint(layout, expectedS2OriginX - 1, 200)?.sheet.id, 's1');
  assert.equal(findSheetSlotAtCanvasPoint(layout, expectedS2OriginX, 200)?.sheet.id, 's2');
  assert.equal(findSheetSlotAtCanvasPoint(layout, expectedS2OriginX + 300, 200)?.sheet.id, 's2');
  assert.equal(findSheetSlotAtCanvasPoint(layout, layout.totalWidth + 10, 200), null);

  const fit1Exact = computeSheetViewportFitTransform(s1, { x: 0, y: 0 }, 1680, 1188, { mode: 'all' });
  assert.equal(fit1Exact.zoom, 1);
  assert.deepEqual(fit1Exact.pan, { x: 0, y: 0 });
  const fit1All = computeSheetViewportFitTransform(s1, { x: 0, y: 0 }, 1200, 848, { mode: 'all' });
  // Zero-margin fit centers cleanly without artificial 8px/6px clamping
  assert.ok(Math.abs(fit1All.pan.x) < 2 && Math.abs(fit1All.pan.y) < 2);

  const fit2 = computeSheetViewportFitTransform(s2, origin2, 1280, 760, { mode: 'all' });
  const centeredSheetLeft = origin2.x * fit2.zoom + fit2.pan.x;
  const centeredSheetRight = (origin2.x + s2.width) * fit2.zoom + fit2.pan.x;
  const midX = (centeredSheetLeft + centeredSheetRight) / 2;
  assert.ok(Math.abs(midX - 1280 / 2) <= 2, `Expected sheet 2 centered around 640, got ${midX}`);

  // Strip scroll metrics & progress mapping (viewportWidth=1000 at zoom=1.0)
  const startMetrics = computeAllSheetsStripMetrics(layout, { x: 0, y: 0 }, 1000, 760, 1.0);
  assert.equal(startMetrics.scrollProgress, 0);
  assert.equal(startMetrics.centeredSheetId, 's1');

  const midPan = computePanForStripProgress(layout, 0.5, 0, 1000, 1.0);
  const midMetrics = computeAllSheetsStripMetrics(layout, midPan, 1000, 760, 1.0);
  assert.ok(Math.abs(midMetrics.scrollProgress - 0.5) < 0.01);
  assert.equal(midMetrics.centeredSheetId, 's2');

  const endPan = computePanForStripProgress(layout, 1, 0, 1000, 1.0);
  const endMetrics = computeAllSheetsStripMetrics(layout, endPan, 1000, 760, 1.0);
  assert.ok(Math.abs(endMetrics.scrollProgress - 1) < 0.01);
  assert.equal(endMetrics.centeredSheetId, 's3');

  const clamped = clampAllSheetsStripPan(layout, { x: 9999, y: 9999 }, 1000, 760, 1.0);
  assert.equal(clamped.x, 0);
});
