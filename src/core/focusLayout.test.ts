import assert from 'node:assert/strict';
import test from 'node:test';
import { computeFocusLayoutMetrics, isMinimapEnabled } from './focusLayout.ts';
import { DEFAULT_VISUAL_SETTINGS, createSeedProject } from './e3Seed.ts';
import { parseE3Xml, serializeE3Xml } from './e3Engine.ts';
import { hydrateProjectDefaults } from './sessionStorage.ts';

test('minimap is disabled by default in seed, legacy hydrated projects, and computeFocusLayoutMetrics', () => {
  assert.equal(DEFAULT_VISUAL_SETTINGS.showMinimap, false);
  assert.equal(createSeedProject().visualSettings.showMinimap, false);
  assert.equal(isMinimapEnabled(undefined), false);
  assert.equal(isMinimapEnabled(null), false);
  assert.equal(isMinimapEnabled({}), false);
  assert.equal(isMinimapEnabled({ showMinimap: false }), false);
  assert.equal(isMinimapEnabled({ showMinimap: true }), true);

  // Legacy project JSON lacking showMinimap must open with minimap disabled
  const legacyHydrated = hydrateProjectDefaults({
    id: 'legacy-proj',
    name: 'Legacy',
    visualSettings: { theme: 'light', gridSize: 20 } as unknown as typeof DEFAULT_VISUAL_SETTINGS,
    sheets: [],
  });
  assert.equal(isMinimapEnabled(legacyHydrated.visualSettings), false);

  // XML round-trip defaults to false when omitted and preserves explicit true
  const seed = createSeedProject();
  const xmlDefault = serializeE3Xml(seed);
  assert.equal(isMinimapEnabled(parseE3Xml(xmlDefault).visualSettings), false);
  seed.visualSettings.showMinimap = true;
  const xmlWithMap = serializeE3Xml(seed);
  assert.equal(isMinimapEnabled(parseE3Xml(xmlWithMap).visualSettings), true);
});

test('computeFocusLayoutMetrics maintains strict non-overlapping clearances in default Focus state', () => {
  const m = computeFocusLayoutMetrics({
    viewportWidth: 1440,
    viewportHeight: 900,
    uiScale: 100,
    ribbonOpen: false,
    explorerOpen: false,
    inspectorCollapsed: false,
    consoleOpen: false,
  });

  assert.equal(m.outerPad, 12);
  assert.equal(m.topBarHeight, 34);
  assert.equal(m.bottomBarHeight, 36);
  assert.equal(m.topClearance, 56);
  assert.equal(m.selectionBarTop, m.topClearance);
  assert.equal(m.toolRailTop, m.topClearance);
  assert.equal(m.inspectorTop, m.topClearance);
  assert.equal(m.inspectorBottom, m.bottomDockClearance);
  assert.ok(m.inspectorWidth >= 300);
  assert.ok(m.sheetTabsMaxWidth >= 460);
  assert.equal(m.showMinimap, false);
});

test('expanding Ribbon shifts all top-anchored panels down cleanly without overlap', () => {
  const closed = computeFocusLayoutMetrics({
    viewportWidth: 1440,
    viewportHeight: 900,
    uiScale: 100,
    ribbonOpen: false,
    explorerOpen: true,
    inspectorCollapsed: false,
    consoleOpen: false,
  });

  const open = computeFocusLayoutMetrics({
    viewportWidth: 1440,
    viewportHeight: 900,
    uiScale: 100,
    ribbonOpen: true,
    explorerOpen: true,
    inspectorCollapsed: false,
    consoleOpen: false,
  });

  const ribbonBottom = open.ribbonTop + open.ribbonTotalHeight;
  assert.ok(open.topClearance >= ribbonBottom + open.gutter);
  assert.ok(open.topClearance > closed.topClearance);
  assert.equal(open.toolRailTop, open.topClearance);
  assert.equal(open.explorerTop, open.topClearance);
  assert.equal(open.inspectorTop, open.topClearance);
  assert.equal(open.selectionBarTop, open.topClearance);
});

test('opening Console lifts Inspector, Explorer, and Minimap above Console without collision at 1440x900 and 1280x720', () => {
  for (const [vw, vh] of [
    [1440, 900],
    [1280, 720],
  ] as const) {
    const m = computeFocusLayoutMetrics({
      viewportWidth: vw,
      viewportHeight: vh,
      uiScale: 100,
      ribbonOpen: false,
      explorerOpen: true,
      inspectorCollapsed: false,
      consoleOpen: true,
      showMinimap: true,
    });

    const consoleTopFromBottom = m.consoleBottom + m.consoleHeight;
    assert.ok(m.explorerBottom >= consoleTopFromBottom + m.gutter);
    assert.ok(m.inspectorBottom >= consoleTopFromBottom + m.gutter);
    assert.ok(m.explorerLeft >= m.toolRailLeft + m.toolRailWidth + m.gutter);
    assert.equal(m.minimapBottom, m.explorerBottom);
    assert.ok(m.minimapLeft >= m.explorerLeft + m.explorerWidth + m.gutter);
    assert.ok(m.inspectorMaxHeight >= 200);
    assert.ok(m.commandPillMaxWidth >= 220);

    // Top row center pill bounds remain well clear of left/right pills
    const centerLeft = m.sheetTabsCenterX - m.sheetTabsMaxWidth / 2;
    const centerRight = m.sheetTabsCenterX + m.sheetTabsMaxWidth / 2;
    assert.ok(centerLeft >= m.outerPad + 280 + m.gutter);
    assert.ok(centerRight <= vw - m.outerPad - 480 - m.gutter);
    assert.ok(m.toolRailTop + m.toolRailMaxHeight <= vh - consoleTopFromBottom - m.gutter + 1);
  }
});

test('disabling minimap hides minimap and reclaims bottom space for Explorer and Tool Rail', () => {
  const withMap = computeFocusLayoutMetrics({
    viewportWidth: 1280,
    viewportHeight: 720,
    uiScale: 100,
    ribbonOpen: false,
    explorerOpen: true,
    inspectorCollapsed: false,
    consoleOpen: false,
    showMinimap: true,
  });

  const withoutMap = computeFocusLayoutMetrics({
    viewportWidth: 1280,
    viewportHeight: 720,
    uiScale: 100,
    ribbonOpen: false,
    explorerOpen: true,
    inspectorCollapsed: false,
    consoleOpen: false,
    showMinimap: false,
  });

  assert.equal(withMap.showMinimap, true);
  assert.equal(withoutMap.showMinimap, false);
  assert.ok(withoutMap.explorerBottom < withMap.explorerBottom);
  assert.equal(withoutMap.explorerBottom, withoutMap.bottomDockClearance);
});

test('computeFocusLayoutMetrics preserves non-overlapping top & bottom pills at 150% UI scale and supports panel resize overrides', () => {
  for (const [vw, vh] of [
    [1280, 720],
    [1440, 900],
  ] as const) {
    const m = computeFocusLayoutMetrics({
      viewportWidth: vw,
      viewportHeight: vh,
      uiScale: 150,
      ribbonOpen: false,
      explorerOpen: true,
      inspectorCollapsed: false,
      consoleOpen: false,
    });
    const centerLeft = m.sheetTabsCenterX - m.sheetTabsMaxWidth / 2;
    const centerRight = m.sheetTabsCenterX + m.sheetTabsMaxWidth / 2;
    assert.ok(centerLeft >= m.outerPad + m.leftPillMaxWidth + m.gutter - 1);
    assert.ok(centerRight <= vw - m.outerPad - m.rightPillMaxWidth - m.gutter + 1);
    assert.ok(m.commandPillMaxWidth >= 160);
    assert.ok(vw / 2 + m.commandPillMaxWidth / 2 <= vw - m.outerPad - Math.round(348 * 1.5));
  }

  const expanded = computeFocusLayoutMetrics({
    viewportWidth: 1440,
    viewportHeight: 900,
    uiScale: 100,
    ribbonOpen: false,
    explorerOpen: true,
    inspectorCollapsed: false,
    consoleOpen: true,
    explorerWidthOverride: 620,
    inspectorWidthOverride: 600,
    consoleHeightOverride: 560,
  });
  assert.ok(expanded.explorerWidth >= 560);
  assert.ok(expanded.explorerLeft + expanded.explorerWidth + expanded.inspectorWidth < 1440);
  assert.ok(expanded.consoleHeight >= 520);

  const minimized = computeFocusLayoutMetrics({
    viewportWidth: 1440,
    viewportHeight: 900,
    uiScale: 100,
    ribbonOpen: false,
    explorerOpen: true,
    inspectorCollapsed: false,
    consoleOpen: true,
    explorerWidthOverride: 80,
    inspectorWidthOverride: 80,
    consoleHeightOverride: 40,
  });
  assert.equal(minimized.explorerWidth, 210);
  assert.equal(minimized.inspectorWidth, 210);
  assert.equal(minimized.consoleHeight, 120);
});


