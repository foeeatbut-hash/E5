import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Map as MapIcon } from 'lucide-react';

const STORAGE_KEY = 'e3promax_minimap_open_v1';

export interface MinimapDevice {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CanvasMinimapProps {
  sheetWidth: number;
  sheetHeight: number;
  devices: MinimapDevice[];
  wires: { waypoints: { x: number; y: number }[] }[];
  selectedDeviceIds: Set<string>;
  zoom: number;
  pan: { x: number; y: number };
  viewportSize: { width: number; height: number };
  onSetPan: (pan: { x: number; y: number }) => void;
  /** Filled by the minimap; the canvas calls it during gestures to move the viewport rect imperatively. */
  liveUpdateRef?: React.MutableRefObject<((zoom: number, pan: { x: number; y: number }) => void) | null>;
}

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export const CanvasMinimap: React.FC<CanvasMinimapProps> = ({
  sheetWidth,
  sheetHeight,
  devices,
  wires,
  selectedDeviceIds,
  zoom,
  pan,
  viewportSize,
  onSetPan,
  liveUpdateRef,
}) => {
  const [open, setOpen] = useState<boolean>(readOpen);
  const rectRef = useRef<SVGRectElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const liveRef = useRef({ zoom, pan });
  const draggingRef = useRef(false);

  const PAD = 40;
  const vbW = sheetWidth + PAD * 2;
  const vbH = sheetHeight + PAD * 2;
  const aspect = vbH / Math.max(1, vbW);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const placeRect = useCallback(
    (z: number, p: { x: number; y: number }) => {
      liveRef.current = { zoom: z, pan: p };
      const el = rectRef.current;
      if (!el) return;
      const zz = Math.max(0.01, z);
      el.setAttribute('x', String(-p.x / zz));
      el.setAttribute('y', String(-p.y / zz));
      el.setAttribute('width', String(viewportSize.width / zz));
      el.setAttribute('height', String(viewportSize.height / zz));
    },
    [viewportSize.width, viewportSize.height]
  );

  useEffect(() => {
    if (draggingRef.current) return;
    placeRect(zoom, pan);
  }, [zoom, pan, placeRect, open]);

  useEffect(() => {
    if (!liveUpdateRef) return;
    liveUpdateRef.current = placeRect;
    return () => {
      if (liveUpdateRef.current === placeRect) liveUpdateRef.current = null;
    };
  }, [liveUpdateRef, placeRect]);

  const wirePath = useMemo(() => {
    const parts: string[] = [];
    for (const w of wires) {
      if (w.waypoints.length < 2) continue;
      parts.push(
        w.waypoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p.x)} ${Math.round(p.y)}`).join('')
      );
    }
    return parts.join('');
  }, [wires]);

  const deviceRects = useMemo(
    () => devices.filter((d) => !selectedDeviceIds.has(d.id)),
    [devices, selectedDeviceIds]
  );
  const selectedRects = useMemo(
    () => devices.filter((d) => selectedDeviceIds.has(d.id)),
    [devices, selectedDeviceIds]
  );

  const moveTo = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const wx = ((e.clientX - r.left) / r.width) * vbW - PAD;
    const wy = ((e.clientY - r.top) / r.height) * vbH - PAD;
    const z = liveRef.current.zoom;
    const next = { x: viewportSize.width / 2 - wx * z, y: viewportSize.height / 2 - wy * z };
    placeRect(z, next);
    onSetPan(next);
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      data-testid="canvas-minimap"
      className="no-print absolute right-3 bottom-3 z-20 select-none"
      onMouseDown={stop}
      onDoubleClick={stop}
      onWheel={stop}
      onContextMenu={stop}
    >
      {open ? (
        <div
          className="relative rounded-md border border-[var(--flux-line-strong)] shadow-lg overflow-hidden"
          style={{
            width: 'calc(176px*var(--flux-ui-scale))',
            background: 'color-mix(in srgb, var(--flux-surface) 88%, transparent)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`${-PAD} ${-PAD} ${vbW} ${vbH}`}
            preserveAspectRatio="none"
            style={{ display: 'block', width: '100%', aspectRatio: `${1 / aspect}`, cursor: 'crosshair', touchAction: 'none' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button !== 0) return;
              draggingRef.current = true;
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
              moveTo(e);
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current) return;
              e.stopPropagation();
              moveTo(e);
            }}
            onPointerUp={(e) => {
              draggingRef.current = false;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
          >
            <rect
              x={0}
              y={0}
              width={sheetWidth}
              height={sheetHeight}
              fill="var(--flux-bg)"
              stroke="var(--flux-line-strong)"
              strokeWidth={vbW / 176}
              vectorEffect="non-scaling-stroke"
            />
            <path d={wirePath} fill="none" stroke="var(--flux-text-muted)" strokeOpacity={0.55} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <g fill="var(--flux-text-muted)" fillOpacity={0.55}>
              {deviceRects.map((d) => (
                <rect key={d.id} x={d.x} y={d.y} width={Math.max(6, d.width)} height={Math.max(6, d.height)} />
              ))}
            </g>
            <g fill="var(--flux-accent)">
              {selectedRects.map((d) => (
                <rect key={d.id} x={d.x} y={d.y} width={Math.max(10, d.width)} height={Math.max(10, d.height)} />
              ))}
            </g>
            <rect
              ref={rectRef}
              x={-pan.x / Math.max(0.01, zoom)}
              y={-pan.y / Math.max(0.01, zoom)}
              width={viewportSize.width / Math.max(0.01, zoom)}
              height={viewportSize.height / Math.max(0.01, zoom)}
              fill="var(--flux-accent-soft)"
              stroke="var(--flux-accent)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          </svg>
          <button
            type="button"
            title="Свернуть миникарту"
            aria-label="Свернуть миникарту"
            onClick={toggle}
            className="absolute top-0.5 right-0.5 w-4 h-4 inline-flex items-center justify-center rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          title="Показать миникарту"
          aria-label="Показать миникарту"
          onClick={toggle}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] shadow-md transition-colors"
        >
          <MapIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};
