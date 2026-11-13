import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Grid3X3, Magnet, Maximize2, Minus, Plus, X } from 'lucide-react';
import { resolveSchematicCssFont } from '../core/e3Catalog';
import { autoRouteOrthogonal, getAbsolutePinPos } from '../core/e3Engine';
import type {
  AnnotationKind,
  CadTool,
  CatalogItem,
  E3Annotation,
  E3Device,
  E3Project,
  E3Wire,
} from '../core/e3Types';
import { SchematicSymbol } from './SchematicSymbol';

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
  selectedDeviceId: string | null;
  selectedWireId: string | null;
  selectedAnnotationId: string | null;
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
  onBeginDrag?: () => void;
  onCommitDrag?: (moved: boolean) => void;
  onSelectDevice: (deviceId: string | null) => void;
  onSelectWire: (wireId: string | null) => void;
  onSelectAnnotation: (annId: string | null) => void;
  onCreateAnnotation: (sheetId: string, kind: AnnotationKind, x: number, y: number) => void;
  onMoveAnnotation: (annId: string, x: number, y: number) => void;
  onMoveDevice: (deviceId: string, x: number, y: number) => void;
  onCreateWire: (fromDeviceId: string, fromPinId: string, toDeviceId: string, toPinId: string) => void;
  onDropCatalogItem: (item: CatalogItem, x: number, y: number, sheetId: string) => void;
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  project,
  catalog,
  activeSheetId,
  viewportIndex = 0,
  isMultiViewport = false,
  isFocused = true,
  tool,
  zoom,
  pan,
  selectedDeviceId,
  selectedWireId,
  selectedAnnotationId,
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
  onBeginDrag,
  onCommitDrag,
  onSelectDevice,
  onSelectWire,
  onSelectAnnotation,
  onCreateAnnotation,
  onMoveAnnotation,
  onMoveDevice,
  onCreateWire,
  onDropCatalogItem,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [wireStart, setWireStart] = useState<{
    deviceId: string;
    pinId: string;
    x: number;
    y: number;
    direction: 'top' | 'right' | 'bottom' | 'left';
  } | null>(null);

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

  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number; moved: boolean }
    | { kind: 'device'; deviceId: string; startWorldX: number; startWorldY: number; origX: number; origY: number; moved: boolean }
    | { kind: 'annotation'; annId: string; startWorldX: number; startWorldY: number; origX: number; origY: number; moved: boolean }
    | null
  >(null);

  const sheet = useMemo(
    () => project.sheets.find((s) => s.id === activeSheetId) || project.sheets[0],
    [project.sheets, activeSheetId]
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
    for (const w of sheetWires) {
      set.add(`${w.fromDeviceId}:${w.fromPinId}`);
      set.add(`${w.toDeviceId}:${w.toPinId}`);
    }
    return set;
  }, [sheetWires]);

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
    if (!d) return;
    dragRef.current = null;
    if (d.kind === 'device' || d.kind === 'annotation') {
      onCommitDrag?.(d.moved);
    }
  }, [onCommitDrag]);

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
    onFocusViewport?.();
    if (e.button === 1 || tool === 'pan' || e.shiftKey) {
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
    if (wireStart) {
      setWireStart(null);
      return;
    }
    if ((tool === 'text' || tool === 'rect' || tool === 'callout') && sheet) {
      const world = toWorld(e.clientX, e.clientY);
      onCreateAnnotation(sheet.id, tool, snap(world.x), snap(world.y));
      return;
    }
    onSelectDevice(null);
    onSelectWire(null);
    onSelectAnnotation(null);
  };

  const handleSelectDeviceDown = (e: React.MouseEvent, device: E3Device) => {
    e.stopPropagation();
    onFocusViewport?.();
    if (tool === 'pan' || e.button === 1) {
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
    onSelectWire(null);
    onSelectAnnotation(null);
    onSelectDevice(device.id);
    if (tool === 'select') {
      const world = toWorld(e.clientX, e.clientY);
      onBeginDrag?.();
      dragRef.current = {
        kind: 'device',
        deviceId: device.id,
        startWorldX: world.x,
        startWorldY: world.y,
        origX: device.x,
        origY: device.y,
        moved: false,
      };
    }
  };

  const handleAnnotationDown = (e: React.MouseEvent, ann: E3Annotation) => {
    e.stopPropagation();
    onFocusViewport?.();
    if (tool === 'pan' || e.button === 1) {
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
    onSelectDevice(null);
    onSelectWire(null);
    onSelectAnnotation(ann.id);
    const world = toWorld(e.clientX, e.clientY);
    onBeginDrag?.();
    dragRef.current = {
      kind: 'annotation',
      annId: ann.id,
      startWorldX: world.x,
      startWorldY: world.y,
      origX: ann.x,
      origY: ann.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') {
      drag.moved = true;
      onSetPan({
        x: drag.origPanX + (e.clientX - drag.startX),
        y: drag.origPanY + (e.clientY - drag.startY),
      });
    } else if (drag.kind === 'device') {
      const nx = Math.max(30, snap(drag.origX + (world.x - drag.startWorldX)));
      const ny = Math.max(30, snap(drag.origY + (world.y - drag.startWorldY)));
      if (nx !== drag.origX || ny !== drag.origY) drag.moved = true;
      onMoveDevice(drag.deviceId, nx, ny);
    } else if (drag.kind === 'annotation') {
      const nx = Math.max(20, snap(drag.origX + (world.x - drag.startWorldX)));
      const ny = Math.max(20, snap(drag.origY + (world.y - drag.startWorldY)));
      if (nx !== drag.origX || ny !== drag.origY) drag.moved = true;
      onMoveAnnotation(drag.annId, nx, ny);
    }
  };

  const handlePinClick = (e: React.MouseEvent, device: E3Device, pinId: string) => {
    e.stopPropagation();
    onFocusViewport?.();
    const pin = device.pins.find((p) => p.id === pinId);
    if (!pin) return;
    const abs = getAbsolutePinPos(device, pin);

    if (!wireStart) {
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
        return;
      }
      onCreateWire(wireStart.deviceId, wireStart.pinId, device.id, pin.id);
      setWireStart(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onFocusViewport?.();
    const catId = e.dataTransfer.getData('application/x-flux-catalog-id');
    if (!catId || !sheet) return;
    const item = catalog.find((c) => c.id === catId);
    if (!item) return;
    const world = toWorld(e.clientX, e.clientY);
    onDropCatalogItem(item, snap(world.x - item.width / 2), snap(world.y - item.height / 2), sheet.id);
  };

  const previewWirePoints = useMemo(() => {
    if (!wireStart) return '';
    const obstacles = sheetDevices
      .filter((d) => d.id !== wireStart.deviceId && d.category !== 'io_matrix')
      .map((d) => ({ id: d.id, x: d.x, y: d.y, width: d.width, height: d.height }));
    const pts = autoRouteOrthogonal(
      { x: wireStart.x, y: wireStart.y, direction: wireStart.direction },
      { x: cursorWorld.x, y: cursorWorld.y, direction: 'left' },
      20,
      obstacles
    );
    return pts.map((p) => `${p.x},${p.y}`).join(' ');
  }, [wireStart, cursorWorld, sheetDevices]);

  const vs = project.visualSettings;
  const fontCss = resolveSchematicCssFont(vs.fontFamily);
  const gridPatternId = `flux-cad-grid-vp-${viewportIndex}`;

  const isDrawingTool = tool === 'wire' || tool === 'text' || tool === 'rect' || tool === 'callout';

  return (
    <section
      aria-label={`Рабочий холст электросхемы ${viewportIndex + 1}`}
      data-testid={`viewport-pane-${viewportIndex}`}
      onMouseDown={() => onFocusViewport?.()}
      className={`flex-1 min-w-0 min-h-0 flex flex-col bg-[var(--flux-canvas-bg)] relative ${
        isMultiViewport
          ? `border rounded-sm overflow-hidden ${
              isFocused ? 'border-[var(--flux-accent)] ring-1 ring-[var(--flux-accent)]/40' : 'border-[var(--flux-line)]'
            }`
          : ''
      }`}
    >
      {/* Sheet Tabs Bar (single) OR Compact Viewport Header (multi-viewport) */}
      {isMultiViewport ? (
        <div className="no-print h-7 shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] px-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                isFocused
                  ? 'bg-[var(--flux-accent)] text-white font-semibold'
                  : 'bg-[var(--flux-bg)] text-[var(--flux-text-muted)] border border-[var(--flux-line)]'
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
              className="h-5 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] font-medium text-[var(--flux-text)] max-w-[230px] truncate"
            >
              {project.sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  Лист {s.number}: {s.name} ({s.format})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono tabular-nums text-[var(--flux-text-muted)]">
            <span>{Math.round(zoom * 100)}%</span>
            <span>Эл:{sheetDevices.length}</span>
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
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="no-print h-8 shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] px-2 flex items-center justify-between gap-2 overflow-hidden">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              {project.sheets.map((s) => {
                const active = s.id === sheet?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectSheet(s.id)}
                    title={`Лист ${s.number}: ${s.name} (${s.format})`}
                    className={`relative h-8 px-2.5 max-w-[200px] text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                      active
                        ? 'text-[var(--flux-text)]'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    <span className="truncate">
                      Лист {s.number}: {s.name}
                    </span>
                    {active && (
                      <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-[var(--flux-accent)]" />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onAddSheet}
              aria-label="Добавить новый лист схемы"
              className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] whitespace-nowrap shrink-0 border border-transparent hover:border-[var(--flux-line)]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Лист</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-3 text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)] shrink-0">
            {wireStart && (
              <span className="text-[var(--flux-accent)] font-medium">
                Выберите целевой вывод (Esc — отмена)
              </span>
            )}
            <span>Эл.: {sheetDevices.length}</span>
            <span>Связи: {sheetWires.length}</span>
          </div>
        </div>
      )}

      {/* Interactive SVG Viewport */}
      <div
        ref={containerRef}
        data-testid={viewportIndex === 0 ? 'schematic-canvas' : `schematic-canvas-${viewportIndex}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{
          cursor: tool === 'pan' ? 'grab' : wireStart || isDrawingTool ? 'crosshair' : 'default',
        }}
      >
        <svg
          width="100%"
          height="100%"
          onMouseDown={handleMouseDownBg}
          onMouseMove={handleMouseMove}
          onMouseUp={finishDrag}
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
                  x={0}
                  y={0}
                  width={sheet.width}
                  height={sheet.height}
                  fill="var(--flux-surface)"
                  stroke="var(--flux-line-strong)"
                  strokeWidth={1.5}
                  style={{ filter: 'drop-shadow(0 6px 18px rgba(15, 23, 42, 0.09))' }}
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

                {/* GOST 2.104 Frame, Coordinate Zones & Title Block */}
                {vs.showGostFrame && (
                  <g pointerEvents="none">
                    <rect
                      x={20}
                      y={20}
                      width={sheet.width - 40}
                      height={sheet.height - 40}
                      fill="none"
                      stroke="var(--flux-text)"
                      strokeWidth={1.4}
                    />
                    <rect
                      x={4}
                      y={4}
                      width={sheet.width - 24}
                      height={sheet.height - 24}
                      fill="none"
                      stroke="var(--flux-line-strong)"
                      strokeWidth={0.7}
                    />
                    {['1', '2', '3', '4', '5', '6'].map((zoneNum, zi, arr) => {
                      const spanW = (sheet.width - 40) / arr.length;
                      const zx = 20 + zi * spanW;
                      return (
                        <g key={`z-top-${zoneNum}`}>
                          {zi > 0 && (
                            <line
                              x1={zx}
                              y1={4}
                              x2={zx}
                              y2={20}
                              stroke="var(--flux-line-strong)"
                              strokeWidth={0.7}
                            />
                          )}
                          <text
                            x={zx + spanW / 2}
                            y={15}
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
                    {['А', 'Б', 'В', 'Г', 'Д'].map((zoneLet, zi, arr) => {
                      const spanH = (sheet.height - 40) / arr.length;
                      const zy = 20 + zi * spanH;
                      return (
                        <g key={`z-left-${zoneLet}`}>
                          {zi > 0 && (
                            <line
                              x1={4}
                              y1={zy}
                              x2={20}
                              y2={zy}
                              stroke="var(--flux-line-strong)"
                              strokeWidth={0.7}
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
                    <g transform={`translate(${sheet.width - 540}, ${sheet.height - 105})`}>
                      <rect
                        x={0}
                        y={0}
                        width={520}
                        height={85}
                        fill="var(--flux-surface)"
                        stroke="var(--flux-text)"
                        strokeWidth={1.2}
                      />
                      <line x1={0} y1={28} x2={520} y2={28} stroke="var(--flux-text)" strokeWidth={1} />
                      <line x1={0} y1={56} x2={520} y2={56} stroke="var(--flux-text)" strokeWidth={1} />
                      <line x1={180} y1={0} x2={180} y2={85} stroke="var(--flux-text)" strokeWidth={1} />
                      <line x1={420} y1={28} x2={420} y2={85} stroke="var(--flux-text)" strokeWidth={1} />
                      <text x={10} y={18} fill="var(--flux-text)" fontSize={11} fontFamily={fontCss} fontWeight={600}>
                        {sheet.titleBlock.documentCode}
                      </text>
                      <text x={190} y={18} fill="var(--flux-text)" fontSize={11} fontFamily={fontCss} fontWeight={500}>
                        {sheet.titleBlock.sheetTitle}
                      </text>
                      <text x={10} y={46} fill="var(--flux-text-muted)" fontSize={10} fontFamily={fontCss}>
                        Разраб.: {sheet.titleBlock.designer}
                      </text>
                      <text x={190} y={46} fill="var(--flux-text-muted)" fontSize={10} fontFamily={fontCss}>
                        {sheet.titleBlock.organization}
                      </text>
                      <text x={430} y={46} fill="var(--flux-text)" fontSize={10} fontFamily={fontCss}>
                        Лист {sheet.number}
                      </text>
                      <text x={10} y={74} fill="var(--flux-text-muted)" fontSize={10} fontFamily={fontCss}>
                        Пров.: {sheet.titleBlock.checker}
                      </text>
                      <text x={190} y={74} fill="var(--flux-text-muted)" fontSize={10} fontFamily={fontCss}>
                        FLUX: {project.fluxProjectKey}
                      </text>
                      <text x={430} y={74} fill="var(--flux-text)" fontSize={10} fontFamily={fontCss}>
                        {sheet.format}
                      </text>
                    </g>
                  </g>
                )}
              </g>
            )}

            {/* Drafting Zones / Annotations (under wires/devices for rect zones) */}
            {sheetAnnotations.map((ann) => {
              const selected = ann.id === selectedAnnotationId;
              const strokeColor = selected ? 'var(--flux-accent)' : ann.color || 'var(--flux-text)';
              const fs = (ann.fontSize || 12) * vs.fontScale;
              const lines = (ann.text || '').split(/\r?\n/);
              const lineH = Math.round(fs * 1.3);
              const maxLineLen = Math.max(4, ...lines.map((l) => l.length));

              if (ann.kind === 'rect') {
                return (
                  <g
                    key={ann.id}
                    data-testid={`annotation-${ann.id}`}
                    onMouseDown={(e) => handleAnnotationDown(e, ann)}
                    className="cursor-move"
                  >
                    <rect
                      x={ann.x}
                      y={ann.y}
                      width={ann.width}
                      height={ann.height}
                      fill={selected ? 'var(--flux-accent)' : 'transparent'}
                      fillOpacity={selected ? 0.06 : 0}
                      stroke={strokeColor}
                      strokeWidth={selected ? 2 : 1.3}
                      strokeDasharray="8 4"
                      rx={2}
                    />
                    <rect
                      x={ann.x + 8}
                      y={ann.y - 11}
                      width={Math.max(88, Math.round(maxLineLen * (fs * 0.7) + 22))}
                      height={Math.max(19, lines.length * lineH + 4)}
                      fill="var(--flux-surface)"
                      stroke={strokeColor}
                      strokeWidth={0.8}
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
                    className="cursor-move"
                  >
                    <circle cx={ann.x} cy={ann.y + ann.height} r={3.5} fill={strokeColor} />
                    <polyline
                      points={`${ann.x},${ann.y + ann.height} ${ann.x + 26},${ann.y + 18} ${ann.x + 26 + boxW + 6},${ann.y + 18}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={selected ? 2 : 1.3}
                    />
                    <rect
                      x={ann.x + 28}
                      y={ann.y}
                      width={boxW}
                      height={boxH}
                      fill="var(--flux-surface)"
                      fillOpacity={0.92}
                      stroke={selected ? 'var(--flux-accent)' : 'none'}
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
                  className="cursor-move"
                >
                  <rect
                    x={ann.x - 4}
                    y={ann.y - fs - 2}
                    width={Math.max(80, Math.round(maxLineLen * (fs * 0.6) + 14))}
                    height={Math.max(fs + 10, lines.length * lineH + 6)}
                    fill="var(--flux-surface)"
                    fillOpacity={0.85}
                    stroke={selected ? 'var(--flux-accent)' : 'transparent'}
                    strokeDasharray="4 2"
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

            {/* Wires */}
            {sheetWires.map((wire: E3Wire) => {
              const selected = wire.id === selectedWireId;
              const pts = wire.waypoints.map((p) => `${p.x},${p.y}`).join(' ');
              const color = selected
                ? 'var(--flux-accent)'
                : vs.netColors[wire.signalType] || 'var(--flux-text)';
              let midPt = wire.waypoints[0];
              if (wire.waypoints.length >= 2) {
                let bestLen = -1;
                for (let i = 0; i < wire.waypoints.length - 1; i++) {
                  const a = wire.waypoints[i];
                  const b = wire.waypoints[i + 1];
                  const len = Math.hypot(b.x - a.x, b.y - a.y);
                  if (len > bestLen) {
                    bestLen = len;
                    midPt = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
                  }
                }
              }
              return (
                <g
                  key={wire.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDevice(null);
                    onSelectAnnotation(null);
                    onSelectWire(wire.id);
                  }}
                  className="cursor-pointer"
                >
                  <polyline points={pts} fill="none" stroke="transparent" strokeWidth={10} />
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={color}
                    strokeWidth={selected ? vs.wireWidth + 1.5 : vs.wireWidth}
                    strokeLinejoin="round"
                  />
                  {vs.showWireNumbers && midPt && (() => {
                    const boxW = Math.max(24, wire.wireNumber.length * 6.2 + 8);
                    return (
                      <g transform={`translate(${midPt.x - boxW / 2}, ${midPt.y - 6})`}>
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
                  })()}
                </g>
              );
            })}

            {/* Live Rubber-band Wire Preview */}
            {wireStart && previewWirePoints && (
              <polyline
                points={previewWirePoints}
                fill="none"
                stroke="var(--flux-accent)"
                strokeWidth={vs.wireWidth}
                strokeDasharray="5 3"
                pointerEvents="none"
              />
            )}

            {/* Devices */}
            {sheetDevices.slice(0, 1200).map((device) => (
              <SchematicSymbol
                key={device.id}
                device={device}
                selected={device.id === selectedDeviceId}
                visual={vs}
                wireStartPinKey={wireStart ? `${wireStart.deviceId}:${wireStart.pinId}` : null}
                connectedPinKeys={connectedPinKeys}
                onSelectDevice={handleSelectDeviceDown}
                onPinClick={handlePinClick}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Compact CAD Canvas Footer Strip */}
      <div className="no-print h-7 px-2 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0 overflow-hidden select-none text-[11px]">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden whitespace-nowrap font-mono tabular-nums text-[var(--flux-text-muted)]">
          <span data-testid="canvas-coords" className="shrink-0">
            X:{cursorWorld.x} Y:{cursorWorld.y}{isMultiViewport ? '' : ' мм'}
          </span>
          {sheet && !isMultiViewport && (
            <span className="hidden lg:inline truncate">
              · {sheet.format} ({sheet.width}×{sheet.height})
            </span>
          )}
          {(wireStart || tool !== 'select') && (
            <button
              type="button"
              data-testid="cancel-tool-btn"
              onClick={() => {
                if (wireStart) setWireStart(null);
                else onSetTool?.('select');
              }}
              className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] font-sans font-medium whitespace-nowrap shrink-0"
            >
              <span>{wireStart ? 'Укажите вывод' : `Режим: ${tool}`}</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onToggleGrid && (
            <button
              type="button"
              onClick={onToggleGrid}
              title="Показать/скрыть чертёжную сетку"
              aria-label="Переключить сетку"
              className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.showGrid
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                  : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Grid3X3 className="w-3 h-3" />
              <span className={isMultiViewport ? 'hidden' : 'hidden md:inline'}>Сетка</span>
            </button>
          )}
          {onToggleSnapToGrid && (
            <button
              type="button"
              onClick={onToggleSnapToGrid}
              title="Привязка к сетке"
              aria-label="Переключить привязку"
              className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.snapToGrid
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                  : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Magnet className="w-3 h-3" />
              <span className={isMultiViewport ? 'hidden' : 'hidden md:inline'}>Привязка</span>
            </button>
          )}

          <span className="h-3.5 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={() => onSetZoom(Math.max(0.16, Math.round((zoom - 0.1) * 100) / 100))}
            aria-label="Уменьшить масштаб холста"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-10 text-center font-mono tabular-nums text-[var(--flux-text)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onSetZoom(Math.min(2.5, Math.round((zoom + 0.1) * 100) / 100))}
            aria-label="Увеличить масштаб холста"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <Plus className="w-3 h-3" />
          </button>
          {onFitViewport && (
            <button
              type="button"
              onClick={onFitViewport}
              title="Вписать лист в окно"
              aria-label="Вписать лист в окно"
              className="inline-flex items-center justify-center w-5 h-5 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
