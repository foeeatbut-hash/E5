import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWaveDotSample,
  computeWavePulseContribution,
  createProjectFromTemplate,
  easeGridLockSettle,
  filterAndSortRecentProjects,
  filterStartTemplates,
  formatRelativeTimestampRu,
  loadPinnedProjectIds,
  parseCssColorToRgb,
  savePinnedProjectIds,
  START_TEMPLATE_DEFS,
  summarizeProjectHealth,
  togglePinnedProjectId,
  WAVE_PULSE_LIFETIME_SEC,
} from './startHub.ts';
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
  assert.equal(filterStartTemplates(START_TEMPLATE_DEFS, '').length, 4);
  const vfd = filterStartTemplates(START_TEMPLATE_DEFS, '380');
  assert.equal(vfd.length, 1);
  assert.equal(vfd[0].id, 'power_380v');
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
