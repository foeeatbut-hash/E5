import type { E3Sheet } from './e3Types.ts';

export type CanvasViewMode = 'single' | 'all';

export const DEFAULT_CANVAS_VIEW_MODE: CanvasViewMode = 'single';
export const CANVAS_VIEW_MODE_STORAGE_KEY = 'e3promax.canvasViewMode.v1';

/**
 * Zero horizontal gap between consecutive sheets in "all sheets" mode so sheets
 * sit edge-to-edge linearly and dynamically re-index on insert/reorder/resize.
 */
export const ALL_SHEETS_MIN_GAP = 0;
export const ALL_SHEETS_SLOT_STEP_X = ALL_SHEETS_MIN_GAP;
export const ALL_SHEETS_MARGIN = 0;

export interface SheetCanvasSlot {
  sheet: E3Sheet;
  index: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export interface AllSheetsCanvasLayout {
  slots: SheetCanvasSlot[];
  bySheetId: Map<string, SheetCanvasSlot>;
  totalWidth: number;
  totalHeight: number;
}

export interface AllSheetsStripMetrics {
  totalWidth: number;
  totalHeight: number;
  minPanX: number;
  maxPanX: number;
  minPanY: number;
  maxPanY: number;
  scrollLeft: number;
  maxScrollLeft: number;
  scrollProgress: number;
  viewportWorldLeft: number;
  viewportWorldRight: number;
  centerWorldX: number;
  centeredSheetId: string | null;
}

export function normalizeCanvasViewMode(raw: unknown): CanvasViewMode {
  return raw === 'all' ? 'all' : 'single';
}

export function loadCanvasViewMode(
  storage?: Pick<Storage, 'getItem'> | null
): CanvasViewMode {
  const store =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!store) return DEFAULT_CANVAS_VIEW_MODE;
  try {
    return normalizeCanvasViewMode(store.getItem(CANVAS_VIEW_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_CANVAS_VIEW_MODE;
  }
}

export function saveCanvasViewMode(
  mode: CanvasViewMode,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  const store =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!store) return;
  try {
    store.setItem(CANVAS_VIEW_MODE_STORAGE_KEY, normalizeCanvasViewMode(mode));
  } catch {
    // Ignore persistence error
  }
}

/**
 * Re-indexes and places all sheets linearly edge-to-edge (zero gap, zero margin)
 * forming a continuous block strip when inserting, reordering, or resizing sheets.
 */
export function reindexAllSheetsLayout(sheets: E3Sheet[]): AllSheetsCanvasLayout {
  const slots: SheetCanvasSlot[] = [];
  const bySheetId = new Map<string, SheetCanvasSlot>();
  let nextOriginX = ALL_SHEETS_MARGIN;
  let maxRight = sheets.length === 0 ? 1200 : 0;
  let maxBottom = sheets.length === 0 ? 848 : 0;

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const width = Math.max(200, Math.round(sheet.width || 1200));
    const height = Math.max(200, Math.round(sheet.height || 848));
    const originX = i === 0 ? ALL_SHEETS_MARGIN : nextOriginX;
    const originY = ALL_SHEETS_MARGIN;

    const slot: SheetCanvasSlot = {
      sheet,
      index: i,
      originX,
      originY,
      width,
      height,
    };
    slots.push(slot);
    bySheetId.set(sheet.id, slot);

    nextOriginX = originX + width + ALL_SHEETS_MIN_GAP;
    maxRight = Math.max(maxRight, originX + width);
    maxBottom = Math.max(maxBottom, originY + height);
  }

  return {
    slots,
    bySheetId,
    totalWidth: maxRight,
    totalHeight: maxBottom,
  };
}

export function computeAllSheetsLayout(sheets: E3Sheet[]): AllSheetsCanvasLayout {
  return reindexAllSheetsLayout(sheets);
}

export function getSheetCanvasOrigin(
  layout: AllSheetsCanvasLayout,
  sheetId: string | null | undefined,
  mode: CanvasViewMode
): { x: number; y: number } {
  if (mode !== 'all' || !sheetId) return { x: 0, y: 0 };
  const slot = layout.bySheetId.get(sheetId);
  if (!slot) return { x: 0, y: 0 };
  return { x: slot.originX, y: slot.originY };
}

export function findSheetSlotAtCanvasPoint(
  layout: AllSheetsCanvasLayout,
  worldX: number,
  worldY: number,
  topPadding = 0
): SheetCanvasSlot | null {
  for (let i = 0; i < layout.slots.length; i++) {
    const slot = layout.slots[i];
    const isLast = i === layout.slots.length - 1;
    const rightMatch = isLast
      ? worldX <= slot.originX + slot.width
      : worldX < slot.originX + slot.width;
    if (
      worldX >= slot.originX &&
      rightMatch &&
      worldY >= slot.originY - topPadding &&
      worldY <= slot.originY + slot.height
    ) {
      return slot;
    }
  }
  return null;
}

export function computeSheetViewportFitTransform(
  sheet: Pick<E3Sheet, 'width' | 'height'>,
  origin: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  options?: { mode?: CanvasViewMode }
): { zoom: number; pan: { x: number; y: number } } {
  const vw = viewportWidth > 100 ? viewportWidth : 820;
  const vh = viewportHeight > 100 ? viewportHeight : 500;
  const sw = Math.max(200, sheet.width || 1200);
  const sh = Math.max(200, sheet.height || 848);
  const isAllMode = options?.mode === 'all';
  const marginX = isAllMode ? ALL_SHEETS_MARGIN : 24;
  const marginY = isAllMode ? ALL_SHEETS_MARGIN : 18;
  const fitZ = Math.min((vw - marginX) / sw, (vh - marginY) / sh);
  const zoom = Math.min(1.2, Math.max(0.14, Math.floor(fitZ * 1000) / 1000));
  const rawPanX = (vw - sw * zoom) / 2 - origin.x * zoom;
  const rawPanY = (vh - sh * zoom) / 2 - origin.y * zoom;
  if (isAllMode) {
    return {
      zoom,
      pan: {
        x: Math.round(rawPanX * 1000) / 1000,
        y: Math.round(rawPanY * 1000) / 1000,
      },
    };
  }
  const roundedX = Math.round(rawPanX);
  const roundedY = Math.round(rawPanY);
  return {
    zoom,
    pan: {
      x: origin.x === 0 ? Math.max(8, roundedX) : roundedX,
      y: origin.y === 0 ? Math.max(6, roundedY) : roundedY,
    },
  };
}

/**
 * Computes continuous scroll bounds, progress (0..1), and active centered sheet
 * for the seamless zero-margin "All Sheets" infinite strip.
 */
export function computeAllSheetsStripMetrics(
  layout: AllSheetsCanvasLayout,
  pan: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  zoom: number
): AllSheetsStripMetrics {
  const vw = Math.max(100, viewportWidth || 820);
  const vh = Math.max(100, viewportHeight || 500);
  const z = Math.max(0.16, zoom || 0.56);
  const stripW = layout.totalWidth * z;
  const stripH = layout.totalHeight * z;

  // When strip is wider than viewport: pan.x ranges from (vw - stripW) to 0.
  // When narrower: allow smooth centering within viewport bounds.
  const minPanX = stripW > vw ? vw - stripW : Math.min(0, (vw - stripW) / 2);
  const maxPanX = stripW > vw ? 0 : Math.max(0, (vw - stripW) / 2);
  const minPanY = stripH > vh ? vh - stripH : Math.min(0, (vh - stripH) / 2);
  const maxPanY = stripH > vh ? 0 : Math.max(0, (vh - stripH) / 2);

  const maxScrollLeft = Math.max(0, layout.totalWidth - vw / z);
  const viewportWorldLeft = -pan.x / z;
  const viewportWorldRight = (vw - pan.x) / z;
  const scrollLeft = Math.max(0, Math.min(maxScrollLeft, viewportWorldLeft));
  const scrollProgress =
    maxScrollLeft > 1e-3 ? Math.max(0, Math.min(1, scrollLeft / maxScrollLeft)) : 0;

  const centerWorldX = (vw / 2 - pan.x) / z;
  const centerWorldY = (vh / 2 - pan.y) / z;
  const clampedCenterX = Math.max(0, Math.min(layout.totalWidth, centerWorldX));
  const centerSlot =
    findSheetSlotAtCanvasPoint(layout, clampedCenterX, Math.max(0, Math.min(layout.totalHeight, centerWorldY))) ??
    layout.slots.find(
      (s, idx) =>
        clampedCenterX >= s.originX &&
        (idx === layout.slots.length - 1
          ? clampedCenterX <= s.originX + s.width
          : clampedCenterX < s.originX + s.width)
    ) ??
    layout.slots[0] ??
    null;

  return {
    totalWidth: layout.totalWidth,
    totalHeight: layout.totalHeight,
    minPanX,
    maxPanX,
    minPanY,
    maxPanY,
    scrollLeft,
    maxScrollLeft,
    scrollProgress,
    viewportWorldLeft,
    viewportWorldRight,
    centerWorldX,
    centeredSheetId: centerSlot?.sheet.id ?? null,
  };
}

export function clampAllSheetsStripPan(
  layout: AllSheetsCanvasLayout,
  pan: { x: number; y: number },
  viewportWidth: number,
  viewportHeight: number,
  zoom: number
): { x: number; y: number } {
  const m = computeAllSheetsStripMetrics(layout, pan, viewportWidth, viewportHeight, zoom);
  return {
    x: Math.max(m.minPanX, Math.min(m.maxPanX, pan.x)),
    y: Math.max(m.minPanY, Math.min(m.maxPanY, pan.y)),
  };
}

export function computePanForStripProgress(
  layout: AllSheetsCanvasLayout,
  progress: number,
  currentPanY: number,
  viewportWidth: number,
  zoom: number
): { x: number; y: number } {
  const vw = Math.max(100, viewportWidth || 820);
  const z = Math.max(0.16, zoom || 0.56);
  const p = Math.max(0, Math.min(1, progress));
  const maxScrollWorldX = Math.max(0, layout.totalWidth - vw / z);
  const worldLeft = p * maxScrollWorldX;
  return {
    x: -worldLeft * z,
    y: currentPanY,
  };
}
