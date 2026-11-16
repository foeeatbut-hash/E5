import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STANDALONE_SECTIONS,
  BUILTIN_CUSTOM_TEMPLATE_PRESETS,
  buildProjectFromCustomTemplate,
  clearTemplateWorkspaceDraft,
  computeWaveDotSample,
  computeWavePulseContribution,
  createDefaultCustomTemplateDraft,
  createProjectFromTemplate,
  createStandaloneHvacProject,
  DEFAULT_STANDALONE_HVAC_PREFS,
  deleteCustomTemplate,
  duplicateCustomTemplate,
  easeGridLockSettle,
  filterAndSortRecentProjects,
  filterStartTemplates,
  formatRelativeTimestampRu,
  loadCustomTemplates,
  loadPinnedProjectIds,
  loadStandalonePrefs,
  loadTemplateWorkspaceDraft,
  parseCssColorToRgb,
  parseCustomTemplateFile,
  saveCustomTemplates,
  savePinnedProjectIds,
  saveStandalonePrefs,
  saveTemplateWorkspaceDraft,
  serializeCustomTemplateFile,
  STANDALONE_HVAC_PREFS_KEY,
  START_TEMPLATE_DEFS,
  summarizeProjectHealth,
  togglePinnedProjectId,
  upsertCustomTemplate,
  WAVE_PULSE_LIFETIME_SEC,
} from './startHub.ts';
import { E3_CATALOG } from './e3Catalog.ts';
import { buildDefaultHvacStages } from './hvacBuilder.ts';
import type { RecentProjectEntry } from './sessionStorage.ts';

function makeMemoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

test('createProjectFromTemplate creates valid, hydrated ECAD projects for all templates', () => {
  for (const def of START_TEMPLATE_DEFS) {
    const proj = createProjectFromTemplate(def.id, {
      standard: def.id === 'plc_automation' ? 'IEC' : 'GOST',
      gridSize: 10,
      theme: 'dark',
      nowIso: '2026-11-15T08:00:00.000Z',
    });

    assert.ok(proj.id.length > 0);
    assert.equal(proj.sheets.length, def.sheetCount);
    assert.equal(proj.devices.length, def.deviceCount);
    assert.equal(proj.visualSettings.gridSize, 10);
    assert.equal(proj.visualSettings.theme, 'dark');
    assert.equal(proj.standard, def.id === 'plc_automation' ? 'IEC' : 'GOST');
    const health = summarizeProjectHealth(proj);
    assert.equal(health.errors, 0, `Template ${def.id} should have 0 ERC errors`);
  }
});

test('pinned project storage persists and toggles deterministically', () => {
  const store = makeMemoryStorage();
  assert.deepEqual(loadPinnedProjectIds(store), []);

  const first = togglePinnedProjectId([], 'proj-a');
  const second = togglePinnedProjectId(first, 'proj-b');
  savePinnedProjectIds(second, store);
  assert.deepEqual(loadPinnedProjectIds(store), ['proj-b', 'proj-a']);

  const unpinned = togglePinnedProjectId(second, 'proj-a');
  savePinnedProjectIds(unpinned, store);
  assert.deepEqual(loadPinnedProjectIds(store), ['proj-b']);
});

test('filterAndSortRecentProjects puts pinned projects first and filters by tab and query', () => {
  const pGost = createProjectFromTemplate('power_380v', {
    standard: 'GOST',
    nowIso: '2026-11-14T10:00:00.000Z',
  });
  pGost.id = 'proj-1';
  pGost.name = 'Вводной щит ЩВР-1';
  pGost.projectCode = 'ШВР-001';

  const pIec = createProjectFromTemplate('plc_automation', {
    standard: 'IEC',
    nowIso: '2026-11-15T09:00:00.000Z',
  });
  pIec.id = 'proj-2';
  pIec.name = 'ПЛК Автоматика';
  pIec.projectCode = 'PLC-200';

  const entries: RecentProjectEntry[] = [
    {
      id: pGost.id,
      name: pGost.name,
      projectCode: pGost.projectCode,
      revision: 2,
      sheetCount: pGost.sheets.length,
      deviceCount: pGost.devices.length,
      wireCount: pGost.wires.length,
      savedAt: '2026-11-14T10:00:00.000Z',
      activeSheetId: pGost.sheets[0].id,
      project: pGost,
    },
    {
      id: pIec.id,
      name: pIec.name,
      projectCode: pIec.projectCode,
      revision: 1,
      sheetCount: pIec.sheets.length,
      deviceCount: pIec.devices.length,
      wireCount: pIec.wires.length,
      savedAt: '2026-11-15T09:00:00.000Z',
      activeSheetId: pIec.sheets[0].id,
      project: pIec,
    },
  ];

  // Even though pIec is newer, pGost is pinned so it comes first in 'all'
  const sorted = filterAndSortRecentProjects(entries, {
    tab: 'all',
    query: '',
    pinnedIds: ['proj-1'],
  });
  assert.deepEqual(
    sorted.map((e) => e.id),
    ['proj-1', 'proj-2']
  );

  // Filter by 'iec'
  const iecOnly = filterAndSortRecentProjects(entries, {
    tab: 'iec',
    query: '',
    pinnedIds: ['proj-1'],
  });
  assert.deepEqual(
    iecOnly.map((e) => e.id),
    ['proj-2']
  );

  // Search by code
  const byQuery = filterAndSortRecentProjects(entries, {
    tab: 'all',
    query: 'швр',
    pinnedIds: [],
  });
  assert.deepEqual(
    byQuery.map((e) => e.id),
    ['proj-1']
  );
});

test('filterStartTemplates matches title and engineering tags', () => {
  assert.equal(filterStartTemplates(START_TEMPLATE_DEFS, '').length, 7);
  const v380 = filterStartTemplates(START_TEMPLATE_DEFS, '380');
  assert.ok(v380.some((t) => t.id === 'power_380v'));
  const vfd = filterStartTemplates(START_TEMPLATE_DEFS, 'vfd');
  assert.equal(vfd.length, 1);
  assert.equal(vfd[0].id, 'power_380v');

  assert.equal(filterStartTemplates(START_TEMPLATE_DEFS, 'Щит управления').length, 1);
  assert.equal(filterStartTemplates(START_TEMPLATE_DEFS, 'ФСА компрессора').length, 1);
  assert.equal(filterStartTemplates(START_TEMPLATE_DEFS, 'Электропитание 24В').length, 1);
});

test('formatRelativeTimestampRu formats fresh and older dates cleanly', () => {
  const now = Date.parse('2026-11-15T10:00:00.000Z');
  assert.equal(formatRelativeTimestampRu('2026-11-15T09:59:45.000Z', now), 'только что');
  assert.equal(formatRelativeTimestampRu('2026-11-15T09:45:00.000Z', now), '15 мин назад');
  assert.equal(formatRelativeTimestampRu('2026-11-14T10:00:00.000Z', now), 'вчера');
});

test('Antigravity wave dot math reacts to pointer and snaps cleanly on Grid-Lock', () => {
  assert.equal(easeGridLockSettle(0), 0);
  assert.equal(easeGridLockSettle(1), 1);

  const rest = computeWaveDotSample({
    baseX: 200,
    baseY: 200,
    timeSec: 1.5,
    pointer: { x: 200, y: 200, active: false, speed: 0 },
    hoverRect: null,
    gridLockProgress: 0,
  });

  const hovered = computeWaveDotSample({
    baseX: 220,
    baseY: 200,
    timeSec: 1.5,
    pointer: { x: 200, y: 200, active: true, speed: 12 },
    hoverRect: null,
    gridLockProgress: 0,
  });
  assert.ok(hovered.accentMix > rest.accentMix);
  assert.ok(hovered.x > 220, 'dot should radially displace away from pointer center');

  const locked = computeWaveDotSample({
    baseX: 220,
    baseY: 200,
    timeSec: 1.5,
    pointer: { x: 200, y: 200, active: true, speed: 12 },
    hoverRect: null,
    gridLockProgress: 1,
  });
  assert.equal(locked.x, 220);
  assert.equal(locked.y, 200);
  assert.equal(locked.accentMix, 0);
});

test('parseCssColorToRgb parses hex and rgb strings safely', () => {
  assert.deepEqual(parseCssColorToRgb('#0f766e', [0, 0, 0]), [15, 118, 110]);
  assert.deepEqual(parseCssColorToRgb('#abc', [0, 0, 0]), [170, 187, 204]);
  assert.deepEqual(parseCssColorToRgb('rgb(45, 212, 191)', [0, 0, 0]), [45, 212, 191]);
});

test('Antigravity wave pulse expands radially over lifetime and stops at Grid-Lock', () => {
  const pulse = { x: 100, y: 100, bornAtSec: 1.0, strength: 1.1 };
  // At age = 0.2s, ringRadius ≈ 18 + (0.2/0.9)*320 ≈ 89px; check point at distance 90px
  const contrib = computeWavePulseContribution(190, 100, 1.2, pulse);
  assert.ok(contrib.offsetX > 0, 'radial pulse should push dot outward along +X');
  assert.ok(contrib.accentMix > 0.2, 'active pulse ring should illuminate dot accent');

  // Expired after WAVE_PULSE_LIFETIME_SEC
  const expired = computeWavePulseContribution(190, 100, 1.0 + WAVE_PULSE_LIFETIME_SEC + 0.05, pulse);
  assert.equal(expired.offsetX, 0);
  assert.equal(expired.accentMix, 0);

  // Integrated into computeWaveDotSample, vanishes completely when gridLockProgress = 1
  const pulsedDot = computeWaveDotSample({
    baseX: 190,
    baseY: 100,
    timeSec: 1.2,
    pointer: { x: 0, y: 0, active: false, speed: 0 },
    hoverRect: null,
    gridLockProgress: 0,
    pulses: [pulse],
  });
  const baseDot = computeWaveDotSample({
    baseX: 190,
    baseY: 100,
    timeSec: 1.2,
    pointer: { x: 0, y: 0, active: false, speed: 0 },
    hoverRect: null,
    gridLockProgress: 0,
  });
  assert.ok(pulsedDot.accentMix > baseDot.accentMix);
  assert.ok(pulsedDot.x > baseDot.x);

  const lockedDot = computeWaveDotSample({
    baseX: 190,
    baseY: 100,
    timeSec: 1.2,
    pointer: { x: 0, y: 0, active: false, speed: 0 },
    hoverRect: null,
    gridLockProgress: 1,
    pulses: [pulse],
  });
  assert.equal(lockedDot.x, 190);
  assert.equal(lockedDot.accentMix, 0);
});

test('custom project templates support CRUD, persistence, duplication, and ERC-clean build', () => {
  const store = makeMemoryStorage();
  assert.deepEqual(loadCustomTemplates(store), []);

  const draft = createDefaultCustomTemplateDraft({
    title: 'Мой щит управления',
    standard: 'IEC',
    projectCodePrefix: 'МЩУ',
    gridSize: 10,
    fontFamily: 'DM Sans',
    initialSheets: [
      { id: 's1', name: 'Ввод питания', format: 'A3' },
      { id: 's2', name: 'Шкаф ПЛК', format: 'A2' },
    ],
    stampDefaults: {
      stampForm: 'form1',
      organization: 'ООО «ТестЭнерго»',
      author: 'Соколов И.А.',
      checker: 'Смирнов Д.В.',
      approver: '',
      litera: 'П',
    },
    modules: {
      includePowerInfeed: true,
      includePlcRack: true,
      includeTerminalStrip: true,
      includeGostBomTable: true,
      includeCrossRefs: true,
    },
  });

  const list1 = upsertCustomTemplate([], draft);
  saveCustomTemplates(list1, store);
  const loaded = loadCustomTemplates(store);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].title, 'Мой щит управления');
  assert.equal(loaded[0].initialSheets.length, 2);

  const built = buildProjectFromCustomTemplate(loaded[0], {
    nowIso: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(built.standard, 'IEC');
  assert.equal(built.sheets.length, 2);
  assert.equal(built.sheets[0].format, 'A3');
  assert.equal(built.sheets[1].format, 'A2');
  assert.equal(built.sheets[0].titleBlock.organization, 'ООО «ТестЭнерго»');
  assert.equal(built.visualSettings.gridSize, 10);
  assert.equal(built.visualSettings.fontFamily, 'DM Sans');
  assert.ok((built.annotations || []).some((a) => a.kind === 'bom_table'));
  assert.ok(built.devices.length >= 8);
  assert.equal(summarizeProjectHealth(built).errors, 0, 'Generated custom template project must pass ERC cleanly');

  const dup = duplicateCustomTemplate(loaded[0]);
  assert.ok(dup.id !== loaded[0].id);
  assert.ok(dup.title.includes('(копия)'));
  const list2 = upsertCustomTemplate(loaded, dup);
  assert.equal(list2.length, 2);

  const afterDel = deleteCustomTemplate(list2, loaded[0].id);
  saveCustomTemplates(afterDel, store);
  assert.equal(loadCustomTemplates(store).length, 1);
});

test('builtin custom template presets generate valid projects with zero ERC errors', () => {
  for (const preset of BUILTIN_CUSTOM_TEMPLATE_PRESETS) {
    const proj = buildProjectFromCustomTemplate(preset, {
      nowIso: '2026-11-15T10:00:00.000Z',
    });
    assert.equal(proj.sheets.length, preset.initialSheets.length);
    assert.equal(summarizeProjectHealth(proj).errors, 0);
  }
});

test('standalone layer preferences and standalone HVAC project generation work cleanly without open project', () => {
  const store = makeMemoryStorage();
  const prefs = {
    ...DEFAULT_STANDALONE_HVAC_PREFS,
    systemTag: 'ПВ-99',
    cabinetTag: 'ЩУ-99',
    sheetFormat: 'A2' as const,
  };
  saveStandalonePrefs(STANDALONE_HVAC_PREFS_KEY, prefs, store);
  const loaded = loadStandalonePrefs(STANDALONE_HVAC_PREFS_KEY, DEFAULT_STANDALONE_HVAC_PREFS, store);
  assert.equal(loaded.systemTag, 'ПВ-99');
  assert.equal(loaded.cabinetTag, 'ЩУ-99');

  const stages = buildDefaultHvacStages('supply_ahu', {
    systemTag: loaded.systemTag,
    cabinetTag: loaded.cabinetTag,
    fanPowerKw: loaded.fanPowerKw,
    heaterPowerKw: loaded.heaterPowerKw,
    voltage: loaded.voltage,
    exZone: loaded.exZone,
    heatingType: loaded.heatingType,
    hasCooler: true,
    hasFilter: true,
    hasOutletDamper: true,
    hasLocalPost: true,
    hasFanRedundancy: loaded.hasFanRedundancy,
    hasFreezeProtection: loaded.hasFreezeProtection,
  }, E3_CATALOG);

  const hvacRes = createStandaloneHvacProject(
    {
      templateId: 'supply_ahu',
      systemTag: loaded.systemTag,
      cabinetTag: loaded.cabinetTag,
      sheetFormat: loaded.sheetFormat,
      fontFamily: loaded.fontFamily,
      createExternalWiringSheet: true,
      hasFanRedundancy: false,
      hasFreezeProtection: true,
      stages,
    },
    E3_CATALOG
  );

  assert.equal(hvacRes.project.sheets.length, 2);
  assert.ok(hvacRes.project.devices.length > 0);
  assert.equal(hvacRes.project.sheets[0].id, hvacRes.fsaSheetId);
});

test('standalone sections descriptor covers all 5 independent program spaces', () => {
  const ids = APP_STANDALONE_SECTIONS.map((s) => s.id);
  assert.deepEqual(ids, ['hub', 'templates', 'hvac', 'ugo', 'exchange']);
});

test('custom template file (.e3tpl.json) round-trip and template workspace draft autosave', () => {
  const store = makeMemoryStorage();
  const fullStore: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
    getItem: store.getItem,
    setItem: store.setItem,
    removeItem: () => {
      store.setItem('e3promax.templateWorkspaceDraft.v1', '');
    },
  };

  const tpl = createDefaultCustomTemplateDraft({
    title: 'Шаблон компрессорной АСУ',
    projectCodePrefix: 'КАСУ',
    standard: 'GOST',
    defaultFormat: 'A2',
    modules: {
      includePowerInfeed: true,
      includePlcRack: true,
      includeTerminalStrip: false,
      includeGostBomTable: true,
      includeCrossRefs: true,
    },
  });

  saveTemplateWorkspaceDraft(tpl, store);
  const loadedDraft = loadTemplateWorkspaceDraft(store);
  assert.ok(loadedDraft);
  assert.equal(loadedDraft.title, 'Шаблон компрессорной АСУ');
  assert.equal(loadedDraft.defaultFormat, 'A2');

  const json = serializeCustomTemplateFile(tpl, '2026-11-15T12:00:00.000Z');
  const imported = parseCustomTemplateFile(json);
  assert.ok(imported);
  assert.equal(imported.title, 'Шаблон компрессорной АСУ');
  assert.equal(imported.projectCodePrefix, 'КАСУ');
  assert.equal(imported.modules.includePlcRack, true);
  assert.equal(parseCustomTemplateFile('{invalid'), null);

  clearTemplateWorkspaceDraft(fullStore);
});


