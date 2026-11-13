import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import JSZip from 'jszip';
import { E3_CATALOG } from './src/core/e3Catalog.ts';
import {
  buildBom,
  buildCableJournal,
  buildTerminalPlan,
  encodeUtf16LeWithBom,
  exportBomCsv,
  exportToDxf,
  exportToFluxBridge,
  generateE3ComScript,
  generateWindowsBridgeCmd,
  importFromFluxBridge,
  nextUniqueDesignation,
  parseE3Xml,
  parseVisualSettings,
  runErc,
  serializeE3Xml,
} from './src/core/e3Engine.ts';
import { buildOle2E3sContainer, parseE3sInput } from './src/core/e3SFormat.ts';
import { createSeedProject } from './src/core/e3Seed.ts';
import type { E3Device, E3Project } from './src/core/e3Types.ts';
import { diagLogger } from './src/server/diagLogger.ts';
import {
  buildPortableDistribution,
  getCachedPortableBuild,
  PortableBuildError,
} from './src/server/portablePackager.ts';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.text({ type: ['application/xml', 'text/xml', 'text/plain'], limit: '25mb' }));

process.on('uncaughtException', (err) => {
  diagLogger.log('ERROR', 'SERVER', `UncaughtException: ${err.message}`, {
    details: err.stack || String(err),
  });
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack || msg : String(reason);
  diagLogger.log('ERROR', 'SERVER', `UnhandledRejection: ${msg}`, { details: stack });
});

function loadInitialProject(): E3Project {
  const candidates = [
    process.env.FLUX_DATA_DIR ? path.join(process.env.FLUX_DATA_DIR, 'project.json') : '',
    path.resolve(process.cwd(), 'seed-project.json'),
    path.resolve(process.cwd(), 'app', 'seed-project.json'),
  ].filter(Boolean);

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as E3Project;
        if (raw?.id && Array.isArray(raw.devices)) {
          diagLogger.log('INFO', 'SERVER', `Загружен проект из файла: ${filePath}`, {
            details: `projectCode=${raw.projectCode}, revision=${raw.revision}, devices=${raw.devices.length}, wires=${raw.wires?.length || 0}`,
          });
          return raw;
        }
      }
    } catch (err) {
      diagLogger.log('WARN', 'SERVER', `Ошибка чтения снимка проекта ${filePath}`, {
        details: err instanceof Error ? err.stack || err.message : String(err),
      });
    }
  }
  const def = createSeedProject();
  diagLogger.log('INFO', 'SERVER', `Загружен встроенный стартовый проект ${def.projectCode} (rev ${def.revision}).`);
  return def;
}

function persistPortableProject(project: E3Project) {
  if (!process.env.FLUX_DATA_DIR) return;
  const targetFile = path.join(process.env.FLUX_DATA_DIR, 'project.json');
  try {
    fs.mkdirSync(process.env.FLUX_DATA_DIR, { recursive: true });
    fs.writeFileSync(targetFile, JSON.stringify(project, null, 2), 'utf8');
  } catch (err) {
    diagLogger.log('ERROR', 'PORTABLE', `Не удалось сохранить ${targetFile}`, {
      details: err instanceof Error ? err.stack || err.message : String(err),
    });
  }
}

// In-memory active projects store seeded from portable disk data, embedded seed, or default ЩУ-ПВ1 model
const projects = new Map<string, E3Project>();
const seed = loadInitialProject();
projects.set(seed.id, seed);
let activeProjectId = seed.id;

// Connected SSE real-time sync clients
const sseClients = new Set<express.Response>();

function broadcastSseEvent(eventObj: Record<string, unknown>) {
  const payload = JSON.stringify(eventObj);
  for (const res of sseClients) {
    res.write(`data: ${payload}\n\n`);
  }
}

diagLogger.subscribe((entry) => {
  broadcastSseEvent({ type: 'server-diag-log', entry });
});

function broadcastUpdate(project: E3Project, source: string, sender = 'server') {
  persistPortableProject(project);
  broadcastSseEvent({
    type: 'project-update',
    source,
    sender,
    revision: project.revision,
    project,
  });
}

// Embedded E3.series Windows Bridge queue (for local Win32 execution or outbound Windows connector)
interface E3BridgeJob {
  jobId: string;
  projectId: string;
  projectCode: string;
  mode: 'build' | 'export';
  script: string;
  createdAt: number;
}
const bridgeState = {
  connectedHost: null as string | null,
  lastPollAt: 0,
};
const e3JobQueue: E3BridgeJob[] = [];

function isBridgeOnline(): boolean {
  return Date.now() - bridgeState.lastPollAt < 12000;
}

function getOrDefaultProject(id?: string): E3Project {
  if (!id || id === 'current') {
    return projects.get(activeProjectId) || projects.values().next().value!;
  }
  if (projects.has(id)) return projects.get(id)!;
  return projects.get(activeProjectId) || projects.values().next().value!;
}

const CYR_MAP: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z', И: 'I', Й: 'Y',
  К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F',
  Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sch', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function setDownloadDisposition(res: express.Response, filename: string) {
  const asciiFallback = filename
    .split('')
    .map((ch) => CYR_MAP[ch] ?? ch)
    .join('')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`
  );
}

// ----------------------------------------------------------------------------
// Real-time SSE Synchronization Stream
// ----------------------------------------------------------------------------
app.get('/api/sync/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  sseClients.add(res);
  res.write(`data: ${JSON.stringify({ type: 'connected', projectsCount: projects.size })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ----------------------------------------------------------------------------
// Workflow Automation REST API (/api/v1/*)
// ----------------------------------------------------------------------------
app.get('/api/v1/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'flux-e3-ecad',
    portable: process.env.FLUX_PORTABLE === '1',
    isWin32: process.platform === 'win32',
    activeClients: sseClients.size,
    projects: projects.size,
  });
});

app.get('/api/v1/projects', (_req, res) => {
  res.json(
    Array.from(projects.values()).map((p) => ({
      id: p.id,
      name: p.name,
      projectCode: p.projectCode,
      fluxProjectKey: p.fluxProjectKey,
      revision: p.revision,
      devicesCount: p.devices.length,
      wiresCount: p.wires.length,
      updatedAt: p.updatedAt,
    }))
  );
});

app.get('/api/v1/projects/:id', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  res.json(proj);
});

app.put('/api/v1/projects/:id', (req, res) => {
  const incoming = req.body as E3Project;
  if (!incoming || !incoming.id || !Array.isArray(incoming.devices)) {
    res.status(400).json({ error: 'Invalid E3Project payload' });
    return;
  }
  projects.set(incoming.id, incoming);
  activeProjectId = incoming.id;
  const sender = String(req.headers['x-flux-client'] || 'api');
  broadcastUpdate(incoming, 'client-sync', sender);
  res.json({ ok: true, revision: incoming.revision });
});

app.post('/api/v1/projects/:id/devices', (req, res) => {
  const proj = structuredClone(getOrDefaultProject(req.params.id));
  const body = req.body || {};
  const cat = E3_CATALOG.find((c) => c.article === body.article) || E3_CATALOG[2];
  const sheetId = body.sheetId || proj.sheets[0]?.id || 'sheet-1';
  const idx = proj.devices.length + 1;
  const id = `dev-api-${Date.now()}`;
  const newDevice: E3Device = {
    id,
    elementId: body.elementId || `el-api-${Date.now().toString(36)}`,
    designation: body.designation || nextUniqueDesignation(proj.devices, cat.defaultPrefix),
    componentName: body.componentName || cat.componentName,
    article: body.article || cat.article,
    manufacturer: body.manufacturer || cat.manufacturer,
    category: cat.category,
    sheetId,
    x: Number(body.x ?? 180 + ((idx * 130) % 780)),
    y: Number(body.y ?? 540),
    rotation: 0,
    width: cat.width,
    height: cat.height,
    e3BlockName: cat.e3BlockName,
    bindingState: 'PLACED',
    pins: cat.pins.map((p, pIdx) => ({ ...p, id: `${id}-p${pIdx + 1}` })),
    attributes: structuredClone(cat.defaultAttributes),
  };
  proj.devices.push(newDevice);
  proj.revision += 1;
  proj.updatedAt = new Date().toISOString();
  projects.set(proj.id, proj);
  activeProjectId = proj.id;
  broadcastUpdate(proj, 'REST API POST /devices', 'api');
  res.status(201).json({ ok: true, device: newDevice, project: proj });
});

app.patch('/api/v1/projects/:id/visual-settings', (req, res) => {
  try {
    const proj = structuredClone(getOrDefaultProject(req.params.id));
    proj.visualSettings = parseVisualSettings(JSON.stringify(req.body));
    proj.revision += 1;
    proj.updatedAt = new Date().toISOString();
    projects.set(proj.id, proj);
    activeProjectId = proj.id;
    broadcastUpdate(proj, 'REST API PATCH /visual-settings', 'api');
    res.json({ ok: true, visualSettings: proj.visualSettings });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Bad visual settings' });
  }
});

app.get('/api/v1/projects/:id/bom', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  const bom = buildBom(proj);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    setDownloadDisposition(res, `${proj.projectCode}-PE3.csv`);
    res.send(exportBomCsv(bom));
    return;
  }
  res.json({ projectCode: proj.projectCode, revision: proj.revision, bom });
});

app.get('/api/v1/projects/:id/cables', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  res.json({ cables: buildCableJournal(proj), terminals: buildTerminalPlan(proj) });
});

app.get('/api/v1/projects/:id/erc', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  const issues = runErc(proj);
  res.json({ issues, errors: issues.filter((i) => i.severity === 'error').length });
});

app.get('/api/v1/projects/:id/export/e3s', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  if (req.query.format === 'xml') {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    setDownloadDisposition(res, `${proj.projectCode}-xml.e3s`);
    res.send(serializeE3Xml(proj));
    return;
  }
  const ole2 = buildOle2E3sContainer(proj);
  res.setHeader('Content-Type', 'application/x-e3s');
  setDownloadDisposition(res, `${proj.projectCode}.e3s`);
  res.send(Buffer.from(ole2));
});

app.get('/api/v1/projects/:id/export/e3vbs', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  const mode = req.query.mode === 'export' ? 'export' : 'build';
  const script = generateE3ComScript(proj, mode);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  setDownloadDisposition(
    res,
    mode === 'export' ? `${proj.projectCode}_e3_to_flux.vbs` : `${proj.projectCode}_open_in_e3.vbs`
  );
  if (req.query.encoding === 'utf16') {
    res.send(Buffer.from(encodeUtf16LeWithBom(script)));
    return;
  }
  res.send(script);
});

// ----------------------------------------------------------------------------
// Embedded E3.series 2022 COM Bridge Endpoints (Local Win32 + Remote Connector)
// ----------------------------------------------------------------------------
app.get('/api/v1/e3-bridge/status', (_req, res) => {
  res.json({
    platform: process.platform,
    isWin32: process.platform === 'win32',
    bridgeConnected: isBridgeOnline(),
    bridgeHost: bridgeState.connectedHost,
    lastPollAt: bridgeState.lastPollAt,
    pendingJobs: e3JobQueue.length,
  });
});

app.get('/api/v1/e3-bridge/connector.cmd', (req, res) => {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`);
  const origin = `${proto}://${host}`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  setDownloadDisposition(res, 'E3ProMax_Connector.cmd');
  res.send(generateWindowsBridgeCmd(origin));
});

app.get('/api/v1/diagnostics/logs', (_req, res) => {
  res.json({
    ok: true,
    logFilePath: diagLogger.getLogFilePath(),
    serverInfo: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cwd: process.cwd(),
      portable: process.env.FLUX_PORTABLE === '1',
      pid: process.pid,
    },
    entries: diagLogger.getEntries(),
  });
});

app.get('/api/v1/diagnostics/logs/download', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  setDownloadDisposition(res, `e3promax-diag-${Date.now()}.log`);
  res.send(diagLogger.formatPlainTextReport());
});

app.get('/api/v1/e3-bridge/poll', (req, res) => {
  const hostName = String(req.query.host || 'WINDOWS-E3');
  const wasOnline = isBridgeOnline();
  bridgeState.connectedHost = hostName;
  bridgeState.lastPollAt = Date.now();
  if (!wasOnline) {
    diagLogger.log('SYNC', 'E3-COM', `Подключился Windows-коннектор моста E³.series: ${hostName}`);
    broadcastSseEvent({ type: 'e3-bridge-status', bridgeConnected: true, bridgeHost: hostName });
  }
  const job = e3JobQueue.shift() || null;
  res.json({ job });
});

app.post('/api/v1/e3-bridge/ack', (req, res) => {
  const { jobId, host, ok, message, exportedJson } = req.body || {};
  if (exportedJson) {
    try {
      const parsed = typeof exportedJson === 'string' ? JSON.parse(exportedJson) : exportedJson;
      if (parsed?.format === 'flux-e3-bridge/v1') {
        const base = getOrDefaultProject();
        const merged = importFromFluxBridge(parsed, base);
        projects.set(merged.id, merged);
        activeProjectId = merged.id;
        broadcastUpdate(merged, `E³.series (${host || 'ПК'})`, 'e3-bridge');
      }
    } catch (err) {
      diagLogger.log('ERROR', 'E3-COM', `Ошибка разбора exportedJson от ${host || 'ПК'}`, {
        details: err instanceof Error ? err.stack || err.message : String(err),
      });
    }
  }
  diagLogger.log(
    ok ? 'INFO' : 'ERROR',
    'E3-COM',
    `Результат задания ${jobId || '?'} от ПК ${host || bridgeState.connectedHost || 'Windows'} (${ok ? 'OK' : 'FAIL'})`,
    { details: String(message || '') }
  );
  broadcastSseEvent({
    type: 'e3-bridge-log',
    jobId,
    host: host || bridgeState.connectedHost || 'ПК',
    ok: Boolean(ok),
    message: String(message || (ok ? 'Выполнено в E³.series.' : 'Ошибка выполнения COM-скрипта.')),
  });
  res.json({ ok: true });
});

function decodeWindowsOutput(buf: Buffer | string | undefined): string {
  if (!buf) return '';
  if (typeof buf === 'string') return buf.replace(/^\uFEFF/, '');
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le').replace(/^\uFEFF/, '');
  }
  // Heuristic: UTF-16LE without BOM has zero high bytes for ASCII timestamps "[2026-"
  if (buf.length >= 4 && buf[1] === 0x00 && buf[3] === 0x00) {
    return buf.toString('utf16le').replace(/^\uFEFF/, '');
  }
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}

function readTraceLogFile(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath);
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return raw.subarray(2).toString('utf16le').replace(/^\uFEFF/, '');
  }
  if (raw.length >= 4 && raw[1] === 0x00 && raw[3] === 0x00) {
    return raw.toString('utf16le').replace(/^\uFEFF/, '');
  }
  return raw.toString('utf8').replace(/^\uFEFF/, '');
}

function execCscriptUnicode(
  vbsPath: string,
  extraArgs: string[] = []
): Promise<{ err: Error | null; stdout: string; stderr: string; traceLog: string; fullOut: string; durationMs: number }> {
  return new Promise((resolve) => {
    const tmpDir = path.dirname(vbsPath);
    const t0 = performance.now();
    execFile(
      'cscript.exe',
      ['//Nologo', '//U', vbsPath, '/silent', ...extraArgs],
      { timeout: 45000, encoding: 'buffer', maxBuffer: 10 * 1024 * 1024 },
      (err, stdoutBuf, stderrBuf) => {
        const dt = Math.round((performance.now() - t0) * 100) / 100;
        const stdout = decodeWindowsOutput(stdoutBuf as unknown as Buffer).trim();
        const stderr = decodeWindowsOutput(stderrBuf as unknown as Buffer).trim();
        const traceLog = readTraceLogFile(path.join(tmpDir, 'flux_e3_com_debug.log')).trim();
        const fullOut = [traceLog || stdout, stderr].filter(Boolean).join('\n--- STDERR ---\n');
        resolve({ err: err as Error | null, stdout, stderr, traceLog, fullOut, durationMs: dt });
      }
    );
  });
}

app.post('/api/v1/projects/:id/e3-direct-open', async (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  const mode = req.body?.mode === 'export' ? 'export' : 'build';
  const script = generateE3ComScript(proj, mode);

  if (process.platform === 'win32') {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-e3-'));
    const vbsPath = path.join(tmpDir, `${mode}_e3.vbs`);
    fs.writeFileSync(vbsPath, Buffer.from(encodeUtf16LeWithBom(script)));
    diagLogger.log('INFO', 'E3-COM', `Запуск cscript.exe //Nologo //U "${vbsPath}" /silent`);
    const result = await execCscriptUnicode(vbsPath);
    if (result.err) {
      diagLogger.log('ERROR', 'E3-COM', `Сбой локального cscript.exe (${result.err.message})`, {
        durationMs: result.durationMs,
        details: result.fullOut || result.err.stack || result.err.message,
      });
      broadcastSseEvent({
        type: 'e3-bridge-log',
        host: os.hostname(),
        ok: false,
        message: result.stderr || result.err.message,
      });
      res.json({
        ok: false,
        execution: 'local-win32-error',
        error: result.stderr || result.err.message,
        details: result.fullOut,
        script,
      });
      return;
    }
    diagLogger.log('SYNC', 'E3-COM', `Локальный Win32 COM выполнен (${mode})`, {
      durationMs: result.durationMs,
      details: result.fullOut,
    });
    if (mode === 'export') {
      const expPath = path.join(tmpDir, 'flux_e3_export.json');
      if (fs.existsSync(expPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(expPath, 'utf8').replace(/^\uFEFF/, ''));
          const merged = importFromFluxBridge(parsed, proj);
          projects.set(merged.id, merged);
          activeProjectId = merged.id;
          broadcastUpdate(merged, 'Локальный E³.series (Win32 COM)', 'e3-bridge');
        } catch (expErr) {
          diagLogger.log('ERROR', 'E3-COM', 'Ошибка импорта flux_e3_export.json', {
            details: expErr instanceof Error ? expErr.stack || expErr.message : String(expErr),
          });
        }
      }
    }
    res.json({
      ok: true,
      execution: 'local-win32',
      host: os.hostname(),
      output: result.fullOut,
    });
    return;
  }

  if (isBridgeOnline()) {
    const jobId = `job-${Date.now()}`;
    e3JobQueue.push({
      jobId,
      projectId: proj.id,
      projectCode: proj.projectCode,
      mode,
      script,
      createdAt: Date.now(),
    });
    diagLogger.log('SYNC', 'E3-COM', `Задание ${jobId} (${mode}) поставлено в очередь для ${bridgeState.connectedHost}`);
    res.json({
      ok: true,
      execution: 'remote-connector',
      jobId,
      host: bridgeState.connectedHost,
    });
    return;
  }

  diagLogger.log(
    'INFO',
    'E3-COM',
    `COM-вызов (${mode}) не выполнен напрямую: сервер на ${process.platform}, локальный ПК-коннектор не подключён.`
  );
  res.json({
    ok: false,
    execution: 'needs-connector',
    platform: process.platform,
    script,
  });
});

app.post('/api/v1/projects/:id/import/e3s', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  try {
    const rawFilename = String(req.query.filename || req.headers['x-flux-filename'] || 'imported.e3s');
    const safeBaseName = path.basename(rawFilename).replace(/[<>:"/\\|?*]+/g, '_') || 'imported.e3s';
    const raw = Buffer.isBuffer(req.body)
      ? new Uint8Array(req.body)
      : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || {});

    const parsed = await parseE3sInput(raw, rawFilename);
    diagLogger.log(
      'INFO',
      'E3-XML',
      `Импорт файла ${rawFilename}: kind=${parsed.sourceKind}, потоков=${parsed.discoveredStreams.length}, устройств=${parsed.project.devices.length}`,
      { details: `Потоки: [${parsed.discoveredStreams.join(', ')}]` }
    );

    // If native Zuken binary .e3s on Windows, try reading full schematic directly via E3.series COM API
    if (parsed.sourceKind === 'e3s-ole2-native' && process.platform === 'win32' && raw instanceof Uint8Array) {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-e3-imp-'));
      const tempE3sPath = path.join(tmpDir, safeBaseName.endsWith('.e3s') ? safeBaseName : `${safeBaseName}.e3s`);
      fs.writeFileSync(tempE3sPath, Buffer.from(raw));
      const comScript = generateE3ComScript(undefined, 'export', tempE3sPath);
      const vbsPath = path.join(tmpDir, 'import_e3s.vbs');
      fs.writeFileSync(vbsPath, Buffer.from(encodeUtf16LeWithBom(comScript)));
      diagLogger.log('INFO', 'E3-COM', `Попытка прямого чтения нативного .e3s через COM: "${tempE3sPath}"`);
      const comRes = await execCscriptUnicode(vbsPath);
      const expPath = path.join(tmpDir, 'flux_e3_export.json');
      if (!comRes.err && fs.existsSync(expPath)) {
        try {
          const comJson = JSON.parse(fs.readFileSync(expPath, 'utf8').replace(/^\uFEFF/, ''));
          const merged = importFromFluxBridge(comJson, parsed.project);
          merged.projectCode = safeBaseName.replace(/\.e3s$/i, '');
          projects.set(merged.id, merged);
          activeProjectId = merged.id;
          diagLogger.log(
            'SYNC',
            'E3-COM',
            `Нативный .e3s прочитан через E³.series COM: листов=${merged.sheets.length}, изделий=${merged.devices.length}, цепей=${merged.wires.length}`,
            { durationMs: comRes.durationMs, details: comRes.fullOut }
          );
          broadcastUpdate(merged, `E³.series COM (${safeBaseName})`, 'e3-bridge');
          res.json({
            ok: true,
            sourceKind: 'e3s-com-native',
            discoveredStreams: parsed.discoveredStreams,
            comLog: comRes.fullOut,
            project: merged,
          });
          return;
        } catch (comParseErr) {
          diagLogger.log('WARN', 'E3-COM', 'Ошибка разбора JSON от E³.series COM, используем OLE2-резерв', {
            details: `${comParseErr instanceof Error ? comParseErr.message : String(comParseErr)}\n${comRes.fullOut}`,
          });
        }
      } else {
        diagLogger.log(
          'WARN',
          'E3-COM',
          `E³.series COM не смог открыть "${safeBaseName}" напрямую — загружена модель из потоков OLE2/zlib`,
          { durationMs: comRes.durationMs, details: comRes.fullOut || comRes.err?.message || '' }
        );
      }
    }

    projects.set(parsed.project.id, parsed.project);
    activeProjectId = parsed.project.id;
    broadcastUpdate(parsed.project, `REST API POST /import/e3s (${parsed.sourceKind})`, 'api');
    res.json({ ok: true, sourceKind: parsed.sourceKind, discoveredStreams: parsed.discoveredStreams, project: parsed.project });
  } catch (err) {
    diagLogger.log('ERROR', 'E3-XML', `Ошибка импорта .e3s: ${err instanceof Error ? err.message : String(err)}`, {
      details: err instanceof Error ? err.stack || err.message : String(err),
    });
    res.status(400).json({ error: err instanceof Error ? err.message : 'E3S parse error' });
  }
});

app.get('/api/v1/projects/:id/export/e3xml', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  setDownloadDisposition(res, `${proj.projectCode}.e3s`);
  res.send(serializeE3Xml(proj));
});

app.post('/api/v1/projects/:id/import/e3xml', (req, res) => {
  try {
    const xmlText = typeof req.body === 'string' ? req.body : String(req.body?.xml || '');
    const imported = parseE3Xml(xmlText);
    projects.set(imported.id, imported);
    activeProjectId = imported.id;
    broadcastUpdate(imported, 'REST API POST /import/e3xml', 'api');
    res.json({ ok: true, project: imported });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'XML parse error' });
  }
});

app.get('/api/v1/projects/:id/export/dxf', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  const sheetId = typeof req.query.sheetId === 'string' ? req.query.sheetId : undefined;
  res.setHeader('Content-Type', 'application/dxf; charset=utf-8');
  setDownloadDisposition(res, `${proj.projectCode}.dxf`);
  res.send(exportToDxf(proj, sheetId));
});

app.get('/api/v1/projects/:id/export/flux-bridge', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  res.json(exportToFluxBridge(proj));
});

// ----------------------------------------------------------------------------
// Flux Studio Subprogram Package (.zip) & Full Codebase Export (.zip)
// ----------------------------------------------------------------------------
app.get('/api/export/flux-studio', async (req, res) => {
  try {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const proj = getOrDefaultProject(projectId);
    const zip = new JSZip();

    const manifest = {
      id: 'e3promax-ecad',
      name: 'E3ProMax — САПР электросхем',
      version: '1.0.0',
      author: proj.author || 'Инженер КИП',
      contractVersion: 2,
      ui: 'page',
      logic: 'logic/main.ts',
      store: {
        category: 'e3',
        summary: 'Редактор электросхем, авто-спецификаций ПЭ3, кабельных журналов и двусторонней синхронизации E3.series.',
        requires: { flux: '1.21.0' },
      },
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
    zip.file(
      'logic/main.ts',
      `// Логика подпрограммы Flux Studio для синхронизации E3.series и расчёта спецификации ПЭ3\nexport function compute(input: any) {\n  return { state: input?.state || {}, calc: { out: { ready: true } } };\n}\n`
    );

    const distHtmlPath = path.resolve(process.cwd(), 'dist', 'index.html');
    if (fs.existsSync(distHtmlPath)) {
      const distDir = path.resolve(process.cwd(), 'dist');
      const addDir = (dir: string, prefix: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) addDir(full, `${prefix}${entry.name}/`);
          else zip.file(`${prefix}${entry.name}`, fs.readFileSync(full));
        }
      };
      addDir(distDir, 'ui/');
    } else {
      zip.file(
        'ui/index.html',
        `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>E3ProMax</title><link rel="stylesheet" href="/_flux/flux-ui.v1.css"></head><body class="fx-body"><main class="fx-stack"><h1 class="fx-title">E3ProMax — ${proj.name}</h1><p class="fx-muted">Соберите проект (npm run build) перед публикацией для включения полного SPA в ui/ или откройте приложенную модель.</p><pre id="model" class="fx-card"></pre></main><script src="/_flux/flux.v1.js"></script><script src="/ui/app.js"></script></body></html>`
      );
      zip.file(
        'ui/app.js',
        `const model = ${JSON.stringify(exportToFluxBridge(proj), null, 2)};\ndocument.getElementById('model').textContent = JSON.stringify({ project: model.projectName, nodes: model.nodes.length, wires: model.wires.length }, null, 2);\n`
      );
    }

    zip.file('e3-seed-model.e3s', Buffer.from(buildOle2E3sContainer(proj)));
    zip.file('e3-seed-model.xml', serializeE3Xml(proj));
    zip.file('e3-bridge.json', JSON.stringify(exportToFluxBridge(proj), null, 2));
    zip.file('e3-series-2022-sync.vbs', Buffer.from(encodeUtf16LeWithBom(generateE3ComScript(proj))));
    zip.file('E3ProMax_Connector.cmd', generateWindowsBridgeCmd(`http://localhost:${PORT}`));

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="e3promax-studio-module.zip"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Zip error' });
  }
});

app.get('/api/export/codebase', async (_req, res) => {
  try {
    const zip = new JSZip();
    const root = process.cwd();
    const includeFiles = [
      'package.json',
      'tsconfig.json',
      'vite.config.ts',
      'index.html',
      'metadata.json',
      'server.ts',
    ];
    for (const f of includeFiles) {
      const full = path.join(root, f);
      if (fs.existsSync(full)) zip.file(f, fs.readFileSync(full));
    }

    const walkSrc = (dir: string, prefix: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walkSrc(full, `${prefix}${entry.name}/`);
        else zip.file(`${prefix}${entry.name}`, fs.readFileSync(full));
      }
    };
    walkSrc(path.join(root, 'src'), 'src/');

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="e3promax-codebase.zip"');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Codebase zip error' });
  }
});

// ----------------------------------------------------------------------------
// On-Demand Portable Windows Build (.zip with compiled Vite SPA + server.cjs)
// ----------------------------------------------------------------------------
app.post('/api/build/portable', async (req, res) => {
  try {
    const incomingProject = req.body?.project as E3Project | undefined;
    let targetProject = getOrDefaultProject(typeof req.body?.projectId === 'string' ? req.body.projectId : undefined);
    if (incomingProject && incomingProject.id && Array.isArray(incomingProject.devices)) {
      projects.set(incomingProject.id, incomingProject);
      activeProjectId = incomingProject.id;
      targetProject = incomingProject;
    }

    diagLogger.log('INFO', 'PORTABLE', `Запущена сборка Portable для ${targetProject.projectCode} (rev ${targetProject.revision})...`);
    const artifact = await buildPortableDistribution(targetProject);
    diagLogger.log(
      'INFO',
      'PORTABLE',
      `Portable-сборка готова: ${artifact.filename} (${Math.round(artifact.zipBytes / 1024)} КБ)`,
      {
        durationMs: artifact.durationMs,
        details: artifact.buildLogs.join('\n'),
      }
    );

    broadcastSseEvent({
      type: 'portable-built',
      buildId: artifact.buildId,
      filename: artifact.filename,
      durationMs: artifact.durationMs,
      zipBytes: artifact.zipBytes,
      revision: artifact.revision,
    });

    res.json({
      ok: true,
      buildId: artifact.buildId,
      filename: artifact.filename,
      builtAt: artifact.builtAt,
      durationMs: artifact.durationMs,
      uiFilesCount: artifact.uiFilesCount,
      serverBytes: artifact.serverBytes,
      zipBytes: artifact.zipBytes,
      projectCode: artifact.projectCode,
      revision: artifact.revision,
      stages: artifact.stages,
      buildLogs: artifact.buildLogs,
      downloadUrl: `/api/build/portable/${encodeURIComponent(artifact.buildId)}/download`,
    });
  } catch (err) {
    const buildLogs = err instanceof PortableBuildError ? err.buildLogs : [];
    const stack = err instanceof PortableBuildError ? err.stackTrace : err instanceof Error ? err.stack || err.message : String(err);
    const msg = err instanceof Error ? err.message : 'Ошибка сборки Portable-версии';
    diagLogger.log('ERROR', 'PORTABLE', `Ошибка сборки Portable: ${msg}`, {
      details: [...buildLogs, '--- STACK ---', stack].join('\n'),
    });
    res.status(500).json({
      ok: false,
      error: msg,
      buildLogs,
      stack,
    });
  }
});

app.get('/api/build/portable/:buildId/download', (req, res) => {
  const artifact = getCachedPortableBuild(req.params.buildId);
  if (!artifact) {
    res.status(404).json({ error: 'Сборка устарела или не найдена. Запустите сборку повторно.' });
    return;
  }
  res.setHeader('Content-Type', 'application/zip');
  setDownloadDisposition(res, artifact.filename);
  res.send(artifact.buffer);
});

app.get('/api/export/portable', async (req, res) => {
  try {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const proj = getOrDefaultProject(projectId);
    const artifact = await buildPortableDistribution(proj);
    res.setHeader('Content-Type', 'application/zip');
    setDownloadDisposition(res, artifact.filename);
    res.send(artifact.buffer);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Portable export error' });
  }
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  diagLogger.log('ERROR', 'SERVER', `HTTP ${req.method} ${req.originalUrl}: ${err.message}`, {
    details: err.stack || err.message,
  });
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

function resolveDistDir(): string {
  const cwdDist = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(path.join(cwdDist, 'index.html'))) return cwdDist;
  const appDist = path.resolve(process.cwd(), 'app', 'dist');
  if (fs.existsSync(path.join(appDist, 'index.html'))) return appDist;
  return cwdDist;
}

function listenWithFallback(preferredPort: number): Promise<number> {
  const maxOffset = process.env.FLUX_PORTABLE === '1' ? 20 : 0;
  return new Promise((resolve, reject) => {
    const tryListen = (offset: number) => {
      const candidate = preferredPort + offset;
      const srv = app.listen(candidate, '0.0.0.0', () => {
        resolve(candidate);
      });
      srv.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && offset < maxOffset) {
          diagLogger.log('WARN', 'PORTABLE', `Порт ${candidate} занят, пробуем ${candidate + 1}...`);
          tryListen(offset + 1);
        } else {
          reject(err);
        }
      });
    };
    tryListen(0);
  });
}

async function start() {
  let distDir = '';
  if (process.env.NODE_ENV === 'production') {
    distDir = resolveDistDir();
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const actualPort = await listenWithFallback(PORT);
  const localUrl = `http://127.0.0.1:${actualPort}`;
  diagLogger.log('INFO', 'SERVER', `Сервер E3ProMax запущен на ${localUrl}`, {
    details: [
      `Node=${process.version}, Platform=${process.platform}/${process.arch}, PID=${process.pid}`,
      `Mode=${process.env.NODE_ENV || 'development'}, Portable=${process.env.FLUX_PORTABLE === '1' ? 'YES' : 'NO'}`,
      `CWD=${process.cwd()}`,
      `DistDir=${distDir || '(Vite HMR middleware)'}`,
      `DataDir=${process.env.FLUX_DATA_DIR || '(in-memory)'}`,
      `LogFile=${diagLogger.getLogFilePath() || '(memory-only)'}`,
    ].join('\n'),
  });
  console.log(`E3ProMax server running on http://0.0.0.0:${actualPort} (${localUrl})`);

  if (process.env.FLUX_OPEN_BROWSER === '1' && process.platform === 'win32') {
    execFile('cmd.exe', ['/c', 'start', '', localUrl], (err) => {
      if (err) {
        diagLogger.log('WARN', 'PORTABLE', `Не удалось автооткрыть браузер: ${err.message}`);
      }
    });
  }
}

start().catch((err) => {
  diagLogger.log('ERROR', 'SERVER', `Критическая ошибка запуска сервера: ${err?.message || err}`, {
    details: err instanceof Error ? err.stack || err.message : String(err),
  });
  process.exit(1);
});
