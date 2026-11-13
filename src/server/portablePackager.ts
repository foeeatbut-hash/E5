import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { encodeUtf16LeWithBom, generateE3ComScript } from '../core/e3Engine.ts';
import { buildOle2E3sContainer } from '../core/e3SFormat.ts';
import type { E3Project } from '../core/e3Types.ts';
import {
  generatePortableLauncherCmd,
  generatePortableReadme,
  generatePortableSilentVbs,
} from '../core/portableTemplates.ts';

export interface PortableBuildStage {
  name: string;
  durationMs: number;
  detail: string;
}

export interface PortableBuildArtifact {
  buildId: string;
  filename: string;
  builtAt: string;
  durationMs: number;
  uiFilesCount: number;
  serverBytes: number;
  zipBytes: number;
  projectCode: string;
  revision: number;
  stages: PortableBuildStage[];
  buffer: Buffer;
}

const MAX_CACHED_BUILDS = 3;
const buildCache = new Map<string, PortableBuildArtifact>();
let activeBuildPromise: Promise<PortableBuildArtifact> | null = null;

export function getCachedPortableBuild(buildId: string): PortableBuildArtifact | undefined {
  return buildCache.get(buildId);
}

function storeBuildArtifact(artifact: PortableBuildArtifact) {
  buildCache.set(artifact.buildId, artifact);
  while (buildCache.size > MAX_CACHED_BUILDS) {
    const oldestKey = buildCache.keys().next().value;
    if (!oldestKey) break;
    buildCache.delete(oldestKey);
  }
}

export async function buildPortableDistribution(
  project: E3Project,
  rootDir = process.cwd()
): Promise<PortableBuildArtifact> {
  if (activeBuildPromise) {
    return activeBuildPromise;
  }

  activeBuildPromise = runPortableBuild(project, rootDir).finally(() => {
    activeBuildPromise = null;
  });

  return activeBuildPromise;
}

async function runPortableBuild(project: E3Project, rootDir: string): Promise<PortableBuildArtifact> {
  const totalStart = performance.now();
  const stages: PortableBuildStage[] = [];

  if (process.env.FLUX_PORTABLE === '1') {
    throw new Error(
      'Вы уже запущены из готовой Portable-сборки. Пересборка из исходников выполняется в веб-студии разработки.'
    );
  }

  const serverEntry = path.resolve(rootDir, 'server.ts');
  const viteConfigPath = path.resolve(rootDir, 'vite.config.ts');
  if (!fs.existsSync(serverEntry) || !fs.existsSync(viteConfigPath)) {
    throw new Error('Исходные файлы server.ts / vite.config.ts не найдены для пересборки.');
  }

  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flux-e3-portable-'));
  const distOutDir = path.join(stageDir, 'dist');
  const serverOutFile = path.join(stageDir, 'server.cjs');

  try {
    // 1. Build frontend SPA with Vite
    const tUi = performance.now();
    const { build: viteBuild } = await import('vite');
    await viteBuild({
      configFile: viteConfigPath,
      root: rootDir,
      logLevel: 'silent',
      build: {
        outDir: distOutDir,
        emptyOutDir: true,
      },
    });
    const uiDuration = Math.round(performance.now() - tUi);

    // 2. Bundle backend server + all ECAD core engines into single server.cjs (zero node_modules)
    const tSrv = performance.now();
    const esbuild = await import('esbuild');
    await esbuild.build({
      entryPoints: [serverEntry],
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      outfile: serverOutFile,
      external: ['vite', 'esbuild'],
      minify: true,
      logLevel: 'silent',
    });
    const srvDuration = Math.round(performance.now() - tSrv);
    const serverBuffer = fs.readFileSync(serverOutFile);

    stages.push({
      name: 'Сборка интерфейса (Vite SPA)',
      durationMs: uiDuration,
      detail: 'index.html + бандлы React/Tailwind',
    });
    stages.push({
      name: 'Сборка сервера и ядра (esbuild)',
      durationMs: srvDuration,
      detail: `app/server.cjs (${Math.round(serverBuffer.length / 1024)} КБ, без node_modules)`,
    });

    // 3. Package portable archive
    const tZip = performance.now();
    const zip = new JSZip();
    const builtAt = new Date().toISOString();

    let uiFilesCount = 0;
    const walkDist = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDist(full, `${prefix}${entry.name}/`);
        } else {
          zip.file(`${prefix}${entry.name}`, fs.readFileSync(full));
          uiFilesCount += 1;
        }
      }
    };
    walkDist(distOutDir, 'app/dist/');

    zip.file('app/server.cjs', serverBuffer);
    zip.file(
      'app/package.json',
      JSON.stringify(
        {
          name: 'flux-e3-portable',
          private: true,
          version: `1.0.${project.revision}`,
          type: 'commonjs',
        },
        null,
        2
      ) + '\n'
    );
    zip.file('app/seed-project.json', JSON.stringify(project, null, 2) + '\n');

    zip.file('FluxE3_Portable.cmd', generatePortableLauncherCmd());
    zip.file('FluxE3_Launch.vbs', Buffer.from(encodeUtf16LeWithBom(generatePortableSilentVbs())));
    zip.file(
      'e3-series-2022-sync.vbs',
      Buffer.from(encodeUtf16LeWithBom(generateE3ComScript(project, 'build')))
    );
    zip.file('e3-seed-model.e3s', Buffer.from(buildOle2E3sContainer(project)));
    zip.file(
      'README_PORTABLE.txt',
      generatePortableReadme({
        projectName: project.name,
        projectCode: project.projectCode,
        revision: project.revision,
        builtAt,
        version: `1.0.${project.revision}-portable`,
      })
    );
    zip.file('data/.keep', '');

    const buffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const zipDuration = Math.round(performance.now() - tZip);
    const totalDuration = Math.round(performance.now() - totalStart);

    stages.push({
      name: 'Упаковка Portable ZIP',
      durationMs: zipDuration,
      detail: `${uiFilesCount} UI-файлов + COM-скрипты (${Math.round(buffer.length / 1024)} КБ)`,
    });

    const buildId = `ptb-${Date.now().toString(36)}`;
    const cyrMap: Record<string, string> = {
      А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'Zh', З: 'Z', И: 'I', Й: 'Y',
      К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U', Ф: 'F',
      Х: 'Kh', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sch', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
      к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
      х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    };
    const safeCode =
      project.projectCode
        .split('')
        .map((c) => cyrMap[c] ?? c)
        .join('')
        .replace(/[^\w.-]+/g, '_') || 'FluxE3';
    const artifact: PortableBuildArtifact = {
      buildId,
      filename: `FluxE3-Portable-${safeCode}-r${project.revision}.zip`,
      builtAt,
      durationMs: totalDuration,
      uiFilesCount,
      serverBytes: serverBuffer.length,
      zipBytes: buffer.length,
      projectCode: project.projectCode,
      revision: project.revision,
      stages,
      buffer,
    };

    storeBuildArtifact(artifact);
    return artifact;
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}
