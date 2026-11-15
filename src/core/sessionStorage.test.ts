import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedProject } from './e3Seed.ts';
import { E3FLUX_ENVELOPE_PREFIX } from './e3FluxFormat.ts';
import {
  ACTIVE_SESSION_STORAGE_KEY,
  RECENT_PROJECTS_STORAGE_KEY,
  hydrateProjectDefaults,
  loadActiveSession,
  loadRecentProjects,
  saveActiveSession,
} from './sessionStorage.ts';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

test('hydrateProjectDefaults repairs partial legacy project JSON without crashing', () => {
  const hydrated = hydrateProjectDefaults({
    id: 'legacy-1',
    name: 'Legacy ECAD',
    sheets: [
      {
        id: 'sh-1',
        number: 1,
        name: 'Схема 1',
      } as never,
    ],
    devices: [],
    wires: [],
  });

  assert.equal(hydrated.id, 'legacy-1');
  assert.equal(hydrated.visualSettings.theme, 'light');
  assert.ok(hydrated.visualSettings.netColors.power);
  assert.equal(hydrated.sheets[0].format, 'A3');
  assert.ok(hydrated.sheets[0].width > 100);
  assert.equal(hydrated.sheets[0].titleBlock.stampForm, 'form1');
  assert.ok(Array.isArray(hydrated.annotations));
  assert.ok(Array.isArray(hydrated.cables));
  assert.ok(hydrated.layers);
});

test('loadActiveSession safely ignores corrupted JSON or malformed sheets', () => {
  const corrupted = createMemoryStorage({
    [ACTIVE_SESSION_STORAGE_KEY]: '{not-valid-json',
  });
  assert.equal(loadActiveSession(corrupted), null);

  const missingSheetId = createMemoryStorage({
    [ACTIVE_SESSION_STORAGE_KEY]: JSON.stringify({
      project: {
        id: 'p1',
        name: 'Broken',
        sheets: [{ name: 'No ID' }],
        devices: [],
        wires: [],
      },
      activeSheetId: 's1',
      savedAt: '2026-11-14T10:00:00.000Z',
    }),
  });
  assert.equal(loadActiveSession(missingSheetId), null);

  const partialValid = createMemoryStorage({
    [ACTIVE_SESSION_STORAGE_KEY]: JSON.stringify({
      project: {
        id: 'p2',
        name: 'Partial Valid',
        sheets: [{ id: 's1', number: 1, name: 'Main' }],
        devices: [],
        wires: [],
      },
      activeSheetId: 'missing-id',
      savedAt: '2026-11-14T10:00:00.000Z',
    }),
  });
  const loaded = loadActiveSession(partialValid);
  assert.ok(loaded);
  assert.equal(loaded?.activeSheetId, 's1');
  assert.ok(loaded?.project.visualSettings.netColors.pe);
  assert.deepEqual(loadRecentProjects(corrupted), []);
});

test('saveActiveSession encrypts active session and recent projects in E3Flux format rather than plaintext JSON', () => {
  const storage = createMemoryStorage();
  const project = createSeedProject();
  project.name = 'Закрытая схема ВРУ';

  saveActiveSession(project, project.sheets[0].id, storage);

  const rawSession = storage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  const rawRecent = storage.getItem(RECENT_PROJECTS_STORAGE_KEY);
  assert.ok(rawSession && rawSession.startsWith(E3FLUX_ENVELOPE_PREFIX));
  assert.ok(rawRecent && rawRecent.startsWith(E3FLUX_ENVELOPE_PREFIX));
  assert.equal(rawSession.includes('"devices"'), false);
  assert.equal(rawSession.includes('Закрытая схема ВРУ'), false);
  assert.equal(rawRecent.includes('"devices"'), false);

  const restored = loadActiveSession(storage);
  assert.ok(restored);
  assert.equal(restored?.project.id, project.id);
  assert.equal(restored?.project.name, 'Закрытая схема ВРУ');
  assert.equal(restored?.project.devices.length, project.devices.length);

  const recent = loadRecentProjects(storage);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].project.name, 'Закрытая схема ВРУ');
});
