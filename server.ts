import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import { E3_CATALOG } from './src/core/e3Catalog.ts';
import {
  buildBom,
  buildCableJournal,
  buildTerminalPlan,
  exportBomCsv,
  exportToDxf,
  exportToFluxBridge,
  parseE3Xml,
  parseVisualSettings,
  runErc,
  serializeE3Xml,
} from './src/core/e3Engine.ts';
import { createSeedProject } from './src/core/e3Seed.ts';
import type { E3Device, E3Project } from './src/core/e3Types.ts';

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.text({ type: ['application/xml', 'text/xml', 'text/plain'], limit: '25mb' }));

// In-memory active projects store seeded with default ЩУ-ПВ1 model
const projects = new Map<string, E3Project>();
const seed = createSeedProject();
projects.set(seed.id, seed);

// Connected SSE real-time sync clients
const sseClients = new Set<express.Response>();

function broadcastUpdate(project: E3Project, source: string, sender = 'server') {
  const payload = JSON.stringify({
    type: 'project-update',
    source,
    sender,
    revision: project.revision,
    project,
  });
  for (const res of sseClients) {
    res.write(`data: ${payload}\n\n`);
  }
}

function getOrDefaultProject(id?: string): E3Project {
  if (id && projects.has(id)) return projects.get(id)!;
  return projects.values().next().value!;
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
  res.json({ ok: true, service: 'flux-e3-ecad', activeClients: sseClients.size, projects: projects.size });
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
    res.setHeader('Content-Disposition', `attachment; filename="${proj.projectCode}-PE3.csv"`);
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

app.get('/api/v1/projects/:id/export/e3xml', (req, res) => {
  const proj = getOrDefaultProject(req.params.id);
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${proj.projectCode}.e3x"`);
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
  res.setHeader('Content-Disposition', `attachment; filename="${proj.projectCode}.dxf"`);
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

    zip.file('e3-seed-model.e3x', serializeE3Xml(proj));
    zip.file('e3-bridge.json', JSON.stringify(exportToFluxBridge(proj), null, 2));

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

async function start() {
  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Flux E3 server running on http://0.0.0.0:${PORT}`);
  });
}

start();
