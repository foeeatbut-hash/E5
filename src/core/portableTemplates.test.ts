import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePortableLauncherCmd,
  generatePortableReadme,
  generatePortableSilentVbs,
} from './portableTemplates';

test('generatePortableLauncherCmd configures portable paths, verbose launcher logging, runtime fallback, and Windows COM environment', () => {
  const cmd = generatePortableLauncherCmd();
  assert.ok(cmd.includes('\r\n'));
  assert.ok(cmd.includes('chcp 65001 >nul'));
  assert.ok(cmd.includes('set "FLUX_PORTABLE=1"'));
  assert.ok(cmd.includes('set "FLUX_OPEN_BROWSER=1"'));
  assert.ok(cmd.includes('set "FLUX_DEBUG=1"'));
  assert.ok(cmd.includes('set "FLUX_LOG_DIR=%LOG_DIR%"'));
  assert.ok(cmd.includes('portable-launcher.log'));
  assert.ok(cmd.includes('flux-e3-server.log'));
  assert.ok(cmd.includes('server.cjs'));
  assert.ok(cmd.includes('https://nodejs.org/dist/v22.14.0/win-x64/node.exe'));
  assert.ok(cmd.includes(':fetch_node'));
  assert.ok(cmd.includes(':run_app'));
  assert.ok(cmd.includes(':fail_pause'));
});

test('generatePortableSilentVbs and README reference FluxE3_Portable.cmd, project metadata, and log files', () => {
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
  assert.ok(readme.includes('logs\\portable-launcher.log'));
  assert.ok(readme.includes('logs\\flux-e3-server.log'));
  assert.ok(readme.includes('flux_e3_com_debug.log'));
});
