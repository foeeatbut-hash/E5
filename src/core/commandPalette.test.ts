import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBottomCommandItems,
  buildTopSearchItems,
  filterBottomCommandItems,
  filterTopSearchItems,
  resolveCommandLineInput,
} from './commandPalette.ts';
import { createSeedProject } from './e3Seed.ts';

test('Bottom CAD commands and Top Search items are strictly disjoint by ID and purpose', () => {
  const project = createSeedProject();
  const bottom = buildBottomCommandItems({
    hasSelection: true,
    hasClipboard: true,
    selectedDeviceCount: 2,
    canUndo: true,
    canRedo: true,
    snapToGrid: true,
    smartGuides: true,
    showGrid: true,
  });
  const top = buildTopSearchItems(project);

  const bottomIds = new Set(bottom.map((i) => i.id));
  const topIds = new Set(top.map((i) => i.id));

  for (const id of bottomIds) {
    assert.equal(topIds.has(id), false, `Item ${id} should not appear in both bottom and top search`);
  }

  // Bottom contains only CAD drafting/view/action commands, zero sheets/devices/sections
  assert.ok(bottom.every((i) => i.scope === 'bottom'));
  assert.ok(bottom.some((i) => i.commandKeyword === 'ПРОВОД'));
  assert.ok(bottom.some((i) => i.commandKeyword === 'СЕТКА'));
  assert.equal(
    bottom.some((i) => i.category === 'section' || i.category === 'feature' || i.category === 'sheet' || i.category === 'device'),
    false
  );

  // Top contains sections, features, sheets, devices, and zero CAD drawing commands
  assert.ok(top.every((i) => i.scope === 'top'));
  assert.ok(top.some((i) => i.category === 'section' && i.id === 'section-bom'));
  assert.ok(top.some((i) => i.category === 'feature' && i.id === 'feat-stamp'));
  assert.ok(top.some((i) => i.category === 'sheet' && i.action.type === 'jump-sheet'));
  assert.ok(top.some((i) => i.category === 'device' && i.action.type === 'jump-device'));
  assert.equal(
    top.some((i) => i.id === 'cmd-wire' || i.id === 'cmd-grid' || i.id === 'cmd-rotate'),
    false
  );
});

test('filterBottomCommandItems filters CAD commands dynamically by prefix and parameterized syntax', () => {
  const bottom = buildBottomCommandItems({
    hasSelection: true,
    hasClipboard: true,
    selectedDeviceCount: 2,
    canUndo: true,
    canRedo: true,
  });

  const wireMatches = filterBottomCommandItems(bottom, 'пр');
  assert.ok(wireMatches.some((i) => i.id === 'cmd-wire'));
  assert.ok(wireMatches.every((i) => i.scope === 'bottom'));

  const zoomArgMatches = filterBottomCommandItems(bottom, 'масштаб 75');
  assert.equal(zoomArgMatches[0]?.id, 'cmd-zoom-percent');

  const findArgMatches = filterBottomCommandItems(bottom, 'найти qf1');
  assert.equal(findArgMatches[0]?.id, 'cmd-find');

  // Empty query returns enabled commands first
  const emptyList = filterBottomCommandItems(bottom, '');
  assert.ok(emptyList.length >= 15);
  assert.equal(emptyList[0]?.disabled, undefined);
});

test('filterTopSearchItems filters sections, features, sheets, and devices without bottom commands', () => {
  const project = createSeedProject();
  const top = buildTopSearchItems(project);

  const pe3 = filterTopSearchItems(top, 'пэ3');
  assert.ok(pe3.some((i) => i.id === 'section-bom'));

  const erc = filterTopSearchItems(top, 'erc', 'section');
  assert.equal(erc.length, 1);
  assert.equal(erc[0]?.id, 'section-erc');

  const km1 = filterTopSearchItems(top, '-KM1');
  assert.ok(km1.some((i) => i.category === 'device' && i.action.type === 'jump-device'));

  const wireShouldNotExist = filterTopSearchItems(top, 'проводка');
  assert.equal(wireShouldNotExist.some((i) => i.id === 'cmd-wire'), false);
});

test('resolveCommandLineInput executes bottom CAD commands and НАЙТИ/ЛИСТ/МАСШТАБ syntax cleanly', () => {
  const project = createSeedProject();
  const bottom = buildBottomCommandItems({ hasSelection: true, canUndo: true });

  assert.deepEqual(resolveCommandLineInput('ПРОВОД', bottom, project).action, {
    type: 'set-tool',
    tool: 'wire',
  });
  assert.deepEqual(resolveCommandLineInput('МАСШТАБ 125', bottom, project).action, {
    type: 'zoom-percent',
    percent: 125,
  });
  assert.equal(resolveCommandLineInput('НАЙТИ -KM1', bottom, project).action?.type, 'jump-device');
  assert.equal(resolveCommandLineInput('ЛИСТ 2', bottom, project).action?.type, 'jump-sheet');
});
