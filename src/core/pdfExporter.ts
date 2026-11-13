import { buildBom, buildCableJournal } from './e3Engine.ts';
import type { E3Device, E3Project, E3Sheet } from './e3Types.ts';
import { buildGostSheetGeometry } from './gostFrame.ts';

export interface PdfExportOptions {
  sheetIds?: string[];
  includeBom?: boolean;
  includeCables?: boolean;
  includeGostFrame?: boolean;
  regularFontBytes?: Uint8Array;
  boldFontBytes?: Uint8Array;
}

interface ParsedTtfFont {
  bytes: Uint8Array;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: [number, number, number, number];
  advanceWidths: number[]; // glyphId -> normalized width in 1/1000 em
  glyphMap: Map<number, number>; // unicode codepoint -> glyphId
}

function readU16(b: Uint8Array, off: number): number {
  return (b[off] << 8) | b[off + 1];
}

function readI16(b: Uint8Array, off: number): number {
  const v = readU16(b, off);
  return v >= 0x8000 ? v - 0x10000 : v;
}

function readU32(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

export function parseTrueTypeFont(bytes: Uint8Array): ParsedTtfFont {
  const numTables = readU16(bytes, 4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const recOff = 12 + i * 16;
    const tag = String.fromCharCode(bytes[recOff], bytes[recOff + 1], bytes[recOff + 2], bytes[recOff + 3]);
    tables.set(tag, {
      offset: readU32(bytes, recOff + 8),
      length: readU32(bytes, recOff + 12),
    });
  }

  const head = tables.get('head');
  const hhea = tables.get('hhea');
  const maxp = tables.get('maxp');
  const hmtx = tables.get('hmtx');
  const cmap = tables.get('cmap');
  if (!head || !hhea || !maxp || !hmtx || !cmap) {
    throw new Error('TTF font is missing required OpenType tables.');
  }

  const unitsPerEm = readU16(bytes, head.offset + 18) || 1000;
  const xMin = Math.round((readI16(bytes, head.offset + 36) * 1000) / unitsPerEm);
  const yMin = Math.round((readI16(bytes, head.offset + 38) * 1000) / unitsPerEm);
  const xMax = Math.round((readI16(bytes, head.offset + 40) * 1000) / unitsPerEm);
  const yMax = Math.round((readI16(bytes, head.offset + 42) * 1000) / unitsPerEm);

  const ascent = Math.round((readI16(bytes, hhea.offset + 4) * 1000) / unitsPerEm);
  const descent = Math.round((readI16(bytes, hhea.offset + 6) * 1000) / unitsPerEm);
  const numberOfHMetrics = readU16(bytes, hhea.offset + 34);
  const numGlyphs = readU16(bytes, maxp.offset + 4);

  const advanceWidths: number[] = new Array(numGlyphs).fill(500);
  let lastAdvance = 500;
  for (let gid = 0; gid < numGlyphs; gid++) {
    if (gid < numberOfHMetrics) {
      const aw = readU16(bytes, hmtx.offset + gid * 4);
      lastAdvance = Math.round((aw * 1000) / unitsPerEm);
    }
    advanceWidths[gid] = lastAdvance;
  }

  // Parse cmap format 4 (Windows Unicode BMP)
  const glyphMap = new Map<number, number>();
  const numSubtables = readU16(bytes, cmap.offset + 2);
  let subOffset = 0;
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmap.offset + 4 + i * 8;
    const platformId = readU16(bytes, rec);
    const encodingId = readU16(bytes, rec + 2);
    const relOff = readU32(bytes, rec + 4);
    const absOff = cmap.offset + relOff;
    const fmt = readU16(bytes, absOff);
    if (fmt === 4 && ((platformId === 3 && encodingId === 1) || platformId === 0)) {
      subOffset = absOff;
      if (platformId === 3 && encodingId === 1) break;
    }
  }

  if (subOffset > 0) {
    const segCountX2 = readU16(bytes, subOffset + 6);
    const segCount = segCountX2 / 2;
    const endCodesOff = subOffset + 14;
    const startCodesOff = endCodesOff + segCountX2 + 2;
    const idDeltaOff = startCodesOff + segCountX2;
    const idRangeOffsetOff = idDeltaOff + segCountX2;

    for (let i = 0; i < segCount; i++) {
      const endCode = readU16(bytes, endCodesOff + i * 2);
      const startCode = readU16(bytes, startCodesOff + i * 2);
      if (startCode === 0xffff && endCode === 0xffff) break;
      const idDelta = readI16(bytes, idDeltaOff + i * 2);
      const rangeOffsetPos = idRangeOffsetOff + i * 2;
      const rangeOffset = readU16(bytes, rangeOffsetPos);

      for (let code = startCode; code <= endCode; code++) {
        let gid = 0;
        if (rangeOffset === 0) {
          gid = (code + idDelta) & 0xffff;
        } else {
          const ptr = rangeOffsetPos + rangeOffset + (code - startCode) * 2;
          if (ptr + 1 < bytes.length) {
            const rawGid = readU16(bytes, ptr);
            gid = rawGid !== 0 ? (rawGid + idDelta) & 0xffff : 0;
          }
        }
        if (gid > 0) {
          glyphMap.set(code, gid);
        }
      }
    }
  }

  return {
    bytes,
    unitsPerEm,
    ascent,
    descent,
    bbox: [xMin, yMin, xMax, yMax],
    advanceWidths,
    glyphMap,
  };
}

function hexColorToRgb01(hex?: string): [number, number, number] {
  if (!hex || !hex.startsWith('#')) return [0.1, 0.14, 0.2];
  const clean = hex.slice(1);
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [r, g, b];
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) return [r, g, b];
  }
  return [0.1, 0.14, 0.2];
}

function pageSizePtsForFormat(format: E3Sheet['format']): [number, number] {
  if (format === 'A4') return [841.89, 595.28];
  if (format === 'A2') return [1683.78, 1190.55];
  if (format === 'A1') return [2383.94, 1683.78];
  return [1190.55, 841.89]; // A3 Landscape
}

function asciiEscape(str: string): string {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e]/g, '?');
}

interface PdfContext {
  fontRegular: ParsedTtfFont | null;
  fontBold: ParsedTtfFont | null;
  usedRegularGids: Map<number, number>; // gid -> unicode
  usedBoldGids: Map<number, number>;
}

function measureTextWidthPt(text: string, fontSizePt: number, font: ParsedTtfFont | null): number {
  if (!font) return text.length * fontSizePt * 0.52;
  let sum = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const gid = font.glyphMap.get(code) ?? font.glyphMap.get(0x3f) ?? 0;
    sum += font.advanceWidths[gid] ?? 500;
  }
  return (sum / 1000) * fontSizePt;
}

function encodePdfTextHex(
  text: string,
  font: ParsedTtfFont | null,
  usedMap: Map<number, number>
): string {
  if (!font) {
    return `(${asciiEscape(text)})`;
  }
  let hex = '<';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const gid = font.glyphMap.get(code) ?? font.glyphMap.get(0x3f) ?? 0;
    if (!usedMap.has(gid)) usedMap.set(gid, code);
    hex += gid.toString(16).padStart(4, '0').toUpperCase();
  }
  hex += '>';
  return hex;
}

function buildToUnicodeCMap(usedMap: Map<number, number>): string {
  const entries = Array.from(usedMap.entries()).sort((a, b) => a[0] - b[0]);
  const lines: string[] = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <FFFF>',
    'endcodespacerange',
  ];

  // Chunk into groups of max 100 per PDF CMap spec
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    lines.push(`${chunk.length} beginbfchar`);
    for (const [gid, uni] of chunk) {
      const gHex = gid.toString(16).padStart(4, '0').toUpperCase();
      const uHex = uni.toString(16).padStart(4, '0').toUpperCase();
      lines.push(`<${gHex}> <${uHex}>`);
    }
    lines.push('endbfchar');
  }

  lines.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
  return lines.join('\n');
}

function buildWidthArray(usedMap: Map<number, number>, font: ParsedTtfFont): string {
  const gids = Array.from(usedMap.keys()).sort((a, b) => a - b);
  return '[' + gids.map((g) => `${g} [${font.advanceWidths[g] ?? 500}]`).join(' ') + ']';
}

function drawPdfDevice(
  ops: string[],
  dev: E3Device,
  toX: (x: number) => number,
  toY: (y: number) => number,
  s: number,
  symbolStrokeWidth: number,
  drawText: (x: number, y: number, txt: string, size: number, bold?: boolean, align?: 'left' | 'center', rgb?: [number, number, number]) => void
) {
  const x = toX(dev.x);
  const yTop = toY(dev.y);
  const w = dev.width * s;
  const h = dev.height * s;
  const yBot = yTop - h;
  const pdfSw = Math.max(0.35, symbolStrokeWidth * 0.52).toFixed(2);
  const pdfThinSw = Math.max(0.3, symbolStrokeWidth * 0.42).toFixed(2);

  ops.push(`0.12 0.16 0.24 RG 0.98 0.99 1 rg ${pdfSw} w`);
  ops.push(`${x.toFixed(2)} ${yBot.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B`);

  // Category detail symbol
  if (dev.category === 'motor' || dev.category === 'fan' || dev.category === 'pump') {
    const cx = x + w / 2;
    const cy = yBot + h / 2;
    const r = Math.min(w, h) * 0.35;
    const k = r * 0.5523;
    ops.push(`0.12 0.16 0.24 RG ${pdfThinSw} w`);
    ops.push(
      `${(cx + r).toFixed(2)} ${cy.toFixed(2)} m ` +
        `${(cx + r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx + k).toFixed(2)} ${(cy + r).toFixed(2)} ${cx.toFixed(2)} ${(cy + r).toFixed(2)} c ` +
        `${(cx - k).toFixed(2)} ${(cy + r).toFixed(2)} ${(cx - r).toFixed(2)} ${(cy + k).toFixed(2)} ${(cx - r).toFixed(2)} ${cy.toFixed(2)} c ` +
        `${(cx - r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx - k).toFixed(2)} ${(cy - r).toFixed(2)} ${cx.toFixed(2)} ${(cy - r).toFixed(2)} c ` +
        `${(cx + k).toFixed(2)} ${(cy - r).toFixed(2)} ${(cx + r).toFixed(2)} ${(cy - k).toFixed(2)} ${(cx + r).toFixed(2)} ${cy.toFixed(2)} c S`
    );
    drawText(cx, cy - 3 * s, dev.category === 'motor' ? 'M3~' : 'M', Math.max(7, 10 * s), true, 'center');
  } else if (dev.category === 'breaker') {
    const poles = dev.pins.filter((p) => p.direction === 'top').length || 1;
    const step = w / (poles + 1);
    ops.push(`0.12 0.16 0.24 RG ${pdfSw} w`);
    for (let i = 1; i <= poles; i++) {
      const px = x + i * step;
      ops.push(`${px.toFixed(2)} ${(yTop - 8 * s).toFixed(2)} m ${px.toFixed(2)} ${(yTop - 32 * s).toFixed(2)} l ${(px - 8 * s).toFixed(2)} ${(yTop - 60 * s).toFixed(2)} l S`);
      ops.push(`${px.toFixed(2)} ${(yTop - 64 * s).toFixed(2)} m ${px.toFixed(2)} ${(yBot + 8 * s).toFixed(2)} l S`);
    }
  }

  // Label above device
  drawText(x, yTop + 4 * s, dev.designation, Math.max(6.5, 9.5 * s), true, 'left', [0.06, 0.09, 0.16]);
  drawText(x + w + 4 * s, yTop - 11 * s, dev.article, Math.max(5.5, 7.5 * s), false, 'left', [0.35, 0.4, 0.48]);

  // Pins
  for (const pin of dev.pins) {
    const px = toX(dev.x + pin.dx);
    const py = toY(dev.y + pin.dy);
    ops.push('0.2 0.3 0.45 rg');
    ops.push(`${(px - 1.5).toFixed(2)} ${(py - 1.5).toFixed(2)} 3 3 re f`);
  }
}

function renderSheetPageContent(
  sheet: E3Sheet,
  project: E3Project,
  ctx: PdfContext,
  includeGostFrame: boolean
): { widthPt: number; heightPt: number; stream: string } {
  const [pageW, pageH] = pageSizePtsForFormat(sheet.format);
  const marginPt = 14;
  const availW = pageW - marginPt * 2;
  const availH = pageH - marginPt * 2;
  const scale = Math.min(availW / sheet.width, availH / sheet.height);
  const ox = (pageW - sheet.width * scale) / 2;
  const oy = (pageH - sheet.height * scale) / 2;

  const toX = (cx: number) => ox + cx * scale;
  // Canvas Y increases downward; PDF Y increases upward
  const toY = (cy: number) => oy + (sheet.height - cy) * scale;

  const ops: string[] = [];
  // White sheet background + thin sheet edge
  ops.push('1 1 1 rg 0.78 0.82 0.88 RG 0.5 w');
  ops.push(`${toX(0).toFixed(2)} ${toY(sheet.height).toFixed(2)} ${(sheet.width * scale).toFixed(2)} ${(sheet.height * scale).toFixed(2)} re B`);

  const drawText = (
    px: number,
    py: number,
    txt: string,
    fontPt: number,
    bold = false,
    align: 'left' | 'center' = 'left',
    rgb: [number, number, number] = [0.08, 0.1, 0.14],
    maxWidthPt?: number
  ) => {
    const clean = String(txt || '').replace(/\r?\n/g, ' ').trim();
    if (!clean) return;
    const font = bold && ctx.fontBold ? ctx.fontBold : ctx.fontRegular;
    const usedMap = bold && ctx.fontBold ? ctx.usedBoldGids : ctx.usedRegularGids;
    const fontKey = bold && ctx.fontBold ? '/F2' : '/F1';

    let finalSize = fontPt;
    if (maxWidthPt && maxWidthPt > 4) {
      const measured = measureTextWidthPt(clean, finalSize, font);
      if (measured > maxWidthPt) {
        finalSize = Math.max(4.5, finalSize * (maxWidthPt / measured));
      }
    }

    const totalW = measureTextWidthPt(clean, finalSize, font);
    const drawX = align === 'center' ? px - totalW / 2 : px;

    ops.push('BT');
    ops.push(`${rgb[0].toFixed(2)} ${rgb[1].toFixed(2)} ${rgb[2].toFixed(2)} rg`);
    ops.push(`${fontKey} ${finalSize.toFixed(2)} Tf`);
    ops.push(`1 0 0 1 ${drawX.toFixed(2)} ${py.toFixed(2)} Tm`);
    ops.push(`${encodePdfTextHex(clean, font, usedMap)} Tj`);
    ops.push('ET');
  };

  const frameBase = Math.max(0.5, project.visualSettings.frameStrokeWidth ?? 1.6);
  const pdfFrameW = (frameBase * 0.68).toFixed(2);
  const pdfFrameThinW = Math.max(0.25, frameBase * 0.28).toFixed(2);
  const pdfStampThickW = Math.max(0.4, frameBase * 0.56).toFixed(2);
  const pdfStampThinW = Math.max(0.25, frameBase * 0.28).toFixed(2);

  if (includeGostFrame) {
    const geom = buildGostSheetGeometry(sheet, project);
    const { frame, archivalBox, stamp } = geom;

    // Inner & outer GOST border
    ops.push(`0.1 0.12 0.16 RG ${pdfFrameW} w`);
    ops.push(`${toX(frame.left).toFixed(2)} ${toY(frame.bottom).toFixed(2)} ${(frame.width * scale).toFixed(2)} ${(frame.height * scale).toFixed(2)} re S`);
    ops.push(`0.45 0.5 0.58 RG ${pdfFrameThinW} w`);
    ops.push(`${toX(4).toFixed(2)} ${toY(sheet.height - 4).toFixed(2)} ${((sheet.width - 8) * scale).toFixed(2)} ${((sheet.height - 8) * scale).toFixed(2)} re S`);

    // Zone headers
    const cols = ['1', '2', '3', '4', '5', '6'];
    const spanW = frame.width / cols.length;
    cols.forEach((lbl, i) => {
      const zx = frame.left + i * spanW;
      if (i > 0) {
        ops.push(`${toX(zx).toFixed(2)} ${toY(4).toFixed(2)} m ${toX(zx).toFixed(2)} ${toY(frame.top).toFixed(2)} l S`);
      }
      drawText(toX(zx + spanW / 2), toY(13), lbl, Math.max(5.5, 7.5 * scale), false, 'center', [0.35, 0.4, 0.48]);
    });

    const rows = ['А', 'Б', 'В', 'Г', 'Д'];
    const spanH = frame.height / rows.length;
    rows.forEach((lbl, i) => {
      const zy = frame.top + i * spanH;
      if (i > 0) {
        ops.push(`${toX(4).toFixed(2)} ${toY(zy).toFixed(2)} m ${toX(frame.left).toFixed(2)} ${toY(zy).toFixed(2)} l S`);
      }
      drawText(toX(11), toY(zy + spanH / 2 + 3), lbl, Math.max(5.5, 7.5 * scale), false, 'center', [0.35, 0.4, 0.48]);
    });

    // Archival strip on left border
    if (archivalBox.visible) {
      ops.push(`0.1 0.12 0.16 RG ${(frameBase * 0.42).toFixed(2)} w`);
      ops.push(`${toX(archivalBox.x).toFixed(2)} ${toY(archivalBox.y + archivalBox.height).toFixed(2)} ${(archivalBox.width * scale).toFixed(2)} ${(archivalBox.height * scale).toFixed(2)} re S`);
      let curY = archivalBox.y;
      for (const r of archivalBox.rows) {
        ops.push(`${toX(archivalBox.x).toFixed(2)} ${toY(curY + r.h).toFixed(2)} m ${toX(archivalBox.x + archivalBox.width).toFixed(2)} ${toY(curY + r.h).toFixed(2)} l S`);
        drawText(toX(archivalBox.x + 2), toY(curY + r.h * 0.42), r.label, Math.max(4, 5 * scale), false, 'left', [0.3, 0.35, 0.42], (archivalBox.width - 4) * scale);
        if (r.value) {
          drawText(toX(archivalBox.x + 2), toY(curY + r.h * 0.78), r.value, Math.max(4.5, 5.5 * scale), true, 'left', [0.08, 0.1, 0.15], (archivalBox.width - 4) * scale);
        }
        curY += r.h;
      }
    }

    // Stamp box + grid lines + cells
    ops.push(`1 1 1 rg 0.1 0.12 0.16 RG ${pdfFrameW} w`);
    ops.push(`${toX(stamp.x).toFixed(2)} ${toY(stamp.y + stamp.height).toFixed(2)} ${(stamp.width * scale).toFixed(2)} ${(stamp.height * scale).toFixed(2)} re B`);
    for (const ln of stamp.lines) {
      ops.push(`${ln.thick ? pdfStampThickW : pdfStampThinW} w 0.1 0.12 0.16 RG`);
      ops.push(`${toX(ln.x1).toFixed(2)} ${toY(ln.y1).toFixed(2)} m ${toX(ln.x2).toFixed(2)} ${toY(ln.y2).toFixed(2)} l S`);
    }
    for (const cell of stamp.cells) {
      if (!cell.text) continue;
      const fPt = Math.max(4.5, (cell.fontSize || 8.5) * scale * 0.85);
      const cx = cell.align === 'center' ? toX(cell.x + cell.width / 2) : toX(cell.x + 4);
      const cy = toY(cell.y + cell.height * 0.62);
      drawText(
        cx,
        cy,
        cell.text,
        fPt,
        Boolean(cell.bold),
        cell.align === 'center' ? 'center' : 'left',
        cell.editable ? [0.06, 0.08, 0.12] : [0.32, 0.38, 0.45],
        (cell.width - 6) * scale
      );
    }
  }

  // Annotations (under wires/devices)
  for (const ann of (project.annotations || []).filter((a) => a.sheetId === sheet.id)) {
    const [r, g, b] = hexColorToRgb01(ann.color);
    const annSw = Math.max(0.35, (ann.strokeWidth ?? project.visualSettings.annotationStrokeWidth ?? 1.4) * 0.62);
    const style = ann.strokeStyle ?? (ann.kind === 'rect' ? 'dashed' : 'solid');
    const dashOp = style === 'dashed' ? '[5 2.5] 0 d' : style === 'dotted' ? '[1.5 2] 0 d' : '[] 0 d';
    if (ann.kind === 'rect') {
      ops.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${dashOp} ${annSw.toFixed(2)} w`);
      ops.push(`${toX(ann.x).toFixed(2)} ${toY(ann.y + ann.height).toFixed(2)} ${(ann.width * scale).toFixed(2)} ${(ann.height * scale).toFixed(2)} re S`);
      ops.push('[] 0 d');
      drawText(toX(ann.x + 8), toY(ann.y + 12), ann.text, Math.max(6, (ann.fontSize || 11) * scale), true, 'left', [r, g, b]);
    } else if (ann.kind === 'callout') {
      ops.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${dashOp} ${annSw.toFixed(2)} w`);
      ops.push(`${toX(ann.x).toFixed(2)} ${toY(ann.y + ann.height).toFixed(2)} m ${toX(ann.x + 26).toFixed(2)} ${toY(ann.y + 18).toFixed(2)} l ${toX(ann.x + 26 + ann.width).toFixed(2)} ${toY(ann.y + 18).toFixed(2)} l S`);
      ops.push('[] 0 d');
      drawText(toX(ann.x + 30), toY(ann.y + 12), ann.text, Math.max(6, (ann.fontSize || 10) * scale), false, 'left', [r, g, b]);
    } else {
      drawText(toX(ann.x), toY(ann.y), ann.text, Math.max(6, (ann.fontSize || 11) * scale), false, 'left', [r, g, b]);
    }
  }

  // Wires
  for (const wire of project.wires.filter((w) => w.sheetId === sheet.id)) {
    if (wire.waypoints.length < 2) continue;
    const colorHex = project.visualSettings.netColors[wire.signalType] || '#1e293b';
    const [r, g, b] = hexColorToRgb01(colorHex);
    ops.push(`${r.toFixed(2)} ${g.toFixed(2)} ${b.toFixed(2)} RG ${(project.visualSettings.wireWidth * scale * 0.7).toFixed(2)} w`);
    const first = wire.waypoints[0];
    ops.push(`${toX(first.x).toFixed(2)} ${toY(first.y).toFixed(2)} m`);
    for (let i = 1; i < wire.waypoints.length; i++) {
      const pt = wire.waypoints[i];
      ops.push(`${toX(pt.x).toFixed(2)} ${toY(pt.y).toFixed(2)} l`);
    }
    ops.push('S');
    const mid = wire.waypoints[Math.floor(wire.waypoints.length / 2)];
    drawText(toX(mid.x + 4), toY(mid.y - 3), wire.wireNumber, Math.max(5, 7 * scale), false, 'left', [r, g, b]);
  }

  // Devices
  for (const dev of project.devices.filter((d) => d.sheetId === sheet.id && d.bindingState !== 'REMOVED_IN_FLUX')) {
    drawPdfDevice(ops, dev, toX, toY, scale, project.visualSettings.symbolStrokeWidth || 1.8, drawText);
  }

  return { widthPt: pageW, heightPt: pageH, stream: ops.join('\n') };
}

function renderBomTablePage(project: E3Project, ctx: PdfContext): { widthPt: number; heightPt: number; stream: string } {
  const [pageW, pageH] = pageSizePtsForFormat('A4');
  const bom = buildBom(project);
  const ops: string[] = [];

  const drawText = (px: number, py: number, txt: string, fontPt: number, bold = false, maxW?: number) => {
    const clean = String(txt || '').replace(/\r?\n/g, ' ').trim();
    if (!clean) return;
    const font = bold && ctx.fontBold ? ctx.fontBold : ctx.fontRegular;
    const usedMap = bold && ctx.fontBold ? ctx.usedBoldGids : ctx.usedRegularGids;
    const fontKey = bold && ctx.fontBold ? '/F2' : '/F1';
    let sz = fontPt;
    if (maxW && maxW > 4) {
      const mw = measureTextWidthPt(clean, sz, font);
      if (mw > maxW) sz = Math.max(5, sz * (maxW / mw));
    }
    ops.push(`BT 0.08 0.1 0.14 rg ${fontKey} ${sz.toFixed(2)} Tf 1 0 0 1 ${px.toFixed(2)} ${py.toFixed(2)} Tm ${encodePdfTextHex(clean, font, usedMap)} Tj ET`);
  };

  ops.push('1 1 1 rg 0.15 0.18 0.24 RG 1 w');
  ops.push(`28 20 ${(pageW - 48).toFixed(2)} ${(pageH - 40).toFixed(2)} re B`);
  drawText(42, pageH - 44, `Перечень элементов (ГОСТ 2.701 / ПЭ3) — ${project.projectCode} · ${project.name}`, 12, true, pageW - 90);

  const colWidths = [34, 92, 260, 130, 130, 50, 74];
  const headers = ['Поз.', 'Обознач.', 'Наименование', 'Артикул', 'Производитель', 'Кол.', 'Примечание'];
  let y = pageH - 68;
  const rowH = 20;
  const tableW = colWidths.reduce((a, b) => a + b, 0);

  ops.push('0.94 0.96 0.98 rg 0.2 0.24 0.3 RG 0.6 w');
  ops.push(`40 ${(y - rowH).toFixed(2)} ${tableW} ${rowH} re B`);
  let x = 40;
  headers.forEach((h, idx) => {
    drawText(x + 4, y - 13, h, 8.5, true, colWidths[idx] - 8);
    x += colWidths[idx];
  });
  y -= rowH;

  for (const row of bom.slice(0, 22)) {
    ops.push(`0.75 0.78 0.84 RG 0.4 w 40 ${(y - rowH).toFixed(2)} ${tableW} ${rowH} re S`);
    const vals = [String(row.pos), row.designationText, row.componentName, row.article, row.manufacturer, `${row.quantity} ${row.unit}`, row.note || ''];
    let rx = 40;
    vals.forEach((v, idx) => {
      drawText(rx + 4, y - 13, v, 8, false, colWidths[idx] - 8);
      rx += colWidths[idx];
    });
    y -= rowH;
  }

  return { widthPt: pageW, heightPt: pageH, stream: ops.join('\n') };
}

function renderCableJournalPage(project: E3Project, ctx: PdfContext): { widthPt: number; heightPt: number; stream: string } {
  const [pageW, pageH] = pageSizePtsForFormat('A4');
  const cables = buildCableJournal(project);
  const ops: string[] = [];

  const drawText = (px: number, py: number, txt: string, fontPt: number, bold = false, maxW?: number) => {
    const clean = String(txt || '').replace(/\r?\n/g, ' ').trim();
    if (!clean) return;
    const font = bold && ctx.fontBold ? ctx.fontBold : ctx.fontRegular;
    const usedMap = bold && ctx.fontBold ? ctx.usedBoldGids : ctx.usedRegularGids;
    const fontKey = bold && ctx.fontBold ? '/F2' : '/F1';
    let sz = fontPt;
    if (maxW && maxW > 4) {
      const mw = measureTextWidthPt(clean, sz, font);
      if (mw > maxW) sz = Math.max(5, sz * (maxW / mw));
    }
    ops.push(`BT 0.08 0.1 0.14 rg ${fontKey} ${sz.toFixed(2)} Tf 1 0 0 1 ${px.toFixed(2)} ${py.toFixed(2)} Tm ${encodePdfTextHex(clean, font, usedMap)} Tj ET`);
  };

  ops.push('1 1 1 rg 0.15 0.18 0.24 RG 1 w');
  ops.push(`28 20 ${(pageW - 48).toFixed(2)} ${(pageH - 40).toFixed(2)} re B`);
  drawText(42, pageH - 44, `Кабельный журнал — ${project.projectCode}`, 12, true, pageW - 90);

  const colWidths = [70, 180, 90, 90, 90, 80, 70];
  const headers = ['Кабель', 'Марка кабеля', 'Откуда', 'Куда', 'Жилы', 'Сечение', 'Длина, м'];
  let y = pageH - 68;
  const rowH = 20;
  const tableW = colWidths.reduce((a, b) => a + b, 0);

  ops.push('0.94 0.96 0.98 rg 0.2 0.24 0.3 RG 0.6 w');
  ops.push(`40 ${(y - rowH).toFixed(2)} ${tableW} ${rowH} re B`);
  let x = 40;
  headers.forEach((h, idx) => {
    drawText(x + 4, y - 13, h, 8.5, true, colWidths[idx] - 8);
    x += colWidths[idx];
  });
  y -= rowH;

  for (const c of cables.slice(0, 22)) {
    ops.push(`0.75 0.78 0.84 RG 0.4 w 40 ${(y - rowH).toFixed(2)} ${tableW} ${rowH} re S`);
    const vals = [c.designation, c.cableType, c.fromDevice, c.toDevice, `${c.usedCores}/${c.coresCount}`, c.crossSection, String(c.lengthMeters)];
    let rx = 40;
    vals.forEach((v, idx) => {
      drawText(rx + 4, y - 13, v, 8, false, colWidths[idx] - 8);
      rx += colWidths[idx];
    });
    y -= rowH;
  }

  return { widthPt: pageW, heightPt: pageH, stream: ops.join('\n') };
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function exportProjectToPdfBytes(project: E3Project, options: PdfExportOptions = {}): Uint8Array {
  const fontRegular = options.regularFontBytes ? parseTrueTypeFont(options.regularFontBytes) : null;
  const fontBold = options.boldFontBytes ? parseTrueTypeFont(options.boldFontBytes) : fontRegular;

  const ctx: PdfContext = {
    fontRegular,
    fontBold,
    usedRegularGids: new Map([[0, 0]]),
    usedBoldGids: new Map([[0, 0]]),
  };

  const selectedSet = options.sheetIds?.length ? new Set(options.sheetIds) : null;
  const sheets = selectedSet
    ? project.sheets.filter((s) => selectedSet.has(s.id))
    : project.sheets;
  const targetSheets = sheets.length > 0 ? sheets : project.sheets.slice(0, 1);

  const includeGostFrame = options.includeGostFrame !== false;
  const pages = targetSheets.map((s) => renderSheetPageContent(s, project, ctx, includeGostFrame));
  if (options.includeBom) pages.push(renderBomTablePage(project, ctx));
  if (options.includeCables) pages.push(renderCableJournalPage(project, ctx));

  const encoder = new TextEncoder();
  const objects: Array<{ id: number; parts: Uint8Array[] }> = [];
  let nextId = 1;
  const alloc = () => nextId++;

  const catalogId = alloc();
  const pagesId = alloc();

  // Allocate font objects
  const regType0Id = alloc();
  let regCidId = 0;
  let regDescId = 0;
  let regFileId = 0;
  let regToUniId = 0;
  if (ctx.fontRegular) {
    regCidId = alloc();
    regDescId = alloc();
    regFileId = alloc();
    regToUniId = alloc();
  }

  const boldType0Id = alloc();
  let boldCidId = 0;
  let boldDescId = 0;
  let boldFileId = 0;
  let boldToUniId = 0;
  if (ctx.fontBold && ctx.fontBold !== ctx.fontRegular) {
    boldCidId = alloc();
    boldDescId = alloc();
    boldFileId = alloc();
    boldToUniId = alloc();
  }

  const addTextObj = (id: number, body: string) => {
    objects.push({ id, parts: [encoder.encode(`${id} 0 obj\n${body}\nendobj\n`)] });
  };
  const addBinaryStreamObj = (id: number, dictEntries: string, payload: Uint8Array) => {
    objects.push({
      id,
      parts: [
        encoder.encode(`${id} 0 obj\n<< ${dictEntries} /Length ${payload.length} >>\nstream\n`),
        payload,
        encoder.encode(`\nendstream\nendobj\n`),
      ],
    });
  };

  // Emit pages & contents first (now that all glyph maps are populated)
  const pageIds: number[] = [];
  const f2Ref = ctx.fontBold && ctx.fontBold !== ctx.fontRegular ? boldType0Id : regType0Id;
  for (const p of pages) {
    const pId = alloc();
    const cId = alloc();
    pageIds.push(pId);
    const streamBytes = encoder.encode(p.stream);
    addBinaryStreamObj(cId, '', streamBytes);
    addTextObj(
      pId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${p.widthPt.toFixed(2)} ${p.heightPt.toFixed(2)}] /Contents ${cId} 0 R /Resources << /Font << /F1 ${regType0Id} 0 R /F2 ${f2Ref} 0 R >> >> >>`
    );
  }

  // Emit font objects
  const emitFontSet = (
    type0Id: number,
    cidId: number,
    descId: number,
    fileId: number,
    toUniId: number,
    font: ParsedTtfFont | null,
    usedMap: Map<number, number>,
    baseName: string
  ) => {
    if (!font) {
      addTextObj(type0Id, `<< /Type /Font /Subtype /Type1 /BaseFont /${baseName} /Encoding /WinAnsiEncoding >>`);
      return;
    }
    const cmapBytes = encoder.encode(buildToUnicodeCMap(usedMap));
    addBinaryStreamObj(toUniId, '', cmapBytes);
    addBinaryStreamObj(fileId, `/Length1 ${font.bytes.length}`, font.bytes);
    addTextObj(
      descId,
      `<< /Type /FontDescriptor /FontName /${baseName} /Flags 32 /FontBBox [${font.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.ascent} /StemV 80 /FontFile2 ${fileId} 0 R >>`
    );
    addTextObj(
      cidId,
      `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descId} 0 R /DW 500 /CIDToGIDMap /Identity /W ${buildWidthArray(usedMap, font)} >>`
    );
    addTextObj(
      type0Id,
      `<< /Type /Font /Subtype /Type0 /BaseFont /${baseName} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${toUniId} 0 R >>`
    );
  };

  emitFontSet(regType0Id, regCidId, regDescId, regFileId, regToUniId, ctx.fontRegular, ctx.usedRegularGids, 'LiberationSans');
  if (ctx.fontBold && ctx.fontBold !== ctx.fontRegular) {
    emitFontSet(boldType0Id, boldCidId, boldDescId, boldFileId, boldToUniId, ctx.fontBold, ctx.usedBoldGids, 'LiberationSans-Bold');
  } else {
    // unused placeholder if same font; still keep clean object numbering
    addTextObj(boldType0Id, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  }

  addTextObj(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  addTextObj(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  // Sort objects by ID for valid xref table
  objects.sort((a, b) => a.id - b.id);

  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')];
  let byteOffset = chunks[0].length;
  const offsets: number[] = [0]; // index 0 unused

  for (const obj of objects) {
    offsets[obj.id] = byteOffset;
    for (const part of obj.parts) {
      chunks.push(part);
      byteOffset += part.length;
    }
  }

  const xrefOffset = byteOffset;
  const maxObjId = objects[objects.length - 1]?.id || 0;
  const xrefLines = [`xref\n0 ${maxObjId + 1}\n0000000000 65535 f \n`];
  for (let i = 1; i <= maxObjId; i++) {
    const off = offsets[i] ?? 0;
    xrefLines.push(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  xrefLines.push(
    `trailer\n<< /Size ${maxObjId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
  chunks.push(encoder.encode(xrefLines.join('')));

  return concatChunks(chunks);
}
