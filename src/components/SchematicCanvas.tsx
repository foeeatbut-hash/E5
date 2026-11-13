import React, { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { E3_CATALOG } from '../core/e3Catalog';
import { autoRouteOrthogonal, getAbsolutePinPos } from '../core/e3Engine';
import type { CatalogItem, E3Device, E3Project, E3Wire } from '../core/e3Types';
import type { CadTool } from './TopToolbar';
import { SchematicSymbol } from './SchematicSymbol';

interface SchematicCanvasProps {
  project: E3Project;
  activeSheetId: string;
  tool: CadTool;
  zoom: number;
  pan: { x: number; y: number };
  selectedDeviceId: string | null;
  selectedWireId: string | null;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onSetZoom: (zoom: number) => void;
  onSetPan: (pan: { x: number; y: number }) => void;
  onSelectDevice: (deviceId: string | null) => void;
  onSelectWire: (wireId: string | null) => void;
  onMoveDevice: (deviceId: string, x: number, y: number) => void;
  onCreateWire: (fromDeviceId: string, fromPinId: string, toDeviceId: string, toPinId: string) => void;
  onDropCatalogItem: (item: CatalogItem, x: number, y: number) => void;
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  project,
  activeSheetId,
  tool,
  zoom,
  pan,
  selectedDeviceId,
  selectedWireId,
  onSelectSheet,
  onAddSheet,
  onSetZoom,
  onSetPan,
  onSelectDevice,
  onSelectWire,
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

  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number }
    | { kind: 'device'; deviceId: string; startWorldX: number; startWorldY: number; origX: number; origY: number }
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

  const handleMouseDownBg = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || tool === 'pan' || e.shiftKey) {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      };
      return;
    }
    if (wireStart) {
      setWireStart(null);
      return;
    }
    onSelectDevice(null);
    onSelectWire(null);
  };

  const handleSelectDeviceDown = (e: React.MouseEvent, device: E3Device) => {
    e.stopPropagation();
    if (tool === 'pan' || e.button === 1) {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
      };
      return;
    }
    onSelectWire(null);
    onSelectDevice(device.id);
    if (tool === 'select') {
      const world = toWorld(e.clientX, e.clientY);
      dragRef.current = {
        kind: 'device',
        deviceId: device.id,
        startWorldX: world.x,
        startWorldY: world.y,
        origX: device.x,
        origY: device.y,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') {
      onSetPan({
        x: drag.origPanX + (e.clientX - drag.startX),
        y: drag.origPanY + (e.clientY - drag.startY),
      });
    } else if (drag.kind === 'device') {
      const nx = snap(drag.origX + (world.x - drag.startWorldX));
      const ny = snap(drag.origY + (world.y - drag.startWorldY));
      onMoveDevice(drag.deviceId, Math.max(30, nx), Math.max(30, ny));
    }
  };

  const handleMouseUp = () => {
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > 0) {
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      const nextZoom = Math.min(2.5, Math.max(0.3, Math.round((zoom + delta) * 100) / 100));
      onSetZoom(nextZoom);
    }
  };

  const handlePinClick = (e: React.MouseEvent, device: E3Device, pinId: string) => {
    e.stopPropagation();
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
    const catId = e.dataTransfer.getData('application/x-flux-catalog-id');
    if (!catId) return;
    const item = E3_CATALOG.find((c) => c.id === catId);
    if (!item) return;
    const world = toWorld(e.clientX, e.clientY);
    onDropCatalogItem(item, snap(world.x - item.width / 2), snap(world.y - item.height / 2));
  };

  const previewWirePoints = useMemo(() => {
    if (!wireStart) return '';
    const pts = autoRouteOrthogonal(
      { x: wireStart.x, y: wireStart.y, direction: wireStart.direction },
      { x: cursorWorld.x, y: cursorWorld.y, direction: 'left' }
    );
    return pts.map((p) => `${p.x},${p.y}`).join(' ');
  }, [wireStart, cursorWorld]);

  const vs = project.visualSettings;

  return (
    <section
      aria-label="Рабочий холст электросхемы"
      className="flex-1 min-w-0 min-h-0 flex flex-col bg-[var(--flux-canvas-bg)] relative"
    >
      {/* Sheet Tabs Bar */}
      <div className="no-print h-8 shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] px-2 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-0">
          {project.sheets.map((s) => {
            const active = s.id === sheet?.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSheet(s.id)}
                className={`relative h-8 px-3 text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  active
                    ? 'text-[var(--flux-text)]'
                    : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                }`}
              >
                <span>
                  Лист {s.number}: {s.name}
                </span>
                {active && (
                  <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-[var(--flux-accent)]" />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAddSheet}
            aria-label="Добавить новый лист схемы"
            className="inline-flex items-center gap-1 h-6 px-2 ml-1 rounded text-[11px] font-medium text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] whitespace-nowrap shrink-0"
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
          <span>
            X:{cursorWorld.x} Y:{cursorWorld.y} мм
          </span>
          <span>Эл.: {sheetDevices.length}</span>
          <span>Связи: {sheetWires.length}</span>
        </div>
      </div>

      {/* Interactive SVG Viewport */}
      <div
        ref={containerRef}
        data-testid="schematic-canvas"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onWheel={handleWheel}
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{
          cursor: tool === 'pan' ? 'grab' : wireStart || tool === 'wire' ? 'crosshair' : 'default',
        }}
      >
        <svg
          width="100%"
          height="100%"
          onMouseDown={handleMouseDownBg}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="block w-full h-full"
        >
          <defs>
            <pattern
              id="flux-cad-grid"
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
                />
                {vs.showGrid && (
                  <rect
                    x={0}
                    y={0}
                    width={sheet.width}
                    height={sheet.height}
                    fill="url(#flux-cad-grid)"
                  />
                )}

                {/* GOST 2.104 Frame & Title Block */}
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
                    {/* Title block bottom-right */}
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
                      <text x={10} y={18} fill="var(--flux-text)" fontSize={11} fontFamily="var(--font-mono)" fontWeight={600}>
                        {sheet.titleBlock.documentCode}
                      </text>
                      <text x={190} y={18} fill="var(--flux-text)" fontSize={11} fontWeight={500}>
                        {sheet.titleBlock.sheetTitle}
                      </text>
                      <text x={10} y={46} fill="var(--flux-text-muted)" fontSize={10}>
                        Разраб.: {sheet.titleBlock.designer}
                      </text>
                      <text x={190} y={46} fill="var(--flux-text-muted)" fontSize={10}>
                        {sheet.titleBlock.organization}
                      </text>
                      <text x={430} y={46} fill="var(--flux-text)" fontSize={10} fontFamily="var(--font-mono)">
                        Лист {sheet.number}
                      </text>
                      <text x={10} y={74} fill="var(--flux-text-muted)" fontSize={10}>
                        Пров.: {sheet.titleBlock.checker}
                      </text>
                      <text x={190} y={74} fill="var(--flux-text-muted)" fontSize={10} fontFamily="var(--font-mono)">
                        FLUX: {project.fluxProjectKey}
                      </text>
                      <text x={430} y={74} fill="var(--flux-text)" fontSize={10} fontFamily="var(--font-mono)">
                        {sheet.format}
                      </text>
                    </g>
                  </g>
                )}
              </g>
            )}

            {/* Wires */}
            {sheetWires.map((wire: E3Wire) => {
              const selected = wire.id === selectedWireId;
              const pts = wire.waypoints.map((p) => `${p.x},${p.y}`).join(' ');
              const color = selected
                ? 'var(--flux-accent)'
                : vs.netColors[wire.signalType] || 'var(--flux-text)';
              const midIdx = Math.floor(wire.waypoints.length / 2);
              const midPt = wire.waypoints[midIdx] || wire.waypoints[0];
              return (
                <g
                  key={wire.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectDevice(null);
                    onSelectWire(wire.id);
                  }}
                  className="cursor-pointer"
                >
                  {/* Hit area */}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={10}
                  />
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={color}
                    strokeWidth={selected ? vs.wireWidth + 1.5 : vs.wireWidth}
                    strokeLinejoin="round"
                  />
                  {vs.showWireNumbers && midPt && (
                    <g transform={`translate(${midPt.x}, ${midPt.y - 6})`}>
                      <rect
                        x={-2}
                        y={-10}
                        width={Math.max(24, wire.wireNumber.length * 6.8 + 6)}
                        height={13}
                        rx={2}
                        fill="var(--flux-surface)"
                        opacity={0.9}
                      />
                      <text
                        x={2}
                        y={0}
                        fill={color}
                        fontSize={10 * vs.fontScale}
                        fontFamily="var(--font-mono)"
                        fontWeight={500}
                      >
                        {wire.wireNumber}
                      </text>
                    </g>
                  )}
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

            {/* Devices (render first 400 smoothly on active sheet) */}
            {sheetDevices.slice(0, 400).map((device) => (
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
    </section>
  );
};
