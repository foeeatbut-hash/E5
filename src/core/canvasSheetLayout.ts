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
 * Re-indexes and places all sheets linearly edge-to-edge (zero gap) so inserting,
 * reordering, or resizing any sheet dynamically shifts all subsequent sheets cleanly.
 */
export function reindexAllSheetsLayout(sheets: E3Sheet[]): AllSheetsCanvasLayout {
  const slots: SheetCanvasSlot[] = [];
  const bySheetId = new Map<string, SheetCanvasSlot>();
  let nextOriginX = 0;
  let maxRight = 1200;
  let maxBottom = 848;

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const width = Math.max(200, Math.round(sheet.width || 1200));
    const height = Math.max(200, Math.round(sheet.height || 848));
    const originX = i === 0 ? 0 : nextOriginX;
    const originY = 0;

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
  viewportHeight: number
): { zoom: number; pan: { x: number; y: number } } {
  const vw = viewportWidth > 100 ? viewportWidth : 820;
  const vh = viewportHeight > 100 ? viewportHeight : 500;
  const sw = Math.max(200, sheet.width || 1200);
  const sh = Math.max(200, sheet.height || 848);
  const fitZ = Math.min((vw - 24) / sw, (vh - 18) / sh);
  const zoom = Math.min(1.2, Math.max(0.14, Math.floor(fitZ * 100) / 100));
  const rawPanX = Math.round((vw - sw * zoom) / 2 - origin.x * zoom);
  const rawPanY = Math.round((vh - sh * zoom) / 2 - origin.y * zoom);
  return {
    zoom,
    pan: {
      x: origin.x === 0 ? Math.max(8, rawPanX) : rawPanX,
      y: origin.y === 0 ? Math.max(6, rawPanY) : rawPanY,
    },
  };
}
