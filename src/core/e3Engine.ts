import { E3_CATALOG } from './e3Catalog.ts';
import { DEFAULT_VISUAL_SETTINGS } from './e3Seed.ts';
import type {
  AnnotationKind,
  BomRow,
  CableJournalRow,
  E3Annotation,
  E3Attribute,
  E3Cable,
  E3Device,
  E3Pin,
  E3Project,
  E3Sheet,
  E3VisualSettings,
  E3Wire,
  ErcIssue,
  FluxBridgeBundle,
  FluxExportNode,
  PinDirection,
  SchematicFontFamily,
  SheetFormat,
  SignalType,
  TerminalPlanRow,
} from './e3Types.ts';

export function getAbsolutePinPos(device: E3Device, pin: E3Pin): { x: number; y: number; direction: PinDirection } {
  const cx = device.width / 2;
  const cy = device.height / 2;
  const lx = pin.dx - cx;
  const ly = pin.dy - cy;
  const dirs: PinDirection[] = ['top', 'right', 'bottom', 'left'];
  const idx = dirs.indexOf(pin.direction);
  const steps = (device.rotation / 90) % 4;
  const rotatedDir = dirs[(idx + steps) % 4];

  let rx = lx;
  let ry = ly;
  if (steps === 1) {
    rx = -ly;
    ry = lx;
  } else if (steps === 2) {
    rx = -lx;
    ry = -ly;
  } else if (steps === 3) {
    rx = ly;
    ry = -lx;
  }

  return {
    x: Math.round(device.x + cx + rx),
    y: Math.round(device.y + cy + ry),
    direction: rotatedDir,
  };
}

export interface RoutingRect {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function segmentIntersectsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: RoutingRect,
  pad = 8
): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const rx1 = r.x - pad;
  const ry1 = r.y - pad;
  const rx2 = r.x + r.width + pad;
  const ry2 = r.y + r.height + pad;
  return maxX > rx1 && minX < rx2 && maxY > ry1 && minY < ry2;
}

function pathHitsAnyObstacle(
  pts: Array<{ x: number; y: number }>,
  obstacles: RoutingRect[]
): RoutingRect | undefined {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    for (const obs of obstacles) {
      if (segmentIntersectsRect(a, b, obs, 6)) {
        return obs;
      }
    }
  }
  return undefined;
}

export function autoRouteOrthogonal(
  p1: { x: number; y: number; direction: PinDirection },
  p2: { x: number; y: number; direction: PinDirection },
  stub = 20,
  obstacles: RoutingRect[] = [],
  laneOffset = 0
): Array<{ x: number; y: number }> {
  const step = Math.max(12, stub);
  const isHoriz1 = p1.direction === 'left' || p1.direction === 'right';
  const isHoriz2 = p2.direction === 'left' || p2.direction === 'right';

  // 1. Direct straight line when facing pins are colinear (no useless zigzags)
  if (
    ((p1.direction === 'right' && p2.direction === 'left' && p2.x >= p1.x) ||
      (p1.direction === 'left' && p2.direction === 'right' && p2.x <= p1.x)) &&
    Math.abs(p1.y - p2.y) <= 2
  ) {
    const direct = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p1.y }];
    if (!pathHitsAnyObstacle(direct, obstacles)) return deduplicatePoints(direct);
  }
  if (
    ((p1.direction === 'bottom' && p2.direction === 'top' && p2.y >= p1.y) ||
      (p1.direction === 'top' && p2.direction === 'bottom' && p2.y <= p1.y)) &&
    Math.abs(p1.x - p2.x) <= 2
  ) {
    const direct = [{ x: p1.x, y: p1.y }, { x: p1.x, y: p2.y }];
    if (!pathHitsAnyObstacle(direct, obstacles)) return deduplicatePoints(direct);
  }

  // 2. Clean 1-bend L-route for perpendicular facing pins in forward quadrant
  if (isHoriz1 && !isHoriz2) {
    const forwardX = p1.direction === 'right' ? p2.x >= p1.x + 8 : p2.x <= p1.x - 8;
    const forwardY = p2.direction === 'top' ? p1.y <= p2.y - 8 : p1.y >= p2.y + 8;
    if (forwardX && forwardY) {
      const lRoute = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p1.y }, { x: p2.x, y: p2.y }];
      if (!pathHitsAnyObstacle(lRoute, obstacles)) return deduplicatePoints(lRoute);
    }
  } else if (!isHoriz1 && isHoriz2) {
    const forwardY = p1.direction === 'bottom' ? p2.y >= p1.y + 8 : p2.y <= p1.y - 8;
    const forwardX = p2.direction === 'left' ? p1.x <= p2.x - 8 : p1.x >= p2.x + 8;
    if (forwardX && forwardY) {
      const lRoute = [{ x: p1.x, y: p1.y }, { x: p1.x, y: p2.y }, { x: p2.x, y: p2.y }];
      if (!pathHitsAnyObstacle(lRoute, obstacles)) return deduplicatePoints(lRoute);
    }
  }

  const offset = (p: { x: number; y: number; direction: PinDirection }) => {
    if (p.direction === 'top') return { x: p.x, y: p.y - step };
    if (p.direction === 'bottom') return { x: p.x, y: p.y + step };
    if (p.direction === 'left') return { x: p.x - step, y: p.y };
    return { x: p.x + step, y: p.y };
  };

  const s1 = offset(p1);
  const s2 = offset(p2);
  let midX = Math.round((s1.x + s2.x) / 2) + laneOffset;
  let midY = Math.round((s1.y + s2.y) / 2) + laneOffset;

  const buildStandard = (mx: number, my: number): Array<{ x: number; y: number }> => {
    const pts: Array<{ x: number; y: number }> = [{ x: p1.x, y: p1.y }, s1];
    if (isHoriz1 && isHoriz2) {
      pts.push({ x: mx, y: s1.y }, { x: mx, y: s2.y });
    } else if (!isHoriz1 && !isHoriz2) {
      pts.push({ x: s1.x, y: my }, { x: s2.x, y: my });
    } else if (isHoriz1) {
      pts.push({ x: s2.x, y: s1.y });
    } else {
      pts.push({ x: s1.x, y: s2.y });
    }
    pts.push(s2, { x: p2.x, y: p2.y });
    return deduplicatePoints(pts);
  };

  let candidate = buildStandard(midX, midY);
  const hit = pathHitsAnyObstacle(candidate, obstacles);
  if (hit) {
    if (isHoriz1 && isHoriz2) {
      // Try routing above or below the blocking device
      const topLane = hit.y - 24 - Math.abs(laneOffset);
      const botLane = hit.y + hit.height + 24 + Math.abs(laneOffset);
      const laneY = Math.abs(s1.y - topLane) <= Math.abs(s1.y - botLane) ? topLane : botLane;
      candidate = deduplicatePoints([
        { x: p1.x, y: p1.y },
        s1,
        { x: s1.x, y: laneY },
        { x: s2.x, y: laneY },
        s2,
        { x: p2.x, y: p2.y },
      ]);
    } else {
      // Shift vertical/horizontal trunk outside obstacle bounds
      const leftLane = hit.x - 24 - Math.abs(laneOffset);
      const rightLane = hit.x + hit.width + 24 + Math.abs(laneOffset);
      const altX = Math.abs(s1.x - leftLane) <= Math.abs(s1.x - rightLane) ? leftLane : rightLane;
      const topLane = hit.y - 24 - Math.abs(laneOffset);
      const botLane = hit.y + hit.height + 24 + Math.abs(laneOffset);
      const altY = Math.abs(s1.y - topLane) <= Math.abs(s1.y - botLane) ? topLane : botLane;
      if (!isHoriz1 && !isHoriz2) {
        candidate = deduplicatePoints([
          { x: p1.x, y: p1.y },
          s1,
          { x: altX, y: s1.y },
          { x: altX, y: s2.y },
          s2,
          { x: p2.x, y: p2.y },
        ]);
      } else {
        candidate = buildStandard(altX, altY);
      }
    }
  }

  return simplifyColinearPoints(candidate);
}

function simplifyColinearPoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length <= 2) return points;
  const out: Array<{ x: number; y: number }> = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    const sameX = prev.x === curr.x && curr.x === next.x;
    const sameY = prev.y === curr.y && curr.y === next.y;
    if (!sameX && !sameY) {
      out.push(curr);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Re-routes all wires on a sheet with device collision avoidance and non-overlapping trunk lanes. */
export function routeSheetWiresCleanly(
  devices: E3Device[],
  wires: E3Wire[],
  targetSheetId: string,
  gridSize = 20
): E3Wire[] {
  const sheetDevices = devices.filter(
    (d) => d.sheetId === targetSheetId && d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix'
  );
  const devMap = new Map(sheetDevices.map((d) => [d.id, d]));
  const laneStep = Math.max(8, Math.round(gridSize * 0.6));
  const usedMidKeys = new Map<string, number>();

  return wires.map((w) => {
    if (w.sheetId !== targetSheetId) return w;
    const d1 = devMap.get(w.fromDeviceId);
    const d2 = devMap.get(w.toDeviceId);
    const p1 = d1?.pins.find((p) => p.id === w.fromPinId);
    const p2 = d2?.pins.find((p) => p.id === w.toPinId);
    if (!d1 || !d2 || !p1 || !p2) return w;

    const abs1 = getAbsolutePinPos(d1, p1);
    const abs2 = getAbsolutePinPos(d2, p2);
    const bucketKey = `${Math.round((abs1.x + abs2.x) / 80)}:${Math.round((abs1.y + abs2.y) / 80)}:${abs1.direction}:${abs2.direction}`;
    const idxInBucket = usedMidKeys.get(bucketKey) || 0;
    usedMidKeys.set(bucketKey, idxInBucket + 1);
    const laneOffset = idxInBucket === 0 ? 0 : (idxInBucket % 2 === 1 ? 1 : -1) * Math.ceil(idxInBucket / 2) * laneStep;

    const obstacles: RoutingRect[] = sheetDevices
      .filter((d) => d.id !== d1.id && d.id !== d2.id)
      .map((d) => ({ id: d.id, x: d.x, y: d.y, width: d.width, height: d.height }));

    return {
      ...w,
      waypoints: autoRouteOrthogonal(abs1, abs2, 20, obstacles, laneOffset),
    };
  });
}

function deduplicatePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const res: Array<{ x: number; y: number }> = [];
  for (const pt of points) {
    const prev = res[res.length - 1];
    if (!prev || prev.x !== pt.x || prev.y !== pt.y) {
      res.push(pt);
    }
  }
  return res;
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

/** Generates GOST 2.106 / ПЭ3 Bill of Materials & Element List */
export function buildBom(project: E3Project): BomRow[] {
  const groups = new Map<string, BomRow>();

  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX') continue;
    if (
      dev.category === 'airflow_arrow' ||
      dev.category === 'io_matrix' ||
      dev.e3BlockName === 'EXT_FIELD_UNIT'
    ) {
      continue;
    }
    const key = `${dev.article.trim()}||${dev.manufacturer.trim()}||${dev.componentName.trim()}`;
    const existing = groups.get(key);
    if (existing) {
      existing.designations.push(dev.designation);
      existing.quantity += 1;
    } else {
      groups.set(key, {
        pos: 0,
        designations: [dev.designation],
        designationText: dev.designation,
        componentName: dev.componentName,
        article: dev.article || '—',
        manufacturer: dev.manufacturer || '—',
        category: dev.category,
        quantity: 1,
        unit: 'шт.',
        note: dev.attributes.find((a) => a.name === 'Примечание')?.value || '',
      });
    }
  }

  const rows = Array.from(groups.values());
  for (const row of rows) {
    row.designations.sort(naturalCompare);
    row.designationText = row.designations.join(', ');
  }
  rows.sort((a, b) => naturalCompare(a.designations[0] || '', b.designations[0] || ''));
  rows.forEach((row, index) => {
    row.pos = index + 1;
  });

  return rows;
}

export function buildCableJournal(project: E3Project): CableJournalRow[] {
  return project.cables.map((cable) => {
    const usedCores = project.wires.filter((w) => w.cableId === cable.id).length;
    return {
      designation: cable.designation,
      cableType: cable.cableType,
      coresCount: cable.coresCount,
      usedCores,
      crossSection: cable.crossSection,
      lengthMeters: cable.lengthMeters,
      fromDevice: cable.fromDevice,
      toDevice: cable.toDevice,
      shielded: cable.shielded,
    };
  });
}

export function buildTerminalPlan(project: E3Project): TerminalPlanRow[] {
  const devMap = new Map(project.devices.map((d) => [d.id, d]));
  const cableMap = new Map(project.cables.map((c) => [c.id, c]));
  const rows: TerminalPlanRow[] = [];

  const terminals = project.devices
    .filter((d) => d.category === 'terminal' && d.bindingState !== 'REMOVED_IN_FLUX')
    .sort((a, b) => naturalCompare(a.designation, b.designation));

  for (const term of terminals) {
    for (const pin of term.pins) {
      const connectedWires = project.wires.filter(
        (w) =>
          (w.fromDeviceId === term.id && w.fromPinId === pin.id) ||
          (w.toDeviceId === term.id && w.toPinId === pin.id)
      );
      if (connectedWires.length === 0) {
        rows.push({
          terminalDesignation: term.designation,
          pinName: pin.name,
          netName: 'Резерв',
          wireNumber: '—',
          crossSection: '—',
          connectedTo: 'Не подключено',
          cableInfo: '—',
        });
      } else {
        for (const wire of connectedWires) {
          const isFrom = wire.fromDeviceId === term.id && wire.fromPinId === pin.id;
          const otherDev = devMap.get(isFrom ? wire.toDeviceId : wire.fromDeviceId);
          const otherPin = otherDev?.pins.find((p) => p.id === (isFrom ? wire.toPinId : wire.fromPinId));
          const cable = wire.cableId ? cableMap.get(wire.cableId) : undefined;
          rows.push({
            terminalDesignation: term.designation,
            pinName: pin.name,
            netName: wire.netName,
            wireNumber: wire.wireNumber,
            crossSection: wire.crossSection,
            connectedTo: otherDev ? `${otherDev.designation}:${otherPin?.name || '?'}` : 'Внешняя цепь',
            cableInfo: cable ? `${cable.designation} (${wire.coreNumber || '?'})` : 'Монтажный провод',
          });
        }
      }
    }
  }

  return rows;
}

const INCOMPATIBLE_SIGNAL_PAIRS: Array<[SignalType, SignalType]> = [
  ['power', 'pe'],
  ['power', 'neutral'],
  ['power', 'dc24'],
  ['power', 'dc0'],
  ['dc24', 'dc0'],
  ['dc24', 'pe'],
];

export function runErc(project: E3Project): ErcIssue[] {
  const issues: ErcIssue[] = [];
  const designationCounts = new Map<string, E3Device[]>();
  const devMap = new Map(project.devices.map((d) => [d.id, d]));

  const primaryDesignations = new Set<string>();
  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX') continue;
    if (dev.e3BlockName !== 'EXT_FIELD_UNIT') {
      primaryDesignations.add(dev.designation.trim().toUpperCase());
    }
  }

  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX') {
      issues.push({
        id: `erc-removed-${dev.id}`,
        severity: 'warning',
        code: 'E3-FLUX-REMOVED',
        message: `Позиция ${dev.designation} снята во Flux, но остаётся на листе схемы`,
        sheetId: dev.sheetId,
        deviceId: dev.id,
      });
      continue;
    }

    const normDes = dev.designation.trim().toUpperCase();
    // EXT_FIELD_UNIT represents a linked cross-sheet terminal view of the primary FSA unit
    if (!(dev.e3BlockName === 'EXT_FIELD_UNIT' && primaryDesignations.has(normDes))) {
      const list = designationCounts.get(normDes) || [];
      list.push(dev);
      designationCounts.set(normDes, list);
    }

    if (!dev.article.trim() || !dev.manufacturer.trim()) {
      issues.push({
        id: `erc-art-${dev.id}`,
        severity: 'warning',
        code: 'E3-BOM-PART',
        message: `У элемента ${dev.designation} не заполнены артикул или производитель для спецификации ПЭ3`,
        sheetId: dev.sheetId,
        deviceId: dev.id,
      });
    }
  }

  for (const [des, list] of designationCounts.entries()) {
    if (list.length > 1) {
      for (const dev of list) {
        issues.push({
          id: `erc-dup-${dev.id}`,
          severity: 'error',
          code: 'E3-DUP-DES',
          message: `Дублирование позиционного обозначения ${des} (${list.length} экз.)`,
          sheetId: dev.sheetId,
          deviceId: dev.id,
        });
      }
    }
  }

  const connectedPins = new Set<string>();
  for (const wire of project.wires) {
    connectedPins.add(`${wire.fromDeviceId}:${wire.fromPinId}`);
    connectedPins.add(`${wire.toDeviceId}:${wire.toPinId}`);

    const dFrom = devMap.get(wire.fromDeviceId);
    const dTo = devMap.get(wire.toDeviceId);
    const pFrom = dFrom?.pins.find((p) => p.id === wire.fromPinId);
    const pTo = dTo?.pins.find((p) => p.id === wire.toPinId);
    if (!dFrom || !dTo || !pFrom || !pTo) {
      issues.push({
        id: `erc-dangling-${wire.id}`,
        severity: 'error',
        code: 'E3-NET-DANGLING',
        message: `Цепь ${wire.netName} (${wire.wireNumber}) ссылается на несуществующий вывод`,
        sheetId: wire.sheetId,
        wireId: wire.id,
      });
      continue;
    }

    const isIncompatible = INCOMPATIBLE_SIGNAL_PAIRS.some(
      ([a, b]) =>
        (pFrom.signalType === a && pTo.signalType === b) ||
        (pFrom.signalType === b && pTo.signalType === a)
    );
    if (isIncompatible) {
      issues.push({
        id: `erc-short-${wire.id}`,
        severity: 'error',
        code: 'E3-POTENTIAL-CONFLICT',
        message: `Конфликт потенциалов в цепи ${wire.netName}: ${dFrom.designation}:${pFrom.name} (${pFrom.signalType}) → ${dTo.designation}:${pTo.name} (${pTo.signalType})`,
        sheetId: wire.sheetId,
        wireId: wire.id,
      });
    }
  }

  for (const cab of project.cables) {
    const used = project.wires.filter((w) => w.cableId === cab.id).length;
    if (used > cab.coresCount) {
      issues.push({
        id: `erc-cab-${cab.id}`,
        severity: 'error',
        code: 'E3-CABLE-OVERFLOW',
        message: `Кабель ${cab.designation} (${cab.cableType}): задействовано ${used} жил из ${cab.coresCount}`,
      });
    }
  }

  // Only flag devices that have 0 connected pins at all (floating unplaced/unwired block)
  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX' || dev.category === 'terminal') continue;
    const anyConnected = dev.pins.some((p) => connectedPins.has(`${dev.id}:${p.id}`));
    if (!anyConnected && dev.pins.length > 0) {
      issues.push({
        id: `erc-unwired-${dev.id}`,
        severity: 'info',
        code: 'E3-DEV-UNWIRED',
        message: `Элемент ${dev.designation} (${dev.componentName}) не имеет ни одного подключения`,
        sheetId: dev.sheetId,
        deviceId: dev.id,
      });
    }
  }

  return issues;
}

// ============================================================================
// Bidirectional Lossless E3.series XML (.e3x) Serializer & Parser
// ============================================================================

function xmlEscape(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlUnescape(str: string): string {
  return str
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function serializeE3Xml(project: E3Project): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<E3Project format="e3s" schemaVersion="${xmlEscape(project.schemaVersion)}" id="${xmlEscape(project.id)}" name="${xmlEscape(project.name)}" projectCode="${xmlEscape(project.projectCode)}" fluxProjectKey="${xmlEscape(project.fluxProjectKey)}" author="${xmlEscape(project.author)}" revision="${project.revision}" standard="${xmlEscape(project.standard)}" updatedAt="${xmlEscape(project.updatedAt)}">`
  );

  // Visual Settings synchronization block
  const vs = project.visualSettings;
  lines.push(
    `  <VisualSettings schemaVersion="${vs.schemaVersion}" presetName="${xmlEscape(vs.presetName)}" theme="${vs.theme}" gridSize="${vs.gridSize}" snapToGrid="${vs.snapToGrid}" showGrid="${vs.showGrid}" showGostFrame="${vs.showGostFrame}" showPinNumbers="${vs.showPinNumbers}" showWireNumbers="${vs.showWireNumbers}" showCrossRefs="${vs.showCrossRefs}" wireWidth="${vs.wireWidth}" symbolStrokeWidth="${vs.symbolStrokeWidth}" fontScale="${vs.fontScale}" fontFamily="${xmlEscape(vs.fontFamily || 'GOST')}">`
  );
  for (const [sig, color] of Object.entries(vs.netColors)) {
    lines.push(`    <NetColor signalType="${xmlEscape(sig)}" hex="${xmlEscape(color)}" />`);
  }
  lines.push('  </VisualSettings>');

  // Sheets
  lines.push('  <Sheets>');
  for (const s of project.sheets) {
    lines.push(
      `    <Sheet id="${xmlEscape(s.id)}" number="${s.number}" name="${xmlEscape(s.name)}" format="${s.format}" width="${s.width}" height="${s.height}" documentCode="${xmlEscape(s.titleBlock.documentCode)}" organization="${xmlEscape(s.titleBlock.organization)}" designer="${xmlEscape(s.titleBlock.designer)}" checker="${xmlEscape(s.titleBlock.checker)}" sheetTitle="${xmlEscape(s.titleBlock.sheetTitle)}" />`
    );
  }
  lines.push('  </Sheets>');

  // Cables
  lines.push('  <Cables>');
  for (const c of project.cables) {
    lines.push(
      `    <Cable id="${xmlEscape(c.id)}" designation="${xmlEscape(c.designation)}" cableType="${xmlEscape(c.cableType)}" coresCount="${c.coresCount}" crossSection="${xmlEscape(c.crossSection)}" lengthMeters="${c.lengthMeters}" fromDevice="${xmlEscape(c.fromDevice)}" toDevice="${xmlEscape(c.toDevice)}" shielded="${c.shielded}" />`
    );
  }
  lines.push('  </Cables>');

  // Devices with Pins & Attributes
  lines.push('  <Devices>');
  for (const d of project.devices) {
    lines.push(
      `    <Device id="${xmlEscape(d.id)}" elementId="${xmlEscape(d.elementId)}" designation="${xmlEscape(d.designation)}" componentName="${xmlEscape(d.componentName)}" article="${xmlEscape(d.article)}" manufacturer="${xmlEscape(d.manufacturer)}" category="${xmlEscape(d.category)}" sheetId="${xmlEscape(d.sheetId)}" x="${d.x}" y="${d.y}" rotation="${d.rotation}" width="${d.width}" height="${d.height}" e3BlockName="${xmlEscape(d.e3BlockName)}" bindingState="${xmlEscape(d.bindingState)}">`
    );
    lines.push('      <Pins>');
    for (const p of d.pins) {
      lines.push(
        `        <Pin id="${xmlEscape(p.id)}" name="${xmlEscape(p.name)}" dx="${p.dx}" dy="${p.dy}" direction="${xmlEscape(p.direction)}" signalType="${xmlEscape(p.signalType)}" />`
      );
    }
    lines.push('      </Pins>');
    lines.push('      <Attributes>');
    for (const a of d.attributes) {
      lines.push(
        `        <Attribute name="${xmlEscape(a.name)}" value="${xmlEscape(a.value)}" owner="${xmlEscape(a.owner)}" conflict="${xmlEscape(a.conflict)}" service="${Boolean(a.service)}" />`
      );
    }
    lines.push('      </Attributes>');
    lines.push('    </Device>');
  }
  lines.push('  </Devices>');

  // Wires
  lines.push('  <Wires>');
  for (const w of project.wires) {
    const pts = w.waypoints.map((pt) => `${pt.x},${pt.y}`).join(';');
    lines.push(
      `    <Wire id="${xmlEscape(w.id)}" sheetId="${xmlEscape(w.sheetId)}" netName="${xmlEscape(w.netName)}" signalType="${xmlEscape(w.signalType)}" fromDeviceId="${xmlEscape(w.fromDeviceId)}" fromPinId="${xmlEscape(w.fromPinId)}" toDeviceId="${xmlEscape(w.toDeviceId)}" toPinId="${xmlEscape(w.toPinId)}" crossSection="${xmlEscape(w.crossSection)}" wireNumber="${xmlEscape(w.wireNumber)}" cableId="${xmlEscape(w.cableId || '')}" coreNumber="${xmlEscape(w.coreNumber || '')}" waypoints="${xmlEscape(pts)}" />`
    );
  }
  lines.push('  </Wires>');

  if (project.annotations?.length) {
    lines.push('  <Annotations>');
    for (const ann of project.annotations) {
      lines.push(
        `    <Annotation id="${xmlEscape(ann.id)}" sheetId="${xmlEscape(ann.sheetId)}" kind="${xmlEscape(ann.kind)}" x="${ann.x}" y="${ann.y}" width="${ann.width}" height="${ann.height}" text="${xmlEscape(ann.text)}" color="${xmlEscape(ann.color || '')}" fontSize="${ann.fontSize || 12}" />`
      );
    }
    lines.push('  </Annotations>');
  }

  lines.push('</E3Project>');
  return lines.join('\n');
}

function parseXmlAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_][A-Za-z0-9_:-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString)) !== null) {
    attrs[m[1]] = xmlUnescape(m[2]);
  }
  return attrs;
}

export function parseE3Xml(xml: string): E3Project {
  const rootMatch = /<E3Project\s+([^>]+)>/.exec(xml);
  if (!rootMatch) {
    throw new Error('Некорректный формат E3 XML: отсутствует корневой узел <E3Project>.');
  }
  const rootAttrs = parseXmlAttrs(rootMatch[1]);

  // VisualSettings
  const visualSettings: E3VisualSettings = structuredClone(DEFAULT_VISUAL_SETTINGS);
  const vsMatch = /<VisualSettings\s+([^>]+)>([\s\S]*?)<\/VisualSettings>/.exec(xml);
  if (vsMatch) {
    const va = parseXmlAttrs(vsMatch[1]);
    visualSettings.schemaVersion = Number(va.schemaVersion || 1);
    visualSettings.presetName = va.presetName || visualSettings.presetName;
    visualSettings.theme = va.theme === 'dark' ? 'dark' : 'light';
    visualSettings.gridSize = Number(va.gridSize || 20);
    visualSettings.snapToGrid = va.snapToGrid !== 'false';
    visualSettings.showGrid = va.showGrid !== 'false';
    visualSettings.showGostFrame = va.showGostFrame !== 'false';
    visualSettings.showPinNumbers = va.showPinNumbers !== 'false';
    visualSettings.showWireNumbers = va.showWireNumbers !== 'false';
    visualSettings.showCrossRefs = va.showCrossRefs !== 'false';
    visualSettings.wireWidth = Number(va.wireWidth || 2);
    visualSettings.symbolStrokeWidth = Number(va.symbolStrokeWidth || 1.75);
    visualSettings.fontScale = Number(va.fontScale || 1);
    if (va.fontFamily) {
      visualSettings.fontFamily = va.fontFamily as SchematicFontFamily;
    }

    const netColorRe = /<NetColor\s+([^>]+?)\s*\/?>/g;
    let ncm: RegExpExecArray | null;
    while ((ncm = netColorRe.exec(vsMatch[2])) !== null) {
      const nca = parseXmlAttrs(ncm[1]);
      if (nca.signalType && nca.hex) {
        visualSettings.netColors[nca.signalType as SignalType] = nca.hex;
      }
    }
  }

  // Sheets
  const sheets: E3Sheet[] = [];
  const sheetRe = /<Sheet\s+([^>]+?)\s*\/?>/g;
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(xml)) !== null) {
    const sa = parseXmlAttrs(sm[1]);
    const validFmt: SheetFormat =
      sa.format === 'A4' || sa.format === 'A3' || sa.format === 'A2' || sa.format === 'A1'
        ? sa.format
        : 'A3';
    sheets.push({
      id: sa.id,
      number: Number(sa.number || sheets.length + 1),
      name: sa.name || `Лист ${sheets.length + 1}`,
      format: validFmt,
      width: Number(sa.width || 1400),
      height: Number(sa.height || 920),
      titleBlock: {
        documentCode: sa.documentCode || '',
        organization: sa.organization || '',
        designer: sa.designer || '',
        checker: sa.checker || '',
        sheetTitle: sa.sheetTitle || '',
      },
    });
  }

  // Cables
  const cables: E3Cable[] = [];
  const cableRe = /<Cable\s+([^>]+?)\s*\/?>/g;
  let cm: RegExpExecArray | null;
  while ((cm = cableRe.exec(xml)) !== null) {
    const ca = parseXmlAttrs(cm[1]);
    cables.push({
      id: ca.id,
      designation: ca.designation,
      cableType: ca.cableType,
      coresCount: Number(ca.coresCount || 3),
      crossSection: ca.crossSection || '1.5 мм²',
      lengthMeters: Number(ca.lengthMeters || 10),
      fromDevice: ca.fromDevice || '',
      toDevice: ca.toDevice || '',
      shielded: ca.shielded === 'true',
    });
  }

  // Devices
  const devices: E3Device[] = [];
  const devRe = /<Device\s+([^>]+)>([\s\S]*?)<\/Device>/g;
  let dm: RegExpExecArray | null;
  while ((dm = devRe.exec(xml)) !== null) {
    const da = parseXmlAttrs(dm[1]);
    const body = dm[2];

    const pins: E3Pin[] = [];
    const pinRe = /<Pin\s+([^>]+?)\s*\/?>/g;
    let pm: RegExpExecArray | null;
    while ((pm = pinRe.exec(body)) !== null) {
      const pa = parseXmlAttrs(pm[1]);
      pins.push({
        id: pa.id,
        name: pa.name,
        dx: Number(pa.dx || 0),
        dy: Number(pa.dy || 0),
        direction: (pa.direction as PinDirection) || 'top',
        signalType: (pa.signalType as SignalType) || 'signal',
      });
    }

    const attributes: E3Attribute[] = [];
    const attrRe = /<Attribute\s+([^>]+?)\s*\/?>/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(body)) !== null) {
      const aa = parseXmlAttrs(am[1]);
      attributes.push({
        name: aa.name,
        value: aa.value,
        owner: aa.owner || '',
        conflict: (aa.conflict as E3Attribute['conflict']) || 'flux',
        service: aa.service === 'true',
      });
    }

    devices.push({
      id: da.id,
      elementId: da.elementId || da.id,
      designation: da.designation,
      componentName: da.componentName,
      article: da.article || '',
      manufacturer: da.manufacturer || '',
      category: (da.category as E3Device['category']) || 'breaker',
      sheetId: da.sheetId || sheets[0]?.id || 'sheet-1',
      x: Number(da.x || 0),
      y: Number(da.y || 0),
      rotation: (Number(da.rotation || 0) % 360) as 0 | 90 | 180 | 270,
      width: Number(da.width || 100),
      height: Number(da.height || 100),
      e3BlockName: da.e3BlockName || 'GOST_GENERIC',
      bindingState: (da.bindingState as E3Device['bindingState']) || 'PLACED',
      pins,
      attributes,
    });
  }

  // Wires
  const wires: E3Wire[] = [];
  const wireRe = /<Wire\s+([^>]+?)\s*\/?>/g;
  let wm: RegExpExecArray | null;
  while ((wm = wireRe.exec(xml)) !== null) {
    const wa = parseXmlAttrs(wm[1]);
    const waypoints = (wa.waypoints || '')
      .split(';')
      .filter(Boolean)
      .map((pair) => {
        const [x, y] = pair.split(',').map(Number);
        return { x: x || 0, y: y || 0 };
      });
    wires.push({
      id: wa.id,
      sheetId: wa.sheetId,
      netName: wa.netName,
      signalType: (wa.signalType as SignalType) || 'signal',
      fromDeviceId: wa.fromDeviceId,
      fromPinId: wa.fromPinId,
      toDeviceId: wa.toDeviceId,
      toPinId: wa.toPinId,
      waypoints,
      crossSection: wa.crossSection || '1.5 мм²',
      wireNumber: wa.wireNumber || wa.netName,
      cableId: wa.cableId || undefined,
      coreNumber: wa.coreNumber || undefined,
    });
  }

  // Annotations
  const annotations: E3Annotation[] = [];
  const annRe = /<Annotation\s+([^>]+?)\s*\/?>/g;
  let anm: RegExpExecArray | null;
  while ((anm = annRe.exec(xml)) !== null) {
    const aa = parseXmlAttrs(anm[1]);
    const kind: AnnotationKind =
      aa.kind === 'rect' || aa.kind === 'callout' ? aa.kind : 'text';
    annotations.push({
      id: aa.id,
      sheetId: aa.sheetId || sheets[0]?.id || 'sheet-1',
      kind,
      x: Number(aa.x || 0),
      y: Number(aa.y || 0),
      width: Number(aa.width || 160),
      height: Number(aa.height || 40),
      text: aa.text || '',
      color: aa.color || undefined,
      fontSize: aa.fontSize ? Number(aa.fontSize) : undefined,
    });
  }

  return {
    schemaVersion: rootAttrs.schemaVersion || '1.0',
    id: rootAttrs.id || `proj-${Date.now()}`,
    name: rootAttrs.name || 'Импортированный проект E3',
    projectCode: rootAttrs.projectCode || 'E3-IMPORT',
    fluxProjectKey: rootAttrs.fluxProjectKey || `FLUX_${Date.now()}`,
    author: rootAttrs.author || 'Инженер',
    revision: Number(rootAttrs.revision || 1),
    standard: rootAttrs.standard === 'IEC' ? 'IEC' : 'GOST',
    updatedAt: rootAttrs.updatedAt || new Date().toISOString(),
    sheets,
    devices,
    wires,
    cables,
    annotations,
    visualSettings,
  };
}

// ============================================================================
// Flux E3 Bridge Bidirectional Exchange (compatible with e3/exportTypes.ts)
// ============================================================================

export function exportToFluxBridge(project: E3Project): FluxBridgeBundle {
  const nodes: FluxExportNode[] = project.devices.map((dev) => ({
    elementId: dev.elementId,
    version: `rev-${project.revision}-${dev.id}`,
    tag: dev.attributes.find((a) => a.name === 'Тег КИП')?.value || dev.designation,
    designation: dev.designation,
    status: dev.article ? 'one' : 'none',
    solutionId: `sol-${dev.e3BlockName.toLowerCase()}`,
    solutionName: dev.e3BlockName,
    rect: {
      sheet: dev.sheetId,
      x: dev.x,
      y: dev.y,
      rotation: dev.rotation,
      width: dev.width,
      height: dev.height,
    },
    attrs: [
      { name: 'Артикул', value: dev.article, owner: '', conflict: 'flux' },
      { name: 'Производитель', value: dev.manufacturer, owner: '', conflict: 'flux' },
      { name: 'Наименование', value: dev.componentName, owner: '', conflict: 'flux' },
      ...dev.attributes.map((a) => ({
        name: a.name,
        value: a.value,
        owner: a.owner,
        conflict: a.conflict,
        service: a.service,
      })),
    ],
    checked: dev.bindingState !== 'REMOVED_IN_FLUX',
  }));

  return {
    format: 'flux-e3-bridge/v1',
    fluxProjectKey: project.fluxProjectKey,
    projectName: project.name,
    exportedAt: new Date().toISOString(),
    revision: project.revision,
    visualSettings: structuredClone(project.visualSettings),
    nodes,
    wires: structuredClone(project.wires),
    cables: structuredClone(project.cables),
    sheets: structuredClone(project.sheets),
  };
}

export function importFromFluxBridge(bundle: FluxBridgeBundle, baseProject: E3Project): E3Project {
  if (bundle.format !== 'flux-e3-bridge/v1') {
    throw new Error('Неподдерживаемый формат моста Flux E3.');
  }

  const isSameProject =
    Boolean(bundle.fluxProjectKey) &&
    bundle.fluxProjectKey === baseProject.fluxProjectKey &&
    !(bundle as unknown as { replaceAll?: boolean }).replaceAll;

  const next = structuredClone(baseProject);
  next.name = bundle.projectName || next.name;
  next.fluxProjectKey = bundle.fluxProjectKey || next.fluxProjectKey;
  next.revision = Math.max(next.revision + 1, bundle.revision || next.revision + 1);
  next.updatedAt = new Date().toISOString();
  if (bundle.sheets?.length) next.sheets = structuredClone(bundle.sheets);
  if (bundle.wires?.length) next.wires = structuredClone(bundle.wires);
  else if (!isSameProject) next.wires = [];
  if (bundle.cables?.length) next.cables = structuredClone(bundle.cables);
  else if (!isSameProject) next.cables = [];
  if (bundle.visualSettings) next.visualSettings = parseVisualSettings(JSON.stringify(bundle.visualSettings));

  if (!isSameProject) {
    next.devices = [];
  }

  const existingByElementId = new Map(next.devices.map((d) => [d.elementId, d]));

  for (const node of bundle.nodes) {
    const existing = existingByElementId.get(node.elementId);
    const article = node.attrs.find((a) => a.name === 'Артикул')?.value || '';
    const manufacturer = node.attrs.find((a) => a.name === 'Производитель')?.value || '';
    const componentName = node.attrs.find((a) => a.name === 'Наименование')?.value || node.solutionName || node.designation;
    const customAttrs: E3Attribute[] = node.attrs
      .filter((a) => !['Артикул', 'Производитель', 'Наименование'].includes(a.name))
      .map((a) => ({
        name: a.name,
        value: a.value,
        owner: a.owner || '',
        conflict: a.conflict || 'flux',
        service: a.service,
      }));

    const sheetTarget = node.rect?.sheet || (node as unknown as { sheetId?: string }).sheetId || next.sheets[0]?.id || 'sheet-1';
    const nodeX = node.rect?.x ?? (node as unknown as { x?: number }).x ?? 180;
    const nodeY = node.rect?.y ?? (node as unknown as { y?: number }).y ?? 180;
    const nodeW = node.rect?.width ?? 0;
    const nodeH = node.rect?.height ?? 0;
    const nodeRot = ((node.rect?.rotation ?? 0) % 360) as 0 | 90 | 180 | 270;
    const isChecked = node.checked !== false;

    if (existing) {
      existing.designation = node.designation;
      existing.article = article || existing.article;
      existing.manufacturer = manufacturer || existing.manufacturer;
      existing.componentName = componentName || existing.componentName;
      existing.sheetId = sheetTarget;
      existing.x = nodeX;
      existing.y = nodeY;
      existing.rotation = nodeRot;
      existing.e3BlockName = node.solutionName || existing.e3BlockName;
      existing.bindingState = isChecked ? 'PLACED' : 'REMOVED_IN_FLUX';
      existing.attributes = customAttrs;
    } else {
      const prefix = node.designation.replace(/^-/, '').replace(/\d.*$/, '').toUpperCase();
      const catItem =
        E3_CATALOG.find((c) => c.e3BlockName === node.solutionName) ||
        E3_CATALOG.find((c) => c.defaultPrefix === prefix) ||
        E3_CATALOG[0];
      const newId = `dev-${node.elementId}`;
      next.devices.push({
        id: newId,
        elementId: node.elementId,
        designation: node.designation,
        componentName,
        article: article || catItem.article,
        manufacturer: manufacturer || catItem.manufacturer,
        category: catItem.category,
        sheetId: sheetTarget,
        x: nodeX,
        y: nodeY,
        rotation: nodeRot,
        width: nodeW || catItem.width,
        height: nodeH || catItem.height,
        e3BlockName: node.solutionName || catItem.e3BlockName,
        bindingState: isChecked ? 'PLACED' : 'REMOVED_IN_FLUX',
        pins: catItem.pins.map((p, idx) => ({ ...p, id: `${newId}-p${idx + 1}` })),
        attributes: customAttrs,
      });
    }
  }

  return next;
}

// ============================================================================
// Visual Settings Synchronization Export & Import
// ============================================================================

export function exportVisualSettings(settings: E3VisualSettings): string {
  return JSON.stringify(
    {
      format: 'flux-e3-visual-settings/v1',
      exportedAt: new Date().toISOString(),
      settings,
    },
    null,
    2
  );
}

export function parseVisualSettings(rawJson: string): E3VisualSettings {
  const parsed = JSON.parse(rawJson);
  const src = parsed?.format === 'flux-e3-visual-settings/v1' ? parsed.settings : parsed;
  if (!src || typeof src !== 'object') {
    throw new Error('Некорректный JSON настроек визуализации.');
  }
  return {
    ...structuredClone(DEFAULT_VISUAL_SETTINGS),
    ...src,
    netColors: {
      ...DEFAULT_VISUAL_SETTINGS.netColors,
      ...(src.netColors || {}),
    },
  };
}

// ============================================================================
// AutoCAD / CAD ASCII DXF Exporter
// ============================================================================

export function exportToDxf(project: E3Project, sheetId?: string): string {
  const targetSheet = project.sheets.find((s) => s.id === sheetId) || project.sheets[0];
  if (!targetSheet) return '';

  const h = targetSheet.height;
  const flipY = (y: number) => h - y; // DXF Y-axis points up

  const out: string[] = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];

  const addLine = (x1: number, y1: number, x2: number, y2: number, layer: string, color = 7) => {
    out.push(
      '0',
      'LINE',
      '8',
      layer,
      '62',
      String(color),
      '10',
      String(x1),
      '20',
      String(flipY(y1)),
      '30',
      '0',
      '11',
      String(x2),
      '21',
      String(flipY(y2)),
      '31',
      '0'
    );
  };

  const addText = (x: number, y: number, text: string, height: number, layer: string, color = 7) => {
    out.push(
      '0',
      'TEXT',
      '8',
      layer,
      '62',
      String(color),
      '10',
      String(x),
      '20',
      String(flipY(y)),
      '30',
      '0',
      '40',
      String(height),
      '1',
      text
    );
  };

  // Sheet border
  addLine(20, 20, targetSheet.width - 20, 20, 'GOST_FRAME', 7);
  addLine(targetSheet.width - 20, 20, targetSheet.width - 20, h - 20, 'GOST_FRAME', 7);
  addLine(targetSheet.width - 20, h - 20, 20, h - 20, 'GOST_FRAME', 7);
  addLine(20, h - 20, 20, 20, 'GOST_FRAME', 7);
  addText(40, h - 35, `${targetSheet.titleBlock.documentCode} - ${targetSheet.name}`, 12, 'GOST_FRAME', 7);

  // Devices
  const sheetDevices = project.devices.filter((d) => d.sheetId === targetSheet.id);
  for (const dev of sheetDevices) {
    const x1 = dev.x;
    const y1 = dev.y;
    const x2 = dev.x + dev.width;
    const y2 = dev.y + dev.height;
    addLine(x1, y1, x2, y1, 'E3_DEVICES', 3);
    addLine(x2, y1, x2, y2, 'E3_DEVICES', 3);
    addLine(x2, y2, x1, y2, 'E3_DEVICES', 3);
    addLine(x1, y2, x1, y1, 'E3_DEVICES', 3);
    addText(x1, y1 - 8, `${dev.designation} (${dev.article})`, 10, 'E3_LABELS', 7);
  }

  // Wires
  const sheetWires = project.wires.filter((w) => w.sheetId === targetSheet.id);
  for (const wire of sheetWires) {
    for (let i = 0; i < wire.waypoints.length - 1; i++) {
      const p1 = wire.waypoints[i];
      const p2 = wire.waypoints[i + 1];
      addLine(p1.x, p1.y, p2.x, p2.y, 'E3_WIRES', 1);
    }
    if (wire.waypoints.length >= 2) {
      const mid = wire.waypoints[Math.floor(wire.waypoints.length / 2)];
      addText(mid.x + 4, mid.y - 4, wire.wireNumber, 8, 'E3_NETS', 5);
    }
  }

  // Drafting Annotations
  const sheetAnnotations = (project.annotations || []).filter((a) => a.sheetId === targetSheet.id);
  for (const ann of sheetAnnotations) {
    if (ann.kind === 'rect') {
      addLine(ann.x, ann.y, ann.x + ann.width, ann.y, 'E3_ANNOTATIONS', 4);
      addLine(ann.x + ann.width, ann.y, ann.x + ann.width, ann.y + ann.height, 'E3_ANNOTATIONS', 4);
      addLine(ann.x + ann.width, ann.y + ann.height, ann.x, ann.y + ann.height, 'E3_ANNOTATIONS', 4);
      addLine(ann.x, ann.y + ann.height, ann.x, ann.y, 'E3_ANNOTATIONS', 4);
      addText(ann.x + 8, ann.y + 16, ann.text, ann.fontSize || 11, 'E3_ANNOTATIONS', 4);
    } else if (ann.kind === 'callout') {
      addLine(ann.x, ann.y + ann.height, ann.x + 24, ann.y + 18, 'E3_ANNOTATIONS', 2);
      addLine(ann.x + 24, ann.y + 18, ann.x + 24 + ann.width, ann.y + 18, 'E3_ANNOTATIONS', 2);
      addText(ann.x + 28, ann.y + 12, ann.text, ann.fontSize || 11, 'E3_ANNOTATIONS', 7);
    } else {
      addText(ann.x, ann.y, ann.text, ann.fontSize || 12, 'E3_ANNOTATIONS', 7);
    }
  }

  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n');
}

// ============================================================================
// CSV & Printable HTML Report Exporters
// ============================================================================

export function exportBomCsv(rows: BomRow[]): string {
  const header = ['Поз.', 'Обозначение', 'Наименование', 'Артикул', 'Производитель', 'Кол-во', 'Ед.', 'Примечание'];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(';')];
  for (const r of rows) {
    lines.push(
      [r.pos, r.designationText, r.componentName, r.article, r.manufacturer, r.quantity, r.unit, r.note]
        .map(esc)
        .join(';')
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}

export function exportCableJournalCsv(rows: CableJournalRow[]): string {
  const header = ['Кабель', 'Марка', 'Жилы (исп./всего)', 'Сечение', 'Длина, м', 'Откуда', 'Куда', 'Экран'];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.designation,
        r.cableType,
        `${r.usedCores}/${r.coresCount}`,
        r.crossSection,
        r.lengthMeters,
        r.fromDevice,
        r.toDevice,
        r.shielded ? 'Да' : 'Нет',
      ]
        .map(esc)
        .join(';')
    );
  }
  return '\uFEFF' + lines.join('\r\n');
}

function vbsEsc(str: string): string {
  return String(str ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/"/g, '""');
}

export function generateE3ComScript(
  project?: E3Project,
  scriptMode: 'build' | 'export' = 'build',
  importFilePath?: string
): string {
  const code = project?.projectCode || 'FLUX-E3-PRJ';
  const name = project?.name || 'Проект E3ProMax';
  const fluxKey = project?.fluxProjectKey || 'FLUX_KEY';
  const author = project?.author || 'Инженер';
  const sheets = project?.sheets || [];
  const devices = project?.devices || [];
  const cables = project?.cables || [];
  const wires = project?.wires || [];

  const sheetMap = new Map(sheets.map((s, idx) => [s.id, { sheet: s, varName: `shId_${idx + 1}`, idx: idx + 1 }]));

  const sheetDecl = sheets.map((_, idx) => `shId_${idx + 1}, shX1_${idx + 1}, shY1_${idx + 1}, shX2_${idx + 1}, shY2_${idx + 1}`).join(', ');
  const sheetLines = sheets
    .map((s, i) => {
      const idx = i + 1;
      const varName = `shId_${idx}`;
      return `  ${varName} = CreateOrGetSheet(Prj, Sheet, "${vbsEsc(s.number + '. ' + s.name)}", "${vbsEsc(s.format)}", detectedFmt, ${idx === 1 ? 'True' : 'False'}, exIds, exCnt)
  If ${varName} > 0 Then
    sheetsOk = sheetsOk + 1
    Call GetSheetBounds(Sheet, ${varName}, "${vbsEsc(s.format)}", shX1_${idx}, shY1_${idx}, shX2_${idx}, shY2_${idx})
    Call DrawGostFrame(Graph, ${varName}, shX1_${idx}, shY1_${idx}, shX2_${idx}, shY2_${idx}, "${vbsEsc(s.titleBlock.documentCode)}", "${vbsEsc(s.name)}", "${vbsEsc(s.titleBlock.designer)}")
  End If`;
    })
    .join('\n');

  const devLines = devices
    .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
    .map((d) => {
      const shEntry = sheetMap.get(d.sheetId);
      const sw = shEntry?.sheet.width || 1400;
      const sh = shEntry?.sheet.height || 920;
      const idx = shEntry?.idx || (sheets.length > 0 ? 1 : 0);
      const shVar = idx > 0 ? `shId_${idx}` : '0';

      const rawAttrs: Array<[string, string]> = [
        ['Артикул', d.article],
        ['Производитель', d.manufacturer],
        ['Наименование', d.componentName],
        ['Категория', d.category],
        ['FLUX_ELEMENT_ID', d.elementId],
        ['FLUX_BLOCK', d.e3BlockName],
        ...d.attributes.filter((a) => !a.service).map((a): [string, string] => [a.name, a.value]),
      ];
      const attrList = rawAttrs.filter(([, v]) => String(v || '').trim() !== '');

      const attrsOnDevLines = attrList
        .map(([k, v]) => `    Call SafeSetDevAttr(Dev, "${vbsEsc(k)}", "${vbsEsc(v)}")`)
        .join('\n');

      const attrsOnGrpLines = attrList
        .map(([k, v]) => `      Call SafeSetGraphAttr(Graph, "${vbsEsc(k)}", "${vbsEsc(v)}")`)
        .join('\n');

      const pinCreateLines = d.pins
        .map((p) => {
          const abs = getAbsolutePinPos(d, p);
          return `    Call SafeCreateDevicePin(Prj, PinObj, curDevId, ${shVar}, "${vbsEsc(p.name)}", MapX(shX1_${idx}, shX2_${idx}, ${abs.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${abs.y}, ${sh}))`;
        })
        .join('\n');

      const pinDrawLines = d.pins
        .map((p) => {
          const abs = getAbsolutePinPos(d, p);
          return `    Call DrawPinTickGrouped(Graph, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${abs.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${abs.y}, ${sh}), "${vbsEsc(abs.direction)}", "${vbsEsc(p.name)}", gIds, gCnt)`;
        })
        .join('\n');

      return `  ' --- Цельное изделие ${vbsEsc(d.designation)} (${vbsEsc(d.componentName)}) ---
  curDevId = CreateFluxDevice(Prj, Dev, Sym, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${d.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${d.y + d.height}, ${sh}), MapX(shX1_${idx}, shX2_${idx}, ${d.x + d.width}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${d.y}, ${sh}), "${vbsEsc(d.designation)}", "${vbsEsc(d.componentName)}", "${vbsEsc(d.article)}", "${vbsEsc(d.e3BlockName)}", "${vbsEsc(d.manufacturer)}")
  If curDevId > 0 Then
    devDbOk = devDbOk + 1
${attrsOnDevLines}
${pinCreateLines}
  End If
  If ${shVar} > 0 Then
    gCnt = 0
    ReDim gIds(128)
    Call DrawDeviceBox(Graph, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${d.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${d.y + d.height}, ${sh}), MapX(shX1_${idx}, shX2_${idx}, ${d.x + d.width}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${d.y}, ${sh}), "${vbsEsc(d.designation)}", "${vbsEsc(d.article)}", "${vbsEsc(d.category)}", gIds, gCnt)
${pinDrawLines}
    curGrpId = FinalizeIntegralDeviceGroup(Graph, ${shVar}, gIds, gCnt, curDevId)
    If curGrpId > 0 Then
      Graph.SetId curGrpId
      Call SafeSetGraphAttr(Graph, "Обозначение", "${vbsEsc(d.designation)}")
${attrsOnGrpLines}
    End If
    devGfxOk = devGfxOk + 1
  End If`;
    })
    .join('\n');

  const wireLines = wires
    .filter((w) => w.waypoints.length >= 2)
    .map((w) => {
      const shEntry = sheetMap.get(w.sheetId);
      const sw = shEntry?.sheet.width || 1400;
      const sh = shEntry?.sheet.height || 920;
      const idx = shEntry?.idx || (sheets.length > 0 ? 1 : 0);
      const shVar = idx > 0 ? `shId_${idx}` : '0';
      const colCode =
        w.signalType === 'power' ? 1 : w.signalType === 'neutral' ? 4 : w.signalType === 'pe' ? 3 : 6;
      const segs: string[] = [];
      for (let i = 0; i < w.waypoints.length - 1; i++) {
        const p1 = w.waypoints[i];
        const p2 = w.waypoints[i + 1];
        segs.push(
          `    If DrawWireSeg(Prj, Con, Graph, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${p1.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${p1.y}, ${sh}), MapX(shX1_${idx}, shX2_${idx}, ${p2.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${p2.y}, ${sh}), ${colCode}) Then wiresOk = wiresOk + 1 Else wiresErr = wiresErr + 1`
        );
      }
      const mid = w.waypoints[Math.floor(w.waypoints.length / 2)];
      segs.push(
        `    Call DrawWireLabel(Graph, ${shVar}, MapX(shX1_${idx}, shX2_${idx}, ${mid.x}, ${sw}), MapY(shY1_${idx}, shY2_${idx}, ${mid.y}, ${sh}), "${vbsEsc(w.wireNumber || w.netName)}", ${colCode})`
      );
      return `  If ${shVar} > 0 Then\n${segs.join('\n')}\n  End If`;
    })
    .join('\n');

  const cableLines = cables
    .map(
      (c) =>
        `  If CreateFluxCable(Prj, Dev, "${vbsEsc(c.designation)}", "${vbsEsc(c.cableType)}", "${vbsEsc(c.fromDevice)}", "${vbsEsc(c.toDevice)}", ${c.lengthMeters}) Then cabOk = cabOk + 1`
    )
    .join('\n');

  const entryCall =
    scriptMode === 'export' ? 'Call ExportActiveE3sToFluxJson()' : 'Call BuildNativeE3sProject()';

  return `' ============================================================================
' E3ProMax <-> Zuken E3.series 2022 SP2 (Build 23.20+) COM Bridge Script
' Проект: ${vbsEsc(name)} (${vbsEsc(code)})
' Ключ синхронизации: ${vbsEsc(fluxKey)}
' Режим скрипта: ${scriptMode === 'export' ? 'Выгрузка из E3.series в E3ProMax (.json)' : 'Прямой перенос и открытие в E3.series (.e3s)'}
'
' КАК ЗАПУСТИТЬ:
'   Двойной клик по файлу .vbs (при открытом E3.series / E3.cable)
'   или внутри E3.series: Сервис -> Выполнить скрипт (Tools -> Execute Script).
' Лог выполнения сохраняется рядом со скриптом в: flux_e3_com_debug.log (UTF-8)
' ============================================================================
Option Explicit

Dim App, Prj, Sheet, Dev, Sym, PinObj, Graph, Con, outFolder, fso, logFilePath, gImportFilePath
Dim curDevId, curGrpId, gIds(), gCnt
${sheetDecl ? `Dim ${sheetDecl}` : ''}
Set fso = CreateObject("Scripting.FileSystemObject")

outFolder = fso.GetParentFolderName(WScript.ScriptFullName)
If outFolder = "" Then outFolder = "D:\\Downloads"
logFilePath = outFolder & "\\flux_e3_com_debug.log"
gImportFilePath = "${vbsEsc(importFilePath || '')}"
If WScript.Arguments.Named.Exists("file") Then
  gImportFilePath = WScript.Arguments.Named("file")
End If

Call InitUtf8Log()
Call LogTrace("INFO", "=== Старт E3ProMax COM Bridge (${scriptMode}) ===")
Call LogTrace("INFO", "WSH=" & WScript.FullName & " v" & WScript.Version & " | outFolder=" & outFolder)
Call LogTrace("INFO", "Проект: ${vbsEsc(code)} (${vbsEsc(name)}) | Листов=${sheets.length}, Изделий=${devices.length}, Цепей=${wires.length}, Кабелей=${cables.length}")

On Error Resume Next
Set App = GetObject(, "CT.Application")
If Err.Number <> 0 Then
  Call LogTrace("WARN", "GetObject(CT.Application) не нашёл открытый экземпляр: #" & Err.Number & " " & Err.Description)
  Err.Clear
End If
If App Is Nothing Then
  Call LogTrace("INFO", "Пробуем создать экземпляр через CreateObject(CT.Application)...")
  Set App = CreateObject("CT.Application")
  If Err.Number <> 0 Then
    Call LogTrace("ERROR", "CreateObject(CT.Application) ошибка #" & Err.Number & ": " & Err.Description)
    Err.Clear
  End If
End If
On Error GoTo 0

If App Is Nothing Then
  Call LogTrace("ERROR", "КРИТИЧЕСКАЯ ОШИБКА: не удалось подключиться к Zuken E3.series (CT.Application). Проверьте запуск E3.series и разрядность (64/32 bit).")
  If Not WScript.Arguments.Named.Exists("silent") Then
    MsgBox "Не удалось подключиться к Zuken E3.series (CT.Application)." & vbCrLf & "Запустите E3.series и проверьте лог: " & logFilePath, vbCritical, "E3ProMax Bridge"
  End If
  WScript.Quit 1
End If

Call LogTrace("INFO", "Подключено к CT.Application успешно.")
Set Prj = App.CreateJobObject()
Set Sheet = Prj.CreateSheetObject()
Set Dev = Prj.CreateDeviceObject()
Set Sym = Prj.CreateSymbolObject()
Set PinObj = Prj.CreatePinObject()
Set Graph = Prj.CreateGraphObject()
Set Con = Prj.CreateConnectionObject()

${entryCall}
Call LogTrace("INFO", "=== Завершение E3ProMax COM Bridge ===")

Sub InitUtf8Log()
  On Error Resume Next
  Dim stInit
  If Not fso.FileExists(logFilePath) Then
    Set stInit = CreateObject("ADODB.Stream")
    stInit.Type = 2
    stInit.Charset = "utf-8"
    stInit.Open
    stInit.WriteText ""
    stInit.SaveToFile logFilePath, 2
    stInit.Close
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub LogTrace(ByVal lvl, ByVal msg)
  On Error Resume Next
  Dim ts, lineTxt, tf, existingTxt, stLog
  ts = Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & " " & Right("0" & Hour(Now), 2) & ":" & Right("0" & Minute(Now), 2) & ":" & Right("0" & Second(Now), 2)
  lineTxt = "[" & ts & "] [" & lvl & "] " & msg
  WScript.Echo lineTxt
  existingTxt = ""
  Set stLog = CreateObject("ADODB.Stream")
  If Err.Number = 0 Then
    stLog.Type = 2
    stLog.Charset = "utf-8"
    If fso.FileExists(logFilePath) Then
      stLog.Open
      stLog.LoadFromFile logFilePath
      existingTxt = stLog.ReadText
      stLog.Close
    End If
    stLog.Open
    stLog.WriteText existingTxt & lineTxt & vbCrLf
    stLog.SaveToFile logFilePath, 2
    stLog.Close
  Else
    Err.Clear
    Set tf = fso.OpenTextFile(logFilePath, 8, True, 0)
    If Err.Number = 0 Then
      tf.WriteLine lineTxt
      tf.Close
    End If
  End If
  Err.Clear
  If Not (App Is Nothing) Then
    If lvl = "ERROR" Then
      App.PutInfo 2, "[E3ProMax] " & msg
    ElseIf lvl = "WARN" Then
      App.PutInfo 1, "[E3ProMax] " & msg
    Else
      App.PutInfo 0, "[E3ProMax] " & msg
    End If
    Err.Clear
  End If
  On Error GoTo 0
End Sub

Function MapX(ByVal xMin, ByVal xMax, ByVal fx, ByVal sw)
  Dim usableW, padX
  If sw <= 0 Then sw = 1400
  usableW = xMax - xMin
  padX = usableW * 0.03
  If padX < 4 Then padX = 4
  MapX = Round(xMin + padX + (fx / sw) * (usableW - padX * 2), 2)
End Function

Function MapY(ByVal yMin, ByVal yMax, ByVal fy, ByVal sh)
  Dim usableH, padBot, padTop
  If sh <= 0 Then sh = 920
  usableH = yMax - yMin
  padBot = usableH * 0.14
  padTop = usableH * 0.04
  If padBot < 25 Then padBot = 25
  If padTop < 6 Then padTop = 6
  MapY = Round(yMax - padTop - (fy / sh) * (usableH - padBot - padTop), 2)
End Function

Sub BuildNativeE3sProject()
  Dim targetE3s, prjName, ans, detectedFmt, exIds, exCnt
  Dim sheetsOk, devDbOk, devGfxOk, wiresOk, wiresErr, cabOk
  prjName = "${vbsEsc(code)}"
  targetE3s = outFolder & "\\" & prjName & "_native.e3s"
  detectedFmt = "" : exCnt = 0
  sheetsOk = 0 : devDbOk = 0 : devGfxOk = 0 : wiresOk = 0 : wiresErr = 0 : cabOk = 0

  On Error Resume Next
  If Prj.GetId() > 0 Then
    Call LogTrace("INFO", "В E3 уже открыт проект ID=" & Prj.GetId() & " Name='" & Prj.GetName() & "'")
    If WScript.Arguments.Named.Exists("silent") Then
      Prj.Close
      Err.Clear
      Call LogTrace("INFO", "Silent-режим: закрыт предыдущий проект, вызываем Prj.Create('" & prjName & "')")
      Prj.Create prjName
    Else
      ans = MsgBox("В E3.series уже открыт проект '" & Prj.GetName() & "'." & vbCrLf & vbCrLf & "Да = закрыть его и создать новый '" & prjName & "'" & vbCrLf & "Нет = добавить элементы E3ProMax в текущий проект", vbYesNoCancel + vbQuestion, "E3ProMax -> E3.series")
      If ans = vbCancel Then Exit Sub
      If ans = vbYes Then
        Prj.Close
        Err.Clear
        Prj.Create prjName
      End If
    End If
  Else
    Call LogTrace("INFO", "Открытый проект отсутствует, вызываем Prj.Create('" & prjName & "')")
    Prj.Create prjName
  End If
  If Err.Number <> 0 Then
    Call LogTrace("ERROR", "Ошибка открытия/создания проекта #" & Err.Number & ": " & Err.Description)
    Err.Clear
  Else
    Call LogTrace("INFO", "Активный проект ID=" & Prj.GetId() & " Name='" & Prj.GetName() & "'")
  End If

  exCnt = Prj.GetSheetIds(exIds)
  If Err.Number = 0 And exCnt > 0 Then
    Sheet.SetId exIds(1)
    detectedFmt = Sheet.GetFormat()
    Call LogTrace("INFO", "Обнаружены стартовые листы шаблона E3: " & exCnt & " шт., формат='" & detectedFmt & "' (ID1=" & exIds(1) & ")")
  Else
    Err.Clear
  End If

  Call Prj.SetAttributeValue("FLUX_PROJECT", "${vbsEsc(fluxKey)}")
  Call Prj.SetAttributeValue("Наименование", "${vbsEsc(name)}")
  Call Prj.SetAttributeValue("Автор", "${vbsEsc(author)}")
  Err.Clear
  On Error GoTo 0

  Call LogTrace("INFO", "Перенос листов (${sheets.length}), изделий (${devices.length}), цепей (${wires.length}), кабелей (${cables.length})...")

  ' 1. Листы и рамки ГОСТ (${sheets.length})
${sheetLines || "  ' (нет листов)"}

  ' 2. Изделия в дерево проекта + графика УГО и выводы на листах (${devices.length})
${devLines || "  ' (нет устройств)"}

  ' 3. Цепи и соединения (${wires.length})
${wireLines || "  ' (нет цепей)"}

  ' 4. Кабельные связи (${cables.length})
${cableLines || "  ' (нет кабелей)"}

  Call LogTrace("INFO", "Итог переноса в E3: листов=" & sheetsOk & "/${sheets.length}, графика УГО=" & devGfxOk & ", в базе E3=" & devDbOk & ", сегм. цепей=" & wiresOk & " (ошибок=" & wiresErr & "), кабелей=" & cabOk)

  ' Показываем первый лист сразу на экране E3.series
  ${sheets.length > 0 ? 'If shId_1 > 0 Then\n    On Error Resume Next\n    Sheet.SetId shId_1\n    Sheet.Display\n    If Err.Number <> 0 Then\n      Call LogTrace("WARN", "Sheet.Display ошибка #" & Err.Number & ": " & Err.Description)\n      Err.Clear\n    Else\n      Call LogTrace("INFO", "Открыт лист ID=" & shId_1 & " на экране E3.series (Sheet.Display).")\n    End If\n    On Error GoTo 0\n  End If' : ''}

  On Error Resume Next
  Call Prj.SaveAs(targetE3s)
  If Err.Number <> 0 Then
    Call LogTrace("WARN", "Prj.SaveAs('" & targetE3s & "') вернул #" & Err.Number & ": " & Err.Description & " (проект открыт в E3, сохраните вручную)")
    Err.Clear
  Else
    Call LogTrace("INFO", "Проект успешно сохранён: " & targetE3s)
  End If
  On Error GoTo 0
End Sub

Function CreateOrGetSheet(ByRef p, ByRef sh, ByVal shName, ByVal fmt, ByVal detectedFmt, ByVal isFirst, ByRef exIds, ByVal exCnt)
  On Error Resume Next
  Dim res, newId, candList, cand, cyrFmt, dinFmt, iC, triedStr, lastErr
  newId = 0
  triedStr = ""
  lastErr = ""

  If Left(fmt, 1) = "A" Then
    cyrFmt = "А" & Mid(fmt, 2)
    dinFmt = "DIN" & fmt
  Else
    cyrFmt = fmt
    dinFmt = "DIN" & fmt
  End If

  candList = Array(detectedFmt, fmt, dinFmt, "DIN " & fmt, cyrFmt, fmt & "_sp_1", fmt & "_1", "ГОСТ " & fmt, "ГОСТ_" & fmt, "GOST_" & fmt, fmt & "-ГОСТ", fmt & "_ГОСТ", "Форма 1", "A3", "DINA3", "А3", "A4", "DINA4", "А4", "")

  For iC = 0 To UBound(candList)
    cand = Trim(CStr(candList(iC)))
    If cand <> "" Or iC = UBound(candList) Then
      If triedStr <> "" Then triedStr = triedStr & ","
      triedStr = triedStr & "'" & cand & "'"
      Err.Clear
      res = sh.Create(0, shName, cand, 0, 0)
      If Err.Number = 450 Then
        Err.Clear
        res = sh.Create(0, shName, cand, 0)
      End If
      If Err.Number = 0 Then
        If res > 0 Then
          newId = res
        ElseIf sh.GetId() > 0 Then
          newId = sh.GetId()
        End If
      Else
        lastErr = "#" & Err.Number & " " & Err.Description
        Err.Clear
      End If
      If newId > 0 Then
        Call LogTrace("INFO", "Лист '" & shName & "' создан ID=" & newId & " (формат='" & cand & "')")
        Exit For
      End If
    End If
  Next

  If newId <= 0 And isFirst And exCnt > 0 Then
    Err.Clear
    sh.SetId exIds(1)
    sh.SetName shName
    newId = exIds(1)
    Call LogTrace("WARN", "Не удалось создать новый лист '" & shName & "' через Sheet.Create (" & lastErr & "), переименован и использован стартовый лист шаблона ID=" & newId)
  ElseIf newId <= 0 Then
    Call LogTrace("WARN", "Не удалось создать лист '" & shName & "' (проверены форматы: " & triedStr & "), err=" & lastErr)
  End If

  Err.Clear
  On Error GoTo 0
  CreateOrGetSheet = newId
End Function

Sub GetSheetBounds(ByRef sh, ByVal shId, ByVal fmt, ByRef xMin, ByRef yMin, ByRef xMax, ByRef yMax)
  On Error Resume Next
  Dim ax1, ay1, ax2, ay2
  ax1 = 0 : ay1 = 0 : ax2 = 0 : ay2 = 0
  sh.SetId shId
  Call sh.GetDrawingArea(ax1, ay1, ax2, ay2)
  If Err.Number = 0 And ax2 > ax1 And ay2 > ay1 Then
    xMin = ax1 : yMin = ay1 : xMax = ax2 : yMax = ay2
    Call LogTrace("INFO", "Границы листа ID=" & shId & ": X=[" & Round(xMin,1) & ".." & Round(xMax,1) & "], Y=[" & Round(yMin,1) & ".." & Round(yMax,1) & "]")
  Else
    Err.Clear
    If fmt = "A4" Then
      xMin = 10 : yMin = 10 : xMax = 287 : yMax = 200
    ElseIf fmt = "A2" Then
      xMin = 10 : yMin = 10 : xMax = 584 : yMax = 410
    ElseIf fmt = "A1" Then
      xMin = 10 : yMin = 10 : xMax = 831 : yMax = 584
    Else
      xMin = 10 : yMin = 10 : xMax = 410 : yMax = 287
    End If
    Call LogTrace("INFO", "Границы листа ID=" & shId & " по умолчанию (" & fmt & "): X=[" & xMin & ".." & xMax & "], Y=[" & yMin & ".." & yMax & "]")
  End If
  On Error GoTo 0
End Sub

Sub DrawGostFrame(ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal docCode, ByVal shName, ByVal designer)
  On Error Resume Next
  Dim gid, bx(5), by(5), tbLeft
  gid = g.CreateRectangle(shId, x1, y1, x2, y2)
  If gid <= 0 Or Err.Number <> 0 Then
    Err.Clear
    bx(1) = x1 : by(1) = y1 : bx(2) = x2 : by(2) = y1 : bx(3) = x2 : by(3) = y2 : bx(4) = x1 : by(4) = y2 : bx(5) = x1 : by(5) = y1
    gid = g.CreateLine(shId, 5, bx, by)
  End If
  If gid > 0 Then
    g.SetId gid
    g.SetColour 0
    g.SetLineWidth 0.5
  End If
  tbLeft = x2 - 185
  If tbLeft < x1 + 10 Then tbLeft = x1 + 10
  gid = g.CreateRectangle(shId, tbLeft, y1, x2, y1 + 35)
  gid = g.CreateText(shId, docCode & " - " & shName & " (" & designer & ")", tbLeft + 4, y1 + 14)
  Err.Clear
  On Error GoTo 0
End Sub

Sub AddGraphicId(ByRef gIds, ByRef gCnt, ByVal gid)
  If gid > 0 Then
    gCnt = gCnt + 1
    If gCnt > UBound(gIds) Then ReDim Preserve gIds(gCnt + 32)
    gIds(gCnt) = gid
  End If
End Sub

Function FinalizeIntegralDeviceGroup(ByRef g, ByVal shId, ByRef gIds, ByVal gCnt, ByVal devId)
  On Error Resume Next
  Dim exactArr(), i, grpId
  FinalizeIntegralDeviceGroup = 0
  If gCnt <= 0 Then Exit Function
  ReDim exactArr(gCnt)
  For i = 1 To gCnt
    exactArr(i) = gIds(i)
  Next
  Err.Clear
  grpId = g.CreateGroup(gCnt, exactArr)
  If Err.Number <> 0 Or grpId <= 0 Then
    Err.Clear
    grpId = g.CreateGroup(exactArr)
  End If
  If Err.Number = 0 And grpId > 0 Then
    g.SetId grpId
    If devId > 0 Then
      Call g.SetAttributeValue("E3_DEVICE_ID", CStr(devId))
    End If
    FinalizeIntegralDeviceGroup = grpId
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub DrawDeviceBox(ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal des, ByVal art, ByVal cat, ByRef gIds, ByRef gCnt)
  On Error Resume Next
  Dim gid, bx(5), by(5), cx, cy, r, fx(2), fy(2), w, h
  cx = (x1 + x2) / 2
  cy = (y1 + y2) / 2
  w = Abs(x2 - x1)
  h = Abs(y2 - y1)

  If cat = "fan" Or cat = "motor" Then
    r = w * 0.32
    If h * 0.32 < r Then r = h * 0.32
    If r < 4 Then r = 4
    gid = g.CreateCircle(shId, cx, cy, r)
    If gid > 0 Then
      g.SetId gid : g.SetColour 0 : g.SetLineWidth 0.35
      Call AddGraphicId(gIds, gCnt, gid)
    End If
    fx(1) = cx - r * 0.65 : fy(1) = cy - r * 0.7
    fx(2) = cx + r * 0.85 : fy(2) = cy - r * 0.25
    gid = g.CreateLine(shId, 2, fx, fy)
    If gid > 0 Then g.SetId gid : g.SetColour 0 : Call AddGraphicId(gIds, gCnt, gid)
    fx(1) = cx - r * 0.65 : fy(1) = cy + r * 0.7
    fx(2) = cx + r * 0.85 : fy(2) = cy + r * 0.25
    gid = g.CreateLine(shId, 2, fx, fy)
    If gid > 0 Then g.SetId gid : g.SetColour 0 : Call AddGraphicId(gIds, gCnt, gid)
  ElseIf cat = "kip_circle" Or cat = "lamp" Then
    r = w * 0.35
    If h * 0.35 < r Then r = h * 0.35
    If r < 3.5 Then r = 3.5
    gid = g.CreateCircle(shId, cx, cy, r)
    If gid > 0 Then
      g.SetId gid : g.SetColour 3 : g.SetLineWidth 0.35
      Call AddGraphicId(gIds, gCnt, gid)
    End If
    fx(1) = cx - r : fy(1) = cy : fx(2) = cx + r : fy(2) = cy
    gid = g.CreateLine(shId, 2, fx, fy)
    If gid > 0 Then g.SetId gid : g.SetColour 3 : Call AddGraphicId(gIds, gCnt, gid)
  Else
    gid = g.CreateRectangle(shId, x1, y1, x2, y2)
    If gid <= 0 Or Err.Number <> 0 Then
      Err.Clear
      bx(1) = x1 : by(1) = y1 : bx(2) = x2 : by(2) = y1 : bx(3) = x2 : by(3) = y2 : bx(4) = x1 : by(4) = y2 : bx(5) = x1 : by(5) = y1
      gid = g.CreateLine(shId, 5, bx, by)
    End If
    If gid > 0 Then
      g.SetId gid
      g.SetColour 0
      g.SetLineWidth 0.35
      Call AddGraphicId(gIds, gCnt, gid)
    End If
    If cat = "damper" Or cat = "filter" Then
      fx(1) = x1 : fy(1) = y1 : fx(2) = x2 : fy(2) = y2
      gid = g.CreateLine(shId, 2, fx, fy)
      If gid > 0 Then g.SetId gid : g.SetColour 3 : Call AddGraphicId(gIds, gCnt, gid)
    ElseIf cat = "heater" Or cat = "cooler" Then
      fx(1) = x1 : fy(1) = y1 : fx(2) = x2 : fy(2) = y2
      gid = g.CreateLine(shId, 2, fx, fy)
      If gid > 0 Then g.SetId gid : g.SetColour 1 : Call AddGraphicId(gIds, gCnt, gid)
      fx(1) = x1 : fy(1) = y2 : fx(2) = x2 : fy(2) = y1
      gid = g.CreateLine(shId, 2, fx, fy)
      If gid > 0 Then g.SetId gid : g.SetColour 1 : Call AddGraphicId(gIds, gCnt, gid)
    End If
  End If

  gid = g.CreateText(shId, des, x1, y2 + 2)
  If gid > 0 Then
    g.SetId gid
    g.SetTextHeight 3.5
    Call AddGraphicId(gIds, gCnt, gid)
  End If
  If art <> "" Then
    gid = g.CreateText(shId, art, x1, y1 - 4)
    If gid > 0 Then
      g.SetId gid
      g.SetTextHeight 2.5
      Call AddGraphicId(gIds, gCnt, gid)
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawPinTickGrouped(ByRef g, ByVal shId, ByVal px, ByVal py, ByVal dir, ByVal pName, ByRef gIds, ByRef gCnt)
  On Error Resume Next
  Dim gid, lx(2), ly(2), dx, dy
  dx = 0 : dy = 0
  If dir = "top" Then dy = -3
  If dir = "bottom" Then dy = 3
  If dir = "left" Then dx = -3
  If dir = "right" Then dx = 3
  lx(1) = px : ly(1) = py
  lx(2) = px + dx : ly(2) = py + dy
  gid = g.CreateLine(shId, 2, lx, ly)
  If gid > 0 Then
    g.SetId gid
    g.SetColour 1
    g.SetLineWidth 0.25
    Call AddGraphicId(gIds, gCnt, gid)
  End If
  If pName <> "" Then
    gid = g.CreateText(shId, pName, px + 1, py + 1)
    If gid > 0 Then
      g.SetId gid
      g.SetTextHeight 2.0
      Call AddGraphicId(gIds, gCnt, gid)
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawPinTick(ByRef g, ByVal shId, ByVal px, ByVal py, ByVal dir, ByVal pName)
  Dim tmp(4), cnt
  cnt = 0
  Call DrawPinTickGrouped(g, shId, px, py, dir, pName, tmp, cnt)
End Sub

Function DrawWireSeg(ByRef p, ByRef cn, ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal colIdx)
  On Error Resume Next
  Dim xs(2), ys(2), cid, gid
  DrawWireSeg = False
  xs(1) = x1 : xs(2) = x2
  ys(1) = y1 : ys(2) = y2
  cid = cn.Create(shId, 2, xs, ys)
  If cid > 0 Then
    DrawWireSeg = True
  Else
    Err.Clear
    gid = g.CreateLine(shId, 2, xs, ys)
    If gid > 0 Then
      g.SetId gid
      g.SetColour colIdx
      g.SetLineWidth 0.35
      DrawWireSeg = True
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub DrawWireLabel(ByRef g, ByVal shId, ByVal x, ByVal y, ByVal lbl, ByVal colIdx)
  On Error Resume Next
  Dim gid
  gid = g.CreateText(shId, lbl, x + 2, y + 2)
  If gid > 0 Then
    g.SetId gid
    g.SetColour colIdx
    g.SetTextHeight 2.5
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Function CreateFluxDevice(ByRef p, ByRef d, ByRef sm, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal des, ByVal compName, ByVal article, ByVal blockName, ByVal mfr)
  On Error Resume Next
  Dim devId, allIds, allCnt, i, dynComp, symId
  devId = 0
  CreateFluxDevice = 0

  ' 0. Проверяем, существует ли уже такое изделие в открытом проекте E3
  Err.Clear
  allCnt = p.GetAllDeviceIds(allIds)
  If Err.Number = 0 And allCnt > 0 Then
    For i = 1 To allCnt
      d.SetId allIds(i)
      If UCase(Trim(d.GetName())) = UCase(Trim(des)) Then
        devId = allIds(i)
        Exit For
      End If
    Next
  End If

  ' 1. Создаём по артикулу / имени блока / имени компонента из БД E3
  If devId <= 0 And article <> "" Then
    Err.Clear
    devId = d.Create(des, "", "", article, "", 0)
  End If
  If devId <= 0 And blockName <> "" Then
    Err.Clear
    devId = d.Create(des, "", "", blockName, "", 0)
  End If
  If devId <= 0 And compName <> "" Then
    Err.Clear
    devId = d.Create(des, "", "", compName, "", 0)
  End If

  ' 2. Динамическое создание цельного изделия E3 (без обязательной записи в SQL БД компонентов)
  If devId <= 0 Then
    dynComp = article
    If dynComp = "" Then dynComp = blockName
    If dynComp = "" Then dynComp = compName
    Err.Clear
    devId = d.CreateDynamic(des, "", "", dynComp, "", 0)
  End If
  If devId <= 0 Then
    Err.Clear
    devId = d.Create(des, "", "", "", "", 0)
  End If

  ' 3. Fallback через динамический блок на листе (Sym.PlaceBlock), создающий полноценное Device-изделие
  If devId <= 0 And shId > 0 Then
    Err.Clear
    symId = sm.PlaceBlock(shId, x1, y1, x2, y2)
    If Err.Number = 0 And symId > 0 Then
      d.SetId symId
      If d.GetId() > 0 Then
        devId = d.GetId()
        Call d.SetName(des)
      End If
    End If
  End If

  If devId > 0 Then
    d.SetId devId
    If compName <> "" Then
      If d.GetComponentName() = "" Then Call d.SetComponentName(compName)
    End If
    Call LogTrace("INFO", "Цельное изделие " & des & " создано в E3 ID=" & devId & " (" & article & ")")
    CreateFluxDevice = devId
  Else
    Call LogTrace("WARN", "Изделие " & des & " (" & article & ") размещено только сгруппированной графикой УГО на листе")
    CreateFluxDevice = 0
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub SafeCreateDevicePin(ByRef p, ByRef pinO, ByVal devId, ByVal shId, ByVal pName, ByVal px, ByVal py)
  On Error Resume Next
  Dim pid
  If devId <= 0 Or pName = "" Then Exit Sub
  Err.Clear
  pid = pinO.Create(devId, pName, 0, 0, 0)
  If Err.Number <> 0 Or pid <= 0 Then
    Err.Clear
    pid = pinO.Create(devId, pName)
  End If
  If pid > 0 And shId > 0 Then
    pinO.SetId pid
    Call pinO.SetSchemaLocation(shId, px, py)
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub SafeSetDevAttr(ByRef d, ByVal attrName, ByVal attrVal)
  On Error Resume Next
  Call d.SetAttributeValue(attrName, attrVal)
  Err.Clear
  On Error GoTo 0
End Sub

Sub SafeSetGraphAttr(ByRef g, ByVal attrName, ByVal attrVal)
  On Error Resume Next
  Call g.SetAttributeValue(attrName, attrVal)
  Err.Clear
  On Error GoTo 0
End Sub

Function CreateFluxCable(ByRef p, ByRef d, ByVal des, ByVal cabType, ByVal fDev, ByVal tDev, ByVal lenM)
  On Error Resume Next
  Dim cid
  cid = 0
  If cabType <> "" Then
    Err.Clear
    cid = d.Create(des, "", "", cabType, "", 0)
  End If
  If cid <= 0 Then
    Err.Clear
    cid = d.CreateDynamic(des, "", "", cabType, "", 0)
  End If
  If cid <= 0 Then
    Err.Clear
    cid = d.Create(des, "", "", "", "", 0)
  End If
  If cid > 0 Then
    d.SetId cid
    Call d.SetAttributeValue("Наименование", cabType)
    Call d.SetAttributeValue("Марка кабеля", cabType)
    Call d.SetAttributeValue("Длина", CStr(lenM))
    Call d.SetAttributeValue("Откуда", fDev)
    Call d.SetAttributeValue("Куда", tDev)
    Call LogTrace("INFO", "Кабель " & des & " создан ID=" & cid)
    CreateFluxCable = True
  Else
    Call LogTrace("INFO", "Кабель " & des & " (" & cabType & ") пропущен в БД E3 (d.Create=0)")
    CreateFluxCable = False
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub ExportActiveE3sToFluxJson()
  Dim devIds, cnt, i, jsonPath, sb, dName, comp, art, mfg, elId, fluxPrj
  Dim strm, sIds, scnt, si, symIds, symCnt, sk, Sym, NetSeg, Att
  Dim nsIds, nscnt, ni, ptsCnt, pk, xArr, yArr, sx, sy, sgrid, scol, srow
  Dim ax1, ay1, ax2, ay2, fw, fh, fx, fy, openRes
  Dim devSheetDict, devXDict, devYDict, sheetFluxIdDict, sheetBoundsDict
  Dim shIdCur, shNm, shFm, firstSheet, firstNode, firstWire, firstCab
  Dim dIdCur, isCab, dKey, mappedShId, wx1, wy1, wpStr, wireIdx, segNm
  Dim pIds, pCnt, aIds, aCnt, ai, attNm, attVal, cabLen, cabTypeStr, devNote

  If gImportFilePath <> "" Then
    On Error Resume Next
    If Prj.GetId() > 0 Then
      Prj.Close
      Err.Clear
    End If
    Call LogTrace("INFO", "Открытие файла в E3.series: " & gImportFilePath)
    openRes = Prj.Open(gImportFilePath)
    If Err.Number <> 0 Or Prj.GetId() <= 0 Then
      Call LogTrace("WARN", "Prj.Open вернул openRes=" & openRes & ", err=#" & Err.Number & " " & Err.Description & " (проверка App.OpenProject...)")
      Err.Clear
      openRes = App.OpenProject(gImportFilePath)
    End If
    If Err.Number <> 0 Or Prj.GetId() <= 0 Then
      Call LogTrace("ERROR", "Не удалось открыть .e3s через COM E3.series: #" & Err.Number & " " & Err.Description)
      Err.Clear
      On Error GoTo 0
      Exit Sub
    End If
    On Error GoTo 0
    Call LogTrace("INFO", "Файл открыт в E3.series: ID=" & Prj.GetId() & " Name='" & Prj.GetName() & "'")
  End If

  If Prj.GetId() = 0 Then
    Call LogTrace("WARN", "Попытка выгрузки без открытого проекта .e3s в E3.series.")
    If Not WScript.Arguments.Named.Exists("silent") Then
      MsgBox "Сначала откройте проект .e3s в E3.series!", vbExclamation, "E3ProMax"
    End If
    Exit Sub
  End If

  fluxPrj = ""
  On Error Resume Next
  fluxPrj = Prj.GetAttributeValue("FLUX_PROJECT")
  Err.Clear
  On Error GoTo 0
  If fluxPrj = "" Then
    If gImportFilePath <> "" Then
      fluxPrj = "FLUX_E3_" & Prj.GetId()
    Else
      fluxPrj = "${vbsEsc(fluxKey)}"
    End If
  End If

  Set devSheetDict = CreateObject("Scripting.Dictionary")
  Set devXDict = CreateObject("Scripting.Dictionary")
  Set devYDict = CreateObject("Scripting.Dictionary")
  Set sheetFluxIdDict = CreateObject("Scripting.Dictionary")
  Set sheetBoundsDict = CreateObject("Scripting.Dictionary")
  Set Sym = Prj.CreateSymbolObject()
  Set NetSeg = Prj.CreateNetSegmentObject()
  Set Att = Prj.CreateAttributeObject()

  sb = "{" & vbCrLf
  sb = sb & "  ""format"": ""flux-e3-bridge/v1""," & vbCrLf
  sb = sb & "  ""replaceAll"": true," & vbCrLf
  sb = sb & "  ""fluxProjectKey"": """ & JsonEsc(fluxPrj) & """," & vbCrLf
  sb = sb & "  ""projectName"": """ & JsonEsc(Prj.GetName()) & """," & vbCrLf
  sb = sb & "  ""exportedAt"": """ & Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & "T12:00:00.000Z""," & vbCrLf
  sb = sb & "  ""revision"": 1," & vbCrLf

  ' 1. Листы схемы
  sb = sb & "  ""sheets"": [" & vbCrLf
  firstSheet = True
  On Error Resume Next
  scnt = Prj.GetSheetIds(sIds)
  If Err.Number <> 0 Then scnt = 0 : Err.Clear
  On Error GoTo 0
  Call LogTrace("INFO", "Чтение листов E3.series: scnt=" & scnt)

  For si = 1 To scnt
    shIdCur = sIds(si)
    Sheet.SetId shIdCur
    shNm = Sheet.GetName()
    shFm = Sheet.GetFormat()
    If InStr(1, shFm, "4", 1) > 0 Then
      shFm = "A4" : fw = 980 : fh = 920
    Else
      shFm = "A3" : fw = 1400 : fh = 920
    End If
    ax1 = 0 : ay1 = 0 : ax2 = 0 : ay2 = 0
    On Error Resume Next
    Call Sheet.GetDrawingArea(ax1, ay1, ax2, ay2)
    If Err.Number <> 0 Or ax2 <= ax1 Or ay2 <= ay1 Then
      Err.Clear
      ax1 = 0 : ay1 = 0 : ax2 = 420 : ay2 = 297
    End If
    On Error GoTo 0

    dKey = "sheet-" & CStr(si)
    sheetFluxIdDict(CStr(shIdCur)) = dKey
    sheetBoundsDict(CStr(shIdCur)) = Array(ax1, ay1, ax2, ay2, fw, fh)

    If Not firstSheet Then sb = sb & "," & vbCrLf
    firstSheet = False
    sb = sb & "    {" & vbCrLf
    sb = sb & "      ""id"": """ & JsonEsc(dKey) & """," & vbCrLf
    sb = sb & "      ""number"": " & si & "," & vbCrLf
    sb = sb & "      ""name"": """ & JsonEsc(shNm) & """," & vbCrLf
    sb = sb & "      ""format"": """ & shFm & """," & vbCrLf
    sb = sb & "      ""width"": " & fw & "," & vbCrLf
    sb = sb & "      ""height"": " & fh & "," & vbCrLf
    sb = sb & "      ""titleBlock"": { ""documentCode"": """ & JsonEsc(Prj.GetName()) & """, ""organization"": """", ""designer"": """", ""checker"": """", ""sheetTitle"": """ & JsonEsc(shNm) & """ }" & vbCrLf
    sb = sb & "    }"

    ' Индексируем координаты символов устройств на этом листе
    On Error Resume Next
    symCnt = Sheet.GetSymbolIds(symIds)
    If Err.Number = 0 And symCnt > 0 Then
      For sk = 1 To symCnt
        Sym.SetId symIds(sk)
        sx = 0 : sy = 0 : sgrid = "" : scol = "" : srow = ""
        Call Sym.GetSchemaLocation(sx, sy, sgrid, scol, srow)
        Dev.SetId symIds(sk)
        dIdCur = Dev.GetId()
        If dIdCur > 0 And Not devSheetDict.Exists(CStr(dIdCur)) Then
          fx = Round(40 + ((sx - ax1) / (ax2 - ax1)) * (fw - 160))
          fy = Round(40 + (1 - (sy - ay1) / (ay2 - ay1)) * (fh - 180))
          If fx < 40 Then fx = 40
          If fy < 40 Then fy = 40
          devSheetDict(CStr(dIdCur)) = dKey
          devXDict(CStr(dIdCur)) = fx
          devYDict(CStr(dIdCur)) = fy
        End If
      Next
    End If
    Err.Clear
    On Error GoTo 0
  Next
  sb = sb & vbCrLf & "  ]," & vbCrLf

  ' 2. Устройства и кабели
  cnt = Prj.GetAllDeviceIds(devIds)
  Call LogTrace("INFO", "Чтение устройств из E3.series: cnt=" & cnt)
  sb = sb & "  ""nodes"": [" & vbCrLf
  firstNode = True
  For i = 1 To cnt
    Dev.SetId devIds(i)
    dName = Dev.GetName()
    isCab = 0
    On Error Resume Next
    isCab = Dev.IsCable()
    Err.Clear
    On Error GoTo 0
    If dName <> "" And isCab = 0 Then
      comp = "" : art = "" : mfg = "" : elId = ""
      On Error Resume Next
      comp = Dev.GetComponentName()
      art = Dev.GetAttributeValue("Артикул")
      If art = "" Then art = Dev.GetAttributeValue("Article")
      If art = "" Then art = Dev.GetAttributeValue("PartNumber")
      If art = "" Then art = comp
      mfg = Dev.GetAttributeValue("Производитель")
      If mfg = "" Then mfg = Dev.GetAttributeValue("Manufacturer")
      If mfg = "" Then mfg = Dev.GetAttributeValue("Supplier")
      elId = Dev.GetAttributeValue("FLUX_ELEMENT_ID")
      Err.Clear
      On Error GoTo 0
      If elId = "" Then elId = "e3-" & CStr(devIds(i))
      If devSheetDict.Exists(CStr(devIds(i))) Then
        mappedShId = devSheetDict(CStr(devIds(i)))
        fx = devXDict(CStr(devIds(i)))
        fy = devYDict(CStr(devIds(i)))
      Else
        mappedShId = "sheet-1"
        fx = 120 + ((i - 1) Mod 5) * 220
        fy = 120 + Int((i - 1) / 5) * 180
      End If

      If Not firstNode Then sb = sb & "," & vbCrLf
      firstNode = False
      sb = sb & "    {" & vbCrLf
      sb = sb & "      ""elementId"": """ & JsonEsc(elId) & """," & vbCrLf
      sb = sb & "      ""version"": ""e3-" & CStr(devIds(i)) & """," & vbCrLf
      sb = sb & "      ""tag"": """ & JsonEsc(dName) & """," & vbCrLf
      sb = sb & "      ""designation"": """ & JsonEsc(dName) & """," & vbCrLf
      sb = sb & "      ""status"": ""one""," & vbCrLf
      sb = sb & "      ""solutionId"": ""e3-native""," & vbCrLf
      sb = sb & "      ""solutionName"": """ & JsonEsc(comp) & """," & vbCrLf
      sb = sb & "      ""rect"": { ""sheet"": """ & JsonEsc(mappedShId) & """, ""x"": " & fx & ", ""y"": " & fy & ", ""rotation"": 0, ""width"": 100, ""height"": 100 }," & vbCrLf
      sb = sb & "      ""attrs"": [" & vbCrLf
      sb = sb & "        { ""name"": ""Артикул"", ""value"": """ & JsonEsc(art) & """, ""owner"": """", ""conflict"": ""flux"" }," & vbCrLf
      sb = sb & "        { ""name"": ""Производитель"", ""value"": """ & JsonEsc(mfg) & """, ""owner"": """", ""conflict"": ""flux"" }," & vbCrLf
      sb = sb & "        { ""name"": ""Наименование"", ""value"": """ & JsonEsc(comp) & """, ""owner"": """", ""conflict"": ""flux"" }"

      On Error Resume Next
      aCnt = Dev.GetAttributeIds(aIds)
      If Err.Number = 0 And aCnt > 0 Then
        For ai = 1 To aCnt
          Att.SetId aIds(ai)
          attNm = Att.GetName()
          attVal = Att.GetValue()
          If attNm <> "" And attNm <> "Артикул" And attNm <> "Производитель" And attNm <> "Наименование" And attNm <> "FLUX_ELEMENT_ID" Then
            sb = sb & "," & vbCrLf & "        { ""name"": """ & JsonEsc(attNm) & """, ""value"": """ & JsonEsc(attVal) & """, ""owner"": ""E3"", ""conflict"": ""script"" }"
          End If
        Next
      End If
      Err.Clear
      On Error GoTo 0

      sb = sb & vbCrLf & "      ]," & vbCrLf
      sb = sb & "      ""checked"": true" & vbCrLf
      sb = sb & "    }"
    End If
  Next
  sb = sb & vbCrLf & "  ]," & vbCrLf

  ' 3. Кабели
  sb = sb & "  ""cables"": [" & vbCrLf
  firstCab = True
  For i = 1 To cnt
    Dev.SetId devIds(i)
    dName = Dev.GetName()
    isCab = 0
    On Error Resume Next
    isCab = Dev.IsCable()
    Err.Clear
    On Error GoTo 0
    If dName <> "" And isCab <> 0 Then
      cabTypeStr = "" : cabLen = 10
      On Error Resume Next
      cabTypeStr = Dev.GetComponentName()
      If IsNumeric(Dev.GetAttributeValue("Длина")) Then cabLen = CDbl(Dev.GetAttributeValue("Длина"))
      Err.Clear
      On Error GoTo 0
      If Not firstCab Then sb = sb & "," & vbCrLf
      firstCab = False
      sb = sb & "    { ""id"": ""cab-" & CStr(devIds(i)) & """, ""designation"": """ & JsonEsc(dName) & """, ""cableType"": """ & JsonEsc(cabTypeStr) & """, ""coresCount"": 4, ""crossSection"": ""1.5 мм²"", ""lengthMeters"": " & cabLen & ", ""fromDevice"": """", ""toDevice"": """", ""shielded"": false }"
    End If
  Next
  sb = sb & vbCrLf & "  ]," & vbCrLf

  ' 4. Цепи (сегменты соединений с листов)
  sb = sb & "  ""wires"": [" & vbCrLf
  firstWire = True
  wireIdx = 0
  For si = 1 To scnt
    shIdCur = sIds(si)
    Sheet.SetId shIdCur
    dKey = sheetFluxIdDict(CStr(shIdCur))
    ax1 = sheetBoundsDict(CStr(shIdCur))(0)
    ay1 = sheetBoundsDict(CStr(shIdCur))(1)
    ax2 = sheetBoundsDict(CStr(shIdCur))(2)
    ay2 = sheetBoundsDict(CStr(shIdCur))(3)
    fw = sheetBoundsDict(CStr(shIdCur))(4)
    fh = sheetBoundsDict(CStr(shIdCur))(5)

    On Error Resume Next
    nscnt = Sheet.GetNetSegmentIds(nsIds)
    If Err.Number = 0 And nscnt > 0 Then
      For ni = 1 To nscnt
        NetSeg.SetId nsIds(ni)
        segNm = "" : segNm = NetSeg.GetName()
        If segNm = "" Then segNm = "NET_" & CStr(nsIds(ni))
        ptsCnt = NetSeg.GetLineSegments(shIdCur, xArr, yArr)
        If Err.Number = 0 And ptsCnt >= 2 Then
          wireIdx = wireIdx + 1
          wpStr = "["
          For pk = 1 To ptsCnt
            wx1 = Round(40 + ((xArr(pk) - ax1) / (ax2 - ax1)) * (fw - 160))
            wy1 = Round(40 + (1 - (yArr(pk) - ay1) / (ay2 - ay1)) * (fh - 180))
            If pk > 1 Then wpStr = wpStr & ", "
            wpStr = wpStr & "{ ""x"": " & wx1 & ", ""y"": " & wy1 & " }"
          Next
          wpStr = wpStr & "]"
          If Not firstWire Then sb = sb & "," & vbCrLf
          firstWire = False
          sb = sb & "    { ""id"": ""e3w-" & wireIdx & """, ""sheetId"": """ & JsonEsc(dKey) & """, ""netName"": """ & JsonEsc(segNm) & """, ""signalType"": ""signal"", ""fromDeviceId"": """", ""fromPinId"": """", ""toDeviceId"": """", ""toPinId"": """", ""waypoints"": " & wpStr & ", ""crossSection"": ""1.5 мм²"", ""wireNumber"": """ & JsonEsc(segNm) & """ }"
        End If
      Next
    End If
    Err.Clear
    On Error GoTo 0
  Next
  sb = sb & vbCrLf & "  ]" & vbCrLf & "}" & vbCrLf

  jsonPath = outFolder & "\\flux_e3_export.json"
  Set strm = CreateObject("ADODB.Stream")
  strm.Type = 2
  strm.Charset = "utf-8"
  strm.Open
  strm.WriteText sb
  strm.SaveToFile jsonPath, 2
  strm.Close

  Call LogTrace("INFO", "Экспортировано: листов=" & scnt & ", устройств=" & cnt & ", цепей=" & wireIdx & " -> " & jsonPath)
  If Not WScript.Arguments.Named.Exists("silent") Then
    MsgBox "Проект E3.series выгружен для E3ProMax:" & vbCrLf & jsonPath & vbCrLf & vbCrLf & "Откройте этот .json файл в окне 'Обмен E3'.", vbInformation, "E3ProMax"
  End If
End Sub

Function JsonEsc(ByVal s)
  s = CStr(s)
  s = Replace(s, "\\", "\\\\")
  s = Replace(s, """", "\\""")
  s = Replace(s, vbCrLf, " ")
  s = Replace(s, vbCr, " ")
  s = Replace(s, vbLf, " ")
  JsonEsc = s
End Function
`;
}

/** Encodes VBScript source as UTF-16LE with BOM (0xFF 0xFE) so Russian Windows WSH executes Cyrillic cleanly. */
export function encodeUtf16LeWithBom(text: string): Uint8Array {
  const normalized = text.replace(/\r?\n/g, '\r\n');
  const out = new Uint8Array(2 + normalized.length * 2);
  out[0] = 0xff;
  out[1] = 0xfe;
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    out[2 + i * 2] = code & 0xff;
    out[2 + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return out;
}

/** Generates a 1-file Windows background bridge (.cmd + PowerShell) with verbose connector.log diagnostics. */
export function generateWindowsBridgeCmd(serverOrigin: string): string {
  const cleanOrigin = serverOrigin.replace(/\/+$/, '');
  return `@echo off\r\nchcp 65001 >nul\r\ntitle E3ProMax <-> E3.series 2022 Bridge Agent\r\necho [E3ProMax] Connecting to ${cleanOrigin} ...\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command ^"\r\n[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^\r\n[Console]::OutputEncoding = [Text.Encoding]::Unicode; ^\r\n$base = '${cleanOrigin}'; $pc = $env:COMPUTERNAME; ^\r\n$work = Join-Path $env:TEMP 'flux_e3_bridge'; New-Item -ItemType Directory -Force -Path $work | Out-Null; ^\r\n$logFile = Join-Path $work 'connector.log'; ^\r\nfunction Write-BridgeLog($lvl, $msg) { $line = '[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] [' + $lvl + '] ' + $msg; Write-Host $line; Add-Content -Path $logFile -Value $line -Encoding UTF8; } ^\r\nWrite-BridgeLog 'INFO' ('Bridge active on ' + $pc + ' | Target=' + $base + ' | Log=' + $logFile); ^\r\nwhile ($true) { ^\r\n  try { ^\r\n    $resp = Invoke-RestMethod -Uri ($base + '/api/v1/e3-bridge/poll?host=' + [uri]::EscapeDataString($pc)) -TimeoutSec 10; ^\r\n    if ($resp.job) { ^\r\n      Write-BridgeLog 'INFO' ('Executing job ' + $resp.job.jobId + ' mode=' + $resp.job.mode + ' scriptLen=' + $resp.job.script.Length); ^\r\n      $vbs = Join-Path $work 'flux_job.vbs'; ^\r\n      $dbgFile = Join-Path $work 'flux_e3_com_debug.log'; if (Test-Path $dbgFile) { Remove-Item $dbgFile -Force; } ^\r\n      [IO.File]::WriteAllText($vbs, $resp.job.script, [Text.Encoding]::Unicode); ^\r\n      $out = & cscript.exe //Nologo //U $vbs /silent 2>&1 | Out-String; ^\r\n      $ec = $LASTEXITCODE; ^\r\n      $lvl = if ($ec -eq 0) { 'INFO' } else { 'ERROR' }; ^\r\n      $dbgTxt = if (Test-Path $dbgFile) { Get-Content $dbgFile -Raw -Encoding UTF8 } else { '' }; ^\r\n      $combined = if ($dbgTxt) { $dbgTxt } else { $out }; ^\r\n      Write-BridgeLog $lvl ('cscript exit=' + $ec + ' output=' + ($combined -replace '[\r\n]+', ' | ')); ^\r\n      $expFile = Join-Path $work 'flux_e3_export.json'; ^\r\n      $expJson = $null; if (($resp.job.mode -eq 'export') -and (Test-Path $expFile)) { $expJson = Get-Content $expFile -Raw -Encoding UTF8; Remove-Item $expFile -Force; } ^\r\n      $ack = @{ jobId = $resp.job.jobId; host = $pc; ok = ($ec -eq 0); message = ('exit=' + $ec + [Environment]::NewLine + $combined); exportedJson = $expJson } | ConvertTo-Json -Depth 4; ^\r\n      $bytes = [Text.Encoding]::UTF8.GetBytes($ack); ^\r\n      Invoke-RestMethod -Method Post -Uri ($base + '/api/v1/e3-bridge/ack') -ContentType 'application/json; charset=utf-8' -Body $bytes | Out-Null; ^\r\n      Write-BridgeLog 'INFO' ('Ack sent for job ' + $resp.job.jobId); ^\r\n    } ^\r\n  } catch { Write-BridgeLog 'ERROR' ('Poll/exec exception: ' + $_.Exception.Message); Start-Sleep -Seconds 2; } ^\r\n  Start-Sleep -Milliseconds 1500; ^\r\n}\r\n"\r\n`;
}

// ============================================================================
// Large-Dataset Benchmark Generator (for async worker stress testing)
// ============================================================================

export function generateStressBatch(project: E3Project, count: number): E3Project {
  const next = structuredClone(project);
  const sheetId = next.sheets[0]?.id || 'sheet-1';
  const existingCount = next.devices.length;
  const cols = 12;

  for (let i = 0; i < count; i++) {
    const idx = existingCount + i + 1;
    const cat = E3_CATALOG[i % E3_CATALOG.length];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const id = `dev-stress-${Date.now()}-${i}`;
    const dev: E3Device = {
      id,
      elementId: `el-stress-${idx}`,
      designation: `-${cat.defaultPrefix}${100 + idx}`,
      componentName: cat.componentName,
      article: cat.article,
      manufacturer: cat.manufacturer,
      category: cat.category,
      sheetId,
      x: 120 + col * 220,
      y: 740 + row * 190,
      rotation: 0,
      width: cat.width,
      height: cat.height,
      e3BlockName: cat.e3BlockName,
      bindingState: 'PLACED',
      pins: cat.pins.map((p, pIdx) => ({ ...p, id: `${id}-p${pIdx + 1}` })),
      attributes: structuredClone(cat.defaultAttributes),
    };
    next.devices.push(dev);

    if (i > 0 && dev.pins.length > 0) {
      const prevDev = next.devices[next.devices.length - 2];
      if (prevDev.pins.length > 0) {
        const pFrom = prevDev.pins[prevDev.pins.length - 1];
        const pTo = dev.pins[0];
        const abs1 = getAbsolutePinPos(prevDev, pFrom);
        const abs2 = getAbsolutePinPos(dev, pTo);
        next.wires.push({
          id: `w-stress-${Date.now()}-${i}`,
          sheetId,
          netName: `NET_${idx}`,
          signalType: pTo.signalType,
          fromDeviceId: prevDev.id,
          fromPinId: pFrom.id,
          toDeviceId: dev.id,
          toPinId: pTo.id,
          waypoints: autoRouteOrthogonal(abs1, abs2),
          crossSection: '1.5 мм²',
          wireNumber: `S${idx}`,
        });
      }
    }
  }

  next.revision += 1;
  next.updatedAt = new Date().toISOString();
  return next;
}

/** Computes the lowest unused designation `-PREFIX<N>` without colliding with existing devices. */
export function nextUniqueDesignation(
  devices: ReadonlyArray<Pick<E3Device, 'designation'>>,
  prefix: string
): string {
  const cleanPrefix = (prefix || 'K').replace(/^-+/, '').trim() || 'K';
  const escaped = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`^-?${escaped}(\\d+)$`, 'i');
  const used = new Set<number>();
  for (const d of devices) {
    const m = rx.exec(d.designation.trim());
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) used.add(n);
    }
  }
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return `-${cleanPrefix}${candidate}`;
}

