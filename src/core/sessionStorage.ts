import { SHEET_DIMENSIONS } from './e3Catalog.ts';
import { DEFAULT_VISUAL_SETTINGS } from './e3Seed.ts';
import { resolveCadLayers } from './cadLayers.ts';
import type { E3Project, E3Sheet, SheetFormat } from './e3Types.ts';
import { normalizeProjectSheetRevisions } from './sheetRevisions.ts';

export const ACTIVE_SESSION_STORAGE_KEY = 'e3promax_active_session_v1';
export const RECENT_PROJECTS_STORAGE_KEY = 'e3promax_recent_projects_v1';
const MAX_RECENT_PROJECTS = 8;

export interface ActiveSessionRecord {
  project: E3Project;
  activeSheetId: string;
  savedAt: string;
}

export interface RecentProjectEntry {
  id: string;
  name: string;
  projectCode: string;
  revision: number;
  sheetCount: number;
  deviceCount: number;
  wireCount: number;
  savedAt: string;
  activeSheetId: string;
  project: E3Project;
}

function getStorage(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function isValidProjectShape(candidate: unknown): candidate is Partial<E3Project> & {
  id: string;
  name: string;
  sheets: Array<Partial<E3Sheet>>;
} {
  if (!candidate || typeof candidate !== 'object') return false;
  const p = candidate as Partial<E3Project>;
  return (
    typeof p.id === 'string' &&
    p.id.trim().length > 0 &&
    typeof p.name === 'string' &&
    Array.isArray(p.sheets) &&
    p.sheets.length > 0 &&
    p.sheets.every((s) => Boolean(s && typeof s === 'object' && typeof s.id === 'string' && s.id.trim().length > 0)) &&
    Array.isArray(p.devices) &&
    Array.isArray(p.wires)
  );
}

export function hydrateProjectDefaults(candidate: Partial<E3Project>): E3Project {
  const rawVs = (candidate.visualSettings || {}) as Partial<typeof DEFAULT_VISUAL_SETTINGS>;
  const showGostFrame =
    typeof rawVs.showGostFrame === 'boolean' ? rawVs.showGostFrame : DEFAULT_VISUAL_SETTINGS.showGostFrame;
  const mergedVs = {
    ...DEFAULT_VISUAL_SETTINGS,
    ...rawVs,
    netColors: {
      ...DEFAULT_VISUAL_SETTINGS.netColors,
      ...(rawVs.netColors || {}),
    },
  };

  const projectCode = String(candidate.projectCode || 'E3-PRJ-001');
  const projectName = String(candidate.name || 'Проект E3ProMax');
  const author = String(candidate.author || 'Инженер');

  const rawSheets = Array.isArray(candidate.sheets) ? candidate.sheets : [];
  const hydratedSheets: E3Sheet[] = rawSheets.map((s, idx) => {
    const fmt: SheetFormat =
      s?.format && s.format in SHEET_DIMENSIONS ? (s.format as SheetFormat) : 'A3';
    const dims = SHEET_DIMENSIONS[fmt];
    const tb = (s?.titleBlock || {}) as Partial<E3Sheet['titleBlock']>;
    const num = Number.isFinite(Number(s?.number)) && Number(s?.number) > 0 ? Number(s.number) : idx + 1;
    return {
      id: String(s?.id || `sheet-${idx + 1}`),
      number: num,
      name: String(s?.name || `Лист ${num}`),
      format: fmt,
      width: Number.isFinite(Number(s?.width)) && Number(s?.width) > 100 ? Number(s.width) : dims.width,
      height: Number.isFinite(Number(s?.height)) && Number(s?.height) > 100 ? Number(s.height) : dims.height,
      revision: Number.isFinite(Number(s?.revision)) ? Number(s.revision) : undefined,
      updatedAt: typeof s?.updatedAt === 'string' ? s.updatedAt : undefined,
      revisions: Array.isArray(s?.revisions) ? s.revisions : undefined,
      titleBlock: {
        stampForm: tb.stampForm || (num > 1 ? 'form2a' : 'form1'),
        customTemplateId: tb.customTemplateId,
        documentCode: String(tb.documentCode ?? projectCode),
        projectTitle: String(tb.projectTitle ?? projectName),
        organization: String(tb.organization ?? ''),
        designer: String(tb.designer ?? author),
        checker: String(tb.checker ?? ''),
        techControl: String(tb.techControl ?? ''),
        normControl: String(tb.normControl ?? ''),
        approver: String(tb.approver ?? ''),
        litera: String(tb.litera ?? ''),
        mass: String(tb.mass ?? '—'),
        scale: String(tb.scale ?? 'б/м'),
        date: String(tb.date ?? ''),
        izm: tb.izm,
        changeDoc: tb.changeDoc,
        changeDate: tb.changeDate,
        invOriginal: String(tb.invOriginal ?? ''),
        invDuplicate: String(tb.invDuplicate ?? ''),
        sheetTitle: String(tb.sheetTitle ?? s?.name ?? `Лист ${num}`),
      },
    };
  });

  const hydrated: E3Project = {
    schemaVersion: String(candidate.schemaVersion || '1.0'),
    id: String(candidate.id || 'proj-restored'),
    name: projectName,
    projectCode,
    fluxProjectKey: String(candidate.fluxProjectKey || 'FLUX_PRJ_LOCAL'),
    author,
    revision: Number.isFinite(Number(candidate.revision)) ? Number(candidate.revision) : 1,
    standard: candidate.standard === 'IEC' ? 'IEC' : 'GOST',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    visualSettings: mergedVs,
    layers: resolveCadLayers(candidate.layers, showGostFrame),
    sheets: hydratedSheets,
    devices: Array.isArray(candidate.devices) ? candidate.devices : [],
    wires: Array.isArray(candidate.wires) ? candidate.wires : [],
    cables: Array.isArray(candidate.cables) ? candidate.cables : [],
    annotations: Array.isArray(candidate.annotations) ? candidate.annotations : [],
    customStampTemplates: Array.isArray(candidate.customStampTemplates) ? candidate.customStampTemplates : [],
    symbolLibrary: Array.isArray(candidate.symbolLibrary) ? candidate.symbolLibrary : [],
  };

  return normalizeProjectSheetRevisions(hydrated);
}

export function loadActiveSession(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): ActiveSessionRecord | null {
  const store = getStorage(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveSessionRecord>;
    if (!parsed || !isValidProjectShape(parsed.project)) return null;
    const normalized = hydrateProjectDefaults(parsed.project);
    const activeSheetId =
      typeof parsed.activeSheetId === 'string' &&
      normalized.sheets.some((s) => s.id === parsed.activeSheetId)
        ? parsed.activeSheetId
        : normalized.sheets[0].id;
    return {
      project: normalized,
      activeSheetId,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function loadRecentProjects(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): RecentProjectEntry[] {
  const store = getStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(RECENT_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid: RecentProjectEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object' || !isValidProjectShape(item.project)) continue;
      const normalized = hydrateProjectDefaults(item.project);
      valid.push({
        id: String(item.id || normalized.id),
        name: String(item.name || normalized.name),
        projectCode: String(item.projectCode || normalized.projectCode),
        revision: Number(item.revision || normalized.revision || 1),
        sheetCount: normalized.sheets.length,
        deviceCount: normalized.devices.length,
        wireCount: normalized.wires.length,
        savedAt: String(item.savedAt || normalized.updatedAt || new Date().toISOString()),
        activeSheetId:
          typeof item.activeSheetId === 'string' &&
          normalized.sheets.some((s) => s.id === item.activeSheetId)
            ? item.activeSheetId
            : normalized.sheets[0].id,
        project: normalized,
      });
    }
    valid.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return valid.slice(0, MAX_RECENT_PROJECTS);
  } catch {
    return [];
  }
}

export function upsertRecentProject(
  project: E3Project,
  activeSheetId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  savedAt = new Date().toISOString()
): RecentProjectEntry[] {
  const store = getStorage(storage);
  const existing = loadRecentProjects(store).filter((e) => e.id !== project.id);
  const validSheetId = project.sheets.some((s) => s.id === activeSheetId)
    ? activeSheetId
    : project.sheets[0]?.id || 'sheet-1';
  const entry: RecentProjectEntry = {
    id: project.id,
    name: project.name,
    projectCode: project.projectCode,
    revision: project.revision,
    sheetCount: project.sheets.length,
    deviceCount: project.devices.length,
    wireCount: project.wires.length,
    savedAt,
    activeSheetId: validSheetId,
    project,
  };
  let next = [entry, ...existing].slice(0, MAX_RECENT_PROJECTS);
  if (store) {
    while (next.length > 0) {
      try {
        store.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(next));
        break;
      } catch {
        // QuotaExceededError: drop oldest recent snapshot
        if (next.length <= 1) break;
        next = next.slice(0, next.length - 1);
      }
    }
  }
  return next;
}

export function removeRecentProject(
  projectId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): RecentProjectEntry[] {
  const store = getStorage(storage);
  const next = loadRecentProjects(store).filter((e) => e.id !== projectId);
  if (store) {
    try {
      store.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage write failure
    }
  }
  return next;
}

export function saveActiveSession(
  project: E3Project,
  activeSheetId: string,
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): { savedAt: string; recent: RecentProjectEntry[] } {
  const savedAt = new Date().toISOString();
  const validSheetId = project.sheets.some((s) => s.id === activeSheetId)
    ? activeSheetId
    : project.sheets[0]?.id || 'sheet-1';
  const store = getStorage(storage);
  if (store) {
    try {
      const payload: ActiveSessionRecord = {
        project,
        activeSheetId: validSheetId,
        savedAt,
      };
      store.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota exceeded on active snapshot
    }
  }
  const recent = upsertRecentProject(project, validSheetId, store, savedAt);
  return { savedAt, recent };
}

export function clearActiveSession(
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
