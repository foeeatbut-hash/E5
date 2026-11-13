import test from 'node:test';
import assert from 'node:assert/strict';
import { deviceToCatalogItem, E3_CATALOG, mergeCatalogItems } from './e3Catalog.ts';
import { buildBom, runErc } from './e3Engine.ts';
import { createSeedProject } from './e3Seed.ts';
import {
  buildDefaultHvacStages,
  type FsaMatrixData,
  generateHvacDiagram,
  matchProductFromFlux,
  parseFluxSpecsFromProject,
} from './hvacBuilder.ts';

test('parseFluxSpecsFromProject extracts power, system tag, and cabinet tag from project', () => {
  const seed = createSeedProject();
  const specs = parseFluxSpecsFromProject(seed);
  assert.equal(specs.fanPowerKw, 4);
  assert.equal(specs.exZone, 'non-Ex');
  assert.ok(specs.systemTag.length > 0);
});

test('matchProductFromFlux selects exact Exd / power rating fan from catalog and supports custom items', () => {
  const baseSpecs = {
    systemTag: 'ПВ1',
    cabinetTag: '3700-NK-DB-009',
    fanPowerKw: 5.5,
    heaterPowerKw: 15,
    voltage: '380V' as const,
    exZone: 'Exd' as const,
    heatingType: 'water' as const,
    hasCooler: true,
    hasFilter: true,
    hasOutletDamper: true,
    hasLocalPost: true,
  };
  const fanExd = matchProductFromFlux('supply_fan', baseSpecs, E3_CATALOG);
  assert.equal(fanExd?.id, 'hvac-fan-supply-5k5');

  const smallSpecs = { ...baseSpecs, fanPowerKw: 2.2, exZone: 'non-Ex' as const };
  const fanSmall = matchProductFromFlux('supply_fan', smallSpecs, E3_CATALOG);
  assert.equal(fanSmall?.id, 'hvac-fan-supply-2k2');

  const merged = mergeCatalogItems([
    {
      ...E3_CATALOG[0],
      id: 'custom-fan-11k',
      category: 'fan',
      stageRole: 'supply_fan',
      defaultPrefix: 'BL',
      componentName: 'Вентилятор ВЕЗА 11 кВт',
      article: 'VRAN-11K',
      fluxMatch: { minPowerKw: 9, maxPowerKw: 15, voltage: '380V', exZone: 'non-Ex' },
    },
  ]);
  const fan11 = matchProductFromFlux('supply_fan', { ...smallSpecs, fanPowerKw: 11 }, merged);
  assert.equal(fan11?.id, 'custom-fan-11k');
});

test('generateHvacDiagram creates ordered FSA sheet, I/O matrix totals, and External Wiring sheet on A2', () => {
  const seed = createSeedProject();
  const specs = parseFluxSpecsFromProject(seed);
  const stages = buildDefaultHvacStages('supply_ahu', specs, E3_CATALOG);

  const res = generateHvacDiagram(
    {
      templateId: 'supply_ahu',
      systemTag: '3700-B06-AS-001A',
      cabinetTag: '3700-NK-DB-009',
      sheetFormat: 'A2',
      fontFamily: 'JetBrains Mono',
      createExternalWiringSheet: true,
      stages,
    },
    E3_CATALOG,
    seed
  );

  assert.equal(res.nextProject.visualSettings.fontFamily, 'JetBrains Mono');
  const fsaSheet = res.nextProject.sheets.find((s) => s.id === res.fsaSheetId);
  assert.ok(fsaSheet);
  assert.equal(fsaSheet.format, 'A2');
  assert.equal(fsaSheet.width, 2380);

  const matrixDev = res.nextProject.devices.find(
    (d) => d.sheetId === res.fsaSheetId && d.category === 'io_matrix'
  );
  assert.ok(matrixDev);
  const matrixRaw = matrixDev.attributes.find((a) => a.name === 'FSA_MATRIX_JSON')?.value;
  assert.ok(matrixRaw);
  const parsedMatrix = JSON.parse(matrixRaw) as FsaMatrixData;
  assert.ok(parsedMatrix.totals.di >= 8);
  assert.ok(parsedMatrix.reserve20.di >= parsedMatrix.totals.di);

  // Check airflow devices placed in increasing X order
  const airflowDevs = res.nextProject.devices
    .filter((d) => d.sheetId === res.fsaSheetId && d.category !== 'io_matrix' && d.category !== 'kip_circle')
    .sort((a, b) => a.x - b.x);
  assert.ok(airflowDevs.length >= 6);
  for (let i = 1; i < airflowDevs.length; i++) {
    assert.ok(airflowDevs[i].x > airflowDevs[i - 1].x);
  }

  // Check External Wiring sheet and non-overlapping cables
  assert.ok(res.wiringSheetId);
  const extWires = res.nextProject.wires.filter((w) => w.sheetId === res.wiringSheetId);
  assert.ok(extWires.length >= 9);

  // Linked multi-sheet field views must not cause duplicate designation ERC errors or double-counted BOM rows
  const ercErrors = runErc(res.nextProject).filter((i) => i.severity === 'error');
  assert.equal(ercErrors.length, 0);

  const bom = buildBom(res.nextProject);
  assert.ok(!bom.some((r) => r.componentName.startsWith('Полевое подключение:')));
  assert.ok(!bom.some((r) => r.article === 'AIRFLOW-IN' || r.article === 'AIRFLOW-OUT'));

  // Every device on FSA & External Wiring sheets must carry complete attributes
  const extFieldDevs = res.nextProject.devices.filter(
    (d) => d.sheetId === res.wiringSheetId && d.e3BlockName === 'EXT_FIELD_UNIT'
  );
  assert.ok(extFieldDevs.length >= 3);
  for (const fieldDev of extFieldDevs) {
    assert.ok(fieldDev.attributes.length >= 4, `${fieldDev.designation} must inherit full attributes`);
    assert.ok(fieldDev.attributes.some((a) => a.name === 'Шкаф назначения'));
    assert.ok(fieldDev.attributes.some((a) => a.name === 'Марка кабеля'));
  }
});

test('every catalog item has >=3 attributes and deviceToCatalogItem creates a whole reusable component', () => {
  for (const item of E3_CATALOG) {
    assert.ok(
      item.defaultAttributes.length >= 3,
      `Catalog item ${item.id} (${item.componentName}) has only ${item.defaultAttributes.length} attributes`
    );
  }

  const seed = createSeedProject();
  const dev = seed.devices[0];
  const saved = deviceToCatalogItem({
    ...dev,
    attributes: [
      ...dev.attributes,
      { name: 'Тест атрибут', value: 'Да', owner: '', conflict: 'flux' },
      { name: 'SYS_ONLY', value: 'hidden', owner: '', conflict: 'script', service: true },
    ],
  });
  assert.equal(saved.isCustom, true);
  assert.equal(saved.pins.length, dev.pins.length);
  assert.ok(saved.defaultAttributes.some((a) => a.name === 'Тест атрибут' && a.value === 'Да'));
  assert.ok(!saved.defaultAttributes.some((a) => a.name === 'SYS_ONLY'));
});

