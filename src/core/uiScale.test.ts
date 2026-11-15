import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getScaledChromeMetrics,
  loadUiScale,
  normalizeUiScalePercent,
  saveUiScale,
  scaledPx,
  UI_SCALE_OPTIONS,
  uiScaleFactor,
} from './uiScale.ts';
import {
  clampDockLayoutToViewport,
  createDefaultDockLayout,
  rescaleDockLayoutForUiScale,
} from './dockLayout.ts';

test('UI_SCALE_OPTIONS provides 100, 110, 120, 130, 140, 150 presets and normalizes cleanly', () => {
  assert.deepEqual([...UI_SCALE_OPTIONS], [100, 110, 120, 130, 140, 150]);
  assert.equal(normalizeUiScalePercent(100), 100);
  assert.equal(normalizeUiScalePercent(112), 110);
  assert.equal(normalizeUiScalePercent('140%'), 140);
  assert.equal(normalizeUiScalePercent(160), 150);
  assert.equal(normalizeUiScalePercent(180), 150);
  assert.equal(normalizeUiScalePercent(999), 150);
  assert.equal(normalizeUiScalePercent('bad'), 100);
  assert.equal(uiScaleFactor(150), 1.5);
  assert.equal(scaledPx(74, 150), 111);
});

test('getScaledChromeMetrics scales ribbon, rail, and bar dimensions monotonically', () => {
  const m100 = getScaledChromeMetrics(100);
  const m130 = getScaledChromeMetrics(130);
  const m150 = getScaledChromeMetrics(150);

  assert.equal(m100.ribbonRowHeight, 74);
  assert.equal(m130.ribbonRowHeight, 96);
  assert.equal(m150.ribbonRowHeight, 111);
  assert.ok(m100.collapsedSideRailWidth < m130.collapsedSideRailWidth);
  assert.ok(m130.collapsedSideRailWidth < m150.collapsedSideRailWidth);
  assert.ok(m100.baseFontPx < m130.baseFontPx && m130.baseFontPx < m150.baseFontPx);
});

test('loadUiScale and saveUiScale round-trip through Storage', () => {
  const mem = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
  };
  assert.equal(loadUiScale(mockStorage), 100);
  saveUiScale(150, mockStorage);
  assert.equal(loadUiScale(mockStorage), 150);
});

test('rescaleDockLayoutForUiScale keeps panels proportional and non-overlapping up to 150% across laptop & desktop viewports', () => {
  const base = createDefaultDockLayout();
  for (const [vw, vh] of [
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    for (const pct of UI_SCALE_OPTIONS) {
      const scaled = rescaleDockLayoutForUiScale(base, 100, pct, vw, vh);
      const centerW = vw - scaled.sizes.left - scaled.sizes.right;
      const headerH = getScaledChromeMetrics(pct).ribbonRowHeight + getScaledChromeMetrics(pct).row1Height + getScaledChromeMetrics(pct).row2Height;
      const centerH = vh - headerH - scaled.sizes.bottom;

      assert.ok(centerW >= 260, `Expected centerW >= 260 at ${pct}% on ${vw}x${vh}, got ${centerW}`);
      assert.ok(centerH >= 180, `Expected centerH >= 180 at ${pct}% on ${vw}x${vh}, got ${centerH}`);
      assert.ok(scaled.sizes.left > 0 && scaled.sizes.right > 0 && scaled.sizes.bottom > 0);

      const reclamped = clampDockLayoutToViewport(scaled, vw, vh, pct / 100);
      assert.equal(reclamped.sizes.left, scaled.sizes.left);
      assert.equal(reclamped.sizes.right, scaled.sizes.right);
      assert.equal(reclamped.sizes.bottom, scaled.sizes.bottom);
    }
  }
});
