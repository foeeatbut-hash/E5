import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraTransformsClose,
  computeAdaptiveCameraDuration,
  computeAnchoredZoomPan,
  easeOutQuint,
  interpolateCameraFrame,
  normalizeCommittedCameraTransform,
  normalizeWheelDeltaY,
  reconcileExternalCameraProps,
  stepExponentialZoom,
} from './cameraAnimation';

test('interpolateCameraFrame handles sub-millisecond timing, negative elapsed clamp, and straight optical ray', () => {
  const from = { zoom: 0.5, pan: { x: 100, y: 40 } };
  const to = { zoom: 1.0, pan: { x: -1200, y: -120 } };

  // Negative elapsed (when RAF vsync timestamp precedes performance.now) must clamp to start cleanly
  const neg = interpolateCameraFrame(from, to, -2.4, 200);
  assert.equal(neg.zoom, from.zoom);
  assert.deepEqual(neg.pan, from.pan);
  assert.equal(neg.done, false);

  // Sub-millisecond progress (0.5ms into 200ms transition) produces smooth forward progress
  const subMs = interpolateCameraFrame(from, to, 0.5, 200);
  assert.ok(subMs.zoom > from.zoom && subMs.zoom < to.zoom);
  assert.ok(subMs.pan.x < from.pan.x && subMs.pan.x > to.pan.x);
  assert.equal(subMs.done, false);

  // World point (400, 300) should move monotonically along a straight line in screen space
  const worldPt = { x: 400, y: 300 };
  const p0 = { x: from.pan.x + worldPt.x * from.zoom, y: from.pan.y + worldPt.y * from.zoom };
  const p1 = { x: to.pan.x + worldPt.x * to.zoom, y: to.pan.y + worldPt.y * to.zoom };
  const mid = interpolateCameraFrame(from, to, 80, 200);
  const pm = { x: mid.pan.x + worldPt.x * mid.zoom, y: mid.pan.y + worldPt.y * mid.zoom };
  const ratioX = (pm.x - p0.x) / (p1.x - p0.x);
  const ratioY = (pm.y - p0.y) / (p1.y - p0.y);
  assert.ok(Math.abs(ratioX - ratioY) < 1e-9, `Expected collinear trajectory, got ${ratioX} vs ${ratioY}`);

  // Completion
  const end = interpolateCameraFrame(from, to, 200, 200);
  assert.equal(end.done, true);
  assert.equal(end.zoom, to.zoom);
  assert.deepEqual(end.pan, to.pan);
});

test('stepExponentialZoom is frame-rate independent at 1000fps (1ms) and 2000fps (0.5ms)', () => {
  let z1000 = 0.5;
  for (let i = 0; i < 100; i++) {
    z1000 = stepExponentialZoom(z1000, 1.0, 0.001).zoom;
  }

  let z2000 = 0.5;
  for (let i = 0; i < 200; i++) {
    z2000 = stepExponentialZoom(z2000, 1.0, 0.0005).zoom;
  }

  let z60 = 0.5;
  for (let i = 0; i < 6; i++) {
    z60 = stepExponentialZoom(z60, 1.0, 0.1 / 6).zoom;
  }

  assert.ok(Math.abs(z1000 - z2000) < 1e-6, `Expected 1000fps and 2000fps parity, got ${z1000} vs ${z2000}`);
  assert.ok(Math.abs(z1000 - z60) < 1e-6, `Expected 1000fps and 60fps parity, got ${z1000} vs ${z60}`);
});

test('computeAnchoredZoomPan preserves cursor world point and normalizeCommittedCameraTransform preserves sub-pixel precision', () => {
  const curZoom = 0.75;
  const curPan = { x: 123.45, y: -45.67 };
  const cursor = { x: 640, y: 360 };
  const worldBefore = {
    x: (cursor.x - curPan.x) / curZoom,
    y: (cursor.y - curPan.y) / curZoom,
  };
  const nextZoom = 1.25;
  const nextPan = computeAnchoredZoomPan(cursor.x, cursor.y, curPan, curZoom, nextZoom);
  const worldAfter = {
    x: (cursor.x - nextPan.x) / nextZoom,
    y: (cursor.y - nextPan.y) / nextZoom,
  };
  assert.ok(Math.abs(worldBefore.x - worldAfter.x) < 1e-9);
  assert.ok(Math.abs(worldBefore.y - worldAfter.y) < 1e-9);

  const normalized = normalizeCommittedCameraTransform({ zoom: 0.751234, pan: { x: 12.3456, y: -9.8764 } });
  assert.equal(normalized.zoom, 0.7512);
  assert.equal(normalized.pan.x, 12.346);
  assert.equal(normalized.pan.y, -9.876);

  assert.equal(easeOutQuint(0), 0);
  assert.equal(easeOutQuint(1), 1);
  assert.ok(computeAdaptiveCameraDuration({ zoom: 0.5, pan: { x: 0, y: 0 } }, { zoom: 0.5, pan: { x: 20, y: 0 } }) < 150);
  assert.ok(computeAdaptiveCameraDuration({ zoom: 0.5, pan: { x: 0, y: 0 } }, { zoom: 1.5, pan: { x: 4000, y: 0 } }) >= 240);
});

test('reconcileExternalCameraProps blocks stale pre-zoom props during async commit window while allowing external jumps', () => {
  const preZoom = { zoom: 0.56, pan: { x: 46, y: 12 } };
  const zoomed = { zoom: 1.42, pan: { x: -380, y: -210 } };
  const fitJump = { zoom: 0.61, pan: { x: 30, y: 16 } };

  // 1. Initial mount applies props cleanly
  const mount = reconcileExternalCameraProps({
    incoming: preZoom,
    prevSyncedProps: null,
    pendingCommit: null,
    isLocalInteractionActive: false,
  });
  assert.equal(mount.applyToLive, true);
  assert.equal(mount.nextPendingCommit, null);

  // 2. Unrelated parent render with a new object instance of identical values does NOT overwrite live camera
  const idleRerender = reconcileExternalCameraProps({
    incoming: { zoom: 0.56, pan: { x: 46, y: 12 } },
    prevSyncedProps: mount.nextSyncedProps,
    pendingCommit: null,
    isLocalInteractionActive: false,
  });
  assert.equal(idleRerender.applyToLive, false);

  // 3. Wheel commit fires (pendingCommit = zoomed), intermediate render arrives with stale preZoom
  const staleDuringCommit = reconcileExternalCameraProps({
    incoming: { zoom: 0.56, pan: { x: 46, y: 12 } },
    prevSyncedProps: mount.nextSyncedProps,
    pendingCommit: zoomed,
    isLocalInteractionActive: false,
  });
  assert.equal(staleDuringCommit.applyToLive, false);
  assert.ok(staleDuringCommit.nextPendingCommit && cameraTransformsClose(staleDuringCommit.nextPendingCommit, zoomed));

  // 4. React flushes the committed zoomed transform -> clears pendingCommit without snapping live camera
  const flushedCommit = reconcileExternalCameraProps({
    incoming: { zoom: 1.42, pan: { x: -380, y: -210 } },
    prevSyncedProps: staleDuringCommit.nextSyncedProps,
    pendingCommit: staleDuringCommit.nextPendingCommit,
    isLocalInteractionActive: false,
  });
  assert.equal(flushedCommit.applyToLive, false);
  assert.equal(flushedCommit.nextPendingCommit, null);

  // 5. External Fit View / sheet change arrives -> applies immediately
  const externalFit = reconcileExternalCameraProps({
    incoming: fitJump,
    prevSyncedProps: flushedCommit.nextSyncedProps,
    pendingCommit: null,
    isLocalInteractionActive: false,
  });
  assert.equal(externalFit.applyToLive, true);
  assert.ok(cameraTransformsClose(externalFit.nextSyncedProps, fitJump));

  // 6. Genuine external jump arriving before pendingCommit resolves supersedes pendingCommit
  const superseded = reconcileExternalCameraProps({
    incoming: fitJump,
    prevSyncedProps: preZoom,
    pendingCommit: zoomed,
    isLocalInteractionActive: false,
  });
  assert.equal(superseded.applyToLive, true);
  assert.equal(superseded.nextPendingCommit, null);
});

test('normalizeWheelDeltaY handles pixel, line, page modes and clamps extreme bursts cleanly', () => {
  assert.equal(normalizeWheelDeltaY(0, 0), 0);
  assert.equal(normalizeWheelDeltaY(Number.NaN, 0), 0);
  assert.equal(normalizeWheelDeltaY(-120, 0), -120);
  assert.equal(normalizeWheelDeltaY(3, 1), 48);
  assert.equal(normalizeWheelDeltaY(-1, 2), -360);
  assert.equal(normalizeWheelDeltaY(900, 0), 360);
});

