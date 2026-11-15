import { getScaledChromeMetrics, normalizeUiScalePercent, type UiScalePercent } from './uiScale';

export interface FocusLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  uiScale: UiScalePercent;
  ribbonOpen: boolean;
  explorerOpen: boolean;
  inspectorCollapsed: boolean;
  consoleOpen: boolean;
  showMinimap?: boolean;
  railItemCount?: number;
}

export interface FocusLayoutMetrics {
  outerPad: number;
  gutter: number;
  topBarHeight: number;
  ribbonTop: number;
  ribbonTotalHeight: number;
  topClearance: number;
  sheetTabsCenterX: number;
  sheetTabsMaxWidth: number;
  bottomBarHeight: number;
  bottomDockClearance: number;
  commandPillMaxWidth: number;
  toolRailLeft: number;
  toolRailTop: number;
  toolRailWidth: number;
  toolRailMaxHeight: number;
  explorerLeft: number;
  explorerTop: number;
  explorerBottom: number;
  explorerWidth: number;
  inspectorTop: number;
  inspectorRight: number;
  inspectorBottom: number;
  inspectorWidth: number;
  inspectorMaxHeight: number;
  consoleBottom: number;
  consoleLeft: number;
  consoleRight: number;
  consoleHeight: number;
  minimapLeft: number;
  minimapBottom: number;
  minimapWidth: number;
  minimapHeight: number;
  showMinimap: boolean;
  selectionBarTop: number;
}

export function computeFocusLayoutMetrics(input: FocusLayoutInput): FocusLayoutMetrics {
  const vw = Math.max(640, Math.round(input.viewportWidth || 1440));
  const vh = Math.max(480, Math.round(input.viewportHeight || 900));
  const safeScale = normalizeUiScalePercent(input.uiScale);
  const chrome = getScaledChromeMetrics(safeScale);
  const f = chrome.factor;

  const outerPad = 12;
  const gutter = 10;

  const topBarHeight = Math.round(34 * f);
  const ribbonTop = outerPad + topBarHeight + 8;
  const ribbonTabsHeight = chrome.row2Height;
  const ribbonBodyHeight = chrome.ribbonRowHeight;
  const ribbonTotalHeight = input.ribbonOpen ? ribbonTabsHeight + ribbonBodyHeight + 2 : 0;
  const topClearance = input.ribbonOpen
    ? ribbonTop + ribbonTotalHeight + gutter
    : outerPad + topBarHeight + gutter;

  // Reserve asymmetric left/right pill widths and center the sheet-tabs pill cleanly inside the open gap
  const leftPillReserve = Math.round((vw >= 1400 ? 428 : vw >= 1100 ? 292 : 228) * f);
  const rightPillReserve = Math.round((vw >= 1400 ? 500 : vw >= 1100 ? 488 : 380) * f);
  const sheetTabsZoneLeft = outerPad + leftPillReserve + gutter;
  const sheetTabsZoneRight = vw - outerPad - rightPillReserve - gutter;
  const sheetTabsAvailable = Math.max(150, sheetTabsZoneRight - sheetTabsZoneLeft);
  const sheetTabsMaxWidth = Math.min(540, sheetTabsAvailable);
  const sheetTabsCenterX = Math.round((sheetTabsZoneLeft + sheetTabsZoneRight) / 2);

  const bottomBarHeight = Math.round(36 * f);
  const bottomDockClearance = outerPad + bottomBarHeight + gutter;

  const minimapWidth = 112;
  const minimapHeight = 68;

  const consoleHeight = input.consoleOpen
    ? Math.max(176, Math.min(232, Math.round(vh * 0.25)))
    : 0;
  const consoleBottom = bottomDockClearance;
  const consoleLeft = outerPad;
  const consoleRight = outerPad;

  const toolRailWidth = Math.round(40 * f);
  const toolRailLeft = outerPad;
  const toolRailTop = topClearance;

  const explorerLeft = outerPad + toolRailWidth + gutter;
  const explorerTop = topClearance;
  const explorerWidth = Math.min(276, Math.max(224, Math.round(vw * 0.195)));

  const inspectorTop = topClearance;
  const inspectorRight = outerPad;
  const inspectorWidth = Math.min(312, Math.max(264, Math.round(vw * 0.215)));

  const aboveConsoleBottom = consoleBottom + consoleHeight + gutter;
  const inspectorBottom = input.consoleOpen ? aboveConsoleBottom : bottomDockClearance;
  const inspectorMaxHeight = Math.max(200, vh - inspectorTop - inspectorBottom);

  const minimapEnabled = input.showMinimap !== false;
  const minimapBottom = input.consoleOpen ? aboveConsoleBottom : outerPad;
  const minimapLeft = input.consoleOpen
    ? input.explorerOpen
      ? explorerLeft + explorerWidth + gutter
      : outerPad + toolRailWidth + gutter
    : outerPad;

  const unreservedRailMaxHeight = Math.max(
    180,
    vh - toolRailTop - (input.consoleOpen ? aboveConsoleBottom : bottomDockClearance)
  );
  const estRailItems = Math.max(3, input.railItemCount ?? 11);
  const approxRailBottom =
    toolRailTop + Math.min(unreservedRailMaxHeight, Math.round((estRailItems * 30 + 64) * f));

  const hasMinimapWidthRoom = !input.consoleOpen
    ? vw >= 768
    : vw >= (input.explorerOpen ? 980 : 768);
  const minimapTopWhenConsole = vh - minimapBottom - minimapHeight;
  const hasMinimapVerticalRoom = !input.consoleOpen
    ? vh - minimapHeight - outerPad > topClearance + 180
    : minimapTopWhenConsole > topClearance + 40 &&
      (minimapLeft > outerPad + toolRailWidth || minimapTopWhenConsole > approxRailBottom);

  const showMinimap = minimapEnabled && hasMinimapWidthRoom && hasMinimapVerticalRoom;

  const explorerBottom = input.consoleOpen
    ? aboveConsoleBottom
    : showMinimap
      ? outerPad + minimapHeight + gutter
      : bottomDockClearance;

  const toolRailBottomClearance = input.consoleOpen
    ? aboveConsoleBottom
    : !showMinimap || input.explorerOpen
      ? bottomDockClearance
      : outerPad + minimapHeight + gutter;
  const toolRailMaxHeight = Math.max(180, vh - toolRailTop - toolRailBottomClearance);

  // Bottom-center command bar sits cleanly between minimap (when at bottom) and status pill (~340px)
  const leftBottomReserve = !input.consoleOpen && showMinimap ? outerPad + minimapWidth + gutter : outerPad;
  const rightBottomReserve = outerPad + (vw >= 1280 ? 356 : 264) + gutter;
  const commandPillMaxWidth = Math.max(
    220,
    Math.min(430, vw - 2 * Math.max(leftBottomReserve, rightBottomReserve))
  );

  return {
    outerPad,
    gutter,
    topBarHeight,
    ribbonTop,
    ribbonTotalHeight,
    topClearance,
    sheetTabsCenterX,
    sheetTabsMaxWidth,
    bottomBarHeight,
    bottomDockClearance,
    commandPillMaxWidth,
    toolRailLeft,
    toolRailTop,
    toolRailWidth,
    toolRailMaxHeight,
    explorerLeft,
    explorerTop,
    explorerBottom,
    explorerWidth,
    inspectorTop,
    inspectorRight,
    inspectorBottom,
    inspectorWidth,
    inspectorMaxHeight,
    consoleBottom,
    consoleLeft,
    consoleRight,
    consoleHeight,
    minimapLeft,
    minimapBottom,
    minimapWidth,
    minimapHeight,
    showMinimap,
    selectionBarTop: topClearance,
  };
}

