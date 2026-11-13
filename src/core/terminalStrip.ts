import type { E3Annotation, E3Device, E3Pin, E3Project, E3Sheet } from './e3Types.ts';
import { normalizeProjectSheetRevisions } from './sheetRevisions.ts';

export interface TerminalBridgeGroup {
  id: string;
  pins: string[];
}

export interface TerminalSideConnection {
  wireId: string;
  netName: string;
  wireNumber: string;
  crossSection: string;
  targetText: string;
  cableText?: string;
}

export interface TerminalPoleRow {
  deviceId: string;
  terminalDesignation: string;
  poleIndex: number;
  poleKey: string;
  internalPinId: string;
  internalPinName: string;
  externalPinId?: string;
  externalPinName?: string;
  internalConnections: TerminalSideConnection[];
  externalConnections: TerminalSideConnection[];
  bridgeGroup?: string;
  isSpare: boolean;
  isAutoSpare: boolean;
  label: string;
}

export interface TerminalStripSummary {
  deviceId: string;
  designation: string;
  sheetId: string;
  article: string;
  manufacturer: string;
  stripTitle: string;
  rows: TerminalPoleRow[];
  bridges: TerminalBridgeGroup[];
  usedCount: number;
  spareCount: number;
}

const ATTR_BRIDGES = 'XT_BRIDGES';
const ATTR_SPARES = 'XT_SPARES';
const ATTR_LABELS = 'XT_LABELS';

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

function parseJsonAttr<T>(dev: E3Device, attrName: string, fallback: T): T {
  const raw = dev.attributes.find((a) => a.name === attrName)?.value;
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function setServiceAttr(dev: E3Device, name: string, value: string): E3Device {
  const rest = dev.attributes.filter((a) => a.name !== name);
  return {
    ...dev,
    attributes: [...rest, { name, value, owner: '', conflict: 'flux', service: true }],
  };
}

function pairTerminalPins(dev: E3Device): Array<{ internal: E3Pin; external?: E3Pin; poleKey: string }> {
  const pins = [...dev.pins];
  const topPins = pins.filter((p) => p.direction === 'top' || p.direction === 'left' || p.dy <= dev.height / 2);
  const bottomPins = pins.filter((p) => !topPins.includes(p));

  if (topPins.length > 0 && bottomPins.length > 0) {
    const usedBottom = new Set<string>();
    const pairs: Array<{ internal: E3Pin; external?: E3Pin; poleKey: string }> = [];
    for (let i = 0; i < topPins.length; i++) {
      const tp = topPins[i];
      const matchByDot = bottomPins.find(
        (bp) => !usedBottom.has(bp.id) && (bp.name === `${tp.name}.1` || bp.name.startsWith(`${tp.name}.`))
      );
      const matchByIdx = bottomPins[i] && !usedBottom.has(bottomPins[i].id) ? bottomPins[i] : undefined;
      const ext = matchByDot || matchByIdx || bottomPins.find((bp) => !usedBottom.has(bp.id));
      if (ext) usedBottom.add(ext.id);
      pairs.push({ internal: tp, external: ext, poleKey: tp.name });
    }
    for (const bp of bottomPins) {
      if (!usedBottom.has(bp.id)) {
        pairs.push({ internal: bp, external: undefined, poleKey: bp.name });
      }
    }
    return pairs;
  }

  return pins.map((p) => ({ internal: p, external: undefined, poleKey: p.name }));
}

function resolvePinConnections(
  project: E3Project,
  devId: string,
  pinId: string,
  devMap: Map<string, E3Device>,
  cableMap: Map<string, E3Project['cables'][number]>
): TerminalSideConnection[] {
  const wires = project.wires.filter(
    (w) => (w.fromDeviceId === devId && w.fromPinId === pinId) || (w.toDeviceId === devId && w.toPinId === pinId)
  );
  return wires.map((w) => {
    const isFrom = w.fromDeviceId === devId && w.fromPinId === pinId;
    const other = devMap.get(isFrom ? w.toDeviceId : w.fromDeviceId);
    const otherPin = other?.pins.find((p) => p.id === (isFrom ? w.toPinId : w.fromPinId));
    const cable = w.cableId ? cableMap.get(w.cableId) : undefined;
    return {
      wireId: w.id,
      netName: w.netName,
      wireNumber: w.wireNumber,
      crossSection: w.crossSection,
      targetText: other ? `${other.designation}:${otherPin?.name || '?'}` : 'Внешняя цепь',
      cableText: cable ? `${cable.designation}${w.coreNumber ? ` (${w.coreNumber})` : ''}` : undefined,
    };
  });
}

export function extractTerminalStrips(project: E3Project): TerminalStripSummary[] {
  const devMap = new Map(project.devices.map((d) => [d.id, d]));
  const cableMap = new Map(project.cables.map((c) => [c.id, c]));

  const terminals = project.devices
    .filter((d) => d.category === 'terminal' && d.bindingState !== 'REMOVED_IN_FLUX')
    .sort((a, b) => naturalCompare(a.designation, b.designation));

  return terminals.map((term) => {
    const bridges = parseJsonAttr<TerminalBridgeGroup[]>(term, ATTR_BRIDGES, []);
    const spares = new Set(parseJsonAttr<string[]>(term, ATTR_SPARES, []));
    const labels = parseJsonAttr<Record<string, string>>(term, ATTR_LABELS, {});
    const paired = pairTerminalPins(term);

    const rows: TerminalPoleRow[] = paired.map((pair, idx) => {
      const internalConnections = resolvePinConnections(
        project,
        term.id,
        pair.internal.id,
        devMap,
        cableMap
      );
      const externalConnections = pair.external
        ? resolvePinConnections(project, term.id, pair.external.id, devMap, cableMap)
        : [];
      const bridge = bridges.find((b) => b.pins.includes(pair.poleKey));
      const isAutoSpare = internalConnections.length === 0 && externalConnections.length === 0;
      const isSpare = spares.has(pair.poleKey) || isAutoSpare;

      return {
        deviceId: term.id,
        terminalDesignation: term.designation,
        poleIndex: idx + 1,
        poleKey: pair.poleKey,
        internalPinId: pair.internal.id,
        internalPinName: pair.internal.name,
        externalPinId: pair.external?.id,
        externalPinName: pair.external?.name,
        internalConnections,
        externalConnections,
        bridgeGroup: bridge?.id,
        isSpare,
        isAutoSpare,
        label: labels[pair.poleKey] || '',
      };
    });

    const spareCount = rows.filter((r) => r.isSpare).length;
    const stripTitle =
      term.attributes.find((a) => a.name === 'Маркировка ряда')?.value || term.componentName;

    return {
      deviceId: term.id,
      designation: term.designation,
      sheetId: term.sheetId,
      article: term.article,
      manufacturer: term.manufacturer,
      stripTitle,
      rows,
      bridges,
      usedCount: rows.length - spareCount,
      spareCount,
    };
  });
}

export function setTerminalPoleSpare(
  project: E3Project,
  deviceId: string,
  poleKey: string,
  spare: boolean
): E3Project {
  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    devices: project.devices.map((d) => {
      if (d.id !== deviceId) return d;
      const spares = new Set(parseJsonAttr<string[]>(d, ATTR_SPARES, []));
      if (spare) spares.add(poleKey);
      else spares.delete(poleKey);
      return setServiceAttr(d, ATTR_SPARES, JSON.stringify(Array.from(spares)));
    }),
  };
}

export function setTerminalPoleLabel(
  project: E3Project,
  deviceId: string,
  poleKey: string,
  label: string
): E3Project {
  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    devices: project.devices.map((d) => {
      if (d.id !== deviceId) return d;
      const labels = { ...parseJsonAttr<Record<string, string>>(d, ATTR_LABELS, {}) };
      if (label.trim()) labels[poleKey] = label.trim();
      else delete labels[poleKey];
      return setServiceAttr(d, ATTR_LABELS, JSON.stringify(labels));
    }),
  };
}

export function assignTerminalBridge(
  project: E3Project,
  deviceId: string,
  poleKeys: string[],
  bridgeId?: string
): E3Project {
  const uniqueKeys = Array.from(new Set(poleKeys.filter(Boolean)));
  if (uniqueKeys.length < 2) return project;

  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    devices: project.devices.map((d) => {
      if (d.id !== deviceId) return d;
      const existing = parseJsonAttr<TerminalBridgeGroup[]>(d, ATTR_BRIDGES, []);
      const cleaned = existing
        .map((b) => ({
          ...b,
          pins: b.pins.filter((p) => !uniqueKeys.includes(p)),
        }))
        .filter((b) => b.pins.length >= 2);
      const nextNum =
        cleaned.reduce((mx, b) => {
          const m = /^M(\d+)$/i.exec(b.id);
          return m ? Math.max(mx, Number(m[1])) : mx;
        }, 0) + 1;
      const id = bridgeId?.trim() || `M${nextNum}`;
      return setServiceAttr(
        d,
        ATTR_BRIDGES,
        JSON.stringify([...cleaned, { id, pins: uniqueKeys }])
      );
    }),
  };
}

export function removeTerminalBridge(
  project: E3Project,
  deviceId: string,
  bridgeId?: string,
  poleKey?: string
): E3Project {
  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    devices: project.devices.map((d) => {
      if (d.id !== deviceId) return d;
      const existing = parseJsonAttr<TerminalBridgeGroup[]>(d, ATTR_BRIDGES, []);
      const next = existing
        .filter((b) => (bridgeId ? b.id !== bridgeId : true))
        .map((b) =>
          poleKey ? { ...b, pins: b.pins.filter((p) => p !== poleKey) } : b
        )
        .filter((b) => b.pins.length >= 2);
      return setServiceAttr(d, ATTR_BRIDGES, JSON.stringify(next));
    }),
  };
}

export function addTerminalSparePole(project: E3Project, deviceId: string): E3Project {
  return {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    devices: project.devices.map((d) => {
      if (d.id !== deviceId) return d;
      const paired = pairTerminalPins(d);
      const nextIndex = paired.length + 1;
      const poleName = String(nextIndex);
      const stepDx = paired.length > 0 ? Math.max(24, Math.round((d.width - 20) / Math.max(1, paired.length))) : 28;
      const newWidth = Math.max(d.width, 40 + nextIndex * stepDx);
      const dx = 20 + (nextIndex - 1) * stepDx;
      const sig = d.pins[0]?.signalType || 'signal';
      const topPin: E3Pin = {
        id: `p-${d.id}-${poleName}-${Date.now().toString(36)}`,
        name: poleName,
        dx,
        dy: 0,
        direction: 'top',
        signalType: sig,
      };
      const bottomPin: E3Pin = {
        id: `p-${d.id}-${poleName}b-${Date.now().toString(36)}`,
        name: `${poleName}.1`,
        dx,
        dy: d.height,
        direction: 'bottom',
        signalType: sig,
      };
      const spares = new Set(parseJsonAttr<string[]>(d, ATTR_SPARES, []));
      spares.add(poleName);
      const withAttr = setServiceAttr(d, ATTR_SPARES, JSON.stringify(Array.from(spares)));
      return {
        ...withAttr,
        width: newWidth,
        pins: [...withAttr.pins, topPin, bottomPin],
      };
    }),
  };
}

export const TERMINAL_GRAPHIC_SHEET_ID = 'sheet-xt-graphic';

export function generateOrUpdateTerminalStripSheet(
  project: E3Project,
  targetDeviceId?: string
): { nextProject: E3Project; sheetId: string; created: boolean } {
  const strips = extractTerminalStrips(project);
  const selectedStrips = targetDeviceId
    ? strips.filter((s) => s.deviceId === targetDeviceId)
    : strips;
  const stripsToRender = selectedStrips.length > 0 ? selectedStrips : strips;

  const existingSheet = project.sheets.find((s) => s.id === TERMINAL_GRAPHIC_SHEET_ID);
  const created = !existingSheet;
  const sheetId = existingSheet?.id || TERMINAL_GRAPHIC_SHEET_ID;
  const baseTitleBlock = project.sheets[0]?.titleBlock;

  const targetSheet: E3Sheet = existingSheet
    ? {
        ...existingSheet,
        format: 'A3',
        width: 1400,
        height: 920,
      }
    : {
        id: sheetId,
        number: project.sheets.length + 1,
        name: 'Клеммные ряды -XT',
        format: 'A3',
        width: 1400,
        height: 920,
        titleBlock: {
          stampForm: 'form2a',
          documentCode: baseTitleBlock?.documentCode || project.projectCode,
          projectTitle: baseTitleBlock?.projectTitle || project.name,
          organization: baseTitleBlock?.organization || 'ООО «ПромВентАвтоматика»',
          designer: baseTitleBlock?.designer || project.author,
          checker: baseTitleBlock?.checker || '',
          normControl: baseTitleBlock?.normControl || '',
          approver: baseTitleBlock?.approver || '',
          litera: baseTitleBlock?.litera || 'Р',
          sheetTitle: 'Таблица соединений и клеммных рядов (-XT)',
        },
      };

  const keptAnnotations = (project.annotations || []).filter(
    (a) => !(a.sheetId === sheetId && a.id.startsWith('ann-xt-gen-'))
  );

  const generated: E3Annotation[] = [];
  let cursorX = 80;
  let cursorY = 70;
  const colWidth = 600;
  const maxY = 710;

  for (const strip of stripsToRender) {
    const rowH = 26;
    const blockH = 54 + strip.rows.length * rowH;
    if (cursorY + blockH > maxY && cursorX === 80) {
      cursorX = 720;
      cursorY = 70;
    }

    const boxId = `ann-xt-gen-box-${strip.deviceId}`;
    generated.push({
      id: boxId,
      sheetId,
      kind: 'rect',
      x: cursorX,
      y: cursorY,
      width: colWidth,
      height: blockH,
      text: `${strip.designation} · ${strip.stripTitle} (${strip.article})`,
      color: '#0f766e',
      fontSize: 12,
      strokeWidth: 1.5,
      strokeStyle: 'dashed',
    });

    generated.push({
      id: `ann-xt-gen-hdr-${strip.deviceId}`,
      sheetId,
      kind: 'text',
      x: cursorX + 14,
      y: cursorY + 30,
      width: colWidth - 28,
      height: 20,
      text: 'Внутр. сторона (Шкаф)   |   Клемма / Мостик   |   Внеш. сторона (Поле)',
      color: '#475569',
      fontSize: 10.5,
    });

    strip.rows.forEach((row, rIdx) => {
      const ry = cursorY + 56 + rIdx * rowH;
      const intText =
        row.internalConnections.length > 0
          ? row.internalConnections
              .map((c) => `${c.targetText} [${c.wireNumber || c.netName}]`)
              .join(', ')
          : '—';
      const extText =
        row.externalConnections.length > 0
          ? row.externalConnections
              .map((c) => `${c.targetText}${c.cableText ? ` (${c.cableText})` : ''}`)
              .join(', ')
          : row.isSpare
            ? 'РЕЗЕРВ'
            : '—';
      const midTag = [
        row.internalPinName,
        row.externalPinName ? `/${row.externalPinName}` : '',
        row.bridgeGroup ? ` [${row.bridgeGroup}]` : '',
        row.label ? ` «${row.label}»` : '',
      ].join('');

      generated.push({
        id: `ann-xt-gen-row-${strip.deviceId}-${rIdx}`,
        sheetId,
        kind: 'text',
        x: cursorX + 14,
        y: ry,
        width: colWidth - 28,
        height: 20,
        text: `${intText}   ──  (${midTag})  ──   ${extText}`,
        color: row.isSpare ? '#94a3b8' : '#0f172a',
        fontSize: 10.5,
      });
    });

    cursorY += blockH + 34;
  }

  const nextSheets = existingSheet
    ? project.sheets.map((s) => (s.id === sheetId ? targetSheet : s))
    : [...project.sheets, targetSheet];

  const nextProject = normalizeProjectSheetRevisions({
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    sheets: nextSheets,
    annotations: [...keptAnnotations, ...generated],
  });

  return { nextProject, sheetId, created };
}
