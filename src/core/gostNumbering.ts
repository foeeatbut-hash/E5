import type { E3Device, E3Project, E3Sheet, E3Wire } from './e3Types.ts';
import { computeGostZone } from './crossSheetRefs.ts';
import { getAbsolutePinPos } from './e3Engine.ts';

export type WireNumberingMode = 'sheet-seq' | 'zone-seq' | 'potential';
export type NumberingScope = 'active-sheet' | 'all-sheets';
export type DeviceScanOrder = 'top-to-bottom' | 'left-to-right';

export interface WireNumberingOptions {
  scope: NumberingScope;
  activeSheetId?: string;
  mode: WireNumberingMode;
  preservePowerPhases: boolean;
}

export interface WireNumberChangePreview {
  wireId: string;
  sheetNumber: number;
  netName: string;
  oldNumber: string;
  newNumber: string;
}

export interface DeviceNumberingOptions {
  scope: NumberingScope;
  activeSheetId?: string;
  order: DeviceScanOrder;
  prefixFilter?: string;
}

export interface DeviceNumberChangePreview {
  deviceId: string;
  sheetNumber: number;
  oldDesignation: string;
  newDesignation: string;
  x: number;
  y: number;
}

const POWER_PHASE_REGEX = /^(L[123](\.\d+)?|N|PE|PEN|\+24V.*|0V.*|U\d+|V\d+|W\d+)$/i;
const SKIP_DEVICE_CATEGORIES = new Set<E3Device['category']>([
  'airflow_arrow',
  'io_matrix',
  'offpage_ref',
]);

function getWireMidpoint(wire: E3Wire, devMap: Map<string, E3Device>): { x: number; y: number } {
  if (wire.waypoints.length >= 2) {
    const midIdx = Math.floor(wire.waypoints.length / 2);
    const a = wire.waypoints[midIdx - 1];
    const b = wire.waypoints[midIdx];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  const d1 = devMap.get(wire.fromDeviceId);
  const d2 = devMap.get(wire.toDeviceId);
  const p1 = d1?.pins.find((p) => p.id === wire.fromPinId);
  const p2 = d2?.pins.find((p) => p.id === wire.toPinId);
  if (d1 && d2 && p1 && p2) {
    const a = getAbsolutePinPos(d1, p1);
    const b = getAbsolutePinPos(d2, p2);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  return { x: 0, y: 0 };
}

function buildPotentialClusterKey(
  wire: E3Wire,
  sheetNumber: number,
  mode: WireNumberingMode
): string {
  const net = (wire.netName || '').trim();
  if (mode === 'potential') {
    return net ? `NET:${net}` : `WIRE:${wire.id}`;
  }
  return net ? `S${sheetNumber}:NET:${net}` : `S${sheetNumber}:WIRE:${wire.id}`;
}

export function previewAutoNumberWiresGost(
  project: E3Project,
  opts: WireNumberingOptions
): { nextProject: E3Project; changes: WireNumberChangePreview[] } {
  const sheetMap = new Map<string, E3Sheet>(project.sheets.map((s) => [s.id, s]));
  const devMap = new Map<string, E3Device>(project.devices.map((d) => [d.id, d]));

  const targetWires = project.wires.filter((w) =>
    opts.scope === 'all-sheets' ? true : w.sheetId === opts.activeSheetId
  );

  // Sort target wires by (sheet.number, y, x) so numbers flow cleanly top-to-bottom, left-to-right
  const sortedWires = [...targetWires].sort((a, b) => {
    const sa = sheetMap.get(a.sheetId)?.number || 1;
    const sb = sheetMap.get(b.sheetId)?.number || 1;
    if (sa !== sb) return sa - sb;
    const ma = getWireMidpoint(a, devMap);
    const mb = getWireMidpoint(b, devMap);
    const rowA = Math.round(ma.y / 30);
    const rowB = Math.round(mb.y / 30);
    if (rowA !== rowB) return rowA - rowB;
    return ma.x - mb.x;
  });

  const clusterToNumber = new Map<string, string>();
  const sheetSeqCounters = new Map<number, number>();
  const zoneSeqCounters = new Map<string, number>();
  let globalPotentialSeq = 1;

  const updates = new Map<string, string>();
  const changes: WireNumberChangePreview[] = [];

  for (const w of sortedWires) {
    const sheet = sheetMap.get(w.sheetId);
    const sheetNum = sheet?.number || 1;
    const currentNum = (w.wireNumber || '').trim();
    if (
      opts.preservePowerPhases &&
      (POWER_PHASE_REGEX.test(currentNum) ||
        w.signalType === 'pe' ||
        w.signalType === 'neutral' ||
        POWER_PHASE_REGEX.test(w.netName || ''))
    ) {
      continue;
    }

    const clusterKey = buildPotentialClusterKey(w, sheetNum, opts.mode);
    let assigned = clusterToNumber.get(clusterKey);

    if (!assigned) {
      if (opts.mode === 'sheet-seq') {
        const nextSeq = (sheetSeqCounters.get(sheetNum) || 0) + 1;
        sheetSeqCounters.set(sheetNum, nextSeq);
        assigned = `${sheetNum}${String(nextSeq).padStart(2, '0')}`;
      } else if (opts.mode === 'zone-seq') {
        const mid = getWireMidpoint(w, devMap);
        const zone = sheet ? computeGostZone(sheet, project, mid.x, mid.y).zone : 'А1';
        const zKey = `${sheetNum}${zone}`;
        const nextSeq = (zoneSeqCounters.get(zKey) || 0) + 1;
        zoneSeqCounters.set(zKey, nextSeq);
        assigned = `${zKey}-${nextSeq}`;
      } else {
        // 'potential' mode: clean sequential equipotential code across project
        assigned = `Ц${String(globalPotentialSeq).padStart(3, '0')}`;
        globalPotentialSeq += 1;
      }
      clusterToNumber.set(clusterKey, assigned);
    }

    if (assigned !== currentNum) {
      updates.set(w.id, assigned);
      changes.push({
        wireId: w.id,
        sheetNumber: sheetNum,
        netName: w.netName,
        oldNumber: currentNum || '—',
        newNumber: assigned,
      });
    }
  }

  if (updates.size === 0) {
    return { nextProject: project, changes: [] };
  }

  const nextProject: E3Project = {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    wires: project.wires.map((w) =>
      updates.has(w.id) ? { ...w, wireNumber: updates.get(w.id)! } : w
    ),
  };

  return { nextProject, changes };
}

export function autoNumberWiresGost(
  project: E3Project,
  opts: WireNumberingOptions
): E3Project {
  return previewAutoNumberWiresGost(project, opts).nextProject;
}

function parseGostDesignationParts(designation: string): { prefix: string; num: number | null } | null {
  const m = /^(-?[A-Za-zА-Яа-яЁё]+)(\d*)/.exec(designation.trim());
  if (!m) return null;
  return {
    prefix: m[1],
    num: m[2] ? Number(m[2]) : null,
  };
}

export function previewAutoNumberDevicesGost(
  project: E3Project,
  opts: DeviceNumberingOptions
): { nextProject: E3Project; changes: DeviceNumberChangePreview[] } {
  const sheetMap = new Map<string, E3Sheet>(project.sheets.map((s) => [s.id, s]));
  const filterNorm = (opts.prefixFilter || '').trim().toUpperCase().replace(/^-/, '');

  const eligible = project.devices.filter((d) => {
    if (d.bindingState === 'REMOVED_IN_FLUX') return false;
    if (SKIP_DEVICE_CATEGORIES.has(d.category)) return false;
    if (opts.scope === 'active-sheet' && d.sheetId !== opts.activeSheetId) return false;
    const parsed = parseGostDesignationParts(d.designation);
    if (!parsed) return false;
    if (filterNorm) {
      const pNorm = parsed.prefix.toUpperCase().replace(/^-/, '');
      if (pNorm !== filterNorm) return false;
    }
    return true;
  });

  // Track max indices already used on OTHER sheets when numbering only active sheet
  const prefixMaxUsedOutside = new Map<string, number>();
  if (opts.scope === 'active-sheet') {
    for (const d of project.devices) {
      if (d.sheetId === opts.activeSheetId || d.bindingState === 'REMOVED_IN_FLUX') continue;
      const parsed = parseGostDesignationParts(d.designation);
      if (parsed && parsed.num !== null) {
        const prev = prefixMaxUsedOutside.get(parsed.prefix) || 0;
        if (parsed.num > prev) prefixMaxUsedOutside.set(parsed.prefix, parsed.num);
      }
    }
  }

  const sorted = [...eligible].sort((a, b) => {
    const sa = sheetMap.get(a.sheetId)?.number || 1;
    const sb = sheetMap.get(b.sheetId)?.number || 1;
    if (sa !== sb) return sa - sb;
    if (opts.order === 'top-to-bottom') {
      const bandA = Math.round(a.y / 40);
      const bandB = Math.round(b.y / 40);
      if (bandA !== bandB) return bandA - bandB;
      return a.x - b.x;
    } else {
      const bandA = Math.round(a.x / 40);
      const bandB = Math.round(b.x / 40);
      if (bandA !== bandB) return bandA - bandB;
      return a.y - b.y;
    }
  });

  const counters = new Map<string, number>(prefixMaxUsedOutside);
  const renameMap = new Map<string, string>();
  const oldToNewDes = new Map<string, string>();
  const changes: DeviceNumberChangePreview[] = [];

  for (const dev of sorted) {
    const parsed = parseGostDesignationParts(dev.designation);
    if (!parsed) continue;
    const nextIdx = (counters.get(parsed.prefix) || 0) + 1;
    counters.set(parsed.prefix, nextIdx);
    const nextDes = `${parsed.prefix}${nextIdx}`;
    if (nextDes !== dev.designation) {
      renameMap.set(dev.id, nextDes);
      oldToNewDes.set(dev.designation, nextDes);
      changes.push({
        deviceId: dev.id,
        sheetNumber: sheetMap.get(dev.sheetId)?.number || 1,
        oldDesignation: dev.designation,
        newDesignation: nextDes,
        x: Math.round(dev.x),
        y: Math.round(dev.y),
      });
    }
  }

  if (renameMap.size === 0) {
    return { nextProject: project, changes: [] };
  }

  const nextProject: E3Project = {
    ...project,
    revision: project.revision + 1,
    updatedAt: new Date().toISOString(),
    devices: project.devices.map((d) =>
      renameMap.has(d.id) ? { ...d, designation: renameMap.get(d.id)! } : d
    ),
    cables: project.cables.map((c) => ({
      ...c,
      fromDevice: oldToNewDes.get(c.fromDevice) || c.fromDevice,
      toDevice: oldToNewDes.get(c.toDevice) || c.toDevice,
    })),
  };

  return { nextProject, changes };
}

export function autoNumberDevicesGost(
  project: E3Project,
  opts: DeviceNumberingOptions
): E3Project {
  return previewAutoNumberDevicesGost(project, opts).nextProject;
}
