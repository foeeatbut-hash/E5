import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePortableLauncherCmd,
  generatePortableReadme,
  generatePortableSilentVbs,
} from './portableTemplates';

test('generatePortableLauncherCmd configures portable paths, runtime fallback, and Windows COM environment', () => {
  const cmd = generatePortableLauncherCmd();
  assert.ok(cmd.includes('\r\n'));
  assert.ok(cmd.includes('chcp 65001 >nul'));
  assert.ok(cmd.includes('set "FLUX_PORTABLE=1"'));
  assert.ok(cmd.includes('set "FLUX_OPEN_BROWSER=1"'));
  assert.ok(cmd.includes('server.cjs'));
  assert.ok(cmd.includes('https://nodejs.org/dist/v22.14.0/win-x64/node.exe'));
  assert.ok(cmd.includes(':fetch_node'));
  assert.ok(cmd.includes(':run_app'));
});

test('generatePortableSilentVbs and README reference FluxE3_Portable.cmd and project metadata', () => {
  const vbs = generatePortableSilentVbs();
  assert.ok(vbs.includes('FluxE3_Portable.cmd'));
  assert.ok(vbs.includes('WScript.Shell'));

  const readme = generatePortableReadme({
    projectName: 'Щит ПВ1',
    projectCode: 'ВЕЗА-ПВ1-Э3.001',
    revision: 7,
    builtAt: '2026-11-13T06:00:00Z',
    version: '1.0.0-portable',
  });
  assert.ok(readme.includes('Щит ПВ1'));
  assert.ok(readme.includes('ВЕЗА-ПВ1-Э3.001'));
  assert.ok(readme.includes('app\\server.cjs'));
  assert.ok(readme.includes('data\\project.json'));
});
