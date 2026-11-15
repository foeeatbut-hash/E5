import assert from 'node:assert/strict';
import test from 'node:test';
import type { E3Sheet } from './e3Types.ts';
import {
  buildSheetTree,
  createSheetFolderInProject,
  deleteSheetFolderFromProject,
  getAdjacentSheetId,
  getSheetPositionInfo,
  moveSheetToFolderInProject,
  normalizeFolderPath,
  renameSheetFolderInProject,
} from './sheetTree.ts';

function makeSheet(id: string, number: number, name: string, folder?: string): E3Sheet {
  return {
    id,
    number,
    name,
    folder,
    format: 'A3',
    width: 1400,
    height: 920,
    titleBlock: {
      documentCode: 'DOC-1',
      organization: 'Org',
      designer: 'Eng',
      checker: 'Chk',
      sheetTitle: name,
    },
  };
}

test('normalizeFolderPath trims slashes and segments', () => {
  assert.equal(normalizeFolderPath('  /Силовые цепи\\Ввод/  '), 'Силовые цепи/Ввод');
  assert.equal(normalizeFolderPath(''), '');
  assert.equal(normalizeFolderPath(undefined), '');
});

test('buildSheetTree groups sheets into hierarchical folders and root', () => {
  const sheets = [
    makeSheet('s1', 1, 'Ввод'),
    makeSheet('s2', 2, 'Питание 380В', 'Силовые цепи'),
    makeSheet('s3', 3, 'ПЧ вентилятора', 'Силовые цепи/Двигатели'),
    makeSheet('s4', 4, 'Контроллер', 'Автоматика'),
  ];

  const tree = buildSheetTree(sheets, ['Резерв/Запасные']);
  assert.equal(tree.rootSheets.map((s) => s.id).join(','), 's1');
  assert.equal(tree.folders.map((f) => f.name).join(','), 'Автоматика,Резерв,Силовые цепи');

  const power = tree.folders.find((f) => f.path === 'Силовые цепи');
  assert.ok(power);
  assert.equal(power.sheets.map((s) => s.id).join(','), 's2');
  assert.equal(power.children.length, 1);
  assert.equal(power.children[0].path, 'Силовые цепи/Двигатели');
  assert.equal(power.totalSheetCount, 2);

  const reserve = tree.folders.find((f) => f.path === 'Резерв');
  assert.ok(reserve);
  assert.equal(reserve.totalSheetCount, 0);
  assert.equal(reserve.children[0].path, 'Резерв/Запасные');
});

test('folder create, rename, move sheet, and delete folder preserve all sheets safely', () => {
  let sheets = [makeSheet('s1', 1, 'Схема 1'), makeSheet('s2', 2, 'Схема 2')];
  let sheetFolders: string[] = [];

  ({ sheets, sheetFolders } = createSheetFolderInProject(sheets, sheetFolders, 'Силовые/Шкаф 1'));
  assert.ok(sheetFolders.includes('Силовые'));
  assert.ok(sheetFolders.includes('Силовые/Шкаф 1'));

  ({ sheets, sheetFolders } = moveSheetToFolderInProject(sheets, sheetFolders, 's2', 'Силовые/Шкаф 1'));
  assert.equal(sheets.find((s) => s.id === 's2')?.folder, 'Силовые/Шкаф 1');

  ({ sheets, sheetFolders } = renameSheetFolderInProject(sheets, sheetFolders, 'Силовые', 'Силовые цепи'));
  assert.equal(sheets.find((s) => s.id === 's2')?.folder, 'Силовые цепи/Шкаф 1');
  assert.ok(sheetFolders.includes('Силовые цепи/Шкаф 1'));
  assert.ok(!sheetFolders.includes('Силовые'));

  // Deleting nested folder moves contained sheets up to parent without deleting sheets
  ({ sheets, sheetFolders } = deleteSheetFolderFromProject(sheets, sheetFolders, 'Силовые цепи/Шкаф 1'));
  assert.equal(sheets.length, 2);
  assert.equal(sheets.find((s) => s.id === 's2')?.folder, 'Силовые цепи');
  assert.ok(!sheetFolders.includes('Силовые цепи/Шкаф 1'));
});

test('getAdjacentSheetId and getSheetPositionInfo step cleanly across sheets', () => {
  const sheets = [
    makeSheet('s1', 1, 'Лист 1'),
    makeSheet('s2', 2, 'Лист 2'),
    makeSheet('s3', 3, 'Лист 3'),
  ];

  assert.equal(getAdjacentSheetId(sheets, 's1', -1), null);
  assert.equal(getAdjacentSheetId(sheets, 's1', 1), 's2');
  assert.equal(getAdjacentSheetId(sheets, 's2', -1), 's1');
  assert.equal(getAdjacentSheetId(sheets, 's2', 1), 's3');
  assert.equal(getAdjacentSheetId(sheets, 's3', 1), null);

  const info = getSheetPositionInfo(sheets, 's2');
  assert.deepEqual(info, { index: 1, total: 3, prevId: 's1', nextId: 's3' });
});
