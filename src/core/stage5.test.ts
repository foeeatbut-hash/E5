import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedProject } from './e3Seed.ts';
import {
  autoNumberDevicesGost,
  autoNumberWiresGost,
  previewAutoNumberDevicesGost,
  previewAutoNumberWiresGost,
} from './gostNumbering.ts';
import {
  TERMINAL_GRAPHIC_SHEET_ID,
  addTerminalSparePole,
  assignTerminalBridge,
  extractTerminalStrips,
  generateOrUpdateTerminalStripSheet,
  removeTerminalBridge,
  setTerminalPoleLabel,
  setTerminalPoleSpare,
} from './terminalStrip.ts';

test('extractTerminalStrips pairs internal/external pins and supports bridges, labels, and spare poles', () => {
  const seed = createSeedProject();
  const initialStrips = extractTerminalStrips(seed);
  assert.ok(initialStrips.length >= 2);
  const xt1 = initialStrips.find((s) => s.designation === '-XT1');
  assert.ok(xt1);
  assert.equal(xt1.rows.length, 4);
  assert.equal(xt1.rows[0].internalPinName, '1');
  assert.equal(xt1.rows[0].externalPinName, '1.1');

  // Assign a jumper bridge M1 across poles 1 and 2
  const withBridge = assignTerminalBridge(seed, xt1.deviceId, ['1', '2']);
  const afterBridge = extractTerminalStrips(withBridge).find((s) => s.deviceId === xt1.deviceId)!;
  assert.equal(afterBridge.bridges.length, 1);
  assert.equal(afterBridge.bridges[0].id, 'M1');
  assert.equal(afterBridge.rows[0].bridgeGroup, 'M1');
  assert.equal(afterBridge.rows[1].bridgeGroup, 'M1');
  assert.equal(afterBridge.rows[2].bridgeGroup, undefined);

  // Set inline terminal label and manual spare flag
  const withLabel = setTerminalPoleLabel(withBridge, xt1.deviceId, '3', 'Питание ПЧ');
  const withSpare = setTerminalPoleSpare(withLabel, xt1.deviceId, '4', true);
  const afterEdit = extractTerminalStrips(withSpare).find((s) => s.deviceId === xt1.deviceId)!;
  assert.equal(afterEdit.rows[2].label, 'Питание ПЧ');
  assert.equal(afterEdit.rows[3].isSpare, true);

  // Add a new spare pole and check count increases
  const withAddedSpare = addTerminalSparePole(withSpare, xt1.deviceId);
  const afterAdd = extractTerminalStrips(withAddedSpare).find((s) => s.deviceId === xt1.deviceId)!;
  assert.equal(afterAdd.rows.length, 5);
  assert.equal(afterAdd.spareCount, xt1.spareCount + 1);

  // Remove bridge M1
  const withoutBridge = removeTerminalBridge(withAddedSpare, xt1.deviceId, 'M1');
  const afterRemove = extractTerminalStrips(withoutBridge).find((s) => s.deviceId === xt1.deviceId)!;
  assert.equal(afterRemove.bridges.length, 0);
  assert.equal(afterRemove.rows[0].bridgeGroup, undefined);
});

test('generateOrUpdateTerminalStripSheet creates graphic sheet and updates idempotently', () => {
  const seed = createSeedProject();
  const bridged = assignTerminalBridge(seed, 'dev-xt1', ['1', '2']);

  const first = generateOrUpdateTerminalStripSheet(bridged);
  assert.equal(first.created, true);
  assert.equal(first.sheetId, TERMINAL_GRAPHIC_SHEET_ID);
  const sheet = first.nextProject.sheets.find((s) => s.id === TERMINAL_GRAPHIC_SHEET_ID);
  assert.ok(sheet);
  assert.equal(sheet.name, 'Клеммные ряды -XT');

  const genAnns1 = (first.nextProject.annotations || []).filter(
    (a) => a.sheetId === TERMINAL_GRAPHIC_SHEET_ID && a.id.startsWith('ann-xt-gen-')
  );
  assert.ok(genAnns1.some((a) => a.text.includes('[M1]')));

  // Second run updates in place without duplicating sheets or annotations
  const updated = setTerminalPoleLabel(first.nextProject, 'dev-xt1', '1', 'Ввод L1');
  const second = generateOrUpdateTerminalStripSheet(updated);
  assert.equal(second.created, false);
  assert.equal(
    second.nextProject.sheets.filter((s) => s.id === TERMINAL_GRAPHIC_SHEET_ID).length,
    1
  );
  const genAnns2 = (second.nextProject.annotations || []).filter(
    (a) => a.sheetId === TERMINAL_GRAPHIC_SHEET_ID && a.id.startsWith('ann-xt-gen-')
  );
  assert.equal(genAnns2.length, genAnns1.length);
  assert.ok(genAnns2.some((a) => a.text.includes('Ввод L1')));
});

test('previewAutoNumberWiresGost supports sheet-seq, zone-seq, potential and preserves power phases', () => {
  const seed = createSeedProject();

  // Sheet-seq preserving power phases (L1.1, PE, +24V remain untouched)
  const seqPreview = previewAutoNumberWiresGost(seed, {
    scope: 'active-sheet',
    activeSheetId: 'sheet-1',
    mode: 'sheet-seq',
    preservePowerPhases: true,
  });
  const peWire = seqPreview.nextProject.wires.find((w) => w.id === 'w-10')!;
  const powerPhaseWire = seqPreview.nextProject.wires.find((w) => w.id === 'w-1')!;
  assert.equal(peWire.wireNumber, 'PE');
  assert.equal(powerPhaseWire.wireNumber, 'L1.1');

  // Zone-seq numbering all wires on sheet 2 produces GOST zone pattern like 2А1-1
  const zoneNext = autoNumberWiresGost(seed, {
    scope: 'active-sheet',
    activeSheetId: 'sheet-2',
    mode: 'zone-seq',
    preservePowerPhases: false,
  });
  const s2Wire = zoneNext.wires.find((w) => w.id === 'w-12')!;
  assert.match(s2Wire.wireNumber, /^2[А-Д][1-6]-\d+$/);

  // Potential mode assigns identical wireNumber across sheets for matching netName (+24V_DC)
  const potNext = autoNumberWiresGost(seed, {
    scope: 'all-sheets',
    mode: 'potential',
    preservePowerPhases: false,
  });
  const w15 = potNext.wires.find((w) => w.id === 'w-15')!;
  const w16 = potNext.wires.find((w) => w.id === 'w-16')!;
  assert.equal(w15.wireNumber, w16.wireNumber);
  assert.match(w15.wireNumber, /^Ц\d{3}$/);
});

test('previewAutoNumberDevicesGost orders OUO cleanly, avoids cross-sheet collisions, and syncs cable journal', () => {
  const seed = createSeedProject();
  // Swap designations on sheet 1 so -QF2 is above/left and -QF1 is lower
  const scrambled = {
    ...seed,
    devices: seed.devices.map((d) => {
      if (d.id === 'dev-qf1') return { ...d, designation: '-QF9', y: 400 };
      if (d.id === 'dev-qf2') return { ...d, designation: '-QF5', y: 100 };
      return d;
    }),
    cables: seed.cables.map((c) => (c.id === 'cab-w1' ? { ...c, fromDevice: '-QF9' } : c)),
  };

  const preview = previewAutoNumberDevicesGost(scrambled, {
    scope: 'active-sheet',
    activeSheetId: 'sheet-1',
    order: 'top-to-bottom',
    prefixFilter: 'QF',
  });
  assert.equal(preview.changes.length, 2);

  const applied = autoNumberDevicesGost(scrambled, {
    scope: 'active-sheet',
    activeSheetId: 'sheet-1',
    order: 'top-to-bottom',
    prefixFilter: 'QF',
  });

  // dev-qf2 at y=100 must become -QF1, dev-qf1 at y=400 must become -QF2
  assert.equal(applied.devices.find((d) => d.id === 'dev-qf2')?.designation, '-QF1');
  assert.equal(applied.devices.find((d) => d.id === 'dev-qf1')?.designation, '-QF2');
  // Cable journal reference must follow renamed device
  assert.equal(applied.cables.find((c) => c.id === 'cab-w1')?.fromDevice, '-QF2');

  // If another sheet already has -QF3, active-sheet numbering starts after max outside index (4)
  const withOutside = {
    ...scrambled,
    devices: scrambled.devices.map((d) =>
      d.id === 'dev-ka1' ? { ...d, designation: '-QF3' } : d
    ),
  };
  const collisionSafe = autoNumberDevicesGost(withOutside, {
    scope: 'active-sheet',
    activeSheetId: 'sheet-1',
    order: 'left-to-right',
    prefixFilter: 'QF',
  });
  assert.equal(collisionSafe.devices.find((d) => d.id === 'dev-qf1')?.designation, '-QF4');
  assert.equal(collisionSafe.devices.find((d) => d.id === 'dev-qf2')?.designation, '-QF5');
});
