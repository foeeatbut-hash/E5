import { calculateWireLengthMm, getDeviceBounds, nextUniqueDesignation } from './e3Engine.ts';
import type {
  E3Device,
  E3Project,
  E3Sheet,
  E3Wire,
  OffPageRefMeta,
  SignalType,
} from './e3Types.ts';
import {
  buildGostSheetGeometry,
  GOST_ZONE_COLS,
  GOST_ZONE_ROWS,
} from './gostFrame.ts';

export interface GostZoneResult {
  col: string;
  row: string;
  zone: string;
}

export interface OffPageCounterpartInfo {
  deviceId: string;
  designation: string;
  sheetId: string;
  sheetNumber: number;
  sheetName: string;
  zone: string;
  direction: 'out' | 'in';
  x: number;
  y: number;
}

export interface ResolvedOffPageLink {
  deviceId: string;
  designation: string;
  direction: 'out' | 'in';
  potentialName: string;
  signalType: SignalType;
  sheetId: string;
  sheetNumber: number;
  ownZone: string;
  primaryCounterpart: OffPageCounterpartInfo | null;
  counterparts: OffPageCounterpartInfo[];
  addressText: string;
}

export interface PotentialTraceResult {
  netNames: string[];
  signalType: SignalType;
  wireIds: string[];
  pinKeys: string[];
  offPageDeviceIds: string[];
  sheetIds: string[];
  totalLengthMm: number;
  segmentCount: number;
}

/**
 * Resolves the canonical GOST 2.104 coordinate zone (e.g. "Б3") for a point on a sheet.
 */
export function computeGostZone(
  sheet: E3Sheet,
  project: E3Project,
  x: number,
  y: number
): GostZoneResult {
  const geom = buildGostSheetGeometry(sheet, project);
  const { left, top, right, bottom, width, height } = geom.frame;
  const clampedX = Math.max(left, Math.min(right - 0.01, x));
  const clampedY = Math.max(top, Math.min(bottom - 0.01, y));

  const colIdx = Math.min(
    GOST_ZONE_COLS.length - 1,
    Math.max(0, Math.floor(((clampedX - left) / Math.max(1, width)) * GOST_ZONE_COLS.length))
  );
  const rowIdx = Math.min(
    GOST_ZONE_ROWS.length - 1,
    Math.max(0, Math.floor(((clampedY - top) / Math.max(1, height)) * GOST_ZONE_ROWS.length))
  );

  const col = GOST_ZONE_COLS[colIdx];
  const row = GOST_ZONE_ROWS[rowIdx];
  return { col, row, zone: `${row}${col}` };
}

export function getOffPageMeta(
  device: E3Device,
  connectedWire?: E3Wire
): OffPageRefMeta {
  const direction: 'out' | 'in' =
    device.offPageRef?.direction ||
    (device.e3BlockName.includes('IN') ? 'in' : 'out');
  const potentialAttr = device.attributes.find((a) => /потенциал|цепь|net/i.test(a.name))?.value?.trim();
  const potentialName =
    device.offPageRef?.potentialName?.trim() ||
    connectedWire?.netName?.trim() ||
    potentialAttr ||
    device.designation.replace(/^-/, '').trim() ||
    '+24V';
  const signalType: SignalType =
    device.offPageRef?.signalType ||
    connectedWire?.signalType ||
    device.pins[0]?.signalType ||
    'signal';

  return {
    direction,
    potentialName,
    signalType,
    pairId: device.offPageRef?.pairId,
    targetDeviceId: device.offPageRef?.targetDeviceId,
  };
}

function normalizePotentialKey(name: string): string {
  return name.trim().toUpperCase();
}

/**
 * Resolves paired off-page connectors across sheets and formats E3/GOST addresses
 * such as "→ Л.2 (Б3)" or "← Л.1 (В4)".
 */
export function resolveOffPageLinks(project: E3Project): Map<string, ResolvedOffPageLink> {
  const result = new Map<string, ResolvedOffPageLink>();
  const sheetMap = new Map(project.sheets.map((s) => [s.id, s]));

  const offPageDevices = project.devices.filter(
    (d) => d.category === 'offpage_ref' && d.bindingState !== 'REMOVED_IN_FLUX'
  );
  if (offPageDevices.length === 0) return result;

  // Map deviceId -> first connected wire for potential fallback
  const connectedWireByDev = new Map<string, E3Wire>();
  for (const w of project.wires) {
    if (!connectedWireByDev.has(w.fromDeviceId)) connectedWireByDev.set(w.fromDeviceId, w);
    if (!connectedWireByDev.has(w.toDeviceId)) connectedWireByDev.set(w.toDeviceId, w);
  }

  interface Entry {
    device: E3Device;
    meta: OffPageRefMeta;
    sheet: E3Sheet | undefined;
    sheetNumber: number;
    zone: string;
    cx: number;
    cy: number;
  }

  const entries: Entry[] = offPageDevices.map((device) => {
    const meta = getOffPageMeta(device, connectedWireByDev.get(device.id));
    const sheet = sheetMap.get(device.sheetId) || project.sheets[0];
    const bounds = getDeviceBounds(device);
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const zone = sheet ? computeGostZone(sheet, project, cx, cy).zone : 'А1';
    return {
      device,
      meta,
      sheet,
      sheetNumber: sheet?.number ?? 1,
      zone,
      cx,
      cy,
    };
  });

  for (const src of entries) {
    const srcNorm = normalizePotentialKey(src.meta.potentialName);
    const otherCandidates = entries.filter((other) => other.device.id !== src.device.id);

    // Priority 1: explicit targetDeviceId match
    // Priority 2: explicit pairId match
    // Priority 3: same potentialName on another sheet (opposite direction preferred first)
    const scored: Array<{ entry: Entry; rank: number }> = [];
    for (const cand of otherCandidates) {
      let rank = 999;
      if (src.meta.targetDeviceId && cand.device.id === src.meta.targetDeviceId) {
        rank = 1;
      } else if (cand.meta.targetDeviceId && cand.meta.targetDeviceId === src.device.id) {
        rank = 2;
      } else if (src.meta.pairId && cand.meta.pairId && src.meta.pairId === cand.meta.pairId) {
        rank = cand.device.sheetId !== src.device.sheetId ? 3 : 4;
      } else if (normalizePotentialKey(cand.meta.potentialName) === srcNorm) {
        const diffSheet = cand.device.sheetId !== src.device.sheetId;
        const oppositeDir = cand.meta.direction !== src.meta.direction;
        if (diffSheet && oppositeDir) rank = 5;
        else if (diffSheet) rank = 6;
        else if (oppositeDir) rank = 7;
      }
      if (rank < 999) {
        scored.push({ entry: cand, rank });
      }
    }

    scored.sort(
      (a, b) =>
        a.rank - b.rank ||
        a.entry.sheetNumber - b.entry.sheetNumber ||
        a.entry.zone.localeCompare(b.entry.zone, 'ru')
    );

    const counterparts: OffPageCounterpartInfo[] = scored.map(({ entry }) => ({
      deviceId: entry.device.id,
      designation: entry.device.designation,
      sheetId: entry.device.sheetId,
      sheetNumber: entry.sheetNumber,
      sheetName: entry.sheet?.name || `Лист ${entry.sheetNumber}`,
      zone: entry.zone,
      direction: entry.meta.direction,
      x: entry.cx,
      y: entry.cy,
    }));

    const primary = counterparts[0] || null;
    const arrow = src.meta.direction === 'out' ? '→' : '←';
    const extraCount = counterparts.length > 1 ? ` +${counterparts.length - 1}` : '';
    const addressText = primary
      ? `${arrow} Л.${primary.sheetNumber} (${primary.zone})${extraCount}`
      : `${arrow} Л.?`;

    result.set(src.device.id, {
      deviceId: src.device.id,
      designation: src.device.designation,
      direction: src.meta.direction,
      potentialName: src.meta.potentialName,
      signalType: src.meta.signalType,
      sheetId: src.device.sheetId,
      sheetNumber: src.sheetNumber,
      ownZone: src.zone,
      primaryCounterpart: primary,
      counterparts,
      addressText,
    });
  }

  return result;
}

/**
 * Traces the full electrically connected potential across T-branches, shared pins,
 * matching net names, and paired off-page cross-sheet connectors.
 */
export function traceConnectedPotential(
  project: E3Project,
  seed: { wireId?: string; netName?: string; deviceId?: string; pinId?: string }
): PotentialTraceResult {
  const devMap = new Map(project.devices.map((d) => [d.id, d]));
  const offPageLinks = resolveOffPageLinks(project);

  const visitedWires = new Set<string>();
  const visitedPins = new Set<string>();
  const visitedNets = new Set<string>();
  const visitedOffPage = new Set<string>();
  const displayNetNames = new Set<string>();

  const wireQueue: E3Wire[] = [];
  const pinQueue: Array<{ deviceId: string; pinId: string }> = [];
  const netQueue: string[] = [];
  const offPageQueue: string[] = [];

  const enqueueWire = (w: E3Wire) => {
    if (visitedWires.has(w.id)) return;
    visitedWires.add(w.id);
    wireQueue.push(w);
  };
  const enqueuePin = (deviceId: string, pinId: string) => {
    const key = `${deviceId}:${pinId}`;
    if (visitedPins.has(key)) return;
    visitedPins.add(key);
    pinQueue.push({ deviceId, pinId });
  };
  const enqueueNet = (netName: string) => {
    const norm = normalizePotentialKey(netName);
    if (!norm || visitedNets.has(norm)) return;
    visitedNets.add(norm);
    displayNetNames.add(netName.trim());
    netQueue.push(norm);
  };
  const enqueueOffPage = (deviceId: string) => {
    if (visitedOffPage.has(deviceId)) return;
    const dev = devMap.get(deviceId);
    if (!dev || dev.category !== 'offpage_ref' || dev.bindingState === 'REMOVED_IN_FLUX') return;
    visitedOffPage.add(deviceId);
    offPageQueue.push(deviceId);
  };

  if (seed.wireId) {
    const w = project.wires.find((x) => x.id === seed.wireId);
    if (w) enqueueWire(w);
  }
  if (seed.netName) {
    enqueueNet(seed.netName);
  }
  if (seed.deviceId) {
    const dev = devMap.get(seed.deviceId);
    if (dev?.category === 'offpage_ref') {
      enqueueOffPage(dev.id);
      if (dev.pins[0]) enqueuePin(dev.id, dev.pins[0].id);
    } else if (seed.pinId) {
      enqueuePin(seed.deviceId, seed.pinId);
    }
  }

  while (
    wireQueue.length > 0 ||
    pinQueue.length > 0 ||
    netQueue.length > 0 ||
    offPageQueue.length > 0
  ) {
    while (wireQueue.length > 0) {
      const w = wireQueue.shift()!;
      if (w.netName.trim()) enqueueNet(w.netName);
      enqueuePin(w.fromDeviceId, w.fromPinId);
      enqueuePin(w.toDeviceId, w.toPinId);

      const dFrom = devMap.get(w.fromDeviceId);
      if (dFrom?.category === 'offpage_ref') enqueueOffPage(dFrom.id);
      const dTo = devMap.get(w.toDeviceId);
      if (dTo?.category === 'offpage_ref') enqueueOffPage(dTo.id);
    }

    while (pinQueue.length > 0) {
      const { deviceId, pinId } = pinQueue.shift()!;
      for (const w of project.wires) {
        if (
          (w.fromDeviceId === deviceId && w.fromPinId === pinId) ||
          (w.toDeviceId === deviceId && w.toPinId === pinId)
        ) {
          enqueueWire(w);
        }
      }
      const dev = devMap.get(deviceId);
      if (dev?.category === 'offpage_ref') {
        enqueueOffPage(dev.id);
      }
    }

    while (netQueue.length > 0) {
      const normNet = netQueue.shift()!;
      for (const w of project.wires) {
        if (normalizePotentialKey(w.netName) === normNet) {
          enqueueWire(w);
        }
      }
      for (const link of offPageLinks.values()) {
        if (normalizePotentialKey(link.potentialName) === normNet) {
          enqueueOffPage(link.deviceId);
        }
      }
    }

    while (offPageQueue.length > 0) {
      const opId = offPageQueue.shift()!;
      const dev = devMap.get(opId);
      if (dev?.pins[0]) {
        enqueuePin(dev.id, dev.pins[0].id);
      }
      const link = offPageLinks.get(opId);
      if (link) {
        if (link.potentialName.trim()) enqueueNet(link.potentialName);
        for (const cp of link.counterparts) {
          enqueueOffPage(cp.deviceId);
        }
      }
    }
  }

  const tracedWires = project.wires.filter((w) => visitedWires.has(w.id));
  const sheetIds = new Set<string>();
  let totalLengthMm = 0;
  let signalType: SignalType = 'signal';

  for (const w of tracedWires) {
    sheetIds.add(w.sheetId);
    totalLengthMm += calculateWireLengthMm(w, devMap);
    signalType = w.signalType;
  }

  for (const opId of visitedOffPage) {
    const dev = devMap.get(opId);
    if (dev) {
      sheetIds.add(dev.sheetId);
      if (tracedWires.length === 0) {
        signalType = getOffPageMeta(dev).signalType;
      }
    }
  }

  return {
    netNames: Array.from(displayNetNames),
    signalType,
    wireIds: Array.from(visitedWires),
    pinKeys: Array.from(visitedPins),
    offPageDeviceIds: Array.from(visitedOffPage),
    sheetIds: Array.from(sheetIds),
    totalLengthMm,
    segmentCount: tracedWires.length,
  };
}

export function createOffPageConnectorDevice(opts: {
  existingDevices: Array<Pick<E3Device, 'designation'>>;
  sheetId: string;
  x: number;
  y: number;
  direction: 'out' | 'in';
  potentialName: string;
  signalType: SignalType;
  pairId?: string;
  targetDeviceId?: string;
  idSuffix?: string;
}): E3Device {
  const stamp = `${Date.now().toString(36)}-${opts.idSuffix || Math.random().toString(36).slice(2, 6)}`;
  const id = `dev-xp-${stamp}`;
  const designation = nextUniqueDesignation(opts.existingDevices, 'XP');
  const isOut = opts.direction === 'out';

  return {
    id,
    elementId: `el-xp-${stamp}`,
    designation,
    componentName: isOut
      ? 'Ссылка межлистовая исходящая (→ Лист)'
      : 'Ссылка межлистовая входящая (← Лист)',
    article: isOut ? 'E3-OFFPAGE-OUT' : 'E3-OFFPAGE-IN',
    manufacturer: 'ГОСТ 2.702 / E3.series',
    category: 'offpage_ref',
    sheetId: opts.sheetId,
    x: Math.round(opts.x),
    y: Math.round(opts.y),
    rotation: 0,
    width: 120,
    height: 36,
    e3BlockName: isOut ? 'GOST_OFFPAGE_OUT' : 'GOST_OFFPAGE_IN',
    bindingState: 'PLACED',
    pins: [
      {
        id: `${id}-p1`,
        name: isOut ? 'IN' : 'OUT',
        dx: isOut ? 0 : 120,
        dy: 18,
        direction: isOut ? 'left' : 'right',
        signalType: opts.signalType,
      },
    ],
    attributes: [
      { name: 'Потенциал', value: opts.potentialName, owner: '', conflict: 'flux' },
      { name: 'Направление', value: isOut ? 'Исходящая (→)' : 'Входящая (←)', owner: '', conflict: 'flux' },
      { name: 'Стандарт', value: 'ГОСТ 2.702 / E3.series', owner: '', conflict: 'flux' },
    ],
    offPageRef: {
      direction: opts.direction,
      potentialName: opts.potentialName,
      signalType: opts.signalType,
      pairId: opts.pairId,
      targetDeviceId: opts.targetDeviceId,
    },
  };
}

export function createPairedOffPageConnectors(
  project: E3Project,
  opts: {
    sourceSheetId: string;
    sourceX: number;
    sourceY: number;
    targetSheetId: string;
    targetX?: number;
    targetY?: number;
    potentialName: string;
    signalType: SignalType;
    sourceDirection?: 'out' | 'in';
  }
): {
  sourceDevice: E3Device;
  targetDevice: E3Device;
  nextProject: E3Project;
} {
  const pairId = `pair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  const srcDir: 'out' | 'in' = opts.sourceDirection || 'out';
  const tgtDir: 'out' | 'in' = srcDir === 'out' ? 'in' : 'out';

  const sourceDevice = createOffPageConnectorDevice({
    existingDevices: project.devices,
    sheetId: opts.sourceSheetId,
    x: opts.sourceX,
    y: opts.sourceY,
    direction: srcDir,
    potentialName: opts.potentialName,
    signalType: opts.signalType,
    pairId,
    idSuffix: 'src',
  });

  const targetDevice = createOffPageConnectorDevice({
    existingDevices: [...project.devices, sourceDevice],
    sheetId: opts.targetSheetId,
    x: opts.targetX ?? 220,
    y: opts.targetY ?? 180,
    direction: tgtDir,
    potentialName: opts.potentialName,
    signalType: opts.signalType,
    pairId,
    targetDeviceId: sourceDevice.id,
    idSuffix: 'tgt',
  });

  sourceDevice.offPageRef = {
    ...sourceDevice.offPageRef!,
    targetDeviceId: targetDevice.id,
  };

  return {
    sourceDevice,
    targetDevice,
    nextProject: {
      ...project,
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
      devices: [...project.devices, sourceDevice, targetDevice],
    },
  };
}
