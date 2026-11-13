import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBom,
  buildCableJournal,
  buildTerminalPlan,
  exportBomCsv,
  exportToDxf,
  exportToFluxBridge,
  exportVisualSettings,
  generateStressBatch,
  importFromFluxBridge,
  parseE3Xml,
  parseVisualSettings,
  runErc,
  serializeE3Xml,
} from './e3Engine';
import { createSeedProject } from './e3Seed';

test('bidirectional E3 XML round-trip preserves full model and visual settings', () => {
  const seed = createSeedProject();
  seed.visualSettings.wireWidth = 3;
  seed.visualSettings.netColors.power = '#dc2626';

  const xml = serializeE3Xml(seed);
  assert.ok(xml.includes('<E3Project'));
  assert.ok(xml.includes(seed.fluxProjectKey));

  const parsed = parseE3Xml(xml);
  assert.equal(parsed.id, seed.id);
  assert.equal(parsed.name, seed.name);
  assert.equal(parsed.fluxProjectKey, seed.fluxProjectKey);
  assert.equal(parsed.sheets.length, seed.sheets.length);
  assert.equal(parsed.devices.length, seed.devices.length);
  assert.equal(parsed.wires.length, seed.wires.length);
  assert.equal(parsed.cables.length, seed.cables.length);
  assert.equal(parsed.visualSettings.wireWidth, 3);
  assert.equal(parsed.visualSettings.netColors.power, '#dc2626');

  const qf1 = parsed.devices.find((d) => d.designation === '-QF1');
  assert.ok(qf1);
  assert.equal(qf1.article, 'A9F74325');
  assert.equal(qf1.pins.length, 6);
  assert.equal(qf1.attributes.length, 3);
});

test('Flux E3 Bridge bidirectional export/import preserves elementId and updates properties', () => {
  const seed = createSeedProject();
  const bundle = exportToFluxBridge(seed);
  assert.equal(bundle.format, 'flux-e3-bridge/v1');
  assert.equal(bundle.nodes.length, seed.devices.length);

  // Simulate edit in Flux (change designation & article)
  const target = bundle.nodes.find((n) => n.designation === '-M1');
  assert.ok(target);
  target.designation = '-M1.1';
  const artAttr = target.attrs.find((a) => a.name === 'Артикул');
  if (artAttr) artAttr.value = 'АИР112М4';

  const synced = importFromFluxBridge(bundle, seed);
  const updatedM1 = synced.devices.find((d) => d.elementId === target.elementId);
  assert.ok(updatedM1);
  assert.equal(updatedM1.designation, '-M1.1');
  assert.equal(updatedM1.article, 'АИР112М4');
});

test('BOM ПЭ3 groups identical components and excludes REMOVED_IN_FLUX', () => {
  const seed = createSeedProject();
  // Two Phoenix Contact UT 4 terminal blocks in seed (-XT1 and -XT2)
  const bom = buildBom(seed);
  const ut4 = bom.find((r) => r.article === 'UT 4');
  assert.ok(ut4);
  assert.equal(ut4.quantity, 2);
  assert.equal(ut4.designationText, '-XT1, -XT2');

  // Mark one removed in Flux
  const xt2 = seed.devices.find((d) => d.designation === '-XT2');
  assert.ok(xt2);
  xt2.bindingState = 'REMOVED_IN_FLUX';
  const bomAfter = buildBom(seed);
  const ut4After = bomAfter.find((r) => r.article === 'UT 4');
  assert.ok(ut4After);
  assert.equal(ut4After.quantity, 1);

  const csv = exportBomCsv(bomAfter);
  assert.ok(csv.includes('UT 4'));
  assert.ok(csv.includes('Phoenix Contact'));
});

test('Cable journal and terminal plan compute connected cores accurately', () => {
  const seed = createSeedProject();
  const cables = buildCableJournal(seed);
  const w2 = cables.find((c) => c.designation === '-W2');
  assert.ok(w2);
  assert.equal(w2.usedCores, 4);
  assert.equal(w2.coresCount, 4);

  const terminals = buildTerminalPlan(seed);
  assert.equal(terminals.length, 16); // 2 terminal blocks * 8 pins each
});

test('ERC catches duplicate designations and potential conflicts', () => {
  const seed = createSeedProject();
  // Duplicate designation
  const clone = structuredClone(seed.devices[0]);
  clone.id = 'dev-dup';
  clone.elementId = 'el-dup';
  seed.devices.push(clone);

  // Potential conflict wire: power -> pe
  seed.wires.push({
    id: 'w-bad',
    sheetId: 'sheet-1',
    netName: 'SHORT_PE',
    signalType: 'power',
    fromDeviceId: 'dev-qf1',
    fromPinId: 'p-qf1-2',
    toDeviceId: 'dev-m1',
    toPinId: 'p-m1-pe',
    waypoints: [
      { x: 260, y: 230 },
      { x: 630, y: 615 },
    ],
    crossSection: '2.5 мм²',
    wireNumber: 'ERR1',
  });

  const issues = runErc(seed);
  assert.ok(issues.some((i) => i.code === 'E3-DUP-DES' && i.severity === 'error'));
  assert.ok(issues.some((i) => i.code === 'E3-POTENTIAL-CONFLICT' && i.severity === 'error'));
});

test('Visual settings export/import and DXF generation work cleanly', () => {
  const seed = createSeedProject();
  seed.visualSettings.presetName = 'Цеховой тёмный профиль';
  seed.visualSettings.gridSize = 25;
  const exported = exportVisualSettings(seed.visualSettings);
  const restored = parseVisualSettings(exported);
  assert.equal(restored.presetName, 'Цеховой тёмный профиль');
  assert.equal(restored.gridSize, 25);

  const dxf = exportToDxf(seed, 'sheet-1');
  assert.ok(dxf.includes('ENTITIES'));
  assert.ok(dxf.includes('-QF1'));
  assert.ok(dxf.includes('EOF'));
});

test('Large dataset (1000 devices) builds BOM, ERC, and XML quickly', () => {
  const seed = createSeedProject();
  const t0 = performance.now();
  const large = generateStressBatch(seed, 1000);
  const bom = buildBom(large);
  const erc = runErc(large);
  const xml = serializeE3Xml(large);
  const elapsed = performance.now() - t0;

  assert.ok(large.devices.length >= 1010);
  assert.ok(bom.length >= 10);
  assert.ok(Array.isArray(erc));
  assert.ok(xml.length > 100_000);
  assert.ok(elapsed < 2000, `Expected < 2000ms, got ${elapsed}ms`);
});
