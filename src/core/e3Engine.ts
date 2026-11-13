import { E3_CATALOG } from './e3Catalog.ts';
import { DEFAULT_VISUAL_SETTINGS } from './e3Seed.ts';
import type {
  BomRow,
  CableJournalRow,
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

export function autoRouteOrthogonal(
  p1: { x: number; y: number; direction: PinDirection },
  p2: { x: number; y: number; direction: PinDirection },
  stub = 20
): Array<{ x: number; y: number }> {
  const offset = (p: { x: number; y: number; direction: PinDirection }) => {
    if (p.direction === 'top') return { x: p.x, y: p.y - stub };
    if (p.direction === 'bottom') return { x: p.x, y: p.y + stub };
    if (p.direction === 'left') return { x: p.x - stub, y: p.y };
    return { x: p.x + stub, y: p.y };
  };

  const s1 = offset(p1);
  const s2 = offset(p2);
  const midX = Math.round((s1.x + s2.x) / 2);
  const midY = Math.round((s1.y + s2.y) / 2);

  const pts: Array<{ x: number; y: number }> = [{ x: p1.x, y: p1.y }, s1];
  const isHoriz1 = p1.direction === 'left' || p1.direction === 'right';
  const isHoriz2 = p2.direction === 'left' || p2.direction === 'right';

  if (isHoriz1 && isHoriz2) {
    pts.push({ x: midX, y: s1.y }, { x: midX, y: s2.y });
  } else if (!isHoriz1 && !isHoriz2) {
    pts.push({ x: s1.x, y: midY }, { x: s2.x, y: midY });
  } else if (isHoriz1) {
    pts.push({ x: s2.x, y: s1.y });
  } else {
    pts.push({ x: s1.x, y: s2.y });
  }

  pts.push(s2, { x: p2.x, y: p2.y });
  return deduplicatePoints(pts);
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
    const list = designationCounts.get(normDes) || [];
    list.push(dev);
    designationCounts.set(normDes, list);

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
    `  <VisualSettings schemaVersion="${vs.schemaVersion}" presetName="${xmlEscape(vs.presetName)}" theme="${vs.theme}" gridSize="${vs.gridSize}" snapToGrid="${vs.snapToGrid}" showGrid="${vs.showGrid}" showGostFrame="${vs.showGostFrame}" showPinNumbers="${vs.showPinNumbers}" showWireNumbers="${vs.showWireNumbers}" showCrossRefs="${vs.showCrossRefs}" wireWidth="${vs.wireWidth}" symbolStrokeWidth="${vs.symbolStrokeWidth}" fontScale="${vs.fontScale}">`
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
    sheets.push({
      id: sa.id,
      number: Number(sa.number || sheets.length + 1),
      name: sa.name || `Лист ${sheets.length + 1}`,
      format: sa.format === 'A4' ? 'A4' : 'A3',
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

  const next = structuredClone(baseProject);
  next.name = bundle.projectName || next.name;
  next.fluxProjectKey = bundle.fluxProjectKey || next.fluxProjectKey;
  next.revision = Math.max(next.revision + 1, bundle.revision || next.revision + 1);
  next.updatedAt = new Date().toISOString();
  if (bundle.sheets?.length) next.sheets = structuredClone(bundle.sheets);
  if (bundle.wires?.length) next.wires = structuredClone(bundle.wires);
  if (bundle.cables?.length) next.cables = structuredClone(bundle.cables);
  if (bundle.visualSettings) next.visualSettings = parseVisualSettings(JSON.stringify(bundle.visualSettings));

  const existingByElementId = new Map(next.devices.map((d) => [d.elementId, d]));

  for (const node of bundle.nodes) {
    const existing = existingByElementId.get(node.elementId);
    const article = node.attrs.find((a) => a.name === 'Артикул')?.value || '';
    const manufacturer = node.attrs.find((a) => a.name === 'Производитель')?.value || '';
    const componentName = node.attrs.find((a) => a.name === 'Наименование')?.value || node.solutionName;
    const customAttrs: E3Attribute[] = node.attrs
      .filter((a) => !['Артикул', 'Производитель', 'Наименование'].includes(a.name))
      .map((a) => ({
        name: a.name,
        value: a.value,
        owner: a.owner || '',
        conflict: a.conflict || 'flux',
        service: a.service,
      }));

    if (existing) {
      existing.designation = node.designation;
      existing.article = article || existing.article;
      existing.manufacturer = manufacturer || existing.manufacturer;
      existing.componentName = componentName || existing.componentName;
      existing.sheetId = node.rect.sheet || existing.sheetId;
      existing.x = node.rect.x;
      existing.y = node.rect.y;
      existing.rotation = (node.rect.rotation % 360) as 0 | 90 | 180 | 270;
      existing.e3BlockName = node.solutionName || existing.e3BlockName;
      existing.bindingState = node.checked ? 'PLACED' : 'REMOVED_IN_FLUX';
      existing.attributes = customAttrs;
    } else {
      const catItem =
        E3_CATALOG.find((c) => c.e3BlockName === node.solutionName) || E3_CATALOG[0];
      const newId = `dev-${node.elementId}`;
      next.devices.push({
        id: newId,
        elementId: node.elementId,
        designation: node.designation,
        componentName,
        article: article || catItem.article,
        manufacturer: manufacturer || catItem.manufacturer,
        category: catItem.category,
        sheetId: node.rect.sheet || next.sheets[0]?.id || 'sheet-1',
        x: node.rect.x,
        y: node.rect.y,
        rotation: (node.rect.rotation % 360) as 0 | 90 | 180 | 270,
        width: node.rect.width || catItem.width,
        height: node.rect.height || catItem.height,
        e3BlockName: node.solutionName || catItem.e3BlockName,
        bindingState: node.checked ? 'PLACED' : 'REMOVED_IN_FLUX',
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

export function generateE3ComScript(project?: E3Project, scriptMode: 'build' | 'export' = 'build'): string {
  const code = project?.projectCode || 'FLUX-E3-PRJ';
  const name = project?.name || 'Проект Flux E3';
  const fluxKey = project?.fluxProjectKey || 'FLUX_KEY';
  const author = project?.author || 'Инженер';
  const sheets = project?.sheets || [];
  const devices = project?.devices || [];
  const cables = project?.cables || [];
  const wires = project?.wires || [];

  const sheetMap = new Map(sheets.map((s, idx) => [s.id, { sheet: s, varName: `shId_${idx + 1}` }]));

  const sheetDecl = sheets.map((_, idx) => `shId_${idx + 1}`).join(', ');
  const sheetLines = sheets
    .map((s, i) => {
      const varName = `shId_${i + 1}`;
      return `  ${varName} = CreateOrGetSheet(Prj, Sheet, "${vbsEsc(s.number + '. ' + s.name)}", "${vbsEsc(s.format)}")
  If ${varName} > 0 Then
    Call DrawGostFrame(Graph, ${varName}, "${vbsEsc(s.titleBlock.documentCode)}", "${vbsEsc(s.name)}", "${vbsEsc(s.titleBlock.designer)}")
  End If`;
    })
    .join('\n');

  const devLines = devices
    .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX')
    .map((d) => {
      const shEntry = sheetMap.get(d.sheetId);
      const sw = shEntry?.sheet.width || 1400;
      const sh = shEntry?.sheet.height || 920;
      const shVar = shEntry?.varName || (sheets.length > 0 ? 'shId_1' : '0');
      const mmX1 = Math.round(15 + (d.x / sw) * 390);
      const mmX2 = Math.round(15 + ((d.x + d.width) / sw) * 390);
      const mmY1 = Math.round(282 - ((d.y + d.height) / sh) * 255);
      const mmY2 = Math.round(282 - (d.y / sh) * 255);

      const attrsPairs = [
        ['Артикул', d.article],
        ['Производитель', d.manufacturer],
        ['Наименование', d.componentName],
        ['FLUX_ELEMENT_ID', d.elementId],
        ['FLUX_BLOCK', d.e3BlockName],
        ...d.attributes.map((a) => [a.name, a.value]),
      ]
        .filter(([, v]) => String(v || '').trim() !== '')
        .map(([k, v]) => `    Call SafeSetDevAttr(Dev, "${vbsEsc(k)}", "${vbsEsc(v)}")`)
        .join('\n');

      return `  ' --- Элемент ${vbsEsc(d.designation)} (${vbsEsc(d.componentName)}) ---
  If CreateFluxDevice(Prj, Dev, "${vbsEsc(d.designation)}", "${vbsEsc(d.componentName)}", "${vbsEsc(d.article)}") Then
${attrsPairs}
  End If
  If ${shVar} > 0 Then
    Call DrawDeviceBox(Graph, ${shVar}, ${mmX1}, ${mmY1}, ${mmX2}, ${mmY2}, "${vbsEsc(d.designation)}", "${vbsEsc(d.article)}")
  End If`;
    })
    .join('\n');

  const wireLines = wires
    .filter((w) => w.waypoints.length >= 2)
    .map((w) => {
      const shEntry = sheetMap.get(w.sheetId);
      const sw = shEntry?.sheet.width || 1400;
      const sh = shEntry?.sheet.height || 920;
      const shVar = shEntry?.varName || (sheets.length > 0 ? 'shId_1' : '0');
      const colCode =
        w.signalType === 'power' ? 1 : w.signalType === 'neutral' ? 4 : w.signalType === 'pe' ? 3 : 6;
      const segs: string[] = [];
      for (let i = 0; i < w.waypoints.length - 1; i++) {
        const p1 = w.waypoints[i];
        const p2 = w.waypoints[i + 1];
        const x1 = Math.round(15 + (p1.x / sw) * 390);
        const y1 = Math.round(282 - (p1.y / sh) * 255);
        const x2 = Math.round(15 + (p2.x / sw) * 390);
        const y2 = Math.round(282 - (p2.y / sh) * 255);
        segs.push(`    Call DrawWireSeg(Prj, Con, Graph, ${shVar}, ${x1}, ${y1}, ${x2}, ${y2}, ${colCode})`);
      }
      const mid = w.waypoints[Math.floor(w.waypoints.length / 2)];
      const mx = Math.round(15 + (mid.x / sw) * 390);
      const my = Math.round(282 - (mid.y / sh) * 255);
      segs.push(
        `    Call DrawWireLabel(Graph, ${shVar}, ${mx}, ${my}, "${vbsEsc(w.wireNumber || w.netName)}", ${colCode})`
      );
      return `  If ${shVar} > 0 Then\n${segs.join('\n')}\n  End If`;
    })
    .join('\n');

  const cableLines = cables
    .map(
      (c) =>
        `  Call CreateFluxCable(Prj, Dev, "${vbsEsc(c.designation)}", "${vbsEsc(c.cableType)}", "${vbsEsc(c.fromDevice)}", "${vbsEsc(c.toDevice)}", ${c.lengthMeters})`
    )
    .join('\n');

  const entryCall =
    scriptMode === 'export' ? 'Call ExportActiveE3sToFluxJson()' : 'Call BuildNativeE3sProject()';

  return `' ============================================================================
' Flux E3 <-> Zuken E3.series 2022 SP2 (Build 23.20+) COM Bridge Script
' Проект: ${vbsEsc(name)} (${vbsEsc(code)})
' Ключ синхронизации: ${vbsEsc(fluxKey)}
' Режим скрипта: ${scriptMode === 'export' ? 'Выгрузка из E3.series в Flux (.json)' : 'Прямой перенос и открытие в E3.series (.e3s)'}
'
' КАК ЗАПУСТИТЬ:
'   Двойной клик по файлу .vbs (при открытом E3.series / E3.cable)
'   или внутри E3.series: Сервис -> Выполнить скрипт (Tools -> Execute Script).
' ============================================================================
Option Explicit

Dim App, Prj, Sheet, Dev, Graph, Con, outFolder, fso
${sheetDecl ? `Dim ${sheetDecl}` : ''}
Set fso = CreateObject("Scripting.FileSystemObject")

On Error Resume Next
Set App = GetObject(, "CT.Application")
If App Is Nothing Then
  Set App = CreateObject("CT.Application")
End If
On Error GoTo 0

If App Is Nothing Then
  MsgBox "Не удалось подключиться к Zuken E3.series (CT.Application). Запустите E3.series и повторите попытку.", vbCritical, "Flux E3 Bridge"
  WScript.Quit 1
End If

Set Prj = App.CreateJobObject()
Set Sheet = Prj.CreateSheetObject()
Set Dev = Prj.CreateDeviceObject()
Set Graph = Prj.CreateGraphObject()
Set Con = Prj.CreateConnectionObject()

outFolder = fso.GetParentFolderName(WScript.ScriptFullName)
If outFolder = "" Then outFolder = "D:\\Downloads"

${entryCall}

Sub BuildNativeE3sProject()
  Dim targetE3s, prjName, ans
  prjName = "${vbsEsc(code)}"
  targetE3s = outFolder & "\\" & prjName & "_native.e3s"

  On Error Resume Next
  If Prj.GetId() > 0 Then
    If WScript.Arguments.Named.Exists("silent") Then
      Prj.Close
      Prj.Create prjName
    Else
      ans = MsgBox("В E3.series уже открыт проект '" & Prj.GetName() & "'." & vbCrLf & vbCrLf & "Да = закрыть его и создать новый '" & prjName & "'" & vbCrLf & "Нет = добавить элементы Flux в текущий проект", vbYesNoCancel + vbQuestion, "Flux E3 -> E3.series")
      If ans = vbCancel Then Exit Sub
      If ans = vbYes Then
        Prj.Close
        Prj.Create prjName
      End If
    End If
  Else
    Prj.Create prjName
  End If
  Call Prj.SetAttributeValue("FLUX_PROJECT", "${vbsEsc(fluxKey)}")
  Call Prj.SetAttributeValue("Наименование", "${vbsEsc(name)}")
  Call Prj.SetAttributeValue("Автор", "${vbsEsc(author)}")
  On Error GoTo 0

  App.PutInfo 0, "[Flux E3] Перенос листов (${sheets.length}), изделий (${devices.length}), цепей (${wires.length}) и кабелей (${cables.length})..."

  ' 1. Листы и рамки ГОСТ (${sheets.length})
${sheetLines || "  ' (нет листов)"}

  ' 2. Изделия в дерево проекта + графика УГО на листах (${devices.length})
${devLines || "  ' (нет устройств)"}

  ' 3. Цепи и соединения (${wires.length})
${wireLines || "  ' (нет цепей)"}

  ' 4. Кабельные связи (${cables.length})
${cableLines || "  ' (нет кабелей)"}

  ' Показываем первый лист сразу на экране E3.series
  ${sheets.length > 0 ? 'If shId_1 > 0 Then\n    On Error Resume Next\n    Sheet.SetId shId_1\n    Sheet.Display\n    On Error GoTo 0\n  End If' : ''}

  On Error Resume Next
  Call Prj.SaveAs(targetE3s)
  If Err.Number <> 0 Then
    App.PutInfo 1, "[Flux E3] Проект открыт в E3.series; при необходимости сохраните вручную (Файл -> Сохранить как): " & Err.Description
    Err.Clear
  Else
    App.PutInfo 0, "[Flux E3] Проект открыт в E3.series и сохранён в: " & targetE3s
  End If
  On Error GoTo 0
End Sub

Function CreateOrGetSheet(ByRef p, ByRef sh, ByVal shName, ByVal fmt)
  On Error Resume Next
  Dim res
  res = sh.Create(0, shName, fmt, 0, "")
  If res <= 0 Then res = sh.Create(0, shName, "DINA3", 0, "")
  If res <= 0 Then res = sh.Create(0, shName, "", 0, "")
  Err.Clear
  On Error GoTo 0
  CreateOrGetSheet = res
End Function

Sub DrawGostFrame(ByRef g, ByVal shId, ByVal docCode, ByVal shName, ByVal designer)
  On Error Resume Next
  Dim gid
  gid = g.CreateRectangle(shId, 10, 10, 410, 287)
  If gid > 0 Then
    g.SetId gid
    g.SetColour 0
    g.SetLineWidth 0.35
  End If
  gid = g.CreateRectangle(shId, 225, 10, 410, 45)
  gid = g.CreateText(shId, docCode & " — " & shName & " (" & designer & ")", 229, 25)
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawDeviceBox(ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal des, ByVal art)
  On Error Resume Next
  Dim gid
  gid = g.CreateRectangle(shId, x1, y1, x2, y2)
  If gid > 0 Then
    g.SetId gid
    g.SetColour 0
    g.SetLineWidth 0.35
  End If
  gid = g.CreateText(shId, des, x1, y2 + 3)
  If art <> "" Then
    gid = g.CreateText(shId, art, x1, y1 - 5)
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawWireSeg(ByRef p, ByRef cn, ByRef g, ByVal shId, ByVal x1, ByVal y1, ByVal x2, ByVal y2, ByVal colIdx)
  On Error Resume Next
  Dim xs(1), ys(1), cid, gid
  xs(0) = x1 : xs(1) = x2
  ys(0) = y1 : ys(1) = y2
  cid = cn.Create(shId, 2, xs, ys)
  If cid <= 0 Then
    gid = g.CreateLine(shId, 2, xs, ys)
    If gid > 0 Then
      g.SetId gid
      g.SetColour colIdx
      g.SetLineWidth 0.35
    End If
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub DrawWireLabel(ByRef g, ByVal shId, ByVal x, ByVal y, ByVal lbl, ByVal colIdx)
  On Error Resume Next
  Dim gid
  gid = g.CreateText(shId, lbl, x + 2, y + 2)
  If gid > 0 Then
    g.SetId gid
    g.SetColour colIdx
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Function CreateFluxDevice(ByRef p, ByRef d, ByVal des, ByVal compName, ByVal article)
  On Error Resume Next
  Dim devId
  devId = d.Create(des, "", "", compName, "", 0)
  If devId <= 0 Then
    devId = d.Create(des, "", "", "", "", 0)
  End If
  If devId > 0 Then
    d.SetId devId
    CreateFluxDevice = True
  Else
    App.PutInfo 1, "[Flux E3] Не удалось создать устройство " & des & " (" & article & ")"
    CreateFluxDevice = False
  End If
  Err.Clear
  On Error GoTo 0
End Function

Sub SafeSetDevAttr(ByRef d, ByVal attrName, ByVal attrVal)
  On Error Resume Next
  Call d.SetAttributeValue(attrName, attrVal)
  Err.Clear
  On Error GoTo 0
End Sub

Sub CreateFluxCable(ByRef p, ByRef d, ByVal des, ByVal cabType, ByVal fDev, ByVal tDev, ByVal lenM)
  On Error Resume Next
  Dim cid
  cid = d.Create(des, "", "", cabType, "", 1)
  If cid <= 0 Then
    cid = d.Create(des, "", "", "", "", 1)
  End If
  If cid > 0 Then
    d.SetId cid
    Call d.SetAttributeValue("Наименование", cabType)
    Call d.SetAttributeValue("Длина", CStr(lenM))
    Call d.SetAttributeValue("Откуда", fDev)
    Call d.SetAttributeValue("Куда", tDev)
  End If
  Err.Clear
  On Error GoTo 0
End Sub

Sub ExportActiveE3sToFluxJson()
  Dim devIds, cnt, i, jsonPath, sb, dName, comp, art, mfg, elId, fluxPrj
  Dim strm
  If Prj.GetId() = 0 Then
    If Not WScript.Arguments.Named.Exists("silent") Then
      MsgBox "Сначала откройте проект .e3s в E3.series!", vbExclamation, "Flux E3"
    End If
    Exit Sub
  End If

  fluxPrj = ""
  On Error Resume Next
  fluxPrj = Prj.GetAttributeValue("FLUX_PROJECT")
  On Error GoTo 0
  If fluxPrj = "" Then fluxPrj = "${vbsEsc(fluxKey)}"

  cnt = Prj.GetAllDeviceIds(devIds)
  sb = "{" & vbCrLf
  sb = sb & "  ""format"": ""flux-e3-bridge/v1""," & vbCrLf
  sb = sb & "  ""fluxProjectKey"": """ & JsonEsc(fluxPrj) & """," & vbCrLf
  sb = sb & "  ""projectName"": """ & JsonEsc(Prj.GetName()) & """," & vbCrLf
  sb = sb & "  ""exportedAt"": """ & Year(Now) & "-" & Right("0" & Month(Now), 2) & "-" & Right("0" & Day(Now), 2) & "T12:00:00.000Z""," & vbCrLf
  sb = sb & "  ""revision"": 1," & vbCrLf
  sb = sb & "  ""nodes"": [" & vbCrLf

  Dim firstNode
  firstNode = True
  For i = 1 To cnt
    Dev.SetId devIds(i)
    dName = Dev.GetName()
    If dName <> "" Then
      comp = "" : art = "" : mfg = "" : elId = ""
      On Error Resume Next
      comp = Dev.GetComponentName()
      art = Dev.GetAttributeValue("Артикул")
      mfg = Dev.GetAttributeValue("Производитель")
      elId = Dev.GetAttributeValue("FLUX_ELEMENT_ID")
      On Error GoTo 0
      If elId = "" Then elId = "e3-" & CStr(devIds(i))
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
      sb = sb & "      ""rect"": { ""sheet"": ""sheet-1"", ""x"": " & (120 + ((i - 1) Mod 5) * 220) & ", ""y"": " & (120 + Int((i - 1) / 5) * 180) & ", ""rotation"": 0, ""width"": 100, ""height"": 100 }," & vbCrLf
      sb = sb & "      ""attrs"": [" & vbCrLf
      sb = sb & "        { ""name"": ""Артикул"", ""value"": """ & JsonEsc(art) & """, ""owner"": """", ""conflict"": ""flux"" }," & vbCrLf
      sb = sb & "        { ""name"": ""Производитель"", ""value"": """ & JsonEsc(mfg) & """, ""owner"": """", ""conflict"": ""flux"" }," & vbCrLf
      sb = sb & "        { ""name"": ""Наименование"", ""value"": """ & JsonEsc(comp) & """, ""owner"": """", ""conflict"": ""flux"" }" & vbCrLf
      sb = sb & "      ]," & vbCrLf
      sb = sb & "      ""checked"": true" & vbCrLf
      sb = sb & "    }"
    End If
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

  App.PutInfo 0, "[Flux E3] Экспортировано устройств: " & cnt & " -> " & jsonPath
  If Not WScript.Arguments.Named.Exists("silent") Then
    MsgBox "Проект E3.series выгружен для Flux E3:" & vbCrLf & jsonPath & vbCrLf & vbCrLf & "Откройте этот .json файл в окне 'Импорт / Экспорт E3'.", vbInformation, "Flux E3"
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

/** Generates a 1-file Windows background bridge (.cmd + PowerShell) connecting local E3.series to Flux E3. */
export function generateWindowsBridgeCmd(serverOrigin: string): string {
  const cleanOrigin = serverOrigin.replace(/\/+$/, '');
  return `@echo off\r\nchcp 65001 >nul\r\ntitle Flux E3 <-> E3.series 2022 Bridge Agent\r\necho [Flux E3] Connecting to ${cleanOrigin} ...\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command ^"\r\n[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^\r\n$base = '${cleanOrigin}'; $pc = $env:COMPUTERNAME; ^\r\n$work = Join-Path $env:TEMP 'flux_e3_bridge'; New-Item -ItemType Directory -Force -Path $work | Out-Null; ^\r\nWrite-Host ('[Flux E3] Bridge active on ' + $pc + '. Click Open in E3 inside the app!'); ^\r\nwhile ($true) { ^\r\n  try { ^\r\n    $resp = Invoke-RestMethod -Uri ($base + '/api/v1/e3-bridge/poll?host=' + [uri]::EscapeDataString($pc)) -TimeoutSec 10; ^\r\n    if ($resp.job) { ^\r\n      Write-Host ('[Flux E3] Executing job ' + $resp.job.jobId + ' (' + $resp.job.mode + ')...'); ^\r\n      $vbs = Join-Path $work 'flux_job.vbs'; ^\r\n      [IO.File]::WriteAllText($vbs, $resp.job.script, [Text.Encoding]::Unicode); ^\r\n      $out = & cscript.exe //Nologo $vbs /silent 2>&1 | Out-String; ^\r\n      $expFile = Join-Path $work 'flux_e3_export.json'; ^\r\n      $expJson = $null; if (($resp.job.mode -eq 'export') -and (Test-Path $expFile)) { $expJson = Get-Content $expFile -Raw -Encoding UTF8; Remove-Item $expFile -Force; } ^\r\n      $ack = @{ jobId = $resp.job.jobId; host = $pc; ok = ($LASTEXITCODE -eq 0); message = $out; exportedJson = $expJson } | ConvertTo-Json -Depth 4; ^\r\n      $bytes = [Text.Encoding]::UTF8.GetBytes($ack); ^\r\n      Invoke-RestMethod -Method Post -Uri ($base + '/api/v1/e3-bridge/ack') -ContentType 'application/json; charset=utf-8' -Body $bytes | Out-Null; ^\r\n      Write-Host ('[Flux E3] Job done: ' + $resp.job.jobId); ^\r\n    } ^\r\n  } catch { Start-Sleep -Seconds 2; } ^\r\n  Start-Sleep -Milliseconds 1500; ^\r\n}\r\n"\r\n`;
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
