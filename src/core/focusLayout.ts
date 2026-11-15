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
  explorerWidthOverride?: number;
  inspectorWidthOverride?: number;
  consoleHeightOverride?: number;
}

export interface FocusLayoutMetrics {
  outerPad: number;
  gutter: number;
  topBarHeight: number;
  ribbonTop: number;
  ribbonTotalHeight: number;
  topClearance: number;
  leftPillMaxWidth: number;
  rightPillMaxWidth: number;
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

  // Proportionally guard left/right/center top pills using effective (scale-normalized) width so 100%..150% never overlap
  const effW = vw / f;
  const rawLeftPill = Math.round((effW >= 1536 ? 408 : effW >= 1100 ? 304 : 230) * f);
  const rawRightPill = Math.round((effW >= 1536 ? 500 : effW >= 1100 ? 484 : 372) * f);
  const minCenterGap = Math.max(220, Math.round(Math.min(360, vw * 0.28)));
  const topHorizontalBudget = Math.max(240, vw - 2 * outerPad - 2 * gutter - minCenterGap);
  let leftPillMaxWidth = rawLeftPill;
  let rightPillMaxWidth = rawRightPill;
  if (leftPillMaxWidth + rightPillMaxWidth > topHorizontalBudget) {
    const ratio = topHorizontalBudget / (leftPillMaxWidth + rightPillMaxWidth);
    leftPillMaxWidth = Math.max(150, Math.floor(leftPillMaxWidth * ratio));
    rightPillMaxWidth = Math.max(180, topHorizontalBudget - leftPillMaxWidth);
  }
  const sheetTabsZoneLeft = outerPad + leftPillMaxWidth + gutter;
  const sheetTabsZoneRight = vw - outerPad - rightPillMaxWidth - gutter;
  const sheetTabsAvailable = Math.max(minCenterGap, sheetTabsZoneRight - sheetTabsZoneLeft);
  const sheetTabsMaxWidth = Math.min(Math.round(760 * Math.min(f, 1.25)), sheetTabsAvailable);
  const sheetTabsCenterX = Math.round((sheetTabsZoneLeft + sheetTabsZoneRight) / 2);

  const bottomBarHeight = Math.round(36 * f);
  const bottomDockClearance = outerPad + bottomBarHeight + gutter;

  const minimapWidth = 112;
  const minimapHeight = 68;

  const consoleMinH = Math.round(120 * Math.min(f, 1.35));
  const consoleMaxH = Math.max(consoleMinH, vh - topClearance - bottomDockClearance - 140);
  const consoleDefaultH = Math.max(
    176,
    Math.min(Math.round(232 * (1 + (f - 1) * 0.35)), Math.round(vh * 0.25 * (1 + (f - 1) * 0.25)))
  );
  const consoleHeight = input.consoleOpen
    ? Math.max(
        consoleMinH,
        Math.min(
          consoleMaxH,
          Math.round(input.consoleHeightOverride ?? consoleDefaultH)
        )
      )
    : 0;
  const consoleBottom = bottomDockClearance;
  const consoleLeft = outerPad;
  const consoleRight = outerPad;

  const toolRailWidth = Math.round(40 * f);
  const toolRailLeft = outerPad;
  const toolRailTop = topClearance;

  const explorerLeft = outerPad + toolRailWidth + gutter;
  const explorerTop = topClearance;
  const explorerMinW = Math.round(210 * Math.min(f, 1.35));
  const inspectorMinW = Math.round(210 * Math.min(f, 1.35));
  const sideClearanceGap = 140;
  const maxExplorerAbsolute = Math.max(explorerMinW + 30, Math.round(vw * 0.56));
  const maxInspectorAbsolute = Math.max(inspectorMinW + 30, Math.round(vw * 0.58));

  const defaultExplorerW = Math.min(
    Math.round(276 * (1 + (f - 1) * 0.3)),
    Math.max(224, Math.round(vw * 0.195))
  );
  const defaultInspectorW = Math.min(
    Math.round(312 * (1 + (f - 1) * 0.3)),
    Math.max(264, Math.round(vw * 0.215))
  );

  const explorerBudget = input.inspectorCollapsed
    ? vw - explorerLeft - outerPad - 80
    : vw - explorerLeft - gutter - sideClearanceGap - inspectorMinW - outerPad;
  const explorerMaxW = Math.max(explorerMinW, Math.min(maxExplorerAbsolute, explorerBudget));
  const explorerWidth = Math.max(
    explorerMinW,
    Math.min(explorerMaxW, Math.round(input.explorerWidthOverride ?? defaultExplorerW))
  );

  const inspectorTop = topClearance;
  const inspectorRight = outerPad;
  const inspectorBudget = input.explorerOpen
    ? vw - (explorerLeft + explorerWidth + gutter + sideClearanceGap) - inspectorRight
    : vw - explorerLeft - inspectorRight - 80;
  const inspectorMaxW = Math.max(inspectorMinW, Math.min(maxInspectorAbsolute, inspectorBudget));
  const inspectorWidth = Math.max(
    inspectorMinW,
    Math.min(inspectorMaxW, Math.round(input.inspectorWidthOverride ?? defaultInspectorW))
  );

  const aboveConsoleBottom = consoleBottom + consoleHeight + gutter;
  const inspectorBottom = input.consoleOpen ? aboveConsoleBottom : bottomDockClearance;
  const inspectorMaxHeight = Math.max(180, vh - inspectorTop - inspectorBottom);

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

  // Bottom-center command bar sits cleanly between minimap and scaled right status pill
  const leftBottomReserve = !input.consoleOpen && showMinimap ? outerPad + minimapWidth + gutter : outerPad;
  const rightBottomReserve = outerPad + Math.round((vw >= 1280 ? 348 : 260) * f) + gutter;
  const commandPillMaxWidth = Math.max(
    160,
    Math.min(Math.round(430 * f), vw - 2 * Math.max(leftBottomReserve, rightBottomReserve))
  );

  return {
    outerPad,
    gutter,
    topBarHeight,
    ribbonTop,
    ribbonTotalHeight,
    topClearance,
    leftPillMaxWidth,
    rightPillMaxWidth,
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

