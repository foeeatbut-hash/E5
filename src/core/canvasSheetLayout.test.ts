import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_SHEETS_MIN_GAP,
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

test('computeAllSheetsLayout places heterogeneous sheets compactly in sequence without gaps or overlap', () => {
  const s1Small = makeSheet('s1', 1, 1200, 848); // A4
  const s2 = makeSheet('s2', 2, 1680, 1188); // A3
  const s3 = makeSheet('s3', 3, 2380, 1684); // A2

  const layoutA4 = computeAllSheetsLayout([s1Small, s2, s3]);
  assert.equal(layoutA4.slots.length, 3);
  assert.equal(layoutA4.bySheetId.get('s1')?.originX, 0);
  assert.equal(layoutA4.bySheetId.get('s2')?.originX, 1200 + ALL_SHEETS_MIN_GAP);
  assert.equal(
    layoutA4.bySheetId.get('s3')?.originX,
    1200 + ALL_SHEETS_MIN_GAP + 1680 + ALL_SHEETS_MIN_GAP
  );

  // Resize Sheet 1 to A1 (3360x2376) -> subsequent sheets shift sequentially with zero overlap
  const s1Large = makeSheet('s1', 1, 3360, 2376);
  const layoutA1 = computeAllSheetsLayout([s1Large, s2, s3]);
  assert.equal(layoutA1.bySheetId.get('s1')?.originX, 0);
  assert.equal(layoutA1.bySheetId.get('s2')?.originX, 3360 + ALL_SHEETS_MIN_GAP);
  assert.equal(
    layoutA1.bySheetId.get('s3')?.originX,
    3360 + ALL_SHEETS_MIN_GAP + 1680 + ALL_SHEETS_MIN_GAP
  );

  for (let i = 0; i < layoutA1.slots.length - 1; i++) {
    const cur = layoutA1.slots[i];
    const next = layoutA1.slots[i + 1];
    assert.equal(next.originX, cur.originX + cur.width + ALL_SHEETS_MIN_GAP);
  }
});

test('inserting a new sheet between Sheet 1 and Sheet 2 shifts old Sheet 2 and subsequent sheets sequentially', () => {
  const s1 = makeSheet('s1', 1, 1200, 848);
  const s2 = makeSheet('s2', 2, 1400, 920);
  const s3 = makeSheet('s3', 3, 1680, 1188);
  const inserted = makeSheet('s-new', 2, 1400, 920);

  const before = computeAllSheetsLayout([s1, s2, s3]);
  assert.equal(before.bySheetId.get('s2')?.originX, 1200 + ALL_SHEETS_MIN_GAP);

  const after = computeAllSheetsLayout([s1, inserted, { ...s2, number: 3 }, { ...s3, number: 4 }]);
  assert.equal(after.bySheetId.get('s1')?.originX, 0);
  assert.equal(after.bySheetId.get('s-new')?.originX, 1200 + ALL_SHEETS_MIN_GAP);
  assert.equal(
    after.bySheetId.get('s2')?.originX,
    1200 + ALL_SHEETS_MIN_GAP + 1400 + ALL_SHEETS_MIN_GAP
  );
  assert.equal(
    after.bySheetId.get('s3')?.originX,
    1200 + ALL_SHEETS_MIN_GAP + 1400 + ALL_SHEETS_MIN_GAP + 1400 + ALL_SHEETS_MIN_GAP
  );
});

test('getSheetCanvasOrigin, hit-testing, and camera fit transform target the clicked sheet in all mode', () => {
  const s1 = makeSheet('s1', 1, 1680, 1188);
  const s2 = makeSheet('s2', 2, 1200, 848);
  const layout = computeAllSheetsLayout([s1, s2]);
  const expectedS2OriginX = 1680 + ALL_SHEETS_MIN_GAP;

  assert.deepEqual(getSheetCanvasOrigin(layout, 's2', 'single'), { x: 0, y: 0 });
  const origin2 = getSheetCanvasOrigin(layout, 's2', 'all');
  assert.deepEqual(origin2, { x: expectedS2OriginX, y: 0 });

  assert.equal(findSheetSlotAtCanvasPoint(layout, 400, 300)?.sheet.id, 's1');
  assert.equal(findSheetSlotAtCanvasPoint(layout, expectedS2OriginX + 300, 200)?.sheet.id, 's2');
  assert.equal(findSheetSlotAtCanvasPoint(layout, expectedS2OriginX - 40, 200), null);

  const fit2 = computeSheetViewportFitTransform(s2, origin2, 1280, 760);
  const centeredSheetLeft = origin2.x * fit2.zoom + fit2.pan.x;
  const centeredSheetRight = (origin2.x + s2.width) * fit2.zoom + fit2.pan.x;
  const midX = (centeredSheetLeft + centeredSheetRight) / 2;
  assert.ok(Math.abs(midX - 1280 / 2) <= 2, `Expected sheet 2 centered around 640, got ${midX}`);
});
