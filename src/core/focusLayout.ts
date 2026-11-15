import {
  DEFAULT_FOCUS_QUICK_ACCESS_IDS,
  getFocusQuickActionDef,
  type FocusQuickActionId,
} from './focusQuickAccess';
import { getScaledChromeMetrics, normalizeUiScalePercent, type UiScalePercent } from './uiScale';

export function isMinimapEnabled(
  value: boolean | { showMinimap?: boolean } | null | undefined
): boolean {
  if (typeof value === 'boolean') return value === true;
  if (value && typeof value === 'object') return value.showMinimap === true;
  return false;
}

export interface PackToolRailColumnsInput {
  itemIds?: FocusQuickActionId[];
  itemCount?: number;
  uiScale: UiScalePercent;
  maxHeight: number;
  maxWidth?: number;
  hasExplorerButtons?: boolean;
}

export interface PackedToolRailColumns {
  columns: FocusQuickActionId[][];
  columnCount: number;
  width: number;
  btnSize: number;
  overflowGrid: boolean;
  gridCols: number;
}

export function packToolRailColumns(input: PackToolRailColumnsInput): PackedToolRailColumns {
  const safeScale = normalizeUiScalePercent(input.uiScale);
  const f = getScaledChromeMetrics(safeScale).factor;
  const btnSize = Math.round(28 * f);
  const btnStepSize = Math.ceil(28 * f);
  const gapY = 2;
  const dividerH = 5; // h-px (1px) + my-[2px] (4px)
  const padX = 10; // p-[4px] (8px) + border (2px)
  const padY = 10; // p-[4px] (8px) + border (2px)
  const colSeparatorAdvance = 9; // gap-[4px] (4px) + w-px (1px) + gap-[4px] (4px)

  let ids: FocusQuickActionId[];
  if (input.itemIds) {
    ids = input.itemIds;
  } else {
    const count = Math.max(0, Math.round(input.itemCount ?? DEFAULT_FOCUS_QUICK_ACCESS_IDS.length));
    ids = DEFAULT_FOCUS_QUICK_ACCESS_IDS.slice(0, count);
    if (ids.length < count) {
      const extraCount = count - ids.length;
      for (let i = 0; i < extraCount; i++) {
        ids.push(DEFAULT_FOCUS_QUICK_ACCESS_IDS[i % DEFAULT_FOCUS_QUICK_ACCESS_IDS.length]);
      }
    }
  }

  const innerMaxH = Math.max(btnStepSize + 12, Math.floor(input.maxHeight) - padY - 2);
  const hasExplorer = input.hasExplorerButtons ?? true;

  const columns: FocusQuickActionId[][] = [[]];
  let colHeight = hasExplorer ? btnStepSize * 2 + gapY * 2 + dividerH : 0;

  for (const id of ids) {
    const curCol = columns[columns.length - 1];
    const curGroup = getFocusQuickActionDef(id).group;
    const prevIdInCol = curCol.length > 0 ? curCol[curCol.length - 1] : null;
    const prevGroupInCol = prevIdInCol ? getFocusQuickActionDef(prevIdInCol).group : null;
    const hasAboveInCol = curCol.length > 0 || (columns.length === 1 && hasExplorer);
    const needsDivider = prevGroupInCol !== null && prevGroupInCol !== curGroup;
    const stepH =
      (hasAboveInCol ? gapY : 0) +
      (needsDivider ? dividerH + gapY : 0) +
      btnStepSize;

    if (curCol.length > 0 && colHeight + stepH > innerMaxH) {
      columns.push([id]);
      colHeight = btnStepSize;
    } else {
      curCol.push(id);
      colHeight += stepH;
    }
  }

  const columnCount = columns.length;
  const rawWidth =
    padX +
    columnCount * btnSize +
    Math.max(0, columnCount - 1) * colSeparatorAdvance;

  const maxAllowedCols =
    input.maxWidth !== undefined
      ? Math.max(1, Math.floor((input.maxWidth - padX + colSeparatorAdvance) / (btnSize + colSeparatorAdvance)))
      : columnCount;
  const overflowGrid = input.maxWidth !== undefined && columnCount > maxAllowedCols;
  const gridCols = overflowGrid ? maxAllowedCols : columnCount;
  const width = overflowGrid
    ? Math.max(
        Math.round(40 * f),
        padX + gridCols * btnSize + Math.max(0, gridCols - 1) * 4
      )
    : Math.max(Math.round(40 * f), rawWidth);

  return {
    columns,
    columnCount,
    width,
    btnSize,
    overflowGrid,
    gridCols,
  };
}

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
  railItemIds?: FocusQuickActionId[];
  hasRailExplorerButtons?: boolean;
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
  commandPillCenterX: number;
  commandPillMaxWidth: number;
  toolRailLeft: number;
  toolRailTop: number;
  toolRailWidth: number;
  toolRailMaxHeight: number;
  toolRailColumns: FocusQuickActionId[][];
  toolRailColumnCount: number;
  toolRailOverflowGrid: boolean;
  toolRailGridCols: number;
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
  selectionBarCenterX: number;
  selectionBarMaxWidth: number;
  multiViewportTop: number;
  multiViewportLeft: number;
  multiViewportRight: number;
  multiViewportBottom: number;
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
  const rawLeftPill = Math.round((effW >= 1400 ? 418 : effW >= 1200 ? 394 : effW >= 1024 ? 330 : 230) * f);
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

  const aboveConsoleBottom = consoleBottom + consoleHeight + gutter;
  const toolRailLeft = outerPad;
  const toolRailTop = topClearance;
  const minimapEnabled = isMinimapEnabled(input.showMinimap);
  const hasRailExplorer = input.hasRailExplorerButtons ?? true;

  const explorerMinW = Math.round(210 * Math.min(f, 1.35));
  const inspectorMinW = Math.round(210 * Math.min(f, 1.35));
  const rightBudgetReserve = input.inspectorCollapsed
    ? Math.round(110 * f) + gutter
    : inspectorMinW + gutter;
  const explorerBudgetReserve = input.explorerOpen ? explorerMinW + gutter : 0;
  const minCenterReserve = input.explorerOpen ? 100 : 180;
  const maxToolRailWidth = Math.max(
    Math.round(40 * f),
    vw - 2 * outerPad - explorerBudgetReserve - rightBudgetReserve - minCenterReserve
  );

  const minimapLikelyNoConsole =
    minimapEnabled && vw >= 768 && vh - minimapHeight - outerPad > topClearance + 180;
  const preliminaryBottomClearance = input.consoleOpen
    ? aboveConsoleBottom
    : minimapLikelyNoConsole
      ? outerPad + minimapHeight + gutter
      : bottomDockClearance;
  const preliminaryMaxHeight = Math.max(180, vh - toolRailTop - preliminaryBottomClearance);
  let packedRail = packToolRailColumns({
    itemIds: input.railItemIds,
    itemCount: input.railItemCount,
    uiScale: safeScale,
    maxHeight: preliminaryMaxHeight,
    maxWidth: maxToolRailWidth,
    hasExplorerButtons: hasRailExplorer,
  });

  // If 1 column + Explorer open does not touch the bottom-left minimap slot (because Explorer sits right of rail and leaves bottom clearance),
  // we still check if multi-column exceeds single-column width into the minimap zone.
  if (!input.consoleOpen && minimapLikelyNoConsole && input.explorerOpen && packedRail.columnCount === 1) {
    const fullHeightMax = Math.max(180, vh - toolRailTop - bottomDockClearance);
    const fullPacked = packToolRailColumns({
      itemIds: input.railItemIds,
      itemCount: input.railItemCount,
      uiScale: safeScale,
      maxHeight: fullHeightMax,
      maxWidth: maxToolRailWidth,
      hasExplorerButtons: hasRailExplorer,
    });
    if (fullPacked.columnCount === 1) {
      packedRail = fullPacked;
    }
  }

  const toolRailWidth = packedRail.width;
  const toolRailColumns = packedRail.columns;
  const toolRailColumnCount = packedRail.columnCount;

  const explorerLeft = outerPad + toolRailWidth + gutter;
  const explorerTop = topClearance;
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

  const inspectorBottom = input.consoleOpen ? aboveConsoleBottom : bottomDockClearance;
  const inspectorMaxHeight = Math.max(180, vh - inspectorTop - inspectorBottom);

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
  const estRailItems = Math.max(
    3,
    input.railItemIds?.length ?? input.railItemCount ?? DEFAULT_FOCUS_QUICK_ACCESS_IDS.length
  );
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
    : !showMinimap || (input.explorerOpen && toolRailColumnCount === 1)
      ? bottomDockClearance
      : outerPad + minimapHeight + gutter;
  const toolRailMaxHeight = Math.max(180, vh - toolRailTop - toolRailBottomClearance);

  // Re-pack once with final toolRailMaxHeight to stay 100% consistent with returned container maxHeight
  const finalPackedRail = packToolRailColumns({
    itemIds: input.railItemIds,
    itemCount: input.railItemCount,
    uiScale: safeScale,
    maxHeight: toolRailMaxHeight,
    maxWidth: maxToolRailWidth,
    hasExplorerButtons: hasRailExplorer,
  });

  // Bottom-center command bar sits cleanly between minimap (if visible) and scaled right status pill
  const leftBottomEdge = !input.consoleOpen && showMinimap ? outerPad + minimapWidth + gutter : outerPad;
  const estStatusWidth = Math.round((vw >= 1280 ? 405 : 285) * f);
  const rightBottomEdge = vw - outerPad - estStatusWidth - gutter;
  const availableCommandWidth = Math.max(140, rightBottomEdge - leftBottomEdge);
  const preferredCommandWidth = Math.min(Math.round(400 * f), 520);
  const commandPillMaxWidth = Math.max(140, Math.min(preferredCommandWidth, availableCommandWidth));
  const minCmdCenter = leftBottomEdge + commandPillMaxWidth / 2;
  const maxCmdCenter = rightBottomEdge - commandPillMaxWidth / 2;
  const commandPillCenterX = Math.round(Math.max(minCmdCenter, Math.min(maxCmdCenter, vw / 2)));

  const collapsedInspectorWidth = Math.round(110 * f);
  const multiViewportTop = topClearance;
  const multiViewportLeft = input.explorerOpen
    ? explorerLeft + explorerWidth + gutter
    : toolRailLeft + toolRailWidth + gutter;
  const multiViewportRight =
    (input.inspectorCollapsed ? inspectorRight + collapsedInspectorWidth : inspectorRight + inspectorWidth) +
    gutter;
  const multiViewportBottom = input.consoleOpen ? aboveConsoleBottom : bottomDockClearance;
  const selectionBarLeftEdge = multiViewportLeft;
  const selectionBarRightEdge = Math.max(selectionBarLeftEdge + 180, vw - multiViewportRight);
  const selectionBarMaxWidth = Math.max(180, selectionBarRightEdge - selectionBarLeftEdge);
  const selectionBarCenterX = Math.round((selectionBarLeftEdge + selectionBarRightEdge) / 2);

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
    commandPillCenterX,
    commandPillMaxWidth,
    toolRailLeft,
    toolRailTop,
    toolRailWidth,
    toolRailMaxHeight,
    toolRailColumns: finalPackedRail.columns,
    toolRailColumnCount: finalPackedRail.columnCount,
    toolRailOverflowGrid: finalPackedRail.overflowGrid,
    toolRailGridCols: finalPackedRail.gridCols,
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
    selectionBarCenterX,
    selectionBarMaxWidth,
    multiViewportTop,
    multiViewportLeft,
    multiViewportRight,
    multiViewportBottom,
  };
}

