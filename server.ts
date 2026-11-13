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
  parseE3Xml,
  parseVisualSettings,
  runErc,
  serializeE3Xml,
} from './src/core/e3Engine.ts';
import { buildOle2E3sContainer, parseE3sInput } from './src/core/e3SFormat.ts';
import { createSeedProject } from './src/core/e3Seed.ts';
import type { E3Device, E3Project } from './src/core/e3Types.ts';
import { buildPortableDistribution, getCachedPortableBuild } from './src/server/portablePackager.ts';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.text({ type: ['application/xml', 'text/xml', 'text/plain'], limit: '25mb' }));

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
          return raw;
        }
      }
    } catch {
      // ignore corrupted snapshot and fall through to next source
    }
  }
  return createSeedProject();
}

function persistPortableProject(project: E3Project) {
  if (!process.env.FLUX_DATA_DIR) return;
  try {
    fs.mkdirSync(process.env.FLUX_DATA_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.FLUX_DATA_DIR, 'project.json'),
      JSON.stringify(project, null, 2),
      'utf8'
    );
  } catch {
    // ignore non-fatal local persistence error
  }
}

// In-memory active projects store seeded from portable disk data, embedded seed, or default ЩУ-ПВ1 model
const projects = new Map<string, E3Project>();
const seed = loadInitialProject();
projects.set(seed.id, seed);

// Connected SSE real-time sync clients
const sseClients = new Set<express.Response>();

function broadcastSseEvent(eventObj: Record<string, unknown>) {
  const payload = JSON.stringify(eventObj);
  for (const res of sseClients) {
    res.write(`data: ${payload}\n\n`);
  }
}

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
  if (id && projects.has(id)) return projects.get(id)!;
  return projects.values().next().value!;
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
    designation: body.designation || `-${cat.defaultPrefix}${idx}`,
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
  setDownloadDisposition(res, 'FluxE3_Connector.cmd');
  res.send(generateWindowsBridgeCmd(origin));
});

app.get('/api/v1/e3-bridge/poll', (req, res) => {
  const hostName = String(req.query.host || 'WINDOWS-E3');
  const wasOnline = isBridgeOnline();
  bridgeState.connectedHost = hostName;
  bridgeState.lastPollAt = Date.now();
  if (!wasOnline) {
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
        broadcastUpdate(merged, `E³.series (${host || 'ПК'})`, 'e3-bridge');
      }
    } catch {
      // ignore malformed export JSON
    }
  }
  broadcastSseEvent({
    type: 'e3-bridge-log',
    jobId,
    host: host || bridgeState.connectedHost || 'ПК',
    ok: Boolean(ok),
    message: String(message || (ok ? 'Выполнено в E³.series.' : 'Ошибка выполнения COM-скрипта.')),
  });
  res.json({ ok: true });
});

app.post('/api/v1/projects/:id/e3-direct-open', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  const mode = req.body?.mode === 'export' ? 'export' : 'build';
  const script = generateE3ComScript(proj, mode);

  if (process.platform === 'win32') {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-e3-'));
    const vbsPath = path.join(tmpDir, `${mode}_e3.vbs`);
    fs.writeFileSync(vbsPath, Buffer.from(encodeUtf16LeWithBom(script)));
    execFile('cscript.exe', ['//Nologo', vbsPath, '/silent'], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        broadcastSseEvent({
          type: 'e3-bridge-log',
          host: os.hostname(),
          ok: false,
          message: stderr || err.message,
        });
        res.json({ ok: false, execution: 'local-win32-error', error: stderr || err.message, script });
        return;
      }
      if (mode === 'export') {
        const expPath = path.join(tmpDir, 'flux_e3_export.json');
        if (fs.existsSync(expPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(expPath, 'utf8'));
            const merged = importFromFluxBridge(parsed, proj);
            projects.set(merged.id, merged);
            broadcastUpdate(merged, 'Локальный E³.series (Win32 COM)', 'e3-bridge');
          } catch {
            // ignore
          }
        }
      }
      res.json({
        ok: true,
        execution: 'local-win32',
        host: os.hostname(),
        output: stdout,
      });
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
    res.json({
      ok: true,
      execution: 'remote-connector',
      jobId,
      host: bridgeState.connectedHost,
    });
    return;
  }

  res.json({
    ok: false,
    execution: 'needs-connector',
    platform: process.platform,
    script,
  });
});

app.post('/api/v1/projects/:id/import/e3s', express.raw({ type: '*/*', limit: '25mb' }), async (req, res) => {
  try {
    const raw = Buffer.isBuffer(req.body)
      ? new Uint8Array(req.body)
      : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body || {});
    const parsed = await parseE3sInput(raw);
    projects.set(parsed.project.id, parsed.project);
    broadcastUpdate(parsed.project, `REST API POST /import/e3s (${parsed.sourceKind})`, 'api');
    res.json({ ok: true, sourceKind: parsed.sourceKind, discoveredStreams: parsed.discoveredStreams, project: parsed.project });
  } catch (err) {
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
      id: 'flux-e3-ecad',
      name: 'Flux E3 — САПР электросхем',
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
        `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Flux E3</title><link rel="stylesheet" href="/_flux/flux-ui.v1.css"></head><body class="fx-body"><main class="fx-stack"><h1 class="fx-title">Flux E3 — ${proj.name}</h1><p class="fx-muted">Соберите проект (npm run build) перед публикацией для включения полного SPA в ui/ или откройте приложенную модель.</p><pre id="model" class="fx-card"></pre></main><script src="/_flux/flux.v1.js"></script><script src="/ui/app.js"></script></body></html>`
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
    zip.file('FluxE3_Connector.cmd', generateWindowsBridgeCmd(`http://localhost:${PORT}`));

    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="flux-e3-studio-module.zip"');
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
    res.setHeader('Content-Disposition', 'attachment; filename="flux-e3-codebase.zip"');
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
      targetProject = incomingProject;
    }

    const artifact = await buildPortableDistribution(targetProject);
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
      downloadUrl: `/api/build/portable/${encodeURIComponent(artifact.buildId)}/download`,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Ошибка сборки Portable-версии',
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
  if (process.env.NODE_ENV === 'production') {
    const distDir = resolveDistDir();
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
  console.log(`Flux E3 server running on http://0.0.0.0:${actualPort} (${localUrl})`);

  if (process.env.FLUX_OPEN_BROWSER === '1' && process.platform === 'win32') {
    execFile('cmd.exe', ['/c', 'start', '', localUrl], () => {
      // best-effort browser launch in portable Windows mode
    });
  }
}

start();
