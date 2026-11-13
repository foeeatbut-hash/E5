import type { CadLayerId, CadLayerState, CadLayerStateMap, E3Project } from './e3Types.ts';

export interface CadLayerMeta {
  id: CadLayerId;
  name: string;
  shortName: string;
  dxfPrimary: string;
  dxfNames: string[];
  swatch: string;
  aciColor: number;
}

export const CAD_LAYER_ORDER: CadLayerId[] = ['devices', 'wires', 'annotations', 'frame'];

export const CAD_LAYER_DEFS: Record<CadLayerId, CadLayerMeta> = {
  devices: {
    id: 'devices',
    name: 'Изделия и аппараты',
    shortName: 'Изделия',
    dxfPrimary: 'E3_DEVICES',
    dxfNames: ['E3_DEVICES', 'E3_PINS', 'E3_LABELS'],
    swatch: '#16a34a',
    aciColor: 3,
  },
  wires: {
    id: 'wires',
    name: 'Цепи и провода',
    shortName: 'Цепи',
    dxfPrimary: 'E3_WIRES',
    dxfNames: ['E3_WIRES', 'E3_NETS'],
    swatch: '#dc2626',
    aciColor: 1,
  },
  annotations: {
    id: 'annotations',
    name: 'Аннотации и зоны',
    shortName: 'Аннотации',
    dxfPrimary: 'E3_ANNOTATIONS',
    dxfNames: ['E3_ANNOTATIONS'],
    swatch: '#0284c7',
    aciColor: 4,
  },
  frame: {
    id: 'frame',
    name: 'Рамка и штамп ГОСТ',
    shortName: 'Рамка ГОСТ',
    dxfPrimary: 'GOST_FRAME',
    dxfNames: ['GOST_FRAME', 'GOST_STAMP'],
    swatch: '#475569',
    aciColor: 7,
  },
};

export const DEFAULT_CAD_LAYERS: CadLayerStateMap = {
  devices: { visible: true, locked: false },
  wires: { visible: true, locked: false },
  annotations: { visible: true, locked: false },
  frame: { visible: true, locked: false },
};

export function resolveCadLayers(
  layers?: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null,
  showGostFrame = true
): CadLayerStateMap {
  return {
    devices: {
      visible: layers?.devices?.visible !== false,
      locked: layers?.devices?.locked === true,
    },
    wires: {
      visible: layers?.wires?.visible !== false,
      locked: layers?.wires?.locked === true,
    },
    annotations: {
      visible: layers?.annotations?.visible !== false,
      locked: layers?.annotations?.locked === true,
    },
    frame: {
      visible: layers?.frame ? layers.frame.visible !== false : showGostFrame !== false,
      locked: layers?.frame?.locked === true,
    },
  };
}

export function isLayerVisible(
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined,
  id: CadLayerId
): boolean {
  return layers?.[id]?.visible !== false;
}

export function isLayerLocked(
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined,
  id: CadLayerId
): boolean {
  return layers?.[id]?.locked === true;
}

export function canEditLayer(
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined,
  id: CadLayerId
): boolean {
  return isLayerVisible(layers, id) && !isLayerLocked(layers, id);
}

export function toggleLayerVisibility(
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined,
  id: CadLayerId
): CadLayerStateMap {
  const resolved = resolveCadLayers(layers);
  return {
    ...resolved,
    [id]: {
      ...resolved[id],
      visible: !resolved[id].visible,
    },
  };
}

export function toggleLayerLock(
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined,
  id: CadLayerId
): CadLayerStateMap {
  const resolved = resolveCadLayers(layers);
  return {
    ...resolved,
    [id]: {
      ...resolved[id],
      locked: !resolved[id].locked,
    },
  };
}

export function setAllLayersVisible(
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined,
  visible: boolean
): CadLayerStateMap {
  const resolved = resolveCadLayers(layers);
  return {
    devices: { ...resolved.devices, visible },
    wires: { ...resolved.wires, visible },
    annotations: { ...resolved.annotations, visible },
    frame: { ...resolved.frame, visible },
  };
}

export function setAllLayersLocked(
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined,
  locked: boolean
): CadLayerStateMap {
  const resolved = resolveCadLayers(layers);
  return {
    devices: { ...resolved.devices, locked },
    wires: { ...resolved.wires, locked },
    annotations: { ...resolved.annotations, locked },
    frame: { ...resolved.frame, locked },
  };
}

export function countSheetLayerEntities(
  project: Pick<E3Project, 'devices' | 'wires' | 'annotations' | 'sheets'>,
  sheetId: string
): Record<CadLayerId, number> {
  const hasSheet = project.sheets.some((s) => s.id === sheetId);
  return {
    devices: project.devices.filter((d) => d.sheetId === sheetId).length,
    wires: project.wires.filter((w) => w.sheetId === sheetId).length,
    annotations: (project.annotations || []).filter((a) => a.sheetId === sheetId).length,
    frame: hasSheet ? 1 : 0,
  };
}

export function summarizeCadLayers(
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined
): {
  total: number;
  visibleCount: number;
  hiddenCount: number;
  lockedCount: number;
} {
  const resolved = resolveCadLayers(layers);
  let visibleCount = 0;
  let lockedCount = 0;
  for (const id of CAD_LAYER_ORDER) {
    if (resolved[id].visible) visibleCount += 1;
    if (resolved[id].locked) lockedCount += 1;
  }
  return {
    total: CAD_LAYER_ORDER.length,
    visibleCount,
    hiddenCount: CAD_LAYER_ORDER.length - visibleCount,
    lockedCount,
  };
}

export function resolveCadLayerForDxfName(dxfLayerName: string): CadLayerId | null {
  for (const id of CAD_LAYER_ORDER) {
    if (CAD_LAYER_DEFS[id].dxfNames.includes(dxfLayerName)) {
      return id;
    }
  }
  return null;
}

export function mapDxfLayerFlags(
  dxfLayerName: string,
  layers: Partial<Record<CadLayerId, Partial<CadLayerState>>> | null | undefined,
  aciColor: number
): { flags70: number; color62: number } {
  const cadId = resolveCadLayerForDxfName(dxfLayerName);
  if (!cadId) {
    return { flags70: 0, color62: aciColor };
  }
  const resolved = resolveCadLayers(layers);
  const state = resolved[cadId];
  // AutoCAD DXF specification:
  // Group 70 bit 4 = layer is locked; Group 62 negative color = layer is OFF.
  return {
    flags70: state.locked ? 4 : 0,
    color62: state.visible ? Math.abs(aciColor) : -Math.abs(aciColor),
  };
}
