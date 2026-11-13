import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Cable,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileSpreadsheet,
  Globe,
  GripHorizontal,
  Layers,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PictureInPicture2,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Send,
  ShieldCheck,
  Terminal,
  Trash2,
} from 'lucide-react';
import { E3_API_ENDPOINTS } from '../core/apiEcosystem';
import type { DockSide } from '../core/dockLayout';
import type {
  BomRow,
  CableJournalRow,
  E3Project,
  ErcIssue,
  ExternalWebhookConfig,
  FluxBusMessage,
  NetWireLengthRow,
  ProcessLogEntry,
  TerminalPlanRow,
} from '../core/e3Types';
import { createFluxBusLogEntry, detectFluxHost, invokeFluxModule } from '../core/fluxHostBridge';

export type ConsoleTab = 'bom' | 'cables' | 'erc' | 'logs' | 'api';
export type ApiSubTab = 'own' | 'flux-internal' | 'external';

interface BottomConsoleProps {
  project: E3Project;
  activeTab: ConsoleTab;
  collapsed: boolean;
  tabsPosition?: 'bottom' | 'top';
  requestedApiSubTab?: ApiSubTab | null;
  bom: BomRow[];
  cables: CableJournalRow[];
  netLengths?: NetWireLengthRow[];
  terminals: TerminalPlanRow[];
  erc: ErcIssue[];
  logs: ProcessLogEntry[];
  fluxBusMessages?: FluxBusMessage[];
  dockSide?: DockSide;
  onStartPanelDrag?: (e: React.PointerEvent) => void;
  onMovePanelDock?: (side: DockSide) => void;
  onFluxBusLog?: (entry: FluxBusMessage) => void;
  onSetTab: (tab: ConsoleTab) => void;
  onExpandPanel: () => void;
  onToggleCollapse: () => void;
  onJumpToIssue: (issue: ErcIssue) => void;
  onSelectDeviceByDesignation?: (designation: string) => void;
  onHighlightNet?: (netName: string) => void;
  onDownloadBomCsv?: () => void;
  onDownloadCablesCsv?: () => void;
  onDownloadNetLengthsCsv?: () => void;
  onOpenReportModal?: () => void;
  onOpenFluxPublishModal?: () => void;
  onClearLogs?: () => void;
  onTestApiSyncPush: () => Promise<void>;
}

export const BottomConsole: React.FC<BottomConsoleProps> = ({
  project,
  activeTab,
  collapsed,
  tabsPosition = 'bottom',
  requestedApiSubTab = null,
  bom,
  cables,
  netLengths = [],
  terminals,
  erc,
  logs,
  fluxBusMessages = [],
  dockSide = 'bottom',
  onStartPanelDrag,
  onMovePanelDock,
  onFluxBusLog,
  onSetTab,
  onExpandPanel,
  onToggleCollapse,
  onJumpToIssue,
  onSelectDeviceByDesignation,
  onHighlightNet,
  onDownloadBomCsv,
  onDownloadCablesCsv,
  onDownloadNetLengthsCsv,
  onOpenReportModal,
  onOpenFluxPublishModal,
  onClearLogs,
  onTestApiSyncPush,
}) => {
  const [bomQuery, setBomQuery] = useState('');
  const [cableSubTab, setCableSubTab] = useState<'cables' | 'nets' | 'terminals'>('cables');
  const [ercFilter, setErcFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [logLevelFilter, setLogLevelFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'SYNC'>('ALL');
  const [logQuery, setLogQuery] = useState('');
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [apiBusy, setApiBusy] = useState(false);

  // 3-Tier API Hub state
  const [apiSubTab, setApiSubTab] = useState<ApiSubTab>('own');
  const [openApiPreview, setOpenApiPreview] = useState<string | null>(null);
  const [fluxTargetApp, setFluxTargetApp] = useState('flux-hvac-selector');
  const [fluxAction, setFluxAction] = useState('e3.getBom');
  const [fluxResultPreview, setFluxResultPreview] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<ExternalWebhookConfig[]>([]);
  const [recentReceipts, setRecentReceipts] = useState<
    Array<{ receivedAt: string; event: string; payload: unknown }>
  >([]);
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

  useEffect(() => {
    if (requestedApiSubTab) {
      setApiSubTab(requestedApiSubTab);
    }
  }, [requestedApiSubTab]);

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

  const filteredErc = useMemo(() => {
    if (ercFilter === 'all') return erc;
    return erc.filter((i) => i.severity === ercFilter);
  }, [erc, ercFilter]);

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
  const totalCableMeters = useMemo(
    () => Math.round(cables.reduce((acc, c) => acc + (c.lengthMeters || 0), 0) * 10) / 10,
    [cables]
  );
  const totalNetLengthMm = useMemo(
    () => netLengths.reduce((acc, n) => acc + n.totalLengthMm, 0),
    [netLengths]
  );
  const totalNetLengthMeters = useMemo(
    () => Math.round((totalNetLengthMm / 1000) * 1000) / 1000,
    [totalNetLengthMm]
  );
  const totalNetWireCount = useMemo(
    () => netLengths.reduce((acc, n) => acc + n.wireCount, 0),
    [netLengths]
  );
  const errorCount = erc.filter((i) => i.severity === 'error').length;
  const warningCount = erc.filter((i) => i.severity === 'warning').length;

  const handleTabClick = (tabId: ConsoleTab) => {
    if (collapsed) {
      onSetTab(tabId);
      onExpandPanel();
      return;
    }
    if (activeTab === tabId) {
      onToggleCollapse();
      return;
    }
    onSetTab(tabId);
  };

  const dockBtnCls = (active: boolean) =>
    `inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
      active
        ? 'bg-[var(--flux-sel)] text-[var(--flux-accent)]'
        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
    }`;

  const tabs: Array<{
    id: ConsoleTab;
    label: string;
    count?: number | string;
    icon: React.ReactNode;
    alert?: boolean;
  }> = [
    {
      id: 'bom',
      label: 'Спецификация ПЭ3',
      count: bom.length,
      icon: <FileSpreadsheet className="w-3.5 h-3.5" />,
    },
    {
      id: 'cables',
      label: 'Кабели и клеммы',
      count: cables.length,
      icon: <Cable className="w-3.5 h-3.5" />,
    },
    {
      id: 'erc',
      label: 'Диагностика ERC',
      count: erc.length,
      icon:
        errorCount > 0 ? (
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
        ) : (
          <ShieldCheck className="w-3.5 h-3.5" />
        ),
      alert: errorCount > 0,
    },
    {
      id: 'logs',
      label: 'Логи процессов',
      count: logs.length,
      icon: <Terminal className="w-3.5 h-3.5" />,
    },
    {
      id: 'api',
      label: 'API и Синхронизация',
      icon: <Layers className="w-3.5 h-3.5" />,
    },
  ];

  const isBottomTabs = tabsPosition === 'bottom';

  const tabStripElement = (
    <div
      data-testid="console-tab-strip"
      onPointerDown={(e) => {
        if (!isBottomTabs || !onStartPanelDrag) return;
        if ((e.target as HTMLElement).closest('button')) return;
        onStartPanelDrag(e);
      }}
      onDoubleClick={(e) => {
        if (!isBottomTabs) return;
        if ((e.target as HTMLElement).closest('button')) return;
        onToggleCollapse();
      }}
      title={
        isBottomTabs
          ? 'Нажмите вкладку для открытия/переключения, перетащите свободную область для перемещения панели'
          : undefined
      }
      className={`group/tabstrip h-8 px-1.5 bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0 min-w-0 select-none ${
        isBottomTabs
          ? `border-t border-[var(--flux-line)] ${onStartPanelDrag ? 'cursor-grab active:cursor-grabbing' : ''}`
          : 'border-b border-[var(--flux-line)]'
      }`}
    >
      <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar min-w-0 flex-1 h-full">
        {isBottomTabs && onStartPanelDrag && (
          <span
            aria-hidden="true"
            className="hidden sm:inline-flex items-center justify-center px-1 text-[var(--flux-text-muted)]/55 group-hover/tabstrip:text-[var(--flux-text-muted)] shrink-0"
          >
            <GripHorizontal className="w-3.5 h-3.5" />
          </span>
        )}
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id && !collapsed;
          const isLastSelectedCollapsed = activeTab === tab.id && collapsed;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`console-tab-${tab.id}`}
              aria-pressed={isActive}
              onClick={() => handleTabClick(tab.id)}
              className={`relative h-full px-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium whitespace-nowrap shrink-0 transition-colors rounded-xs ${
                isActive
                  ? 'bg-[var(--flux-bg)] text-[var(--flux-text)] font-semibold'
                  : isLastSelectedCollapsed
                    ? 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                    : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="console-active-tab"
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  aria-hidden="true"
                  className={`absolute left-0.5 right-0.5 h-[2px] bg-[var(--flux-accent)] ${
                    isBottomTabs ? 'top-0' : 'bottom-0'
                  }`}
                />
              )}
              <span
                className={`shrink-0 ${
                  isActive
                    ? tab.alert
                      ? 'text-rose-500'
                      : 'text-[var(--flux-accent)]'
                    : ''
                }`}
              >
                {tab.icon}
              </span>
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`font-mono tabular-nums text-[10.5px] ${
                    tab.alert
                      ? 'text-rose-600 dark:text-rose-400 font-semibold'
                      : isActive
                        ? 'text-[var(--flux-text-muted)]'
                        : 'text-[var(--flux-text-muted)]/80'
                  }`}
                >
                  ({tab.count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden lg:inline font-mono tabular-nums text-[10.5px] text-[var(--flux-text-muted)]">
          ПЭ3: {bom.length} · Изд.: {totalDevicesInBom} · Цепей: {project.wires.length}
        </span>

        {isBottomTabs && onMovePanelDock && (
          <div className="hidden sm:flex items-center gap-0.5 opacity-65 group-hover/tabstrip:opacity-100 focus-within:opacity-100 transition-opacity duration-150 border-l border-[var(--flux-line)] pl-1.5">
            <button
              type="button"
              onClick={() => onMovePanelDock('left')}
              title="Закрепить слева"
              aria-label="Закрепить нижнюю панель слева"
              className={dockBtnCls(dockSide === 'left')}
            >
              <PanelLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMovePanelDock('bottom')}
              title="Закрепить снизу"
              aria-label="Закрепить нижнюю панель снизу"
              className={dockBtnCls(dockSide === 'bottom')}
            >
              <PanelBottom className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMovePanelDock('right')}
              title="Закрепить справа"
              aria-label="Закрепить нижнюю панель справа"
              className={dockBtnCls(dockSide === 'right')}
            >
              <PanelRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMovePanelDock('floating')}
              title="Открепить в плавающее окно"
              aria-label="Открепить нижнюю панель"
              className={dockBtnCls(dockSide === 'floating')}
            >
              <PictureInPicture2 className="w-3 h-3" />
            </button>
          </div>
        )}

        <button
          type="button"
          data-testid="console-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Развернуть нижнюю панель' : 'Свернуть нижнюю панель'}
          aria-label={collapsed ? 'Развернуть нижнюю панель' : 'Свернуть нижнюю панель'}
          className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
        >
          {isBottomTabs ? (
            collapsed ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )
          ) : (
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-150 ${collapsed ? 'rotate-180' : ''}`}
            />
          )}
        </button>
      </div>
    </div>
  );

  const bodyElement = (
    <AnimatePresence initial={false}>
      {!collapsed && (
        <motion.div
          key="console-drawer-body"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[var(--flux-bg)]"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              {/* TAB 1: BOM (Спецификация ПЭ3) */}
              {activeTab === 'bom' && (
                <>
                  <div className="h-8 px-2.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input
                        type="search"
                        value={bomQuery}
                        onChange={(e) => setBomQuery(e.target.value)}
                        placeholder="Поиск по ПЭ3 (позиция, артикул, завод)…"
                        aria-label="Фильтр спецификации ПЭ3"
                        className="w-72 max-w-full h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11.5px] text-[var(--flux-text)]"
                      />
                      <span className="hidden sm:inline text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap">
                        {filteredBom.length} из {bom.length} поз. · {totalDevicesInBom} шт.
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onDownloadBomCsv && (
                        <button
                          type="button"
                          onClick={onDownloadBomCsv}
                          title="Скачать таблицу спецификации ПЭ3 для Excel (.csv)"
                          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap"
                        >
                          <Download className="w-3 h-3 text-[var(--flux-text-muted)]" />
                          <span>CSV ПЭ3</span>
                        </button>
                      )}
                      {onOpenReportModal && (
                        <button
                          type="button"
                          onClick={onOpenReportModal}
                          title="Открыть печатную ведомость ГОСТ 2.701"
                          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap"
                        >
                          <Printer className="w-3 h-3 text-[var(--flux-text-muted)]" />
                          <span>Ведомость</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto bg-[var(--flux-surface)]">
                    <table className="w-full border-collapse text-[11.5px]">
                      <thead className="sticky top-0 z-10 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                        <tr>
                          <th className="text-left font-medium px-2.5 py-1 w-10 whitespace-nowrap">Поз.</th>
                          <th className="text-left font-medium px-2.5 py-1 w-32 whitespace-nowrap">Обозначение</th>
                          <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Наименование</th>
                          <th className="text-left font-medium px-2.5 py-1 w-40 whitespace-nowrap">Артикул</th>
                          <th className="text-left font-medium px-2.5 py-1 w-44 whitespace-nowrap">Производитель</th>
                          <th className="text-right font-medium px-2.5 py-1 w-20 whitespace-nowrap">Кол-во</th>
                          <th className="text-left font-medium px-2.5 py-1 w-14 whitespace-nowrap">Ед.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--flux-line)]">
                        {filteredBom.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-5 text-center text-[11.5px] text-[var(--flux-text-muted)]">
                              <span>Позиции по фильтру не найдены. </span>
                              {bomQuery && (
                                <button
                                  type="button"
                                  onClick={() => setBomQuery('')}
                                  className="text-[var(--flux-accent)] hover:underline ml-1"
                                >
                                  Сбросить
                                </button>
                              )}
                            </td>
                          </tr>
                        ) : (
                          filteredBom.map((row) => {
                            const firstDes = row.designations[0];
                            return (
                              <tr
                                key={`${row.pos}-${row.article}`}
                                onClick={() => firstDes && onSelectDeviceByDesignation?.(firstDes)}
                                title={
                                  firstDes && onSelectDeviceByDesignation
                                    ? `Показать ${firstDes} на схеме`
                                    : undefined
                                }
                                className={`hover:bg-[var(--flux-hover)] transition-colors ${
                                  firstDes && onSelectDeviceByDesignation ? 'cursor-pointer' : ''
                                }`}
                              >
                                <td className="px-2.5 py-1 font-mono tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap">
                                  {row.pos}
                                </td>
                                <td className="px-2.5 py-1 font-mono font-medium text-[var(--flux-text)] truncate max-w-[140px] whitespace-nowrap">
                                  {row.designationText}
                                </td>
                                <td className="px-2.5 py-1 text-[var(--flux-text)]">{row.componentName}</td>
                                <td className="px-2.5 py-1 font-mono text-[var(--flux-text)] whitespace-nowrap">
                                  {row.article}
                                </td>
                                <td className="px-2.5 py-1 text-[var(--flux-text-muted)] whitespace-nowrap">
                                  {row.manufacturer}
                                </td>
                                <td className="px-2.5 py-1 text-right font-mono tabular-nums font-medium text-[var(--flux-text)] whitespace-nowrap">
                                  {row.quantity}
                                </td>
                                <td className="px-2.5 py-1 text-[var(--flux-text-muted)] whitespace-nowrap">
                                  {row.unit}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* TAB 2: Cables & Terminals */}
              {activeTab === 'cables' && (
                <>
                  <div className="h-8 px-2.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-0.5 p-0.5 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)]">
                      <button
                        type="button"
                        data-testid="cable-subtab-cables"
                        onClick={() => setCableSubTab('cables')}
                        className={`relative h-5 px-2 rounded text-[11px] font-medium transition-colors ${
                          cableSubTab === 'cables'
                            ? 'text-[var(--flux-text)]'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                        }`}
                      >
                        {cableSubTab === 'cables' && (
                          <motion.span
                            layoutId="console-cable-subtab"
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xs bg-[var(--flux-surface)] border border-[var(--flux-line)]"
                          />
                        )}
                        <span className="relative z-10">Кабельный журнал ({cables.length})</span>
                      </button>
                      <button
                        type="button"
                        data-testid="cable-subtab-nets"
                        onClick={() => setCableSubTab('nets')}
                        className={`relative h-5 px-2 rounded text-[11px] font-medium transition-colors ${
                          cableSubTab === 'nets'
                            ? 'text-[var(--flux-text)]'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                        }`}
                      >
                        {cableSubTab === 'nets' && (
                          <motion.span
                            layoutId="console-cable-subtab"
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xs bg-[var(--flux-surface)] border border-[var(--flux-line)]"
                          />
                        )}
                        <span className="relative z-10">Длины по цепям ({netLengths.length})</span>
                      </button>
                      <button
                        type="button"
                        data-testid="cable-subtab-terminals"
                        onClick={() => setCableSubTab('terminals')}
                        className={`relative h-5 px-2 rounded text-[11px] font-medium transition-colors ${
                          cableSubTab === 'terminals'
                            ? 'text-[var(--flux-text)]'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                        }`}
                      >
                        {cableSubTab === 'terminals' && (
                          <motion.span
                            layoutId="console-cable-subtab"
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xs bg-[var(--flux-surface)] border border-[var(--flux-line)]"
                          />
                        )}
                        <span className="relative z-10">Клеммник XT ({terminals.length})</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden sm:inline text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                        {cableSubTab === 'cables'
                          ? `Трасс: ${cables.length} · Кабели: ${totalCableMeters} м · Цепи (${netLengths.length}): ${totalNetLengthMm} мм (${totalNetLengthMeters} м)`
                          : cableSubTab === 'nets'
                            ? `Цепей: ${netLengths.length} · Проводов: ${totalNetWireCount} · Сумм. длина: ${totalNetLengthMm} мм (${totalNetLengthMeters} м)`
                            : `Клеммных соединений: ${terminals.length}`}
                      </span>
                      {(cableSubTab === 'cables' || cableSubTab === 'nets') && onDownloadNetLengthsCsv && (
                        <button
                          type="button"
                          data-testid="download-net-lengths-csv-btn"
                          onClick={onDownloadNetLengthsCsv}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap"
                        >
                          <Download className="w-3 h-3 text-[var(--flux-text-muted)]" />
                          <span>CSV Цепи</span>
                        </button>
                      )}
                      {onDownloadCablesCsv && cableSubTab !== 'nets' && (
                        <button
                          type="button"
                          onClick={onDownloadCablesCsv}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap"
                        >
                          <Download className="w-3 h-3 text-[var(--flux-text-muted)]" />
                          <span>CSV Кабели</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto bg-[var(--flux-surface)]">
                    {cableSubTab !== 'terminals' ? (
                      <div className="flex flex-col divide-y divide-[var(--flux-line)]">
                        {cableSubTab === 'cables' && (
                          <table data-testid="cables-journal-table" className="w-full border-collapse text-[11.5px]">
                            <thead className="sticky top-0 z-10 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                              <tr>
                                <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Кабель</th>
                                <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Марка кабеля</th>
                                <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Откуда</th>
                                <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Куда</th>
                                <th className="text-right font-medium px-2.5 py-1 whitespace-nowrap">Жилы</th>
                                <th className="text-right font-medium px-2.5 py-1 whitespace-nowrap">Сечение</th>
                                <th className="text-right font-medium px-2.5 py-1 whitespace-nowrap">Длина, м</th>
                                <th className="text-right font-medium px-2.5 py-1 whitespace-nowrap">По схеме (цепи), мм</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--flux-line)]">
                              {cables.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="px-3 py-5 text-center text-[11.5px] text-[var(--flux-text-muted)]">
                                    Кабельные линии ещё не назначены в проекте.
                                  </td>
                                </tr>
                              ) : (
                                cables.map((c) => (
                                  <tr key={c.designation} className="hover:bg-[var(--flux-hover)]">
                                    <td className="px-2.5 py-1 font-mono font-medium text-[var(--flux-text)] whitespace-nowrap">
                                      {c.designation}
                                    </td>
                                    <td className="px-2.5 py-1 text-[var(--flux-text)] whitespace-nowrap">
                                      {c.cableType}{' '}
                                      {c.shielded && (
                                        <span className="text-[10.5px] text-[var(--flux-accent)]">(экран)</span>
                                      )}
                                    </td>
                                    <td className="px-2.5 py-1 font-mono text-[var(--flux-text)] whitespace-nowrap">{c.fromDevice}</td>
                                    <td className="px-2.5 py-1 font-mono text-[var(--flux-text)] whitespace-nowrap">{c.toDevice}</td>
                                    <td className="px-2.5 py-1 text-right font-mono tabular-nums text-[var(--flux-text)] whitespace-nowrap">
                                      {c.usedCores}/{c.coresCount}
                                    </td>
                                    <td className="px-2.5 py-1 text-right font-mono tabular-nums text-[var(--flux-text)] whitespace-nowrap">
                                      {c.crossSection}
                                    </td>
                                    <td className="px-2.5 py-1 text-right font-mono tabular-nums font-medium text-[var(--flux-text)] whitespace-nowrap">
                                      {c.lengthMeters}
                                    </td>
                                    <td className="px-2.5 py-1 text-right font-mono tabular-nums text-[var(--flux-text)]">
                                      <div className="font-medium whitespace-nowrap">{c.wireLengthMm ?? 0}</div>
                                      {c.netLengths && c.netLengths.length > 0 && (
                                        <div className="text-[10px] text-[var(--flux-text-muted)] whitespace-nowrap">
                                          {c.netLengths.map((nl) => `${nl.netName}: ${nl.lengthMm}`).join(' · ')}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        )}

                        <div className="bg-[var(--flux-surface)]">
                          <div className="px-2.5 py-1.5 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                              Суммарная длина проводов по цепям (E3-CORE)
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                              Цепей: {netLengths.length} · Проводов: {totalNetWireCount} · Итого: {totalNetLengthMm} мм ({totalNetLengthMeters} м)
                            </span>
                          </div>
                          <table data-testid="net-wire-lengths-table" className="w-full border-collapse text-[11.5px]">
                            <thead className="sticky top-0 z-10 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                              <tr>
                                <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Цепь</th>
                                <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Тип сигнала</th>
                                <th className="text-right font-medium px-2.5 py-1 whitespace-nowrap">Участков</th>
                                <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Провода</th>
                                <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Кабели</th>
                                <th className="text-right font-medium px-2.5 py-1 whitespace-nowrap">Сечения</th>
                                <th className="text-right font-medium px-2.5 py-1 whitespace-nowrap">Длина, мм</th>
                                <th className="text-right font-medium px-2.5 py-1 whitespace-nowrap">Длина, м</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--flux-line)]">
                              {netLengths.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="px-3 py-4 text-center text-[11.5px] text-[var(--flux-text-muted)]">
                                    Соединительные провода отсутствуют в проекте.
                                  </td>
                                </tr>
                              ) : (
                                netLengths.map((n) => {
                                  const sigColor = project.visualSettings.netColors[n.signalType] || '#64748b';
                                  const sigLabel =
                                    n.signalType === 'power'
                                      ? 'Силовая'
                                      : n.signalType === 'neutral'
                                        ? 'Нейтраль N'
                                        : n.signalType === 'pe'
                                          ? 'Заземление PE'
                                          : n.signalType === 'dc24'
                                            ? '+24V DC'
                                            : n.signalType === 'dc0'
                                              ? '0V DC'
                                              : n.signalType === 'bus'
                                                ? 'Шина / RS-485'
                                                : 'Сигнал / Упр.';
                                  return (
                                    <tr
                                      key={`${n.netName}-${n.signalType}`}
                                      data-testid={`net-row-${n.netName}`}
                                      title="Нажмите, чтобы подсветить весь потенциал цепи на схеме"
                                      onClick={() => onHighlightNet?.(n.netName)}
                                      className="hover:bg-[var(--flux-hover)] cursor-pointer transition-colors"
                                    >
                                      <td className="px-2.5 py-1 font-mono font-medium text-[var(--flux-text)] whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1.5">
                                          <span
                                            className="inline-block w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: sigColor }}
                                          />
                                          <span>{n.netName}</span>
                                        </span>
                                      </td>
                                      <td className="px-2.5 py-1 text-[var(--flux-text-muted)] whitespace-nowrap">
                                        {sigLabel}
                                      </td>
                                      <td className="px-2.5 py-1 text-right font-mono tabular-nums text-[var(--flux-text)] whitespace-nowrap">
                                        {n.wireCount}
                                      </td>
                                      <td className="px-2.5 py-1 font-mono text-[var(--flux-text-muted)]">
                                        {n.wireNumbers.join(', ') || '—'}
                                      </td>
                                      <td className="px-2.5 py-1 font-mono text-[var(--flux-text-muted)] whitespace-nowrap">
                                        {n.cableDesignations.join(', ') || '—'}
                                      </td>
                                      <td className="px-2.5 py-1 text-right font-mono tabular-nums text-[var(--flux-text)] whitespace-nowrap">
                                        {n.crossSections.join(', ') || '—'}
                                      </td>
                                      <td className="px-2.5 py-1 text-right font-mono tabular-nums font-medium text-[var(--flux-text)] whitespace-nowrap">
                                        {n.totalLengthMm}
                                      </td>
                                      <td className="px-2.5 py-1 text-right font-mono tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap">
                                        {n.totalLengthMeters.toFixed(3)}
                                      </td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <table className="w-full border-collapse text-[11.5px]">
                        <thead className="sticky top-0 z-10 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                          <tr>
                            <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Клеммник</th>
                            <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Контакт</th>
                            <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Цепь</th>
                            <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Провод</th>
                            <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Куда подключено</th>
                            <th className="text-left font-medium px-2.5 py-1 whitespace-nowrap">Кабель / Жила</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--flux-line)]">
                          {terminals.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-5 text-center text-[11.5px] text-[var(--flux-text-muted)]">
                                Клеммные ряды (XT) отсутствуют на активных листах.
                              </td>
                            </tr>
                          ) : (
                            terminals.map((t, idx) => (
                              <tr
                                key={`${t.terminalDesignation}-${t.pinName}-${idx}`}
                                className="hover:bg-[var(--flux-hover)]"
                              >
                                <td className="px-2.5 py-1 font-mono font-medium text-[var(--flux-text)]">
                                  {t.terminalDesignation}
                                </td>
                                <td className="px-2.5 py-1 font-mono text-[var(--flux-text)]">{t.pinName}</td>
                                <td className="px-2.5 py-1 font-mono text-[var(--flux-text)]">{t.netName}</td>
                                <td className="px-2.5 py-1 font-mono text-[var(--flux-text-muted)]">
                                  {t.wireNumber}
                                </td>
                                <td className="px-2.5 py-1 font-mono text-[var(--flux-text)]">{t.connectedTo}</td>
                                <td className="px-2.5 py-1 text-[var(--flux-text-muted)]">{t.cableInfo}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}

              {/* TAB 3: ERC Diagnostics */}
              {activeTab === 'erc' && (
                <>
                  <div className="h-8 px-2.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      {(
                        [
                          ['all', `Все (${erc.length})`],
                          ['error', `Ошибки (${errorCount})`],
                          ['warning', `Предупреждения (${warningCount})`],
                        ] as const
                      ).map(([fId, label]) => (
                        <button
                          key={fId}
                          type="button"
                          onClick={() => setErcFilter(fId)}
                          className={`h-6 px-2 rounded text-[11px] font-medium transition-colors ${
                            ercFilter === fId
                              ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                              : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)]'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <span
                      className={`text-[11px] font-mono ${
                        errorCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--flux-accent)]'
                      }`}
                    >
                      {errorCount > 0
                        ? `Критических ошибок: ${errorCount}`
                        : 'Критических ошибок ERC не выявлено'}
                    </span>
                  </div>
                  <div className="flex-1 overflow-auto bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)]">
                    {filteredErc.length === 0 ? (
                      <div className="px-3 py-5 flex items-center gap-2 text-[11.5px] text-[var(--flux-text-muted)]">
                        <CheckCircle2 className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
                        <span>
                          {erc.length === 0
                            ? 'Проверка электрических правил (ERC) пройдена успешно. Схема готова к выпуску ПЭ3 и передаче во Flux / E³.series.'
                            : 'Замечаний выбранной категории нет.'}
                        </span>
                      </div>
                    ) : (
                      filteredErc.map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          onClick={() => onJumpToIssue(issue)}
                          className="w-full px-2.5 py-1.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--flux-hover)] transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                issue.severity === 'error'
                                  ? 'bg-rose-500'
                                  : issue.severity === 'warning'
                                    ? 'bg-amber-500'
                                    : 'bg-sky-500'
                              }`}
                            />
                            <span className="font-mono text-[10.5px] text-[var(--flux-text-muted)] shrink-0">
                              {issue.code}
                            </span>
                            <span className="text-[11.5px] text-[var(--flux-text)] truncate">
                              {issue.message}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium text-[var(--flux-accent)] shrink-0">
                            Перейти →
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}

              {/* TAB 4: Process Logs */}
              {activeTab === 'logs' && (
                <>
                  <div className="h-8 px-2.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-1 min-w-0">
                      {(['ALL', 'INFO', 'SYNC', 'WARN', 'ERROR'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setLogLevelFilter(lvl)}
                          className={`h-6 px-1.5 rounded text-[10.5px] font-mono transition-colors ${
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
                        placeholder="Поиск по логам…"
                        aria-label="Поиск по логам процессов"
                        className="w-44 h-6 px-2 ml-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyAllLogs}
                        className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)]"
                      >
                        {copiedLogs ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3 text-[var(--flux-text-muted)]" />
                        )}
                        <span>{copiedLogs ? 'Скопировано' : 'Копировать'}</span>
                      </button>
                      {onClearLogs && logs.length > 0 && (
                        <button
                          type="button"
                          onClick={onClearLogs}
                          title="Очистить журнал сессии"
                          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] text-[var(--flux-text-muted)] hover:text-rose-600 dark:hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Очистить</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto bg-[var(--flux-surface)] font-mono text-[11px] divide-y divide-[var(--flux-line)]">
                    {filteredLogs.length === 0 ? (
                      <div className="px-3 py-5 text-center font-sans text-[11.5px] text-[var(--flux-text-muted)]">
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
                            Сбросить
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredLogs.map((entry) => {
                        const hasDetails = Boolean(entry.details && entry.details.trim().length > 0);
                        const isExpanded = Boolean(
                          expandedLogIds[entry.id] || (hasDetails && entry.level === 'ERROR')
                        );
                        return (
                          <div key={entry.id} className="px-2.5 py-1 hover:bg-[var(--flux-hover)]">
                            <div className="flex items-start gap-2">
                              <span className="text-[var(--flux-text-muted)] tabular-nums shrink-0">
                                {entry.timestamp.slice(11, 23)}
                              </span>
                              <span
                                className={`w-10 shrink-0 font-medium ${
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
                              <span className="w-22 shrink-0 text-[var(--flux-text-muted)] truncate">
                                [{entry.subsystem}]
                              </span>
                              <span className="flex-1 text-[var(--flux-text)] break-words">
                                {entry.message}
                              </span>
                              {hasDetails && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedLogIds((prev) => ({ ...prev, [entry.id]: !isExpanded }))
                                  }
                                  className="text-[10.5px] text-[var(--flux-accent)] hover:underline shrink-0"
                                >
                                  {isExpanded ? 'Скрыть' : 'Детали'}
                                </button>
                              )}
                              {entry.durationMs !== undefined && (
                                <span className="tabular-nums text-[var(--flux-text-muted)] shrink-0">
                                  {entry.durationMs.toFixed(1)} мс
                                </span>
                              )}
                            </div>
                            {hasDetails && isExpanded && (
                              <pre className="mt-1 ml-32 p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[10.5px] text-[var(--flux-text-muted)] whitespace-pre-wrap overflow-x-auto max-h-36">
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

              {/* TAB 5: 3-Tier API & Flux Synchronization */}
              {activeTab === 'api' && (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden text-[11.5px] bg-[var(--flux-surface)]">
                  <div className="h-8 px-2.5 border-b border-[var(--flux-line)] flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-0.5 p-0.5 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)]">
                      <button
                        type="button"
                        data-testid="api-subtab-own"
                        onClick={() => setApiSubTab('own')}
                        className={`relative h-5 px-2 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                          apiSubTab === 'own'
                            ? 'text-[var(--flux-text)]'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                        }`}
                      >
                        {apiSubTab === 'own' && (
                          <motion.span
                            layoutId="console-api-subtab"
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xs bg-[var(--flux-surface)] border border-[var(--flux-line)]"
                          />
                        )}
                        <Terminal
                          className={`relative z-10 w-3 h-3 ${
                            apiSubTab === 'own' ? 'text-[var(--flux-accent)]' : ''
                          }`}
                        />
                        <span className="relative z-10">Свой API (REST)</span>
                      </button>
                      <button
                        type="button"
                        data-testid="api-subtab-flux"
                        onClick={() => setApiSubTab('flux-internal')}
                        className={`relative h-5 px-2 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                          apiSubTab === 'flux-internal'
                            ? 'text-[var(--flux-text)]'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                        }`}
                      >
                        {apiSubTab === 'flux-internal' && (
                          <motion.span
                            layoutId="console-api-subtab"
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xs bg-[var(--flux-surface)] border border-[var(--flux-line)]"
                          />
                        )}
                        <Layers
                          className={`relative z-10 w-3 h-3 ${
                            apiSubTab === 'flux-internal' ? 'text-[var(--flux-accent)]' : ''
                          }`}
                        />
                        <span className="relative z-10">
                          Шина Flux Studio ({fluxBusMessages.length})
                        </span>
                      </button>
                      <button
                        type="button"
                        data-testid="api-subtab-external"
                        onClick={() => setApiSubTab('external')}
                        className={`relative h-5 px-2 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
                          apiSubTab === 'external'
                            ? 'text-[var(--flux-text)]'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                        }`}
                      >
                        {apiSubTab === 'external' && (
                          <motion.span
                            layoutId="console-api-subtab"
                            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                            aria-hidden="true"
                            className="absolute inset-0 rounded-xs bg-[var(--flux-surface)] border border-[var(--flux-line)]"
                          />
                        )}
                        <Globe
                          className={`relative z-10 w-3 h-3 ${
                            apiSubTab === 'external' ? 'text-[var(--flux-accent)]' : ''
                          }`}
                        />
                        <span className="relative z-10">Внешние Webhooks</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onOpenFluxPublishModal && (
                        <button
                          type="button"
                          onClick={onOpenFluxPublishModal}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap"
                        >
                          <span>Студия Flux</span>
                        </button>
                      )}
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
                        className="inline-flex items-center gap-1 h-6 px-2.5 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[11px] font-medium disabled:opacity-50 whitespace-nowrap"
                      >
                        {apiBusy ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        <span>Тест API Push</span>
                      </button>
                    </div>
                  </div>

                  {apiSubTab === 'own' && (
                    <div className="flex-1 overflow-auto p-2.5 grid grid-cols-1 lg:grid-cols-2 gap-3 min-w-0">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--flux-text)]">
                            Эндпоинты E3ProMax REST / SSE
                          </span>
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
                            className="h-5 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[10.5px] text-[var(--flux-accent)] font-medium shrink-0"
                          >
                            OpenAPI 3.0
                          </button>
                        </div>
                        <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] font-mono text-[10.5px]">
                          {E3_API_ENDPOINTS.filter((ep) => ep.tier === 'own').map((ep) => (
                            <div
                              key={`${ep.method}-${ep.path}`}
                              className="px-2 py-1 flex items-center justify-between gap-2"
                            >
                              <span className="text-[var(--flux-accent)] truncate">
                                <span className="font-semibold">{ep.method}</span>{' '}
                                {ep.path.replace(':id', project.id)}
                              </span>
                              <span className="text-[var(--flux-text-muted)] text-right font-sans truncate max-w-[46%]">
                                {ep.summary}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <span className="font-semibold text-[var(--flux-text)] block">
                          {openApiPreview
                            ? 'OpenAPI 3.0 (/api/v1/openapi.json)'
                            : 'Автоматизация штампов, ПЭ3 и публикации DXF/PDF'}
                        </span>
                        <pre className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10.5px] text-[var(--flux-text)] overflow-auto max-h-40 leading-relaxed">
                          {openApiPreview ||
                            `curl -X PATCH http://localhost:3000/api/v1/projects/${project.id}/sheets/sheet-1/stamp \\
  -H "Content-Type: application/json" \\
  -d '{"applyToAll":true,"patch":{"organization":"ООО ПромВентАвтоматика"}}'`}
                        </pre>
                      </div>
                    </div>
                  )}

                  {apiSubTab === 'flux-internal' && (
                    <div className="flex-1 overflow-auto p-2.5 grid grid-cols-1 lg:grid-cols-2 gap-3 min-w-0">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--flux-text)]">
                            Шина модулей Flux Studio (Ключ: {project.fluxProjectKey})
                          </span>
                          <span className="text-[10.5px] font-mono text-[var(--flux-accent)]">
                            {fluxHostStatus.hostedInFlux ? 'Flux Host Active' : 'Standalone + Relay'}
                          </span>
                        </div>
                        <div className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={fluxTargetApp}
                              onChange={(e) => setFluxTargetApp(e.target.value)}
                              aria-label="Целевой модуль Flux"
                              className="h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
                            >
                              <option value="flux-hvac-selector">Подбор ОВКВ (flux-hvac-selector)</option>
                              <option value="flux-panel-3d">Компоновка 3D (flux-panel-3d)</option>
                              <option value="flux-cable-calc">Расчёт кабелей (flux-cable-calc)</option>
                              <option value="e3promax-ecad">E3ProMax API</option>
                            </select>
                            <select
                              value={fluxAction}
                              onChange={(e) => setFluxAction(e.target.value)}
                              aria-label="Команда RPC Flux"
                              className="h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
                            >
                              <option value="e3.getBom">e3.getBom</option>
                              <option value="e3.runErc">e3.runErc</option>
                              <option value="e3.getBridgeBundle">e3.getBridgeBundle</option>
                              <option value="e3.getProject">e3.getProject</option>
                            </select>
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
                            className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[11px] font-medium"
                          >
                            <Send className="w-3 h-3" />
                            <span>Выполнить обмен по шине Flux</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <span className="font-semibold text-[var(--flux-text)] block">
                          Журнал вызовов Flux Studio ({fluxBusMessages.length})
                        </span>
                        {fluxResultPreview && (
                          <pre className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10px] text-[var(--flux-text)] max-h-24 overflow-auto">
                            {fluxResultPreview}
                          </pre>
                        )}
                        <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] max-h-28 overflow-y-auto font-mono text-[10px]">
                          {fluxBusMessages.length === 0 ? (
                            <div className="p-2 text-[var(--flux-text-muted)] font-sans">
                              Сообщений шины Flux пока нет. Нажмите «Выполнить обмен по шине Flux».
                            </div>
                          ) : (
                            fluxBusMessages.map((msg) => (
                              <div key={msg.id} className="px-2 py-1 flex items-center justify-between gap-2">
                                <span className="truncate">
                                  <span className="text-[var(--flux-accent)]">{msg.direction}</span>{' '}
                                  {msg.sourceApp} → {msg.targetApp} [{msg.action}]
                                </span>
                                <span className="text-[var(--flux-text-muted)] shrink-0">
                                  {msg.payloadSummary}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {apiSubTab === 'external' && (
                    <div className="flex-1 overflow-auto p-2.5 grid grid-cols-1 lg:grid-cols-2 gap-3 min-w-0">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--flux-text)]">
                            Внешние Webhooks (1С, PDM, SCADA)
                          </span>
                          <button
                            type="button"
                            onClick={() => void loadWebhooks()}
                            className="h-5 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[10.5px] text-[var(--flux-text)]"
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
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={newWhName}
                            onChange={(e) => setNewWhName(e.target.value)}
                            aria-label="Название внешней системы"
                            className="w-32 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
                          />
                          <input
                            type="url"
                            value={newWhUrl}
                            onChange={(e) => setNewWhUrl(e.target.value)}
                            aria-label="URL внешнего Webhook"
                            className="flex-1 min-w-[120px] h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10.5px] text-[var(--flux-text)]"
                          />
                          <button
                            type="submit"
                            data-testid="add-webhook-btn"
                            className="inline-flex items-center gap-1 h-6 px-2 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[10.5px] font-medium shrink-0"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Добавить</span>
                          </button>
                        </form>
                        <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] max-h-24 overflow-y-auto text-[10.5px]">
                          {webhooks.length === 0 ? (
                            <div className="p-2 text-[var(--flux-text-muted)]">
                              Подписки пока не добавлены.
                            </div>
                          ) : (
                            webhooks.map((wh) => (
                              <div key={wh.id} className="px-2 py-1 flex items-center justify-between gap-2">
                                <span className="truncate font-medium text-[var(--flux-text)]">{wh.name}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    data-testid={`test-webhook-${wh.id}`}
                                    onClick={async () => {
                                      const r = await fetch(`/api/v1/integrations/webhooks/${wh.id}/test`, {
                                        method: 'POST',
                                      });
                                      const d = await r.json();
                                      setExtStatusMsg(
                                        `Доставка "${wh.name}": HTTP ${d.status ?? 0} (${d.ok ? 'OK' : d.error})`
                                      );
                                      await loadWebhooks();
                                    }}
                                    className="h-5 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[10px]"
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
                                    className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <span className="font-semibold text-[var(--flux-text)] block">
                          Исходящий REST вызов и квитанции
                        </span>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={extCallMethod}
                            onChange={(e) => setExtCallMethod(e.target.value as 'POST' | 'GET')}
                            className="h-6 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10.5px]"
                          >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                          </select>
                          <input
                            type="url"
                            value={extCallUrl}
                            onChange={(e) => setExtCallUrl(e.target.value)}
                            className="flex-1 min-w-0 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10.5px]"
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
                              setExtStatusMsg(`HTTP ${d.status}: ${JSON.stringify(d.data).slice(0, 100)}`);
                              await loadWebhooks();
                            }}
                            className="h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[10.5px] font-medium shrink-0"
                          >
                            Отправить ПЭ3
                          </button>
                        </div>
                        {extStatusMsg && (
                          <div className="px-2 py-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10px] text-[var(--flux-accent)] truncate">
                            {extStatusMsg}
                          </div>
                        )}
                        <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-bg)] divide-y divide-[var(--flux-line)] max-h-20 overflow-y-auto font-mono text-[10px]">
                          {recentReceipts.length === 0 ? (
                            <div className="p-2 text-[var(--flux-text-muted)] font-sans">
                              Квитанции доставки отсутствуют.
                            </div>
                          ) : (
                            recentReceipts
                              .slice(-5)
                              .reverse()
                              .map((rc, idx) => (
                                <div key={idx} className="px-2 py-1 flex items-center justify-between gap-2">
                                  <span className="text-[var(--flux-text)] truncate">{rc.event}</span>
                                  <span className="text-[var(--flux-text-muted)] shrink-0">
                                    {rc.receivedAt.slice(11, 19)}
                                  </span>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <section
      aria-label="Спецификации, отчёты, диагностика и API"
      data-testid="bottom-console"
      className="no-print w-full max-w-full h-full flex-1 min-w-0 min-h-0 bg-[var(--flux-surface)] flex flex-col overflow-hidden"
    >
      {isBottomTabs ? (
        <>
          {bodyElement}
          {tabStripElement}
        </>
      ) : (
        <>
          {tabStripElement}
          {bodyElement}
        </>
      )}
    </section>
  );
};
