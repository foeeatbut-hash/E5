import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedProject } from './e3Seed.ts';
import { buildBom, parseE3Xml, runErc, serializeE3Xml } from './e3Engine.ts';
import {
  computeGostZone,
  createOffPageConnectorDevice,
  createPairedOffPageConnectors,
  resolveOffPageLinks,
  traceConnectedPotential,
} from './crossSheetRefs.ts';

test('computeGostZone resolves GOST 2.104 grid zones А1..Д6 and clamps out-of-frame coords', () => {
  const proj = createSeedProject();
  const s1 = proj.sheets[0];

  const topLeft = computeGostZone(s1, proj, 0, 0);
  assert.equal(topLeft.zone, 'А1');

  const bottomRight = computeGostZone(s1, proj, 9999, 9999);
  assert.equal(bottomRight.zone, 'Д6');

  const mid = computeGostZone(s1, proj, 700, 450);
  assert.match(mid.zone, /^[АБВГД][1-6]$/);
});

test('seed project pre-wired off-page pair resolves bidirectional GOST zone addresses cleanly', () => {
  const proj = createSeedProject();
  const links = resolveOffPageLinks(proj);

  const xp1 = links.get('dev-xp1');
  const xp2 = links.get('dev-xp2');
  assert.ok(xp1);
  assert.ok(xp2);

  assert.equal(xp1.direction, 'out');
  assert.equal(xp1.potentialName, '+24V_DC');
  assert.equal(xp1.primaryCounterpart?.deviceId, 'dev-xp2');
  assert.equal(xp1.primaryCounterpart?.sheetNumber, 2);
  assert.match(xp1.addressText, /^→ Л\.2 \([АБВГД][1-6]\)$/);

  assert.equal(xp2.direction, 'in');
  assert.equal(xp2.potentialName, '+24V_DC');
  assert.equal(xp2.primaryCounterpart?.deviceId, 'dev-xp1');
  assert.equal(xp2.primaryCounterpart?.sheetNumber, 1);
  assert.match(xp2.addressText, /^← Л\.1 \([АБВГД][1-6]\)$/);
});

test('offpage_ref devices are excluded from BOM and produce zero ERC errors/warnings when paired & wired', () => {
  const proj = createSeedProject();
  const bom = buildBom(proj);
  assert.equal(
    bom.some((row) => row.designations.includes('-XP1') || row.designations.includes('-XP2')),
    false
  );

  const issues = runErc(proj);
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  assert.equal(errors.length, 0);
  assert.equal(warnings.length, 0);
});

test('resolveOffPageLinks handles unpaired links and multi-target +N suffix', () => {
  const proj = createSeedProject();
  const unpaired = createOffPageConnectorDevice({
    existingDevices: proj.devices,
    sheetId: 'sheet-1',
    x: 400,
    y: 400,
    direction: 'out',
    potentialName: 'ALARM_BUS',
    signalType: 'signal',
    idSuffix: 'u1',
  });

  const extraIn1 = createOffPageConnectorDevice({
    existingDevices: [...proj.devices, unpaired],
    sheetId: 'sheet-2',
    x: 300,
    y: 200,
    direction: 'in',
    potentialName: 'ALARM_BUS',
    signalType: 'signal',
    idSuffix: 'e1',
  });

  const extraIn2 = createOffPageConnectorDevice({
    existingDevices: [...proj.devices, unpaired, extraIn1],
    sheetId: 'sheet-3',
    x: 500,
    y: 300,
    direction: 'in',
    potentialName: 'ALARM_BUS',
    signalType: 'signal',
    idSuffix: 'e2',
  });

  const onlyUnpaired = { ...proj, devices: [...proj.devices, unpaired] };
  const mapSingle = resolveOffPageLinks(onlyUnpaired);
  assert.equal(mapSingle.get(unpaired.id)?.addressText, '→ Л.?');

  const multiTarget = { ...proj, devices: [...proj.devices, unpaired, extraIn1, extraIn2] };
  const mapMulti = resolveOffPageLinks(multiTarget);
  const resolved = mapMulti.get(unpaired.id);
  assert.ok(resolved);
  assert.equal(resolved.counterparts.length, 2);
  assert.match(resolved.addressText, /^→ Л\.2 \([АБВГД][1-6]\) \+1$/);
});

test('createPairedOffPageConnectors creates linked out/in pair across sheets', () => {
  const proj = createSeedProject();
  const { sourceDevice, targetDevice, nextProject } = createPairedOffPageConnectors(proj, {
    sourceSheetId: 'sheet-1',
    sourceX: 900,
    sourceY: 600,
    targetSheetId: 'sheet-3',
    targetX: 200,
    targetY: 220,
    potentialName: '0V_DC',
    signalType: 'dc0',
  });

  assert.equal(sourceDevice.offPageRef?.targetDeviceId, targetDevice.id);
  assert.equal(targetDevice.offPageRef?.targetDeviceId, sourceDevice.id);
  assert.equal(sourceDevice.offPageRef?.direction, 'out');
  assert.equal(targetDevice.offPageRef?.direction, 'in');

  const links = resolveOffPageLinks(nextProject);
  assert.match(links.get(sourceDevice.id)?.addressText || '', /^→ Л\.3 \([АБВГД][1-6]\)$/);
  assert.match(links.get(targetDevice.id)?.addressText || '', /^← Л\.1 \([АБВГД][1-6]\)$/);
});

test('traceConnectedPotential follows wires across cross-sheet off-page links and T-branches', () => {
  const proj = createSeedProject();
  // Add a T-branch wire on Sheet 2 from -A1:+24V (p-a1-24v) to -BT1:+24V (p-bt1-24) with different wire net label
  const branchWire = {
    id: 'w-branch-24v',
    sheetId: 'sheet-2',
    netName: '+24V_SENSOR',
    signalType: 'dc24' as const,
    fromDeviceId: 'dev-a1',
    fromPinId: 'p-a1-24v',
    toDeviceId: 'dev-bt1',
    toPinId: 'p-bt1-24',
    waypoints: [
      { x: 510, y: 220 },
      { x: 510, y: 325 },
      { x: 280, y: 325 },
    ],
    crossSection: '0.75 мм²',
    wireNumber: '24V+S',
  };

  const withBranch = {
    ...proj,
    wires: [...proj.wires, branchWire],
  };

  // Start trace from w-15 on Sheet 1
  const trace = traceConnectedPotential(withBranch, { wireId: 'w-15' });
  assert.equal(trace.signalType, 'dc24');
  assert.ok(trace.wireIds.includes('w-15'));
  assert.ok(trace.wireIds.includes('w-16'));
  assert.ok(trace.wireIds.includes('w-branch-24v'));
  assert.ok(trace.offPageDeviceIds.includes('dev-xp1'));
  assert.ok(trace.offPageDeviceIds.includes('dev-xp2'));
  assert.ok(trace.sheetIds.includes('sheet-1'));
  assert.ok(trace.sheetIds.includes('sheet-2'));
  assert.ok(trace.pinKeys.includes('dev-g1:p-g1-24'));
  assert.ok(trace.pinKeys.includes('dev-a1:p-a1-24v'));
  assert.ok(trace.pinKeys.includes('dev-bt1:p-bt1-24'));
  assert.ok(trace.totalLengthMm > 300);

  // Tracing starting directly from an off-page pin must also traverse both sheets
  const fromOffPage = traceConnectedPotential(withBranch, { deviceId: 'dev-xp2' });
  assert.deepEqual(new Set(fromOffPage.wireIds), new Set(trace.wireIds));
});

test('E3 XML serialize and parse preserves offPageRef metadata cleanly', () => {
  const proj = createSeedProject();
  const xml = serializeE3Xml(proj);
  assert.match(xml, /offPageDir="out"/);
  assert.match(xml, /offPagePotential="\+24V_DC"/);

  const parsed = parseE3Xml(xml);
  const xp1 = parsed.devices.find((d) => d.id === 'dev-xp1');
  const xp2 = parsed.devices.find((d) => d.id === 'dev-xp2');
  assert.ok(xp1?.offPageRef);
  assert.ok(xp2?.offPageRef);
  assert.equal(xp1.offPageRef.direction, 'out');
  assert.equal(xp1.offPageRef.potentialName, '+24V_DC');
  assert.equal(xp1.offPageRef.targetDeviceId, 'dev-xp2');
  assert.equal(xp2.offPageRef.direction, 'in');
  assert.equal(xp2.offPageRef.targetDeviceId, 'dev-xp1');
});
