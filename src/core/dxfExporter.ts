import JSZip from 'jszip';
import { mapDxfLayerFlags } from './cadLayers.ts';
import { buildBom, computeWireJunctionDots, getAbsolutePinPos } from './e3Engine.ts';
import type {
  AnnotationStrokeStyle,
  CadLayerStateMap,
  CustomSymbolStrokeStyle,
  E3Device,
  E3Project,
  E3Sheet,
} from './e3Types.ts';
import { buildGostSheetGeometry } from './gostFrame.ts';
import { buildGostTableRenderModel } from './gostTables.ts';
import { normalizeArcSweepDeg, resolveDynamicSymbolText } from './symbolLibrary.ts';

export interface DxfExportOptions {
  sheetIds?: string[];
  includeBom?: boolean;
  includeGostFrame?: boolean;
  editableBlocks?: boolean;
}

type DxfLineType = 'CONTINUOUS' | 'DASHED' | 'DASHDOT' | 'DOT';

const DXF_LINEWEIGHT_TABLE = [13, 15, 18, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100];

export function toDxfLineweight(pxWidth: number | undefined, fallback = 25): number {
  if (typeof pxWidth !== 'number' || !Number.isFinite(pxWidth) || pxWidth <= 0) {
    return fallback;
  }
  const scaled = pxWidth * 18;
  let best = DXF_LINEWEIGHT_TABLE[0];
  let bestDiff = Math.abs(scaled - best);
  for (const lw of DXF_LINEWEIGHT_TABLE) {
    const diff = Math.abs(scaled - lw);
    if (diff < bestDiff) {
      best = lw;
      bestDiff = diff;
    }
  }
  return best;
}

function toDxfLtype(style?: AnnotationStrokeStyle | CustomSymbolStrokeStyle, dashedFallback?: boolean): DxfLineType {
  if (style === 'dashed') return 'DASHED';
  if (style === 'dashdot') return 'DASHDOT';
  if (style === 'dotted') return 'DOT';
  if (dashedFallback && !style) return 'DASHED';
  return 'CONTINUOUS';
}

function hexToAciColor(hex?: string, fallback = 7): number {
  if (!hex) return fallback;
  const c = hex.trim().toLowerCase();
  if (c === '#dc2626' || c === '#ef4444') return 1; // Red
  if (c === '#d97706' || c === '#f59e0b' || c === '#eab308') return 2; // Yellow
  if (c === '#15803d' || c === '#16a34a' || c === '#22c55e') return 3; // Green
  if (c === '#0284c7' || c === '#06b6d4' || c === '#0f766e') return 4; // Cyan / Teal
  if (c === '#4f46e5' || c === '#2563eb' || c === '#1d4ed8') return 5; // Blue
  if (c === '#64748b' || c === '#475569' || c === '#94a3b8') return 8; // Gray
  return fallback;
}

export function extractDeviceRating(dev: E3Device): string {
  const priorityAttr = dev.attributes.find(
    (a) =>
      !a.service &&
      a.value &&
      /номинал|ток|мощн|напряж|диапазон|катушк|питани|уставка|rating|current|power|voltage/i.test(
        a.name
      )
  );
  if (priorityAttr?.value) return priorityAttr.value;
  const fallback = dev.attributes.find((a) => !a.service && a.value && a.value !== dev.article);
  return fallback?.value || '—';
}

function sanitizeBlockName(raw: string): string {
  return (
    raw
      .replace(/[^A-Za-z0-9_-]/g, '_')
      .replace(/^_+/, '')
      .slice(0, 48) || 'E3_BLOCK'
  );
}

function dxfTextEscape(text: string): string {
  return String(text || '')
    .replace(/\r?\n/g, ' ')
    .replace(/[\x00-\x1f]/g, ' ');
}

interface EntityStyleOpts {
  color?: number;
  ltype?: DxfLineType;
  lineweight?: number;
}

interface DxfWriter {
  lines: string[];
  add: (code: number | string, value: string | number) => void;
  line: (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    layer: string,
    colorOrOpts?: number | EntityStyleOpts
  ) => void;
  rect: (
    x: number,
    y: number,
    w: number,
    h: number,
    layer: string,
    colorOrOpts?: number | EntityStyleOpts
  ) => void;
  circle: (
    cx: number,
    cy: number,
    r: number,
    layer: string,
    colorOrOpts?: number | EntityStyleOpts
  ) => void;
  arc: (
    cx: number,
    cy: number,
    r: number,
    startDeg: number,
    endDeg: number,
    layer: string,
    colorOrOpts?: number | EntityStyleOpts
  ) => void;
  polyline: (
    pts: Array<{ x: number; y: number }>,
    layer: string,
    colorOrOpts?: number | EntityStyleOpts,
    closed?: boolean
  ) => void;
  text: (
    x: number,
    y: number,
    value: string,
    height: number,
    layer: string,
    color?: number,
    hAlign?: 0 | 1 | 2,
    vAlign?: 0 | 1 | 2 | 3,
    lineweight?: number
  ) => void;
  attdef: (
    x: number,
    y: number,
    tag: string,
    prompt: string,
    defVal: string,
    height: number,
    layer: string,
    color?: number,
    hAlign?: 0 | 1 | 2,
    lineweight?: number
  ) => void;
  insertWithAttribs: (
    blockName: string,
    x: number,
    y: number,
    layer: string,
    attribs: Array<{
      tag: string;
      value: string;
      x: number;
      y: number;
      height: number;
      layer?: string;
      color?: number;
      hAlign?: 0 | 1 | 2;
      lineweight?: number;
    }>,
    rotationDeg?: number
  ) => void;
}

function resolveStyle(colorOrOpts?: number | EntityStyleOpts): EntityStyleOpts {
  if (typeof colorOrOpts === 'number') {
    return { color: colorOrOpts };
  }
  return colorOrOpts || {};
}

function createDxfWriter(): DxfWriter {
  const lines: string[] = [];
  const add = (code: number | string, value: string | number) => {
    lines.push(String(code), String(value));
  };

  const emitStyle = (opts: EntityStyleOpts) => {
    if (opts.ltype && opts.ltype !== 'CONTINUOUS') add(6, opts.ltype);
    if (opts.color !== undefined && opts.color !== 256) add(62, opts.color);
    if (opts.lineweight !== undefined) add(370, opts.lineweight);
  };

  const w: DxfWriter = {
    lines,
    add,
    line(x1, y1, x2, y2, layer, colorOrOpts = 256) {
      add(0, 'LINE');
      add(8, layer);
      emitStyle(resolveStyle(colorOrOpts));
      add(10, x1.toFixed(2));
      add(20, y1.toFixed(2));
      add(30, '0.0');
      add(11, x2.toFixed(2));
      add(21, y2.toFixed(2));
      add(31, '0.0');
    },
    rect(x, y, rw, rh, layer, colorOrOpts = 256) {
      w.polyline(
        [
          { x, y },
          { x: x + rw, y },
          { x: x + rw, y: y - rh },
          { x, y: y - rh },
        ],
        layer,
        colorOrOpts,
        true
      );
    },
    circle(cx, cy, r, layer, colorOrOpts = 256) {
      add(0, 'CIRCLE');
      add(8, layer);
      emitStyle(resolveStyle(colorOrOpts));
      add(10, cx.toFixed(2));
      add(20, cy.toFixed(2));
      add(30, '0.0');
      add(40, Math.max(0.5, r).toFixed(2));
    },
    arc(cx, cy, r, startDeg, endDeg, layer, colorOrOpts = 256) {
      add(0, 'ARC');
      add(8, layer);
      emitStyle(resolveStyle(colorOrOpts));
      add(10, cx.toFixed(2));
      add(20, cy.toFixed(2));
      add(30, '0.0');
      add(40, Math.max(0.5, r).toFixed(2));
      const norm = (deg: number) => ((deg % 360) + 360) % 360;
      add(50, norm(startDeg).toFixed(2));
      add(51, norm(endDeg).toFixed(2));
    },
    polyline(pts, layer, colorOrOpts = 256, closed = false) {
      if (pts.length < 2) return;
      add(0, 'LWPOLYLINE');
      add(8, layer);
      emitStyle(resolveStyle(colorOrOpts));
      add(90, pts.length);
      add(70, closed ? 1 : 0);
      for (const pt of pts) {
        add(10, pt.x.toFixed(2));
        add(20, pt.y.toFixed(2));
      }
    },
    text(x, y, value, height, layer, color = 256, hAlign = 0, vAlign = 0, lineweight) {
      const clean = dxfTextEscape(value);
      add(0, 'TEXT');
      add(8, layer);
      add(7, 'GOST_STYLE');
      if (color !== 256) add(62, color);
      if (lineweight !== undefined) add(370, lineweight);
      add(10, x.toFixed(2));
      add(20, y.toFixed(2));
      add(30, '0.0');
      add(40, Math.max(2, height).toFixed(2));
      add(1, clean);
      if (hAlign !== 0 || vAlign !== 0) {
        add(72, hAlign);
        add(73, vAlign);
        add(11, x.toFixed(2));
        add(21, y.toFixed(2));
        add(31, '0.0');
      }
    },
    attdef(x, y, tag, prompt, defVal, height, layer, color = 7, hAlign = 0, lineweight) {
      add(0, 'ATTDEF');
      add(8, layer);
      add(7, 'GOST_STYLE');
      add(62, color);
      if (lineweight !== undefined) add(370, lineweight);
      add(10, x.toFixed(2));
      add(20, y.toFixed(2));
      add(30, '0.0');
      add(40, Math.max(2, height).toFixed(2));
      add(1, dxfTextEscape(defVal));
      add(3, dxfTextEscape(prompt));
      add(2, sanitizeBlockName(tag));
      add(70, 0);
      if (hAlign !== 0) {
        add(72, hAlign);
        add(74, 2);
        add(11, x.toFixed(2));
        add(21, y.toFixed(2));
        add(31, '0.0');
      }
    },
    insertWithAttribs(blockName, x, y, layer, attribs, rotationDeg = 0) {
      add(0, 'INSERT');
      add(8, layer);
      if (attribs.length > 0) add(66, 1);
      add(2, sanitizeBlockName(blockName));
      add(10, x.toFixed(2));
      add(20, y.toFixed(2));
      add(30, '0.0');
      add(41, '1.0');
      add(42, '1.0');
      add(43, '1.0');
      if (rotationDeg !== 0) {
        add(50, rotationDeg.toFixed(2));
      }
      for (const att of attribs) {
        add(0, 'ATTRIB');
        add(8, att.layer || layer);
        add(7, 'GOST_STYLE');
        add(62, att.color ?? 7);
        if (att.lineweight !== undefined) add(370, att.lineweight);
        add(10, att.x.toFixed(2));
        add(20, att.y.toFixed(2));
        add(30, '0.0');
        add(40, Math.max(2, att.height).toFixed(2));
        add(1, dxfTextEscape(att.value));
        add(2, sanitizeBlockName(att.tag));
        add(70, 0);
        if (att.hAlign) {
          add(72, att.hAlign);
          add(74, 2);
          add(11, att.x.toFixed(2));
          add(21, att.y.toFixed(2));
          add(31, '0.0');
        }
      }
      if (attribs.length > 0) {
        add(0, 'SEQEND');
        add(8, layer);
      }
    },
  };
  return w;
}

function signalTypeToAci(sig: string): number {
  if (sig === 'power') return 1; // Red
  if (sig === 'neutral') return 5; // Blue
  if (sig === 'pe') return 3; // Green
  if (sig === 'dc24') return 2; // Yellow/Amber
  if (sig === 'dc0') return 8; // Dark Gray
  if (sig === 'bus') return 4; // Cyan
  return 7; // Default White/Black
}

function computeDxfBlockInsertTransform(dev: E3Device, toX: (x: number) => number, toY: (y: number) => number) {
  const cx = toX(dev.x + dev.width / 2);
  const cy = toY(dev.y + dev.height / 2);
  const hw = dev.width / 2;
  const hh = dev.height / 2;
  const rot = ((dev.rotation % 360) + 360) % 360;
  if (rot === 90) {
    return { x: cx + hh, y: cy + hw, dxfAngle: 270 };
  }
  if (rot === 180) {
    return { x: cx + hw, y: cy - hh, dxfAngle: 180 };
  }
  if (rot === 270) {
    return { x: cx - hh, y: cy - hw, dxfAngle: 90 };
  }
  return { x: cx - hw, y: cy + hh, dxfAngle: 0 };
}

function drawDeviceSymbolInBlock(
  w: DxfWriter,
  dev: E3Device,
  ox: number,
  oy: number,
  deviceLw: number,
  textLw: number
) {
  const rw = dev.width;
  const rh = dev.height;

  if (dev.customSymbol && dev.customSymbol.shapes.length > 0) {
    for (const sh of dev.customSymbol.shapes) {
      const shAci = hexToAciColor(sh.strokeColor, sh.kind === 'rect' || sh.kind === 'circle' ? 3 : 7);
      const shLw = sh.kind !== 'text' && sh.strokeWidth ? toDxfLineweight(sh.strokeWidth, deviceLw) : deviceLw;
      const shLtype = sh.kind !== 'text' ? toDxfLtype(sh.strokeStyle, sh.dashed) : 'CONTINUOUS';
      if (sh.kind === 'line') {
        w.line(ox + sh.x1, oy - sh.y1, ox + sh.x2, oy - sh.y2, 'DEVICES', {
          color: shAci,
          ltype: shLtype,
          lineweight: shLw,
        });
      } else if (sh.kind === 'polyline') {
        w.polyline(
          (sh.points || []).map((pt) => ({ x: ox + pt.x, y: oy - pt.y })),
          'DEVICES',
          { color: shAci, ltype: shLtype, lineweight: shLw },
          Boolean(sh.closed)
        );
      } else if (sh.kind === 'rect') {
        w.rect(ox + sh.x, oy - sh.y, sh.width, sh.height, 'DEVICES', {
          color: shAci,
          ltype: shLtype,
          lineweight: shLw,
        });
      } else if (sh.kind === 'circle') {
        w.circle(ox + sh.cx, oy - sh.cy, sh.r, 'DEVICES', {
          color: shAci,
          ltype: shLtype,
          lineweight: shLw,
        });
      } else if (sh.kind === 'arc') {
        const sweep = normalizeArcSweepDeg(sh.startAngle, sh.endAngle);
        const endDeg = sh.startAngle + sweep;
        // SVG Y-down CW [startAngle -> endDeg] mirrors to DXF Y-up CCW [-endDeg -> -startAngle]
        w.arc(ox + sh.cx, oy - sh.cy, sh.r, -endDeg, -sh.startAngle, 'DEVICES', {
          color: shAci,
          ltype: shLtype,
          lineweight: shLw,
        });
      } else if (sh.kind === 'text') {
        const resolved = resolveDynamicSymbolText(sh, dev);
        const hAlign: 0 | 1 | 2 = sh.align === 'left' ? 0 : sh.align === 'right' ? 2 : 1;
        w.text(ox + sh.x, oy - sh.y, resolved, sh.fontSize || 10, 'TEXT', hexToAciColor(sh.strokeColor, 7), hAlign, 2, textLw);
      }
    }
  } else {
    w.rect(ox, oy, rw, rh, 'DEVICES', { color: 3, ltype: 'CONTINUOUS', lineweight: deviceLw });

    // Category-specific GOST internal geometry vectors
    if (dev.category === 'motor' || dev.category === 'fan' || dev.category === 'pump') {
      w.circle(ox + rw / 2, oy - rh / 2, Math.min(rw, rh) * 0.36, 'DEVICES', {
        color: 3,
        lineweight: deviceLw,
      });
      const mark = dev.category === 'motor' ? 'M3~' : dev.category === 'pump' ? 'Н' : 'M';
      w.text(ox + rw / 2, oy - rh / 2, mark, 11, 'TEXT', 7, 1, 2, textLw);
    } else if (dev.category === 'breaker') {
      const poles = dev.pins.filter((p) => p.direction === 'top').length || 1;
      const step = rw / (poles + 1);
      for (let i = 1; i <= poles; i++) {
        const px = ox + i * step;
        w.line(px, oy - 10, px, oy - 34, 'DEVICES', { color: 7, lineweight: deviceLw });
        w.line(px, oy - 34, px - 10, oy - 64, 'DEVICES', { color: 7, lineweight: deviceLw });
        w.line(px, oy - 66, px, oy - rh + 10, 'DEVICES', { color: 7, lineweight: deviceLw });
      }
      w.line(ox + step * 0.5, oy - 48, ox + rw - step * 0.5, oy - 48, 'DEVICES', {
        color: 8,
        ltype: 'DASHED',
        lineweight: Math.max(13, deviceLw - 5),
      });
    } else if (dev.category === 'contactor' || dev.category === 'relay') {
      w.rect(ox + 12, oy - rh * 0.3, 28, rh * 0.4, 'DEVICES', { color: 7, lineweight: deviceLw });
      w.line(ox + 48, oy - rh * 0.25, ox + 48, oy - rh * 0.75, 'DEVICES', {
        color: 7,
        lineweight: deviceLw,
      });
    } else if (dev.category === 'terminal') {
      w.circle(ox + rw / 2, oy - rh / 2, Math.min(rw, rh) * 0.28, 'DEVICES', {
        color: 7,
        lineweight: deviceLw,
      });
      w.line(ox + rw / 2, oy, ox + rw / 2, oy - rh, 'DEVICES', { color: 7, lineweight: deviceLw });
    } else if (dev.category === 'sensor' || dev.category === 'kip_circle') {
      w.circle(ox + rw / 2, oy - rh / 2, Math.min(rw, rh) * 0.34, 'DEVICES', {
        color: 4,
        lineweight: deviceLw,
      });
      w.text(ox + rw / 2, oy - rh / 2, dev.designation.replace(/^-/, ''), 8.5, 'TEXT', 7, 1, 2, textLw);
    } else if (dev.category === 'lamp') {
      const r = Math.min(rw, rh) * 0.34;
      const cx = ox + rw / 2;
      const cy = oy - rh / 2;
      w.circle(cx, cy, r, 'DEVICES', { color: 2, lineweight: deviceLw });
      const d = r * 0.707;
      w.line(cx - d, cy - d, cx + d, cy + d, 'DEVICES', { color: 2, lineweight: deviceLw });
      w.line(cx - d, cy + d, cx + d, cy - d, 'DEVICES', { color: 2, lineweight: deviceLw });
    } else if (dev.category === 'drive' || dev.category === 'plc' || dev.category === 'psu') {
      w.line(ox + 10, oy - 24, ox + rw - 10, oy - 24, 'DEVICES', { color: 8, lineweight: deviceLw });
      w.text(ox + rw / 2, oy - 13, dev.category.toUpperCase(), 9, 'TEXT', 7, 1, 2, textLw);
    } else if (dev.category === 'offpage_ref') {
      const pot = dev.offPageRef?.potentialName || dev.designation;
      w.text(ox + rw / 2, oy - rh / 2 + 2, pot, 8.5, 'TEXT', 2, 1, 2, textLw);
    }
  }

  // Pins stubs and pin numbers
  for (const pin of dev.pins) {
    const px = ox + pin.dx;
    const py = oy - pin.dy;
    w.circle(px, py, 2.2, 'DEVICES', { color: 2, lineweight: 18 });
    w.text(px + 3, py + (pin.direction === 'top' ? 5 : -8), pin.name, 7, 'TEXT', 8, 0, 0, textLw);
  }
}

function writeHeaderAndTables(
  w: DxfWriter,
  project: E3Project,
  cadLayers?: CadLayerStateMap
) {
  const vs = project.visualSettings;
  const frameLw = toDxfLineweight(vs.frameStrokeWidth ?? 1.6, 30);
  const stampLw = toDxfLineweight((vs.frameStrokeWidth ?? 1.6) * 0.85, 25);
  const deviceLw = toDxfLineweight(vs.symbolStrokeWidth ?? 1.75, 30);
  const wireLw = toDxfLineweight(vs.wireWidth ?? 2, 35);
  const annLw = toDxfLineweight(vs.annotationStrokeWidth ?? 1.4, 25);
  const textLw = 18;

  // HEADER Section - AC1021 supports native UTF-8 Cyrillic in AutoCAD / BricsCAD / nanoCAD / LibreCAD
  w.add(0, 'SECTION');
  w.add(2, 'HEADER');
  w.add(9, '$ACADVER');
  w.add(1, 'AC1021');
  w.add(9, '$DWGCODEPAGE');
  w.add(3, 'ANSI_1251');
  w.add(9, '$INSUNITS');
  w.add(70, 4); // Millimeters
  w.add(9, '$LWDISPLAY');
  w.add(290, 1); // Display lineweights in AutoCAD
  w.add(0, 'ENDSEC');

  // TABLES Section
  w.add(0, 'SECTION');
  w.add(2, 'TABLES');

  // LTYPE (CONTINUOUS, DASHED, DASHDOT, DOT)
  w.add(0, 'TABLE');
  w.add(2, 'LTYPE');
  w.add(70, 4);
  w.add(0, 'LTYPE');
  w.add(2, 'CONTINUOUS');
  w.add(70, 0);
  w.add(3, 'Solid line');
  w.add(72, 65);
  w.add(73, 0);
  w.add(40, 0.0);
  w.add(0, 'LTYPE');
  w.add(2, 'DASHED');
  w.add(70, 0);
  w.add(3, 'Dashed __ __ __');
  w.add(72, 65);
  w.add(73, 2);
  w.add(40, 12.0);
  w.add(49, 8.0);
  w.add(49, -4.0);
  w.add(0, 'LTYPE');
  w.add(2, 'DASHDOT');
  w.add(70, 0);
  w.add(3, 'Dash dot __ . __ .');
  w.add(72, 65);
  w.add(73, 4);
  w.add(40, 14.0);
  w.add(49, 6.0);
  w.add(49, -3.0);
  w.add(49, 1.0);
  w.add(49, -4.0);
  w.add(0, 'LTYPE');
  w.add(2, 'DOT');
  w.add(70, 0);
  w.add(3, 'Dotted . . . .');
  w.add(72, 65);
  w.add(73, 2);
  w.add(40, 4.0);
  w.add(49, 0.0);
  w.add(49, -4.0);
  w.add(0, 'ENDTAB');

  // LAYER (Canonical Stage 4.1 layers + E3_* compatibility layers)
  const layers: Array<[string, number, DxfLineType, number]> = [
    ['0', 7, 'CONTINUOUS', 25],
    ['GOST_FRAME', 7, 'CONTINUOUS', frameLw],
    ['GOST_STAMP', 7, 'CONTINUOUS', stampLw],
    ['DEVICES', 3, 'CONTINUOUS', deviceLw],
    ['WIRES', 1, 'CONTINUOUS', wireLw],
    ['ANNOTATIONS', 4, 'DASHED', annLw],
    ['TEXT', 7, 'CONTINUOUS', textLw],
    ['E3_DEVICES', 3, 'CONTINUOUS', deviceLw],
    ['E3_PINS', 2, 'CONTINUOUS', 18],
    ['E3_LABELS', 7, 'CONTINUOUS', textLw],
    ['E3_WIRES', 1, 'CONTINUOUS', wireLw],
    ['E3_NETS', 5, 'CONTINUOUS', textLw],
    ['E3_ANNOTATIONS', 4, 'DASHED', annLw],
    ['E3_BOM', 7, 'CONTINUOUS', 20],
  ];
  w.add(0, 'TABLE');
  w.add(2, 'LAYER');
  w.add(70, layers.length);
  for (const [name, color, ltype, lw] of layers) {
    const mapped = mapDxfLayerFlags(name, cadLayers, color);
    w.add(0, 'LAYER');
    w.add(2, name);
    w.add(70, mapped.flags70);
    w.add(62, mapped.color62);
    w.add(6, ltype);
    w.add(370, lw);
  }
  w.add(0, 'ENDTAB');

  // STYLE
  w.add(0, 'TABLE');
  w.add(2, 'STYLE');
  w.add(70, 1);
  w.add(0, 'STYLE');
  w.add(2, 'GOST_STYLE');
  w.add(70, 0);
  w.add(40, 0.0);
  w.add(41, 0.85);
  w.add(50, 0.0);
  w.add(71, 0);
  w.add(42, 10.0);
  w.add(3, 'Arial');
  w.add(4, '');
  w.add(0, 'ENDTAB');

  w.add(0, 'ENDSEC');
}

function buildSheetStampBlockName(sheet: E3Sheet, idx: number): string {
  return sanitizeBlockName(`GOST_STAMP_${sheet.titleBlock.stampForm || 'form1'}_L${sheet.number}_${idx}`);
}

function buildDeviceBlockName(dev: E3Device): string {
  return sanitizeBlockName(`E3DEV_${dev.id}`);
}

function writeBlocksSection(
  w: DxfWriter,
  project: E3Project,
  sheets: E3Sheet[],
  editableBlocks: boolean,
  includeGostFrame: boolean
) {
  const vs = project.visualSettings;
  const stampLw = toDxfLineweight((vs.frameStrokeWidth ?? 1.6) * 0.85, 25);
  const stampThinLw = Math.max(13, toDxfLineweight((vs.frameStrokeWidth ?? 1.6) * 0.45, 15));
  const deviceLw = toDxfLineweight(vs.symbolStrokeWidth ?? 1.75, 30);
  const textLw = 18;

  w.add(0, 'SECTION');
  w.add(2, 'BLOCKS');

  if (editableBlocks) {
    // 1. Stamp block per sheet (GOST_STAMP lines + TEXT/ATTDEF on TEXT)
    if (includeGostFrame) {
      sheets.forEach((sheet, idx) => {
        const blockName = buildSheetStampBlockName(sheet, idx);
        const geom = buildGostSheetGeometry(sheet, project);
        const sx = geom.stamp.x;
        const syTop = geom.stamp.y;

        w.add(0, 'BLOCK');
        w.add(8, 'GOST_STAMP');
        w.add(2, blockName);
        w.add(70, 2); // Has attribute definitions
        w.add(10, '0.0');
        w.add(20, '0.0');
        w.add(30, '0.0');

        const localY = (absCanvasY: number) => geom.stamp.height - (absCanvasY - syTop);

        w.rect(0, geom.stamp.height, geom.stamp.width, geom.stamp.height, 'GOST_STAMP', {
          color: 7,
          lineweight: stampLw,
        });
        for (const ln of geom.stamp.lines) {
          w.line(
            ln.x1 - sx,
            localY(ln.y1),
            ln.x2 - sx,
            localY(ln.y2),
            'GOST_STAMP',
            { color: ln.thick ? 7 : 8, lineweight: ln.thick ? stampLw : stampThinLw }
          );
        }
        for (const cell of geom.stamp.cells) {
          const cx =
            cell.align === 'center'
              ? cell.x - sx + cell.width / 2
              : cell.x - sx + 5;
          const cy = localY(cell.y + cell.height / 2);
          const fh = (cell.fontSize || 9) * 0.92;
          if (cell.editable && cell.fieldKey) {
            w.attdef(
              cx,
              cy,
              `STAMP_${cell.fieldKey}_${cell.id}`,
              cell.label || cell.fieldKey,
              cell.text,
              fh,
              'TEXT',
              7,
              cell.align === 'center' ? 1 : 0,
              textLw
            );
          } else if (cell.text) {
            w.text(cx, cy, cell.text, fh, 'TEXT', 8, cell.align === 'center' ? 1 : 0, 2, textLw);
          }
        }

        w.add(0, 'ENDBLK');
      });
    }

    // 2. Device blocks with ATTDEF for DESIGNATION, NAME, ARTICLE, RATING
    const sheetSet = new Set(sheets.map((s) => s.id));
    for (const dev of project.devices) {
      if (!sheetSet.has(dev.sheetId)) continue;
      const bName = buildDeviceBlockName(dev);
      const rating = extractDeviceRating(dev);
      w.add(0, 'BLOCK');
      w.add(8, 'DEVICES');
      w.add(2, bName);
      w.add(70, 2);
      w.add(10, '0.0');
      w.add(20, '0.0');
      w.add(30, '0.0');

      drawDeviceSymbolInBlock(w, dev, 0, 0, deviceLw, textLw);
      w.attdef(0, 12, 'DESIGNATION', 'Обозначение (УГО)', dev.designation, 10, 'TEXT', 7, 0, textLw);
      w.attdef(dev.width + 6, -12, 'NAME', 'Наименование', dev.componentName, 7, 'TEXT', 8, 0, textLw);
      w.attdef(dev.width + 6, -24, 'ARTICLE', 'Артикул', dev.article, 7.5, 'TEXT', 8, 0, textLw);
      w.attdef(dev.width + 6, -36, 'RATING', 'Номинал', rating, 7, 'TEXT', 8, 0, textLw);

      w.add(0, 'ENDBLK');
    }
  }

  w.add(0, 'ENDSEC');
}

function drawSheetIntoEntities(
  w: DxfWriter,
  project: E3Project,
  sheet: E3Sheet,
  sheetIdx: number,
  offsetX: number,
  offsetY: number,
  includeGostFrame: boolean,
  editableBlocks: boolean
) {
  const h = sheet.height;
  const toX = (x: number) => offsetX + x;
  const toY = (y: number) => offsetY + (h - y);

  const vs = project.visualSettings;
  const frameLw = toDxfLineweight(vs.frameStrokeWidth ?? 1.6, 30);
  const frameThinLw = Math.max(13, toDxfLineweight((vs.frameStrokeWidth ?? 1.6) * 0.45, 15));
  const stampLw = toDxfLineweight((vs.frameStrokeWidth ?? 1.6) * 0.85, 25);
  const deviceLw = toDxfLineweight(vs.symbolStrokeWidth ?? 1.75, 30);
  const wireLw = toDxfLineweight(vs.wireWidth ?? 2, 35);
  const defaultAnnLw = toDxfLineweight(vs.annotationStrokeWidth ?? 1.4, 25);
  const textLw = 18;

  // Outer sheet boundary
  w.rect(toX(0), toY(0), sheet.width, sheet.height, 'GOST_FRAME', { color: 8, lineweight: frameThinLw });

  if (includeGostFrame) {
    const geom = buildGostSheetGeometry(sheet, project);
    const { frame, archivalBox, stamp } = geom;

    // Inner & outer GOST 2.104 borders
    w.rect(toX(frame.left), toY(frame.top), frame.width, frame.height, 'GOST_FRAME', {
      color: 7,
      lineweight: frameLw,
    });
    w.rect(toX(4), toY(4), sheet.width - 8, sheet.height - 8, 'GOST_FRAME', {
      color: 8,
      lineweight: frameThinLw,
    });

    // Zone ticks (1..6 top, А..Д left)
    const cols = ['1', '2', '3', '4', '5', '6'];
    const spanW = frame.width / cols.length;
    cols.forEach((lbl, i) => {
      const zx = frame.left + i * spanW;
      if (i > 0) {
        w.line(toX(zx), toY(4), toX(zx), toY(frame.top), 'GOST_FRAME', {
          color: 8,
          lineweight: frameThinLw,
        });
      }
      w.text(toX(zx + spanW / 2), toY(11), lbl, 8, 'TEXT', 8, 1, 2, textLw);
    });

    const rows = ['А', 'Б', 'В', 'Г', 'Д'];
    const spanH = frame.height / rows.length;
    rows.forEach((lbl, i) => {
      const zy = frame.top + i * spanH;
      if (i > 0) {
        w.line(toX(4), toY(zy), toX(frame.left), toY(zy), 'GOST_FRAME', {
          color: 8,
          lineweight: frameThinLw,
        });
      }
      w.text(toX(11), toY(zy + spanH / 2), lbl, 8, 'TEXT', 8, 1, 2, textLw);
    });

    // Archival strip along left margin
    if (archivalBox.visible) {
      w.rect(toX(archivalBox.x), toY(archivalBox.y), archivalBox.width, archivalBox.height, 'GOST_FRAME', {
        color: 7,
        lineweight: stampLw,
      });
      let curY = archivalBox.y;
      for (const r of archivalBox.rows) {
        w.line(
          toX(archivalBox.x),
          toY(curY + r.h),
          toX(archivalBox.x + archivalBox.width),
          toY(curY + r.h),
          'GOST_FRAME',
          { color: 7, lineweight: frameThinLw }
        );
        w.text(toX(archivalBox.x + 4), toY(curY + r.h * 0.4), r.label, 6, 'TEXT', 8, 0, 0, textLw);
        if (r.value) {
          w.text(toX(archivalBox.x + 4), toY(curY + r.h * 0.78), r.value, 6.5, 'TEXT', 7, 0, 0, textLw);
        }
        curY += r.h;
      }
    }

    // Stamp block insertion with editable AutoCAD attributes or flat lines
    if (editableBlocks) {
      const blockName = buildSheetStampBlockName(sheet, sheetIdx);
      const stampBaseX = toX(stamp.x);
      const stampBaseY = toY(stamp.y + stamp.height);
      const attribs = stamp.cells
        .filter((c) => c.editable && c.fieldKey)
        .map((c) => ({
          tag: `STAMP_${c.fieldKey}_${c.id}`,
          value: c.text,
          x: toX(c.align === 'center' ? c.x + c.width / 2 : c.x + 5),
          y: toY(c.y + c.height / 2),
          height: (c.fontSize || 9) * 0.92,
          layer: 'TEXT',
          color: 7,
          hAlign: (c.align === 'center' ? 1 : 0) as 0 | 1 | 2,
          lineweight: textLw,
        }));
      w.insertWithAttribs(blockName, stampBaseX, stampBaseY, 'GOST_FRAME', attribs);
    } else {
      w.rect(toX(stamp.x), toY(stamp.y), stamp.width, stamp.height, 'GOST_FRAME', {
        color: 7,
        lineweight: stampLw,
      });
      for (const ln of stamp.lines) {
        w.line(toX(ln.x1), toY(ln.y1), toX(ln.x2), toY(ln.y2), 'GOST_FRAME', {
          color: ln.thick ? 7 : 8,
          lineweight: ln.thick ? stampLw : frameThinLw,
        });
      }
      for (const c of stamp.cells) {
        if (!c.text) continue;
        w.text(
          toX(c.align === 'center' ? c.x + c.width / 2 : c.x + 5),
          toY(c.y + c.height / 2),
          c.text,
          (c.fontSize || 9) * 0.92,
          'TEXT',
          c.editable ? 7 : 8,
          c.align === 'center' ? 1 : 0,
          2,
          textLw
        );
      }
    }
  }

  // Devices on sheet (BLOCK + INSERT + ATTRIB with DESIGNATION, NAME, ARTICLE, RATING)
  const sheetDevices = project.devices.filter((d) => d.sheetId === sheet.id);
  for (const dev of sheetDevices) {
    const rating = extractDeviceRating(dev);
    if (editableBlocks) {
      const bName = buildDeviceBlockName(dev);
      const ins = computeDxfBlockInsertTransform(dev, toX, toY);
      w.insertWithAttribs(
        bName,
        ins.x,
        ins.y,
        'DEVICES',
        [
          {
            tag: 'DESIGNATION',
            value: dev.designation,
            x: toX(dev.x),
            y: toY(dev.y - 12),
            height: 10,
            layer: 'TEXT',
            color: 7,
            lineweight: textLw,
          },
          {
            tag: 'NAME',
            value: dev.componentName,
            x: toX(dev.x + dev.width + 6),
            y: toY(dev.y + 12),
            height: 7,
            layer: 'TEXT',
            color: 8,
            lineweight: textLw,
          },
          {
            tag: 'ARTICLE',
            value: dev.article,
            x: toX(dev.x + dev.width + 6),
            y: toY(dev.y + 24),
            height: 7.5,
            layer: 'TEXT',
            color: 8,
            lineweight: textLw,
          },
          {
            tag: 'RATING',
            value: rating,
            x: toX(dev.x + dev.width + 6),
            y: toY(dev.y + 36),
            height: 7,
            layer: 'TEXT',
            color: 8,
            lineweight: textLw,
          },
        ],
        ins.dxfAngle
      );
    } else {
      drawDeviceSymbolInBlock(w, dev, toX(dev.x), toY(dev.y), deviceLw, textLw);
      w.text(
        toX(dev.x),
        toY(dev.y - 10),
        `${dev.designation} (${dev.article}, ${rating})`,
        9.5,
        'TEXT',
        7,
        0,
        0,
        textLw
      );
    }
  }

  // Wires as editable LWPOLYLINEs on WIRES + junction dots + wire markings on TEXT
  const sheetWires = project.wires.filter((wr) => wr.sheetId === sheet.id);
  for (const wire of sheetWires) {
    const color = signalTypeToAci(wire.signalType);
    const pts = wire.waypoints.map((pt) => ({ x: toX(pt.x), y: toY(pt.y) }));
    w.polyline(pts, 'WIRES', { color, ltype: 'CONTINUOUS', lineweight: wireLw }, false);
    if (wire.waypoints.length >= 2) {
      let mid = wire.waypoints[0];
      let bestLen = -1;
      for (let i = 0; i < wire.waypoints.length - 1; i++) {
        const a = wire.waypoints[i];
        const b = wire.waypoints[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > bestLen) {
          bestLen = len;
          mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
      }
      w.text(toX(mid.x + 4), toY(mid.y - 6), wire.wireNumber, 7.5, 'TEXT', color, 0, 0, textLw);
    }
  }

  const junctionDots = computeWireJunctionDots(sheetWires);
  for (const dot of junctionDots) {
    w.circle(toX(dot.x), toY(dot.y), 2.8, 'WIRES', {
      color: signalTypeToAci(dot.signalType),
      lineweight: wireLw,
    });
  }

  void getAbsolutePinPos;

  // Annotations on ANNOTATIONS (geometry with CONTINUOUS / DASHED / DOT & LINEWEIGHT) + TEXT (text content)
  const sheetAnns = (project.annotations || []).filter((a) => a.sheetId === sheet.id);
  for (const ann of sheetAnns) {
    const annStyle = ann.strokeStyle ?? (ann.kind === 'rect' ? 'dashed' : 'solid');
    const ltype = toDxfLtype(annStyle);
    const annLw = ann.strokeWidth ? toDxfLineweight(ann.strokeWidth, defaultAnnLw) : defaultAnnLw;

    if (ann.kind === 'bom_table' || ann.kind === 'cable_table') {
      const tbl = buildGostTableRenderModel(ann, project);
      w.rect(toX(ann.x), toY(ann.y), tbl.width, tbl.height, 'ANNOTATIONS', {
        color: 7,
        lineweight: 25,
      });
      w.text(toX(ann.x + 8), toY(ann.y + tbl.titleHeight / 2), tbl.title, 9.5, 'TEXT', 7, 0, 2, textLw);
      let curY = ann.y + tbl.titleHeight;
      w.rect(toX(ann.x), toY(curY), tbl.width, tbl.headerHeight, 'ANNOTATIONS', {
        color: 7,
        lineweight: 20,
      });
      let cx = ann.x;
      for (const col of tbl.columns) {
        w.text(
          toX(col.align === 'center' ? cx + col.width / 2 : cx + 5),
          toY(curY + tbl.headerHeight / 2),
          col.label,
          8,
          'TEXT',
          7,
          col.align === 'center' ? 1 : 0,
          2,
          textLw
        );
        cx += col.width;
        if (cx < ann.x + tbl.width - 1) {
          w.line(toX(cx), toY(ann.y + tbl.titleHeight), toX(cx), toY(ann.y + tbl.height), 'ANNOTATIONS', {
            color: 8,
            lineweight: 15,
          });
        }
      }
      curY += tbl.headerHeight;
      for (const row of tbl.rows) {
        w.rect(toX(ann.x), toY(curY), tbl.width, tbl.rowHeight, 'ANNOTATIONS', {
          color: 8,
          lineweight: 15,
        });
        let rx = ann.x;
        row.forEach((val, ci) => {
          const col = tbl.columns[ci];
          w.text(
            toX(col.align === 'center' ? rx + col.width / 2 : rx + 5),
            toY(curY + tbl.rowHeight / 2),
            val,
            7.5,
            'TEXT',
            7,
            col.align === 'center' ? 1 : 0,
            2,
            textLw
          );
          rx += col.width;
        });
        curY += tbl.rowHeight;
      }
    } else if (ann.kind === 'rect') {
      w.rect(toX(ann.x), toY(ann.y), ann.width, ann.height, 'ANNOTATIONS', {
        color: 4,
        ltype,
        lineweight: annLw,
      });
      w.text(toX(ann.x + 8), toY(ann.y + 14), ann.text, ann.fontSize || 11, 'TEXT', 4, 0, 0, textLw);
    } else if (ann.kind === 'callout') {
      w.polyline(
        [
          { x: toX(ann.x), y: toY(ann.y + ann.height) },
          { x: toX(ann.x + 26), y: toY(ann.y + 18) },
          { x: toX(ann.x + 26 + ann.width), y: toY(ann.y + 18) },
        ],
        'ANNOTATIONS',
        { color: 2, ltype, lineweight: annLw },
        false
      );
      w.text(toX(ann.x + 30), toY(ann.y + 12), ann.text, ann.fontSize || 10, 'TEXT', 7, 0, 0, textLw);
    } else {
      if (ann.strokeStyle && ann.strokeStyle !== 'solid') {
        w.rect(toX(ann.x - 4), toY(ann.y - (ann.fontSize || 11) - 2), ann.width, ann.height, 'ANNOTATIONS', {
          color: 7,
          ltype,
          lineweight: annLw,
        });
      }
      w.text(toX(ann.x), toY(ann.y), ann.text, ann.fontSize || 11, 'TEXT', 7, 0, 0, textLw);
    }
  }
}

function drawBomTableInDxf(w: DxfWriter, project: E3Project, originX: number, originYTop: number) {
  const bom = buildBom(project);
  const cols = [45, 110, 320, 140, 140, 60];
  const headers = ['Поз.', 'Обозначение', 'Наименование', 'Артикул', 'Производитель', 'Кол.'];
  const totalW = cols.reduce((a, b) => a + b, 0);
  const rowH = 22;

  w.text(originX, originYTop + 14, `Перечень элементов ПЭ3 — ${project.projectCode}`, 13, 'TEXT', 7, 0, 0, 25);
  let curY = originYTop;
  w.rect(originX, curY, totalW, rowH, 'E3_BOM', { color: 7, lineweight: 25 });
  let cx = originX;
  headers.forEach((h, i) => {
    w.text(cx + 6, curY - rowH / 2, h, 8.5, 'TEXT', 7, 0, 2, 18);
    cx += cols[i];
    if (i < cols.length - 1) {
      w.line(cx, curY, cx, curY - rowH * (bom.length + 1), 'E3_BOM', { color: 8, lineweight: 18 });
    }
  });
  curY -= rowH;

  for (const row of bom) {
    w.rect(originX, curY, totalW, rowH, 'E3_BOM', { color: 8, lineweight: 18 });
    const vals = [
      String(row.pos),
      row.designationText,
      row.componentName,
      row.article,
      row.manufacturer,
      `${row.quantity} ${row.unit}`,
    ];
    let rx = originX;
    vals.forEach((v, i) => {
      w.text(rx + 6, curY - rowH / 2, v, 8, 'TEXT', 7, 0, 2, 18);
      rx += cols[i];
    });
    curY -= rowH;
  }
}

export function exportSheetsToDxf(project: E3Project, options: DxfExportOptions = {}): string {
  const selectedIds = options.sheetIds?.length ? new Set(options.sheetIds) : null;
  const targetSheets = selectedIds
    ? project.sheets.filter((s) => selectedIds.has(s.id))
    : project.sheets;
  const sheets = targetSheets.length > 0 ? targetSheets : project.sheets.slice(0, 1);
  if (sheets.length === 0) return '';

  const includeGostFrame = options.includeGostFrame !== false;
  const editableBlocks = options.editableBlocks !== false;

  const w = createDxfWriter();
  writeHeaderAndTables(w, project, project.layers);
  writeBlocksSection(w, project, sheets, editableBlocks, includeGostFrame);

  w.add(0, 'SECTION');
  w.add(2, 'ENTITIES');

  let cursorX = 0;
  sheets.forEach((sheet, idx) => {
    drawSheetIntoEntities(w, project, sheet, idx, cursorX, 0, includeGostFrame, editableBlocks);
    cursorX += sheet.width + 160;
  });

  if (options.includeBom) {
    const bomY = sheets[0]?.height || 920;
    drawBomTableInDxf(w, project, cursorX, bomY);
  }

  w.add(0, 'ENDSEC');
  w.add(0, 'EOF');
  return w.lines.join('\n');
}

export async function exportProjectToDxfZip(
  project: E3Project,
  options: DxfExportOptions = {}
): Promise<Uint8Array> {
  const selectedIds = options.sheetIds?.length ? new Set(options.sheetIds) : null;
  const sheets = (
    selectedIds ? project.sheets.filter((s) => selectedIds.has(s.id)) : project.sheets
  );
  const targetSheets = sheets.length > 0 ? sheets : project.sheets.slice(0, 1);

  const zip = new JSZip();
  for (const sheet of targetSheets) {
    const safeName = sheet.name.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 48);
    const filename = `${project.projectCode}_L${String(sheet.number).padStart(2, '0')}_${safeName}.dxf`;
    const dxf = exportSheetsToDxf(project, {
      ...options,
      sheetIds: [sheet.id],
      includeBom: false,
    });
    zip.file(filename, dxf);
  }

  const combined = exportSheetsToDxf(project, options);
  zip.file(`${project.projectCode}_ALL_SHEETS.dxf`, combined);
  zip.file(
    'README_AutoCAD.txt',
    [
      `Пакетная публикация AutoCAD DXF (AC1021 UTF-8)`,
      `Проект: ${project.name} (${project.projectCode}, rev ${project.revision})`,
      `Листов в пакете: ${targetSheets.length}`,
      `Основные слои: GOST_FRAME, DEVICES, WIRES, ANNOTATIONS, TEXT (и совместимые E3_*)`,
      `Типы линий и веса: CONTINUOUS, DASHED, DOT; LINEWEIGHT (370) + $LWDISPLAY=1`,
      `Блоки и атрибуты: Штампы ГОСТ и УГО устройств экспортированы как BLOCK + INSERT с ATTRIB (DESIGNATION, NAME, ARTICLE, RATING).`,
    ].join('\r\n')
  );

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
