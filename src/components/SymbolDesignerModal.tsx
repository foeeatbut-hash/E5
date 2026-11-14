import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Circle,
  Cpu,
  Minus,
  MousePointer2,
  Plus,
  Square,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import type {
  CatalogItem,
  CustomSymbolShape,
  CustomSymbolSpec,
  DeviceCategory,
  E3Pin,
  PinDirection,
  SignalType,
} from '../core/e3Types';
import {
  buildSymbolDesignerPreset,
  inferPinDirection,
  nextPinName,
  normalizeCustomSymbolSpec,
  snapSymbolCoord,
  type SymbolEditorTool,
  type SymbolPresetId,
} from '../core/symbolDesigner';

export interface SymbolGeometryResult {
  width: number;
  height: number;
  customSymbol: CustomSymbolSpec;
  pins: Omit<E3Pin, 'id'>[];
}

interface SymbolDesignerModalProps {
  open: boolean;
  initialItem?: CatalogItem | null;
  initialGeometry?: {
    width: number;
    height: number;
    customSymbol?: CustomSymbolSpec;
    pins: Omit<E3Pin, 'id'>[];
  } | null;
  mode: 'catalog' | 'geometry';
  onClose: () => void;
  onSaveCatalogItem?: (item: CatalogItem) => void;
  onApplyGeometry?: (result: SymbolGeometryResult) => void;
}

const SIGNAL_OPTIONS: Array<{ value: SignalType; label: string; color: string }> = [
  { value: 'signal', label: 'Сигнал', color: '#0ea5e9' },
  { value: 'power', label: 'Сила 380В', color: '#dc2626' },
  { value: 'dc24', label: '+24V DC', color: '#d97706' },
  { value: 'dc0', label: '0V / N', color: '#475569' },
  { value: 'pe', label: 'PE', color: '#16a34a' },
  { value: 'bus', label: 'RS-485', color: '#7c3aed' },
];

const DIR_LABELS: Record<PinDirection, string> = {
  top: 'Верх',
  bottom: 'Низ',
  left: 'Лево',
  right: 'Право',
};

function parseFiniteClamped(raw: string, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export const SymbolDesignerModal: React.FC<SymbolDesignerModalProps> = ({
  open,
  initialItem,
  initialGeometry,
  mode,
  onClose,
  onSaveCatalogItem,
  onApplyGeometry,
}) => {
  const [tool, setTool] = useState<SymbolEditorTool>('line');
  const [width, setWidth] = useState(120);
  const [height, setHeight] = useState(100);
  const [shapes, setShapes] = useState<CustomSymbolShape[]>([]);
  const [pins, setPins] = useState<Omit<E3Pin, 'id'>[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedPinIdx, setSelectedPinIdx] = useState<number | null>(null);
  const [newTextLabel, setNewTextLabel] = useState('K');
  const [pinSignalType, setPinSignalType] = useState<SignalType>('signal');

  // Standalone catalog metadata
  const [componentName, setComponentName] = useState('Пользовательский блок УГО');
  const [defaultPrefix, setDefaultPrefix] = useState('K');
  const [article, setArticle] = useState('USER-UGO-01');
  const [manufacturer, setManufacturer] = useState('Собств. УГО');
  const [category, setCategory] = useState<DeviceCategory>('relay');
  const [e3BlockName, setE3BlockName] = useState('GOST_USER_BLOCK');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initialGeometry) {
      setWidth(initialGeometry.width || 120);
      setHeight(initialGeometry.height || 100);
      setShapes(
        initialGeometry.customSymbol?.shapes
          ? structuredClone(initialGeometry.customSymbol.shapes)
          : buildSymbolDesignerPreset('blank_box').shapes
      );
      setPins(
        initialGeometry.pins.length > 0
          ? structuredClone(initialGeometry.pins)
          : buildSymbolDesignerPreset('blank_box').pins
      );
    } else if (initialItem) {
      setWidth(initialItem.width || 120);
      setHeight(initialItem.height || 100);
      setShapes(
        initialItem.customSymbol?.shapes
          ? structuredClone(initialItem.customSymbol.shapes)
          : buildSymbolDesignerPreset('blank_box').shapes
      );
      setPins(structuredClone(initialItem.pins));
      setComponentName(initialItem.componentName);
      setDefaultPrefix(initialItem.defaultPrefix);
      setArticle(initialItem.article);
      setManufacturer(initialItem.manufacturer);
      setCategory(initialItem.category);
      setE3BlockName(initialItem.e3BlockName);
    } else {
      const preset = buildSymbolDesignerPreset('blank_box');
      setWidth(preset.width);
      setHeight(preset.height);
      setShapes(preset.shapes);
      setPins(preset.pins);
      setComponentName('Пользовательский элемент УГО');
      setDefaultPrefix('U');
      setArticle('CUSTOM-UGO-01');
      setManufacturer('Собств. база');
      setCategory('relay');
      setE3BlockName('GOST_CUSTOM_UGO');
    }
    setSelectedShapeId(null);
    setSelectedPinIdx(null);
    setDragOrigin(null);
    setDragCurrent(null);
  }, [open, initialItem, initialGeometry]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dragOrigin) {
          setDragOrigin(null);
          setDragCurrent(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dragOrigin, onClose]);

  const pad = 30;
  const viewW = width + pad * 2;
  const viewH = height + pad * 2;

  const clientToGrid = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const rawX = ((clientX - rect.left) / Math.max(1, rect.width)) * viewW - pad;
    const rawY = ((clientY - rect.top) / Math.max(1, rect.height)) * viewH - pad;
    return {
      x: Math.max(0, Math.min(width, snapSymbolCoord(rawX, 10))),
      y: Math.max(0, Math.min(height, snapSymbolCoord(rawY, 10))),
    };
  };

  const applyPreset = (id: SymbolPresetId) => {
    const p = buildSymbolDesignerPreset(id);
    setWidth(p.width);
    setHeight(p.height);
    setShapes(p.shapes);
    setPins(p.pins);
    setSelectedShapeId(null);
    setSelectedPinIdx(null);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const pt = clientToGrid(e.clientX, e.clientY);

    if (tool === 'pin') {
      const name = nextPinName(pins);
      const direction = inferPinDirection(pt.x, pt.y, width, height);
      setPins((prev) => {
        const next = [
          ...prev,
          { name, dx: pt.x, dy: pt.y, direction, signalType: pinSignalType },
        ];
        setSelectedPinIdx(next.length - 1);
        setSelectedShapeId(null);
        return next;
      });
      return;
    }

    if (tool === 'text') {
      const id = `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
      const shape: CustomSymbolShape = {
        id,
        kind: 'text',
        x: pt.x,
        y: Math.max(10, pt.y),
        text: newTextLabel.trim() || 'УГО',
        fontSize: 10,
        bold: true,
      };
      setShapes((prev) => [...prev, shape]);
      setSelectedShapeId(id);
      setSelectedPinIdx(null);
      return;
    }

    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      setDragOrigin(pt);
      setDragCurrent(pt);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragOrigin) return;
    setDragCurrent(clientToGrid(e.clientX, e.clientY));
  };

  const handleCanvasMouseUp = () => {
    if (!dragOrigin || !dragCurrent) return;
    const id = `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const dx = dragCurrent.x - dragOrigin.x;
    const dy = dragCurrent.y - dragOrigin.y;

    if (tool === 'line' && (dx !== 0 || dy !== 0)) {
      setShapes((prev) => [
        ...prev,
        { id, kind: 'line', x1: dragOrigin.x, y1: dragOrigin.y, x2: dragCurrent.x, y2: dragCurrent.y },
      ]);
      setSelectedShapeId(id);
    } else if (tool === 'rect') {
      const w = Math.max(10, Math.abs(dx));
      const h = Math.max(10, Math.abs(dy));
      setShapes((prev) => [
        ...prev,
        {
          id,
          kind: 'rect',
          x: Math.min(dragOrigin.x, dragCurrent.x),
          y: Math.min(dragOrigin.y, dragCurrent.y),
          width: w,
          height: h,
          filled: true,
        },
      ]);
      setSelectedShapeId(id);
    } else if (tool === 'circle') {
      const r = Math.max(10, Math.round(Math.hypot(dx, dy) / 5) * 5);
      setShapes((prev) => [
        ...prev,
        {
          id,
          kind: 'circle',
          cx: dragOrigin.x,
          cy: dragOrigin.y,
          r,
          filled: true,
        },
      ]);
      setSelectedShapeId(id);
    }
    setDragOrigin(null);
    setDragCurrent(null);
  };

  const gridLines = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = 0; x <= width; x += 10) xs.push(x);
    for (let y = 0; y <= height; y += 10) ys.push(y);
    return { xs, ys };
  }, [width, height]);

  const handleCommit = () => {
    const norm = normalizeCustomSymbolSpec(width, height, shapes, pins);
    if (mode === 'geometry' && onApplyGeometry) {
      onApplyGeometry(norm);
      onClose();
      return;
    }
    if (onSaveCatalogItem) {
      const item: CatalogItem = {
        id: initialItem?.id || `custom-ugo-${Date.now().toString(36)}`,
        category,
        defaultPrefix: defaultPrefix.trim() || 'K',
        componentName: componentName.trim() || 'Пользовательское УГО',
        article: article.trim() || 'USER-UGO',
        manufacturer: manufacturer.trim() || 'Собств. УГО',
        e3BlockName: e3BlockName.trim() || `UGO_${(defaultPrefix || 'K').toUpperCase()}`,
        width: norm.width,
        height: norm.height,
        pins: norm.pins,
        defaultAttributes:
          initialItem?.defaultAttributes || [
            { name: 'Тип УГО', value: 'Пользовательское', owner: '', conflict: 'flux' },
          ],
        isCustom: true,
        customSymbol: norm.customSymbol,
      };
      onSaveCatalogItem(item);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="symbol-designer-title"
          data-testid="symbol-designer-modal"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.985 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-5xl rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-4 h-11 border-b border-[var(--flux-line)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[var(--flux-accent)]" />
                <h2 id="symbol-designer-title" className="text-[14px] font-semibold text-[var(--flux-text)]">
                  Редактор графики УГО (Symbol Designer)
                </h2>
                <span className="text-[11px] font-mono text-[var(--flux-text-muted)]">
                  · сетка 10 мм · {width}×{height}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть редактор УГО"
                className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              {/* Left Tool + Drawing Canvas */}
              <div className="flex-1 flex flex-col min-w-0 bg-[var(--flux-bg)] border-b lg:border-b-0 lg:border-r border-[var(--flux-line)]">
                {/* Tool Strip */}
                <div className="px-3 py-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-wrap items-center gap-1.5 text-[11px]">
                  {(
                    [
                      { id: 'select', label: 'Выбор', icon: <MousePointer2 className="w-3.5 h-3.5" /> },
                      { id: 'line', label: 'Линия', icon: <Minus className="w-3.5 h-3.5" /> },
                      { id: 'rect', label: 'Прямоуг.', icon: <Square className="w-3.5 h-3.5" /> },
                      { id: 'circle', label: 'Круг', icon: <Circle className="w-3.5 h-3.5" /> },
                      { id: 'text', label: 'Текст', icon: <Type className="w-3.5 h-3.5" /> },
                      { id: 'pin', label: '+ Вывод', icon: <Plus className="w-3.5 h-3.5" /> },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`symbol-tool-${t.id}`}
                      onClick={() => setTool(t.id)}
                      className={`inline-flex items-center gap-1 h-7 px-2 rounded border transition-colors ${
                        tool === t.id
                          ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)] text-[var(--flux-accent)] font-semibold'
                          : 'border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                      }`}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                    </button>
                  ))}

                  {tool === 'text' && (
                    <input
                      type="text"
                      spellCheck={false}
                      aria-label="Текст метки УГО"
                      value={newTextLabel}
                      onChange={(e) => setNewTextLabel(e.target.value)}
                      placeholder="Текст метки"
                      className="h-7 w-24 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)]"
                    />
                  )}
                  {tool === 'pin' && (
                    <select
                      aria-label="Тип сигнала нового вывода"
                      value={pinSignalType}
                      onChange={(e) => setPinSignalType(e.target.value as SignalType)}
                      className="h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
                    >
                      {SIGNAL_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="ml-auto flex items-center gap-1">
                    <span className="text-[10px] text-[var(--flux-text-muted)] mr-1">Шаблон:</span>
                    {(
                      [
                        ['blank_box', 'Блок'],
                        ['sensor_circle', 'Датчик'],
                        ['breaker_1p', 'Автомат'],
                        ['coil_relay', 'Реле'],
                      ] as const
                    ).map(([pid, lbl]) => (
                      <button
                        key={pid}
                        type="button"
                        data-testid={`symbol-preset-${pid}`}
                        onClick={() => applyPreset(pid)}
                        className="h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[10.5px] text-[var(--flux-text)]"
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Drawing Grid Surface */}
                <div className="flex-1 min-h-[280px] flex items-center justify-center p-4 overflow-auto">
                  <svg
                    ref={svgRef}
                    data-testid="symbol-designer-canvas"
                    viewBox={`0 0 ${viewW} ${viewH}`}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    className="w-full max-w-[480px] aspect-square max-h-[380px] bg-[var(--flux-surface)] rounded border border-[var(--flux-line-strong)] shadow-inner cursor-crosshair select-none"
                  >
                    <g transform={`translate(${pad}, ${pad})`}>
                      {/* Outer bounding box */}
                      <rect
                        x={0}
                        y={0}
                        width={width}
                        height={height}
                        fill="var(--flux-bg)"
                        fillOpacity={0.35}
                        stroke="var(--flux-accent)"
                        strokeWidth={0.8}
                        strokeDasharray="3 2"
                      />
                      {/* 10mm Snap Grid */}
                      {gridLines.xs.map((gx) => (
                        <line
                          key={`gx-${gx}`}
                          x1={gx}
                          y1={0}
                          x2={gx}
                          y2={height}
                          stroke="var(--flux-line)"
                          strokeWidth={gx % 50 === 0 ? 0.8 : 0.4}
                          strokeOpacity={gx % 50 === 0 ? 0.85 : 0.45}
                        />
                      ))}
                      {gridLines.ys.map((gy) => (
                        <line
                          key={`gy-${gy}`}
                          x1={0}
                          y1={gy}
                          x2={width}
                          y2={gy}
                          stroke="var(--flux-line)"
                          strokeWidth={gy % 50 === 0 ? 0.8 : 0.4}
                          strokeOpacity={gy % 50 === 0 ? 0.85 : 0.45}
                        />
                      ))}

                      {/* Shapes */}
                      {shapes.map((sh) => {
                        const isSel = selectedShapeId === sh.id;
                        const col = isSel ? 'var(--flux-accent)' : 'var(--flux-text)';
                        const sw = sh.kind !== 'text' ? (sh.strokeWidth ?? 1.8) : 1.8;
                        const dash = sh.kind !== 'text' && sh.dashed ? '4 2' : undefined;
                        if (sh.kind === 'line') {
                          return (
                            <line
                              key={sh.id}
                              x1={sh.x1}
                              y1={sh.y1}
                              x2={sh.x2}
                              y2={sh.y2}
                              stroke={col}
                              strokeWidth={sw}
                              strokeDasharray={dash}
                              onMouseDown={(e) => {
                                if (tool === 'select') {
                                  e.stopPropagation();
                                  setSelectedShapeId(sh.id);
                                  setSelectedPinIdx(null);
                                }
                              }}
                            />
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
                              fill={sh.filled ? 'var(--flux-surface)' : 'none'}
                              fillOpacity={sh.filled ? 0.85 : 0}
                              stroke={col}
                              strokeWidth={sw}
                              strokeDasharray={dash}
                              onMouseDown={(e) => {
                                if (tool === 'select') {
                                  e.stopPropagation();
                                  setSelectedShapeId(sh.id);
                                  setSelectedPinIdx(null);
                                }
                              }}
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
                              fill={sh.filled ? 'var(--flux-surface)' : 'none'}
                              fillOpacity={sh.filled ? 0.85 : 0}
                              stroke={col}
                              strokeWidth={sw}
                              strokeDasharray={dash}
                              onMouseDown={(e) => {
                                if (tool === 'select') {
                                  e.stopPropagation();
                                  setSelectedShapeId(sh.id);
                                  setSelectedPinIdx(null);
                                }
                              }}
                            />
                          );
                        }
                        if (sh.kind === 'polyline' || sh.kind === 'arc') {
                          return null;
                        }
                        return (
                          <text
                            key={sh.id}
                            x={sh.x}
                            y={sh.y}
                            textAnchor="middle"
                            fill={col}
                            fontSize={sh.fontSize || 10}
                            fontWeight={sh.bold ? 700 : 500}
                            fontFamily="JetBrains Mono, monospace"
                            onMouseDown={(e) => {
                              if (tool === 'select') {
                                e.stopPropagation();
                                setSelectedShapeId(sh.id);
                                setSelectedPinIdx(null);
                              }
                            }}
                          >
                            {sh.text}
                          </text>
                        );
                      })}

                      {/* Active Rubber-band Shape Preview */}
                      {dragOrigin && dragCurrent && tool === 'line' && (
                        <line
                          x1={dragOrigin.x}
                          y1={dragOrigin.y}
                          x2={dragCurrent.x}
                          y2={dragCurrent.y}
                          stroke="var(--flux-accent)"
                          strokeWidth={1.6}
                          strokeDasharray="3 2"
                        />
                      )}
                      {dragOrigin && dragCurrent && tool === 'rect' && (
                        <rect
                          x={Math.min(dragOrigin.x, dragCurrent.x)}
                          y={Math.min(dragOrigin.y, dragCurrent.y)}
                          width={Math.max(10, Math.abs(dragCurrent.x - dragOrigin.x))}
                          height={Math.max(10, Math.abs(dragCurrent.y - dragOrigin.y))}
                          fill="var(--flux-accent)"
                          fillOpacity={0.12}
                          stroke="var(--flux-accent)"
                          strokeWidth={1.4}
                          strokeDasharray="3 2"
                        />
                      )}
                      {dragOrigin && dragCurrent && tool === 'circle' && (
                        <circle
                          cx={dragOrigin.x}
                          cy={dragOrigin.y}
                          r={Math.max(10, Math.round(Math.hypot(dragCurrent.x - dragOrigin.x, dragCurrent.y - dragOrigin.y) / 5) * 5)}
                          fill="var(--flux-accent)"
                          fillOpacity={0.12}
                          stroke="var(--flux-accent)"
                          strokeWidth={1.4}
                          strokeDasharray="3 2"
                        />
                      )}

                      {/* Pins */}
                      {pins.map((p, idx) => {
                        const isSel = selectedPinIdx === idx;
                        const sigColor = SIGNAL_OPTIONS.find((s) => s.value === p.signalType)?.color || '#0ea5e9';
                        return (
                          <g
                            key={`pin-${idx}`}
                            onMouseDown={(e) => {
                              if (tool === 'select') {
                                e.stopPropagation();
                                setSelectedPinIdx(idx);
                                setSelectedShapeId(null);
                              }
                            }}
                          >
                            <circle
                              cx={p.dx}
                              cy={p.dy}
                              r={isSel ? 5 : 3.6}
                              fill={isSel ? 'var(--flux-accent)' : 'var(--flux-surface)'}
                              stroke={sigColor}
                              strokeWidth={1.6}
                            />
                            <text
                              x={
                                p.direction === 'left'
                                  ? p.dx - 7
                                  : p.direction === 'right'
                                    ? p.dx + 7
                                    : p.dx + 6
                              }
                              y={
                                p.direction === 'bottom'
                                  ? p.dy + 13
                                  : p.direction === 'top'
                                    ? p.dy - 6
                                    : p.dy + 3
                              }
                              textAnchor={p.direction === 'left' ? 'end' : 'start'}
                              fontSize={8.5}
                              fontFamily="JetBrains Mono, monospace"
                              fontWeight={600}
                              fill={sigColor}
                            >
                              {p.name}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>
              </div>

              {/* Right Sidebar: Metadata, Shapes & Pins */}
              <div className="w-full lg:w-[340px] shrink-0 overflow-y-auto p-3 space-y-3 text-[12px]">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="sd-width" className="block text-[10.5px] text-[var(--flux-text-muted)] mb-1">
                      Ширина блока (мм)
                    </label>
                    <input
                      id="sd-width"
                      type="number"
                      min={40}
                      max={400}
                      step={10}
                      value={width}
                      onChange={(e) => setWidth(parseFiniteClamped(e.target.value, width, 40, 400))}
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="sd-height" className="block text-[10.5px] text-[var(--flux-text-muted)] mb-1">
                      Высота блока (мм)
                    </label>
                    <input
                      id="sd-height"
                      type="number"
                      min={40}
                      max={400}
                      step={10}
                      value={height}
                      onChange={(e) => setHeight(parseFiniteClamped(e.target.value, height, 40, 400))}
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
                    />
                  </div>
                </div>

                {mode === 'catalog' && (
                  <div className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-2">
                    <div className="text-[11px] font-semibold text-[var(--flux-text)]">
                      Карточка элемента базы
                    </div>
                    <div>
                      <label htmlFor="sd-comp-name" className="block text-[10px] text-[var(--flux-text-muted)] mb-0.5">
                        Наименование
                      </label>
                      <input
                        id="sd-comp-name"
                        type="text"
                        data-testid="symbol-designer-name-input"
                        value={componentName}
                        onChange={(e) => setComponentName(e.target.value)}
                        className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label htmlFor="sd-prefix" className="block text-[10px] text-[var(--flux-text-muted)] mb-0.5">
                          Префикс ОУО
                        </label>
                        <input
                          id="sd-prefix"
                          type="text"
                          spellCheck={false}
                          value={defaultPrefix}
                          onChange={(e) => setDefaultPrefix(e.target.value.toUpperCase())}
                          className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
                        />
                      </div>
                      <div>
                        <label htmlFor="sd-article" className="block text-[10px] text-[var(--flux-text-muted)] mb-0.5">
                          Артикул
                        </label>
                        <input
                          id="sd-article"
                          type="text"
                          spellCheck={false}
                          value={article}
                          onChange={(e) => setArticle(e.target.value)}
                          className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Shapes list */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[var(--flux-text)]">
                      Контуры УГО ({shapes.length})
                    </span>
                    {shapes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShapes([])}
                        className="text-[10.5px] text-rose-600 hover:underline"
                      >
                        Очистить
                      </button>
                    )}
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {shapes.map((sh, i) => (
                      <div
                        key={sh.id}
                        className={`flex items-center justify-between gap-2 px-2 py-1 rounded border text-[11px] ${
                          selectedShapeId === sh.id
                            ? 'border-[var(--flux-accent)] bg-[var(--flux-sel)]'
                            : 'border-[var(--flux-line)] bg-[var(--flux-bg)]'
                        }`}
                      >
                        <span className="font-mono truncate">
                          {i + 1}.{' '}
                          {sh.kind === 'line'
                            ? `Линия (${sh.x1},${sh.y1}→${sh.x2},${sh.y2})`
                            : sh.kind === 'polyline'
                              ? `Полилиния (${sh.points.length} т.)`
                              : sh.kind === 'rect'
                                ? `Прямоуг. ${sh.width}×${sh.height}`
                                : sh.kind === 'circle'
                                  ? `Круг R=${sh.r}`
                                  : sh.kind === 'arc'
                                    ? `Дуга R=${sh.r}`
                                    : `Текст «${sh.text}»`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShapes((prev) => prev.filter((s) => s.id !== sh.id))}
                          aria-label="Удалить контур"
                          className="text-[var(--flux-text-muted)] hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Pins list */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[var(--flux-text)]">
                      Выводы / Пины ({pins.length})
                    </span>
                    <button
                      type="button"
                      data-testid="symbol-designer-add-pin-btn"
                      onClick={() =>
                        setPins((prev) => [
                          ...prev,
                          {
                            name: nextPinName(prev),
                            dx: Math.round(width / 2 / 10) * 10,
                            dy: height,
                            direction: 'bottom',
                            signalType: pinSignalType,
                          },
                        ])
                      }
                      className="inline-flex items-center gap-0.5 text-[10.5px] text-[var(--flux-accent)] hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Добавить вывод
                    </button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {pins.map((p, idx) => (
                      <div
                        key={`pin-row-${idx}`}
                        className={`flex items-center gap-1.5 px-1.5 py-1 rounded border text-[11px] ${
                          selectedPinIdx === idx
                            ? 'border-[var(--flux-accent)] bg-[var(--flux-sel)]'
                            : 'border-[var(--flux-line)] bg-[var(--flux-bg)]'
                        }`}
                      >
                        <input
                          type="text"
                          spellCheck={false}
                          value={p.name}
                          onChange={(e) =>
                            setPins((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                            )
                          }
                          aria-label={`Имя вывода ${idx + 1}`}
                          className="w-12 h-6 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px]"
                        />
                        <span className="font-mono text-[10px] text-[var(--flux-text-muted)] shrink-0">
                          {p.dx},{p.dy}
                        </span>
                        <select
                          aria-label={`Направление вывода ${p.name}`}
                          value={p.direction}
                          onChange={(e) =>
                            setPins((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, direction: e.target.value as PinDirection } : item
                              )
                            )
                          }
                          className="h-6 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[10.5px]"
                        >
                          {(Object.keys(DIR_LABELS) as PinDirection[]).map((d) => (
                            <option key={d} value={d}>
                              {DIR_LABELS[d]}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={`Сигнал вывода ${p.name}`}
                          value={p.signalType}
                          onChange={(e) =>
                            setPins((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, signalType: e.target.value as SignalType } : item
                              )
                            )
                          }
                          className="flex-1 min-w-0 h-6 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[10.5px]"
                        >
                          {SIGNAL_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setPins((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label={`Удалить вывод ${p.name}`}
                          className="text-[var(--flux-text-muted)] hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 h-12 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0">
              <div className="text-[11px] text-[var(--flux-text-muted)]">
                ЛКМ: выберите «Линия / Прямоуг. / Круг» и протяните на сетке, или кликните «+ Вывод».
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-8 px-3 rounded border border-[var(--flux-line)] text-[12px] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  data-testid="symbol-designer-save-btn"
                  onClick={handleCommit}
                  className="h-8 px-4 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[12px] font-medium"
                >
                  {mode === 'geometry' ? 'Применить графику УГО' : 'Сохранить УГО в базу'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
