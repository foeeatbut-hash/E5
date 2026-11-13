import { getAbsolutePinPos } from './e3Engine.ts';
import type {
  E3Device,
  E3Project,
  E3Wire,
  PinDirection,
} from './e3Types.ts';

export interface WirePoint {
  x: number;
  y: number;
}

export interface WireSegmentHandle {
  segmentIndex: number;
  orientation: 'h' | 'v';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  midX: number;
  midY: number;
  length: number;
  isEndpointSegment: boolean;
}

export interface WireBreakCandidate {
  wire: E3Wire;
  segmentIndex: number;
  orientation: 'h' | 'v';
  projX: number;
  projY: number;
  distance: number;
}

export interface AutoWireBreakResult {
  nextProject: E3Project;
  updatedDevice: E3Device;
  wireBefore: E3Wire;
  wireAfter: E3Wire;
  originalWireId: string;
}

function snapCoord(val: number, gridSize: number, snapToGrid: boolean): number {
  const g = Math.max(5, gridSize || 20);
  return snapToGrid ? Math.round(val / g) * g : Math.round(val);
}

/**
 * Removes zero-length duplicates and redundant intermediate collinear waypoints
 * while always preserving the start and end pin coordinates.
 */
export function simplifyOrthogonalWaypoints(waypoints: WirePoint[]): WirePoint[] {
  if (waypoints.length <= 2) return waypoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));

  const deduped: WirePoint[] = [];
  for (const pt of waypoints) {
    const rounded = { x: Math.round(pt.x), y: Math.round(pt.y) };
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(prev.x - rounded.x) > 0.5 || Math.abs(prev.y - rounded.y) > 0.5) {
      deduped.push(rounded);
    }
  }
  if (deduped.length <= 2) return deduped;

  const out: WirePoint[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const a = out[out.length - 1];
    const b = deduped[i];
    const c = deduped[i + 1];
    const sameX = Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;
    const sameY = Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;
    if (!sameX && !sameY) {
      out.push(b);
    }
  }
  out.push(deduped[deduped.length - 1]);
  return out;
}

/**
 * Extracts draggable horizontal and vertical segment midpoint handles for a wire.
 */
export function extractWireSegmentHandles(
  waypoints: WirePoint[],
  minSegmentLength = 8
): WireSegmentHandle[] {
  const handles: WireSegmentHandle[] = [];
  if (waypoints.length < 2) return handles;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const length = Math.hypot(dx, dy);
    if (length < minSegmentLength) continue;

    let orientation: 'h' | 'v' | null = null;
    if (dy <= 1 && dx >= minSegmentLength) orientation = 'h';
    else if (dx <= 1 && dy >= minSegmentLength) orientation = 'v';
    if (!orientation) continue;

    handles.push({
      segmentIndex: i,
      orientation,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      midX: Math.round((a.x + b.x) / 2),
      midY: Math.round((a.y + b.y) / 2),
      length: Math.round(length),
      isEndpointSegment: i === 0 || i === waypoints.length - 2,
    });
  }
  return handles;
}

/**
 * Moves a single horizontal or vertical segment orthogonally while keeping pin endpoints
 * pinned and preserving 90-degree orthogonal corners throughout the polyline.
 */
export function dragWireSegment(
  origWaypoints: WirePoint[],
  segmentIndex: number,
  targetWorld: WirePoint,
  gridSize = 20,
  snapToGrid = true
): WirePoint[] {
  if (origWaypoints.length < 2 || segmentIndex < 0 || segmentIndex >= origWaypoints.length - 1) {
    return origWaypoints.map((p) => ({ ...p }));
  }

  const pts = origWaypoints.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  const a = pts[segmentIndex];
  const b = pts[segmentIndex + 1];
  const isHoriz = Math.abs(a.y - b.y) <= Math.abs(a.x - b.x);
  const nextVal = isHoriz
    ? snapCoord(targetWorld.y, gridSize, snapToGrid)
    : snapCoord(targetWorld.x, gridSize, snapToGrid);

  const curVal = isHoriz ? a.y : a.x;
  if (nextVal === curVal) return pts;

  // Case 1: Straight 2-point wire -> promote to 4-point U-jog keeping both pins fixed
  if (pts.length === 2) {
    if (isHoriz) {
      return [
        pts[0],
        { x: pts[0].x, y: nextVal },
        { x: pts[1].x, y: nextVal },
        pts[1],
      ];
    }
    return [
      pts[0],
      { x: nextVal, y: pts[0].y },
      { x: nextVal, y: pts[1].y },
      pts[1],
    ];
  }

  const isStart = segmentIndex === 0;
  const isEnd = segmentIndex === pts.length - 2;
  const prevSegSameAxis =
    !isStart &&
    (isHoriz
      ? Math.abs(pts[segmentIndex - 1].y - a.y) <= 1
      : Math.abs(pts[segmentIndex - 1].x - a.x) <= 1);
  const nextSegSameAxis =
    !isEnd &&
    (isHoriz
      ? Math.abs(pts[segmentIndex + 2].y - b.y) <= 1
      : Math.abs(pts[segmentIndex + 2].x - b.x) <= 1);

  const result: WirePoint[] = [];

  for (let i = 0; i < pts.length; i++) {
    if (i === segmentIndex) {
      if (isStart || prevSegSameAxis) {
        result.push({ ...pts[i] });
        result.push(isHoriz ? { x: pts[i].x, y: nextVal } : { x: nextVal, y: pts[i].y });
      } else {
        result.push(isHoriz ? { x: pts[i].x, y: nextVal } : { x: nextVal, y: pts[i].y });
      }
    } else if (i === segmentIndex + 1) {
      if (isEnd || nextSegSameAxis) {
        result.push(isHoriz ? { x: pts[i].x, y: nextVal } : { x: nextVal, y: pts[i].y });
        result.push({ ...pts[i] });
      } else {
        result.push(isHoriz ? { x: pts[i].x, y: nextVal } : { x: nextVal, y: pts[i].y });
      }
    } else {
      result.push({ ...pts[i] });
    }
  }

  return simplifyOrthogonalWaypoints(result);
}

function appendOrthogonalLeg(
  out: WirePoint[],
  target: WirePoint,
  preferHorizontalFirst: boolean
): void {
  const prev = out[out.length - 1];
  if (!prev) {
    out.push({ x: Math.round(target.x), y: Math.round(target.y) });
    return;
  }
  const tx = Math.round(target.x);
  const ty = Math.round(target.y);
  if (prev.x === tx && prev.y === ty) return;
  if (prev.x === tx || prev.y === ty) {
    out.push({ x: tx, y: ty });
    return;
  }
  if (preferHorizontalFirst) {
    out.push({ x: tx, y: prev.y });
  } else {
    out.push({ x: prev.x, y: ty });
  }
  out.push({ x: tx, y: ty });
}

function exitStubForPin(
  pin: { x: number; y: number; direction: PinDirection },
  target: WirePoint,
  stub = 20
): WirePoint | null {
  if (pin.direction === 'right' && target.x < pin.x + 4) {
    return { x: Math.round(pin.x + stub), y: Math.round(pin.y) };
  }
  if (pin.direction === 'left' && target.x > pin.x - 4) {
    return { x: Math.round(pin.x - stub), y: Math.round(pin.y) };
  }
  if (pin.direction === 'bottom' && target.y < pin.y + 4) {
    return { x: Math.round(pin.x), y: Math.round(pin.y + stub) };
  }
  if (pin.direction === 'top' && target.y > pin.y - 4) {
    return { x: Math.round(pin.x), y: Math.round(pin.y - stub) };
  }
  return null;
}

/**
 * Builds an orthogonal polyline passing through intermediate user-clicked corner anchors
 * between `start` pin and `end` pin.
 */
export function buildOrthogonalWireWithWaypoints(
  start: { x: number; y: number; direction: PinDirection },
  anchors: WirePoint[],
  end: { x: number; y: number; direction: PinDirection },
  stub = 20
): WirePoint[] {
  const out: WirePoint[] = [{ x: Math.round(start.x), y: Math.round(start.y) }];
  const startHoriz = start.direction === 'left' || start.direction === 'right';
  const endHoriz = end.direction === 'left' || end.direction === 'right';

  const cleanAnchors = anchors.map((a) => ({ x: Math.round(a.x), y: Math.round(a.y) }));
  if (cleanAnchors.length === 0) {
    appendOrthogonalLeg(out, end, startHoriz);
    return simplifyOrthogonalWaypoints(out);
  }

  const firstStub = exitStubForPin(start, cleanAnchors[0], stub);
  if (firstStub) {
    out.push(firstStub);
    appendOrthogonalLeg(out, cleanAnchors[0], !startHoriz);
  } else {
    appendOrthogonalLeg(out, cleanAnchors[0], startHoriz);
  }

  for (let i = 1; i < cleanAnchors.length; i++) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    const prevWasHoriz = prev && Math.abs(last.y - prev.y) <= 0.5;
    // Alternate axis on turn so corners flow naturally
    appendOrthogonalLeg(out, cleanAnchors[i], !prevWasHoriz);
  }

  const endEntry = exitStubForPin(end, out[out.length - 1], stub);
  if (endEntry) {
    const last = out[out.length - 1];
    const prev = out[out.length - 2];
    const prevWasHoriz = prev && Math.abs(last.y - prev.y) <= 0.5;
    appendOrthogonalLeg(out, endEntry, !prevWasHoriz);
    out.push({ x: Math.round(end.x), y: Math.round(end.y) });
  } else {
    // Approach final pin along its axis direction
    appendOrthogonalLeg(out, end, !endHoriz);
  }

  return simplifyOrthogonalWaypoints(out);
}

/**
 * Live rubber-band preview polyline during step-by-step wire placement.
 */
export function buildWirePreviewWithWaypoints(
  start: { x: number; y: number; direction: PinDirection },
  anchors: WirePoint[],
  cursorOrEndPin: { x: number; y: number; direction?: PinDirection }
): WirePoint[] {
  const inferredDir: PinDirection =
    cursorOrEndPin.direction ||
    (() => {
      const ref = anchors[anchors.length - 1] || start;
      const dx = cursorOrEndPin.x - ref.x;
      const dy = cursorOrEndPin.y - ref.y;
      return Math.abs(dx) >= Math.abs(dy)
        ? dx >= 0
          ? 'left'
          : 'right'
        : dy >= 0
          ? 'top'
          : 'bottom';
    })();
  return buildOrthogonalWireWithWaypoints(
    start,
    anchors,
    { x: cursorOrEndPin.x, y: cursorOrEndPin.y, direction: inferredDir }
  );
}

/**
 * Returns true when a device has 2 opposing inline pins suitable for Auto Wire Break.
 */
export function isTwoPinBreakEligible(
  device: Pick<E3Device, 'category' | 'pins'> | { category: string; pins: Array<{ direction: PinDirection }> }
): boolean {
  if (device.category === 'offpage_ref' || device.category === 'airflow_arrow' || device.category === 'io_matrix') {
    return false;
  }
  if (device.pins.length !== 2) return false;
  const dirs = new Set(device.pins.map((p) => p.direction));
  return (dirs.has('top') && dirs.has('bottom')) || (dirs.has('left') && dirs.has('right'));
}

/**
 * Finds the best horizontal or vertical wire segment underneath/near a 2-pin device center
 * for automatic wire splitting ("в разрыв провода").
 */
export function findWireBreakCandidate(
  device: Pick<E3Device, 'id' | 'sheetId' | 'x' | 'y' | 'width' | 'height' | 'category' | 'pins'> & {
    rotation?: number;
  },
  sheetWires: E3Wire[],
  tolerance = 30
): WireBreakCandidate | null {
  if (!isTwoPinBreakEligible(device)) return null;

  const cx = device.x + device.width / 2;
  const cy = device.y + device.height / 2;
  const rot = device.rotation ?? 0;
  const isRot90 = rot === 90 || rot === 270;
  const effWidth = isRot90 ? device.height : device.width;
  const effHeight = isRot90 ? device.width : device.height;
  const tolH = Math.max(tolerance, Math.round(effHeight / 2));
  const tolV = Math.max(tolerance, Math.round(effWidth / 2));

  let best: WireBreakCandidate | null = null;

  for (const w of sheetWires) {
    if (w.sheetId !== device.sheetId) continue;
    if (w.fromDeviceId === device.id || w.toDeviceId === device.id) continue;
    if (w.waypoints.length < 2) continue;

    for (let i = 0; i < w.waypoints.length - 1; i++) {
      const a = w.waypoints[i];
      const b = w.waypoints[i + 1];
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);

      if (dy <= 1 && dx >= 32) {
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        const margin = Math.min(18, Math.max(6, Math.round(dx * 0.12)));
        if (cx >= minX + margin && cx <= maxX - margin) {
          const dist = Math.abs(cy - a.y);
          if (dist <= tolH && (!best || dist < best.distance)) {
            best = {
              wire: w,
              segmentIndex: i,
              orientation: 'h',
              projX: Math.round(cx),
              projY: Math.round(a.y),
              distance: dist,
            };
          }
        }
      } else if (dx <= 1 && dy >= 32) {
        const minY = Math.min(a.y, b.y);
        const maxY = Math.max(a.y, b.y);
        const margin = Math.min(18, Math.max(6, Math.round(dy * 0.12)));
        if (cy >= minY + margin && cy <= maxY - margin) {
          const dist = Math.abs(cx - a.x);
          if (dist <= tolV && (!best || dist < best.distance)) {
            best = {
              wire: w,
              segmentIndex: i,
              orientation: 'v',
              projX: Math.round(a.x),
              projY: Math.round(cy),
              distance: dist,
            };
          }
        }
      }
    }
  }

  return best;
}

function nextSplitNetName(wires: E3Wire[], baseNet: string): string {
  const clean = baseNet.trim() || 'NET';
  let idx = 1;
  while (wires.some((w) => w.netName === `${clean}_${idx}`)) {
    idx += 1;
  }
  return `${clean}_${idx}`;
}

function nextSplitWireNumber(wires: E3Wire[], baseNumber: string): string {
  const num = Number(baseNumber);
  if (Number.isFinite(num) && /^\d+$/.test(baseNumber.trim())) {
    let cand = num + 1;
    while (wires.some((w) => w.wireNumber === String(cand))) {
      cand += 1;
    }
    return String(cand);
  }
  let idx = 1;
  while (wires.some((w) => w.wireNumber === `${baseNumber}.${idx}`)) {
    idx += 1;
  }
  return `${baseNumber}.${idx}`;
}

/**
 * Splits `candidate.wire` into two connected segments by inserting `device` inline
 * (auto-rotating 0°/90° if needed so its two pins sit collinearly on the wire segment).
 */
export function applyAutoWireBreak(
  project: E3Project,
  device: E3Device,
  candidate: WireBreakCandidate
): AutoWireBreakResult | null {
  if (!isTwoPinBreakEligible(device) || device.pins.length !== 2) return null;

  const orig = candidate.wire;
  const segStart = orig.waypoints[candidate.segmentIndex];
  const segEnd = orig.waypoints[candidate.segmentIndex + 1];
  if (!segStart || !segEnd) return null;

  // Determine natural pin axis at rotation 0
  const p0 = device.pins[0];
  const p1 = device.pins[1];
  const naturalHoriz = Math.abs(p1.dx - p0.dx) >= Math.abs(p1.dy - p0.dy);
  const currentRot = device.rotation;
  const currentIsHoriz = currentRot === 90 || currentRot === 270 ? !naturalHoriz : naturalHoriz;

  let nextRotation = currentRot;
  if (candidate.orientation === 'h' && !currentIsHoriz) {
    nextRotation = naturalHoriz ? 0 : 90;
  } else if (candidate.orientation === 'v' && currentIsHoriz) {
    nextRotation = naturalHoriz ? 90 : 0;
  }

  const rotatedDraft: E3Device = { ...device, rotation: nextRotation };
  const abs0 = getAbsolutePinPos(rotatedDraft, p0);
  const abs1 = getAbsolutePinPos(rotatedDraft, p1);
  const pinMidX = (abs0.x + abs1.x) / 2;
  const pinMidY = (abs0.y + abs1.y) / 2;

  const shiftX = Math.round(candidate.projX - pinMidX);
  const shiftY = Math.round(candidate.projY - pinMidY);

  const alignedDevice: E3Device = {
    ...rotatedDraft,
    x: rotatedDraft.x + shiftX,
    y: rotatedDraft.y + shiftY,
    pins: rotatedDraft.pins.map((pin) => ({
      ...pin,
      signalType: orig.signalType,
    })),
  };

  const finalAbs0 = getAbsolutePinPos(alignedDevice, p0);
  const finalAbs1 = getAbsolutePinPos(alignedDevice, p1);

  // Pick upstream pin closest to segStart
  const dist0ToStart = Math.hypot(finalAbs0.x - segStart.x, finalAbs0.y - segStart.y);
  const dist1ToStart = Math.hypot(finalAbs1.x - segStart.x, finalAbs1.y - segStart.y);
  const inPin = dist0ToStart <= dist1ToStart ? p0 : p1;
  const outPin = inPin.id === p0.id ? p1 : p0;
  const inAbs = inPin.id === p0.id ? finalAbs0 : finalAbs1;
  const outAbs = outPin.id === p0.id ? finalAbs0 : finalAbs1;

  const prefixPts = orig.waypoints.slice(0, candidate.segmentIndex + 1).map((p) => ({ ...p }));
  const beforeLast = prefixPts[prefixPts.length - 1];
  if (beforeLast && Math.abs(beforeLast.x - inAbs.x) > 1 && Math.abs(beforeLast.y - inAbs.y) > 1) {
    if (candidate.orientation === 'h') {
      prefixPts.push({ x: inAbs.x, y: beforeLast.y });
    } else {
      prefixPts.push({ x: beforeLast.x, y: inAbs.y });
    }
  }
  prefixPts.push({ x: inAbs.x, y: inAbs.y });

  const suffixHead = orig.waypoints.slice(candidate.segmentIndex + 1).map((p) => ({ ...p }));
  const afterFirst = suffixHead[0];
  const suffixPts: WirePoint[] = [{ x: outAbs.x, y: outAbs.y }];
  if (afterFirst && Math.abs(afterFirst.x - outAbs.x) > 1 && Math.abs(afterFirst.y - outAbs.y) > 1) {
    if (candidate.orientation === 'h') {
      suffixPts.push({ x: outAbs.x, y: afterFirst.y });
    } else {
      suffixPts.push({ x: afterFirst.x, y: outAbs.y });
    }
  }
  suffixPts.push(...suffixHead);

  const splitStamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const wireBefore: E3Wire = {
    ...orig,
    id: `w-${splitStamp}-1`,
    toDeviceId: alignedDevice.id,
    toPinId: inPin.id,
    waypoints: simplifyOrthogonalWaypoints(prefixPts),
  };

  const keepSameNet = alignedDevice.category === 'terminal';
  const downstreamNet = keepSameNet
    ? orig.netName
    : nextSplitNetName(project.wires, orig.netName);
  const downstreamNum = nextSplitWireNumber(project.wires, orig.wireNumber);

  const wireAfter: E3Wire = {
    id: `w-${splitStamp}-2`,
    sheetId: orig.sheetId,
    netName: downstreamNet,
    signalType: orig.signalType,
    fromDeviceId: alignedDevice.id,
    fromPinId: outPin.id,
    toDeviceId: orig.toDeviceId,
    toPinId: orig.toPinId,
    waypoints: simplifyOrthogonalWaypoints(suffixPts),
    crossSection: orig.crossSection,
    wireNumber: downstreamNum,
    cableId: orig.cableId,
    coreNumber: orig.coreNumber,
    manualRoute: orig.manualRoute,
  };

  const deviceExists = project.devices.some((d) => d.id === alignedDevice.id);
  const nextDevices = deviceExists
    ? project.devices.map((d) => (d.id === alignedDevice.id ? alignedDevice : d))
    : [...project.devices, alignedDevice];

  const nextWires = project.wires.flatMap((w) =>
    w.id === orig.id ? [wireBefore, wireAfter] : [w]
  );

  return {
    nextProject: {
      ...project,
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
      devices: nextDevices,
      wires: nextWires,
    },
    updatedDevice: alignedDevice,
    wireBefore,
    wireAfter,
    originalWireId: orig.id,
  };
}
