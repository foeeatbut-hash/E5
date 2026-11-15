import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedProject } from './e3Seed.ts';
import { parseE3sInput } from './e3SFormat.ts';
import {
  buildE3FluxFilename,
  E3FLUX_ENVELOPE_PREFIX,
  isE3FluxBytes,
  isE3FluxEnvelope,
  parseE3FluxEnvelope,
  parseE3FluxProjectBytes,
  serializeE3FluxEnvelope,
  serializeE3FluxProject,
} from './e3FluxFormat.ts';

test('serializeE3FluxProject encrypts E3Project with E3FLUX magic header and hides plaintext JSON', () => {
  const project = createSeedProject();
  project.name = 'Щит управления ПВ1 Секретный';
  const bytes = serializeE3FluxProject(project);

  assert.equal(isE3FluxBytes(bytes), true);
  const asLatin = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  // Header metadata may carry projectCode, but full schematic entities/devices/wires must NOT appear in plaintext
  assert.equal(asLatin.includes('"devices"'), false);
  assert.equal(asLatin.includes('"wires"'), false);
  assert.equal(asLatin.includes('Секретный'), false);

  const decoded = parseE3FluxProjectBytes(bytes);
  assert.equal(decoded.metadata.format, 'e3flux/v1');
  assert.equal(decoded.metadata.cipher, 'xor-keystream-v1');
  assert.equal(decoded.metadata.passwordProtected, false);
  assert.equal(decoded.data.id, project.id);
  assert.equal(decoded.data.name, project.name);
  assert.equal(decoded.data.sheets.length, project.sheets.length);
  assert.equal(decoded.data.devices.length, project.devices.length);
  assert.equal(decoded.data.wires.length, project.wires.length);
});

test('serializeE3FluxProject supports optional password protection and rejects wrong password or tampered bytes', () => {
  const project = createSeedProject();
  const bytes = serializeE3FluxProject(project, { password: 'ecad-secret-2026' });

  assert.throws(() => parseE3FluxProjectBytes(bytes), /защищён паролем/);
  assert.throws(() => parseE3FluxProjectBytes(bytes, 'wrong-pass'), /Неверный пароль/);

  const ok = parseE3FluxProjectBytes(bytes, 'ecad-secret-2026');
  assert.equal(ok.metadata.passwordProtected, true);
  assert.equal(ok.data.projectCode, project.projectCode);

  const tampered = new Uint8Array(bytes);
  tampered[tampered.length - 3] ^= 0xff;
  assert.throws(() => parseE3FluxProjectBytes(tampered, 'ecad-secret-2026'), /контрольная сумма|Неверный пароль/);
});

test('E3Flux envelope string round-trips Cyrillic project data cleanly', () => {
  const project = createSeedProject();
  const envelope = serializeE3FluxEnvelope(
    { project, activeSheetId: project.sheets[0].id, savedAt: '2026-11-15T05:00:00.000Z' },
    { projectCode: project.projectCode, revision: project.revision },
    { kind: 'session' }
  );

  assert.equal(envelope.startsWith(E3FLUX_ENVELOPE_PREFIX), true);
  assert.equal(isE3FluxEnvelope(envelope), true);
  assert.equal(envelope.includes('"devices"'), false);
  assert.equal(envelope.includes('"wires"'), false);

  const decoded = parseE3FluxEnvelope<{ project: typeof project; activeSheetId: string }>(envelope);
  assert.equal(decoded.metadata.kind, 'session');
  assert.equal(decoded.data.project.id, project.id);
  assert.equal(decoded.data.activeSheetId, project.sheets[0].id);
});

test('buildE3FluxFilename sanitizes projectCode and includes revision', () => {
  assert.equal(
    buildE3FluxFilename({ projectCode: 'ПДХ-2026/01:A', revision: 4 }),
    'ПДХ-2026-01-A-rev4.e3flux'
  );
});

test('parseE3sInput recognizes and decrypts .e3flux binary containers and E3FLUX1 envelopes', async () => {
  const project = createSeedProject();
  project.name = 'Проект E3Flux для импорта';
  const binary = serializeE3FluxProject(project);
  const resBin = await parseE3sInput(binary, 'test.e3flux');
  assert.equal(resBin.sourceKind, 'e3flux');
  assert.equal(resBin.project.id, project.id);
  assert.equal(resBin.project.name, 'Проект E3Flux для импорта');
  assert.equal(resBin.project.devices.length, project.devices.length);

  const env = serializeE3FluxEnvelope(project, { projectCode: project.projectCode });
  const resEnv = await parseE3sInput(env, 'test-env.e3flux');
  assert.equal(resEnv.sourceKind, 'e3flux');
  assert.equal(resEnv.project.name, 'Проект E3Flux для импорта');
});
