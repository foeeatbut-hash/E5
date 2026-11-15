import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlignStartHorizontal,
  AlignStartVertical,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Crosshair,
  FlipHorizontal2,
  FlipVertical2,
  Grid3X3,
  Hand,
  Layers,
  Lock,
  Magnet,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  RotateCw,
  Ruler,
  Spline,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import {
  countSheetLayerEntities,
  resolveCadLayers,
  summarizeCadLayers,
} from '../core/cadLayers';
import {
  normalizeSelectionBox,
  selectEntitiesInBox,
  type SelectionBox,
} from '../core/cadSelection';
import type {
  CommandLineResolution,
  CommandPaletteItem,
} from '../core/commandPalette';
import { resolveSchematicCssFont } from '../core/e3Catalog';
import { buildGostTableRenderModel } from '../core/gostTables';
import { getSheetRevisionLabel, hasSheetUncommittedChanges } from '../core/sheetRevisions';
import { getSheetPositionInfo } from '../core/sheetTree';
import {
  autoRouteOrthogonal,
  computeWireCrossingArcs,
  computeWireJunctionDots,
  computeWireLabelPositions,
  extractWireSegments,
  getAbsolutePinPos,
  getDeviceBounds,
  getSheetDrawableBounds,
} from '../core/e3Engine';
import {
  type PotentialTraceResult,
  resolveOffPageLinks,
  traceConnectedPotential,
} from '../core/crossSheetRefs';
import { buildGostSheetGeometry, fitStampCellText, type StampFieldKey } from '../core/gostFrame';
import {
  type AlignmentGuide,
  computeSmartSnap,
  type SnapAxisKind,
  type SnapRectEntity,
  type SpacingGuide,
} from '../core/smartSnap';
import {
  buildOrthogonalWireWithWaypoints,
  buildWirePreviewWithWaypoints,
  dragWireSegment,
  extractWireSegmentHandles,
  findWireBreakCandidate,
  isTwoPinBreakEligible,
  type WireBreakCandidate,
  type WirePoint,
} from '../core/wireEditing';
import type {
  AnnotationKind,
  CadLayerId,
  CadLayerStateMap,
  CadTool,
  CatalogItem,
  E3Annotation,
  E3Device,
  E3Project,
  E3Wire,
  PinDirection,
} from '../core/e3Types';
import type { ViewportLayoutMode } from '../core/dockLayout';
import {
  type AllSheetsCanvasLayout,
  type CanvasViewMode,
  computeAllSheetsLayout,
  findSheetSlotAtCanvasPoint,
  getSheetCanvasOrigin,
} from '../core/canvasSheetLayout';
import { computeFocusLayoutMetrics, isMinimapEnabled, type FocusLayoutMetrics } from '../core/focusLayout';
import {
  DEFAULT_FOCUS_QUICK_ACCESS_IDS,
  type FocusQuickActionId,
} from '../core/focusQuickAccess';
import { isNewUiMode, type UiWorkspaceMode } from '../core/uiMode';
import {
  FocusCommandPill,
  FocusStatusPill,
  FocusToolRail,
  useCadCommandBar,
} from './FocusWorkspaceHud';
import { LayerManagerPopover } from './LayerManagerPopover';
import { SchematicSymbol } from './SchematicSymbol';

interface InPlaceEditState {
  kind: 'device' | 'wire' | 'annotation' | 'stamp';
  id: string;
  sheetId: string;
  fieldKey?: StampFieldKey;
  label: string;
  worldX: number;
  worldY: number;
  worldW: number;
  worldH: number;
  multiline: boolean;
  initialValue: string;
  value: string;
}

interface SchematicCanvasProps {
  project: E3Project;
  catalog: CatalogItem[];
  activeSheetId: string;
  openSheetIds?: string[];
  viewportIndex?: number;
  isMultiViewport?: boolean;
  isFocused?: boolean;
  uiMode?: UiWorkspaceMode;
  tool: CadTool;
  zoom: number;
  pan: { x: number; y: number };
  layers?: CadLayerStateMap;
  selectedDeviceId: string | null;
  selectedWireId: string | null;
  selectedAnnotationId: string | null;
  selectedDeviceIds?: string[];
  selectedWireIds?: string[];
  selectedAnnotationIds?: string[];
  onFocusViewport?: () => void;
  onFitViewport?: () => void;
  onSelectSheet: (sheetId: string, opts?: { skipFit?: boolean }) => void;
  onPrevSheet?: () => void;
  onNextSheet?: () => void;
  canPrevSheet?: boolean;
  canNextSheet?: boolean;
  onCloseSheet?: (sheetId: string) => void;
  onAddSheet: () => void;
  canvasFocusActive?: boolean;
  onToggleCanvasFocus?: () => void;
  onSetTool?: (tool: CadTool) => void;
  onSetZoom: (zoom: number) => void;
  onSetPan: (pan: { x: number; y: number }) => void;
  onSetTransform?: (zoom: number, pan: { x: number; y: number }) => void;
  onToggleGrid?: () => void;
  onToggleSnapToGrid?: () => void;
  onToggleSmartGuides?: () => void;
  onToggleCrosshair?: () => void;
  onToggleLayerVisibility?: (layerId: CadLayerId) => void;
  onToggleLayerLock?: (layerId: CadLayerId) => void;
  onShowAllLayers?: () => void;
  onUnlockAllLayers?: () => void;
  onRotateSelected?: () => void;
  onMirrorSelected?: (axis: 'x' | 'y') => void;
  onAlignSelected?: (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  onDuplicateSelected?: () => void;
  onPasteClipboard?: () => void;
  hasClipboard?: boolean;
  onOpenCommandPalette?: () => void;
  onDeleteSelected?: () => void;
  onBeginDrag?: () => void;
  onCommitDrag?: (moved: boolean, opts?: { tryWireBreakDeviceId?: string }) => void;
  onSelectDevice: (deviceId: string | null, opts?: { toggle?: boolean }) => void;
  onSelectWire: (wireId: string | null, opts?: { toggle?: boolean }) => void;
  onSelectAnnotation: (annId: string | null, opts?: { toggle?: boolean }) => void;
  onSetSelection?: (
    next: { deviceIds: string[]; wireIds: string[]; annotationIds: string[] },
    additive?: boolean
  ) => void;
  highlightedTrace?: PotentialTraceResult | null;
  onHighlightPotential?: (seed: { wireId?: string; netName?: string; deviceId?: string; pinId?: string }) => void;
  onClearPotentialHighlight?: () => void;
  onNavigateOffPage?: (device: E3Device) => void;
  onCreateOffPageAt?: (sheetId: string, x: number, y: number) => void;
  onCreateAnnotation: (sheetId: string, kind: AnnotationKind, x: number, y: number) => void;
  onMoveAnnotation: (annId: string, x: number, y: number) => void;
  onMoveDevice: (deviceId: string, x: number, y: number) => void;
  onPreviewWireWaypoints?: (wireId: string, waypoints: WirePoint[]) => void;
  onCreateWire: (
    fromDeviceId: string,
    fromPinId: string,
    toDeviceId: string,
    toPinId: string,
    customWaypoints?: WirePoint[]
  ) => void;
  onDropCatalogItem: (item: CatalogItem, x: number, y: number, sheetId: string) => void;
  onOpenStampEditor?: (sheetId: string, fieldKey?: StampFieldKey) => void;
  onCommitInPlaceDeviceDesignation?: (deviceId: string, nextDesignation: string) => void;
  onCommitInPlaceWireNumber?: (wireId: string, nextWireNumber: string) => void;
  onCommitInPlaceAnnotationText?: (annId: string, nextText: string) => void;
  onCommitInPlaceStampCell?: (sheetId: string, fieldKey: StampFieldKey, nextValue: string) => void;
  commandPaletteItems?: CommandPaletteItem[];
  onExecuteCommandLine?: (rawCommand: string) => CommandLineResolution;
  focusConsoleOpen?: boolean;
  onToggleFocusConsole?: () => void;
  focusExplorerOpen?: boolean;
  onToggleFocusExplorer?: () => void;
  focusLayout?: FocusLayoutMetrics;
  focusQuickAccessIds?: FocusQuickActionId[];
  onExecuteQuickAction?: (id: FocusQuickActionId) => void;
  onRemoveQuickAccess?: (id: FocusQuickActionId) => void;
  onMoveQuickAccess?: (id: FocusQuickActionId, delta: -1 | 1) => void;
  onResetQuickAccess?: () => void;
  onOpenRibbonForQuickAccess?: () => void;
  selectedDeviceCount?: number;
  sheetCount?: number;
  viewportLayout?: ViewportLayoutMode;
  canvasViewMode?: CanvasViewMode;
  onToggleCanvasViewMode?: () => void;
  onActiveCoordsText?: (coordsText: string) => void;
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = React.memo(({
  project,
  catalog,
  activeSheetId,
  openSheetIds,
  viewportIndex = 0,
  isMultiViewport = false,
  isFocused = true,
  uiMode = 'classic',
  tool,
  zoom,
  pan,
  layers,
  selectedDeviceId,
  selectedWireId,
  selectedAnnotationId,
  selectedDeviceIds,
  selectedWireIds,
  selectedAnnotationIds,
  onFocusViewport,
  onFitViewport,
  onSelectSheet,
  onPrevSheet,
  onNextSheet,
  canPrevSheet,
  canNextSheet,
  onCloseSheet,
  onAddSheet,
  canvasFocusActive = false,
  onToggleCanvasFocus,
  onSetTool,
  onSetZoom,
  onSetPan,
  onSetTransform,
  onToggleGrid,
  onToggleSnapToGrid,
  onToggleSmartGuides,
  onToggleCrosshair,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onShowAllLayers,
  onUnlockAllLayers,
  onRotateSelected,
  onMirrorSelected,
  onAlignSelected,
  onDuplicateSelected,
  onPasteClipboard,
  hasClipboard = false,
  onOpenCommandPalette,
  onDeleteSelected,
  onBeginDrag,
  onCommitDrag,
  onSelectDevice,
  onSelectWire,
  onSelectAnnotation,
  onSetSelection,
  highlightedTrace = null,
  onHighlightPotential,
  onClearPotentialHighlight,
  onNavigateOffPage,
  onCreateOffPageAt,
  onCreateAnnotation,
  onMoveAnnotation,
  onMoveDevice,
  onPreviewWireWaypoints,
  onCreateWire,
  onDropCatalogItem,
  onOpenStampEditor,
  onCommitInPlaceDeviceDesignation,
  onCommitInPlaceWireNumber,
  onCommitInPlaceAnnotationText,
  onCommitInPlaceStampCell,
  commandPaletteItems = [],
  onExecuteCommandLine,
  focusConsoleOpen = false,
  onToggleFocusConsole,
  focusExplorerOpen = false,
  onToggleFocusExplorer,
  focusLayout,
  focusQuickAccessIds,
  onExecuteQuickAction,
  onRemoveQuickAccess,
  onMoveQuickAccess,
  onResetQuickAccess,
  onOpenRibbonForQuickAccess,
  selectedDeviceCount = 0,
  sheetCount,
  viewportLayout = 'single',
  canvasViewMode = 'single',
  onToggleCanvasViewMode,
  onActiveCoordsText,
}) => {
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  const onActiveCoordsTextRef = useRef(onActiveCoordsText);
  onActiveCoordsTextRef.current = onActiveCoordsText;
  const resolvedFocusLayout = useMemo(
    () =>
      focusLayout ??
      computeFocusLayoutMetrics({
        viewportWidth: 1440,
        viewportHeight: 900,
        uiScale: 100,
        ribbonOpen: false,
        explorerOpen: focusExplorerOpen,
        inspectorCollapsed: false,
        consoleOpen: focusConsoleOpen,
        showMinimap: isMinimapEnabled(project.visualSettings),
        railItemCount: (focusQuickAccessIds ?? DEFAULT_FOCUS_QUICK_ACCESS_IDS).length,
      }),
    [
      focusLayout,
      focusExplorerOpen,
      focusConsoleOpen,
      project.visualSettings.showMinimap,
      focusQuickAccessIds,
    ]
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasViewportSize, setCanvasViewportSize] = useState<{ width: number; height: number }>({
    width: 1280,
    height: 800,
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = Math.round(el.clientWidth || 0);
      const h = Math.round(el.clientHeight || 0);
      if (w > 0 && h > 0) {
        setCanvasViewportSize((prev) =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h }
        );
      }
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const {
    cmdValue,
    setCmdValue,
    cmdHistIdx,
    setCmdHistIdx,
    setCmdFocused,
    cmdFeedback,
    cmdInputRef,
    matchingCmdHints,
    activeHintIdx,
    setActiveHintIdx,
    hintNavigated,
    setHintNavigated,
    applyOrExecuteHint,
    handleCmdKeyDown,
  } = useCadCommandBar(commandPaletteItems, onExecuteCommandLine);
  const cursorRef = useRef<{
    world: { x: number; y: number };
    screen: { x: number; y: number };
    inside: boolean;
  }>({
    world: { x: 0, y: 0 },
    screen: { x: 0, y: 0 },
    inside: false,
  });
  const crosshairGroupRef = useRef<SVGGElement | null>(null);
  const crossHLeftRef = useRef<SVGLineElement | null>(null);
  const crossHRightRef = useRef<SVGLineElement | null>(null);
  const crossVTopRef = useRef<SVGLineElement | null>(null);
  const crossVBotRef = useRef<SVGLineElement | null>(null);
  const crossRectRef = useRef<SVGRectElement | null>(null);
  const coordsSpanRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!coordsSpanRef.current) return;
    const cur = cursorRef.current;
    coordsSpanRef.current.textContent = `X:${cur.world.x} Y:${cur.world.y}${isMultiViewport ? '' : ' мм'}`;
  }, [isMultiViewport]);
  const hoverRafRef = useRef<number | null>(null);
  const lastBreakKeyRef = useRef<string>('');
  const [rubberBandCursor, setRubberBandCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeSnapHud, setActiveSnapHud] = useState<{
    entityId: string;
    originX?: number;
    originY?: number;
    x: number;
    y: number;
    width: number;
    guides: AlignmentGuide[];
    spacingGuides: SpacingGuide[];
    snappedXKind: SnapAxisKind;
    snappedYKind: SnapAxisKind;
    altBypass: boolean;
  } | null>(null);
  const [layerPopoverOpen, setLayerPopoverOpen] = useState(false);
  const layerBtnRef = useRef<HTMLButtonElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    kind: 'device' | 'wire' | 'canvas';
  } | null>(null);
  const [measureState, setMeasureState] = useState<{
    start: WirePoint;
    end: WirePoint;
    locked: boolean;
  } | null>(null);
  const [wireStart, setWireStart] = useState<{
    sheetId: string;
    deviceId: string;
    pinId: string;
    x: number;
    y: number;
    direction: 'top' | 'right' | 'bottom' | 'left';
  } | null>(null);
  const [wireAnchors, setWireAnchors] = useState<WirePoint[]>([]);
  const [wirePosture, setWirePosture] = useState<'hv' | 'vh'>('hv');
  const [wireBreakPreview, setWireBreakPreview] = useState<WireBreakCandidate | null>(null);
  const [hoveredPin, setHoveredPin] = useState<{
    deviceId: string;
    pinId: string;
    x: number;
    y: number;
    direction: 'top' | 'right' | 'bottom' | 'left';
  } | null>(null);

  const resolvedLayers = useMemo(
    () => resolveCadLayers(layers ?? project.layers, project.visualSettings.showGostFrame),
    [layers, project.layers, project.visualSettings.showGostFrame]
  );
  const layerSummary = useMemo(() => summarizeCadLayers(resolvedLayers), [resolvedLayers]);
  const devicesVisible = resolvedLayers.devices.visible;
  const wiresVisible = resolvedLayers.wires.visible;
  const annotationsVisible = resolvedLayers.annotations.visible;
  const frameVisible = resolvedLayers.frame.visible && project.visualSettings.showGostFrame;
  const devicesLocked = resolvedLayers.devices.locked;
  const wiresLocked = resolvedLayers.wires.locked;
  const annotationsLocked = resolvedLayers.annotations.locked;
  const frameLocked = resolvedLayers.frame.locked;

  useEffect(() => {
    if ((!wiresVisible || wiresLocked) && wireStart) {
      setWireStart(null);
      setWireAnchors([]);
    }
  }, [wiresVisible, wiresLocked, wireStart]);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const liveZoomRef = useRef(zoom);
  const livePanRef = useRef(pan);
  const worldGroupRef = useRef<SVGGElement | null>(null);
  const zoomTextRef = useRef<HTMLSpanElement | null>(null);
  const multiZoomTextRef = useRef<HTMLSpanElement | null>(null);
  const transformRafRef = useRef<number | null>(null);
  const pendingTransformRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const onSetTransformRef = useRef(onSetTransform);
  onSetTransformRef.current = onSetTransform;
  const onSetZoomRef = useRef(onSetZoom);
  onSetZoomRef.current = onSetZoom;
  const onSetPanRef = useRef(onSetPan);
  onSetPanRef.current = onSetPan;

  const [selectionBox, setSelectionBox] = useState<{
    box: SelectionBox;
    originX: number;
    originY: number;
  } | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const altHeldRef = useRef(false);
  altHeldRef.current = altHeld;
  const wireStartRef = useRef(wireStart);
  wireStartRef.current = wireStart;
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);
  const hoveredWireIdRef = useRef<string | null>(null);
  const hoveredPinRef = useRef<typeof hoveredPin>(null);
  const [inPlaceEdit, setInPlaceEdit] = useState<InPlaceEditState | null>(null);
  const inPlaceEditRef = useRef<InPlaceEditState | null>(null);
  inPlaceEditRef.current = inPlaceEdit;
  const inPlaceCancelledRef = useRef<boolean>(false);
  const inPlaceInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const openInPlaceEdit = useCallback((next: InPlaceEditState) => {
    inPlaceCancelledRef.current = false;
    inPlaceEditRef.current = next;
    setInPlaceEdit(next);
  }, []);

  const commitInPlaceEdit = useCallback(() => {
    const curr = inPlaceEditRef.current;
    if (!curr) return;
    inPlaceEditRef.current = null;
    setInPlaceEdit(null);
    if (inPlaceCancelledRef.current) {
      inPlaceCancelledRef.current = false;
      return;
    }
    if (curr.kind === 'device') {
      onCommitInPlaceDeviceDesignation?.(curr.id, curr.value);
    } else if (curr.kind === 'wire') {
      onCommitInPlaceWireNumber?.(curr.id, curr.value);
    } else if (curr.kind === 'annotation') {
      onCommitInPlaceAnnotationText?.(curr.id, curr.value);
    } else if (curr.kind === 'stamp' && curr.fieldKey) {
      onCommitInPlaceStampCell?.(curr.sheetId, curr.fieldKey, curr.value);
    }
  }, [
    onCommitInPlaceDeviceDesignation,
    onCommitInPlaceWireNumber,
    onCommitInPlaceAnnotationText,
    onCommitInPlaceStampCell,
  ]);

  const cancelInPlaceEdit = useCallback(() => {
    inPlaceCancelledRef.current = true;
    inPlaceEditRef.current = null;
    setInPlaceEdit(null);
  }, []);

  const inPlaceTargetKey = inPlaceEdit
    ? `${inPlaceEdit.kind}:${inPlaceEdit.id}:${inPlaceEdit.fieldKey || ''}`
    : '';
  useEffect(() => {
    if (!inPlaceTargetKey) return;
    const raf = window.requestAnimationFrame(() => {
      const el = inPlaceInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [inPlaceTargetKey]);

  const prevActiveSheetIdRef = useRef<string>(activeSheetId);
  useEffect(() => {
    const sheetChanged = prevActiveSheetIdRef.current !== activeSheetId;
    prevActiveSheetIdRef.current = activeSheetId;
    if (sheetChanged && inPlaceEdit && inPlaceEdit.sheetId !== activeSheetId) {
      cancelInPlaceEdit();
    }
  }, [activeSheetId, inPlaceEdit, cancelInPlaceEdit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.altKey) {
        if (!altHeldRef.current) {
          altHeldRef.current = true;
          setAltHeld(true);
          if (hoveredWireIdRef.current) setHoveredWireId(hoveredWireIdRef.current);
          if (hoveredPinRef.current) setHoveredPin(hoveredPinRef.current);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || !e.altKey) {
        if (altHeldRef.current) {
          altHeldRef.current = false;
          setAltHeld(false);
          setHoveredWireId(null);
          if (!wireStartRef.current) setHoveredPin(null);
        }
      }
    };
    const onBlur = () => {
      altHeldRef.current = false;
      setAltHeld(false);
      setHoveredWireId(null);
      if (!wireStartRef.current) setHoveredPin(null);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (hoverRafRef.current) window.cancelAnimationFrame(hoverRafRef.current);
      if (transformRafRef.current) window.cancelAnimationFrame(transformRafRef.current);
      if (wheelCommitTimerRef.current) window.clearTimeout(wheelCommitTimerRef.current);
    };
  }, []);

  const selectedDeviceIdSet = useMemo(() => {
    const s = new Set<string>(selectedDeviceIds || []);
    if (selectedDeviceId) s.add(selectedDeviceId);
    return s;
  }, [selectedDeviceIds, selectedDeviceId]);

  const selectedWireIdSet = useMemo(() => {
    const s = new Set<string>(selectedWireIds || []);
    if (selectedWireId) s.add(selectedWireId);
    return s;
  }, [selectedWireIds, selectedWireId]);

  const selectedAnnotationIdSet = useMemo(() => {
    const s = new Set<string>(selectedAnnotationIds || []);
    if (selectedAnnotationId) s.add(selectedAnnotationId);
    return s;
  }, [selectedAnnotationIds, selectedAnnotationId]);

  const totalSelectedCount =
    selectedDeviceIdSet.size + selectedWireIdSet.size + selectedAnnotationIdSet.size;

  const panJustFinishedRef = useRef<boolean>(false);
  const panWindowCleanupRef = useRef<(() => void) | null>(null);

  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number; moved: boolean }
    | { kind: 'device'; deviceId: string; sheetId: string; sheetOriginX: number; sheetOriginY: number; startWorldX: number; startWorldY: number; origX: number; origY: number; moved: boolean; others: SnapRectEntity[] }
    | { kind: 'annotation'; annId: string; sheetId: string; sheetOriginX: number; sheetOriginY: number; startWorldX: number; startWorldY: number; origX: number; origY: number; moved: boolean; others: SnapRectEntity[] }
    | { kind: 'wireSegment'; wireId: string; sheetId: string; sheetOriginX: number; sheetOriginY: number; segmentIndex: number; origWaypoints: WirePoint[]; moved: boolean }
    | { kind: 'marquee'; sheetId: string; sheetOriginX: number; sheetOriginY: number; startWorldX: number; startWorldY: number; additive: boolean; moved: boolean; currentBox?: SelectionBox }
    | null
  >(null);

  const allSheetsLayout = useMemo<AllSheetsCanvasLayout>(
    () => computeAllSheetsLayout(project.sheets),
    [project.sheets]
  );
  const allSheetsLayoutRef = useRef<AllSheetsCanvasLayout>(allSheetsLayout);
  allSheetsLayoutRef.current = allSheetsLayout;
  const canvasViewModeRef = useRef<CanvasViewMode>(canvasViewMode);
  canvasViewModeRef.current = canvasViewMode;

  const getSheetOrigin = useCallback(
    (sheetId?: string | null) =>
      getSheetCanvasOrigin(allSheetsLayoutRef.current, sheetId, canvasViewModeRef.current),
    []
  );

  const sheet = useMemo(() => {
    if (!isMultiViewport && openSheetIds !== undefined) {
      return activeSheetId ? project.sheets.find((s) => s.id === activeSheetId) : undefined;
    }
    return project.sheets.find((s) => s.id === activeSheetId) || project.sheets[0];
  }, [project.sheets, activeSheetId, isMultiViewport, openSheetIds]);

  const activeSheetOrigin = useMemo(
    () => getSheetCanvasOrigin(allSheetsLayout, sheet?.id, canvasViewMode),
    [allSheetsLayout, sheet?.id, canvasViewMode]
  );

  const renderedSheets = useMemo(() => {
    if (canvasViewMode === 'all') {
      return project.sheets;
    }
    return sheet ? [sheet] : [];
  }, [canvasViewMode, project.sheets, sheet]);

  const openSingleTabs = useMemo(() => {
    if (openSheetIds === undefined) return project.sheets;
    const byId = new Map(project.sheets.map((s) => [s.id, s]));
    return openSheetIds
      .map((id) => byId.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
  }, [openSheetIds, project.sheets]);

  const sheetPosition = useMemo(
    () => getSheetPositionInfo(project.sheets, sheet?.id || activeSheetId),
    [project.sheets, sheet?.id, activeSheetId]
  );
  const resolvedCanPrevSheet = canPrevSheet ?? Boolean(sheetPosition.prevId);
  const resolvedCanNextSheet = canNextSheet ?? Boolean(sheetPosition.nextId);
  const handleStepPrevSheet = () => {
    if (onPrevSheet) onPrevSheet();
    else if (sheetPosition.prevId) onSelectSheet(sheetPosition.prevId);
  };
  const handleStepNextSheet = () => {
    if (onNextSheet) onNextSheet();
    else if (sheetPosition.nextId) onSelectSheet(sheetPosition.nextId);
  };

  const sheetTabsScrollRef = useRef<HTMLDivElement | null>(null);
  const [sheetPickerOpen, setSheetPickerOpen] = useState(false);
  const sheetPickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      const scroller = sheetTabsScrollRef.current;
      if (!scroller || !sheet?.id) return;
      const activeBtn = scroller.querySelector<HTMLElement>(`[data-testid="sheet-tab-${sheet.id}"]`);
      if (activeBtn) {
        activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [sheet?.id, openSingleTabs.length, uiMode]);

  useEffect(() => {
    if (!sheetPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (sheetPickerRef.current && !sheetPickerRef.current.contains(e.target as Node)) {
        setSheetPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetPickerOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [sheetPickerOpen]);

  const sheetLayerCounts = useMemo(
    () => countSheetLayerEntities(project, sheet?.id || ''),
    [project, sheet?.id]
  );

  const sheetDevices = useMemo(
    () => project.devices.filter((d) => d.sheetId === sheet?.id),
    [project.devices, sheet?.id]
  );

  const visibleSheetDevices = useMemo(() => {
    if (sheetDevices.length <= 40) return sheetDevices;
    const vw = canvasViewportSize.width || 1280;
    const vh = canvasViewportSize.height || 800;
    const z = Math.max(0.16, zoom);
    const pad = 320;
    const minX = -pan.x / z - pad;
    const minY = -pan.y / z - pad;
    const maxX = (vw - pan.x) / z + pad;
    const maxY = (vh - pan.y) / z + pad;
    return sheetDevices.filter((d) => {
      if (selectedDeviceIdSet.has(d.id)) return true;
      return d.x + d.width >= minX && d.x <= maxX && d.y + d.height >= minY && d.y <= maxY;
    });
  }, [sheetDevices, zoom, pan, selectedDeviceIdSet, canvasViewportSize]);

  const sheetWires = useMemo(
    () => project.wires.filter((w) => w.sheetId === sheet?.id),
    [project.wires, sheet?.id]
  );

  const sheetAnnotations = useMemo(
    () => (project.annotations || []).filter((a) => a.sheetId === sheet?.id),
    [project.annotations, sheet?.id]
  );

  const connectedPinKeys = useMemo(() => {
    const set = new Set<string>();
    if (!wiresVisible) return set;
    for (const w of sheetWires) {
      set.add(`${w.fromDeviceId}:${w.fromPinId}`);
      set.add(`${w.toDeviceId}:${w.toPinId}`);
    }
    return set;
  }, [sheetWires, wiresVisible]);

  const applyDomTransform = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
    if (worldGroupRef.current) {
      worldGroupRef.current.setAttribute('transform', `translate(${nextPan.x}, ${nextPan.y}) scale(${nextZoom})`);
    }
    const zoomLabel = `${Math.round(nextZoom * 100)}%`;
    if (zoomTextRef.current) zoomTextRef.current.textContent = zoomLabel;
    if (multiZoomTextRef.current) multiZoomTextRef.current.textContent = zoomLabel;
  }, []);

  const scheduleTransformApply = useCallback(
    (nextZoom: number, nextPan: { x: number; y: number }) => {
      liveZoomRef.current = nextZoom;
      livePanRef.current = nextPan;
      pendingTransformRef.current = { zoom: nextZoom, pan: nextPan };
      if (!transformRafRef.current) {
        transformRafRef.current = window.requestAnimationFrame(() => {
          transformRafRef.current = null;
          const pending = pendingTransformRef.current;
          if (pending) {
            pendingTransformRef.current = null;
            applyDomTransform(pending.zoom, pending.pan);
          }
        });
      }
    },
    [applyDomTransform]
  );

  // Sync live transform refs with external React state changes (e.g. Fit View, camera jump, +/- buttons)
  useEffect(() => {
    if (dragRef.current?.kind === 'pan' || wheelCommitTimerRef.current !== null) return;
    liveZoomRef.current = zoom;
    livePanRef.current = pan;
    applyDomTransform(zoom, pan);
  }, [zoom, pan, applyDomTransform]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const lp = livePanRef.current;
    const lz = liveZoomRef.current;
    return {
      x: Math.round((clientX - rect.left - lp.x) / lz),
      y: Math.round((clientY - rect.top - lp.y) / lz),
    };
  };

  const snap = (val: number) => {
    if (!project.visualSettings.snapToGrid) return Math.round(val);
    const g = Math.max(5, project.visualSettings.gridSize);
    return Math.round(val / g) * g;
  };

  const dragMoveRafRef = useRef<number | null>(null);
  const pendingDragSampleRef = useRef<{
    clientX: number;
    clientY: number;
    altKey: boolean;
    world: { x: number; y: number };
  } | null>(null);

  const processDragSampleRef = useRef<
    (sample: { clientX: number; clientY: number; altKey: boolean; world: { x: number; y: number } }) => void
  >(() => {});

  const finishDrag = useCallback(() => {
    if (dragMoveRafRef.current) {
      window.cancelAnimationFrame(dragMoveRafRef.current);
      dragMoveRafRef.current = null;
    }
    const pendingSample = pendingDragSampleRef.current;
    pendingDragSampleRef.current = null;
    if (pendingSample && dragRef.current && dragRef.current.kind !== 'pan') {
      processDragSampleRef.current(pendingSample);
    }

    const d = dragRef.current;
    setActiveSnapHud(null);
    setSelectionBox(null);
    lastBreakKeyRef.current = '';
    setWireBreakPreview(null);
    if (!d) return;
    dragRef.current = null;
    if (d.kind === 'pan') {
      if (panWindowCleanupRef.current) {
        panWindowCleanupRef.current();
        panWindowCleanupRef.current = null;
      }
      if (transformRafRef.current) {
        window.cancelAnimationFrame(transformRafRef.current);
        transformRafRef.current = null;
      }
      if (pendingTransformRef.current) {
        applyDomTransform(pendingTransformRef.current.zoom, pendingTransformRef.current.pan);
        pendingTransformRef.current = null;
      }
      if (d.moved) {
        onSetPanRef.current(livePanRef.current);
        panJustFinishedRef.current = true;
        window.setTimeout(() => {
          panJustFinishedRef.current = false;
        }, 60);
      }
      return;
    }
    if (d.kind === 'device') {
      onCommitDrag?.(d.moved, d.moved ? { tryWireBreakDeviceId: d.deviceId } : undefined);
    } else if (d.kind === 'annotation' || d.kind === 'wireSegment') {
      onCommitDrag?.(d.moved);
    } else if (d.kind === 'marquee') {
      if (d.moved && d.currentBox) {
        const targetDevices = project.devices.filter((dev) => dev.sheetId === d.sheetId);
        const targetWires = project.wires.filter((w) => w.sheetId === d.sheetId);
        const targetAnnotations = (project.annotations || []).filter((a) => a.sheetId === d.sheetId);
        const matched = selectEntitiesInBox(
          targetDevices,
          targetWires,
          targetAnnotations,
          d.currentBox,
          resolvedLayers,
          project.visualSettings.showGostFrame
        );
        if (onSetSelection) {
          onSetSelection(matched, d.additive);
        } else if (matched.deviceIds[0]) {
          onSelectDevice(matched.deviceIds[0]);
        }
      } else if (!d.additive) {
        if (onSetSelection) {
          onSetSelection({ deviceIds: [], wireIds: [], annotationIds: [] }, false);
        } else {
          onSelectDevice(null);
          onSelectWire(null);
          onSelectAnnotation(null);
        }
        onClearPotentialHighlight?.();
      }
    }
  }, [
    applyDomTransform,
    onCommitDrag,
    project.devices,
    project.wires,
    project.annotations,
    resolvedLayers,
    project.visualSettings.showGostFrame,
    onSetSelection,
    onSelectDevice,
    onSelectWire,
    onSelectAnnotation,
    onClearPotentialHighlight,
  ]);

  const startPanDrag = useCallback(
    (clientX: number, clientY: number) => {
      if (panWindowCleanupRef.current) {
        panWindowCleanupRef.current();
        panWindowCleanupRef.current = null;
      }
      if (wheelCommitTimerRef.current) {
        window.clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = null;
      }
      const origPan = livePanRef.current;
      dragRef.current = {
        kind: 'pan',
        startX: clientX,
        startY: clientY,
        origPanX: origPan.x,
        origPanY: origPan.y,
        moved: false,
      };
      const onWinMove = (ev: MouseEvent) => {
        const d = dragRef.current;
        if (!d || d.kind !== 'pan') return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
        scheduleTransformApply(liveZoomRef.current, {
          x: d.origPanX + dx,
          y: d.origPanY + dy,
        });
      };
      const onWinEnd = () => {
        finishDrag();
      };
      window.addEventListener('mousemove', onWinMove);
      window.addEventListener('mouseup', onWinEnd);
      window.addEventListener('blur', onWinEnd);
      panWindowCleanupRef.current = () => {
        window.removeEventListener('mousemove', onWinMove);
        window.removeEventListener('mouseup', onWinEnd);
        window.removeEventListener('blur', onWinEnd);
      };
    },
    [finishDrag, scheduleTransformApply]
  );

  useEffect(() => {
    window.addEventListener('mouseup', finishDrag);
    return () => {
      window.removeEventListener('mouseup', finishDrag);
      if (panWindowCleanupRef.current) {
        panWindowCleanupRef.current();
        panWindowCleanupRef.current = null;
      }
      if (dragMoveRafRef.current) {
        window.cancelAnimationFrame(dragMoveRafRef.current);
        dragMoveRafRef.current = null;
      }
    };
  }, [finishDrag]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && (wireStart || tool === 'wire')) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
          return;
        }
        e.preventDefault();
        setWirePosture((p) => (p === 'hv' ? 'vh' : 'hv'));
        return;
      }
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      if (contextMenu) {
        e.preventDefault();
        setContextMenu(null);
        return;
      }
      if (measureState) {
        e.preventDefault();
        setMeasureState(null);
        return;
      }
      if (wireStart) {
        e.preventDefault();
        setWireStart(null);
        setWireAnchors([]);
      } else if (isFocused && tool !== 'select') {
        e.preventDefault();
        onSetTool?.('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [wireStart, measureState, contextMenu, tool, isFocused, onSetTool]);

  // Cursor-centered non-passive wheel zoom (immediate GPU transform + debounced React state commit)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) === 0 && Math.abs(e.deltaX) === 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const curZoom = liveZoomRef.current;
      const curPan = livePanRef.current;
      const step = e.deltaY < 0 ? 0.1 : -0.1;
      const nextZoom = Math.min(2.5, Math.max(0.16, Math.round((curZoom + step) * 100) / 100));
      if (nextZoom === curZoom) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldX = (sx - curPan.x) / curZoom;
      const worldY = (sy - curPan.y) / curZoom;
      const nextPan = {
        x: Math.round(sx - worldX * nextZoom),
        y: Math.round(sy - worldY * nextZoom),
      };
      scheduleTransformApply(nextZoom, nextPan);
      if (wheelCommitTimerRef.current) {
        window.clearTimeout(wheelCommitTimerRef.current);
      }
      wheelCommitTimerRef.current = window.setTimeout(() => {
        wheelCommitTimerRef.current = null;
        const committedZoom = liveZoomRef.current;
        const committedPan = livePanRef.current;
        if (onSetTransformRef.current) {
          onSetTransformRef.current(committedZoom, committedPan);
        } else {
          onSetZoomRef.current(committedZoom);
          onSetPanRef.current(committedPan);
        }
      }, 90);
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheelNative);
      if (wheelCommitTimerRef.current) {
        window.clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = null;
      }
    };
  }, [scheduleTransformApply]);

  const handleMouseDownBg = (e: React.MouseEvent<SVGSVGElement>) => {
    if (contextMenu) setContextMenu(null);
    if (e.button === 1 || tool === 'pan') {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        onFocusViewport?.();
      }
      startPanDrag(e.clientX, e.clientY);
      return;
    }
    onFocusViewport?.();
    const canvasWorld = toWorld(e.clientX, e.clientY);
    const clickedSlot =
      canvasViewMode === 'all'
        ? findSheetSlotAtCanvasPoint(allSheetsLayoutRef.current, canvasWorld.x, canvasWorld.y, 48)
        : null;
    const activeSlot = sheet ? allSheetsLayoutRef.current.bySheetId.get(sheet.id) ?? null : null;
    const targetSlot = clickedSlot ?? activeSlot;
    const targetSheetId = targetSlot?.sheet.id || sheet?.id || '';
    const targetOrigin =
      canvasViewMode === 'all' && targetSlot
        ? { x: targetSlot.originX, y: targetSlot.originY }
        : { x: 0, y: 0 };
    if (canvasViewMode === 'all' && clickedSlot && clickedSlot.sheet.id !== sheet?.id) {
      onSelectSheet(clickedSlot.sheet.id, { skipFit: true });
    }
    const localWorld = {
      x: canvasWorld.x - targetOrigin.x,
      y: canvasWorld.y - targetOrigin.y,
    };

    if (wireStart) {
      if (e.button === 2) {
        e.preventDefault();
        if (wireAnchors.length > 0) {
          setWireAnchors((prev) => prev.slice(0, -1));
        } else {
          setWireStart(null);
        }
        return;
      }
      if (e.button === 0) {
        const wsOrigin = getSheetOrigin(wireStart.sheetId);
        const wsLocal = {
          x: canvasWorld.x - wsOrigin.x,
          y: canvasWorld.y - wsOrigin.y,
        };
        const anchorPt: WirePoint = {
          x: e.altKey ? wsLocal.x : snap(wsLocal.x),
          y: e.altKey ? wsLocal.y : snap(wsLocal.y),
        };
        setWireAnchors((prev) => [...prev, anchorPt]);
        return;
      }
      setWireStart(null);
      setWireAnchors([]);
      return;
    }
    if ((tool === 'text' || tool === 'rect' || tool === 'callout') && targetSheetId) {
      if (annotationsLocked || !annotationsVisible) return;
      onCreateAnnotation(targetSheetId, tool, snap(localWorld.x), snap(localWorld.y));
      return;
    }
    if (tool === 'offpage' && targetSheetId) {
      if (devicesLocked || !devicesVisible) return;
      onCreateOffPageAt?.(targetSheetId, snap(localWorld.x), snap(localWorld.y));
      return;
    }
    if (tool === 'measure') {
      if (e.button === 2) {
        e.preventDefault();
        setMeasureState(null);
        return;
      }
      if (e.button === 0) {
        const pt = {
          x: e.altKey ? canvasWorld.x : snap(canvasWorld.x),
          y: e.altKey ? canvasWorld.y : snap(canvasWorld.y),
        };
        setMeasureState((prev) => {
          if (!prev || prev.locked) {
            return { start: pt, end: pt, locked: false };
          }
          return { ...prev, end: pt, locked: true };
        });
        return;
      }
    }
    if (tool === 'select' && e.button === 0) {
      setSelectionBox(null);
      dragRef.current = {
        kind: 'marquee',
        sheetId: targetSheetId,
        sheetOriginX: targetOrigin.x,
        sheetOriginY: targetOrigin.y,
        startWorldX: localWorld.x,
        startWorldY: localWorld.y,
        additive: e.shiftKey,
        moved: false,
      };
      return;
    }
    onSelectDevice(null);
    onSelectWire(null);
    onSelectAnnotation(null);
    onClearPotentialHighlight?.();
  };

  const handleSelectDeviceDown = (e: React.MouseEvent, device: E3Device) => {
    if (tool === 'offpage' || tool === 'text' || tool === 'rect' || tool === 'callout') {
      return;
    }
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      startPanDrag(e.clientX, e.clientY);
      return;
    }
    e.stopPropagation();
    onFocusViewport?.();
    if (canvasViewMode === 'all' && device.sheetId !== sheet?.id) {
      onSelectSheet(device.sheetId, { skipFit: true });
    }
    if (tool === 'pan') {
      startPanDrag(e.clientX, e.clientY);
      return;
    }
    if (e.shiftKey) {
      onSelectDevice(device.id, { toggle: true });
      return;
    }
    const alreadyInMulti = selectedDeviceIdSet.has(device.id) && totalSelectedCount > 1;
    if (!alreadyInMulti) {
      onSelectDevice(device.id);
    }
    if (tool === 'select' && !devicesLocked) {
      const origin = getSheetOrigin(device.sheetId);
      const canvasWorld = toWorld(e.clientX, e.clientY);
      const localWorld = { x: canvasWorld.x - origin.x, y: canvasWorld.y - origin.y };
      const others: SnapRectEntity[] = project.devices
        .filter((d) => d.sheetId === device.sheetId && d.id !== device.id && d.bindingState !== 'REMOVED_IN_FLUX')
        .map((d) => ({
          id: d.id,
          designation: d.designation,
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          rotation: d.rotation,
          pins: d.pins,
        }));
      onBeginDrag?.();
      dragRef.current = {
        kind: 'device',
        deviceId: device.id,
        sheetId: device.sheetId,
        sheetOriginX: origin.x,
        sheetOriginY: origin.y,
        startWorldX: localWorld.x,
        startWorldY: localWorld.y,
        origX: device.x,
        origY: device.y,
        moved: false,
        others,
      };
    }
  };

  const handleAnnotationDown = (e: React.MouseEvent, ann: E3Annotation) => {
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      startPanDrag(e.clientX, e.clientY);
      return;
    }
    e.stopPropagation();
    onFocusViewport?.();
    if (canvasViewMode === 'all' && ann.sheetId !== sheet?.id) {
      onSelectSheet(ann.sheetId, { skipFit: true });
    }
    if (tool === 'pan') {
      startPanDrag(e.clientX, e.clientY);
      return;
    }
    if (e.shiftKey) {
      onSelectAnnotation(ann.id, { toggle: true });
      return;
    }
    const alreadyInMulti = selectedAnnotationIdSet.has(ann.id) && totalSelectedCount > 1;
    if (!alreadyInMulti) {
      onSelectAnnotation(ann.id);
    }
    if (annotationsLocked) return;
    const origin = getSheetOrigin(ann.sheetId);
    const canvasWorld = toWorld(e.clientX, e.clientY);
    const localWorld = { x: canvasWorld.x - origin.x, y: canvasWorld.y - origin.y };
    const others: SnapRectEntity[] = [
      ...(devicesVisible
        ? project.devices
            .filter((d) => d.sheetId === ann.sheetId && d.bindingState !== 'REMOVED_IN_FLUX')
            .map((d) => ({
              id: d.id,
              designation: d.designation,
              x: d.x,
              y: d.y,
              width: d.width,
              height: d.height,
            }))
        : []),
      ...(project.annotations || [])
        .filter((a) => a.sheetId === ann.sheetId && a.id !== ann.id)
        .map((a) => ({
          id: a.id,
          designation: a.kind === 'rect' ? 'Зона' : 'Выноска',
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
        })),
    ];
    onBeginDrag?.();
    dragRef.current = {
      kind: 'annotation',
      annId: ann.id,
      sheetId: ann.sheetId,
      sheetOriginX: origin.x,
      sheetOriginY: origin.y,
      startWorldX: localWorld.x,
      startWorldY: localWorld.y,
      origX: ann.x,
      origY: ann.y,
      moved: false,
      others,
    };
  };

  const processDragSample = (sample: {
    clientX: number;
    clientY: number;
    altKey: boolean;
    world: { x: number; y: number };
  }) => {
    const drag = dragRef.current;
    if (!drag || drag.kind === 'pan') return;
    const vsCurr = project.visualSettings;
    const magneticEnabled = vsCurr.smartGuides !== false;
    const snapThresholdWorld = Math.max(8, Math.min(18, Math.round(12 / Math.max(0.35, liveZoomRef.current))));
    const localWorld = {
      x: sample.world.x - drag.sheetOriginX,
      y: sample.world.y - drag.sheetOriginY,
    };
    const targetSheet = project.sheets.find((s) => s.id === drag.sheetId) || sheet;

    if (drag.kind === 'marquee') {
      const box = normalizeSelectionBox(
        { x: drag.startWorldX, y: drag.startWorldY },
        localWorld
      );
      if (box.width >= 4 || box.height >= 4) {
        drag.moved = true;
        drag.currentBox = box;
        setSelectionBox({
          box,
          originX: drag.sheetOriginX,
          originY: drag.sheetOriginY,
        });
      }
    } else if (drag.kind === 'device') {
      const targetDevices = project.devices.filter((d) => d.sheetId === drag.sheetId);
      const targetWires = project.wires.filter((w) => w.sheetId === drag.sheetId);
      const dev = targetDevices.find((d) => d.id === drag.deviceId);
      const rawX = drag.origX + (localWorld.x - drag.startWorldX);
      const rawY = drag.origY + (localWorld.y - drag.startWorldY);
      if (dev) {
        const res = computeSmartSnap(dev, rawX, rawY, drag.others, {
          gridSize: vsCurr.gridSize,
          snapToGrid: vsCurr.snapToGrid,
          magneticSnap: magneticEnabled,
          bypassAllSnap: sample.altKey,
          snapThreshold: snapThresholdWorld,
          sheet: targetSheet,
          wires: wiresVisible ? targetWires : [],
        });
        setActiveSnapHud({
          entityId: dev.id,
          originX: drag.sheetOriginX,
          originY: drag.sheetOriginY,
          x: res.x,
          y: res.y,
          width: dev.width,
          guides: res.guides,
          spacingGuides: res.spacingGuides,
          snappedXKind: res.snappedXKind,
          snappedYKind: res.snappedYKind,
          altBypass: sample.altKey,
        });
        if (res.x !== drag.origX || res.y !== drag.origY) drag.moved = true;
        if (res.x !== dev.x || res.y !== dev.y) {
          onMoveDevice(drag.deviceId, res.x, res.y);
        }
        const alreadyWired =
          !wiresVisible ||
          wiresLocked ||
          targetWires.some((w) => w.fromDeviceId === dev.id || w.toDeviceId === dev.id);
        const nextCand =
          !alreadyWired && isTwoPinBreakEligible(dev)
            ? findWireBreakCandidate({ ...dev, x: res.x, y: res.y }, targetWires)
            : null;
        const candKey = nextCand
          ? `${nextCand.wire.id}:${nextCand.segmentIndex}:${nextCand.projX}:${nextCand.projY}`
          : '';
        if (candKey !== lastBreakKeyRef.current) {
          lastBreakKeyRef.current = candKey;
          setWireBreakPreview(nextCand);
        }
      } else {
        const nx = Math.max(30, snap(rawX));
        const ny = Math.max(30, snap(rawY));
        if (nx !== drag.origX || ny !== drag.origY) drag.moved = true;
        onMoveDevice(drag.deviceId, nx, ny);
        if (lastBreakKeyRef.current !== '') {
          lastBreakKeyRef.current = '';
          setWireBreakPreview(null);
        }
      }
    } else if (drag.kind === 'wireSegment') {
      const nextPts = dragWireSegment(
        drag.origWaypoints,
        drag.segmentIndex,
        localWorld,
        vsCurr.gridSize,
        sample.altKey ? false : vsCurr.snapToGrid
      );
      if (
        nextPts.length !== drag.origWaypoints.length ||
        nextPts.some((p, i) => p.x !== drag.origWaypoints[i]?.x || p.y !== drag.origWaypoints[i]?.y)
      ) {
        drag.moved = true;
      }
      onPreviewWireWaypoints?.(drag.wireId, nextPts);
    } else if (drag.kind === 'annotation') {
      const targetAnnotations = (project.annotations || []).filter((a) => a.sheetId === drag.sheetId);
      const ann = targetAnnotations.find((a) => a.id === drag.annId);
      const rawX = drag.origX + (localWorld.x - drag.startWorldX);
      const rawY = drag.origY + (localWorld.y - drag.startWorldY);
      if (ann) {
        const res = computeSmartSnap(
          { id: ann.id, x: ann.x, y: ann.y, width: ann.width, height: ann.height },
          rawX,
          rawY,
          drag.others,
          {
            gridSize: vsCurr.gridSize,
            snapToGrid: vsCurr.snapToGrid,
            magneticSnap: magneticEnabled,
            bypassAllSnap: sample.altKey,
            snapThreshold: snapThresholdWorld,
            sheet: targetSheet,
          }
        );
        setActiveSnapHud({
          entityId: ann.id,
          originX: drag.sheetOriginX,
          originY: drag.sheetOriginY,
          x: res.x,
          y: res.y,
          width: ann.width,
          guides: res.guides,
          spacingGuides: res.spacingGuides,
          snappedXKind: res.snappedXKind,
          snappedYKind: res.snappedYKind,
          altBypass: sample.altKey,
        });
        if (res.x !== drag.origX || res.y !== drag.origY) drag.moved = true;
        if (res.x !== ann.x || res.y !== ann.y) {
          onMoveAnnotation(drag.annId, res.x, res.y);
        }
      } else {
        const nx = Math.max(20, snap(rawX));
        const ny = Math.max(20, snap(rawY));
        if (nx !== drag.origX || ny !== drag.origY) drag.moved = true;
        onMoveAnnotation(drag.annId, nx, ny);
      }
    }
  };
  processDragSampleRef.current = processDragSample;

  const finishDragRef = useRef(finishDrag);
  finishDragRef.current = finishDrag;

  useEffect(() => {
    const onWinMouseMove = (ev: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.kind === 'pan') return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (
        ev.clientX < rect.left ||
        ev.clientX > rect.right ||
        ev.clientY < rect.top ||
        ev.clientY > rect.bottom
      ) {
        const lp = livePanRef.current;
        const lz = liveZoomRef.current;
        const world = {
          x: Math.round((ev.clientX - rect.left - lp.x) / lz),
          y: Math.round((ev.clientY - rect.top - lp.y) / lz),
        };
        pendingDragSampleRef.current = {
          clientX: ev.clientX,
          clientY: ev.clientY,
          altKey: ev.altKey,
          world,
        };
        if (!dragMoveRafRef.current) {
          dragMoveRafRef.current = window.requestAnimationFrame(() => {
            dragMoveRafRef.current = null;
            const s = pendingDragSampleRef.current;
            pendingDragSampleRef.current = null;
            if (s && dragRef.current) processDragSampleRef.current(s);
          });
        }
      }
    };
    const onWinMouseUp = () => {
      const drag = dragRef.current;
      if (drag && drag.kind !== 'pan') {
        finishDragRef.current();
      }
    };
    window.addEventListener('mousemove', onWinMouseMove);
    window.addEventListener('mouseup', onWinMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWinMouseMove);
      window.removeEventListener('mouseup', onWinMouseUp);
    };
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const lp = livePanRef.current;
    const lz = liveZoomRef.current;
    const world = rect
      ? {
          x: Math.round((e.clientX - rect.left - lp.x) / lz),
          y: Math.round((e.clientY - rect.top - lp.y) / lz),
        }
      : { x: 0, y: 0 };
    const screen = rect
      ? {
          x: Math.round(e.clientX - rect.left),
          y: Math.round(e.clientY - rect.top),
        }
      : { x: 0, y: 0 };
    cursorRef.current = { world, screen, inside: true };

    if (!hoverRafRef.current) {
      hoverRafRef.current = window.requestAnimationFrame(() => {
        hoverRafRef.current = null;
        const cur = cursorRef.current;
        const chEnabled = project.visualSettings.showCrosshair !== false;
        if (containerRef.current) {
          containerRef.current.setAttribute('data-crosshair-active', String(chEnabled && cur.inside));
        }
        let dispX = cur.world.x;
        let dispY = cur.world.y;
        if (canvasViewModeRef.current === 'all') {
          const hoveredSlot = findSheetSlotAtCanvasPoint(allSheetsLayoutRef.current, cur.world.x, cur.world.y);
          if (hoveredSlot) {
            dispX = cur.world.x - hoveredSlot.originX;
            dispY = cur.world.y - hoveredSlot.originY;
          }
        }
        const coordsText = `X:${dispX} Y:${dispY}${isMultiViewport && uiMode !== 'focus' ? '' : ' мм'}`;
        if (coordsSpanRef.current) {
          coordsSpanRef.current.textContent = coordsText;
        }
        if (isFocusedRef.current && onActiveCoordsTextRef.current) {
          onActiveCoordsTextRef.current(coordsText);
        }
        if (crosshairGroupRef.current) {
          const g = crosshairGroupRef.current;
          g.style.display = chEnabled && cur.inside ? '' : 'none';
          g.setAttribute('data-screen-x', String(cur.screen.x));
          g.setAttribute('data-screen-y', String(cur.screen.y));
          g.setAttribute('data-world-x', String(cur.world.x));
          g.setAttribute('data-world-y', String(cur.world.y));
          const sy = String(cur.screen.y + 0.5);
          const sx = String(cur.screen.x + 0.5);
          if (crossHLeftRef.current) {
            crossHLeftRef.current.setAttribute('y1', sy);
            crossHLeftRef.current.setAttribute('y2', sy);
            crossHLeftRef.current.setAttribute('x2', String(Math.max(0, cur.screen.x - 7)));
          }
          if (crossHRightRef.current) {
            crossHRightRef.current.setAttribute('x1', String(cur.screen.x + 7));
            crossHRightRef.current.setAttribute('y1', sy);
            crossHRightRef.current.setAttribute('y2', sy);
          }
          if (crossVTopRef.current) {
            crossVTopRef.current.setAttribute('x1', sx);
            crossVTopRef.current.setAttribute('x2', sx);
            crossVTopRef.current.setAttribute('y2', String(Math.max(0, cur.screen.y - 7)));
          }
          if (crossVBotRef.current) {
            crossVBotRef.current.setAttribute('x1', sx);
            crossVBotRef.current.setAttribute('y1', String(cur.screen.y + 7));
            crossVBotRef.current.setAttribute('x2', sx);
          }
          if (crossRectRef.current) {
            crossRectRef.current.setAttribute('x', String(cur.screen.x - 5));
            crossRectRef.current.setAttribute('y', String(cur.screen.y - 5));
          }
        }
        if (wireStartRef.current) {
          const wsOrigin = getSheetOrigin(wireStartRef.current.sheetId);
          const localCursor = {
            x: cur.world.x - wsOrigin.x,
            y: cur.world.y - wsOrigin.y,
          };
          setRubberBandCursor((prev) =>
            prev.x === localCursor.x && prev.y === localCursor.y ? prev : localCursor
          );
        }
        setMeasureState((prev) => {
          if (!prev || prev.locked) return prev;
          const pt = {
            x: snap(cur.world.x),
            y: snap(cur.world.y),
          };
          if (prev.end.x === pt.x && prev.end.y === pt.y) return prev;
          return { ...prev, end: pt };
        });
      });
    }

    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
      scheduleTransformApply(liveZoomRef.current, {
        x: drag.origPanX + dx,
        y: drag.origPanY + dy,
      });
      return;
    }

    pendingDragSampleRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      altKey: e.altKey,
      world,
    };
    if (!dragMoveRafRef.current) {
      dragMoveRafRef.current = window.requestAnimationFrame(() => {
        dragMoveRafRef.current = null;
        const s = pendingDragSampleRef.current;
        pendingDragSampleRef.current = null;
        if (s && dragRef.current) processDragSampleRef.current(s);
      });
    }
  };

  const handleDoubleClickDesignation = useCallback((_e: React.MouseEvent, dev: E3Device) => {
    if (devicesLocked) return;
    onFocusViewport?.();
    openInPlaceEdit({
      kind: 'device',
      id: dev.id,
      sheetId: dev.sheetId,
      label: `ОУО · ${dev.designation}`,
      worldX: dev.x - 4,
      worldY: dev.y - 26,
      worldW: Math.max(96, dev.designation.length * 9 + 28),
      worldH: 26,
      multiline: false,
      initialValue: dev.designation,
      value: dev.designation,
    });
  }, [devicesLocked, onFocusViewport, openInPlaceEdit]);

  const symbolCbsRef = useRef<{
    onSelectDeviceDown: (e: React.MouseEvent, d: E3Device) => void;
    onPinClick: (e: React.MouseEvent, d: E3Device, pinId: string) => void;
    onDoubleClickDesignation: (e: React.MouseEvent, d: E3Device) => void;
  }>({
    onSelectDeviceDown: () => {},
    onPinClick: () => {},
    onDoubleClickDesignation: () => {},
  });

  const stableSelectDeviceDown = useCallback(
    (e: React.MouseEvent, d: E3Device) => symbolCbsRef.current.onSelectDeviceDown(e, d),
    []
  );
  const stablePinClick = useCallback(
    (e: React.MouseEvent, d: E3Device, pinId: string) => symbolCbsRef.current.onPinClick(e, d, pinId),
    []
  );
  const stableDoubleClickDesignation = useCallback(
    (e: React.MouseEvent, d: E3Device) => symbolCbsRef.current.onDoubleClickDesignation(e, d),
    []
  );

  const handlePinHover = useCallback(
    (device: E3Device, pinId: string | null) => {
      if (!pinId) {
        if (hoveredPinRef.current?.deviceId === device.id) {
          hoveredPinRef.current = null;
        }
        if (wireStartRef.current || altHeldRef.current) {
          setHoveredPin((prev) => (prev && prev.deviceId === device.id ? null : prev));
        }
        return;
      }
      const pin = device.pins.find((p) => p.id === pinId);
      if (!pin) return;
      const abs = getAbsolutePinPos(device, pin);
      const next = {
        deviceId: device.id,
        pinId: pin.id,
        x: abs.x,
        y: abs.y,
        direction: abs.direction,
      };
      hoveredPinRef.current = next;
      if (wireStartRef.current || altHeldRef.current) {
        setHoveredPin(next);
      }
    },
    []
  );

  const handlePinClick = (e: React.MouseEvent, device: E3Device, pinId: string) => {
    e.stopPropagation();
    onFocusViewport?.();
    if (canvasViewMode === 'all' && device.sheetId !== sheet?.id) {
      onSelectSheet(device.sheetId, { skipFit: true });
    }
    if (wiresLocked || !wiresVisible) return;
    const pin = device.pins.find((p) => p.id === pinId);
    if (!pin) return;
    const abs = getAbsolutePinPos(device, pin);

    if (!wireStart || wireStart.sheetId !== device.sheetId) {
      setWireAnchors([]);
      setWireStart({
        sheetId: device.sheetId,
        deviceId: device.id,
        pinId: pin.id,
        x: abs.x,
        y: abs.y,
        direction: abs.direction,
      });
    } else {
      if (wireStart.deviceId === device.id && wireStart.pinId === pin.id) {
        setWireStart(null);
        setWireAnchors([]);
        return;
      }
      const customWaypoints =
        wireAnchors.length > 0
          ? buildOrthogonalWireWithWaypoints(
              { x: wireStart.x, y: wireStart.y, direction: wireStart.direction },
              wireAnchors,
              { x: abs.x, y: abs.y, direction: abs.direction },
              20,
              wirePosture
            )
          : undefined;
      onCreateWire(wireStart.deviceId, wireStart.pinId, device.id, pin.id, customWaypoints);
      setWireStart(null);
      setWireAnchors([]);
      setHoveredPin(null);
    }
  };

  symbolCbsRef.current.onSelectDeviceDown = handleSelectDeviceDown;
  symbolCbsRef.current.onPinClick = handlePinClick;
  symbolCbsRef.current.onDoubleClickDesignation = handleDoubleClickDesignation;

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setWireBreakPreview(null);
    onFocusViewport?.();
    if (devicesLocked || !devicesVisible) return;
    const catId = e.dataTransfer.getData('application/x-flux-catalog-id');
    if (!catId || !sheet) return;
    const item = catalog.find((c) => c.id === catId);
    if (!item) return;
    const world = toWorld(e.clientX, e.clientY);
    const dropSlot =
      canvasViewMode === 'all'
        ? (findSheetSlotAtCanvasPoint(allSheetsLayoutRef.current, world.x, world.y, 48) ??
            allSheetsLayoutRef.current.bySheetId.get(sheet.id))
        : allSheetsLayoutRef.current.bySheetId.get(sheet.id);
    const targetSheet = dropSlot?.sheet || sheet;
    const dropOrigin =
      canvasViewMode === 'all' && dropSlot ? { x: dropSlot.originX, y: dropSlot.originY } : { x: 0, y: 0 };
    if (canvasViewMode === 'all' && targetSheet.id !== sheet.id) {
      onSelectSheet(targetSheet.id, { skipFit: true });
    }
    const rawX = world.x - dropOrigin.x - item.width / 2;
    const rawY = world.y - dropOrigin.y - item.height / 2;
    const targetSheetDevices = project.devices.filter((d) => d.sheetId === targetSheet.id);
    const others: SnapRectEntity[] = (devicesVisible ? targetSheetDevices : [])
      .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX')
      .map((d) => ({
        id: d.id,
        designation: d.designation,
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
        rotation: d.rotation,
        pins: d.pins,
      }));
    const snapped = computeSmartSnap(
      {
        id: '__drop__',
        x: rawX,
        y: rawY,
        width: item.width,
        height: item.height,
        pins: item.pins.map((p, idx) => ({ ...p, id: `drop-${idx}` })),
      },
      rawX,
      rawY,
      others,
      {
        gridSize: project.visualSettings.gridSize,
        snapToGrid: project.visualSettings.snapToGrid,
        magneticSnap: project.visualSettings.smartGuides !== false,
        bypassAllSnap: e.altKey,
        snapThreshold: Math.max(8, Math.min(18, Math.round(12 / Math.max(0.35, zoom)))),
        sheet: targetSheet,
      }
    );
    onDropCatalogItem(item, snapped.x, snapped.y, targetSheet.id);
  };

  const previewWireData = useMemo(() => {
    if (!wireStart) return { points: '', lengthMm: 0, segCount: 0, endPt: null as WirePoint | null };
    const wsSheet = project.sheets.find((s) => s.id === wireStart.sheetId) || sheet;
    const wsDevices = project.devices.filter((d) => d.sheetId === wireStart.sheetId);
    const wsWires = project.wires.filter((w) => w.sheetId === wireStart.sheetId);
    const obstacles = wsDevices
      .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
      .map((d) => getDeviceBounds(d));
    const occupied = wsWires.flatMap((w) => extractWireSegments(w.waypoints, w.netName));
    const sheetBounds = getSheetDrawableBounds(wsSheet);
    const snapTarget =
      hoveredPin && !(hoveredPin.deviceId === wireStart.deviceId && hoveredPin.pinId === wireStart.pinId)
        ? hoveredPin
        : null;
    const dx = rubberBandCursor.x - wireStart.x;
    const dy = rubberBandCursor.y - wireStart.y;
    const inferredDir: PinDirection =
      Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom';
    const targetEndpoint = snapTarget
      ? {
          x: snapTarget.x,
          y: snapTarget.y,
          direction: snapTarget.direction,
          deviceId: snapTarget.deviceId,
        }
      : {
          x: rubberBandCursor.x,
          y: rubberBandCursor.y,
          direction: inferredDir,
        };
    const pts =
      wireAnchors.length > 0
        ? buildWirePreviewWithWaypoints(
            { x: wireStart.x, y: wireStart.y, direction: wireStart.direction },
            wireAnchors,
            targetEndpoint,
            wirePosture
          )
        : autoRouteOrthogonal(
            { x: wireStart.x, y: wireStart.y, direction: wireStart.direction, deviceId: wireStart.deviceId },
            targetEndpoint,
            20,
            obstacles,
            0,
            occupied,
            { sheetBounds, preferPosture: wirePosture }
          );
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return {
      points: pts.map((p) => `${p.x},${p.y}`).join(' '),
      lengthMm: Math.round(len),
      segCount: Math.max(0, pts.length - 1),
      endPt: pts[pts.length - 1] || null,
    };
  }, [wireStart, wireAnchors, wirePosture, hoveredPin, rubberBandCursor, project.sheets, project.devices, project.wires, sheet]);
  const previewWirePoints = previewWireData.points;

  const vs = project.visualSettings;

  const perSheetRenderMap = useMemo(() => {
    const map = new Map<
      string,
      {
        gostGeom: ReturnType<typeof buildGostSheetGeometry>;
        devices: E3Device[];
        visibleDevices: E3Device[];
        wires: E3Wire[];
        annotations: E3Annotation[];
        gostTableAnnotations: E3Annotation[];
        gostTableModels: Map<string, ReturnType<typeof buildGostTableRenderModel>>;
        junctionDots: ReturnType<typeof computeWireJunctionDots>;
        crossingArcsByWireId: Map<string, ReturnType<typeof computeWireCrossingArcs>>;
        wireLabelMap: ReturnType<typeof computeWireLabelPositions>;
        connectedPinKeys: Set<string>;
      }
    >();
    const vw = canvasViewportSize.width || 1280;
    const vh = canvasViewportSize.height || 800;
    const z = Math.max(0.16, zoom);
    const pad = 320;
    const viewMinX = -pan.x / z - pad;
    const viewMinY = -pan.y / z - pad;
    const viewMaxX = (vw - pan.x) / z + pad;
    const viewMaxY = (vh - pan.y) / z + pad;

    for (const curSheet of renderedSheets) {
      const origin = getSheetCanvasOrigin(allSheetsLayout, curSheet.id, canvasViewMode);
      const devices = project.devices.filter((d) => d.sheetId === curSheet.id);
      const visibleDevices =
        devices.length <= 40
          ? devices
          : devices.filter((d) => {
              if (selectedDeviceIdSet.has(d.id)) return true;
              const wx = origin.x + d.x;
              const wy = origin.y + d.y;
              return wx + d.width >= viewMinX && wx <= viewMaxX && wy + d.height >= viewMinY && wy <= viewMaxY;
            });
      const wires = project.wires.filter((w) => w.sheetId === curSheet.id);
      const annotations = (project.annotations || []).filter((a) => a.sheetId === curSheet.id);
      const gostTableAnnotations = annotations.filter(
        (ann) => ann.kind === 'bom_table' || ann.kind === 'cable_table'
      );
      const gostTableModels = new Map<string, ReturnType<typeof buildGostTableRenderModel>>();
      if (annotationsVisible) {
        for (const ann of gostTableAnnotations) {
          gostTableModels.set(ann.id, buildGostTableRenderModel(ann, project));
        }
      }
      const junctionDots = computeWireJunctionDots(wires);
      const crossingArcs =
        vs.wireCrossingBridge !== false ? computeWireCrossingArcs(wires, junctionDots) : [];
      const crossingArcsByWireId = new Map<string, typeof crossingArcs>();
      for (const arc of crossingArcs) {
        let arr = crossingArcsByWireId.get(arc.wireId);
        if (!arr) {
          arr = [];
          crossingArcsByWireId.set(arc.wireId, arr);
        }
        arr.push(arc);
      }
      const wireLabelMap = computeWireLabelPositions(wires, devices);
      const connectedPinKeys = new Set<string>();
      if (wiresVisible) {
        for (const w of wires) {
          connectedPinKeys.add(`${w.fromDeviceId}:${w.fromPinId}`);
          connectedPinKeys.add(`${w.toDeviceId}:${w.toPinId}`);
        }
      }
      map.set(curSheet.id, {
        gostGeom: buildGostSheetGeometry(curSheet, project),
        devices,
        visibleDevices,
        wires,
        annotations,
        gostTableAnnotations,
        gostTableModels,
        junctionDots,
        crossingArcsByWireId,
        wireLabelMap,
        connectedPinKeys,
      });
    }
    return map;
  }, [
    renderedSheets,
    allSheetsLayout,
    canvasViewMode,
    project,
    canvasViewportSize,
    zoom,
    pan,
    selectedDeviceIdSet,
    annotationsVisible,
    wiresVisible,
    vs.wireCrossingBridge,
  ]);

  const offPageLinks = useMemo(() => resolveOffPageLinks(project), [project]);

  const liveHoverTrace = useMemo<PotentialTraceResult | null>(() => {
    if (!altHeld) return null;
    if (hoveredWireId) {
      return traceConnectedPotential(project, { wireId: hoveredWireId });
    }
    if (hoveredPin) {
      return traceConnectedPotential(project, {
        deviceId: hoveredPin.deviceId,
        pinId: hoveredPin.pinId,
      });
    }
    return null;
  }, [altHeld, hoveredWireId, hoveredPin, project]);

  const activeTrace = useMemo<PotentialTraceResult | null>(() => {
    if (liveHoverTrace && (liveHoverTrace.wireIds.length > 0 || liveHoverTrace.offPageDeviceIds.length > 0)) {
      return liveHoverTrace;
    }
    if (highlightedTrace && (highlightedTrace.wireIds.length > 0 || highlightedTrace.offPageDeviceIds.length > 0)) {
      return highlightedTrace;
    }
    return null;
  }, [liveHoverTrace, highlightedTrace]);

  const tracedWireIdSet = useMemo(() => new Set(activeTrace?.wireIds || []), [activeTrace]);
  const tracedPinKeySet = useMemo(() => new Set(activeTrace?.pinKeys || []), [activeTrace]);
  const tracedOffPageIdSet = useMemo(() => new Set(activeTrace?.offPageDeviceIds || []), [activeTrace]);

  const frameSw = Math.max(0.5, vs.frameStrokeWidth ?? 1.6);
  const frameThinSw = Math.max(0.35, Number((frameSw * 0.44).toFixed(2)));
  const stampThickSw = Math.max(0.6, Number((frameSw * 0.88).toFixed(2)));
  const stampThinSw = Math.max(0.35, Number((frameSw * 0.47).toFixed(2)));
  const fontCss = resolveSchematicCssFont(vs.fontFamily);
  const activeSvgKey = sheet?.id || activeSheetId;
  const svgMountKey = canvasViewMode === 'all' ? `all-sheets-vp-${viewportIndex}` : activeSvgKey;
  const gridPatternId = `flux-cad-grid-vp-${viewportIndex}-${svgMountKey}`;

  const isDrawingTool =
    tool === 'wire' || tool === 'text' || tool === 'rect' || tool === 'callout' || tool === 'offpage';

  return (
    <section
      aria-label={`Рабочий холст электросхемы ${viewportIndex + 1}`}
      data-testid={`viewport-pane-${viewportIndex}`}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          return;
        }
        onFocusViewport?.();
      }}
      onAuxClickCapture={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className={`flex-1 w-full h-full min-w-0 min-h-0 flex flex-col bg-[var(--flux-canvas-bg)] relative ${
        isMultiViewport
          ? `border rounded-lg overflow-visible ${
              isFocused ? 'z-10 border-[var(--flux-accent)] ring-1 ring-[var(--flux-accent)]/40' : 'border-[var(--flux-line)]'
            }`
          : ''
      }`}
    >
      {/* Sheet Tabs Bar (single) OR Compact Viewport Header (multi-viewport) */}
      {isMultiViewport ? (
        <div
          className={`no-print min-h-[calc(24px*var(--flux-ui-scale))] py-0.5 shrink-0 border-b border-[var(--flux-line)] flux-glass-bar px-2 flex items-center justify-between gap-2 relative rounded-t-lg ${
            layerPopoverOpen ? 'z-30' : 'z-20'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span
              className={`font-mono text-[length:calc(10px*var(--flux-ui-scale))] px-1.5 py-[1px] rounded-[2px] shrink-0 ${
                isFocused
                  ? 'bg-[var(--flux-accent-solid)] text-white font-semibold'
                  : 'bg-[var(--flux-surface)] text-[var(--flux-text-muted)] border border-[var(--flux-line)]'
              }`}
            >
              В{viewportIndex + 1}
            </span>
            <select
              aria-label={`Лист для окна ${viewportIndex + 1}`}
              value={sheet?.id || ''}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onChange={(e) => {
                onFocusViewport?.();
                onSelectSheet(e.target.value);
                e.currentTarget.blur();
              }}
              className="min-w-0 flex-1 h-[calc(19px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] max-w-[calc(230px*var(--flux-ui-scale))] truncate"
            >
              {project.sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  Лист {s.number}: {s.name} ({getSheetRevisionLabel(s)}{hasSheetUncommittedChanges(project, s) ? '*' : ''} · {s.format})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-[length:calc(10px*var(--flux-ui-scale))] font-mono tabular-nums text-[var(--flux-text-muted)]">
            <div className="relative font-sans">
              <button
                ref={layerBtnRef}
                type="button"
                data-testid={viewportIndex === 0 ? 'canvas-layers-btn' : `canvas-layers-btn-${viewportIndex}`}
                onClick={() => {
                  onFocusViewport?.();
                  setLayerPopoverOpen((o) => !o);
                }}
                aria-expanded={layerPopoverOpen}
                title="Слои чертежа (видимость и блокировка)"
                className={`inline-flex items-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border text-[length:calc(10px*var(--flux-ui-scale))] font-medium transition-colors ${
                  layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0
                    ? 'border-[var(--flux-accent)] bg-[var(--flux-sel)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                }`}
              >
                <Layers className={`w-3 h-3 ${layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0 ? 'text-[var(--flux-accent)]' : ''}`} />
                <span>Слои</span>
              </button>
              {onToggleLayerVisibility && onToggleLayerLock && (
                <LayerManagerPopover
                  open={layerPopoverOpen}
                  layers={resolvedLayers}
                  entityCounts={sheetLayerCounts}
                  align={viewportIndex === 0 ? 'left' : 'right'}
                  anchorRef={layerBtnRef}
                  onClose={() => setLayerPopoverOpen(false)}
                  onToggleVisibility={onToggleLayerVisibility}
                  onToggleLock={onToggleLayerLock}
                  onShowAll={() => onShowAllLayers?.()}
                  onUnlockAll={() => onUnlockAllLayers?.()}
                />
              )}
            </div>
            <span ref={multiZoomTextRef} className="inline-block w-9 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
            <span className="inline-block min-w-[calc(40px*var(--flux-ui-scale))] text-right tabular-nums">Эл:{sheetDevices.length}</span>
            {onFitViewport && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusViewport?.();
                  onFitViewport();
                }}
                title="Вписать лист в это окно"
                aria-label="По размеру окна"
                className="inline-flex items-center justify-center w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] rounded-[2px] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ) : uiMode === 'focus' ? null : (
        <div className="no-print @container/sheethdr h-6 shrink-0 border-b border-[var(--flux-line)] flux-glass-bar pr-1.5 flex items-center justify-between gap-2 relative z-20">
          <div className="flex items-center min-w-0 flex-1 overflow-visible h-full">
            <div className="flex items-center gap-0.5 px-1 h-full border-r border-[var(--flux-line)] shrink-0">
              <button
                type="button"
                data-testid="sheet-prev-btn"
                onClick={handleStepPrevSheet}
                disabled={!resolvedCanPrevSheet}
                title="Предыдущий лист"
                aria-label="Предыдущий лист"
                className="inline-flex items-center justify-center w-4 h-4 rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                data-testid="sheet-next-btn"
                onClick={handleStepNextSheet}
                disabled={!resolvedCanNextSheet}
                title="Следующий лист"
                aria-label="Следующий лист"
                className="inline-flex items-center justify-center w-4 h-4 rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
              <div ref={sheetPickerRef} className="relative">
                <button
                  type="button"
                  data-testid="sheet-picker-btn"
                  onClick={() => setSheetPickerOpen((o) => !o)}
                  title="Все листы проекта (быстрый переход)"
                  aria-expanded={sheetPickerOpen}
                  className="inline-flex items-center gap-0.5 h-4 px-1 rounded-[2px] font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
                >
                  <span>
                    {Math.max(1, sheetPosition.index + 1)}/{Math.max(1, sheetPosition.total)}
                  </span>
                  <ChevronDown className="w-2.5 h-2.5 opacity-70" />
                </button>
                {sheetPickerOpen && (
                  <div
                    data-testid="sheet-picker-popover"
                    className="absolute left-0 top-full mt-1 z-50 w-60 max-h-64 overflow-y-auto rounded-lg border border-[var(--flux-line-strong)] flux-glass-popover shadow-xl py-1"
                  >
                    {project.sheets.map((ps) => {
                      const isCur = ps.id === sheet?.id;
                      return (
                        <button
                          key={ps.id}
                          type="button"
                          onClick={() => {
                            onSelectSheet(ps.id);
                            setSheetPickerOpen(false);
                          }}
                          className={`w-full px-2.5 py-1 text-left flex items-center justify-between gap-2 text-[length:calc(11px*var(--flux-ui-scale))] transition-colors ${
                            isCur
                              ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-semibold'
                              : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                          }`}
                        >
                          <span className="truncate">
                            {ps.number}. {ps.name}
                          </span>
                          <span className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                            {ps.folder ? `${ps.folder} · ` : ''}{ps.format}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div
              ref={sheetTabsScrollRef}
              onWheel={(e) => {
                if (Math.abs(e.deltaY) > 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
              className="flex items-center min-w-0 overflow-x-auto no-scrollbar h-full divide-x divide-[var(--flux-line)] border-r border-[var(--flux-line)]"
            >
              {openSingleTabs.map((s) => {
                const active = s.id === sheet?.id;
                return (
                  <div
                    key={s.id}
                    data-testid={`sheet-tab-wrap-${s.id}`}
                    className={`group/tab relative h-full inline-flex items-stretch shrink-0 border-t-2 transition-colors ${
                      active
                        ? 'bg-[var(--flux-surface)]/85 border-t-[var(--flux-accent)] text-[var(--flux-text)]'
                        : 'bg-transparent border-t-transparent text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                    }`}
                  >
                    <button
                      type="button"
                      data-testid={`sheet-tab-${s.id}`}
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          e.stopPropagation();
                        }
                      }}
                      onClick={(e) => {
                        if (e.button !== 0 || panJustFinishedRef.current || (e.buttons & 4) !== 0) return;
                        onSelectSheet(s.id);
                      }}
                      title={`Лист ${s.number}: ${s.name} (${s.format})`}
                      className={`h-full pl-2 ${onCloseSheet ? 'pr-1' : 'pr-2'} max-w-[calc(186px*var(--flux-ui-scale))] text-[length:calc(11px*var(--flux-ui-scale))] whitespace-nowrap shrink-0 flex items-center gap-1 ${
                        active ? 'font-semibold' : 'font-medium'
                      }`}
                    >
                      <span className="truncate">
                        Лист {s.number}: {s.name}
                      </span>
                      <span
                        data-testid={`sheet-tab-rev-${s.id}`}
                        className={`font-mono tabular-nums text-[length:calc(9.5px*var(--flux-ui-scale))] shrink-0 ${
                          active
                            ? 'text-[var(--flux-accent)] font-semibold'
                            : 'text-[var(--flux-text-muted)]'
                        }`}
                      >
                        {getSheetRevisionLabel(s)}
                        {hasSheetUncommittedChanges(project, s) ? '*' : ''}
                      </span>
                    </button>
                    {onCloseSheet && (
                      <button
                        type="button"
                        data-testid={`close-sheet-tab-${s.id}`}
                        aria-label={`Закрыть вкладку ${s.name}`}
                        title="Закрыть лист с панели вкладок (лист останется в дереве проекта)"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseSheet(s.id);
                        }}
                        className="inline-flex items-center justify-center w-4 h-4 my-auto mr-0.5 rounded-[2px] text-[var(--flux-text-muted)] opacity-70 group-hover/tab:opacity-100 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[var(--flux-hover)] transition-colors shrink-0"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              data-testid="sheet-add-btn"
              onClick={onAddSheet}
              aria-label="Добавить новый лист схемы"
              className="inline-flex items-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 ml-1 rounded-[2px] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] whitespace-nowrap shrink-0 border border-transparent hover:border-[var(--flux-line)]"
            >
              <Plus className="w-3 h-3" />
              <span>Лист</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
            <span className="hidden @[780px]/sheethdr:inline-block min-w-[calc(52px*var(--flux-ui-scale))] font-mono tabular-nums">Эл.: {sheetDevices.length}</span>
            <span className="hidden @[780px]/sheethdr:inline-block min-w-[calc(66px*var(--flux-ui-scale))] font-mono tabular-nums">Связи: {sheetWires.length}</span>

            {onToggleCanvasViewMode && (
              <button
                type="button"
                data-testid="canvas-view-mode-toggle"
                aria-pressed={canvasViewMode === 'all'}
                onClick={() => {
                  onFocusViewport?.();
                  onToggleCanvasViewMode();
                }}
                title={
                  canvasViewMode === 'all'
                    ? 'Режим «Все листы» — переключить на 1 активный лист'
                    : 'Режим «1 лист» — показать все листы проекта на одном холсте'
                }
                className={`inline-flex items-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  canvasViewMode === 'all'
                    ? 'border-[var(--flux-accent)] bg-[var(--flux-sel)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                }`}
              >
                <Columns2 className={`w-3 h-3 shrink-0 ${canvasViewMode === 'all' ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'}`} />
                <span>{canvasViewMode === 'all' ? 'Все листы' : '1 лист'}</span>
              </button>
            )}

            <div className="relative">
              <button
                ref={layerBtnRef}
                type="button"
                data-testid={viewportIndex === 0 ? 'canvas-layers-btn' : `canvas-layers-btn-${viewportIndex}`}
                onClick={() => {
                  onFocusViewport?.();
                  setLayerPopoverOpen((o) => !o);
                }}
                aria-expanded={layerPopoverOpen}
                title="Диспетчер слоёв чертежа (видимость и блокировка)"
                className={`inline-flex items-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0
                    ? 'border-[var(--flux-accent)] bg-[var(--flux-sel)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                }`}
              >
                <Layers className={`w-3 h-3 shrink-0 ${layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0 ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'}`} />
                <span>Слои</span>
                <span className="font-mono tabular-nums text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                  {layerSummary.visibleCount}/{layerSummary.total}
                </span>
                {layerSummary.lockedCount > 0 && (
                  <Lock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
              </button>
              {onToggleLayerVisibility && onToggleLayerLock && (
                <LayerManagerPopover
                  open={layerPopoverOpen}
                  layers={resolvedLayers}
                  entityCounts={sheetLayerCounts}
                  anchorRef={layerBtnRef}
                  onClose={() => setLayerPopoverOpen(false)}
                  onToggleVisibility={onToggleLayerVisibility}
                  onToggleLock={onToggleLayerLock}
                  onShowAll={() => onShowAllLayers?.()}
                  onUnlockAll={() => onUnlockAllLayers?.()}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interactive SVG Viewport */}
      <div
        ref={containerRef}
        data-testid={viewportIndex === 0 ? 'schematic-canvas' : `schematic-canvas-${viewportIndex}`}
        data-crosshair-enabled={String(vs.showCrosshair !== false)}
        data-crosshair-active="false"
        data-layer-devices-visible={String(devicesVisible)}
        data-layer-wires-visible={String(wiresVisible)}
        data-layer-annotations-visible={String(annotationsVisible)}
        data-layer-frame-visible={String(frameVisible)}
        data-layer-devices-locked={String(devicesLocked)}
        data-layer-wires-locked={String(wiresLocked)}
        data-layer-annotations-locked={String(annotationsLocked)}
        data-layer-frame-locked={String(frameLocked)}
        onMouseDownCapture={(e) => {
          if (e.button === 1) {
            const target = e.target as HTMLElement | null;
            if (target?.closest('[data-testid="inplace-text-editor"], [data-testid="potential-trace-hud"]')) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            e.preventDefault();
            e.stopPropagation();
            startPanDrag(e.clientX, e.clientY);
          }
        }}
        onClickCapture={(e) => {
          if (e.button !== 0 || panJustFinishedRef.current || (e.buttons & 4) !== 0) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onAuxClickCapture={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onMouseLeave={() => {
          if (hoverRafRef.current) {
            window.cancelAnimationFrame(hoverRafRef.current);
            hoverRafRef.current = null;
          }
          cursorRef.current.inside = false;
          if (containerRef.current) {
            containerRef.current.setAttribute('data-crosshair-active', 'false');
          }
          if (crosshairGroupRef.current) {
            crosshairGroupRef.current.style.display = 'none';
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (
            !devicesLocked &&
            devicesVisible &&
            !wiresLocked &&
            wiresVisible &&
            sheet &&
            e.dataTransfer.types.includes('application/x-flux-2pin')
          ) {
            const world = toWorld(e.clientX, e.clientY);
            const dragSlot =
              canvasViewMode === 'all'
                ? (findSheetSlotAtCanvasPoint(allSheetsLayoutRef.current, world.x, world.y, 48) ??
                    allSheetsLayoutRef.current.bySheetId.get(sheet.id))
                : allSheetsLayoutRef.current.bySheetId.get(sheet.id);
            const dragSheet = dragSlot?.sheet || sheet;
            const dragOrigin =
              canvasViewMode === 'all' && dragSlot
                ? { x: dragSlot.originX, y: dragSlot.originY }
                : { x: 0, y: 0 };
            const dragSheetWires = project.wires.filter((w) => w.sheetId === dragSheet.id);
            const virtualDev = {
              id: '__drag_2pin__',
              sheetId: dragSheet.id,
              x: world.x - dragOrigin.x - 30,
              y: world.y - dragOrigin.y - 40,
              width: 60,
              height: 80,
              category: 'breaker' as const,
              pins: [
                { id: 'p1', name: '1', dx: 30, dy: 0, direction: 'top' as const, signalType: 'power' as const },
                { id: 'p2', name: '2', dx: 30, dy: 80, direction: 'bottom' as const, signalType: 'power' as const },
              ],
            };
            const nextCand = findWireBreakCandidate(virtualDev, dragSheetWires);
            const candKey = nextCand
              ? `${nextCand.wire.id}:${nextCand.segmentIndex}:${nextCand.projX}:${nextCand.projY}`
              : '';
            if (candKey !== lastBreakKeyRef.current) {
              lastBreakKeyRef.current = candKey;
              setWireBreakPreview(nextCand);
            }
          } else if (lastBreakKeyRef.current !== '') {
            lastBreakKeyRef.current = '';
            setWireBreakPreview(null);
          }
        }}
        onDragLeave={() => {
          if (lastBreakKeyRef.current !== '') {
            lastBreakKeyRef.current = '';
            setWireBreakPreview(null);
          }
        }}
        onDrop={handleDrop}
        className={`flex-1 min-h-0 overflow-hidden relative ${isMultiViewport ? 'rounded-b-lg' : ''}`}
        style={{
          cursor:
            tool === 'pan'
              ? 'grab'
              : (tool === 'wire' && (wiresLocked || !wiresVisible)) ||
                  ((tool === 'text' || tool === 'rect' || tool === 'callout') &&
                    (annotationsLocked || !annotationsVisible))
                ? 'not-allowed'
                : wireStart || isDrawingTool || vs.showCrosshair !== false
                  ? 'crosshair'
                  : 'default',
        }}
      >
        {!sheet ? (
          <div
            data-testid="canvas-no-sheet-empty"
            className="absolute inset-0 flex items-center justify-center p-6 select-none"
          >
            <div className="max-w-md w-full rounded-2xl border border-[var(--flux-line-strong)] flux-glass-panel p-5 space-y-3.5 text-center shadow-lg">
              <div className="space-y-1">
                <div className="text-[length:calc(13px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                  Нет открытых листов на холсте
                </div>
                <p className="text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] leading-relaxed">
                  Все листы остаются в проекте — выберите нужный ниже или в левом дереве «Проект и База».
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5 max-h-44 overflow-y-auto py-1">
                {project.sheets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`empty-open-sheet-${s.id}`}
                    onClick={() => onSelectSheet(s.id)}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:border-[var(--flux-accent)] hover:bg-[var(--flux-sel)] text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] transition-colors"
                  >
                    <span className="font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-accent)]">Л.{s.number}</span>
                    <span className="truncate max-w-[calc(180px*var(--flux-ui-scale))]">{s.name}</span>
                  </button>
                ))}
              </div>
              <div className="pt-1 flex justify-center">
                <button
                  type="button"
                  data-testid="empty-add-sheet-btn"
                  onClick={onAddSheet}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Создать новый лист</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
        <AnimatePresence mode="sync" initial={false}>
        <motion.svg
          key={svgMountKey}
          data-sheet-svg={svgMountKey}
          data-canvas-view-mode={canvasViewMode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, pointerEvents: 'none' }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: 'opacity' }}
          width="100%"
          height="100%"
          onMouseDown={handleMouseDownBg}
          onMouseMove={handleMouseMove}
          onMouseUp={finishDrag}
          onContextMenu={(e) => {
            e.preventDefault();
            if (wireStart || measureState) return;
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            const kind =
              selectedDeviceIdSet.size > 0
                ? 'device'
                : selectedWireIdSet.size > 0
                  ? 'wire'
                  : 'canvas';
            setContextMenu({
              x: Math.min(rect.width - 190, Math.max(8, e.clientX - rect.left)),
              y: Math.min(rect.height - 180, Math.max(8, e.clientY - rect.top)),
              kind,
            });
          }}
          className="absolute inset-0 block w-full h-full"
        >
          <defs>
            <pattern
              id={gridPatternId}
              width={vs.gridSize}
              height={vs.gridSize}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={1} cy={1} r={0.9} fill="var(--flux-grid-dot)" />
            </pattern>
          </defs>

          <g
            ref={(el) => {
              if (el) worldGroupRef.current = el;
            }}
            transform={`translate(${livePanRef.current.x}, ${livePanRef.current.y}) scale(${liveZoomRef.current})`}
          >
            {/* Sheets Loop (Single active sheet or All sheets side-by-side) */}
            {renderedSheets.map((curSheet) => {
              const sd = perSheetRenderMap.get(curSheet.id);
              if (!sd) return null;
              const origin = getSheetCanvasOrigin(allSheetsLayout, curSheet.id, canvasViewMode);
              const isActiveSheet = curSheet.id === sheet?.id;
              const curGostGeom = sd.gostGeom;
              const curAnnotations = sd.annotations;
              const curWires = sd.wires;
              const curJunctionDots = sd.junctionDots;
              const curCrossingArcsByWireId = sd.crossingArcsByWireId;
              const curWireLabelMap = sd.wireLabelMap;
              const curVisibleDevices = sd.visibleDevices;
              const curConnectedPinKeys = sd.connectedPinKeys;
              const curGostTableAnnotations = sd.gostTableAnnotations;
              const curGostTableModels = sd.gostTableModels;
              return (
                <g
                  key={curSheet.id}
                  data-testid={`sheet-group-${curSheet.id}`}
                  data-active-sheet={String(isActiveSheet)}
                  data-sheet-format={curSheet.format}
                  data-origin-x={origin.x}
                  data-origin-y={origin.y}
                  transform={`translate(${origin.x}, ${origin.y})`}
                >
                  {canvasViewMode === 'all' && (
                    <g
                      data-testid={`sheet-canvas-badge-${curSheet.id}`}
                      className="no-print cursor-pointer"
                      onMouseDown={(e) => {
                        if (e.button === 1 || tool === 'pan') return;
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusViewport?.();
                        onSelectSheet(curSheet.id);
                      }}
                    >
                      <rect
                        x={0}
                        y={-30}
                        width={Math.min(curSheet.width, Math.max(220, (`Л.${curSheet.number} · ${curSheet.name} · ${curSheet.format}`).length * 7.2 + 24))}
                        height={22}
                        rx={5}
                        fill={isActiveSheet ? 'var(--flux-accent-solid)' : 'var(--flux-surface)'}
                        stroke={isActiveSheet ? 'var(--flux-accent-solid)' : 'var(--flux-line-strong)'}
                        strokeWidth={1.2}
                      />
                      <text
                        x={10}
                        y={-15.5}
                        fill={isActiveSheet ? '#ffffff' : 'var(--flux-text)'}
                        fontSize={11}
                        fontFamily={fontCss}
                        fontWeight={isActiveSheet ? 700 : 600}
                      >
                        {`Л.${curSheet.number} · ${curSheet.name} · ${curSheet.format}`}
                      </text>
                    </g>
                  )}

                  {/* Sheet Paper & Grid */}
                  <g>
                    <rect
                      x={6}
                      y={6}
                      width={curSheet.width}
                      height={curSheet.height}
                      fill="rgba(15, 23, 42, 0.08)"
                      pointerEvents="none"
                    />
                    <rect
                      x={0}
                      y={0}
                      width={curSheet.width}
                      height={curSheet.height}
                      fill="var(--flux-surface)"
                      stroke={canvasViewMode === 'all' && isActiveSheet ? 'var(--flux-accent)' : 'var(--flux-line-strong)'}
                      strokeWidth={canvasViewMode === 'all' && isActiveSheet ? 2.2 : 1.5}
                    />
                    {vs.showGrid && (
                      <rect
                        x={0}
                        y={0}
                        width={curSheet.width}
                        height={curSheet.height}
                        fill={`url(#${gridPatternId})`}
                      />
                    )}

                    {/* GOST 2.104-2006 Frame, Zones, Left Archival Strip & Editable Form 1/2a Title Block */}
                    {frameVisible && curGostGeom && (
                      <g data-testid="layer-group-frame">
                        {/* Outer paper border & inner main GOST frame */}
                        <rect
                          data-testid="gost-main-frame"
                          x={curGostGeom.frame.left}
                          y={curGostGeom.frame.top}
                          width={curGostGeom.frame.width}
                          height={curGostGeom.frame.height}
                          fill="none"
                          stroke="var(--flux-text)"
                          strokeWidth={frameSw}
                          pointerEvents="none"
                        />
                        <rect
                          x={4}
                          y={4}
                          width={curSheet.width - 8}
                          height={curSheet.height - 8}
                          fill="none"
                          stroke="var(--flux-line-strong)"
                          strokeWidth={frameThinSw}
                          pointerEvents="none"
                        />
                        {/* Top Coordinate Zones 1..6 */}
                        {['1', '2', '3', '4', '5', '6'].map((zoneNum, zi, arr) => {
                          const spanW = curGostGeom.frame.width / arr.length;
                          const zx = curGostGeom.frame.left + zi * spanW;
                          return (
                            <g key={`z-top-${zoneNum}`} pointerEvents="none">
                              {zi > 0 && (
                                <line
                                  x1={zx}
                                  y1={4}
                                  x2={zx}
                                  y2={curGostGeom.frame.top}
                                  stroke="var(--flux-line-strong)"
                                  strokeWidth={frameThinSw}
                                />
                              )}
                              <text
                                x={zx + spanW / 2}
                                y={14}
                                textAnchor="middle"
                                fill="var(--flux-text-muted)"
                                fontSize={9.5}
                                fontFamily={fontCss}
                              >
                                {zoneNum}
                              </text>
                            </g>
                          );
                        })}
                        {/* Left Coordinate Zones А..Д */}
                        {['А', 'Б', 'В', 'Г', 'Д'].map((zoneLet, zi, arr) => {
                          const spanH = curGostGeom.frame.height / arr.length;
                          const zy = curGostGeom.frame.top + zi * spanH;
                          return (
                            <g key={`z-left-${zoneLet}`} pointerEvents="none">
                              {zi > 0 && (
                                <line
                                  x1={4}
                                  y1={zy}
                                  x2={20}
                                  y2={zy}
                                  stroke="var(--flux-line-strong)"
                                  strokeWidth={frameThinSw}
                                />
                              )}
                              <text
                                x={12}
                                y={zy + spanH / 2 + 3}
                                textAnchor="middle"
                                fill="var(--flux-text-muted)"
                                fontSize={9.5}
                                fontFamily={fontCss}
                              >
                                {zoneLet}
                              </text>
                            </g>
                          );
                        })}

                        {/* Left Archival Strip (Графы 19-23 ГОСТ 2.104) */}
                        {curGostGeom.archivalBox.visible && (
                        <g pointerEvents="none">
                          <rect
                            x={curGostGeom.archivalBox.x}
                            y={curGostGeom.archivalBox.y}
                            width={curGostGeom.archivalBox.width}
                            height={curGostGeom.archivalBox.height}
                            fill="var(--flux-surface)"
                            stroke="var(--flux-text)"
                            strokeWidth={Math.max(0.5, Number((frameSw * 0.68).toFixed(2)))}
                          />
                          <line
                            x1={curGostGeom.archivalBox.x + 17}
                            y1={curGostGeom.archivalBox.y}
                            x2={curGostGeom.archivalBox.x + 17}
                            y2={curGostGeom.archivalBox.y + curGostGeom.archivalBox.height}
                            stroke="var(--flux-text)"
                            strokeWidth={stampThinSw}
                          />
                          {(() => {
                            let curY = curGostGeom.archivalBox.y;
                            return curGostGeom.archivalBox.rows.map((r, ri) => {
                              const rowY = curY;
                              curY += r.h;
                              return (
                                <g key={`arch-${ri}`}>
                                  {ri > 0 && (
                                    <line
                                      x1={curGostGeom.archivalBox.x}
                                      y1={rowY}
                                      x2={curGostGeom.archivalBox.x + curGostGeom.archivalBox.width}
                                      y2={rowY}
                                      stroke="var(--flux-text)"
                                      strokeWidth={stampThinSw}
                                    />
                                  )}
                                  <text
                                    transform={`translate(${curGostGeom.archivalBox.x + 12}, ${rowY + r.h / 2}) rotate(-90)`}
                                    textAnchor="middle"
                                    fill="var(--flux-text-muted)"
                                    fontSize={7.5}
                                    fontFamily={fontCss}
                                  >
                                    {r.label}
                                  </text>
                                  {r.value && (
                                    <text
                                      transform={`translate(${curGostGeom.archivalBox.x + 30}, ${rowY + r.h / 2}) rotate(-90)`}
                                      textAnchor="middle"
                                      fill="var(--flux-text)"
                                      fontSize={8}
                                      fontFamily={fontCss}
                                    >
                                      {r.value}
                                    </text>
                                  )}
                                </g>
                              );
                            });
                          })()}
                        </g>
                        )}

                        {/* GOST 2.104 Stamp (Form 1 or Form 2a) */}
                        <g data-testid="gost-stamp">
                          <rect
                            x={curGostGeom.stamp.x}
                            y={curGostGeom.stamp.y}
                            width={curGostGeom.stamp.width}
                            height={curGostGeom.stamp.height}
                            fill="var(--flux-surface)"
                            stroke="var(--flux-text)"
                            strokeWidth={frameSw}
                          />
                          {curGostGeom.stamp.lines.map((ln, li) => (
                            <line
                              key={`st-ln-${li}`}
                              x1={ln.x1}
                              y1={ln.y1}
                              x2={ln.x2}
                              y2={ln.y2}
                              stroke="var(--flux-text)"
                              strokeWidth={ln.thick ? stampThickSw : stampThinSw}
                              pointerEvents="none"
                            />
                          ))}
                          {curGostGeom.stamp.cells.map((cell) => {
                            const hasField = Boolean(cell.editable && cell.fieldKey);
                            const isEditable = hasField && !frameLocked;
                            const fitted = fitStampCellText(
                              cell.text,
                              cell.width,
                              cell.height,
                              cell.fontSize || 8.5,
                              cell.bold
                            );
                            const fs = fitted.fontSize;
                            const tx = cell.align === 'center' ? cell.x + cell.width / 2 : cell.x + 4;
                            const totalBlockH =
                              fitted.lines.length > 1
                                ? (fitted.lines.length - 1) * fitted.lineHeight
                                : 0;
                            const firstLineY =
                              cell.y + cell.height / 2 - totalBlockH / 2 + fs * 0.34;
                            const clipId = `vp-${viewportIndex}-${curSheet.id}-st-clip-${cell.id}`;
                            return (
                              <g
                                key={cell.id}
                                data-testid={hasField ? `gost-stamp-cell-${cell.id}` : undefined}
                                onMouseDown={(e) => {
                                  if (e.button === 1) return;
                                  if (isEditable) e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  if (!isEditable) return;
                                  e.stopPropagation();
                                  onFocusViewport?.();
                                  if (canvasViewMode === 'all' && curSheet.id !== sheet?.id) {
                                    onSelectSheet(curSheet.id, { skipFit: true });
                                  }
                                }}
                                onDoubleClick={(e) => {
                                  if (!isEditable || !cell.fieldKey) return;
                                  e.stopPropagation();
                                  onFocusViewport?.();
                                  if (canvasViewMode === 'all' && curSheet.id !== sheet?.id) {
                                    onSelectSheet(curSheet.id, { skipFit: true });
                                  }
                                  openInPlaceEdit({
                                    kind: 'stamp',
                                    id: cell.id,
                                    sheetId: curSheet.id,
                                    fieldKey: cell.fieldKey,
                                    label: cell.label || cell.fieldKey,
                                    worldX: cell.x,
                                    worldY: cell.y,
                                    worldW: Math.max(110, cell.width),
                                    worldH: Math.max(26, cell.height),
                                    multiline: cell.height >= 28,
                                    initialValue: cell.text,
                                    value: cell.text,
                                  });
                                }}
                                className={isEditable ? 'cursor-text group' : undefined}
                              >
                                <defs>
                                  <clipPath id={clipId}>
                                    <rect
                                      x={cell.x + 1}
                                      y={cell.y + 1}
                                      width={Math.max(1, cell.width - 2)}
                                      height={Math.max(1, cell.height - 2)}
                                    />
                                  </clipPath>
                                </defs>
                                <rect
                                  x={cell.x + 0.5}
                                  y={cell.y + 0.5}
                                  width={Math.max(1, cell.width - 1)}
                                  height={Math.max(1, cell.height - 1)}
                                  fill={isEditable ? 'var(--flux-accent)' : 'transparent'}
                                  fillOpacity={0}
                                  className={isEditable ? 'hover:fill-opacity-10 transition-opacity' : undefined}
                                />
                                {isEditable && cell.label && <title>{`${cell.label} — двойной клик для правки`}</title>}
                                {hasField && frameLocked && cell.label && (
                                  <title>{`${cell.label} (слой «Рамка и штамп ГОСТ» заблокирован)`}</title>
                                )}
                                <text
                                  x={tx}
                                  y={firstLineY}
                                  textAnchor={cell.align === 'center' ? 'middle' : 'start'}
                                  fill={hasField ? 'var(--flux-text)' : 'var(--flux-text-muted)'}
                                  fontSize={fs}
                                  fontFamily={fontCss}
                                  fontWeight={cell.bold ? 600 : 400}
                                  clipPath={`url(#${clipId})`}
                                  pointerEvents="none"
                                >
                                  {fitted.lines.map((lnText, li) => (
                                    <tspan key={li} x={tx} dy={li === 0 ? 0 : fitted.lineHeight}>
                                      {lnText}
                                    </tspan>
                                  ))}
                                </text>
                              </g>
                            );
                          })}
                          {/* Quick AutoCAD-like edit badge above stamp corner */}
                          <g
                            data-testid="gost-stamp-edit-btn"
                            className={`${frameLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} no-print`}
                            onMouseDown={(e) => {
                              if (e.button === 1) return;
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onFocusViewport?.();
                              if (canvasViewMode === 'all' && curSheet.id !== sheet?.id) {
                                onSelectSheet(curSheet.id, { skipFit: true });
                              }
                              if (frameLocked) return;
                              onOpenStampEditor?.(curSheet.id);
                            }}
                          >
                            <rect
                              x={curGostGeom.stamp.x}
                              y={curGostGeom.stamp.y - 18}
                              width={curGostGeom.stamp.form === 'custom' ? 182 : 126}
                              height={16}
                              rx={2}
                              fill="var(--flux-surface)"
                              stroke={frameLocked ? '#d97706' : 'var(--flux-accent)'}
                              strokeWidth={0.9}
                            />
                            <text
                              x={curGostGeom.stamp.x + (curGostGeom.stamp.form === 'custom' ? 91 : 63)}
                              y={curGostGeom.stamp.y - 7}
                              textAnchor="middle"
                              fill={frameLocked ? '#b45309' : 'var(--flux-accent)'}
                              fontSize={8.5}
                              fontFamily={fontCss}
                              fontWeight={600}
                            >
                              {frameLocked
                                ? 'БЛОК: Штамп'
                                : curGostGeom.stamp.form === 'custom'
                                  ? `Штамп: ${(curGostGeom.stamp.templateName || 'Свой штамп').slice(0, 22)}`
                                  : `Штамп (${curGostGeom.stamp.form === 'form1' ? 'Форма 1' : 'Форма 2а'})`}
                            </text>
                          </g>
                        </g>
                      </g>
                    )}
                  </g>

                  {/* Drafting Zones / Annotations (under wires/devices for rect zones) */}
                  {annotationsVisible && (
                    <g data-testid="layer-group-annotations">
                      {curAnnotations.map((ann) => {
                  const selected = selectedAnnotationIdSet.has(ann.id);
                  const strokeColor = selected
                    ? annotationsLocked
                      ? '#d97706'
                      : 'var(--flux-accent)'
                    : ann.color || 'var(--flux-text)';
                  const annSw = Math.max(0.5, ann.strokeWidth ?? vs.annotationStrokeWidth ?? 1.4);
                  const activeSw = selected ? Math.max(annSw + 0.6, 2) : annSw;
                  const annStyle = ann.strokeStyle ?? (ann.kind === 'rect' ? 'dashed' : 'solid');
                  const dashArray =
                    annStyle === 'dashed' ? '8 4' : annStyle === 'dotted' ? '2.5 3' : undefined;
                  const fs = (ann.fontSize || 12) * vs.fontScale;
                  const lines = (ann.text || '').split(/\r?\n/);
                  const lineH = Math.round(fs * 1.3);
                  const maxLineLen = Math.max(4, ...lines.map((l) => l.length));
                  const annCls = annotationsLocked ? 'cursor-default' : 'cursor-move';

                  const openAnnInPlace = (e: React.MouseEvent) => {
                    if (annotationsLocked) return;
                    e.stopPropagation();
                    onFocusViewport?.();
                    const worldX =
                      ann.kind === 'rect'
                        ? ann.x + 8
                        : ann.kind === 'callout'
                          ? ann.x + 28
                          : ann.x - 4;
                    const worldY =
                      ann.kind === 'rect'
                        ? ann.y - 12
                        : ann.kind === 'callout'
                          ? ann.y - 2
                          : ann.y - fs - 4;
                    openInPlaceEdit({
                      kind: 'annotation',
                      id: ann.id,
                      sheetId: ann.sheetId,
                      label:
                        ann.kind === 'rect'
                          ? 'Заголовок зоны'
                          : ann.kind === 'callout'
                            ? 'Текст выноски'
                            : 'Текст аннотации',
                      worldX,
                      worldY,
                      worldW: Math.max(160, ann.kind === 'rect' ? ann.width * 0.65 : ann.width + 24),
                      worldH: 52,
                      multiline: true,
                      initialValue: ann.text,
                      value: ann.text,
                    });
                  };

                  if (ann.kind === 'bom_table' || ann.kind === 'cable_table') {
                    return null;
                  }

                  if (ann.kind === 'rect') {
                    return (
                      <g
                        key={ann.id}
                        data-testid={`annotation-${ann.id}`}
                        onMouseDown={(e) => handleAnnotationDown(e, ann)}
                        onDoubleClick={openAnnInPlace}
                        className={annCls}
                      >
                        <rect
                          x={ann.x}
                          y={ann.y}
                          width={ann.width}
                          height={ann.height}
                          fill={selected ? 'var(--flux-accent)' : 'transparent'}
                          fillOpacity={selected ? 0.06 : 0}
                          stroke={strokeColor}
                          strokeWidth={activeSw}
                          strokeDasharray={dashArray}
                          rx={2}
                        />
                        <rect
                          x={ann.x + 8}
                          y={ann.y - 11}
                          width={Math.max(88, Math.round(maxLineLen * (fs * 0.7) + 22))}
                          height={Math.max(19, lines.length * lineH + 4)}
                          fill="var(--flux-surface)"
                          stroke={strokeColor}
                          strokeWidth={Math.max(0.6, Number((annSw * 0.65).toFixed(2)))}
                          rx={2}
                        />
                        <text
                          x={ann.x + 16}
                          y={ann.y + 3}
                          fill={strokeColor}
                          fontSize={fs}
                          fontFamily={fontCss}
                          fontWeight={600}
                        >
                          {lines.map((line, li) => (
                            <tspan key={li} x={ann.x + 16} dy={li === 0 ? 0 : lineH}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    );
                  }

                  if (ann.kind === 'callout') {
                    const boxW = Math.max(90, ann.width - 6, Math.round(maxLineLen * (fs * 0.6) + 14));
                    const boxH = Math.max(17, lines.length * lineH + 4);
                    return (
                      <g
                        key={ann.id}
                        data-testid={`annotation-${ann.id}`}
                        onMouseDown={(e) => handleAnnotationDown(e, ann)}
                        onDoubleClick={openAnnInPlace}
                        className={annCls}
                      >
                        <circle
                          cx={ann.x}
                          cy={ann.y + ann.height}
                          r={Math.max(2.8, annSw * 1.6 + 1.2)}
                          fill={strokeColor}
                        />
                        <polyline
                          points={`${ann.x},${ann.y + ann.height} ${ann.x + 26},${ann.y + 18} ${ann.x + 26 + boxW + 6},${ann.y + 18}`}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={activeSw}
                          strokeDasharray={dashArray}
                        />
                        <rect
                          x={ann.x + 28}
                          y={ann.y}
                          width={boxW}
                          height={boxH}
                          fill="var(--flux-surface)"
                          fillOpacity={0.92}
                          stroke={selected ? strokeColor : 'none'}
                          strokeWidth={Math.max(0.6, Number((annSw * 0.7).toFixed(2)))}
                          strokeDasharray="3 2"
                        />
                        <text
                          x={ann.x + 32}
                          y={ann.y + 13}
                          fill={strokeColor}
                          fontSize={fs}
                          fontFamily={fontCss}
                          fontWeight={500}
                        >
                          {lines.map((line, li) => (
                            <tspan key={li} x={ann.x + 32} dy={li === 0 ? 0 : lineH}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    );
                  }

                  return (
                    <g
                      key={ann.id}
                      data-testid={`annotation-${ann.id}`}
                      onMouseDown={(e) => handleAnnotationDown(e, ann)}
                      onDoubleClick={openAnnInPlace}
                      className={annCls}
                    >
                      <rect
                        x={ann.x - 4}
                        y={ann.y - fs - 2}
                        width={Math.max(80, Math.round(maxLineLen * (fs * 0.6) + 14))}
                        height={Math.max(fs + 10, lines.length * lineH + 6)}
                        fill="var(--flux-surface)"
                        fillOpacity={0.85}
                        stroke={selected || annStyle !== 'solid' ? strokeColor : 'transparent'}
                        strokeWidth={activeSw}
                        strokeDasharray={dashArray || (selected ? '4 2' : undefined)}
                        rx={2}
                      />
                      <text
                        x={ann.x}
                        y={ann.y}
                        fill={strokeColor}
                        fontSize={fs}
                        fontFamily={fontCss}
                        fontWeight={500}
                      >
                        {lines.map((line, li) => (
                          <tspan key={li} x={ann.x} dy={li === 0 ? 0 : lineH}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* Wires */}
            {wiresVisible && (
              <g data-testid="layer-group-wires">
                {curWires.map((wire: E3Wire) => {
                  const selected = selectedWireIdSet.has(wire.id);
                  const isTraced = tracedWireIdSet.has(wire.id);
                  const isDimmed = Boolean(activeTrace) && !isTraced && !selected;
                  const pts = wire.waypoints.map((p) => `${p.x},${p.y}`).join(' ');
                  const netSigColor = vs.netColors[wire.signalType] || 'var(--flux-text)';
                  const color = selected
                    ? wiresLocked
                      ? '#d97706'
                      : 'var(--flux-accent)'
                    : netSigColor;
                  const midPt =
                    curWireLabelMap.get(wire.id) ||
                    (wire.waypoints.length >= 2
                      ? {
                          x: Math.round((wire.waypoints[0].x + wire.waypoints[1].x) / 2),
                          y: Math.round((wire.waypoints[0].y + wire.waypoints[1].y) / 2),
                        }
                      : wire.waypoints[0]);
                  const wireArcs = curCrossingArcsByWireId.get(wire.id) || [];
                  const openWireInPlace = (e: React.MouseEvent) => {
                    if (wiresLocked || !midPt) return;
                    e.stopPropagation();
                    onFocusViewport?.();
                    const bw = Math.max(24, wire.wireNumber.length * 6.2 + 8);
                    openInPlaceEdit({
                      kind: 'wire',
                      id: wire.id,
                      sheetId: wire.sheetId,
                      label: `Жила · ${wire.netName}`,
                      worldX: midPt.x - Math.max(48, bw / 2 + 12),
                      worldY: midPt.y - 22,
                      worldW: Math.max(96, bw + 28),
                      worldH: 24,
                      multiline: false,
                      initialValue: wire.wireNumber,
                      value: wire.wireNumber,
                    });
                  };
                  return (
                    <g
                      key={wire.id}
                      data-testid={`wire-${wire.id}`}
                      data-traced={isTraced ? 'true' : 'false'}
                      style={{ opacity: isDimmed ? 0.32 : 1 }}
                      onMouseEnter={() => {
                        hoveredWireIdRef.current = wire.id;
                        if (altHeldRef.current) setHoveredWireId(wire.id);
                      }}
                      onMouseLeave={() => {
                        if (hoveredWireIdRef.current === wire.id) hoveredWireIdRef.current = null;
                        if (altHeldRef.current) {
                          setHoveredWireId((prev) => (prev === wire.id ? null : prev));
                        }
                      }}
                      onMouseDown={(e) => {
                        if (e.button === 0 && tool !== 'pan') {
                          e.stopPropagation();
                          onFocusViewport?.();
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canvasViewMode === 'all' && curSheet.id !== sheet?.id) {
                          onSelectSheet(curSheet.id, { skipFit: true });
                        }
                        onSelectWire(wire.id, { toggle: e.shiftKey });
                        if (!e.shiftKey || e.altKey) {
                          onHighlightPotential?.({ wireId: wire.id });
                        }
                      }}
                      onDoubleClick={openWireInPlace}
                      className="cursor-pointer"
                    >
                      <polyline points={pts} fill="none" stroke="transparent" strokeWidth={11} />
                      {isTraced && (
                        <>
                          <polyline
                            points={pts}
                            fill="none"
                            stroke={netSigColor}
                            strokeOpacity={0.28}
                            strokeWidth={vs.wireWidth + 7}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            pointerEvents="none"
                          />
                          <polyline
                            points={pts}
                            fill="none"
                            stroke="#ffffff"
                            strokeOpacity={0.65}
                            strokeWidth={Math.max(1.2, vs.wireWidth * 0.65)}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            className="flux-potential-flow"
                            pointerEvents="none"
                          />
                        </>
                      )}
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={color}
                        strokeWidth={
                          isTraced
                            ? Math.max(vs.wireWidth + 1.8, 3.4)
                            : selected
                              ? vs.wireWidth + 1.5
                              : vs.wireWidth
                        }
                        strokeLinejoin="round"
                      />
                      {/* GOST Crossing Jump Bridges (Мостики при пересечении разных цепей) */}
                      {wireArcs.map((arc, ai) => (
                        <g key={`arc-${wire.id}-${ai}`} pointerEvents="none">
                          <line
                            x1={arc.x - 6}
                            y1={arc.y}
                            x2={arc.x + 6}
                            y2={arc.y}
                            stroke="var(--flux-surface)"
                            strokeWidth={Math.max(4, vs.wireWidth + 3)}
                          />
                          <path
                            d={`M ${arc.x - 6} ${arc.y} A 6 6 0 0 1 ${arc.x + 6} ${arc.y}`}
                            fill="none"
                            stroke={color}
                            strokeWidth={selected || isTraced ? vs.wireWidth + 1.2 : vs.wireWidth}
                            strokeLinecap="round"
                          />
                        </g>
                      ))}
                    </g>
                  );
                })}

                {/* Electrical Junction Dots (T-nodes) */}
                {curJunctionDots.map((dot, idx) => (
                  <circle
                    key={`jdot-${idx}`}
                    data-testid={`junction-dot-${idx}`}
                    cx={dot.x}
                    cy={dot.y}
                    r={Math.max(2.6, Number((vs.wireWidth * 1.35 + 0.7).toFixed(2)))}
                    fill={vs.netColors[dot.signalType] || 'var(--flux-text)'}
                    pointerEvents="none"
                  />
                ))}

                {/* Interactive Segment Drag Grips for Single Selected Wire */}
                {selectedWireIdSet.size === 1 && !wiresLocked && !wireStart && tool === 'select' && (() => {
                  const selWireId = Array.from(selectedWireIdSet)[0];
                  const selWire = curWires.find((w) => w.id === selWireId);
                  if (!selWire) return null;
                  const handles = extractWireSegmentHandles(selWire.waypoints, 8);
                  const inv = 1 / Math.max(0.25, zoom);
                  const gripHalf = Math.max(3.5, Math.min(8, 4.5 * inv));
                  const selMidPt =
                    curWireLabelMap.get(selWire.id) ||
                    (selWire.waypoints.length >= 2
                      ? {
                          x: Math.round((selWire.waypoints[0].x + selWire.waypoints[1].x) / 2),
                          y: Math.round((selWire.waypoints[0].y + selWire.waypoints[1].y) / 2),
                        }
                      : selWire.waypoints[0]);
                  return (
                    <g data-testid="wire-segment-grips">
                      {handles.map((h) => (
                        <g
                          key={`grip-${selWire.id}-${h.segmentIndex}`}
                          data-testid={`wire-grip-${selWire.id}-${h.segmentIndex}`}
                          data-orientation={h.orientation}
                          style={{ cursor: h.orientation === 'h' ? 'ns-resize' : 'ew-resize' }}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            e.stopPropagation();
                            onFocusViewport?.();
                            if (canvasViewMode === 'all' && curSheet.id !== sheet?.id) {
                              onSelectSheet(curSheet.id, { skipFit: true });
                            }
                            onBeginDrag?.();
                            dragRef.current = {
                              kind: 'wireSegment',
                              wireId: selWire.id,
                              sheetId: selWire.sheetId,
                              sheetOriginX: origin.x,
                              sheetOriginY: origin.y,
                              segmentIndex: h.segmentIndex,
                              origWaypoints: selWire.waypoints.map((pt) => ({ ...pt })),
                              moved: false,
                            };
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => {
                            if (wiresLocked || !selMidPt) return;
                            e.stopPropagation();
                            onFocusViewport?.();
                            const bw = Math.max(24, selWire.wireNumber.length * 6.2 + 8);
                            openInPlaceEdit({
                              kind: 'wire',
                              id: selWire.id,
                              sheetId: selWire.sheetId,
                              label: `Жила · ${selWire.netName}`,
                              worldX: selMidPt.x - Math.max(48, bw / 2 + 12),
                              worldY: selMidPt.y - 22,
                              worldW: Math.max(96, bw + 28),
                              worldH: 24,
                              multiline: false,
                              initialValue: selWire.wireNumber,
                              value: selWire.wireNumber,
                            });
                          }}
                        >
                          <rect
                            x={h.midX - gripHalf * 1.8}
                            y={h.midY - gripHalf * 1.8}
                            width={gripHalf * 3.6}
                            height={gripHalf * 3.6}
                            fill="transparent"
                          />
                          <rect
                            x={h.midX - gripHalf}
                            y={h.midY - gripHalf}
                            width={gripHalf * 2}
                            height={gripHalf * 2}
                            rx={1.2 * inv}
                            fill="var(--flux-surface)"
                            stroke="var(--flux-accent)"
                            strokeWidth={1.4 * inv}
                          />
                        </g>
                      ))}
                    </g>
                  );
                })()}

                {/* Wire Core Labels rendered above grips so double-click is never occluded */}
                {vs.showWireNumbers && (
                  <g data-testid="layer-group-wire-labels">
                    {curWires.map((wire: E3Wire) => {
                      const midPt =
                        curWireLabelMap.get(wire.id) ||
                        (wire.waypoints.length >= 2
                          ? {
                              x: Math.round((wire.waypoints[0].x + wire.waypoints[1].x) / 2),
                              y: Math.round((wire.waypoints[0].y + wire.waypoints[1].y) / 2),
                            }
                          : wire.waypoints[0]);
                      if (!midPt) return null;
                      const selected = selectedWireIdSet.has(wire.id);
                      const isTraced = tracedWireIdSet.has(wire.id);
                      const isDimmed = Boolean(activeTrace) && !isTraced && !selected;
                      const netSigColor = vs.netColors[wire.signalType] || 'var(--flux-text)';
                      const color = selected
                        ? wiresLocked
                          ? '#d97706'
                          : 'var(--flux-accent)'
                        : netSigColor;
                      const boxW = Math.max(24, wire.wireNumber.length * 6.2 + 8);
                      return (
                        <g
                          key={`wlabel-${wire.id}`}
                          data-testid={`wire-label-${wire.id}`}
                          style={{ opacity: isDimmed ? 0.32 : 1 }}
                          transform={`translate(${midPt.x - boxW / 2}, ${midPt.y - 6})`}
                          onMouseEnter={() => {
                            hoveredWireIdRef.current = wire.id;
                            if (altHeldRef.current) setHoveredWireId(wire.id);
                          }}
                          onMouseLeave={() => {
                            if (hoveredWireIdRef.current === wire.id) hoveredWireIdRef.current = null;
                            if (altHeldRef.current) {
                              setHoveredWireId((prev) => (prev === wire.id ? null : prev));
                            }
                          }}
                          onMouseDown={(e) => {
                            if (e.button === 0 && tool !== 'pan') {
                              e.stopPropagation();
                              onFocusViewport?.();
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canvasViewMode === 'all' && curSheet.id !== sheet?.id) {
                              onSelectSheet(curSheet.id, { skipFit: true });
                            }
                            onSelectWire(wire.id, { toggle: e.shiftKey });
                            if (!e.shiftKey || e.altKey) {
                              onHighlightPotential?.({ wireId: wire.id });
                            }
                          }}
                          onDoubleClick={(e) => {
                            if (wiresLocked) return;
                            e.stopPropagation();
                            onFocusViewport?.();
                            openInPlaceEdit({
                              kind: 'wire',
                              id: wire.id,
                              sheetId: wire.sheetId,
                              label: `Жила · ${wire.netName}`,
                              worldX: midPt.x - Math.max(48, boxW / 2 + 12),
                              worldY: midPt.y - 22,
                              worldW: Math.max(96, boxW + 28),
                              worldH: 24,
                              multiline: false,
                              initialValue: wire.wireNumber,
                              value: wire.wireNumber,
                            });
                          }}
                          className={wiresLocked ? 'cursor-default' : 'cursor-text'}
                        >
                          <rect
                            x={0}
                            y={-10}
                            width={boxW}
                            height={13}
                            rx={2}
                            fill="var(--flux-surface)"
                            opacity={0.92}
                          />
                          <text
                            x={boxW / 2}
                            y={0}
                            textAnchor="middle"
                            fill={color}
                            fontSize={9.5 * vs.fontScale}
                            fontFamily={fontCss}
                            fontWeight={500}
                          >
                            {wire.wireNumber}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                )}

                {/* Live Rubber-band Wire Preview + Step-by-Step Waypoint Anchors + Cursor HUD */}
                {wireStart && wireStart.sheetId === curSheet.id && previewWirePoints && (
                  <g pointerEvents="none">
                    <polyline
                      data-testid="wire-preview-polyline"
                      points={previewWirePoints}
                      fill="none"
                      stroke="var(--flux-accent)"
                      strokeWidth={vs.wireWidth}
                      strokeDasharray="5 3"
                    />
                    {wireAnchors.map((pt, idx) => (
                      <circle
                        key={`draft-anchor-${idx}`}
                        data-testid={`wire-draft-anchor-${idx}`}
                        cx={pt.x}
                        cy={pt.y}
                        r={3.5}
                        fill="var(--flux-surface)"
                        stroke="var(--flux-accent)"
                        strokeWidth={1.6}
                      />
                    ))}
                    {previewWireData.endPt && (() => {
                      const invZ = 1 / Math.max(0.25, zoom);
                      const hudLabel = `${previewWireData.lengthMm} мм · ${previewWireData.segCount} сегм. · [${wirePosture.toUpperCase()}] /`;
                      const hudW = Math.max(145, hudLabel.length * 6.2 + 14) * invZ;
                      const hudH = 18 * invZ;
                      const hx = previewWireData.endPt.x + 12 * invZ;
                      const hy = previewWireData.endPt.y - 24 * invZ;
                      return (
                        <g data-testid="wire-cursor-hud">
                          <rect
                            x={hx}
                            y={hy}
                            width={hudW}
                            height={hudH}
                            rx={4 * invZ}
                            fill="var(--flux-surface)"
                            fillOpacity={0.95}
                            stroke="var(--flux-accent)"
                            strokeWidth={1 * invZ}
                          />
                          <text
                            x={hx + hudW / 2}
                            y={hy + hudH / 2}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="var(--flux-text)"
                            fontSize={10 * invZ}
                            fontFamily="var(--font-mono)"
                            fontWeight={600}
                          >
                            {hudLabel}
                          </text>
                        </g>
                      );
                    })()}
                  </g>
                )}

                {/* Auto Wire Break Highlight when dragging 2-pin device over a wire */}
                {wireBreakPreview && wireBreakPreview.wire.sheetId === curSheet.id && (() => {
                  const bw = wireBreakPreview.wire;
                  const segA = bw.waypoints[wireBreakPreview.segmentIndex];
                  const segB = bw.waypoints[wireBreakPreview.segmentIndex + 1];
                  if (!segA || !segB) return null;
                  const inv = 1 / Math.max(0.25, zoom);
                  const badgeText = `В разрыв цепи ${bw.netName}`;
                  const badgeW = Math.max(120 * inv, badgeText.length * 5.8 * inv + 16 * inv);
                  const badgeH = 18 * inv;
                  return (
                    <g
                      data-testid="wire-break-preview"
                      data-wire-id={bw.id}
                      pointerEvents="none"
                    >
                      <line
                        x1={segA.x}
                        y1={segA.y}
                        x2={segB.x}
                        y2={segB.y}
                        stroke="#f59e0b"
                        strokeOpacity={0.45}
                        strokeWidth={vs.wireWidth + 8 * inv}
                        strokeLinecap="round"
                      />
                      <circle
                        cx={wireBreakPreview.projX}
                        cy={wireBreakPreview.projY}
                        r={7 * inv}
                        fill="var(--flux-surface)"
                        stroke="#d97706"
                        strokeWidth={1.8 * inv}
                      />
                      <rect
                        x={wireBreakPreview.projX - badgeW / 2}
                        y={wireBreakPreview.projY - 26 * inv}
                        width={badgeW}
                        height={badgeH}
                        rx={2.5 * inv}
                        fill="var(--flux-surface)"
                        stroke="#d97706"
                        strokeWidth={1 * inv}
                      />
                      <text
                        x={wireBreakPreview.projX}
                        y={wireBreakPreview.projY - 14 * inv}
                        textAnchor="middle"
                        fill="#b45309"
                        fontSize={9.5 * inv}
                        fontFamily={fontCss}
                        fontWeight={600}
                      >
                        {badgeText}
                      </text>
                    </g>
                  );
                })()}
              </g>
            )}

            {/* Devices */}
            {devicesVisible && (
              <g data-testid="layer-group-devices">
                {curVisibleDevices.map((device) => {
                  const link = device.category === 'offpage_ref' ? offPageLinks.get(device.id) : undefined;
                  return (
                    <SchematicSymbol
                      key={device.id}
                      device={device}
                      selected={selectedDeviceIdSet.has(device.id)}
                      locked={devicesLocked}
                      wiresLocked={wiresLocked || !wiresVisible}
                      visual={vs}
                      wireStartPinKey={wireStart ? `${wireStart.deviceId}:${wireStart.pinId}` : null}
                      hoveredPinKey={
                        wireStart && hoveredPin ? `${hoveredPin.deviceId}:${hoveredPin.pinId}` : null
                      }
                      connectedPinKeys={curConnectedPinKeys}
                      highlightedPinKeys={tracedPinKeySet}
                      isPotentialHighlighted={tracedOffPageIdSet.has(device.id)}
                      offPageAddress={link?.addressText}
                      offPageHasTarget={Boolean(link?.primaryCounterpart)}
                      onOffPageNavigate={onNavigateOffPage}
                      onSelectDevice={stableSelectDeviceDown}
                      onDoubleClickDesignation={stableDoubleClickDesignation}
                      onPinClick={stablePinClick}
                      onPinHover={handlePinHover}
                    />
                  );
                })}
              </g>
            )}

            {/* Live GOST Tables (BOM / Cable Journal) rendered over wires & devices with opaque backing */}
            {annotationsVisible && (
              <g data-testid="layer-group-gost-tables">
                {curGostTableAnnotations.map((ann) => {
                    const selected = selectedAnnotationIdSet.has(ann.id);
                    const borderColor = selected
                      ? annotationsLocked
                        ? '#d97706'
                        : 'var(--flux-accent)'
                      : ann.color || 'var(--flux-text)';
                    const inkColor = ann.color || 'var(--flux-text)';
                    const annSw = Math.max(0.5, ann.strokeWidth ?? vs.annotationStrokeWidth ?? 1.4);
                    const activeSw = selected ? Math.max(annSw + 0.8, 2.2) : annSw;
                    const annCls = annotationsLocked ? 'cursor-default' : 'cursor-move';
                    const table = curGostTableModels.get(ann.id) || buildGostTableRenderModel(ann, project);
                    const cellFontSize = Math.max(8, ann.fontSize ? ann.fontSize * 0.8 : 9.5) * vs.fontScale;
                    const gridStroke = Math.max(0.6, Number((annSw * 0.68).toFixed(2)));
                    const bodyStartY = ann.y + table.titleHeight + table.headerHeight;
                    const rowsToRender =
                      table.rows.length > 0
                        ? table.rows
                        : [table.columns.map((_, ci) => (ci === 2 ? 'Нет позиций для отображения' : ''))];
                    let colXAcc = ann.x;
                    const colPositions = table.columns.map((c) => {
                      const xStart = colXAcc;
                      colXAcc += c.width;
                      return { ...c, xStart };
                    });
                    return (
                      <g
                        key={ann.id}
                        data-testid={`annotation-${ann.id}`}
                        data-table-kind={table.kind}
                        onMouseDown={(e) => handleAnnotationDown(e, ann)}
                        className={annCls}
                      >
                        <rect
                          x={ann.x}
                          y={ann.y}
                          width={table.width}
                          height={table.height}
                          fill="var(--flux-surface)"
                          fillOpacity={0.98}
                          stroke={borderColor}
                          strokeWidth={activeSw}
                        />
                        <rect
                          x={ann.x}
                          y={ann.y}
                          width={table.width}
                          height={table.titleHeight}
                          fill="var(--flux-bg)"
                          stroke={inkColor}
                          strokeWidth={gridStroke}
                        />
                        <text
                          x={ann.x + table.width / 2}
                          y={ann.y + table.titleHeight * 0.68}
                          textAnchor="middle"
                          fill={inkColor}
                          fontSize={cellFontSize + 1}
                          fontWeight={700}
                          fontFamily={fontCss}
                        >
                          {table.title}
                        </text>
                        <rect
                          x={ann.x}
                          y={ann.y + table.titleHeight}
                          width={table.width}
                          height={table.headerHeight}
                          fill="var(--flux-bg)"
                          fillOpacity={0.7}
                          stroke={inkColor}
                          strokeWidth={gridStroke}
                        />
                        {colPositions.map((col, ci) => (
                          <g key={col.key}>
                            {ci > 0 && (
                              <line
                                x1={col.xStart}
                                y1={ann.y + table.titleHeight}
                                x2={col.xStart}
                                y2={ann.y + table.height - (table.truncatedCount > 0 ? table.rowHeight : 0)}
                                stroke={inkColor}
                                strokeWidth={gridStroke}
                              />
                            )}
                            <text
                              x={col.xStart + col.width / 2}
                              y={ann.y + table.titleHeight + table.headerHeight * 0.67}
                              textAnchor="middle"
                              fill={inkColor}
                              fontSize={cellFontSize}
                              fontWeight={600}
                              fontFamily={fontCss}
                            >
                              {col.label}
                            </text>
                          </g>
                        ))}
                        {rowsToRender.map((row, rIdx) => {
                          const ry = bodyStartY + rIdx * table.rowHeight;
                          return (
                            <g key={`row-${rIdx}`}>
                              <line
                                x1={ann.x}
                                y1={ry + table.rowHeight}
                                x2={ann.x + table.width}
                                y2={ry + table.rowHeight}
                                stroke={inkColor}
                                strokeWidth={gridStroke}
                              />
                              {colPositions.map((col, ci) => {
                                const rawVal = row[ci] || '';
                                const maxChars = Math.max(3, Math.floor((col.width - 8) / (cellFontSize * 0.56)));
                                const displayVal =
                                  rawVal.length > maxChars
                                    ? `${rawVal.slice(0, maxChars - 1)}…`
                                    : rawVal;
                                const tx =
                                  col.align === 'center'
                                    ? col.xStart + col.width / 2
                                    : col.align === 'right'
                                      ? col.xStart + col.width - 5
                                      : col.xStart + 5;
                                const anchor =
                                  col.align === 'center'
                                    ? 'middle'
                                    : col.align === 'right'
                                      ? 'end'
                                      : 'start';
                                return (
                                  <text
                                    key={`${rIdx}-${ci}`}
                                    x={tx}
                                    y={ry + table.rowHeight * 0.68}
                                    textAnchor={anchor}
                                    fill={inkColor}
                                    fontSize={cellFontSize}
                                    fontFamily={fontCss}
                                  >
                                    {displayVal}
                                  </text>
                                );
                              })}
                            </g>
                          );
                        })}
                        {table.truncatedCount > 0 && (
                          <text
                            x={ann.x + 8}
                            y={bodyStartY + rowsToRender.length * table.rowHeight + table.rowHeight * 0.66}
                            fill="var(--flux-text-muted)"
                            fontSize={cellFontSize}
                            fontStyle="italic"
                            fontFamily={fontCss}
                          >
                            {`… ещё строк: ${table.truncatedCount} (см. полную таблицу или измените лимит)`}
                          </text>
                        )}
                      </g>
                    );
                  })}
              </g>
            )}
                </g>
              );
            })}

            {/* AutoCAD Window (blue solid) / Crossing (green dashed) Marquee Selection */}
            {selectionBox && (
              <g transform={`translate(${selectionBox.originX}, ${selectionBox.originY})`}>
                <rect
                  data-testid="selection-marquee"
                  data-mode={selectionBox.box.mode}
                  x={selectionBox.box.x}
                  y={selectionBox.box.y}
                  width={selectionBox.box.width}
                  height={selectionBox.box.height}
                  fill={
                    selectionBox.box.mode === 'window'
                      ? 'rgba(37, 99, 235, 0.09)'
                      : 'rgba(22, 163, 74, 0.10)'
                  }
                  stroke={selectionBox.box.mode === 'window' ? '#2563eb' : '#16a34a'}
                  strokeWidth={1.3 / Math.max(0.25, zoom)}
                  strokeDasharray={
                    selectionBox.box.mode === 'crossing'
                      ? `${5 / Math.max(0.25, zoom)} ${3 / Math.max(0.25, zoom)}`
                      : undefined
                  }
                  pointerEvents="none"
                />
              </g>
            )}

            {/* CAD Magnetic Alignment Guides, Pin Anchors & Spacing Cadence */}
            {activeSnapHud && (
              <g transform={`translate(${activeSnapHud.originX ?? activeSheetOrigin.x}, ${activeSnapHud.originY ?? activeSheetOrigin.y})`}>
              <g
                data-testid="smart-guides-layer"
                data-guide-count={activeSnapHud.guides.length}
                data-spacing-count={activeSnapHud.spacingGuides.length}
                data-snap-x={activeSnapHud.snappedXKind}
                data-snap-y={activeSnapHud.snappedYKind}
                pointerEvents="none"
              >
                {activeSnapHud.guides.map((g, gi) => {
                  const strokeColor =
                    g.kind === 'pin' ? '#10b981' : g.kind === 'center' ? '#0ea5e9' : '#0284c7';
                  const inv = 1 / Math.max(0.2, zoom);
                  const dash =
                    g.kind === 'center'
                      ? `${6 * inv} ${3 * inv} ${2 * inv} ${3 * inv}`
                      : `${4.5 * inv} ${3 * inv}`;
                  return (
                    <g key={`guide-${g.axis}-${g.coord}-${gi}`}>
                      {g.axis === 'x' ? (
                        <line
                          x1={g.coord}
                          y1={g.from}
                          x2={g.coord}
                          y2={g.to}
                          stroke={strokeColor}
                          strokeWidth={1.25 * inv}
                          strokeDasharray={dash}
                        />
                      ) : (
                        <line
                          x1={g.from}
                          y1={g.coord}
                          x2={g.to}
                          y2={g.coord}
                          stroke={strokeColor}
                          strokeWidth={1.25 * inv}
                          strokeDasharray={dash}
                        />
                      )}
                      {g.pinAnchor && (
                        <circle
                          cx={g.pinAnchor.x}
                          cy={g.pinAnchor.y}
                          r={4.5 * inv}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth={1.5 * inv}
                        />
                      )}
                    </g>
                  );
                })}

                {activeSnapHud.spacingGuides.map((sp, si) => {
                  const inv = 1 / Math.max(0.2, zoom);
                  const tick = 5 * inv;
                  const mid = Math.round((sp.start + sp.end) / 2);
                  const labelText = `${sp.gap} мм`;
                  const pillW = Math.max(38 * inv, labelText.length * 6.5 * inv + 10 * inv);
                  const pillH = 15 * inv;
                  return (
                    <g key={`sp-${sp.axis}-${si}`}>
                      {sp.axis === 'x' ? (
                        <>
                          <line
                            x1={sp.start}
                            y1={sp.crossCoord}
                            x2={sp.end}
                            y2={sp.crossCoord}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <line
                            x1={sp.start}
                            y1={sp.crossCoord - tick}
                            x2={sp.start}
                            y2={sp.crossCoord + tick}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <line
                            x1={sp.end}
                            y1={sp.crossCoord - tick}
                            x2={sp.end}
                            y2={sp.crossCoord + tick}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <rect
                            x={mid - pillW / 2}
                            y={sp.crossCoord - pillH / 2}
                            width={pillW}
                            height={pillH}
                            rx={2 * inv}
                            fill="var(--flux-surface)"
                            stroke="#d97706"
                            strokeWidth={0.9 * inv}
                          />
                          <text
                            x={mid}
                            y={sp.crossCoord + 3.2 * inv}
                            textAnchor="middle"
                            fill="#b45309"
                            fontSize={9.5 * inv}
                            fontFamily="IBM Plex Mono, monospace"
                            fontWeight={600}
                          >
                            {labelText}
                          </text>
                        </>
                      ) : (
                        <>
                          <line
                            x1={sp.crossCoord}
                            y1={sp.start}
                            x2={sp.crossCoord}
                            y2={sp.end}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <line
                            x1={sp.crossCoord - tick}
                            y1={sp.start}
                            x2={sp.crossCoord + tick}
                            y2={sp.start}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <line
                            x1={sp.crossCoord - tick}
                            y1={sp.end}
                            x2={sp.crossCoord + tick}
                            y2={sp.end}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <rect
                            x={sp.crossCoord - pillW / 2}
                            y={mid - pillH / 2}
                            width={pillW}
                            height={pillH}
                            rx={2 * inv}
                            fill="var(--flux-surface)"
                            stroke="#d97706"
                            strokeWidth={0.9 * inv}
                          />
                          <text
                            x={sp.crossCoord}
                            y={mid + 3.2 * inv}
                            textAnchor="middle"
                            fill="#b45309"
                            fontSize={9.5 * inv}
                            fontFamily="IBM Plex Mono, monospace"
                            fontWeight={600}
                          >
                            {labelText}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}

                {(() => {
                  const inv = 1 / Math.max(0.2, zoom);
                  const primaryGuide = activeSnapHud.guides[0];
                  const reason = activeSnapHud.altBypass
                    ? 'Alt: свободно'
                    : activeSnapHud.spacingGuides.length > 0
                      ? `Шаг ${activeSnapHud.spacingGuides[0].gap} мм`
                      : primaryGuide
                        ? primaryGuide.label
                        : activeSnapHud.snappedXKind === 'grid' || activeSnapHud.snappedYKind === 'grid'
                          ? `Сетка ${vs.gridSize} мм`
                          : '';
                  const hudText = reason
                    ? `X:${activeSnapHud.x} Y:${activeSnapHud.y} · ${reason}`
                    : `X:${activeSnapHud.x} Y:${activeSnapHud.y}`;
                  const boxW = Math.max(108 * inv, hudText.length * 6.1 * inv + 18 * inv);
                  const boxH = 18 * inv;
                  const maxBx = (sheet?.width || 1400) - boxW - 8;
                  const bx = Math.min(Math.max(8, activeSnapHud.x), Math.max(8, maxBx));
                  const by = Math.max(6, activeSnapHud.y - 23 * inv);
                  const accentStroke = activeSnapHud.altBypass
                    ? '#64748b'
                    : primaryGuide?.kind === 'pin'
                      ? '#10b981'
                      : activeSnapHud.spacingGuides.length > 0
                        ? '#d97706'
                        : '#0284c7';
                  return (
                    <g data-testid="snap-hud-badge">
                      <rect
                        x={bx}
                        y={by}
                        width={boxW}
                        height={boxH}
                        rx={2.5 * inv}
                        fill="var(--flux-surface)"
                        fillOpacity={0.96}
                        stroke={accentStroke}
                        strokeWidth={1 * inv}
                      />
                      <text
                        x={bx + 6 * inv}
                        y={by + 11.5 * inv}
                        fill="var(--flux-text)"
                        fontSize={9.5 * inv}
                        fontFamily="IBM Plex Mono, monospace"
                        fontWeight={500}
                      >
                        {hudText}
                      </text>
                    </g>
                  );
                })()}
              </g>
              </g>
            )}

            {/* CAD Ruler / Distance Measurement Overlay */}
            {measureState && (() => {
              const dx = measureState.end.x - measureState.start.x;
              const dy = measureState.end.y - measureState.start.y;
              const dist = Math.round(Math.hypot(dx, dy) * 10) / 10;
              const mx = (measureState.start.x + measureState.end.x) / 2;
              const my = (measureState.start.y + measureState.end.y) / 2;
              const invZ = 1 / Math.max(0.25, zoom);
              const label = `L=${dist} мм · ΔX:${Math.abs(dx)} ΔY:${Math.abs(dy)}`;
              const pillW = Math.max(120, label.length * 6.5 + 16) * invZ;
              const pillH = 20 * invZ;
              return (
                <g data-testid="cad-measure-overlay" pointerEvents="none">
                  <line
                    x1={measureState.start.x}
                    y1={measureState.start.y}
                    x2={measureState.end.x}
                    y2={measureState.end.y}
                    stroke="#10b981"
                    strokeWidth={1.6 * invZ}
                    strokeDasharray={`${6 * invZ} ${3 * invZ}`}
                  />
                  <circle cx={measureState.start.x} cy={measureState.start.y} r={3.5 * invZ} fill="#10b981" />
                  <circle cx={measureState.end.x} cy={measureState.end.y} r={3.5 * invZ} fill="#10b981" />
                  <rect
                    x={mx - pillW / 2}
                    y={my - pillH - 6 * invZ}
                    width={pillW}
                    height={pillH}
                    rx={5 * invZ}
                    fill="#064e3b"
                    stroke="#10b981"
                    strokeWidth={1 * invZ}
                  />
                  <text
                    x={mx}
                    y={my - pillH / 2 - 6 * invZ}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="#ecfdf5"
                    fontSize={10.5 * invZ}
                    fontFamily="var(--font-mono)"
                    fontWeight={600}
                  >
                    {label}
                  </text>
                </g>
              );
            })()}
          </g>

          {/* Global CAD Crosshair Cursor Overlay (full-viewport screen-space hairlines, updated imperatively via rAF) */}
          {vs.showCrosshair !== false && (
            <g
              ref={(el) => {
                if (el) crosshairGroupRef.current = el;
              }}
              data-testid={viewportIndex === 0 ? 'canvas-crosshair' : `canvas-crosshair-${viewportIndex}`}
              data-screen-x={0}
              data-screen-y={0}
              data-world-x={0}
              data-world-y={0}
              style={{ display: 'none' }}
              pointerEvents="none"
            >
              <line
                ref={(el) => {
                  if (el) crossHLeftRef.current = el;
                }}
                x1={0}
                y1={0.5}
                x2={0}
                y2={0.5}
                stroke="var(--flux-accent)"
                strokeOpacity={0.55}
                strokeWidth={1}
                strokeDasharray="6 4"
              />
              <line
                ref={(el) => {
                  if (el) crossHRightRef.current = el;
                }}
                x1={7}
                y1={0.5}
                x2="100%"
                y2={0.5}
                stroke="var(--flux-accent)"
                strokeOpacity={0.55}
                strokeWidth={1}
                strokeDasharray="6 4"
              />
              <line
                ref={(el) => {
                  if (el) crossVTopRef.current = el;
                }}
                x1={0.5}
                y1={0}
                x2={0.5}
                y2={0}
                stroke="var(--flux-accent)"
                strokeOpacity={0.55}
                strokeWidth={1}
                strokeDasharray="6 4"
              />
              <line
                ref={(el) => {
                  if (el) crossVBotRef.current = el;
                }}
                x1={0.5}
                y1={7}
                x2={0.5}
                y2="100%"
                stroke="var(--flux-accent)"
                strokeOpacity={0.55}
                strokeWidth={1}
                strokeDasharray="6 4"
              />
              <rect
                ref={(el) => {
                  if (el) crossRectRef.current = el;
                }}
                x={-5}
                y={-5}
                width={10}
                height={10}
                fill="none"
                stroke="var(--flux-accent)"
                strokeOpacity={0.7}
                strokeWidth={1}
              />
            </g>
          )}
        </motion.svg>
        </AnimatePresence>
        )}

        {/* Floating Potential Signal Trace HUD */}
        {activeTrace && viewportIndex === 0 && (
          <div
            data-testid="potential-trace-hud"
            onMouseDown={(e) => e.stopPropagation()}
            className="no-print absolute top-2.5 right-2.5 z-20 flex items-center gap-2 px-2.5 py-1 rounded-xl border border-[var(--flux-line-strong)] flux-glass-popover text-[length:calc(11px*var(--flux-ui-scale))]"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: vs.netColors[activeTrace.signalType] || 'var(--flux-accent)' }}
            />
            <div className="flex items-center gap-1.5 font-mono">
              <span className="font-semibold text-[var(--flux-text)]">
                {activeTrace.netNames.join(' / ') || 'Цепь'}
              </span>
              <span className="text-[var(--flux-text-muted)]">
                · {activeTrace.segmentCount} уч. · {activeTrace.totalLengthMm} мм
              </span>
            </div>
            {activeTrace.sheetIds.length > 0 && (
              <div className="flex items-center gap-1 border-l border-[var(--flux-line)] pl-1.5">
                {activeTrace.sheetIds.map((sId) => {
                  const sh = project.sheets.find((s) => s.id === sId);
                  if (!sh) return null;
                  const isCurr = sh.id === sheet?.id;
                  return (
                    <button
                      key={sh.id}
                      type="button"
                      data-testid={`trace-sheet-chip-${sh.number}`}
                      onClick={(e) => {
                        if (e.button !== 0 || panJustFinishedRef.current) return;
                        onSelectSheet(sh.id);
                      }}
                      className={`h-5 px-1.5 rounded-md font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium transition-colors ${
                        isCurr
                          ? 'bg-[var(--flux-accent-solid)] text-white'
                          : 'bg-[var(--flux-bg)]/80 border border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                      }`}
                    >
                      Л.{sh.number}
                    </button>
                  );
                })}
              </div>
            )}
            {onClearPotentialHighlight && !liveHoverTrace && (
              <button
                type="button"
                data-testid="clear-potential-trace-btn"
                onClick={onClearPotentialHighlight}
                title="Снять подсветку потенциала (Esc)"
                aria-label="Снять подсветку потенциала"
                className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Stage 4.2 In-Place Canvas Text Editor Overlay */}
        {inPlaceEdit && (() => {
          const cw = canvasViewportSize.width || 800;
          const ch = canvasViewportSize.height || 600;
          const lz = liveZoomRef.current;
          const lp = livePanRef.current;
          const scaleFactor =
            typeof document !== 'undefined'
              ? Math.max(1, Number(document.documentElement.dataset.uiScale || '100') / 100)
              : 1;
          const boxW = Math.max(
            Math.round((inPlaceEdit.multiline ? 252 : 176) * Math.min(scaleFactor, 1.5)),
            Math.min(
              Math.round(380 * Math.min(scaleFactor, 1.4)),
              Math.round(inPlaceEdit.worldW * Math.max(lz, 0.8))
            )
          );
          const boxH = inPlaceEdit.multiline
            ? Math.max(
                Math.round(58 * scaleFactor),
                Math.min(Math.round(140 * scaleFactor), Math.round(inPlaceEdit.worldH * Math.max(lz, 0.85)))
              )
            : Math.max(Math.round(28 * scaleFactor), Math.round(inPlaceEdit.worldH * Math.max(lz, 0.9)));
          const editOrigin = getSheetOrigin(inPlaceEdit.sheetId);
          const rawLeft = lp.x + (editOrigin.x + inPlaceEdit.worldX) * lz;
          const rawTop = lp.y + (editOrigin.y + inPlaceEdit.worldY) * lz;
          const left = Math.max(8, Math.min(cw - boxW - 8, rawLeft));
          const top = Math.max(22, Math.min(ch - boxH - 8, rawTop));
          const handleEditorKeyDown = (
            e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
          ) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.preventDefault();
              cancelInPlaceEdit();
              return;
            }
            if (e.key === 'Enter' && (!inPlaceEdit.multiline || !e.shiftKey)) {
              e.preventDefault();
              commitInPlaceEdit();
            }
          };
          return (
            <div
              data-testid="inplace-text-editor"
              data-kind={inPlaceEdit.kind}
              style={{ left, top, width: boxW }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
              className="no-print absolute z-30 flex flex-col gap-0"
            >
              <div className="inline-flex items-center justify-between gap-2 px-2 py-0.5 rounded-t-lg border border-b-0 border-[var(--flux-accent)] flux-glass-popover text-[length:calc(10px*var(--flux-ui-scale))] font-medium text-[var(--flux-accent)]">
                <span className="truncate">{inPlaceEdit.label}</span>
                <span className="font-mono text-[length:calc(9px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                  {inPlaceEdit.multiline ? 'Enter · Shift+↵ · Esc' : 'Enter · Esc'}
                </span>
              </div>
              {inPlaceEdit.multiline ? (
                <textarea
                  ref={(el) => {
                    inPlaceInputRef.current = el;
                  }}
                  data-testid="inplace-text-input"
                  aria-label={inPlaceEdit.label}
                  spellCheck={false}
                  value={inPlaceEdit.value}
                  onChange={(e) =>
                    setInPlaceEdit((prev) => (prev ? { ...prev, value: e.target.value } : null))
                  }
                  onKeyDown={handleEditorKeyDown}
                  onBlur={commitInPlaceEdit}
                  style={{ minHeight: boxH }}
                  className="w-full px-2 py-1 rounded-b-lg border border-[var(--flux-accent)] flux-glass-surface text-[length:calc(12px*var(--flux-ui-scale))] font-mono text-[var(--flux-text)] shadow-md focus:outline-none resize-y"
                />
              ) : (
                <input
                  ref={(el) => {
                    inPlaceInputRef.current = el;
                  }}
                  type="text"
                  data-testid="inplace-text-input"
                  aria-label={inPlaceEdit.label}
                  spellCheck={false}
                  value={inPlaceEdit.value}
                  onChange={(e) =>
                    setInPlaceEdit((prev) => (prev ? { ...prev, value: e.target.value } : null))
                  }
                  onKeyDown={handleEditorKeyDown}
                  onBlur={commitInPlaceEdit}
                  style={{ height: boxH }}
                  className="w-full px-2 rounded-b-lg border border-[var(--flux-accent)] flux-glass-surface text-[length:calc(12px*var(--flux-ui-scale))] font-mono font-semibold text-[var(--flux-text)] shadow-md focus:outline-none"
                />
              )}
            </div>
          );
        })()}

        {/* Right-Click CAD Context Menu (all UI modes) */}
        {contextMenu && (
          <div
            data-testid="canvas-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="no-print absolute z-30 w-48 py-1 rounded-xl border border-[var(--flux-line-strong)] flux-glass-popover shadow-2xl text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
          >
            {contextMenu.kind === 'device' && (
              <>
                {onRotateSelected && (
                  <button
                    type="button"
                    onClick={() => { onRotateSelected(); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)] flex items-center justify-between"
                  >
                    <span>Повернуть 90°</span>
                    <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">R</span>
                  </button>
                )}
                {onMirrorSelected && (
                  <>
                    <button
                      type="button"
                      onClick={() => { onMirrorSelected('x'); setContextMenu(null); }}
                      className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)]"
                    >
                      Отразить по X
                    </button>
                    <button
                      type="button"
                      onClick={() => { onMirrorSelected('y'); setContextMenu(null); }}
                      className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)]"
                    >
                      Отразить по Y
                    </button>
                  </>
                )}
                {onDuplicateSelected && (
                  <button
                    type="button"
                    onClick={() => { onDuplicateSelected(); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)] flex items-center justify-between"
                  >
                    <span>Дублировать</span>
                    <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">Ctrl+D</span>
                  </button>
                )}
                {onDeleteSelected && (
                  <button
                    type="button"
                    onClick={() => { onDeleteSelected(); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-between"
                  >
                    <span>Удалить</span>
                    <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))]">Del</span>
                  </button>
                )}
              </>
            )}
            {contextMenu.kind === 'wire' && (
              <>
                {onHighlightPotential && selectedWireId && (
                  <button
                    type="button"
                    onClick={() => { onHighlightPotential({ wireId: selectedWireId }); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)]"
                  >
                    Подсветить потенциал
                  </button>
                )}
                {onDeleteSelected && (
                  <button
                    type="button"
                    onClick={() => { onDeleteSelected(); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-between"
                  >
                    <span>Удалить цепь</span>
                    <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))]">Del</span>
                  </button>
                )}
              </>
            )}
            {contextMenu.kind === 'canvas' && (
              <>
                {hasClipboard && onPasteClipboard && (
                  <button
                    type="button"
                    onClick={() => { onPasteClipboard(); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)] flex items-center justify-between"
                  >
                    <span>Вставить</span>
                    <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">Ctrl+V</span>
                  </button>
                )}
                {onFitViewport && (
                  <button
                    type="button"
                    onClick={() => { onFitViewport(); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)] flex items-center justify-between"
                  >
                    <span>Вписать лист в окно</span>
                    <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">Z</span>
                  </button>
                )}
                {onSetTool && (
                  <>
                    <button
                      type="button"
                      onClick={() => { onSetTool('wire'); setContextMenu(null); }}
                      className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)] flex items-center justify-between"
                    >
                      <span>Рисовать провод</span>
                      <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">W</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { onSetTool('measure'); setContextMenu(null); }}
                      className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)]"
                    >
                      Линейка (измерить)
                    </button>
                  </>
                )}
                {onToggleGrid && (
                  <button
                    type="button"
                    onClick={() => { onToggleGrid(); setContextMenu(null); }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--flux-hover)] flex items-center justify-between"
                  >
                    <span>Сетка чертежа</span>
                    <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">F9</span>
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Focus Mode (Variant B): Centered Floating Sheet Tabs Pill */}
        {uiMode === 'focus' && !isMultiViewport && (
          <div
            data-testid="focus-sheet-tabs-pill"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={{
              left: resolvedFocusLayout.sheetTabsCenterX,
              transform: 'translateX(-50%)',
              maxWidth: resolvedFocusLayout.sheetTabsMaxWidth,
            }}
            className="no-print absolute top-3 z-40 inline-flex items-center gap-0.5 h-[calc(34px*var(--flux-ui-scale))] px-1.5 rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg min-w-0 overflow-visible"
          >
            <button
              type="button"
              data-testid="sheet-prev-btn"
              onClick={handleStepPrevSheet}
              disabled={!resolvedCanPrevSheet}
              title="Предыдущий лист"
              aria-label="Предыдущий лист"
              className="inline-flex items-center justify-center w-[calc(22px*var(--flux-ui-scale))] h-[calc(24px*var(--flux-ui-scale))] rounded-[5px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-30 shrink-0 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div
              ref={sheetTabsScrollRef}
              onWheel={(e) => {
                if (Math.abs(e.deltaY) > 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
                  e.currentTarget.scrollLeft += e.deltaY;
                }
              }}
              className="flex flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0"
            >
              {openSingleTabs.map((s) => {
                const active = s.id === sheet?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`sheet-tab-${s.id}`}
                    onClick={() => onSelectSheet(s.id)}
                    title={`Лист ${s.number}: ${s.name} (${s.format})`}
                    className={`h-[calc(24px*var(--flux-ui-scale))] px-2 rounded-[5px] text-[length:calc(11px*var(--flux-ui-scale))] whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors ${
                      active
                        ? 'bg-[var(--flux-accent-soft)] text-[var(--flux-text)] font-semibold border border-[var(--flux-accent)]/35'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] font-medium'
                    }`}
                  >
                    <span className="max-w-[calc(140px*var(--flux-ui-scale))] truncate">Л.{s.number}: {s.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              data-testid="sheet-next-btn"
              onClick={handleStepNextSheet}
              disabled={!resolvedCanNextSheet}
              title="Следующий лист"
              aria-label="Следующий лист"
              className="inline-flex items-center justify-center w-[calc(22px*var(--flux-ui-scale))] h-[calc(24px*var(--flux-ui-scale))] rounded-[5px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-30 shrink-0 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div ref={sheetPickerRef} className="relative shrink-0">
              <button
                type="button"
                data-testid="sheet-picker-btn"
                onClick={() => setSheetPickerOpen((o) => !o)}
                aria-expanded={sheetPickerOpen}
                title="Список всех листов проекта"
                className="inline-flex items-center gap-0.5 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
              >
                <span>
                  {Math.max(1, sheetPosition.index + 1)}/{Math.max(1, sheetPosition.total)}
                </span>
                <ChevronDown className="w-2.5 h-2.5 opacity-70" />
              </button>
              {sheetPickerOpen && (
                <div
                  data-testid="sheet-picker-popover"
                  className="absolute right-0 top-full mt-1.5 z-50 w-64 max-h-64 overflow-y-auto rounded-lg border border-[var(--flux-line-strong)] flux-glass-popover shadow-xl py-1"
                >
                  {project.sheets.map((ps) => {
                    const isCur = ps.id === sheet?.id;
                    return (
                      <button
                        key={ps.id}
                        type="button"
                        onClick={() => {
                          onSelectSheet(ps.id);
                          setSheetPickerOpen(false);
                        }}
                        className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 text-[length:calc(11px*var(--flux-ui-scale))] transition-colors ${
                          isCur
                            ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-semibold'
                            : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                        }`}
                      >
                        <span className="truncate">
                          Л.{ps.number}: {ps.name}
                        </span>
                        <span className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                          {ps.folder ? `${ps.folder} · ` : ''}{ps.format}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              data-testid="sheet-add-btn"
              onClick={onAddSheet}
              title="Добавить новый лист схемы"
              aria-label="Добавить новый лист схемы"
              className="inline-flex items-center justify-center w-[calc(24px*var(--flux-ui-scale))] h-[calc(24px*var(--flux-ui-scale))] rounded-[5px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            {onToggleCanvasViewMode && (
              <button
                type="button"
                data-testid="canvas-view-mode-toggle"
                aria-pressed={canvasViewMode === 'all'}
                onClick={() => {
                  onFocusViewport?.();
                  onToggleCanvasViewMode();
                }}
                title={
                  canvasViewMode === 'all'
                    ? 'Режим «Все листы» — переключить на 1 активный лист'
                    : 'Режим «1 лист» — показать все листы проекта на одном холсте'
                }
                className={`inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  canvasViewMode === 'all'
                    ? 'bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] border border-[var(--flux-accent)]/35'
                    : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5 shrink-0" />
                <span>{canvasViewMode === 'all' ? 'Все листы' : '1 лист'}</span>
              </button>
            )}
            <div className="relative shrink-0">
              <button
                ref={layerBtnRef}
                type="button"
                data-testid={viewportIndex === 0 ? 'canvas-layers-btn' : `canvas-layers-btn-${viewportIndex}`}
                onClick={() => {
                  onFocusViewport?.();
                  setLayerPopoverOpen((o) => !o);
                }}
                aria-expanded={layerPopoverOpen}
                title="Диспетчер слоёв чертежа"
                aria-label="Диспетчер слоёв чертежа"
                className={`inline-flex items-center justify-center w-[calc(24px*var(--flux-ui-scale))] h-[calc(24px*var(--flux-ui-scale))] rounded-[5px] transition-colors ${
                  layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0
                    ? 'bg-[var(--flux-accent-soft)] text-[var(--flux-accent)]'
                    : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
              {onToggleLayerVisibility && onToggleLayerLock && (
                <LayerManagerPopover
                  open={layerPopoverOpen}
                  layers={resolvedLayers}
                  entityCounts={sheetLayerCounts}
                  anchorRef={layerBtnRef}
                  onClose={() => setLayerPopoverOpen(false)}
                  onToggleVisibility={onToggleLayerVisibility}
                  onToggleLock={onToggleLayerLock}
                  onShowAll={() => onShowAllLayers?.()}
                  onUnlockAll={() => onUnlockAllLayers?.()}
                />
              )}
            </div>
          </div>
        )}

        {/* Floating Contextual Selection Action Bar (New UI: Hybrid & Focus) */}
        {isNewUiMode(uiMode) && !isMultiViewport && totalSelectedCount > 0 && !inPlaceEdit && (
          <div
            data-testid="canvas-selection-bar"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            style={uiMode === 'focus' ? { top: resolvedFocusLayout.selectionBarTop } : undefined}
            className={`no-print absolute ${
              uiMode === 'focus' ? 'transition-[top] duration-150' : 'top-2.5'
            } left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1 h-[calc(32px*var(--flux-ui-scale))] px-2 rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-popover shadow-lg text-[length:calc(11px*var(--flux-ui-scale))]`}
          >
            <span className="px-1.5 font-mono font-semibold text-[var(--flux-accent)] tabular-nums">
              Выбрано: {totalSelectedCount}
            </span>
            <span className="h-3.5 w-px bg-[var(--flux-line)]" />
            {onRotateSelected && selectedDeviceIdSet.size > 0 && (
              <button
                type="button"
                title="Повернуть на 90° (R)"
                onClick={onRotateSelected}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[var(--flux-hover)] text-[var(--flux-text)] transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>90°</span>
              </button>
            )}
            {onMirrorSelected && selectedDeviceIdSet.size > 0 && (
              <>
                <button
                  type="button"
                  title="Отразить по горизонтали (X)"
                  onClick={() => onMirrorSelected('x')}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[var(--flux-hover)] text-[var(--flux-text)] transition-colors"
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Отразить по вертикали (Y)"
                  onClick={() => onMirrorSelected('y')}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[var(--flux-hover)] text-[var(--flux-text)] transition-colors"
                >
                  <FlipVertical2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {onAlignSelected && selectedDeviceIdSet.size >= 2 && (
              <>
                <span className="h-3.5 w-px bg-[var(--flux-line)]" />
                <button
                  type="button"
                  title="Выровнять по левому краю"
                  onClick={() => onAlignSelected('left')}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[var(--flux-hover)] text-[var(--flux-text)] transition-colors"
                >
                  <AlignStartVertical className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Выровнять по верхнему краю"
                  onClick={() => onAlignSelected('top')}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[var(--flux-hover)] text-[var(--flux-text)] transition-colors"
                >
                  <AlignStartHorizontal className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {onDeleteSelected && (
              <>
                <span className="h-3.5 w-px bg-[var(--flux-line)]" />
                <button
                  type="button"
                  title="Удалить выбранное (Del)"
                  onClick={onDeleteSelected}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Compact Interactive Sheet Minimap (New UI: Hybrid & Focus) */}
        {isNewUiMode(uiMode) &&
          !isMultiViewport &&
          sheet &&
          !inPlaceEdit &&
          isMinimapEnabled(vs) &&
          (uiMode !== 'focus' || resolvedFocusLayout.showMinimap) && (() => {
          const mapWidth = canvasViewMode === 'all' ? allSheetsLayout.totalWidth : sheet.width;
          const mapHeight = canvasViewMode === 'all' ? allSheetsLayout.totalHeight : sheet.height;
          return (
          <div
            data-testid="canvas-minimap"
            onMouseDown={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const rx = (e.clientX - rect.left) / rect.width;
              const ry = (e.clientY - rect.top) / rect.height;
              const cRect = containerRef.current?.getBoundingClientRect();
              if (!cRect) return;
              const worldX = rx * mapWidth;
              const worldY = ry * mapHeight;
              const z = liveZoomRef.current;
              const nextPan = {
                x: Math.round(cRect.width / 2 - worldX * z),
                y: Math.round(cRect.height / 2 - worldY * z),
              };
              if (onSetTransform) onSetTransform(z, nextPan);
              else onSetPan(nextPan);
            }}
            title={canvasViewMode === 'all' ? 'Мини-карта всех листов (клик — переместить камеру)' : 'Мини-карта листа (клик — переместить камеру)'}
            style={
              uiMode === 'focus'
                ? {
                    left: resolvedFocusLayout.minimapLeft,
                    bottom: resolvedFocusLayout.minimapBottom,
                    width: resolvedFocusLayout.minimapWidth,
                    height: resolvedFocusLayout.minimapHeight,
                  }
                : undefined
            }
            className={`no-print hidden md:block absolute z-20 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)]/92 shadow-md overflow-hidden cursor-crosshair backdrop-blur-sm transition-[left,bottom] duration-150 ${
              uiMode === 'focus' ? '' : 'bottom-3 left-3 w-[112px] h-[72px]'
            }`}
          >
            <svg viewBox={`0 0 ${mapWidth} ${mapHeight}`} className="w-full h-full block" preserveAspectRatio="xMidYMid meet">
              {renderedSheets.map((ms) => {
                const mOrigin = getSheetCanvasOrigin(allSheetsLayout, ms.id, canvasViewMode);
                const sd = perSheetRenderMap.get(ms.id);
                const mWires = sd?.wires || [];
                const mDevs = sd?.devices || [];
                const isCur = ms.id === sheet.id;
                return (
                  <g key={ms.id} transform={`translate(${mOrigin.x}, ${mOrigin.y})`}>
                    <rect x={0} y={0} width={ms.width} height={ms.height} fill="var(--flux-surface)" />
                    <rect
                      x={16}
                      y={16}
                      width={ms.width - 32}
                      height={ms.height - 32}
                      fill="none"
                      stroke={canvasViewMode === 'all' && isCur ? 'var(--flux-accent)' : 'var(--flux-line-strong)'}
                      strokeWidth={canvasViewMode === 'all' && isCur ? 18 : 8}
                    />
                    {mWires.slice(0, 120).map((w) => (
                      <polyline
                        key={w.id}
                        points={w.waypoints.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke="var(--flux-text-muted)"
                        strokeOpacity={0.45}
                        strokeWidth={6}
                      />
                    ))}
                    {mDevs.slice(0, 160).map((d) => (
                      <rect
                        key={d.id}
                        x={d.x}
                        y={d.y}
                        width={Math.max(16, d.width)}
                        height={Math.max(14, d.height)}
                        fill={selectedDeviceIdSet.has(d.id) ? 'var(--flux-accent)' : 'var(--flux-text-muted)'}
                        fillOpacity={selectedDeviceIdSet.has(d.id) ? 0.85 : 0.45}
                      />
                    ))}
                  </g>
                );
              })}
              {(() => {
                const vw = (canvasViewportSize.width || 900) / Math.max(0.16, zoom);
                const vh = (canvasViewportSize.height || 600) / Math.max(0.16, zoom);
                const vx = -pan.x / Math.max(0.16, zoom);
                const vy = -pan.y / Math.max(0.16, zoom);
                return (
                  <rect
                    x={vx}
                    y={vy}
                    width={vw}
                    height={vh}
                    fill="var(--flux-accent-soft)"
                    stroke="var(--flux-accent)"
                    strokeWidth={Math.max(10, mapWidth * 0.008)}
                  />
                );
              })()}
            </svg>
          </div>
          );
        })()}

        {/* Hybrid Mode (Variant A): Floating Bottom-Center Precision CAD Tool Dock */}
        {uiMode === 'hybrid' && !isMultiViewport && sheet && !inPlaceEdit && onSetTool && (
          <div
            data-testid="canvas-tool-dock"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="no-print absolute bottom-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg border border-[var(--flux-line-strong)] flux-glass-popover shadow-xl backdrop-blur-md"
          >
            {(
              [
                { id: 'select' as const, label: 'Выбор', kbd: 'V', icon: MousePointer2 },
                { id: 'wire' as const, label: 'Провод', kbd: 'W', icon: Spline },
                { id: 'measure' as const, label: 'Линейка', kbd: '', icon: Ruler },
                { id: 'pan' as const, label: 'Панорама', kbd: 'H', icon: Hand },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = tool === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.kbd ? `${item.label} (${item.kbd})` : item.label}
                  onClick={() => onSetTool(item.id)}
                  className={`relative inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[length:calc(11px*var(--flux-ui-scale))] font-medium transition-colors ${
                    active
                      ? 'text-[var(--flux-accent)] font-semibold'
                      : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]/70'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`cad-dock-pill-${viewportIndex}`}
                      transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                      className="absolute inset-0 rounded-md bg-[var(--flux-accent-soft)] border border-[var(--flux-accent)]/35"
                    />
                  )}
                  <Icon className="relative z-10 w-3.5 h-3.5" strokeWidth={1.6} />
                  <span className="relative z-10 hidden sm:inline">{item.label}</span>
                </button>
              );
            })}
            {onFitViewport && (
              <>
                <span className="mx-0.5 h-4 w-px bg-[var(--flux-line)]" />
                <button
                  type="button"
                  title="Вписать лист в окно (Z)"
                  onClick={onFitViewport}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]/70 transition-colors"
                >
                  <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.6} />
                </button>
              </>
            )}
          </div>
        )}

        {/* Focus Mode (Variant B): Left Floating Customizable Quick-Access Rail */}
        {uiMode === 'focus' && !isMultiViewport && sheet && !inPlaceEdit && onSetTool && (
          <FocusToolRail
            tool={tool}
            vs={vs}
            viewportLayout={viewportLayout}
            layerPopoverOpen={layerPopoverOpen}
            totalSelectedCount={totalSelectedCount}
            selectedDeviceCount={selectedDeviceCount}
            hasClipboard={hasClipboard}
            sheetCount={sheetCount ?? project.sheets.length}
            focusLayout={resolvedFocusLayout}
            focusQuickAccessIds={focusQuickAccessIds}
            focusExplorerOpen={focusExplorerOpen}
            onToggleFocusExplorer={onToggleFocusExplorer}
            canvasFocusActive={canvasFocusActive}
            onToggleCanvasFocus={onToggleCanvasFocus}
            onSetTool={onSetTool}
            onExecuteQuickAction={onExecuteQuickAction}
            onRemoveQuickAccess={onRemoveQuickAccess}
            onMoveQuickAccess={onMoveQuickAccess}
            onResetQuickAccess={onResetQuickAccess}
            onRotateSelected={onRotateSelected}
            onFitViewport={onFitViewport}
            onToggleGrid={onToggleGrid}
            motionLayoutScopeId={String(viewportIndex)}
          />
        )}

        {/* Focus Mode (Variant B): Compact Single-Row Bottom-Center Command Pill */}
        {uiMode === 'focus' && !isMultiViewport && sheet && !inPlaceEdit && (
          <FocusCommandPill
            centerX={resolvedFocusLayout.commandPillCenterX}
            maxWidth={resolvedFocusLayout.commandPillMaxWidth}
            commandPaletteItems={commandPaletteItems}
            onExecuteCommandLine={onExecuteCommandLine}
            inputTestId={viewportIndex === 0 ? 'cad-command-input' : `cad-command-input-${viewportIndex}`}
          />
        )}

        {/* Focus Mode (Variant B): Bottom-Right Floating Status Pill */}
        {uiMode === 'focus' && !isMultiViewport && sheet && !inPlaceEdit && (
          <FocusStatusPill
            zoom={zoom}
            showGrid={vs.showGrid}
            snapToGrid={vs.snapToGrid}
            focusConsoleOpen={focusConsoleOpen}
            coordsSpanRef={coordsSpanRef}
            zoomTextRef={zoomTextRef}
            zoomValueTestId={viewportIndex === 0 ? 'canvas-zoom-value' : `canvas-zoom-value-${viewportIndex}`}
            onZoomStep={(delta) => {
              const nextZ =
                delta < 0
                  ? Math.max(0.16, Math.round((liveZoomRef.current + delta) * 100) / 100)
                  : Math.min(2.5, Math.round((liveZoomRef.current + delta) * 100) / 100);
              onSetTransform ? onSetTransform(nextZ, livePanRef.current) : onSetZoom(nextZ);
            }}
            onToggleGrid={onToggleGrid}
            onToggleSnapToGrid={onToggleSnapToGrid}
            onToggleFocusConsole={onToggleFocusConsole}
          />
        )}
      </div>

      {/* Pinned Non-Shifting CAD Canvas Footer Strip (Classic & Hybrid only) */}
      {uiMode !== 'focus' && (
      <div className="no-print @container/footer relative h-[calc(24px*var(--flux-ui-scale))] px-2 border-t border-[var(--flux-line)] flux-glass-bar grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 shrink-0 overflow-visible select-none text-[length:calc(10.5px*var(--flux-ui-scale))]">
        {/* Column 1: Fixed-Width Pinned Coordinates & Sheet Format */}
        <div className="flex items-center gap-1.5 shrink-0 font-mono tabular-nums text-[var(--flux-text-muted)]">
          <span
            data-testid="canvas-coords"
            className={`inline-block whitespace-nowrap tabular-nums overflow-hidden shrink-0 ${
              isMultiViewport
                ? 'w-[calc(96px*var(--flux-ui-scale))] text-[length:calc(10px*var(--flux-ui-scale))]'
                : 'w-[calc(102px*var(--flux-ui-scale))] @[820px]/footer:w-[calc(132px*var(--flux-ui-scale))] text-[length:calc(10.5px*var(--flux-ui-scale))]'
            }`}
          >
            <span ref={coordsSpanRef} className="inline-block whitespace-nowrap" />
          </span>
          {sheet && !isMultiViewport && (
            <span className="hidden @[1040px]/footer:inline-block max-w-[calc(132px*var(--flux-ui-scale))] whitespace-nowrap truncate shrink-0">
              · {sheet.format} ({sheet.width}×{sheet.height})
            </span>
          )}
        </div>

        {/* Column 2: Pinned Command Bar + Isolated Right-Aligned Transient Status Badges */}
        <div className="flex items-center justify-between gap-1.5 min-w-0">
          {(!isMultiViewport || viewportIndex === 0) ? (
            <div
              data-testid="cad-command-bar"
              onMouseDown={(e) => e.stopPropagation()}
              className={`relative items-center h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/85 focus-within:border-[var(--flux-accent)] transition-colors ${
                isMultiViewport
                  ? 'hidden @[340px]/footer:flex flex-1 min-w-0 max-w-[calc(216px*var(--flux-ui-scale))]'
                  : 'flex flex-1 min-w-0 max-w-[calc(240px*var(--flux-ui-scale))]'
              }`}
            >
              <div className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
                <button
                  type="button"
                  data-testid="cad-command-icon-btn"
                  title="Командная строка САПР (Enter — выполнить, ↑ в конце строки — история команд)"
                  aria-label="Фокус на командную строку"
                  onClick={() => cmdInputRef.current?.focus()}
                  className="inline-flex items-center justify-center text-[var(--flux-accent)] hover:text-[var(--flux-text)] shrink-0"
                >
                  <Terminal className="w-2.5 h-2.5" />
                </button>
                <input
                  ref={cmdInputRef}
                  type="text"
                  data-testid={viewportIndex === 0 ? 'cad-command-input' : `cad-command-input-${viewportIndex}`}
                  spellCheck={false}
                  autoComplete="off"
                  value={cmdValue}
                  onChange={(e) => {
                    setCmdValue(e.target.value);
                    if (cmdHistIdx !== -1) setCmdHistIdx(-1);
                  }}
                  onFocus={() => setCmdFocused(true)}
                  onBlur={() => {
                    window.setTimeout(() => setCmdFocused(false), 120);
                  }}
                  onKeyDown={handleCmdKeyDown}
                  placeholder={isMultiViewport ? 'Команда…' : 'Команда: ПРОВОД, ВЫБОР, СЕТКА…'}
                  aria-label="Командная строка САПР"
                  className="flex-1 w-full min-w-0 bg-transparent text-[length:calc(10.5px*var(--flux-ui-scale))] leading-[calc(14px*var(--flux-ui-scale))] font-mono text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)]/70 focus:outline-none select-text"
                />
              </div>

              {/* Command Feedback Echo Toast */}
              {cmdFeedback && !cmdValue.trim() && (
                <div
                  data-testid="cad-command-feedback"
                  className={`absolute left-0 bottom-full mb-1.5 z-40 px-2.5 py-1.5 rounded-[8px] border flux-glass-popover text-[length:calc(11px*var(--flux-ui-scale))] font-sans whitespace-nowrap max-w-[calc(380px*var(--flux-ui-scale))] truncate ${
                    cmdFeedback.status === 'ok'
                      ? 'border-[var(--flux-accent)]/60 text-[var(--flux-text)]'
                      : cmdFeedback.status === 'disabled'
                        ? 'border-amber-500/70 text-amber-700 dark:text-amber-300'
                        : 'border-rose-500/70 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {cmdFeedback.text}
                </div>
              )}

              {/* Bottom CAD Command Suggestions Popover Above Input */}
              {matchingCmdHints.length > 0 && (
                <div
                  data-testid="cad-command-suggestions"
                  className="absolute left-0 bottom-full mb-1.5 z-40 w-[min(calc(370px*var(--flux-ui-scale)),92vw)] rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-popover shadow-xl overflow-hidden font-sans"
                >
                  <div className="px-2.5 py-1 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/70 flex items-center justify-between gap-2 text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                    <span>
                      {cmdValue.trim()
                        ? `Доступные команды (${matchingCmdHints.length})`
                        : 'Доступные команды чертежа'}
                    </span>
                    <span className="font-mono opacity-80">Tab · Enter</span>
                  </div>
                  <div className="max-h-[calc(210px*var(--flux-ui-scale))] overflow-y-auto divide-y divide-[var(--flux-line)]/50">
                    {matchingCmdHints.map((hint, idx) => {
                      const isActive = hintNavigated && idx === activeHintIdx;
                      const keywordLabel =
                        (hint.commandKeyword || hint.keywords[0] || '').trim().toUpperCase();
                      return (
                        <button
                          key={hint.id}
                          type="button"
                          disabled={hint.disabled}
                          data-active={isActive ? 'true' : 'false'}
                          onMouseEnter={() => {
                            setActiveHintIdx(idx);
                            setHintNavigated(true);
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            applyOrExecuteHint(hint);
                          }}
                          className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 transition-colors disabled:opacity-45 ${
                            isActive ? 'bg-[var(--flux-sel)]' : 'hover:bg-[var(--flux-hover)]/80'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-semibold text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-accent)] shrink-0">
                              {keywordLabel}
                            </span>
                            <span className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] truncate">
                              {hint.commandHint || hint.subtitle}
                            </span>
                          </div>
                          {hint.shortcut && (
                            <span className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                              {hint.shortcut}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div />
          )}

          {/* Transient selection & active-mode badges isolated to right side of Column 2 */}
          <div className="flex items-center gap-1 min-w-0 justify-end overflow-hidden">
            {totalSelectedCount > 1 && (
              <span
                data-testid="canvas-selection-count"
                className="hidden @[520px]/footer:inline-flex items-center h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] bg-[var(--flux-sel)] text-[var(--flux-accent)] font-sans text-[length:calc(10px*var(--flux-ui-scale))] font-semibold whitespace-nowrap shrink-0"
              >
                Выделено: {totalSelectedCount}
              </span>
            )}
            {(wireStart || tool !== 'select') && (
              <button
                type="button"
                data-testid="cancel-tool-btn"
                onClick={() => {
                  if (wireStart) {
                    setWireStart(null);
                    setWireAnchors([]);
                  } else {
                    onSetTool?.('select');
                  }
                }}
                title={wireStart ? 'Клик — угол · ПКМ — откат угла · Вывод — соединить · Esc — отмена' : 'Вернуться в режим «Выбор» (Esc)'}
                className="inline-flex items-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-accent)]/50 bg-[var(--flux-sel)] text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] font-sans text-[length:calc(10px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0"
              >
                <span className="max-w-[calc(110px*var(--flux-ui-scale))] @[720px]/footer:max-w-none truncate">
                  {wireStart
                    ? wireAnchors.length > 0
                      ? `Углов: ${wireAnchors.length} · ПКМ откат · Esc`
                      : 'Клик — угол · Вывод — соединить'
                    : `Режим: ${tool}`}
                </span>
                <X className="w-2.5 h-2.5 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* Column 3: Pinned Right Viewport Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          {onToggleGrid && (
            <button
              type="button"
              onClick={onToggleGrid}
              title="Показать/скрыть чертёжную сетку"
              aria-label="Переключить сетку"
              className={`inline-flex items-center justify-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] text-[length:calc(10.5px*var(--flux-ui-scale))] transition-colors whitespace-nowrap shrink-0 ${
                vs.showGrid
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Grid3X3 className={`w-3 h-3 ${vs.showGrid ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden @[1120px]/footer:inline'}>Сетка</span>
            </button>
          )}
          {onToggleSnapToGrid && (
            <button
              type="button"
              data-testid="toggle-snap-grid-btn"
              onClick={onToggleSnapToGrid}
              title="Привязка к чертёжной сетке"
              aria-label="Переключить привязку"
              className={`inline-flex items-center justify-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] text-[length:calc(10.5px*var(--flux-ui-scale))] transition-colors whitespace-nowrap shrink-0 ${
                vs.snapToGrid
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Magnet className={`w-3 h-3 ${vs.snapToGrid ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden @[1120px]/footer:inline'}>Привязка</span>
            </button>
          )}
          {onToggleSmartGuides && (
            <button
              type="button"
              data-testid="toggle-smart-guides-btn"
              onClick={onToggleSmartGuides}
              title="Магнитные направляющие выравнивания (удерживайте Alt при перетаскивании для свободного хода)"
              aria-label="Переключить магнитные направляющие"
              className={`hidden @[740px]/footer:inline-flex items-center justify-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] text-[length:calc(10.5px*var(--flux-ui-scale))] transition-colors whitespace-nowrap shrink-0 ${
                vs.smartGuides !== false
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Ruler className={`w-3 h-3 ${vs.smartGuides !== false ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden @[1120px]/footer:inline'}>Направл.</span>
            </button>
          )}
          {onToggleCrosshair && (
            <button
              type="button"
              data-testid={viewportIndex === 0 ? 'toggle-crosshair-btn' : `toggle-crosshair-btn-${viewportIndex}`}
              onClick={onToggleCrosshair}
              aria-pressed={vs.showCrosshair !== false}
              title="Глобальное перекрестие курсора (Crosshair) для точного выравнивания на листе"
              aria-label="Переключить перекрестие курсора"
              className={`hidden @[740px]/footer:inline-flex items-center justify-center gap-1 h-[calc(18px*var(--flux-ui-scale))] px-1.5 rounded-[2px] text-[length:calc(10.5px*var(--flux-ui-scale))] transition-colors whitespace-nowrap shrink-0 ${
                vs.showCrosshair !== false
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Crosshair className={`w-3 h-3 ${vs.showCrosshair !== false ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden @[1120px]/footer:inline'}>Прицел</span>
            </button>
          )}

          <span className="h-3 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={() => {
              if (wheelCommitTimerRef.current) {
                window.clearTimeout(wheelCommitTimerRef.current);
                wheelCommitTimerRef.current = null;
              }
              const nextZ = Math.max(0.16, Math.round((liveZoomRef.current - 0.1) * 100) / 100);
              onSetTransform
                ? onSetTransform(nextZ, livePanRef.current)
                : onSetZoom(nextZ);
            }}
            aria-label="Уменьшить масштаб холста"
            className="inline-flex items-center justify-center w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] shrink-0"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span
            ref={zoomTextRef}
            data-testid={viewportIndex === 0 ? 'canvas-zoom-value' : `canvas-zoom-value-${viewportIndex}`}
            className={`${isMultiViewport ? 'w-8' : 'w-[calc(38px*var(--flux-ui-scale))]'} text-center font-mono tabular-nums text-[var(--flux-text)] shrink-0`}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => {
              if (wheelCommitTimerRef.current) {
                window.clearTimeout(wheelCommitTimerRef.current);
                wheelCommitTimerRef.current = null;
              }
              const nextZ = Math.min(2.5, Math.round((liveZoomRef.current + 0.1) * 100) / 100);
              onSetTransform
                ? onSetTransform(nextZ, livePanRef.current)
                : onSetZoom(nextZ);
            }}
            aria-label="Увеличить масштаб холста"
            className="inline-flex items-center justify-center w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>
          {onFitViewport && (
            <button
              type="button"
              onClick={onFitViewport}
              title="Вписать лист в окно"
              aria-label="Вписать лист в окно"
              className="inline-flex items-center justify-center w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] shrink-0"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      )}
    </section>
  );
});

SchematicCanvas.displayName = 'SchematicCanvas';
