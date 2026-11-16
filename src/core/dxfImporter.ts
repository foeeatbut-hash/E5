import type { CustomSymbolShape, CustomSymbolStrokeStyle } from './e3Types.ts';
import { snapSymbolCoord } from './symbolDesigner.ts';

export interface DxfImportOptions {
  targetMaxSize?: number;
  targetMinSize?: number;
  padding?: number;
  gridStep?: number;
  snapToGrid?: boolean;
}

export interface DxfImportStats {
  totalEntities: number;
  importedShapes: number;
  skippedEntities: number;
  layers: string[];
  sourceBounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface DxfImportResult {
  shapes: CustomSymbolShape[];
  width: number;
  height: number;
  stats: DxfImportStats;
  warnings: string[];
}

type DxfPair = { code: number; value: string };

type RawDxfEntity =
  | {
      kind: 'LINE';
      layer: string;
      aci?: number;
      ltype?: string;
      lw?: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }
  | {
      kind: 'POLYLINE';
      layer: string;
      aci?: number;
      ltype?: string;
      lw?: number;
      points: Array<{ x: number; y: number }>;
      closed: boolean;
    }
  | {
      kind: 'CIRCLE';
      layer: string;
      aci?: number;
      ltype?: string;
      lw?: number;
      cx: number;
      cy: number;
      r: number;
    }
  | {
      kind: 'ARC';
      layer: string;
      aci?: number;
      ltype?: string;
      lw?: number;
      cx: number;
      cy: number;
      r: number;
      startAngle: number;
      endAngle: number;
    }
  | {
      kind: 'TEXT';
      layer: string;
      aci?: number;
      x: number;
      y: number;
      height: number;
      text: string;
      hAlign: number;
    };

function aciToHex(aci?: number): string | undefined {
  switch (aci) {
    case 1:
      return '#dc2626';
    case 2:
      return '#d97706';
    case 3:
      return '#15803d';
    case 4:
      return '#0284c7';
    case 5:
      return '#4f46e5';
    case 6:
      return '#9333ea';
    case 8:
    case 9:
      return '#64748b';
    default:
      return undefined;
  }
}

function ltypeToStrokeStyle(ltype?: string): CustomSymbolStrokeStyle | undefined {
  if (!ltype) return undefined;
  const u = ltype.trim().toUpperCase();
  if (u.includes('DASHDOT') || u.includes('CENTER')) return 'dashdot';
  if (u.includes('DASH') || u.includes('HIDDEN')) return 'dashed';
  if (u.includes('DOT')) return 'dotted';
  return 'solid';
}

function dxfLwToPx(lw?: number): number {
  if (typeof lw !== 'number' || !Number.isFinite(lw) || lw <= 0) return 1.8;
  return Math.max(1, Math.min(3.2, Number((lw / 18).toFixed(1))));
}

function cleanDxfText(raw: string): string {
  return raw
    .replace(/\\P/gi, ' ')
    .replace(/\{\\[^;]*;([^}]*)\}/g, '$1')
    .replace(/\\[A-Za-z][^;]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/%%c/gi, 'Ø')
    .replace(/%%d/gi, '°')
    .replace(/%%p/gi, '±')
    .trim();
}

function tokenizeDxf(dxfText: string): DxfPair[] {
  const lines = dxfText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const pairs: DxfPair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeStr = lines[i].trim();
    if (codeStr === '' && lines[i + 1].trim() === '') continue;
    const code = Number.parseInt(codeStr, 10);
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
}

function parseEntityPairs(
  entityPairs: DxfPair[],
  collectSkip: (type: string) => void
): RawDxfEntity[] {
  const out: RawDxfEntity[] = [];
  let i = 0;

  while (i < entityPairs.length) {
    const cur = entityPairs[i];
    if (cur.code !== 0) {
      i++;
      continue;
    }
    const entityType = cur.value.toUpperCase();
    i++;

    const props: DxfPair[] = [];
    while (i < entityPairs.length && entityPairs[i].code !== 0) {
      props.push(entityPairs[i]);
      i++;
    }

    const firstStr = (code: number): string | undefined =>
      props.find((p) => p.code === code)?.value;
    const firstNum = (code: number, fallback = 0): number => {
      const p = props.find((x) => x.code === code);
      if (!p) return fallback;
      const n = Number.parseFloat(p.value);
      return Number.isFinite(n) ? n : fallback;
    };
    const optNum = (code: number): number | undefined => {
      const p = props.find((x) => x.code === code);
      if (!p) return undefined;
      const n = Number.parseFloat(p.value);
      return Number.isFinite(n) ? n : undefined;
    };

    const layer = firstStr(8) || '0';
    const aci = optNum(62);
    const ltype = firstStr(6);
    const lw = optNum(370);

    if (entityType === 'LINE') {
      out.push({
        kind: 'LINE',
        layer,
        aci,
        ltype,
        lw,
        x1: firstNum(10),
        y1: firstNum(20),
        x2: firstNum(11),
        y2: firstNum(21),
      });
      continue;
    }

    if (entityType === 'LWPOLYLINE') {
      const points: Array<{ x: number; y: number }> = [];
      let pendingX: number | null = null;
      for (const p of props) {
        if (p.code === 10) {
          const x = Number.parseFloat(p.value);
          if (Number.isFinite(x)) pendingX = x;
        } else if (p.code === 20 && pendingX !== null) {
          const y = Number.parseFloat(p.value);
          if (Number.isFinite(y)) points.push({ x: pendingX, y });
          pendingX = null;
        }
      }
      const flags = firstNum(70, 0);
      if (points.length >= 2) {
        out.push({
          kind: 'POLYLINE',
          layer,
          aci,
          ltype,
          lw,
          points,
          closed: (flags & 1) === 1,
        });
      }
      continue;
    }

    if (entityType === 'POLYLINE') {
      const flags = firstNum(70, 0);
      const points: Array<{ x: number; y: number }> = [];
      while (i < entityPairs.length) {
        if (entityPairs[i].code === 0) {
          const subType = entityPairs[i].value.toUpperCase();
          i++;
          if (subType === 'SEQEND') {
            while (i < entityPairs.length && entityPairs[i].code !== 0) i++;
            break;
          }
          if (subType === 'VERTEX') {
            let vx: number | undefined;
            let vy: number | undefined;
            while (i < entityPairs.length && entityPairs[i].code !== 0) {
              if (entityPairs[i].code === 10) vx = Number.parseFloat(entityPairs[i].value);
              if (entityPairs[i].code === 20) vy = Number.parseFloat(entityPairs[i].value);
              i++;
            }
            if (vx !== undefined && vy !== undefined && Number.isFinite(vx) && Number.isFinite(vy)) {
              points.push({ x: vx, y: vy });
            }
            continue;
          }
          // unexpected entity terminates polyline
          i--;
          break;
        }
        i++;
      }
      if (points.length >= 2) {
        out.push({
          kind: 'POLYLINE',
          layer,
          aci,
          ltype,
          lw,
          points,
          closed: (flags & 1) === 1,
        });
      }
      continue;
    }

    if (entityType === 'CIRCLE') {
      const r = Math.abs(firstNum(40, 10));
      if (r > 0) {
        out.push({
          kind: 'CIRCLE',
          layer,
          aci,
          ltype,
          lw,
          cx: firstNum(10),
          cy: firstNum(20),
          r,
        });
      }
      continue;
    }

    if (entityType === 'ARC') {
      const r = Math.abs(firstNum(40, 10));
      if (r > 0) {
        out.push({
          kind: 'ARC',
          layer,
          aci,
          ltype,
          lw,
          cx: firstNum(10),
          cy: firstNum(20),
          r,
          startAngle: firstNum(50, 0),
          endAngle: firstNum(51, 180),
        });
      }
      continue;
    }

    if (entityType === 'TEXT' || entityType === 'MTEXT') {
      const textParts = props
        .filter((p) => p.code === 3 || p.code === 1)
        .map((p) => p.value)
        .join('');
      const cleaned = cleanDxfText(textParts);
      if (cleaned) {
        out.push({
          kind: 'TEXT',
          layer,
          aci,
          x: firstNum(11, firstNum(10)),
          y: firstNum(21, firstNum(20)),
          height: firstNum(40, 8),
          text: cleaned,
          hAlign: firstNum(72, 0),
        });
      }
      continue;
    }

    if (entityType !== 'SEQEND' && entityType !== 'VERTEX' && entityType !== 'EOF') {
      collectSkip(entityType);
    }
  }

  return out;
}

export function parseDxfToSymbolPrimitives(
  dxfText: string,
  options: DxfImportOptions = {}
): DxfImportResult {
  if (!dxfText || !dxfText.trim()) {
    throw new Error('DXF-файл пуст.');
  }

  const pairs = tokenizeDxf(dxfText);
  if (pairs.length < 4) {
    throw new Error('Некорректный формат DXF (не найдены пары код/значение).');
  }

  // Extract ENTITIES section pairs (fallback to BLOCKS or whole stream if ENTITIES absent)
  const entitiesPairs: DxfPair[] = [];
  const blocksPairs: DxfPair[] = [];
  let currentSection = '';
  let hasEntitiesSection = false;

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (p.code === 0 && p.value.toUpperCase() === 'SECTION') {
      const next = pairs[i + 1];
      if (next && next.code === 2) {
        currentSection = next.value.toUpperCase();
        if (currentSection === 'ENTITIES') hasEntitiesSection = true;
        i++;
        continue;
      }
    }
    if (p.code === 0 && p.value.toUpperCase() === 'ENDSEC') {
      currentSection = '';
      continue;
    }
    if (currentSection === 'ENTITIES') {
      entitiesPairs.push(p);
    } else if (currentSection === 'BLOCKS') {
      blocksPairs.push(p);
    }
  }

  const skippedTypes = new Map<string, number>();
  const collectSkip = (t: string) => {
    skippedTypes.set(t, (skippedTypes.get(t) || 0) + 1);
  };

  let rawEntities = parseEntityPairs(
    hasEntitiesSection ? entitiesPairs : pairs,
    collectSkip
  );
  if (rawEntities.length === 0 && blocksPairs.length > 0) {
    rawEntities = parseEntityPairs(blocksPairs, collectSkip);
  }

  if (rawEntities.length === 0) {
    throw new Error(
      'В секции ENTITIES не обнаружено поддерживаемых примитивов (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, TEXT).'
    );
  }

  // Compute source CAD bounding box (Y-up)
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePt = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const layerSet = new Set<string>();
  for (const ent of rawEntities) {
    layerSet.add(ent.layer);
    if (ent.kind === 'LINE') {
      includePt(ent.x1, ent.y1);
      includePt(ent.x2, ent.y2);
    } else if (ent.kind === 'POLYLINE') {
      for (const pt of ent.points) includePt(pt.x, pt.y);
    } else if (ent.kind === 'CIRCLE' || ent.kind === 'ARC') {
      includePt(ent.cx - ent.r, ent.cy - ent.r);
      includePt(ent.cx + ent.r, ent.cy + ent.r);
    } else if (ent.kind === 'TEXT') {
      includePt(ent.x, ent.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new Error('Не удалось определить габариты геометрии DXF.');
  }

  const rawW = Math.max(1e-3, maxX - minX);
  const rawH = Math.max(1e-3, maxY - minY);
  const targetMax = options.targetMaxSize ?? 140;
  const targetMin = options.targetMinSize ?? 60;
  const pad = options.padding ?? 10;
  const gridStep = Math.max(1, options.gridStep ?? 5);
  const useSnap = options.snapToGrid !== false;

  const maxSpan = Math.max(rawW, rawH);
  let scale = 1;
  const usableMax = Math.max(40, targetMax - pad * 2);
  const usableMin = Math.max(20, targetMin - pad * 2);
  if (maxSpan > usableMax) {
    scale = usableMax / maxSpan;
  } else if (maxSpan < usableMin) {
    scale = usableMin / maxSpan;
  }

  const snapCoord = (v: number): number => {
    if (useSnap) return snapSymbolCoord(v, gridStep);
    return Math.round(v * 10) / 10;
  };

  const mapX = (cadX: number) => snapCoord(pad + (cadX - minX) * scale);
  // Flip CAD Y-up into SVG Y-down
  const mapY = (cadY: number) => snapCoord(pad + (maxY - cadY) * scale);

  const shapes: CustomSymbolShape[] = [];
  let seq = 1;
  const nextId = () => `dxf-${seq++}`;

  for (const ent of rawEntities) {
    const strokeColor = aciToHex(ent.aci);
    if (ent.kind === 'LINE') {
      const x1 = mapX(ent.x1);
      const y1 = mapY(ent.y1);
      const x2 = mapX(ent.x2);
      const y2 = mapY(ent.y2);
      if (Math.hypot(x2 - x1, y2 - y1) < 0.5) continue;
      shapes.push({
        id: nextId(),
        kind: 'line',
        x1,
        y1,
        x2,
        y2,
        strokeColor,
        strokeStyle: ltypeToStrokeStyle(ent.ltype),
        strokeWidth: dxfLwToPx(ent.lw),
      });
    } else if (ent.kind === 'POLYLINE') {
      const pts = ent.points.map((pt) => ({ x: mapX(pt.x), y: mapY(pt.y) }));
      if (pts.length < 2) continue;
      // Recognize exact 4-corner axis-aligned closed rectangles into 'rect' for crisp CAD editing
      if (ent.closed && pts.length === 4) {
        const xs = Array.from(new Set(pts.map((p) => p.x))).sort((a, b) => a - b);
        const ys = Array.from(new Set(pts.map((p) => p.y))).sort((a, b) => a - b);
        if (xs.length === 2 && ys.length === 2) {
          shapes.push({
            id: nextId(),
            kind: 'rect',
            x: xs[0],
            y: ys[0],
            width: Math.max(4, xs[1] - xs[0]),
            height: Math.max(4, ys[1] - ys[0]),
            filled: false,
            strokeColor,
            strokeStyle: ltypeToStrokeStyle(ent.ltype),
            strokeWidth: dxfLwToPx(ent.lw),
          });
          continue;
        }
      }
      shapes.push({
        id: nextId(),
        kind: 'polyline',
        points: pts,
        closed: ent.closed,
        filled: false,
        strokeColor,
        strokeStyle: ltypeToStrokeStyle(ent.ltype),
        strokeWidth: dxfLwToPx(ent.lw),
      });
    } else if (ent.kind === 'CIRCLE') {
      const r = Math.max(2, Math.round(ent.r * scale * 10) / 10);
      shapes.push({
        id: nextId(),
        kind: 'circle',
        cx: mapX(ent.cx),
        cy: mapY(ent.cy),
        r,
        filled: false,
        strokeColor,
        strokeStyle: ltypeToStrokeStyle(ent.ltype),
        strokeWidth: dxfLwToPx(ent.lw),
      });
    } else if (ent.kind === 'ARC') {
      const r = Math.max(2, Math.round(ent.r * scale * 10) / 10);
      // DXF Y-up CCW [startAngle -> endAngle] mirrors to SVG Y-down CW [-endAngle -> -startAngle]
      shapes.push({
        id: nextId(),
        kind: 'arc',
        cx: mapX(ent.cx),
        cy: mapY(ent.cy),
        r,
        startAngle: Math.round(-ent.endAngle * 10) / 10 || 0,
        endAngle: Math.round(-ent.startAngle * 10) / 10 || 0,
        strokeColor,
        strokeStyle: ltypeToStrokeStyle(ent.ltype),
        strokeWidth: dxfLwToPx(ent.lw),
      });
    } else if (ent.kind === 'TEXT') {
      const fontSize = Math.max(7, Math.min(20, Math.round(ent.height * scale)));
      shapes.push({
        id: nextId(),
        kind: 'text',
        x: mapX(ent.x),
        y: mapY(ent.y),
        text: ent.text,
        fontSize,
        align: ent.hAlign === 2 ? 'right' : ent.hAlign === 1 ? 'center' : 'left',
        strokeColor,
      });
    }
  }

  const width = Math.max(40, Math.min(400, Math.ceil((rawW * scale + pad * 2) / 10) * 10));
  const height = Math.max(40, Math.min(400, Math.ceil((rawH * scale + pad * 2) / 10) * 10));

  const warnings: string[] = [];
  if (skippedTypes.size > 0) {
    const desc = Array.from(skippedTypes.entries())
      .map(([k, v]) => `${k} (${v})`)
      .join(', ');
    warnings.push(`Пропущены неподдерживаемые сущности DXF: ${desc}`);
  }

  return {
    shapes,
    width,
    height,
    stats: {
      totalEntities: rawEntities.length,
      importedShapes: shapes.length,
      skippedEntities: Array.from(skippedTypes.values()).reduce((a, b) => a + b, 0),
      layers: Array.from(layerSet),
      sourceBounds: { minX, minY, maxX, maxY },
    },
    warnings,
  };
}
