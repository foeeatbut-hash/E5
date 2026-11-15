import React, { useMemo } from 'react';
import { getAbsolutePinPos } from '../core/e3Engine';
import type { E3Project, SignalType } from '../core/e3Types';

interface ProjectMiniPreviewProps {
  project: E3Project;
  activeSheetId?: string;
  compact?: boolean;
  className?: string;
}

const SIGNAL_STROKE: Record<SignalType, string> = {
  power: '#ef4444',
  neutral: '#3b82f6',
  pe: '#22c55e',
  dc24: '#f59e0b',
  dc0: '#94a3b8',
  signal: '#10b981',
  bus: '#0ea5e9',
};

export const ProjectMiniPreview: React.FC<ProjectMiniPreviewProps> = ({
  project,
  activeSheetId,
  compact = false,
  className = '',
}) => {
  const sheet = useMemo(() => {
    if (activeSheetId) {
      const found = project.sheets.find((s) => s.id === activeSheetId);
      if (found) return found;
    }
    return project.sheets[0];
  }, [project.sheets, activeSheetId]);

  const sheetW = sheet?.width || 1400;
  const sheetH = sheet?.height || 920;

  const { devices, wirePaths } = useMemo(() => {
    if (!sheet) return { devices: [], wirePaths: [] as Array<{ id: string; d: string; color: string }> };
    const sheetDevices = project.devices.filter((d) => d.sheetId === sheet.id);
    const devMap = new Map(sheetDevices.map((d) => [d.id, d]));

    const paths: Array<{ id: string; d: string; color: string }> = [];
    for (const w of project.wires) {
      if (w.sheetId !== sheet.id) continue;
      const fromDev = devMap.get(w.fromDeviceId);
      const toDev = devMap.get(w.toDeviceId);
      const fromPin = fromDev?.pins.find((p) => p.id === w.fromPinId);
      const toPin = toDev?.pins.find((p) => p.id === w.toPinId);
      if (!fromDev || !toDev || !fromPin || !toPin) continue;

      const p1 = getAbsolutePinPos(fromDev, fromPin);
      const p2 = getAbsolutePinPos(toDev, toPin);
      const pts = [p1, ...(w.waypoints || []), p2];
      const d = pts.map((pt, idx) => `${idx === 0 ? 'M' : 'L'}${pt.x} ${pt.y}`).join(' ');
      paths.push({
        id: w.id,
        d,
        color: SIGNAL_STROKE[w.signalType] || 'var(--flux-accent)',
      });
    }
    return { devices: sheetDevices, wirePaths: paths };
  }, [project.devices, project.wires, sheet]);

  const showGost = project.visualSettings?.showGostFrame !== false;

  return (
    <div
      className={`relative overflow-hidden rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-canvas-bg)] ${className}`}
    >
      <svg
        viewBox={`0 0 ${sheetW} ${sheetH}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        className="w-full h-full block"
      >
        {/* Sheet paper */}
        <rect
          x={16}
          y={14}
          width={sheetW - 32}
          height={sheetH - 28}
          rx={6}
          fill="var(--flux-surface)"
          stroke="var(--flux-line-strong)"
          strokeWidth={3}
        />

        {/* GOST Frame & Stamp Silhouette */}
        {showGost && (
          <g opacity={0.55}>
            <rect
              x={56}
              y={32}
              width={sheetW - 86}
              height={sheetH - 64}
              fill="none"
              stroke="var(--flux-text-muted)"
              strokeWidth={3}
            />
            <rect
              x={sheetW - 30 - 380}
              y={sheetH - 32 - 115}
              width={380}
              height={115}
              fill="var(--flux-surface-alt)"
              stroke="var(--flux-text-muted)"
              strokeWidth={2.5}
            />
            <line
              x1={sheetW - 30 - 380}
              y1={sheetH - 32 - 58}
              x2={sheetW - 30}
              y2={sheetH - 32 - 58}
              stroke="var(--flux-text-muted)"
              strokeWidth={2}
            />
          </g>
        )}

        {/* Empty sheet drafting crosshairs when no devices placed yet */}
        {devices.length === 0 && wirePaths.length === 0 && (
          <g opacity={0.32} stroke="var(--flux-accent)" strokeWidth={2.5} strokeDasharray="10 10">
            <line x1={sheetW * 0.25} y1={sheetH * 0.48} x2={sheetW * 0.75} y2={sheetH * 0.48} />
            <line x1={sheetW * 0.5} y1={sheetH * 0.22} x2={sheetW * 0.5} y2={sheetH * 0.74} />
            <rect x={sheetW * 0.35} y={sheetH * 0.34} width={sheetW * 0.3} height={sheetH * 0.28} fill="none" />
          </g>
        )}

        {/* Real schematic wires */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          {wirePaths.map((wp) => (
            <path
              key={wp.id}
              d={wp.d}
              stroke={wp.color}
              strokeWidth={compact ? 5.5 : 4.2}
              opacity={0.85}
            />
          ))}
        </g>

        {/* Real schematic devices */}
        <g>
          {devices.map((dev) => {
            const isTerminal = dev.category === 'terminal';
            const isOffpage = dev.category === 'offpage_ref';
            return (
              <g key={dev.id}>
                <rect
                  x={dev.x}
                  y={dev.y}
                  width={dev.width}
                  height={dev.height}
                  rx={isOffpage ? 6 : 3}
                  fill={isTerminal ? 'var(--flux-accent-soft)' : 'var(--flux-surface-alt)'}
                  stroke={isOffpage ? 'var(--flux-accent)' : 'var(--flux-text)'}
                  strokeWidth={compact ? 4.5 : 3.2}
                  opacity={0.92}
                />
                {!compact && dev.width >= 70 && (
                  <text
                    x={dev.x + dev.width / 2}
                    y={dev.y + dev.height / 2 + 7}
                    textAnchor="middle"
                    fill="var(--flux-text)"
                    fontSize={22}
                    fontFamily="IBM Plex Mono, monospace"
                    fontWeight={600}
                    opacity={0.82}
                  >
                    {dev.designation}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
