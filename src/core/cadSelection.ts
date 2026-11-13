import { resolveCadLayers } from './cadLayers';
import { getDeviceBounds, getSheetDrawableBounds, nextUniqueDesignation } from './e3Engine';
import type {
  CadLayerStateMap,
  E3Annotation,
  E3Device,
  E3Project,
  E3Wire,
} from './e3Types';

export type BoxSelectionMode = 'window' | 'crossing';

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  mode: BoxSelectionMode;
}

export interface RectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DeviceAlignKind =
  | 'left'
  | 'center-x'
  | 'right'
  | 'top'
  | 'center-y'
  | 'bottom'
  | 'distribute-x'
  | 'distribute-y';

export interface CadClipboardPayload {
  schemaVersion: 1;
  copiedAt: string;
  sourceSheetId: string;
  devices: E3Device[];
  wires: E3Wire[];
  annotations: E3Annotation[];
}

export function resolveBoxSelectionMode(startX: number, endX: number): BoxSelectionMode {
  return endX >= startX ? 'window' : 'crossing';
}

export function normalizeSelectionBox(
  start: { x: number; y: number },
  end: { x: number; y: number }
): SelectionBox {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    mode: resolveBoxSelectionMode(start.x, end.x),
  };
}

export function getAnnotationBounds(ann: E3Annotation): RectBox {
  if (ann.kind === 'text') {
    const fs = ann.fontSize || 12;
    const lines = (ann.text || '').split(/\r?\n/);
    const maxLen = Math.max(4, ...lines.map((l) => l.length));
    const width = Math.max(80, Math.round(maxLen * (fs * 0.6) + 14));
    const height = Math.max(fs + 10, lines.length * Math.round(fs * 1.3) + 6);
    return {
      x: ann.x - 4,
      y: ann.y - fs - 2,
      width,
      height,
    };
  }
  if (ann.kind === 'callout') {
    const fs = ann.fontSize || 12;
    const lines = (ann.text || '').split(/\r?\n/);
    const maxLen = Math.max(4, ...lines.map((l) => l.length));
    const boxW = Math.max(90, ann.width - 6, Math.round(maxLen * (fs * 0.6) + 14));
    const width = Math.max(ann.width, 32 + boxW);
    const height = Math.max(ann.height, Math.round(lines.length * fs * 1.3) + 6);
    return {
      x: ann.x,
      y: ann.y,
      width,
      height,
    };
  }
  return {
    x: ann.x,
    y: ann.y,
    width: ann.width,
    height: ann.height,
  };
}

export function doesRectMatchBox(rect: RectBox, box: SelectionBox): boolean {
  const rx2 = rect.x + rect.width;
  const ry2 = rect.y + rect.height;
  const bx2 = box.x + box.width;
  const by2 = box.y + box.height;

  if (box.mode === 'window') {
    return rect.x >= box.x && rect.y >= box.y && rx2 <= bx2 && ry2 <= by2;
  }
  return rect.x <= bx2 && rx2 >= box.x && rect.y <= by2 && ry2 >= box.y;
}

export function doesSegmentIntersectBox(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  box: RectBox
): boolean {
  const minX = box.x;
  const maxX = box.x + box.width;
  const minY = box.y;
  const maxY = box.y + box.height;

  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) {
      return q >= 0;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  return (
    clip(-dx, ax - minX) &&
    clip(dx, maxX - ax) &&
    clip(-dy, ay - minY) &&
    clip(dy, maxY - ay) &&
    t0 <= t1
  );
}

export function doesPolylineMatchBox(
  waypoints: Array<{ x: number; y: number }>,
  box: SelectionBox
): boolean {
  if (waypoints.length === 0) return false;
  const bx2 = box.x + box.width;
  const by2 = box.y + box.height;
  const pointInside = (p: { x: number; y: number }) =>
    p.x >= box.x && p.x <= bx2 && p.y >= box.y && p.y <= by2;

  if (box.mode === 'window') {
    return waypoints.every(pointInside);
  }
  if (waypoints.some(pointInside)) return true;
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (
      doesSegmentIntersectBox(
        waypoints[i].x,
        waypoints[i].y,
        waypoints[i + 1].x,
        waypoints[i + 1].y,
        box
      )
    ) {
      return true;
    }
  }
  return false;
}

export function selectEntitiesInBox(
  sheetDevices: E3Device[],
  sheetWires: E3Wire[],
  sheetAnnotations: E3Annotation[],
  box: SelectionBox,
  layers?: CadLayerStateMap,
  showGostFrame = true
): {
  deviceIds: string[];
  wireIds: string[];
  annotationIds: string[];
} {
  const resolved = resolveCadLayers(layers, showGostFrame);
  const deviceIds: string[] = [];
  const wireIds: string[] = [];
  const annotationIds: string[] = [];

  if (resolved.devices.visible && !resolved.devices.locked) {
    for (const dev of sheetDevices) {
      if (dev.bindingState === 'REMOVED_IN_FLUX') continue;
      if (doesRectMatchBox(getDeviceBounds(dev), box)) {
        deviceIds.push(dev.id);
      }
    }
  }

  if (resolved.wires.visible && !resolved.wires.locked) {
    for (const w of sheetWires) {
      if (doesPolylineMatchBox(w.waypoints, box)) {
        wireIds.push(w.id);
      }
    }
  }

  if (resolved.annotations.visible && !resolved.annotations.locked) {
    for (const ann of sheetAnnotations) {
      if (doesRectMatchBox(getAnnotationBounds(ann), box)) {
        annotationIds.push(ann.id);
      }
    }
  }

  return { deviceIds, wireIds, annotationIds };
}

export function mergeUniqueIds(existing: string[], incoming: string[]): string[] {
  const set = new Set(existing);
  for (const id of incoming) set.add(id);
  return Array.from(set);
}

export function toggleIdInSelection(existing: string[], id: string): string[] {
  if (existing.includes(id)) {
    return existing.filter((x) => x !== id);
  }
  return [...existing, id];
}

function extractDesignationPrefix(designation: string): string {
  const trimmed = designation.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (match && match[1]) return match[1];
  return trimmed || '-K';
}

export function buildClipboardPayload(
  project: E3Project,
  selectedDeviceIds: string[],
  _selectedWireIds: string[],
  selectedAnnotationIds: string[]
): CadClipboardPayload | null {
  const devSet = new Set(selectedDeviceIds);
  const annSet = new Set(selectedAnnotationIds);

  const devices = project.devices
    .filter((d) => devSet.has(d.id) && d.bindingState !== 'REMOVED_IN_FLUX')
    .map((d) => structuredClone(d));

  const copiedDevIds = new Set(devices.map((d) => d.id));
  // Internal wires connecting copied devices preserve the subcircuit topology
  const wires = project.wires
    .filter((w) => copiedDevIds.has(w.fromDeviceId) && copiedDevIds.has(w.toDeviceId))
    .map((w) => structuredClone(w));

  const annotations = (project.annotations || [])
    .filter((a) => annSet.has(a.id))
    .map((a) => structuredClone(a));

  if (devices.length === 0 && annotations.length === 0) {
    return null;
  }

  return {
    schemaVersion: 1,
    copiedAt: new Date().toISOString(),
    sourceSheetId: devices[0]?.sheetId || annotations[0]?.sheetId || project.sheets[0]?.id || '',
    devices,
    wires,
    annotations,
  };
}

export function pasteClipboardPayload(
  project: E3Project,
  payload: CadClipboardPayload,
  targetSheetId: string,
  options?: { offsetX?: number; offsetY?: number; gridSize?: number }
): {
  nextProject: E3Project;
  pastedDeviceIds: string[];
  pastedWireIds: string[];
  pastedAnnotationIds: string[];
} {
  const grid = Math.max(5, options?.gridSize ?? project.visualSettings.gridSize ?? 20);
  const snapVal = (v: number) => Math.round(v / grid) * grid;

  let dx = snapVal(options?.offsetX ?? 40);
  let dy = snapVal(options?.offsetY ?? 40);

  const targetSheet = project.sheets.find((s) => s.id === targetSheetId);
  const bounds = getSheetDrawableBounds(targetSheet);

  // Compute source bounding box so we can keep pasted block inside drawable sheet bounds
  const rects: RectBox[] = [
    ...payload.devices.map((d) => getDeviceBounds(d)),
    ...payload.annotations.map((a) => getAnnotationBounds(a)),
  ];
  if (bounds && rects.length > 0) {
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.width));
    const maxY = Math.max(...rects.map((r) => r.y + r.height));

    if (maxX + dx > bounds.maxX - 10) {
      dx = snapVal(Math.max(bounds.minX + 10 - minX, -40));
    }
    if (maxY + dy > bounds.maxY - 10) {
      dy = snapVal(Math.max(bounds.minY + 10 - minY, -40));
    }
    if (minX + dx < bounds.minX + 6) {
      dx = snapVal(bounds.minX + 10 - minX);
    }
    if (minY + dy < bounds.minY + 6) {
      dy = snapVal(bounds.minY + 10 - minY);
    }
  }

  const stamp = Date.now().toString(36);
  const devIdMap = new Map<string, string>();
  const pinIdMap = new Map<string, string>();

  const accumulatedDevices = [...project.devices];
  const pastedDevices: E3Device[] = [];

  payload.devices.forEach((src, idx) => {
    const newDevId = `dev-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`;
    const prefix = extractDesignationPrefix(src.designation);
    const designation = nextUniqueDesignation(accumulatedDevices, prefix);
    devIdMap.set(src.id, newDevId);

    const newPins = src.pins.map((p, pIdx) => {
      const newPinId = `${newDevId}-p${pIdx + 1}`;
      pinIdMap.set(`${src.id}:${p.id}`, newPinId);
      return { ...p, id: newPinId };
    });

    const cloned: E3Device = {
      ...structuredClone(src),
      id: newDevId,
      elementId: `el-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      designation,
      sheetId: targetSheetId,
      x: src.x + dx,
      y: src.y + dy,
      bindingState: 'PLACED',
      pins: newPins,
    };
    accumulatedDevices.push(cloned);
    pastedDevices.push(cloned);
  });

  const existingWireNumbers = new Set(project.wires.map((w) => w.wireNumber));
  const existingNets = new Set(project.wires.map((w) => w.netName));
  const netRemap = new Map<string, { netName: string; wireNumber: string }>();
  let wireSeq = project.wires.length + 1;

  const pastedWires: E3Wire[] = [];
  payload.wires.forEach((w, idx) => {
    const fromDeviceId = devIdMap.get(w.fromDeviceId);
    const toDeviceId = devIdMap.get(w.toDeviceId);
    const fromPinId = pinIdMap.get(`${w.fromDeviceId}:${w.fromPinId}`);
    const toPinId = pinIdMap.get(`${w.toDeviceId}:${w.toPinId}`);
    if (!fromDeviceId || !toDeviceId || !fromPinId || !toPinId) return;

    let mapped = netRemap.get(w.netName);
    if (!mapped) {
      while (existingNets.has(`NET_${wireSeq}`)) {
        wireSeq += 1;
      }
      const newNet = `NET_${wireSeq}`;
      let numCandidate = 100 + wireSeq;
      while (existingWireNumbers.has(String(numCandidate))) {
        numCandidate += 1;
      }
      const newWireNumber = String(numCandidate);
      existingNets.add(newNet);
      existingWireNumbers.add(newWireNumber);
      mapped = { netName: newNet, wireNumber: newWireNumber };
      netRemap.set(w.netName, mapped);
      wireSeq += 1;
    }

    pastedWires.push({
      ...structuredClone(w),
      id: `w-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      sheetId: targetSheetId,
      netName: mapped.netName,
      wireNumber: mapped.wireNumber,
      fromDeviceId,
      fromPinId,
      toDeviceId,
      toPinId,
      waypoints: w.waypoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
    });
  });

  const pastedAnnotations: E3Annotation[] = payload.annotations.map((ann, idx) => ({
    ...structuredClone(ann),
    id: `ann-${stamp}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
    sheetId: targetSheetId,
    x: ann.x + dx,
    y: ann.y + dy,
  }));

  const nextProject: E3Project = {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    devices: [...project.devices, ...pastedDevices],
    wires: [...project.wires, ...pastedWires],
    annotations: [...(project.annotations || []), ...pastedAnnotations],
  };

  return {
    nextProject,
    pastedDeviceIds: pastedDevices.map((d) => d.id),
    pastedWireIds: pastedWires.map((w) => w.id),
    pastedAnnotationIds: pastedAnnotations.map((a) => a.id),
  };
}

export function alignSelectedDevices(
  devices: E3Device[],
  selectedDeviceIds: string[],
  kind: DeviceAlignKind,
  gridSize = 20,
  snapToGrid = true
): E3Device[] {
  const idSet = new Set(selectedDeviceIds);
  const targets = devices.filter(
    (d) => idSet.has(d.id) && d.bindingState !== 'REMOVED_IN_FLUX'
  );
  if (targets.length < 2) return devices;

  const snapCoord = (v: number) => {
    if (!snapToGrid) return Math.round(v);
    const g = Math.max(5, gridSize);
    return Math.round(v / g) * g;
  };

  const boundsById = new Map<string, RectBox>();
  for (const d of targets) {
    boundsById.set(d.id, getDeviceBounds(d));
  }

  const minLeft = Math.min(...targets.map((d) => boundsById.get(d.id)!.x));
  const maxRight = Math.max(...targets.map((d) => {
    const b = boundsById.get(d.id)!;
    return b.x + b.width;
  }));
  const minTop = Math.min(...targets.map((d) => boundsById.get(d.id)!.y));
  const maxBottom = Math.max(...targets.map((d) => {
    const b = boundsById.get(d.id)!;
    return b.y + b.height;
  }));
  const midX = (minLeft + maxRight) / 2;
  const midY = (minTop + maxBottom) / 2;

  const newPosById = new Map<string, { x: number; y: number }>();

  if (kind === 'distribute-x' && targets.length >= 3) {
    const sorted = [...targets].sort(
      (a, b) => boundsById.get(a.id)!.x - boundsById.get(b.id)!.x
    );
    const firstB = boundsById.get(sorted[0].id)!;
    const lastB = boundsById.get(sorted[sorted.length - 1].id)!;
    const totalWidths = sorted.reduce((acc, d) => acc + boundsById.get(d.id)!.width, 0);
    const totalSpan = lastB.x + lastB.width - firstB.x;
    const gap = (totalSpan - totalWidths) / (sorted.length - 1);
    let cursorX = firstB.x;
    sorted.forEach((d, idx) => {
      const b = boundsById.get(d.id)!;
      if (idx === 0 || idx === sorted.length - 1) {
        newPosById.set(d.id, { x: d.x, y: d.y });
      } else {
        const deltaX = snapCoord(cursorX) - b.x;
        newPosById.set(d.id, { x: d.x + deltaX, y: d.y });
      }
      cursorX += b.width + gap;
    });
  } else if (kind === 'distribute-y' && targets.length >= 3) {
    const sorted = [...targets].sort(
      (a, b) => boundsById.get(a.id)!.y - boundsById.get(b.id)!.y
    );
    const firstB = boundsById.get(sorted[0].id)!;
    const lastB = boundsById.get(sorted[sorted.length - 1].id)!;
    const totalHeights = sorted.reduce((acc, d) => acc + boundsById.get(d.id)!.height, 0);
    const totalSpan = lastB.y + lastB.height - firstB.y;
    const gap = (totalSpan - totalHeights) / (sorted.length - 1);
    let cursorY = firstB.y;
    sorted.forEach((d, idx) => {
      const b = boundsById.get(d.id)!;
      if (idx === 0 || idx === sorted.length - 1) {
        newPosById.set(d.id, { x: d.x, y: d.y });
      } else {
        const deltaY = snapCoord(cursorY) - b.y;
        newPosById.set(d.id, { x: d.x, y: d.y + deltaY });
      }
      cursorY += b.height + gap;
    });
  } else {
    for (const d of targets) {
      const b = boundsById.get(d.id)!;
      const offsetX = b.x - d.x;
      const offsetY = b.y - d.y;
      let targetBoundX = b.x;
      let targetBoundY = b.y;
      if (kind === 'left') targetBoundX = minLeft;
      else if (kind === 'center-x') targetBoundX = midX - b.width / 2;
      else if (kind === 'right') targetBoundX = maxRight - b.width;
      else if (kind === 'top') targetBoundY = minTop;
      else if (kind === 'center-y') targetBoundY = midY - b.height / 2;
      else if (kind === 'bottom') targetBoundY = maxBottom - b.height;

      const nextX =
        kind === 'left' || kind === 'center-x' || kind === 'right'
          ? snapCoord(targetBoundX - offsetX)
          : d.x;
      const nextY =
        kind === 'top' || kind === 'center-y' || kind === 'bottom'
          ? snapCoord(targetBoundY - offsetY)
          : d.y;
      newPosById.set(d.id, { x: nextX, y: nextY });
    }
  }

  return devices.map((d) => {
    const pos = newPosById.get(d.id);
    return pos ? { ...d, x: pos.x, y: pos.y } : d;
  });
}
