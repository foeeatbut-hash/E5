import type {
  E3Annotation,
  E3Device,
  E3Project,
  E3Sheet,
  E3SheetRevisionEntry,
  E3SheetSnapshot,
  E3Wire,
  SheetChangeArea,
} from './e3Types.ts';

const MAX_REVISIONS_PER_SHEET = 30;

export const SHEET_CHANGE_AREA_LABELS: Record<SheetChangeArea, string> = {
  devices: 'Изделия',
  wires: 'Цепи',
  annotations: 'Аннотации',
  stamp: 'Штамп',
  format: 'Формат',
  metadata: 'Лист',
};

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

export function captureSheetSnapshot(project: E3Project, sheetId: string): E3SheetSnapshot | null {
  const sheet = project.sheets.find((s) => s.id === sheetId);
  if (!sheet) return null;
  const devices = sortById(project.devices.filter((d) => d.sheetId === sheetId));
  const wires = sortById(project.wires.filter((w) => w.sheetId === sheetId));
  const annotations = sortById((project.annotations || []).filter((a) => a.sheetId === sheetId));
  return {
    name: sheet.name,
    format: sheet.format,
    width: sheet.width,
    height: sheet.height,
    titleBlock: structuredClone(sheet.titleBlock),
    devices: structuredClone(devices),
    wires: structuredClone(wires),
    annotations: structuredClone(annotations),
  };
}

export function getSheetRevisionNumber(sheet: E3Sheet): number {
  if (typeof sheet.revision === 'number' && Number.isFinite(sheet.revision) && sheet.revision >= 1) {
    return Math.floor(sheet.revision);
  }
  if (sheet.revisions && sheet.revisions.length > 0) {
    return Math.max(...sheet.revisions.map((r) => r.revision));
  }
  return 1;
}

export function getReleasedSheetRevisions(sheet: E3Sheet): E3SheetRevisionEntry[] {
  return (sheet.revisions || []).filter(
    (r) => r.released || Boolean(r.revisionLabel && r.revisionLabel !== '0' && r.revisionLabel !== '—')
  );
}

export function getSheetRevisionLabel(sheet: E3Sheet): string {
  const curRev = getSheetRevisionNumber(sheet);
  const activeEntry = (sheet.revisions || []).find((r) => r.revision === curRev);
  if (activeEntry?.released && activeEntry.revisionLabel) {
    return `Изм.${activeEntry.revisionLabel}`;
  }
  return `v${curRev}`;
}

export function hasSheetUncommittedChanges(project: E3Project, sheet: E3Sheet): boolean {
  const history = sheet.revisions || [];
  if (history.length === 0) return false;
  const currentRev = getSheetRevisionNumber(sheet);
  const activeEntry =
    history.find((r) => r.revision === currentRev) || history[history.length - 1];
  if (!activeEntry?.snapshot) return false;
  const curSnap = captureSheetSnapshot(project, sheet.id);
  if (!curSnap) return false;
  return describeSheetChanges(activeEntry.snapshot, curSnap) !== null;
}

function summarizeDeviceDiff(prevDevices: E3Device[], nextDevices: E3Device[]): string {
  if (nextDevices.length > prevDevices.length) {
    const prevIds = new Set(prevDevices.map((d) => d.id));
    const added = nextDevices.filter((d) => !prevIds.has(d.id));
    if (added.length === 1) return `Добавлено изделие ${added[0].designation}`;
    return `Добавлено изделий: ${nextDevices.length - prevDevices.length}`;
  }
  if (nextDevices.length < prevDevices.length) {
    const nextIds = new Set(nextDevices.map((d) => d.id));
    const removed = prevDevices.filter((d) => !nextIds.has(d.id));
    if (removed.length === 1) return `Удалено изделие ${removed[0].designation}`;
    return `Удалено изделий: ${prevDevices.length - nextDevices.length}`;
  }
  const prevById = new Map(prevDevices.map((d) => [d.id, d]));
  const renamed: string[] = [];
  const rotated: string[] = [];
  const moved: string[] = [];
  const other: string[] = [];
  for (const nd of nextDevices) {
    const pd = prevById.get(nd.id);
    if (!pd) continue;
    if (JSON.stringify(pd) === JSON.stringify(nd)) continue;
    if (pd.designation !== nd.designation) {
      renamed.push(`${pd.designation} → ${nd.designation}`);
    } else if (pd.rotation !== nd.rotation) {
      rotated.push(`${nd.designation} (${nd.rotation}°)`);
    } else if (pd.x !== nd.x || pd.y !== nd.y) {
      moved.push(nd.designation);
    } else {
      other.push(nd.designation);
    }
  }
  if (renamed.length === 1) return `Переименовано ОУО: ${renamed[0]}`;
  if (rotated.length === 1) return `Повёрнуто изделие ${rotated[0]}`;
  if (moved.length === 1) return `Перемещено изделие ${moved[0]}`;
  if (moved.length > 1) return `Перемещено изделий: ${moved.length}`;
  if (other.length === 1) return `Обновлены свойства ${other[0]}`;
  return 'Изменены изделия на листе';
}

function summarizeWireDiff(prevWires: E3Wire[], nextWires: E3Wire[]): string {
  if (nextWires.length > prevWires.length) {
    const prevIds = new Set(prevWires.map((w) => w.id));
    const added = nextWires.filter((w) => !prevIds.has(w.id));
    if (added.length === 1) return `Добавлена цепь ${added[0].netName} (${added[0].wireNumber})`;
    return `Добавлено цепей: ${nextWires.length - prevWires.length}`;
  }
  if (nextWires.length < prevWires.length) {
    return `Удалено цепей: ${prevWires.length - nextWires.length}`;
  }
  const prevById = new Map(prevWires.map((w) => [w.id, w]));
  for (const nw of nextWires) {
    const pw = prevById.get(nw.id);
    if (!pw || JSON.stringify(pw) === JSON.stringify(nw)) continue;
    if (pw.wireNumber !== nw.wireNumber) {
      return `Маркировка провода: ${pw.wireNumber} → ${nw.wireNumber}`;
    }
    if (pw.netName !== nw.netName) {
      return `Цепь переименована: ${pw.netName} → ${nw.netName}`;
    }
  }
  return 'Обновлена трассировка цепей';
}

function summarizeAnnotationDiff(
  prevAnns: E3Annotation[],
  nextAnns: E3Annotation[]
): string {
  if (nextAnns.length > prevAnns.length) {
    return nextAnns.length - prevAnns.length === 1
      ? 'Добавлена аннотация на лист'
      : `Добавлено аннотаций: ${nextAnns.length - prevAnns.length}`;
  }
  if (nextAnns.length < prevAnns.length) {
    return `Удалено аннотаций: ${prevAnns.length - nextAnns.length}`;
  }
  const prevById = new Map(prevAnns.map((a) => [a.id, a]));
  for (const na of nextAnns) {
    const pa = prevById.get(na.id);
    if (!pa || JSON.stringify(pa) === JSON.stringify(na)) continue;
    if (pa.text !== na.text) {
      return `Текст аннотации: «${na.text.slice(0, 28)}»`;
    }
    if (pa.x !== na.x || pa.y !== na.y) {
      return 'Перемещена аннотация';
    }
  }
  return 'Обновлены аннотации';
}

export function describeSheetChanges(
  prevSnap: E3SheetSnapshot,
  nextSnap: E3SheetSnapshot
): { changedAreas: SheetChangeArea[]; summary: string } | null {
  const changedAreas: SheetChangeArea[] = [];
  const parts: string[] = [];

  if (JSON.stringify(prevSnap.devices) !== JSON.stringify(nextSnap.devices)) {
    changedAreas.push('devices');
    parts.push(summarizeDeviceDiff(prevSnap.devices, nextSnap.devices));
  }
  if (JSON.stringify(prevSnap.wires) !== JSON.stringify(nextSnap.wires)) {
    changedAreas.push('wires');
    parts.push(summarizeWireDiff(prevSnap.wires, nextSnap.wires));
  }
  if (JSON.stringify(prevSnap.annotations) !== JSON.stringify(nextSnap.annotations)) {
    changedAreas.push('annotations');
    parts.push(summarizeAnnotationDiff(prevSnap.annotations, nextSnap.annotations));
  }
  if (JSON.stringify(prevSnap.titleBlock) !== JSON.stringify(nextSnap.titleBlock)) {
    changedAreas.push('stamp');
    parts.push('Обновлён штамп ГОСТ 2.104');
  }
  if (
    prevSnap.format !== nextSnap.format ||
    prevSnap.width !== nextSnap.width ||
    prevSnap.height !== nextSnap.height
  ) {
    changedAreas.push('format');
    parts.push(`Формат листа: ${prevSnap.format} → ${nextSnap.format}`);
  }
  if (prevSnap.name !== nextSnap.name) {
    changedAreas.push('metadata');
    parts.push(`Переименован лист: «${nextSnap.name}»`);
  }

  if (changedAreas.length === 0) return null;
  return {
    changedAreas,
    summary: parts.slice(0, 3).join('; '),
  };
}

function capRevisionHistory(entries: E3SheetRevisionEntry[]): E3SheetRevisionEntry[] {
  if (entries.length <= MAX_REVISIONS_PER_SHEET) return entries;
  return [entries[0], ...entries.slice(-(MAX_REVISIONS_PER_SHEET - 1))];
}

function formatDefaultChangeDate(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
  } catch {
    return '';
  }
}

export function normalizeProjectSheetRevisions(
  project: E3Project,
  opts?: { timestamp?: string; author?: string }
): E3Project {
  const ts = opts?.timestamp || project.updatedAt || new Date().toISOString();
  const author = opts?.author || project.author || 'Инженер';

  const sheets = project.sheets.map((sheet) => {
    const revNum = getSheetRevisionNumber(sheet);
    const snap = captureSheetSnapshot(project, sheet.id) || undefined;
    const existing =
      Array.isArray(sheet.revisions) && sheet.revisions.length > 0
        ? sheet.revisions.map((r) => ({ ...r }))
        : [
            {
              revision: revNum,
              released: false,
              projectRevision: project.revision,
              timestamp: sheet.updatedAt || ts,
              author,
              summary: 'Базовая версия листа',
              changedAreas: ['metadata'] as SheetChangeArea[],
              snapshot: snap,
            },
          ];

    const lastIdx = existing.length - 1;
    if (!existing[lastIdx].snapshot && snap) {
      existing[lastIdx] = { ...existing[lastIdx], snapshot: snap };
    }

    const preservedRev =
      typeof sheet.revision === 'number' && Number.isFinite(sheet.revision) && sheet.revision >= 1
        ? Math.floor(sheet.revision)
        : existing[lastIdx].revision;

    return {
      ...sheet,
      revision: preservedRev,
      updatedAt: sheet.updatedAt || existing[lastIdx].timestamp || ts,
      revisions: capRevisionHistory(existing),
    };
  });

  return { ...project, sheets };
}

/**
 * Releases and snapshots an internal per-sheet revision inside the application
 * without writing revision codes or change-table rows onto the drawing sheet stamp.
 */
export function releaseSheetRevision(
  project: E3Project,
  sheetId: string,
  opts: {
    revisionLabel: string;
    changeDoc?: string;
    changeDate?: string;
    comment?: string;
    author?: string;
    timestamp?: string;
  }
): E3Project {
  const cleanLabel = opts.revisionLabel.trim();
  if (!cleanLabel) return project;

  const normalized = normalizeProjectSheetRevisions(project, opts);
  const sheet = normalized.sheets.find((s) => s.id === sheetId);
  if (!sheet) return project;

  const now = opts.timestamp || new Date().toISOString();
  const author =
    opts.author?.trim() ||
    sheet.titleBlock.designer?.trim() ||
    normalized.author ||
    'Инженер';
  const changeDoc = opts.changeDoc?.trim() || '';
  const changeDate =
    opts.changeDate?.trim() ||
    formatDefaultChangeDate(now);

  const prevHistory = sheet.revisions || [];
  const prevMaxRev = prevHistory.reduce((mx, r) => Math.max(mx, r.revision), getSheetRevisionNumber(sheet));
  const nextRev = prevMaxRev + 1;

  const prevSnap = prevHistory[prevHistory.length - 1]?.snapshot;
  const nextSnap = captureSheetSnapshot(normalized, sheetId) || undefined;
  const diff = prevSnap && nextSnap ? describeSheetChanges(prevSnap, nextSnap) : null;
  const changedAreas: SheetChangeArea[] =
    diff?.changedAreas && diff.changedAreas.length > 0 ? diff.changedAreas : ['metadata'];

  const userNote = opts.comment?.trim();
  const diffDetail = diff?.summary || '';
  const summary = userNote
    ? `Изм. «${cleanLabel}»: ${userNote}`
    : diffDetail
      ? `Выпуск ревизии «${cleanLabel}» (${diffDetail})`
      : `Зафиксирована внутренняя ревизия листа «${cleanLabel}»`;

  const entry: E3SheetRevisionEntry = {
    revision: nextRev,
    revisionLabel: cleanLabel,
    changeDoc: changeDoc || undefined,
    changeDate,
    released: true,
    projectRevision: normalized.revision + 1,
    timestamp: now,
    author,
    summary,
    changedAreas,
    snapshot: nextSnap,
  };

  return {
    ...normalized,
    revision: normalized.revision + 1,
    updatedAt: now,
    sheets: normalized.sheets.map((s) =>
      s.id === sheetId
        ? {
            ...s,
            revision: nextRev,
            updatedAt: now,
            revisions: capRevisionHistory([...prevHistory, entry]),
          }
        : s
    ),
  };
}

export function applySheetRevisionTracking(
  prevProject: E3Project,
  nextProject: E3Project,
  opts?: {
    author?: string;
    timestamp?: string;
    coalesceLast?: boolean;
    summaryOverride?: string;
  }
): E3Project {
  const now = opts?.timestamp || nextProject.updatedAt || new Date().toISOString();
  const author = opts?.author || nextProject.author || prevProject.author || 'Инженер';
  const prevSheetMap = new Map(prevProject.sheets.map((s) => [s.id, s]));

  const nextSheets = nextProject.sheets.map((sheet) => {
    const nextSnap = captureSheetSnapshot(nextProject, sheet.id);
    const prevSheet = prevSheetMap.get(sheet.id);

    if (!prevSheet) {
      const rev = getSheetRevisionNumber(sheet);
      const existing =
        sheet.revisions && sheet.revisions.length > 0
          ? sheet.revisions
          : [
              {
                revision: rev,
                projectRevision: nextProject.revision,
                timestamp: now,
                author,
                summary: opts?.summaryOverride || `Создание листа «${sheet.name}»`,
                changedAreas: ['metadata'] as SheetChangeArea[],
                snapshot: nextSnap || undefined,
              },
            ];
      return {
        ...sheet,
        revision: rev,
        updatedAt: sheet.updatedAt || now,
        revisions: capRevisionHistory(existing),
      };
    }

    const prevSnap = captureSheetSnapshot(prevProject, sheet.id);
    const prevRev = getSheetRevisionNumber(prevSheet);
    const prevHistory: E3SheetRevisionEntry[] =
      prevSheet.revisions && prevSheet.revisions.length > 0
        ? prevSheet.revisions.map((r) => ({ ...r }))
        : [
            {
              revision: prevRev,
              projectRevision: prevProject.revision,
              timestamp: prevSheet.updatedAt || prevProject.updatedAt || now,
              author: prevProject.author || author,
              summary: 'Базовая версия листа',
              changedAreas: ['metadata'],
              snapshot: prevSnap || undefined,
            },
          ];

    if (!prevSnap || !nextSnap) {
      return {
        ...sheet,
        revision: prevRev,
        updatedAt: prevSheet.updatedAt || now,
        revisions: capRevisionHistory(prevHistory),
      };
    }

    const diff = describeSheetChanges(prevSnap, nextSnap);
    if (!diff) {
      return {
        ...sheet,
        revision: prevRev,
        updatedAt: prevSheet.updatedAt || prevHistory[prevHistory.length - 1]?.timestamp || now,
        revisions: capRevisionHistory(prevHistory),
      };
    }

    if (opts?.coalesceLast && prevHistory.length > 1) {
      const updatedLast: E3SheetRevisionEntry = {
        ...prevHistory[prevHistory.length - 1],
        projectRevision: nextProject.revision,
        timestamp: now,
        author,
        summary: opts?.summaryOverride || diff.summary,
        changedAreas: diff.changedAreas,
        snapshot: nextSnap,
      };
      return {
        ...sheet,
        revision: prevRev,
        updatedAt: now,
        revisions: capRevisionHistory([...prevHistory.slice(0, -1), updatedLast]),
      };
    }

    const nextRev = prevRev + 1;
    const entry: E3SheetRevisionEntry = {
      revision: nextRev,
      projectRevision: nextProject.revision,
      timestamp: now,
      author,
      summary: opts?.summaryOverride || diff.summary,
      changedAreas: diff.changedAreas,
      snapshot: nextSnap,
    };

    return {
      ...sheet,
      revision: nextRev,
      updatedAt: now,
      revisions: capRevisionHistory([...prevHistory, entry]),
    };
  });

  return {
    ...nextProject,
    sheets: nextSheets,
  };
}

/**
 * Restores a sheet's content & stamp to the selected revision snapshot WITHOUT
 * fabricating a phantom new revision entry (history stays intact; user releases a new
 * revision explicitly via the stamp when ready).
 */
export function restoreSheetFromRevision(
  project: E3Project,
  sheetId: string,
  targetRevision: number,
  opts?: { timestamp?: string }
): E3Project {
  const sheet = project.sheets.find((s) => s.id === sheetId);
  if (!sheet || !sheet.revisions) return project;
  const targetEntry = sheet.revisions.find((r) => r.revision === targetRevision);
  if (!targetEntry?.snapshot) return project;

  const snap = structuredClone(targetEntry.snapshot);
  const now = opts?.timestamp || new Date().toISOString();

  const otherDevices = project.devices.filter((d) => d.sheetId !== sheetId);
  const otherWires = project.wires.filter((w) => w.sheetId !== sheetId);
  const otherAnns = (project.annotations || []).filter((a) => a.sheetId !== sheetId);

  const restoredSheet: E3Sheet = {
    ...sheet,
    name: snap.name,
    format: snap.format,
    width: snap.width,
    height: snap.height,
    titleBlock: snap.titleBlock,
    revision: targetEntry.revision,
    updatedAt: targetEntry.timestamp || now,
    revisions: sheet.revisions,
  };

  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: now,
    sheets: project.sheets.map((s) => (s.id === sheetId ? restoredSheet : s)),
    devices: [...otherDevices, ...snap.devices.map((d) => ({ ...d, sheetId }))],
    wires: [...otherWires, ...snap.wires.map((w) => ({ ...w, sheetId }))],
    annotations: [...otherAnns, ...snap.annotations.map((a) => ({ ...a, sheetId }))],
  };
}
