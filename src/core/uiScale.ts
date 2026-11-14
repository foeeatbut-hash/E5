export const UI_SCALE_OPTIONS = [100, 120, 140, 160, 180] as const;

export type UiScalePercent = (typeof UI_SCALE_OPTIONS)[number];

export const DEFAULT_UI_SCALE: UiScalePercent = 100;
export const UI_SCALE_STORAGE_KEY = 'e3promax.uiScale.v1';

export interface ScaledChromeMetrics {
  percent: UiScalePercent;
  factor: number;
  baseFontPx: number;
  row1Height: number;
  row2Height: number;
  ribbonRowHeight: number;
  collapsedHeaderHeight: number;
  collapsedBottomHeight: number;
  collapsedSideRailWidth: number;
  floatingGhostWidth: number;
  floatingGhostHeight: number;
  canvasFooterHeight: number;
  layersPopoverWidth: number;
}

export function normalizeUiScalePercent(raw: unknown): UiScalePercent {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace('%', '').trim());
  if (!Number.isFinite(n)) return DEFAULT_UI_SCALE;
  let best: UiScalePercent = DEFAULT_UI_SCALE;
  let bestDiff = Infinity;
  for (const option of UI_SCALE_OPTIONS) {
    const diff = Math.abs(option - n);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = option;
    }
  }
  return best;
}

export function uiScaleFactor(percent: UiScalePercent): number {
  return normalizeUiScalePercent(percent) / 100;
}

export function scaledPx(basePx: number, percent: UiScalePercent): number {
  return Math.round(basePx * uiScaleFactor(percent));
}

export function getScaledChromeMetrics(percent: UiScalePercent): ScaledChromeMetrics {
  const safePercent = normalizeUiScalePercent(percent);
  const f = safePercent / 100;
  return {
    percent: safePercent,
    factor: f,
    baseFontPx: Math.round(11.5 * f * 100) / 100,
    row1Height: Math.round(28 * f),
    row2Height: Math.round(24 * f),
    ribbonRowHeight: Math.round(74 * f),
    collapsedHeaderHeight: Math.round(24 * f),
    collapsedBottomHeight: Math.round(24 * f),
    collapsedSideRailWidth: Math.round(24 * f),
    floatingGhostWidth: Math.round(280 * f),
    floatingGhostHeight: Math.round(160 * f),
    canvasFooterHeight: Math.round(24 * f),
    layersPopoverWidth: Math.round(332 * f),
  };
}

export function loadUiScale(storage?: Pick<Storage, 'getItem'>): UiScalePercent {
  try {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = store?.getItem(UI_SCALE_STORAGE_KEY);
    if (!raw) return DEFAULT_UI_SCALE;
    return normalizeUiScalePercent(raw);
  } catch {
    return DEFAULT_UI_SCALE;
  }
}

export function saveUiScale(percent: UiScalePercent, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const safe = normalizeUiScalePercent(percent);
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
    store?.setItem(UI_SCALE_STORAGE_KEY, String(safe));
  } catch {
    // ignore storage quota errors
  }
}

export function applyUiScaleToDocument(percent: UiScalePercent, doc?: Document): void {
  const targetDoc = doc || (typeof document !== 'undefined' ? document : undefined);
  if (!targetDoc?.documentElement) return;
  const safe = normalizeUiScalePercent(percent);
  const factor = safe / 100;
  targetDoc.documentElement.style.setProperty('--flux-ui-scale', String(factor));
  targetDoc.documentElement.dataset.uiScale = String(safe);
}
