import type {
  CustomSymbolShape,
  CustomSymbolSpec,
  DeviceCategory,
  E3Attribute,
  E3Pin,
  PinDirection,
  SignalType,
} from './e3Types.ts';

export type SymbolEditorTool =
  | 'select'
  | 'line'
  | 'polyline'
  | 'rect'
  | 'circle'
  | 'arc'
  | 'text'
  | 'attr_tag'
  | 'pin';

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

function clampDraftNumber(value: number, fallback: number, min = -1200, max = 1200): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
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
  const cleanW = Math.max(40, Math.min(480, snapSymbolCoord(width || 120, 10)));
  const cleanH = Math.max(40, Math.min(480, snapSymbolCoord(height || 100, 10)));

  const cleanShapes: CustomSymbolShape[] = shapes.map((sh) => {
    if (sh.kind === 'line') {
      return {
        ...sh,
        x1: clampDraftNumber(sh.x1, 0),
        y1: clampDraftNumber(sh.y1, 0),
        x2: clampDraftNumber(sh.x2, cleanW),
        y2: clampDraftNumber(sh.y2, cleanH),
      };
    }
    if (sh.kind === 'polyline') {
      return {
        ...sh,
        points: (sh.points || []).map((pt) => ({
          x: clampDraftNumber(pt.x, 0),
          y: clampDraftNumber(pt.y, 0),
        })),
      };
    }
    if (sh.kind === 'rect') {
      return {
        ...sh,
        x: clampDraftNumber(sh.x, 0),
        y: clampDraftNumber(sh.y, 0),
        width: clampDraftNumber(sh.width, 20, 1, 1200),
        height: clampDraftNumber(sh.height, 20, 1, 1200),
      };
    }
    if (sh.kind === 'circle') {
      return {
        ...sh,
        cx: clampDraftNumber(sh.cx, cleanW / 2),
        cy: clampDraftNumber(sh.cy, cleanH / 2),
        r: clampDraftNumber(sh.r, 12, 1, 600),
      };
    }
    if (sh.kind === 'arc') {
      return {
        ...sh,
        cx: clampDraftNumber(sh.cx, cleanW / 2),
        cy: clampDraftNumber(sh.cy, cleanH / 2),
        r: clampDraftNumber(sh.r, 14, 1, 600),
      };
    }
    return {
      ...sh,
      x: clampDraftNumber(sh.x, cleanW / 2),
      y: clampDraftNumber(sh.y, cleanH / 2),
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

export type SymbolPresetId =
  | 'blank_box'
  | 'sensor_circle'
  | 'breaker_1p'
  | 'coil_relay'
  | 'contactor'
  | 'relay'
  | 'breaker'
  | 'terminal';

export interface QuickSymbolTemplateMeta {
  id: SymbolPresetId;
  label: string;
  shortDesc: string;
  category: DeviceCategory;
  defaultPrefix: string;
  e3BlockName: string;
}

export const QUICK_SYMBOL_TEMPLATES: ReadonlyArray<QuickSymbolTemplateMeta> = [
  {
    id: 'contactor',
    label: 'Контактор',
    shortDesc: '3 полюса + катушка A1/A2',
    category: 'contactor',
    defaultPrefix: 'KM',
    e3BlockName: 'GOST_KM_3P',
  },
  {
    id: 'relay',
    label: 'Реле',
    shortDesc: 'Катушка KA + контакт 11-12-14',
    category: 'relay',
    defaultPrefix: 'KA',
    e3BlockName: 'GOST_KA_1CO',
  },
  {
    id: 'breaker',
    label: 'Автомат',
    shortDesc: 'Выключатель QF с расцепителем',
    category: 'breaker',
    defaultPrefix: 'QF',
    e3BlockName: 'GOST_QF_1P',
  },
  {
    id: 'terminal',
    label: 'Клемма',
    shortDesc: 'Проходная клемма XT1',
    category: 'terminal',
    defaultPrefix: 'XT',
    e3BlockName: 'GOST_XT_1P',
  },
];

export function buildSymbolDesignerPreset(presetId: SymbolPresetId): {
  width: number;
  height: number;
  shapes: CustomSymbolShape[];
  pins: Omit<E3Pin, 'id'>[];
  category?: DeviceCategory;
  defaultPrefix?: string;
  e3BlockName?: string;
  name?: string;
} {
  if (presetId === 'contactor') {
    return {
      name: 'Контактор силовой 3P (KM)',
      category: 'contactor',
      defaultPrefix: 'KM',
      e3BlockName: 'GOST_KM_3P',
      width: 140,
      height: 110,
      shapes: [
        { id: 'sh-1', kind: 'rect', x: 8, y: 10, width: 124, height: 90, filled: true },
        // Катушка слева
        { id: 'sh-2', kind: 'rect', x: 16, y: 34, width: 24, height: 42, filled: false, strokeWidth: 1.6 },
        { id: 'sh-3', kind: 'line', x1: 0, y1: 42, x2: 16, y2: 42 },
        { id: 'sh-4', kind: 'line', x1: 0, y1: 68, x2: 16, y2: 68 },
        { id: 'sh-5', kind: 'text', x: 28, y: 59, text: 'KM', fontSize: 9, bold: true },
        // Механическая связь (пунктир)
        { id: 'sh-6', kind: 'line', x1: 40, y1: 55, x2: 112, y2: 55, strokeStyle: 'dashed', strokeColor: '#64748b', strokeWidth: 1.2 },
        // 3 силовых полюса
        { id: 'sh-7', kind: 'line', x1: 60, y1: 0, x2: 60, y2: 36, strokeWidth: 1.8 },
        { id: 'sh-8', kind: 'line', x1: 60, y1: 36, x2: 70, y2: 74, strokeWidth: 1.8 },
        { id: 'sh-9', kind: 'line', x1: 60, y1: 74, x2: 60, y2: 110, strokeWidth: 1.8 },
        { id: 'sh-10', kind: 'line', x1: 88, y1: 0, x2: 88, y2: 36, strokeWidth: 1.8 },
        { id: 'sh-11', kind: 'line', x1: 88, y1: 36, x2: 98, y2: 74, strokeWidth: 1.8 },
        { id: 'sh-12', kind: 'line', x1: 88, y1: 74, x2: 88, y2: 110, strokeWidth: 1.8 },
        { id: 'sh-13', kind: 'line', x1: 116, y1: 0, x2: 116, y2: 36, strokeWidth: 1.8 },
        { id: 'sh-14', kind: 'line', x1: 116, y1: 36, x2: 126, y2: 74, strokeWidth: 1.8 },
        { id: 'sh-15', kind: 'line', x1: 116, y1: 74, x2: 116, y2: 110, strokeWidth: 1.8 },
      ],
      pins: [
        { name: 'A1', dx: 0, dy: 40, direction: 'left', signalType: 'dc24' },
        { name: 'A2', dx: 0, dy: 70, direction: 'left', signalType: 'dc0' },
        { name: '1', dx: 60, dy: 0, direction: 'top', signalType: 'power' },
        { name: '2', dx: 60, dy: 110, direction: 'bottom', signalType: 'power' },
        { name: '3', dx: 88, dy: 0, direction: 'top', signalType: 'power' },
        { name: '4', dx: 88, dy: 110, direction: 'bottom', signalType: 'power' },
        { name: '5', dx: 116, dy: 0, direction: 'top', signalType: 'power' },
        { name: '6', dx: 116, dy: 110, direction: 'bottom', signalType: 'power' },
      ],
    };
  }
  if (presetId === 'relay') {
    return {
      name: 'Промежуточное реле (KA)',
      category: 'relay',
      defaultPrefix: 'KA',
      e3BlockName: 'GOST_KA_1CO',
      width: 120,
      height: 100,
      shapes: [
        { id: 'sh-1', kind: 'rect', x: 8, y: 8, width: 104, height: 84, filled: true },
        { id: 'sh-2', kind: 'rect', x: 18, y: 26, width: 24, height: 48, filled: false, strokeWidth: 1.6 },
        { id: 'sh-3', kind: 'line', x1: 0, y1: 35, x2: 18, y2: 35 },
        { id: 'sh-4', kind: 'line', x1: 0, y1: 65, x2: 18, y2: 65 },
        { id: 'sh-5', kind: 'text', x: 30, y: 54, text: 'KA', fontSize: 9, bold: true },
        { id: 'sh-6', kind: 'line', x1: 42, y1: 50, x2: 74, y2: 50, strokeStyle: 'dashed', strokeColor: '#64748b', strokeWidth: 1.2 },
        // Переключающий контакт 11-12-14
        { id: 'sh-7', kind: 'line', x1: 80, y1: 0, x2: 80, y2: 28, strokeWidth: 1.8 },
        { id: 'sh-8', kind: 'line', x1: 100, y1: 0, x2: 100, y2: 28, strokeWidth: 1.8 },
        { id: 'sh-9', kind: 'line', x1: 90, y1: 100, x2: 90, y2: 66, strokeWidth: 1.8 },
        { id: 'sh-10', kind: 'line', x1: 90, y1: 66, x2: 78, y2: 28, strokeWidth: 1.8 },
        { id: 'sh-11', kind: 'circle', cx: 90, cy: 66, r: 2.5, filled: true },
      ],
      pins: [
        { name: 'A1', dx: 0, dy: 35, direction: 'left', signalType: 'dc24' },
        { name: 'A2', dx: 0, dy: 65, direction: 'left', signalType: 'dc0' },
        { name: '12', dx: 80, dy: 0, direction: 'top', signalType: 'signal' },
        { name: '14', dx: 100, dy: 0, direction: 'top', signalType: 'signal' },
        { name: '11', dx: 90, dy: 100, direction: 'bottom', signalType: 'signal' },
      ],
    };
  }
  if (presetId === 'breaker' || presetId === 'breaker_1p') {
    return {
      name: 'Автоматический выключатель (QF)',
      category: 'breaker',
      defaultPrefix: 'QF',
      e3BlockName: 'GOST_QF_1P',
      width: 80,
      height: 100,
      shapes: [
        { id: 'sh-1', kind: 'rect', x: 10, y: 12, width: 60, height: 76, filled: true },
        { id: 'sh-2', kind: 'line', x1: 40, y1: 0, x2: 40, y2: 28 },
        { id: 'sh-3', kind: 'line', x1: 40, y1: 28, x2: 26, y2: 64 },
        { id: 'sh-4', kind: 'line', x1: 40, y1: 68, x2: 40, y2: 100 },
        { id: 'sh-5', kind: 'circle', cx: 40, cy: 28, r: 3, filled: false },
        { id: 'sh-6', kind: 'line', x1: 35, y1: 23, x2: 45, y2: 33 },
        { id: 'sh-7', kind: 'line', x1: 45, y1: 23, x2: 35, y2: 33 },
        { id: 'sh-8', kind: 'line', x1: 22, y1: 46, x2: 33, y2: 46, strokeStyle: 'dashed', strokeColor: '#64748b' },
      ],
      pins: [
        { name: '1', dx: 40, dy: 0, direction: 'top', signalType: 'power' },
        { name: '2', dx: 40, dy: 100, direction: 'bottom', signalType: 'power' },
      ],
    };
  }
  if (presetId === 'terminal') {
    return {
      name: 'Клемма проходная (XT)',
      category: 'terminal',
      defaultPrefix: 'XT',
      e3BlockName: 'GOST_XT_1P',
      width: 60,
      height: 80,
      shapes: [
        { id: 'sh-1', kind: 'rect', x: 8, y: 16, width: 44, height: 48, filled: true },
        { id: 'sh-2', kind: 'line', x1: 30, y1: 0, x2: 30, y2: 80, strokeWidth: 1.6 },
        { id: 'sh-3', kind: 'circle', cx: 30, cy: 40, r: 6, filled: true, strokeWidth: 2 },
        { id: 'sh-4', kind: 'text', x: 18, y: 44, text: '1', fontSize: 9, bold: true },
      ],
      pins: [
        { name: '1', dx: 30, dy: 0, direction: 'top', signalType: 'signal' },
        { name: '2', dx: 30, dy: 80, direction: 'bottom', signalType: 'signal' },
      ],
    };
  }
  if (presetId === 'sensor_circle') {
    return {
      name: 'Датчик КИП (BP/BT)',
      category: 'kip_circle',
      defaultPrefix: 'BT',
      e3BlockName: 'GOST_KIP_CIRCLE',
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
  if (presetId === 'coil_relay') {
    return {
      name: 'Катушка реле (KA)',
      category: 'relay',
      defaultPrefix: 'KA',
      e3BlockName: 'GOST_KA_COIL',
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
    name: 'Корпус ГОСТ',
    category: 'relay',
    defaultPrefix: 'K',
    e3BlockName: 'E3_CUSTOM_BOX',
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

export interface UgoBlockFilePayload {
  schema: 'e3promax-ugo-block/v1';
  exportedAt: string;
  name: string;
  componentName: string;
  article: string;
  manufacturer: string;
  e3BlockName: string;
  defaultPrefix: string;
  defaultCable?: string;
  category: DeviceCategory;
  width: number;
  height: number;
  shapes: CustomSymbolShape[];
  pins: Omit<E3Pin, 'id'>[];
  attributes: E3Attribute[];
}

export function serializeUgoBlockPayload(input: {
  name: string;
  componentName?: string;
  article?: string;
  manufacturer?: string;
  e3BlockName: string;
  defaultPrefix?: string;
  defaultCable?: string;
  category: DeviceCategory;
  width: number;
  height: number;
  shapes: CustomSymbolShape[];
  pins: Omit<E3Pin, 'id'>[];
  attributes?: E3Attribute[];
}): UgoBlockFilePayload {
  const norm = normalizeCustomSymbolSpec(
    input.width,
    input.height,
    input.shapes,
    input.pins
  );
  return {
    schema: 'e3promax-ugo-block/v1',
    exportedAt: new Date().toISOString(),
    name: input.name.trim() || input.e3BlockName.trim() || 'Блок УГО',
    componentName: input.componentName?.trim() || input.name.trim() || 'Изделие УГО',
    article: input.article?.trim() || input.e3BlockName.trim() || 'E3-BLK',
    manufacturer: input.manufacturer?.trim() || 'Собств. база',
    e3BlockName: input.e3BlockName.trim() || 'E3_CUSTOM_BLK',
    defaultPrefix: input.defaultPrefix?.trim() || 'K',
    defaultCable: input.defaultCable?.trim() || undefined,
    category: input.category || 'relay',
    width: norm.width,
    height: norm.height,
    shapes: structuredClone(norm.customSymbol.shapes),
    pins: structuredClone(norm.pins),
    attributes: structuredClone(input.attributes || []),
  };
}

export function parseUgoBlockPayload(jsonText: string): UgoBlockFilePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Файл блока УГО повреждён (некорректный JSON).');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Некорректная структура файла блока УГО.');
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.shapes)) {
    throw new Error('В файле блока отсутствует геометрия (shapes).');
  }
  const width = typeof obj.width === 'number' && obj.width >= 40 ? obj.width : 120;
  const height = typeof obj.height === 'number' && obj.height >= 40 ? obj.height : 100;
  const rawPins = Array.isArray(obj.pins) ? (obj.pins as Omit<E3Pin, 'id'>[]) : [];
  const rawShapes = obj.shapes as CustomSymbolShape[];
  const norm = normalizeCustomSymbolSpec(width, height, rawShapes, rawPins);

  return {
    schema: 'e3promax-ugo-block/v1',
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : 'Импортированный блок УГО',
    componentName:
      typeof obj.componentName === 'string' && obj.componentName.trim()
        ? obj.componentName.trim()
        : typeof obj.name === 'string'
          ? obj.name
          : 'Импортированное изделие',
    article: typeof obj.article === 'string' && obj.article.trim() ? obj.article.trim() : 'E3-IMP-01',
    manufacturer:
      typeof obj.manufacturer === 'string' && obj.manufacturer.trim()
        ? obj.manufacturer.trim()
        : 'Собств. база',
    e3BlockName:
      typeof obj.e3BlockName === 'string' && obj.e3BlockName.trim()
        ? obj.e3BlockName.trim()
        : 'E3_IMPORTED_BLK',
    defaultPrefix:
      typeof obj.defaultPrefix === 'string' && obj.defaultPrefix.trim()
        ? obj.defaultPrefix.trim()
        : 'K',
    defaultCable: typeof obj.defaultCable === 'string' ? obj.defaultCable : undefined,
    category: (typeof obj.category === 'string' ? obj.category : 'relay') as DeviceCategory,
    width: norm.width,
    height: norm.height,
    shapes: norm.customSymbol.shapes,
    pins: norm.pins,
    attributes: Array.isArray(obj.attributes) ? (obj.attributes as E3Attribute[]) : [],
  };
}
