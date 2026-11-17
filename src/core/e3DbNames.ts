// [AI-LOCKED] Рабочий отлаженный модуль переноса E3.series. НЕ изменять без явного запроса пользователя (см. AI_DO_NOT_TOUCH_E3_SCRIPTS.md).
/**
 * Имена объектов БД E3, которые E3ProMax создаёт сам (символы FLX_*, компоненты по артикулу).
 * Используются и при подготовке БД (scripts/e3SymbolsToDbe.ts), и при переносе (generateE3ComScript),
 * поэтому должны вычисляться одинаково.
 */
import type { E3Cable, E3Device, E3Project, E3Sheet } from './e3Types.ts';
import { buildGostSheetGeometry } from './gostFrame.ts';

/** Имя символа E3 для блока E3ProMax: FLX_<блок>, без пробелов (E3 их отклоняет). */
export function dbeSymbolName(dev: Pick<E3Device, 'e3BlockName' | 'designation'>): string {
  const base = (dev.e3BlockName || dev.designation || 'SYMBOL').trim();
  return ('FLX_' + base).replace(/[^\p{L}\p{N}_\-.]/gu, '_').slice(0, 60);
}

function hash6(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

export interface DbeComponentGroup {
  /** ENTRY компонента в БД E3 */
  entry: string;
  /** Символы (гейты) компонента по порядку: один на каждый блок, которым изделие показано на листах */
  gates: Array<{ symbol: string; dev: E3Device }>;
  /** Первое вхождение изделия (артикул, производитель, наименование) */
  dev: E3Device;
}

const desKey = (d: Pick<E3Device, 'designation'>) => String(d.designation || '').trim().toUpperCase();

/**
 * Изделие с одним обозначением может быть показано на нескольких листах разными блоками
 * (например, УГО на ФСА и «полевая коробка» на схеме внешних соединений). В E3 это одно изделие
 * с несколькими символами — компонент с несколькими гейтами. ENTRY = артикул + хэш набора блоков,
 * чтобы один артикул с разными наборами символов не перезаписывал чужой компонент.
 */
export function buildComponentGroups(devices: E3Device[]): Map<string, DbeComponentGroup> {
  const byDes = new Map<string, E3Device[]>();
  for (const d of devices) {
    const k = desKey(d);
    if (!k) continue;
    if (!byDes.has(k)) byDes.set(k, []);
    byDes.get(k)!.push(d);
  }
  const out = new Map<string, DbeComponentGroup>();
  for (const [k, devs] of byDes) {
    const gates: Array<{ symbol: string; dev: E3Device }> = [];
    for (const d of devs) {
      const sym = dbeSymbolName(d);
      if (!gates.some((g) => g.symbol === sym)) gates.push({ symbol: sym, dev: d });
    }
    const first = devs[0];
    const art = String(first.article || '').trim();
    const base = (art || 'FLX_' + (first.e3BlockName || first.designation || 'DEVICE')).replace(/\s+/g, '_').replace(/['"]/g, '');
    const entry = (base.slice(0, 50) + '__' + hash6(gates.map((g) => g.symbol).join('|'))).slice(0, 60);
    out.set(k, { entry, gates, dev: first });
  }
  return out;
}

export function componentEntryFor(groups: Map<string, DbeComponentGroup>, dev: Pick<E3Device, 'designation'>): string {
  return groups.get(desKey(dev))?.entry || '';
}

/** Формат листа E3 (символ рамки ГОСТ со штампом), который E3ProMax заводит в БД для листа. */
export function gostFormatName(sheet: E3Sheet, project: E3Project): string {
  const g = buildGostSheetGeometry(sheet, project);
  const fmt = String(sheet.format || 'A3').toUpperCase().replace('А', 'A');
  const tpl = g.stamp.form === 'custom' ? '_' + hash6(String(g.stamp.templateId || g.stamp.templateName || 'custom')) : '';
  return `FLX_GOST_${fmt}_${g.stamp.form}${tpl}_${sheet.width}x${sheet.height}`.replace(/[^\p{L}\p{N}_\-.]/gu, '_').slice(0, 60);
}

export interface CableCore {
  name: string;
  section: number;
}

/** Жилы кабеля по марке («3х2,5 + 6х0,75», «1х2х1,0» — пары), иначе по числу жил и сечению. */
export function cableCores(c: E3Cable): CableCore[] {
  const num = (v: string) => Number(String(v).replace(',', '.')) || 0;
  const type = String(c.cableType || '');
  const groups: Array<[number, number, number]> = [];
  const pairRe = /(\d+)\s*[хxX×]\s*(\d+)\s*[хxX×]\s*(\d+(?:[.,]\d+)?)/g;
  let rest = type;
  for (const m of type.matchAll(pairRe)) {
    groups.push([Number(m[1]) * Number(m[2]), num(m[3]), m.index ?? 0]);
    rest = rest.slice(0, m.index) + ' '.repeat(m[0].length) + rest.slice((m.index ?? 0) + m[0].length);
  }
  for (const m of rest.matchAll(/(\d+)\s*[хxX×GgЖж]\s*(\d+(?:[.,]\d+)?)/g)) groups.push([Number(m[1]), num(m[2]), m.index ?? 0]);
  groups.sort((a, b) => a[2] - b[2]);
  const total = groups.reduce((a, g) => a + g[0], 0);
  if (!total || total > 200) {
    const n = Math.max(1, Math.min(200, Number(c.coresCount) || 1));
    const sec = num(String(c.crossSection || '').replace(/[^\d.,]/g, '')) || 0;
    return Array.from({ length: n }, (_, i) => ({ name: String(i + 1), section: sec }));
  }
  const out: CableCore[] = [];
  for (const [n, sec] of groups) for (let i = 0; i < n; i++) out.push({ name: String(out.length + 1), section: sec });
  return out;
}

/** Имя компонента кабеля в БД E3: марка + хеш состава жил. */
export function cableEntryName(c: E3Cable): string {
  const cores = cableCores(c);
  const base = String(c.cableType || c.designation || 'CABLE').replace(/[\s'"]+/g, '_').replace(/[^\p{L}\p{N}_\-.,()+]/gu, '_').slice(0, 50);
  return (`${base}__${hash6(cores.map((k) => k.section).join('|') + (c.shielded ? 'S' : ''))}`).replace(/[^\p{L}\p{N}_\-.]/gu, '_').slice(0, 60);
}
