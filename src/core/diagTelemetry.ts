import type { LogLevel, ProcessLogEntry } from './e3Types.ts';

export interface LogFrequencyPoint {
  bucketStartMs: number;
  label: string;
  total: number;
  info: number;
  sync: number;
  warn: number;
  error: number;
  avgDurationMs: number;
  maxDurationMs: number;
}

export interface SubsystemStat {
  subsystem: ProcessLogEntry['subsystem'];
  count: number;
  errors: number;
  warns: number;
  avgDurationMs: number;
  maxDurationMs: number;
}

export interface PerfSnapshot {
  fps: number;
  lastFrameDeltaMs: number;
  maxFrameDeltaMs: number;
  longTaskCount: number;
  jankFramesCount: number;
  memoryUsedMb: number | null;
  memoryLimitMb: number | null;
}

export interface HealthMetricsSummary {
  totalLogs: number;
  infoCount: number;
  syncCount: number;
  warnCount: number;
  errorCount: number;
  errorRatePct: number;
  avgDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  slowOpsCount: number;
  subsystems: SubsystemStat[];
  slowestEntries: ProcessLogEntry[];
}

export interface ScreenSnapshotInput {
  projectCode: string;
  revision: number;
  sheetNumber?: number;
  sheetName?: string;
  viewportIdx: number;
  viewportLayout: string;
  zoom: number;
  pan: { x: number; y: number };
  tool: string;
  selectedDevices: number;
  selectedWires: number;
  selectedAnnotations: number;
  openModal?: string | null;
  theme?: string;
  symbolEditorOpen?: boolean;
}

export function formatScreenSnapshot(ctx: ScreenSnapshotInput): string {
  const sheetPart = ctx.sheetNumber
    ? `Л.${ctx.sheetNumber}${ctx.sheetName ? `(${ctx.sheetName.slice(0, 18)})` : ''}`
    : 'Лист:—';
  const selPart =
    ctx.selectedDevices + ctx.selectedWires + ctx.selectedAnnotations > 0
      ? `Выд:${ctx.selectedDevices}уд/${ctx.selectedWires}ц/${ctx.selectedAnnotations}ан`
      : 'Выд:0';
  const modalPart = ctx.openModal ? `Модал:${ctx.openModal}` : 'Холст';
  const modePart = ctx.symbolEditorOpen ? 'РедакторУГО' : `${ctx.viewportLayout}[В${ctx.viewportIdx + 1}]`;
  return `${ctx.projectCode}@r${ctx.revision} | ${modePart} ${sheetPart} | Инстр:${ctx.tool} | ${Math.round(ctx.zoom * 100)}% (${Math.round(ctx.pan.x)},${Math.round(ctx.pan.y)}) | ${selPart} | ${modalPart} | Тема:${ctx.theme || 'light'}`;
}

export function describeInteractiveTarget(target: EventTarget | null): {
  label: string;
  tag: string;
  testId?: string;
  role?: string;
} | null {
  if (!target || typeof (target as Element).closest !== 'function') return null;
  const rawEl = target as HTMLElement;
  const interactive =
    (rawEl.closest(
      'button, a, select, input, textarea, [role="button"], [role="tab"], [role="menuitem"], [data-testid]'
    ) as HTMLElement | null) || rawEl;

  const tag = interactive.tagName ? interactive.tagName.toLowerCase() : 'node';
  const testId = interactive.getAttribute?.('data-testid') || undefined;
  const role = interactive.getAttribute?.('role') || undefined;
  const ariaLabel = interactive.getAttribute?.('aria-label')?.trim();
  const title = interactive.getAttribute?.('title')?.trim();
  const innerText = (interactive.innerText || interactive.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);

  const label = ariaLabel || innerText || title || testId || tag;
  return { label, tag, testId, role };
}

function formatBucketTime(ms: number, includeSeconds: boolean): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (!includeSeconds) return `${hh}:${mm}`;
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function buildLogFrequencySeries(
  logs: ProcessLogEntry[],
  options: {
    windowSeconds?: number;
    bucketsCount?: number;
    nowMs?: number;
  } = {}
): LogFrequencyPoint[] {
  const windowSeconds = Math.max(30, options.windowSeconds ?? 300);
  const bucketsCount = Math.max(6, Math.min(60, options.bucketsCount ?? 15));
  const nowMs = options.nowMs ?? Date.now();
  const windowMs = windowSeconds * 1000;
  const bucketMs = Math.max(1000, Math.floor(windowMs / bucketsCount));
  const startMs = nowMs - bucketMs * bucketsCount;
  const includeSeconds = windowSeconds <= 900;

  const buckets: LogFrequencyPoint[] = [];
  const durationAcc: Array<{ sum: number; count: number; max: number }> = [];

  for (let i = 0; i < bucketsCount; i++) {
    const bStart = startMs + i * bucketMs;
    buckets.push({
      bucketStartMs: bStart,
      label: formatBucketTime(bStart, includeSeconds),
      total: 0,
      info: 0,
      sync: 0,
      warn: 0,
      error: 0,
      avgDurationMs: 0,
      maxDurationMs: 0,
    });
    durationAcc.push({ sum: 0, count: 0, max: 0 });
  }

  for (const entry of logs) {
    const ts = Date.parse(entry.timestamp);
    if (!Number.isFinite(ts)) continue;
    if (ts < startMs || ts > nowMs + bucketMs) continue;
    const rawIdx = Math.floor((ts - startMs) / bucketMs);
    const idx = Math.max(0, Math.min(bucketsCount - 1, rawIdx));
    const b = buckets[idx];
    b.total += 1;
    if (entry.level === 'INFO') b.info += 1;
    else if (entry.level === 'SYNC') b.sync += 1;
    else if (entry.level === 'WARN') b.warn += 1;
    else if (entry.level === 'ERROR') b.error += 1;

    const dur =
      typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)
        ? entry.durationMs
        : typeof entry.lagMs === 'number' && Number.isFinite(entry.lagMs)
          ? entry.lagMs
          : null;
    if (dur !== null && dur >= 0) {
      durationAcc[idx].sum += dur;
      durationAcc[idx].count += 1;
      if (dur > durationAcc[idx].max) durationAcc[idx].max = dur;
    }
  }

  for (let i = 0; i < bucketsCount; i++) {
    const d = durationAcc[i];
    if (d.count > 0) {
      buckets[i].avgDurationMs = Math.round((d.sum / d.count) * 10) / 10;
      buckets[i].maxDurationMs = Math.round(d.max * 10) / 10;
    }
  }

  return buckets;
}

export function computeHealthMetrics(logs: ProcessLogEntry[]): HealthMetricsSummary {
  let infoCount = 0;
  let syncCount = 0;
  let warnCount = 0;
  let errorCount = 0;
  const durations: number[] = [];
  let slowOpsCount = 0;

  const subMap = new Map<
    ProcessLogEntry['subsystem'],
    { count: number; errors: number; warns: number; durSum: number; durCount: number; maxDur: number }
  >();

  for (const entry of logs) {
    if (entry.level === 'INFO') infoCount += 1;
    else if (entry.level === 'SYNC') syncCount += 1;
    else if (entry.level === 'WARN') warnCount += 1;
    else if (entry.level === 'ERROR') errorCount += 1;

    const dur =
      typeof entry.durationMs === 'number' && Number.isFinite(entry.durationMs)
        ? entry.durationMs
        : typeof entry.lagMs === 'number' && Number.isFinite(entry.lagMs)
          ? entry.lagMs
          : null;
    if (dur !== null && dur >= 0) {
      durations.push(dur);
      if (dur >= 50) slowOpsCount += 1;
    }

    const curSub = subMap.get(entry.subsystem) || {
      count: 0,
      errors: 0,
      warns: 0,
      durSum: 0,
      durCount: 0,
      maxDur: 0,
    };
    curSub.count += 1;
    if (entry.level === 'ERROR') curSub.errors += 1;
    if (entry.level === 'WARN') curSub.warns += 1;
    if (dur !== null && dur >= 0) {
      curSub.durSum += dur;
      curSub.durCount += 1;
      if (dur > curSub.maxDur) curSub.maxDur = dur;
    }
    subMap.set(entry.subsystem, curSub);
  }

  const sortedDur = [...durations].sort((a, b) => a - b);
  const avgDurationMs =
    durations.length > 0
      ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10
      : 0;
  const maxDurationMs =
    sortedDur.length > 0 ? Math.round(sortedDur[sortedDur.length - 1] * 10) / 10 : 0;
  const p95Idx = sortedDur.length > 0 ? Math.min(sortedDur.length - 1, Math.floor(sortedDur.length * 0.95)) : 0;
  const p95DurationMs = sortedDur.length > 0 ? Math.round(sortedDur[p95Idx] * 10) / 10 : 0;

  const subsystems: SubsystemStat[] = Array.from(subMap.entries())
    .map(([subsystem, s]) => ({
      subsystem,
      count: s.count,
      errors: s.errors,
      warns: s.warns,
      avgDurationMs: s.durCount > 0 ? Math.round((s.durSum / s.durCount) * 10) / 10 : 0,
      maxDurationMs: Math.round(s.maxDur * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  const slowestEntries = [...logs]
    .filter((l) => typeof (l.durationMs ?? l.lagMs) === 'number')
    .sort((a, b) => (b.durationMs ?? b.lagMs ?? 0) - (a.durationMs ?? a.lagMs ?? 0))
    .slice(0, 8);

  const totalLogs = logs.length;
  const errorRatePct =
    totalLogs > 0 ? Math.round(((errorCount + warnCount * 0.5) / totalLogs) * 1000) / 10 : 0;

  return {
    totalLogs,
    infoCount,
    syncCount,
    warnCount,
    errorCount,
    errorRatePct,
    avgDurationMs,
    p95DurationMs,
    maxDurationMs,
    slowOpsCount,
    subsystems,
    slowestEntries,
  };
}

export function buildLogDetailsString(fields: {
  cause?: string;
  outcome?: string;
  screenState?: string;
  extra?: string;
}): string | undefined {
  const lines: string[] = [];
  if (fields.cause) lines.push(`Причина: ${fields.cause}`);
  if (fields.outcome) lines.push(`Ответ/Итог: ${fields.outcome}`);
  if (fields.screenState) lines.push(`Экран: ${fields.screenState}`);
  if (fields.extra) lines.push(fields.extra);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

export function inferLogLevelFromStatus(status: number): LogLevel {
  if (status >= 500) return 'ERROR';
  if (status >= 400) return 'WARN';
  return 'SYNC';
}
