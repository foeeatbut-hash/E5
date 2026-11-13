import JSZip from 'jszip';
import { mapDxfLayerFlags } from './cadLayers.ts';
import { buildBom, getAbsolutePinPos } from './e3Engine.ts';
import type { CadLayerStateMap, E3Device, E3Project, E3Sheet } from './e3Types.ts';
import { buildGostSheetGeometry } from './gostFrame.ts';

export interface DxfExportOptions {
  sheetIds?: string[];
  includeBom?: boolean;
  includeGostFrame?: boolean;
  editableBlocks?: boolean;
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

interface DxfWriter {
  lines: string[];
  add: (code: number | string, value: string | number) => void;
  line: (x1: number, y1: number, x2: number, y2: number, layer: string, color?: number) => void;
  rect: (x: number, y: number, w: number, h: number, layer: string, color?: number) => void;
  circle: (cx: number, cy: number, r: number, layer: string, color?: number) => void;
  polyline: (pts: Array<{ x: number; y: number }>, layer: string, color?: number, closed?: boolean) => void;
  text: (
    x: number,
    y: number,
    value: string,
    height: number,
    layer: string,
    color?: number,
    hAlign?: 0 | 1 | 2,
    vAlign?: 0 | 1 | 2 | 3
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
    hAlign?: 0 | 1 | 2
  ) => void;
  insertWithAttribs: (
    blockName: string,
    x: number,
    y: number,
    layer: string,
    attribs: Array<{ tag: string; value: string; x: number; y: number; height: number; color?: number; hAlign?: 0 | 1 | 2 }>
  ) => void;
}

function createDxfWriter(): DxfWriter {
  const lines: string[] = [];
  const add = (code: number | string, value: string | number) => {
    lines.push(String(code), String(value));
  };

  const w: DxfWriter = {
    lines,
    add,
    line(x1, y1, x2, y2, layer, color = 256) {
      add(0, 'LINE');
      add(8, layer);
      if (color !== 256) add(62, color);
      add(10, x1.toFixed(2));
      add(20, y1.toFixed(2));
      add(30, '0.0');
      add(11, x2.toFixed(2));
      add(21, y2.toFixed(2));
      add(31, '0.0');
    },
    rect(x, y, rw, rh, layer, color = 256) {
      w.polyline(
        [
          { x, y },
          { x: x + rw, y },
          { x: x + rw, y: y - rh },
          { x, y: y - rh },
        ],
        layer,
        color,
        true
      );
    },
    circle(cx, cy, r, layer, color = 256) {
      add(0, 'CIRCLE');
      add(8, layer);
      if (color !== 256) add(62, color);
      add(10, cx.toFixed(2));
      add(20, cy.toFixed(2));
      add(30, '0.0');
      add(40, Math.max(0.5, r).toFixed(2));
    },
    polyline(pts, layer, color = 256, closed = false) {
      if (pts.length < 2) return;
      add(0, 'LWPOLYLINE');
      add(8, layer);
      if (color !== 256) add(62, color);
      add(90, pts.length);
      add(70, closed ? 1 : 0);
      for (const pt of pts) {
        add(10, pt.x.toFixed(2));
        add(20, pt.y.toFixed(2));
      }
    },
    text(x, y, value, height, layer, color = 256, hAlign = 0, vAlign = 0) {
      const clean = dxfTextEscape(value);
      add(0, 'TEXT');
      add(8, layer);
      add(7, 'GOST_STYLE');
      if (color !== 256) add(62, color);
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
    attdef(x, y, tag, prompt, defVal, height, layer, color = 7, hAlign = 0) {
      add(0, 'ATTDEF');
      add(8, layer);
      add(7, 'GOST_STYLE');
      add(62, color);
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
    insertWithAttribs(blockName, x, y, layer, attribs) {
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
      for (const att of attribs) {
        add(0, 'ATTRIB');
        add(8, layer);
        add(7, 'GOST_STYLE');
        add(62, att.color ?? 7);
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

function drawDeviceSymbolInBlock(w: DxfWriter, dev: E3Device, ox: number, oy: number) {
  // Local DXF block coordinates relative to top-left of device rotated into DXF (+Y up):
  // x in [0, dev.width], y in [0, -dev.height]
  const rw = dev.width;
  const rh = dev.height;
  w.rect(ox, oy, rw, rh, 'E3_DEVICES', 3);

  // Category-specific GOST internal geometry vectors
  if (dev.category === 'motor' || dev.category === 'fan' || dev.category === 'pump') {
    w.circle(ox + rw / 2, oy - rh / 2, Math.min(rw, rh) * 0.36, 'E3_DEVICES', 3);
    w.text(ox + rw / 2, oy - rh / 2, dev.category === 'motor' ? 'M3~' : 'M', 11, 'E3_DEVICES', 7, 1, 2);
  } else if (dev.category === 'breaker') {
    const poles = dev.pins.filter((p) => p.direction === 'top').length || 1;
    const step = rw / (poles + 1);
    for (let i = 1; i <= poles; i++) {
      const px = ox + i * step;
      w.line(px, oy - 10, px, oy - 34, 'E3_DEVICES', 7);
      w.line(px, oy - 34, px - 10, oy - 64, 'E3_DEVICES', 7);
      w.line(px, oy - 66, px, oy - rh + 10, 'E3_DEVICES', 7);
    }
    w.line(ox + step * 0.5, oy - 48, ox + rw - step * 0.5, oy - 48, 'E3_DEVICES', 8);
  } else if (dev.category === 'contactor' || dev.category === 'relay') {
    w.rect(ox + 12, oy - rh * 0.3, 28, rh * 0.4, 'E3_DEVICES', 7);
    w.line(ox + 48, oy - rh * 0.25, ox + 48, oy - rh * 0.75, 'E3_DEVICES', 7);
  } else if (dev.category === 'lamp') {
    const r = Math.min(rw, rh) * 0.34;
    const cx = ox + rw / 2;
    const cy = oy - rh / 2;
    w.circle(cx, cy, r, 'E3_DEVICES', 2);
    const d = r * 0.707;
    w.line(cx - d, cy - d, cx + d, cy + d, 'E3_DEVICES', 2);
    w.line(cx - d, cy + d, cx + d, cy - d, 'E3_DEVICES', 2);
  } else if (dev.category === 'drive' || dev.category === 'plc' || dev.category === 'psu') {
    w.line(ox + 10, oy - 24, ox + rw - 10, oy - 24, 'E3_DEVICES', 8);
    w.text(ox + rw / 2, oy - 13, dev.category.toUpperCase(), 9, 'E3_DEVICES', 7, 1, 2);
  } else if (dev.category === 'offpage_ref') {
    const pot = dev.offPageRef?.potentialName || dev.designation;
    w.text(ox + rw / 2, oy - rh / 2 + 2, pot, 8.5, 'E3_LABELS', 2, 1, 2);
  }

  // Pins stubs and pin numbers
  for (const pin of dev.pins) {
    const px = ox + pin.dx;
    const py = oy - pin.dy;
    w.circle(px, py, 2.2, 'E3_PINS', 2);
    w.text(px + 3, py + (pin.direction === 'top' ? 5 : -8), pin.name, 7, 'E3_PINS', 8);
  }
}

function writeHeaderAndTables(w: DxfWriter, cadLayers?: CadLayerStateMap) {
  // HEADER Section - AC1021 supports native UTF-8 Cyrillic in AutoCAD / BricsCAD / nanoCAD / LibreCAD
  w.add(0, 'SECTION');
  w.add(2, 'HEADER');
  w.add(9, '$ACADVER');
  w.add(1, 'AC1021');
  w.add(9, '$DWGCODEPAGE');
  w.add(3, 'ANSI_1251');
  w.add(9, '$INSUNITS');
  w.add(70, 4); // Millimeters
  w.add(0, 'ENDSEC');

  // TABLES Section
  w.add(0, 'SECTION');
  w.add(2, 'TABLES');

  // LTYPE
  w.add(0, 'TABLE');
  w.add(2, 'LTYPE');
  w.add(70, 2);
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
  w.add(0, 'ENDTAB');

  // LAYER
  const layers: Array<[string, number, string]> = [
    ['0', 7, 'CONTINUOUS'],
    ['GOST_FRAME', 7, 'CONTINUOUS'],
    ['GOST_STAMP', 7, 'CONTINUOUS'],
    ['E3_DEVICES', 3, 'CONTINUOUS'],
    ['E3_PINS', 2, 'CONTINUOUS'],
    ['E3_LABELS', 7, 'CONTINUOUS'],
    ['E3_WIRES', 1, 'CONTINUOUS'],
    ['E3_NETS', 5, 'CONTINUOUS'],
    ['E3_ANNOTATIONS', 4, 'DASHED'],
    ['E3_BOM', 7, 'CONTINUOUS'],
  ];
  w.add(0, 'TABLE');
  w.add(2, 'LAYER');
  w.add(70, layers.length);
  for (const [name, color, ltype] of layers) {
    const mapped = mapDxfLayerFlags(name, cadLayers, color);
    w.add(0, 'LAYER');
    w.add(2, name);
    w.add(70, mapped.flags70);
    w.add(62, mapped.color62);
    w.add(6, ltype);
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
  w.add(0, 'SECTION');
  w.add(2, 'BLOCKS');

  if (editableBlocks) {
    // 1. Stamp block per sheet (contains fixed GOST grid + ATTDEF editable fields for AutoCAD)
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

        // Local coords relative to (sx, bottomOfStamp = -syTop - height): simpler: relative to sheet origin offset (0,0) = bottom-left of stamp!
        const localY = (absCanvasY: number) => geom.stamp.height - (absCanvasY - syTop);

        w.rect(0, geom.stamp.height, geom.stamp.width, geom.stamp.height, 'GOST_STAMP', 7);
        for (const ln of geom.stamp.lines) {
          w.line(
            ln.x1 - sx,
            localY(ln.y1),
            ln.x2 - sx,
            localY(ln.y2),
            'GOST_STAMP',
            ln.thick ? 7 : 8
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
              'GOST_STAMP',
              7,
              cell.align === 'center' ? 1 : 0
            );
          } else if (cell.text) {
            w.text(cx, cy, cell.text, fh, 'GOST_STAMP', 8, cell.align === 'center' ? 1 : 0, 2);
          }
        }

        w.add(0, 'ENDBLK');
      });
    }

    // 2. Device blocks with ATTDEF for DESIGNATION & ARTICLE
    const sheetSet = new Set(sheets.map((s) => s.id));
    for (const dev of project.devices) {
      if (!sheetSet.has(dev.sheetId)) continue;
      const bName = buildDeviceBlockName(dev);
      w.add(0, 'BLOCK');
      w.add(8, 'E3_DEVICES');
      w.add(2, bName);
      w.add(70, 2);
      w.add(10, '0.0');
      w.add(20, '0.0');
      w.add(30, '0.0');

      drawDeviceSymbolInBlock(w, dev, 0, 0);
      w.attdef(0, 12, 'DESIGNATION', 'Обозначение (УГО)', dev.designation, 10, 'E3_LABELS', 7, 0);
      w.attdef(dev.width + 6, -12, 'ARTICLE', 'Артикул', dev.article, 7.5, 'E3_LABELS', 8, 0);
      w.attdef(dev.width + 6, -24, 'NAME', 'Наименование', dev.componentName, 7, 'E3_LABELS', 8, 0);

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

  // Outer sheet boundary
  w.rect(toX(0), toY(0), sheet.width, sheet.height, 'GOST_FRAME', 8);

  if (includeGostFrame) {
    const geom = buildGostSheetGeometry(sheet, project);
    const { frame, archivalBox, stamp } = geom;

    // Inner & outer GOST 2.104 borders
    w.rect(toX(frame.left), toY(frame.top), frame.width, frame.height, 'GOST_FRAME', 7);
    w.rect(toX(4), toY(4), sheet.width - 8, sheet.height - 8, 'GOST_FRAME', 8);

    // Zone ticks (1..6 top, А..Д left)
    const cols = ['1', '2', '3', '4', '5', '6'];
    const spanW = frame.width / cols.length;
    cols.forEach((lbl, i) => {
      const zx = frame.left + i * spanW;
      if (i > 0) w.line(toX(zx), toY(4), toX(zx), toY(frame.top), 'GOST_FRAME', 8);
      w.text(toX(zx + spanW / 2), toY(11), lbl, 8, 'GOST_FRAME', 8, 1, 2);
    });

    const rows = ['А', 'Б', 'В', 'Г', 'Д'];
    const spanH = frame.height / rows.length;
    rows.forEach((lbl, i) => {
      const zy = frame.top + i * spanH;
      if (i > 0) w.line(toX(4), toY(zy), toX(frame.left), toY(zy), 'GOST_FRAME', 8);
      w.text(toX(11), toY(zy + spanH / 2), lbl, 8, 'GOST_FRAME', 8, 1, 2);
    });

    // Archival strip along left margin
    if (archivalBox.visible) {
      w.rect(toX(archivalBox.x), toY(archivalBox.y), archivalBox.width, archivalBox.height, 'GOST_STAMP', 7);
      let curY = archivalBox.y;
      for (const r of archivalBox.rows) {
        w.line(toX(archivalBox.x), toY(curY + r.h), toX(archivalBox.x + archivalBox.width), toY(curY + r.h), 'GOST_STAMP', 7);
        w.text(toX(archivalBox.x + 4), toY(curY + r.h * 0.4), r.label, 6, 'GOST_STAMP', 8);
        if (r.value) {
          w.text(toX(archivalBox.x + 4), toY(curY + r.h * 0.78), r.value, 6.5, 'GOST_STAMP', 7);
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
          color: 7,
          hAlign: (c.align === 'center' ? 1 : 0) as 0 | 1 | 2,
        }));
      w.insertWithAttribs(blockName, stampBaseX, stampBaseY, 'GOST_STAMP', attribs);
    } else {
      w.rect(toX(stamp.x), toY(stamp.y), stamp.width, stamp.height, 'GOST_STAMP', 7);
      for (const ln of stamp.lines) {
        w.line(toX(ln.x1), toY(ln.y1), toX(ln.x2), toY(ln.y2), 'GOST_STAMP', ln.thick ? 7 : 8);
      }
      for (const c of stamp.cells) {
        if (!c.text) continue;
        w.text(
          toX(c.align === 'center' ? c.x + c.width / 2 : c.x + 5),
          toY(c.y + c.height / 2),
          c.text,
          (c.fontSize || 9) * 0.92,
          'GOST_STAMP',
          c.editable ? 7 : 8,
          c.align === 'center' ? 1 : 0,
          2
        );
      }
    }
  }

  // Devices on sheet
  const sheetDevices = project.devices.filter((d) => d.sheetId === sheet.id);
  for (const dev of sheetDevices) {
    if (editableBlocks) {
      const bName = buildDeviceBlockName(dev);
      w.insertWithAttribs(bName, toX(dev.x), toY(dev.y), 'E3_DEVICES', [
        {
          tag: 'DESIGNATION',
          value: dev.designation,
          x: toX(dev.x),
          y: toY(dev.y - 12),
          height: 10,
          color: 7,
        },
        {
          tag: 'ARTICLE',
          value: dev.article,
          x: toX(dev.x + dev.width + 6),
          y: toY(dev.y + 12),
          height: 7.5,
          color: 8,
        },
        {
          tag: 'NAME',
          value: dev.componentName,
          x: toX(dev.x + dev.width + 6),
          y: toY(dev.y + 24),
          height: 7,
          color: 8,
        },
      ]);
    } else {
      drawDeviceSymbolInBlock(w, dev, toX(dev.x), toY(dev.y));
      w.text(toX(dev.x), toY(dev.y - 10), `${dev.designation} (${dev.article})`, 9.5, 'E3_LABELS', 7);
    }
  }

  // Wires as editable LWPOLYLINEs
  const sheetWires = project.wires.filter((wr) => wr.sheetId === sheet.id);
  for (const wire of sheetWires) {
    const color = signalTypeToAci(wire.signalType);
    const pts = wire.waypoints.map((pt) => ({ x: toX(pt.x), y: toY(pt.y) }));
    w.polyline(pts, 'E3_WIRES', color, false);
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
      w.text(toX(mid.x + 4), toY(mid.y - 6), wire.wireNumber, 7.5, 'E3_NETS', color);
    }
  }

  // Cross-checks for pin coords if needed (kept consistent with engine)
  void getAbsolutePinPos;

  // Annotations
  const sheetAnns = (project.annotations || []).filter((a) => a.sheetId === sheet.id);
  for (const ann of sheetAnns) {
    if (ann.kind === 'rect') {
      w.rect(toX(ann.x), toY(ann.y), ann.width, ann.height, 'E3_ANNOTATIONS', 4);
      w.text(toX(ann.x + 8), toY(ann.y + 14), ann.text, ann.fontSize || 11, 'E3_ANNOTATIONS', 4);
    } else if (ann.kind === 'callout') {
      w.polyline(
        [
          { x: toX(ann.x), y: toY(ann.y + ann.height) },
          { x: toX(ann.x + 26), y: toY(ann.y + 18) },
          { x: toX(ann.x + 26 + ann.width), y: toY(ann.y + 18) },
        ],
        'E3_ANNOTATIONS',
        2,
        false
      );
      w.text(toX(ann.x + 30), toY(ann.y + 12), ann.text, ann.fontSize || 10, 'E3_ANNOTATIONS', 7);
    } else {
      w.text(toX(ann.x), toY(ann.y), ann.text, ann.fontSize || 11, 'E3_ANNOTATIONS', 7);
    }
  }
}

function drawBomTableInDxf(w: DxfWriter, project: E3Project, originX: number, originYTop: number) {
  const bom = buildBom(project);
  const cols = [45, 110, 320, 140, 140, 60];
  const headers = ['Поз.', 'Обозначение', 'Наименование', 'Артикул', 'Производитель', 'Кол.'];
  const totalW = cols.reduce((a, b) => a + b, 0);
  const rowH = 22;

  w.text(originX, originYTop + 14, `Перечень элементов ПЭ3 — ${project.projectCode}`, 13, 'E3_BOM', 7);
  let curY = originYTop;
  w.rect(originX, curY, totalW, rowH, 'E3_BOM', 7);
  let cx = originX;
  headers.forEach((h, i) => {
    w.text(cx + 6, curY - rowH / 2, h, 8.5, 'E3_BOM', 7, 0, 2);
    cx += cols[i];
    if (i < cols.length - 1) w.line(cx, curY, cx, curY - rowH * (bom.length + 1), 'E3_BOM', 8);
  });
  curY -= rowH;

  for (const row of bom) {
    w.rect(originX, curY, totalW, rowH, 'E3_BOM', 8);
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
      w.text(rx + 6, curY - rowH / 2, v, 8, 'E3_BOM', 7, 0, 2);
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
  writeHeaderAndTables(w, project.layers);
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
      `Слои: GOST_FRAME, GOST_STAMP, E3_DEVICES, E3_PINS, E3_LABELS, E3_WIRES, E3_NETS, E3_ANNOTATIONS, E3_BOM`,
      `Блоки и атрибуты: Штампы ГОСТ (Форма 1/2а) и УГО устройств экспортированы как INSERT с редактируемыми ATTRIB.`,
    ].join('\r\n')
  );

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
