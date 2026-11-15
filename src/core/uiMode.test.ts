import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UI_MODE_OPTIONS,
  defaultRibbonCollapsedForMode,
  getUiModeMeta,
  isNewUiMode,
  normalizeUiWorkspaceMode,
} from './uiMode.ts';
import { buildDefaultHvacStages, exportPlcIoCsv } from './hvacBuilder.ts';
import { E3_CATALOG } from './e3Catalog.ts';
import { createSeedProject } from './e3Seed.ts';
import { exportSheetsToDxf } from './dxfExporter.ts';
import { buildOrthogonalWireWithWaypoints } from './wireEditing.ts';

test('normalizeUiWorkspaceMode handles valid and invalid values', () => {
  assert.equal(normalizeUiWorkspaceMode('classic'), 'classic');
  assert.equal(normalizeUiWorkspaceMode('hybrid'), 'hybrid');
  assert.equal(normalizeUiWorkspaceMode('focus'), 'focus');
  assert.equal(normalizeUiWorkspaceMode('unknown'), 'classic');
  assert.equal(normalizeUiWorkspaceMode(null), 'classic');
  assert.equal(normalizeUiWorkspaceMode(undefined), 'classic');
});

test('isNewUiMode and defaultRibbonCollapsedForMode map classic vs new modes cleanly', () => {
  assert.equal(isNewUiMode('classic'), false);
  assert.equal(isNewUiMode('hybrid'), true);
  assert.equal(isNewUiMode('focus'), true);

  assert.equal(defaultRibbonCollapsedForMode('classic'), false);
  assert.equal(defaultRibbonCollapsedForMode('hybrid'), true);
  assert.equal(defaultRibbonCollapsedForMode('focus'), true);

  assert.equal(UI_MODE_OPTIONS.length, 3);
  assert.equal(getUiModeMeta('hybrid').groupLabel, 'Новый интерфейс');
  assert.equal(getUiModeMeta('classic').groupLabel, 'Этот интерфейс');
});

test('hvacBuilder supports supply_exhaust_recovery and PLC IO CSV export', () => {
  const stages = buildDefaultHvacStages(
    'supply_exhaust_recovery',
    {
      systemTag: 'ПВ1',
      cabinetTag: 'ЩУ-ПВ1',
      fanPowerKw: 2.2,
      heaterPowerKw: 0,
      voltage: '380V',
      exZone: 'non-Ex',
      heatingType: 'water',
      hasCooler: false,
      hasFilter: true,
      hasOutletDamper: true,
      hasLocalPost: true,
      hasFanRedundancy: true,
      hasFreezeProtection: true,
    },
    E3_CATALOG
  );
  assert.ok(stages.some((s) => s.role === 'supply_fan'));
  assert.ok(stages.some((s) => s.role === 'exhaust_fan'));
  assert.equal(stages.filter((s) => s.role === 'supply_fan').length, 2);

  const csv = exportPlcIoCsv('ПВ1', 'ЩУ-ПВ1', stages, E3_CATALOG);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('ИТОГО'));
  assert.ok(csv.includes('РЕЗЕРВ +20%'));
});

test('DXF export emits handles, $HANDSEED and OBJECTS ACAD_GROUP dictionary', () => {
  const project = createSeedProject();
  const dxf = exportSheetsToDxf(project, { includeGostFrame: true });
  assert.ok(dxf.includes('$HANDSEED'));
  assert.ok(dxf.includes('UTF-8'));
  assert.ok(dxf.includes('OBJECTS'));
  assert.ok(dxf.includes('ACAD_GROUP'));
});

test('buildOrthogonalWireWithWaypoints honors preferPosture hv vs vh when no intermediate anchors', () => {
  const start = { x: 100, y: 100, direction: 'right' as const };
  const end = { x: 200, y: 200, direction: 'bottom' as const };
  const hv = buildOrthogonalWireWithWaypoints(start, [], end, 20, 'hv');
  const vh = buildOrthogonalWireWithWaypoints(start, [], end, 20, 'vh');
  assert.deepEqual(hv, [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
  ]);
  assert.deepEqual(vh, [
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 200, y: 200 },
  ]);
});
