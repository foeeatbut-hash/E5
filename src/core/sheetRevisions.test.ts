import assert from 'node:assert/strict';
import test from 'node:test';
import { parseE3Xml, serializeE3Xml } from './e3Engine.ts';
import { createSeedProject } from './e3Seed.ts';
import {
  applySheetRevisionTracking,
  getSheetRevisionNumber,
  normalizeProjectSheetRevisions,
  restoreSheetFromRevision,
} from './sheetRevisions.ts';

test('normalizeProjectSheetRevisions initializes revision v1 with snapshot on all sheets', () => {
  const seed = createSeedProject();
  const normalized = normalizeProjectSheetRevisions(seed);
  assert.ok(normalized.sheets.length >= 2);
  for (const sheet of normalized.sheets) {
    assert.equal(getSheetRevisionNumber(sheet), 1);
    assert.ok(sheet.revisions && sheet.revisions.length === 1);
    assert.ok(sheet.revisions[0].snapshot);
  }
});

test('applySheetRevisionTracking increments only the modified sheet revision and keeps unaffected sheets unchanged', () => {
  const prev = normalizeProjectSheetRevisions(createSeedProject(), {
    timestamp: '2026-11-10T10:00:00.000Z',
  });

  const targetDev = prev.devices.find((d) => d.sheetId === 'sheet-1');
  assert.ok(targetDev);

  const nextDraft = {
    ...prev,
    revision: prev.revision + 1,
    updatedAt: '2026-11-10T10:05:00.000Z',
    devices: prev.devices.map((d) =>
      d.id === targetDev.id ? { ...d, designation: '-QF10' } : d
    ),
  };

  const tracked = applySheetRevisionTracking(prev, nextDraft, {
    timestamp: '2026-11-10T10:05:00.000Z',
  });

  const s1 = tracked.sheets.find((s) => s.id === 'sheet-1')!;
  const s2 = tracked.sheets.find((s) => s.id === 'sheet-2')!;

  assert.equal(getSheetRevisionNumber(s1), 2);
  assert.equal(s1.revisions?.length, 2);
  assert.deepEqual(s1.revisions?.[1].changedAreas, ['devices']);
  assert.ok(s1.revisions?.[1].summary.includes('-QF10'));

  // Sheet 2 must stay at v1 with 1 revision entry
  assert.equal(getSheetRevisionNumber(s2), 1);
  assert.equal(s2.revisions?.length, 1);
});

test('applySheetRevisionTracking coalesces rapid edits when coalesceLast=true without inflating revision number', () => {
  const base = normalizeProjectSheetRevisions(createSeedProject());
  const step1 = applySheetRevisionTracking(base, {
    ...base,
    revision: base.revision + 1,
    sheets: base.sheets.map((s) =>
      s.id === 'sheet-1'
        ? { ...s, titleBlock: { ...s.titleBlock, designer: 'Ива' } }
        : s
    ),
  });
  assert.equal(getSheetRevisionNumber(step1.sheets[0]), 2);

  const step2 = applySheetRevisionTracking(
    step1,
    {
      ...step1,
      revision: step1.revision + 1,
      sheets: step1.sheets.map((s) =>
        s.id === 'sheet-1'
          ? { ...s, titleBlock: { ...s.titleBlock, designer: 'Иванов И.И.' } }
          : s
      ),
    },
    { coalesceLast: true }
  );

  assert.equal(getSheetRevisionNumber(step2.sheets[0]), 2);
  assert.equal(step2.sheets[0].revisions?.length, 2);
  assert.equal(step2.sheets[0].revisions?.[1].snapshot?.titleBlock.designer, 'Иванов И.И.');
});

test('restoreSheetFromRevision reverts only the target sheet content and records a restore revision', () => {
  const base = normalizeProjectSheetRevisions(createSeedProject());
  const origQ1 = base.devices.find((d) => d.id === 'dev-qf1')!;
  const origSheet2Dev = base.devices.find((d) => d.sheetId === 'sheet-2')!;

  const edited = applySheetRevisionTracking(base, {
    ...base,
    revision: base.revision + 1,
    devices: base.devices.map((d) =>
      d.id === origQ1.id
        ? { ...d, designation: '-QF99' }
        : d.id === origSheet2Dev.id
          ? { ...d, designation: '-BT99' }
          : d
    ),
  });

  assert.equal(getSheetRevisionNumber(edited.sheets[0]), 2);
  assert.equal(getSheetRevisionNumber(edited.sheets[1]), 2);

  const restored = restoreSheetFromRevision(edited, 'sheet-1', 1);
  assert.equal(restored.devices.find((d) => d.id === origQ1.id)?.designation, origQ1.designation);
  // Sheet 2 should remain untouched at its edited state
  assert.equal(restored.devices.find((d) => d.id === origSheet2Dev.id)?.designation, '-BT99');
  assert.equal(getSheetRevisionNumber(restored.sheets[0]), 3);
  assert.ok(restored.sheets[0].revisions?.[2].summary.includes('v1'));
});

test('serializeE3Xml and parseE3Xml preserve per-sheet revision numbers and history snapshots', () => {
  const base = normalizeProjectSheetRevisions(createSeedProject());
  const edited = applySheetRevisionTracking(base, {
    ...base,
    revision: base.revision + 1,
    sheets: base.sheets.map((s) =>
      s.id === 'sheet-1'
        ? { ...s, titleBlock: { ...s.titleBlock, checker: 'Смирнов К.А.' } }
        : s
    ),
  });

  const xml = serializeE3Xml(edited);
  const parsed = parseE3Xml(xml);
  assert.equal(getSheetRevisionNumber(parsed.sheets[0]), 2);
  assert.equal(parsed.sheets[0].revisions?.length, 2);
  assert.equal(parsed.sheets[0].revisions?.[1].snapshot?.titleBlock.checker, 'Смирнов К.А.');
  assert.equal(getSheetRevisionNumber(parsed.sheets[1]), 1);
});
