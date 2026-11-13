import JSZip from 'jszip';
import { E3_CATALOG } from './e3Catalog.ts';
import { exportToFluxBridge, parseE3Xml, parseVisualSettings, serializeE3Xml } from './e3Engine.ts';
import { createSeedProject } from './e3Seed.ts';
import type { E3Device, E3Project } from './e3Types.ts';

const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;
const NOSTREAM = 0xffffffff;

export interface Ole2StreamInfo {
  name: string;
  size: number;
  data: Uint8Array;
}

export interface E3sParseResult {
  project: E3Project;
  sourceKind: 'e3s-ole2-lossless' | 'e3s-ole2-native' | 'e3s-zip' | 'e3s-xml' | 'flux-json';
  discoveredStreams: string[];
}

export function isOle2Buffer(bytes: Uint8Array): boolean {
  if (bytes.length < 512) return false;
  for (let i = 0; i < OLE2_MAGIC.length; i++) {
    if (bytes[i] !== OLE2_MAGIC[i]) return false;
  }
  return true;
}

export function isZipBuffer(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}
function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}
function writeU16(view: DataView, offset: number, val: number) {
  view.setUint16(offset, val, true);
}
function writeU32(view: DataView, offset: number, val: number) {
  view.setUint32(offset, val >>> 0, true);
}

/**
 * Pure TypeScript Microsoft Compound File Binary (OLE2 / CFB v3/v4) Reader.
 * Supports both regular FAT streams and MiniFAT streams from native Zuken E3.series .e3s files.
 */
export function parseOle2Streams(bytes: Uint8Array): Ole2StreamInfo[] {
  if (!isOle2Buffer(bytes)) {
    throw new Error('Файл не имеет сигнатуры OLE2 Compound File (.e3s).');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = readU16(view, 0x1e);
  const sectorSize = 1 << sectorShift;
  const miniSectorShift = readU16(view, 0x20);
  const miniSectorSize = 1 << miniSectorShift;

  const numFatSectors = readU32(view, 0x2c);
  const firstDirSector = readU32(view, 0x30);
  const miniCutoff = readU32(view, 0x38) || 4096;
  const firstMiniFatSector = readU32(view, 0x3c);
  const numMiniFatSectors = readU32(view, 0x40);
  const firstDifatSector = readU32(view, 0x44);
  const numDifatSectors = readU32(view, 0x48);

  const sectorOffset = (secId: number) => (secId + 1) * sectorSize;
  const readSector = (secId: number): Uint8Array => {
    const start = sectorOffset(secId);
    if (start < 0 || start >= bytes.length) return new Uint8Array(0);
    return bytes.subarray(start, Math.min(bytes.length, start + sectorSize));
  };

  // Collect FAT sector IDs from header DIFAT (109 entries at 0x4C) and DIFAT chain
  const fatSectorIds: number[] = [];
  for (let i = 0; i < 109 && fatSectorIds.length < numFatSectors; i++) {
    const secId = readU32(view, 0x4c + i * 4);
    if (secId !== FREESECT && secId !== ENDOFCHAIN) fatSectorIds.push(secId);
  }
  let difatSec = firstDifatSector;
  let difatGuard = 0;
  while (
    difatSec !== ENDOFCHAIN &&
    difatSec !== FREESECT &&
    fatSectorIds.length < numFatSectors &&
    difatGuard++ < numDifatSectors + 2
  ) {
    const off = sectorOffset(difatSec);
    if (off + sectorSize > bytes.length) break;
    const entries = sectorSize / 4 - 1;
    for (let i = 0; i < entries && fatSectorIds.length < numFatSectors; i++) {
      const secId = readU32(view, off + i * 4);
      if (secId !== FREESECT && secId !== ENDOFCHAIN) fatSectorIds.push(secId);
    }
    difatSec = readU32(view, off + entries * 4);
  }

  // Build FAT table
  const fat: number[] = [];
  for (const fatSecId of fatSectorIds) {
    const sec = readSector(fatSecId);
    const dv = new DataView(sec.buffer, sec.byteOffset, sec.byteLength);
    for (let i = 0; i + 4 <= sec.length; i += 4) {
      fat.push(dv.getUint32(i, true));
    }
  }

  const readChain = (startSec: number, expectedSize?: number): Uint8Array => {
    if (startSec === ENDOFCHAIN || startSec === FREESECT) return new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    let cur = startSec;
    const visited = new Set<number>();
    let total = 0;
    while (cur !== ENDOFCHAIN && cur !== FREESECT && !visited.has(cur)) {
      visited.add(cur);
      const sec = readSector(cur);
      if (sec.length === 0) break;
      chunks.push(sec);
      total += sec.length;
      if (expectedSize !== undefined && total >= expectedSize) break;
      cur = cur < fat.length ? fat[cur] : ENDOFCHAIN;
    }
    const out = new Uint8Array(expectedSize !== undefined ? Math.min(total, expectedSize) : total);
    let pos = 0;
    for (const c of chunks) {
      const copyLen = Math.min(c.length, out.length - pos);
      if (copyLen <= 0) break;
      out.set(c.subarray(0, copyLen), pos);
      pos += copyLen;
    }
    return out;
  };

  // Read Directory stream
  const dirBytes = readChain(firstDirSector);
  const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);

  interface RawDirEntry {
    name: string;
    type: number;
    startSector: number;
    size: number;
  }
  const entries: RawDirEntry[] = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const nameLen = readU16(dirView, off + 0x40);
    const type = dirBytes[off + 0x42];
    if (type === 0) continue;
    let name = '';
    const charBytes = Math.max(0, Math.min(64, nameLen - 2));
    for (let i = 0; i < charBytes; i += 2) {
      name += String.fromCharCode(readU16(dirView, off + i));
    }
    const startSector = readU32(dirView, off + 0x74);
    const sizeLow = readU32(dirView, off + 0x78);
    entries.push({ name, type, startSector, size: sizeLow });
  }

  // Build MiniFAT & MiniStream if needed
  const rootEntry = entries.find((e) => e.type === 5);
  const miniStream = rootEntry ? readChain(rootEntry.startSector, rootEntry.size) : new Uint8Array(0);
  const miniFat: number[] = [];
  if (numMiniFatSectors > 0 && firstMiniFatSector !== ENDOFCHAIN) {
    const mfBytes = readChain(firstMiniFatSector);
    const mfView = new DataView(mfBytes.buffer, mfBytes.byteOffset, mfBytes.byteLength);
    for (let i = 0; i + 4 <= mfBytes.length; i += 4) {
      miniFat.push(mfView.getUint32(i, true));
    }
  }

  const readMiniChain = (startSec: number, size: number): Uint8Array => {
    const out = new Uint8Array(size);
    let cur = startSec;
    let pos = 0;
    const visited = new Set<number>();
    while (cur !== ENDOFCHAIN && cur !== FREESECT && pos < size && !visited.has(cur)) {
      visited.add(cur);
      const start = cur * miniSectorSize;
      if (start >= miniStream.length) break;
      const len = Math.min(miniSectorSize, size - pos, miniStream.length - start);
      out.set(miniStream.subarray(start, start + len), pos);
      pos += len;
      cur = cur < miniFat.length ? miniFat[cur] : ENDOFCHAIN;
    }
    return out;
  };

  const streams: Ole2StreamInfo[] = [];
  for (const e of entries) {
    if (e.type !== 2) continue; // Only Stream objects
    const data =
      e.size < miniCutoff && miniStream.length > 0 && miniFat.length > 0
        ? readMiniChain(e.startSector, e.size)
        : readChain(e.startSector, e.size);
    streams.push({ name: e.name, size: e.size, data });
  }

  return streams;
}

/**
 * Pure TypeScript Microsoft CFB (OLE2) Writer for .e3s containers.
 * Packs E3Project XML, VisualSettings JSON, and FluxBridge JSON streams inside a compliant OLE2 v3 binary file.
 */
export function buildOle2E3sContainer(project: E3Project): Uint8Array {
  const sectorSize = 512;
  const enc = new TextEncoder();

  const padToMinSector = (raw: Uint8Array): { data: Uint8Array; realSize: number } => {
    // Keep streams >= 4096 bytes so they use standard FAT sectors cleanly (no MiniFAT needed)
    const minLen = Math.max(4096, Math.ceil(raw.length / sectorSize) * sectorSize);
    const padded = new Uint8Array(minLen);
    padded.set(raw);
    return { data: padded, realSize: raw.length };
  };

  const xmlRaw = enc.encode(serializeE3Xml(project));
  const vsRaw = enc.encode(JSON.stringify(project.visualSettings, null, 2));
  const bridgeRaw = enc.encode(JSON.stringify(exportToFluxBridge(project), null, 2));

  const streamDefs = [
    { name: 'E3Project', ...padToMinSector(xmlRaw) },
    { name: 'VisualSettings', ...padToMinSector(vsRaw) },
    { name: 'FluxBridge', ...padToMinSector(bridgeRaw) },
  ];

  // Layout sectors:
  // 0..N-1: stream data sectors
  // dirSector: directory (4 entries * 128 bytes = 512 bytes = 1 sector)
  // fatSectors: FAT table covering all sectors
  let dataSectorsCount = 0;
  for (const s of streamDefs) {
    dataSectorsCount += Math.ceil(s.data.length / sectorSize);
  }

  const dirSector = dataSectorsCount;
  const totalNonFatSectors = dirSector + 1;
  // Each FAT sector holds 128 sector entries (512 / 4)
  let numFatSectors = Math.max(1, Math.ceil(totalNonFatSectors / 128));
  while (Math.ceil((totalNonFatSectors + numFatSectors) / 128) > numFatSectors) {
    numFatSectors++;
  }
  const totalSectors = totalNonFatSectors + numFatSectors;
  const totalBytes = (1 + totalSectors) * sectorSize;

  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);

  // 1. Write Header (512 bytes)
  out.set(OLE2_MAGIC, 0);
  writeU16(view, 0x18, 0x003e); // Minor version
  writeU16(view, 0x1a, 0x0003); // Major version 3
  writeU16(view, 0x1c, 0xfffe); // Little-endian BOM
  writeU16(view, 0x1e, 9); // Sector shift (512)
  writeU16(view, 0x20, 6); // Mini sector shift (64)
  writeU32(view, 0x2c, numFatSectors);
  writeU32(view, 0x30, dirSector);
  writeU32(view, 0x38, 4096); // Mini stream cutoff
  writeU32(view, 0x3c, ENDOFCHAIN);
  writeU32(view, 0x40, 0);
  writeU32(view, 0x44, ENDOFCHAIN);
  writeU32(view, 0x48, 0);

  for (let i = 0; i < 109; i++) {
    writeU32(view, 0x4c + i * 4, i < numFatSectors ? totalNonFatSectors + i : FREESECT);
  }

  // 2. Build FAT array & write stream payloads
  const fat = new Uint32Array(numFatSectors * 128);
  fat.fill(FREESECT);

  let curSec = 0;
  const dirMeta: Array<{ name: string; startSec: number; realSize: number }> = [];
  for (const s of streamDefs) {
    const secCount = Math.ceil(s.data.length / sectorSize);
    const startSec = curSec;
    for (let i = 0; i < secCount; i++) {
      const targetOff = (1 + curSec) * sectorSize;
      out.set(s.data.subarray(i * sectorSize, (i + 1) * sectorSize), targetOff);
      fat[curSec] = i === secCount - 1 ? ENDOFCHAIN : curSec + 1;
      curSec++;
    }
    dirMeta.push({ name: s.name, startSec, realSize: s.realSize });
  }

  // Directory sector
  fat[dirSector] = ENDOFCHAIN;
  // FAT sectors themselves
  for (let i = 0; i < numFatSectors; i++) {
    fat[totalNonFatSectors + i] = FATSECT;
  }

  // 3. Write Directory entries (128 bytes each at dirSector)
  const writeDirEntry = (
    slot: number,
    name: string,
    type: number,
    leftId: number,
    rightId: number,
    childId: number,
    startSec: number,
    size: number
  ) => {
    const base = (1 + dirSector) * sectorSize + slot * 128;
    for (let i = 0; i < name.length && i < 31; i++) {
      writeU16(view, base + i * 2, name.charCodeAt(i));
    }
    writeU16(view, base + 0x40, (name.length + 1) * 2);
    out[base + 0x42] = type;
    out[base + 0x43] = 1; // Black node
    writeU32(view, base + 0x44, leftId);
    writeU32(view, base + 0x48, rightId);
    writeU32(view, base + 0x4c, childId);
    writeU32(view, base + 0x74, startSec);
    writeU32(view, base + 0x78, size);
  };

  // Root Entry (slot 0) -> child 1; streams chained cleanly in RB-tree
  writeDirEntry(0, 'Root Entry', 5, NOSTREAM, NOSTREAM, 1, ENDOFCHAIN, 0);
  writeDirEntry(1, dirMeta[0].name, 2, NOSTREAM, 2, NOSTREAM, dirMeta[0].startSec, dirMeta[0].realSize);
  writeDirEntry(2, dirMeta[1].name, 2, NOSTREAM, 3, NOSTREAM, dirMeta[1].startSec, dirMeta[1].realSize);
  writeDirEntry(3, dirMeta[2].name, 2, NOSTREAM, NOSTREAM, NOSTREAM, dirMeta[2].startSec, dirMeta[2].realSize);

  // 4. Write FAT sectors
  for (let i = 0; i < numFatSectors; i++) {
    const fatOff = (1 + totalNonFatSectors + i) * sectorSize;
    for (let j = 0; j < 128; j++) {
      writeU32(view, fatOff + j * 4, fat[i * 128 + j]);
    }
  }

  return out;
}

async function inflateDeflateBuffer(chunk: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    const ds = new DecompressionStream('deflate');
    const writer = ds.writable.getWriter();
    writer.write(chunk.slice()).catch(() => {});
    writer.close().catch(() => {});
    const reader = ds.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        parts.push(value);
        total += value.length;
        if (total > 8 * 1024 * 1024) break;
      }
      if (done) break;
    }
  } catch {
    // Trailing padding bytes inside an OLE2 sector after a valid zlib stream often throw on stream close
  }
  if (total === 0) return null;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function decompressEmbeddedZlibStreams(streams: Ole2StreamInfo[]): Promise<Uint8Array[]> {
  const inflated: Uint8Array[] = [];
  for (const s of streams) {
    const data = s.data;
    if (data.length < 16) continue;
    let hits = 0;
    for (let i = 0; i < data.length - 6 && hits < 12; i++) {
      // Standard zlib CMF=0x78 headers (0x01, 0x5E, 0x9C, 0xDA)
      if (
        data[i] === 0x78 &&
        (data[i + 1] === 0x9c || data[i + 1] === 0xda || data[i + 1] === 0x01 || data[i + 1] === 0x5e)
      ) {
        const res = await inflateDeflateBuffer(data.subarray(i));
        if (res && res.length >= 16) {
          inflated.push(res);
          hits++;
          i += Math.min(res.length, 64);
        }
      }
    }
  }
  return inflated;
}

function extractReadableStringsFromBinary(data: Uint8Array): string[] {
  const results = new Set<string>();

  // Scan UTF-16LE sequences (common in Zuken E3.series MFC CArchive streams)
  let utf16Run = '';
  for (let i = 0; i + 1 < data.length; i += 2) {
    const code = data[i] | (data[i + 1] << 8);
    const printable =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x0400 && code <= 0x04ff);
    if (printable) {
      utf16Run += String.fromCharCode(code);
    } else {
      if (utf16Run.length >= 3) results.add(utf16Run.trim());
      utf16Run = '';
    }
  }
  if (utf16Run.length >= 3) results.add(utf16Run.trim());

  // Scan UTF-8 / ASCII sequences
  try {
    const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(data);
    const matches = utf8Text.match(/[A-Za-zА-Яа-яЁё0-9_.+:/\\-]{3,}/g);
    if (matches) {
      for (const m of matches) results.add(m.trim());
    }
  } catch {
    // ignore
  }

  return Array.from(results);
}

async function buildNativeOle2Project(streams: Ole2StreamInfo[], filename?: string): Promise<E3Project> {
  const inflatedChunks = await decompressEmbeddedZlibStreams(streams);
  const dec = new TextDecoder('utf-8', { fatal: false });

  // Check if any decompressed stream carries lossless E3Project XML
  for (const chunk of inflatedChunks) {
    const snippet = dec.decode(chunk.subarray(0, 512));
    if (snippet.includes('<E3Project')) {
      return parseE3Xml(dec.decode(chunk).replace(/\0+$/, ''));
    }
  }

  const allStrings: string[] = [];
  for (const s of streams) {
    allStrings.push(...extractReadableStringsFromBinary(s.data));
  }
  for (const chunk of inflatedChunks) {
    allStrings.push(...extractReadableStringsFromBinary(chunk));
  }

  const base = createSeedProject();
  base.id = `proj-e3s-${Date.now()}`;
  base.name = filename ? filename.replace(/\.e3s$/i, '') : 'Импорт проекта E3.series (.e3s)';
  base.projectCode = filename ? filename.replace(/\.e3s$/i, '') : base.projectCode;
  base.devices = [];
  base.wires = [];
  base.cables = [];

  const fluxKeyMatch = allStrings.find((s) => /FLUX_[A-Z0-9_]+/i.test(s));
  if (fluxKeyMatch) base.fluxProjectKey = fluxKeyMatch;

  // Detect Zuken E3.series device designations (-QF1, -KM2, -A1, -XT1, -Щ1, -КМ1)
  const desPattern = /^-[A-ZА-ЯЁ]{1,4}\d+[A-ZА-ЯЁ0-9.-]*$/i;
  const designations = Array.from(new Set(allStrings.filter((s) => desPattern.test(s))));

  const sheetId = base.sheets[0].id;
  base.sheets[0].name = filename ? filename.replace(/\.e3s$/i, '') : base.sheets[0].name;

  if (designations.length > 0) {
    designations.slice(0, 200).forEach((des, idx) => {
      const prefix = des.replace(/^-/, '').replace(/\d.*$/, '').toUpperCase();
      const cat =
        E3_CATALOG.find((c) => c.defaultPrefix === prefix) || E3_CATALOG[idx % E3_CATALOG.length];
      const devId = `dev-ole2-${idx + 1}`;
      const dev: E3Device = {
        id: devId,
        elementId: `el-ole2-${idx + 1}`,
        designation: des,
        componentName: cat.componentName,
        article: cat.article,
        manufacturer: cat.manufacturer,
        category: cat.category,
        sheetId,
        x: 120 + (idx % 5) * 220,
        y: 120 + Math.floor(idx / 5) * 180,
        rotation: 0,
        width: cat.width,
        height: cat.height,
        e3BlockName: cat.e3BlockName,
        bindingState: 'PLACED',
        pins: cat.pins.map((p, pIdx) => ({ ...p, id: `${devId}-p${pIdx + 1}` })),
        attributes: [
          ...structuredClone(cat.defaultAttributes),
          { name: 'Источник импорта', value: `OLE2 CFB (${streams.length} потоков, zlib=${inflatedChunks.length})`, owner: '', conflict: 'script' },
        ],
      };
      base.devices.push(dev);
    });
  } else {
    // Fallback if binary .e3s uses proprietary E3 compression: expose discovered CFB stream summary
    const cat = E3_CATALOG[0];
    base.devices.push({
      id: 'dev-ole2-root',
      elementId: 'el-ole2-root',
      designation: '-E3S1',
      componentName: `Контейнер E3.series (${streams.length} потоков CFB)`,
      article: filename || 'E3-PROJECT.e3s',
      manufacturer: 'Zuken E3.series',
      category: cat.category,
      sheetId,
      x: 240,
      y: 180,
      rotation: 0,
      width: cat.width,
      height: cat.height,
      e3BlockName: 'E3S_OLE2_CONTAINER',
      bindingState: 'PLACED',
      pins: cat.pins.map((p, pIdx) => ({ ...p, id: `dev-ole2-root-p${pIdx + 1}` })),
      attributes: [
        { name: 'Рекомендация', value: 'Для полной схемы с координатами откройте этот .e3s в E³.series на Windows и нажмите «В E³.series» / «Импорт через COM»', owner: 'Flux', conflict: 'script' },
        ...streams.slice(0, 12).map((st) => ({
          name: `Поток CFB: ${st.name}`,
          value: `${st.size} байт`,
          owner: '',
          conflict: 'script' as const,
        })),
      ],
    });
  }

  return base;
}

/**
 * Universal .e3s parser: supports OLE2 Compound Binary (.e3s), ZIP-packaged .e3s, XML .e3s, and Flux Bridge JSON.
 */
export async function parseE3sInput(
  input: Uint8Array | ArrayBuffer | string,
  filename?: string
): Promise<E3sParseResult> {
  if (typeof input === 'string') {
    const trimmed = input.replace(/^\uFEFF/, '').trim();
    if (trimmed.startsWith('<')) {
      return {
        project: parseE3Xml(trimmed),
        sourceKind: 'e3s-xml',
        discoveredStreams: ['E3Project.xml'],
      };
    }
    const parsed = JSON.parse(trimmed);
    if (parsed?.format === 'flux-e3-bridge/v1') {
      const project = parseE3Xml(serializeE3Xml(createSeedProject()));
      const { importFromFluxBridge } = await import('./e3Engine.ts');
      return {
        project: importFromFluxBridge(parsed, project),
        sourceKind: 'flux-json',
        discoveredStreams: ['FluxBridge.json'],
      };
    }
    throw new Error('Ожидается файл .e3s (OLE2 / ZIP / XML) или Flux Bridge JSON.');
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  // 1. OLE2 Compound File Binary (.e3s)
  if (isOle2Buffer(bytes)) {
    const streams = parseOle2Streams(bytes);
    const streamNames = streams.map((s) => s.name);
    const dec = new TextDecoder('utf-8', { fatal: false });

    // Look for embedded lossless E3Project XML stream
    const xmlStream =
      streams.find((s) => s.name === 'E3Project') ||
      streams.find((s) => dec.decode(s.data.subarray(0, 200)).includes('<E3Project'));

    if (xmlStream) {
      const xmlText = dec.decode(xmlStream.data).replace(/\0+$/, '');
      const project = parseE3Xml(xmlText);
      const vsStream = streams.find((s) => s.name === 'VisualSettings');
      if (vsStream) {
        try {
          project.visualSettings = parseVisualSettings(dec.decode(vsStream.data).replace(/\0+$/, ''));
        } catch {
          // keep XML visualSettings
        }
      }
      return {
        project,
        sourceKind: 'e3s-ole2-lossless',
        discoveredStreams: streamNames,
      };
    }

    // Native Zuken E3.series binary .e3s extraction
    return {
      project: await buildNativeOle2Project(streams, filename),
      sourceKind: 'e3s-ole2-native',
      discoveredStreams: streamNames,
    };
  }

  // 2. ZIP-packaged .e3s
  if (isZipBuffer(bytes)) {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    const xmlFile = names.find((n) => n.endsWith('.xml') || n.endsWith('.e3x') || n.endsWith('.e3s'));
    if (xmlFile) {
      const xmlText = await zip.files[xmlFile].async('text');
      return {
        project: parseE3Xml(xmlText),
        sourceKind: 'e3s-zip',
        discoveredStreams: names,
      };
    }
    throw new Error('ZIP-контейнер .e3s не содержит XML-описания модели E3.');
  }

  // 3. UTF-8 Text (XML .e3s or JSON)
  const text = new TextDecoder('utf-8').decode(bytes);
  return parseE3sInput(text, filename);
}
