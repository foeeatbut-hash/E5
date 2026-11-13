import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alignSelectedDevices,
  buildClipboardPayload,
  normalizeSelectionBox,
  pasteClipboardPayload,
  resolveBoxSelectionMode,
  selectEntitiesInBox,
} from './cadSelection.ts';
import { resolveCadLayers } from './cadLayers.ts';
import { getDeviceBounds } from './e3Engine.ts';
import { createSeedProject } from './e3Seed.ts';
import type { E3Annotation } from './e3Types.ts';

test('AutoCAD Box/Crossing mode resolves left-to-right as window and right-to-left as crossing', () => {
  assert.equal(resolveBoxSelectionMode(100, 320), 'window');
  assert.equal(resolveBoxSelectionMode(320, 100), 'crossing');

  const winBox = normalizeSelectionBox({ x: 100, y: 100 }, { x: 250, y: 220 });
  assert.equal(winBox.mode, 'window');
  assert.equal(winBox.x, 100);
  assert.equal(winBox.width, 150);

  const crossBox = normalizeSelectionBox({ x: 250, y: 220 }, { x: 100, y: 100 });
  assert.equal(crossBox.mode, 'crossing');
  assert.equal(crossBox.x, 100);
  assert.equal(crossBox.y, 100);
  assert.equal(crossBox.width, 150);
  assert.equal(crossBox.height, 120);
});

test('selectEntitiesInBox differentiates strict Window containment vs Crossing intersection and respects locked layers', () => {
  const project = createSeedProject();
  const s1Devices = project.devices.filter((d) => d.sheetId === 'sheet-1');
  const s1Wires = project.wires.filter((w) => w.sheetId === 'sheet-1');
  const qf1 = s1Devices.find((d) => d.id === 'dev-qf1')!;
  const qfBounds = getDeviceBounds(qf1);

  // Partial overlap box: Window should NOT select qf1, Crossing SHOULD select qf1
  const partialLeft = qfBounds.x + qfBounds.width / 2;
  const partialWin = normalizeSelectionBox(
    { x: partialLeft, y: qfBounds.y - 10 },
    { x: qfBounds.x + qfBounds.width + 20, y: qfBounds.y + qfBounds.height + 10 }
  );
  const partialCross = normalizeSelectionBox(
    { x: qfBounds.x + qfBounds.width + 20, y: qfBounds.y + qfBounds.height + 10 },
    { x: partialLeft, y: qfBounds.y - 10 }
  );

  const resWin = selectEntitiesInBox(s1Devices, s1Wires, [], partialWin);
  assert.equal(resWin.deviceIds.includes('dev-qf1'), false);

  const resCross = selectEntitiesInBox(s1Devices, s1Wires, [], partialCross);
  assert.equal(resCross.deviceIds.includes('dev-qf1'), true);

  // Full containment window box selects qf1 + wires inside
  const fullBox = normalizeSelectionBox(
    { x: qfBounds.x - 10, y: qfBounds.y - 10 },
    { x: qfBounds.x + qfBounds.width + 10, y: qfBounds.y + qfBounds.height + 10 }
  );
  const resFull = selectEntitiesInBox(s1Devices, s1Wires, [], fullBox);
  assert.equal(resFull.deviceIds.includes('dev-qf1'), true);

  // Locking devices layer prevents selecting devices via marquee
  const layers = resolveCadLayers();
  layers.devices = { ...layers.devices, locked: true };
  const resLocked = selectEntitiesInBox(s1Devices, s1Wires, [], fullBox, layers);
  assert.equal(resLocked.deviceIds.length, 0);
});

test('buildClipboardPayload & pasteClipboardPayload duplicate subcircuit with unique designations and remapped internal wires', () => {
  const project = createSeedProject();
  const ann: E3Annotation = {
    id: 'ann-test-1',
    sheetId: 'sheet-1',
    kind: 'rect',
    x: 100,
    y: 100,
    width: 140,
    height: 80,
    text: 'Зона ввода',
  };
  const projWithAnn = { ...project, annotations: [ann] };

  // Select QF1 and KM1 (which have internal wires connecting them) + annotation
  const payload = buildClipboardPayload(projWithAnn, ['dev-qf1', 'dev-km1'], [], ['ann-test-1']);
  assert.ok(payload);
  assert.equal(payload.devices.length, 2);
  assert.ok(payload.wires.length >= 3, 'Should copy internal wires between QF1 and KM1');
  assert.equal(payload.annotations.length, 1);

  const pasted = pasteClipboardPayload(projWithAnn, payload, 'sheet-1', {
    offsetX: 60,
    offsetY: 60,
    gridSize: 20,
  });

  assert.equal(pasted.pastedDeviceIds.length, 2);
  assert.equal(pasted.pastedWireIds.length, payload.wires.length);
  assert.equal(pasted.pastedAnnotationIds.length, 1);

  const pastedDevs = pasted.nextProject.devices.filter((d) =>
    pasted.pastedDeviceIds.includes(d.id)
  );
  // Existing designations include -QF1, -QF2, -KM1 -> pasted must increment uniquely
  const allDesignations = pasted.nextProject.devices.map((d) => d.designation);
  assert.equal(new Set(allDesignations).size, allDesignations.length);
  assert.ok(pastedDevs.some((d) => d.designation === '-QF3'));
  assert.ok(pastedDevs.some((d) => d.designation === '-KM2'));

  // Internal pasted wires must reference newly pasted device IDs and pins
  const pastedIdSet = new Set(pasted.pastedDeviceIds);
  for (const wId of pasted.pastedWireIds) {
    const w = pasted.nextProject.wires.find((item) => item.id === wId)!;
    assert.ok(pastedIdSet.has(w.fromDeviceId));
    assert.ok(pastedIdSet.has(w.toDeviceId));
    assert.ok(w.fromPinId.startsWith(w.fromDeviceId));
    assert.ok(w.toPinId.startsWith(w.toDeviceId));
  }
});

test('alignSelectedDevices aligns left/top edges and distributes evenly including rotated devices', () => {
  const project = createSeedProject();
  const s1 = project.devices.filter((d) => d.sheetId === 'sheet-1').slice(0, 3);
  const ids = s1.map((d) => d.id);

  // Move them to staggered positions
  const staggered = project.devices.map((d) => {
    if (d.id === ids[0]) return { ...d, x: 100, y: 120 };
    if (d.id === ids[1]) return { ...d, x: 260, y: 200, rotation: 90 as const };
    if (d.id === ids[2]) return { ...d, x: 460, y: 300 };
    return d;
  });

  const leftAligned = alignSelectedDevices(staggered, ids, 'left', 20, true);
  const leftBounds = ids.map((id) => getDeviceBounds(leftAligned.find((d) => d.id === id)!));
  // For rotated 90° device, left edge might align within snap grid rounding
  assert.ok(Math.abs(leftBounds[0].x - leftBounds[2].x) <= 20);
  assert.ok(Math.abs(leftBounds[0].x - leftBounds[1].x) <= 20);

  const distX = alignSelectedDevices(staggered, ids, 'distribute-x', 20, false);
  const b0 = getDeviceBounds(distX.find((d) => d.id === ids[0])!);
  const b1 = getDeviceBounds(distX.find((d) => d.id === ids[1])!);
  const b2 = getDeviceBounds(distX.find((d) => d.id === ids[2])!);
  const gap1 = b1.x - (b0.x + b0.width);
  const gap2 = b2.x - (b1.x + b1.width);
  assert.ok(Math.abs(gap1 - gap2) <= 1, `Expected equal horizontal gaps, got ${gap1} vs ${gap2}`);
});
