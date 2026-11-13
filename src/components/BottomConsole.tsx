import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileCode2,
  Play,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import type {
  BomRow,
  CableJournalRow,
  E3Project,
  ErcIssue,
  ProcessLogEntry,
  TerminalPlanRow,
} from '../core/e3Types';

export type ConsoleTab = 'bom' | 'cables' | 'erc' | 'logs' | 'api';

interface BottomConsoleProps {
  project: E3Project;
  activeTab: ConsoleTab;
  collapsed: boolean;
  bom: BomRow[];
  cables: CableJournalRow[];
  terminals: TerminalPlanRow[];
  erc: ErcIssue[];
  logs: ProcessLogEntry[];
  lastWorkerMs: number;
  onSetTab: (tab: ConsoleTab) => void;
  onToggleCollapse: () => void;
  onJumpToIssue: (issue: ErcIssue) => void;
  onDownloadBomCsv: () => void;
  onDownloadCablesCsv: () => void;
  onDownloadDxf: () => void;
  onDownloadE3Xml: () => void;
  onDownloadLogs: () => void;
  onTestApiSyncPush: () => Promise<void>;
}

export const BottomConsole: React.FC<BottomConsoleProps> = ({
  project,
  activeTab,
  collapsed,
  bom,
  cables,
  terminals,
  erc,
  logs,
  lastWorkerMs,
  onSetTab,
  onToggleCollapse,
  onJumpToIssue,
  onDownloadBomCsv,
  onDownloadCablesCsv,
  onDownloadDxf,
  onDownloadE3Xml,
  onDownloadLogs,
  onTestApiSyncPush,
}) => {
  const [bomQuery, setBomQuery] = useState('');
  const [cableSubTab, setCableSubTab] = useState<'cables' | 'terminals'>('cables');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'SYNC'>('ALL');
  const [logQuery, setLogQuery] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [apiBusy, setApiBusy] = useState(false);

  const filteredBom = useMemo(() => {
    const q = bomQuery.trim().toLowerCase();
    if (!q) return bom;
    return bom.filter(
      (r) =>
        r.designationText.toLowerCase().includes(q) ||
        r.componentName.toLowerCase().includes(q) ||
        r.article.toLowerCase().includes(q) ||
        r.manufacturer.toLowerCase().includes(q)
    );
  }, [bom, bomQuery]);

  const filteredLogs = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    return logs.filter((l) => {
      if (logLevelFilter !== 'ALL' && l.level !== logLevelFilter) return false;
      if (!q) return true;
      return (
        l.message.toLowerCase().includes(q) ||
        l.subsystem.toLowerCase().includes(q) ||
        (l.details || '').toLowerCase().includes(q)
      );
    });
  }, [logs, logLevelFilter, logQuery]);

  const handleCopyAllLogs = async () => {
    const txt = filteredLogs
      .map(
        (e) =>
          `[${e.timestamp}] [${e.level}] [${e.subsystem}] ${e.message}${
            e.details ? `\n  ${e.details.replace(/\n/g, '\n  ')}` : ''
          }`
      )
      .join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedLogs(true);
      window.setTimeout(() => setCopiedLogs(false), 1800);
    } catch {
      // ignore
    }
  };

  const totalDevicesInBom = useMemo(() => bom.reduce((acc, r) => acc + r.quantity, 0), [bom]);
  const errorCount = erc.filter((i) => i.severity === 'error').length;

  return (
    <section
      aria-label="Спецификации, отчёты, диагностика и API"
      className={`no-print shrink-0 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-col transition-all ${
        collapsed ? 'h-9' : 'h-64'
      }`}
    >
      {/* Console Header Tabs */}
      <div className="h-9 px-3 border-b border-[var(--flux-line)] bg-[var(--flux-bg)] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {(
            [
              ['bom', `Спецификация ПЭ3 (${bom.length})`],
              ['cables', `Кабели и клеммы (${cables.length})`],
              ['erc', `Диагностика ERC (${erc.length})`],
              ['logs', `Логи процессов (${logs.length})`],
              ['api', 'API и Синхронизация'],
            ] as const
          ).map(([id, label]) => {
            const active = activeTab === id && !collapsed;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSetTab(id);
                  if (collapsed) onToggleCollapse();
                }}
                className={`relative h-9 px-2.5 text-[12px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'text-[var(--flux-text)]'
                    : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                }`}
              >
                <span>{label}</span>
                {active && (
                  <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-[var(--flux-accent)]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
            Асинхр. расчёт: {lastWorkerMs.toFixed(1)} мс · Итого поз.: {totalDevicesInBom}
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Развернуть нижнюю панель' : 'Свернуть нижнюю панель'}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeTab === 'bom' && (
            <>
              <div className="px-3 py-1.5 border-b border-[var(--flux-line)] flex items-center justify-between gap-3 bg-[var(--flux-surface)]">
                <input
                  type="search"
                  value={bomQuery}
                  onChange={(e) => setBomQuery(e.target.value)}
                  placeholder="Фильтр спецификации (обозначение, артикул, завод)…"
                  aria-label="Фильтр спецификации ПЭ3"
                  className="w-80 h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[12px] text-[var(--flux-text)]"
                />
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onDownloadBomCsv}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] font-medium text-[var(--flux-text)] whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV (Excel)</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadE3Xml}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] font-medium text-[var(--flux-text)] whitespace-nowrap"
                  >
                    <FileCode2 className="w-3.5 h-3.5" />
                    <span>Проект E3 (.e3s)</span>
                  </button>
                  <button
                    type="button"
                    onClick={onDownloadDxf}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] font-medium text-[var(--flux-text)] whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CAD DXF</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead className="sticky top-0 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                    <tr>
                      <th className="text-left font-medium px-3 py-1.5 w-12">Поз.</th>
                      <th className="text-left font-medium px-3 py-1.5">Обозначение</th>
                      <th className="text-left font-medium px-3 py-1.5">Наименование</th>
                      <th className="text-left font-medium px-3 py-1.5">Артикул</th>
                      <th className="text-left font-medium px-3 py-1.5">Производитель</th>
                      <th className="text-right font-medium px-3 py-1.5 w-20">Кол-во</th>
                      <th className="text-left font-medium px-3 py-1.5 w-14">Ед.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--flux-line)]">
                    {filteredBom.map((row) => (
                      <tr key={`${row.pos}-${row.article}`} className="hover:bg-[var(--flux-hover)]">
                        <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--flux-text-muted)]">
                          {row.pos}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">
                          {row.designationText}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--flux-text)]">{row.componentName}</td>
                        <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{row.article}</td>
                        <td className="px-3 py-1.5 text-[var(--flux-text-muted)]">{row.manufacturer}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--flux-text)]">
                          {row.quantity}
                        </td>
                        <td className="px-3 py-1.5 text-[var(--flux-text-muted)]">{row.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'cables' && (
            <>
              <div className="px-3 py-1.5 border-b border-[var(--flux-line)] flex items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-0.5 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)]">
                  <button
                    type="button"
                    onClick={() => setCableSubTab('cables')}
                    className={`h-6 px-2.5 rounded text-[11px] font-medium ${
                      cableSubTab === 'cables'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-text)]'
                        : 'text-[var(--flux-text-muted)]'
                    }`}
                  >
                    Кабельный журнал ({cables.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCableSubTab('terminals')}
                    className={`h-6 px-2.5 rounded text-[11px] font-medium ${
                      cableSubTab === 'terminals'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-text)]'
                        : 'text-[var(--flux-text-muted)]'
                    }`}
                  >
                    Клеммник ({terminals.length})
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onDownloadCablesCsv}
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] font-medium text-[var(--flux-text)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Экспорт кабелей CSV</span>
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                {cableSubTab === 'cables' ? (
                  <table className="w-full border-collapse text-[12px]">
                    <thead className="sticky top-0 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                      <tr>
                        <th className="text-left font-medium px-3 py-1.5">Кабель</th>
                        <th className="text-left font-medium px-3 py-1.5">Марка кабеля</th>
                        <th className="text-left font-medium px-3 py-1.5">Откуда</th>
                        <th className="text-left font-medium px-3 py-1.5">Куда</th>
                        <th className="text-right font-medium px-3 py-1.5">Жилы (исп/всего)</th>
                        <th className="text-right font-medium px-3 py-1.5">Сечение</th>
                        <th className="text-right font-medium px-3 py-1.5">Длина, м</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--flux-line)]">
                      {cables.map((c) => (
                        <tr key={c.designation} className="hover:bg-[var(--flux-hover)]">
                          <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{c.designation}</td>
                          <td className="px-3 py-1.5 text-[var(--flux-text)]">
                            {c.cableType} {c.shielded ? '(экран)' : ''}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{c.fromDevice}</td>
                          <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{c.toDevice}</td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--flux-text)]">
                            {c.usedCores}/{c.coresCount}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--flux-text)]">
                            {c.crossSection}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--flux-text)]">
                            {c.lengthMeters}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full border-collapse text-[12px]">
                    <thead className="sticky top-0 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                      <tr>
                        <th className="text-left font-medium px-3 py-1.5">Клеммник</th>
                        <th className="text-left font-medium px-3 py-1.5">Контакт</th>
                        <th className="text-left font-medium px-3 py-1.5">Цепь</th>
                        <th className="text-left font-medium px-3 py-1.5">Провод</th>
                        <th className="text-left font-medium px-3 py-1.5">Куда подключено</th>
                        <th className="text-left font-medium px-3 py-1.5">Кабель / Жила</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--flux-line)]">
                      {terminals.map((t, idx) => (
                        <tr key={`${t.terminalDesignation}-${t.pinName}-${idx}`} className="hover:bg-[var(--flux-hover)]">
                          <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{t.terminalDesignation}</td>
                          <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{t.pinName}</td>
                          <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{t.netName}</td>
                          <td className="px-3 py-1.5 font-mono text-[var(--flux-text-muted)]">{t.wireNumber}</td>
                          <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{t.connectedTo}</td>
                          <td className="px-3 py-1.5 text-[var(--flux-text-muted)]">{t.cableInfo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {activeTab === 'erc' && (
            <div className="flex-1 overflow-auto divide-y divide-[var(--flux-line)]">
              {erc.length === 0 ? (
                <div className="p-4 text-[12px] text-[var(--flux-text-muted)]">
                  Ошибок электрических правил (ERC) не обнаружено. Схема готова к выпуску ПЭ3 и экспорту в E3.series.
                </div>
              ) : (
                erc.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => onJumpToIssue(issue)}
                    className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left hover:bg-[var(--flux-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          issue.severity === 'error'
                            ? 'text-rose-600 dark:text-rose-400'
                            : issue.severity === 'warning'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-sky-600 dark:text-sky-400'
                        }`}
                      />
                      <span className="font-mono text-[11px] text-[var(--flux-text-muted)] shrink-0">
                        {issue.code}
                      </span>
                      <span className="text-[12px] text-[var(--flux-text)] truncate">
                        {issue.message}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--flux-accent)] shrink-0">
                      Перейти →
                    </span>
                  </button>
                ))
              )}
              {errorCount > 0 && (
                <div className="px-3 py-1.5 text-[11px] text-rose-600 dark:text-rose-400 bg-[var(--flux-bg)]">
                  Критических ошибок ERC: {errorCount}. Рекомендуется устранить перед выпуском в производство.
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <>
              <div className="px-3 py-1.5 border-b border-[var(--flux-line)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(['ALL', 'INFO', 'SYNC', 'WARN', 'ERROR'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLogLevelFilter(lvl)}
                      className={`h-6 px-2 rounded text-[11px] font-mono ${
                        logLevelFilter === lvl
                          ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                          : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)]'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                  <input
                    type="search"
                    value={logQuery}
                    onChange={(e) => setLogQuery(e.target.value)}
                    placeholder="Поиск по логам и ошибкам…"
                    aria-label="Поиск по логам процессов"
                    className="w-52 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyAllLogs}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)]"
                  >
                    {copiedLogs ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLogs ? 'Скопировано' : 'Копировать'}</span>
                  </button>
                  <a
                    href="/api/v1/diagnostics/logs/download"
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Скачать diag.log</span>
                  </a>
                  <button
                    type="button"
                    onClick={onDownloadLogs}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)]"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto font-mono text-[11px] divide-y divide-[var(--flux-line)]">
                {filteredLogs.map((entry) => {
                  const hasDetails = Boolean(entry.details && entry.details.trim().length > 0);
                  const isExpanded = Boolean(expandedLogIds[entry.id] || (hasDetails && entry.level === 'ERROR'));
                  return (
                    <div key={entry.id} className="px-3 py-1.5 hover:bg-[var(--flux-hover)]">
                      <div className="flex items-start gap-2.5">
                        <span className="text-[var(--flux-text-muted)] tabular-nums shrink-0">
                          {entry.timestamp.slice(11, 23)}
                        </span>
                        <span
                          className={`w-11 shrink-0 font-medium ${
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
                        <span className="w-24 shrink-0 text-[var(--flux-text-muted)]">
                          [{entry.subsystem}]
                        </span>
                        <span className="flex-1 text-[var(--flux-text)] break-words">{entry.message}</span>
                        {hasDetails && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedLogIds((prev) => ({ ...prev, [entry.id]: !isExpanded }))
                            }
                            className="text-[10px] text-[var(--flux-accent)] hover:underline shrink-0"
                          >
                            {isExpanded ? 'Скрыть детали' : 'Детали'}
                          </button>
                        )}
                        {entry.durationMs !== undefined && (
                          <span className="tabular-nums text-[var(--flux-text-muted)] shrink-0">
                            {entry.durationMs.toFixed(1)} мс
                          </span>
                        )}
                      </div>
                      {hasDetails && isExpanded && (
                        <pre className="mt-1.5 ml-36 p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[10px] text-[var(--flux-text-muted)] whitespace-pre-wrap overflow-x-auto max-h-40">
                          {entry.details}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'api' && (
            <div className="flex-1 overflow-auto p-3 grid grid-cols-1 lg:grid-cols-2 gap-4 text-[12px]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[var(--flux-text)] flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                    <span>REST & SSE API автоматизации</span>
                  </h3>
                  <button
                    type="button"
                    disabled={apiBusy}
                    onClick={async () => {
                      setApiBusy(true);
                      try {
                        await onTestApiSyncPush();
                      } finally {
                        setApiBusy(false);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white text-[11px] font-medium disabled:opacity-50"
                  >
                    {apiBusy ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    <span>Тест API Push (Синхр.)</span>
                  </button>
                </div>
                <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] font-mono text-[11px]">
                  <div className="px-2.5 py-1.5 flex justify-between gap-2">
                    <span className="text-[var(--flux-accent)]">GET /api/sync/stream</span>
                    <span className="text-[var(--flux-text-muted)]">SSE поток изменений в реальном времени</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex justify-between gap-2">
                    <span className="text-[var(--flux-accent)]">GET /api/v1/projects/{project.id}/bom</span>
                    <span className="text-[var(--flux-text-muted)]">Авто-спецификация ПЭ3 JSON/CSV</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex justify-between gap-2">
                    <span className="text-[var(--flux-accent)]">POST /api/v1/projects/{project.id}/devices</span>
                    <span className="text-[var(--flux-text-muted)]">Добавление/обновление компонента</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex justify-between gap-2">
                    <span className="text-[var(--flux-accent)]">GET /api/v1/projects/{project.id}/export/e3s</span>
                    <span className="text-[var(--flux-text-muted)]">Контейнер Flux E3 .e3s (OLE2 / XML)</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex justify-between gap-2">
                    <span className="text-[var(--flux-accent)]">GET /api/v1/projects/{project.id}/export/e3vbs</span>
                    <span className="text-[var(--flux-text-muted)]">COM-скрипт генерации нативного .e3s (E³ 2022)</span>
                  </div>
                  <div className="px-2.5 py-1.5 flex justify-between gap-2">
                    <span className="text-[var(--flux-accent)]">GET /api/export/flux-studio</span>
                    <span className="text-[var(--flux-text-muted)]">Пакет подпрограммы Flux Studio (.zip)</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-[var(--flux-text)]">
                  Пример автоматизации (cURL / Flux Script)
                </h3>
                <pre className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)] overflow-x-auto leading-relaxed">
{`curl -X POST http://localhost:3000/api/v1/projects/${project.id}/devices \\
  -H "Content-Type: application/json" \\
  -d '{"designation":"-KM2","article":"LC1D25BD","manufacturer":"Schneider Electric"}'`}
                </pre>
                <p className="text-[11px] text-[var(--flux-text-muted)]">
                  Все изменения через API мгновенно транслируются всем подключённым сессиям CAD через EventSource и BroadcastChannel.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
