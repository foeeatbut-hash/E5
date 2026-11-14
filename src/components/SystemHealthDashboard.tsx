import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  Gauge,
  Monitor,
  RefreshCw,
  Search,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';
import { StudioWindow } from './StudioWindow';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildLogFrequencySeries,
  computeHealthMetrics,
  type PerfSnapshot,
} from '../core/diagTelemetry';
import type { LogLevel, ProcessLogEntry } from '../core/e3Types';

interface SystemHealthDashboardProps {
  open: boolean;
  logs: ProcessLogEntry[];
  perf: PerfSnapshot;
  screenSnapshot: string;
  onClose: () => void;
  onClearLogs: () => void;
  onDownloadLogsJson: () => void;
  onRunWorkerSelfCheck?: () => void;
}

const WINDOW_OPTIONS = [
  { seconds: 60, label: '1 мин' },
  { seconds: 300, label: '5 мин' },
  { seconds: 900, label: '15 мин' },
  { seconds: 1800, label: '30 мин' },
] as const;

export const SystemHealthDashboard: React.FC<SystemHealthDashboardProps> = ({
  open,
  logs,
  perf,
  screenSnapshot,
  onClose,
  onClearLogs,
  onDownloadLogsJson,
  onRunWorkerSelfCheck,
}) => {
  const [windowSeconds, setWindowSeconds] = useState<number>(300);
  const [chartMode, setChartMode] = useState<'frequency' | 'latency'>('frequency');
  const [levelFilter, setLevelFilter] = useState<'ALL' | LogLevel>('ALL');
  const [subsystemFilter, setSubsystemFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNowTick(Date.now());
    const id = window.setInterval(() => setNowTick(Date.now()), 2000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const metrics = useMemo(() => computeHealthMetrics(logs), [logs]);

  const frequencySeries = useMemo(
    () =>
      buildLogFrequencySeries(logs, {
        windowSeconds,
        bucketsCount: 16,
        nowMs: nowTick,
      }),
    [logs, windowSeconds, nowTick]
  );

  const subsystemNames = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.subsystem);
    return ['ALL', ...Array.from(set).sort()];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((entry) => {
      if (levelFilter !== 'ALL' && entry.level !== levelFilter) return false;
      if (subsystemFilter !== 'ALL' && entry.subsystem !== subsystemFilter) return false;
      if (!q) return true;
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.subsystem.toLowerCase().includes(q) ||
        (entry.cause || '').toLowerCase().includes(q) ||
        (entry.outcome || '').toLowerCase().includes(q) ||
        (entry.screenState || '').toLowerCase().includes(q) ||
        (entry.details || '').toLowerCase().includes(q)
      );
    });
  }, [logs, levelFilter, subsystemFilter, query]);

  const healthGood =
    metrics.errorCount === 0 && (perf.fps >= 30 || perf.lastFrameDeltaMs < 100);

  return (
    <StudioWindow
      open={open}
      onClose={onClose}
      variant="floating"
      maxWidthClass="max-w-[1160px]"
      heightClass="max-h-[92vh]"
      title="Монитор здоровья и диагностика процессов"
      titleId="health-dashboard-title"
      icon={<Activity className="w-4 h-4 text-[var(--flux-accent)]" />}
      testId="system-health-dashboard"
      closeTestId="health-close-btn"
      closeAriaLabel="Закрыть монитор здоровья"
      subtitle={
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10.5px] font-mono tabular-nums shrink-0 ${
            healthGood
              ? 'border-[var(--flux-line-strong)] bg-[var(--flux-surface)]/80 text-emerald-600 dark:text-emerald-400'
              : 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
          }`}
        >
          {healthGood ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <AlertTriangle className="w-3 h-3" />
          )}
          <span>{healthGood ? 'OK' : 'WARN'}</span>
        </span>
      }
      headerExtra={
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setNowTick(Date.now())}
            title="Обновить временной срез графика"
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 hover:bg-[var(--flux-hover)] text-[11px] font-medium transition-colors"
          >
            <RefreshCw className="w-3 h-3 text-[var(--flux-text-muted)]" />
            <span className="hidden sm:inline">Обновить</span>
          </button>
          {onRunWorkerSelfCheck && (
            <button
              type="button"
              data-testid="health-worker-check-btn"
              onClick={onRunWorkerSelfCheck}
              title="Запустить внеочередной расчёт модели и ERC для замера производительности"
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 hover:bg-[var(--flux-hover)] text-[11px] font-medium transition-colors"
            >
              <Zap className="w-3 h-3 text-[var(--flux-accent)]" />
              <span className="hidden sm:inline">Тест отклика</span>
            </button>
          )}
          <a
            href="/api/v1/diagnostics/logs/download"
            download="e3promax-diag.log"
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 hover:bg-[var(--flux-hover)] text-[11px] font-medium transition-colors"
          >
            <Terminal className="w-3 h-3 text-[var(--flux-text-muted)]" />
            <span className="hidden md:inline">diag.log</span>
          </a>
          <button
            type="button"
            onClick={onDownloadLogsJson}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 hover:bg-[var(--flux-hover)] text-[11px] font-medium transition-colors"
          >
            <Download className="w-3 h-3 text-[var(--flux-text-muted)]" />
            <span className="hidden md:inline">JSON</span>
          </button>
          <button
            type="button"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 hover:bg-[var(--flux-hover)] text-[11px] text-[var(--flux-text-muted)] hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span className="hidden lg:inline">Очистить</span>
          </button>
        </div>
      }
    >

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
          {/* Active Screen Snapshot Strip */}
          <div
            data-testid="health-screen-snapshot"
            className="px-2.5 py-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center gap-2 text-[11px]"
          >
            <Monitor className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
            <span className="font-semibold text-[var(--flux-text-muted)] shrink-0">Экран сейчас:</span>
            <span className="font-mono text-[var(--flux-text)] truncate">{screenSnapshot}</span>
          </div>

          {/* Unified CAD Telemetry Strip */}
          <div className="rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[var(--flux-line)]">
            <div className="p-2.5 space-y-0.5">
              <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-[0.03em] text-[var(--flux-text-muted)]">
                <span>Плавность UI (FPS)</span>
                <Gauge className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-semibold font-mono tabular-nums">
                  {perf.fps}
                </span>
                <span className="text-[10.5px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                  кадр {perf.lastFrameDeltaMs.toFixed(0)} мс (пик {perf.maxFrameDeltaMs.toFixed(0)} мс)
                </span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                Лаг (&gt;50мс): {perf.jankFramesCount} · LongTask: {perf.longTaskCount}
              </div>
            </div>

            <div className="p-2.5 space-y-0.5">
              <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-[0.03em] text-[var(--flux-text-muted)]">
                <span>События и Сбои</span>
                <AlertTriangle
                  className={`w-3.5 h-3.5 ${
                    metrics.errorCount > 0 ? 'text-rose-500' : 'text-[var(--flux-text-muted)]'
                  }`}
                />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-semibold font-mono tabular-nums">
                  {metrics.totalLogs}
                </span>
                <span className="text-[10.5px] font-mono tabular-nums text-rose-600 dark:text-rose-400">
                  {metrics.errorCount} ERR
                </span>
                <span className="text-[10.5px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {metrics.warnCount} WARN
                </span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                INFO: {metrics.infoCount} · SYNC: {metrics.syncCount} · Ошибок: {metrics.errorRatePct}%
              </div>
            </div>

            <div className="p-2.5 space-y-0.5">
              <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-[0.03em] text-[var(--flux-text-muted)]">
                <span>Время процессов</span>
                <Clock className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-semibold font-mono tabular-nums">
                  {metrics.avgDurationMs.toFixed(1)} мс
                </span>
                <span className="text-[10.5px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                  P95: {metrics.p95DurationMs.toFixed(1)} мс
                </span>
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                Макс: {metrics.maxDurationMs.toFixed(1)} мс · Медленных (&ge;50мс): {metrics.slowOpsCount}
              </div>
            </div>

            <div className="p-2.5 space-y-0.5">
              <div className="flex items-center justify-between text-[10.5px] font-medium uppercase tracking-[0.03em] text-[var(--flux-text-muted)]">
                <span>Память и Модули</span>
                <Cpu className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[18px] font-semibold font-mono tabular-nums">
                  {perf.memoryUsedMb !== null ? `${perf.memoryUsedMb} МБ` : `${metrics.subsystems.length} мод.`}
                </span>
                {perf.memoryLimitMb !== null && (
                  <span className="text-[10.5px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                    / {perf.memoryLimitMb} МБ
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono tabular-nums text-[var(--flux-text-muted)] truncate">
                Топ:{' '}
                {metrics.subsystems
                  .slice(0, 3)
                  .map((s) => `${s.subsystem}(${s.count})`)
                  .join(' · ') || 'нет данных'}
              </div>
            </div>
          </div>

          {/* Recharts LineChart: Log Frequency / Latency Over Time */}
          <div className="rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-[12px] font-semibold text-[var(--flux-text)]">
                  {chartMode === 'frequency'
                    ? 'Частота логов и событий по времени'
                    : 'Время выполнения процессов и лаги UI по времени (мс)'}
                </h3>
                <p className="text-[10.5px] text-[var(--flux-text-muted)]">
                  {chartMode === 'frequency'
                    ? 'Интенсивность операций, API-синхронизации, предупреждений и ошибок по временным интервалам'
                    : 'Средняя и пиковая длительность зафиксированных операций и задержек интерфейса'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="inline-flex divide-x divide-[var(--flux-line)] border border-[var(--flux-line)] rounded-[2px] overflow-hidden bg-[var(--flux-bg)]">
                  <button
                    type="button"
                    data-testid="health-mode-frequency"
                    onClick={() => setChartMode('frequency')}
                    className={`h-6 px-2 text-[11px] font-medium transition-colors ${
                      chartMode === 'frequency'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-accent)] font-semibold'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    Частота (шт.)
                  </button>
                  <button
                    type="button"
                    data-testid="health-mode-latency"
                    onClick={() => setChartMode('latency')}
                    className={`h-6 px-2 text-[11px] font-medium transition-colors ${
                      chartMode === 'latency'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-accent)] font-semibold'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    Время / Лаги (мс)
                  </button>
                </div>

                <div className="inline-flex divide-x divide-[var(--flux-line)] border border-[var(--flux-line)] rounded-[2px] overflow-hidden bg-[var(--flux-bg)]">
                  {WINDOW_OPTIONS.map((w) => (
                    <button
                      key={w.seconds}
                      type="button"
                      onClick={() => setWindowSeconds(w.seconds)}
                      className={`h-6 px-2 font-mono text-[10.5px] transition-colors ${
                        windowSeconds === w.seconds
                          ? 'bg-[var(--flux-surface)] text-[var(--flux-accent)] font-semibold'
                          : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                      }`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div data-testid="health-frequency-chart" className="w-full h-[235px] p-2.5">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'frequency' ? (
                  <LineChart data={frequencySeries} margin={{ top: 8, right: 16, left: -12, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--flux-line)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--flux-text-muted)' }}
                      stroke="var(--flux-line)"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: 'var(--flux-text-muted)' }}
                      stroke="var(--flux-line)"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--flux-surface)',
                        borderColor: 'var(--flux-line-strong)',
                        borderRadius: '2px',
                        fontSize: '11px',
                        color: 'var(--flux-text)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Всего событий"
                      stroke="#158f5a"
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4.5 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="info"
                      name="UI / INFO"
                      stroke="#0891b2"
                      strokeWidth={1.6}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="sync"
                      name="API / SYNC"
                      stroke="#158453"
                      strokeWidth={1.6}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="warn"
                      name="WARN"
                      stroke="#d97706"
                      strokeWidth={1.8}
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="error"
                      name="ERROR"
                      stroke="#dc2626"
                      strokeWidth={2.2}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                ) : (
                  <LineChart data={frequencySeries} margin={{ top: 8, right: 16, left: -8, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--flux-line)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--flux-text-muted)' }}
                      stroke="var(--flux-line)"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--flux-text-muted)' }}
                      stroke="var(--flux-line)"
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--flux-surface)',
                        borderColor: 'var(--flux-line-strong)',
                        borderRadius: '2px',
                        fontSize: '11px',
                        color: 'var(--flux-text)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line
                      type="monotone"
                      dataKey="avgDurationMs"
                      name="Среднее время (мс)"
                      stroke="#158f5a"
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="maxDurationMs"
                      name="Пиковое время / лаг (мс)"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Subsystems & Slowest Operations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
            <div className="rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[11px] font-semibold flex items-center justify-between">
                <span>Нагрузка по подсистемам</span>
                <span className="font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)]">
                  {metrics.subsystems.length} подсистем
                </span>
              </div>
              <div className="max-h-44 overflow-auto">
                <table className="w-full text-[11px] font-mono tabular-nums">
                  <thead className="bg-[var(--flux-bg)] text-[var(--flux-text-muted)] border-b border-[var(--flux-line)]">
                    <tr className="divide-x divide-[var(--flux-line)]/60">
                      <th className="text-left font-medium px-2 py-1">Модуль</th>
                      <th className="text-right font-medium px-2 py-1">Шт.</th>
                      <th className="text-right font-medium px-2 py-1">ERR/WRN</th>
                      <th className="text-right font-medium px-2 py-1">Ср. / Пик</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--flux-line)]">
                    {metrics.subsystems.map((sub) => (
                      <tr key={sub.subsystem} className="hover:bg-[var(--flux-hover)] divide-x divide-[var(--flux-line)]/50">
                        <td className="px-2 py-1 text-[var(--flux-text)]">{sub.subsystem}</td>
                        <td className="px-2 py-1 text-right">{sub.count}</td>
                        <td className="px-2 py-1 text-right">
                          <span className={sub.errors > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-[var(--flux-text-muted)]'}>
                            {sub.errors}
                          </span>
                          {' / '}
                          <span className={sub.warns > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--flux-text-muted)]'}>
                            {sub.warns}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right text-[var(--flux-text-muted)]">
                          {sub.avgDurationMs.toFixed(1)} / {sub.maxDurationMs.toFixed(1)} мс
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[11px] font-semibold flex items-center justify-between">
                <span>Самые долгие операции и задержки</span>
                <span className="font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)]">
                  Топ-{metrics.slowestEntries.length}
                </span>
              </div>
              <div className="max-h-44 overflow-auto divide-y divide-[var(--flux-line)]">
                {metrics.slowestEntries.length === 0 ? (
                  <div className="px-3 py-4 text-[11px] text-[var(--flux-text-muted)] text-center">
                    Замеров длительности пока нет.
                  </div>
                ) : (
                  metrics.slowestEntries.map((item) => {
                    const dur = item.durationMs ?? item.lagMs ?? 0;
                    return (
                      <div key={item.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] hover:bg-[var(--flux-hover)]">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-[var(--flux-text-muted)]">
                              [{item.subsystem}]
                            </span>
                            <span className="truncate text-[var(--flux-text)]">{item.message}</span>
                          </div>
                          {item.cause && (
                            <div className="text-[10px] text-[var(--flux-text-muted)] truncate">
                              От чего: {item.cause}
                            </div>
                          )}
                        </div>
                        <span
                          className={`font-mono tabular-nums text-[11px] font-semibold shrink-0 ${
                            dur >= 100
                              ? 'text-rose-600 dark:text-rose-400'
                              : dur >= 40
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-[var(--flux-text-muted)]'
                          }`}
                        >
                          {dur.toFixed(1)} мс
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Full Structured Event Log Explorer */}
          <div className="rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] overflow-hidden">
            <div className="px-2.5 py-1.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold mr-1">
                  Детальная трасса ({filteredLogs.length}/{logs.length})
                </span>
                <div className="inline-flex divide-x divide-[var(--flux-line)] border border-[var(--flux-line)] rounded-[2px] overflow-hidden bg-[var(--flux-bg)]">
                  {(['ALL', 'INFO', 'SYNC', 'WARN', 'ERROR'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLevelFilter(lvl)}
                      className={`h-5 px-1.5 font-mono text-[10px] transition-colors ${
                        levelFilter === lvl
                          ? 'bg-[var(--flux-surface)] text-[var(--flux-accent)] font-semibold'
                          : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Фильтр по подсистеме"
                  value={subsystemFilter}
                  onChange={(e) => setSubsystemFilter(e.target.value)}
                  className="h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[10.5px] text-[var(--flux-text)]"
                >
                  {subsystemNames.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub === 'ALL' ? 'Все модули' : sub}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <Search className="w-3 h-3 text-[var(--flux-text-muted)] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  spellCheck={false}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по причине, итогу, экрану…"
                  aria-label="Поиск по детальной трассе"
                  className="w-60 h-6 pl-6 pr-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
                />
              </div>
            </div>

            <div className="max-h-60 overflow-auto divide-y divide-[var(--flux-line)] font-mono text-[10.5px]">
              {filteredLogs.length === 0 ? (
                <div className="px-3 py-5 text-center font-sans text-[11.5px] text-[var(--flux-text-muted)]">
                  События по заданным фильтрам отсутствуют.
                </div>
              ) : (
                filteredLogs.slice(0, 200).map((entry) => {
                  const isOpen = expandedId === entry.id || entry.level === 'ERROR';
                  const hasRich = Boolean(
                    entry.cause || entry.outcome || entry.screenState || entry.details
                  );
                  return (
                    <div key={entry.id} className="px-3 py-1.5 hover:bg-[var(--flux-hover)]">
                      <div className="flex items-start gap-2">
                        <span className="text-[var(--flux-text-muted)] tabular-nums shrink-0">
                          {entry.timestamp.slice(11, 23)}
                        </span>
                        <span
                          className={`w-10 shrink-0 font-semibold ${
                            entry.level === 'ERROR'
                              ? 'text-rose-600 dark:text-rose-400'
                              : entry.level === 'WARN'
                                ? 'text-amber-600 dark:text-amber-400'
                                : entry.level === 'SYNC'
                                  ? 'text-[var(--flux-accent)]'
                                  : 'text-[var(--flux-text-muted)]'
                          }`}
                        >
                          {entry.level}
                        </span>
                        <span className="w-[92px] shrink-0 text-[var(--flux-text-muted)] whitespace-nowrap">
                          [{entry.subsystem}]
                        </span>
                        <span className="flex-1 min-w-0 font-sans text-[11px] text-[var(--flux-text)] break-words">
                          {entry.message}
                        </span>
                        {(entry.durationMs !== undefined || entry.lagMs !== undefined) && (
                          <span className="tabular-nums text-[var(--flux-text-muted)] shrink-0">
                            {(entry.durationMs ?? entry.lagMs ?? 0).toFixed(1)} мс
                          </span>
                        )}
                        {hasRich && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(isOpen ? null : entry.id)}
                            className="font-sans text-[10.5px] text-[var(--flux-accent)] hover:underline shrink-0"
                          >
                            {isOpen ? 'Свернуть' : 'Контекст'}
                          </button>
                        )}
                      </div>

                      {hasRich && isOpen && (
                        <div className="mt-1.5 ml-14 p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-1 font-sans text-[11px]">
                          {entry.cause && (
                            <div>
                              <span className="font-semibold text-[var(--flux-text-muted)]">Причина: </span>
                              <span>{entry.cause}</span>
                            </div>
                          )}
                          {entry.outcome && (
                            <div>
                              <span className="font-semibold text-[var(--flux-text-muted)]">Ответ/Итог: </span>
                              <span>{entry.outcome}</span>
                            </div>
                          )}
                          {entry.screenState && (
                            <div className="font-mono text-[10px] text-[var(--flux-text-muted)]">
                              <span className="font-sans font-semibold">Экран: </span>
                              {entry.screenState}
                            </div>
                          )}
                          {entry.details && (
                            <pre className="pt-1 border-t border-[var(--flux-line)] font-mono text-[10px] text-[var(--flux-text-muted)] whitespace-pre-wrap overflow-x-auto max-h-28">
                              {entry.details}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
    </StudioWindow>
  );
};
