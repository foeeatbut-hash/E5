import assert from 'node:assert/strict';
import test from 'node:test';
import type { E3Device, E3Wire } from './e3Types.ts';
import { computeSmartSnap, findSmartCatalogSpot } from './smartSnap.ts';

function makeDev(
  id: string,
  designation: string,
  x: number,
  y: number,
  width = 80,
  height = 60,
  pins: E3Device['pins'] = []
): E3Device {
  return {
    id,
    elementId: `el-${id}`,
    designation,
    componentName: designation,
    article: 'ART-1',
    manufacturer: 'Flux',
    category: 'breaker',
    sheetId: 'sheet-1',
    x,
    y,
    rotation: 0,
    width,
    height,
    e3BlockName: 'BLK',
    bindingState: 'PLACED',
    pins,
    attributes: [],
  };
}

test('computeSmartSnap snaps edges and centers magnetically and emits hairline guide lines', () => {
  const anchor = makeDev('d1', '-QF1', 200, 120, 80, 60);
  const moving = makeDev('d2', '-KM1', 340, 125, 80, 90);

  // Dragging taller -KM1 near -QF1 top edge (y=120) -> Y snaps strictly to top edge 120
  const res = computeSmartSnap(moving, 338, 125, [anchor], {
    gridSize: 20,
    snapToGrid: true,
    magneticSnap: true,
    snapThreshold: 12,
    sheet: { width: 1400, height: 920 },
  });

  assert.equal(res.y, 120);
  assert.equal(res.x, 340); // falls back cleanly to 20mm grid
  assert.equal(res.snappedYKind, 'edge');
  assert.equal(res.snappedXKind, 'grid');
  assert.ok(res.guides.some((g) => g.axis === 'y' && g.coord === 120));
});

test('computeSmartSnap aligns pins for straight vertical/horizontal wires with highest priority', () => {
  const anchor = makeDev('d1', '-QF1', 200, 100, 80, 60, [
    { id: 'p2', name: '2/T1', dx: 20, dy: 60, direction: 'bottom', signalType: 'power' },
  ]);
  // Moving device has different width (100) and pin at dx=33 (so aligned pin X=220 -> device.x = 187)
  const moving = makeDev('d2', '-UZ1', 180, 260, 100, 80, [
    { id: 'p1', name: 'L1', dx: 33, dy: 0, direction: 'top', signalType: 'power' },
  ]);
  const wires: E3Wire[] = [
    {
      id: 'w1',
      sheetId: 'sheet-1',
      netName: 'L1',
      signalType: 'power',
      fromDeviceId: 'd1',
      fromPinId: 'p2',
      toDeviceId: 'd2',
      toPinId: 'p1',
      waypoints: [],
      crossSection: '2.5 мм²',
      wireNumber: '101',
    },
  ];

  const res = computeSmartSnap(moving, 189, 263, [anchor], {
    gridSize: 20,
    snapToGrid: true,
    magneticSnap: true,
    snapThreshold: 12,
    wires,
    sheet: { width: 1400, height: 920 },
  });

  // Pin 187 + 33 == 220 (exact vertical match with -QF1 pin 200 + 20)
  assert.equal(res.x, 187);
  assert.equal(res.snappedXKind, 'pin');
  const pinGuide = res.guides.find((g) => g.axis === 'x' && g.coord === 220);
  assert.ok(pinGuide);
  assert.equal(pinGuide?.kind, 'pin');
});

test('computeSmartSnap detects equal spacing cadence between row siblings', () => {
  const d1 = makeDev('d1', '-QF1', 100, 120, 80, 60); // right = 180
  const d2 = makeDev('d2', '-QF2', 240, 120, 80, 60); // left = 240 (gap = 60), right = 320
  const d3 = makeDev('d3', '-QF3', 385, 123, 80, 60); // rawX near 320 + 60 = 380

  const res = computeSmartSnap(d3, 385, 123, [d1, d2], {
    gridSize: 20,
    snapToGrid: true,
    magneticSnap: true,
    snapThreshold: 12,
    sheet: { width: 1400, height: 920 },
  });

  assert.equal(res.x, 380);
  assert.equal(res.y, 120);
  assert.equal(res.snappedXKind, 'spacing');
  assert.equal(res.spacingGuides.length, 2);
  assert.ok(res.spacingGuides.every((sp) => sp.gap === 60));
});

test('computeSmartSnap respects bypassAllSnap (Alt override) and disabled smart guides', () => {
  const anchor = makeDev('d1', '-QF1', 200, 120, 80, 60);
  const moving = makeDev('d2', '-KM1', 340, 125, 80, 60);

  const freeRes = computeSmartSnap(moving, 203, 123, [anchor], {
    gridSize: 20,
    snapToGrid: true,
    magneticSnap: true,
    bypassAllSnap: true,
    snapThreshold: 12,
  });
  assert.equal(freeRes.x, 203);
  assert.equal(freeRes.y, 123);
  assert.equal(freeRes.snappedXKind, 'free');
  assert.equal(freeRes.guides.length, 0);

  const gridOnlyRes = computeSmartSnap(moving, 333, 127, [anchor], {
    gridSize: 20,
    snapToGrid: true,
    magneticSnap: false,
    snapThreshold: 12,
  });
  assert.equal(gridOnlyRes.x, 340);
  assert.equal(gridOnlyRes.y, 120);
  assert.equal(gridOnlyRes.snappedXKind, 'grid');
  assert.equal(gridOnlyRes.guides.length, 0);
});

test('findSmartCatalogSpot places new catalog devices on clear aligned coordinates away from existing devices', () => {
  const d1 = makeDev('d1', '-QF1', 120, 120, 80, 80);
  const d2 = makeDev('d2', '-KM1', 260, 120, 80, 80);
  const spot = findSmartCatalogSpot({ width: 80, height: 80 }, [d1, d2], { width: 1400, height: 920 }, 20);

  assert.equal(spot.y, 120);
  assert.ok(spot.x >= d2.x + d2.width + 20);
  assert.equal(spot.x % 20, 0);
});
