import assert from 'node:assert/strict';
import test from 'node:test';
import { parseE3Xml, serializeE3Xml } from './e3Engine.ts';
import { createSeedProject } from './e3Seed.ts';
import { buildGostSheetGeometry } from './gostFrame.ts';
import {
  getReleasedSheetRevisions,
  getSheetRevisionLabel,
  getSheetRevisionNumber,
  hasSheetUncommittedChanges,
  normalizeProjectSheetRevisions,
  releaseSheetRevision,
  restoreSheetFromRevision,
} from './sheetRevisions.ts';

test('normalizeProjectSheetRevisions initializes unreleased base v1 with snapshot on all sheets', () => {
  const seed = createSeedProject();
  const normalized = normalizeProjectSheetRevisions(seed);
  assert.ok(normalized.sheets.length >= 2);
  for (const sheet of normalized.sheets) {
    assert.equal(getSheetRevisionNumber(sheet), 1);
    assert.equal(getSheetRevisionLabel(sheet), 'v1');
    assert.equal(getReleasedSheetRevisions(sheet).length, 0);
    assert.ok(sheet.revisions && sheet.revisions.length === 1);
    assert.ok(sheet.revisions[0].snapshot);
    assert.equal(hasSheetUncommittedChanges(normalized, sheet), false);
  }
});

test('normal drawing edits mark uncommitted changes without auto-releasing a sheet revision', () => {
  const base = normalizeProjectSheetRevisions(createSeedProject(), {
    timestamp: '2026-11-10T10:00:00.000Z',
  });

  const targetDev = base.devices.find((d) => d.sheetId === 'sheet-1');
  assert.ok(targetDev);

  const edited = {
    ...base,
    revision: base.revision + 1,
    updatedAt: '2026-11-10T10:05:00.000Z',
    devices: base.devices.map((d) =>
      d.id === targetDev.id ? { ...d, designation: '-QF10' } : d
    ),
  };

  const s1 = edited.sheets.find((s) => s.id === 'sheet-1')!;
  const s2 = edited.sheets.find((s) => s.id === 'sheet-2')!;

  assert.equal(getSheetRevisionNumber(s1), 1);
  assert.equal(getSheetRevisionLabel(s1), 'v1');
  assert.equal(getReleasedSheetRevisions(s1).length, 0);
  assert.equal(hasSheetUncommittedChanges(edited, s1), true);
  assert.equal(hasSheetUncommittedChanges(edited, s2), false);
});

test('releaseSheetRevision records revision only when stamp Изм. is issued and populates GOST stamp table', () => {
  const base = normalizeProjectSheetRevisions(createSeedProject(), {
    timestamp: '2026-11-10T10:00:00.000Z',
  });

  const edited = {
    ...base,
    revision: base.revision + 1,
    devices: base.devices.map((d) =>
      d.id === 'dev-qf1' ? { ...d, designation: '-QF10' } : d
    ),
  };

  const released = releaseSheetRevision(edited, 'sheet-1', {
    revisionLabel: '1',
    changeDoc: 'ИИ-04',
    changeDate: '13.11.26',
    comment: 'Замена вводного автомата',
    timestamp: '2026-11-13T12:00:00.000Z',
  });

  const s1 = released.sheets.find((s) => s.id === 'sheet-1')!;
  const s2 = released.sheets.find((s) => s.id === 'sheet-2')!;

  assert.equal(getSheetRevisionNumber(s1), 2);
  assert.equal(getSheetRevisionLabel(s1), 'Изм.1');
  assert.equal(s1.titleBlock.izm, '1');
  assert.equal(s1.titleBlock.changeDoc, 'ИИ-04');
  assert.equal(s1.titleBlock.changeDate, '13.11.26');
  assert.equal(getReleasedSheetRevisions(s1).length, 1);
  assert.equal(hasSheetUncommittedChanges(released, s1), false);

  const geom = buildGostSheetGeometry(s1, released);
  const izmCell = geom.stamp.cells.find((c) => c.id === 'f1-chg-izm-0');
  const docCell = geom.stamp.cells.find((c) => c.id === 'f1-chg-doc-0');
  assert.equal(izmCell?.text, '1');
  assert.equal(docCell?.text, 'ИИ-04');

  // Untouched sheet stays unreleased at v1
  assert.equal(getSheetRevisionNumber(s2), 1);
  assert.equal(getSheetRevisionLabel(s2), 'v1');
  assert.equal(getReleasedSheetRevisions(s2).length, 0);
});

test('restoreSheetFromRevision reverts target sheet snapshot without creating a phantom revision', () => {
  const base = normalizeProjectSheetRevisions(createSeedProject());
  const origQ1 = base.devices.find((d) => d.id === 'dev-qf1')!;
  const origSheet2Dev = base.devices.find((d) => d.sheetId === 'sheet-2')!;

  const draft = {
    ...base,
    revision: base.revision + 1,
    devices: base.devices.map((d) =>
      d.id === origQ1.id
        ? { ...d, designation: '-QF99' }
        : d.id === origSheet2Dev.id
          ? { ...d, designation: '-BT99' }
          : d
    ),
  };

  const released = releaseSheetRevision(draft, 'sheet-1', {
    revisionLabel: '1',
    changeDoc: 'ИИ-01',
    changeDate: '13.11.26',
  });
  assert.equal(released.sheets[0].revisions?.length, 2);

  const restored = restoreSheetFromRevision(released, 'sheet-1', 1);
  assert.equal(restored.devices.find((d) => d.id === origQ1.id)?.designation, origQ1.designation);
  // Sheet 2 remains untouched at its edited state
  assert.equal(restored.devices.find((d) => d.id === origSheet2Dev.id)?.designation, '-BT99');
  // Restored revision number matches v1 without fabricating a phantom v3 entry
  assert.equal(getSheetRevisionNumber(restored.sheets[0]), 1);
  assert.equal(getSheetRevisionLabel(restored.sheets[0]), 'v1');
  assert.equal(restored.sheets[0].revisions?.length, 2);

  // Subsequent normalizeProjectSheetRevisions calls (e.g. on later unrelated edits) must preserve v1
  const normalizedAfterRestore = normalizeProjectSheetRevisions(restored);
  assert.equal(getSheetRevisionNumber(normalizedAfterRestore.sheets[0]), 1);
  assert.equal(getSheetRevisionLabel(normalizedAfterRestore.sheets[0]), 'v1');
  assert.equal(hasSheetUncommittedChanges(normalizedAfterRestore, normalizedAfterRestore.sheets[0]), false);
});

test('serializeE3Xml and parseE3Xml preserve stamp revision metadata and released sheet history', () => {
  const base = normalizeProjectSheetRevisions(createSeedProject());
  const released = releaseSheetRevision(
    {
      ...base,
      sheets: base.sheets.map((s) =>
        s.id === 'sheet-1'
          ? { ...s, titleBlock: { ...s.titleBlock, checker: 'Смирнов К.А.' } }
          : s
      ),
    },
    'sheet-1',
    {
      revisionLabel: 'А',
      changeDoc: 'ИИ-12',
      changeDate: '13.11.26',
      comment: 'Выпуск в производство',
    }
  );

  const xml = serializeE3Xml(released);
  const parsed = parseE3Xml(xml);
  const s1 = parsed.sheets[0];
  assert.equal(getSheetRevisionNumber(s1), 2);
  assert.equal(getSheetRevisionLabel(s1), 'Изм.А');
  assert.equal(s1.titleBlock.izm, 'А');
  assert.equal(s1.titleBlock.changeDoc, 'ИИ-12');
  assert.equal(s1.titleBlock.changeDate, '13.11.26');
  assert.equal(s1.revisions?.length, 2);
  assert.equal(s1.revisions?.[1].released, true);
  assert.equal(s1.revisions?.[1].revisionLabel, 'А');
  assert.equal(s1.revisions?.[1].snapshot?.titleBlock.checker, 'Смирнов К.А.');
  assert.equal(getSheetRevisionNumber(parsed.sheets[1]), 1);
});
