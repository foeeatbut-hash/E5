import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedProject } from './e3Seed.ts';
import {
  buildFluxStudioLogicSource,
  buildFluxStudioManifest,
  FLUX_EXPOSED_CAPABILITIES,
  sanitizeFluxModuleId,
} from './fluxStudioManifest.ts';

test('sanitizeFluxModuleId normalizes arbitrary strings into safe Flux module IDs', () => {
  assert.equal(sanitizeFluxModuleId('  E3ProMax / Studio! '), 'e3promax-studio');
  assert.equal(sanitizeFluxModuleId(''), 'e3promax-ecad');
});

test('buildFluxStudioManifest builds valid contractVersion 2 descriptor bound to project', () => {
  const project = createSeedProject();
  const manifest = buildFluxStudioManifest(project, {
    id: 'flux-e3-ecad',
    name: 'ЩУ-ПВ1 Электрика',
    version: '2.1.0',
    ui: 'widget',
    fluxProjectKey: 'FLUX_CUSTOM_99',
  });

  assert.equal(manifest.contractVersion, 2);
  assert.equal(manifest.id, 'flux-e3-ecad');
  assert.equal(manifest.ui, 'widget');
  assert.equal(manifest.version, '2.1.0');
  assert.equal(manifest.logic, 'logic/main.ts');
  assert.equal(manifest.projectBinding.fluxProjectKey, 'FLUX_CUSTOM_99');
  assert.equal(manifest.store.requires.flux, '1.21.0');
  assert.deepEqual(manifest.capabilities, [...FLUX_EXPOSED_CAPABILITIES]);
});

test('buildFluxStudioLogicSource emits valid module metadata matching manifest', () => {
  const project = createSeedProject();
  const manifest = buildFluxStudioManifest(project);
  const src = buildFluxStudioLogicSource(manifest);
  assert.ok(src.includes('contractVersion 2'));
  assert.ok(src.includes(manifest.id));
  assert.ok(src.includes(project.fluxProjectKey));
});
