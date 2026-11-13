import type { E3Project } from './e3Types.ts';
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

function isValidProjectShape(candidate: unknown): candidate is E3Project {
  if (!candidate || typeof candidate !== 'object') return false;
  const p = candidate as Partial<E3Project>;
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    Array.isArray(p.sheets) &&
    p.sheets.length > 0 &&
    Array.isArray(p.devices) &&
    Array.isArray(p.wires)
  );
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
    const normalized = normalizeProjectSheetRevisions(parsed.project);
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
      const normalized = normalizeProjectSheetRevisions(item.project);
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
