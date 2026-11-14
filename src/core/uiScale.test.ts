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

test('UI_SCALE_OPTIONS provides 100, 120, 140, 160, 180 presets and normalizes cleanly', () => {
  assert.deepEqual([...UI_SCALE_OPTIONS], [100, 120, 140, 160, 180]);
  assert.equal(normalizeUiScalePercent(100), 100);
  assert.equal(normalizeUiScalePercent('140%'), 140);
  assert.equal(normalizeUiScalePercent(162), 160);
  assert.equal(normalizeUiScalePercent(999), 180);
  assert.equal(normalizeUiScalePercent('bad'), 100);
  assert.equal(uiScaleFactor(160), 1.6);
  assert.equal(scaledPx(74, 180), 133);
});

test('getScaledChromeMetrics scales ribbon, rail, and bar dimensions monotonically', () => {
  const m100 = getScaledChromeMetrics(100);
  const m140 = getScaledChromeMetrics(140);
  const m180 = getScaledChromeMetrics(180);

  assert.equal(m100.ribbonRowHeight, 74);
  assert.equal(m140.ribbonRowHeight, 104);
  assert.equal(m180.ribbonRowHeight, 133);
  assert.ok(m100.collapsedSideRailWidth < m140.collapsedSideRailWidth);
  assert.ok(m140.collapsedSideRailWidth < m180.collapsedSideRailWidth);
  assert.ok(m100.baseFontPx < m140.baseFontPx && m140.baseFontPx < m180.baseFontPx);
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
  saveUiScale(160, mockStorage);
  assert.equal(loadUiScale(mockStorage), 160);
});

test('rescaleDockLayoutForUiScale keeps panels proportional and non-overlapping at 180% across laptop & desktop viewports', () => {
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
