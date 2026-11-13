import type { E3Project } from './e3Types.ts';

export type FluxUiMode = 'page' | 'widget';

export interface FluxStudioManifestOptions {
  id?: string;
  name?: string;
  version?: string;
  author?: string;
  ui?: FluxUiMode;
  category?: string;
  summary?: string;
  fluxMinVersion?: string;
  fluxProjectKey?: string;
}

export interface FluxStudioManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  contractVersion: 2;
  ui: FluxUiMode;
  logic: string;
  entry: {
    ui: string;
    bridge: string;
    model: string;
  };
  capabilities: string[];
  projectBinding: {
    projectId: string;
    projectCode: string;
    fluxProjectKey: string;
    revision: number;
  };
  store: {
    category: string;
    summary: string;
    requires: {
      flux: string;
    };
  };
}

export const FLUX_EXPOSED_CAPABILITIES = [
  'e3.getProject',
  'e3.getBom',
  'e3.runErc',
  'e3.getBridgeBundle',
  'e3.updateStamp',
  'e3.addDevice',
  'e3.rerouteWires',
] as const;

export function sanitizeFluxModuleId(raw?: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'e3promax-ecad';
}

export function buildFluxStudioManifest(
  project: E3Project,
  opts: FluxStudioManifestOptions = {}
): FluxStudioManifest {
  const id = sanitizeFluxModuleId(opts.id || 'e3promax-ecad');
  const name = (opts.name || 'E3ProMax — САПР электросхем').trim() || 'E3ProMax — САПР электросхем';
  const version = (opts.version || '1.2.0').trim() || '1.2.0';
  const author = (opts.author || project.author || 'Инженер КИП').trim() || 'Инженер КИП';
  const ui: FluxUiMode = opts.ui === 'widget' ? 'widget' : 'page';
  const category = (opts.category || 'e3').trim() || 'e3';
  const summary =
    (opts.summary ||
      'Редактор электросхем ГОСТ, авто-спецификации ПЭ3, кабельные журналы и двусторонняя синхронизация E3.series внутри Flux Studio.').trim();
  const fluxMinVersion = (opts.fluxMinVersion || '1.21.0').trim() || '1.21.0';
  const fluxProjectKey = (opts.fluxProjectKey || project.fluxProjectKey || 'FLUX_PRJ_1').trim();

  return {
    id,
    name,
    version,
    author,
    contractVersion: 2,
    ui,
    logic: 'logic/main.ts',
    entry: {
      ui: 'ui/index.html',
      bridge: 'e3-bridge.json',
      model: 'e3-seed-model.e3s',
    },
    capabilities: [...FLUX_EXPOSED_CAPABILITIES],
    projectBinding: {
      projectId: project.id,
      projectCode: project.projectCode,
      fluxProjectKey,
      revision: project.revision,
    },
    store: {
      category,
      summary,
      requires: {
        flux: fluxMinVersion,
      },
    },
  };
}

export function buildFluxStudioLogicSource(manifest: FluxStudioManifest): string {
  return `// Логика подпрограммы Flux Studio (contractVersion ${manifest.contractVersion})
// Модуль: ${manifest.id} (${manifest.name})
export const MODULE_ID = ${JSON.stringify(manifest.id)};
export const CAPABILITIES = ${JSON.stringify(manifest.capabilities)};

export function compute(input: any) {
  const state = input?.state || {};
  const action = String(input?.action || '');
  return {
    state,
    calc: {
      out: {
        ready: true,
        moduleId: MODULE_ID,
        contractVersion: ${manifest.contractVersion},
        lastAction: action || null,
        fluxProjectKey: state.fluxProjectKey || ${JSON.stringify(manifest.projectBinding.fluxProjectKey)},
      },
    },
  };
}
`;
}
