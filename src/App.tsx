import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { BottomConsole, type ApiSubTab, type ConsoleTab } from './components/BottomConsole';
import { CatalogItemModal } from './components/CatalogItemModal';
import {
  type ActivePanelDrag,
  CAD_PANEL_TRANSITION,
  COLLAPSED_BOTTOM_TABS_HEIGHT,
  COLLAPSED_HEADER_HEIGHT,
  COLLAPSED_SIDE_RAIL_WIDTH,
  DockDropOverlay,
  DockResizeHandle,
  DockablePanelFrame,
  FloatingPanelWindow,
  resolveDropTarget,
} from './components/DockablePanel';
import { FluxStudioPublishModal } from './components/FluxStudioPublishModal';
import { HvacWizardModal } from './components/HvacWizardModal';
import { LeftExplorer } from './components/LeftExplorer';
import {
  type E3BridgeStatusInfo,
  ExchangeModal,
  ReportModal,
  VisualSettingsModal,
} from './components/Modals';
import { PortableBuildModal } from './components/PortableBuildModal';
import { PublishModal } from './components/PublishModal';
import { RightInspector } from './components/RightInspector';
import { SchematicCanvas } from './components/SchematicCanvas';
import { StampEditorModal, type StampModalMode } from './components/StampEditorModal';
import { type CadTool, TopToolbar } from './components/TopToolbar';
import {
  clampDockLayoutToViewport,
  type DockEdge,
  type DockLayoutState,
  type DockSide,
  type PanelConfig,
  type PanelId,
  type ViewportLayoutMode,
  computeViewportSheets,
  createDefaultDockLayout,
  deleteSheetFromProject,
  duplicateSheetInProject,
  getPanelsByDock,
  loadDockLayout,
  movePanelDock,
  resizeDockEdge,
  saveDockLayout,
  togglePanelCollapse,
  updateFloatingRect,
  viewportCountForMode,
} from './core/dockLayout';
import {
  CAD_LAYER_DEFS,
  isLayerLocked,
  resolveCadLayers,
  setAllLayersLocked,
  setAllLayersVisible,
  toggleLayerLock,
  toggleLayerVisibility,
} from './core/cadLayers';
import {
  alignSelectedDevices,
  buildClipboardPayload,
  type CadClipboardPayload,
  type DeviceAlignKind,
  pasteClipboardPayload,
  toggleIdInSelection,
} from './core/cadSelection';
import {
  deviceToCatalogItem,
  loadCustomCatalog,
  mergeCatalogItems,
  saveCustomCatalog,
  SHEET_DIMENSIONS,
} from './core/e3Catalog';
import {
  autoRouteOrthogonal,
  buildBom,
  buildCableJournal,
  buildNetWireLengths,
  buildTerminalPlan,
  exportBomCsv,
  exportCableJournalCsv,
  exportNetWireLengthsCsv,
  extractWireSegments,
  generateStressBatch,
  getAbsolutePinPos,
  getDeviceBounds,
  getSheetDrawableBounds,
  importFromFluxBridge,
  nextUniqueDesignation,
  rerouteAttachedWires,
  routeSheetWiresCleanly,
  runErc,
} from './core/e3Engine';
import { createSeedProject } from './core/e3Seed';
import {
  createOffPageConnectorDevice,
  getOffPageMeta,
  type PotentialTraceResult,
  resolveOffPageLinks,
  traceConnectedPotential,
} from './core/crossSheetRefs';
import {
  applyAutoWireBreak,
  findWireBreakCandidate,
  isTwoPinBreakEligible,
  type WirePoint,
} from './core/wireEditing';
import type {
  AnnotationKind,
  BatchPublishOptions,
  BomRow,
  CableJournalRow,
  CadLayerId,
  CatalogItem,
  E3Annotation,
  E3Device,
  E3Project,
  E3Sheet,
  E3TitleBlock,
  E3VisualSettings,
  E3Wire,
  ErcIssue,
  FluxBridgeBundle,
  FluxBusMessage,
  GostStampTemplate,
  NetWireLengthRow,
  OffPageRefMeta,
  ProcessLogEntry,
  SchematicFontFamily,
  SheetFormat,
  TerminalPlanRow,
} from './core/e3Types';
import {
  createFluxBusLogEntry,
  detectFluxHost,
  executeFluxInboundCommand,
  type FluxCommandRequest,
  invokeFluxModule,
  pushProjectToFluxHost,
} from './core/fluxHostBridge';
import {
  loadCustomStampTemplates,
  mergeStampTemplates,
  saveCustomStampTemplates,
  type StampFieldKey,
} from './core/gostFrame';
import { generateHvacDiagram, type HvacBuildOptions } from './core/hvacBuilder';
import {
  applySheetRevisionTracking,
  getSheetRevisionNumber,
  normalizeProjectSheetRevisions,
  restoreSheetFromRevision,
} from './core/sheetRevisions';
import { findSmartCatalogSpot } from './core/smartSnap';
import { ecadAsync } from './workers/ecadAsync';

function downloadText(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBytes(filename: string, bytes: Uint8Array, mime = 'application/octet-stream') {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [docState, setDocState] = useState<{
    past: E3Project[];
    present: E3Project;
    future: E3Project[];
  }>(() => ({ past: [], present: createSeedProject(), future: [] }));
  const docStateRef = useRef(docState);
  docStateRef.current = docState;
  const project = docState.present;
  const history = docState.past;
  const future = docState.future;

  const [activeSheetId, setActiveSheetId] = useState<string>('sheet-1');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(['dev-qf1']);
  const [selectedWireIds, setSelectedWireIds] = useState<string[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<string[]>([]);
  const [hasClipboard, setHasClipboard] = useState<boolean>(false);
  const clipboardRef = useRef<CadClipboardPayload | null>(null);
  const [highlightedPotentialSeed, setHighlightedPotentialSeed] = useState<{
    wireId?: string;
    netName?: string;
    deviceId?: string;
    pinId?: string;
  } | null>(null);

  const selectedDeviceId =
    selectedDeviceIds.length === 1 && selectedWireIds.length === 0 && selectedAnnotationIds.length === 0
      ? selectedDeviceIds[0]
      : null;
  const selectedWireId =
    selectedWireIds.length === 1 && selectedDeviceIds.length === 0 && selectedAnnotationIds.length === 0
      ? selectedWireIds[0]
      : null;
  const selectedAnnotationId =
    selectedAnnotationIds.length === 1 && selectedDeviceIds.length === 0 && selectedWireIds.length === 0
      ? selectedAnnotationIds[0]
      : null;

  const setSelectedDeviceId = useCallback((id: string | null) => {
    setSelectedDeviceIds(id ? [id] : []);
  }, []);
  const setSelectedWireId = useCallback((id: string | null) => {
    setSelectedWireIds(id ? [id] : []);
  }, []);
  const setSelectedAnnotationId = useCallback((id: string | null) => {
    setSelectedAnnotationIds(id ? [id] : []);
  }, []);
  const applySelection = useCallback(
    (next: { deviceIds?: string[]; wireIds?: string[]; annotationIds?: string[] }) => {
      setSelectedDeviceIds(next.deviceIds ?? []);
      setSelectedWireIds(next.wireIds ?? []);
      setSelectedAnnotationIds(next.annotationIds ?? []);
    },
    []
  );
  const [tool, setTool] = useState<CadTool>('select');

  const highlightedTrace = useMemo<PotentialTraceResult | null>(() => {
    if (!highlightedPotentialSeed) return null;
    const res = traceConnectedPotential(project, highlightedPotentialSeed);
    return res.wireIds.length > 0 || res.offPageDeviceIds.length > 0 ? res : null;
  }, [highlightedPotentialSeed, project]);

  // Multi-viewport state (1, 2, 3, or 4 simultaneous sheets in center)
  const [viewportLayout, setViewportLayout] = useState<ViewportLayoutMode>('single');
  const [viewportSheetIds, setViewportSheetIds] = useState<string[]>(['sheet-1', 'sheet-2', 'sheet-3', 'sheet-1']);
  const [activeViewportIdx, setActiveViewportIdx] = useState<number>(0);
  const [viewportTransforms, setViewportTransforms] = useState<
    Record<number, { zoom: number; pan: { x: number; y: number } }>
  >({
    0: { zoom: 0.56, pan: { x: 46, y: 12 } },
    1: { zoom: 0.36, pan: { x: 20, y: 12 } },
    2: { zoom: 0.36, pan: { x: 20, y: 12 } },
    3: { zoom: 0.36, pan: { x: 20, y: 12 } },
  });

  // Dockable & resizable panel layout (clamped to real viewport on mount & resize)
  const [dockLayout, setDockLayout] = useState<DockLayoutState>(() => {
    const loaded = loadDockLayout();
    if (typeof window !== 'undefined') {
      return clampDockLayoutToViewport(loaded, window.innerWidth, window.innerHeight);
    }
    return loaded;
  });
  const [panelDrag, setPanelDrag] = useState<ActivePanelDrag | null>(null);
  const [resizingDockEdge, setResizingDockEdge] = useState<DockEdge | 'floating' | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveDockLayout(dockLayout);
  }, [dockLayout]);

  useEffect(() => {
    const onResize = () => {
      setDockLayout((prev) => clampDockLayoutToViewport(prev, window.innerWidth, window.innerHeight));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const activeVpTransform = viewportTransforms[activeViewportIdx] || { zoom: 0.56, pan: { x: 46, y: 12 } };
  const zoom = activeVpTransform.zoom;
  const pan = activeVpTransform.pan;
  const setZoom = useCallback(
    (nextZoom: number) => {
      setViewportTransforms((prev) => ({
        ...prev,
        [activeViewportIdx]: {
          zoom: nextZoom,
          pan: prev[activeViewportIdx]?.pan || { x: 24, y: 12 },
        },
      }));
    },
    [activeViewportIdx]
  );

  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('bom');
  const [requestedApiSubTab, setRequestedApiSubTab] = useState<ApiSubTab | null>(null);
  const consoleCollapsed = dockLayout.panels.console.collapsed;
  const setConsoleCollapsed = useCallback((nextVal: boolean | ((prev: boolean) => boolean)) => {
    setDockLayout((prev) => {
      const target =
        typeof nextVal === 'function' ? nextVal(prev.panels.console.collapsed) : nextVal;
      if (target === prev.panels.console.collapsed) return prev;
      return togglePanelCollapse(prev, 'console');
    });
  }, []);

  const [bom, setBom] = useState<BomRow[]>(() => buildBom(project));
  const [cables, setCables] = useState<CableJournalRow[]>(() => buildCableJournal(project));
  const [netLengths, setNetLengths] = useState<NetWireLengthRow[]>(() => buildNetWireLengths(project));
  const [terminals, setTerminals] = useState<TerminalPlanRow[]>(() => buildTerminalPlan(project));
  const [erc, setErc] = useState<ErcIssue[]>(() => runErc(project));
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const [leftTab, setLeftTab] = useState<'project' | 'library'>('project');
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [portableOpen, setPortableOpen] = useState(false);
  const [hvacWizardOpen, setHvacWizardOpen] = useState(false);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [fluxPublishOpen, setFluxPublishOpen] = useState(false);
  const fluxHostStatus = useMemo(() => detectFluxHost(), []);
  const [stampModalState, setStampModalState] = useState<{
    open: boolean;
    sheetId: string;
    mode: StampModalMode;
    field: StampFieldKey | null;
  }>({ open: false, sheetId: 'sheet-1', mode: 'values', field: null });
  const [customStampTemplates, setCustomStampTemplates] = useState<GostStampTemplate[]>(() =>
    loadCustomStampTemplates()
  );
  const mergedStampTemplates = useMemo(
    () => mergeStampTemplates(project, customStampTemplates),
    [project, customStampTemplates]
  );
  const [fluxBusMessages, setFluxBusMessages] = useState<FluxBusMessage[]>([]);
  const [editingCatalogItem, setEditingCatalogItem] = useState<CatalogItem | null>(null);
  const [customCatalog, setCustomCatalog] = useState<CatalogItem[]>(() => loadCustomCatalog());
  const mergedCatalog = useMemo(() => mergeCatalogItems(customCatalog), [customCatalog]);

  const [logs, setLogs] = useState<ProcessLogEntry[]>(() => [
    {
      id: 'log-init',
      timestamp: new Date().toISOString(),
      level: 'INFO',
      subsystem: 'E3-CORE',
      message: 'Инициализирован проект ЩУ-ПВ1 (3 листа, 12 изделий, 14 цепей).',
      durationMs: 1.2,
    },
  ]);

  const clientIdRef = useRef<string>(`cli-${Math.random().toString(36).slice(2, 9)}`);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const suppressSyncPushRef = useRef<boolean>(false);

  const appendLog = useCallback(
    (
      level: ProcessLogEntry['level'],
      subsystem: ProcessLogEntry['subsystem'],
      message: string,
      durationMs?: number,
      details?: string
    ) => {
      setLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          level,
          subsystem,
          message,
          durationMs,
          details,
        },
        ...prev.slice(0, 399),
      ]);
    },
    []
  );

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (project.visualSettings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [project.visualSettings.theme]);

  // Detect Flux Host environment once
  useEffect(() => {
    const host = detectFluxHost();
    if (host.hostedInFlux) {
      appendLog(
        'SYNC',
        'FLUX-BRIDGE',
        `Обнаружена среда хоста Flux (${host.projectName || host.projectId || 'v2'}).`
      );
    }
  }, [appendLog]);

  // Async Web Worker computation for BOM, Cables, Terminals, ERC
  useEffect(() => {
    let cancelled = false;
    setIsBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await ecadAsync.analyzeProject(project);
        if (cancelled) return;
        setBom(res.bom);
        setCables(res.cables);
        setNetLengths(res.netLengths);
        setTerminals(res.terminals);
        setErc(res.erc);
        appendLog(
          'INFO',
          'WORKER',
          `Пересчитана модель (${project.devices.length} изд., ${project.wires.length} цепей)${res.viaWorker ? ' в Web Worker' : ''}.`,
          res.durationMs
        );
      } finally {
        if (!cancelled) setIsBusy(false);
      }
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project, appendLog]);

  const setProjectRemote = useCallback(
    (nextOrUpdater: E3Project | ((curr: E3Project) => E3Project)) => {
      setDocState((s) => {
        const next =
          typeof nextOrUpdater === 'function' ? nextOrUpdater(s.present) : nextOrUpdater;
        return next === s.present ? s : { ...s, present: next };
      });
    },
    []
  );

  // Real-time multi-tab + Server-Sent Events sync
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('flux-e3-sync');
      broadcastRef.current = bc;
      bc.onmessage = (ev) => {
        if (ev.data?.sender === clientIdRef.current) return;
        if (ev.data?.project) {
          suppressSyncPushRef.current = true;
          setProjectRemote(ev.data.project);
          appendLog('SYNC', 'SYNC-API', `Получено обновление ревизии ${ev.data.project.revision} из соседней вкладки.`);
        }
      };
    }

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sync/stream');
      es.onopen = () => {
        appendLog('SYNC', 'SYNC-API', 'Подключён поток синхронизации в реальном времени (SSE).');
      };
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (payload.type === 'project-update' && payload.sender !== clientIdRef.current && payload.project) {
            suppressSyncPushRef.current = true;
            setProjectRemote(payload.project);
            appendLog(
              'SYNC',
              'SYNC-API',
              `Синхронизация от сервера (${payload.source || 'API'}): ревизия ${payload.project.revision}.`
            );
          } else if (payload.type === 'e3-bridge-status') {
            setBridgeStatus((prev) => ({
              ...prev,
              bridgeConnected: Boolean(payload.bridgeConnected),
              bridgeHost: payload.bridgeHost || prev.bridgeHost,
            }));
            appendLog('SYNC', 'E3-XML', `Подключён локальный ПК-мост E³.series (${payload.bridgeHost}).`);
          } else if (payload.type === 'e3-bridge-log') {
            appendLog(
              payload.ok ? 'INFO' : 'WARN',
              'E3-COM',
              `[Мост ${payload.host || 'E3'}] ${payload.message}`
            );
          } else if (payload.type === 'server-diag-log' && payload.entry) {
            const srvEntry = payload.entry as ProcessLogEntry;
            setLogs((prev) => {
              if (prev.some((p) => p.id === srvEntry.id)) return prev;
              return [srvEntry, ...prev.slice(0, 399)];
            });
          } else if (payload.type === 'flux-bus-event') {
            setFluxBusMessages((prev) => [
              createFluxBusLogEntry(
                'inbound',
                'sse/flux-bus',
                String(payload.action || 'event'),
                String(payload.sourceApp || 'flux-module'),
                String(payload.targetApp || 'e3promax-ecad'),
                JSON.stringify(payload.payload || {}).slice(0, 80)
              ),
              ...prev.slice(0, 49),
            ]);
          }
        } catch {
          // ignore heartbeat
        }
      };
      es.onerror = () => {
        // Offline / static fallback
      };
    } catch {
      // EventSource unavailable
    }

    return () => {
      broadcastRef.current?.close();
      es?.close();
    };
  }, [appendLog, setProjectRemote]);

  // Push local changes to server & BroadcastChannel
  const pushSync = useCallback((nextProject: E3Project) => {
    broadcastRef.current?.postMessage({ sender: clientIdRef.current, project: nextProject });
    void pushProjectToFluxHost(nextProject);
    fetch(`/api/v1/projects/${encodeURIComponent(nextProject.id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Flux-Client': clientIdRef.current,
      },
      body: JSON.stringify(nextProject),
    }).catch(() => {
      // Offline / static mode safe
    });
  }, []);

  const commitProject = useCallback(
    (
      updater: (prev: E3Project) => E3Project,
      recordHistory = true,
      opts?: { coalesceSheetRev?: boolean; sheetSummary?: string; skipSheetTracking?: boolean }
    ) => {
      const cur = docStateRef.current.present;
      const rawNext = updater(cur);
      const next = opts?.skipSheetTracking
        ? normalizeProjectSheetRevisions(rawNext)
        : applySheetRevisionTracking(cur, rawNext, {
            author: rawNext.author || cur.author,
            coalesceLast: opts?.coalesceSheetRev,
            summaryOverride: opts?.sheetSummary,
          });
      setDocState((s) => ({
        past: recordHistory ? [...s.past.slice(-29), s.present] : s.past,
        present: next,
        future: recordHistory ? [] : s.future,
      }));
      if (!suppressSyncPushRef.current) {
        pushSync(next);
      }
      suppressSyncPushRef.current = false;
    },
    [pushSync]
  );

  // Coalesce rapid text typing into a single undo snapshot every ~700ms per field
  const lastCoalescedEditRef = useRef<{ key: string; at: number } | null>(null);
  const commitCoalesced = useCallback(
    (editKey: string, updater: (prev: E3Project) => E3Project) => {
      const now = Date.now();
      const prevEdit = lastCoalescedEditRef.current;
      const shouldRecord = !prevEdit || prevEdit.key !== editKey || now - prevEdit.at > 700;
      lastCoalescedEditRef.current = { key: editKey, at: now };
      commitProject(updater, shouldRecord, { coalesceSheetRev: !shouldRecord });
    },
    [commitProject]
  );

  const handleUndo = useCallback(() => {
    const s = docStateRef.current;
    if (s.past.length === 0) return;
    const previous = s.past[s.past.length - 1];
    setDocState({
      past: s.past.slice(0, -1),
      present: previous,
      future: [s.present, ...s.future],
    });
    pushSync(previous);
    appendLog('INFO', 'E3-CORE', `Отмена действия (возврат к ревизии ${previous.revision}).`);
  }, [pushSync, appendLog]);

  const handleRedo = useCallback(() => {
    const s = docStateRef.current;
    if (s.future.length === 0) return;
    const next = s.future[0];
    setDocState({
      past: [...s.past, s.present],
      present: next,
      future: s.future.slice(1),
    });
    pushSync(next);
    appendLog('INFO', 'E3-CORE', `Повтор действия (ревизия ${next.revision}).`);
  }, [pushSync, appendLog]);

  const activeSheet = useMemo(
    () => project.sheets.find((s) => s.id === activeSheetId) || project.sheets[0],
    [project.sheets, activeSheetId]
  );

  const selectedDevice = useMemo(
    () => project.devices.find((d) => d.id === selectedDeviceId) || null,
    [project.devices, selectedDeviceId]
  );

  const selectedWire = useMemo(
    () => project.wires.find((w) => w.id === selectedWireId) || null,
    [project.wires, selectedWireId]
  );

  const selectedAnnotation = useMemo(
    () => (project.annotations || []).find((a) => a.id === selectedAnnotationId) || null,
    [project.annotations, selectedAnnotationId]
  );

  // Reroute attached wires whenever a device moves or rotates (with obstacle & wire-overlap avoidance)
  const rerouteDeviceWires = (
    dev: E3Device,
    allDevices: E3Device[],
    wires: E3Wire[],
    sheets?: E3Sheet[]
  ): E3Wire[] => rerouteAttachedWires(dev.id, allDevices, wires, 20, sheets);

  const dragSnapshotRef = useRef<E3Project | null>(null);

  const handleBeginDrag = useCallback(() => {
    dragSnapshotRef.current = docStateRef.current.present;
  }, []);

  const handleCommitDrag = useCallback(
    (moved: boolean, opts?: { tryWireBreakDeviceId?: string }) => {
      const snap = dragSnapshotRef.current;
      dragSnapshotRef.current = null;
      if (!snap) return;

      const cur = docStateRef.current.present;
      let nextProject = cur;
      let didBreak = false;

      if (opts?.tryWireBreakDeviceId && !isLayerLocked(cur.layers, 'wires')) {
        const dev = cur.devices.find((d) => d.id === opts.tryWireBreakDeviceId);
        const alreadyWired =
          Boolean(dev) &&
          cur.wires.some((w) => w.fromDeviceId === dev!.id || w.toDeviceId === dev!.id);
        if (dev && !alreadyWired && isTwoPinBreakEligible(dev)) {
          const sheetWires = cur.wires.filter((w) => w.sheetId === dev.sheetId);
          const cand = findWireBreakCandidate(dev, sheetWires);
          if (cand) {
            const brkRes = applyAutoWireBreak(cur, dev, cand);
            if (brkRes) {
              nextProject = brkRes.nextProject;
              didBreak = true;
              setSelectedDeviceId(brkRes.updatedDevice.id);
              setSelectedDeviceIds([brkRes.updatedDevice.id]);
              setSelectedWireId(null);
              setSelectedWireIds([]);
              appendLog(
                'INFO',
                'E3-CORE',
                `Изделие ${brkRes.updatedDevice.designation} вставлено в разрыв цепи ${cand.wire.netName} (${brkRes.wireBefore.wireNumber} / ${brkRes.wireAfter.wireNumber}).`
              );
            }
          }
        }
      }

      if (!moved && !didBreak) return;
      const rawCommitted: E3Project = didBreak
        ? nextProject
        : {
            ...nextProject,
            revision: nextProject.revision + 1,
            updatedAt: new Date().toISOString(),
          };
      const committed = applySheetRevisionTracking(snap, rawCommitted, {
        author: rawCommitted.author || snap.author,
      });
      setDocState((s) => ({
        past: [...s.past.slice(-29), snap],
        present: committed,
        future: [],
      }));
      pushSync(committed);
    },
    [pushSync, appendLog]
  );

  const handlePreviewWireWaypoints = useCallback((wireId: string, waypoints: WirePoint[]) => {
    setDocState((s) => {
      const prev = s.present;
      if (isLayerLocked(prev.layers, 'wires')) return s;
      return {
        ...s,
        present: {
          ...prev,
          updatedAt: new Date().toISOString(),
          wires: prev.wires.map((w) =>
            w.id === wireId ? { ...w, waypoints, manualRoute: true } : w
          ),
        },
      };
    });
  }, []);

  const handleMoveDevice = useCallback(
    (deviceId: string, x: number, y: number) => {
      setDocState((s) => {
        const prev = s.present;
        if (isLayerLocked(prev.layers, 'devices')) return s;
        const target = prev.devices.find((d) => d.id === deviceId);
        if (!target) return s;
        const dx = x - target.x;
        const dy = y - target.y;
        if (dx === 0 && dy === 0) return s;

        const moveDevSet = new Set(
          selectedDeviceIds.includes(deviceId) && selectedDeviceIds.length > 1
            ? selectedDeviceIds
            : [deviceId]
        );
        const moveAnnSet = new Set(
          selectedDeviceIds.includes(deviceId) && selectedAnnotationIds.length > 0 && !isLayerLocked(prev.layers, 'annotations')
            ? selectedAnnotationIds
            : []
        );

        const devices = prev.devices.map((d) =>
          moveDevSet.has(d.id) && d.sheetId === target.sheetId ? { ...d, x: d.x + dx, y: d.y + dy } : d
        );
        const actuallyMovedIds = new Set(
          devices
            .filter((d) => moveDevSet.has(d.id) && d.sheetId === target.sheetId)
            .map((d) => d.id)
        );
        const annotations =
          moveAnnSet.size > 0
            ? (prev.annotations || []).map((a) =>
                moveAnnSet.has(a.id) && a.sheetId === target.sheetId
                  ? { ...a, x: a.x + dx, y: a.y + dy }
                  : a
              )
            : prev.annotations;

        // Translate internal wires whose both ends moved together; reroute boundary wires cleanly
        const internalWireIds = new Set(
          prev.wires
            .filter((w) => actuallyMovedIds.has(w.fromDeviceId) && actuallyMovedIds.has(w.toDeviceId))
            .map((w) => w.id)
        );
        let wires = prev.wires.map((w) =>
          internalWireIds.has(w.id)
            ? { ...w, waypoints: w.waypoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }
            : w
        );
        for (const movedId of actuallyMovedIds) {
          const rerouted = rerouteAttachedWires(movedId, devices, wires, 20, prev.sheets);
          const reroutedMap = new Map(rerouted.map((w) => [w.id, w]));
          wires = wires.map((w) =>
            internalWireIds.has(w.id) ? w : reroutedMap.get(w.id) || w
          );
        }

        return {
          ...s,
          present: { ...prev, devices, wires, annotations, updatedAt: new Date().toISOString() },
        };
      });
    },
    [selectedDeviceIds, selectedAnnotationIds]
  );

  const handleUpdateDevice = useCallback(
    (deviceId: string, patch: Partial<E3Device>) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'devices')) {
        appendLog('WARN', 'E3-CORE', 'Слой «Изделия и аппараты» заблокирован.');
        return;
      }
      const patchKeys = Object.keys(patch).sort().join(',');
      const isDiscrete = 'rotation' in patch || 'bindingState' in patch || 'sheetId' in patch;
      const apply = (prev: E3Project): E3Project => {
        const devices = prev.devices.map((d) => (d.id === deviceId ? { ...d, ...patch } : d));
        const updated = devices.find((d) => d.id === deviceId);
        const wires = updated ? rerouteDeviceWires(updated, devices, prev.wires, prev.sheets) : prev.wires;
        return {
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          devices,
          wires,
        };
      };
      if (isDiscrete) {
        commitProject(apply);
      } else {
        commitCoalesced(`dev:${deviceId}:${patchKeys}`, apply);
      }
    },
    [commitProject, commitCoalesced, appendLog]
  );

  const handleRotateSelected = useCallback(() => {
    const devIds = selectedDeviceIds.length > 0 ? selectedDeviceIds : selectedDeviceId ? [selectedDeviceId] : [];
    if (devIds.length === 0) return;
    if (isLayerLocked(docStateRef.current.present.layers, 'devices')) {
      appendLog('WARN', 'E3-CORE', 'Нельзя повернуть: слой «Изделия и аппараты» заблокирован.');
      return;
    }
    const idSet = new Set(devIds);
    commitProject((prev) => {
      const devices = prev.devices.map((d) =>
        idSet.has(d.id) ? { ...d, rotation: ((d.rotation + 90) % 360) as 0 | 90 | 180 | 270 } : d
      );
      let wires = prev.wires;
      for (const id of idSet) {
        const updated = devices.find((d) => d.id === id);
        if (updated) wires = rerouteDeviceWires(updated, devices, wires, prev.sheets);
      }
      return {
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        devices,
        wires,
      };
    });
    if (devIds.length === 1) {
      const target = project.devices.find((d) => d.id === devIds[0]);
      if (target) {
        const nextRot = ((target.rotation + 90) % 360) as 0 | 90 | 180 | 270;
        appendLog('INFO', 'E3-CORE', `Элемент ${target.designation} повёрнут на ${nextRot}°.`);
      }
    } else {
      appendLog('INFO', 'E3-CORE', `Повёрнуто элементов: ${devIds.length} на 90°.`);
    }
  }, [selectedDeviceIds, selectedDeviceId, project.devices, commitProject, appendLog]);

  const handleDeleteSelected = useCallback(() => {
    const curLayers = docStateRef.current.present.layers;
    const devIds = new Set(selectedDeviceIds);
    const wireIds = new Set(selectedWireIds);
    const annIds = new Set(selectedAnnotationIds);

    if (devIds.size === 0 && wireIds.size === 0 && annIds.size === 0) return;

    const canDeleteDevs = devIds.size > 0 && !isLayerLocked(curLayers, 'devices');
    const canDeleteWires = wireIds.size > 0 && !isLayerLocked(curLayers, 'wires');
    const canDeleteAnns = annIds.size > 0 && !isLayerLocked(curLayers, 'annotations');

    if (!canDeleteDevs && devIds.size > 0) {
      appendLog('WARN', 'E3-CORE', 'Удаление отклонено: слой «Изделия и аппараты» заблокирован.');
    }
    if (!canDeleteWires && wireIds.size > 0) {
      appendLog('WARN', 'E3-CORE', 'Удаление отклонено: слой «Цепи и провода» заблокирован.');
    }
    if (!canDeleteAnns && annIds.size > 0) {
      appendLog('WARN', 'E3-CORE', 'Удаление отклонено: слой «Аннотации и зоны» заблокирован.');
    }
    if (!canDeleteDevs && !canDeleteWires && !canDeleteAnns) return;

    commitProject((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      updatedAt: new Date().toISOString(),
      devices: canDeleteDevs ? prev.devices.filter((d) => !devIds.has(d.id)) : prev.devices,
      wires: prev.wires.filter((w) => {
        if (canDeleteWires && wireIds.has(w.id)) return false;
        if (canDeleteDevs && (devIds.has(w.fromDeviceId) || devIds.has(w.toDeviceId))) return false;
        return true;
      }),
      annotations: canDeleteAnns
        ? (prev.annotations || []).filter((a) => !annIds.has(a.id))
        : prev.annotations,
    }));

    applySelection({});
    appendLog(
      'WARN',
      'E3-CORE',
      `Удалено объектов — изд.: ${canDeleteDevs ? devIds.size : 0}, цепей: ${canDeleteWires ? wireIds.size : 0}, аннот.: ${canDeleteAnns ? annIds.size : 0}.`
    );
  }, [selectedDeviceIds, selectedWireIds, selectedAnnotationIds, commitProject, applySelection, appendLog]);

  const handleCopySelected = useCallback(() => {
    const cur = docStateRef.current.present;
    const payload = buildClipboardPayload(cur, selectedDeviceIds, selectedWireIds, selectedAnnotationIds);
    if (!payload) {
      appendLog('WARN', 'E3-CORE', 'Нечего копировать: выделите изделие, группу или аннотацию.');
      return;
    }
    clipboardRef.current = payload;
    setHasClipboard(true);
    appendLog(
      'INFO',
      'E3-CORE',
      `Скопировано в буфер: изд. ${payload.devices.length}, внутр. цепей ${payload.wires.length}, аннот. ${payload.annotations.length}.`
    );
  }, [selectedDeviceIds, selectedWireIds, selectedAnnotationIds, appendLog]);

  const handlePasteClipboard = useCallback(() => {
    const payload = clipboardRef.current;
    if (!payload) return;
    const cur = docStateRef.current.present;
    if (payload.devices.length > 0 && isLayerLocked(cur.layers, 'devices')) {
      appendLog('WARN', 'E3-CORE', 'Вставка отклонена: слой «Изделия и аппараты» заблокирован.');
      return;
    }
    const targetSheetId = activeSheet?.id || cur.sheets[0]?.id;
    if (!targetSheetId) return;

    const res = pasteClipboardPayload(cur, payload, targetSheetId, {
      offsetX: 40,
      offsetY: 40,
      gridSize: cur.visualSettings.gridSize,
    });
    commitProject(() => res.nextProject);
    applySelection({
      deviceIds: res.pastedDeviceIds,
      wireIds: res.pastedWireIds,
      annotationIds: res.pastedAnnotationIds,
    });
    appendLog(
      'INFO',
      'E3-CORE',
      `Вставлено: изд. ${res.pastedDeviceIds.length}, цепей ${res.pastedWireIds.length}, аннот. ${res.pastedAnnotationIds.length}.`
    );
  }, [activeSheet?.id, commitProject, applySelection, appendLog]);

  const handleDuplicateSelected = useCallback(() => {
    const cur = docStateRef.current.present;
    const payload = buildClipboardPayload(cur, selectedDeviceIds, selectedWireIds, selectedAnnotationIds);
    if (!payload) return;
    if (payload.devices.length > 0 && isLayerLocked(cur.layers, 'devices')) {
      appendLog('WARN', 'E3-CORE', 'Дублирование отклонено: слой «Изделия и аппараты» заблокирован.');
      return;
    }
    const targetSheetId = activeSheet?.id || cur.sheets[0]?.id;
    if (!targetSheetId) return;

    const res = pasteClipboardPayload(cur, payload, targetSheetId, {
      offsetX: 40,
      offsetY: 40,
      gridSize: cur.visualSettings.gridSize,
    });
    commitProject(() => res.nextProject);
    applySelection({
      deviceIds: res.pastedDeviceIds,
      wireIds: res.pastedWireIds,
      annotationIds: res.pastedAnnotationIds,
    });
    appendLog('INFO', 'E3-CORE', `Дублировано объектов: ${res.pastedDeviceIds.length + res.pastedAnnotationIds.length}.`);
  }, [selectedDeviceIds, selectedWireIds, selectedAnnotationIds, activeSheet?.id, commitProject, applySelection, appendLog]);

  const handleSelectAllOnSheet = useCallback(() => {
    const cur = docStateRef.current.present;
    const sheetId = activeSheet?.id || cur.sheets[0]?.id;
    if (!sheetId) return;
    const layers = resolveCadLayers(cur.layers, cur.visualSettings.showGostFrame);
    const deviceIds =
      layers.devices.visible && !layers.devices.locked
        ? cur.devices
            .filter((d) => d.sheetId === sheetId && d.bindingState !== 'REMOVED_IN_FLUX')
            .map((d) => d.id)
        : [];
    const wireIds =
      layers.wires.visible && !layers.wires.locked
        ? cur.wires.filter((w) => w.sheetId === sheetId).map((w) => w.id)
        : [];
    const annotationIds =
      layers.annotations.visible && !layers.annotations.locked
        ? (cur.annotations || []).filter((a) => a.sheetId === sheetId).map((a) => a.id)
        : [];
    applySelection({ deviceIds, wireIds, annotationIds });
  }, [activeSheet?.id, applySelection]);

  const handleAlignSelectedDevices = useCallback(
    (kind: DeviceAlignKind) => {
      if (selectedDeviceIds.length < 2) return;
      if (isLayerLocked(docStateRef.current.present.layers, 'devices')) {
        appendLog('WARN', 'E3-CORE', 'Выравнивание отклонено: слой «Изделия и аппараты» заблокирован.');
        return;
      }
      commitProject((prev) => {
        const devices = alignSelectedDevices(
          prev.devices,
          selectedDeviceIds,
          kind,
          prev.visualSettings.gridSize,
          prev.visualSettings.snapToGrid
        );
        let wires = prev.wires;
        for (const id of selectedDeviceIds) {
          const moved = devices.find((d) => d.id === id);
          if (moved) wires = rerouteDeviceWires(moved, devices, wires, prev.sheets);
        }
        return {
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          devices,
          wires,
        };
      });
      appendLog('INFO', 'E3-CORE', `Выровнена группа изделий (${selectedDeviceIds.length} шт., режим: ${kind}).`);
    },
    [selectedDeviceIds, commitProject, appendLog]
  );

  const handlePlaceCatalogItem = useCallback(
    (item: CatalogItem, x?: number, y?: number, targetSheetId?: string) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'devices')) {
        appendLog('WARN', 'E3-CORE', 'Размещение невозможно: слой «Изделия и аппараты» заблокирован.');
        return;
      }
      const sheetId = targetSheetId || activeSheet?.id || project.sheets[0].id;
      const targetSheet = project.sheets.find((s) => s.id === sheetId) || project.sheets[0];
      const sheetDevices = project.devices.filter((d) => d.sheetId === sheetId);
      const des = nextUniqueDesignation(project.devices, item.defaultPrefix);
      const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const smartPos =
        x === undefined || y === undefined
          ? findSmartCatalogSpot(
              { width: item.width, height: item.height },
              sheetDevices,
              targetSheet,
              project.visualSettings.gridSize
            )
          : { x, y };
      const posX = smartPos.x;
      const posY = smartPos.y;

      const newDev: E3Device = {
        id,
        elementId: `el-${Date.now().toString(36)}`,
        designation: des,
        componentName: item.componentName,
        article: item.article,
        manufacturer: item.manufacturer,
        category: item.category,
        sheetId,
        x: posX,
        y: posY,
        rotation: 0,
        width: item.width,
        height: item.height,
        e3BlockName: item.e3BlockName,
        bindingState: 'PLACED',
        pins: item.pins.map((p, idx) => ({ ...p, id: `${id}-p${idx + 1}` })),
        attributes: structuredClone(item.defaultAttributes),
        offPageRef:
          item.category === 'offpage_ref'
            ? {
                direction: item.e3BlockName.includes('IN') ? 'in' : 'out',
                potentialName:
                  item.defaultAttributes.find((a) => /потенциал/i.test(a.name))?.value || '+24V_DC',
                signalType: item.pins[0]?.signalType || 'dc24',
              }
            : undefined,
      };

      const cur = docStateRef.current.present;
      const baseWithDevice: E3Project = {
        ...cur,
        revision: cur.revision + 1,
        updatedAt: new Date().toISOString(),
        devices: [...cur.devices, newDev],
      };

      let finalProject = baseWithDevice;
      let placedDevice = newDev;
      let brokeWireNet: string | null = null;

      if (
        x !== undefined &&
        y !== undefined &&
        !isLayerLocked(cur.layers, 'wires') &&
        isTwoPinBreakEligible(newDev)
      ) {
        const sheetWires = cur.wires.filter((w) => w.sheetId === sheetId);
        const cand = findWireBreakCandidate(newDev, sheetWires);
        if (cand) {
          const brkRes = applyAutoWireBreak(baseWithDevice, newDev, cand);
          if (brkRes) {
            finalProject = brkRes.nextProject;
            placedDevice = brkRes.updatedDevice;
            brokeWireNet = `${cand.wire.netName} → ${brkRes.wireBefore.wireNumber}/${brkRes.wireAfter.wireNumber}`;
          }
        }
      }

      commitProject(() => finalProject);
      setSelectedDeviceId(placedDevice.id);
      setSelectedDeviceIds([placedDevice.id]);
      setSelectedWireId(null);
      setSelectedWireIds([]);
      setSelectedAnnotationId(null);
      setSelectedAnnotationIds([]);
      appendLog(
        'INFO',
        'E3-CORE',
        brokeWireNet
          ? `Компонент ${placedDevice.designation} (${placedDevice.article}) вставлен в разрыв цепи ${brokeWireNet}.`
          : `Размещён компонент ${placedDevice.designation} (${placedDevice.article}).`
      );
    },
    [project.devices, project.sheets, project.visualSettings.gridSize, activeSheet?.id, commitProject, appendLog]
  );

  const handleCreateAnnotation = useCallback(
    (sheetId: string, kind: AnnotationKind, x: number, y: number) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'annotations')) {
        appendLog('WARN', 'E3-CORE', 'Создание отклонено: слой «Аннотации и зоны» заблокирован.');
        return;
      }
      const newAnn: E3Annotation = {
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        sheetId,
        kind,
        x,
        y,
        width: kind === 'rect' ? 240 : 180,
        height: kind === 'rect' ? 140 : 44,
        text:
          kind === 'rect'
            ? 'Зона шкафа ЩУ'
            : kind === 'callout'
              ? 'См. лист внешних подключений'
              : 'Примечание: кабель проложить в лотке',
        fontSize: 12,
      };
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        annotations: [...(prev.annotations || []), newAnn],
      }));
      applySelection({ annotationIds: [newAnn.id] });
      setTool('select');
      appendLog('INFO', 'E3-CORE', `Добавлена аннотация (${kind}) на лист.`);
    },
    [commitProject, applySelection, appendLog]
  );

  const handleMoveAnnotation = useCallback(
    (annId: string, x: number, y: number) => {
      setDocState((s) => {
        const prev = s.present;
        if (isLayerLocked(prev.layers, 'annotations')) return s;
        const target = (prev.annotations || []).find((a) => a.id === annId);
        if (!target) return s;
        const dx = x - target.x;
        const dy = y - target.y;
        if (dx === 0 && dy === 0) return s;

        const moveAnnSet = new Set(
          selectedAnnotationIds.includes(annId) && selectedAnnotationIds.length > 1
            ? selectedAnnotationIds
            : [annId]
        );
        return {
          ...s,
          present: {
            ...prev,
            updatedAt: new Date().toISOString(),
            annotations: (prev.annotations || []).map((a) =>
              moveAnnSet.has(a.id) && a.sheetId === target.sheetId
                ? { ...a, x: a.x + dx, y: a.y + dy }
                : a
            ),
          },
        };
      });
    },
    [selectedAnnotationIds]
  );

  const handleUpdateAnnotation = useCallback(
    (annId: string, patch: Partial<E3Annotation>) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'annotations')) return;
      commitCoalesced(`ann:${annId}:${Object.keys(patch).join(',')}`, (prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        annotations: (prev.annotations || []).map((a) => (a.id === annId ? { ...a, ...patch } : a)),
      }));
    },
    [commitCoalesced]
  );

  const handleDeleteAnnotation = useCallback(
    (annId: string) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'annotations')) {
        appendLog('WARN', 'E3-CORE', 'Слой «Аннотации и зоны» заблокирован.');
        return;
      }
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        annotations: (prev.annotations || []).filter((a) => a.id !== annId),
      }));
      if (selectedAnnotationId === annId) setSelectedAnnotationId(null);
    },
    [commitProject, selectedAnnotationId, appendLog]
  );

  const handleCreateWire = useCallback(
    (
      fromDeviceId: string,
      fromPinId: string,
      toDeviceId: string,
      toPinId: string,
      customWaypoints?: WirePoint[]
    ) => {
      const cur = docStateRef.current.present;
      if (isLayerLocked(cur.layers, 'wires')) {
        appendLog('WARN', 'E3-CORE', 'Трассировка отклонена: слой «Цепи и провода» заблокирован.');
        return;
      }
      if (fromDeviceId === toDeviceId && fromPinId === toPinId) return;

      const d1 = cur.devices.find((d) => d.id === fromDeviceId);
      const d2 = cur.devices.find((d) => d.id === toDeviceId);
      const p1 = d1?.pins.find((p) => p.id === fromPinId);
      const p2 = d2?.pins.find((p) => p.id === toPinId);
      if (!d1 || !d2 || !p1 || !p2) return;

      const duplicate = cur.wires.find(
        (w) =>
          (w.fromDeviceId === fromDeviceId &&
            w.fromPinId === fromPinId &&
            w.toDeviceId === toDeviceId &&
            w.toPinId === toPinId) ||
          (w.fromDeviceId === toDeviceId &&
            w.fromPinId === toPinId &&
            w.toDeviceId === fromDeviceId &&
            w.toPinId === fromPinId)
      );
      if (duplicate) {
        setSelectedWireId(duplicate.id);
        setSelectedDeviceId(null);
        appendLog('INFO', 'E3-CORE', `Выбрана существующая связь ${duplicate.netName} между этими выводами.`);
        return;
      }

      const targetSheetId = d1.sheetId;
      const targetSheet = cur.sheets.find((s) => s.id === targetSheetId);
      const sheetBounds = getSheetDrawableBounds(targetSheet);

      // Inherit existing net/signal if branching from an already wired pin (T-junction)
      const existingPinWire = cur.wires.find(
        (w) =>
          w.sheetId === targetSheetId &&
          ((w.fromDeviceId === fromDeviceId && w.fromPinId === fromPinId) ||
            (w.toDeviceId === fromDeviceId && w.toPinId === fromPinId) ||
            (w.fromDeviceId === toDeviceId && w.fromPinId === toPinId) ||
            (w.toDeviceId === toDeviceId && w.toPinId === toPinId))
      );

      let wireIdx = cur.wires.length + 1;
      while (cur.wires.some((w) => w.netName === `NET_${wireIdx}`)) {
        wireIdx += 1;
      }
      const netName = existingPinWire?.netName || `NET_${wireIdx}`;
      const signalType = existingPinWire?.signalType || p1.signalType;
      const wireNumber = existingPinWire?.wireNumber || String(100 + wireIdx);

      const abs1 = { ...getAbsolutePinPos(d1, p1), deviceId: d1.id };
      const abs2 = { ...getAbsolutePinPos(d2, p2), deviceId: d2.id };
      const obstacles = cur.devices
        .filter((d) => d.sheetId === targetSheetId && d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
        .map((d) => getDeviceBounds(d));
      const occupied = cur.wires
        .filter((w) => w.sheetId === targetSheetId)
        .flatMap((w) => extractWireSegments(w.waypoints, w.netName));

      const hasManualPath = Boolean(customWaypoints && customWaypoints.length >= 2);
      const newWire: E3Wire = {
        id: `w-${Date.now()}`,
        sheetId: targetSheetId,
        netName,
        signalType,
        fromDeviceId,
        fromPinId,
        toDeviceId,
        toPinId,
        waypoints: hasManualPath
          ? customWaypoints!
          : autoRouteOrthogonal(abs1, abs2, 20, obstacles, 0, occupied, {
              netName,
              sheetBounds,
            }),
        crossSection: signalType === 'power' ? '2.5 мм²' : '0.75 мм²',
        wireNumber,
        manualRoute: hasManualPath ? true : undefined,
      };

      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        wires: [...prev.wires, newWire],
      }));
      setSelectedWireId(newWire.id);
      setSelectedWireIds([newWire.id]);
      setSelectedDeviceId(null);
      setSelectedDeviceIds([]);
      appendLog(
        'INFO',
        'E3-CORE',
        `Создана цепь ${newWire.netName}${hasManualPath ? ' (ручная укладка)' : ''}: ${d1.designation}:${p1.name} → ${d2.designation}:${p2.name}.`
      );
    },
    [commitProject, appendLog]
  );

  const handleRerouteWire = useCallback(
    (wireId: string) => {
      const cur = docStateRef.current.present;
      if (isLayerLocked(cur.layers, 'wires')) {
        appendLog('WARN', 'E3-CORE', 'Слой «Цепи и провода» заблокирован.');
        return;
      }
      const target = cur.wires.find((w) => w.id === wireId);
      if (!target) return;
      const d1 = cur.devices.find((d) => d.id === target.fromDeviceId);
      const d2 = cur.devices.find((d) => d.id === target.toDeviceId);
      const p1 = d1?.pins.find((p) => p.id === target.fromPinId);
      const p2 = d2?.pins.find((p) => p.id === target.toPinId);
      if (!d1 || !d2 || !p1 || !p2) return;

      const abs1 = { ...getAbsolutePinPos(d1, p1), deviceId: d1.id };
      const abs2 = { ...getAbsolutePinPos(d2, p2), deviceId: d2.id };
      const obstacles = cur.devices
        .filter((d) => d.sheetId === target.sheetId && d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
        .map((d) => getDeviceBounds(d));
      const occupied = cur.wires
        .filter((w) => w.sheetId === target.sheetId && w.id !== target.id)
        .flatMap((w) => extractWireSegments(w.waypoints, w.netName));
      const sheetBounds = getSheetDrawableBounds(cur.sheets.find((s) => s.id === target.sheetId));
      const nextPts = autoRouteOrthogonal(abs1, abs2, 20, obstacles, 0, occupied, {
        netName: target.netName,
        sheetBounds,
      });

      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        wires: prev.wires.map((w) =>
          w.id === wireId ? { ...w, waypoints: nextPts, manualRoute: undefined } : w
        ),
      }));
      appendLog('INFO', 'E3-CORE', `Перестроена автотрасса цепи ${target.netName} (${target.wireNumber}).`);
    },
    [commitProject, appendLog]
  );

  const handleAddSheet = useCallback(() => {
    const num = project.sheets.length + 1;
    const firstStamp = project.sheets[0]?.titleBlock;
    const newSheet: E3Sheet = {
      id: `sheet-${Date.now()}`,
      number: num,
      name: `Доп. схема ${num}`,
      format: 'A3',
      width: 1400,
      height: 920,
      titleBlock: {
        stampForm: 'form2a',
        documentCode: firstStamp?.documentCode || project.projectCode,
        projectTitle: firstStamp?.projectTitle || project.name,
        organization: firstStamp?.organization || 'ООО «ПромВентАвтоматика»',
        designer: firstStamp?.designer || project.author,
        checker: firstStamp?.checker || '',
        techControl: firstStamp?.techControl || '',
        normControl: firstStamp?.normControl || '',
        approver: firstStamp?.approver || '',
        litera: firstStamp?.litera || 'Р',
        mass: '—',
        scale: 'б/м',
        date: firstStamp?.date || '',
        invOriginal: firstStamp?.invOriginal || '',
        invDuplicate: firstStamp?.invDuplicate || '',
        sheetTitle: `Лист ${num}. Принципиальная схема`,
      },
    };
    commitProject((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      sheets: [...prev.sheets, newSheet],
    }));
    setActiveSheetId(newSheet.id);
    appendLog('INFO', 'E3-CORE', `Добавлен новый лист: ${newSheet.name}.`);
  }, [project.sheets, project.projectCode, project.author, commitProject, appendLog]);

  const handleSaveCustomCatalogItem = useCallback(
    (item: CatalogItem) => {
      setCustomCatalog((prev) => {
        const idx = prev.findIndex((c) => c.id === item.id);
        const next = idx >= 0 ? prev.map((c) => (c.id === item.id ? item : c)) : [...prev, item];
        saveCustomCatalog(next);
        return next;
      });
      appendLog('INFO', 'E3-CORE', `Сохранено изделие в базу: ${item.componentName} (${item.article}).`);
    },
    [appendLog]
  );

  const handleDeleteCustomCatalogItem = useCallback(
    (itemId: string) => {
      setCustomCatalog((prev) => {
        const next = prev.filter((c) => c.id !== itemId);
        saveCustomCatalog(next);
        return next;
      });
      appendLog('WARN', 'E3-CORE', 'Пользовательское изделие удалено из базы.');
    },
    [appendLog]
  );

  const handleSaveDeviceToCatalog = useCallback(
    (dev: E3Device) => {
      const existing = customCatalog.find(
        (c) => c.e3BlockName === dev.e3BlockName && c.article === dev.article
      );
      const item = deviceToCatalogItem(dev, existing?.id);
      handleSaveCustomCatalogItem(item);
      setLeftTab('library');
      appendLog(
        'INFO',
        'E3-CORE',
        `Изделие ${dev.designation} (${item.defaultAttributes.length} атр., ${item.pins.length} выв.) сохранено в базу.`
      );
    },
    [customCatalog, handleSaveCustomCatalogItem, appendLog]
  );

  const fitSheetToViewport = useCallback(
    (sheetObj?: E3Sheet, vpIdx = activeViewportIdx) => {
      const target =
        sheetObj || project.sheets.find((s) => s.id === activeSheetId) || project.sheets[0];
      if (!target) return;
      const sel = vpIdx === 0 ? '[data-testid="schematic-canvas"]' : `[data-testid="schematic-canvas-${vpIdx}"]`;
      const el = document.querySelector(sel) || document.querySelector('[data-testid="schematic-canvas"]');
      const rect = el?.getBoundingClientRect();
      const vw = rect?.width && rect.width > 100 ? rect.width : 820;
      const vh = rect?.height && rect.height > 100 ? rect.height : 500;
      const fitZ = Math.min((vw - 24) / target.width, (vh - 18) / target.height);
      const clampedZ = Math.min(1.2, Math.max(0.14, Math.floor(fitZ * 100) / 100));
      const panX = Math.max(8, Math.round((vw - target.width * clampedZ) / 2));
      const panY = Math.max(6, Math.round((vh - target.height * clampedZ) / 2));
      setViewportTransforms((prev) => ({
        ...prev,
        [vpIdx]: { zoom: clampedZ, pan: { x: panX, y: panY } },
      }));
    },
    [project.sheets, activeSheetId, activeViewportIdx]
  );

  const centerCameraOnCoords = useCallback(
    (sheetId: string, worldX: number, worldY: number, vpIdx = activeViewportIdx) => {
      setActiveSheetId(sheetId);
      setViewportSheetIds((prev) => prev.map((sId, idx) => (idx === vpIdx ? sheetId : sId)));
      window.requestAnimationFrame(() => {
        const sel = vpIdx === 0 ? '[data-testid="schematic-canvas"]' : `[data-testid="schematic-canvas-${vpIdx}"]`;
        const el = document.querySelector(sel) || document.querySelector('[data-testid="schematic-canvas"]');
        const rect = el?.getBoundingClientRect();
        const vw = rect?.width && rect.width > 100 ? rect.width : 820;
        const vh = rect?.height && rect.height > 100 ? rect.height : 500;
        setViewportTransforms((prev) => {
          const curZoom = prev[vpIdx]?.zoom ?? 0.56;
          const nextZ = Math.min(1.35, Math.max(0.68, curZoom));
          return {
            ...prev,
            [vpIdx]: {
              zoom: nextZ,
              pan: {
                x: Math.round(vw / 2 - worldX * nextZ),
                y: Math.round(vh / 2 - worldY * nextZ),
              },
            },
          };
        });
      });
    },
    [activeViewportIdx]
  );

  const handleNavigateOffPage = useCallback(
    (device: E3Device) => {
      const cur = docStateRef.current.present;
      const link = resolveOffPageLinks(cur).get(device.id);
      const cp = link?.primaryCounterpart;
      if (!cp) {
        applySelection({ deviceIds: [device.id] });
        setHighlightedPotentialSeed({ deviceId: device.id });
        appendLog(
          'WARN',
          'E3-CORE',
          `Ссылка ${device.designation} (${link?.potentialName || '?'}) пока не имеет ответной на другом листе.`
        );
        return;
      }
      applySelection({ deviceIds: [cp.deviceId] });
      setHighlightedPotentialSeed({ deviceId: cp.deviceId });
      centerCameraOnCoords(cp.sheetId, cp.x, cp.y, activeViewportIdx);
      appendLog(
        'INFO',
        'E3-CORE',
        `Переход по ссылке ${device.designation} → ${cp.designation} на Лист ${cp.sheetNumber} (зона ${cp.zone}).`
      );
    },
    [applySelection, centerCameraOnCoords, activeViewportIdx, appendLog]
  );

  const handleCreateOffPageAt = useCallback(
    (sheetId: string, x: number, y: number) => {
      const cur = docStateRef.current.present;
      if (isLayerLocked(cur.layers, 'devices')) {
        appendLog('WARN', 'E3-CORE', 'Размещение ссылки отклонено: слой «Изделия и аппараты» заблокирован.');
        return;
      }
      const grid = cur.visualSettings.gridSize || 20;
      const snappedX = cur.visualSettings.snapToGrid ? Math.round((x - 60) / grid) * grid : Math.round(x - 60);
      const snappedY = cur.visualSettings.snapToGrid ? Math.round((y - 18) / grid) * grid : Math.round(y - 18);
      const selectedWireObj = cur.wires.find((w) => w.id === selectedWireId);
      const dev = createOffPageConnectorDevice({
        existingDevices: cur.devices,
        sheetId,
        x: snappedX,
        y: snappedY,
        direction: 'out',
        potentialName: selectedWireObj?.netName || '+24V_DC',
        signalType: selectedWireObj?.signalType || 'dc24',
      });
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        devices: [...prev.devices, dev],
      }));
      applySelection({ deviceIds: [dev.id] });
      setHighlightedPotentialSeed({ deviceId: dev.id });
      setTool('select');
      appendLog('INFO', 'E3-CORE', `Размещена межлистовая ссылка ${dev.designation} (${dev.offPageRef?.potentialName}).`);
    },
    [selectedWireId, commitProject, applySelection, appendLog]
  );

  const handleCreateOffPageCounterpart = useCallback(
    (sourceDevice: E3Device, targetSheetId: string) => {
      const cur = docStateRef.current.present;
      if (isLayerLocked(cur.layers, 'devices')) {
        appendLog('WARN', 'E3-CORE', 'Создание ссылки отклонено: слой «Изделия и аппараты» заблокирован.');
        return;
      }
      const targetSheet = cur.sheets.find((s) => s.id === targetSheetId);
      if (!targetSheet) return;
      const connectedWire = cur.wires.find(
        (w) => w.fromDeviceId === sourceDevice.id || w.toDeviceId === sourceDevice.id
      );
      const srcMeta = getOffPageMeta(sourceDevice, connectedWire);
      const tgtDir: 'out' | 'in' = srcMeta.direction === 'out' ? 'in' : 'out';
      const pairId = srcMeta.pairId || `pair-${Date.now().toString(36)}`;
      const targetSheetDevices = cur.devices.filter((d) => d.sheetId === targetSheetId);
      const spot = findSmartCatalogSpot(
        { width: 120, height: 36 },
        targetSheetDevices,
        targetSheet,
        cur.visualSettings.gridSize || 20
      );
      const targetDev = createOffPageConnectorDevice({
        existingDevices: cur.devices,
        sheetId: targetSheetId,
        x: spot.x,
        y: spot.y,
        direction: tgtDir,
        potentialName: srcMeta.potentialName,
        signalType: srcMeta.signalType,
        pairId,
        targetDeviceId: sourceDevice.id,
        idSuffix: 'cp',
      });

      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        devices: [
          ...prev.devices.map((d) =>
            d.id === sourceDevice.id
              ? {
                  ...d,
                  offPageRef: {
                    ...getOffPageMeta(d),
                    pairId,
                    targetDeviceId: targetDev.id,
                  },
                }
              : d
          ),
          targetDev,
        ],
      }));
      applySelection({ deviceIds: [targetDev.id] });
      setHighlightedPotentialSeed({ deviceId: targetDev.id });
      centerCameraOnCoords(
        targetSheetId,
        targetDev.x + targetDev.width / 2,
        targetDev.y + targetDev.height / 2,
        activeViewportIdx
      );
      appendLog(
        'INFO',
        'E3-CORE',
        `Создана ответная ссылка ${targetDev.designation} на «${targetSheet.name}» для потенциала ${srcMeta.potentialName}.`
      );
    },
    [commitProject, applySelection, centerCameraOnCoords, activeViewportIdx, appendLog]
  );

  const handleUpdateOffPageMeta = useCallback(
    (deviceId: string, patch: Partial<OffPageRefMeta>) => {
      const cur = docStateRef.current.present;
      if (isLayerLocked(cur.layers, 'devices')) {
        appendLog('WARN', 'E3-CORE', 'Слой «Изделия и аппараты» заблокирован.');
        return;
      }
      const patchKeys = Object.keys(patch).sort().join(',');
      const isDiscrete = 'direction' in patch || 'signalType' in patch;
      const apply = (prev: E3Project): E3Project => {
        const devices = prev.devices.map((d) => {
          if (d.id !== deviceId) return d;
          const prevMeta = getOffPageMeta(d);
          const nextMeta: OffPageRefMeta = { ...prevMeta, ...patch };
          const isOut = nextMeta.direction === 'out';
          const updatedAttrs = d.attributes.map((a) => {
            if (/^потенциал$/i.test(a.name)) return { ...a, value: nextMeta.potentialName };
            if (/^направление$/i.test(a.name))
              return { ...a, value: isOut ? 'Исходящая (→)' : 'Входящая (←)' };
            return a;
          });
          const updatedPins = d.pins.map((p, idx) =>
            idx === 0
              ? {
                  ...p,
                  name: isOut ? 'IN' : 'OUT',
                  dx: isOut ? 0 : 120,
                  dy: 18,
                  direction: (isOut ? 'left' : 'right') as E3Device['pins'][number]['direction'],
                  signalType: nextMeta.signalType,
                }
              : p
          );
          return {
            ...d,
            e3BlockName: isOut ? 'GOST_OFFPAGE_OUT' : 'GOST_OFFPAGE_IN',
            componentName: isOut
              ? 'Ссылка межлистовая исходящая (→ Лист)'
              : 'Ссылка межлистовая входящая (← Лист)',
            article: isOut ? 'E3-OFFPAGE-OUT' : 'E3-OFFPAGE-IN',
            pins: updatedPins,
            attributes: updatedAttrs,
            offPageRef: nextMeta,
          };
        });
        const updated = devices.find((d) => d.id === deviceId);
        const wires = updated ? rerouteDeviceWires(updated, devices, prev.wires, prev.sheets) : prev.wires;
        return {
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          devices,
          wires,
        };
      };
      if (isDiscrete) commitProject(apply);
      else commitCoalesced(`offpage:${deviceId}:${patchKeys}`, apply);
    },
    [commitProject, commitCoalesced, appendLog]
  );

  const didInitialFitRef = useRef(false);
  useEffect(() => {
    if (didInitialFitRef.current) return;
    didInitialFitRef.current = true;
    const raf = window.requestAnimationFrame(() => {
      const firstSheet = project.sheets[0];
      if (firstSheet) fitSheetToViewport(firstSheet, 0);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [fitSheetToViewport, project.sheets]);

  const handleSetViewportLayout = useCallback(
    (mode: ViewportLayoutMode) => {
      const nextSheetIds = computeViewportSheets(mode, project.sheets, viewportSheetIds, activeSheetId);
      setViewportLayout(mode);
      setViewportSheetIds(nextSheetIds);
      setActiveViewportIdx(0);
      setActiveSheetId(nextSheetIds[0] || activeSheetId);
      window.requestAnimationFrame(() => {
        const cnt = viewportCountForMode(mode);
        for (let i = 0; i < cnt; i++) {
          const sh = project.sheets.find((s) => s.id === nextSheetIds[i]) || project.sheets[0];
          if (sh) fitSheetToViewport(sh, i);
        }
      });
      appendLog('INFO', 'E3-CORE', `Режим просмотра листов: ${viewportCountForMode(mode)} в центре.`);
    },
    [project.sheets, viewportSheetIds, activeSheetId, fitSheetToViewport, appendLog]
  );

  const handleDuplicateSheet = useCallback(
    (sheetId: string) => {
      const { nextProject, newSheetId } = duplicateSheetInProject(project, sheetId);
      commitProject(() => nextProject);
      setActiveSheetId(newSheetId);
      setViewportSheetIds((prev) => prev.map((id, idx) => (idx === activeViewportIdx ? newSheetId : id)));
      appendLog('INFO', 'E3-CORE', 'Создана копия листа со всеми элементами и связями.');
    },
    [project, commitProject, activeViewportIdx, appendLog]
  );

  const handleDeleteSheet = useCallback(
    (sheetId: string) => {
      if (project.sheets.length <= 1) return;
      const { nextProject, nextActiveSheetId } = deleteSheetFromProject(project, sheetId);
      commitProject(() => nextProject);
      setActiveSheetId(nextActiveSheetId);
      setViewportSheetIds((prev) =>
        prev.map((id) => (id === sheetId ? nextActiveSheetId : id))
      );
      setSelectedDeviceId(null);
      setSelectedWireId(null);
      setSelectedAnnotationId(null);
      appendLog('WARN', 'E3-CORE', 'Лист удалён из проекта.');
    },
    [project, commitProject, appendLog]
  );

  // Panel dock dragging & edge resizing handlers
  const handleStartPanelDrag = useCallback(
    (panelId: PanelId, e: React.PointerEvent) => {
      e.preventDefault();
      const panel = dockLayout.panels[panelId];
      const dragState: ActivePanelDrag = {
        panelId,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        origFloatingX: panel.floating.x,
        origFloatingY: panel.floating.y,
        wasFloating: panel.dock === 'floating',
        hoverTarget: null,
      };
      setPanelDrag(dragState);

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - dragState.startX;
        const dy = ev.clientY - dragState.startY;
        const movedEnough = Math.hypot(dx, dy) > 8;
        const bounds = workspaceRef.current?.getBoundingClientRect();
        const hover =
          movedEnough && bounds
            ? resolveDropTarget(ev.clientX, ev.clientY, bounds)
            : null;

        if (panel.dock === 'floating' && movedEnough) {
          setDockLayout((prev) =>
            updateFloatingRect(
              prev,
              panelId,
              {
                x: dragState.origFloatingX + dx,
                y: dragState.origFloatingY + dy,
              },
              window.innerWidth,
              window.innerHeight
            )
          );
        }

        setPanelDrag((curr) =>
          curr
            ? {
                ...curr,
                currentX: ev.clientX,
                currentY: ev.clientY,
                hoverTarget: hover,
              }
            : null
        );
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const dx = ev.clientX - dragState.startX;
        const dy = ev.clientY - dragState.startY;
        if (Math.hypot(dx, dy) > 8) {
          const bounds = workspaceRef.current?.getBoundingClientRect();
          const target = bounds ? resolveDropTarget(ev.clientX, ev.clientY, bounds) : 'floating';
          setDockLayout((prev) =>
            movePanelDock(
              prev,
              panelId,
              target,
              target === 'floating'
                ? {
                    x: ev.clientX - Math.round(prev.panels[panelId].floating.width / 2),
                    y: ev.clientY - 14,
                  }
                : undefined,
              window.innerWidth,
              window.innerHeight
            )
          );
        }
        setPanelDrag(null);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [dockLayout.panels]
  );

  const handleResizeDockEdgeStart = useCallback(
    (edge: DockEdge, e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startSize = dockLayout.sizes[edge];
      setResizingDockEdge(edge);

      const onMove = (ev: PointerEvent) => {
        let next = startSize;
        if (edge === 'left') next = startSize + (ev.clientX - startX);
        else if (edge === 'right') next = startSize - (ev.clientX - startX);
        else if (edge === 'bottom') next = startSize - (ev.clientY - startY);
        else if (edge === 'top') next = startSize + (ev.clientY - startY);

        setDockLayout((prev) =>
          resizeDockEdge(prev, edge, next, window.innerWidth, window.innerHeight)
        );
      };

      const onUp = () => {
        setResizingDockEdge(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [dockLayout.sizes]
  );

  const handleResizeFloatingStart = useCallback(
    (panelId: PanelId, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const orig = dockLayout.panels[panelId].floating;
      setResizingDockEdge('floating');

      const onMove = (ev: PointerEvent) => {
        setDockLayout((prev) =>
          updateFloatingRect(
            prev,
            panelId,
            {
              width: orig.width + (ev.clientX - startX),
              height: orig.height + (ev.clientY - startY),
            },
            window.innerWidth,
            window.innerHeight
          )
        );
      };

      const onUp = () => {
        setResizingDockEdge(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [dockLayout.panels]
  );

  const handleBuildHvacDiagram = useCallback(
    (options: HvacBuildOptions) => {
      const res = generateHvacDiagram(options, mergedCatalog, project);
      commitProject(() => res.nextProject);
      setActiveSheetId(res.fsaSheetId);
      setViewportSheetIds((prev) =>
        prev.map((id, idx) => (idx === activeViewportIdx ? res.fsaSheetId : id))
      );
      setSelectedDeviceId(null);
      setSelectedWireId(null);
      const fsaSheet = res.nextProject.sheets.find((s) => s.id === res.fsaSheetId);
      if (fsaSheet) {
        window.requestAnimationFrame(() => fitSheetToViewport(fsaSheet, activeViewportIdx));
      }
      appendLog(
        'INFO',
        'E3-CORE',
        `Сгенерирована ФСА ${options.systemTag} (${options.sheetFormat}, шрифт ${options.fontFamily}): ${res.createdDevicesCount} узлов, ${res.createdWiresCount} связей${res.wiringSheetId ? ' + лист внешних соединений' : ''}.`
      );
    },
    [mergedCatalog, project, commitProject, activeViewportIdx, fitSheetToViewport, appendLog]
  );

  const handleAutoRouteActiveSheetWires = useCallback(() => {
    const manualPreservedCount = docStateRef.current.present.wires.filter(
      (w) => w.sheetId === activeSheetId && w.manualRoute
    ).length;
    commitProject((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      updatedAt: new Date().toISOString(),
      wires: routeSheetWiresCleanly(
        prev.devices,
        prev.wires,
        activeSheetId,
        prev.visualSettings.gridSize,
        prev.sheets
      ),
    }));
    appendLog(
      'INFO',
      'E3-CORE',
      manualPreservedCount > 0
        ? `Выполнена автотрассировка линий (сохранено ручных трасс: ${manualPreservedCount}).`
        : 'Выполнена автотрассировка линий без наложений и пересечения блоков.'
    );
  }, [activeSheetId, commitProject, appendLog]);

  const handleUpdateSheetFormat = useCallback(
    (sheetId: string, format: SheetFormat) => {
      const dims = SHEET_DIMENSIONS[format];
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        sheets: prev.sheets.map((s) =>
          s.id === sheetId ? { ...s, format, width: dims.width, height: dims.height } : s
        ),
      }));
      const currSheet = project.sheets.find((s) => s.id === sheetId);
      if (currSheet) {
        fitSheetToViewport({ ...currSheet, format, width: dims.width, height: dims.height });
      }
      appendLog('INFO', 'E3-CORE', `Изменён формат листа на ${format} (${dims.width}×${dims.height}).`);
    },
    [commitProject, project.sheets, fitSheetToViewport, appendLog]
  );

  const handleUpdateFontFamily = useCallback(
    (fontFamily: SchematicFontFamily) => {
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        visualSettings: { ...prev.visualSettings, fontFamily },
      }));
      appendLog('INFO', 'E3-CORE', `Шрифт схемы переключён на «${fontFamily}».`);
    },
    [commitProject, appendLog]
  );

  const handleApplyStamp = useCallback(
    (
      sheetId: string,
      patch: Partial<E3TitleBlock>,
      applyToAll: boolean,
      includeSheetTitleOnAll = false,
      applyFormToAll = false
    ) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'frame')) {
        appendLog('WARN', 'E3-CORE', 'Штамп не изменён: слой «Рамка и штамп ГОСТ» заблокирован.');
        return;
      }
      const shouldCopyForm = applyFormToAll || patch.stampForm === 'custom';
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        sheets: prev.sheets.map((s) => {
          if (s.id === sheetId) {
            return { ...s, titleBlock: { ...s.titleBlock, ...patch } };
          }
          if (applyToAll) {
            const sharedPatch: Partial<E3TitleBlock> = { ...patch };
            if (!shouldCopyForm) {
              // Preserve standard Form 1 / Form 2a split across sheets unless applying custom template or explicit form change
              delete sharedPatch.stampForm;
              delete sharedPatch.customTemplateId;
            }
            if (!includeSheetTitleOnAll) {
              delete sharedPatch.sheetTitle;
            }
            return { ...s, titleBlock: { ...s.titleBlock, ...sharedPatch } };
          }
          return s;
        }),
      }));

      fetch(`/api/v1/projects/${encodeURIComponent(project.id)}/sheets/${encodeURIComponent(sheetId)}/stamp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Flux-Client': clientIdRef.current },
        body: JSON.stringify({
          patch,
          applyToAll,
          includeSheetTitle: includeSheetTitleOnAll,
          applyFormToAll: shouldCopyForm,
        }),
      }).catch(() => {});

      appendLog(
        'SYNC',
        'E3-CORE',
        applyToAll
          ? `Обновлён штамп ГОСТ 2.104 на всех листах (${project.sheets.length}).`
          : 'Обновлён штамп ГОСТ 2.104 на выбранном листе.'
      );
    },
    [commitProject, project.id, project.sheets.length, appendLog]
  );

  const handleRestoreSheetRevision = useCallback(
    (sheetId: string, targetRevision: number) => {
      const cur = docStateRef.current.present;
      const sheet = cur.sheets.find((s) => s.id === sheetId);
      if (!sheet) return;
      const restored = restoreSheetFromRevision(cur, sheetId, targetRevision, {
        author: cur.author,
      });
      if (restored === cur) return;
      commitProject(() => restored, true, { skipSheetTracking: true });
      applySelection({});
      const nextSheet = restored.sheets.find((s) => s.id === sheetId) || sheet;
      appendLog(
        'INFO',
        'E3-CORE',
        `Лист «${sheet.name}» откачен к ревизии v${targetRevision} (новая ревизия v${getSheetRevisionNumber(nextSheet)}).`
      );
    },
    [commitProject, applySelection, appendLog]
  );

  const handleCommitInPlaceDeviceDesignation = useCallback(
    (deviceId: string, nextDesignation: string) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'devices')) return;
      const clean = nextDesignation.trim();
      if (!clean) return;
      const curDev = docStateRef.current.present.devices.find((d) => d.id === deviceId);
      if (!curDev || curDev.designation === clean) return;
      commitProject(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          devices: prev.devices.map((d) =>
            d.id === deviceId ? { ...d, designation: clean } : d
          ),
        }),
        true,
        { sheetSummary: `ОУО (на холсте): ${curDev.designation} → ${clean}` }
      );
      appendLog('INFO', 'E3-CORE', `ОУО изменено на холсте: ${curDev.designation} → ${clean}.`);
    },
    [commitProject, appendLog]
  );

  const handleCommitInPlaceWireNumber = useCallback(
    (wireId: string, nextWireNumber: string) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'wires')) return;
      const clean = nextWireNumber.trim();
      if (!clean) return;
      const curWire = docStateRef.current.present.wires.find((w) => w.id === wireId);
      if (!curWire || curWire.wireNumber === clean) return;
      commitProject(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          wires: prev.wires.map((w) =>
            w.id === wireId ? { ...w, wireNumber: clean } : w
          ),
        }),
        true,
        { sheetSummary: `Маркировка провода: ${curWire.wireNumber} → ${clean}` }
      );
      appendLog('INFO', 'E3-CORE', `Маркировка провода изменена на холсте: ${curWire.wireNumber} → ${clean}.`);
    },
    [commitProject, appendLog]
  );

  const handleCommitInPlaceAnnotationText = useCallback(
    (annId: string, nextText: string) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'annotations')) return;
      const clean = nextText.replace(/\r\n/g, '\n').trim();
      if (!clean) return;
      const curAnn = (docStateRef.current.present.annotations || []).find((a) => a.id === annId);
      if (!curAnn || curAnn.text === clean) return;
      commitProject(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          annotations: (prev.annotations || []).map((a) =>
            a.id === annId ? { ...a, text: clean } : a
          ),
        }),
        true,
        { sheetSummary: `Текст аннотации: «${clean.slice(0, 28)}»` }
      );
      appendLog('INFO', 'E3-CORE', `Аннотация изменена на холсте: «${clean.slice(0, 40)}».`);
    },
    [commitProject, appendLog]
  );

  const handleCommitInPlaceStampCell = useCallback(
    (sheetId: string, fieldKey: StampFieldKey, nextValue: string) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'frame')) return;
      const curSheet = docStateRef.current.present.sheets.find((s) => s.id === sheetId);
      if (!curSheet) return;
      const prevVal = String(curSheet.titleBlock[fieldKey] ?? '');
      const clean = nextValue.trim();
      if (prevVal === clean) return;
      commitProject(
        (prev) => ({
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          sheets: prev.sheets.map((s) =>
            s.id === sheetId
              ? { ...s, titleBlock: { ...s.titleBlock, [fieldKey]: clean } }
              : s
          ),
        }),
        true,
        { sheetSummary: `Штамп (${fieldKey}): «${clean.slice(0, 28)}»` }
      );
      appendLog('INFO', 'E3-CORE', `Графа штампа «${fieldKey}» обновлена на холсте: «${clean}».`);
    },
    [commitProject, appendLog]
  );

  const handleSaveCustomTemplate = useCallback(
    (template: GostStampTemplate) => {
      setCustomStampTemplates((prev) => {
        const idx = prev.findIndex((t) => t.id === template.id);
        const next = idx >= 0 ? prev.map((t) => (t.id === template.id ? template : t)) : [...prev, template];
        saveCustomStampTemplates(next);
        return next;
      });
      commitProject((prev) => {
        const existing = prev.customStampTemplates || [];
        const idx = existing.findIndex((t) => t.id === template.id);
        const nextTemplates =
          idx >= 0 ? existing.map((t) => (t.id === template.id ? template : t)) : [...existing, template];
        return {
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          customStampTemplates: nextTemplates,
        };
      });
      appendLog('INFO', 'E3-CORE', `Сохранён шаблон штампа «${template.name}» (${template.cells.length} граф).`);
    },
    [commitProject, appendLog]
  );

  const handleDeleteCustomTemplate = useCallback(
    (templateId: string) => {
      setCustomStampTemplates((prev) => {
        const next = prev.filter((t) => t.id !== templateId);
        saveCustomStampTemplates(next);
        return next;
      });
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        customStampTemplates: (prev.customStampTemplates || []).filter((t) => t.id !== templateId),
        sheets: prev.sheets.map((s) =>
          s.titleBlock.stampForm === 'custom' && s.titleBlock.customTemplateId === templateId
            ? {
                ...s,
                titleBlock: {
                  ...s.titleBlock,
                  stampForm: s.number > 1 ? 'form2a' : 'form1',
                  customTemplateId: undefined,
                },
              }
            : s
        ),
      }));
      appendLog('WARN', 'E3-CORE', 'Пользовательский шаблон штампа удалён.');
    },
    [commitProject, appendLog]
  );

  // Inbound Flux Studio Host / Sibling Apps API listener
  useEffect(() => {
    const dispatchCmd = (cmd: FluxCommandRequest, replyFn?: (resp: unknown) => void) => {
      const resp = executeFluxInboundCommand(cmd, docStateRef.current.present, {
        onUpdateStamp: (sheetId, patch, applyToAll) =>
          handleApplyStamp(sheetId, patch as Partial<E3TitleBlock>, applyToAll, false),
        onAddDevice: (payload) => {
          const des = String(payload.designation || nextUniqueDesignation(docStateRef.current.present.devices, 'K'));
          const cat = mergedCatalog[0];
          if (cat) handlePlaceCatalogItem({ ...cat, componentName: String(payload.componentName || cat.componentName) }, Number(payload.x) || 260, Number(payload.y) || 240);
          return { designation: des };
        },
        onRerouteWires: () => handleAutoRouteActiveSheetWires(),
      });
      setFluxBusMessages((prev) => [
        createFluxBusLogEntry(
          'inbound',
          'flux-studio',
          cmd.action,
          cmd.sourceApp || 'flux-host',
          'e3promax-ecad',
          resp.ok ? 'OK' : resp.error || 'ERR'
        ),
        ...prev.slice(0, 49),
      ]);
      replyFn?.(resp);
    };

    const onWindowMessage = (ev: MessageEvent) => {
      const d = ev.data;
      if (d && d.flux === 'module-rpc' && d.action && (!d.targetApp || d.targetApp === 'e3promax-ecad')) {
        dispatchCmd(
          {
            requestId: String(d.requestId || Date.now()),
            sourceApp: String(d.sourceApp || 'flux-parent'),
            action: d.action,
            payload: d.payload,
          },
          (resp) => {
            (ev.source as Window | null)?.postMessage({ flux: 'module-rpc-reply', ...((resp as object) || {}) }, '*');
          }
        );
      }
    };

    window.addEventListener('message', onWindowMessage);
    let busCh: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        busCh = new BroadcastChannel('flux-studio-bus');
        busCh.onmessage = (ev) => {
          const d = ev.data;
          if (d && d.flux === 'module-rpc' && d.action && (!d.targetApp || d.targetApp === 'e3promax-ecad')) {
            dispatchCmd(
              {
                requestId: String(d.requestId || Date.now()),
                sourceApp: String(d.sourceApp || 'flux-sibling'),
                action: d.action,
                payload: d.payload,
              },
              (resp) => busCh?.postMessage({ flux: 'module-rpc-reply', ...((resp as object) || {}) })
            );
          }
        };
      } catch {
        // ignore
      }
    }

    const offFluxOn = window.flux?.on?.('e3.command', (payload) => {
      const p = (payload as Record<string, unknown>) || {};
      if (typeof p.action === 'string') {
        dispatchCmd({
          requestId: String(p.requestId || Date.now()),
          sourceApp: String(p.sourceApp || 'window.flux'),
          action: p.action as FluxCommandRequest['action'],
          payload: (p.payload as Record<string, unknown>) || {},
        });
      }
    });

    return () => {
      window.removeEventListener('message', onWindowMessage);
      busCh?.close();
      offFluxOn?.();
    };
  }, [handleApplyStamp, handlePlaceCatalogItem, handleAutoRouteActiveSheetWires, mergedCatalog]);

  const handleBatchPublish = useCallback(
    async (options: BatchPublishOptions) => {
      const t0 = performance.now();
      const endpoint =
        options.format === 'pdf'
          ? `/api/v1/projects/${encodeURIComponent(project.id)}/publish/pdf`
          : `/api/v1/projects/${encodeURIComponent(project.id)}/publish/dxf`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...options, project }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Ошибка публикации (${res.status}): ${errText}`);
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      const ext =
        options.format === 'pdf' ? 'pdf' : options.format === 'dxf-zip' ? 'zip' : 'dxf';
      const mime =
        options.format === 'pdf'
          ? 'application/pdf'
          : options.format === 'dxf-zip'
            ? 'application/zip'
            : 'application/dxf';
      const filename = `${project.projectCode}-package.${ext}`;
      downloadBytes(filename, buf, mime);
      const dt = Math.round((performance.now() - t0) * 100) / 100;
      appendLog(
        'INFO',
        'CAD-DXF',
        `Выполнена пакетная публикация ${filename} (${options.sheetIds.length} л., ${Math.round(buf.length / 1024)} КБ).`,
        dt
      );
    },
    [project, appendLog]
  );

  const anyModalOpen =
    exchangeOpen ||
    visualOpen ||
    reportOpen ||
    portableOpen ||
    hvacWizardOpen ||
    catalogModalOpen ||
    publishModalOpen ||
    stampModalState.open;

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
        return;
      }
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if ((e.ctrlKey || e.metaKey) && key === 'c') {
        e.preventDefault();
        handleCopySelected();
      } else if ((e.ctrlKey || e.metaKey) && key === 'v') {
        e.preventDefault();
        handlePasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && key === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
      } else if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault();
        handleSelectAllOnSheet();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (!e.ctrlKey && !e.metaKey && key === 'r') {
        handleRotateSelected();
      } else if (e.key === 'Escape') {
        setHighlightedPotentialSeed(null);
        setTool('select');
      } else if (!e.ctrlKey && !e.metaKey && key === 'v') {
        setTool('select');
      } else if (!e.ctrlKey && !e.metaKey && key === 'w') {
        setTool('wire');
      } else if (!e.ctrlKey && !e.metaKey && key === 'h') {
        setTool('pan');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    anyModalOpen,
    handleUndo,
    handleRedo,
    handleCopySelected,
    handlePasteClipboard,
    handleDuplicateSelected,
    handleSelectAllOnSheet,
    handleDeleteSelected,
    handleRotateSelected,
  ]);

  // Export & Import handlers (.e3s OLE2 + XML + Flux Bridge)
  const handleExportE3sOle2 = async () => {
    const res = await ecadAsync.exportE3sOle2(project);
    downloadBytes(`${project.projectCode}.e3s`, res.bytes, 'application/x-e3s');
    appendLog(
      'INFO',
      'E3-XML',
      `Экспортирован контейнер E3.series ${project.projectCode}.e3s (OLE2 CFB, ${res.bytes.length} байт).`,
      res.durationMs
    );
  };

  const handleExportE3sXml = async () => {
    const res = await ecadAsync.exportXml(project);
    downloadText(`${project.projectCode}-xml.e3s`, res.xml, 'application/xml;charset=utf-8');
    appendLog('INFO', 'E3-XML', `Экспортирован файл E3 XML ${project.projectCode}-xml.e3s.`, res.durationMs);
  };

  const handleImportE3sBytes = useCallback(
    async (bytes: ArrayBuffer, filename: string) => {
      const t0 = performance.now();
      const lowerName = filename.toLowerCase();
      let importedProj: E3Project | null = null;
      let sourceKind = '';
      let discoveredStreams: string[] = [];
      let comLog = '';
      let durationMs = 0;

      let serverError: string | null = null;
      if (lowerName.endsWith('.e3s') || lowerName.endsWith('.e3d')) {
        try {
          const resp = await fetch(
            `/api/v1/projects/${encodeURIComponent(project.id)}/import/e3s?filename=${encodeURIComponent(filename)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body: bytes,
            }
          );
          if (resp.ok) {
            const data = await resp.json();
            if (data?.ok && data?.project) {
              importedProj = data.project as E3Project;
              sourceKind = String(data.sourceKind || 'e3s-server');
              discoveredStreams = Array.isArray(data.discoveredStreams) ? data.discoveredStreams : [];
              comLog = String(data.comLog || '');
              durationMs = Math.round((performance.now() - t0) * 100) / 100;
            }
          } else if (resp.status === 400) {
            const errData = await resp.json().catch(() => null);
            if (errData?.error) {
              serverError = String(errData.error);
            }
          }
        } catch {
          // Network/offline error: fall back to local Web Worker
        }
      }

      if (serverError) {
        throw new Error(serverError);
      }

      if (!importedProj) {
        const res = await ecadAsync.importE3sBytes(bytes, filename);
        importedProj = res.project;
        sourceKind = res.sourceKind;
        discoveredStreams = res.discoveredStreams;
        durationMs = res.durationMs;
      }

      commitProject(() => importedProj as E3Project, true, { skipSheetTracking: true });
      const sheetIds = importedProj.sheets.map((s) => s.id);
      if (sheetIds[0]) {
        setActiveSheetId(sheetIds[0]);
        setViewportSheetIds((prev) =>
          prev.map((_, vpIdx) => sheetIds[vpIdx % sheetIds.length] || sheetIds[0])
        );
        const firstSheet = importedProj.sheets[0];
        window.requestAnimationFrame(() => fitSheetToViewport(firstSheet, 0));
      }
      setSelectedDeviceId(importedProj.devices[0]?.id ?? null);
      setSelectedWireId(null);

      appendLog(
        'SYNC',
        sourceKind === 'e3s-com-native' ? 'E3-COM' : 'E3-XML',
        `Импортирован файл ${filename} (${sourceKind}): листов=${importedProj.sheets.length}, изд.=${importedProj.devices.length}, цепей=${importedProj.wires.length}, потоки [${discoveredStreams.join(', ')}].`,
        durationMs,
        comLog || undefined
      );
    },
    [project.id, commitProject, fitSheetToViewport, appendLog]
  );

  const handleExportFluxBridge = async () => {
    const res = await ecadAsync.exportFluxBundle(project);
    downloadText(
      `${project.projectCode}.flux-e3.json`,
      JSON.stringify(res.bundle, null, 2),
      'application/json;charset=utf-8'
    );
    appendLog('INFO', 'FLUX-BRIDGE', 'Экспортирован пакет обмена E3ProMax Bridge JSON.', res.durationMs);
  };

  const handleExportDxf = async () => {
    const res = await ecadAsync.exportDxf(project, activeSheetId);
    downloadText(`${project.projectCode}-sheet${activeSheet?.number || 1}.dxf`, res.dxf);
    appendLog('INFO', 'CAD-DXF', `Сформирован CAD-чертёж DXF для листа ${activeSheet?.number || 1}.`, res.durationMs);
  };

  const handleImportPayload = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (trimmed.startsWith('<')) {
      const res = await ecadAsync.importXml(trimmed);
      commitProject(() => res.project, true, { skipSheetTracking: true });
      const sheetIds = res.project.sheets.map((s) => s.id);
      if (sheetIds[0]) {
        setActiveSheetId(sheetIds[0]);
        setViewportSheetIds((prev) =>
          prev.map((_, vpIdx) => sheetIds[vpIdx % sheetIds.length] || sheetIds[0])
        );
        const firstSheet = res.project.sheets[0];
        window.requestAnimationFrame(() => fitSheetToViewport(firstSheet, 0));
      }
      appendLog(
        'SYNC',
        'E3-XML',
        `Импортирована модель E3 XML: ${res.project.devices.length} изд., ${res.project.wires.length} цепей.`,
        res.durationMs
      );
      return;
    }

    const parsed = JSON.parse(trimmed);
    if (parsed?.format === 'flux-e3-bridge/v1') {
      const merged = importFromFluxBridge(parsed as FluxBridgeBundle, project);
      commitProject(() => merged);
      appendLog('SYNC', 'FLUX-BRIDGE', `Синхронизирована модель из Flux Bridge (${merged.devices.length} изд.).`);
      return;
    }

    throw new Error('Ожидается файл E3 XML (<E3Project>) или Flux Bridge JSON (flux-e3-bridge/v1).');
  };

  const handleApplyVisualSettings = useCallback(
    (nextSettings: E3VisualSettings) => {
      commitProject((prev) => {
        const curLayers = resolveCadLayers(prev.layers, prev.visualSettings.showGostFrame);
        const syncedLayers =
          curLayers.frame.visible !== nextSettings.showGostFrame
            ? {
                ...curLayers,
                frame: { ...curLayers.frame, visible: nextSettings.showGostFrame },
              }
            : curLayers;
        return {
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          layers: syncedLayers,
          visualSettings: nextSettings,
        };
      });
      appendLog('SYNC', 'E3-CORE', `Применены и синхронизированы настройки визуализации «${nextSettings.presetName}».`);
    },
    [commitProject, appendLog]
  );

  const handlePatchVisualSettings = useCallback(
    (patch: Partial<E3VisualSettings>) => {
      const patchKey = Object.keys(patch).sort().join(',');
      commitCoalesced(`visual:${patchKey}`, (prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        visualSettings: { ...prev.visualSettings, ...patch },
      }));
    },
    [commitCoalesced]
  );

  const handleToggleLayerVisibility = useCallback(
    (layerId: CadLayerId) => {
      const curLayers = resolveCadLayers(
        docStateRef.current.present.layers,
        docStateRef.current.present.visualSettings.showGostFrame
      );
      const nextLayers = toggleLayerVisibility(curLayers, layerId);
      const nextVis = nextLayers[layerId].visible;
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        layers: nextLayers,
        visualSettings:
          layerId === 'frame'
            ? { ...prev.visualSettings, showGostFrame: nextVis }
            : prev.visualSettings,
      }));
      if (!nextVis) {
        if (layerId === 'devices') setSelectedDeviceId(null);
        else if (layerId === 'wires') setSelectedWireId(null);
        else if (layerId === 'annotations') setSelectedAnnotationId(null);
      }
      appendLog(
        'INFO',
        'E3-CORE',
        `Слой «${CAD_LAYER_DEFS[layerId].name}»: ${nextVis ? 'показан' : 'скрыт'}.`
      );
    },
    [commitProject, appendLog]
  );

  const handleToggleLayerLock = useCallback(
    (layerId: CadLayerId) => {
      const curLayers = resolveCadLayers(
        docStateRef.current.present.layers,
        docStateRef.current.present.visualSettings.showGostFrame
      );
      const nextLayers = toggleLayerLock(curLayers, layerId);
      const nextLocked = nextLayers[layerId].locked;
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        layers: nextLayers,
      }));
      appendLog(
        'INFO',
        'E3-CORE',
        `Слой «${CAD_LAYER_DEFS[layerId].name}»: ${nextLocked ? 'заблокирован' : 'разблокирован'}.`
      );
    },
    [commitProject, appendLog]
  );

  const handleShowAllLayers = useCallback(() => {
    commitProject((prev) => {
      const curLayers = resolveCadLayers(prev.layers, prev.visualSettings.showGostFrame);
      const nextLayers = setAllLayersVisible(curLayers, true);
      return {
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        layers: nextLayers,
        visualSettings: { ...prev.visualSettings, showGostFrame: true },
      };
    });
    appendLog('INFO', 'E3-CORE', 'Все слои чертежа отображены.');
  }, [commitProject, appendLog]);

  const handleUnlockAllLayers = useCallback(() => {
    commitProject((prev) => {
      const curLayers = resolveCadLayers(prev.layers, prev.visualSettings.showGostFrame);
      return {
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        layers: setAllLayersLocked(curLayers, false),
      };
    });
    appendLog('INFO', 'E3-CORE', 'Все слои чертежа разблокированы.');
  }, [commitProject, appendLog]);

  const handleRunStressBatch = (count: number) => {
    const t0 = performance.now();
    commitProject((prev) => generateStressBatch(prev, count));
    const dt = Math.round((performance.now() - t0) * 100) / 100;
    appendLog('INFO', 'WORKER', `Сгенерирован тестовый массив +${count} связанных элементов.`, dt);
  };

  const handleTestApiSyncPush = async () => {
    const t0 = performance.now();
    const res = await fetch(`/api/v1/projects/${encodeURIComponent(project.id)}/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        designation: nextUniqueDesignation(project.devices, 'KM'),
        componentName: 'Контактор синхронизации API 24VDC',
        article: 'LC1D25BD',
        manufacturer: 'Schneider Electric',
        sheetId: activeSheetId,
      }),
    });
    const dt = Math.round((performance.now() - t0) * 100) / 100;
    if (!res.ok) {
      appendLog('ERROR', 'SYNC-API', `Ошибка вызова API: HTTP ${res.status}`, dt);
      return;
    }
    const data = await res.json();
    if (data?.project) {
      suppressSyncPushRef.current = true;
      setProjectRemote(data.project);
      appendLog(
        'SYNC',
        'SYNC-API',
        `API Push выполнен: добавлен ${data.device?.designation}, ревизия ${data.project.revision}.`,
        dt
      );
    }
  };

  const [bridgeStatus, setBridgeStatus] = useState<E3BridgeStatusInfo>({
    isWin32: false,
    bridgeConnected: false,
    bridgeHost: null,
  });

  useEffect(() => {
    fetch('/api/v1/e3-bridge/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setBridgeStatus({
            isWin32: Boolean(data.isWin32),
            bridgeConnected: Boolean(data.bridgeConnected),
            bridgeHost: data.bridgeHost || null,
          });
        }
      })
      .catch(() => {});

    fetch('/api/v1/projects/current')
      .then((r) => (r.ok ? r.json() : null))
      .then((srvProj: E3Project | null) => {
        if (srvProj && srvProj.id && Array.isArray(srvProj.devices)) {
          setProjectRemote((curr) => {
            if (srvProj.revision > curr.revision || srvProj.id !== curr.id) {
              suppressSyncPushRef.current = true;
              if (srvProj.sheets[0]) setActiveSheetId(srvProj.sheets[0].id);
              return srvProj;
            }
            return curr;
          });
        }
      })
      .catch(() => {});

    fetch('/api/v1/diagnostics/logs')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.entries && Array.isArray(data.entries)) {
          setLogs((prev) => {
            const existing = new Set(prev.map((p) => p.id));
            const merged = [...prev];
            for (const entry of data.entries as ProcessLogEntry[]) {
              if (!existing.has(entry.id)) merged.push(entry);
            }
            return merged.slice(0, 400);
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleDirectOpenE3 = async (mode: 'build' | 'export' = 'build') => {
    // Sync latest client edits to server before triggering COM execution
    await fetch(`/api/v1/projects/${encodeURIComponent(project.id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Flux-Client': clientIdRef.current,
      },
      body: JSON.stringify(project),
    }).catch(() => {});

    const res = await fetch(`/api/v1/projects/${encodeURIComponent(project.id)}/e3-direct-open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (data?.ok) {
      appendLog(
        'SYNC',
        'E3-COM',
        data.execution === 'local-win32'
          ? `Встроенный COM-мост запустил E³.series на ${data.host}.`
          : `Задание ${data.jobId} отправлено на коннектор ПК (${data.host}) для открытия в E³.series.`,
        undefined,
        data.output || undefined
      );
    } else if (data?.execution === 'local-win32-error') {
      appendLog(
        'ERROR',
        'E3-COM',
        `Ошибка локального COM-моста: ${data.error || 'сбой cscript.exe'}`,
        undefined,
        data.details || undefined
      );
    } else {
      appendLog(
        'INFO',
        'E3-COM',
        'Встроенный COM-мост ожидает локального Windows-коннектора или запуска на Windows.'
      );
    }
    return data;
  };

  const handleUpdateFluxProjectKey = useCallback(
    (nextKey: string) => {
      const cleaned = nextKey.trim();
      if (!cleaned) return;
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        fluxProjectKey: cleaned,
      }));
      appendLog('SYNC', 'FLUX-BRIDGE', `Обновлён ключ проекта Flux Studio: ${cleaned}.`);
    },
    [commitProject, appendLog]
  );

  const handlePushToFluxHost = useCallback(
    async (overrideKey?: string): Promise<{ hosted: boolean; ok: boolean }> => {
      const targetProj =
        overrideKey && overrideKey.trim() && overrideKey.trim() !== project.fluxProjectKey
          ? { ...project, fluxProjectKey: overrideKey.trim() }
          : project;
      const hosted = await pushProjectToFluxHost(targetProj);
      let busOk = true;
      try {
        const res = await invokeFluxModule('flux-studio-host', 'e3.getBridgeBundle', {
          projectId: targetProj.id,
          fluxProjectKey: targetProj.fluxProjectKey,
        });
        busOk = res.ok;
        setFluxBusMessages((prev) => [
          createFluxBusLogEntry(
            'outbound',
            hosted ? 'window.flux' : res.via,
            'e3.getBridgeBundle',
            'e3promax-ecad',
            'flux-studio-host',
            `${targetProj.fluxProjectKey} · rev ${targetProj.revision}`
          ),
          ...prev.slice(0, 49),
        ]);
      } catch {
        busOk = false;
      }
      appendLog(
        'SYNC',
        'FLUX-BRIDGE',
        hosted
          ? `Проект ${targetProj.projectCode} (${targetProj.fluxProjectKey}) передан в активный Flux Host.`
          : `Проект ${targetProj.projectCode} (${targetProj.fluxProjectKey}) отправлен в шину Flux Studio.`
      );
      return { hosted, ok: hosted || busOk };
    },
    [project, appendLog]
  );

  const ercErrorCount = erc.filter((i) => i.severity === 'error').length;

  const isConsoleBottomSingle =
    dockLayout.panels.console.dock === 'bottom' &&
    getPanelsByDock(dockLayout, 'bottom').length === 1;

  const renderPanelContent = (panelId: PanelId) => {
    if (panelId === 'explorer') {
      return (
        <LeftExplorer
          project={project}
          catalog={mergedCatalog}
          activeSheetId={activeSheetId}
          selectedDeviceId={selectedDeviceId}
          activeTab={leftTab}
          onTabChange={setLeftTab}
          onSelectSheet={(id) => {
            setActiveSheetId(id);
            setViewportSheetIds((prev) =>
              prev.map((sId, idx) => (idx === activeViewportIdx ? id : sId))
            );
            setSelectedDeviceId(null);
            setSelectedWireId(null);
            setSelectedAnnotationId(null);
          }}
          onSelectDevice={(dev) => {
            setActiveSheetId(dev.sheetId);
            setViewportSheetIds((prev) =>
              prev.map((sId, idx) => (idx === activeViewportIdx ? dev.sheetId : sId))
            );
            setSelectedDeviceId(dev.id);
            setSelectedWireId(null);
            setSelectedAnnotationId(null);
          }}
          onPlaceCatalogItem={(item) => handlePlaceCatalogItem(item)}
          onOpenAddCatalogItem={() => {
            setEditingCatalogItem(null);
            setCatalogModalOpen(true);
          }}
          onEditCatalogItem={(item) => {
            setEditingCatalogItem(item);
            setCatalogModalOpen(true);
          }}
          onDeleteCustomCatalogItem={handleDeleteCustomCatalogItem}
          onOpenHvacWizard={() => setHvacWizardOpen(true)}
        />
      );
    }

    if (panelId === 'inspector') {
      return (
        <RightInspector
          project={project}
          activeSheet={activeSheet}
          customTemplates={mergedStampTemplates}
          selectedDevice={selectedDevice}
          selectedWire={selectedWire}
          selectedAnnotation={selectedAnnotation}
          selectedDeviceIds={selectedDeviceIds}
          selectedWireIds={selectedWireIds}
          selectedAnnotationIds={selectedAnnotationIds}
          onAlignDevices={handleAlignSelectedDevices}
          onRotateSelected={handleRotateSelected}
          onDuplicateSelected={handleDuplicateSelected}
          onDeleteSelected={handleDeleteSelected}
          onClearSelection={() => applySelection({})}
          onUpdateDevice={handleUpdateDevice}
          onSaveDeviceToCatalog={handleSaveDeviceToCatalog}
          onUpdateWire={(wireId, patch) => {
            if (isLayerLocked(docStateRef.current.present.layers, 'wires')) return;
            commitCoalesced(`wire:${wireId}:${Object.keys(patch).join(',')}`, (prev) => ({
              ...prev,
              revision: prev.revision + 1,
              wires: prev.wires.map((w) => (w.id === wireId ? { ...w, ...patch } : w)),
            }));
          }}
          onRerouteWire={handleRerouteWire}
          onDeleteWire={(wireId) => {
            if (isLayerLocked(docStateRef.current.present.layers, 'wires')) return;
            commitProject((prev) => ({
              ...prev,
              revision: prev.revision + 1,
              wires: prev.wires.filter((w) => w.id !== wireId),
            }));
            setSelectedWireIds((prev) => prev.filter((id) => id !== wireId));
          }}
          onUpdateAnnotation={handleUpdateAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          onUpdateSheetTitle={(sheetId, patch) => {
            if (isLayerLocked(docStateRef.current.present.layers, 'frame')) return;
            const isForm = 'stampForm' in patch || 'customTemplateId' in patch;
            const apply = (prev: E3Project): E3Project => ({
              ...prev,
              revision: prev.revision + 1,
              sheets: prev.sheets.map((s) =>
                s.id === sheetId ? { ...s, titleBlock: { ...s.titleBlock, ...patch } } : s
              ),
            });
            if (isForm) commitProject(apply);
            else commitCoalesced(`sheet:${sheetId}:${Object.keys(patch).join(',')}`, apply);
          }}
          onUpdateSheetFormat={handleUpdateSheetFormat}
          onUpdateFontFamily={handleUpdateFontFamily}
          onOpenStampEditor={(sheetId, field) => {
            if (isLayerLocked(docStateRef.current.present.layers, 'frame')) return;
            setStampModalState({ open: true, sheetId, mode: 'values', field: field || null });
          }}
          onOpenStampDesigner={(sheetId) =>
            setStampModalState({ open: true, sheetId, mode: 'designer', field: null })
          }
          onOpenBomPanel={() => {
            setConsoleTab('bom');
            setConsoleCollapsed(false);
          }}
          onToggleLayerLock={handleToggleLayerLock}
          onNavigateOffPage={handleNavigateOffPage}
          onCreateOffPageCounterpart={handleCreateOffPageCounterpart}
          onUpdateOffPageMeta={handleUpdateOffPageMeta}
          onHighlightPotential={(seed) => setHighlightedPotentialSeed(seed)}
          onRestoreSheetRevision={handleRestoreSheetRevision}
        />
      );
    }

    return (
      <BottomConsole
        project={project}
        activeTab={consoleTab}
        collapsed={consoleCollapsed}
        tabsPosition={isConsoleBottomSingle ? 'bottom' : 'top'}
        requestedApiSubTab={requestedApiSubTab}
        bom={bom}
        cables={cables}
        netLengths={netLengths}
        terminals={terminals}
        erc={erc}
        logs={logs}
        fluxBusMessages={fluxBusMessages}
        dockSide={dockLayout.panels.console.dock}
        onStartPanelDrag={
          isConsoleBottomSingle ? (e) => handleStartPanelDrag('console', e) : undefined
        }
        onMovePanelDock={
          isConsoleBottomSingle
            ? (side: DockSide) =>
                setDockLayout((prev) =>
                  movePanelDock(prev, 'console', side, undefined, window.innerWidth, window.innerHeight)
                )
            : undefined
        }
        onFluxBusLog={(entry) => setFluxBusMessages((prev) => [entry, ...prev.slice(0, 49)])}
        onSetTab={setConsoleTab}
        onExpandPanel={() => setConsoleCollapsed(false)}
        onToggleCollapse={() => setConsoleCollapsed((c) => !c)}
        onJumpToIssue={(issue) => {
          if (issue.sheetId) {
            setActiveSheetId(issue.sheetId);
            setViewportSheetIds((prev) =>
              prev.map((sId, idx) => (idx === activeViewportIdx ? issue.sheetId! : sId))
            );
          }
          if (issue.deviceId) {
            setSelectedDeviceId(issue.deviceId);
            setSelectedWireId(null);
            setSelectedAnnotationId(null);
          } else if (issue.wireId) {
            setSelectedWireId(issue.wireId);
            setSelectedDeviceId(null);
            setSelectedAnnotationId(null);
          }
        }}
        onSelectDeviceByDesignation={(designation) => {
          const dev = project.devices.find((d) => d.designation === designation);
          if (!dev) return;
          setActiveSheetId(dev.sheetId);
          setViewportSheetIds((prev) =>
            prev.map((sId, idx) => (idx === activeViewportIdx ? dev.sheetId : sId))
          );
          setSelectedDeviceId(dev.id);
          setSelectedWireId(null);
          setSelectedAnnotationId(null);
        }}
        onHighlightNet={(netName) => {
          setHighlightedPotentialSeed({ netName });
          const trace = traceConnectedPotential(project, { netName });
          const firstWire = project.wires.find((w) => trace.wireIds.includes(w.id));
          if (firstWire && firstWire.sheetId !== activeSheetId) {
            setActiveSheetId(firstWire.sheetId);
            setViewportSheetIds((prev) =>
              prev.map((sId, idx) => (idx === activeViewportIdx ? firstWire.sheetId : sId))
            );
          }
          appendLog(
            'INFO',
            'E3-CORE',
            `Подсветка потенциала «${netName}»: ${trace.segmentCount} уч., ${trace.totalLengthMm} мм, листов: ${trace.sheetIds.length}.`
          );
        }}
        onDownloadBomCsv={() => {
          downloadText(`${project.projectCode}-PE3.csv`, exportBomCsv(bom), 'text/csv;charset=utf-8');
          appendLog('INFO', 'E3-CORE', `Выгружена спецификация ${project.projectCode}-PE3.csv.`);
        }}
        onDownloadCablesCsv={() => {
          downloadText(
            `${project.projectCode}-cables.csv`,
            exportCableJournalCsv(cables, netLengths),
            'text/csv;charset=utf-8'
          );
          appendLog('INFO', 'E3-CORE', `Выгружен кабельный журнал ${project.projectCode}-cables.csv.`);
        }}
        onDownloadNetLengthsCsv={() => {
          downloadText(
            `${project.projectCode}-net-lengths.csv`,
            exportNetWireLengthsCsv(netLengths),
            'text/csv;charset=utf-8'
          );
          appendLog('INFO', 'E3-CORE', `Выгружена ведомость длин проводов по цепям ${project.projectCode}-net-lengths.csv.`);
        }}
        onOpenReportModal={() => setReportOpen(true)}
        onOpenFluxPublishModal={() => setFluxPublishOpen(true)}
        onClearLogs={() => setLogs([])}
        onTestApiSyncPush={handleTestApiSyncPush}
      />
    );
  };

  const leftPanels = getPanelsByDock(dockLayout, 'left');
  const rightPanels = getPanelsByDock(dockLayout, 'right');
  const topPanels = getPanelsByDock(dockLayout, 'top');
  const bottomPanels = getPanelsByDock(dockLayout, 'bottom');
  const floatingPanels = getPanelsByDock(dockLayout, 'floating');

  const renderDockBand = (panels: PanelConfig[], edge: DockEdge) => {
    if (panels.length === 0) return null;
    const isHorizBand = edge === 'bottom' || edge === 'top';
    const allCollapsed = panels.every((p) => p.collapsed);
    const useSideRail = !isHorizBand && panels.length === 1;
    const isBottomConsoleOnly =
      edge === 'bottom' && panels.length === 1 && panels[0].id === 'console';
    const rawBandSize = dockLayout.sizes[edge];
    const targetBandSize = allCollapsed
      ? isHorizBand
        ? isBottomConsoleOnly
          ? COLLAPSED_BOTTOM_TABS_HEIGHT
          : COLLAPSED_HEADER_HEIGHT
        : useSideRail
          ? COLLAPSED_SIDE_RAIL_WIDTH
          : 196
      : rawBandSize;
    const isResizingThis = resizingDockEdge === edge;

    const dividerClass =
      edge === 'left'
        ? 'border-r border-[var(--flux-line)]'
        : edge === 'right'
          ? 'border-l border-[var(--flux-line)]'
          : edge === 'bottom'
            ? isBottomConsoleOnly
              ? ''
              : 'border-t border-[var(--flux-line)]'
            : 'border-b border-[var(--flux-line)]';

    const band = (
      <motion.div
        data-testid={`dock-zone-${edge}`}
        data-collapsed={allCollapsed ? 'true' : 'false'}
        initial={false}
        animate={isHorizBand ? { height: targetBandSize } : { width: targetBandSize }}
        transition={isResizingThis ? { duration: 0 } : CAD_PANEL_TRANSITION}
        className={`no-print shrink-0 flex ${
          isHorizBand ? 'flex-row divide-x' : 'flex-col divide-y'
        } divide-[var(--flux-line)] min-w-0 min-h-0 overflow-hidden ${dividerClass}`}
      >
        {panels.map((p) => (
          <DockablePanelFrame
            key={p.id}
            panel={p}
            edge={edge}
            bandSize={rawBandSize}
            useSideRail={useSideRail}
            multiPanelInBand={panels.length > 1}
            hideHeaderBar={isBottomConsoleOnly && p.id === 'console'}
            isResizing={isResizingThis}
            className="flex-1"
            onStartDrag={handleStartPanelDrag}
            onMoveDock={(id, side: DockSide) =>
              setDockLayout((prev) =>
                movePanelDock(prev, id, side, undefined, window.innerWidth, window.innerHeight)
              )
            }
            onToggleCollapse={(id) => setDockLayout((prev) => togglePanelCollapse(prev, id))}
          >
            {renderPanelContent(p.id)}
          </DockablePanelFrame>
        ))}
      </motion.div>
    );

    const resizer = (
      <AnimatePresence initial={false}>
        {!allCollapsed && (
          <DockResizeHandle
            key={`resizer-${edge}`}
            edge={edge}
            onResizeStart={handleResizeDockEdgeStart}
          />
        )}
      </AnimatePresence>
    );

    if (edge === 'left' || edge === 'top') {
      return (
        <>
          {band}
          {resizer}
        </>
      );
    }

    return (
      <>
        {resizer}
        {band}
      </>
    );
  };

  const vpCount = viewportCountForMode(viewportLayout);
  const effectiveViewportSheets = computeViewportSheets(
    viewportLayout,
    project.sheets,
    viewportSheetIds,
    activeSheetId
  );

  const centerGridClass =
    viewportLayout === 'single'
      ? 'flex-1 min-w-0 min-h-0 flex'
      : viewportLayout === 'two'
        ? 'flex-1 min-w-0 min-h-0 grid grid-cols-2 gap-1.5 p-1.5 bg-[var(--flux-line)]/40'
        : 'flex-1 min-w-0 min-h-0 grid grid-cols-2 grid-rows-2 gap-1.5 p-1.5 bg-[var(--flux-line)]/40';

  const workspaceBoundsRect = workspaceRef.current?.getBoundingClientRect();

  return (
    <MotionConfig reducedMotion="user">
    <div
      data-testid="app-shell"
      className="h-screen w-full max-w-full overflow-hidden flex flex-col bg-[var(--flux-bg)] text-[var(--flux-text)]"
    >
      <TopToolbar
        project={project}
        activeSheet={activeSheet}
        tool={tool}
        zoom={zoom}
        viewportLayout={viewportLayout}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        hasSelection={selectedDeviceIds.length > 0 || selectedWireIds.length > 0 || selectedAnnotationIds.length > 0}
        hasClipboard={hasClipboard}
        ercErrorCount={ercErrorCount}
        isBusy={isBusy}
        e3BridgeHost={bridgeStatus.isWin32 ? 'Windows' : bridgeStatus.bridgeConnected ? bridgeStatus.bridgeHost : null}
        fluxHosted={fluxHostStatus.hostedInFlux}
        onSetTool={setTool}
        onSetViewportLayout={handleSetViewportLayout}
        onResetDockLayout={() => {
          setDockLayout(
            clampDockLayoutToViewport(
              createDefaultDockLayout(),
              typeof window !== 'undefined' ? window.innerWidth : 1440,
              typeof window !== 'undefined' ? window.innerHeight : 900
            )
          );
          appendLog('INFO', 'E3-CORE', 'Расположение окон и панелей сброшено к стандартному.');
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopySelected={handleCopySelected}
        onPasteClipboard={handlePasteClipboard}
        onDuplicateSelected={handleDuplicateSelected}
        onRotateSelected={handleRotateSelected}
        onDeleteSelected={handleDeleteSelected}
        onZoomChange={setZoom}
        onFitView={() => fitSheetToViewport(undefined, activeViewportIdx)}
        onToggleGrid={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            showGrid: !project.visualSettings.showGrid,
          })
        }
        onToggleSnapToGrid={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            snapToGrid: !project.visualSettings.snapToGrid,
          })
        }
        onToggleCrosshair={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            showCrosshair: !(project.visualSettings.showCrosshair !== false),
          })
        }
        onChangeGridSize={(gridSize) =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            gridSize,
          })
        }
        onToggleFrame={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            showGostFrame: !project.visualSettings.showGostFrame,
          })
        }
        onTogglePinNumbers={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            showPinNumbers: !project.visualSettings.showPinNumbers,
          })
        }
        onToggleWireNumbers={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            showWireNumbers: !project.visualSettings.showWireNumbers,
          })
        }
        onToggleCrossRefs={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            showCrossRefs: !project.visualSettings.showCrossRefs,
          })
        }
        onUpdateSheetFormat={handleUpdateSheetFormat}
        onUpdateFontFamily={handleUpdateFontFamily}
        onUpdateVisualSettings={handlePatchVisualSettings}
        onDuplicateSheet={handleDuplicateSheet}
        onDeleteSheet={handleDeleteSheet}
        onRunErc={() => {
          setConsoleTab('erc');
          setConsoleCollapsed(false);
        }}
        onGenerateBom={() => {
          setConsoleTab('bom');
          setConsoleCollapsed(false);
          appendLog('INFO', 'E3-CORE', `Открыта спецификация ПЭ3 (${bom.length} позиций).`);
        }}
        onDirectOpenE3={async () => {
          const res = await handleDirectOpenE3('build');
          if (!res?.ok) setExchangeOpen(true);
        }}
        onImportE3sFile={async (file) => {
          try {
            const buf = await file.arrayBuffer();
            await handleImportE3sBytes(buf, file.name);
          } catch (err) {
            appendLog(
              'ERROR',
              'E3-XML',
              `Не удалось открыть файл ${file.name}: ${err instanceof Error ? err.message : String(err)}`
            );
            setConsoleTab('logs');
            setConsoleCollapsed(false);
          }
        }}
        onOpenExchangeModal={() => setExchangeOpen(true)}
        onOpenVisualModal={() => setVisualOpen(true)}
        onOpenReportModal={() => setReportOpen(true)}
        onOpenPortableBuild={() => setPortableOpen(true)}
        onOpenHvacWizard={() => setHvacWizardOpen(true)}
        onAutoRouteWires={handleAutoRouteActiveSheetWires}
        onToggleTheme={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            theme: project.visualSettings.theme === 'dark' ? 'light' : 'dark',
          })
        }
        onDownloadCodebase={() => {
          window.location.assign('/api/export/codebase');
        }}
        onDownloadFluxStudioZip={() => {
          window.location.assign(`/api/export/flux-studio?projectId=${encodeURIComponent(project.id)}`);
          appendLog('INFO', 'FLUX-BRIDGE', 'Сформирован архив подпрограммы Flux Studio (.zip).');
        }}
        onOpenFluxPublishModal={() => setFluxPublishOpen(true)}
        onPushToFluxHost={() => {
          void handlePushToFluxHost();
        }}
        onOpenFluxBusConsole={() => {
          setConsoleTab('api');
          setRequestedApiSubTab('flux-internal');
          setConsoleCollapsed(false);
        }}
        onExportE3sOle2={handleExportE3sOle2}
        onExportE3sXml={handleExportE3sXml}
        onExportFluxBridge={handleExportFluxBridge}
        onDownloadBomCsv={() => {
          downloadText(`${project.projectCode}-PE3.csv`, exportBomCsv(bom), 'text/csv;charset=utf-8');
          appendLog('INFO', 'E3-CORE', `Выгружена спецификация ${project.projectCode}-PE3.csv.`);
        }}
        onDownloadCablesCsv={() => {
          downloadText(
            `${project.projectCode}-cables.csv`,
            exportCableJournalCsv(cables, netLengths),
            'text/csv;charset=utf-8'
          );
          appendLog('INFO', 'E3-CORE', `Выгружен кабельный журнал ${project.projectCode}-cables.csv.`);
        }}
        onDownloadLogsJson={() => {
          downloadText(
            `e3promax-logs-${Date.now()}.json`,
            JSON.stringify(logs, null, 2),
            'application/json;charset=utf-8'
          );
        }}
        onRunStressBatch={handleRunStressBatch}
        onOpenAddCatalogItem={() => {
          setEditingCatalogItem(null);
          setCatalogModalOpen(true);
        }}
        onOpenCatalogTab={() => {
          setLeftTab('library');
          setDockLayout((prev) =>
            prev.panels.explorer.collapsed ? togglePanelCollapse(prev, 'explorer') : prev
          );
        }}
        onAddSheet={handleAddSheet}
        onExportDxf={handleExportDxf}
        onOpenStampEditor={() => {
          if (isLayerLocked(docStateRef.current.present.layers, 'frame')) {
            appendLog('WARN', 'E3-CORE', 'Слой «Рамка и штамп ГОСТ» заблокирован.');
            return;
          }
          setStampModalState({
            open: true,
            sheetId: activeSheet?.id || project.sheets[0]?.id || 'sheet-1',
            mode: 'values',
            field: null,
          });
        }}
        onOpenStampDesigner={() =>
          setStampModalState({
            open: true,
            sheetId: activeSheet?.id || project.sheets[0]?.id || 'sheet-1',
            mode: 'designer',
            field: null,
          })
        }
        onOpenPublishModal={() => setPublishModalOpen(true)}
        onToggleLayerVisibility={handleToggleLayerVisibility}
        onToggleLayerLock={handleToggleLayerLock}
        onShowAllLayers={handleShowAllLayers}
        onUnlockAllLayers={handleUnlockAllLayers}
      />

      {/* Dockable Workspace Shell */}
      <div ref={workspaceRef} className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {renderDockBand(topPanels, 'top')}

        <main className="flex-1 min-h-0 flex overflow-hidden">
          {renderDockBand(leftPanels, 'left')}

          {/* Center Multi-Viewport Area (1, 2, 3, or 4 Sheets) */}
          <div data-testid="center-viewports" data-layout={viewportLayout} className={centerGridClass}>
            {Array.from({ length: vpCount }, (_, idx) => {
              const vpSheetId = effectiveViewportSheets[idx] || activeSheetId;
              const vpTr = viewportTransforms[idx] || { zoom: 0.42, pan: { x: 20, y: 12 } };
              const spanClass =
                viewportLayout === 'single'
                  ? 'flex-1 w-full h-full flex min-h-0 min-w-0'
                  : viewportLayout === 'three' && idx === 0
                    ? 'row-span-2 w-full h-full flex min-h-0 min-w-0'
                    : 'w-full h-full flex min-h-0 min-w-0';
              return (
                <div key={idx} className={spanClass}>
                  <SchematicCanvas
                    project={project}
                    catalog={mergedCatalog}
                    activeSheetId={vpSheetId}
                    viewportIndex={idx}
                    isMultiViewport={viewportLayout !== 'single'}
                    isFocused={activeViewportIdx === idx}
                    tool={tool}
                    zoom={vpTr.zoom}
                    pan={vpTr.pan}
                    layers={project.layers}
                    selectedDeviceId={selectedDeviceId}
                    selectedWireId={selectedWireId}
                    selectedAnnotationId={selectedAnnotationId}
                    selectedDeviceIds={selectedDeviceIds}
                    selectedWireIds={selectedWireIds}
                    selectedAnnotationIds={selectedAnnotationIds}
                    onFocusViewport={() => {
                      setActiveViewportIdx(idx);
                      setActiveSheetId(vpSheetId);
                    }}
                    onFitViewport={() => {
                      const sh = project.sheets.find((s) => s.id === vpSheetId);
                      if (sh) fitSheetToViewport(sh, idx);
                    }}
                    onSelectSheet={(id) => {
                      setActiveViewportIdx(idx);
                      setActiveSheetId(id);
                      setViewportSheetIds((prev) =>
                        prev.map((sId, sIdx) => (sIdx === idx ? id : sId))
                      );
                      const target = project.sheets.find((s) => s.id === id);
                      if (target) fitSheetToViewport(target, idx);
                    }}
                    onAddSheet={handleAddSheet}
                    onSetTool={setTool}
                    onSetZoom={(nextZ) =>
                      setViewportTransforms((prev) => ({
                        ...prev,
                        [idx]: { zoom: nextZ, pan: prev[idx]?.pan || { x: 20, y: 12 } },
                      }))
                    }
                    onSetPan={(nextPan) =>
                      setViewportTransforms((prev) => ({
                        ...prev,
                        [idx]: { zoom: prev[idx]?.zoom ?? 0.45, pan: nextPan },
                      }))
                    }
                    onSetTransform={(nextZ, nextPan) =>
                      setViewportTransforms((prev) => ({
                        ...prev,
                        [idx]: { zoom: nextZ, pan: nextPan },
                      }))
                    }
                    onToggleGrid={() =>
                      handleApplyVisualSettings({
                        ...project.visualSettings,
                        showGrid: !project.visualSettings.showGrid,
                      })
                    }
                    onToggleSnapToGrid={() =>
                      handleApplyVisualSettings({
                        ...project.visualSettings,
                        snapToGrid: !project.visualSettings.snapToGrid,
                      })
                    }
                    onToggleSmartGuides={() =>
                      handleApplyVisualSettings({
                        ...project.visualSettings,
                        smartGuides: !(project.visualSettings.smartGuides !== false),
                      })
                    }
                    onToggleCrosshair={() =>
                      handleApplyVisualSettings({
                        ...project.visualSettings,
                        showCrosshair: !(project.visualSettings.showCrosshair !== false),
                      })
                    }
                    onToggleLayerVisibility={handleToggleLayerVisibility}
                    onToggleLayerLock={handleToggleLayerLock}
                    onShowAllLayers={handleShowAllLayers}
                    onUnlockAllLayers={handleUnlockAllLayers}
                    onSelectDevice={(id, opts) => {
                      if (!id) {
                        applySelection({});
                        return;
                      }
                      if (opts?.toggle) {
                        setSelectedDeviceIds((prev) => toggleIdInSelection(prev, id));
                      } else {
                        applySelection({ deviceIds: [id] });
                      }
                    }}
                    onSelectWire={(id, opts) => {
                      if (!id) {
                        applySelection({});
                        return;
                      }
                      if (opts?.toggle) {
                        setSelectedWireIds((prev) => toggleIdInSelection(prev, id));
                      } else {
                        applySelection({ wireIds: [id] });
                      }
                    }}
                    onSelectAnnotation={(id, opts) => {
                      if (!id) {
                        applySelection({});
                        return;
                      }
                      if (opts?.toggle) {
                        setSelectedAnnotationIds((prev) => toggleIdInSelection(prev, id));
                      } else {
                        applySelection({ annotationIds: [id] });
                      }
                    }}
                    onSetSelection={(next, additive) => {
                      if (additive) {
                        setSelectedDeviceIds((prev) =>
                          Array.from(new Set([...prev, ...next.deviceIds]))
                        );
                        setSelectedWireIds((prev) =>
                          Array.from(new Set([...prev, ...next.wireIds]))
                        );
                        setSelectedAnnotationIds((prev) =>
                          Array.from(new Set([...prev, ...next.annotationIds]))
                        );
                      } else {
                        applySelection(next);
                      }
                    }}
                    onBeginDrag={handleBeginDrag}
                    onCommitDrag={handleCommitDrag}
                    highlightedTrace={highlightedTrace}
                    onHighlightPotential={(seed) => setHighlightedPotentialSeed(seed)}
                    onClearPotentialHighlight={() => setHighlightedPotentialSeed(null)}
                    onNavigateOffPage={handleNavigateOffPage}
                    onCreateOffPageAt={handleCreateOffPageAt}
                    onCreateAnnotation={handleCreateAnnotation}
                    onMoveAnnotation={handleMoveAnnotation}
                    onMoveDevice={handleMoveDevice}
                    onPreviewWireWaypoints={handlePreviewWireWaypoints}
                    onCreateWire={handleCreateWire}
                    onDropCatalogItem={(item, x, y, shId) => handlePlaceCatalogItem(item, x, y, shId)}
                    onOpenStampEditor={(sheetId, fieldKey) => {
                      if (isLayerLocked(docStateRef.current.present.layers, 'frame')) return;
                      setStampModalState({ open: true, sheetId, mode: 'values', field: fieldKey || null });
                    }}
                    onCommitInPlaceDeviceDesignation={handleCommitInPlaceDeviceDesignation}
                    onCommitInPlaceWireNumber={handleCommitInPlaceWireNumber}
                    onCommitInPlaceAnnotationText={handleCommitInPlaceAnnotationText}
                    onCommitInPlaceStampCell={handleCommitInPlaceStampCell}
                  />
                </div>
              );
            })}
          </div>

          {renderDockBand(rightPanels, 'right')}
        </main>

        {renderDockBand(bottomPanels, 'bottom')}

        {/* Floating Undocked Panels */}
        <AnimatePresence initial={false}>
          {floatingPanels.map((fp) => (
            <FloatingPanelWindow
              key={fp.id}
              panel={fp}
              isResizing={resizingDockEdge === 'floating'}
              onStartDrag={handleStartPanelDrag}
              onResizeFloatingStart={handleResizeFloatingStart}
              onMoveDock={(id, side) =>
                setDockLayout((prev) =>
                  movePanelDock(prev, id, side, undefined, window.innerWidth, window.innerHeight)
                )
              }
              onToggleCollapse={(id) => setDockLayout((prev) => togglePanelCollapse(prev, id))}
            >
              {renderPanelContent(fp.id)}
            </FloatingPanelWindow>
          ))}
        </AnimatePresence>

        {/* Live Dock Drop Targets while dragging panel headers */}
        <DockDropOverlay
          drag={panelDrag}
          bounds={
            workspaceBoundsRect
              ? {
                  left: workspaceBoundsRect.left,
                  top: workspaceBoundsRect.top,
                  width: workspaceBoundsRect.width,
                  height: workspaceBoundsRect.height,
                }
              : null
          }
        />
      </div>

      <ExchangeModal
        open={exchangeOpen}
        project={project}
        bridgeStatus={bridgeStatus}
        onClose={() => setExchangeOpen(false)}
        onDirectOpenE3={handleDirectOpenE3}
        onDownloadConnector={() => {
          window.location.assign('/api/v1/e3-bridge/connector.cmd');
          appendLog('INFO', 'E3-XML', 'Скачан фоновый коннектор E3ProMax_Connector.cmd для Windows.');
        }}
        onExportE3sOle2={handleExportE3sOle2}
        onExportE3sXml={handleExportE3sXml}
        onExportFluxBridge={handleExportFluxBridge}
        onExportDxf={handleExportDxf}
        onDownloadFluxStudioZip={() => {
          window.location.assign(`/api/export/flux-studio?projectId=${encodeURIComponent(project.id)}`);
          appendLog('INFO', 'FLUX-BRIDGE', 'Сформирован архив подпрограммы Flux Studio (.zip).');
        }}
        onDownloadCodebaseZip={() => {
          window.location.assign('/api/export/codebase');
          appendLog('INFO', 'E3-CORE', 'Запущена загрузка полного архива исходного кода (.zip).');
        }}
        onOpenPortableBuild={() => setPortableOpen(true)}
        onImportBytes={handleImportE3sBytes}
        onImportPayload={handleImportPayload}
      />

      <VisualSettingsModal
        open={visualOpen}
        settings={project.visualSettings}
        onClose={() => setVisualOpen(false)}
        onApply={handleApplyVisualSettings}
      />

      <ReportModal
        open={reportOpen}
        project={project}
        bom={bom}
        cables={cables}
        netLengths={netLengths}
        erc={erc}
        onClose={() => setReportOpen(false)}
      />

      <PortableBuildModal
        open={portableOpen}
        project={project}
        onClose={() => setPortableOpen(false)}
        onBuildFinished={(summary) => {
          appendLog(
            'INFO',
            'PORTABLE',
            `Собрана Portable-версия ${summary.filename} (${Math.round(summary.zipBytes / 1024)} КБ).`,
            summary.durationMs,
            summary.buildLogs?.join('\n')
          );
        }}
      />

      <CatalogItemModal
        open={catalogModalOpen}
        editingItem={editingCatalogItem}
        onClose={() => setCatalogModalOpen(false)}
        onSave={handleSaveCustomCatalogItem}
      />

      <HvacWizardModal
        open={hvacWizardOpen}
        project={project}
        catalog={mergedCatalog}
        onClose={() => setHvacWizardOpen(false)}
        onBuild={handleBuildHvacDiagram}
      />

      <StampEditorModal
        open={stampModalState.open}
        project={project}
        customTemplates={mergedStampTemplates}
        initialSheetId={stampModalState.sheetId}
        initialMode={stampModalState.mode}
        focusedField={stampModalState.field}
        onClose={() => setStampModalState((prev) => ({ ...prev, open: false }))}
        onApplyStamp={handleApplyStamp}
        onSaveCustomTemplate={handleSaveCustomTemplate}
        onDeleteCustomTemplate={handleDeleteCustomTemplate}
      />

      <PublishModal
        open={publishModalOpen}
        project={project}
        activeSheetId={activeSheetId}
        onClose={() => setPublishModalOpen(false)}
        onPublish={handleBatchPublish}
      />

      <FluxStudioPublishModal
        open={fluxPublishOpen}
        project={project}
        onClose={() => setFluxPublishOpen(false)}
        onUpdateFluxProjectKey={handleUpdateFluxProjectKey}
        onPushToFluxHost={handlePushToFluxHost}
        onDownloadFluxPackageSuccess={(filename, manifestId, version) => {
          appendLog(
            'SYNC',
            'FLUX-BRIDGE',
            `Опубликован пакет Flux Studio: ${filename} (${manifestId} v${version}).`
          );
        }}
      />
    </div>
    </MotionConfig>
  );
}
