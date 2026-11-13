import type {
  CustomSymbolShape,
  CustomSymbolSpec,
  E3Pin,
  PinDirection,
  SignalType,
} from './e3Types.ts';

export type SymbolEditorTool = 'select' | 'line' | 'rect' | 'circle' | 'text' | 'pin';

export function snapSymbolCoord(value: number, step = 10): number {
  const s = Math.max(1, step);
  return Math.round(value / s) * s;
}

export function inferPinDirection(
  dx: number,
  dy: number,
  width: number,
  height: number
): PinDirection {
  const distLeft = Math.abs(dx);
  const distRight = Math.abs(width - dx);
  const distTop = Math.abs(dy);
  const distBottom = Math.abs(height - dy);
  const min = Math.min(distLeft, distRight, distTop, distBottom);
  if (min === distTop) return 'top';
  if (min === distBottom) return 'bottom';
  if (min === distLeft) return 'left';
  return 'right';
}

export function nextPinName(existing: Array<Pick<E3Pin, 'name'>>): string {
  const used = new Set(existing.map((p) => p.name.trim()));
  let n = 1;
  while (used.has(String(n))) {
    n++;
  }
  return String(n);
}

export function normalizeCustomSymbolSpec(
  width: number,
  height: number,
  shapes: CustomSymbolShape[],
  pins: Omit<E3Pin, 'id'>[]
): {
  width: number;
  height: number;
  customSymbol: CustomSymbolSpec;
  pins: Omit<E3Pin, 'id'>[];
} {
  const cleanW = Math.max(40, Math.min(400, snapSymbolCoord(width || 120, 10)));
  const cleanH = Math.max(40, Math.min(400, snapSymbolCoord(height || 100, 10)));

  const cleanShapes: CustomSymbolShape[] = shapes.map((sh) => {
    if (sh.kind === 'line') {
      return {
        ...sh,
        x1: Math.max(0, Math.min(cleanW, sh.x1)),
        y1: Math.max(0, Math.min(cleanH, sh.y1)),
        x2: Math.max(0, Math.min(cleanW, sh.x2)),
        y2: Math.max(0, Math.min(cleanH, sh.y2)),
      };
    }
    if (sh.kind === 'rect') {
      return {
        ...sh,
        x: Math.max(0, Math.min(cleanW - 4, sh.x)),
        y: Math.max(0, Math.min(cleanH - 4, sh.y)),
        width: Math.max(4, Math.min(cleanW, sh.width)),
        height: Math.max(4, Math.min(cleanH, sh.height)),
      };
    }
    if (sh.kind === 'circle') {
      return {
        ...sh,
        cx: Math.max(4, Math.min(cleanW - 4, sh.cx)),
        cy: Math.max(4, Math.min(cleanH - 4, sh.cy)),
        r: Math.max(3, Math.min(Math.min(cleanW, cleanH) / 2, sh.r)),
      };
    }
    return {
      ...sh,
      x: Math.max(2, Math.min(cleanW - 4, sh.x)),
      y: Math.max(8, Math.min(cleanH - 2, sh.y)),
      text: sh.text.trim() || 'УГО',
    };
  });

  const cleanPins: Omit<E3Pin, 'id'>[] = pins.map((p, idx) => {
    const dx = Math.max(0, Math.min(cleanW, snapSymbolCoord(p.dx, 5)));
    const dy = Math.max(0, Math.min(cleanH, snapSymbolCoord(p.dy, 5)));
    return {
      name: p.name.trim() || String(idx + 1),
      dx,
      dy,
      direction: p.direction || inferPinDirection(dx, dy, cleanW, cleanH),
      signalType: p.signalType || ('signal' as SignalType),
    };
  });

  return {
    width: cleanW,
    height: cleanH,
    customSymbol: {
      shapes: cleanShapes,
      showBodyBorder: false,
    },
    pins: cleanPins,
  };
}

export type SymbolPresetId = 'blank_box' | 'sensor_circle' | 'breaker_1p' | 'coil_relay';

export function buildSymbolDesignerPreset(presetId: SymbolPresetId): {
  width: number;
  height: number;
  shapes: CustomSymbolShape[];
  pins: Omit<E3Pin, 'id'>[];
} {
  if (presetId === 'sensor_circle') {
    return {
      width: 100,
      height: 100,
      shapes: [
        { id: 'sh-1', kind: 'circle', cx: 50, cy: 50, r: 28, filled: true },
        { id: 'sh-2', kind: 'line', x1: 22, y1: 50, x2: 78, y2: 50 },
        { id: 'sh-3', kind: 'text', x: 50, y: 44, text: 'ΔP', fontSize: 11, bold: true },
        { id: 'sh-4', kind: 'line', x1: 50, y1: 0, x2: 50, y2: 22 },
        { id: 'sh-5', kind: 'line', x1: 50, y1: 78, x2: 50, y2: 100 },
      ],
      pins: [
        { name: '1+', dx: 50, dy: 0, direction: 'top', signalType: 'dc24' },
        { name: '2-', dx: 50, dy: 100, direction: 'bottom', signalType: 'signal' },
      ],
    };
  }
  if (presetId === 'breaker_1p') {
    return {
      width: 80,
      height: 100,
      shapes: [
        { id: 'sh-1', kind: 'rect', x: 10, y: 12, width: 60, height: 76, filled: true },
        { id: 'sh-2', kind: 'line', x1: 40, y1: 0, x2: 40, y2: 28 },
        { id: 'sh-3', kind: 'line', x1: 40, y1: 28, x2: 28, y2: 64 },
        { id: 'sh-4', kind: 'line', x1: 40, y1: 68, x2: 40, y2: 100 },
        { id: 'sh-5', kind: 'circle', cx: 40, cy: 28, r: 3, filled: false },
      ],
      pins: [
        { name: '1', dx: 40, dy: 0, direction: 'top', signalType: 'power' },
        { name: '2', dx: 40, dy: 100, direction: 'bottom', signalType: 'power' },
      ],
    };
  }
  if (presetId === 'coil_relay') {
    return {
      width: 100,
      height: 100,
      shapes: [
        { id: 'sh-1', kind: 'rect', x: 20, y: 25, width: 60, height: 50, filled: true },
        { id: 'sh-2', kind: 'line', x1: 0, y1: 50, x2: 20, y2: 50 },
        { id: 'sh-3', kind: 'line', x1: 80, y1: 50, x2: 100, y2: 50 },
        { id: 'sh-4', kind: 'text', x: 50, y: 54, text: 'KA', fontSize: 11, bold: true },
      ],
      pins: [
        { name: 'A1', dx: 0, dy: 50, direction: 'left', signalType: 'dc24' },
        { name: 'A2', dx: 100, dy: 50, direction: 'right', signalType: 'dc0' },
      ],
    };
  }
  return {
    width: 120,
    height: 100,
    shapes: [
      { id: 'sh-1', kind: 'rect', x: 10, y: 10, width: 100, height: 80, filled: true },
      { id: 'sh-2', kind: 'line', x1: 10, y1: 32, x2: 110, y2: 32 },
      { id: 'sh-3', kind: 'text', x: 60, y: 25, text: 'УГО', fontSize: 10, bold: true },
    ],
    pins: [
      { name: '1', dx: 30, dy: 0, direction: 'top', signalType: 'signal' },
      { name: '2', dx: 90, dy: 0, direction: 'top', signalType: 'dc24' },
      { name: '3', dx: 30, dy: 100, direction: 'bottom', signalType: 'signal' },
      { name: '4', dx: 90, dy: 100, direction: 'bottom', signalType: 'dc0' },
    ],
  };
}
