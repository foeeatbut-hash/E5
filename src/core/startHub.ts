import { SHEET_DIMENSIONS } from './e3Catalog.ts';
import { runErc } from './e3Engine.ts';
import { createSeedProject, DEFAULT_VISUAL_SETTINGS } from './e3Seed.ts';
import type {
  E3Project,
  SheetFormat,
  StandardType,
} from './e3Types.ts';
import { hydrateProjectDefaults, type RecentProjectEntry } from './sessionStorage.ts';

export type StartHubTab = 'all' | 'pinned' | 'gost' | 'iec';
export type StartHubViewMode = 'grid' | 'table';
export type StartTemplateId =
  | 'gost_blank_a3'
  | 'power_380v'
  | 'plc_automation'
  | 'terminal_x1';

export interface StartTemplateDef {
  id: StartTemplateId;
  title: string;
  subtitle: string;
  badge: string;
  defaultFormat: SheetFormat;
  sheetCount: number;
  deviceCount: number;
  tags: string[];
}

export const PINNED_PROJECTS_STORAGE_KEY = 'e3promax.pinnedProjects.v1';

export const START_TEMPLATE_DEFS: ReadonlyArray<StartTemplateDef> = [
  {
    id: 'gost_blank_a3',
    title: 'Чистый лист ГОСТ',
    subtitle: 'Основная надпись Форма 1, готовая рамка и сетка',
    badge: 'А3 · Э3',
    defaultFormat: 'A3',
    sheetCount: 1,
    deviceCount: 0,
    tags: ['чистый', 'пустой', 'гост', 'а3', 'а4', 'blank'],
  },
  {
    id: 'power_380v',
    title: 'Силовой ввод 3~380В + ПЧ',
    subtitle: 'Вводной автомат QF1, контактор KM1, ПЧ UZ1 и двигатель M1',
    badge: 'А3 · 380В',
    defaultFormat: 'A3',
    sheetCount: 1,
    deviceCount: 4,
    tags: ['силовая', '380', 'пч', 'двигатель', 'автомат', 'power', 'vfd'],
  },
  {
    id: 'plc_automation',
    title: 'Щит автоматизации (ПЛК)',
    subtitle: 'БП 24VDC, контроллер ПЛК210, датчик КИП и выходное реле',
    badge: 'А3 · 24В',
    defaultFormat: 'A3',
    sheetCount: 1,
    deviceCount: 4,
    tags: ['плк', 'автоматика', 'кип', '24в', 'датчик', 'plc', 'hvac'],
  },
  {
    id: 'terminal_x1',
    title: 'Клеммный ряд и кабели X1',
    subtitle: 'Проходные клеммники XT1/XT2, перемычки и таблица ПЭ3',
    badge: 'А4 · XT',
    defaultFormat: 'A4',
    sheetCount: 1,
    deviceCount: 2,
    tags: ['клеммник', 'xt', 'кабель', 'зажим', 'terminal'],
  },
];

export interface CreateTemplateOptions {
  standard?: StandardType;
  format?: SheetFormat;
  gridSize?: number;
  theme?: 'light' | 'dark';
  nowIso?: string;
}

export function createProjectFromTemplate(
  templateId: StartTemplateId,
  options: CreateTemplateOptions = {}
): E3Project {
  const seed = createSeedProject();
  const nowIso = options.nowIso ?? new Date().toISOString();
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const standard: StandardType = options.standard ?? 'GOST';
  const gridSize =
    options.gridSize === 10 || options.gridSize === 20 || options.gridSize === 40
      ? options.gridSize
      : DEFAULT_VISUAL_SETTINGS.gridSize;
  const theme = options.theme ?? DEFAULT_VISUAL_SETTINGS.theme;

  const visualSettings = {
    ...structuredClone(DEFAULT_VISUAL_SETTINGS),
    theme,
    gridSize,
  };

  if (templateId === 'gost_blank_a3') {
    const format: SheetFormat = options.format ?? 'A3';
    const dims = SHEET_DIMENSIONS[format];
    return hydrateProjectDefaults({
      ...seed,
      id: `proj-blank-${Date.now().toString(36)}`,
      name: `Новый проект (${suffix})`,
      projectCode: `ПДХ-${suffix}-Э3`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          id: 'sheet-1',
          number: 1,
          name: 'Схема электрическая принципиальная',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[0].titleBlock,
            stampForm: 'form1',
            documentCode: `ПДХ-${suffix}-Э3`,
            projectTitle: `Новый проект (${suffix})`,
            sheetTitle: 'Схема электрическая принципиальная',
            date: formatStampMonthYear(nowIso),
            litera: '',
            izm: '',
          },
        },
      ],
      devices: [],
      wires: [],
      cables: [],
      annotations: [],
    });
  }

  if (templateId === 'power_380v') {
    const format: SheetFormat = options.format ?? 'A3';
    const dims = SHEET_DIMENSIONS[format];
    const powerIds = new Set(['dev-qf1', 'dev-km1', 'dev-uz1', 'dev-m1']);
    const devices = seed.devices
      .filter((d) => powerIds.has(d.id))
      .map((d) => ({ ...structuredClone(d), sheetId: 'sheet-1' }));
    const wires = seed.wires
      .filter(
        (w) =>
          w.sheetId === 'sheet-1' &&
          powerIds.has(w.fromDeviceId) &&
          powerIds.has(w.toDeviceId)
      )
      .map((w) => structuredClone(w));
    return hydrateProjectDefaults({
      ...seed,
      id: `proj-pwr-${Date.now().toString(36)}`,
      name: `Силовой привод ПВ (${suffix})`,
      projectCode: `СИЛ-${suffix}-Э3`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          ...structuredClone(seed.sheets[0]),
          id: 'sheet-1',
          number: 1,
          name: 'Силовая цепь 3~380В',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[0].titleBlock,
            documentCode: `СИЛ-${suffix}-Э3`,
            projectTitle: `Силовой привод ПВ (${suffix})`,
            sheetTitle: 'Схема электрическая принципиальная. Силовая цепь 3~380В',
            date: formatStampMonthYear(nowIso),
          },
        },
      ],
      devices,
      wires,
      cables: seed.cables.filter((c) => c.id === 'cab-w2').map((c) => structuredClone(c)),
      annotations: (seed.annotations || [])
        .filter((a) => a.sheetId === 'sheet-1')
        .map((a) => structuredClone(a)),
    });
  }

  if (templateId === 'plc_automation') {
    const format: SheetFormat = options.format ?? 'A3';
    const dims = SHEET_DIMENSIONS[format];
    const ctrlIds = new Set(['dev-a1', 'dev-bt1', 'dev-ka1', 'dev-hl1']);
    const devices = seed.devices
      .filter((d) => ctrlIds.has(d.id))
      .map((d) => ({ ...structuredClone(d), sheetId: 'sheet-1' }));
    const wires = seed.wires
      .filter(
        (w) =>
          w.sheetId === 'sheet-2' &&
          ctrlIds.has(w.fromDeviceId) &&
          ctrlIds.has(w.toDeviceId)
      )
      .map((w) => ({ ...structuredClone(w), sheetId: 'sheet-1' }));
    return hydrateProjectDefaults({
      ...seed,
      id: `proj-plc-${Date.now().toString(36)}`,
      name: `Щит автоматизации (${suffix})`,
      projectCode: `АВТ-${suffix}-Э3`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          ...structuredClone(seed.sheets[1]),
          id: 'sheet-1',
          number: 1,
          name: 'Цепь управления ПЛК 24В',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[1].titleBlock,
            stampForm: 'form1',
            documentCode: `АВТ-${suffix}-Э3`,
            projectTitle: `Щит автоматизации (${suffix})`,
            sheetTitle: 'Контроллер ПЛК210 и цепи управления 24VDC',
            date: formatStampMonthYear(nowIso),
          },
        },
      ],
      devices,
      wires,
      cables: seed.cables.filter((c) => c.id === 'cab-w3').map((c) => structuredClone(c)),
      annotations: (seed.annotations || [])
        .filter((a) => a.sheetId === 'sheet-2')
        .map((a) => ({ ...structuredClone(a), sheetId: 'sheet-1' })),
    });
  }

  // terminal_x1
  const format: SheetFormat = options.format ?? 'A4';
  const dims = SHEET_DIMENSIONS[format];
  const termIds = new Set(['dev-xt1', 'dev-xt2']);
  const devices = seed.devices
    .filter((d) => termIds.has(d.id))
    .map((d) => ({ ...structuredClone(d), sheetId: 'sheet-1' }));
  const wires = seed.wires
    .filter(
      (w) =>
        w.sheetId === 'sheet-3' &&
        termIds.has(w.fromDeviceId) &&
        termIds.has(w.toDeviceId)
    )
    .map((w) => ({ ...structuredClone(w), sheetId: 'sheet-1' }));
  return hydrateProjectDefaults({
    ...seed,
    id: `proj-xt-${Date.now().toString(36)}`,
    name: `Клеммный шкаф X1 (${suffix})`,
    projectCode: `КЛМ-${suffix}-Э4`,
    revision: 1,
    standard,
    updatedAt: nowIso,
    visualSettings,
    sheets: [
      {
        ...structuredClone(seed.sheets[2]),
        id: 'sheet-1',
        number: 1,
        name: 'Клеммный ряд X1',
        format,
        width: dims.width,
        height: dims.height,
        titleBlock: {
          ...seed.sheets[2].titleBlock,
          stampForm: 'form1',
          documentCode: `КЛМ-${suffix}-Э4`,
          projectTitle: `Клеммный шкаф X1 (${suffix})`,
          sheetTitle: 'Ряд зажимов и кабельные подключения',
          date: formatStampMonthYear(nowIso),
        },
      },
    ],
    devices,
    wires,
    cables: seed.cables.filter((c) => c.id === 'cab-w1').map((c) => structuredClone(c)),
    annotations: (seed.annotations || [])
      .filter((a) => a.sheetId === 'sheet-3')
      .map((a) => ({ ...structuredClone(a), sheetId: 'sheet-1' })),
  });
}

function formatStampMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '11.2026';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${m}.${d.getFullYear()}`;
}

export function loadPinnedProjectIds(
  storage?: Pick<Storage, 'getItem'> | null
): string[] {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return [];
    const raw = store.getItem(PINNED_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

export function savePinnedProjectIds(
  ids: string[],
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return;
    const deduped = Array.from(new Set(ids.filter(Boolean)));
    store.setItem(PINNED_PROJECTS_STORAGE_KEY, JSON.stringify(deduped));
  } catch {
    // ignore quota errors
  }
}

export function togglePinnedProjectId(current: string[], projectId: string): string[] {
  if (!projectId) return current;
  if (current.includes(projectId)) {
    return current.filter((id) => id !== projectId);
  }
  return [projectId, ...current];
}

export function filterAndSortRecentProjects(
  entries: RecentProjectEntry[],
  options: {
    tab: StartHubTab;
    query: string;
    pinnedIds: string[];
  }
): RecentProjectEntry[] {
  const pinnedSet = new Set(options.pinnedIds);
  const q = options.query.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    if (options.tab === 'pinned' && !pinnedSet.has(entry.id)) {
      return false;
    }
    if (options.tab === 'gost' && entry.project.standard !== 'GOST') {
      return false;
    }
    if (options.tab === 'iec' && entry.project.standard !== 'IEC') {
      return false;
    }
    if (!q) return true;
    const haystack = [
      entry.name,
      entry.projectCode,
      entry.project.author,
      entry.project.standard,
      ...entry.project.sheets.map((s) => s.name),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  return [...filtered].sort((a, b) => {
    const aPin = pinnedSet.has(a.id) ? 1 : 0;
    const bPin = pinnedSet.has(b.id) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    return b.savedAt.localeCompare(a.savedAt);
  });
}

export function filterStartTemplates(
  templates: ReadonlyArray<StartTemplateDef>,
  query: string
): StartTemplateDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...templates];
  return templates.filter((tpl) => {
    const hay = `${tpl.title} ${tpl.subtitle} ${tpl.badge} ${tpl.tags.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}

export function formatRelativeTimestampRu(iso: string, nowMs = Date.now()): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'недавно';
  const diffSec = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (diffSec < 45) return 'только что';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return new Date(ts).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export interface ProjectHealthSummary {
  errors: number;
  warnings: number;
  clean: boolean;
}

export function summarizeProjectHealth(project: E3Project): ProjectHealthSummary {
  const issues = runErc(project);
  let errors = 0;
  let warnings = 0;
  for (const iss of issues) {
    if (iss.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return {
    errors,
    warnings,
    clean: errors === 0 && warnings === 0,
  };
}

/**
 * Antigravity Wave Field pure math helpers
 */
export interface WavePointerState {
  x: number;
  y: number;
  active: boolean;
  speed: number; // px/frame impulse
}

export interface WaveCardFocusRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WavePulse {
  x: number;
  y: number;
  bornAtSec: number;
  strength?: number;
}

export const WAVE_PULSE_LIFETIME_SEC = 0.9;

export interface WavePulseContribution {
  offsetX: number;
  offsetY: number;
  accentMix: number;
  radiusBoost: number;
}

export function computeWavePulseContribution(
  baseX: number,
  baseY: number,
  timeSec: number,
  pulse: WavePulse
): WavePulseContribution {
  const age = timeSec - pulse.bornAtSec;
  if (age < 0 || age > WAVE_PULSE_LIFETIME_SEC) {
    return { offsetX: 0, offsetY: 0, accentMix: 0, radiusBoost: 0 };
  }

  const strength = Math.max(0.25, Math.min(1.6, pulse.strength ?? 1));
  const ageNorm = age / WAVE_PULSE_LIFETIME_SEC;
  const decay = Math.pow(1 - ageNorm, 1.45) * strength;
  const ringRadius = 18 + ageNorm * 320;
  const bandHalfWidth = 64;

  const dx = baseX - pulse.x;
  const dy = baseY - pulse.y;
  const dist = Math.hypot(dx, dy);
  const distDelta = Math.abs(dist - ringRadius);
  if (distDelta >= bandHalfWidth) {
    return { offsetX: 0, offsetY: 0, accentMix: 0, radiusBoost: 0 };
  }

  const bell = Math.pow(Math.cos((distDelta / bandHalfWidth) * (Math.PI * 0.5)), 2);
  const amplitude = bell * decay;
  const nx = dist > 0.001 ? dx / dist : 0;
  const ny = dist > 0.001 ? dy / dist : 0;

  return {
    offsetX: nx * amplitude * 7.5,
    offsetY: ny * amplitude * 7.5,
    accentMix: amplitude * 0.72,
    radiusBoost: amplitude * 0.85,
  };
}

export interface WaveDotSample {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  accentMix: number; // 0..1
}

export function easeGridLockSettle(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

export function computeWaveDotSample(params: {
  baseX: number;
  baseY: number;
  timeSec: number;
  pointer: WavePointerState;
  hoverRect: WaveCardFocusRect | null;
  gridLockProgress: number; // 0 = living wave, 1 = locked static CAD grid
  reducedMotion?: boolean;
  pulses?: ReadonlyArray<WavePulse>;
}): WaveDotSample {
  const { baseX, baseY, timeSec, pointer, hoverRect, gridLockProgress, reducedMotion, pulses } = params;
  const settle = easeGridLockSettle(gridLockProgress);
  const waveWeight = reducedMotion ? 0 : 1 - settle;

  // Calm horizontal potential wave (left -> right schematic energy flow) + slight diagonal phase
  const phase = baseX * 0.0145 - timeSec * 1.45 + Math.sin(baseY * 0.011 + timeSec * 0.55) * 0.65;
  const harmonic = Math.sin(phase); // -1..1
  const secondary = Math.cos(baseX * 0.008 + baseY * 0.013 - timeSec * 0.9);
  const waveHeight = (harmonic * 0.68 + secondary * 0.32) * waveWeight;

  let offsetX = 0;
  let offsetY = waveHeight * 2.2;
  let accentMix = Math.max(0, waveHeight) * 0.24;
  let radiusBoost = Math.max(0, waveHeight) * 0.42;

  // Cursor gravitational displacement + luminescence
  if (pointer.active && waveWeight > 0.01) {
    const dx = baseX - pointer.x;
    const dy = baseY - pointer.y;
    const distSq = dx * dx + dy * dy;
    const maxRadius = 185 + Math.min(70, pointer.speed * 1.8);
    if (distSq < maxRadius * maxRadius && distSq > 0.001) {
      const dist = Math.sqrt(distSq);
      const norm = 1 - dist / maxRadius;
      const influence = norm * norm * waveWeight;
      const push = influence * (10.5 + Math.min(8, pointer.speed * 0.22));
      offsetX += (dx / dist) * push * 0.72;
      offsetY += (dy / dist) * push * 0.72;
      accentMix = Math.min(1, accentMix + influence * 0.85);
      radiusBoost += influence * 0.85;
    }
  }

  // Expanding Antigravity wave pulses triggered by hover/open interactions
  if (pulses && pulses.length > 0 && waveWeight > 0.01) {
    for (let i = 0; i < pulses.length; i++) {
      const p = computeWavePulseContribution(baseX, baseY, timeSec, pulses[i]);
      if (p.accentMix > 0.001) {
        offsetX += p.offsetX * waveWeight;
        offsetY += p.offsetY * waveWeight;
        accentMix = Math.min(1, accentMix + p.accentMix * waveWeight);
        radiusBoost += p.radiusBoost * waveWeight;
      }
    }
  }

  // Semantic magnetic alignment toward hovered project/template card
  if (hoverRect && waveWeight > 0.01) {
    const cx = hoverRect.left + hoverRect.width / 2;
    const cy = hoverRect.top + hoverRect.height / 2;
    const nearX = Math.max(hoverRect.left, Math.min(baseX, hoverRect.left + hoverRect.width));
    const nearY = Math.max(hoverRect.top, Math.min(baseY, hoverRect.top + hoverRect.height));
    const dx = baseX - nearX;
    const dy = baseY - nearY;
    const dist = Math.hypot(dx, dy);
    if (dist < 72) {
      const ring = (1 - dist / 72) * waveWeight;
      // Gently align dots to orthogonal border around hovered card
      const pull = ring * 0.45;
      offsetX = offsetX * (1 - pull) + (cx - baseX) * 0.012 * ring;
      offsetY = offsetY * (1 - pull) + (cy - baseY) * 0.012 * ring;
      accentMix = Math.min(1, accentMix + ring * 0.42);
      radiusBoost += ring * 0.35;
    }
  }

  const baseAlpha = 0.26 + Math.max(0, harmonic) * 0.14 * waveWeight;
  const alpha = Math.min(0.82, baseAlpha + accentMix * 0.42);
  const radius = 0.95 + radiusBoost * (1 - settle * 0.65);

  return {
    x: baseX + offsetX,
    y: baseY + offsetY,
    radius,
    alpha,
    accentMix: Math.max(0, Math.min(1, accentMix)),
  };
}

export function parseCssColorToRgb(
  color: string,
  fallback: [number, number, number]
): [number, number, number] {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b];
    } else if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b];
    }
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return fallback;
}
