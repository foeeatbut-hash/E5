export interface PanelCoords {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface PanelCoordBounds {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
}

function isPlainOrReactObject(val: unknown): val is Record<string, unknown> {
  if (!val || typeof val !== 'object') return false;
  const proto = Object.getPrototypeOf(val);
  return proto === Object.prototype || proto === null || '$$typeof' in (val as Record<string, unknown>);
}

function isReactElementLike(val: unknown): val is { $$typeof: symbol; type: unknown; key: unknown; props: Record<string, unknown> } {
  return Boolean(
    val &&
      typeof val === 'object' &&
      '$$typeof' in (val as Record<string, unknown>) &&
      'props' in (val as Record<string, unknown>)
  );
}

/**
 * Deeply compares two values (including React elements, nested panel configs, arrays, and plain objects)
 * with cycle protection and bounded recursion depth so React.memo skips wasted layout renders safely.
 */
export function deepEqualProps(
  a: unknown,
  b: unknown,
  depth = 0,
  seen: WeakMap<object, WeakSet<object>> = new WeakMap()
): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (depth >= 8) return false;

  const objA = a as object;
  const objB = b as object;

  let visited = seen.get(objA);
  if (visited?.has(objB)) return true;
  if (!visited) {
    visited = new WeakSet<object>();
    seen.set(objA, visited);
  }
  visited.add(objB);

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqualProps(a[i], b[i], depth + 1, seen)) return false;
    }
    return true;
  }

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a.entries()) {
      if (!b.has(k) || !deepEqualProps(v, b.get(k), depth + 1, seen)) return false;
    }
    return true;
  }

  if (isReactElementLike(a) || isReactElementLike(b)) {
    if (!isReactElementLike(a) || !isReactElementLike(b)) return false;
    if (a.$$typeof !== b.$$typeof || a.type !== b.type || a.key !== b.key) return false;
    return deepEqualProps(a.props, b.props, depth + 1, seen);
  }

  if (!isPlainOrReactObject(a) || !isPlainOrReactObject(b)) return false;

  const keysA = Object.keys(a).filter((k) => k !== '_owner' && k !== '_store');
  const keysB = Object.keys(b).filter((k) => k !== '_owner' && k !== '_store');
  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqualProps(a[key], b[key], depth + 1, seen)) return false;
  }

  return true;
}

/**
 * Compares DockablePanelFrame / FloatingPanelWindow props deeply (including ReactElement children props),
 * preventing full panel-tree re-renders when unrelated App state (FPS, logs, telemetry) updates.
 */
export function arePanelContainerPropsEqual<T extends Record<string, unknown>>(prev: T, next: T): boolean {
  if (Object.is(prev, next)) return true;
  const keysPrev = Object.keys(prev);
  const keysNext = Object.keys(next);
  if (keysPrev.length !== keysNext.length) return false;

  for (let i = 0; i < keysPrev.length; i++) {
    const key = keysPrev[i];
    if (!Object.prototype.hasOwnProperty.call(next, key)) return false;
    const va = prev[key];
    const vb = next[key];
    if (Object.is(va, vb)) continue;
    if (typeof va === 'function' || typeof vb === 'function') return false;
    if (!deepEqualProps(va, vb)) return false;
  }
  return true;
}

function normInt(val: number, fallback = 0): number {
  if (!Number.isFinite(val)) return fallback;
  const rounded = Math.round(val);
  return rounded === 0 ? 0 : rounded;
}

/**
 * Snaps panel coordinates to integer CSS pixels and optionally clamps to safe viewport bounds,
 * eliminating subpixel rounding jitter when panels are moved or resized.
 */
export function stabilizePanelCoordinates(
  target: PanelCoords,
  bounds?: PanelCoordBounds
): PanelCoords {
  let x = normInt(target.x);
  let y = normInt(target.y);
  if (bounds?.minX !== undefined) x = Math.max(normInt(bounds.minX), x);
  if (bounds?.maxX !== undefined) x = Math.min(normInt(bounds.maxX), x);
  if (bounds?.minY !== undefined) y = Math.max(normInt(bounds.minY), y);
  if (bounds?.maxY !== undefined) y = Math.min(normInt(bounds.maxY), y);

  const out: PanelCoords = { x, y };
  if (target.width !== undefined) out.width = Math.max(1, normInt(target.width, 1));
  if (target.height !== undefined) out.height = Math.max(1, normInt(target.height, 1));
  return out;
}

/**
 * Computes fixed pixel flex-basis for dock panels so container/child flex calculations never rely on
 * relative percentages (0% / auto) during drag or layout transitions.
 */
export function computePanelPixelFlexBasis(opts: {
  panelCollapsed: boolean;
  multiPanelInBand: boolean;
  bandSpanPx: number;
  bandCrossPx: number;
  collapsedSizePx: number;
  expandedCount?: number;
  collapsedCount?: number;
}): number {
  const collapsedPx = Math.max(20, Math.round(opts.collapsedSizePx));
  const safeSpan = Math.max(collapsedPx, Math.round(opts.bandSpanPx || opts.bandCrossPx));
  if (!opts.multiPanelInBand) {
    return opts.panelCollapsed ? collapsedPx : safeSpan;
  }
  if (opts.panelCollapsed) return collapsedPx;
  const collapsedTotal = (opts.collapsedCount || 0) * collapsedPx;
  const remaining = Math.max(96, safeSpan - collapsedTotal);
  const expCount = Math.max(1, opts.expandedCount || 1);
  return Math.max(96, Math.floor(remaining / expCount));
}

export interface RafCoordinateStabilizer {
  schedule: (coords: PanelCoords, bounds?: PanelCoordBounds) => void;
  flushNow: () => void;
  cancel: () => void;
  hasPending: () => boolean;
}

/**
 * Coalesces rapid coordinate updates to at most one callback per animation frame,
 * keeping moving/floating panel coordinates frame-aligned and jitter-free.
 */
export function createRafCoordinateStabilizer(
  onCommit: (coords: PanelCoords) => void,
  scheduleRaf: (cb: () => void) => number = (cb) => window.requestAnimationFrame(cb),
  cancelRaf: (id: number) => void = (id) => window.cancelAnimationFrame(id)
): RafCoordinateStabilizer {
  let rafId: number | null = null;
  let pending: PanelCoords | null = null;
  let lastCommitted: PanelCoords | null = null;

  const commit = () => {
    rafId = null;
    if (!pending) return;
    const next = pending;
    pending = null;
    if (
      lastCommitted &&
      lastCommitted.x === next.x &&
      lastCommitted.y === next.y &&
      lastCommitted.width === next.width &&
      lastCommitted.height === next.height
    ) {
      return;
    }
    lastCommitted = next;
    onCommit(next);
  };

  return {
    schedule(coords, bounds) {
      pending = stabilizePanelCoordinates(coords, bounds);
      if (rafId === null) {
        rafId = scheduleRaf(commit);
      }
    },
    flushNow() {
      if (rafId !== null) {
        cancelRaf(rafId);
        rafId = null;
      }
      commit();
    },
    cancel() {
      if (rafId !== null) {
        cancelRaf(rafId);
        rafId = null;
      }
      pending = null;
    },
    hasPending() {
      return rafId !== null;
    },
  };
}
