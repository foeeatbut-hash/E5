import { CAD_LAYER_ORDER, resolveCadLayers } from './cadLayers.ts';
import { exportSheetsToDxf } from './dxfExporter.ts';
import { E3_CATALOG } from './e3Catalog.ts';
import { DEFAULT_VISUAL_SETTINGS } from './e3Seed.ts';
import type {
  AnnotationKind,
  BomRow,
  CableJournalRow,
  CadLayerId,
  CustomSymbolSpec,
  E3Annotation,
  E3Attribute,
  E3Cable,
  E3Device,
  E3Pin,
  E3Project,
  E3Sheet,
  E3SymbolDef,
  E3VisualSettings,
  E3Wire,
  ErcIssue,
  FluxBridgeBundle,
  FluxExportNode,
  NetWireLengthRow,
  PinDirection,
  SchematicFontFamily,
  SheetChangeArea,
  SheetFormat,
  SignalType,
  TerminalPlanRow,
} from './e3Types.ts';
import { getSheetRevisionNumber, normalizeProjectSheetRevisions } from './sheetRevisions.ts';
import { resolveDynamicSymbolText, sampleArcPoints } from './symbolLibrary.ts';

export function getAbsolutePinPos(device: E3Device, pin: E3Pin): { x: number; y: number; direction: PinDirection } {
  const cx = device.width / 2;
  const cy = device.height / 2;
  const lx = pin.dx - cx;
  const ly = pin.dy - cy;
  const dirs: PinDirection[] = ['top', 'right', 'bottom', 'left'];
  const idx = dirs.indexOf(pin.direction);
  const steps = (device.rotation / 90) % 4;
  const rotatedDir = dirs[(idx + steps) % 4];

  let rx = lx;
  let ry = ly;
  if (steps === 1) {
    rx = -ly;
    ry = lx;
  } else if (steps === 2) {
    rx = -lx;
    ry = -ly;
  } else if (steps === 3) {
    rx = ly;
    ry = -lx;
  }

  return {
    x: Math.round(device.x + cx + rx),
    y: Math.round(device.y + cy + ry),
    direction: rotatedDir,
  };
}

export function getDeviceBounds(
  device: Pick<E3Device, 'id' | 'x' | 'y' | 'width' | 'height' | 'rotation'>
): RoutingRect {
  const rot = ((device.rotation || 0) % 360 + 360) % 360;
  if (rot === 90 || rot === 270) {
    const cx = device.x + device.width / 2;
    const cy = device.y + device.height / 2;
    return {
      id: device.id,
      x: Math.round(cx - device.height / 2),
      y: Math.round(cy - device.width / 2),
      width: device.height,
      height: device.width,
    };
  }
  return {
    id: device.id,
    x: device.x,
    y: device.y,
    width: device.width,
    height: device.height,
  };
}

export interface SheetDrawableBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  stampBox?: RoutingRect;
}

export function getSheetDrawableBounds(sheet?: Pick<E3Sheet, 'width' | 'height'>): SheetDrawableBounds | undefined {
  if (!sheet) return undefined;
  const w = sheet.width || 1400;
  const h = sheet.height || 920;
  return {
    minX: 28,
    minY: 22,
    maxX: Math.max(120, w - 12),
    maxY: Math.max(120, h - 12),
    stampBox: {
      x: Math.max(28, w - 566),
      y: Math.max(22, h - 184),
      width: 556,
      height: 174,
    },
  };
}

export interface RoutingRect {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WireSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  netName?: string;
}

function segmentIntersectsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: RoutingRect,
  pad = 6
): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const rx1 = r.x - pad;
  const ry1 = r.y - pad;
  const rx2 = r.x + r.width + pad;
  const ry2 = r.y + r.height + pad;
  return maxX > rx1 && minX < rx2 && maxY > ry1 && minY < ry2;
}

function pathHitsAnyObstacle(
  pts: Array<{ x: number; y: number }>,
  obstacles: RoutingRect[],
  pad = 6
): RoutingRect | undefined {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    for (const obs of obstacles) {
      if (segmentIntersectsRect(a, b, obs, pad)) {
        return obs;
      }
    }
  }
  return undefined;
}

export function extractWireSegments(
  waypoints: Array<{ x: number; y: number }>,
  netName?: string
): WireSegment[] {
  const segs: WireSegment[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    if (a.x !== b.x || a.y !== b.y) {
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, netName });
    }
  }
  return segs;
}

/** Computes collinear overlap, near-parallel proximity, and perpendicular crossings against existing wires. */
function measureWireConflicts(
  a: { x: number; y: number },
  b: { x: number; y: number },
  occupied: WireSegment[],
  currentNetName?: string,
  wireGap = 8
): { overlapLen: number; nearParallelLen: number; sameNetOverlapLen: number; crossings: number; touchConflicts: number } {
  let overlapLen = 0;
  let nearParallelLen = 0;
  let sameNetOverlapLen = 0;
  let crossings = 0;
  let touchConflicts = 0;
  const isHoriz = Math.abs(a.y - b.y) < 0.5;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  for (const s of occupied) {
    const sHoriz = Math.abs(s.y1 - s.y2) < 0.5;
    const sMinX = Math.min(s.x1, s.x2);
    const sMaxX = Math.max(s.x1, s.x2);
    const sMinY = Math.min(s.y1, s.y2);
    const sMaxY = Math.max(s.y1, s.y2);
    const sameNet = Boolean(currentNetName && s.netName && currentNetName === s.netName);

    if (isHoriz && sHoriz) {
      const dist = Math.abs(a.y - s.y1);
      if (dist < wireGap) {
        const ov = Math.min(maxX, sMaxX) - Math.max(minX, sMinX);
        if (ov > 0.5) {
          if (sameNet) {
            if (dist < 1.5) sameNetOverlapLen += ov;
            else nearParallelLen += ov;
          } else if (dist < 2.5) {
            overlapLen += ov;
          } else {
            nearParallelLen += ov;
          }
        }
      }
    } else if (!isHoriz && !sHoriz) {
      const dist = Math.abs(a.x - s.x1);
      if (dist < wireGap) {
        const ov = Math.min(maxY, sMaxY) - Math.max(minY, sMinY);
        if (ov > 0.5) {
          if (sameNet) {
            if (dist < 1.5) sameNetOverlapLen += ov;
            else nearParallelLen += ov;
          } else if (dist < 2.5) {
            overlapLen += ov;
          } else {
            nearParallelLen += ov;
          }
        }
      }
    } else if (isHoriz && !sHoriz) {
      if (s.x1 > minX + 1 && s.x1 < maxX - 1 && a.y > sMinY + 1 && a.y < sMaxY - 1) {
        crossings += 1;
      } else if (!sameNet) {
        // Endpoint/corner touching interior of another net's perpendicular line
        const hitsEndpoint =
          (Math.abs(a.x - s.x1) < 2.5 || Math.abs(b.x - s.x1) < 2.5) &&
          a.y > sMinY + 1 &&
          a.y < sMaxY - 1;
        const hitsOtherEnd =
          a.y >= sMinY - 2 && a.y <= sMaxY + 2 && s.x1 > minX + 1 && s.x1 < maxX - 1 &&
          (Math.abs(a.y - s.y1) < 2.5 || Math.abs(a.y - s.y2) < 2.5);
        if (hitsEndpoint || hitsOtherEnd) touchConflicts += 1;
      }
    } else if (!isHoriz && sHoriz) {
      if (a.x > sMinX + 1 && a.x < sMaxX - 1 && s.y1 > minY + 1 && s.y1 < maxY - 1) {
        crossings += 1;
      } else if (!sameNet) {
        const hitsEndpoint =
          (Math.abs(a.y - s.y1) < 2.5 || Math.abs(b.y - s.y1) < 2.5) &&
          a.x > sMinX + 1 &&
          a.x < sMaxX - 1;
        const hitsOtherEnd =
          a.x >= sMinX - 2 && a.x <= sMaxX + 2 && s.y1 > minY + 1 && s.y1 < maxY - 1 &&
          (Math.abs(a.x - s.x1) < 2.5 || Math.abs(a.x - s.x2) < 2.5);
        if (hitsEndpoint || hitsOtherEnd) touchConflicts += 1;
      }
    }
  }

  return { overlapLen, nearParallelLen, sameNetOverlapLen, crossings, touchConflicts };
}

class MinHeap<T extends { f: number }> {
  private data: T[] = [];
  get size(): number {
    return this.data.length;
  }
  push(item: T): void {
    const arr = this.data;
    arr.push(item);
    let idx = arr.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (arr[parent].f <= arr[idx].f) break;
      const tmp = arr[parent];
      arr[parent] = arr[idx];
      arr[idx] = tmp;
      idx = parent;
    }
  }
  pop(): T | undefined {
    const arr = this.data;
    if (arr.length === 0) return undefined;
    const top = arr[0];
    const last = arr.pop()!;
    if (arr.length > 0) {
      arr[0] = last;
      let idx = 0;
      const n = arr.length;
      while (true) {
        const left = (idx << 1) + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < n && arr[left].f < arr[smallest].f) smallest = left;
        if (right < n && arr[right].f < arr[smallest].f) smallest = right;
        if (smallest === idx) break;
        const tmp = arr[idx];
        arr[idx] = arr[smallest];
        arr[smallest] = tmp;
        idx = smallest;
      }
    }
    return top;
  }
}

export interface AutoRouteEndpoint {
  x: number;
  y: number;
  direction: PinDirection;
  deviceId?: string;
}

export interface AutoRouteOptions {
  netName?: string;
  sheetBounds?: SheetDrawableBounds;
  wireGap?: number;
  exitStub?: number;
  entryStub?: number;
}

export function autoRouteOrthogonal(
  p1: AutoRouteEndpoint,
  p2: AutoRouteEndpoint,
  stub = 20,
  obstacles: RoutingRect[] = [],
  laneOffset = 0,
  occupiedSegments: WireSegment[] = [],
  options?: AutoRouteOptions
): Array<{ x: number; y: number }> {
  const step = Math.max(12, stub);
  const exitStep = Math.max(10, options?.exitStub ?? step);
  const entryStep = Math.max(10, options?.entryStub ?? step);
  const wireGap = Math.max(6, options?.wireGap ?? 8);
  const netName = options?.netName;
  const sheetBounds = options?.sheetBounds;

  // Separate interior check for endpoint devices vs external obstacles
  const externalObstacles = obstacles.filter(
    (o) => !o.id || (o.id !== p1.deviceId && o.id !== p2.deviceId)
  );
  const endpointObstacles = obstacles.filter(
    (o) => o.id && (o.id === p1.deviceId || o.id === p2.deviceId)
  );

  // 1. Direct straight collinear line if exact alignment and completely clear of obstacles & conflicts
  if (
    ((p1.direction === 'right' && p2.direction === 'left' && p2.x >= p1.x) ||
      (p1.direction === 'left' && p2.direction === 'right' && p2.x <= p1.x)) &&
    Math.abs(p1.y - p2.y) < 0.5
  ) {
    const direct = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
    const conflicts = measureWireConflicts(direct[0], direct[1], occupiedSegments, netName, wireGap);
    if (
      !pathHitsAnyObstacle(direct, externalObstacles, 5) &&
      !pathHitsAnyObstacle(direct, endpointObstacles, -2) &&
      conflicts.overlapLen === 0 &&
      conflicts.nearParallelLen === 0 &&
      conflicts.touchConflicts === 0
    ) {
      return deduplicatePoints(direct);
    }
  }
  if (
    ((p1.direction === 'bottom' && p2.direction === 'top' && p2.y >= p1.y) ||
      (p1.direction === 'top' && p2.direction === 'bottom' && p2.y <= p1.y)) &&
    Math.abs(p1.x - p2.x) < 0.5
  ) {
    const direct = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
    const conflicts = measureWireConflicts(direct[0], direct[1], occupiedSegments, netName, wireGap);
    if (
      !pathHitsAnyObstacle(direct, externalObstacles, 5) &&
      !pathHitsAnyObstacle(direct, endpointObstacles, -2) &&
      conflicts.overlapLen === 0 &&
      conflicts.nearParallelLen === 0 &&
      conflicts.touchConflicts === 0
    ) {
      return deduplicatePoints(direct);
    }
  }

  // Filter nearby obstacles if sheet is very crowded so A* remains sub-millisecond
  const margin = 460;
  const minBoxX = Math.min(p1.x, p2.x) - margin;
  const maxBoxX = Math.max(p1.x, p2.x) + margin;
  const minBoxY = Math.min(p1.y, p2.y) - margin;
  const maxBoxY = Math.max(p1.y, p2.y) + margin;
  const localObstacles =
    obstacles.length > 35
      ? obstacles.filter(
          (o) =>
            o.x + o.width >= minBoxX &&
            o.x <= maxBoxX &&
            o.y + o.height >= minBoxY &&
            o.y <= maxBoxY
        )
      : obstacles;

  // Build visibility grid coordinates with parallel bus channel tracks
  const rawXs: number[] = [p1.x, p2.x];
  const rawYs: number[] = [p1.y, p2.y];

  const pushExitTracks = (pt: AutoRouteEndpoint, baseStep: number) => {
    const offsets = [baseStep, baseStep + 12, baseStep + 24, baseStep + 36, baseStep + 48, 12, 22, 34];
    for (const d of offsets) {
      if (pt.direction === 'left') rawXs.push(pt.x - d);
      else if (pt.direction === 'right') rawXs.push(pt.x + d);
      else if (pt.direction === 'top') rawYs.push(pt.y - d);
      else rawYs.push(pt.y + d);
    }
  };
  pushExitTracks(p1, exitStep);
  pushExitTracks(p2, entryStep);

  const midX = Math.round((p1.x + p2.x) / 2) + laneOffset;
  const midY = Math.round((p1.y + p2.y) / 2) + laneOffset;
  for (const delta of [-36, -24, -12, 0, 12, 24, 36]) {
    rawXs.push(midX + delta);
    rawYs.push(midY + delta);
  }

  const channelOffsets = [10, 20, 32, 44, 58];
  for (const obs of localObstacles) {
    for (const c of channelOffsets) {
      rawXs.push(obs.x - c, obs.x + obs.width + c);
      rawYs.push(obs.y - c, obs.y + obs.height + c);
    }
  }

  if (sheetBounds) {
    rawXs.push(sheetBounds.minX + 10, sheetBounds.maxX - 10);
    rawYs.push(sheetBounds.minY + 10, sheetBounds.maxY - 10);
    if (sheetBounds.stampBox) {
      rawXs.push(sheetBounds.stampBox.x - 14, sheetBounds.stampBox.x - 28);
      rawYs.push(sheetBounds.stampBox.y - 14, sheetBounds.stampBox.y - 28);
    }
  }

  const dedupCoordList = (
    vals: number[],
    anchors: number[],
    minB?: number,
    maxB?: number
  ): number[] => {
    const filtered = vals
      .map((v) => Math.round(v))
      .filter((v) => {
        if (anchors.some((a) => Math.abs(v - Math.round(a)) <= 1)) return true;
        if (minB !== undefined && v < minB) return false;
        if (maxB !== undefined && v > maxB) return false;
        return true;
      });
    const sorted = Array.from(new Set(filtered)).sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
      const isAnchor = anchors.some((a) => Math.abs(v - Math.round(a)) <= 1);
      const prev = out[out.length - 1];
      if (prev === undefined || isAnchor || v - prev >= 5) {
        out.push(v);
      }
    }
    return out;
  };

  const xs = dedupCoordList(rawXs, [p1.x, p2.x], sheetBounds?.minX, sheetBounds?.maxX);
  const ys = dedupCoordList(rawYs, [p1.y, p2.y], sheetBounds?.minY, sheetBounds?.maxY);

  const startXi = xs.findIndex((x) => Math.abs(x - Math.round(p1.x)) <= 1);
  const startYi = ys.findIndex((y) => Math.abs(y - Math.round(p1.y)) <= 1);
  const endXi = xs.findIndex((x) => Math.abs(x - Math.round(p2.x)) <= 1);
  const endYi = ys.findIndex((y) => Math.abs(y - Math.round(p2.y)) <= 1);

  if (startXi < 0 || startYi < 0 || endXi < 0 || endYi < 0) {
    return ensureOrthogonalPoints([{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }]);
  }

  // Allowed pin-exit direction check: leaving p1 or entering p2 must move cleanly along pin axis
  const isWrongExitFromPin = (pt: AutoRouteEndpoint, nx: number, ny: number): boolean => {
    if (pt.direction === 'left') return nx >= pt.x || Math.abs(ny - pt.y) > 1;
    if (pt.direction === 'right') return nx <= pt.x || Math.abs(ny - pt.y) > 1;
    if (pt.direction === 'top') return ny >= pt.y || Math.abs(nx - pt.x) > 1;
    if (pt.direction === 'bottom') return ny <= pt.y || Math.abs(nx - pt.x) > 1;
    return false;
  };

  const W = xs.length;
  const H = ys.length;
  // State index = (yi * W + xi) * 3 + dir (0 = horiz, 1 = vert, 2 = start)
  const totalStates = W * H * 3;
  const gScore = new Float64Array(totalStates);
  gScore.fill(Infinity);
  const parent = new Int32Array(totalStates);
  parent.fill(-1);

  const startState = (startYi * W + startXi) * 3 + 2;
  gScore[startState] = 0;

  const heap = new MinHeap<{ s: number; f: number }>();
  heap.push({
    s: startState,
    f: Math.abs(xs[endXi] - xs[startXi]) + Math.abs(ys[endYi] - ys[startYi]),
  });

  const dirs: Array<[number, number, number]> = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 1],
    [0, -1, 1],
  ];

  let bestGoalState = -1;
  let bestGoalCost = Infinity;
  let expanded = 0;
  const maxExpand = 22000;

  while (heap.size > 0 && expanded < maxExpand) {
    const cur = heap.pop()!;
    const curG = gScore[cur.s];
    if (cur.f > bestGoalCost + 1) break;

    const lastDir = cur.s % 3;
    const cellIdx = (cur.s - lastDir) / 3;
    const xi = cellIdx % W;
    const yi = (cellIdx - xi) / W;

    // Prune stale heap entries
    const curH = Math.abs(xs[endXi] - xs[xi]) + Math.abs(ys[endYi] - ys[yi]);
    if (cur.f > curG + curH + 1e-6) continue;

    expanded += 1;

    if (xi === endXi && yi === endYi) {
      if (curG < bestGoalCost) {
        bestGoalCost = curG;
        bestGoalState = cur.s;
      }
      continue;
    }

    const ax = xs[xi];
    const ay = ys[yi];
    const atStartPin = xi === startXi && yi === startYi;

    for (const [dx, dy, nextDir] of dirs) {
      const nxi = xi + dx;
      const nyi = yi + dy;
      if (nxi < 0 || nxi >= W || nyi < 0 || nyi >= H) continue;
      // Don't reverse 180 deg directly along same axis
      if (lastDir !== 2 && lastDir === nextDir && !atStartPin) {
        const prevState = parent[cur.s];
        if (prevState >= 0) {
          const pCell = Math.floor(prevState / 3);
          const pxi = pCell % W;
          const pyi = (pCell - pxi) / W;
          if (pxi === nxi && pyi === nyi) continue;
        }
      }

      const bx = xs[nxi];
      const by = ys[nyi];
      const touchesStart = atStartPin;
      const touchesEnd = nxi === endXi && nyi === endYi;

      // Enforce pin direction orientation on exit/entry so wires exit cleanly out of pins
      if (touchesStart && isWrongExitFromPin(p1, bx, by)) continue;
      if (touchesEnd && isWrongExitFromPin(p2, ax, ay)) continue;

      let obsPenalty = 0;
      const segA = { x: ax, y: ay };
      const segB = { x: bx, y: by };

      for (const obs of localObstacles) {
        const isStartDev = obs.id && obs.id === p1.deviceId && touchesStart;
        const isEndDev = obs.id && obs.id === p2.deviceId && touchesEnd;
        const pad = isStartDev || isEndDev ? -2 : 5;
        if (segmentIntersectsRect(segA, segB, obs, pad)) {
          obsPenalty += 60000;
        }
      }

      // Keep wires inside GOST drawable sheet bounds and outside GOST stamp box
      if (sheetBounds) {
        if (
          !touchesStart &&
          !touchesEnd &&
          (bx < sheetBounds.minX ||
            bx > sheetBounds.maxX ||
            by < sheetBounds.minY ||
            by > sheetBounds.maxY)
        ) {
          obsPenalty += 30000;
        }
        if (sheetBounds.stampBox && segmentIntersectsRect(segA, segB, sheetBounds.stampBox, 4)) {
          obsPenalty += 25000;
        }
      }

      // Wire-to-wire separation penalty (anti-merging & net awareness)
      const { overlapLen, nearParallelLen, sameNetOverlapLen, crossings, touchConflicts } =
        occupiedSegments.length > 0
          ? measureWireConflicts(segA, segB, occupiedSegments, netName, wireGap)
          : { overlapLen: 0, nearParallelLen: 0, sameNetOverlapLen: 0, crossings: 0, touchConflicts: 0 };

      const segLen = Math.abs(bx - ax) + Math.abs(by - ay);
      const bendPenalty = lastDir !== 2 && lastDir !== nextDir ? 26 : 0;
      // Encourage first exit bend to align close to desired exitStep/entryStep for bundle fan-out
      let stubBias = 0;
      if (touchesStart) {
        stubBias = Math.abs(segLen - exitStep) * 0.4;
      } else if (touchesEnd) {
        stubBias = Math.abs(segLen - entryStep) * 0.4;
      }
      const wirePenalty =
        (overlapLen > 0 ? 18000 + overlapLen * 220 : 0) +
        (nearParallelLen > 0 ? 2400 + nearParallelLen * 40 : 0) +
        (sameNetOverlapLen > 0 ? sameNetOverlapLen * 10 : 0) +
        touchConflicts * 6500;
      const crossPenalty = crossings * 65;

      const nextG = curG + segLen + bendPenalty + stubBias + wirePenalty + crossPenalty + obsPenalty;
      const nextState = (nyi * W + nxi) * 3 + nextDir;
      if (nextG < gScore[nextState]) {
        gScore[nextState] = nextG;
        parent[nextState] = cur.s;
        const h = Math.abs(xs[endXi] - bx) + Math.abs(ys[endYi] - by);
        heap.push({ s: nextState, f: nextG + h });
      }
    }
  }

  if (bestGoalState >= 0) {
    const rawPts: Array<{ x: number; y: number }> = [];
    let s = bestGoalState;
    while (s >= 0) {
      const dir = s % 3;
      const cell = (s - dir) / 3;
      const xi = cell % W;
      const yi = (cell - xi) / W;
      rawPts.push({ x: xs[xi], y: ys[yi] });
      s = parent[s];
    }
    rawPts.reverse();
    rawPts[0] = { x: p1.x, y: p1.y };
    rawPts[rawPts.length - 1] = { x: p2.x, y: p2.y };
    return ensureOrthogonalPoints(simplifyColinearPoints(deduplicatePoints(rawPts)));
  }

  // Fallback orthogonal route if graph search couldn't finish
  const offsetPt = (pt: AutoRouteEndpoint, d: number) => {
    if (pt.direction === 'top') return { x: pt.x, y: pt.y - d };
    if (pt.direction === 'bottom') return { x: pt.x, y: pt.y + d };
    if (pt.direction === 'left') return { x: pt.x - d, y: pt.y };
    return { x: pt.x + d, y: pt.y };
  };
  const s1 = offsetPt(p1, exitStep);
  const s2 = offsetPt(p2, entryStep);
  const pts: Array<{ x: number; y: number }> = [{ x: p1.x, y: p1.y }, s1];
  const isH1 = p1.direction === 'left' || p1.direction === 'right';
  const isH2 = p2.direction === 'left' || p2.direction === 'right';
  if (isH1 && isH2) {
    pts.push({ x: midX, y: s1.y }, { x: midX, y: s2.y });
  } else if (!isH1 && !isH2) {
    pts.push({ x: s1.x, y: midY }, { x: s2.x, y: midY });
  } else if (isH1) {
    pts.push({ x: s2.x, y: s1.y });
  } else {
    pts.push({ x: s1.x, y: s2.y });
  }
  pts.push(s2, { x: p2.x, y: p2.y });
  return ensureOrthogonalPoints(simplifyColinearPoints(deduplicatePoints(pts)));
}

function ensureOrthogonalPoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 1) return points;
  const out: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const curr = points[i];
    if (prev.x !== curr.x && prev.y !== curr.y) {
      out.push({ x: curr.x, y: prev.y });
    }
    if (prev.x !== curr.x || prev.y !== curr.y) {
      out.push(curr);
    }
  }
  return simplifyColinearPoints(deduplicatePoints(out));
}

function simplifyColinearPoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;
  const out: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const sameX = prev.x === curr.x && curr.x === next.x;
    const sameY = prev.y === curr.y && curr.y === next.y;
    if (!sameX && !sameY) {
      out.push(curr);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function assignBundleRoutingPlans(
  wires: E3Wire[],
  devMap: Map<string, E3Device>,
  stub = 20
): Array<{ wire: E3Wire; abs1: AutoRouteEndpoint; abs2: AutoRouteEndpoint; exitStub: number; entryStub: number; laneOffset: number }> {
  type WireMeta = {
    wire: E3Wire;
    abs1: AutoRouteEndpoint;
    abs2: AutoRouteEndpoint;
    bundleKey: string;
    sortCoord: number;
  };
  const metas: WireMeta[] = [];
  for (const w of wires) {
    const d1 = devMap.get(w.fromDeviceId);
    const d2 = devMap.get(w.toDeviceId);
    const p1 = d1?.pins.find((p) => p.id === w.fromPinId);
    const p2 = d2?.pins.find((p) => p.id === w.toPinId);
    if (!d1 || !d2 || !p1 || !p2) continue;
    const abs1: AutoRouteEndpoint = { ...getAbsolutePinPos(d1, p1), deviceId: d1.id };
    const abs2: AutoRouteEndpoint = { ...getAbsolutePinPos(d2, p2), deviceId: d2.id };
    const pairKey = [d1.id, d2.id].sort().join('|');
    const dirKey = `${abs1.direction}->${abs2.direction}`;
    const primaryCoord =
      abs1.direction === 'top' || abs1.direction === 'bottom' ? abs1.x : abs1.y;
    metas.push({
      wire: w,
      abs1,
      abs2,
      bundleKey: `${pairKey}:${dirKey}`,
      sortCoord: primaryCoord,
    });
  }

  const byBundle = new Map<string, WireMeta[]>();
  for (const m of metas) {
    const arr = byBundle.get(m.bundleKey) || [];
    arr.push(m);
    byBundle.set(m.bundleKey, arr);
  }

  const plans: Array<{
    wire: E3Wire;
    abs1: AutoRouteEndpoint;
    abs2: AutoRouteEndpoint;
    exitStub: number;
    entryStub: number;
    laneOffset: number;
  }> = [];

  for (const group of byBundle.values()) {
    group.sort((a, b) => a.sortCoord - b.sortCoord || a.wire.id.localeCompare(b.wire.id, 'ru', { numeric: true }));
    const n = group.length;
    const goingRight = group.reduce((s, m) => s + (m.abs2.x - m.abs1.x), 0) >= 0;
    const goingDown = group.reduce((s, m) => s + (m.abs2.y - m.abs1.y), 0) >= 0;

    group.forEach((m, i) => {
      let exitStub = stub;
      let entryStub = stub;
      let laneOffset = 0;
      if (n > 1) {
        const isVertExit = m.abs1.direction === 'bottom' || m.abs1.direction === 'top';
        const invertExit = isVertExit ? goingRight : goingDown;
        const exitIdx = invertExit ? n - 1 - i : i;
        const entryIdx = i;
        exitStub = 12 + exitIdx * 12;
        entryStub = 12 + entryIdx * 12;
        laneOffset = Math.round((i - (n - 1) / 2) * 14);
      }
      plans.push({
        wire: m.wire,
        abs1: m.abs1,
        abs2: m.abs2,
        exitStub,
        entryStub,
        laneOffset,
      });
    });
  }

  // Deterministic order: shortest span or multi-wire bundles cleanly sequenced
  plans.sort(
    (a, b) =>
      Math.hypot(a.abs2.x - a.abs1.x, a.abs2.y - a.abs1.y) -
        Math.hypot(b.abs2.x - b.abs1.x, b.abs2.y - b.abs1.y) ||
      a.wire.id.localeCompare(b.wire.id, 'ru', { numeric: true })
  );
  return plans;
}

/** Re-routes all wires attached to one or more moved/updated devices, preserving stationary wire separation. */
export function rerouteAttachedWires(
  movedDeviceIds: string | string[],
  allDevices: E3Device[],
  allWires: E3Wire[],
  stub = 20,
  sheets?: E3Sheet[]
): E3Wire[] {
  const movedSet = new Set(Array.isArray(movedDeviceIds) ? movedDeviceIds : [movedDeviceIds]);
  const devMap = new Map(allDevices.map((d) => [d.id, d]));
  const sheetMap = new Map((sheets || []).map((s) => [s.id, s]));

  // Seed occupied segments from stationary wires on affected sheets
  const affectedSheets = new Set<string>();
  for (const w of allWires) {
    if (movedSet.has(w.fromDeviceId) || movedSet.has(w.toDeviceId)) {
      affectedSheets.add(w.sheetId);
    }
  }
  if (affectedSheets.size === 0) return allWires;

  const occupiedBySheet = new Map<string, WireSegment[]>();
  const obstaclesBySheet = new Map<string, RoutingRect[]>();
  for (const shId of affectedSheets) {
    const sheetObs = allDevices
      .filter((d) => d.sheetId === shId && d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
      .map((d) => getDeviceBounds(d));
    obstaclesBySheet.set(shId, sheetObs);

    const occ: WireSegment[] = [];
    for (const w of allWires) {
      if (w.sheetId !== shId) continue;
      if (movedSet.has(w.fromDeviceId) || movedSet.has(w.toDeviceId)) continue;
      occ.push(...extractWireSegments(w.waypoints, w.netName));
    }
    occupiedBySheet.set(shId, occ);
  }

  const attachedWires = allWires.filter(
    (w) => movedSet.has(w.fromDeviceId) || movedSet.has(w.toDeviceId)
  );
  const plans = assignBundleRoutingPlans(attachedWires, devMap, stub);

  const routedById = new Map<string, Array<{ x: number; y: number }>>();
  for (const plan of plans) {
    const w = plan.wire;
    const occ = occupiedBySheet.get(w.sheetId) || [];
    const obs = obstaclesBySheet.get(w.sheetId) || [];
    const sheetBounds = getSheetDrawableBounds(sheetMap.get(w.sheetId));
    const pts = autoRouteOrthogonal(plan.abs1, plan.abs2, stub, obs, plan.laneOffset, occ, {
      netName: w.netName,
      sheetBounds,
      exitStub: plan.exitStub,
      entryStub: plan.entryStub,
    });
    routedById.set(w.id, pts);
    occ.push(...extractWireSegments(pts, w.netName));
    occupiedBySheet.set(w.sheetId, occ);
  }

  return allWires.map((w) => {
    const nextPts = routedById.get(w.id);
    return nextPts ? { ...w, waypoints: nextPts } : w;
  });
}

/** Re-routes all wires on a sheet sequentially with full device avoidance & non-overlapping channels. */
export function routeSheetWiresCleanly(
  devices: E3Device[],
  wires: E3Wire[],
  targetSheetId: string,
  gridSize = 20,
  sheets?: E3Sheet[]
): E3Wire[] {
  const sheetDevices = devices.filter(
    (d) => d.sheetId === targetSheetId && d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix'
  );
  const devMap = new Map(sheetDevices.map((d) => [d.id, d]));
  const obstacles: RoutingRect[] = sheetDevices.map((d) => getDeviceBounds(d));
  const targetSheet = sheets?.find((s) => s.id === targetSheetId);
  const sheetBounds = getSheetDrawableBounds(targetSheet);

  const targetWires = wires.filter((w) => w.sheetId === targetSheetId);
  const manualWires = targetWires.filter((w) => w.manualRoute);
  const autoWires = targetWires.filter((w) => !w.manualRoute);
  const plans = assignBundleRoutingPlans(autoWires, devMap, Math.max(16, Math.round(gridSize)));
  const occupied: WireSegment[] = manualWires.flatMap((w) =>
    extractWireSegments(w.waypoints, w.netName)
  );
  const routedById = new Map<string, Array<{ x: number; y: number }>>();

  for (const plan of plans) {
    const w = plan.wire;
    const pts = autoRouteOrthogonal(plan.abs1, plan.abs2, 20, obstacles, plan.laneOffset, occupied, {
      netName: w.netName,
      sheetBounds,
      exitStub: plan.exitStub,
      entryStub: plan.entryStub,
    });
    routedById.set(w.id, pts);
    occupied.push(...extractWireSegments(pts, w.netName));
  }

  return wires.map((w) => {
    if (w.sheetId !== targetSheetId || w.manualRoute) return w;
    const pts = routedById.get(w.id);
    return pts ? { ...w, waypoints: pts } : w;
  });
}

export interface WireJunctionDot {
  x: number;
  y: number;
  netName: string;
  signalType: SignalType;
}

/** Detects both multi-way shared nodes (>=3 wires) and T-tap endpoints resting on another same-net wire segment. */
export function computeWireJunctionDots(sheetWires: E3Wire[]): WireJunctionDot[] {
  const dots: WireJunctionDot[] = [];
  const addDot = (x: number, y: number, netName: string, signalType: SignalType) => {
    if (!dots.some((d) => d.netName === netName && Math.abs(d.x - x) <= 2 && Math.abs(d.y - y) <= 2)) {
      dots.push({ x: Math.round(x), y: Math.round(y), netName, signalType });
    }
  };

  // 1. Multi-segment vertex degree >= 3 on same net
  const nodeDegrees = new Map<string, { x: number; y: number; netName: string; signalType: SignalType; count: number }>();
  for (const w of sheetWires) {
    for (let i = 0; i < w.waypoints.length; i++) {
      const pt = w.waypoints[i];
      const degHere = i === 0 || i === w.waypoints.length - 1 ? 1 : 2;
      const key = `${w.netName}|${Math.round(pt.x)},${Math.round(pt.y)}`;
      const prev = nodeDegrees.get(key);
      if (prev) prev.count += degHere;
      else nodeDegrees.set(key, { x: pt.x, y: pt.y, netName: w.netName, signalType: w.signalType, count: degHere });
    }
  }
  for (const item of nodeDegrees.values()) {
    if (item.count >= 3) {
      addDot(item.x, item.y, item.netName, item.signalType);
    }
  }

  // 2. Wire endpoint landing strictly inside a same-net wire segment (T-tap)
  for (const w1 of sheetWires) {
    if (w1.waypoints.length < 2) continue;
    const ends = [w1.waypoints[0], w1.waypoints[w1.waypoints.length - 1]];
    for (const endPt of ends) {
      for (const w2 of sheetWires) {
        if (w2.id === w1.id || w2.netName !== w1.netName) continue;
        for (let i = 0; i < w2.waypoints.length - 1; i++) {
          const a = w2.waypoints[i];
          const b = w2.waypoints[i + 1];
          const isH = Math.abs(a.y - b.y) < 1;
          const isV = Math.abs(a.x - b.x) < 1;
          if (isH) {
            const minX = Math.min(a.x, b.x);
            const maxX = Math.max(a.x, b.x);
            if (Math.abs(endPt.y - a.y) <= 1.5 && endPt.x > minX + 2 && endPt.x < maxX - 2) {
              addDot(endPt.x, a.y, w1.netName, w1.signalType);
            }
          } else if (isV) {
            const minY = Math.min(a.y, b.y);
            const maxY = Math.max(a.y, b.y);
            if (Math.abs(endPt.x - a.x) <= 1.5 && endPt.y > minY + 2 && endPt.y < maxY - 2) {
              addDot(a.x, endPt.y, w1.netName, w1.signalType);
            }
          }
        }
      }
    }
  }

  return dots;
}

export interface WireCrossingArc {
  x: number;
  y: number;
  wireId: string;
  signalType: SignalType;
}

/** Finds non-connected orthogonal wire crossings (bridges/hops on horizontal segments). */
export function computeWireCrossingArcs(
  sheetWires: E3Wire[],
  junctionDots: WireJunctionDot[]
): WireCrossingArc[] {
  const horizSegs: Array<{ wireId: string; netName: string; signalType: SignalType; y: number; minX: number; maxX: number }> = [];
  const vertSegs: Array<{ wireId: string; netName: string; x: number; minY: number; maxY: number }> = [];

  for (const w of sheetWires) {
    for (let i = 0; i < w.waypoints.length - 1; i++) {
      const a = w.waypoints[i];
      const b = w.waypoints[i + 1];
      if (Math.abs(a.y - b.y) < 0.5 && Math.abs(a.x - b.x) > 12) {
        horizSegs.push({
          wireId: w.id,
          netName: w.netName,
          signalType: w.signalType,
          y: Math.round(a.y),
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
        });
      } else if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) > 12) {
        vertSegs.push({
          wireId: w.id,
          netName: w.netName,
          x: Math.round(a.x),
          minY: Math.min(a.y, b.y),
          maxY: Math.max(a.y, b.y),
        });
      }
    }
  }

  const arcs: WireCrossingArc[] = [];
  for (const h of horizSegs) {
    for (const v of vertSegs) {
      if (h.wireId === v.wireId || h.netName === v.netName) continue;
      if (v.x > h.minX + 7 && v.x < h.maxX - 7 && h.y > v.minY + 7 && h.y < v.maxY - 7) {
        const isDot = junctionDots.some((d) => Math.abs(d.x - v.x) <= 5 && Math.abs(d.y - h.y) <= 5);
        if (isDot) continue;
        if (!arcs.some((a) => a.wireId === h.wireId && Math.abs(a.y - h.y) <= 2 && Math.abs(a.x - v.x) < 11)) {
          arcs.push({ x: v.x, y: h.y, wireId: h.wireId, signalType: h.signalType });
        }
      }
    }
  }
  return arcs;
}

export function computeWireLabelPositions(
  sheetWires: E3Wire[],
  sheetDevices: E3Device[]
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  const devBounds = sheetDevices
    .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
    .map((d) => getDeviceBounds(d));
  const placed: Array<{ x: number; y: number }> = [];

  for (const wire of sheetWires) {
    if (wire.waypoints.length < 2) continue;
    const candidates: Array<{ x: number; y: number; score: number }> = [];
    for (let i = 0; i < wire.waypoints.length - 1; i++) {
      const a = wire.waypoints[i];
      const b = wire.waypoints[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 6) continue;
      for (const t of [0.5, 0.35, 0.65]) {
        const cx = Math.round(a.x + (b.x - a.x) * t);
        const cy = Math.round(a.y + (b.y - a.y) * t);
        let penalty = t === 0.5 ? 0 : 12;
        for (const db of devBounds) {
          if (cx >= db.x - 14 && cx <= db.x + db.width + 14 && cy >= db.y - 12 && cy <= db.y + db.height + 12) {
            penalty += 300;
          }
        }
        for (const p of placed) {
          if (Math.abs(cx - p.x) < 28 && Math.abs(cy - p.y) < 15) {
            penalty += 180;
          }
        }
        candidates.push({ x: cx, y: cy, score: len - penalty });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0]
      ? { x: candidates[0].x, y: candidates[0].y }
      : { x: wire.waypoints[0].x, y: wire.waypoints[0].y };
    result.set(wire.id, chosen);
    placed.push(chosen);
  }
  return result;
}

function deduplicatePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const res: Array<{ x: number; y: number }> = [];
  for (const pt of points) {
    const prev = res[res.length - 1];
    if (!prev || prev.x !== pt.x || prev.y !== pt.y) {
      res.push(pt);
    }
  }
  return res;
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

/** Generates GOST 2.106 / ПЭ3 Bill of Materials & Element List */
export function buildBom(project: E3Project): BomRow[] {
  const groups = new Map<string, BomRow>();

  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX') continue;
    if (
      dev.category === 'airflow_arrow' ||
      dev.category === 'io_matrix' ||
      dev.category === 'offpage_ref' ||
      dev.e3BlockName === 'EXT_FIELD_UNIT'
    ) {
      continue;
    }
    const key = `${dev.article.trim()}||${dev.manufacturer.trim()}||${dev.componentName.trim()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.designations.push(dev.designation);
      existing.quantity += 1;
    } else {
      groups.set(key, {
        pos: 0,
        designations: [dev.designation],
        designationText: dev.designation,
        componentName: dev.componentName,
        article: dev.article || '—',
        manufacturer: dev.manufacturer || '—',
        category: dev.category,
        quantity: 1,
        unit: 'шт.',
        note: dev.attributes.find((a) => a.name === 'Примечание')?.value || '',
      });
    }
  }

  const rows = Array.from(groups.values());
  for (const row of rows) {
    row.designations.sort(naturalCompare);
    row.designationText = row.designations.join(', ');
  }
  rows.sort((a, b) => naturalCompare(a.designations[0] || '', b.designations[0] || ''));
  rows.forEach((row, index) => {
    row.pos = index + 1;
  });

  return rows;
}

export function calculateWireLengthMm(
  wire: E3Wire,
  deviceMap?: Map<string, E3Device>
): number {
  const pts = wire.waypoints;
  if (Array.isArray(pts) && pts.length >= 2) {
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return Math.round(total);
  }
  if (deviceMap) {
    const dFrom = deviceMap.get(wire.fromDeviceId);
    const dTo = deviceMap.get(wire.toDeviceId);
    const pFrom = dFrom?.pins.find((p) => p.id === wire.fromPinId);
    const pTo = dTo?.pins.find((p) => p.id === wire.toPinId);
    if (dFrom && dTo && pFrom && pTo) {
      const a = getAbsolutePinPos(dFrom, pFrom);
      const b = getAbsolutePinPos(dTo, pTo);
      return Math.round(Math.abs(b.x - a.x) + Math.abs(b.y - a.y));
    }
  }
  return 0;
}

export function buildCableJournal(project: E3Project): CableJournalRow[] {
  const devMap = new Map(project.devices.map((d) => [d.id, d]));
  return project.cables.map((cable) => {
    const assignedWires = project.wires.filter((w) => w.cableId === cable.id);
    const netMap = new Map<string, number>();
    let wireLengthMm = 0;
    for (const w of assignedWires) {
      const len = calculateWireLengthMm(w, devMap);
      wireLengthMm += len;
      const netKey = (w.netName || '').trim() || '(без цепи)';
      netMap.set(netKey, (netMap.get(netKey) || 0) + len);
    }
    const netLengths = Array.from(netMap.entries())
      .map(([netName, lengthMm]) => ({ netName, lengthMm }))
      .sort((a, b) => naturalCompare(a.netName, b.netName));
    return {
      designation: cable.designation,
      cableType: cable.cableType,
      coresCount: cable.coresCount,
      usedCores: assignedWires.length,
      crossSection: cable.crossSection,
      lengthMeters: cable.lengthMeters,
      fromDevice: cable.fromDevice,
      toDevice: cable.toDevice,
      shielded: cable.shielded,
      wireLengthMm,
      netLengths,
    };
  });
}

export function buildNetWireLengths(project: E3Project): NetWireLengthRow[] {
  const devMap = new Map(project.devices.map((d) => [d.id, d]));
  const cableMap = new Map(project.cables.map((c) => [c.id, c]));

  interface Acc {
    netName: string;
    signalType: SignalType;
    wireCount: number;
    totalLengthMm: number;
    crossSections: Set<string>;
    wireNumbers: Set<string>;
    cableDesignations: Set<string>;
    sheetIds: Set<string>;
  }

  const groups = new Map<string, Acc>();
  for (const wire of project.wires) {
    const netName = (wire.netName || '').trim() || '(без цепи)';
    const len = calculateWireLengthMm(wire, devMap);
    let acc = groups.get(netName);
    if (!acc) {
      acc = {
        netName,
        signalType: wire.signalType,
        wireCount: 0,
        totalLengthMm: 0,
        crossSections: new Set(),
        wireNumbers: new Set(),
        cableDesignations: new Set(),
        sheetIds: new Set(),
      };
      groups.set(netName, acc);
    }
    acc.wireCount += 1;
    acc.totalLengthMm += len;
    if (wire.crossSection?.trim()) acc.crossSections.add(wire.crossSection.trim());
    if (wire.wireNumber?.trim()) acc.wireNumbers.add(wire.wireNumber.trim());
    if (wire.sheetId?.trim()) acc.sheetIds.add(wire.sheetId.trim());
    if (wire.cableId) {
      const cab = cableMap.get(wire.cableId);
      if (cab?.designation) acc.cableDesignations.add(cab.designation);
    }
  }

  return Array.from(groups.values())
    .map((acc) => ({
      netName: acc.netName,
      signalType: acc.signalType,
      wireCount: acc.wireCount,
      totalLengthMm: acc.totalLengthMm,
      totalLengthMeters: Math.round((acc.totalLengthMm / 1000) * 1000) / 1000,
      crossSections: Array.from(acc.crossSections).sort(naturalCompare),
      wireNumbers: Array.from(acc.wireNumbers).sort(naturalCompare),
      cableDesignations: Array.from(acc.cableDesignations).sort(naturalCompare),
      sheetIds: Array.from(acc.sheetIds).sort(naturalCompare),
    }))
    .sort((a, b) => naturalCompare(a.netName, b.netName));
}

export function buildTerminalPlan(project: E3Project): TerminalPlanRow[] {
  const devMap = new Map(project.devices.map((d) => [d.id, d]));
  const cableMap = new Map(project.cables.map((c) => [c.id, c]));
  const rows: TerminalPlanRow[] = [];

  const terminals = project.devices
    .filter((d) => d.category === 'terminal' && d.bindingState !== 'REMOVED_IN_FLUX')
    .sort((a, b) => naturalCompare(a.designation, b.designation));

  for (const term of terminals) {
    for (const pin of term.pins) {
      const connectedWires = project.wires.filter(
        (w) =>
          (w.fromDeviceId === term.id && w.fromPinId === pin.id) ||
          (w.toDeviceId === term.id && w.toPinId === pin.id)
      );
      if (connectedWires.length === 0) {
        rows.push({
          terminalDesignation: term.designation,
          pinName: pin.name,
          netName: 'Резерв',
          wireNumber: '—',
          crossSection: '—',
          connectedTo: 'Не подключено',
          cableInfo: '—',
        });
      } else {
        for (const wire of connectedWires) {
          const isFrom = wire.fromDeviceId === term.id && wire.fromPinId === pin.id;
          const otherDev = devMap.get(isFrom ? wire.toDeviceId : wire.fromDeviceId);
          const otherPin = otherDev?.pins.find((p) => p.id === (isFrom ? wire.toPinId : wire.fromPinId));
          const cable = wire.cableId ? cableMap.get(wire.cableId) : undefined;
          rows.push({
            terminalDesignation: term.designation,
            pinName: pin.name,
            netName: wire.netName,
            wireNumber: wire.wireNumber,
            crossSection: wire.crossSection,
            connectedTo: otherDev ? `${otherDev.designation}:${otherPin?.name || '?'}` : 'Внешняя цепь',
            cableInfo: cable ? `${cable.designation} (${wire.coreNumber || '?'})` : 'Монтажный провод',
          });
        }
      }
    }
  }

  return rows;
}

const INCOMPATIBLE_SIGNAL_PAIRS: Array<[SignalType, SignalType]> = [
  ['power', 'pe'],
  ['power', 'neutral'],
  ['power', 'dc24'],
  ['power', 'dc0'],
  ['neutral', 'pe'],
  ['dc24', 'dc0'],
  ['dc24', 'pe'],
];

function areSignalsIncompatible(a: SignalType, b: SignalType): boolean {
  return INCOMPATIBLE_SIGNAL_PAIRS.some(
    ([x, y]) => (a === x && b === y) || (a === y && b === x)
  );
}

const SIGNAL_DISPLAY_NAME: Record<SignalType, string> = {
  power: '380В/220В сила',
  neutral: 'N (нейтраль)',
  pe: 'PE (земля)',
  dc24: '24VDC',
  dc0: '0VDC',
  signal: 'Сигнал',
  bus: 'Шина данных',
};

// Допустимый длительный ток для медных жил с ПВХ изоляцией (ПУЭ табл. 1.3.4 / ГОСТ)
const COPPER_AMPACITY_TABLE: Array<{ maxSection: number; maxAmps: number }> = [
  { maxSection: 0.5, maxAmps: 6 },
  { maxSection: 0.75, maxAmps: 10 },
  { maxSection: 1.0, maxAmps: 13 },
  { maxSection: 1.5, maxAmps: 16 },
  { maxSection: 2.5, maxAmps: 25 },
  { maxSection: 4.0, maxAmps: 32 },
  { maxSection: 6.0, maxAmps: 40 },
  { maxSection: 10.0, maxAmps: 63 },
  { maxSection: 16.0, maxAmps: 80 },
  { maxSection: 25.0, maxAmps: 100 },
  { maxSection: 35.0, maxAmps: 135 },
  { maxSection: 50.0, maxAmps: 170 },
];

export function parseCrossSectionMm2(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const val = Number(m[1]);
  return Number.isFinite(val) && val > 0 ? val : null;
}

export function getMaxAmpacityForSection(mm2: number): number {
  for (const row of COPPER_AMPACITY_TABLE) {
    if (mm2 <= row.maxSection + 1e-6) return row.maxAmps;
  }
  return Math.round(mm2 * 3.5);
}

export function parseBreakerRatedCurrent(dev: E3Device): number | null {
  if (dev.category !== 'breaker') return null;
  const attr = dev.attributes.find((a) =>
    /номинал|ток/i.test(a.name)
  );
  const candidates = [attr?.value || '', dev.componentName || ''];
  for (const text of candidates) {
    const m = text.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(?:[АA]\b)/);
    if (m) {
      const val = Number(m[1]);
      if (Number.isFinite(val) && val > 0) return val;
    }
  }
  return null;
}

export function runErc(project: E3Project): ErcIssue[] {
  const issues: ErcIssue[] = [];
  const designationCounts = new Map<string, E3Device[]>();
  const devMap = new Map(project.devices.map((d) => [d.id, d]));

  const primaryDesignations = new Set<string>();
  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX') continue;
    if (dev.e3BlockName !== 'EXT_FIELD_UNIT') {
      primaryDesignations.add(dev.designation.trim().toUpperCase());
    }
  }

  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX') {
      issues.push({
        id: `erc-removed-${dev.id}`,
        severity: 'warning',
        code: 'E3-FLUX-REMOVED',
        message: `Позиция ${dev.designation} снята во Flux, но остаётся на листе схемы`,
        sheetId: dev.sheetId,
        deviceId: dev.id,
      });
      continue;
    }

    const normDes = dev.designation.trim().toUpperCase();
    // EXT_FIELD_UNIT represents a linked cross-sheet terminal view of the primary FSA unit
    if (!(dev.e3BlockName === 'EXT_FIELD_UNIT' && primaryDesignations.has(normDes))) {
      const list = designationCounts.get(normDes) || [];
      list.push(dev);
      designationCounts.set(normDes, list);
    }

    const skipBomPartCheck =
      dev.category === 'offpage_ref' ||
      dev.category === 'airflow_arrow' ||
      dev.category === 'io_matrix';

    if (!skipBomPartCheck && (!dev.article.trim() || !dev.manufacturer.trim())) {
      issues.push({
        id: `erc-art-${dev.id}`,
        severity: 'warning',
        code: 'E3-BOM-PART',
        message: `У элемента ${dev.designation} не заполнены артикул или производитель для спецификации ПЭ3`,
        sheetId: dev.sheetId,
        deviceId: dev.id,
      });
    }
  }

  for (const [des, list] of designationCounts.entries()) {
    if (list.length > 1) {
      for (const dev of list) {
        issues.push({
          id: `erc-dup-${dev.id}`,
          severity: 'error',
          code: 'E3-DUP-DES',
          message: `Дублирование позиционного обозначения ${des} (${list.length} экз.)`,
          sheetId: dev.sheetId,
          deviceId: dev.id,
        });
      }
    }
  }

  const connectedPins = new Set<string>();
  const potentialConflictWireIds = new Set<string>();
  const wiresByNetName = new Map<string, E3Wire[]>();
  const wiresByPinKey = new Map<string, E3Wire[]>();
  const wiresByWireNumber = new Map<string, E3Wire[]>();

  for (const wire of project.wires) {
    connectedPins.add(`${wire.fromDeviceId}:${wire.fromPinId}`);
    connectedPins.add(`${wire.toDeviceId}:${wire.toPinId}`);

    const normNet = wire.netName.trim().toUpperCase();
    if (normNet && normNet !== '—') {
      const list = wiresByNetName.get(normNet) || [];
      list.push(wire);
      wiresByNetName.set(normNet, list);
    }

    const fromPinKey = `${wire.fromDeviceId}:${wire.fromPinId}`;
    const toPinKey = `${wire.toDeviceId}:${wire.toPinId}`;
    wiresByPinKey.set(fromPinKey, [...(wiresByPinKey.get(fromPinKey) || []), wire]);
    wiresByPinKey.set(toPinKey, [...(wiresByPinKey.get(toPinKey) || []), wire]);

    const normNum = wire.wireNumber.trim().toUpperCase();
    if (normNum && normNum !== '—') {
      const list = wiresByWireNumber.get(normNum) || [];
      list.push(wire);
      wiresByWireNumber.set(normNum, list);
    }

    const dFrom = devMap.get(wire.fromDeviceId);
    const dTo = devMap.get(wire.toDeviceId);
    const pFrom = dFrom?.pins.find((p) => p.id === wire.fromPinId);
    const pTo = dTo?.pins.find((p) => p.id === wire.toPinId);
    if (!dFrom || !dTo || !pFrom || !pTo) {
      issues.push({
        id: `erc-dangling-${wire.id}`,
        severity: 'error',
        code: 'E3-NET-DANGLING',
        message: `Цепь ${wire.netName} (${wire.wireNumber}) ссылается на несуществующий вывод`,
        sheetId: wire.sheetId,
        wireId: wire.id,
      });
      continue;
    }

    if (
      areSignalsIncompatible(pFrom.signalType, pTo.signalType) ||
      areSignalsIncompatible(wire.signalType, pFrom.signalType) ||
      areSignalsIncompatible(wire.signalType, pTo.signalType)
    ) {
      potentialConflictWireIds.add(wire.id);
      issues.push({
        id: `erc-short-${wire.id}`,
        severity: 'error',
        code: 'E3-POTENTIAL-CONFLICT',
        message: `Конфликт потенциалов в цепи ${wire.netName}: ${dFrom.designation}:${pFrom.name} (${SIGNAL_DISPLAY_NAME[pFrom.signalType]}) → ${dTo.designation}:${pTo.name} (${SIGNAL_DISPLAY_NAME[pTo.signalType]})`,
        sheetId: wire.sheetId,
        wireId: wire.id,
      });
    }
  }

  // 6.2a: Heterogeneous potentials sharing the same netName or electrical pin junction
  for (const [normNet, netWires] of wiresByNetName.entries()) {
    const distinctSignals = Array.from(new Set(netWires.map((w) => w.signalType)));
    const hasConflict = distinctSignals.some((s1, idx) =>
      distinctSignals.slice(idx + 1).some((s2) => areSignalsIncompatible(s1, s2))
    );
    if (hasConflict) {
      const sigDesc = distinctSignals.map((s) => SIGNAL_DISPLAY_NAME[s]).join(' ↔ ');
      for (const w of netWires) {
        if (potentialConflictWireIds.has(w.id)) continue;
        potentialConflictWireIds.add(w.id);
        issues.push({
          id: `erc-netmix-${w.id}`,
          severity: 'error',
          code: 'E3-POTENTIAL-CONFLICT',
          message: `Смешение разнородных потенциалов на одной цепи «${w.netName || normNet}» (${sigDesc})`,
          sheetId: w.sheetId,
          wireId: w.id,
        });
      }
    }
  }

  for (const [, junctionWires] of wiresByPinKey.entries()) {
    if (junctionWires.length < 2) continue;
    const distinctSignals = Array.from(new Set(junctionWires.map((w) => w.signalType)));
    const hasConflict = distinctSignals.some((s1, idx) =>
      distinctSignals.slice(idx + 1).some((s2) => areSignalsIncompatible(s1, s2))
    );
    if (hasConflict) {
      const sigDesc = distinctSignals.map((s) => SIGNAL_DISPLAY_NAME[s]).join(' ↔ ');
      for (const w of junctionWires) {
        if (potentialConflictWireIds.has(w.id)) continue;
        potentialConflictWireIds.add(w.id);
        issues.push({
          id: `erc-juncmix-${w.id}`,
          severity: 'error',
          code: 'E3-POTENTIAL-CONFLICT',
          message: `Соединение разнородных потенциалов в узле цепи «${w.netName}» (${sigDesc})`,
          sheetId: w.sheetId,
          wireId: w.id,
        });
      }
    }
  }

  // 6.2b: Wire cross-section vs protective breaker rated current (direct + 1-hop pass-through)
  const breakerRatings = new Map<string, { dev: E3Device; amps: number }>();
  for (const dev of project.devices) {
    const amps = parseBreakerRatedCurrent(dev);
    if (amps !== null) breakerRatings.set(dev.id, { dev, amps });
  }

  const wireBreakerMap = new Map<string, { dev: E3Device; amps: number }>();
  for (const w of project.wires) {
    if (w.signalType === 'pe') continue;
    const bFrom = breakerRatings.get(w.fromDeviceId);
    const bTo = breakerRatings.get(w.toDeviceId);
    const directBreaker = bFrom || bTo;
    if (directBreaker) {
      wireBreakerMap.set(w.id, directBreaker);
    }
  }
  // Propagate 1 hop downstream through passive/switching power devices (contactor, terminal)
  const passThroughCategories = new Set(['contactor', 'terminal']);
  for (const w of project.wires) {
    if (w.signalType !== 'power' || wireBreakerMap.has(w.id)) continue;
    const endpoints = [w.fromDeviceId, w.toDeviceId];
    for (const devId of endpoints) {
      const dev = devMap.get(devId);
      if (!dev || !passThroughCategories.has(dev.category)) continue;
      const upstreamWire = project.wires.find(
        (uw) =>
          uw.id !== w.id &&
          uw.signalType === 'power' &&
          wireBreakerMap.has(uw.id) &&
          (uw.fromDeviceId === devId || uw.toDeviceId === devId)
      );
      if (upstreamWire) {
        wireBreakerMap.set(w.id, wireBreakerMap.get(upstreamWire.id)!);
        break;
      }
    }
  }

  for (const w of project.wires) {
    const br = wireBreakerMap.get(w.id);
    if (!br) continue;
    const mm2 = parseCrossSectionMm2(w.crossSection);
    if (mm2 === null) continue;
    const maxAmps = getMaxAmpacityForSection(mm2);
    if (br.amps > maxAmps) {
      issues.push({
        id: `erc-amp-${w.id}`,
        severity: br.amps > maxAmps * 1.25 ? 'error' : 'warning',
        code: 'E3-WIRE-AMPACITY',
        message: `Завышен номинал автомата ${br.dev.designation} (${br.amps} А) для сечения ${w.crossSection} (доп. ${maxAmps} А) в цепи ${w.netName}`,
        sheetId: w.sheetId,
        wireId: w.id,
      });
    }
  }

  // 6.2c: Duplicate wireNumber across different potentials (netName)
  for (const [, numWires] of wiresByWireNumber.entries()) {
    if (numWires.length < 2) continue;
    const distinctNets = new Set(
      numWires.map((w) => w.netName.trim().toUpperCase()).filter(Boolean)
    );
    if (distinctNets.size > 1) {
      for (const w of numWires) {
        issues.push({
          id: `erc-dupwire-${w.id}`,
          severity: 'warning',
          code: 'E3-DUP-WIRE-NUM',
          message: `Дубль маркировки провода «${w.wireNumber}» в разных потенциалах (${Array.from(distinctNets).join(', ')})`,
          sheetId: w.sheetId,
          wireId: w.id,
        });
      }
    }
  }

  // 6.2d: Assigned cable overflow + unused reserve cores
  for (const cab of project.cables) {
    const cableWires = project.wires.filter((w) => w.cableId === cab.id);
    const used = cableWires.length;
    if (used > cab.coresCount) {
      issues.push({
        id: `erc-cab-${cab.id}`,
        severity: 'error',
        code: 'E3-CABLE-OVERFLOW',
        message: `Кабель ${cab.designation} (${cab.cableType}): задействовано ${used} жил из ${cab.coresCount}`,
        sheetId: cableWires[0]?.sheetId,
        wireId: cableWires[0]?.id,
      });
    } else if (used > 0 && used < cab.coresCount) {
      issues.push({
        id: `erc-cab-unused-${cab.id}`,
        severity: 'info',
        code: 'E3-CABLE-UNUSED',
        message: `Кабель ${cab.designation} (${cab.cableType}): свободно ${cab.coresCount - used} из ${cab.coresCount} жил (резерв)`,
        sheetId: cableWires[0]?.sheetId,
        wireId: cableWires[0]?.id,
      });
    }
  }

  // Only flag devices that have 0 connected pins at all (floating unplaced/unwired block)
  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX' || dev.category === 'terminal') continue;
    const anyConnected = dev.pins.some((p) => connectedPins.has(`${dev.id}:${p.id}`));
    if (!anyConnected && dev.pins.length > 0) {
      issues.push({
        id: `erc-unwired-${dev.id}`,
        severity: 'info',
        code: 'E3-DEV-UNWIRED',
        message: `Элемент ${dev.designation} (${dev.componentName}) не имеет ни одного подключения`,
        sheetId: dev.sheetId,
        deviceId: dev.id,
      });
    }
  }

  return issues;
}

// ============================================================================
// Bidirectional Lossless E3.series XML (.e3x) Serializer & Parser
// ============================================================================

function xmlEscape(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function serializeE3Xml(project: E3Project): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<E3Project format="e3s" schemaVersion="${xmlEscape(project.schemaVersion)}" id="${xmlEscape(project.id)}" name="${xmlEscape(project.name)}" projectCode="${xmlEscape(project.projectCode)}" fluxProjectKey="${xmlEscape(project.fluxProjectKey)}" author="${xmlEscape(project.author)}" revision="${project.revision}" standard="${xmlEscape(project.standard)}" updatedAt="${xmlEscape(project.updatedAt)}">`
  );

  // Visual Settings synchronization block
  const vs = project.visualSettings;
  lines.push(
    `  <VisualSettings schemaVersion="${vs.schemaVersion}" presetName="${xmlEscape(vs.presetName)}" theme="${vs.theme}" gridSize="${vs.gridSize}" snapToGrid="${vs.snapToGrid}" smartGuides="${vs.smartGuides !== false}" showCrosshair="${vs.showCrosshair !== false}" showGrid="${vs.showGrid}" showGostFrame="${vs.showGostFrame}" showPinNumbers="${vs.showPinNumbers}" showWireNumbers="${vs.showWireNumbers}" showCrossRefs="${vs.showCrossRefs}" wireWidth="${vs.wireWidth}" symbolStrokeWidth="${vs.symbolStrokeWidth}" frameStrokeWidth="${vs.frameStrokeWidth ?? 1.6}" annotationStrokeWidth="${vs.annotationStrokeWidth ?? 1.4}" wireCrossingBridge="${vs.wireCrossingBridge !== false}" fontScale="${vs.fontScale}" fontFamily="${xmlEscape(vs.fontFamily || 'GOST')}">`
  );
  for (const [sig, color] of Object.entries(vs.netColors)) {
    lines.push(`    <NetColor signalType="${xmlEscape(sig)}" hex="${xmlEscape(color)}" />`);
  }
  lines.push('  </VisualSettings>');

  // Sheets
  lines.push('  <Sheets>');
  for (const s of project.sheets) {
    const tb = s.titleBlock;
    const sRev = getSheetRevisionNumber(s);
    const sUpdatedAt = s.updatedAt || project.updatedAt;
    lines.push(
      `    <Sheet id="${xmlEscape(s.id)}" number="${s.number}" name="${xmlEscape(s.name)}" format="${s.format}" width="${s.width}" height="${s.height}" revision="${sRev}" updatedAt="${xmlEscape(sUpdatedAt)}" stampForm="${xmlEscape(tb.stampForm || 'form1')}" customTemplateId="${xmlEscape(tb.customTemplateId || '')}" documentCode="${xmlEscape(tb.documentCode)}" projectTitle="${xmlEscape(tb.projectTitle || '')}" organization="${xmlEscape(tb.organization)}" designer="${xmlEscape(tb.designer)}" checker="${xmlEscape(tb.checker)}" techControl="${xmlEscape(tb.techControl || '')}" normControl="${xmlEscape(tb.normControl || '')}" approver="${xmlEscape(tb.approver || '')}" litera="${xmlEscape(tb.litera || '')}" mass="${xmlEscape(tb.mass || '')}" scale="${xmlEscape(tb.scale || '')}" date="${xmlEscape(tb.date || '')}" invOriginal="${xmlEscape(tb.invOriginal || '')}" invDuplicate="${xmlEscape(tb.invDuplicate || '')}" izm="${xmlEscape(tb.izm || '')}" changeDoc="${xmlEscape(tb.changeDoc || '')}" changeDate="${xmlEscape(tb.changeDate || '')}" sheetTitle="${xmlEscape(tb.sheetTitle)}" />`
    );
  }
  lines.push('  </Sheets>');

  // Cables
  lines.push('  <Cables>');
  for (const c of project.cables) {
    lines.push(
      `    <Cable id="${xmlEscape(c.id)}" designation="${xmlEscape(c.designation)}" cableType="${xmlEscape(c.cableType)}" coresCount="${c.coresCount}" crossSection="${xmlEscape(c.crossSection)}" lengthMeters="${c.lengthMeters}" fromDevice="${xmlEscape(c.fromDevice)}" toDevice="${xmlEscape(c.toDevice)}" shielded="${c.shielded}" />`
    );
  }
  lines.push('  </Cables>');

  // Devices with Pins & Attributes
  lines.push('  <Devices>');
  for (const d of project.devices) {
    const offPageAttrs = d.offPageRef
      ? ` offPageDir="${xmlEscape(d.offPageRef.direction)}" offPagePotential="${xmlEscape(d.offPageRef.potentialName)}" offPageSignal="${xmlEscape(d.offPageRef.signalType)}" offPagePairId="${xmlEscape(d.offPageRef.pairId || '')}" offPageTargetId="${xmlEscape(d.offPageRef.targetDeviceId || '')}"`
      : '';
    const symbolIdAttr = d.symbolId ? ` symbolId="${xmlEscape(d.symbolId)}"` : '';
    lines.push(
      `    <Device id="${xmlEscape(d.id)}" elementId="${xmlEscape(d.elementId)}" designation="${xmlEscape(d.designation)}" componentName="${xmlEscape(d.componentName)}" article="${xmlEscape(d.article)}" manufacturer="${xmlEscape(d.manufacturer)}" category="${xmlEscape(d.category)}" sheetId="${xmlEscape(d.sheetId)}" x="${d.x}" y="${d.y}" rotation="${d.rotation}" width="${d.width}" height="${d.height}" e3BlockName="${xmlEscape(d.e3BlockName)}"${symbolIdAttr} bindingState="${xmlEscape(d.bindingState)}"${offPageAttrs}>`
    );
    lines.push('      <Pins>');
    for (const p of d.pins) {
      lines.push(
        `        <Pin id="${xmlEscape(p.id)}" name="${xmlEscape(p.name)}" dx="${p.dx}" dy="${p.dy}" direction="${xmlEscape(p.direction)}" signalType="${xmlEscape(p.signalType)}" />`
      );
    }
    lines.push('      </Pins>');
    lines.push('      <Attributes>');
    for (const a of d.attributes) {
      lines.push(
        `        <Attribute name="${xmlEscape(a.name)}" value="${xmlEscape(a.value)}" owner="${xmlEscape(a.owner)}" conflict="${xmlEscape(a.conflict)}" service="${Boolean(a.service)}" />`
      );
    }
    lines.push('      </Attributes>');
    if (d.customSymbol && d.customSymbol.shapes.length > 0) {
      lines.push(
        `      <CustomSymbol showBodyBorder="${Boolean(d.customSymbol.showBodyBorder)}" shapesJson="${xmlEscape(JSON.stringify(d.customSymbol.shapes))}" />`
      );
    }
    lines.push('    </Device>');
  }
  lines.push('  </Devices>');

  // Wires
  lines.push('  <Wires>');
  for (const w of project.wires) {
    const pts = w.waypoints.map((pt) => `${pt.x},${pt.y}`).join(';');
    const manualAttr = w.manualRoute ? ' manualRoute="true"' : '';
    lines.push(
      `    <Wire id="${xmlEscape(w.id)}" sheetId="${xmlEscape(w.sheetId)}" netName="${xmlEscape(w.netName)}" signalType="${xmlEscape(w.signalType)}" fromDeviceId="${xmlEscape(w.fromDeviceId)}" fromPinId="${xmlEscape(w.fromPinId)}" toDeviceId="${xmlEscape(w.toDeviceId)}" toPinId="${xmlEscape(w.toPinId)}" crossSection="${xmlEscape(w.crossSection)}" wireNumber="${xmlEscape(w.wireNumber)}" cableId="${xmlEscape(w.cableId || '')}" coreNumber="${xmlEscape(w.coreNumber || '')}"${manualAttr} waypoints="${xmlEscape(pts)}" />`
    );
  }
  lines.push('  </Wires>');

  if (project.annotations?.length) {
    lines.push('  <Annotations>');
    for (const ann of project.annotations) {
      lines.push(
        `    <Annotation id="${xmlEscape(ann.id)}" sheetId="${xmlEscape(ann.sheetId)}" kind="${xmlEscape(ann.kind)}" x="${ann.x}" y="${ann.y}" width="${ann.width}" height="${ann.height}" text="${xmlEscape(ann.text)}" color="${xmlEscape(ann.color || '')}" fontSize="${ann.fontSize || 12}" strokeWidth="${ann.strokeWidth ?? ''}" strokeStyle="${xmlEscape(ann.strokeStyle || '')}" />`
      );
    }
    lines.push('  </Annotations>');
  }

  const resolvedLayers = resolveCadLayers(project.layers, vs.showGostFrame);
  lines.push('  <Layers>');
  for (const layerId of CAD_LAYER_ORDER) {
    const st = resolvedLayers[layerId];
    lines.push(`    <Layer id="${layerId}" visible="${st.visible}" locked="${st.locked}" />`);
  }
  lines.push('  </Layers>');

  // Per-sheet revision history
  const hasAnyRevisions = project.sheets.some((s) => (s.revisions?.length || 0) > 0);
  if (hasAnyRevisions) {
    lines.push('  <SheetRevisions>');
    for (const s of project.sheets) {
      for (const entry of s.revisions || []) {
        const snapAttr = entry.snapshot ? ` snapshot="${xmlEscape(JSON.stringify(entry.snapshot))}"` : '';
        const labelAttr = entry.revisionLabel ? ` revisionLabel="${xmlEscape(entry.revisionLabel)}"` : '';
        const docAttr = entry.changeDoc ? ` changeDoc="${xmlEscape(entry.changeDoc)}"` : '';
        const dateAttr = entry.changeDate ? ` changeDate="${xmlEscape(entry.changeDate)}"` : '';
        const relAttr = entry.released ? ' released="true"' : '';
        lines.push(
          `    <SheetRevision sheetId="${xmlEscape(s.id)}" revision="${entry.revision}"${labelAttr}${docAttr}${dateAttr}${relAttr} projectRevision="${entry.projectRevision}" timestamp="${xmlEscape(entry.timestamp)}" author="${xmlEscape(entry.author)}" summary="${xmlEscape(entry.summary)}" changedAreas="${xmlEscape(entry.changedAreas.join(','))}"${snapAttr} />`
        );
      }
    }
    lines.push('  </SheetRevisions>');
  }

  if (project.symbolLibrary?.length) {
    lines.push('  <SymbolLibrary>');
    for (const sym of project.symbolLibrary) {
      lines.push(
        `    <Symbol id="${xmlEscape(sym.id)}" name="${xmlEscape(sym.name)}" e3BlockName="${xmlEscape(sym.e3BlockName)}" category="${xmlEscape(sym.category)}" description="${xmlEscape(sym.description || '')}" width="${sym.width}" height="${sym.height}" isCustom="${Boolean(sym.isCustom)}" shapesJson="${xmlEscape(JSON.stringify(sym.shapes || []))}" pinsJson="${xmlEscape(JSON.stringify(sym.defaultPins || []))}" />`
      );
    }
    lines.push('  </SymbolLibrary>');
  }

  lines.push('</E3Project>');
  return lines.join('\n');
}

function parseXmlAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_][A-Za-z0-9_:-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString)) !== null) {
    attrs[m[1]] = xmlUnescape(m[2]);
  }
  return attrs;
}

export function parseE3Xml(xml: string): E3Project {
  const rootMatch = /<E3Project\s+([^>]+)>/.exec(xml);
  if (!rootMatch) {
    throw new Error('Некорректный формат E3 XML: отсутствует корневой узел <E3Project>.');
  }
  const rootAttrs = parseXmlAttrs(rootMatch[1]);

  // VisualSettings
  const visualSettings: E3VisualSettings = structuredClone(DEFAULT_VISUAL_SETTINGS);
  const vsMatch = /<VisualSettings\s+([^>]+)>([\s\S]*?)<\/VisualSettings>/.exec(xml);
  if (vsMatch) {
    const va = parseXmlAttrs(vsMatch[1]);
    visualSettings.schemaVersion = Number(va.schemaVersion || 1);
    visualSettings.presetName = va.presetName || visualSettings.presetName;
    visualSettings.theme = va.theme === 'dark' ? 'dark' : 'light';
    visualSettings.gridSize = Number(va.gridSize || 20);
    visualSettings.snapToGrid = va.snapToGrid !== 'false';
    if (va.smartGuides !== undefined) visualSettings.smartGuides = va.smartGuides !== 'false';
    if (va.showCrosshair !== undefined) visualSettings.showCrosshair = va.showCrosshair !== 'false';
    visualSettings.showGrid = va.showGrid !== 'false';
    visualSettings.showGostFrame = va.showGostFrame !== 'false';
    visualSettings.showPinNumbers = va.showPinNumbers !== 'false';
    visualSettings.showWireNumbers = va.showWireNumbers !== 'false';
    visualSettings.showCrossRefs = va.showCrossRefs !== 'false';
    visualSettings.wireWidth = Number(va.wireWidth || 2);
    visualSettings.symbolStrokeWidth = Number(va.symbolStrokeWidth || 1.75);
    visualSettings.frameStrokeWidth = va.frameStrokeWidth ? Number(va.frameStrokeWidth) : 1.6;
    visualSettings.annotationStrokeWidth = va.annotationStrokeWidth ? Number(va.annotationStrokeWidth) : 1.4;
    if (va.wireCrossingBridge !== undefined) {
      visualSettings.wireCrossingBridge = va.wireCrossingBridge !== 'false';
    }
    visualSettings.fontScale = Number(va.fontScale || 1);
    if (va.fontFamily) {
      visualSettings.fontFamily = va.fontFamily as SchematicFontFamily;
    }

    const netColorRe = /<NetColor\s+([^>]+?)\s*\/?>/g;
    let ncm: RegExpExecArray | null;
    while ((ncm = netColorRe.exec(vsMatch[2])) !== null) {
      const nca = parseXmlAttrs(ncm[1]);
      if (nca.signalType && nca.hex) {
        visualSettings.netColors[nca.signalType as SignalType] = nca.hex;
      }
    }
  }

  // Sheets
  const sheets: E3Sheet[] = [];
  const sheetRe = /<Sheet\s+([^>]+?)\s*\/?>/g;
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(xml)) !== null) {
    const sa = parseXmlAttrs(sm[1]);
    const validFmt: SheetFormat =
      sa.format === 'A4' || sa.format === 'A3' || sa.format === 'A2' || sa.format === 'A1'
        ? sa.format
        : 'A3';
    sheets.push({
      id: sa.id,
      number: Number(sa.number || sheets.length + 1),
      name: sa.name || `Лист ${sheets.length + 1}`,
      format: validFmt,
      width: Number(sa.width || 1400),
      height: Number(sa.height || 920),
      revision: sa.revision ? Number(sa.revision) : undefined,
      updatedAt: sa.updatedAt || undefined,
      titleBlock: {
        stampForm: sa.stampForm === 'form2a' ? 'form2a' : sa.stampForm === 'custom' ? 'custom' : 'form1',
        customTemplateId: sa.customTemplateId || undefined,
        documentCode: sa.documentCode || '',
        projectTitle: sa.projectTitle || '',
        organization: sa.organization || '',
        designer: sa.designer || '',
        checker: sa.checker || '',
        techControl: sa.techControl || '',
        normControl: sa.normControl || '',
        approver: sa.approver || '',
        litera: sa.litera || '',
        mass: sa.mass || '',
        scale: sa.scale || '',
        date: sa.date || '',
        invOriginal: sa.invOriginal || '',
        invDuplicate: sa.invDuplicate || '',
        izm: sa.izm || '',
        changeDoc: sa.changeDoc || '',
        changeDate: sa.changeDate || '',
        sheetTitle: sa.sheetTitle || '',
      },
    });
  }

  // Cables
  const cables: E3Cable[] = [];
  const cableRe = /<Cable\s+([^>]+?)\s*\/?>/g;
  let cm: RegExpExecArray | null;
  while ((cm = cableRe.exec(xml)) !== null) {
    const ca = parseXmlAttrs(cm[1]);
    cables.push({
      id: ca.id,
      designation: ca.designation,
      cableType: ca.cableType,
      coresCount: Number(ca.coresCount || 3),
      crossSection: ca.crossSection || '1.5 мм²',
      lengthMeters: Number(ca.lengthMeters || 10),
      fromDevice: ca.fromDevice || '',
      toDevice: ca.toDevice || '',
      shielded: ca.shielded === 'true',
    });
  }

  // Devices
  const devices: E3Device[] = [];
  const devRe = /<Device\s+([^>]+)>([\s\S]*?)<\/Device>/g;
  let dm: RegExpExecArray | null;
  while ((dm = devRe.exec(xml)) !== null) {
    const da = parseXmlAttrs(dm[1]);
    const body = dm[2];

    const pins: E3Pin[] = [];
    const pinRe = /<Pin\s+([^>]+?)\s*\/?>/g;
    let pm: RegExpExecArray | null;
    while ((pm = pinRe.exec(body)) !== null) {
      const pa = parseXmlAttrs(pm[1]);
      pins.push({
        id: pa.id,
        name: pa.name,
        dx: Number(pa.dx || 0),
        dy: Number(pa.dy || 0),
        direction: (pa.direction as PinDirection) || 'top',
        signalType: (pa.signalType as SignalType) || 'signal',
      });
    }

    const attributes: E3Attribute[] = [];
    const attrRe = /<Attribute\s+([^>]+?)\s*\/?>/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(body)) !== null) {
      const aa = parseXmlAttrs(am[1]);
      attributes.push({
        name: aa.name,
        value: aa.value,
        owner: aa.owner || '',
        conflict: (aa.conflict as E3Attribute['conflict']) || 'flux',
        service: aa.service === 'true',
      });
    }

    let customSymbol: CustomSymbolSpec | undefined;
    const csMatch = /<CustomSymbol\s+([^>]+?)\s*\/?>/.exec(body);
    if (csMatch) {
      const csa = parseXmlAttrs(csMatch[1]);
      if (csa.shapesJson) {
        try {
          const parsedShapes = JSON.parse(csa.shapesJson);
          if (Array.isArray(parsedShapes) && parsedShapes.length > 0) {
            customSymbol = {
              shapes: parsedShapes,
              showBodyBorder: csa.showBodyBorder === 'true',
            };
          }
        } catch {
          customSymbol = undefined;
        }
      }
    }

    const devCat = (da.category as E3Device['category']) || 'breaker';
    const hasOffPage = devCat === 'offpage_ref' || Boolean(da.offPageDir || da.offPagePotential);
    devices.push({
      id: da.id,
      elementId: da.elementId || da.id,
      designation: da.designation,
      componentName: da.componentName,
      article: da.article || '',
      manufacturer: da.manufacturer || '',
      category: devCat,
      sheetId: da.sheetId || sheets[0]?.id || 'sheet-1',
      x: Number(da.x || 0),
      y: Number(da.y || 0),
      rotation: (Number(da.rotation || 0) % 360) as 0 | 90 | 180 | 270,
      width: Number(da.width || 100),
      height: Number(da.height || 100),
      e3BlockName: da.e3BlockName || 'GOST_GENERIC',
      symbolId: da.symbolId || undefined,
      bindingState: (da.bindingState as E3Device['bindingState']) || 'PLACED',
      pins,
      attributes,
      customSymbol,
      offPageRef: hasOffPage
        ? {
            direction: da.offPageDir === 'in' ? 'in' : 'out',
            potentialName: da.offPagePotential || da.designation.replace(/^-/, '') || '+24V',
            signalType: (da.offPageSignal as SignalType) || pins[0]?.signalType || 'signal',
            pairId: da.offPagePairId || undefined,
            targetDeviceId: da.offPageTargetId || undefined,
          }
        : undefined,
    });
  }

  // Wires
  const wires: E3Wire[] = [];
  const wireRe = /<Wire\s+([^>]+?)\s*\/?>/g;
  let wm: RegExpExecArray | null;
  while ((wm = wireRe.exec(xml)) !== null) {
    const wa = parseXmlAttrs(wm[1]);
    const waypoints = (wa.waypoints || '')
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const [x, y] = pair.split(',').map(Number);
        return { x: x || 0, y: y || 0 };
      });
    wires.push({
      id: wa.id,
      sheetId: wa.sheetId,
      netName: wa.netName,
      signalType: (wa.signalType as SignalType) || 'signal',
      fromDeviceId: wa.fromDeviceId,
      fromPinId: wa.fromPinId,
      toDeviceId: wa.toDeviceId,
      toPinId: wa.toPinId,
      waypoints,
      crossSection: wa.crossSection || '1.5 мм²',
      wireNumber: wa.wireNumber || wa.netName,
      cableId: wa.cableId || undefined,
      coreNumber: wa.coreNumber || undefined,
      manualRoute: wa.manualRoute === 'true' ? true : undefined,
    });
  }

  // Annotations
  const annotations: E3Annotation[] = [];
  const annRe = /<Annotation\s+([^>]+?)\s*\/?>/g;
  let anm: RegExpExecArray | null;
  while ((anm = annRe.exec(xml)) !== null) {
    const aa = parseXmlAttrs(anm[1]);
    const kind: AnnotationKind =
      aa.kind === 'rect' || aa.kind === 'callout' ? aa.kind : 'text';
    annotations.push({
      id: aa.id,
      sheetId: aa.sheetId || sheets[0]?.id || 'sheet-1',
      kind,
      x: Number(aa.x || 0),
      y: Number(aa.y || 0),
      width: Number(aa.width || 160),
      height: Number(aa.height || 40),
      text: aa.text || '',
      color: aa.color || undefined,
      fontSize: aa.fontSize ? Number(aa.fontSize) : undefined,
      strokeWidth: aa.strokeWidth ? Number(aa.strokeWidth) : undefined,
      strokeStyle:
        aa.strokeStyle === 'solid' || aa.strokeStyle === 'dashed' || aa.strokeStyle === 'dotted'
          ? aa.strokeStyle
          : undefined,
    });
  }

  // Layers
  const rawLayers: Partial<Record<CadLayerId, { visible: boolean; locked: boolean }>> = {};
  const layerRe = /<Layer\s+([^>]+?)\s*\/?>/g;
  let lm: RegExpExecArray | null;
  while ((lm = layerRe.exec(xml)) !== null) {
    const la = parseXmlAttrs(lm[1]);
    if (
      la.id === 'devices' ||
      la.id === 'wires' ||
      la.id === 'annotations' ||
      la.id === 'frame'
    ) {
      rawLayers[la.id] = {
        visible: la.visible !== 'false',
        locked: la.locked === 'true',
      };
    }
  }
  const layers = resolveCadLayers(rawLayers, visualSettings.showGostFrame);

  // Sheet Revisions
  const revBySheet = new Map<string, NonNullable<E3Sheet['revisions']>>();
  const sRevRe = /<SheetRevision\s+([^>]+?)\s*\/?>/g;
  let srm: RegExpExecArray | null;
  while ((srm = sRevRe.exec(xml)) !== null) {
    const sra = parseXmlAttrs(srm[1]);
    if (!sra.sheetId) continue;
    let parsedSnapshot = undefined;
    if (sra.snapshot) {
      try {
        parsedSnapshot = JSON.parse(sra.snapshot);
      } catch {
        parsedSnapshot = undefined;
      }
    }
    const areas = (sra.changedAreas || 'metadata')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean) as SheetChangeArea[];
    const list = revBySheet.get(sra.sheetId) || [];
    list.push({
      revision: Number(sra.revision || list.length + 1),
      revisionLabel: sra.revisionLabel || undefined,
      changeDoc: sra.changeDoc || undefined,
      changeDate: sra.changeDate || undefined,
      released: sra.released === 'true' ? true : undefined,
      projectRevision: Number(sra.projectRevision || rootAttrs.revision || 1),
      timestamp: sra.timestamp || rootAttrs.updatedAt || new Date().toISOString(),
      author: sra.author || rootAttrs.author || 'Инженер',
      summary: sra.summary || 'Изменение листа',
      changedAreas: areas.length > 0 ? areas : ['metadata'],
      snapshot: parsedSnapshot,
    });
    revBySheet.set(sra.sheetId, list);
  }
  const sheetsWithRevisions = sheets.map((s) => {
    const revs = revBySheet.get(s.id);
    return revs && revs.length > 0 ? { ...s, revisions: revs } : s;
  });

  // SymbolLibrary
  const symbolLibrary: E3SymbolDef[] = [];
  const symDefRe = /<Symbol\s+([^>]+?)\s*\/?>/g;
  let symm: RegExpExecArray | null;
  while ((symm = symDefRe.exec(xml)) !== null) {
    const syma = parseXmlAttrs(symm[1]);
    if (!syma.id) continue;
    let parsedShapes = [];
    let parsedPins = [];
    try {
      if (syma.shapesJson) parsedShapes = JSON.parse(syma.shapesJson);
    } catch {
      parsedShapes = [];
    }
    try {
      if (syma.pinsJson) parsedPins = JSON.parse(syma.pinsJson);
    } catch {
      parsedPins = [];
    }
    symbolLibrary.push({
      id: syma.id,
      name: syma.name || syma.e3BlockName || syma.id,
      e3BlockName: syma.e3BlockName || syma.id,
      category: (syma.category as E3Device['category']) || 'breaker',
      description: syma.description || undefined,
      width: Number(syma.width || 120),
      height: Number(syma.height || 100),
      shapes: Array.isArray(parsedShapes) ? parsedShapes : [],
      defaultPins: Array.isArray(parsedPins) ? parsedPins : [],
      isCustom: syma.isCustom === 'true',
    });
  }

  return normalizeProjectSheetRevisions({
    schemaVersion: rootAttrs.schemaVersion || '1.0',
    id: rootAttrs.id || `proj-${Date.now()}`,
    name: rootAttrs.name || 'Импортированный проект E3',
    projectCode: rootAttrs.projectCode || 'E3-IMPORT',
    fluxProjectKey: rootAttrs.fluxProjectKey || `FLUX_${Date.now()}`,
    author: rootAttrs.author || 'Инженер',
    revision: Number(rootAttrs.revision || 1),
    standard: rootAttrs.standard === 'IEC' ? 'IEC' : 'GOST',
    updatedAt: rootAttrs.updatedAt || new Date().toISOString(),
    sheets: sheetsWithRevisions,
    devices,
    wires,
    cables,
    annotations,
    layers,
    symbolLibrary: symbolLibrary.length > 0 ? symbolLibrary : undefined,
    visualSettings,
  });
}

// ============================================================================
// Flux E3 Bridge Bidirectional Exchange (compatible with e3/exportTypes.ts)
// ============================================================================

export function exportToFluxBridge(project: E3Project): FluxBridgeBundle {
  const nodes: FluxExportNode[] = project.devices.map((dev) => ({
    elementId: dev.elementId,
    version: `rev-${project.revision}-${dev.id}`,
    tag: dev.attributes.find((a) => a.name === 'Тег КИП')?.value || dev.designation,
    designation: dev.designation,
    status: dev.article ? 'one' : 'none',
    solutionId: `sol-${dev.e3BlockName.toLowerCase()}`,
    solutionName: dev.e3BlockName,
    category: dev.category,
    symbolId: dev.symbolId,
    pins: dev.pins.map(({ name, dx, dy, direction, signalType }) => ({
      name,
      dx,
      dy,
      direction,
      signalType,
    })),
    customSymbol: dev.customSymbol ? structuredClone(dev.customSymbol) : undefined,
    rect: {
      sheet: dev.sheetId,
      x: dev.x,
      y: dev.y,
      rotation: dev.rotation,
      width: dev.width,
      height: dev.height,
    },
    attrs: [
      { name: 'Артикул', value: dev.article, owner: '', conflict: 'flux' },
      { name: 'Производитель', value: dev.manufacturer, owner: '', conflict: 'flux' },
      { name: 'Наименование', value: dev.componentName, owner: '', conflict: 'flux' },
      ...dev.attributes.map((a) => ({
        name: a.name,
        value: a.value,
        owner: a.owner,
        conflict: a.conflict,
        service: a.service,
      })),
    ],
    checked: dev.bindingState !== 'REMOVED_IN_FLUX',
  }));

  return {
    format: 'flux-e3-bridge/v1',
    fluxProjectKey: project.fluxProjectKey,
    projectName: project.name,
    exportedAt: new Date().toISOString(),
    revision: project.revision,
    visualSettings: structuredClone(project.visualSettings),
    nodes,
    wires: structuredClone(project.wires),
    cables: structuredClone(project.cables),
    sheets: structuredClone(project.sheets),
    symbolLibrary: project.symbolLibrary?.length ? structuredClone(project.symbolLibrary) : undefined,
  };
}

export function importFromFluxBridge(bundle: FluxBridgeBundle, baseProject: E3Project): E3Project {
  if (bundle.format !== 'flux-e3-bridge/v1') {
    throw new Error('Неподдерживаемый формат моста Flux E3.');
  }

  const isSameProject =
    Boolean(bundle.fluxProjectKey) &&
    bundle.fluxProjectKey === baseProject.fluxProjectKey &&
    !(bundle as unknown as { replaceAll?: boolean }).replaceAll;

  const next = structuredClone(baseProject);
  next.name = bundle.projectName || next.name;
  next.fluxProjectKey = bundle.fluxProjectKey || next.fluxProjectKey;
  next.revision = Math.max(next.revision + 1, bundle.revision || next.revision + 1);
  next.updatedAt = new Date().toISOString();
  if (bundle.sheets?.length) next.sheets = structuredClone(bundle.sheets);
  if (bundle.wires?.length) next.wires = structuredClone(bundle.wires);
  else if (!isSameProject) next.wires = [];
  if (bundle.cables?.length) next.cables = structuredClone(bundle.cables);
  else if (!isSameProject) next.cables = [];
  if (bundle.visualSettings) next.visualSettings = parseVisualSettings(JSON.stringify(bundle.visualSettings));
  if (bundle.symbolLibrary?.length) {
    const mergedLib = new Map<string, E3SymbolDef>();
    for (const s of next.symbolLibrary || []) mergedLib.set(s.id, s);
    for (const s of bundle.symbolLibrary) mergedLib.set(s.id, structuredClone(s));
    next.symbolLibrary = Array.from(mergedLib.values());
  }

  if (!isSameProject) {
    next.devices = [];
  }

  const existingByElementId = new Map(next.devices.map((d) => [d.elementId, d]));

  for (const node of bundle.nodes) {
    const existing = existingByElementId.get(node.elementId);
    const article = node.attrs.find((a) => a.name === 'Артикул')?.value || '';
    const manufacturer = node.attrs.find((a) => a.name === 'Производитель')?.value || '';
    const componentName = node.attrs.find((a) => a.name === 'Наименование')?.value || node.solutionName || node.designation;
    const customAttrs: E3Attribute[] = node.attrs
      .filter((a) => !['Артикул', 'Производитель', 'Наименование', 'FLUX_CUSTOM_SYMBOL'].includes(a.name))
      .map((a) => ({
        name: a.name,
        value: a.value,
        owner: a.owner || '',
        conflict: a.conflict || 'flux',
        service: a.service,
      }));

    const sheetTarget = node.rect?.sheet || (node as unknown as { sheetId?: string }).sheetId || next.sheets[0]?.id || 'sheet-1';
    const nodeX = node.rect?.x ?? (node as unknown as { x?: number }).x ?? 180;
    const nodeY = node.rect?.y ?? (node as unknown as { y?: number }).y ?? 180;
    const nodeW = node.rect?.width ?? 0;
    const nodeH = node.rect?.height ?? 0;
    const nodeRot = ((node.rect?.rotation ?? 0) % 360) as 0 | 90 | 180 | 270;
    const isChecked = node.checked !== false;

    if (existing) {
      existing.designation = node.designation;
      existing.article = article || existing.article;
      existing.manufacturer = manufacturer || existing.manufacturer;
      existing.componentName = componentName || existing.componentName;
      if (node.category) existing.category = node.category;
      if (node.symbolId) existing.symbolId = node.symbolId;
      if (nodeW > 0) existing.width = nodeW;
      if (nodeH > 0) existing.height = nodeH;
      if (node.customSymbol?.shapes?.length) {
        existing.customSymbol = structuredClone(node.customSymbol);
      }
      if (node.pins?.length) {
        existing.pins = node.pins.map((p, idx) => ({
          ...p,
          id: existing.pins[idx]?.id || `${existing.id}-p${idx + 1}`,
        }));
      }
      existing.sheetId = sheetTarget;
      existing.x = nodeX;
      existing.y = nodeY;
      existing.rotation = nodeRot;
      existing.e3BlockName = node.solutionName || existing.e3BlockName;
      existing.bindingState = isChecked ? 'PLACED' : 'REMOVED_IN_FLUX';
      existing.attributes = customAttrs;
    } else {
      const prefix = node.designation.replace(/^-/, '').replace(/\d.*$/, '').toUpperCase();
      const catItem =
        E3_CATALOG.find((c) => c.e3BlockName === node.solutionName) ||
        E3_CATALOG.find((c) => c.defaultPrefix === prefix) ||
        E3_CATALOG[0];
      const newId = `dev-${node.elementId}`;
      const resolvedPins = node.pins?.length
        ? node.pins.map((p, idx) => ({ ...p, id: `${newId}-p${idx + 1}` }))
        : catItem.pins.map((p, idx) => ({ ...p, id: `${newId}-p${idx + 1}` }));
      next.devices.push({
        id: newId,
        elementId: node.elementId,
        designation: node.designation,
        componentName,
        article: article || catItem.article,
        manufacturer: manufacturer || catItem.manufacturer,
        category: node.category || catItem.category,
        sheetId: sheetTarget,
        x: nodeX,
        y: nodeY,
        rotation: nodeRot,
        width: nodeW || catItem.width,
        height: nodeH || catItem.height,
        e3BlockName: node.solutionName || catItem.e3BlockName,
        symbolId: node.symbolId || catItem.symbolId,
        bindingState: isChecked ? 'PLACED' : 'REMOVED_IN_FLUX',
        pins: resolvedPins,
        attributes: customAttrs,
        customSymbol: node.customSymbol ? structuredClone(node.customSymbol) : undefined,
      });
    }
  }

  return next;
}

// ============================================================================
// Visual Settings Synchronization Export & Import
// ============================================================================

export function exportVisualSettings(settings: E3VisualSettings): string {
  return JSON.stringify(
    {
      format: 'flux-e3-visual-settings/v1',
      exportedAt: new Date().toISOString(),
      settings,
    },
    null,
    2
  );
}

export function parseVisualSettings(rawJson: string): E3VisualSettings {
  const parsed = JSON.parse(rawJson);
  const src = parsed?.format === 'flux-e3-visual-settings/v1' ? parsed.settings : parsed;
  if (!src || typeof src !== 'object') {
    throw new Error('Некорректный JSON настроек визуализации.');
  }
  return {
    ...structuredClone(DEFAULT_VISUAL_SETTINGS),
    ...src,
    netColors: {
      ...DEFAULT_VISUAL_SETTINGS.netColors,
      ...(src.netColors || {}),
    },
  };
}

// ============================================================================
// AutoCAD / CAD ASCII DXF Exporter
// ============================================================================

export function exportToDxf(project: E3Project, sheetId?: string): string {
  const targetSheet = project.sheets.find((s) => s.id === sheetId) || project.sheets[0];
  if (!targetSheet) return '';
  return exportSheetsToDxf(project, {
    sheetIds: [targetSheet.id],
    includeGostFrame: true,
    editableBlocks: true,
  });
}

// ============================================================================
// CSV & Printable HTML Report Exporters
// ============================================================================

export function exportBomCsv(rows: BomRow[]): string {
  const header = ['Поз.', 'Обозначение', 'Наименование', 'Артикул', 'Производитель', 'Кол-во', 'Ед.', 'Примечание'];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(';')];
  for (const r of rows) {
    lines.push(
      [r.pos, r.designationText, r.componentName, r.article, r.manufacturer, r.quantity, r.unit, r.note]
        .map(esc)
        .join(';')
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}

export function exportCableJournalCsv(
  rows: CableJournalRow[],
  netRows?: NetWireLengthRow[]
): string {
  const header = [
    'Кабель',
    'Марка',
    'Жилы (исп./всего)',
    'Сечение',
    'Длина, м',
    'Длина по схеме, мм',
    'Цепи кабеля',
    'Откуда',
    'Куда',
    'Экран',
  ];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(';')];
  for (const r of rows) {
    const netsSummary = (r.netLengths || [])
      .map((n) => `${n.netName}: ${n.lengthMm} мм`)
      .join(', ');
    lines.push(
      [
        r.designation,
        r.cableType,
        `${r.usedCores}/${r.coresCount}`,
        r.crossSection,
        r.lengthMeters,
        r.wireLengthMm ?? 0,
        netsSummary || '—',
        r.fromDevice,
        r.toDevice,
        r.shielded ? 'Да' : 'Нет',
      ]
        .map(esc)
        .join(';')
    );
  }
  if (netRows && netRows.length > 0) {
    lines.push('');
    lines.push(
      ['Цепь (Net)', 'Потенциал', 'Проводов', 'Маркировка', 'Кабели', 'Сечение', 'Сумм. длина, мм', 'Длина, м']
        .map(esc)
        .join(';')
    );
    for (const n of netRows) {
      lines.push(
        [
          n.netName,
          n.signalType,
          n.wireCount,
          n.wireNumbers.join(', ') || '—',
          n.cableDesignations.join(', ') || 'Монтаж',
          n.crossSections.join(', ') || '—',
          n.totalLengthMm,
          n.totalLengthMeters.toFixed(3),
        ]
          .map(esc)
          .join(';')
      );
    }
  }
  return '\uFEFF' + lines.join('\r\n');
}

export function exportNetWireLengthsCsv(rows: NetWireLengthRow[]): string {
  const header = [
    'Цепь (Net)',
    'Потенциал',
    'Проводов',
    'Маркировка',
    'Кабели',
    'Сечение',
    'Сумм. длина, мм',
    'Длина, м',
  ];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(';')];
  for (const n of rows) {
    lines.push(
      [
        n.netName,
        n.signalType,
        n.wireCount,
        n.wireNumbers.join(', ') || '—',
        n.cableDesignations.join(', ') || 'Монтаж',
        n.crossSections.join(', ') || '—',
        n.totalLengthMm,
        n.totalLengthMeters.toFixed(3),
      ]
        .map(esc)
        .join(';')
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}

function vbsEsc(str: string): string {
  return String(str ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/"/g, '""');
}

export function generateE3ComScript(
  project?: E3Project,
  scriptMode: 'build' | 'export' = 'build',
  importFilePath?: string
): string {
  const code = project?.projectCode || 'FLUX-E3-PRJ';
  const name = project?.name || 'Проект E3ProMax';
  const fluxKey = project?.fluxProjectKey || 'FLUX_KEY';
  const author = project?.author || 'Инженер';
  const sheets = project?.sheets || [];
  const devices = project?.devices || [];
  const cables = project?.cables || [];
  const wires = project?.wires || [];

  const sheetMap = new Map(sheets.map((s, idx) => [s.id, { sheet: s, varName: `shId_${idx + 1}`, idx: idx + 1 }]));

  const sheetDecl = sheets.map((_, idx) => `shId_${idx + 1}, shX1_${idx + 1}, shY1_${idx + 1}, shX2_${idx + 1}, shY2_${idx + 1}`).join(', ');
  const sheetLines = sheets
    .map((s, i) => {
      const idx = i + 1;
      const varName = `shId_${idx}`;
      return `  ${varName} = CreateOrGetSheet(Prj, Sheet, "${vbsEsc(s.number + '. ' + s.name)}", "${vbsEsc(s.format)}", detectedFmt, ${idx === 1 ? 'True' : 'False'}, exIds, exCnt)
  If ${varName} > 0 Then
    sheetsOk = sheetsOk + 1
    Call GetSheetBounds(Sheet, ${varName}, "${vbsEsc(s.format)}", shX1_${idx}, shY1_${idx}, shX2_${idx}, shY2_${idx})
    Call DrawGostFrame(Graph, ${varName}, shX1_${idx}, shY1_${idx}, shX2_${idx}, shY2_${idx}, "${vbsEsc(s.titleBlock.documentCode)}", "${vbsEsc(s.name)}", "${vbsEsc(s.titleBlock.designer)}")
  End If`;
    })
    .join('\n');

  const e3ColorIndexForHex = (hex?: string): number => {
    if (!hex) return 0;
    const c = hex.trim().toLowerCase();
    if (c === '#dc2626' || c === '#ef4444') return 1;
    if (c === '#d97706' || c === '#f59e0b') return 2;
    if (c === '#15803d' || c === '#16a34a' || c === '#0f766e') return 3;
    if (c === '#0284c7' || c === '#4f46e5') return 4;
    if (c === '#64748b') return 8;
    return 0;
  };

  const e3StyleCode = (style?: string, dashed?: boolean): number => {
    const resolved = style || (dashed ? 'dashed' : 'solid');
    if (resolved === 'dashed') return 2;
    if (resolved === 'dashdot') return 3;
    if (resolved === 'dotted') return 4;
    return 1;
  };

  const devLines = devices
    .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
    .map((d) => {
      const shEntry = sheetMap.get(d.sheetId);
      const sw = shEntry?.sheet.width || 1400;
      const sh = shEntry?.sheet.height || 920;
      const idx = shEntry?.idx || (sheets.length > 0 ? 1 : 0);
      const shVar = idx > 0 ? `shId_${idx}` : '0';

      const customSymbolJson =
        d.customSymbol && d.customSymbol.shapes.length > 0
          ? JSON.stringify({
              width: d.width,
              height: d.height,
              showBodyBorder: Boolean(d.customSymbol.showBodyBorder),
              shapes: d.customSymbol.shapes,
            })
          : '';

      const rawAttrs: Array<[string, string]> = [
        ['Артикул', d.article],
        ['Производитель', d.manufacturer],
        ['Наименование', d.componentName],
        ['Категория', d.category],
        ['FLUX_ELEMENT_ID', d.elementId],
        ['FLUX_BLOCK', d.e3BlockName],
        ...(customSymbolJson ? ([['FLUX_CUSTOM_SYMBOL', customSymbolJson]] as Array<[string, string]>) : []),
        ...d.attributes.filter((a) => !a.service).map((a): [string, string] => [a.name, a.value]),
      ];
      const attrList = rawAttrs.filter(([, v]) => String(v || '').trim() !== '');

      const attrsOnDevLines = attrList
        .map(([k, v]) => `    Call SafeSetDevAttr(Dev, "${vbsEsc(k)}", "${vbsEsc(v)}")`)
        .join('\n');

      const attrsOnGrpLines = attrList
        .map(([k, v]) => `      Call SafeSetGraphAttr(Graph, "${vbsEsc(k)}", "${vbsEsc(v)}")`)
        .join('\n');

      const pinCreateLines = d.pins
        .map((p) => {
          const abs = getAbsolutePinPos(d, p);
          return `    Call SafeCreateDevicePin(Prj, PinObj, curDevId, ${shVar}, "${vbsEsc(p.name)}", MapX(shX1_${idx}, shX2_${idx}, ${abs.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${abs.y}, ${sh}))`;
        })
        .join('\n');

      const pinDrawLines = d.pins
        .map((p) => {
          const abs = getAbsolutePinPos(d, p);
          return `    Call DrawPinTickGrouped(Graph, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${abs.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${abs.y}, ${sh}), "${vbsEsc(abs.direction)}", "${vbsEsc(p.name)}", gIds, gCnt)`;
        })
        .join('\n');

      const customDrawLines: string[] = [];
      if (d.customSymbol && d.customSymbol.shapes.length > 0) {
        const mx = (lx: number) => `MapX(shX1_${idx}, shX2_${idx}, ${d.x + lx}, ${sw})`;
        const my = (ly: number) => `MapY(shY1_${idx}, shY2_${idx}, ${d.y + ly}, ${sh})`;
        for (const shape of d.customSymbol.shapes) {
          const col = e3ColorIndexForHex(shape.strokeColor);
          const lStyle = shape.kind !== 'text' ? e3StyleCode(shape.strokeStyle, shape.dashed) : 1;
          const lwMm = shape.kind !== 'text' && shape.strokeWidth ? Number((shape.strokeWidth * 0.2).toFixed(2)) : 0.35;
          if (shape.kind === 'line') {
            customDrawLines.push(
              `    Call DrawCustomLine(Graph, ${shVar}, ${mx(shape.x1)}, ${my(shape.y1)}, ${mx(shape.x2)}, ${my(shape.y2)}, ${col}, ${lwMm}, ${lStyle}, gIds, gCnt)`
            );
          } else if (shape.kind === 'rect') {
            customDrawLines.push(
              `    Call DrawCustomRect(Graph, ${shVar}, ${mx(shape.x)}, ${my(shape.y + shape.height)}, ${mx(shape.x + shape.width)}, ${my(shape.y)}, ${col}, ${lwMm}, ${lStyle}, gIds, gCnt)`
            );
          } else if (shape.kind === 'circle') {
            customDrawLines.push(
              `    Call DrawCustomCircle(Graph, ${shVar}, ${mx(shape.cx)}, ${my(shape.cy)}, Abs(${mx(shape.cx + shape.r)} - ${mx(shape.cx)}), ${col}, ${lwMm}, ${lStyle}, gIds, gCnt)`
            );
          } else if (shape.kind === 'polyline' && (shape.points?.length || 0) >= 2) {
            const pts = shape.closed ? [...shape.points, shape.points[0]] : shape.points;
            for (let pi = 0; pi < pts.length - 1; pi++) {
              customDrawLines.push(
                `    Call DrawCustomLine(Graph, ${shVar}, ${mx(pts[pi].x)}, ${my(pts[pi].y)}, ${mx(pts[pi + 1].x)}, ${my(pts[pi + 1].y)}, ${col}, ${lwMm}, ${lStyle}, gIds, gCnt)`
              );
            }
          } else if (shape.kind === 'arc') {
            const pts = sampleArcPoints(shape.cx, shape.cy, shape.r, shape.startAngle, shape.endAngle, 14);
            for (let pi = 0; pi < pts.length - 1; pi++) {
              customDrawLines.push(
                `    Call DrawCustomLine(Graph, ${shVar}, ${mx(pts[pi].x)}, ${my(pts[pi].y)}, ${mx(pts[pi + 1].x)}, ${my(pts[pi + 1].y)}, ${col}, ${lwMm}, ${lStyle}, gIds, gCnt)`
              );
            }
          } else if (shape.kind === 'text') {
            const txt = resolveDynamicSymbolText(shape, d);
            customDrawLines.push(
              `    Call DrawCustomText(Graph, ${shVar}, ${mx(shape.x)}, ${my(shape.y)}, "${vbsEsc(txt)}", ${Number(((shape.fontSize || 10) * 0.26).toFixed(2))}, ${col}, gIds, gCnt)`
            );
          }
        }
        customDrawLines.push(
          `    Call DrawCustomText(Graph, ${shVar}, ${mx(0)}, ${my(-6)}, "${vbsEsc(d.designation)}", 3.5, 0, gIds, gCnt)`
        );
      }

      const drawBodyBlock =
        customDrawLines.length > 0
          ? customDrawLines.join('\n')
          : `    Call DrawDeviceBox(Graph, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${d.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${d.y + d.height}, ${sh}), MapX(shX1_${idx}, shX2_${idx}, ${d.x + d.width}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${d.y}, ${sh}), "${vbsEsc(d.designation)}", "${vbsEsc(d.article)}", "${vbsEsc(d.category)}", gIds, gCnt)`;

      const gCap = Math.max(128, customDrawLines.length + d.pins.length + 32);

      return `  ' --- Цельное изделие ${vbsEsc(d.designation)} (${vbsEsc(d.componentName)}) ---
  curDevId = CreateFluxDevice(Prj, Dev, Sym, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${d.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${d.y + d.height}, ${sh}), MapX(shX1_${idx}, shX2_${idx}, ${d.x + d.width}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${d.y}, ${sh}), "${vbsEsc(d.designation)}", "${vbsEsc(d.componentName)}", "${vbsEsc(d.article)}", "${vbsEsc(d.e3BlockName)}", "${vbsEsc(d.manufacturer)}")
  If curDevId > 0 Then
    devDbOk = devDbOk + 1
${attrsOnDevLines}
${pinCreateLines}
  End If
  If ${shVar} > 0 Then
    gCnt = 0
    ReDim gIds(${gCap})
${drawBodyBlock}
${pinDrawLines}
    curGrpId = FinalizeIntegralDeviceGroup(Graph, ${shVar}, gIds, gCnt, curDevId)
    If curGrpId > 0 Then
      Graph.SetId curGrpId
      Call SafeSetGraphAttr(Graph, "Обозначение", "${vbsEsc(d.designation)}")
${attrsOnGrpLines}
    End If
    devGfxOk = devGfxOk + 1
  End If`;
    })
    .join('\n');

  const wireLines = wires
    .filter((w) => w.waypoints.length >= 2)
    .map((w) => {
      const shEntry = sheetMap.get(w.sheetId);
      const sw = shEntry?.sheet.width || 1400;
      const sh = shEntry?.sheet.height || 920;
      const idx = shEntry?.idx || (sheets.length > 0 ? 1 : 0);
      const shVar = idx > 0 ? `shId_${idx}` : '0';
      const colCode =
        w.signalType === 'power' ? 1 : w.signalType === 'neutral' ? 4 : w.signalType === 'pe' ? 3 : 6;
      const segs: string[] = [];
      for (let i = 0; i < w.waypoints.length - 1; i++) {
        const p1 = w.waypoints[i];
        const p2 = w.waypoints[i + 1];
        segs.push(
          `    If DrawWireSeg(Prj, Con, Graph, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${p1.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${p1.y}, ${sh}), MapX(shX1_${idx}, shX2_${idx}, ${p2.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${p2.y}, ${sh}), ${colCode}) Then wiresOk = wiresOk + 1 Else wiresErr = wiresErr + 1`
        );
      }
      const mid = w.waypoints[Math.floor(w.waypoints.length / 2)];
      segs.push(
        `    Call DrawWireLabel(Graph, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${mid.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${mid.y}, ${sh}), "${vbsEsc(w.wireNumber || w.netName)}", ${colCode})`
      );
      return `  If ${shVar} > 0 Then\n${segs.join('\n')}\n  End If`;
    })
    .join('\n');

  const cableLines = cables
    .map(
      (c) =>
        `  If CreateFluxCable(Prj, Dev, "${vbsEsc(c.designation)}", "${vbsEsc(c.cableType)}", "${vbsEsc(c.fromDevice)}", "${vbsEsc(c.toDevice)}", ${c.lengthMeters}) Then cabOk = cabOk + 1`
    )
    .join('\n');

  const entryCall =
    scriptMode === 'export' ? 'Call ExportActiveE3sToFluxJson()' : 'Call BuildNativeE3sProject()';

  return `' ============================================================================
' E3ProMax <-> Zuken E3.series 2022 SP2 (Build 23.20+) COM Bridge Script
' Проект: ${vbsEsc(name)} (${vbsEsc(code)})
' Ключ синхронизации: ${vbsEsc(fluxKey)}
' Режим скрипта: ${scriptMode === 'export' ? 'Выгрузка из E3.series в E3ProMax (.json)' : 'Прямой перенос и открытие в E3.series (.e3s)'}
'
' КАК ЗАПУСТИТЬ:
'   Двойной клик по файлу .vbs (при открытом E3.series / E3.cable)
'   или внутри E3.series: Сервис -> Выполнить скрипт (Tools -> Execute Script).
' Лог выполнения сохраняется рядом со скриптом в: flux_e3_com_debug.log (UTF-8)
' ============================================================================
Option Explicit

Dim App, Prj, Sheet, Dev, Sym, PinObj, Graph, Con, outFolder, fso, logFilePath, gImportFilePath
Dim curDevId, curGrpId, gIds(), gCnt
${sheetDecl ? `Dim ${sheetDecl}` : ''}
Set fso = CreateObject("Scripting.FileSystemObject")

outFolder = fso.GetParentFolderName(WScript.ScriptFullName)
If outFolder = "" Then outFolder = "D:\\Downloads"
logFilePath = outFolder & "\\flux_e3_com_debug.log"
gImportFilePath = "${vbsEsc(importFilePath || '')}"
If WScript.Arguments.Named.Exists("file") Then
  gImportFilePath = WScript.Arguments.Named("file")
End If

Call InitUtf8Log()
Call LogTrace("INFO", "=== Старт E3ProMax COM Bridge (${scriptMode}) ===")
Call LogTrace("INFO", "WSH=" & WScript.FullName & " v" & WScript.Version & " | outFolder=" & outFolder)
Call LogTrace("INFO", "Проект: ${vbsEsc(code)} (${vbsEsc(name)}) | Листов=${sheets.length}, Изделий=${devices.length}, Цепей=${wires.length}, Кабелей=${cables.length}")

On Error Resume Next
Set App = GetObject(, "CT.Application")
If Err.Number <> 0 Then
  Call LogTrace("WARN", "GetObject(CT.Application) не нашёл открытый экземпляр: #" & Err.Number & " " & Err.Description)
  Err.Clear
End If
If App Is Nothing Then
  Call LogTrace("INFO", "Пробуем создать экземпляр через CreateObject(CT.Application)...")
  Set App = CreateObject("CT.Application")
  If Err.Number <> 0 Then
    Call LogTrace("ERROR", "CreateObject(CT.Application) ошибка #" & Err.Number & ": " & Err.Description)
    Err.Clear
  End If
End If
On Error GoTo 0

If App Is Nothing Then
  Call LogTrace("ERROR", "КРИТИЧЕСКАЯ ОШИБКА: не удалось подключиться к Zuken E3.series (CT.Application). Проверьте запуск E3.series и разрядность (64/32 bit).")
  If Not WScript.Arguments.Named.Exists("silent") Then
    MsgBox "Не удалось подключиться к Zuken E3.series (CT.Application)." & vbCrLf & "Запустите E3.series и проверьте лог: " & logFilePath, vbCritical, "E3ProMax Bridge"
  End If
  WScript.Quit 1
End If

Call LogTrace("INFO", "Подключено к CT.Application успешно.")
Set Prj = App.CreateJobObject()
Set Sheet = Prj.CreateSheetObject()
Set Dev = Prj.CreateDeviceObject()
Set Sym = Prj.CreateSymbolObject()
Set PinObj = Prj.CreatePinObject()
Set Graph = Prj.CreateGraphObject()
Set Con = Prj.CreateConnectionObject()

${entryCall}
Call LogTrace("INFO", "=== Завершение E3ProMax COM Bridge ===")

Sub InitUtf8Log()
  On Error Resume Next
  Dim stInit
  If Not fso.FileExists(logFilePath) Then
    Set stInit = CreateObject("ADODB.Stream")
    stInit.Type = 2
    stInit.Charset = "utf-8"
    stInit.Open
    stInit.WriteText ""
    stInit.SaveToFile logFilePath, 2
    stInit.Close
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub LogTrace(ByVal lvl, ByVal msg)
  On Error Resume Next
  Dim ts, lineTxt, tf, existingTxt, stLog
  ts = Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & " " & Right("0" & Hour(Now), 2) & ":" & Right("0" & Minute(Now), 2) & ":" & Right("0" & Second(Now), 2)
  lineTxt = "[" & ts & "] [" & lvl & "] " & msg
  WScript.Echo lineTxt
  existingTxt = ""
  Set stLog = CreateObject("ADODB.Stream")
  If Err.Number = 0 Then
    stLog.Type = 2
    stLog.Charset = "utf-8"
    If fso.FileExists(logFilePath) Then
      stLog.Open
      stLog.LoadFromFile logFilePath
      existingTxt = stLog.ReadText
      stLog.Close
    End If
    stLog.Open
    stLog.WriteText existingTxt & lineTxt & vbCrLf
    stLog.SaveToFile logFilePath, 2
    stLog.Close
  Else
    Err.Clear
    Set tf = fso.OpenTextFile(logFilePath, 8, True, 0)
    If Err.Number = 0 Then
      tf.WriteLine lineTxt
      tf.Close
    End If
  End If
  Err.Clear
  If Not (App Is Nothing) Then
    If lvl = "ERROR" Then
      App.PutInfo 2, "[E3ProMax] " & msg
    ElseIf lvl = "WARN" Then
      App.PutInfo 1, "[E3ProMax] " & msg
    Else
      App.PutInfo 0, "[E3ProMax] " & msg
    End If
    Err.Clear
  End If
  On Error GoTo 0
End Sub

Function MapX(ByVal xMin, ByVal xMax, ByVal fx, ByVal sw)
  Dim usableW, padX
  If sw <= 0 Then sw = 1400
  usableW = xMax - xMin
  padX = usableW * 0.03
  If padX < 4 Then padX = 4
  MapX = Round(xMin + padX + (fx / sw) * (usableW - padX * 2), 2)
End Function

Function MapY(ByVal yMin, ByVal yMax, ByVal fy, ByVal sh)
  Dim usableH, padBot, padTop
  If sh <= 0 Then sh = 920
  usableH = yMax - yMin
  padBot = usableH * 0.14
  padTop = usableH * 0.04
  If padBot < 25 Then padBot = 25
  If padTop < 6 Then padTop = 6
  MapY = Round(yMax - padTop - (fy / sh) * (usableH - padBot - padTop), 2)
End Function

Sub BuildNativeE3sProject()
  Dim targetE3s, prjName, ans, detectedFmt, exIds, exCnt
  Dim sheetsOk, devDbOk, devGfxOk, wiresOk, wiresErr, cabOk
  prjName = "${vbsEsc(code)}"
  targetE3s = outFolder & "\\" & prjName & "_native.e3s"
  detectedFmt = "" : exCnt = 0
  sheetsOk = 0 : devDbOk = 0 : devGfxOk = 0 : wiresOk = 0 : wiresErr = 0 : cabOk = 0

  On Error Resume Next
  If Prj.GetId() > 0 Then
    Call LogTrace("INFO", "В E3 уже открыт проект ID=" & Prj.GetId() & " Name='" & Prj.GetName() & "'")
    If WScript.Arguments.Named.Exists("silent") Then
      Prj.Close
      Err.Clear
      Call LogTrace("INFO", "Silent-режим: закрыт предыдущий проект, вызываем Prj.Create('" & prjName & "')")
      Prj.Create prjName
    Else
      ans = MsgBox("В E3.series уже открыт проект '" & Prj.GetName() & "'." & vbCrLf & vbCrLf & "Да = закрыть его и создать новый '" & prjName & "'" & vbCrLf & "Нет = добавить элементы E3ProMax в текущий проект", vbYesNoCancel + vbQuestion, "E3ProMax -> E3.series")
      If ans = vbCancel Then Exit Sub
      If ans = vbYes Then
        Prj.Close
        Err.Clear
        Prj.Create prjName
      End If
    End If
  Else
    Call LogTrace("INFO", "Открытый проект отсутствует, вызываем Prj.Create('" & prjName & "')")
    Prj.Create prjName
  End If
  If Err.Number <> 0 Then
    Call LogTrace("ERROR", "Ошибка открытия/создания проекта #" & Err.Number & ": " & Err.Description)
    Err.Clear
  Else
    Call LogTrace("INFO", "Активный проект ID=" & Prj.GetId() & " Name='" & Prj.GetName() & "'")
  End If

  exCnt = Prj.GetSheetIds(exIds)
  If Err.Number = 0 And exCnt > 0 Then
    Sheet.SetId exIds(1)
    detectedFmt = Sheet.GetFormat()
    Call LogTrace("INFO", "Обнаружены стартовые листы шаблона E3: " & exCnt & " шт., формат='" & detectedFmt & "' (ID1=" & exIds(1) & ")")
  Else
    Err.Clear
  End If

  Call Prj.SetAttributeValue("FLUX_PROJECT", "${vbsEsc(fluxKey)}")
  Call Prj.SetAttributeValue("Наименование", "${vbsEsc(name)}")
  Call Prj.SetAttributeValue("Автор", "${vbsEsc(author)}")
  Err.Clear
  On Error GoTo 0

  Call LogTrace("INFO", "Перенос листов (${sheets.length}), изделий (${devices.length}), цепей (${wires.length}), кабелей (${cables.length})...")

  ' 1. Листы и рамки ГОСТ (${sheets.length})
${sheetLines || "  ' (нет листов)"}

  ' 2. Изделия в дерево проекта + графика УГО и выводы на листах (${devices.length})
${devLines || "  ' (нет устройств)"}

  ' 3. Цепи и соединения (${wires.length})
${wireLines || "  ' (нет цепей)"}

  ' 4. Кабельные связи (${cables.length})
${cableLines || "  ' (нет кабелей)"}

  Call LogTrace("INFO", "Итог переноса в E3: листов=" & sheetsOk & "/${sheets.length}, графика УГО=" & devGfxOk & ", в базе E3=" & devDbOk & ", сегм. цепей=" & wiresOk & " (ошибок=" & wiresErr & "), кабелей=" & cabOk)

  ' Показываем первый лист сразу на экране E3.series
  ${sheets.length > 0 ? 'If shId_1 > 0 Then\n    On Error Resume Next\n    Sheet.SetId shId_1\n    Sheet.Display\n    If Err.Number <> 0 Then\n      Call LogTrace("WARN", "Sheet.Display ошибка #" & Err.Number & ": " & Err.Description)\n      Err.Clear\n    Else\n      Call LogTrace("INFO", "Открыт лист ID=" & shId_1 & " на экране E3.series (Sheet.Display).")\n    End If\n    On Error GoTo 0\n  End If' : ''}

  On Error Resume Next
  Call Prj.SaveAs(targetE3s)
  If Err.Number <> 0 Then
    Call LogTrace("WARN", "Prj.SaveAs('" & targetE3s & "') вернул #" & Err.Number & ": " & Err.Description & " (проект открыт в E3, сохраните вручную)")
    Err.Clear
  Else
    Call LogTrace("INFO", "Проект успешно сохранён: " & targetE3s)
  End If
  On Error GoTo 0
End Sub

Function CreateOrGetSheet(ByRef p, ByRef sh, ByVal shName, ByVal fmt, ByVal detectedFmt, ByVal isFirst, ByRef exIds, ByVal exCnt)
  On Error Resume Next
  Dim res, newId, candList, cand, cyrFmt, dinFmt, iC, triedStr, lastErr
  newId = 0
  triedStr = ""
  lastErr = ""

  If Left(fmt, 1) = "A" Then
    cyrFmt = "А" & Mid(fmt, 2)
    dinFmt = "DIN" & fmt
  Else
    cyrFmt = fmt
    dinFmt = "DIN" & fmt
  End If

  candList = Array(detectedFmt, fmt, dinFmt, "DIN " & fmt, cyrFmt, fmt & "_sp_1", fmt & "_1", "ГОСТ " & fmt, "ГОСТ_" & fmt, "GOST_" & fmt, fmt & "-ГОСТ", fmt & "_ГОСТ", "Форма 1", "A3", "DINA3", "А3", "A4", "DINA4", "А4", "")

  For iC = 0 To UBound(candList)
    cand = Trim(CStr(candList(iC)))
    If cand <> "" Or iC = UBound(candList) Then
      If triedStr <> "" Then triedStr = triedStr & ","
      triedStr = triedStr & "'" & cand & "'"
      Err.Clear
      res = sh.Create(0, shName, cand, 0, 0)
      If Err.Number = 450 Then
        Err.Clear
        res = sh.Create(0, shName, cand, 0)
      End If
      If Err.Number = 0 Then
        If res > 0 Then
          newId = res
        ElseIf sh.GetId() > 0 Then
          newId = sh.GetId()
        End If
      Else
        lastErr = "#" & Err.Number & " " & Err.Description
        Err.Clear
      End If
      If newId > 0 Then
        Call LogTrace("INFO", "Лист '" & shName & "' создан ID=" & newId & " (формат='" & cand & "')")
        Exit For
      End If
    End If
  Next

  If newId <= 0 And isFirst And exCnt > 0 Then
    Err.Clear
    sh.SetId exIds(1)
    sh.SetName shName
    newId = exIds(1)
    Call LogTrace("WARN", "Не удалось создать новый лист '" & shName & "' через Sheet.Create (" & lastErr & "), переименован и использован стартовый лист шаблона ID=" & newId)
  ElseIf newId <= 0 Then
    Call LogTrace("WARN", "Не удалось создать лист '" & shName & "' (проверены форматы: " & triedStr & "), err=" & lastErr)
  End If

  Err.Clear
  On Error GoTo 0
  CreateOrGetSheet = newId
End Function

Sub GetSheetBounds(ByRef sh, ByVal shId, ByVal fmt, ByRef xMin, ByRef yMin, ByRef xMax, ByRef yMax)
  On Error Resume Next
  Dim ax1, ay1, ax2, ay2
  ax1 = 0 : ay1 = 0 : ax2 = 0 : ay2 = 0
  sh.SetId shId
  Call sh.GetDrawingArea(ax1, ay1, ax2, ay2)
  If Err.Number = 0 And ax2 > ax1 And ay2 > ay1 Then
    xMin = ax1 : yMin = ay1 : xMax = ax2 : yMax = ay2
    Call LogTrace("INFO", "Границы листа ID=" & shId & ": X=[" & Round(xMin,1) & ".." & Round(xMax,1) & "], Y=[" & Round(yMin,1) & ".." & Round(yMax,1) & "]")
  Else
    Err.Clear
    If fmt = "A4" Then
      xMin = 10 : yMin = 10 : xMax = 287 : yMax = 200
    ElseIf fmt = "A2" Then
      xMin = 10 : yMin = 10 : xMax = 584 : yMax = 410
    ElseIf fmt = "A1" Then
      xMin = 10 : yMin = 10 : xMax = 831 : yMax = 584
    Else
      xMin = 10 : yMin = 10 : xMax = 410 : yMax = 287
    End If
    Call LogTrace("INFO", "Границы листа ID=" & shId & " по умолчанию (" & fmt & "): X=[" & xMin & ".." & xMax & "], Y=[" & yMin & ".." & yMax & "]")
  End If
  On Error GoTo 0
End Sub

Sub DrawGostFrame(ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal docCode, ByVal shName, ByVal designer)
  On Error Resume Next
  Dim gid, bx(5), by(5), tbLeft
  gid = g.CreateRectangle(shId, x1, y1, x2, y2)
  If gid <= 0 Or Err.Number <> 0 Then
    Err.Clear
    bx(1) = x1 : by(1) = y1 : bx(2) = x2 : by(2) = y1 : bx(3) = x2 : by(3) = y2 : bx(4) = x1 : by(4) = y2 : bx(5) = x1 : by(5) = y1
    gid = g.CreateLine(shId, 5, bx, by)
  End If
  If gid > 0 Then
    g.SetId gid
    g.SetColour 0
    g.SetLineWidth 0.5
  End If
  tbLeft = x2 - 185
  If tbLeft < x1 + 10 Then tbLeft = x1 + 10
  gid = g.CreateRectangle(shId, tbLeft, y1, x2, y1 + 35)
  gid = g.CreateText(shId, docCode & " - " & shName & " (" & designer & ")", tbLeft + 4, y1 + 14)
  Err.Clear
  On Error GoTo 0
End Sub

Sub AddGraphicId(ByRef gIds, ByRef gCnt, ByVal gid)
  If gid > 0 Then
    gCnt = gCnt + 1
    If gCnt > UBound(gIds) Then ReDim Preserve gIds(gCnt + 32)
    gIds(gCnt) = gid
  End If
End Sub

Function FinalizeIntegralDeviceGroup(ByRef g, ByVal shId, ByRef gIds, ByVal gCnt, ByVal devId)
  On Error Resume Next
  Dim exactArr(), i, grpId
  FinalizeIntegralDeviceGroup = 0
  If gCnt <= 0 Then Exit Function
  ReDim exactArr(gCnt)
  For i = 1 To gCnt
    exactArr(i) = gIds(i)
  Next
  Err.Clear
  grpId = g.CreateGroup(gCnt, exactArr)
  If Err.Number <> 0 Or grpId <= 0 Then
    Err.Clear
    grpId = g.CreateGroup(exactArr)
  End If
  If Err.Number = 0 And grpId > 0 Then
    g.SetId grpId
    If devId > 0 Then
      Call g.SetAttributeValue("E3_DEVICE_ID", CStr(devId))
    End If
    FinalizeIntegralDeviceGroup = grpId
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub DrawDeviceBox(ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal des, ByVal art, ByVal cat, ByRef gIds, ByRef gCnt)
  On Error Resume Next
  Dim gid, bx(5), by(5), cx, cy, r, fx(2), fy(2), w, h
  cx = (x1 + x2) / 2
  cy = (y1 + y2) / 2
  w = Abs(x2 - x1)
  h = Abs(y2 - y1)

  If cat = "fan" Or cat = "motor" Then
    r = w * 0.32
    If h * 0.32 < r Then r = h * 0.32
    If r < 4 Then r = 4
    gid = g.CreateCircle(shId, cx, cy, r)
    If gid > 0 Then
      g.SetId gid : g.SetColour 0 : g.SetLineWidth 0.35
      Call AddGraphicId(gIds, gCnt, gid)
    End If
    fx(1) = cx - r * 0.65 : fy(1) = cy - r * 0.7
    fx(2) = cx + r * 0.85 : fy(2) = cy - r * 0.25
    gid = g.CreateLine(shId, 2, fx, fy)
    If gid > 0 Then g.SetId gid : g.SetColour 0 : Call AddGraphicId(gIds, gCnt, gid)
    fx(1) = cx - r * 0.65 : fy(1) = cy + r * 0.7
    fx(2) = cx + r * 0.85 : fy(2) = cy + r * 0.25
    gid = g.CreateLine(shId, 2, fx, fy)
    If gid > 0 Then g.SetId gid : g.SetColour 0 : Call AddGraphicId(gIds, gCnt, gid)
  ElseIf cat = "kip_circle" Or cat = "lamp" Then
    r = w * 0.35
    If h * 0.35 < r Then r = h * 0.35
    If r < 3.5 Then r = 3.5
    gid = g.CreateCircle(shId, cx, cy, r)
    If gid > 0 Then
      g.SetId gid : g.SetColour 3 : g.SetLineWidth 0.35
      Call AddGraphicId(gIds, gCnt, gid)
    End If
    fx(1) = cx - r : fy(1) = cy : fx(2) = cx + r : fy(2) = cy
    gid = g.CreateLine(shId, 2, fx, fy)
    If gid > 0 Then g.SetId gid : g.SetColour 3 : Call AddGraphicId(gIds, gCnt, gid)
  Else
    gid = g.CreateRectangle(shId, x1, y1, x2, y2)
    If gid <= 0 Or Err.Number <> 0 Then
      Err.Clear
      bx(1) = x1 : by(1) = y1 : bx(2) = x2 : by(2) = y1 : bx(3) = x2 : by(3) = y2 : bx(4) = x1 : by(4) = y2 : bx(5) = x1 : by(5) = y1
      gid = g.CreateLine(shId, 5, bx, by)
    End If
    If gid > 0 Then
      g.SetId gid
      g.SetColour 0
      g.SetLineWidth 0.35
      Call AddGraphicId(gIds, gCnt, gid)
    End If
    If cat = "damper" Or cat = "filter" Then
      fx(1) = x1 : fy(1) = y1 : fx(2) = x2 : fy(2) = y2
      gid = g.CreateLine(shId, 2, fx, fy)
      If gid > 0 Then g.SetId gid : g.SetColour 3 : Call AddGraphicId(gIds, gCnt, gid)
    ElseIf cat = "heater" Or cat = "cooler" Then
      fx(1) = x1 : fy(1) = y1 : fx(2) = x2 : fy(2) = y2
      gid = g.CreateLine(shId, 2, fx, fy)
      If gid > 0 Then g.SetId gid : g.SetColour 1 : Call AddGraphicId(gIds, gCnt, gid)
      fx(1) = x1 : fy(1) = y2 : fx(2) = x2 : fy(2) = y1
      gid = g.CreateLine(shId, 2, fx, fy)
      If gid > 0 Then g.SetId gid : g.SetColour 1 : Call AddGraphicId(gIds, gCnt, gid)
    End If
  End If

  gid = g.CreateText(shId, des, x1, y2 + 2)
  If gid > 0 Then
    g.SetId gid
    g.SetTextHeight 3.5
    Call AddGraphicId(gIds, gCnt, gid)
  End If
  If art <> "" Then
    gid = g.CreateText(shId, art, x1, y1 - 4)
    If gid > 0 Then
      g.SetId gid
      g.SetTextHeight 2.5
      Call AddGraphicId(gIds, gCnt, gid)
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawCustomLine(ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal colIdx, ByVal lwMm, ByVal lStyle, ByRef gIds, ByRef gCnt)
  On Error Resume Next
  Dim gid, xs(2), ys(2)
  xs(1) = x1 : xs(2) = x2
  ys(1) = y1 : ys(2) = y2
  gid = g.CreateLine(shId, 2, xs, ys)
  If gid > 0 Then
    g.SetId gid
    g.SetColour colIdx
    g.SetLineWidth lwMm
    If lStyle > 1 Then Call g.SetLineStyle(lStyle)
    Call AddGraphicId(gIds, gCnt, gid)
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawCustomRect(ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal colIdx, ByVal lwMm, ByVal lStyle, ByRef gIds, ByRef gCnt)
  On Error Resume Next
  Dim gid, bx(5), by(5)
  gid = g.CreateRectangle(shId, x1, y1, x2, y2)
  If gid <= 0 Or Err.Number <> 0 Then
    Err.Clear
    bx(1) = x1 : by(1) = y1 : bx(2) = x2 : by(2) = y1 : bx(3) = x2 : by(3) = y2 : bx(4) = x1 : by(4) = y2 : bx(5) = x1 : by(5) = y1
    gid = g.CreateLine(shId, 5, bx, by)
  End If
  If gid > 0 Then
    g.SetId gid
    g.SetColour colIdx
    g.SetLineWidth lwMm
    If lStyle > 1 Then Call g.SetLineStyle(lStyle)
    Call AddGraphicId(gIds, gCnt, gid)
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawCustomCircle(ByRef g, ByVal shId, ByVal cx, ByVal cy, ByVal r, ByVal colIdx, ByVal lwMm, ByVal lStyle, ByRef gIds, ByRef gCnt)
  On Error Resume Next
  Dim gid
  If r < 0.8 Then r = 0.8
  gid = g.CreateCircle(shId, cx, cy, r)
  If gid > 0 Then
    g.SetId gid
    g.SetColour colIdx
    g.SetLineWidth lwMm
    If lStyle > 1 Then Call g.SetLineStyle(lStyle)
    Call AddGraphicId(gIds, gCnt, gid)
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawCustomText(ByRef g, ByVal shId, ByVal x, ByVal y, ByVal txt, ByVal hMm, ByVal colIdx, ByRef gIds, ByRef gCnt)
  On Error Resume Next
  Dim gid
  If Trim(txt) = "" Then Exit Sub
  If hMm < 1.8 Then hMm = 1.8
  gid = g.CreateText(shId, txt, x, y)
  If gid > 0 Then
    g.SetId gid
    g.SetColour colIdx
    g.SetTextHeight hMm
    Call AddGraphicId(gIds, gCnt, gid)
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawPinTickGrouped(ByRef g, ByVal shId, ByVal px, ByVal py, ByVal dir, ByVal pName, ByRef gIds, ByRef gCnt)
  On Error Resume Next
  Dim gid, lx(2), ly(2), dx, dy
  dx = 0 : dy = 0
  If dir = "top" Then dy = -3
  If dir = "bottom" Then dy = 3
  If dir = "left" Then dx = -3
  If dir = "right" Then dx = 3
  lx(1) = px : ly(1) = py
  lx(2) = px + dx : ly(2) = py + dy
  gid = g.CreateLine(shId, 2, lx, ly)
  If gid > 0 Then
    g.SetId gid
    g.SetColour 1
    g.SetLineWidth 0.25
    Call AddGraphicId(gIds, gCnt, gid)
  End If
  If pName <> "" Then
    gid = g.CreateText(shId, pName, px + 1, py + 1)
    If gid > 0 Then
      g.SetId gid
      g.SetTextHeight 2.0
      Call AddGraphicId(gIds, gCnt, gid)
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawPinTick(ByRef g, ByVal shId, ByVal px, ByVal py, ByVal dir, ByVal pName)
  Dim tmp(4), cnt
  cnt = 0
  Call DrawPinTickGrouped(g, shId, px, py, dir, pName, tmp, cnt)
End Sub

Function DrawWireSeg(ByRef p, ByRef cn, ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal colIdx)
  On Error Resume Next
  Dim xs(2), ys(2), cid, gid
  DrawWireSeg = False
  xs(1) = x1 : xs(2) = x2
  ys(1) = y1 : ys(2) = y2
  cid = cn.Create(shId, 2, xs, ys)
  If cid > 0 Then
    DrawWireSeg = True
  Else
    Err.Clear
    gid = g.CreateLine(shId, 2, xs, ys)
    If gid > 0 Then
      g.SetId gid
      g.SetColour colIdx
      g.SetLineWidth 0.35
      DrawWireSeg = True
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub DrawWireLabel(ByRef g, ByVal shId, ByVal x, ByVal y, ByVal lbl, ByVal colIdx)
  On Error Resume Next
  Dim gid
  gid = g.CreateText(shId, lbl, x + 2, y + 2)
  If gid > 0 Then
    g.SetId gid
    g.SetColour colIdx
    g.SetTextHeight 2.5
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Function CreateFluxDevice(ByRef p, ByRef d, ByRef sm, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal des, ByVal compName, ByVal article, ByVal blockName, ByVal mfr)
  On Error Resume Next
  Dim devId, allIds, allCnt, i, dynComp, symId
  devId = 0
  CreateFluxDevice = 0

  ' 0. Проверяем, существует ли уже такое изделие в открытом проекте E3
  Err.Clear
  allCnt = p.GetAllDeviceIds(allIds)
  If Err.Number = 0 And allCnt > 0 Then
    For i = 1 To allCnt
      d.SetId allIds(i)
      If UCase(Trim(d.GetName())) = UCase(Trim(des)) Then
        devId = allIds(i)
        Exit For
      End If
    Next
  End If

  ' 1. Создаём по артикулу / имени блока / имени компонента из БД E3
  If devId <= 0 And article <> "" Then
    Err.Clear
    devId = d.Create(des, "", "", article, "", 0)
  End If
  If devId <= 0 And blockName <> "" Then
    Err.Clear
    devId = d.Create(des, "", "", blockName, "", 0)
  End If
  If devId <= 0 And compName <> "" Then
    Err.Clear
    devId = d.Create(des, "", "", compName, "", 0)
  End If

  ' 2. Динамическое создание цельного изделия E3 (без обязательной записи в SQL БД компонентов)
  If devId <= 0 Then
    dynComp = article
    If dynComp = "" Then dynComp = blockName
    If dynComp = "" Then dynComp = compName
    Err.Clear
    devId = d.CreateDynamic(des, "", "", dynComp, "", 0)
  End If
  If devId <= 0 Then
    Err.Clear
    devId = d.Create(des, "", "", "", "", 0)
  End If

  ' 3. Fallback через динамический блок на листе (Sym.PlaceBlock), создающий полноценное Device-изделие
  If devId <= 0 And shId > 0 Then
    Err.Clear
    symId = sm.PlaceBlock(shId, x1, y1, x2, y2)
    If Err.Number = 0 And symId > 0 Then
      d.SetId symId
      If d.GetId() > 0 Then
        devId = d.GetId()
        Call d.SetName(des)
      End If
    End If
  End If

  If devId > 0 Then
    d.SetId devId
    If compName <> "" Then
      If d.GetComponentName() = "" Then Call d.SetComponentName(compName)
    End If
    Call LogTrace("INFO", "Цельное изделие " & des & " создано в E3 ID=" & devId & " (" & article & ")")
    CreateFluxDevice = devId
  Else
    Call LogTrace("WARN", "Изделие " & des & " (" & article & ") размещено только сгруппированной графикой УГО на листе")
    CreateFluxDevice = 0
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub SafeCreateDevicePin(ByRef p, ByRef pinO, ByVal devId, ByVal shId, ByVal pName, ByVal px, ByVal py)
  On Error Resume Next
  Dim pid
  If devId <= 0 Or pName = "" Then Exit Sub
  Err.Clear
  pid = pinO.Create(devId, pName, 0, 0, 0)
  If Err.Number <> 0 Or pid <= 0 Then
    Err.Clear
    pid = pinO.Create(devId, pName)
  End If
  If pid > 0 And shId > 0 Then
    pinO.SetId pid
    Call pinO.SetSchemaLocation(shId, px, py)
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub SafeSetDevAttr(ByRef d, ByVal attrName, ByVal attrVal)
  On Error Resume Next
  Call d.SetAttributeValue(attrName, attrVal)
  Err.Clear
  On Error GoTo 0
End Sub

Sub SafeSetGraphAttr(ByRef g, ByVal attrName, ByVal attrVal)
  On Error Resume Next
  Call g.SetAttributeValue(attrName, attrVal)
  Err.Clear
  On Error GoTo 0
End Sub

Function CreateFluxCable(ByRef p, ByRef d, ByVal des, ByVal cabType, ByVal fDev, ByVal tDev, ByVal lenM)
  On Error Resume Next
  Dim cid
  cid = 0
  If cabType <> "" Then
    Err.Clear
    cid = d.Create(des, "", "", cabType, "", 0)
  End If
  If cid <= 0 Then
    Err.Clear
    cid = d.CreateDynamic(des, "", "", cabType, "", 0)
  End If
  If cid <= 0 Then
    Err.Clear
    cid = d.Create(des, "", "", "", "", 0)
  End If
  If cid > 0 Then
    d.SetId cid
    Call d.SetAttributeValue("Наименование", cabType)
    Call d.SetAttributeValue("Марка кабеля", cabType)
    Call d.SetAttributeValue("Длина", CStr(lenM))
    Call d.SetAttributeValue("Откуда", fDev)
    Call d.SetAttributeValue("Куда", tDev)
    Call LogTrace("INFO", "Кабель " & des & " создан ID=" & cid)
    CreateFluxCable = True
  Else
    Call LogTrace("INFO", "Кабель " & des & " (" & cabType & ") пропущен в БД E3 (d.Create=0)")
    CreateFluxCable = False
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub ExportActiveE3sToFluxJson()
  Dim devIds, cnt, i, jsonPath, sb, dName, comp, art, mfg, elId, fluxPrj
  Dim strm, sIds, scnt, si, symIds, symCnt, sk, Sym, NetSeg, Att
  Dim nsIds, nscnt, ni, ptsCnt, pk, xArr, yArr, sx, sy, sgrid, scol, srow
  Dim ax1, ay1, ax2, ay2, fw, fh, fx, fy, openRes
  Dim devSheetDict, devXDict, devYDict, sheetFluxIdDict, sheetBoundsDict
  Dim shIdCur, shNm, shFm, firstSheet, firstNode, firstWire, firstCab
  Dim dIdCur, isCab, dKey, mappedShId, wx1, wy1, wpStr, wireIdx, segNm
  Dim pIds, pCnt, pi, pNm, customSymStr, catVal, blkVal, aIds, aCnt, ai, attNm, attVal, cabLen, cabTypeStr, devNote

  If gImportFilePath <> "" Then
    On Error Resume Next
    If Prj.GetId() > 0 Then
      Prj.Close
      Err.Clear
    End If
    Call LogTrace("INFO", "Открытие файла в E3.series: " & gImportFilePath)
    openRes = Prj.Open(gImportFilePath)
    If Err.Number <> 0 Or Prj.GetId() <= 0 Then
      Call LogTrace("WARN", "Prj.Open вернул openRes=" & openRes & ", err=#" & Err.Number & " " & Err.Description & " (проверка App.OpenProject...)")
      Err.Clear
      openRes = App.OpenProject(gImportFilePath)
    End If
    If Err.Number <> 0 Or Prj.GetId() <= 0 Then
      Call LogTrace("ERROR", "Не удалось открыть .e3s через COM E3.series: #" & Err.Number & " " & Err.Description)
      Err.Clear
      On Error GoTo 0
      Exit Sub
    End If
    On Error GoTo 0
    Call LogTrace("INFO", "Файл открыт в E3.series: ID=" & Prj.GetId() & " Name='" & Prj.GetName() & "'")
  End If

  If Prj.GetId() = 0 Then
    Call LogTrace("WARN", "Попытка выгрузки без открытого проекта .e3s в E3.series.")
    If Not WScript.Arguments.Named.Exists("silent") Then
      MsgBox "Сначала откройте проект .e3s в E3.series!", vbExclamation, "E3ProMax"
    End If
    Exit Sub
  End If

  fluxPrj = ""
  On Error Resume Next
  fluxPrj = Prj.GetAttributeValue("FLUX_PROJECT")
  Err.Clear
  On Error GoTo 0
  If fluxPrj = "" Then
    If gImportFilePath <> "" Then
      fluxPrj = "FLUX_E3_" & Prj.GetId()
    Else
      fluxPrj = "${vbsEsc(fluxKey)}"
    End If
  End If

  Set devSheetDict = CreateObject("Scripting.Dictionary")
  Set devXDict = CreateObject("Scripting.Dictionary")
  Set devYDict = CreateObject("Scripting.Dictionary")
  Set sheetFluxIdDict = CreateObject("Scripting.Dictionary")
  Set sheetBoundsDict = CreateObject("Scripting.Dictionary")
  Set Sym = Prj.CreateSymbolObject()
  Set NetSeg = Prj.CreateNetSegmentObject()
  Set Att = Prj.CreateAttributeObject()

  sb = "{" & vbCrLf
  sb = sb & "  ""format"": ""flux-e3-bridge/v1""," & vbCrLf
  sb = sb & "  ""replaceAll"": true," & vbCrLf
  sb = sb & "  ""fluxProjectKey"": """ & JsonEsc(fluxPrj) & """," & vbCrLf
  sb = sb & "  ""projectName"": """ & JsonEsc(Prj.GetName()) & """," & vbCrLf
  sb = sb & "  ""exportedAt"": """ & Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & "T12:00:00.000Z""," & vbCrLf
  sb = sb & "  ""revision"": 1," & vbCrLf

  ' 1. Листы схемы
  sb = sb & "  ""sheets"": [" & vbCrLf
  firstSheet = True
  On Error Resume Next
  scnt = Prj.GetSheetIds(sIds)
  If Err.Number <> 0 Then scnt = 0 : Err.Clear
  On Error GoTo 0
  Call LogTrace("INFO", "Чтение листов E3.series: scnt=" & scnt)

  For si = 1 To scnt
    shIdCur = sIds(si)
    Sheet.SetId shIdCur
    shNm = Sheet.GetName()
    shFm = Sheet.GetFormat()
    If InStr(1, shFm, "4", 1) > 0 Then
      shFm = "A4" : fw = 980 : fh = 920
    Else
      shFm = "A3" : fw = 1400 : fh = 920
    End If
    ax1 = 0 : ay1 = 0 : ax2 = 0 : ay2 = 0
    On Error Resume Next
    Call Sheet.GetDrawingArea(ax1, ay1, ax2, ay2)
    If Err.Number <> 0 Or ax2 <= ax1 Or ay2 <= ay1 Then
      Err.Clear
      ax1 = 0 : ay1 = 0 : ax2 = 420 : ay2 = 297
    End If
    On Error GoTo 0

    dKey = "sheet-" & CStr(si)
    sheetFluxIdDict(CStr(shIdCur)) = dKey
    sheetBoundsDict(CStr(shIdCur)) = Array(ax1, ay1, ax2, ay2, fw, fh)

    If Not firstSheet Then sb = sb & "," & vbCrLf
    firstSheet = False
    sb = sb & "    {" & vbCrLf
    sb = sb & "      ""id"": """ & JsonEsc(dKey) & """," & vbCrLf
    sb = sb & "      ""number"": " & si & "," & vbCrLf
    sb = sb & "      ""name"": """ & JsonEsc(shNm) & """," & vbCrLf
    sb = sb & "      ""format"": """ & shFm & """," & vbCrLf
    sb = sb & "      ""width"": " & fw & "," & vbCrLf
    sb = sb & "      ""height"": " & fh & "," & vbCrLf
    sb = sb & "      ""titleBlock"": { ""documentCode"": """ & JsonEsc(Prj.GetName()) & """, ""organization"": """", ""designer"": """", ""checker"": """", ""sheetTitle"": """ & JsonEsc(shNm) & """ }" & vbCrLf
    sb = sb & "    }"

    ' Индексируем координаты символов устройств на этом листе
    On Error Resume Next
    symCnt = Sheet.GetSymbolIds(symIds)
    If Err.Number = 0 And symCnt > 0 Then
      For sk = 1 To symCnt
        Sym.SetId symIds(sk)
        sx = 0 : sy = 0 : sgrid = "" : scol = "" : srow = ""
        Call Sym.GetSchemaLocation(sx, sy, sgrid, scol, srow)
        Dev.SetId symIds(sk)
        dIdCur = Dev.GetId()
        If dIdCur > 0 And Not devSheetDict.Exists(CStr(dIdCur)) Then
          fx = Round(40 + ((sx - ax1) / (ax2 - ax1)) * (fw - 160))
          fy = Round(40 + (1 - (sy - ay1) / (ay2 - ay1)) * (fh - 180))
          If fx < 40 Then fx = 40
          If fy < 40 Then fy = 40
          devSheetDict(CStr(dIdCur)) = dKey
          devXDict(CStr(dIdCur)) = fx
          devYDict(CStr(dIdCur)) = fy
        End If
      Next
    End If
    Err.Clear
    On Error GoTo 0
  Next
  sb = sb & vbCrLf & "  ]," & vbCrLf

  ' 2. Устройства и кабели
  cnt = Prj.GetAllDeviceIds(devIds)
  Call LogTrace("INFO", "Чтение устройств из E3.series: cnt=" & cnt)
  sb = sb & "  ""nodes"": [" & vbCrLf
  firstNode = True
  For i = 1 To cnt
    Dev.SetId devIds(i)
    dName = Dev.GetName()
    isCab = 0
    On Error Resume Next
    isCab = Dev.IsCable()
    Err.Clear
    On Error GoTo 0
    If dName <> "" And isCab = 0 Then
      comp = "" : art = "" : mfg = "" : elId = "" : customSymStr = "" : catVal = "" : blkVal = ""
      On Error Resume Next
      comp = Dev.GetComponentName()
      art = Dev.GetAttributeValue("Артикул")
      If art = "" Then art = Dev.GetAttributeValue("Article")
      If art = "" Then art = Dev.GetAttributeValue("PartNumber")
      If art = "" Then art = comp
      mfg = Dev.GetAttributeValue("Производитель")
      If mfg = "" Then mfg = Dev.GetAttributeValue("Manufacturer")
      If mfg = "" Then mfg = Dev.GetAttributeValue("Supplier")
      elId = Dev.GetAttributeValue("FLUX_ELEMENT_ID")
      customSymStr = Dev.GetAttributeValue("FLUX_CUSTOM_SYMBOL")
      catVal = Dev.GetAttributeValue("Категория")
      blkVal = Dev.GetAttributeValue("FLUX_BLOCK")
      Err.Clear
      On Error GoTo 0
      If elId = "" Then elId = "e3-" & CStr(devIds(i))
      If blkVal = "" Then blkVal = comp
      If devSheetDict.Exists(CStr(devIds(i))) Then
        mappedShId = devSheetDict(CStr(devIds(i)))
        fx = devXDict(CStr(devIds(i)))
        fy = devYDict(CStr(devIds(i)))
      Else
        mappedShId = "sheet-1"
        fx = 120 + ((i - 1) Mod 5) * 220
        fy = 120 + Int((i - 1) / 5) * 180
      End If

      If Not firstNode Then sb = sb & "," & vbCrLf
      firstNode = False
      sb = sb & "    {" & vbCrLf
      sb = sb & "      ""elementId"": """ & JsonEsc(elId) & """," & vbCrLf
      sb = sb & "      ""version"": ""e3-" & CStr(devIds(i)) & """," & vbCrLf
      sb = sb & "      ""tag"": """ & JsonEsc(dName) & """," & vbCrLf
      sb = sb & "      ""designation"": """ & JsonEsc(dName) & """," & vbCrLf
      sb = sb & "      ""status"": ""one""," & vbCrLf
      sb = sb & "      ""solutionId"": ""e3-native""," & vbCrLf
      sb = sb & "      ""solutionName"": """ & JsonEsc(blkVal) & """," & vbCrLf
      If catVal <> "" Then
        sb = sb & "      ""category"": """ & JsonEsc(catVal) & """," & vbCrLf
      End If
      If Trim(customSymStr) <> "" And Left(Trim(customSymStr), 1) = "{" Then
        sb = sb & "      ""customSymbol"": " & customSymStr & "," & vbCrLf
      End If
      sb = sb & "      ""rect"": { ""sheet"": """ & JsonEsc(mappedShId) & """, ""x"": " & fx & ", ""y"": " & fy & ", ""rotation"": 0, ""width"": 100, ""height"": 100 }," & vbCrLf
      sb = sb & "      ""attrs"": [" & vbCrLf
      sb = sb & "        { ""name"": ""Артикул"", ""value"": """ & JsonEsc(art) & """, ""owner"": """", ""conflict"": ""flux"" }," & vbCrLf
      sb = sb & "        { ""name"": ""Производитель"", ""value"": """ & JsonEsc(mfg) & """, ""owner"": """", ""conflict"": ""flux"" }," & vbCrLf
      sb = sb & "        { ""name"": ""Наименование"", ""value"": """ & JsonEsc(comp) & """, ""owner"": """", ""conflict"": ""flux"" }"

      On Error Resume Next
      aCnt = Dev.GetAttributeIds(aIds)
      If Err.Number = 0 And aCnt > 0 Then
        For ai = 1 To aCnt
          Att.SetId aIds(ai)
          attNm = Att.GetName()
          attVal = Att.GetValue()
          If attNm <> "" And attNm <> "Артикул" And attNm <> "Производитель" And attNm <> "Наименование" And attNm <> "FLUX_ELEMENT_ID" And attNm <> "FLUX_CUSTOM_SYMBOL" And attNm <> "FLUX_BLOCK" And attNm <> "Категория" Then
            sb = sb & "," & vbCrLf & "        { ""name"": """ & JsonEsc(attNm) & """, ""value"": """ & JsonEsc(attVal) & """, ""owner"": ""E3"", ""conflict"": ""script"" }"
          End If
        Next
      End If
      Err.Clear
      On Error GoTo 0

      sb = sb & vbCrLf & "      ]," & vbCrLf
      sb = sb & "      ""checked"": true" & vbCrLf
      sb = sb & "    }"
    End If
  Next
  sb = sb & vbCrLf & "  ]," & vbCrLf

  ' 3. Кабели
  sb = sb & "  ""cables"": [" & vbCrLf
  firstCab = True
  For i = 1 To cnt
    Dev.SetId devIds(i)
    dName = Dev.GetName()
    isCab = 0
    On Error Resume Next
    isCab = Dev.IsCable()
    Err.Clear
    On Error GoTo 0
    If dName <> "" And isCab <> 0 Then
      cabTypeStr = "" : cabLen = 10
      On Error Resume Next
      cabTypeStr = Dev.GetComponentName()
      If IsNumeric(Dev.GetAttributeValue("Длина")) Then cabLen = CDbl(Dev.GetAttributeValue("Длина"))
      Err.Clear
      On Error GoTo 0
      If Not firstCab Then sb = sb & "," & vbCrLf
      firstCab = False
      sb = sb & "    { ""id"": ""cab-" & CStr(devIds(i)) & """, ""designation"": """ & JsonEsc(dName) & """, ""cableType"": """ & JsonEsc(cabTypeStr) & """, ""coresCount"": 4, ""crossSection"": ""1.5 мм²"", ""lengthMeters"": " & cabLen & ", ""fromDevice"": """", ""toDevice"": """", ""shielded"": false }"
    End If
  Next
  sb = sb & vbCrLf & "  ]," & vbCrLf

  ' 4. Цепи (сегменты соединений с листов)
  sb = sb & "  ""wires"": [" & vbCrLf
  firstWire = True
  wireIdx = 0
  For si = 1 To scnt
    shIdCur = sIds(si)
    Sheet.SetId shIdCur
    dKey = sheetFluxIdDict(CStr(shIdCur))
    ax1 = sheetBoundsDict(CStr(shIdCur))(0)
    ay1 = sheetBoundsDict(CStr(shIdCur))(1)
    ax2 = sheetBoundsDict(CStr(shIdCur))(2)
    ay2 = sheetBoundsDict(CStr(shIdCur))(3)
    fw = sheetBoundsDict(CStr(shIdCur))(4)
    fh = sheetBoundsDict(CStr(shIdCur))(5)

    On Error Resume Next
    nscnt = Sheet.GetNetSegmentIds(nsIds)
    If Err.Number = 0 And nscnt > 0 Then
      For ni = 1 To nscnt
        NetSeg.SetId nsIds(ni)
        segNm = "" : segNm = NetSeg.GetName()
        If segNm = "" Then segNm = "NET_" & CStr(nsIds(ni))
        ptsCnt = NetSeg.GetLineSegments(shIdCur, xArr, yArr)
        If Err.Number = 0 And ptsCnt >= 2 Then
          wireIdx = wireIdx + 1
          wpStr = "["
          For pk = 1 To ptsCnt
            wx1 = Round(40 + ((xArr(pk) - ax1) / (ax2 - ax1)) * (fw - 160))
            wy1 = Round(40 + (1 - (yArr(pk) - ay1) / (ay2 - ay1)) * (fh - 180))
            If pk > 1 Then wpStr = wpStr & ", "
            wpStr = wpStr & "{ ""x"": " & wx1 & ", ""y"": " & wy1 & " }"
          Next
          wpStr = wpStr & "]"
          If Not firstWire Then sb = sb & "," & vbCrLf
          firstWire = False
          sb = sb & "    { ""id"": ""e3w-" & wireIdx & """, ""sheetId"": """ & JsonEsc(dKey) & """, ""netName"": """ & JsonEsc(segNm) & """, ""signalType"": ""signal"", ""fromDeviceId"": """", ""fromPinId"": """", ""toDeviceId"": """", ""toPinId"": """", ""waypoints"": " & wpStr & ", ""crossSection"": ""1.5 мм²"", ""wireNumber"": """ & JsonEsc(segNm) & """ }"
        End If
      Next
    End If
    Err.Clear
    On Error GoTo 0
  Next
  sb = sb & vbCrLf & "  ]" & vbCrLf & "}" & vbCrLf

  jsonPath = outFolder & "\\flux_e3_export.json"
  Set strm = CreateObject("ADODB.Stream")
  strm.Type = 2
  strm.Charset = "utf-8"
  strm.Open
  strm.WriteText sb
  strm.SaveToFile jsonPath, 2
  strm.Close

  Call LogTrace("INFO", "Экспортировано: листов=" & scnt & ", устройств=" & cnt & ", цепей=" & wireIdx & " -> " & jsonPath)
  If Not WScript.Arguments.Named.Exists("silent") Then
    MsgBox "Проект E3.series выгружен для E3ProMax:" & vbCrLf & jsonPath & vbCrLf & vbCrLf & "Откройте этот .json файл в окне 'Обмен E3'.", vbInformation, "E3ProMax"
  End If
End Sub

Function JsonEsc(ByVal s)
  s = CStr(s)
  s = Replace(s, "\\", "\\\\")
  s = Replace(s, """", "\\""")
  s = Replace(s, vbCrLf, " ")
  s = Replace(s, vbCr, " ")
  s = Replace(s, vbLf, " ")
  JsonEsc = s
End Function
`;
}

/** Encodes VBScript source as UTF-16LE with BOM (0xFF 0xFE) so Russian Windows WSH executes Cyrillic cleanly. */
export function encodeUtf16LeWithBom(text: string): Uint8Array {
  const normalized = text.replace(/\r?\n/g, '\r\n');
  const out = new Uint8Array(2 + normalized.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    out[2 + i * 2] = code & 0xff;
    out[2 + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return out;
}

/** Generates a 1-file Windows background bridge (.cmd + PowerShell) with verbose connector.log diagnostics. */
export function generateWindowsBridgeCmd(serverOrigin: string): string {
  const cleanOrigin = serverOrigin.replace(/\/+$/, '');
  return `@echo off\r\nchcp 65001 >nul\r\ntitle E3ProMax <-> E3.series 2022 Bridge Agent\r\necho [E3ProMax] Connecting to ${cleanOrigin} ...\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command ^"\r\n[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^\r\n[Console]::OutputEncoding = [Text.Encoding]::Unicode; ^\r\n$base = '${cleanOrigin}'; $pc = $env:COMPUTERNAME; ^\r\n$work = Join-Path $env:TEMP 'flux_e3_bridge'; New-Item -ItemType Directory -Force -Path $work | Out-Null; ^\r\n$logFile = Join-Path $work 'connector.log'; ^\r\nfunction Write-BridgeLog($lvl, $msg) { $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [' + $lvl + '] ' + $msg; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8; } ^\r\nWrite-BridgeLog 'INFO' ('Bridge active on ' + $pc + ' | Target=' + $base + ' | Log=' + $logFile); ^\r\nwhile ($true) { ^\r\n  try { ^\r\n    $resp = Invoke-RestMethod -Uri ($base + '/api/v1/e3-bridge/poll?host=' + [uri]::EscapeDataString($pc)) -TimeoutSec 10; ^\r\n    if ($resp.job) { ^\r\n      Write-BridgeLog 'INFO' ('Executing job ' + $resp.job.jobId + ' mode=' + $resp.job.mode + ' scriptLen=' + $resp.job.script.Length); ^\r\n      $vbs = Join-Path $work 'flux_job.vbs'; ^\r\n      $dbgFile = Join-Path $work 'flux_e3_com_debug.log'; if (Test-Path $dbgFile) { Remove-Item $dbgFile -Force; } ^\r\n      [IO.File]::WriteAllText($vbs, $resp.job.script, [Text.Encoding]::Unicode); ^\r\n      $out = & cscript.exe //Nologo //U $vbs /silent 2>&1 | Out-String; ^\r\n      $ec = $LASTEXITCODE; ^\r\n      $lvl = if ($ec -eq 0) { 'INFO' } else { 'ERROR' }; ^\r\n      $dbgTxt = if (Test-Path $dbgFile) { Get-Content $dbgFile -Raw -Encoding UTF8 } else { '' }; ^\r\n      $combined = if ($dbgTxt) { $dbgTxt } else { $out }; ^\r\n      Write-BridgeLog $lvl ('cscript exit=' + $ec + ' output=' + ($combined -replace '[\r\n]+', ' | ')); ^\r\n      $expFile = Join-Path $work 'flux_e3_export.json'; ^\r\n      $expJson = $null; if (($resp.job.mode -eq 'export') -and (Test-Path $expFile)) { $expJson = Get-Content $expFile -Raw -Encoding UTF8; Remove-Item $expFile -Force; } ^\r\n      $ack = @{ jobId = $resp.job.jobId; host = $pc; ok = ($ec -eq 0); message = ('exit=' + $ec + [Environment]::NewLine + $combined); exportedJson = $expJson } | ConvertTo-Json -Depth 4; ^\r\n      $bytes = [Text.Encoding]::UTF8.GetBytes($ack); ^\r\n      Invoke-RestMethod -Method Post -Uri ($base + '/api/v1/e3-bridge/ack') -ContentType 'application/json; charset=utf-8' -Body $bytes | Out-Null; ^\r\n      Write-BridgeLog 'INFO' ('Ack sent for job ' + $resp.job.jobId); ^\r\n    } ^\r\n  } catch { Write-BridgeLog 'ERROR' ('Poll/exec exception: ' + $_.Exception.Message); Start-Sleep -Seconds 2; } ^\r\n  Start-Sleep -Milliseconds 1500; ^\r\n}\r\n"\r\n`;
}

// ============================================================================
// Large-Dataset Benchmark Generator (for async worker stress testing)
// ============================================================================

export function generateStressBatch(project: E3Project, count: number): E3Project {
  const next = structuredClone(project);
  const sheetId = next.sheets[0]?.id || 'sheet-1';
  const existingCount = next.devices.length;
  const cols = 12;

  for (let i = 0; i < count; i++) {
    const idx = existingCount + i + 1;
    const cat = E3_CATALOG[i % E3_CATALOG.length];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const id = `dev-stress-${Date.now()}-${i}`;
    const dev: E3Device = {
      id,
      elementId: `el-stress-${idx}`,
      designation: `-${cat.defaultPrefix}${100 + idx}`,
      componentName: cat.componentName,
      article: cat.article,
      manufacturer: cat.manufacturer,
      category: cat.category,
      sheetId,
      x: 120 + col * 220,
      y: 740 + row * 190,
      rotation: 0,
      width: cat.width,
      height: cat.height,
      e3BlockName: cat.e3BlockName,
      bindingState: 'PLACED',
      pins: cat.pins.map((p, pIdx) => ({ ...p, id: `${id}-p${pIdx + 1}` })),
      attributes: structuredClone(cat.defaultAttributes),
    };
    next.devices.push(dev);

    if (i > 0 && dev.pins.length > 0) {
      const prevDev = next.devices[next.devices.length - 2];
      if (prevDev.pins.length > 0) {
        const pFrom = prevDev.pins[prevDev.pins.length - 1];
        const pTo = dev.pins[0];
        const abs1 = getAbsolutePinPos(prevDev, pFrom);
        const abs2 = getAbsolutePinPos(dev, pTo);
        next.wires.push({
          id: `w-stress-${Date.now()}-${i}`,
          sheetId,
          netName: `NET_${idx}`,
          signalType: pTo.signalType,
          fromDeviceId: prevDev.id,
          fromPinId: pFrom.id,
          toDeviceId: dev.id,
          toPinId: pTo.id,
          waypoints: autoRouteOrthogonal(abs1, abs2),
          crossSection: '1.5 мм²',
          wireNumber: `S${idx}`,
        });
      }
    }
  }

  next.revision += 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Computes the lowest unused designation `-PREFIX<N>` without colliding with existing devices. */
export function nextUniqueDesignation(
  devices: ReadonlyArray<Pick<E3Device, 'designation'>>,
  prefix: string
): string {
  const cleanPrefix = (prefix || 'K').replace(/^-+/, '').trim() || 'K';
  const escaped = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`^-?${escaped}(\\d+)$`, 'i');
  const used = new Set<number>();
  for (const d of devices) {
    const m = rx.exec(d.designation.trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) used.add(n);
    }
  }
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return `-${cleanPrefix}${candidate}`;
}

