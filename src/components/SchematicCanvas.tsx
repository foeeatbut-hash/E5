import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Grid3X3, Layers, Lock, Magnet, Maximize2, Minus, Plus, Ruler, Terminal, X } from 'lucide-react';
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
import {
  type CommandLineResolution,
  type CommandPaletteItem,
  filterCommandPaletteItems,
  pushCommandHistory,
  stepCommandHistory,
} from '../core/commandPalette';
import { resolveSchematicCssFont } from '../core/e3Catalog';
import { buildGostTableRenderModel } from '../core/gostTables';
import { getSheetRevisionLabel, hasSheetUncommittedChanges } from '../core/sheetRevisions';
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
  viewportIndex?: number;
  isMultiViewport?: boolean;
  isFocused?: boolean;
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
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
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
}

const CMD_HISTORY_STORAGE_KEY = 'e3promax_cmd_history_v1';

function loadSavedCommandHistory(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CMD_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = React.memo(({
  project,
  catalog,
  activeSheetId,
  viewportIndex = 0,
  isMultiViewport = false,
  isFocused = true,
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
  onAddSheet,
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cmdValue, setCmdValue] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>(() => loadSavedCommandHistory());
  const [cmdHistIdx, setCmdHistIdx] = useState<number>(-1);
  const [cmdSavedDraft, setCmdSavedDraft] = useState<string>('');
  const [cmdFocused, setCmdFocused] = useState<boolean>(false);
  const [cmdFeedback, setCmdFeedback] = useState<{
    status: CommandLineResolution['status'];
    text: string;
  } | null>(null);
  const cmdInputRef = useRef<HTMLInputElement | null>(null);
  const cmdFeedbackTimerRef = useRef<number | null>(null);

  const matchingCmdHints = useMemo(() => {
    if (!cmdFocused || !cmdValue.trim() || commandPaletteItems.length === 0) return [];
    return filterCommandPaletteItems(commandPaletteItems, cmdValue).slice(0, 5);
  }, [cmdFocused, cmdValue, commandPaletteItems]);

  const showCmdFeedback = useCallback(
    (status: CommandLineResolution['status'], text: string) => {
      if (cmdFeedbackTimerRef.current) {
        window.clearTimeout(cmdFeedbackTimerRef.current);
      }
      setCmdFeedback({ status, text });
      cmdFeedbackTimerRef.current = window.setTimeout(() => {
        setCmdFeedback(null);
      }, 3600);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (cmdFeedbackTimerRef.current) window.clearTimeout(cmdFeedbackTimerRef.current);
    };
  }, []);

  const executeCanvasCommand = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const nextHist = pushCommandHistory(cmdHistory, trimmed);
      setCmdHistory(nextHist);
      try {
        window.localStorage?.setItem(CMD_HISTORY_STORAGE_KEY, JSON.stringify(nextHist));
      } catch {
        // Ignore storage failure
      }
      setCmdHistIdx(-1);
      setCmdSavedDraft('');
      setCmdValue('');
      const res = onExecuteCommandLine?.(trimmed);
      if (res) {
        showCmdFeedback(res.status, res.message);
      }
    },
    [cmdHistory, onExecuteCommandLine, showCmdFeedback]
  );

  const handleCmdKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        if (cmdValue.trim()) {
          executeCanvasCommand(cmdValue);
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        const el = e.currentTarget;
        const len = el.value.length;
        const atEnd =
          (el.selectionStart ?? len) === len && (el.selectionEnd ?? len) === len;
        if (atEnd) {
          e.preventDefault();
          const step = stepCommandHistory(
            cmdHistory,
            cmdHistIdx,
            'up',
            cmdValue,
            cmdSavedDraft
          );
          setCmdHistIdx(step.nextIndex);
          setCmdValue(step.nextValue);
          setCmdSavedDraft(step.nextSavedDraft);
          window.requestAnimationFrame(() => {
            el.setSelectionRange(step.nextValue.length, step.nextValue.length);
          });
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        const el = e.currentTarget;
        const len = el.value.length;
        const atEnd =
          (el.selectionStart ?? len) === len && (el.selectionEnd ?? len) === len;
        if (atEnd && cmdHistIdx !== -1) {
          e.preventDefault();
          const step = stepCommandHistory(
            cmdHistory,
            cmdHistIdx,
            'down',
            cmdValue,
            cmdSavedDraft
          );
          setCmdHistIdx(step.nextIndex);
          setCmdValue(step.nextValue);
          setCmdSavedDraft(step.nextSavedDraft);
          window.requestAnimationFrame(() => {
            el.setSelectionRange(step.nextValue.length, step.nextValue.length);
          });
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCmdValue('');
        setCmdHistIdx(-1);
        setCmdSavedDraft('');
        setCmdFeedback(null);
        e.currentTarget.blur();
      }
    },
    [cmdHistory, cmdHistIdx, cmdSavedDraft, cmdValue, executeCanvasCommand]
  );
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
  const [wireStart, setWireStart] = useState<{
    deviceId: string;
    pinId: string;
    x: number;
    y: number;
    direction: 'top' | 'right' | 'bottom' | 'left';
  } | null>(null);
  const [wireAnchors, setWireAnchors] = useState<WirePoint[]>([]);
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
  const onSetTransformRef = useRef(onSetTransform);
  onSetTransformRef.current = onSetTransform;
  const onSetZoomRef = useRef(onSetZoom);
  onSetZoomRef.current = onSetZoom;
  const onSetPanRef = useRef(onSetPan);
  onSetPanRef.current = onSetPan;

  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [altHeld, setAltHeld] = useState(false);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);
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

  useEffect(() => {
    if (inPlaceEdit && inPlaceEdit.sheetId !== activeSheetId) {
      cancelInPlaceEdit();
    }
  }, [activeSheetId, inPlaceEdit, cancelInPlaceEdit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.altKey) setAltHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || !e.altKey) setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (hoverRafRef.current) window.cancelAnimationFrame(hoverRafRef.current);
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

  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number; moved: boolean }
    | { kind: 'device'; deviceId: string; startWorldX: number; startWorldY: number; origX: number; origY: number; moved: boolean; others: SnapRectEntity[] }
    | { kind: 'annotation'; annId: string; startWorldX: number; startWorldY: number; origX: number; origY: number; moved: boolean; others: SnapRectEntity[] }
    | { kind: 'wireSegment'; wireId: string; segmentIndex: number; origWaypoints: WirePoint[]; moved: boolean }
    | { kind: 'marquee'; startWorldX: number; startWorldY: number; additive: boolean; moved: boolean; currentBox?: SelectionBox }
    | null
  >(null);

  const sheet = useMemo(
    () => project.sheets.find((s) => s.id === activeSheetId) || project.sheets[0],
    [project.sheets, activeSheetId]
  );

  const sheetLayerCounts = useMemo(
    () => countSheetLayerEntities(project, sheet?.id || ''),
    [project, sheet?.id]
  );

  const sheetDevices = useMemo(
    () => project.devices.filter((d) => d.sheetId === sheet?.id),
    [project.devices, sheet?.id]
  );

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

  const toWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.round((clientX - rect.left - pan.x) / zoom),
      y: Math.round((clientY - rect.top - pan.y) / zoom),
    };
  };

  const snap = (val: number) => {
    if (!project.visualSettings.snapToGrid) return Math.round(val);
    const g = Math.max(5, project.visualSettings.gridSize);
    return Math.round(val / g) * g;
  };

  const finishDrag = useCallback(() => {
    const d = dragRef.current;
    setActiveSnapHud(null);
    setSelectionBox(null);
    lastBreakKeyRef.current = '';
    setWireBreakPreview(null);
    if (!d) return;
    dragRef.current = null;
    if (d.kind === 'device') {
      onCommitDrag?.(d.moved, d.moved ? { tryWireBreakDeviceId: d.deviceId } : undefined);
    } else if (d.kind === 'annotation' || d.kind === 'wireSegment') {
      onCommitDrag?.(d.moved);
    } else if (d.kind === 'marquee') {
      if (d.moved && d.currentBox) {
        const matched = selectEntitiesInBox(
          sheetDevices,
          sheetWires,
          sheetAnnotations,
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
    onCommitDrag,
    sheetDevices,
    sheetWires,
    sheetAnnotations,
    resolvedLayers,
    project.visualSettings.showGostFrame,
    onSetSelection,
    onSelectDevice,
    onSelectWire,
    onSelectAnnotation,
    onClearPotentialHighlight,
  ]);

  useEffect(() => {
    window.addEventListener('mouseup', finishDrag);
    return () => window.removeEventListener('mouseup', finishDrag);
  }, [finishDrag]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
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
  }, [wireStart, tool, isFocused, onSetTool]);

  // Cursor-centered non-passive wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) === 0 && Math.abs(e.deltaX) === 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const curZoom = zoomRef.current;
      const curPan = panRef.current;
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
      if (onSetTransformRef.current) {
        onSetTransformRef.current(nextZoom, nextPan);
      } else {
        onSetZoomRef.current(nextZoom);
        onSetPanRef.current(nextPan);
      }
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const handleMouseDownBg = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || tool === 'pan') {
      if (e.button === 1) {
        e.preventDefault();
      } else {
        onFocusViewport?.();
      }
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        moved: false,
      };
      return;
    }
    onFocusViewport?.();
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
        const world = toWorld(e.clientX, e.clientY);
        const anchorPt: WirePoint = {
          x: e.altKey ? world.x : snap(world.x),
          y: e.altKey ? world.y : snap(world.y),
        };
        setWireAnchors((prev) => [...prev, anchorPt]);
        return;
      }
      setWireStart(null);
      setWireAnchors([]);
      return;
    }
    if ((tool === 'text' || tool === 'rect' || tool === 'callout') && sheet) {
      if (annotationsLocked || !annotationsVisible) return;
      const world = toWorld(e.clientX, e.clientY);
      onCreateAnnotation(sheet.id, tool, snap(world.x), snap(world.y));
      return;
    }
    if (tool === 'offpage' && sheet) {
      if (devicesLocked || !devicesVisible) return;
      const world = toWorld(e.clientX, e.clientY);
      onCreateOffPageAt?.(sheet.id, snap(world.x), snap(world.y));
      return;
    }
    if (tool === 'select' && e.button === 0) {
      const world = toWorld(e.clientX, e.clientY);
      setSelectionBox(null);
      dragRef.current = {
        kind: 'marquee',
        startWorldX: world.x,
        startWorldY: world.y,
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
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        moved: false,
      };
      return;
    }
    e.stopPropagation();
    onFocusViewport?.();
    if (tool === 'pan') {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        moved: false,
      };
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
      const world = toWorld(e.clientX, e.clientY);
      const others: SnapRectEntity[] = sheetDevices
        .filter((d) => d.id !== device.id && d.bindingState !== 'REMOVED_IN_FLUX')
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
        startWorldX: world.x,
        startWorldY: world.y,
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
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        moved: false,
      };
      return;
    }
    e.stopPropagation();
    onFocusViewport?.();
    if (tool === 'pan') {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        moved: false,
      };
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
    const world = toWorld(e.clientX, e.clientY);
    const others: SnapRectEntity[] = [
      ...(devicesVisible
        ? sheetDevices
            .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX')
            .map((d) => ({
              id: d.id,
              designation: d.designation,
              x: d.x,
              y: d.y,
              width: d.width,
              height: d.height,
            }))
        : []),
      ...sheetAnnotations
        .filter((a) => a.id !== ann.id)
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
      startWorldX: world.x,
      startWorldY: world.y,
      origX: ann.x,
      origY: ann.y,
      moved: false,
      others,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const world = rect
      ? {
          x: Math.round((e.clientX - rect.left - pan.x) / zoom),
          y: Math.round((e.clientY - rect.top - pan.y) / zoom),
        }
      : { x: 0, y: 0 };
    const screen = rect
      ? {
          x: Math.round(e.clientX - rect.left),
          y: Math.round(e.clientY - rect.top),
        }
      : { x: 0, y: 0 };
    cursorRef.current = { world, screen, inside: true };

    if (hoverRafRef.current) window.cancelAnimationFrame(hoverRafRef.current);
    hoverRafRef.current = window.requestAnimationFrame(() => {
      hoverRafRef.current = null;
      const cur = cursorRef.current;
      const chEnabled = project.visualSettings.showCrosshair !== false;
      if (containerRef.current) {
        containerRef.current.setAttribute('data-crosshair-active', String(chEnabled && cur.inside));
      }
      if (coordsSpanRef.current) {
        coordsSpanRef.current.textContent = `X:${cur.world.x} Y:${cur.world.y}${isMultiViewport ? '' : ' мм'}`;
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
      if (wireStart) {
        setRubberBandCursor((prev) =>
          prev.x === cur.world.x && prev.y === cur.world.y ? prev : cur.world
        );
      }
    });

    const drag = dragRef.current;
    if (!drag) return;
    const vsCurr = project.visualSettings;
    const magneticEnabled = vsCurr.smartGuides !== false;
    const snapThresholdWorld = Math.max(8, Math.min(18, Math.round(12 / Math.max(0.35, zoom))));

    if (drag.kind === 'pan') {
      drag.moved = true;
      onSetPan({
        x: drag.origPanX + (e.clientX - drag.startX),
        y: drag.origPanY + (e.clientY - drag.startY),
      });
    } else if (drag.kind === 'marquee') {
      const box = normalizeSelectionBox(
        { x: drag.startWorldX, y: drag.startWorldY },
        world
      );
      if (box.width >= 4 || box.height >= 4) {
        drag.moved = true;
        drag.currentBox = box;
        setSelectionBox(box);
      }
    } else if (drag.kind === 'device') {
      const dev = sheetDevices.find((d) => d.id === drag.deviceId);
      const rawX = drag.origX + (world.x - drag.startWorldX);
      const rawY = drag.origY + (world.y - drag.startWorldY);
      if (dev) {
        const res = computeSmartSnap(dev, rawX, rawY, drag.others, {
          gridSize: vsCurr.gridSize,
          snapToGrid: vsCurr.snapToGrid,
          magneticSnap: magneticEnabled,
          bypassAllSnap: e.altKey,
          snapThreshold: snapThresholdWorld,
          sheet,
          wires: wiresVisible ? sheetWires : [],
        });
        setActiveSnapHud({
          entityId: dev.id,
          x: res.x,
          y: res.y,
          width: dev.width,
          guides: res.guides,
          spacingGuides: res.spacingGuides,
          snappedXKind: res.snappedXKind,
          snappedYKind: res.snappedYKind,
          altBypass: e.altKey,
        });
        if (res.x !== drag.origX || res.y !== drag.origY) drag.moved = true;
        if (res.x !== dev.x || res.y !== dev.y) {
          onMoveDevice(drag.deviceId, res.x, res.y);
        }
        const alreadyWired =
          !wiresVisible ||
          wiresLocked ||
          sheetWires.some((w) => w.fromDeviceId === dev.id || w.toDeviceId === dev.id);
        const nextCand =
          !alreadyWired && isTwoPinBreakEligible(dev)
            ? findWireBreakCandidate({ ...dev, x: res.x, y: res.y }, sheetWires)
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
        world,
        vsCurr.gridSize,
        e.altKey ? false : vsCurr.snapToGrid
      );
      if (
        nextPts.length !== drag.origWaypoints.length ||
        nextPts.some((p, i) => p.x !== drag.origWaypoints[i]?.x || p.y !== drag.origWaypoints[i]?.y)
      ) {
        drag.moved = true;
      }
      onPreviewWireWaypoints?.(drag.wireId, nextPts);
    } else if (drag.kind === 'annotation') {
      const ann = sheetAnnotations.find((a) => a.id === drag.annId);
      const rawX = drag.origX + (world.x - drag.startWorldX);
      const rawY = drag.origY + (world.y - drag.startWorldY);
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
            bypassAllSnap: e.altKey,
            snapThreshold: snapThresholdWorld,
            sheet,
          }
        );
        setActiveSnapHud({
          entityId: ann.id,
          x: res.x,
          y: res.y,
          width: ann.width,
          guides: res.guides,
          spacingGuides: res.spacingGuides,
          snappedXKind: res.snappedXKind,
          snappedYKind: res.snappedYKind,
          altBypass: e.altKey,
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
        setHoveredPin((prev) => (prev && prev.deviceId === device.id ? null : prev));
        return;
      }
      const pin = device.pins.find((p) => p.id === pinId);
      if (!pin) return;
      const abs = getAbsolutePinPos(device, pin);
      setHoveredPin({
        deviceId: device.id,
        pinId: pin.id,
        x: abs.x,
        y: abs.y,
        direction: abs.direction,
      });
    },
    []
  );

  const handlePinClick = (e: React.MouseEvent, device: E3Device, pinId: string) => {
    e.stopPropagation();
    onFocusViewport?.();
    if (wiresLocked || !wiresVisible) return;
    const pin = device.pins.find((p) => p.id === pinId);
    if (!pin) return;
    const abs = getAbsolutePinPos(device, pin);

    if (!wireStart) {
      setWireAnchors([]);
      setWireStart({
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
              { x: abs.x, y: abs.y, direction: abs.direction }
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
    const rawX = world.x - item.width / 2;
    const rawY = world.y - item.height / 2;
    const others: SnapRectEntity[] = (devicesVisible ? sheetDevices : [])
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
        sheet,
      }
    );
    onDropCatalogItem(item, snapped.x, snapped.y, sheet.id);
  };

  const previewWirePoints = useMemo(() => {
    if (!wireStart) return '';
    const obstacles = sheetDevices
      .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
      .map((d) => getDeviceBounds(d));
    const occupied = sheetWires.flatMap((w) => extractWireSegments(w.waypoints, w.netName));
    const sheetBounds = getSheetDrawableBounds(sheet);
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
            targetEndpoint
          )
        : autoRouteOrthogonal(
            { x: wireStart.x, y: wireStart.y, direction: wireStart.direction, deviceId: wireStart.deviceId },
            targetEndpoint,
            20,
            obstacles,
            0,
            occupied,
            { sheetBounds }
          );
    return pts.map((p) => `${p.x},${p.y}`).join(' ');
  }, [wireStart, wireAnchors, hoveredPin, rubberBandCursor, sheetDevices, sheetWires, sheet]);

  const gostGeom = useMemo(
    () => (sheet ? buildGostSheetGeometry(sheet, project) : null),
    [sheet, project.name, project.customStampTemplates, project.sheets.length]
  );

  const junctionDots = useMemo(() => computeWireJunctionDots(sheetWires), [sheetWires]);

  const vs = project.visualSettings;
  const crossingArcs = useMemo(
    () => (vs.wireCrossingBridge !== false ? computeWireCrossingArcs(sheetWires, junctionDots) : []),
    [sheetWires, junctionDots, vs.wireCrossingBridge]
  );
  const wireLabelMap = useMemo(
    () => computeWireLabelPositions(sheetWires, sheetDevices),
    [sheetWires, sheetDevices]
  );

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
  const gridPatternId = `flux-cad-grid-vp-${viewportIndex}`;

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
      onAuxClick={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      className={`flex-1 w-full h-full min-w-0 min-h-0 flex flex-col bg-[var(--flux-canvas-bg)] relative ${
        isMultiViewport
          ? `border rounded-sm overflow-hidden ${
              isFocused ? 'border-[var(--flux-accent)] ring-1 ring-[var(--flux-accent)]/40' : 'border-[var(--flux-line)]'
            }`
          : ''
      }`}
    >
      {/* Sheet Tabs Bar (single) OR Compact Viewport Header (multi-viewport) */}
      {isMultiViewport ? (
        <div className="no-print h-6 shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] px-1.5 flex items-center justify-between gap-2 relative z-20">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-mono text-[10px] px-1 py-0 rounded-[2px] shrink-0 ${
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
              onChange={(e) => {
                onFocusViewport?.();
                onSelectSheet(e.target.value);
              }}
              className="h-[18px] px-1 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] font-medium text-[var(--flux-text)] max-w-[230px] truncate"
            >
              {project.sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  Лист {s.number}: {s.name} ({getSheetRevisionLabel(s)}{hasSheetUncommittedChanges(project, s) ? '*' : ''} · {s.format})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono tabular-nums text-[var(--flux-text-muted)]">
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
                className={`inline-flex items-center gap-1 h-[18px] px-1.5 rounded-[2px] border text-[10px] font-medium transition-colors ${
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
                  anchorRef={layerBtnRef}
                  onClose={() => setLayerPopoverOpen(false)}
                  onToggleVisibility={onToggleLayerVisibility}
                  onToggleLock={onToggleLayerLock}
                  onShowAll={() => onShowAllLayers?.()}
                  onUnlockAll={() => onUnlockAllLayers?.()}
                />
              )}
            </div>
            <span className="inline-block w-9 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
            <span className="inline-block min-w-[40px] text-right tabular-nums">Эл:{sheetDevices.length}</span>
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
                className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[2px] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="no-print h-7 shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] pr-2 flex items-center justify-between gap-2 relative z-20">
          <div className="flex items-center min-w-0 flex-1 overflow-hidden h-full">
            <div className="flex items-center min-w-0 overflow-x-auto no-scrollbar h-full divide-x divide-[var(--flux-line)] border-r border-[var(--flux-line)]">
              {project.sheets.map((s) => {
                const active = s.id === sheet?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-testid={`sheet-tab-${s.id}`}
                    onClick={() => onSelectSheet(s.id)}
                    title={`Лист ${s.number}: ${s.name} (${s.format})`}
                    className={`relative h-full px-2.5 max-w-[200px] text-[11.5px] transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 border-t-2 ${
                      active
                        ? 'bg-[var(--flux-surface)] border-t-[var(--flux-accent)] text-[var(--flux-text)] font-semibold'
                        : 'bg-[var(--flux-surface-alt)] border-t-transparent text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] font-medium'
                    }`}
                  >
                    <span className="truncate">
                      Лист {s.number}: {s.name}
                    </span>
                    <span
                      data-testid={`sheet-tab-rev-${s.id}`}
                      className={`font-mono tabular-nums text-[10px] shrink-0 ${
                        active
                          ? 'text-[var(--flux-accent)] font-semibold'
                          : 'text-[var(--flux-text-muted)]'
                      }`}
                    >
                      {getSheetRevisionLabel(s)}
                      {hasSheetUncommittedChanges(project, s) ? '*' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onAddSheet}
              aria-label="Добавить новый лист схемы"
              className="inline-flex items-center gap-1 h-5 px-2 ml-1.5 rounded-[2px] text-[11px] font-medium text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] whitespace-nowrap shrink-0 border border-transparent hover:border-[var(--flux-line)]"
            >
              <Plus className="w-3 h-3" />
              <span>Лист</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--flux-text-muted)] shrink-0">
            <span className="hidden md:inline-block min-w-[56px] font-mono tabular-nums">Эл.: {sheetDevices.length}</span>
            <span className="hidden md:inline-block min-w-[70px] font-mono tabular-nums">Связи: {sheetWires.length}</span>

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
                className={`inline-flex items-center gap-1 h-5 px-2 rounded-[2px] border text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0
                    ? 'border-[var(--flux-accent)] bg-[var(--flux-sel)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                }`}
              >
                <Layers className={`w-3 h-3 shrink-0 ${layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0 ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'}`} />
                <span>Слои</span>
                <span className="font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)]">
                  {layerSummary.visibleCount}/{layerSummary.total}
                </span>
                {layerSummary.lockedCount > 0 && (
                  <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
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
            const virtualDev = {
              id: '__drag_2pin__',
              sheetId: sheet.id,
              x: world.x - 30,
              y: world.y - 40,
              width: 60,
              height: 80,
              category: 'breaker' as const,
              pins: [
                { id: 'p1', name: '1', dx: 30, dy: 0, direction: 'top' as const, signalType: 'power' as const },
                { id: 'p2', name: '2', dx: 30, dy: 80, direction: 'bottom' as const, signalType: 'power' as const },
              ],
            };
            const nextCand = findWireBreakCandidate(virtualDev, sheetWires);
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
        className="flex-1 min-h-0 overflow-hidden relative"
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
        <svg
          width="100%"
          height="100%"
          onMouseDown={handleMouseDownBg}
          onMouseMove={handleMouseMove}
          onMouseUp={finishDrag}
          onContextMenu={(e) => {
            if (wireStart) e.preventDefault();
          }}
          className="block w-full h-full"
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

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Sheet Paper & Grid */}
            {sheet && (
              <g>
                <rect
                  x={6}
                  y={6}
                  width={sheet.width}
                  height={sheet.height}
                  fill="rgba(15, 23, 42, 0.08)"
                  pointerEvents="none"
                />
                <rect
                  x={0}
                  y={0}
                  width={sheet.width}
                  height={sheet.height}
                  fill="var(--flux-surface)"
                  stroke="var(--flux-line-strong)"
                  strokeWidth={1.5}
                />
                {vs.showGrid && (
                  <rect
                    x={0}
                    y={0}
                    width={sheet.width}
                    height={sheet.height}
                    fill={`url(#${gridPatternId})`}
                  />
                )}

                {/* GOST 2.104-2006 Frame, Zones, Left Archival Strip & Editable Form 1/2a Title Block */}
                {frameVisible && gostGeom && (
                  <g data-testid="layer-group-frame">
                    {/* Outer paper border & inner main GOST frame */}
                    <rect
                      data-testid="gost-main-frame"
                      x={gostGeom.frame.left}
                      y={gostGeom.frame.top}
                      width={gostGeom.frame.width}
                      height={gostGeom.frame.height}
                      fill="none"
                      stroke="var(--flux-text)"
                      strokeWidth={frameSw}
                      pointerEvents="none"
                    />
                    <rect
                      x={4}
                      y={4}
                      width={sheet.width - 8}
                      height={sheet.height - 8}
                      fill="none"
                      stroke="var(--flux-line-strong)"
                      strokeWidth={frameThinSw}
                      pointerEvents="none"
                    />
                    {/* Top Coordinate Zones 1..6 */}
                    {['1', '2', '3', '4', '5', '6'].map((zoneNum, zi, arr) => {
                      const spanW = gostGeom.frame.width / arr.length;
                      const zx = gostGeom.frame.left + zi * spanW;
                      return (
                        <g key={`z-top-${zoneNum}`} pointerEvents="none">
                          {zi > 0 && (
                            <line
                              x1={zx}
                              y1={4}
                              x2={zx}
                              y2={gostGeom.frame.top}
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
                      const spanH = gostGeom.frame.height / arr.length;
                      const zy = gostGeom.frame.top + zi * spanH;
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
                    {gostGeom.archivalBox.visible && (
                    <g pointerEvents="none">
                      <rect
                        x={gostGeom.archivalBox.x}
                        y={gostGeom.archivalBox.y}
                        width={gostGeom.archivalBox.width}
                        height={gostGeom.archivalBox.height}
                        fill="var(--flux-surface)"
                        stroke="var(--flux-text)"
                        strokeWidth={Math.max(0.5, Number((frameSw * 0.68).toFixed(2)))}
                      />
                      <line
                        x1={gostGeom.archivalBox.x + 17}
                        y1={gostGeom.archivalBox.y}
                        x2={gostGeom.archivalBox.x + 17}
                        y2={gostGeom.archivalBox.y + gostGeom.archivalBox.height}
                        stroke="var(--flux-text)"
                        strokeWidth={stampThinSw}
                      />
                      {(() => {
                        let curY = gostGeom.archivalBox.y;
                        return gostGeom.archivalBox.rows.map((r, ri) => {
                          const rowY = curY;
                          curY += r.h;
                          return (
                            <g key={`arch-${ri}`}>
                              {ri > 0 && (
                                <line
                                  x1={gostGeom.archivalBox.x}
                                  y1={rowY}
                                  x2={gostGeom.archivalBox.x + gostGeom.archivalBox.width}
                                  y2={rowY}
                                  stroke="var(--flux-text)"
                                  strokeWidth={stampThinSw}
                                />
                              )}
                              <text
                                transform={`translate(${gostGeom.archivalBox.x + 12}, ${rowY + r.h / 2}) rotate(-90)`}
                                textAnchor="middle"
                                fill="var(--flux-text-muted)"
                                fontSize={7.5}
                                fontFamily={fontCss}
                              >
                                {r.label}
                              </text>
                              {r.value && (
                                <text
                                  transform={`translate(${gostGeom.archivalBox.x + 30}, ${rowY + r.h / 2}) rotate(-90)`}
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
                        x={gostGeom.stamp.x}
                        y={gostGeom.stamp.y}
                        width={gostGeom.stamp.width}
                        height={gostGeom.stamp.height}
                        fill="var(--flux-surface)"
                        stroke="var(--flux-text)"
                        strokeWidth={frameSw}
                      />
                      {gostGeom.stamp.lines.map((ln, li) => (
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
                      {gostGeom.stamp.cells.map((cell) => {
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
                        const clipId = `vp-${viewportIndex}-st-clip-${cell.id}`;
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
                            }}
                            onDoubleClick={(e) => {
                              if (!isEditable || !cell.fieldKey) return;
                              e.stopPropagation();
                              onFocusViewport?.();
                              openInPlaceEdit({
                                kind: 'stamp',
                                id: cell.id,
                                sheetId: sheet.id,
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
                          if (frameLocked) return;
                          onOpenStampEditor?.(sheet.id);
                        }}
                      >
                        <rect
                          x={gostGeom.stamp.x}
                          y={gostGeom.stamp.y - 18}
                          width={gostGeom.stamp.form === 'custom' ? 182 : 126}
                          height={16}
                          rx={2}
                          fill="var(--flux-surface)"
                          stroke={frameLocked ? '#d97706' : 'var(--flux-accent)'}
                          strokeWidth={0.9}
                        />
                        <text
                          x={gostGeom.stamp.x + (gostGeom.stamp.form === 'custom' ? 91 : 63)}
                          y={gostGeom.stamp.y - 7}
                          textAnchor="middle"
                          fill={frameLocked ? '#b45309' : 'var(--flux-accent)'}
                          fontSize={8.5}
                          fontFamily={fontCss}
                          fontWeight={600}
                        >
                          {frameLocked
                            ? 'БЛОК: Штамп'
                            : gostGeom.stamp.form === 'custom'
                              ? `Штамп: ${(gostGeom.stamp.templateName || 'Свой штамп').slice(0, 22)}`
                              : `Штамп (${gostGeom.stamp.form === 'form1' ? 'Форма 1' : 'Форма 2а'})`}
                        </text>
                      </g>
                    </g>
                  </g>
                )}
              </g>
            )}

            {/* Drafting Zones / Annotations (under wires/devices for rect zones) */}
            {annotationsVisible && (
              <g data-testid="layer-group-annotations">
                {sheetAnnotations.map((ann) => {
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
                {sheetWires.map((wire: E3Wire) => {
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
                    wireLabelMap.get(wire.id) ||
                    (wire.waypoints.length >= 2
                      ? {
                          x: Math.round((wire.waypoints[0].x + wire.waypoints[1].x) / 2),
                          y: Math.round((wire.waypoints[0].y + wire.waypoints[1].y) / 2),
                        }
                      : wire.waypoints[0]);
                  const wireArcs = crossingArcs.filter((a) => a.wireId === wire.id);
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
                      onMouseEnter={() => setHoveredWireId(wire.id)}
                      onMouseLeave={() => setHoveredWireId((prev) => (prev === wire.id ? null : prev))}
                      onMouseDown={(e) => {
                        if (e.button === 0 && tool !== 'pan') {
                          e.stopPropagation();
                          onFocusViewport?.();
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
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
                        <polyline
                          points={pts}
                          fill="none"
                          stroke={netSigColor}
                          strokeOpacity={0.34}
                          strokeWidth={vs.wireWidth + 7}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          pointerEvents="none"
                        />
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
                {junctionDots.map((dot, idx) => (
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
                  const selWire = sheetWires.find((w) => w.id === selWireId);
                  if (!selWire) return null;
                  const handles = extractWireSegmentHandles(selWire.waypoints, 8);
                  const inv = 1 / Math.max(0.25, zoom);
                  const gripHalf = Math.max(3.5, Math.min(8, 4.5 * inv));
                  const selMidPt =
                    wireLabelMap.get(selWire.id) ||
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
                            onBeginDrag?.();
                            dragRef.current = {
                              kind: 'wireSegment',
                              wireId: selWire.id,
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
                    {sheetWires.map((wire: E3Wire) => {
                      const midPt =
                        wireLabelMap.get(wire.id) ||
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
                          onMouseEnter={() => setHoveredWireId(wire.id)}
                          onMouseLeave={() => setHoveredWireId((prev) => (prev === wire.id ? null : prev))}
                          onMouseDown={(e) => {
                            if (e.button === 0 && tool !== 'pan') {
                              e.stopPropagation();
                              onFocusViewport?.();
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
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

                {/* Live Rubber-band Wire Preview + Step-by-Step Waypoint Anchors */}
                {wireStart && previewWirePoints && (
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
                  </g>
                )}

                {/* Auto Wire Break Highlight when dragging 2-pin device over a wire */}
                {wireBreakPreview && (() => {
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
                {sheetDevices.slice(0, 1200).map((device) => {
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
                      connectedPinKeys={connectedPinKeys}
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
                {sheetAnnotations
                  .filter((ann) => ann.kind === 'bom_table' || ann.kind === 'cable_table')
                  .map((ann) => {
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
                    const table = buildGostTableRenderModel(ann, project);
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

            {/* AutoCAD Window (blue solid) / Crossing (green dashed) Marquee Selection */}
            {selectionBox && (
              <rect
                data-testid="selection-marquee"
                data-mode={selectionBox.mode}
                x={selectionBox.x}
                y={selectionBox.y}
                width={selectionBox.width}
                height={selectionBox.height}
                fill={
                  selectionBox.mode === 'window'
                    ? 'rgba(37, 99, 235, 0.09)'
                    : 'rgba(22, 163, 74, 0.10)'
                }
                stroke={selectionBox.mode === 'window' ? '#2563eb' : '#16a34a'}
                strokeWidth={1.3 / Math.max(0.25, zoom)}
                strokeDasharray={
                  selectionBox.mode === 'crossing'
                    ? `${5 / Math.max(0.25, zoom)} ${3 / Math.max(0.25, zoom)}`
                    : undefined
                }
                pointerEvents="none"
              />
            )}

            {/* CAD Magnetic Alignment Guides, Pin Anchors & Spacing Cadence */}
            {activeSnapHud && (
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
            )}
          </g>

          {/* Global CAD Crosshair Cursor Overlay (full-viewport screen-space hairlines, updated imperatively via rAF) */}
          {vs.showCrosshair !== false && (
            <g
              ref={crosshairGroupRef}
              data-testid={viewportIndex === 0 ? 'canvas-crosshair' : `canvas-crosshair-${viewportIndex}`}
              data-screen-x={0}
              data-screen-y={0}
              data-world-x={0}
              data-world-y={0}
              style={{ display: 'none' }}
              pointerEvents="none"
            >
              <line
                ref={crossHLeftRef}
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
                ref={crossHRightRef}
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
                ref={crossVTopRef}
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
                ref={crossVBotRef}
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
                ref={crossRectRef}
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
        </svg>

        {/* Floating Potential Signal Trace HUD */}
        {activeTrace && viewportIndex === 0 && (
          <div
            data-testid="potential-trace-hud"
            onMouseDown={(e) => e.stopPropagation()}
            className="no-print absolute top-2 right-2 z-20 flex items-center gap-2 px-2 py-1 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-sm text-[11px]"
          >
            <span
              className="w-2 h-2 rounded-[1px] shrink-0"
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
                      onClick={() => onSelectSheet(sh.id)}
                      className={`h-5 px-1.5 rounded-[2px] font-mono text-[10.5px] font-medium transition-colors ${
                        isCurr
                          ? 'bg-[var(--flux-accent-solid)] text-white'
                          : 'bg-[var(--flux-bg)] border border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
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
                className="inline-flex items-center justify-center w-5 h-5 rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Stage 4.2 In-Place Canvas Text Editor Overlay */}
        {inPlaceEdit && (() => {
          const cw = containerRef.current?.clientWidth || 800;
          const ch = containerRef.current?.clientHeight || 600;
          const boxW = Math.max(
            inPlaceEdit.multiline ? 252 : 176,
            Math.min(380, Math.round(inPlaceEdit.worldW * Math.max(zoom, 0.8)))
          );
          const boxH = inPlaceEdit.multiline
            ? Math.max(58, Math.min(140, Math.round(inPlaceEdit.worldH * Math.max(zoom, 0.85))))
            : Math.max(28, Math.round(inPlaceEdit.worldH * Math.max(zoom, 0.9)));
          const rawLeft = pan.x + inPlaceEdit.worldX * zoom;
          const rawTop = pan.y + inPlaceEdit.worldY * zoom;
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
              <div className="inline-flex items-center justify-between gap-2 px-1.5 py-0.5 rounded-t-[2px] border border-b-0 border-[var(--flux-accent)] bg-[var(--flux-surface-alt)] text-[10px] font-medium text-[var(--flux-accent)] shadow-xs">
                <span className="truncate">{inPlaceEdit.label}</span>
                <span className="font-mono text-[9px] text-[var(--flux-text-muted)] shrink-0">
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
                  className="w-full px-2 py-1 rounded-b-[2px] border border-[var(--flux-accent)] bg-[var(--flux-surface)] text-[12px] font-mono text-[var(--flux-text)] shadow-md focus:outline-none resize-y"
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
                  className="w-full px-2 rounded-b-[2px] border border-[var(--flux-accent)] bg-[var(--flux-surface)] text-[12px] font-mono font-semibold text-[var(--flux-text)] shadow-md focus:outline-none"
                />
              )}
            </div>
          );
        })()}
      </div>

      {/* Compact CAD Canvas Footer Strip */}
      <div className="no-print @container/footer relative h-[26px] px-2 border-t border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex items-center justify-between gap-1.5 shrink-0 overflow-visible select-none text-[11px]">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 font-mono tabular-nums text-[var(--flux-text-muted)]">
          <span
            data-testid="canvas-coords"
            className={`inline-block whitespace-nowrap tabular-nums shrink-0 ${
              isMultiViewport
                ? 'w-[84px] text-[10.5px]'
                : 'w-[108px] @[480px]/footer:w-[124px] text-[10.5px] @[480px]/footer:text-[11px]'
            }`}
          >
            <span ref={coordsSpanRef} />
          </span>
          {sheet && !isMultiViewport && (
            <span className="hidden @[980px]/footer:inline-block w-[132px] whitespace-nowrap truncate shrink-0">
              · {sheet.format} ({sheet.width}×{sheet.height})
            </span>
          )}

          {/* AutoCAD-style Command Line directly next to sheet format & before Grid/Snap/Guides/Crosshair */}
          {(!isMultiViewport || viewportIndex === 0) && (
            <div
              data-testid="cad-command-bar"
              onMouseDown={(e) => e.stopPropagation()}
              className={`relative items-center gap-1 h-[20px] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] focus-within:border-[var(--flux-accent)] transition-colors shrink-0 ${
                isMultiViewport
                  ? 'hidden @[340px]/footer:flex w-[92px] @[430px]/footer:w-[144px] @[560px]/footer:w-[210px]'
                  : 'flex w-[88px] @[480px]/footer:w-[170px] @[640px]/footer:w-[220px] @[840px]/footer:w-[270px] @[1080px]/footer:w-[320px]'
              }`}
            >
              <button
                type="button"
                data-testid="cad-command-icon-btn"
                title="Командная строка САПР (Enter — выполнить, ↑ в конце строки — история команд)"
                aria-label="Фокус на командную строку"
                onClick={() => cmdInputRef.current?.focus()}
                className="inline-flex items-center justify-center text-[var(--flux-accent)] hover:text-[var(--flux-text)] shrink-0"
              >
                <Terminal className="w-3 h-3" />
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
                placeholder={isMultiViewport ? 'Команда…' : 'Команда: НАЙТИ, ПРОВОД, СЕТКА…'}
                aria-label="Командная строка САПР"
                className="w-full min-w-0 bg-transparent text-[11px] font-mono text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)]/70 focus:outline-none select-text"
              />

              {/* Command Feedback Echo Toast */}
              {cmdFeedback && !matchingCmdHints.length && (
                <div
                  data-testid="cad-command-feedback"
                  className={`absolute left-0 bottom-full mb-1 z-40 px-2 py-1 rounded-[2px] border shadow-md text-[11px] font-sans whitespace-nowrap max-w-[380px] truncate ${
                    cmdFeedback.status === 'ok'
                      ? 'bg-[var(--flux-surface)] border-[var(--flux-accent)]/70 text-[var(--flux-text)]'
                      : cmdFeedback.status === 'disabled'
                        ? 'bg-[var(--flux-surface)] border-amber-500/70 text-amber-700 dark:text-amber-300'
                        : 'bg-[var(--flux-surface)] border-rose-500/70 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {cmdFeedback.text}
                </div>
              )}

              {/* Autocomplete Hints Popover */}
              {matchingCmdHints.length > 0 && (
                <div
                  data-testid="cad-command-suggestions"
                  className="absolute left-0 bottom-full mb-1 z-40 w-[340px] max-w-[90vw] rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-lg overflow-hidden divide-y divide-[var(--flux-line)]/60 font-sans"
                >
                  {matchingCmdHints.map((hint) => (
                    <button
                      key={hint.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        executeCanvasCommand(hint.keywords[0] || hint.title);
                      }}
                      className="w-full px-2.5 py-1.5 text-left hover:bg-[var(--flux-hover)] flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-[var(--flux-text)] truncate">{hint.title}</span>
                      {hint.shortcut && (
                        <kbd className="font-mono text-[9.5px] px-1 rounded-[2px] bg-[var(--flux-bg)] border border-[var(--flux-line)] text-[var(--flux-text-muted)] shrink-0">
                          {hint.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {totalSelectedCount > 1 && (
            <span
              data-testid="canvas-selection-count"
              className="hidden @[560px]/footer:inline-flex items-center h-5 px-1.5 rounded-[2px] bg-[var(--flux-sel)] text-[var(--flux-accent)] font-sans font-semibold whitespace-nowrap shrink-0"
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
              className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[2px] border border-[var(--flux-accent)]/50 bg-[var(--flux-sel)] text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] font-sans font-medium whitespace-nowrap shrink-0"
            >
              <span className="max-w-[110px] @[720px]/footer:max-w-none truncate">
                {wireStart
                  ? wireAnchors.length > 0
                    ? `Углов: ${wireAnchors.length} · ПКМ откат · Esc`
                    : 'Клик — угол · Вывод — соединить'
                  : `Режим: ${tool}`}
              </span>
              <X className="w-3 h-3 shrink-0" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 @[520px]/footer:gap-1 shrink-0">
          {onToggleGrid && (
            <button
              type="button"
              onClick={onToggleGrid}
              title="Показать/скрыть чертёжную сетку"
              aria-label="Переключить сетку"
              className={`inline-flex items-center justify-center gap-1 h-5 px-1 @[780px]/footer:px-1.5 rounded-[2px] text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.showGrid
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Grid3X3 className={`w-3 h-3 ${vs.showGrid ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden @[780px]/footer:inline'}>Сетка</span>
            </button>
          )}
          {onToggleSnapToGrid && (
            <button
              type="button"
              data-testid="toggle-snap-grid-btn"
              onClick={onToggleSnapToGrid}
              title="Привязка к чертёжной сетке"
              aria-label="Переключить привязку"
              className={`inline-flex items-center justify-center gap-1 h-5 px-1 @[780px]/footer:px-1.5 rounded-[2px] text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.snapToGrid
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Magnet className={`w-3 h-3 ${vs.snapToGrid ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden @[780px]/footer:inline'}>Привязка</span>
            </button>
          )}
          {onToggleSmartGuides && (
            <button
              type="button"
              data-testid="toggle-smart-guides-btn"
              onClick={onToggleSmartGuides}
              title="Магнитные направляющие выравнивания (удерживайте Alt при перетаскивании для свободного хода)"
              aria-label="Переключить магнитные направляющие"
              className={`inline-flex items-center justify-center gap-1 h-5 px-1 @[780px]/footer:px-1.5 rounded-[2px] text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.smartGuides !== false
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Ruler className={`w-3 h-3 ${vs.smartGuides !== false ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden @[780px]/footer:inline'}>Направл.</span>
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
              className={`inline-flex items-center justify-center gap-1 h-5 px-1 @[780px]/footer:px-1.5 rounded-[2px] text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.showCrosshair !== false
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Crosshair className={`w-3 h-3 ${vs.showCrosshair !== false ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden @[780px]/footer:inline'}>Прицел</span>
            </button>
          )}

          <span className="h-3.5 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={() => onSetZoom(Math.max(0.16, Math.round((zoom - 0.1) * 100) / 100))}
            aria-label="Уменьшить масштаб холста"
            className="inline-flex items-center justify-center w-[18px] @[520px]/footer:w-5 h-5 rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] shrink-0"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span
            data-testid={viewportIndex === 0 ? 'canvas-zoom-value' : `canvas-zoom-value-${viewportIndex}`}
            className={`${isMultiViewport ? 'w-8' : 'w-9 @[520px]/footer:w-10'} text-center font-mono tabular-nums text-[var(--flux-text)] shrink-0`}
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onSetZoom(Math.min(2.5, Math.round((zoom + 0.1) * 100) / 100))}
            aria-label="Увеличить масштаб холста"
            className="inline-flex items-center justify-center w-[18px] @[520px]/footer:w-5 h-5 rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] shrink-0"
          >
            <Plus className="w-3 h-3" />
          </button>
          {onFitViewport && (
            <button
              type="button"
              onClick={onFitViewport}
              title="Вписать лист в окно"
              aria-label="Вписать лист в окно"
              className="inline-flex items-center justify-center w-[18px] @[520px]/footer:w-5 h-5 rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] shrink-0"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
});

SchematicCanvas.displayName = 'SchematicCanvas';
