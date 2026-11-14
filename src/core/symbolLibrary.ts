import type {
  CatalogItem,
  CustomSymbolShape,
  CustomSymbolStrokeStyle,
  DeviceCategory,
  E3Attribute,
  E3Device,
  E3Pin,
  E3SymbolDef,
} from './e3Types.ts';

export const CUSTOM_SYMBOLS_STORAGE_KEY = 'e3promax_custom_symbols_v1';

export const SYMBOL_COLOR_PALETTE: Array<{ hex: string; label: string }> = [
  { hex: '#111827', label: 'Основной (чёрный / по теме)' },
  { hex: '#15803d', label: 'КИП / Вентиляция' },
  { hex: '#dc2626', label: 'Силовой / Нагрев / Авария' },
  { hex: '#0284c7', label: 'Холод / Цифровая шина' },
  { hex: '#d97706', label: '24V DC / Уставка' },
  { hex: '#4f46e5', label: 'Логика / ПЛК' },
  { hex: '#0f766e', label: 'Заземление / Контур' },
  { hex: '#64748b', label: 'Вспомогательный' },
];

export const STROKE_STYLE_OPTIONS: Array<{
  id: CustomSymbolStrokeStyle;
  label: string;
  dasharray?: string;
}> = [
  { id: 'solid', label: 'Сплошная' },
  { id: 'dashed', label: 'Штриховая', dasharray: '6 3' },
  { id: 'dashdot', label: 'Штрихпунктирная', dasharray: '8 3 2 3' },
  { id: 'dotted', label: 'Пунктир', dasharray: '2 3' },
];

export interface AttributeTemplatePreset {
  id: string;
  label: string;
  description: string;
  attributes: E3Attribute[];
}

export const ATTRIBUTE_TEMPLATE_PRESETS: AttributeTemplatePreset[] = [
  {
    id: 'gost_base',
    label: 'Базовый E3 / ГОСТ',
    description: 'Минимальный набор эксплуатационных атрибутов для ПЭ3 и E3.series',
    attributes: [
      { name: 'Напряжение', value: '24 В DC', owner: '', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP20', owner: '', conflict: 'script' },
      { name: 'Монтаж', value: 'DIN-рейка 35 мм', owner: '', conflict: 'script' },
      { name: 'Примечание', value: '', owner: '', conflict: 'flux' },
    ],
  },
  {
    id: 'power_switchgear',
    label: 'Силовая коммутация',
    description: 'Аппараты защиты и коммутации (QF, KM, QS)',
    attributes: [
      { name: 'Номинальный ток', value: '25 А', owner: '', conflict: 'flux' },
      { name: 'Напряжение силовой цепи', value: '3~380 В 50 Гц', owner: '', conflict: 'flux' },
      { name: 'Отключающая способность', value: '6 кА', owner: '', conflict: 'script' },
      { name: 'Катушка управления', value: '24 В DC', owner: '#1', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP20', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'drive_vfd',
    label: 'Привод / ПЧ',
    description: 'Частотные преобразователи, УПП и электроприводы',
    attributes: [
      { name: 'Мощность', value: '5.5 кВт', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '3~380 В 50 Гц', owner: '', conflict: 'flux' },
      { name: 'Протокол', value: 'Modbus RTU (RS-485)', owner: '', conflict: 'flux' },
      { name: 'Категория пуска', value: 'ПЧ с фильтром ЭМС', owner: '', conflict: 'script' },
      { name: 'Степень защиты', value: 'IP20', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'kip_sensor',
    label: 'Датчик КИПиА (4-20 мА)',
    description: 'Первичные преобразователи температуры, давления, влажности',
    attributes: [
      { name: 'Диапазон измерения', value: '0...100 °C', owner: '', conflict: 'flux' },
      { name: 'Выходной сигнал', value: '4...20 мА', owner: '', conflict: 'flux' },
      { name: 'Питание', value: '24 В DC', owner: '', conflict: 'flux' },
      { name: 'Тип сигнала', value: 'AI', owner: '', conflict: 'script' },
      { name: 'Марка кабеля', value: 'МКЭШ 3х0.75', owner: '', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP65', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac_fsa',
    label: 'Оборудование ОВиК / ФСА',
    description: 'Полевые узлы приточно-вытяжных установок и автоматизации',
    attributes: [
      { name: 'Тег КИП', value: 'M1', owner: '', conflict: 'flux' },
      { name: 'Питание', value: '230 В AC', owner: '', conflict: 'flux' },
      { name: 'Управление', value: 'DO / AI', owner: '', conflict: 'flux' },
      { name: 'Марка кабеля', value: 'ВВГнг(А)-LS 3х1.5', owner: '', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP54', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'exd_zone',
    label: 'Взрывозащита Exd',
    description: 'Оборудование для взрывоопасных зон с искробезопасными цепями',
    attributes: [
      { name: 'Маркировка взрывозащиты', value: '1Ex db IIC T6 Gb', owner: '', conflict: 'flux' },
      { name: 'Зона', value: 'Exd (Зона 1)', owner: '', conflict: 'flux' },
      { name: 'Барьер искрозащиты', value: 'Требуется (24 В DC)', owner: '', conflict: 'script' },
      { name: 'Степень защиты', value: 'IP66', owner: '', conflict: 'script' },
    ],
  },
];

export function resolveShapeStrokeDasharray(
  shape: Pick<CustomSymbolShape, 'kind'> & { strokeStyle?: CustomSymbolStrokeStyle; dashed?: boolean }
): string | undefined {
  if (shape.kind === 'text') return undefined;
  const style = shape.strokeStyle || (shape.dashed ? 'dashed' : 'solid');
  if (style === 'dashed') return '6 3';
  if (style === 'dashdot') return '8 3 2 3';
  if (style === 'dotted') return '2 3';
  return undefined;
}

export function normalizeArcSweepDeg(startAngleDeg: number, endAngleDeg: number): number {
  let sweep = endAngleDeg - startAngleDeg;
  while (sweep <= 0) sweep += 360;
  if (sweep >= 360) sweep = 359.5;
  return sweep;
}

export function sampleArcPoints(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
  segments = 24
): Array<{ x: number; y: number }> {
  const safeR = Math.max(1, r);
  const sweep = normalizeArcSweepDeg(startAngleDeg, endAngleDeg);
  const steps = Math.max(4, Math.round((segments * sweep) / 360));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const deg = startAngleDeg + (sweep * i) / steps;
    const rad = (deg * Math.PI) / 180;
    pts.push({
      x: cx + safeR * Math.cos(rad),
      y: cy + safeR * Math.sin(rad),
    });
  }
  return pts;
}

export function describeSvgArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number
): string {
  const safeR = Math.max(1, r);
  const sweep = normalizeArcSweepDeg(startAngleDeg, endAngleDeg);
  const startRad = (startAngleDeg * Math.PI) / 180;
  const endRad = ((startAngleDeg + sweep) * Math.PI) / 180;
  const x1 = cx + safeR * Math.cos(startRad);
  const y1 = cy + safeR * Math.sin(startRad);
  const x2 = cx + safeR * Math.cos(endRad);
  const y2 = cy + safeR * Math.sin(endRad);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${safeR.toFixed(2)} ${safeR.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export interface SymbolTextResolutionContext {
  designation?: string;
  article?: string;
  componentName?: string;
  manufacturer?: string;
  e3BlockName?: string;
  attributes?: E3Attribute[];
}

export function resolveDynamicSymbolText(
  shape: { text: string; attrKey?: string },
  ctx?: SymbolTextResolutionContext | E3Device | null
): string {
  if (!ctx) return shape.text;
  const lookupAttr = (attrName: string) =>
    ctx.attributes?.find((a) => a.name.toLowerCase() === attrName.toLowerCase())?.value?.trim() || '';

  if (shape.attrKey) {
    const k = shape.attrKey.trim();
    if (k === 'designation' && ctx.designation) return ctx.designation;
    if (k === 'article' && ctx.article) return ctx.article;
    if (k === 'componentName' && ctx.componentName) return ctx.componentName;
    if (k === 'manufacturer' && ctx.manufacturer) return ctx.manufacturer;
    if (k === 'e3BlockName' && ctx.e3BlockName) return ctx.e3BlockName;
    if (k.startsWith('attr:')) {
      const val = lookupAttr(k.slice(5));
      if (val) return val;
    }
  }

  let out = shape.text || '';
  if (!out.includes('{')) return out;
  out = out
    .replace(/\{designation\}/gi, ctx.designation || '{designation}')
    .replace(/\{article\}/gi, ctx.article || '{article}')
    .replace(/\{componentName\}/gi, ctx.componentName || '{componentName}')
    .replace(/\{manufacturer\}/gi, ctx.manufacturer || '{manufacturer}')
    .replace(/\{e3BlockName\}/gi, ctx.e3BlockName || '{e3BlockName}')
    .replace(/\{attr:([^}]+)\}/gi, (_m, name) => lookupAttr(String(name)) || `{attr:${name}}`);
  return out;
}

export function describeShapeType(sh: CustomSymbolShape): string {
  switch (sh.kind) {
    case 'line':
      return 'Линия';
    case 'polyline':
      return sh.closed ? 'Полигон' : 'Полилиния';
    case 'rect':
      return 'Прямоугольник';
    case 'circle':
      return 'Окружность';
    case 'arc':
      return 'Дуга';
    case 'text':
      return sh.attrKey ? 'Метка атрибута' : 'Текст';
  }
}

export function applyAttributeTemplate(
  existing: E3Attribute[],
  presetId: string,
  overwriteValues = false
): E3Attribute[] {
  const preset = ATTRIBUTE_TEMPLATE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return existing.map((a) => ({ ...a }));
  const result = existing.map((a) => ({ ...a }));
  const byName = new Map(result.map((a) => [a.name.trim().toLowerCase(), a]));
  for (const tmpl of preset.attributes) {
    const key = tmpl.name.trim().toLowerCase();
    const cur = byName.get(key);
    if (cur) {
      if (overwriteValues || !cur.value.trim()) {
        cur.value = tmpl.value;
      }
    } else {
      const nextAttr = { ...tmpl };
      result.push(nextAttr);
      byName.set(key, nextAttr);
    }
  }
  return result;
}

export function extractBuiltInSymbolShapes(
  category: DeviceCategory,
  width: number,
  height: number,
  e3BlockName = '',
  pins: Array<Pick<E3Pin, 'dx' | 'dy' | 'direction' | 'name'>> = []
): CustomSymbolShape[] {
  const w = Math.max(40, width || 100);
  const h = Math.max(40, height || 100);
  const cx = w / 2;
  const cy = h / 2;
  const kipGreen = '#15803d';
  const shapes: CustomSymbolShape[] = [];
  let seq = 1;
  const nid = () => `s-${seq++}`;

  switch (category) {
    case 'airflow_arrow': {
      const isOut = e3BlockName.includes('OUT');
      shapes.push({ id: nid(), kind: 'line', x1: 0, y1: cy, x2: w, y2: cy, strokeColor: kipGreen, strokeWidth: 2 });
      shapes.push({
        id: nid(),
        kind: 'polyline',
        points: isOut
          ? [
              { x: w - 18, y: cy - 8 },
              { x: w, y: cy },
              { x: w - 18, y: cy + 8 },
            ]
          : [
              { x: 10, y: cy - 8 },
              { x: 28, y: cy },
              { x: 10, y: cy + 8 },
            ],
        closed: true,
        filled: true,
        fillColor: kipGreen,
        strokeColor: kipGreen,
        strokeWidth: 1.5,
      });
      return shapes;
    }
    case 'damper': {
      const ductY = Math.round(h * 0.58);
      shapes.push(
        { id: nid(), kind: 'circle', cx, cy: 28, r: 16, filled: true, strokeColor: kipGreen, strokeWidth: 1.8 },
        { id: nid(), kind: 'text', x: cx, y: 33, text: 'M', fontSize: 13, bold: true, strokeColor: kipGreen },
        { id: nid(), kind: 'line', x1: cx, y1: 0, x2: cx, y2: 12, strokeColor: kipGreen, strokeWidth: 1.4 },
        { id: nid(), kind: 'line', x1: cx, y1: 44, x2: cx, y2: 62, strokeWidth: 1.8 },
        { id: nid(), kind: 'rect', x: cx - 24, y: 62, width: 48, height: 84, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 0, y1: ductY, x2: cx - 24, y2: ductY, strokeColor: kipGreen, strokeWidth: 2 },
        { id: nid(), kind: 'line', x1: cx + 24, y1: ductY, x2: w, y2: ductY, strokeColor: kipGreen, strokeWidth: 2 },
        { id: nid(), kind: 'line', x1: cx - 16, y1: 134, x2: cx + 16, y2: 76, strokeWidth: 2.2 },
        { id: nid(), kind: 'circle', cx, cy: ductY, r: 5, filled: true, fillColor: '#111827', strokeWidth: 1.5 }
      );
      return shapes;
    }
    case 'filter': {
      const ductY = Math.round(h * 0.58);
      shapes.push(
        { id: nid(), kind: 'circle', cx, cy: 24, r: 14, filled: true, strokeColor: kipGreen, strokeWidth: 1.8 },
        { id: nid(), kind: 'text', x: cx, y: 28, text: 'ΔP', fontSize: 9, bold: true, strokeColor: kipGreen },
        { id: nid(), kind: 'line', x1: cx, y1: 0, x2: cx, y2: 10, strokeColor: kipGreen, strokeWidth: 1.4 },
        { id: nid(), kind: 'line', x1: cx, y1: 38, x2: cx, y2: 65, strokeStyle: 'dashed', strokeWidth: 1.4 },
        { id: nid(), kind: 'rect', x: cx - 24, y: 65, width: 48, height: 80, filled: true, strokeWidth: 1.8 },
        {
          id: nid(),
          kind: 'polyline',
          points: [
            { x: cx - 24, y: 65 },
            { x: cx + 24, y: 65 },
            { x: cx - 24, y: 145 },
          ],
          closed: true,
          filled: true,
          fillColor: kipGreen,
          strokeColor: kipGreen,
          strokeWidth: 1.4,
        },
        { id: nid(), kind: 'line', x1: 0, y1: ductY, x2: cx - 24, y2: ductY, strokeColor: kipGreen, strokeWidth: 2 },
        { id: nid(), kind: 'line', x1: cx + 24, y1: ductY, x2: w, y2: ductY, strokeColor: kipGreen, strokeWidth: 2 }
      );
      return shapes;
    }
    case 'heater': {
      const ductY = 90;
      const isElec = e3BlockName.includes('ELEC');
      shapes.push(
        { id: nid(), kind: 'line', x1: cx, y1: 0, x2: cx, y2: 46, strokeColor: kipGreen, strokeWidth: 1.4 },
        { id: nid(), kind: 'circle', cx, cy: 22, r: 12, filled: true, strokeColor: kipGreen, strokeWidth: 1.4 },
        { id: nid(), kind: 'text', x: cx, y: 25, text: isElec ? 'TS' : 'THT', fontSize: 8.5, bold: true, strokeColor: kipGreen },
        { id: nid(), kind: 'rect', x: cx - 32, y: 46, width: 64, height: 88, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 0, y1: ductY, x2: cx - 32, y2: ductY, strokeColor: kipGreen, strokeWidth: 2 },
        { id: nid(), kind: 'line', x1: cx + 32, y1: ductY, x2: w, y2: ductY, strokeColor: kipGreen, strokeWidth: 2 }
      );
      if (isElec) {
        shapes.push({
          id: nid(),
          kind: 'polyline',
          points: [
            { x: cx - 18, y: 62 },
            { x: cx + 16, y: 80 },
            { x: cx - 16, y: 98 },
            { x: cx + 18, y: 118 },
          ],
          strokeColor: '#dc2626',
          strokeWidth: 1.8,
        });
      } else {
        shapes.push(
          { id: nid(), kind: 'line', x1: cx - 32, y1: 46, x2: cx + 32, y2: 134, strokeColor: '#dc2626', strokeWidth: 1.8 },
          { id: nid(), kind: 'circle', cx, cy: ductY, r: 12, filled: true, strokeColor: '#dc2626', strokeWidth: 1.4 },
          { id: nid(), kind: 'text', x: cx, y: ductY + 4, text: '+', fontSize: 11, bold: true, strokeColor: '#dc2626' }
        );
      }
      shapes.push({ id: nid(), kind: 'line', x1: cx, y1: 134, x2: cx, y2: h, strokeColor: kipGreen, strokeWidth: 1.4 });
      return shapes;
    }
    case 'cooler': {
      const ductY = 90;
      shapes.push(
        { id: nid(), kind: 'line', x1: cx, y1: 0, x2: cx, y2: 46, strokeColor: kipGreen, strokeWidth: 1.4 },
        { id: nid(), kind: 'rect', x: cx - 30, y: 46, width: 60, height: 88, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 0, y1: ductY, x2: cx - 30, y2: ductY, strokeColor: kipGreen, strokeWidth: 2 },
        { id: nid(), kind: 'line', x1: cx + 30, y1: ductY, x2: w, y2: ductY, strokeColor: kipGreen, strokeWidth: 2 },
        { id: nid(), kind: 'line', x1: cx - 16, y1: ductY, x2: cx + 16, y2: ductY, strokeColor: '#0284c7', strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx, y1: ductY - 16, x2: cx, y2: ductY + 16, strokeColor: '#0284c7', strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx - 11, y1: ductY - 11, x2: cx + 11, y2: ductY + 11, strokeColor: '#0284c7', strokeWidth: 1.4 },
        { id: nid(), kind: 'line', x1: cx + 11, y1: ductY - 11, x2: cx - 11, y2: ductY + 11, strokeColor: '#0284c7', strokeWidth: 1.4 },
        { id: nid(), kind: 'line', x1: cx, y1: 134, x2: cx, y2: h, strokeColor: kipGreen, strokeWidth: 1.4 }
      );
      return shapes;
    }
    case 'fan': {
      const fanCy = 85;
      const r = 30;
      shapes.push(
        { id: nid(), kind: 'line', x1: cx, y1: 0, x2: cx, y2: fanCy - r, strokeColor: kipGreen, strokeWidth: 1.4 },
        { id: nid(), kind: 'line', x1: 0, y1: fanCy, x2: cx - r, y2: fanCy, strokeColor: kipGreen, strokeWidth: 2 },
        { id: nid(), kind: 'line', x1: cx + r, y1: fanCy, x2: w, y2: fanCy, strokeColor: kipGreen, strokeWidth: 2 },
        { id: nid(), kind: 'circle', cx, cy: fanCy, r, filled: true, strokeWidth: 2 },
        { id: nid(), kind: 'line', x1: cx - 18, y1: fanCy - 22, x2: cx + 26, y2: fanCy - 8, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx - 18, y1: fanCy + 22, x2: cx + 26, y2: fanCy + 8, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx, y1: fanCy + r, x2: cx, y2: 132, strokeColor: kipGreen, strokeWidth: 1.4 },
        { id: nid(), kind: 'circle', cx, cy: 148, r: 16, filled: true, strokeColor: kipGreen, strokeWidth: 1.8 },
        { id: nid(), kind: 'text', x: cx, y: 154, text: 'M', fontSize: 14, bold: true, strokeColor: kipGreen },
        { id: nid(), kind: 'line', x1: cx, y1: 164, x2: cx, y2: h, strokeColor: kipGreen, strokeWidth: 1.4 }
      );
      return shapes;
    }
    case 'kip_circle': {
      const isPost = e3BlockName.includes('HHS');
      const circY = isPost ? cy : 44;
      const r = 24;
      shapes.push(
        { id: nid(), kind: 'line', x1: cx, y1: 0, x2: cx, y2: circY - r, strokeColor: kipGreen, strokeWidth: 1.4 },
        { id: nid(), kind: 'line', x1: cx, y1: circY + r, x2: cx, y2: h, strokeColor: kipGreen, strokeWidth: 1.4 }
      );
      if (!isPost) {
        shapes.push({ id: nid(), kind: 'line', x1: 0, y1: 90, x2: w, y2: 90, strokeColor: kipGreen, strokeWidth: 2 });
      }
      shapes.push(
        { id: nid(), kind: 'circle', cx, cy: circY, r, filled: true, strokeColor: kipGreen, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx - r + 2, y1: circY, x2: cx + r - 2, y2: circY, strokeColor: kipGreen, strokeWidth: 1.3 },
        { id: nid(), kind: 'text', x: cx, y: circY - 4, text: isPost ? 'HHS' : 'KIP', fontSize: 10, bold: true, strokeColor: kipGreen },
        { id: nid(), kind: 'text', x: cx, y: circY + 13, text: '{designation}', attrKey: 'designation', fontSize: 9 }
      );
      return shapes;
    }
    case 'junction_box': {
      shapes.push(
        { id: nid(), kind: 'rect', x: 4, y: 4, width: w - 8, height: h - 16, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 4, y1: 26, x2: w - 4, y2: 26, strokeWidth: 1.2 },
        { id: nid(), kind: 'text', x: cx, y: 19, text: '{article}', attrKey: 'article', fontSize: 8.8, bold: true },
        { id: nid(), kind: 'text', x: cx, y: 40, text: '{componentName}', attrKey: 'componentName', fontSize: 8.2 }
      );
      return shapes;
    }
    case 'breaker': {
      const topXs = pins.filter((p) => p.direction === 'top').map((p) => p.dx);
      const xs = topXs.length > 0 ? topXs : [cx];
      shapes.push({ id: nid(), kind: 'rect', x: 4, y: 10, width: w - 8, height: h - 20, filled: true, strokeWidth: 1.8 });
      for (const px of xs) {
        shapes.push(
          { id: nid(), kind: 'line', x1: px, y1: 0, x2: px, y2: 28, strokeWidth: 1.8 },
          { id: nid(), kind: 'line', x1: px, y1: 28, x2: px - 10, y2: h - 32, strokeWidth: 1.8 },
          { id: nid(), kind: 'line', x1: px, y1: h - 28, x2: px, y2: h, strokeWidth: 1.8 },
          { id: nid(), kind: 'circle', cx: px, cy: 28, r: 2.5, filled: true }
        );
      }
      if (xs.length > 1) {
        shapes.push({
          id: nid(),
          kind: 'line',
          x1: xs[0] - 5,
          y1: h / 2,
          x2: xs[xs.length - 1] - 5,
          y2: h / 2,
          strokeStyle: 'dashed',
          strokeColor: '#64748b',
          strokeWidth: 1.2,
        });
      }
      return shapes;
    }
    case 'contactor': {
      shapes.push(
        { id: nid(), kind: 'rect', x: 8, y: 10, width: w - 16, height: h - 20, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'rect', x: 14, y: 32, width: 22, height: 56, filled: false, strokeWidth: 1.4 },
        { id: nid(), kind: 'line', x1: 0, y1: 40, x2: 14, y2: 40, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 0, y1: 80, x2: 14, y2: 80, strokeWidth: 1.8 }
      );
      for (const px of [30, 60, 90]) {
        if (px < w - 10) {
          shapes.push(
            { id: nid(), kind: 'line', x1: px, y1: 0, x2: px, y2: 35, strokeWidth: 1.8 },
            { id: nid(), kind: 'line', x1: px, y1: 35, x2: px + 9, y2: 82, strokeWidth: 1.8 },
            { id: nid(), kind: 'line', x1: px, y1: 85, x2: px, y2: h, strokeWidth: 1.8 }
          );
        }
      }
      shapes.push({
        id: nid(),
        kind: 'line',
        x1: 36,
        y1: 60,
        x2: Math.min(w - 14, 93),
        y2: 60,
        strokeStyle: 'dashed',
        strokeColor: '#64748b',
        strokeWidth: 1.2,
      });
      return shapes;
    }
    case 'motor': {
      const r = Math.min(w, h) * 0.34;
      shapes.push(
        { id: nid(), kind: 'circle', cx, cy: cy + 8, r, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'circle', cx, cy: cy + 8, r: Math.max(6, r - 5), filled: false, strokeColor: '#64748b', strokeWidth: 1.2 },
        { id: nid(), kind: 'text', x: cx, y: cy + 14, text: 'M 3~', fontSize: 15, bold: true },
        { id: nid(), kind: 'line', x1: cx + r, y1: 55, x2: w, y2: 55, strokeColor: kipGreen, strokeWidth: 1.8 }
      );
      for (const px of [25, 55, 85]) {
        if (px < w - 5) {
          shapes.push({ id: nid(), kind: 'line', x1: px, y1: 0, x2: px, y2: cy + 8 - r + 4, strokeWidth: 1.8 });
        }
      }
      return shapes;
    }
    case 'lamp': {
      const r = 22;
      shapes.push(
        { id: nid(), kind: 'circle', cx, cy, r, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx - 14, y1: cy - 14, x2: cx + 14, y2: cy + 14, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx + 14, y1: cy - 14, x2: cx - 14, y2: cy + 14, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 0, y1: cy, x2: cx - r, y2: cy, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx + r, y1: cy, x2: w, y2: cy, strokeWidth: 1.8 }
      );
      return shapes;
    }
    case 'terminal': {
      const topXs = pins.filter((p) => p.direction === 'top').map((p) => p.dx);
      const xs = topXs.length > 0 ? topXs : [20, 45, 75, 100].filter((x) => x < w - 4);
      shapes.push({ id: nid(), kind: 'rect', x: 4, y: 12, width: w - 8, height: h - 24, filled: true, strokeWidth: 1.8 });
      for (const px of xs) {
        shapes.push(
          { id: nid(), kind: 'line', x1: px, y1: 0, x2: px, y2: h, strokeWidth: 1.3 },
          { id: nid(), kind: 'circle', cx: px, cy: cy, r: 4, filled: true, strokeWidth: 1.8 }
        );
      }
      return shapes;
    }
    case 'relay': {
      shapes.push(
        { id: nid(), kind: 'rect', x: 8, y: 6, width: w - 16, height: h - 12, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'rect', x: 16, y: 24, width: 22, height: 42, filled: false, strokeWidth: 1.4 },
        { id: nid(), kind: 'line', x1: 0, y1: 30, x2: 16, y2: 30, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 0, y1: 60, x2: 16, y2: 60, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 38, y1: 45, x2: 66, y2: 45, strokeStyle: 'dashed', strokeColor: '#64748b', strokeWidth: 1.2 },
        { id: nid(), kind: 'line', x1: w, y1: 30, x2: 72, y2: 30, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 72, y1: 30, x2: 60, y2: 54, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 72, y1: 60, x2: w, y2: 60, strokeWidth: 1.8 }
      );
      return shapes;
    }
    case 'sensor': {
      const r = Math.min(w, h) * 0.28;
      shapes.push(
        { id: nid(), kind: 'circle', cx: cx - 10, cy, r, filled: true, strokeColor: kipGreen, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx - 10 - r, y1: cy, x2: cx - 10 + r, y2: cy, strokeColor: kipGreen, strokeWidth: 1.3 },
        { id: nid(), kind: 'text', x: cx - 10, y: cy - 3, text: 'BT', fontSize: 10, bold: true, strokeColor: kipGreen },
        { id: nid(), kind: 'line', x1: cx - 10 + r, y1: 25, x2: w, y2: 25, strokeWidth: 1.6 },
        { id: nid(), kind: 'line', x1: cx - 10 + r, y1: 55, x2: w, y2: 55, strokeWidth: 1.6 }
      );
      return shapes;
    }
    case 'pump': {
      const r = Math.min(w, h) * 0.3;
      shapes.push(
        { id: nid(), kind: 'circle', cx, cy, r, filled: true, strokeColor: '#0284c7', strokeWidth: 1.8 },
        {
          id: nid(),
          kind: 'polyline',
          points: [
            { x: cx - r * 0.45, y: cy + r * 0.45 },
            { x: cx, y: cy - r * 0.7 },
            { x: cx + r * 0.45, y: cy + r * 0.45 },
          ],
          closed: false,
          strokeColor: '#0284c7',
          strokeWidth: 1.8,
        },
        { id: nid(), kind: 'line', x1: 0, y1: cy, x2: cx - r, y2: cy, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: cx + r, y1: cy, x2: w, y2: cy, strokeWidth: 1.8 }
      );
      return shapes;
    }
    case 'valve': {
      shapes.push(
        {
          id: nid(),
          kind: 'polyline',
          points: [
            { x: cx - 22, y: cy - 14 },
            { x: cx + 22, y: cy + 14 },
            { x: cx + 22, y: cy - 14 },
            { x: cx - 22, y: cy + 14 },
          ],
          closed: true,
          filled: true,
          strokeWidth: 1.8,
        },
        { id: nid(), kind: 'line', x1: cx, y1: cy, x2: cx, y2: 18, strokeWidth: 1.6 },
        { id: nid(), kind: 'arc', cx, cy: 18, r: 12, startAngle: 180, endAngle: 360, strokeColor: kipGreen, strokeWidth: 1.8 }
      );
      return shapes;
    }
    case 'offpage_ref': {
      const isOut = !e3BlockName.includes('IN');
      shapes.push(
        {
          id: nid(),
          kind: 'polyline',
          points: isOut
            ? [
                { x: 2, y: 2 },
                { x: w - 14, y: 2 },
                { x: w - 2, y: cy },
                { x: w - 14, y: h - 2 },
                { x: 2, y: h - 2 },
              ]
            : [
                { x: 2, y: 2 },
                { x: w - 12, y: 2 },
                { x: w - 2, y: cy },
                { x: w - 12, y: h - 2 },
                { x: 2, y: h - 2 },
                { x: 11, y: cy },
              ],
          closed: true,
          filled: true,
          strokeColor: '#0284c7',
          strokeWidth: 1.8,
        },
        { id: nid(), kind: 'text', x: cx, y: cy + 4, text: '{designation}', attrKey: 'designation', fontSize: 10, bold: true }
      );
      return shapes;
    }
    default: {
      return [
        { id: nid(), kind: 'rect', x: 4, y: 4, width: w - 8, height: h - 8, filled: true, strokeWidth: 1.8 },
        { id: nid(), kind: 'line', x1: 4, y1: 26, x2: w - 4, y2: 26, strokeWidth: 1.2 },
        { id: nid(), kind: 'text', x: cx, y: 19, text: category.toUpperCase(), fontSize: 9.5, bold: true, strokeColor: '#64748b' },
        { id: nid(), kind: 'text', x: cx, y: cy + 10, text: '{article}', attrKey: 'article', fontSize: 10 },
      ];
    }
  }
}

export function buildSymbolDefFromCatalogItem(item: CatalogItem): E3SymbolDef {
  const shapes =
    item.customSymbol && item.customSymbol.shapes.length > 0
      ? structuredClone(item.customSymbol.shapes)
      : extractBuiltInSymbolShapes(item.category, item.width, item.height, item.e3BlockName, item.pins);
  return {
    id: item.symbolId || `sym-${item.e3BlockName || item.id}`,
    name: `${item.e3BlockName} (${item.category})`,
    e3BlockName: item.e3BlockName,
    category: item.category,
    description: item.componentName,
    width: item.width,
    height: item.height,
    shapes,
    defaultPins: item.pins.map((p) => ({ ...p })),
    isCustom: Boolean(item.customSymbol?.shapes.length || item.isCustom),
  };
}

export function getBuiltInSymbolLibrary(catalog: CatalogItem[]): E3SymbolDef[] {
  const byKey = new Map<string, E3SymbolDef>();
  for (const item of catalog) {
    const key = item.symbolId || item.e3BlockName || item.id;
    if (!byKey.has(key)) {
      byKey.set(key, buildSymbolDefFromCatalogItem(item));
    }
  }
  return Array.from(byKey.values());
}

export function loadCustomSymbols(): E3SymbolDef[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_SYMBOLS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as E3SymbolDef[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomSymbols(symbols: E3SymbolDef[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(CUSTOM_SYMBOLS_STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // ignore storage quota errors
  }
}

export function mergeSymbolLibrary(
  builtIn: E3SymbolDef[],
  custom: E3SymbolDef[]
): E3SymbolDef[] {
  const byId = new Map<string, E3SymbolDef>();
  for (const sym of builtIn) {
    byId.set(sym.id, sym);
  }
  for (const sym of custom) {
    byId.set(sym.id, { ...sym, isCustom: true });
  }
  return Array.from(byId.values());
}

export function duplicateSymbolDefAsCopy(
  source: E3SymbolDef,
  newName: string,
  newBlockName?: string
): E3SymbolDef {
  const cleanName = newName.trim() || `${source.name} (копия)`;
  const blockSlug =
    (newBlockName || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '_') ||
    `${source.e3BlockName.replace(/[^A-Za-z0-9_-]/g, '_')}_COPY_${Date.now().toString(36).slice(-4).toUpperCase()}`;
  return {
    ...structuredClone(source),
    id: `sym-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: cleanName,
    e3BlockName: blockSlug,
    isCustom: true,
    updatedAt: new Date().toISOString(),
  };
}

export function duplicateCatalogItemAsCopy(
  source: CatalogItem,
  overrides: {
    componentName: string;
    article?: string;
    e3BlockName?: string;
    symbolId?: string;
    shapes?: CustomSymbolShape[];
    pins?: Omit<E3Pin, 'id'>[];
    width?: number;
    height?: number;
    attributes?: E3Attribute[];
  }
): CatalogItem {
  const cleanName = overrides.componentName.trim() || `${source.componentName} (копия)`;
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return {
    ...structuredClone(source),
    id: `custom-cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    componentName: cleanName,
    article: overrides.article?.trim() || `${source.article}-${suffix}`,
    e3BlockName: overrides.e3BlockName?.trim() || `${source.e3BlockName}_${suffix}`,
    symbolId: overrides.symbolId || source.symbolId,
    width: overrides.width ?? source.width,
    height: overrides.height ?? source.height,
    pins: overrides.pins ? overrides.pins.map((p) => ({ ...p })) : structuredClone(source.pins),
    defaultAttributes: overrides.attributes
      ? overrides.attributes.map((a) => ({ ...a }))
      : structuredClone(source.defaultAttributes),
    isCustom: true,
    customSymbol: overrides.shapes
      ? { shapes: structuredClone(overrides.shapes), showBodyBorder: false }
      : source.customSymbol
        ? structuredClone(source.customSymbol)
        : undefined,
  };
}

export function moveSymbolShape(
  shape: CustomSymbolShape,
  dx: number,
  dy: number
): CustomSymbolShape {
  if (shape.kind === 'line') {
    return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
  }
  if (shape.kind === 'polyline') {
    return {
      ...shape,
      points: shape.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
    };
  }
  if (shape.kind === 'rect') {
    return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
  if (shape.kind === 'circle' || shape.kind === 'arc') {
    return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
  }
  return { ...shape, x: shape.x + dx, y: shape.y + dy };
}

export function rotateSymbolGeometryCW(
  width: number,
  height: number,
  shapes: CustomSymbolShape[],
  pins: Omit<E3Pin, 'id'>[]
): {
  width: number;
  height: number;
  shapes: CustomSymbolShape[];
  pins: Omit<E3Pin, 'id'>[];
} {
  const rotPt = (x: number, y: number) => ({ x: height - y, y: x });
  const rotDir = (dir: E3Pin['direction']): E3Pin['direction'] => {
    if (dir === 'top') return 'right';
    if (dir === 'right') return 'bottom';
    if (dir === 'bottom') return 'left';
    return 'top';
  };

  const nextShapes: CustomSymbolShape[] = shapes.map((sh) => {
    if (sh.kind === 'line') {
      const p1 = rotPt(sh.x1, sh.y1);
      const p2 = rotPt(sh.x2, sh.y2);
      return { ...sh, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    if (sh.kind === 'polyline') {
      return { ...sh, points: sh.points.map((p) => rotPt(p.x, p.y)) };
    }
    if (sh.kind === 'rect') {
      const tl = rotPt(sh.x, sh.y + sh.height);
      return { ...sh, x: tl.x, y: tl.y, width: sh.height, height: sh.width };
    }
    if (sh.kind === 'circle') {
      const c = rotPt(sh.cx, sh.cy);
      return { ...sh, cx: c.x, cy: c.y };
    }
    if (sh.kind === 'arc') {
      const c = rotPt(sh.cx, sh.cy);
      return {
        ...sh,
        cx: c.x,
        cy: c.y,
        startAngle: sh.startAngle + 90,
        endAngle: sh.endAngle + 90,
      };
    }
    const p = rotPt(sh.x, sh.y);
    return { ...sh, x: p.x, y: p.y };
  });

  const nextPins = pins.map((p) => {
    const rp = rotPt(p.dx, p.dy);
    return { ...p, dx: rp.x, dy: rp.y, direction: rotDir(p.direction) };
  });

  return { width: height, height: width, shapes: nextShapes, pins: nextPins };
}

export function mirrorSymbolGeometryX(
  width: number,
  shapes: CustomSymbolShape[],
  pins: Omit<E3Pin, 'id'>[]
): { shapes: CustomSymbolShape[]; pins: Omit<E3Pin, 'id'>[] } {
  const mx = (x: number) => width - x;
  const nextShapes: CustomSymbolShape[] = shapes.map((sh) => {
    if (sh.kind === 'line') return { ...sh, x1: mx(sh.x1), x2: mx(sh.x2) };
    if (sh.kind === 'polyline') return { ...sh, points: sh.points.map((p) => ({ x: mx(p.x), y: p.y })) };
    if (sh.kind === 'rect') return { ...sh, x: mx(sh.x + sh.width) };
    if (sh.kind === 'circle') return { ...sh, cx: mx(sh.cx) };
    if (sh.kind === 'arc') {
      const nextStart = 180 - sh.endAngle;
      const nextEnd = 180 - sh.startAngle;
      return { ...sh, cx: mx(sh.cx), startAngle: nextStart, endAngle: nextEnd };
    }
    return { ...sh, x: mx(sh.x) };
  });
  const nextPins = pins.map((p) => ({
    ...p,
    dx: mx(p.dx),
    direction: p.direction === 'left' ? ('right' as const) : p.direction === 'right' ? ('left' as const) : p.direction,
  }));
  return { shapes: nextShapes, pins: nextPins };
}

export function mirrorSymbolGeometryY(
  height: number,
  shapes: CustomSymbolShape[],
  pins: Omit<E3Pin, 'id'>[]
): { shapes: CustomSymbolShape[]; pins: Omit<E3Pin, 'id'>[] } {
  const my = (y: number) => height - y;
  const nextShapes: CustomSymbolShape[] = shapes.map((sh) => {
    if (sh.kind === 'line') return { ...sh, y1: my(sh.y1), y2: my(sh.y2) };
    if (sh.kind === 'polyline') return { ...sh, points: sh.points.map((p) => ({ x: p.x, y: my(p.y) })) };
    if (sh.kind === 'rect') return { ...sh, y: my(sh.y + sh.height) };
    if (sh.kind === 'circle') return { ...sh, cy: my(sh.cy) };
    if (sh.kind === 'arc') {
      return { ...sh, cy: my(sh.cy), startAngle: -sh.endAngle, endAngle: -sh.startAngle };
    }
    return { ...sh, y: my(sh.y) };
  });
  const nextPins = pins.map((p) => ({
    ...p,
    dy: my(p.dy),
    direction: p.direction === 'top' ? ('bottom' as const) : p.direction === 'bottom' ? ('top' as const) : p.direction,
  }));
  return { shapes: nextShapes, pins: nextPins };
}
