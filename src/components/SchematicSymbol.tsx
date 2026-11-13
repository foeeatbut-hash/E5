import React from 'react';
import type { E3Device, E3VisualSettings } from '../core/e3Types';

interface SchematicSymbolProps {
  device: E3Device;
  selected: boolean;
  visual: E3VisualSettings;
  wireStartPinKey: string | null;
  connectedPinKeys: Set<string>;
  onSelectDevice: (e: React.MouseEvent, device: E3Device) => void;
  onPinClick: (e: React.MouseEvent, device: E3Device, pinId: string) => void;
}

export const SchematicSymbol: React.FC<SchematicSymbolProps> = ({
  device,
  selected,
  visual,
  wireStartPinKey,
  connectedPinKeys,
  onSelectDevice,
  onPinClick,
}) => {
  const cx = device.width / 2;
  const cy = device.height / 2;
  const stroke = selected ? 'var(--flux-accent)' : 'var(--flux-text)';
  const muted = 'var(--flux-text-muted)';
  const sw = visual.symbolStrokeWidth;
  const isRemoved = device.bindingState === 'REMOVED_IN_FLUX';

  const renderBody = () => {
    const w = device.width;
    const h = device.height;
    switch (device.category) {
      case 'breaker': {
        const xs = device.pins.filter((p) => p.direction === 'top').map((p) => p.dx);
        return (
          <g>
            <rect
              x={4}
              y={10}
              width={w - 8}
              height={h - 20}
              rx={3}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={isRemoved ? '4 3' : undefined}
            />
            {xs.map((px, i) => (
              <g key={i}>
                <line x1={px} y1={0} x2={px} y2={28} stroke={stroke} strokeWidth={sw} />
                <line x1={px} y1={28} x2={px - 10} y2={h - 32} stroke={stroke} strokeWidth={sw} />
                <line x1={px} y1={h - 28} x2={px} y2={h} stroke={stroke} strokeWidth={sw} />
                <circle cx={px} cy={28} r={2.2} fill={stroke} />
                <path
                  d={`M ${px - 4} ${h / 2 - 4} L ${px + 4} ${h / 2 - 4} L ${px - 4} ${h / 2 + 4}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.2}
                />
              </g>
            ))}
            {xs.length > 1 && (
              <line
                x1={xs[0] - 5}
                y1={h / 2}
                x2={xs[xs.length - 1] - 5}
                y2={h / 2}
                stroke={muted}
                strokeWidth={1}
                strokeDasharray="3 2"
              />
            )}
          </g>
        );
      }
      case 'contactor': {
        return (
          <g>
            <rect
              x={8}
              y={10}
              width={w - 16}
              height={h - 20}
              rx={3}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
            />
            {/* Coil box on left */}
            <rect x={14} y={32} width={22} height={56} fill="none" stroke={stroke} strokeWidth={1.3} />
            <line x1={0} y1={40} x2={14} y2={40} stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={80} x2={14} y2={80} stroke={stroke} strokeWidth={sw} />
            {/* 3 main contacts */}
            {[30, 60, 90].map((px, idx) => (
              <g key={idx}>
                <line x1={px} y1={0} x2={px} y2={35} stroke={stroke} strokeWidth={sw} />
                <line x1={px} y1={35} x2={px + 9} y2={82} stroke={stroke} strokeWidth={sw} />
                <line x1={px} y1={85} x2={px} y2={h} stroke={stroke} strokeWidth={sw} />
              </g>
            ))}
            <line x1={36} y1={60} x2={93} y2={60} stroke={muted} strokeWidth={1} strokeDasharray="3 2" />
          </g>
        );
      }
      case 'motor': {
        const r = Math.min(w, h) * 0.34;
        return (
          <g>
            <circle cx={cx} cy={cy + 8} r={r} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <circle cx={cx} cy={cy + 8} r={r - 5} fill="none" stroke={muted} strokeWidth={1} />
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              fill={stroke}
              fontSize={16 * visual.fontScale}
              fontWeight={600}
              fontFamily="var(--font-mono)"
            >
              M 3~
            </text>
            {[25, 55, 85].map((px, i) => (
              <line key={i} x1={px} y1={0} x2={px} y2={cy + 8 - r + 4} stroke={stroke} strokeWidth={sw} />
            ))}
            <line x1={cx + r} y1={55} x2={w} y2={55} stroke={visual.netColors.pe} strokeWidth={sw} />
          </g>
        );
      }
      case 'lamp': {
        const r = 22;
        return (
          <g>
            <circle cx={cx} cy={cy} r={r} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <line x1={cx - 14} y1={cy - 14} x2={cx + 14} y2={cy + 14} stroke={stroke} strokeWidth={sw} />
            <line x1={cx + 14} y1={cy - 14} x2={cx - 14} y2={cy + 14} stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={cy} x2={cx - r} y2={cy} stroke={stroke} strokeWidth={sw} />
            <line x1={cx + r} y1={cy} x2={w} y2={cy} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      }
      case 'terminal': {
        return (
          <g>
            <rect x={4} y={12} width={w - 8} height={h - 24} rx={2} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            {[20, 45, 75, 100].map((px, i) => (
              <g key={i}>
                <line x1={px} y1={0} x2={px} y2={h} stroke={stroke} strokeWidth={1.3} />
                <circle cx={px} cy={h / 2} r={4} fill="var(--flux-surface)" stroke={stroke} strokeWidth={1.5} />
              </g>
            ))}
          </g>
        );
      }
      case 'relay': {
        return (
          <g>
            <rect x={8} y={6} width={w - 16} height={h - 12} rx={3} fill="var(--flux-surface)" stroke={stroke} strokeWidth={sw} />
            <rect x={16} y={24} width={22} height={42} fill="none" stroke={stroke} strokeWidth={1.3} />
            <line x1={0} y1={30} x2={16} y2={30} stroke={stroke} strokeWidth={sw} />
            <line x1={0} y1={60} x2={16} y2={60} stroke={stroke} strokeWidth={sw} />
            <line x1={38} y1={45} x2={66} y2={45} stroke={muted} strokeWidth={1} strokeDasharray="3 2" />
            <line x1={w} y1={30} x2={72} y2={30} stroke={stroke} strokeWidth={sw} />
            <line x1={72} y1={30} x2={60} y2={54} stroke={stroke} strokeWidth={sw} />
            <line x1={72} y1={60} x2={w} y2={60} stroke={stroke} strokeWidth={sw} />
          </g>
        );
      }
      default: {
        // PLC, VFD Drive, PSU, Sensor: structured IEC functional block
        return (
          <g>
            <rect
              x={4}
              y={4}
              width={w - 8}
              height={h - 8}
              rx={4}
              fill="var(--flux-surface)"
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={isRemoved ? '4 3' : undefined}
            />
            <rect x={4} y={4} width={w - 8} height={22} rx={3} fill="var(--flux-bg)" />
            <line x1={4} y1={26} x2={w - 4} y2={26} stroke="var(--flux-line-strong)" strokeWidth={1} />
            <text
              x={12}
              y={19}
              fill={muted}
              fontSize={10 * visual.fontScale}
              fontWeight={600}
              fontFamily="var(--font-mono)"
            >
              {device.category.toUpperCase()}
            </text>
            <text
              x={cx}
              y={cy + 8}
              textAnchor="middle"
              fill={muted}
              fontSize={(device.article.length > 12 ? 8.8 : 10.2) * visual.fontScale}
              fontFamily="var(--font-mono)"
            >
              {device.article}
            </text>
          </g>
        );
      }
    }
  };

  return (
    <g
      transform={`translate(${device.x}, ${device.y})`}
      className="cursor-pointer select-none"
      onMouseDown={(e) => onSelectDevice(e, device)}
      style={{ opacity: isRemoved ? 0.55 : 1 }}
    >
      {/* Selection halo */}
      {selected && (
        <rect
          x={-6}
          y={-6}
          width={device.width + 12}
          height={device.height + 12}
          rx={6}
          fill="none"
          stroke="var(--flux-accent)"
          strokeWidth={1.5}
          strokeDasharray="5 3"
        />
      )}

      {/* Rotatable geometry */}
      <g transform={`rotate(${device.rotation} ${cx} ${cy})`}>
        {renderBody()}

        {/* Pins */}
        {device.pins.map((pin) => {
          const pinKey = `${device.id}:${pin.id}`;
          const isStart = wireStartPinKey === pinKey;
          const isConnected = connectedPinKeys.has(pinKey);
          const sigColor = visual.netColors[pin.signalType] || stroke;

          let labelDx = 0;
          let labelDy = -8;
          let anchor: 'start' | 'middle' | 'end' = 'middle';
          if (pin.direction === 'left') {
            labelDx = 8;
            labelDy = -4;
            anchor = 'start';
          } else if (pin.direction === 'right') {
            labelDx = -8;
            labelDy = -4;
            anchor = 'end';
          } else if (pin.direction === 'bottom') {
            labelDx = 6;
            labelDy = -5;
            anchor = 'start';
          } else {
            labelDx = 6;
            labelDy = 13;
            anchor = 'start';
          }

          return (
            <g
              key={pin.id}
              onClick={(e) => {
                e.stopPropagation();
                onPinClick(e, device, pin.id);
              }}
              className="cursor-crosshair"
            >
              {/* Invisible generous hit target for crisp clicking */}
              <circle cx={pin.dx} cy={pin.dy} r={9} fill="transparent" />
              <circle
                cx={pin.dx}
                cy={pin.dy}
                r={isStart ? 5 : isConnected ? 3.5 : 3}
                fill={isStart ? 'var(--flux-accent)' : isConnected ? sigColor : 'var(--flux-surface)'}
                stroke={isStart ? 'var(--flux-accent)' : sigColor}
                strokeWidth={1.5}
              />
              {visual.showPinNumbers && (
                <text
                  x={pin.dx + labelDx}
                  y={pin.dy + labelDy}
                  textAnchor={anchor}
                  fill={muted}
                  stroke="var(--flux-surface)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  fontSize={9.5 * visual.fontScale}
                  fontFamily="var(--font-mono)"
                  pointerEvents="none"
                >
                  {pin.name}
                </text>
              )}
            </g>
          );
        })}
      </g>

      {/* Designation & Cross-reference Labels (separated cleanly, never overlapping) */}
      <text
        x={0}
        y={-8}
        fill={selected ? 'var(--flux-accent)' : 'var(--flux-text)'}
        stroke="var(--flux-surface)"
        strokeWidth={3.5}
        paintOrder="stroke"
        fontSize={12.5 * visual.fontScale}
        fontWeight={600}
        fontFamily="var(--font-mono)"
      >
        {device.designation}
      </text>
      {visual.showCrossRefs && (
        <text
          x={cx}
          y={device.height + 14}
          textAnchor="middle"
          fill={muted}
          stroke="var(--flux-surface)"
          strokeWidth={3}
          paintOrder="stroke"
          fontSize={9 * visual.fontScale}
          fontFamily="var(--font-mono)"
        >
          {device.e3BlockName}
        </text>
      )}
    </g>
  );
};
