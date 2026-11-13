import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Send,
  Terminal,
  Trash2,
} from 'lucide-react';
import { E3_API_ENDPOINTS } from '../core/apiEcosystem';
import type {
  BomRow,
  CableJournalRow,
  E3Project,
  ErcIssue,
  ExternalWebhookConfig,
  FluxBusMessage,
  ProcessLogEntry,
  TerminalPlanRow,
} from '../core/e3Types';
import { createFluxBusLogEntry, detectFluxHost, invokeFluxModule } from '../core/fluxHostBridge';

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
  fluxBusMessages?: FluxBusMessage[];
  onFluxBusLog?: (entry: FluxBusMessage) => void;
  onSetTab: (tab: ConsoleTab) => void;
  onToggleCollapse: () => void;
  onJumpToIssue: (issue: ErcIssue) => void;
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
  fluxBusMessages = [],
  onFluxBusLog,
  onSetTab,
  onToggleCollapse,
  onJumpToIssue,
  onTestApiSyncPush,
}) => {
  const [bomQuery, setBomQuery] = useState('');
  const [cableSubTab, setCableSubTab] = useState<'cables' | 'terminals'>('cables');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'SYNC'>('ALL');
  const [logQuery, setLogQuery] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [apiBusy, setApiBusy] = useState(false);

  // 3-Tier API Hub state
  const [apiSubTab, setApiSubTab] = useState<'own' | 'flux-internal' | 'external'>('own');
  const [openApiPreview, setOpenApiPreview] = useState<string | null>(null);
  const [fluxTargetApp, setFluxTargetApp] = useState('flux-hvac-selector');
  const [fluxAction, setFluxAction] = useState('e3.getBom');
  const [fluxResultPreview, setFluxResultPreview] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<ExternalWebhookConfig[]>([]);
  const [recentReceipts, setRecentReceipts] = useState<Array<{ receivedAt: string; event: string; payload: unknown }>>([]);
  const [newWhName, setNewWhName] = useState('1С:ERP / Внешняя SCADA');
  const [newWhUrl, setNewWhUrl] = useState(() =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/integrations/mock-external-receiver`
      : 'http://127.0.0.1:3000/api/v1/integrations/mock-external-receiver'
  );
  const [extCallMethod, setExtCallMethod] = useState<'POST' | 'GET'>('POST');
  const [extCallUrl, setExtCallUrl] = useState(() =>
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/integrations/mock-external-receiver`
      : 'http://127.0.0.1:3000/api/v1/integrations/mock-external-receiver'
  );
  const [extStatusMsg, setExtStatusMsg] = useState<string | null>(null);

  const loadWebhooks = useCallback(async () => {
    try {
      const r = await fetch('/api/v1/integrations/webhooks');
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.webhooks)) setWebhooks(d.webhooks);
      if (Array.isArray(d.recentMockReceipts)) setRecentReceipts(d.recentMockReceipts);
    } catch {
      // ignore offline
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'api' && apiSubTab === 'external') {
      void loadWebhooks();
    }
  }, [activeTab, apiSubTab, loadWebhooks]);

  const fluxHostStatus = useMemo(() => detectFluxHost(), []);

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
      data-testid="bottom-console"
      className="no-print w-full max-w-full h-full flex-1 min-w-0 min-h-0 bg-[var(--flux-surface)] flex flex-col overflow-hidden"
    >
      {/* Console Header Tabs */}
      <div className="h-8 px-2 border-b border-[var(--flux-line)] bg-[var(--flux-bg)] flex items-center justify-between gap-2 shrink-0 min-w-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 flex-1">
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
                className={`relative h-8 px-2.5 text-[12px] font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'text-[var(--flux-text)]'
                    : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                }`}
              >
                <span>{label}</span>
                {active && (
                  <motion.span
                    layoutId="console-active-tab"
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    aria-hidden="true"
                    className="absolute bottom-0 left-1 right-1 h-0.5 bg-[var(--flux-accent)]"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden md:inline font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
            Позиций ПЭ3: {bom.length} · Изделий: {totalDevicesInBom}
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
              <div className="px-3 py-1.5 border-b border-[var(--flux-line)] flex flex-wrap items-center justify-between gap-2 bg-[var(--flux-surface)]">
                <input
                  type="search"
                  value={bomQuery}
                  onChange={(e) => setBomQuery(e.target.value)}
                  placeholder="Фильтр спецификации (обозначение, артикул, завод)…"
                  aria-label="Фильтр спецификации ПЭ3"
                  className="w-72 max-w-full flex-1 min-w-[160px] h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[12px] text-[var(--flux-text)]"
                />
                <span className="text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)] shrink-0">
                  Показано позиций: {filteredBom.length} из {bom.length}
                </span>
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
                    {filteredBom.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-[12px] text-[var(--flux-text-muted)]">
                          <span>Позиции по фильтру не найдены. </span>
                          {bomQuery && (
                            <button
                              type="button"
                              onClick={() => setBomQuery('')}
                              className="text-[var(--flux-accent)] hover:underline ml-1"
                            >
                              Сбросить фильтр
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredBom.map((row) => (
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
                      ))
                    )}
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
                    className={`h-6 px-2.5 rounded text-[11px] font-medium transition-colors ${
                      cableSubTab === 'cables'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-text)]'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    Кабельный журнал ({cables.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCableSubTab('terminals')}
                    className={`h-6 px-2.5 rounded text-[11px] font-medium transition-colors ${
                      cableSubTab === 'terminals'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-text)]'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    Клеммник ({terminals.length})
                  </button>
                </div>
                <span className="text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)] shrink-0">
                  {cableSubTab === 'cables' ? `Кабельных трасс: ${cables.length}` : `Контактов XT: ${terminals.length}`}
                </span>
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
                      {cables.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-[12px] text-[var(--flux-text-muted)]">
                            Кабельные линии ещё не назначены в проекте.
                          </td>
                        </tr>
                      ) : (
                        cables.map((c) => (
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
                        ))
                      )}
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
                      {terminals.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-[12px] text-[var(--flux-text-muted)]">
                            Клеммные ряды (XT) отсутствуют на активных листах.
                          </td>
                        </tr>
                      ) : (
                        terminals.map((t, idx) => (
                          <tr key={`${t.terminalDesignation}-${t.pinName}-${idx}`} className="hover:bg-[var(--flux-hover)]">
                            <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{t.terminalDesignation}</td>
                            <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{t.pinName}</td>
                            <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{t.netName}</td>
                            <td className="px-3 py-1.5 font-mono text-[var(--flux-text-muted)]">{t.wireNumber}</td>
                            <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">{t.connectedTo}</td>
                            <td className="px-3 py-1.5 text-[var(--flux-text-muted)]">{t.cableInfo}</td>
                          </tr>
                        ))
                      )}
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
                </div>
              </div>
              <div className="flex-1 overflow-auto font-mono text-[11px] divide-y divide-[var(--flux-line)]">
                {filteredLogs.length === 0 ? (
                  <div className="px-3 py-6 text-center font-sans text-[12px] text-[var(--flux-text-muted)]">
                    <span>Записей по выбранным фильтрам нет. </span>
                    {(logLevelFilter !== 'ALL' || logQuery) && (
                      <button
                        type="button"
                        onClick={() => {
                          setLogLevelFilter('ALL');
                          setLogQuery('');
                        }}
                        className="text-[var(--flux-accent)] hover:underline ml-1"
                      >
                        Сбросить фильтры
                      </button>
                    )}
                  </div>
                ) : (
                  filteredLogs.map((entry) => {
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
                })
                )}
              </div>
            </>
          )}

          {activeTab === 'api' && (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden text-[12px]">
              {/* 3-Tier API Sub-Tabs */}
              <div className="px-3 py-1.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1 p-0.5 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)]">
                  <button
                    type="button"
                    data-testid="api-subtab-own"
                    onClick={() => setApiSubTab('own')}
                    className={`h-6 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1.5 ${
                      apiSubTab === 'own'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-text)] shadow-xs'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    <Terminal className="w-3 h-3 text-[var(--flux-accent)]" />
                    <span>Свой API (REST / OpenAPI)</span>
                  </button>
                  <button
                    type="button"
                    data-testid="api-subtab-flux"
                    onClick={() => setApiSubTab('flux-internal')}
                    className={`h-6 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1.5 ${
                      apiSubTab === 'flux-internal'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-text)] shadow-xs'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    <Layers className="w-3 h-3 text-[var(--flux-accent)]" />
                    <span>Внутри Flux Studio ({fluxBusMessages.length})</span>
                  </button>
                  <button
                    type="button"
                    data-testid="api-subtab-external"
                    onClick={() => setApiSubTab('external')}
                    className={`h-6 px-2.5 rounded text-[11px] font-medium inline-flex items-center gap-1.5 ${
                      apiSubTab === 'external'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-text)] shadow-xs'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    <Globe className="w-3 h-3 text-[var(--flux-accent)]" />
                    <span>Внешние программы (Webhooks)</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
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
              </div>

              {/* Sub-tab 1: Own REST / SSE / OpenAPI */}
              {apiSubTab === 'own' && (
                <div className="flex-1 overflow-auto p-3 grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-[var(--flux-text)]">
                        Собственные REST и SSE эндпоинты E3ProMax
                      </h3>
                      <button
                        type="button"
                        data-testid="load-openapi-btn"
                        onClick={async () => {
                          try {
                            const r = await fetch('/api/v1/openapi.json');
                            const data = await r.json();
                            setOpenApiPreview(JSON.stringify(data, null, 2));
                          } catch (err) {
                            setOpenApiPreview(String(err));
                          }
                        }}
                        className="h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] text-[var(--flux-accent)] font-medium shrink-0"
                      >
                        Загрузить OpenAPI 3.0
                      </button>
                    </div>
                    <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] font-mono text-[11px]">
                      {E3_API_ENDPOINTS.filter((ep) => ep.tier === 'own').map((ep) => (
                        <div key={`${ep.method}-${ep.path}`} className="px-2.5 py-1.5 flex items-start justify-between gap-2">
                          <span className="text-[var(--flux-accent)] break-all">
                            <span className="font-semibold">{ep.method}</span>{' '}
                            {ep.path.replace(':id', project.id)}
                          </span>
                          <span className="text-[var(--flux-text-muted)] text-right font-sans text-[11px]">
                            {ep.summary}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 min-w-0">
                    <h3 className="font-semibold text-[var(--flux-text)]">
                      {openApiPreview ? 'OpenAPI 3.0 Спецификация (/api/v1/openapi.json)' : 'Пример автоматизации (Штампы, Элементы, Пакет PDF/DXF)'}
                    </h3>
                    <pre className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)] overflow-auto max-h-56 leading-relaxed">
                      {openApiPreview ||
`# 1. Обновить штамп ГОСТ на всех листах
curl -X PATCH http://localhost:3000/api/v1/projects/${project.id}/sheets/sheet-1/stamp \\
  -H "Content-Type: application/json" \\
  -d '{"applyToAll":true,"patch":{"organization":"ООО ПромВентАвтоматика"}}'

# 2. Пакетная публикация в многостраничный PDF или AutoCAD DXF
curl -X POST http://localhost:3000/api/v1/projects/${project.id}/publish/dxf \\
  -H "Content-Type: application/json" \\
  -d '{"format":"dxf-single","editableBlocks":true}' -o project.dxf`}
                    </pre>
                    <p className="text-[11px] text-[var(--flux-text-muted)]">
                      Все изменения через REST API мгновенно транслируются подключённым сессиям CAD через EventSource и BroadcastChannel.
                    </p>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: Internal Flux Studio Apps Bus */}
              {apiSubTab === 'flux-internal' && (
                <div className="flex-1 overflow-auto p-3 grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                  <div className="space-y-2.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-[var(--flux-text)]">
                        Шина приложений внутри Flux Studio
                      </h3>
                      <span className="text-[11px] font-mono text-[var(--flux-accent)]">
                        {fluxHostStatus.hostedInFlux ? 'Flux Host Active' : 'Standalone + Relay'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {fluxHostStatus.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="px-2 py-0.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10px] text-[var(--flux-text)]"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                    <div className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">
                            Целевой модуль Flux
                          </label>
                          <select
                            value={fluxTargetApp}
                            onChange={(e) => setFluxTargetApp(e.target.value)}
                            className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
                          >
                            <option value="flux-hvac-selector">Подбор ОВКВ и ПЧ (flux-hvac-selector)</option>
                            <option value="flux-panel-3d">Компоновка шкафа 3D (flux-panel-3d)</option>
                            <option value="flux-cable-calc">Расчёт кабельных трасс (flux-cable-calc)</option>
                            <option value="e3promax-ecad">Обратный вызов E3ProMax API</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">
                            Команда RPC / Событие
                          </label>
                          <select
                            value={fluxAction}
                            onChange={(e) => setFluxAction(e.target.value)}
                            className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
                          >
                            <option value="e3.getBom">e3.getBom</option>
                            <option value="e3.runErc">e3.runErc</option>
                            <option value="e3.getBridgeBundle">e3.getBridgeBundle</option>
                            <option value="e3.getProject">e3.getProject</option>
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid="invoke-flux-bus-btn"
                        onClick={async () => {
                          const res = await invokeFluxModule(fluxTargetApp, fluxAction, {
                            projectId: project.id,
                          });
                          setFluxResultPreview(JSON.stringify(res, null, 2));
                          onFluxBusLog?.(
                            createFluxBusLogEntry(
                              'outbound',
                              res.via,
                              fluxAction,
                              'e3promax-ecad',
                              fluxTargetApp,
                              res.ok ? 'OK' : 'FAIL'
                            )
                          );
                        }}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white text-[11px] font-medium"
                      >
                        <Send className="w-3 h-3" />
                        <span>Выполнить обмен по шине Flux</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 min-w-0">
                    <h3 className="font-semibold text-[var(--flux-text)]">
                      Журнал вызовов Flux Studio ({fluxBusMessages.length})
                    </h3>
                    {fluxResultPreview && (
                      <pre className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10px] text-[var(--flux-text)] max-h-28 overflow-auto">
                        {fluxResultPreview}
                      </pre>
                    )}
                    <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] max-h-36 overflow-y-auto font-mono text-[10px]">
                      {fluxBusMessages.length === 0 ? (
                        <div className="p-2.5 text-[var(--flux-text-muted)] font-sans">
                          Сообщений шины Flux пока нет. Нажмите «Выполнить обмен по шине Flux» или отправьте событие из другого модуля.
                        </div>
                      ) : (
                        fluxBusMessages.map((msg) => (
                          <div key={msg.id} className="px-2 py-1 flex items-center justify-between gap-2">
                            <span className="truncate">
                              <span className="text-[var(--flux-accent)]">{msg.direction}</span> {msg.sourceApp} → {msg.targetApp} [{msg.action}]
                            </span>
                            <span className="text-[var(--flux-text-muted)] shrink-0">{msg.payloadSummary}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 3: External Programs API (Webhooks & Outbound REST Relay) */}
              {apiSubTab === 'external' && (
                <div className="flex-1 overflow-auto p-3 grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
                  <div className="space-y-2.5 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-[var(--flux-text)]">
                        Внешние Webhooks (1С, PDM, SCADA, AutoCAD)
                      </h3>
                      <button
                        type="button"
                        onClick={() => void loadWebhooks()}
                        className="h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] text-[var(--flux-text)]"
                      >
                        Обновить
                      </button>
                    </div>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const r = await fetch('/api/v1/integrations/webhooks', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: newWhName, url: newWhUrl, enabled: true }),
                        });
                        const data = await r.json();
                        if (!r.ok) {
                          setExtStatusMsg(data.error || 'Ошибка регистрации');
                        } else {
                          setExtStatusMsg(`Зарегистрирован Webhook: ${data.webhook?.name}`);
                          await loadWebhooks();
                        }
                      }}
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      <input
                        type="text"
                        value={newWhName}
                        onChange={(e) => setNewWhName(e.target.value)}
                        placeholder="Название системы"
                        aria-label="Название внешней системы"
                        className="w-36 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
                      />
                      <input
                        type="url"
                        value={newWhUrl}
                        onChange={(e) => setNewWhUrl(e.target.value)}
                        placeholder="https://erp.company.local/hook"
                        aria-label="URL внешнего Webhook"
                        className="flex-1 min-w-[160px] h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)]"
                      />
                      <button
                        type="submit"
                        data-testid="add-webhook-btn"
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white text-[11px] font-medium shrink-0"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Добавить</span>
                      </button>
                    </form>

                    <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] max-h-36 overflow-y-auto text-[11px]">
                      {webhooks.length === 0 ? (
                        <div className="p-2.5 text-[var(--flux-text-muted)]">
                          Внешние Webhook-подписки ещё не добавлены. Нажмите «Добавить» для проверки встроенного приёмника.
                        </div>
                      ) : (
                        webhooks.map((wh) => (
                          <div key={wh.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-medium text-[var(--flux-text)] truncate">{wh.name}</div>
                              <div className="font-mono text-[10px] text-[var(--flux-text-muted)] truncate">{wh.url}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {wh.lastStatus && (
                                <span className="font-mono text-[10px] text-[var(--flux-accent)]">{wh.lastStatus}</span>
                              )}
                              <button
                                type="button"
                                data-testid={`test-webhook-${wh.id}`}
                                onClick={async () => {
                                  const r = await fetch(`/api/v1/integrations/webhooks/${wh.id}/test`, { method: 'POST' });
                                  const d = await r.json();
                                  setExtStatusMsg(`Доставка "${wh.name}": HTTP ${d.status ?? 0} (${d.ok ? 'OK' : d.error})`);
                                  await loadWebhooks();
                                }}
                                className="h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[10px]"
                              >
                                Тест
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await fetch(`/api/v1/integrations/webhooks/${wh.id}`, { method: 'DELETE' });
                                  await loadWebhooks();
                                }}
                                aria-label={`Удалить ${wh.name}`}
                                className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5 min-w-0">
                    <h3 className="font-semibold text-[var(--flux-text)]">
                      Исходящий REST вызов во внешнее ПО + квитанции
                    </h3>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={extCallMethod}
                        onChange={(e) => setExtCallMethod(e.target.value as 'POST' | 'GET')}
                        className="h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px]"
                      >
                        <option value="POST">POST</option>
                        <option value="GET">GET</option>
                      </select>
                      <input
                        type="url"
                        value={extCallUrl}
                        onChange={(e) => setExtCallUrl(e.target.value)}
                        className="flex-1 min-w-0 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px]"
                      />
                      <button
                        type="button"
                        data-testid="external-call-btn"
                        onClick={async () => {
                          const r = await fetch('/api/v1/integrations/external-call', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              method: extCallMethod,
                              url: extCallUrl,
                              body: { projectCode: project.projectCode, bomCount: bom.length },
                            }),
                          });
                          const d = await r.json();
                          setExtStatusMsg(`Ответ HTTP ${d.status}: ${JSON.stringify(d.data).slice(0, 120)}`);
                          await loadWebhooks();
                        }}
                        className="h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium shrink-0"
                      >
                        Отправить ПЭ3
                      </button>
                    </div>
                    {extStatusMsg && (
                      <div className="px-2 py-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10px] text-[var(--flux-accent)]">
                        {extStatusMsg}
                      </div>
                    )}
                    <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] max-h-28 overflow-y-auto font-mono text-[10px]">
                      {recentReceipts.length === 0 ? (
                        <div className="p-2 text-[var(--flux-text-muted)] font-sans">
                          Квитанции доставки событий во внешние программы отсутствуют.
                        </div>
                      ) : (
                        recentReceipts.slice(-6).reverse().map((rc, idx) => (
                          <div key={idx} className="px-2 py-1 flex items-center justify-between gap-2">
                            <span className="text-[var(--flux-text)] truncate">{rc.event}</span>
                            <span className="text-[var(--flux-text-muted)] shrink-0">{rc.receivedAt.slice(11, 19)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
