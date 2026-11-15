export interface CameraTransform {
  zoom: number;
  pan: { x: number; y: number };
}

export interface CameraInterpolationResult {
  zoom: number;
  pan: { x: number; y: number };
  t: number;
  eased: number;
  done: boolean;
}

export const CAMERA_ZOOM_MIN = 0.16;
export const CAMERA_ZOOM_MAX = 2.5;
export const CAMERA_WHEEL_LAMBDA = 26;
export const CAMERA_ZOOM_SETTLE_EPS = 0.0004;

export function clampCameraZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(CAMERA_ZOOM_MAX, Math.max(CAMERA_ZOOM_MIN, zoom));
}

export function easeOutQuint(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const inv = 1 - clamped;
  return 1 - inv * inv * inv * inv * inv;
}

/**
 * Computes an adaptive transition duration (135ms–260ms) based on pan distance
 * and logarithmic zoom change so local adjustments stay crisp and cross-sheet
 * camera transitions glide cleanly without feeling sluggish or abrupt.
 */
export function computeAdaptiveCameraDuration(
  from: CameraTransform,
  to: CameraTransform
): number {
  const dist = Math.hypot(to.pan.x - from.pan.x, to.pan.y - from.pan.y);
  const zFrom = Math.max(0.05, from.zoom);
  const zTo = Math.max(0.05, to.zoom);
  const zoomDelta = Math.abs(Math.log(zTo / zFrom));
  const raw = 135 + Math.min(125, dist * 0.042 + zoomDelta * 90);
  return Math.round(Math.max(135, Math.min(260, raw)));
}

/**
 * Sub-millisecond camera interpolation frame:
 * - Uses clamped elapsed time (>= 0) so frame-1 never extrapolates backwards.
 * - Interpolates zoom logarithmically for constant perceived scale velocity.
 * - Couples pan interpolation to the exact scale ratio s = (z - z0) / (z1 - z0)
 *   so every world coordinate travels in an exact straight line on screen.
 */
export function interpolateCameraFrame(
  from: CameraTransform,
  to: CameraTransform,
  elapsedMs: number,
  durationMs: number
): CameraInterpolationResult {
  const safeDuration = Math.max(0, durationMs);
  const safeElapsed = Math.max(0, elapsedMs);
  const t = safeDuration <= 0 ? 1 : Math.min(1, safeElapsed / safeDuration);

  if (t >= 1) {
    return {
      zoom: to.zoom,
      pan: { x: to.pan.x, y: to.pan.y },
      t: 1,
      eased: 1,
      done: true,
    };
  }

  const eased = easeOutQuint(t);
  const z0 = Math.max(0.05, from.zoom);
  const z1 = Math.max(0.05, to.zoom);
  const zoomDiff = z1 - z0;

  let zoom: number;
  let panProgress: number;

  if (Math.abs(zoomDiff) < 1e-6) {
    zoom = z0 + zoomDiff * eased;
    panProgress = eased;
  } else {
    zoom = z0 * Math.pow(z1 / z0, eased);
    panProgress = (zoom - z0) / zoomDiff;
  }

  return {
    zoom,
    pan: {
      x: from.pan.x + (to.pan.x - from.pan.x) * panProgress,
      y: from.pan.y + (to.pan.y - from.pan.y) * panProgress,
    },
    t,
    eased,
    done: false,
  };
}

/**
 * Frame-rate-independent exponential zoom damping with true sub-millisecond
 * dt precision (no 1ms floor), ready for 60Hz, 120Hz, 240Hz, and 1000fps loops.
 */
export function stepExponentialZoom(
  currentZoom: number,
  targetZoom: number,
  dtSeconds: number,
  lambda = CAMERA_WHEEL_LAMBDA
): { zoom: number; settled: boolean } {
  const diff = targetZoom - currentZoom;
  if (Math.abs(diff) < CAMERA_ZOOM_SETTLE_EPS) {
    return { zoom: targetZoom, settled: true };
  }
  const safeDt = Math.min(0.05, Math.max(0, dtSeconds));
  if (safeDt <= 0) {
    return { zoom: currentZoom, settled: false };
  }
  const alpha = 1 - Math.exp(-lambda * safeDt);
  const nextZoom = currentZoom + diff * alpha;
  if (Math.abs(targetZoom - nextZoom) < CAMERA_ZOOM_SETTLE_EPS) {
    return { zoom: targetZoom, settled: true };
  }
  return { zoom: nextZoom, settled: false };
}

/**
 * Computes the next pan vector so the world coordinate under (anchorX, anchorY)
 * remains pinned to the exact same screen pixel as zoom changes.
 */
export function computeAnchoredZoomPan(
  anchorX: number,
  anchorY: number,
  currentPan: { x: number; y: number },
  currentZoom: number,
  nextZoom: number
): { x: number; y: number } {
  const safeCurZ = Math.max(0.05, currentZoom);
  const worldX = (anchorX - currentPan.x) / safeCurZ;
  const worldY = (anchorY - currentPan.y) / safeCurZ;
  return {
    x: anchorX - worldX * nextZoom,
    y: anchorY - worldY * nextZoom,
  };
}

/**
 * Rounds transform values cleanly to 3 decimal places without integer snapping
 * to eliminate post-animation sub-pixel jump.
 */
export function normalizeCommittedCameraTransform(transform: CameraTransform): CameraTransform {
  return {
    zoom: Math.round(clampCameraZoom(transform.zoom) * 10000) / 10000,
    pan: {
      x: Math.round(transform.pan.x * 1000) / 1000,
      y: Math.round(transform.pan.y * 1000) / 1000,
    },
  };
}

export function cameraTransformsClose(
  a: CameraTransform,
  b: CameraTransform,
  zoomEps = 0.00025,
  panEps = 0.02
): boolean {
  return (
    Math.abs(a.zoom - b.zoom) <= zoomEps &&
    Math.abs(a.pan.x - b.pan.x) <= panEps &&
    Math.abs(a.pan.y - b.pan.y) <= panEps
  );
}

export interface ExternalCameraSyncParams {
  incoming: CameraTransform;
  prevSyncedProps: CameraTransform | null;
  pendingCommit: CameraTransform | null;
  isLocalInteractionActive: boolean;
}

export interface ExternalCameraSyncDecision {
  applyToLive: boolean;
  nextPendingCommit: CameraTransform | null;
  nextSyncedProps: CameraTransform;
}

/**
 * Reconciles incoming React (zoom, pan) props against active local wheel/pan
 * interactions and in-flight async React state commits so stale pre-zoom
 * renders never snap the live camera backwards.
 */
export function reconcileExternalCameraProps(
  params: ExternalCameraSyncParams
): ExternalCameraSyncDecision {
  const { incoming, prevSyncedProps, pendingCommit, isLocalInteractionActive } = params;
  const incomingCopy: CameraTransform = {
    zoom: incoming.zoom,
    pan: { x: incoming.pan.x, y: incoming.pan.y },
  };
  const nextPending =
    pendingCommit && cameraTransformsClose(incomingCopy, pendingCommit) ? null : pendingCommit;

  if (isLocalInteractionActive) {
    return {
      applyToLive: false,
      nextPendingCommit: nextPending,
      nextSyncedProps: incomingCopy,
    };
  }

  if (pendingCommit) {
    if (nextPending === null) {
      return {
        applyToLive: false,
        nextPendingCommit: null,
        nextSyncedProps: incomingCopy,
      };
    }
    if (prevSyncedProps && cameraTransformsClose(incomingCopy, prevSyncedProps)) {
      // Stale React render still carrying pre-zoom props before async commit flushed
      return {
        applyToLive: false,
        nextPendingCommit: pendingCommit,
        nextSyncedProps: prevSyncedProps,
      };
    }
    // Genuinely new external transform (e.g., Fit View / Sheet Jump) superseded pending commit
    return {
      applyToLive: true,
      nextPendingCommit: null,
      nextSyncedProps: incomingCopy,
    };
  }

  if (prevSyncedProps && cameraTransformsClose(incomingCopy, prevSyncedProps)) {
    return {
      applyToLive: false,
      nextPendingCommit: null,
      nextSyncedProps: prevSyncedProps,
    };
  }

  return {
    applyToLive: true,
    nextPendingCommit: null,
    nextSyncedProps: incomingCopy,
  };
}

export function normalizeWheelDeltaY(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  const scale = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  const raw = deltaY * scale;
  return Math.max(-360, Math.min(360, raw));
}

