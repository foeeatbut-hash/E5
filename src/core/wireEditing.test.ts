import assert from 'node:assert/strict';
import test from 'node:test';
import { E3_CATALOG } from './e3Catalog.ts';
import {
  getAbsolutePinPos,
  parseE3Xml,
  routeSheetWiresCleanly,
  runErc,
  serializeE3Xml,
} from './e3Engine.ts';
import { createSeedProject } from './e3Seed.ts';
import type { E3Device } from './e3Types.ts';
import {
  applyAutoWireBreak,
  buildOrthogonalWireWithWaypoints,
  buildWirePreviewWithWaypoints,
  dragWireSegment,
  extractWireSegmentHandles,
  findWireBreakCandidate,
  simplifyOrthogonalWaypoints,
} from './wireEditing.ts';

function assertStrictlyOrthogonal(pts: Array<{ x: number; y: number }>, label = 'wire') {
  assert.ok(pts.length >= 2, `${label}: expected >= 2 points`);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const isOrtho = a.x === b.x || a.y === b.y;
    assert.ok(isOrtho, `${label}: segment ${i} (${a.x},${a.y})->(${b.x},${b.y}) is diagonal`);
  }
}

test('dragWireSegment moves interior & endpoint segments orthogonally while keeping pins fixed', () => {
  const waypoints = [
    { x: 100, y: 100 },
    { x: 100, y: 160 },
    { x: 300, y: 160 },
    { x: 300, y: 240 },
  ];

  // Drag interior horizontal segment (index 1) downward to y=200
  const movedInterior = dragWireSegment(waypoints, 1, { x: 200, y: 200 }, 20, true);
  assertStrictlyOrthogonal(movedInterior, 'interior drag');
  assert.deepEqual(movedInterior[0], { x: 100, y: 100 });
  assert.deepEqual(movedInterior[movedInterior.length - 1], { x: 300, y: 240 });
  assert.equal(movedInterior[1].y, 200);
  assert.equal(movedInterior[2].y, 200);

  // Drag endpoint vertical segment (index 0) rightward to x=140 -> inserts jog and pins (100,100)
  const movedStart = dragWireSegment(waypoints, 0, { x: 140, y: 130 }, 20, true);
  assertStrictlyOrthogonal(movedStart, 'start segment drag');
  assert.deepEqual(movedStart[0], { x: 100, y: 100 });
  assert.deepEqual(movedStart[movedStart.length - 1], { x: 300, y: 240 });
  assert.ok(movedStart.some((p) => p.x === 140));

  // Drag straight 2-point horizontal wire -> turns into 4-point U-jog
  const direct = [
    { x: 100, y: 200 },
    { x: 300, y: 200 },
  ];
  const movedDirect = dragWireSegment(direct, 0, { x: 200, y: 240 }, 20, true);
  assertStrictlyOrthogonal(movedDirect, 'direct wire drag');
  assert.equal(movedDirect.length, 4);
  assert.deepEqual(movedDirect, [
    { x: 100, y: 200 },
    { x: 100, y: 240 },
    { x: 300, y: 240 },
    { x: 300, y: 200 },
  ]);

  const handles = extractWireSegmentHandles(movedDirect);
  assert.equal(handles.length, 3);
  assert.equal(handles[1].orientation, 'h');
  assert.equal(handles[1].midY, 240);
});

test('manualRoute wires survive routeSheetWiresCleanly and round-trip through E3 XML', () => {
  const project = createSeedProject();
  const customPts = [
    { x: 260, y: 230 },
    { x: 260, y: 250 },
    { x: 230, y: 250 },
    { x: 230, y: 310 },
  ];
  const editedProject = {
    ...project,
    wires: project.wires.map((w) =>
      w.id === 'w-1' ? { ...w, waypoints: customPts, manualRoute: true } : w
    ),
  };

  const aligned = routeSheetWiresCleanly(
    editedProject.devices,
    editedProject.wires,
    'sheet-1',
    20,
    editedProject.sheets
  );
  const w1After = aligned.find((w) => w.id === 'w-1');
  assert.ok(w1After);
  assert.equal(w1After.manualRoute, true);
  assert.deepEqual(w1After.waypoints, customPts);

  const xml = serializeE3Xml({ ...editedProject, wires: aligned });
  assert.ok(xml.includes('manualRoute="true"'));
  const parsed = parseE3Xml(xml);
  const parsedW1 = parsed.wires.find((w) => w.id === 'w-1');
  assert.equal(parsedW1?.manualRoute, true);
  assert.deepEqual(parsedW1?.waypoints, customPts);
});

test('buildOrthogonalWireWithWaypoints routes step-by-step clicks orthogonally into target pin', () => {
  const start = { x: 200, y: 140, direction: 'right' as const };
  const anchors = [
    { x: 320, y: 140 },
    { x: 320, y: 280 },
    { x: 460, y: 280 },
  ];
  const end = { x: 520, y: 220, direction: 'left' as const };

  const pts = buildOrthogonalWireWithWaypoints(start, anchors, end);
  assertStrictlyOrthogonal(pts, 'step-by-step waypoints');
  assert.deepEqual(pts[0], { x: 200, y: 140 });
  assert.deepEqual(pts[pts.length - 1], { x: 520, y: 220 });
  assert.ok(pts.some((p) => p.x === 320 && p.y === 140));
  assert.ok(pts.some((p) => p.x === 320 && p.y === 280));
  assert.ok(pts.some((p) => p.x === 460 && p.y === 280));

  const preview = buildWirePreviewWithWaypoints(start, anchors, { x: 500, y: 240 });
  assertStrictlyOrthogonal(preview, 'preview waypoints');
  assert.deepEqual(preview[preview.length - 1], { x: 500, y: 240 });
});

test('simplifyOrthogonalWaypoints eliminates collinear duplicates', () => {
  const simplified = simplifyOrthogonalWaypoints([
    { x: 100, y: 100 },
    { x: 150, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
  ]);
  assert.deepEqual(simplified, [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
  ]);
});

test('Auto Wire Break inserts 1P breaker and 1P terminal inline into horizontal/vertical wires cleanly', () => {
  const project = createSeedProject();

  // Horizontal wire candidate on Sheet 2: w-16 (+24V_DC from -XP2 to -A1) has a long horizontal run
  const w16 = project.wires.find((w) => w.id === 'w-16');
  assert.ok(w16);
  const seg = w16.waypoints;
  // Find a horizontal segment >= 40mm on w-16
  let hMid: { x: number; y: number } | null = null;
  for (let i = 0; i < seg.length - 1; i++) {
    if (Math.abs(seg[i].y - seg[i + 1].y) <= 1 && Math.abs(seg[i + 1].x - seg[i].x) >= 40) {
      hMid = { x: Math.round((seg[i].x + seg[i + 1].x) / 2), y: seg[i].y };
      break;
    }
  }
  assert.ok(hMid, 'Expected horizontal segment on w-16');

  const qf1pCat = E3_CATALOG.find((c) => c.id === 'cat-qf-1p')!;
  const newBreaker: E3Device = {
    id: 'dev-qf-brk',
    elementId: 'el-qf-brk',
    designation: '-QF3',
    componentName: qf1pCat.componentName,
    article: qf1pCat.article,
    manufacturer: qf1pCat.manufacturer,
    category: qf1pCat.category,
    sheetId: 'sheet-2',
    x: hMid.x - qf1pCat.width / 2,
    y: hMid.y - qf1pCat.height / 2 + 10,
    rotation: 0,
    width: qf1pCat.width,
    height: qf1pCat.height,
    e3BlockName: qf1pCat.e3BlockName,
    bindingState: 'PLACED',
    pins: qf1pCat.pins.map((p, idx) => ({ ...p, id: `qf-brk-p${idx + 1}` })),
    attributes: structuredClone(qf1pCat.defaultAttributes),
  };

  const sheet2Wires = project.wires.filter((w) => w.sheetId === 'sheet-2');
  const candidate = findWireBreakCandidate(newBreaker, sheet2Wires, 30);
  assert.ok(candidate);
  assert.equal(candidate.wire.id, 'w-16');
  assert.equal(candidate.orientation, 'h');

  const brkRes = applyAutoWireBreak(project, newBreaker, candidate);
  assert.ok(brkRes);
  // Breaker pins are vertical at rotation 0 -> rotated to 90 deg for horizontal wire
  assert.equal(brkRes.updatedDevice.rotation, 90);
  const absP0 = getAbsolutePinPos(brkRes.updatedDevice, brkRes.updatedDevice.pins[0]);
  const absP1 = getAbsolutePinPos(brkRes.updatedDevice, brkRes.updatedDevice.pins[1]);
  assert.equal(absP0.y, candidate.projY);
  assert.equal(absP1.y, candidate.projY);

  assertStrictlyOrthogonal(brkRes.wireBefore.waypoints, 'breaker wireBefore');
  assertStrictlyOrthogonal(brkRes.wireAfter.waypoints, 'breaker wireAfter');
  assert.equal(brkRes.wireBefore.netName, '+24V_DC');
  assert.equal(brkRes.wireAfter.netName, '+24V_DC_1');
  assert.ok(!brkRes.nextProject.wires.some((w) => w.id === 'w-16'));

  // ERC must produce 0 errors on the split project
  const issues = runErc(brkRes.nextProject);
  const errors = issues.filter((i) => i.severity === 'error');
  assert.equal(errors.length, 0);

  // Also test 1P pass-through terminal preserves original netName on both sides
  const xt1pCat = E3_CATALOG.find((c) => c.id === 'cat-xt-1p')!;
  const newXt: E3Device = {
    id: 'dev-xt-brk',
    elementId: 'el-xt-brk',
    designation: '-XT3',
    componentName: xt1pCat.componentName,
    article: xt1pCat.article,
    manufacturer: xt1pCat.manufacturer,
    category: xt1pCat.category,
    sheetId: 'sheet-2',
    x: hMid.x - xt1pCat.width / 2,
    y: hMid.y - xt1pCat.height / 2,
    rotation: 0,
    width: xt1pCat.width,
    height: xt1pCat.height,
    e3BlockName: xt1pCat.e3BlockName,
    bindingState: 'PLACED',
    pins: xt1pCat.pins.map((p, idx) => ({ ...p, id: `xt-brk-p${idx + 1}` })),
    attributes: structuredClone(xt1pCat.defaultAttributes),
  };
  const xtRes = applyAutoWireBreak(project, newXt, candidate);
  assert.ok(xtRes);
  assert.equal(xtRes.wireBefore.netName, '+24V_DC');
  assert.equal(xtRes.wireAfter.netName, '+24V_DC');

  // Footprint overlap test: 100mm tall breaker whose center is 35mm off-center still physically crosses wire
  const edgeCrossBreaker: E3Device = {
    ...newBreaker,
    y: hMid.y - qf1pCat.height / 2 - 35,
  };
  const edgeCandidate = findWireBreakCandidate(edgeCrossBreaker, sheet2Wires, 30);
  assert.ok(edgeCandidate);
  assert.equal(edgeCandidate.wire.id, 'w-16');
});
