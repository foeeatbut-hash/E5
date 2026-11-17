import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Circle,
  Copy,
  CopyPlus,
  Crosshair,
  Download,
  FileCode2,
  FlipHorizontal2,
  FlipVertical2,
  Magnet,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  PanelLeft,
  Plus,
  RotateCw,
  Save,
  Scan,
  Spline,
  Square,
  Tag,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { parseDxfToSymbolPrimitives } from '../core/dxfImporter';
import type { CustomSymbolShape, CustomSymbolStrokeStyle, E3Pin, SignalType } from '../core/e3Types';
import type { FocusLayoutMetrics } from '../core/focusLayout';
import type { UiWorkspaceMode } from '../core/uiMode';
import {
  inferPinDirection,
  nextPinName,
  serializeUgoBlockPayload,
  snapSymbolCoord,
  type SymbolEditorTool,
  type SymbolPresetId,
} from '../core/symbolDesigner';
import {
  describeSvgArcPath,
  moveSymbolShape,
  resolveDynamicSymbolText,
  resolveShapeStrokeDasharray,
  STROKE_STYLE_OPTIONS,
  SYMBOL_COLOR_PALETTE,
} from '../core/symbolLibrary';
import type { SymbolWorkspaceActions } from '../core/symbolWorkspaceTypes';

interface SymbolWorkspaceCanvasProps {
  workspace: SymbolWorkspaceActions;
  isDark?: boolean;
  uiMode?: UiWorkspaceMode;
  focusLayout?: FocusLayoutMetrics;
  focusLibraryOpen?: boolean;
  focusInspectorOpen?: boolean;
  onToggleFocusLibrary?: () => void;
  canvasFocusClean?: boolean;
  onToggleCanvasFocusClean?: () => void;
}

type DragInteraction =
  | {
      kind: 'pan';
      startScreenX: number;
      startScreenY: number;
      origPanX: number;
      origPanY: number;
    }
  | {
      kind: 'draw_shape';
      tool: 'line' | 'rect' | 'circle' | 'arc';
      startX: number;
      startY: number;
      curX: number;
      curY: number;
    }
  | {
      kind: 'move_shape';
      shapeId: string;
      startX: number;
      startY: number;
      origShape: CustomSymbolShape;
      curDx: number;
      curDy: number;
    }
  | {
      kind: 'move_vertex';
      shapeId: string;
      vertexIdx: number;
      origPoints: Array<{ x: number; y: number }>;
      curX: number;
      curY: number;
    }
  | {
      kind: 'move_pin';
      pinIdx: number;
      origPin: Omit<E3Pin, 'id'>;
      curX: number;
      curY: number;
    }
  | {
      kind: 'resize_bounds';
      startX: number;
      startY: number;
      origW: number;
      origH: number;
      curW: number;
      curH: number;
    };

const ArcGlyphIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <path
      d="M3 12.5A6.5 6.5 0 0 1 13.5 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="3" cy="12.5" r="1.2" fill="currentColor" />
    <circle cx="13.5" cy="5" r="1.2" fill="currentColor" />
  </svg>
);

const PinGlyphIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <line x1="2" y1="8" x2="8.5" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="11" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const UGO_TOOLS: Array<{
  id: SymbolEditorTool;
  label: string;
  shortcut?: string;
  renderIcon: (cls: string) => React.ReactNode;
}> = [
  {
    id: 'select',
    label: 'Выбор и перенос',
    shortcut: 'V',
    renderIcon: (cls) => <MousePointer2 className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'line',
    label: 'Отрезок',
    shortcut: 'L',
    renderIcon: (cls) => <Minus className={cls} strokeWidth={1.7} />,
  },
  {
    id: 'polyline',
    label: 'Полилиния / Контур',
    shortcut: 'P',
    renderIcon: (cls) => <Spline className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'rect',
    label: 'Прямоугольник',
    shortcut: 'R',
    renderIcon: (cls) => <Square className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'circle',
    label: 'Окружность',
    shortcut: 'C',
    renderIcon: (cls) => <Circle className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'arc',
    label: 'Дуга',
    renderIcon: (cls) => <ArcGlyphIcon className={cls} />,
  },
  {
    id: 'text',
    label: 'Текст на УГО',
    shortcut: 'T',
    renderIcon: (cls) => <Type className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'attr_tag',
    label: 'Динамический тег ({ОУО}, {Артикул})',
    renderIcon: (cls) => <Tag className={cls} strokeWidth={1.65} />,
  },
  {
    id: 'pin',
    label: 'Вывод E3 (Pin)',
    shortcut: 'N',
    renderIcon: (cls) => <PinGlyphIcon className={cls} />,
  },
];

export const SymbolWorkspaceCanvas: React.FC<SymbolWorkspaceCanvasProps> = React.memo(({
  workspace,
  isDark = false,
  uiMode = 'focus',
  focusLayout,
  focusLibraryOpen = false,
  focusInspectorOpen = true,
  onToggleFocusLibrary,
  canvasFocusClean = false,
  onToggleCanvasFocusClean,
}) => {
  const { draft, tabs, activeTabId, origin } = workspace;
  const isFocusMode = uiMode === 'focus';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const coordsHudRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (coordsHudRef.current) coordsHudRef.current.textContent = 'X:0 Y:0 мм';
  }, []);
  const polyPreviewRef = useRef<SVGPolylineElement | null>(null);
  const cursorLocalRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moveRafRef = useRef<number | null>(null);
  const copyNameInputRef = useRef<HTMLInputElement | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(2.2);
  const [pan, setPan] = useState({ x: 260, y: 140 });
  const viewportByTabRef = useRef<Record<string, { zoom: number; pan: { x: number; y: number } }>>({});
  const activeTabKey = activeTabId || draft.symbolId;

  const [polyDraftPoints, setPolyDraftPoints] = useState<Array<{ x: number; y: number }>>([]);
  const polyDraftPointsRef = useRef<Array<{ x: number; y: number }>>(polyDraftPoints);
  polyDraftPointsRef.current = polyDraftPoints;
  const [dragState, setDragState] = useState<DragInteraction | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [copyName, setCopyName] = useState('');
  const [copyBlockName, setCopyBlockName] = useState('');
  const [copyArticle, setCopyArticle] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [importFlash, setImportFlash] = useState<string | null>(null);
  const savedFlashTimerRef = useRef<number | null>(null);
  const importFlashTimerRef = useRef<number | null>(null);
  const dxfFileInputRef = useRef<HTMLInputElement | null>(null);

  const showImportNotice = useCallback((msg: string) => {
    setImportFlash(msg);
    if (importFlashTimerRef.current) window.clearTimeout(importFlashTimerRef.current);
    importFlashTimerRef.current = window.setTimeout(() => setImportFlash(null), 2800);
  }, []);

  const flushPendingPolyline = useCallback(() => {
    const pts = polyDraftPointsRef.current;
    if (pts.length < 2) {
      if (pts.length > 0) setPolyDraftPoints([]);
      return null;
    }
    const nextShape: CustomSymbolShape = {
      id: `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      kind: 'polyline',
      points: pts,
      closed: false,
      filled: false,
      strokeColor: draft.activeStyle.strokeColor,
      strokeWidth: draft.activeStyle.strokeWidth,
      strokeStyle: draft.activeStyle.strokeStyle,
    };
    const nextShapes = [...draft.shapes, nextShape];
    polyDraftPointsRef.current = [];
    setPolyDraftPoints([]);
    workspace.onCommitGeometry(nextShapes, draft.pins);
    workspace.onSelectShape(nextShape.id);
    return {
      shapes: nextShapes,
      pins: draft.pins,
      width: draft.width,
      height: draft.height,
    };
  }, [draft.activeStyle, draft.shapes, draft.pins, draft.width, draft.height, workspace]);

  const flushPendingPolylineRef = useRef(flushPendingPolyline);
  flushPendingPolylineRef.current = flushPendingPolyline;

  useEffect(() => {
    const reg = workspace.onRegisterPreSaveFlush;
    if (!reg) return;
    reg(() => flushPendingPolylineRef.current());
    return () => {
      reg(null);
    };
  }, [workspace.onRegisterPreSaveFlush]);

  const triggerSaveCurrent = useCallback(() => {
    flushPendingPolylineRef.current();
    workspace.onSaveCurrent();
    setSavedFlash(true);
    if (savedFlashTimerRef.current) window.clearTimeout(savedFlashTimerRef.current);
    savedFlashTimerRef.current = window.setTimeout(() => setSavedFlash(false), 1300);
  }, [workspace]);

  const exportBlockJson = useCallback(() => {
    const payload = serializeUgoBlockPayload(draft);
    const jsonText = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(draft.e3BlockName || draft.name || 'ugo_block').replace(/[^a-zA-Z0-9_-]+/g, '_')}.e3blk.json`;
    a.click();
    URL.revokeObjectURL(url);
    showImportNotice(`Экспорт блока: ${draft.e3BlockName || draft.name}`);
  }, [draft, showImportNotice]);

  const handleImportDxfFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const res = parseDxfToSymbolPrimitives(text, {
          gridStep: draft.gridStep || 5,
          snapToGrid: draft.snapToGrid,
        });
        workspace.onCommitGeometry(res.shapes, draft.pins, {
          width: res.width,
          height: res.height,
        });
        requestAnimationFrame(() => fitSymbolViewRef.current());
        showImportNotice(`DXF: импортировано ${res.stats.importedShapes} прим.`);
      } catch (err) {
        showImportNotice(err instanceof Error ? err.message : 'Ошибка чтения DXF');
      }
    },
    [draft.gridStep, draft.snapToGrid, draft.pins, workspace, showImportNotice]
  );

  const fitSymbolView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const reserveLeft =
      isFocusMode && focusLayout
        ? focusLibraryOpen
          ? focusLayout.explorerLeft + focusLayout.explorerWidth + 24
          : focusLayout.toolRailLeft + focusLayout.toolRailWidth + 24
        : 48;
    const reserveRight =
      isFocusMode && focusLayout
        ? focusInspectorOpen
          ? focusLayout.inspectorRight + focusLayout.inspectorWidth + 24
          : 132
        : 48;
    const reserveTop = isFocusMode && focusLayout ? focusLayout.topClearance + 52 : 72;
    const reserveBottom = isFocusMode && focusLayout ? focusLayout.bottomDockClearance + 18 : 56;
    const availW = Math.max(180, rect.width - reserveLeft - reserveRight);
    const availH = Math.max(140, rect.height - reserveTop - reserveBottom);
    const nextZoom = Number(
      Math.max(0.8, Math.min(2.6, Math.min((availW * 0.72) / draft.width, (availH * 0.72) / draft.height))).toFixed(2)
    );
    const centerLeft = reserveLeft + (availW - draft.width * nextZoom) / 2;
    const centerTop = reserveTop + (availH - draft.height * nextZoom) / 2;
    const nextPan = {
      x: Math.round(centerLeft),
      y: Math.round(centerTop),
    };
    setZoom(nextZoom);
    setPan(nextPan);
    if (activeTabKey) {
      viewportByTabRef.current[activeTabKey] = { zoom: nextZoom, pan: nextPan };
    }
  }, [
    draft.width,
    draft.height,
    isFocusMode,
    focusLibraryOpen,
    focusInspectorOpen,
    focusLayout,
    activeTabKey,
  ]);

  const fitSymbolViewRef = useRef(fitSymbolView);
  fitSymbolViewRef.current = fitSymbolView;
  const restoredTabKeyRef = useRef<string | null>(null);

  // Restore saved viewport on tab switch, or fit cleanly on first open of each tab
  useEffect(() => {
    setPolyDraftPoints([]);
    setDragState(null);
    restoredTabKeyRef.current = activeTabKey;
    const saved = activeTabKey ? viewportByTabRef.current[activeTabKey] : undefined;
    if (saved) {
      setZoom(saved.zoom);
      setPan(saved.pan);
      return;
    }
    const raf = requestAnimationFrame(() => fitSymbolViewRef.current());
    return () => cancelAnimationFrame(raf);
  }, [draft.open, activeTabKey]);

  // Persist viewport transform after initial restore/fit for the active tab
  useEffect(() => {
    if (activeTabKey && restoredTabKeyRef.current === activeTabKey) {
      if (viewportByTabRef.current[activeTabKey]) {
        viewportByTabRef.current[activeTabKey] = { zoom, pan };
      }
    }
  }, [activeTabKey, zoom, pan]);

  const prevDrawerFlagsRef = useRef({ lib: focusLibraryOpen, insp: focusInspectorOpen });
  useEffect(() => {
    const prev = prevDrawerFlagsRef.current;
    if (prev.lib === focusLibraryOpen && prev.insp === focusInspectorOpen) return;
    prevDrawerFlagsRef.current = { lib: focusLibraryOpen, insp: focusInspectorOpen };
    if (!isFocusMode || !draft.open) return;
    const raf = requestAnimationFrame(() => fitSymbolViewRef.current());
    return () => cancelAnimationFrame(raf);
  }, [isFocusMode, draft.open, focusLibraryOpen, focusInspectorOpen]);

  useEffect(() => {
    return () => {
      if (moveRafRef.current) cancelAnimationFrame(moveRafRef.current);
      if (savedFlashTimerRef.current) window.clearTimeout(savedFlashTimerRef.current);
      if (importFlashTimerRef.current) window.clearTimeout(importFlashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (draft.tool !== 'polyline') {
      setPolyDraftPoints([]);
    }
  }, [draft.tool]);

  const toSymbolCoords = useCallback(
    (clientX: number, clientY: number, applySnap = true) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const rawX = (clientX - rect.left - pan.x) / zoom;
      const rawY = (clientY - rect.top - pan.y) / zoom;
      if (applySnap && draft.snapToGrid) {
        return {
          x: snapSymbolCoord(rawX, draft.gridStep),
          y: snapSymbolCoord(rawY, draft.gridStep),
        };
      }
      return { x: Math.round(rawX), y: Math.round(rawY) };
    },
    [pan, zoom, draft.snapToGrid, draft.gridStep]
  );

  const finalizePolyline = useCallback(
    (pts: Array<{ x: number; y: number }>, closed = false) => {
      if (pts.length < 2) {
        setPolyDraftPoints([]);
        return;
      }
      const nextShape: CustomSymbolShape = {
        id: `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        kind: 'polyline',
        points: pts,
        closed,
        filled: closed ? draft.activeStyle.filled : false,
        fillColor: closed && draft.activeStyle.filled ? draft.activeStyle.fillColor : undefined,
        strokeColor: draft.activeStyle.strokeColor,
        strokeWidth: draft.activeStyle.strokeWidth,
        strokeStyle: draft.activeStyle.strokeStyle,
      };
      workspace.onCommitGeometry([...draft.shapes, nextShape], draft.pins);
      workspace.onSelectShape(nextShape.id);
      setPolyDraftPoints([]);
    },
    [draft.activeStyle, draft.shapes, draft.pins, workspace]
  );

  // Keyboard shortcuts inside symbol drafting workspace
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) workspace.onRedo();
        else workspace.onUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        workspace.onRedo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        triggerSaveCurrent();
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        workspace.onToggleSnap();
        return;
      }
      if (e.key === 'Enter' && draft.tool === 'polyline' && polyDraftPoints.length >= 2) {
        e.preventDefault();
        finalizePolyline(polyDraftPoints, false);
        return;
      }
      if (e.key === 'Escape') {
        if (polyDraftPoints.length > 0) {
          setPolyDraftPoints([]);
        } else if (draft.selectedShapeId || draft.selectedPinIndex !== null) {
          workspace.onSelectShape(null);
          workspace.onSelectPin(null);
        } else {
          workspace.onSetTool('select');
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (draft.selectedShapeId || draft.selectedPinIndex !== null) {
          e.preventDefault();
          workspace.onDeleteSelection();
        }
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'v') workspace.onSetTool('select');
        else if (k === 'l') workspace.onSetTool('line');
        else if (k === 'p') workspace.onSetTool('polyline');
        else if (k === 'r') workspace.onSetTool('rect');
        else if (k === 'c') workspace.onSetTool('circle');
        else if (k === 't') workspace.onSetTool('text');
        else if (k === 'n') workspace.onSetTool('pin');
        else if (k === 'z') fitSymbolViewRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    draft.tool,
    draft.selectedShapeId,
    draft.selectedPinIndex,
    polyDraftPoints,
    finalizePolyline,
    triggerSaveCurrent,
    workspace,
  ]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = Math.max(0.4, Math.min(5, Number((zoom * factor).toFixed(3))));
    const worldX = (mx - pan.x) / zoom;
    const worldY = (my - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({
      x: Math.round(mx - worldX * nextZoom),
      y: Math.round(my - worldY * nextZoom),
    });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setDragState({
        kind: 'pan',
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      });
      return;
    }

    if (e.button === 2 && draft.tool === 'polyline' && polyDraftPoints.length >= 2) {
      e.preventDefault();
      finalizePolyline(polyDraftPoints, false);
      return;
    }

    if (e.button !== 0) return;

    const pt = toSymbolCoords(e.clientX, e.clientY, true);
    const idPrefix = `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

    if (draft.tool === 'select') {
      workspace.onSelectShape(null);
      workspace.onSelectPin(null);
      return;
    }

    if (draft.tool === 'polyline') {
      setPolyDraftPoints((prev) => [...prev, pt]);
      return;
    }

    if (draft.tool === 'text' || draft.tool === 'attr_tag') {
      const isTag = draft.tool === 'attr_tag';
      const attrKey = isTag ? draft.activeAttrTagKey || 'designation' : undefined;
      const defaultTxt = isTag
        ? attrKey === 'designation'
          ? '{designation}'
          : attrKey === 'article'
            ? '{article}'
            : attrKey === 'componentName'
              ? '{componentName}'
              : `{${attrKey}}`
        : 'УГО';
      const nextShape: CustomSymbolShape = {
        id: idPrefix,
        kind: 'text',
        x: pt.x,
        y: pt.y,
        text: defaultTxt,
        attrKey,
        fontSize: isTag ? 10 : 11,
        bold: isTag,
        strokeColor: draft.activeStyle.strokeColor,
        align: 'center',
      };
      workspace.onCommitGeometry([...draft.shapes, nextShape], draft.pins);
      workspace.onSelectShape(nextShape.id);
      workspace.onSetTool('select');
      return;
    }

    if (draft.tool === 'pin') {
      const dx = Math.max(0, Math.min(draft.width, pt.x));
      const dy = Math.max(0, Math.min(draft.height, pt.y));
      const nextPin: Omit<E3Pin, 'id'> = {
        name: nextPinName(draft.pins),
        dx,
        dy,
        direction: inferPinDirection(dx, dy, draft.width, draft.height),
        signalType: draft.activePinSignal || 'signal',
      };
      const nextPins = [...draft.pins, nextPin];
      workspace.onCommitGeometry(draft.shapes, nextPins);
      workspace.onSelectPin(nextPins.length - 1);
      return;
    }

    if (
      draft.tool === 'line' ||
      draft.tool === 'rect' ||
      draft.tool === 'circle' ||
      draft.tool === 'arc'
    ) {
      setDragState({
        kind: 'draw_shape',
        tool: draft.tool,
        startX: pt.x,
        startY: pt.y,
        curX: pt.x,
        curY: pt.y,
      });
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const clientX = e.clientX;
    const clientY = e.clientY;
    const pt = toSymbolCoords(clientX, clientY, true);
    cursorLocalRef.current = pt;

    if (moveRafRef.current) cancelAnimationFrame(moveRafRef.current);
    moveRafRef.current = requestAnimationFrame(() => {
      moveRafRef.current = null;
      if (coordsHudRef.current) {
        coordsHudRef.current.textContent = `X:${pt.x} Y:${pt.y} мм`;
      }
      if (polyPreviewRef.current && polyDraftPoints.length > 0) {
        const ptsStr = [...polyDraftPoints, pt].map((p) => `${p.x},${p.y}`).join(' ');
        polyPreviewRef.current.setAttribute('points', ptsStr);
      }
    });

    if (!dragState) return;
    if (dragState.kind === 'pan') {
      setPan({
        x: dragState.origPanX + (clientX - dragState.startScreenX),
        y: dragState.origPanY + (clientY - dragState.startScreenY),
      });
      return;
    }
    if (dragState.kind === 'draw_shape') {
      setDragState({ ...dragState, curX: pt.x, curY: pt.y });
      return;
    }
    if (dragState.kind === 'move_shape') {
      const dx = pt.x - dragState.startX;
      const dy = pt.y - dragState.startY;
      setDragState({ ...dragState, curDx: dx, curDy: dy });
      return;
    }
    if (dragState.kind === 'move_vertex') {
      setDragState({ ...dragState, curX: pt.x, curY: pt.y });
      return;
    }
    if (dragState.kind === 'move_pin') {
      const dx = Math.max(0, Math.min(draft.width, pt.x));
      const dy = Math.max(0, Math.min(draft.height, pt.y));
      setDragState({ ...dragState, curX: dx, curY: dy });
      return;
    }
    if (dragState.kind === 'resize_bounds') {
      const nextW = Math.max(40, Math.min(480, snapSymbolCoord(dragState.origW + (pt.x - dragState.startX), 10)));
      const nextH = Math.max(40, Math.min(480, snapSymbolCoord(dragState.origH + (pt.y - dragState.startY), 10)));
      setDragState({ ...dragState, curW: nextW, curH: nextH });
    }
  };

  const handleCanvasMouseUp = () => {
    if (!dragState) return;
    if (dragState.kind === 'draw_shape') {
      const { startX, startY, curX, curY, tool } = dragState;
      const dist = Math.hypot(curX - startX, curY - startY);
      const id = `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const baseStyle = {
        strokeColor: draft.activeStyle.strokeColor,
        strokeWidth: draft.activeStyle.strokeWidth,
        strokeStyle: draft.activeStyle.strokeStyle,
      };
      let created: CustomSymbolShape | null = null;
      if (tool === 'line' && dist >= 3) {
        created = { id, kind: 'line', x1: startX, y1: startY, x2: curX, y2: curY, ...baseStyle };
      } else if (tool === 'rect' && Math.abs(curX - startX) >= 4 && Math.abs(curY - startY) >= 4) {
        created = {
          id,
          kind: 'rect',
          x: Math.min(startX, curX),
          y: Math.min(startY, curY),
          width: Math.abs(curX - startX),
          height: Math.abs(curY - startY),
          filled: draft.activeStyle.filled,
          fillColor: draft.activeStyle.filled ? draft.activeStyle.fillColor : undefined,
          ...baseStyle,
        };
      } else if (tool === 'circle') {
        const r = Math.max(8, Math.round(dist || 18));
        created = {
          id,
          kind: 'circle',
          cx: startX,
          cy: startY,
          r,
          filled: draft.activeStyle.filled,
          fillColor: draft.activeStyle.filled ? draft.activeStyle.fillColor : undefined,
          ...baseStyle,
        };
      } else if (tool === 'arc') {
        const r = Math.max(10, Math.round(dist || 20));
        const endDeg = Math.round((Math.atan2(curY - startY, curX - startX) * 180) / Math.PI);
        created = {
          id,
          kind: 'arc',
          cx: startX,
          cy: startY,
          r,
          startAngle: dist >= 5 ? endDeg - 90 : 180,
          endAngle: dist >= 5 ? endDeg + 90 : 360,
          ...baseStyle,
        };
      }
      if (created) {
        workspace.onCommitGeometry([...draft.shapes, created], draft.pins);
        workspace.onSelectShape(created.id);
      }
    } else if (dragState.kind === 'move_shape') {
      if (dragState.curDx !== 0 || dragState.curDy !== 0) {
        const moved = moveSymbolShape(dragState.origShape, dragState.curDx, dragState.curDy);
        const nextShapes = draft.shapes.map((s) => (s.id === dragState.shapeId ? moved : s));
        workspace.onCommitGeometry(nextShapes, draft.pins);
      }
    } else if (dragState.kind === 'move_vertex') {
      const origPt = dragState.origPoints[dragState.vertexIdx];
      if (!origPt || origPt.x !== dragState.curX || origPt.y !== dragState.curY) {
        const nextShapes = draft.shapes.map((sh) => {
          if (sh.id !== dragState.shapeId || sh.kind !== 'polyline') return sh;
          const pts = dragState.origPoints.map((p, idx) =>
            idx === dragState.vertexIdx ? { x: dragState.curX, y: dragState.curY } : p
          );
          return { ...sh, points: pts };
        });
        workspace.onCommitGeometry(nextShapes, draft.pins);
      }
    } else if (dragState.kind === 'move_pin') {
      if (dragState.origPin.dx !== dragState.curX || dragState.origPin.dy !== dragState.curY) {
        const nextPins = draft.pins.map((p, idx) =>
          idx === dragState.pinIdx
            ? {
                ...p,
                dx: dragState.curX,
                dy: dragState.curY,
                direction: inferPinDirection(dragState.curX, dragState.curY, draft.width, draft.height),
              }
            : p
        );
        workspace.onCommitGeometry(draft.shapes, nextPins);
      }
    } else if (dragState.kind === 'resize_bounds') {
      if (dragState.curW !== dragState.origW || dragState.curH !== dragState.origH) {
        workspace.onCommitGeometry(draft.shapes, draft.pins, {
          width: dragState.curW,
          height: dragState.curH,
        });
      }
    }
    setDragState(null);
  };

  const handleWindowDragMoveRef = useRef<(e: MouseEvent) => void>(() => {});
  handleWindowDragMoveRef.current = (e: MouseEvent) => {
    handleCanvasMouseMove(e as unknown as React.MouseEvent<SVGSVGElement>);
  };
  const handleWindowDragUpRef = useRef<() => void>(() => {});
  handleWindowDragUpRef.current = handleCanvasMouseUp;
  const isDragging = dragState !== null;

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => handleWindowDragMoveRef.current(e);
    const onUp = () => handleWindowDragUpRef.current();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onUp);
    };
  }, [isDragging]);

  const renderedWidth = dragState?.kind === 'resize_bounds' ? dragState.curW : draft.width;
  const renderedHeight = dragState?.kind === 'resize_bounds' ? dragState.curH : draft.height;

  const renderedShapes = useMemo(() => {
    if (dragState?.kind === 'move_shape') {
      return draft.shapes.map((sh) =>
        sh.id === dragState.shapeId ? moveSymbolShape(dragState.origShape, dragState.curDx, dragState.curDy) : sh
      );
    }
    if (dragState?.kind === 'move_vertex') {
      return draft.shapes.map((sh) => {
        if (sh.id !== dragState.shapeId || sh.kind !== 'polyline') return sh;
        return {
          ...sh,
          points: dragState.origPoints.map((p, idx) =>
            idx === dragState.vertexIdx ? { x: dragState.curX, y: dragState.curY } : p
          ),
        };
      });
    }
    return draft.shapes;
  }, [draft.shapes, dragState]);

  const renderedPins = useMemo(() => {
    if (dragState?.kind === 'move_pin') {
      return draft.pins.map((p, idx) =>
        idx === dragState.pinIdx
          ? {
              ...p,
              dx: dragState.curX,
              dy: dragState.curY,
              direction: inferPinDirection(dragState.curX, dragState.curY, renderedWidth, renderedHeight),
            }
          : p
      );
    }
    return draft.pins;
  }, [draft.pins, dragState, renderedWidth, renderedHeight]);

  const previewTextCtx = useMemo(
    () => ({
      designation: `-${draft.defaultPrefix || 'K'}1`,
      article: draft.article || 'ART-01',
      componentName: draft.componentName || draft.name,
      manufacturer: draft.manufacturer,
      e3BlockName: draft.e3BlockName,
      attributes: draft.attributes,
    }),
    [draft]
  );

  const selectedPolyline = useMemo(
    () => renderedShapes.find((s) => s.id === draft.selectedShapeId && s.kind === 'polyline'),
    [renderedShapes, draft.selectedShapeId]
  );

  const toolHint = useMemo(() => {
    switch (draft.tool) {
      case 'select':
        return 'Клик — выбор · СКМ/Alt — панорама · Del — удалить';
      case 'line':
        return 'Укажите начало и потяните к концу отрезка';
      case 'polyline':
        return polyDraftPoints.length > 0
          ? `Точек: ${polyDraftPoints.length} · Двойной клик / Enter / ПКМ — завершить`
          : 'Кликайте вершины полилинии на холсте';
      case 'rect':
        return 'Протяните диагональ прямоугольника';
      case 'circle':
        return 'Клик в центр окружности и потяните радиус';
      case 'arc':
        return 'Клик в центр дуги и потяните радиус и направление';
      case 'text':
        return 'Кликните на холсте для размещения текста';
      case 'attr_tag':
        return `Кликните для вставки динамического тега ({${draft.activeAttrTagKey}})`;
      case 'pin':
        return 'Кликните по контуру или внутри блока для установки вывода E3';
    }
  }, [draft.tool, draft.activeAttrTagKey, polyDraftPoints.length]);

  const openSaveAsDialog = () => {
    setCopyName(`${draft.name} (копия)`);
    setCopyBlockName(`${draft.e3BlockName}_COPY`);
    setCopyArticle(draft.article ? `${draft.article}-MOD` : '');
    setSaveAsOpen(true);
    requestAnimationFrame(() => copyNameInputRef.current?.focus());
  };

  const confirmCopySave = () => {
    if (!copyName.trim()) return;
    workspace.onSaveAsCopy(copyName.trim(), copyBlockName.trim(), copyArticle.trim());
    setSaveAsOpen(false);
  };

  const hasSelection = Boolean(draft.selectedShapeId) || draft.selectedPinIndex !== null;

  const renderUgoTabStrip = () => (
    <>
      <span
        data-testid="ugo-bar-label"
        className="inline-flex items-center h-[calc(24px*var(--flux-ui-scale))] px-2 rounded-[5px] bg-[var(--flux-accent-soft)] border border-[var(--flux-accent)]/35 font-mono font-bold tracking-wider text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-accent)] whitespace-nowrap shrink-0"
      >
        УГО
      </span>
      <div
        ref={tabsScrollRef}
        data-testid="ugo-tabs-bar"
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
        className="flex flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.tabId === activeTabId;
          return (
            <div
              key={tab.tabId}
              className={`group inline-flex items-center h-[calc(24px*var(--flux-ui-scale))] rounded-[5px] border transition-colors shrink-0 max-w-[calc(176px*var(--flux-ui-scale))] ${
                isActive
                  ? 'bg-[var(--flux-surface)] border-[var(--flux-accent)]/45 text-[var(--flux-text)] shadow-xs'
                  : 'border-transparent text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <button
                type="button"
                data-testid={`ugo-tab-${tab.tabId}`}
                onClick={() => workspace.onSelectTab(tab.tabId)}
                title={`${tab.title} (${tab.blockName})`}
                className="h-full pl-2 pr-1 inline-flex items-center gap-1 min-w-0 text-[length:calc(11px*var(--flux-ui-scale))] whitespace-nowrap"
              >
                <span className={`truncate max-w-[calc(132px*var(--flux-ui-scale))] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {tab.title}
                </span>
                {tab.dirty && (
                  <span
                    title="Есть несохранённые изменения"
                    className="font-mono text-[length:calc(11px*var(--flux-ui-scale))] leading-none text-amber-500 shrink-0"
                  >
                    *
                  </span>
                )}
              </button>
              <button
                type="button"
                data-testid={`ugo-tab-close-${tab.tabId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  workspace.onCloseTab(tab.tabId);
                }}
                title="Закрыть вкладку УГО"
                aria-label={`Закрыть вкладку ${tab.title}`}
                className="inline-flex items-center justify-center w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] mr-0.5 rounded-[4px] text-[var(--flux-text-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[var(--flux-hover)] shrink-0 transition-colors"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        data-testid="ugo-tab-add-btn"
        onClick={workspace.onAddNewTab}
        title="Создать новую вкладку УГО"
        aria-label="Создать новую вкладку УГО"
        className="inline-flex items-center justify-center w-[calc(24px*var(--flux-ui-scale))] h-[calc(24px*var(--flux-ui-scale))] rounded-[5px] text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] shrink-0 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </>
  );

  return (
    <div
      ref={containerRef}
      data-testid="symbol-workspace-canvas"
      className="relative flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[var(--flux-canvas-bg)] select-none"
    >
      <input
        ref={dxfFileInputRef}
        type="file"
        accept=".dxf"
        data-testid="symbol-ws-import-dxf-input"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleImportDxfFile(file);
        }}
      />

      {/* Focus Mode: Centered Floating UGO Multi-Tabs Pill (Replaces Schematic Sheet Tabs) */}
      {isFocusMode && focusLayout && (
        <div
          data-testid="focus-ugo-tabs-pill"
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          style={{
            left: focusLayout.sheetTabsCenterX,
            transform: 'translateX(-50%)',
            maxWidth: focusLayout.sheetTabsMaxWidth,
          }}
          className="no-print absolute top-3 z-40 inline-flex items-center gap-1 h-[calc(34px*var(--flux-ui-scale))] px-1.5 rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg min-w-0 overflow-hidden"
        >
          {renderUgoTabStrip()}
        </div>
      )}

      {/* Classic / Hybrid Mode Header Strip (UGO Tabs + Save/Exit, zero schematic sheets) */}
      {!isFocusMode && (
        <div className="shrink-0 h-9 px-2.5 border-b border-[var(--flux-line)] flux-glass-bar flex items-center justify-between gap-2 z-20 min-w-0">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {renderUgoTabStrip()}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              data-testid="symbol-ws-save-btn"
              onClick={triggerSaveCurrent}
              className="inline-flex items-center justify-center gap-1.5 h-6 px-2.5 rounded-[5px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
            >
              {savedFlash ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              <span>{savedFlash ? 'Сохранено' : 'Сохранить'}</span>
            </button>

            <button
              type="button"
              data-testid="symbol-ws-save-copy-btn"
              onClick={openSaveAsDialog}
              className="inline-flex items-center gap-1.5 h-6 px-2 rounded-[5px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
            >
              <CopyPlus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
              <span>Копировать как…</span>
            </button>

            <button
              type="button"
              data-testid="symbol-ws-import-dxf-btn"
              onClick={() => dxfFileInputRef.current?.click()}
              title="Импортировать геометрию из DXF в редактор УГО"
              className="hidden sm:inline-flex items-center gap-1 h-6 px-2 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
            >
              <FileCode2 className="w-3 h-3 text-[var(--flux-accent)]" />
              <span>Импорт DXF</span>
            </button>

            <button
              type="button"
              data-testid="symbol-ws-export-json-btn"
              onClick={exportBlockJson}
              title="Экспорт выбранного УГО в отдельный файл библиотеки (.e3blk.json)"
              className="inline-flex items-center gap-1 h-6 px-2 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
            >
              <Download className="w-3 h-3 text-[var(--flux-accent)]" />
              <span>Экспорт блока</span>
            </button>

            {origin === 'project' && (
              <button
                type="button"
                data-testid="symbol-ws-place-btn"
                onClick={workspace.onPlaceOnActiveSheet}
                className="hidden sm:inline-flex items-center gap-1.5 h-6 px-2 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                <span>На схему</span>
              </button>
            )}

            <button
              type="button"
              data-testid="symbol-ws-close-btn"
              onClick={workspace.onCloseWorkspace}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-[5px] border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>{origin === 'hub' ? 'В меню' : 'Закрыть УГО'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Focus Mode: Left Floating Vertical Tool Rail (identical language to FocusToolRail) */}
      {isFocusMode && focusLayout && (
        <div
          data-testid="ugo-tool-dock"
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          style={{
            top: focusLayout.toolRailTop,
            left: focusLayout.toolRailLeft,
            maxHeight: focusLayout.toolRailMaxHeight,
          }}
          className="no-print absolute z-30 p-[4px] rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl flex flex-col items-center gap-[2px] overflow-y-auto overflow-x-hidden no-scrollbar transition-[top,max-height] duration-150"
        >
          {onToggleFocusLibrary && (
            <button
              type="button"
              data-testid="ugo-left-library-toggle"
              aria-pressed={focusLibraryOpen}
              onClick={onToggleFocusLibrary}
              title="Библиотека УГО и изделий E3"
              aria-label="Переключить библиотеку УГО"
              className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                focusLibraryOpen
                  ? 'bg-[var(--flux-accent-solid)] text-white shadow-xs'
                  : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <PanelLeft className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
            </button>
          )}
          {onToggleCanvasFocusClean && (
            <button
              type="button"
              data-testid="ugo-canvas-focus-btn"
              aria-pressed={canvasFocusClean}
              onClick={onToggleCanvasFocusClean}
              title={canvasFocusClean ? 'Показать боковые панели УГО' : 'Чистый холст УГО'}
              aria-label={canvasFocusClean ? 'Показать панели' : 'Чистый холст'}
              className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                canvasFocusClean
                  ? 'bg-[var(--flux-accent-solid)] text-white shadow-xs'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              {canvasFocusClean ? (
                <Minimize2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
              ) : (
                <Maximize2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
              )}
            </button>
          )}

          <span className="w-[calc(20px*var(--flux-ui-scale))] h-px bg-[var(--flux-line)] my-[2px] shrink-0" />

          {UGO_TOOLS.map((t) => {
            const active = draft.tool === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`ugo-tool-${t.id}`}
                aria-pressed={active}
                aria-label={t.label}
                title={`${t.label}${t.shortcut ? ` (${t.shortcut})` : ''}`}
                onClick={() => workspace.onSetTool(t.id)}
                className={`relative inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                  active
                    ? 'text-[var(--flux-accent)]'
                    : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]/70'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="ugo-dock-pill"
                    transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                    className="absolute inset-0 rounded-[6px] bg-[var(--flux-accent-soft)] border border-[var(--flux-accent)]/35"
                  />
                )}
                <span className="relative z-10 inline-flex items-center justify-center">
                  {t.renderIcon('w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]')}
                </span>
              </button>
            );
          })}

          <span className="w-[calc(20px*var(--flux-ui-scale))] h-px bg-[var(--flux-line)] my-[2px] shrink-0" />

          <button
            type="button"
            data-testid="ugo-action-rotate"
            onClick={workspace.onRotateBlockCW}
            title="Повернуть блок УГО на 90°"
            aria-label="Повернуть блок на 90°"
            className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]/70 transition-colors"
          >
            <RotateCw className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
          </button>
          <button
            type="button"
            data-testid="ugo-action-mirror-x"
            onClick={workspace.onMirrorBlockX}
            title="Отразить блок по горизонтали"
            aria-label="Отразить по X"
            className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]/70 transition-colors"
          >
            <FlipHorizontal2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
          </button>
          <button
            type="button"
            data-testid="ugo-action-mirror-y"
            onClick={workspace.onMirrorBlockY}
            title="Отразить блок по вертикали"
            aria-label="Отразить по Y"
            className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]/70 transition-colors"
          >
            <FlipVertical2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
          </button>
          <button
            type="button"
            data-testid="ugo-action-duplicate"
            disabled={!draft.selectedShapeId}
            onClick={workspace.onDuplicateSelectedShape}
            title="Дублировать выбранный примитив"
            aria-label="Дублировать примитив"
            className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]/70 disabled:opacity-30 transition-colors"
          >
            <Copy className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
          </button>
          <button
            type="button"
            data-testid="ugo-action-delete"
            disabled={!hasSelection}
            onClick={workspace.onDeleteSelection}
            title="Удалить выбранный примитив или вывод (Del)"
            aria-label="Удалить выбранное"
            className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[var(--flux-hover)]/70 disabled:opacity-30 transition-colors"
          >
            <Trash2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
          </button>
          <button
            type="button"
            data-testid="ugo-action-fit"
            onClick={fitSymbolView}
            title="Вписать УГО по центру (Z)"
            aria-label="Вписать УГО"
            className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)]/70 transition-colors"
          >
            <Scan className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
          </button>
        </div>
      )}

      {/* Focus Mode: Contextual Floating Style, Presets & Quick Save Bar */}
      {isFocusMode && focusLayout && (
        <div
          data-testid="ugo-context-bar"
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          style={{
            top: focusLayout.selectionBarTop,
            left: focusLayout.selectionBarCenterX,
            transform: 'translateX(-50%)',
            maxWidth: focusLayout.selectionBarMaxWidth,
          }}
          className="no-print absolute z-20 inline-flex flex-nowrap items-center gap-[3px] h-[calc(34px*var(--flux-ui-scale))] px-1.5 rounded-[9px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg overflow-x-auto no-scrollbar transition-[top,left] duration-150"
        >
          {/* Color Swatches */}
          <div className="flex items-center gap-0.5 shrink-0">
            {SYMBOL_COLOR_PALETTE.slice(0, 4).map((c) => {
              const activeCol = draft.activeStyle.strokeColor.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  title={`Цвет ${c.label}`}
                  aria-label={`Цвет линии ${c.label}`}
                  onClick={() => workspace.onUpdateStyle({ strokeColor: c.hex })}
                  className={`w-3 h-3 rounded-[3px] border transition-transform shrink-0 ${
                    activeCol
                      ? 'border-[var(--flux-accent)] scale-110 ring-1 ring-[var(--flux-accent)]'
                      : 'border-[var(--flux-line-strong)] hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              );
            })}
            <input
              type="color"
              aria-label="Произвольный цвет линии"
              value={draft.activeStyle.strokeColor}
              onChange={(e) => workspace.onUpdateStyle({ strokeColor: e.target.value })}
              className="w-3.5 h-3.5 p-0 border border-[var(--flux-line)] rounded-[3px] bg-transparent cursor-pointer shrink-0"
            />
          </div>

          <span className="h-4 w-px bg-[var(--flux-line)] shrink-0" />

          <button
            type="button"
            onClick={() => workspace.onUpdateStyle({ filled: !draft.activeStyle.filled })}
            title="Включить/выключить заливку фигур"
            className={`h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] border text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors ${
              draft.activeStyle.filled
                ? 'bg-[var(--flux-accent-soft)] border-[var(--flux-accent)]/45 text-[var(--flux-text)]'
                : 'border-[var(--flux-line)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)]'
            }`}
          >
            Заливка
          </button>

          <select
            aria-label="Толщина линии примитива"
            value={draft.activeStyle.strokeWidth}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) workspace.onUpdateStyle({ strokeWidth: v });
            }}
            className="h-[calc(24px*var(--flux-ui-scale))] px-1 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] shrink-0"
          >
            <option value={1}>1.0</option>
            <option value={1.4}>1.4</option>
            <option value={1.8}>1.8</option>
            <option value={2.2}>2.2</option>
            <option value={3}>3.0</option>
          </select>

          <select
            aria-label="Тип линии примитива"
            value={draft.activeStyle.strokeStyle}
            onChange={(e) =>
              workspace.onUpdateStyle({ strokeStyle: e.target.value as CustomSymbolStrokeStyle })
            }
            className="hidden xl:inline-block h-[calc(24px*var(--flux-ui-scale))] px-1 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] max-w-[calc(76px*var(--flux-ui-scale))] shrink-0"
          >
            {STROKE_STYLE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          {draft.tool === 'attr_tag' && (
            <>
              <span className="h-4 w-px bg-[var(--flux-line)] shrink-0" />
              <select
                aria-label="Ключ динамического тега"
                value={draft.activeAttrTagKey}
                onChange={(e) => workspace.onSetAttrTagKey(e.target.value)}
                className="h-[calc(24px*var(--flux-ui-scale))] px-1 rounded-[5px] border border-[var(--flux-accent)]/40 bg-[var(--flux-accent-soft)] font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] max-w-[calc(94px*var(--flux-ui-scale))] shrink-0"
              >
                <option value="designation">{'{designation}'}</option>
                <option value="article">{'{article}'}</option>
                <option value="componentName">{'{componentName}'}</option>
                <option value="manufacturer">{'{manufacturer}'}</option>
              </select>
            </>
          )}

          {draft.tool === 'pin' && (
            <>
              <span className="h-4 w-px bg-[var(--flux-line)] shrink-0" />
              <select
                aria-label="Тип сигнала нового вывода"
                value={draft.activePinSignal}
                onChange={(e) => workspace.onSetPinSignal(e.target.value as SignalType)}
                className="h-[calc(24px*var(--flux-ui-scale))] px-1 rounded-[5px] border border-[var(--flux-accent)]/40 bg-[var(--flux-accent-soft)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] max-w-[calc(88px*var(--flux-ui-scale))] shrink-0"
              >
                <option value="signal">Сигнал</option>
                <option value="power">Силовая L</option>
                <option value="neutral">Нейтраль N</option>
                <option value="pe">PE</option>
                <option value="dc24">+24V</option>
                <option value="dc0">0V</option>
                <option value="bus">Шина</option>
              </select>
            </>
          )}

          <span className="h-4 w-px bg-[var(--flux-line)] shrink-0" />

          <select
            aria-label="Применить заготовку графики УГО"
            value=""
            onChange={(e) => {
              const v = e.target.value as SymbolPresetId | '';
              if (v) workspace.onApplyPresetShapes(v);
            }}
            className="h-[calc(24px*var(--flux-ui-scale))] px-1 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] max-w-[calc(84px*var(--flux-ui-scale))] shrink-0"
          >
            <option value="">Заготовка…</option>
            <option value="contactor">Контактор KM</option>
            <option value="relay">Реле KA</option>
            <option value="breaker">Автомат QF</option>
            <option value="terminal">Клемма XT</option>
            <option value="blank_box">Корпус ГОСТ</option>
            <option value="sensor_circle">Круг КИП</option>
            <option value="breaker_1p">Автомат 1P</option>
            <option value="coil_relay">Катушка KA</option>
          </select>

          <button
            type="button"
            data-testid="symbol-ws-save-copy-btn"
            onClick={openSaveAsDialog}
            title="Сохранить копию УГО и изделия как новый элемент базы"
            className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors"
          >
            <CopyPlus className="w-3 h-3 text-[var(--flux-accent)]" />
            <span>Копия…</span>
          </button>

          <button
            type="button"
            data-testid="symbol-ws-save-btn"
            onClick={triggerSaveCurrent}
            className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-2 rounded-[5px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            {savedFlash ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            <span>{savedFlash ? 'Сохранено' : 'Сохранить'}</span>
          </button>

          {origin === 'project' && (
            <button
              type="button"
              data-testid="symbol-ws-place-btn"
              onClick={workspace.onPlaceOnActiveSheet}
              title="Сохранить блок и разместить изделие на активном листе схемы"
              className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-3 h-3 text-[var(--flux-accent)]" />
              <span>На схему</span>
            </button>
          )}

          <button
            type="button"
            data-testid="symbol-ws-close-btn"
            onClick={workspace.onCloseWorkspace}
            title={origin === 'hub' ? 'Выйти в стартовое меню' : 'Закрыть редактор УГО и вернуться на схему'}
            className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors"
          >
            <X className="w-3 h-3" />
            <span>{origin === 'hub' ? 'В меню' : 'Закрыть'}</span>
          </button>
        </div>
      )}

      {/* Floating Save-As Copy Popover */}
      {saveAsOpen && (
        <div
          data-testid="symbol-ws-copy-bar"
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setSaveAsOpen(false);
            } else if (e.key === 'Enter' && copyName.trim()) {
              e.preventDefault();
              confirmCopySave();
            }
          }}
          style={
            isFocusMode && focusLayout
              ? {
                  top: focusLayout.selectionBarTop + 42,
                  left: focusLayout.selectionBarCenterX,
                  transform: 'translateX(-50%)',
                  maxWidth: Math.max(360, focusLayout.selectionBarMaxWidth),
                }
              : undefined
          }
          className={
            isFocusMode
              ? 'no-print absolute z-40 px-3 py-2 rounded-[10px] border border-[var(--flux-accent)]/50 flux-glass-popover shadow-2xl flex flex-wrap items-center gap-2'
              : 'shrink-0 px-2.5 py-1.5 border-b border-[var(--flux-accent)]/40 bg-[var(--flux-sel)] flex flex-wrap items-center gap-2 z-10'
          }
        >
          <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] whitespace-nowrap">
            Копия в базу:
          </span>
          <input
            ref={copyNameInputRef}
            type="text"
            data-testid="symbol-ws-copy-name"
            aria-label="Название копии УГО или изделия"
            value={copyName}
            onChange={(e) => setCopyName(e.target.value)}
            placeholder="Название УГО / изделия"
            className="h-7 px-2 min-w-[calc(150px*var(--flux-ui-scale))] flex-1 rounded-[5px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
          />
          <input
            type="text"
            data-testid="symbol-ws-copy-block"
            aria-label="Имя блока E3 для копии"
            spellCheck={false}
            value={copyBlockName}
            onChange={(e) => setCopyBlockName(e.target.value)}
            placeholder="Блок E3 (GOST_...)"
            className="h-7 px-2 min-w-[calc(130px*var(--flux-ui-scale))] flex-1 rounded-[5px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] font-mono text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
          />
          <input
            type="text"
            data-testid="symbol-ws-copy-article"
            aria-label="Артикул копии изделия"
            spellCheck={false}
            value={copyArticle}
            onChange={(e) => setCopyArticle(e.target.value)}
            placeholder="Артикул"
            className="h-7 px-2 w-28 rounded-[5px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] font-mono text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              data-testid="symbol-ws-copy-confirm"
              disabled={!copyName.trim()}
              onClick={confirmCopySave}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[5px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] disabled:opacity-45 text-white text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Создать копию</span>
            </button>
            <button
              type="button"
              onClick={() => setSaveAsOpen(false)}
              className="h-7 px-2 rounded-[5px] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] whitespace-nowrap transition-colors"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Infinite Sheetless CAD Canvas */}
      <div className="relative flex-1 min-h-0" onWheel={handleWheel}>
        <svg
          ref={svgRef}
          data-testid="symbol-workspace-svg"
          className={`w-full h-full block ${
            draft.tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
          }`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onDoubleClick={() => {
            if (draft.tool === 'polyline' && polyDraftPoints.length >= 2) {
              finalizePolyline(polyDraftPoints, false);
            }
          }}
          onContextMenu={(e) => {
            if (draft.tool === 'polyline') {
              e.preventDefault();
              if (polyDraftPoints.length >= 2) {
                finalizePolyline(polyDraftPoints, false);
              }
            }
          }}
        >
          <defs>
            <pattern
              id="sym-minor-grid"
              width={draft.gridStep}
              height={draft.gridStep}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${draft.gridStep} 0 L 0 0 0 ${draft.gridStep}`}
                fill="none"
                stroke={isDark ? 'rgba(148,163,184,0.11)' : 'rgba(15,23,42,0.07)'}
                strokeWidth={0.6 / zoom}
              />
            </pattern>
            <pattern
              id="sym-major-grid"
              width={50}
              height={50}
              patternUnits="userSpaceOnUse"
            >
              <rect width="50" height="50" fill="url(#sym-minor-grid)" />
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke={isDark ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.14)'}
                strokeWidth={0.9 / zoom}
              />
            </pattern>
          </defs>

          {/* World Transform */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Infinite CAD background grid (pure drafting expanse, zero schematic sheet frames) */}
            <rect
              x={-2000}
              y={-2000}
              width={4400}
              height={4400}
              fill="url(#sym-major-grid)"
            />

            {/* Infinite Origin Axes (0,0) */}
            <line
              x1={-1800}
              y1={0}
              x2={2200}
              y2={0}
              stroke="rgba(220, 38, 38, 0.28)"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />
            <line
              x1={0}
              y1={-1800}
              x2={0}
              y2={2200}
              stroke="rgba(22, 163, 74, 0.30)"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />
            <circle cx={0} cy={0} r={3 / zoom} fill="var(--flux-accent)" opacity={0.85} />
            <text
              x={4 / zoom}
              y={-5 / zoom}
              fontSize={9 / zoom}
              fontFamily="IBM Plex Mono, monospace"
              fill="var(--flux-text-muted)"
            >
              0,0
            </text>

            {/* Symbol Bounding Region */}
            <rect
              x={0}
              y={0}
              width={renderedWidth}
              height={renderedHeight}
              fill={isDark ? 'rgba(20, 24, 30, 0.54)' : 'rgba(255, 255, 255, 0.78)'}
              stroke="var(--flux-accent)"
              strokeOpacity={0.6}
              strokeWidth={1.1 / zoom}
              strokeDasharray={`${5 / zoom} ${3 / zoom}`}
            />

            {/* Drawn Symbol Primitives */}
            {renderedShapes.map((sh) => {
              const isSel = draft.selectedShapeId === sh.id;
              const strokeCol = isSel ? 'var(--flux-accent)' : sh.strokeColor || 'var(--flux-text)';
              const dash = resolveShapeStrokeDasharray(sh);

              const onShapeMouseDown = (e: React.MouseEvent) => {
                if (draft.tool !== 'select') return;
                e.stopPropagation();
                workspace.onSelectShape(sh.id);
                const pt = toSymbolCoords(e.clientX, e.clientY, true);
                setDragState({
                  kind: 'move_shape',
                  shapeId: sh.id,
                  startX: pt.x,
                  startY: pt.y,
                  origShape: sh,
                  curDx: 0,
                  curDy: 0,
                });
              };

              if (sh.kind === 'line') {
                return (
                  <g key={sh.id} onMouseDown={onShapeMouseDown} className="cursor-pointer">
                    <line
                      x1={sh.x1}
                      y1={sh.y1}
                      x2={sh.x2}
                      y2={sh.y2}
                      stroke="transparent"
                      strokeWidth={Math.max(8, (sh.strokeWidth || 2) + 6)}
                    />
                    <line
                      x1={sh.x1}
                      y1={sh.y1}
                      x2={sh.x2}
                      y2={sh.y2}
                      stroke={strokeCol}
                      strokeWidth={sh.strokeWidth || 1.8}
                      strokeDasharray={dash}
                      strokeLinecap="round"
                    />
                    {isSel && (
                      <>
                        <circle cx={sh.x1} cy={sh.y1} r={3.2 / zoom} fill="var(--flux-accent)" />
                        <circle cx={sh.x2} cy={sh.y2} r={3.2 / zoom} fill="var(--flux-accent)" />
                      </>
                    )}
                  </g>
                );
              }
              if (sh.kind === 'polyline') {
                const pts = (sh.points || []).map((p) => `${p.x},${p.y}`).join(' ');
                return (
                  <g key={sh.id} onMouseDown={onShapeMouseDown} className="cursor-pointer">
                    {sh.closed ? (
                      <polygon
                        points={pts}
                        fill={sh.filled ? sh.fillColor || 'var(--flux-surface)' : 'none'}
                        fillOpacity={sh.filled ? sh.fillOpacity ?? 0.9 : 0}
                        stroke={strokeCol}
                        strokeWidth={sh.strokeWidth || 1.8}
                        strokeDasharray={dash}
                        strokeLinejoin="round"
                      />
                    ) : (
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={strokeCol}
                        strokeWidth={sh.strokeWidth || 1.8}
                        strokeDasharray={dash}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    )}
                  </g>
                );
              }
              if (sh.kind === 'rect') {
                return (
                  <rect
                    key={sh.id}
                    x={sh.x}
                    y={sh.y}
                    width={sh.width}
                    height={sh.height}
                    rx={2}
                    fill={sh.filled ? sh.fillColor || 'var(--flux-surface)' : 'none'}
                    fillOpacity={sh.filled ? sh.fillOpacity ?? 0.9 : 0}
                    stroke={strokeCol}
                    strokeWidth={sh.strokeWidth || 1.8}
                    strokeDasharray={dash}
                    onMouseDown={onShapeMouseDown}
                    className="cursor-pointer"
                  />
                );
              }
              if (sh.kind === 'circle') {
                return (
                  <circle
                    key={sh.id}
                    cx={sh.cx}
                    cy={sh.cy}
                    r={sh.r}
                    fill={sh.filled ? sh.fillColor || 'var(--flux-surface)' : 'none'}
                    fillOpacity={sh.filled ? sh.fillOpacity ?? 0.9 : 0}
                    stroke={strokeCol}
                    strokeWidth={sh.strokeWidth || 1.8}
                    strokeDasharray={dash}
                    onMouseDown={onShapeMouseDown}
                    className="cursor-pointer"
                  />
                );
              }
              if (sh.kind === 'arc') {
                return (
                  <path
                    key={sh.id}
                    d={describeSvgArcPath(sh.cx, sh.cy, sh.r, sh.startAngle, sh.endAngle)}
                    fill="none"
                    stroke={strokeCol}
                    strokeWidth={sh.strokeWidth || 1.8}
                    strokeDasharray={dash}
                    strokeLinecap="round"
                    onMouseDown={onShapeMouseDown}
                    className="cursor-pointer"
                  />
                );
              }
              const previewVal = resolveDynamicSymbolText(sh, previewTextCtx);
              return (
                <g key={sh.id} onMouseDown={onShapeMouseDown} className="cursor-pointer">
                  <text
                    x={sh.x}
                    y={sh.y}
                    textAnchor={sh.align === 'left' ? 'start' : sh.align === 'right' ? 'end' : 'middle'}
                    fill={strokeCol}
                    fontSize={sh.fontSize || 11}
                    fontWeight={sh.bold ? 700 : 500}
                    fontFamily="'IBM Plex Sans', sans-serif"
                  >
                    {previewVal}
                  </text>
                  {isSel && (
                    <circle cx={sh.x} cy={sh.y} r={3 / zoom} fill="var(--flux-accent)" />
                  )}
                </g>
              );
            })}

            {/* Vertex Grips for Selected Polyline */}
            {selectedPolyline &&
              selectedPolyline.kind === 'polyline' &&
              selectedPolyline.points.map((pt, vIdx) => (
                <rect
                  key={`${selectedPolyline.id}-v-${vIdx}`}
                  x={pt.x - 3.5 / zoom}
                  y={pt.y - 3.5 / zoom}
                  width={7 / zoom}
                  height={7 / zoom}
                  fill="var(--flux-surface)"
                  stroke="var(--flux-accent)"
                  strokeWidth={1.3 / zoom}
                  className="cursor-move"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDragState({
                      kind: 'move_vertex',
                      shapeId: selectedPolyline.id,
                      vertexIdx: vIdx,
                      origPoints: selectedPolyline.points,
                      curX: pt.x,
                      curY: pt.y,
                    });
                  }}
                />
              ))}

            {/* Polyline Live Draft Rubber-band */}
            {polyDraftPoints.length > 0 && (
              <g pointerEvents="none">
                <polyline
                  ref={polyPreviewRef}
                  points={[...polyDraftPoints, cursorLocalRef.current].map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="var(--flux-accent)"
                  strokeWidth={draft.activeStyle.strokeWidth}
                  strokeDasharray="4 2"
                />
                {polyDraftPoints.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={3 / zoom} fill="var(--flux-accent)" />
                ))}
              </g>
            )}

            {/* Shape Drag Preview */}
            {dragState?.kind === 'draw_shape' && (
              <g pointerEvents="none" opacity={0.8}>
                {dragState.tool === 'line' && (
                  <line
                    x1={dragState.startX}
                    y1={dragState.startY}
                    x2={dragState.curX}
                    y2={dragState.curY}
                    stroke="var(--flux-accent)"
                    strokeWidth={draft.activeStyle.strokeWidth}
                    strokeDasharray="4 2"
                  />
                )}
                {dragState.tool === 'rect' && (
                  <rect
                    x={Math.min(dragState.startX, dragState.curX)}
                    y={Math.min(dragState.startY, dragState.curY)}
                    width={Math.abs(dragState.curX - dragState.startX)}
                    height={Math.abs(dragState.curY - dragState.startY)}
                    fill="none"
                    stroke="var(--flux-accent)"
                    strokeWidth={draft.activeStyle.strokeWidth}
                    strokeDasharray="4 2"
                  />
                )}
                {dragState.tool === 'circle' && (
                  <circle
                    cx={dragState.startX}
                    cy={dragState.startY}
                    r={Math.max(8, Math.hypot(dragState.curX - dragState.startX, dragState.curY - dragState.startY))}
                    fill="none"
                    stroke="var(--flux-accent)"
                    strokeWidth={draft.activeStyle.strokeWidth}
                    strokeDasharray="4 2"
                  />
                )}
                {dragState.tool === 'arc' && (
                  <path
                    d={describeSvgArcPath(
                      dragState.startX,
                      dragState.startY,
                      Math.max(10, Math.hypot(dragState.curX - dragState.startX, dragState.curY - dragState.startY)),
                      Math.round((Math.atan2(dragState.curY - dragState.startY, dragState.curX - dragState.startX) * 180) / Math.PI) - 90,
                      Math.round((Math.atan2(dragState.curY - dragState.startY, dragState.curX - dragState.startX) * 180) / Math.PI) + 90
                    )}
                    fill="none"
                    stroke="var(--flux-accent)"
                    strokeWidth={draft.activeStyle.strokeWidth}
                    strokeDasharray="4 2"
                  />
                )}
              </g>
            )}

            {/* Pins (E3 Terminal Connection Points with Direction Stub) */}
            {renderedPins.map((pin, idx) => {
              const isPinSel = draft.selectedPinIndex === idx;
              const stubDx = pin.direction === 'left' ? -8 : pin.direction === 'right' ? 8 : 0;
              const stubDy = pin.direction === 'top' ? -8 : pin.direction === 'bottom' ? 8 : 0;
              return (
                <g
                  key={`pin-${idx}`}
                  data-testid={`symbol-ws-pin-${idx}`}
                  className={draft.tool === 'select' ? 'cursor-move' : 'cursor-pointer'}
                  onMouseDown={(e) => {
                    if (draft.tool !== 'select') return;
                    e.stopPropagation();
                    workspace.onSelectPin(idx);
                    setDragState({ kind: 'move_pin', pinIdx: idx, origPin: pin, curX: pin.dx, curY: pin.dy });
                  }}
                >
                  <circle cx={pin.dx} cy={pin.dy} r={7 / zoom} fill="transparent" />
                  <line
                    x1={pin.dx}
                    y1={pin.dy}
                    x2={pin.dx + stubDx}
                    y2={pin.dy + stubDy}
                    stroke={isPinSel ? '#dc2626' : '#f59e0b'}
                    strokeWidth={1.6 / zoom}
                  />
                  <circle
                    cx={pin.dx}
                    cy={pin.dy}
                    r={(isPinSel ? 5 : 4) / zoom}
                    fill={isPinSel ? '#dc2626' : '#f59e0b'}
                    stroke="#ffffff"
                    strokeWidth={1.3 / zoom}
                  />
                  <text
                    x={pin.dx + 6 / zoom}
                    y={pin.dy - 5 / zoom}
                    fontSize={9.5 / zoom}
                    fontWeight={600}
                    fontFamily="IBM Plex Mono, monospace"
                    fill={isPinSel ? '#dc2626' : 'var(--flux-text)'}
                  >
                    {pin.name}
                  </text>
                </g>
              );
            })}

            {/* Bounds Resize Grip Handle at bottom-right */}
            <rect
              data-testid="symbol-ws-resize-handle"
              x={renderedWidth - 4 / zoom}
              y={renderedHeight - 4 / zoom}
              width={8 / zoom}
              height={8 / zoom}
              fill="var(--flux-accent)"
              stroke="#ffffff"
              strokeWidth={1 / zoom}
              className="cursor-nwse-resize"
              onMouseDown={(e) => {
                e.stopPropagation();
                const pt = toSymbolCoords(e.clientX, e.clientY, true);
                setDragState({
                  kind: 'resize_bounds',
                  startX: pt.x,
                  startY: pt.y,
                  origW: draft.width,
                  origH: draft.height,
                  curW: draft.width,
                  curH: draft.height,
                });
              }}
            />
          </g>
        </svg>

        {/* Bottom Floating Focus Hint Pill */}
        <div
          data-testid="ugo-command-hint-pill"
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          style={
            isFocusMode && focusLayout
              ? { left: focusLayout.commandPillCenterX, maxWidth: focusLayout.commandPillMaxWidth }
              : undefined
          }
          className={`no-print absolute bottom-3 ${
            isFocusMode && focusLayout ? '-translate-x-1/2' : 'left-3 max-w-[calc(100vw-340px)]'
          } z-30 h-[calc(36px*var(--flux-ui-scale))] px-3 rounded-[9px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl inline-flex items-center gap-2 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] min-w-0`}
        >
          <Crosshair className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
          <span className="truncate">{importFlash || toolHint}</span>
          <span className="hidden xl:inline-block h-3.5 w-px bg-[var(--flux-line)] shrink-0" />
          <span className="hidden xl:inline-block font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text)] whitespace-nowrap shrink-0">
            {renderedWidth}×{renderedHeight} мм
          </span>
          {workspace.autosavedAt && (
            <>
              <span className="hidden lg:inline-block h-3.5 w-px bg-[var(--flux-line)] shrink-0" />
              <span
                data-testid="ugo-autosave-status"
                className="hidden lg:inline-block font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-accent)] whitespace-nowrap shrink-0"
              >
                Автосохр.{' '}
                {new Date(workspace.autosavedAt).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </>
          )}
        </div>

        {/* Bottom-Right Floating Status Pill (matching FocusStatusPill) */}
        <div
          data-testid="ugo-status-pill"
          onMouseDown={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="no-print absolute bottom-3 right-3 z-30 inline-flex items-center gap-1 h-[calc(36px*var(--flux-ui-scale))] px-2 rounded-[9px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl text-[length:calc(10.5px*var(--flux-ui-scale))] font-mono text-[var(--flux-text-muted)]"
        >
          <span className="hidden lg:inline-block min-w-[calc(86px*var(--flux-ui-scale))] tabular-nums whitespace-nowrap">
            <span ref={coordsHudRef} />
          </span>
          <span className="hidden lg:inline-block h-3.5 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" />
          <select
            aria-label="Шаг сетки УГО"
            title="Шаг сетки УГО (мм)"
            value={draft.gridStep}
            onChange={(e) => workspace.onSetGridStep(Number(e.target.value))}
            className="h-6 px-1 rounded-[4px] bg-transparent hover:bg-[var(--flux-hover)] font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text)] focus:outline-none cursor-pointer"
          >
            <option value={5}>5 мм</option>
            <option value={10}>10 мм</option>
            <option value={20}>20 мм</option>
          </select>
          <button
            type="button"
            data-testid="ugo-toggle-snap-btn"
            onClick={workspace.onToggleSnap}
            title="Привязка к сетке (F3)"
            aria-label="Переключить привязку"
            className={`inline-flex items-center justify-center w-6 h-6 rounded-[4px] shrink-0 transition-colors ${
              draft.snapToGrid ? 'bg-[var(--flux-sel)] text-[var(--flux-accent)]' : 'hover:bg-[var(--flux-hover)]'
            }`}
          >
            <Magnet className="w-3 h-3" />
          </button>
          <span className="h-3.5 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.4, Number((z * 0.85).toFixed(2))))}
            title="Отдалить"
            aria-label="Отдалить"
            className="inline-flex items-center justify-center w-5 h-6 rounded-[4px] shrink-0 hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="min-w-[calc(34px*var(--flux-ui-scale))] px-0.5 text-center tabular-nums text-[var(--flux-text)] shrink-0">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(5, Number((z * 1.18).toFixed(2))))}
            title="Приблизить"
            aria-label="Приблизить"
            className="inline-flex items-center justify-center w-5 h-6 rounded-[4px] shrink-0 hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={fitSymbolView}
            title="Вписать УГО по центру (Z)"
            aria-label="Вписать УГО"
            className="inline-flex items-center justify-center w-6 h-6 rounded-[4px] shrink-0 hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)]"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
});

SymbolWorkspaceCanvas.displayName = 'SymbolWorkspaceCanvas';
