/**
 * E3ProMax: перенос текущего проекта (data/project.json) в E3.series без сервера и браузера.
 * Генерирует тот же VBS, что кнопка «В E³.series», запускает cscript /silent и печатает краткий итог.
 * Результат (.e3s, лог) копируется в папку output\ проекта.
 *   node node_modules\tsx\dist\cli.mjs scripts\e3RunTransfer.ts [--project data\project.json]
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateE3ComScript } from '../src/core/e3Engine.ts';

const argv = process.argv.slice(2);
const pi = argv.indexOf('--project');
const projPath = resolve(pi >= 0 ? argv[pi + 1] : 'data/project.json');
const raw = JSON.parse(readFileSync(projPath, 'utf8'));
const project = raw.project ?? raw;
const dir = mkdtempSync(join(tmpdir(), 'flux-e3-'));
const vbsPath = join(dir, 'build_e3.vbs');
const vbs = generateE3ComScript(project, 'build').replace(/\r?\n/g, '\r\n');
writeFileSync(vbsPath, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(vbs, 'utf16le')]));
console.log('VBS: ' + vbsPath);
const dec = (b: Buffer | string | undefined) => {
  if (!b) return '';
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b);
  // cscript //U пишет UTF-16LE
  return buf.length > 1 && buf[1] === 0 ? buf.toString('utf16le') : buf.toString('utf8');
};
let consoleOut = '';
try {
  consoleOut = dec(execFileSync('cscript.exe', ['//Nologo', '//U', vbsPath, '/silent'], { timeout: 200000, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] }));
} catch (e) {
  const ex = e as { message?: string; stdout?: Buffer; stderr?: Buffer; status?: number };
  console.log('cscript: код ' + ex.status + ' ' + String(ex.message || '').split('\n')[0]);
  consoleOut = dec(ex.stdout) + '\n' + dec(ex.stderr);
}
if (consoleOut.trim()) {
  const cl = consoleOut.split(/\r?\n/).filter((l) => l.trim() && !/Не удалось записать атрибут/.test(l));
  console.log('--- вывод cscript (последние строки) ---\n' + cl.slice(-25).join('\n'));
}
const logPath = join(dir, 'flux_e3_com_debug.log');
const outDir = resolve('output');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
if (existsSync(logPath)) {
  const buf = readFileSync(logPath);
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString('utf16le') : buf.toString('utf8').replace(/^﻿/, '');
  writeFileSync(join(outDir, 'last_transfer.log'), text, 'utf8');
  const lines = text.split(/\r?\n/);
  const keep = lines.filter((l) => /\[(ERROR|WARN)\]|Итог переноса|E3_BRIDGE_SUMMARY|Режим А|Режим Б|создан ID/.test(l) && !/Не удалось записать атрибут/.test(l));
  console.log(keep.slice(-60).join('\n'));
} else {
  console.log('Лог переноса не найден: ' + logPath);
}
for (const f of readdirSync(dir)) {
  if (/\.(e3s|json)$/i.test(f)) {
    copyFileSync(join(dir, f), join(outDir, f));
    console.log('Скопировано: output\\' + f);
  }
}
