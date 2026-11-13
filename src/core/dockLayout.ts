import type { E3Project, E3Sheet } from './e3Types.ts';

export type PanelId = 'explorer' | 'inspector' | 'console';
export type DockEdge = 'left' | 'right' | 'bottom' | 'top';
export type DockSide = DockEdge | 'floating';
export type ViewportLayoutMode = 'single' | 'two' | 'three' | 'four';

export interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelConfig {
  id: PanelId;
  title: string;
  dock: DockSide;
  order: number;
  collapsed: boolean;
  floating: FloatingRect;
}

export interface DockLayoutState {
  version: number;
  panels: Record<PanelId, PanelConfig>;
  sizes: Record<DockEdge, number>;
}

export const DOCK_LAYOUT_STORAGE_KEY = 'e3promax.dockLayout.v1';

export function createDefaultDockLayout(): DockLayoutState {
  return {
    version: 1,
    panels: {
      explorer: {
        id: 'explorer',
        title: 'Проект и База',
        dock: 'left',
        order: 0,
        collapsed: false,
        floating: { x: 24, y: 148, width: 300, height: 480 },
      },
      inspector: {
        id: 'inspector',
        title: 'Свойства и Атрибуты',
        dock: 'right',
        order: 0,
        collapsed: false,
        floating: { x: 1080, y: 148, width: 330, height: 480 },
      },
      console: {
        id: 'console',
        title: 'Спецификация, Логи и ERC',
        dock: 'bottom',
        order: 0,
        collapsed: false,
        floating: { x: 240, y: 520, width: 820, height: 260 },
      },
    },
    sizes: {
      left: 280,
      right: 320,
      bottom: 224,
      top: 190,
    },
  };
}

export function clampDockSize(
  edge: DockEdge,
  px: number,
  viewportW = 1440,
  viewportH = 900
): number {
  if (edge === 'left' || edge === 'right') {
    const maxW = Math.max(240, Math.round(viewportW * 0.42));
    return Math.max(210, Math.min(maxW, Math.round(px)));
  }
  const maxH = Math.max(160, Math.round(viewportH * 0.48));
  return Math.max(120, Math.min(maxH, Math.round(px)));
}

export function clampFloatingRect(
  rect: FloatingRect,
  viewportW = 1440,
  viewportH = 900
): FloatingRect {
  const maxW = Math.max(260, viewportW - 24);
  const maxH = Math.max(180, viewportH - 80);
  const width = Math.max(240, Math.min(maxW, Math.round(rect.width)));
  const height = Math.max(160, Math.min(maxH, Math.round(rect.height)));
  const maxX = Math.max(8, viewportW - width - 8);
  const maxY = Math.max(40, viewportH - height - 8);
  const x = Math.max(8, Math.min(maxX, Math.round(rect.x)));
  const y = Math.max(40, Math.min(maxY, Math.round(rect.y)));
  return { x, y, width, height };
}

export function getPanelsByDock(state: DockLayoutState, side: DockSide): PanelConfig[] {
  return (Object.values(state.panels) as PanelConfig[])
    .filter((p) => p.dock === side)
    .sort((a, b) => a.order - b.order);
}

export function movePanelDock(
  state: DockLayoutState,
  panelId: PanelId,
  targetDock: DockSide,
  floatingOverride?: Partial<FloatingRect>,
  viewportW = 1440,
  viewportH = 900
): DockLayoutState {
  const current = state.panels[panelId];
  if (!current) return state;
  const peers = getPanelsByDock(state, targetDock).filter((p) => p.id !== panelId);
  const nextOrder = peers.length > 0 ? Math.max(...peers.map((p) => p.order)) + 1 : 0;
  const nextFloating = floatingOverride
    ? clampFloatingRect({ ...current.floating, ...floatingOverride }, viewportW, viewportH)
    : current.floating;

  return {
    ...state,
    panels: {
      ...state.panels,
      [panelId]: {
        ...current,
        dock: targetDock,
        order: nextOrder,
        collapsed: false,
        floating: nextFloating,
      },
    },
  };
}

export function togglePanelCollapse(state: DockLayoutState, panelId: PanelId): DockLayoutState {
  const current = state.panels[panelId];
  if (!current) return state;
  return {
    ...state,
    panels: {
      ...state.panels,
      [panelId]: {
        ...current,
        collapsed: !current.collapsed,
      },
    },
  };
}

export function resizeDockEdge(
  state: DockLayoutState,
  edge: DockEdge,
  px: number,
  viewportW = 1440,
  viewportH = 900
): DockLayoutState {
  return {
    ...state,
    sizes: {
      ...state.sizes,
      [edge]: clampDockSize(edge, px, viewportW, viewportH),
    },
  };
}

export function updateFloatingRect(
  state: DockLayoutState,
  panelId: PanelId,
  patch: Partial<FloatingRect>,
  viewportW = 1440,
  viewportH = 900
): DockLayoutState {
  const current = state.panels[panelId];
  if (!current) return state;
  return {
    ...state,
    panels: {
      ...state.panels,
      [panelId]: {
        ...current,
        floating: clampFloatingRect({ ...current.floating, ...patch }, viewportW, viewportH),
      },
    },
  };
}

export function loadDockLayout(storage?: Pick<Storage, 'getItem'>): DockLayoutState {
  const def = createDefaultDockLayout();
  try {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = store?.getItem(DOCK_LAYOUT_STORAGE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<DockLayoutState>;
    if (!parsed || typeof parsed !== 'object' || !parsed.panels || !parsed.sizes) return def;

    const mergedPanels = { ...def.panels };
    for (const id of ['explorer', 'inspector', 'console'] as PanelId[]) {
      const candidate = parsed.panels[id];
      if (candidate && ['left', 'right', 'bottom', 'top', 'floating'].includes(candidate.dock)) {
        mergedPanels[id] = {
          ...def.panels[id],
          ...candidate,
          id,
          floating: clampFloatingRect(candidate.floating || def.panels[id].floating),
        };
      }
    }

    return {
      version: 1,
      panels: mergedPanels,
      sizes: {
        left: clampDockSize('left', Number(parsed.sizes.left ?? def.sizes.left)),
        right: clampDockSize('right', Number(parsed.sizes.right ?? def.sizes.right)),
        bottom: clampDockSize('bottom', Number(parsed.sizes.bottom ?? def.sizes.bottom)),
        top: clampDockSize('top', Number(parsed.sizes.top ?? def.sizes.top)),
      },
    };
  } catch {
    return def;
  }
}

export function saveDockLayout(
  state: DockLayoutState,
  storage?: Pick<Storage, 'setItem'>
): void {
  try {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    store?.setItem(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export function viewportCountForMode(mode: ViewportLayoutMode): 1 | 2 | 3 | 4 {
  if (mode === 'two') return 2;
  if (mode === 'three') return 3;
  if (mode === 'four') return 4;
  return 1;
}

export function computeViewportSheets(
  mode: ViewportLayoutMode,
  sheets: E3Sheet[],
  currentIds: string[],
  activeSheetId: string
): string[] {
  const count = viewportCountForMode(mode);
  if (sheets.length === 0) return Array(count).fill(activeSheetId);

  const validIds = new Set(sheets.map((s) => s.id));
  const result: string[] = [];

  for (let i = 0; i < count; i++) {
    const existing = i === 0 ? (validIds.has(activeSheetId) ? activeSheetId : currentIds[0]) : currentIds[i];
    if (existing && validIds.has(existing) && !result.includes(existing)) {
      result.push(existing);
      continue;
    }
    const unused = sheets.find((s) => !result.includes(s.id));
    if (unused) {
      result.push(unused.id);
    } else {
      result.push(sheets[i % sheets.length].id);
    }
  }

  return result;
}

export function duplicateSheetInProject(
  project: E3Project,
  sheetId: string
): { nextProject: E3Project; newSheetId: string } {
  const srcSheet = project.sheets.find((s) => s.id === sheetId) || project.sheets[0];
  if (!srcSheet) {
    throw new Error('В проекте нет листов для дублирования.');
  }

  const nextNum = project.sheets.length + 1;
  const newSheetId = `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
  const newSheet: E3Sheet = {
    ...structuredClone(srcSheet),
    id: newSheetId,
    number: nextNum,
    name: `${srcSheet.name} (копия)`,
    titleBlock: {
      ...srcSheet.titleBlock,
      sheetTitle: `${srcSheet.titleBlock.sheetTitle} (копия)`,
    },
  };

  const devIdMap = new Map<string, string>();
  const clonedDevices = project.devices
    .filter((d) => d.sheetId === srcSheet.id)
    .map((d, idx) => {
      const nextDevId = `dev-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
      devIdMap.set(d.id, nextDevId);
      const pinIdMap = new Map<string, string>();
      const pins = d.pins.map((p, pIdx) => {
        const nextPinId = `${nextDevId}-p${pIdx + 1}`;
        pinIdMap.set(p.id, nextPinId);
        return { ...p, id: nextPinId };
      });
      return {
        ...structuredClone(d),
        id: nextDevId,
        elementId: `el-${Date.now().toString(36)}-${idx}`,
        designation: `${d.designation}_К`,
        sheetId: newSheetId,
        pins,
      };
    });

  const clonedWires = project.wires
    .filter((w) => w.sheetId === srcSheet.id)
    .map((w, idx) => {
      const srcDev = project.devices.find((d) => d.id === w.fromDeviceId);
      const dstDev = project.devices.find((d) => d.id === w.toDeviceId);
      const fromPinIdx = srcDev?.pins.findIndex((p) => p.id === w.fromPinId) ?? -1;
      const toPinIdx = dstDev?.pins.findIndex((p) => p.id === w.toPinId) ?? -1;
      const nextFromDevId = devIdMap.get(w.fromDeviceId) || w.fromDeviceId;
      const nextToDevId = devIdMap.get(w.toDeviceId) || w.toDeviceId;
      return {
        ...structuredClone(w),
        id: `w-${Date.now()}-${idx}`,
        sheetId: newSheetId,
        fromDeviceId: nextFromDevId,
        fromPinId: fromPinIdx >= 0 ? `${nextFromDevId}-p${fromPinIdx + 1}` : w.fromPinId,
        toDeviceId: nextToDevId,
        toPinId: toPinIdx >= 0 ? `${nextToDevId}-p${toPinIdx + 1}` : w.toPinId,
      };
    });

  const clonedAnnotations = (project.annotations || [])
    .filter((a) => a.sheetId === srcSheet.id)
    .map((a, idx) => ({
      ...structuredClone(a),
      id: `ann-${Date.now()}-${idx}`,
      sheetId: newSheetId,
    }));

  return {
    newSheetId,
    nextProject: {
      ...project,
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
      sheets: [...project.sheets, newSheet],
      devices: [...project.devices, ...clonedDevices],
      wires: [...project.wires, ...clonedWires],
      annotations: [...(project.annotations || []), ...clonedAnnotations],
    },
  };
}

export function deleteSheetFromProject(
  project: E3Project,
  sheetId: string
): { nextProject: E3Project; nextActiveSheetId: string } {
  if (project.sheets.length <= 1) {
    return { nextProject: project, nextActiveSheetId: project.sheets[0]?.id || sheetId };
  }
  const remainingSheets = project.sheets
    .filter((s) => s.id !== sheetId)
    .map((s, idx) => ({ ...s, number: idx + 1 }));

  const nextActiveSheetId = remainingSheets[0].id;
  return {
    nextActiveSheetId,
    nextProject: {
      ...project,
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
      sheets: remainingSheets,
      devices: project.devices.filter((d) => d.sheetId !== sheetId),
      wires: project.wires.filter((w) => w.sheetId !== sheetId),
      annotations: (project.annotations || []).filter((a) => a.sheetId !== sheetId),
    },
  };
}
