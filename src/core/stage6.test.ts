import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
} from './commandPalette.ts';
import {
  getMaxAmpacityForSection,
  parseBreakerRatedCurrent,
  parseCrossSectionMm2,
  runErc,
} from './e3Engine.ts';
import { createSeedProject } from './e3Seed.ts';

test('Stage 6.2: seed project passes runErc with 0 errors and tracks unused cable reserve cores as info', () => {
  const seed = createSeedProject();
  const issues = runErc(seed);
  const errors = issues.filter((i) => i.severity === 'error');
  assert.equal(errors.length, 0);

  const unused = issues.filter((i) => i.code === 'E3-CABLE-UNUSED');
  assert.ok(unused.length >= 2, 'Should report unused reserve cores on cab-w1 and cab-w3');
  assert.ok(unused.every((u) => u.severity === 'info' && Boolean(u.sheetId)));
});

test('Stage 6.2: runErc detects heterogeneous potential conflict on the same netName', () => {
  const proj = createSeedProject();
  const mutated = {
    ...proj,
    wires: [
      ...proj.wires,
      {
        id: 'w-bad-mix',
        sheetId: 'sheet-2',
        netName: 'L1.1',
        signalType: 'dc24' as const,
        fromDeviceId: 'dev-a1',
        fromPinId: 'p-a1-do1',
        toDeviceId: 'dev-ka1',
        toPinId: 'p-ka1-a1',
        waypoints: [
          { x: 640, y: 270 },
          { x: 780, y: 270 },
        ],
        crossSection: '1.5 мм²',
        wireNumber: '901',
      },
    ],
  };

  const issues = runErc(mutated);
  const conflicts = issues.filter((i) => i.code === 'E3-POTENTIAL-CONFLICT');
  assert.ok(conflicts.some((c) => c.wireId === 'w-bad-mix' && c.severity === 'error'));
});

test('Stage 6.2: runErc checks wire cross-section against protective breaker rating', () => {
  assert.equal(parseCrossSectionMm2('1.5 мм²'), 1.5);
  assert.equal(getMaxAmpacityForSection(1.5), 16);
  assert.equal(getMaxAmpacityForSection(0.75), 10);

  const proj = createSeedProject();
  const qf1 = proj.devices.find((d) => d.id === 'dev-qf1')!;
  assert.equal(parseBreakerRatedCurrent(qf1), 25);

  const undersized = {
    ...proj,
    wires: proj.wires.map((w) =>
      w.id === 'w-1' ? { ...w, crossSection: '0.75 мм²' } : w
    ),
  };

  const issues = runErc(undersized);
  const ampIssue = issues.find((i) => i.code === 'E3-WIRE-AMPACITY' && i.wireId === 'w-1');
  assert.ok(ampIssue, 'Should flag 0.75 mm2 wire protected by 25A breaker -QF1');
  assert.equal(ampIssue.severity, 'error');
  assert.equal(ampIssue.sheetId, 'sheet-1');
});

test('Stage 6.2: runErc detects duplicate wireNumber across different potentials', () => {
  const proj = createSeedProject();
  const dupWire = {
    ...proj,
    wires: proj.wires.map((w) =>
      w.id === 'w-13' ? { ...w, wireNumber: 'L1.1' } : w
    ),
  };

  const issues = runErc(dupWire);
  const dupNums = issues.filter((i) => i.code === 'E3-DUP-WIRE-NUM');
  assert.equal(dupNums.length, 2);
  assert.ok(dupNums.some((i) => i.wireId === 'w-13' && i.sheetId === 'sheet-2'));
  assert.ok(dupNums.some((i) => i.wireId === 'w-1' && i.sheetId === 'sheet-1'));
});

test('Stage 6.3: Command Palette builds CAD aliases and filters commands & devices accurately', () => {
  const proj = createSeedProject();
  const items = buildCommandPaletteItems(proj, {
    hasSelection: true,
    selectedDeviceCount: 2,
    canUndo: true,
    canRedo: false,
    snapToGrid: true,
    smartGuides: true,
    showGrid: true,
  });

  const wireMatches = filterCommandPaletteItems(items, 'WIRE');
  assert.equal(wireMatches[0]?.id, 'cmd-wire');

  const rotateMatches = filterCommandPaletteItems(items, 'ROTATE');
  assert.equal(rotateMatches[0]?.id, 'cmd-rotate');
  assert.equal(rotateMatches[0]?.disabled, false);

  const km1Matches = filterCommandPaletteItems(items, '-KM1');
  assert.ok(km1Matches.some((i) => i.action.type === 'jump-device' && i.action.deviceId === 'dev-km1'));

  const sheet2Matches = filterCommandPaletteItems(items, 'ПЛК');
  assert.ok(sheet2Matches.some((i) => i.action.type === 'jump-sheet' && i.action.sheetId === 'sheet-2'));
});
