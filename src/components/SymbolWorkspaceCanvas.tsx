import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CopyPlus,
  Crosshair,
  Maximize2,
  Plus,
  Save,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CustomSymbolShape, E3Pin } from '../core/e3Types';
import {
  inferPinDirection,
  nextPinName,
  snapSymbolCoord,
} from '../core/symbolDesigner';
import {
  describeSvgArcPath,
  moveSymbolShape,
  resolveDynamicSymbolText,
  resolveShapeStrokeDasharray,
} from '../core/symbolLibrary';
import type { SymbolWorkspaceActions } from '../core/symbolWorkspaceTypes';

interface SymbolWorkspaceCanvasProps {
  workspace: SymbolWorkspaceActions;
  isDark?: boolean;
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

export const SymbolWorkspaceCanvas: React.FC<SymbolWorkspaceCanvasProps> = React.memo(({
  workspace,
  isDark = false,
}) => {
  const { draft } = workspace;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const coordsHudRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (coordsHudRef.current) coordsHudRef.current.textContent = 'X:0 Y:0';
  }, []);
  const polyPreviewRef = useRef<SVGPolylineElement | null>(null);
  const cursorLocalRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const moveRafRef = useRef<number | null>(null);
  const copyNameInputRef = useRef<HTMLInputElement | null>(null);

  const [zoom, setZoom] = useState(2.2);
  const [pan, setPan] = useState({ x: 260, y: 140 });
  const [polyDraftPoints, setPolyDraftPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [dragState, setDragState] = useState<DragInteraction | null>(null);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [copyName, setCopyName] = useState('');
  const [copyBlockName, setCopyBlockName] = useState('');
  const [copyArticle, setCopyArticle] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimerRef = useRef<number | null>(null);

  const triggerSaveCurrent = useCallback(() => {
    workspace.onSaveCurrent();
    setSavedFlash(true);
    if (savedFlashTimerRef.current) window.clearTimeout(savedFlashTimerRef.current);
    savedFlashTimerRef.current = window.setTimeout(() => setSavedFlash(false), 1300);
  }, [workspace]);

  const fitSymbolView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padW = Math.max(220, rect.width - 140);
    const padH = Math.max(180, rect.height - 140);
    const nextZoom = Math.max(0.8, Math.min(3.5, Math.min(padW / draft.width, padH / draft.height)));
    setZoom(Number(nextZoom.toFixed(2)));
    setPan({
      x: Math.round((rect.width - draft.width * nextZoom) / 2),
      y: Math.round((rect.height - draft.height * nextZoom) / 2),
    });
  }, [draft.width, draft.height]);

  const fitSymbolViewRef = useRef(fitSymbolView);
  fitSymbolViewRef.current = fitSymbolView;

  // Fit ONLY on opening or switching target symbol/catalog item (never on bounds resize)
  useEffect(() => {
    const raf = requestAnimationFrame(() => fitSymbolViewRef.current());
    return () => cancelAnimationFrame(raf);
  }, [draft.open, draft.symbolId, draft.catalogItemId]);

  useEffect(() => {
    return () => {
      if (moveRafRef.current) cancelAnimationFrame(moveRafRef.current);
      if (savedFlashTimerRef.current) window.clearTimeout(savedFlashTimerRef.current);
    };
  }, []);

  // Clear polyline draft if tool changes
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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft.tool, draft.selectedShapeId, draft.selectedPinIndex, polyDraftPoints, finalizePolyline, triggerSaveCurrent, workspace]);

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
        coordsHudRef.current.textContent = `X:${pt.x} Y:${pt.y}`;
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
        return 'Клик — выбор примитива/вывода · Перетаскивание — сдвиг · Del — удалить';
      case 'line':
        return 'Укажите начало и потяните к концу отрезка';
      case 'polyline':
        return polyDraftPoints.length > 0
          ? `Точек: ${polyDraftPoints.length} · Двойной клик / Enter / ПКМ — завершить · Esc — сброс`
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
        return `Кликните для вставки динамического тега (${draft.activeAttrTagKey})`;
      case 'pin':
        return 'Кликните на границе или внутри блока для добавления вывода E3';
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

  return (
    <div
      ref={containerRef}
      data-testid="symbol-workspace-canvas"
      className="relative flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[var(--flux-canvas-bg)] select-none"
    >
      {/* Top Block Editor Context Bar (AutoCAD BEDIT header strip) */}
      <div className="shrink-0 h-8 px-2.5 border-b border-[var(--flux-line)] flux-glass-bar flex items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-1.5 py-0.5 rounded-[2px] border border-[var(--flux-accent)]/50 bg-[var(--flux-accent-soft)] font-mono text-[length:calc(10px*var(--flux-ui-scale))] font-semibold tracking-wider text-[var(--flux-accent)] whitespace-nowrap shrink-0">
            {draft.targetMode === 'device'
              ? 'УГО ОБЪЕКТА'
              : draft.targetMode === 'component'
                ? 'УГО + ИЗДЕЛИЕ'
                : 'БЛОК УГО'}
          </span>
          <span className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate min-w-0">
            {draft.name || draft.e3BlockName}
            {draft.dirty ? ' *' : ''}
          </span>
          <span className="hidden xl:inline font-mono text-[length:calc(11px*var(--flux-ui-scale))] tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
            {renderedWidth}×{renderedHeight} мм
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="symbol-ws-save-btn"
            onClick={triggerSaveCurrent}
            className="inline-flex items-center justify-center gap-1.5 min-w-[calc(94px*var(--flux-ui-scale))] h-6 px-2 rounded-[2px] border border-[var(--flux-accent)]/60 bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
          >
            {savedFlash ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedFlash ? 'Сохранено' : 'Сохранить'}</span>
          </button>

          <button
            type="button"
            data-testid="symbol-ws-save-copy-btn"
            onClick={openSaveAsDialog}
            className="inline-flex items-center gap-1.5 h-6 px-2 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
          >
            <CopyPlus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>Копировать как…</span>
          </button>

          <button
            type="button"
            data-testid="symbol-ws-place-btn"
            onClick={workspace.onPlaceOnActiveSheet}
            className="hidden sm:inline-flex items-center gap-1.5 h-6 px-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>На схему</span>
          </button>

          <button
            type="button"
            data-testid="symbol-ws-close-btn"
            onClick={workspace.onCloseWorkspace}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-[2px] border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Закрыть УГО</span>
          </button>
        </div>
      </div>

      {/* Inline "Save As Copy" Popover Bar */}
      {saveAsOpen && (
        <div
          data-testid="symbol-ws-copy-bar"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setSaveAsOpen(false);
            } else if (e.key === 'Enter' && copyName.trim()) {
              e.preventDefault();
              confirmCopySave();
            }
          }}
          className="shrink-0 px-2.5 py-1.5 border-b border-[var(--flux-accent)]/40 bg-[var(--flux-sel)] flex flex-wrap items-center gap-2 z-10"
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
            className="h-6 px-2 min-w-[calc(160px*var(--flux-ui-scale))] flex-1 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
          />
          <input
            type="text"
            data-testid="symbol-ws-copy-block"
            aria-label="Имя блока E3 для копии"
            spellCheck={false}
            value={copyBlockName}
            onChange={(e) => setCopyBlockName(e.target.value)}
            placeholder="Блок E3 (GOST_...)"
            className="h-6 px-2 min-w-[calc(140px*var(--flux-ui-scale))] flex-1 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] font-mono text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
          />
          <input
            type="text"
            data-testid="symbol-ws-copy-article"
            aria-label="Артикул копии изделия"
            spellCheck={false}
            value={copyArticle}
            onChange={(e) => setCopyArticle(e.target.value)}
            placeholder="Артикул"
            className="h-6 px-2 w-32 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] font-mono text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
          />
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              data-testid="symbol-ws-copy-confirm"
              disabled={!copyName.trim()}
              onClick={confirmCopySave}
              className="inline-flex items-center gap-1 h-6 px-2.5 rounded-[2px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] disabled:opacity-45 text-white text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Создать копию</span>
            </button>
            <button
              type="button"
              onClick={() => setSaveAsOpen(false)}
              className="h-6 px-2 rounded-[2px] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] whitespace-nowrap transition-colors"
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
          className={`w-full h-full block ${
            draft.tool === 'select' ? 'cursor-default' : 'cursor-crosshair'
          }`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
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
            {/* Infinite CAD background grid (covers large drafting expanse without sheet boundary) */}
            <rect
              x={-2000}
              y={-2000}
              width={4400}
              height={4400}
              fill="url(#sym-major-grid)"
            />

            {/* Infinite Origin Axes (0,0) like AutoCAD Block Editor */}
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

            {/* Symbol Bounding Region (no sheet frame — pure block extents) */}
            <rect
              x={0}
              y={0}
              width={renderedWidth}
              height={renderedHeight}
              fill={isDark ? 'rgba(15, 23, 42, 0.36)' : 'rgba(255, 255, 255, 0.58)'}
              stroke="var(--flux-accent)"
              strokeOpacity={0.55}
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

            {/* Pins (E3 Terminal Connection Points) */}
            {renderedPins.map((pin, idx) => {
              const isPinSel = draft.selectedPinIndex === idx;
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

        {/* Bottom Floating CAD Workspace HUD */}
        <div
          data-testid="symbol-workspace-hud"
          className="absolute bottom-2.5 left-2.5 right-2.5 pointer-events-none flex items-center justify-between gap-2"
        >
          <div className="pointer-events-auto inline-flex items-center gap-2 px-2.5 h-7 rounded-xl border border-[var(--flux-line-strong)] flux-glass-popover text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
            <Crosshair className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
            <span className="truncate">{toolHint}</span>
          </div>

          <div className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 h-7 rounded-xl border border-[var(--flux-line-strong)] flux-glass-popover text-[length:calc(11px*var(--flux-ui-scale))] font-mono tabular-nums text-[var(--flux-text)] shrink-0">
            <span className="text-[var(--flux-text-muted)] inline-block w-[calc(112px*var(--flux-ui-scale))] whitespace-nowrap tabular-nums">
              <span ref={coordsHudRef} />
            </span>
            <span className="h-3.5 w-px bg-[var(--flux-line)]" />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, Number((z * 0.85).toFixed(2))))}
              title="Отдалить"
              aria-label="Отдалить"
              className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-[var(--flux-hover)] transition-colors"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="inline-block w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(5, Number((z * 1.18).toFixed(2))))}
              title="Приблизить"
              aria-label="Приблизить"
              className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-[var(--flux-hover)] transition-colors"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={fitSymbolView}
              title="По центру УГО"
              aria-label="Центрировать УГО"
              className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-[var(--flux-hover)] transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

SymbolWorkspaceCanvas.displayName = 'SymbolWorkspaceCanvas';
