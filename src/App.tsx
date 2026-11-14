import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { BottomConsole, type ApiSubTab, type ConsoleTab } from './components/BottomConsole';
import { CatalogItemModal } from './components/CatalogItemModal';
import {
  type ActivePanelDrag,
  CAD_PANEL_TRANSITION,
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
import { TerminalStripModal } from './components/TerminalStripModal';
import { AutoNumberingModal } from './components/AutoNumberingModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { SystemHealthDashboard } from './components/SystemHealthDashboard';
import { SymbolWorkspaceCanvas } from './components/SymbolWorkspaceCanvas';
import { type CadTool, TopToolbar } from './components/TopToolbar';
import {
  clampDockLayoutToViewport,
  closeSheetTab,
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
  ensureSheetTabOpen,
  getPanelsByDock,
  loadDockLayout,
  movePanelDock,
  rescaleDockLayoutForUiScale,
  resizeDockEdge,
  saveDockLayout,
  syncOpenSheetIds,
  togglePanelCollapse,
  updateFloatingRect,
  viewportCountForMode,
} from './core/dockLayout';
import {
  applyUiScaleToDocument,
  getScaledChromeMetrics,
  loadUiScale,
  saveUiScale,
  uiScaleFactor,
  type UiScalePercent,
} from './core/uiScale';
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
  describeInteractiveTarget,
  formatScreenSnapshot,
  type PerfSnapshot,
} from './core/diagTelemetry';
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
  CustomSymbolShape,
  CustomSymbolSpec,
  DeviceCategory,
  E3Annotation,
  E3Attribute,
  E3Device,
  E3Pin,
  E3Project,
  E3Sheet,
  E3SymbolDef,
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
  buildSymbolDesignerPreset,
  normalizeCustomSymbolSpec,
  type SymbolEditorTool,
  type SymbolPresetId,
} from './core/symbolDesigner';
import {
  applyAttributeTemplate,
  buildSymbolDefFromCatalogItem,
  duplicateCatalogItemAsCopy,
  duplicateSymbolDefAsCopy,
  extractBuiltInSymbolShapes,
  getBuiltInSymbolLibrary,
  loadCustomSymbols,
  mergeSymbolLibrary,
  mirrorSymbolGeometryX,
  mirrorSymbolGeometryY,
  rotateSymbolGeometryCW,
  saveCustomSymbols,
} from './core/symbolLibrary';
import type {
  SymbolActiveDrawStyle,
  SymbolWorkspaceActions,
  SymbolWorkspaceDraft,
} from './core/symbolWorkspaceTypes';
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
  getSheetRevisionLabel,
  getSheetRevisionNumber,
  normalizeProjectSheetRevisions,
  releaseSheetRevision,
  restoreSheetFromRevision,
} from './core/sheetRevisions';
import { findSmartCatalogSpot } from './core/smartSnap';
import { generateOrUpdateTerminalStripSheet } from './core/terminalStrip';
import {
  buildCommandPaletteItems,
  type CommandLineResolution,
  type CommandPaletteItem,
  resolveCommandLineInput,
} from './core/commandPalette';
import {
  BOM_TABLE_TOTAL_WIDTH,
  CABLE_TABLE_TOTAL_WIDTH,
  buildGostTableRenderModel,
} from './core/gostTables';
import {
  hydrateProjectDefaults,
  loadActiveSession,
  loadRecentProjects,
  type RecentProjectEntry,
  removeRecentProject,
  saveActiveSession,
} from './core/sessionStorage';
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
  const initialSessionRef = useRef<ReturnType<typeof loadActiveSession> | undefined>(undefined);
  if (initialSessionRef.current === undefined) {
    initialSessionRef.current = loadActiveSession();
  }
  const [docState, setDocState] = useState<{
    past: E3Project[];
    present: E3Project;
    future: E3Project[];
  }>(() => ({
    past: [],
    present: initialSessionRef.current?.project || createSeedProject(),
    future: [],
  }));
  const docStateRef = useRef(docState);
  docStateRef.current = docState;
  const project = docState.present;
  const history = docState.past;
  const future = docState.future;

  const [activeSheetId, setActiveSheetId] = useState<string>(
    () => initialSessionRef.current?.activeSheetId || 'sheet-1'
  );
  const activeSheetIdRef = useRef(activeSheetId);
  activeSheetIdRef.current = activeSheetId;
  const [openSheetIds, setOpenSheetIds] = useState<string[]>(() =>
    docState.present.sheets.map((s) => s.id)
  );
  const openSheetIdsRef = useRef(openSheetIds);
  openSheetIdsRef.current = openSheetIds;
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>(() => loadRecentProjects());
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    () => initialSessionRef.current?.savedAt || null
  );
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
  const [tool, setToolState] = useState<CadTool>('select');

  const highlightedTrace = useMemo<PotentialTraceResult | null>(() => {
    if (!highlightedPotentialSeed) return null;
    const res = traceConnectedPotential(project, highlightedPotentialSeed);
    return res.wireIds.length > 0 || res.offPageDeviceIds.length > 0 ? res : null;
  }, [highlightedPotentialSeed, project]);

  // Multi-viewport state (1, 2, 3, or 4 simultaneous sheets in center)
  const [viewportLayout, setViewportLayout] = useState<ViewportLayoutMode>('single');
  const viewportLayoutRef = useRef(viewportLayout);
  viewportLayoutRef.current = viewportLayout;
  const [viewportSheetIds, setViewportSheetIds] = useState<string[]>(['sheet-1', 'sheet-2', 'sheet-3', 'sheet-1']);
  const viewportSheetIdsRef = useRef(viewportSheetIds);
  viewportSheetIdsRef.current = viewportSheetIds;
  const [activeViewportIdx, setActiveViewportIdx] = useState<number>(0);
  const activeViewportIdxRef = useRef(activeViewportIdx);
  activeViewportIdxRef.current = activeViewportIdx;
  const [viewportTransforms, setViewportTransforms] = useState<
    Record<number, { zoom: number; pan: { x: number; y: number } }>
  >({
    0: { zoom: 0.56, pan: { x: 46, y: 12 } },
    1: { zoom: 0.36, pan: { x: 20, y: 12 } },
    2: { zoom: 0.36, pan: { x: 20, y: 12 } },
    3: { zoom: 0.36, pan: { x: 20, y: 12 } },
  });
  const viewportTransformsRef = useRef(viewportTransforms);
  viewportTransformsRef.current = viewportTransforms;
  const cameraAnimRef = useRef<Record<number, number>>({});

  // UI Scale (100% / 120% / 140% / 160% / 180%)
  const [uiScale, setUiScale] = useState<UiScalePercent>(() => loadUiScale());
  const uiScaleRef = useRef<UiScalePercent>(uiScale);
  uiScaleRef.current = uiScale;

  useEffect(() => {
    applyUiScaleToDocument(uiScale);
    saveUiScale(uiScale);
  }, [uiScale]);

  // Dockable & resizable panel layout (clamped to real viewport & UI scale on mount & resize)
  const [dockLayout, setDockLayout] = useState<DockLayoutState>(() => {
    const factor = uiScaleFactor(loadUiScale());
    const loaded = loadDockLayout(undefined, undefined, undefined, factor);
    if (typeof window !== 'undefined') {
      return clampDockLayoutToViewport(loaded, window.innerWidth, window.innerHeight, factor);
    }
    return loaded;
  });
  const [panelDrag, setPanelDrag] = useState<ActivePanelDrag | null>(null);
  const [resizingDockEdge, setResizingDockEdge] = useState<DockEdge | 'floating' | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const handleChangeUiScale = useCallback((nextScale: UiScalePercent) => {
    setUiScale((prevScale) => {
      if (prevScale === nextScale) return prevScale;
      applyUiScaleToDocument(nextScale);
      setDockLayout((prevLayout) =>
        rescaleDockLayoutForUiScale(
          prevLayout,
          prevScale,
          nextScale,
          typeof window !== 'undefined' ? window.innerWidth : 1440,
          typeof window !== 'undefined' ? window.innerHeight : 900
        )
      );
      return nextScale;
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveDockLayout(dockLayout);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [dockLayout]);

  useEffect(() => {
    const onResize = () => {
      const factor = uiScaleFactor(uiScaleRef.current);
      setDockLayout((prev) => clampDockLayoutToViewport(prev, window.innerWidth, window.innerHeight, factor));
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
  const [terminalEditorOpen, setTerminalEditorOpen] = useState(false);
  const [autoNumberModalOpen, setAutoNumberModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteInitialQuery, setCommandPaletteInitialQuery] = useState('');
  const [healthOpen, setHealthOpen] = useState(false);
  const [perfSnapshot, setPerfSnapshot] = useState<PerfSnapshot>({
    fps: 60,
    lastFrameDeltaMs: 16.7,
    maxFrameDeltaMs: 16.7,
    longTaskCount: 0,
    jankFramesCount: 0,
    memoryUsedMb: null,
    memoryLimitMb: null,
  });
  const perfRef = useRef<PerfSnapshot>(perfSnapshot);
  const getScreenSnapshotRef = useRef<() => string>(() => '');
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
  const [customSymbols, setCustomSymbols] = useState<E3SymbolDef[]>(() => loadCustomSymbols());
  const mergedSymbolLibrary = useMemo(
    () =>
      mergeSymbolLibrary(
        getBuiltInSymbolLibrary(mergedCatalog),
        mergeSymbolLibrary(project.symbolLibrary || [], customSymbols)
      ),
    [mergedCatalog, project.symbolLibrary, customSymbols]
  );

  type SymbolGeoSnapshot = {
    width: number;
    height: number;
    shapes: CustomSymbolShape[];
    pins: Omit<E3Pin, 'id'>[];
  };
  const [symbolUndoStack, setSymbolUndoStack] = useState<SymbolGeoSnapshot[]>([]);
  const [symbolRedoStack, setSymbolRedoStack] = useState<SymbolGeoSnapshot[]>([]);
  const [symbolDraft, setSymbolDraft] = useState<SymbolWorkspaceDraft>(() => ({
    open: false,
    targetMode: 'component',
    symbolId: 'sym-new',
    name: 'Новый блок УГО',
    e3BlockName: 'E3_NEW_BLK',
    category: 'relay',
    width: 120,
    height: 100,
    shapes: [],
    pins: [],
    componentName: 'Новое изделие',
    article: 'E3-NEW-01',
    manufacturer: 'Собств. база',
    defaultPrefix: 'K',
    defaultCable: 'ВВГнг(А)-LS 3х1,5',
    attributes: [],
    tool: 'select',
    activeStyle: {
      strokeColor: '#111827',
      strokeWidth: 1.8,
      strokeStyle: 'solid',
      filled: true,
      fillColor: '',
    },
    activeAttrTagKey: 'designation',
    activePinSignal: 'signal',
    gridStep: 10,
    snapToGrid: true,
    selectedShapeId: null,
    selectedPinIndex: null,
    dirty: false,
  }));
  const symbolDraftRef = useRef(symbolDraft);
  symbolDraftRef.current = symbolDraft;
  const symbolUndoRef = useRef(symbolUndoStack);
  symbolUndoRef.current = symbolUndoStack;
  const symbolRedoRef = useRef(symbolRedoStack);
  symbolRedoRef.current = symbolRedoStack;

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
      details?: string,
      meta?: {
        cause?: string;
        outcome?: string;
        screenState?: string;
        lagMs?: number;
      }
    ) => {
      const screenState = meta?.screenState ?? (getScreenSnapshotRef.current() || undefined);
      setLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          level,
          subsystem,
          message,
          durationMs,
          lagMs: meta?.lagMs,
          cause: meta?.cause,
          outcome: meta?.outcome,
          screenState,
          details,
        },
        ...prev.slice(0, 1199),
      ]);
    },
    []
  );

  const setTool = useCallback(
    (nextOrUpdater: CadTool | ((prev: CadTool) => CadTool)) => {
      setToolState((prev) => {
        const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
        if (next !== prev) {
          appendLog(
            'INFO',
            'UI-INTERACT',
            `Смена инструмента САПР: ${prev} → ${next}.`,
            undefined,
            undefined,
            {
              cause: 'Переключение активного режима чертежа',
              outcome: `Активен инструмент "${next}"`,
            }
          );
        }
        return next;
      });
    },
    [appendLog]
  );

  // Passive diagnostic collectors: LongTasks (zero idle CPU), UI interactions, fetch RTT/errors, runtime exceptions
  useEffect(() => {
    const mountWarmUntil = performance.now() + 1800;
    let lastLongTaskLogAt = 0;

    let longTaskObs: PerformanceObserver | null = null;
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
          longTaskObs = new PerformanceObserver((list) => {
            const now = performance.now();
            if (now < mountWarmUntil) return;
            for (const entry of list.getEntries()) {
              perfRef.current.longTaskCount += 1;
              if (entry.duration >= 120 && now - lastLongTaskLogAt > 2500) {
                lastLongTaskLogAt = now;
                const d = Math.round(entry.duration * 10) / 10;
                appendLog(
                  'WARN',
                  'PERF-DIAG',
                  `Обнаружена долгая задача главного потока (LongTask ${d} мс).`,
                  d,
                  undefined,
                  {
                    lagMs: d,
                    cause: `Блокировка UI-потока (${entry.name || 'self'})`,
                    outcome: `Задержка отклика интерфейса на ${d} мс`,
                  }
                );
              }
            }
          });
          longTaskObs.observe({ entryTypes: ['longtask'] });
        }
      } catch {
        // LongTask observer unsupported
      }
    }

    const onCaptureClick = (e: MouseEvent) => {
      const targetInfo = describeInteractiveTarget(e.target);
      if (!targetInfo) return;
      const isControl =
        targetInfo.tag === 'button' ||
        targetInfo.tag === 'a' ||
        targetInfo.tag === 'select' ||
        targetInfo.tag === 'input' ||
        targetInfo.tag === 'textarea' ||
        targetInfo.role === 'button' ||
        targetInfo.role === 'tab' ||
        targetInfo.role === 'menuitem' ||
        Boolean(targetInfo.testId);
      if (!isControl) return;
      const btnName = e.button === 1 ? 'СКМ' : e.button === 2 ? 'ПКМ' : 'ЛКМ';
      appendLog(
        'INFO',
        'UI-INTERACT',
        `Нажатие [${btnName}]: «${targetInfo.label}»`,
        undefined,
        undefined,
        {
          cause: `Взаимодействие с <${targetInfo.tag}>${targetInfo.testId ? ` [data-testid="${targetInfo.testId}"]` : ''}`,
          outcome: `Координаты клика: (${Math.round(e.clientX)}, ${Math.round(e.clientY)})`,
        }
      );
    };

    const onCaptureChange = (e: Event) => {
      const target = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
      if (!target) return;
      const info = describeInteractiveTarget(target);
      if (!info) return;
      const valPreview =
        target instanceof HTMLInputElement && target.type === 'checkbox'
          ? String(target.checked)
          : String((target as HTMLInputElement).value ?? '').slice(0, 64);
      appendLog(
        'INFO',
        'UI-INTERACT',
        `Изменено значение «${info.label}» → "${valPreview}"`,
        undefined,
        undefined,
        {
          cause: `Событие change на <${info.tag}>${info.testId ? ` [data-testid="${info.testId}"]` : ''}`,
          outcome: `Новое значение: "${valPreview}"`,
        }
      );
    };

    const onCaptureKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inText =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      const isSpecial =
        e.key === 'Escape' ||
        e.key === 'Delete' ||
        e.key === 'Enter' ||
        /^F\d{1,2}$/.test(e.key);
      if (!hasModifier && !isSpecial) {
        if (inText || e.key.length > 1) return;
      }
      if (inText && !hasModifier && !isSpecial) return;
      const parts = [
        e.ctrlKey ? 'Ctrl' : '',
        e.metaKey ? 'Cmd' : '',
        e.altKey ? 'Alt' : '',
        e.shiftKey ? 'Shift' : '',
        e.key === ' ' ? 'Space' : e.key,
      ].filter(Boolean);
      appendLog(
        'INFO',
        'UI-INTERACT',
        `Клавиша: ${parts.join('+')}`,
        undefined,
        undefined,
        {
          cause: `Нажатие клавиатуры${inText ? ' в поле ввода' : ' на рабочей области'}`,
          outcome: 'Передано обработчику горячих клавиш / элемента',
        }
      );
    };

    const onWindowError = (ev: ErrorEvent) => {
      appendLog(
        'ERROR',
        'E3-CORE',
        `Неперехваченная ошибка UI: ${ev.message || 'Unknown Error'}`,
        undefined,
        ev.error instanceof Error ? ev.error.stack || ev.error.message : `${ev.filename}:${ev.lineno}:${ev.colno}`,
        {
          cause: `Исключение в ${ev.filename || 'runtime'}:${ev.lineno || 0}`,
          outcome: 'Выполнение обработчика прервано',
        }
      );
    };

    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      const msg = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
      const stack = ev.reason instanceof Error ? ev.reason.stack || msg : String(ev.reason);
      appendLog(
        'ERROR',
        'E3-CORE',
        `Необработанный Promise rejection: ${msg}`,
        undefined,
        stack,
        {
          cause: 'Асинхронная операция завершилась отклонением без catch()',
          outcome: `Ошибка: ${msg}`,
        }
      );
    };

    const origFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const shouldTrace =
        urlStr.includes('/api/') &&
        !urlStr.includes('/api/v1/diagnostics') &&
        !urlStr.includes('/api/sync/stream');
      if (!shouldTrace) {
        return origFetch(input, init);
      }
      const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase();
      const t0 = performance.now();
      try {
        const res = await origFetch(input, init);
        const dt = Math.round((performance.now() - t0) * 100) / 100;
        if (!res.ok || dt >= 250) {
          appendLog(
            res.status >= 500 ? 'ERROR' : 'WARN',
            'NET-API',
            `Клиент fetch ${method} ${urlStr} → HTTP ${res.status} (${dt} мс)`,
            dt,
            undefined,
            {
              lagMs: dt >= 250 ? dt : undefined,
              cause: `Клиентский HTTP-запрос ${method} ${urlStr}`,
              outcome: !res.ok
                ? `Сервер вернул ошибку HTTP ${res.status} за ${dt} мс`
                : `Высокая задержка сети (${dt} мс)`,
            }
          );
        }
        return res;
      } catch (err) {
        const dt = Math.round((performance.now() - t0) * 100) / 100;
        const msg = err instanceof Error ? err.message : String(err);
        appendLog(
          'ERROR',
          'NET-API',
          `Сбой сети fetch ${method} ${urlStr}: ${msg}`,
          dt,
          err instanceof Error ? err.stack : undefined,
          {
            lagMs: dt,
            cause: `Сетевой вызов ${method} ${urlStr}`,
            outcome: `Соединение прервано (${msg})`,
          }
        );
        throw err;
      }
    };

    const prevFetchDesc = Object.getOwnPropertyDescriptor(window, 'fetch');
    let fetchPatched = false;
    try {
      if (!prevFetchDesc || prevFetchDesc.configurable) {
        Object.defineProperty(window, 'fetch', {
          value: wrappedFetch,
          configurable: true,
          writable: true,
        });
        fetchPatched = window.fetch === wrappedFetch;
      } else if (prevFetchDesc.writable) {
        window.fetch = wrappedFetch;
        fetchPatched = window.fetch === wrappedFetch;
      }
    } catch {
      fetchPatched = false;
    }

    document.addEventListener('click', onCaptureClick, true);
    document.addEventListener('change', onCaptureChange, true);
    document.addEventListener('keydown', onCaptureKey, true);
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      longTaskObs?.disconnect();
      document.removeEventListener('click', onCaptureClick, true);
      document.removeEventListener('change', onCaptureChange, true);
      document.removeEventListener('keydown', onCaptureKey, true);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      if (fetchPatched) {
        try {
          if (prevFetchDesc) {
            Object.defineProperty(window, 'fetch', prevFetchDesc);
          } else {
            delete (window as unknown as { fetch?: typeof window.fetch }).fetch;
          }
        } catch {
          // ignore if host environment locked fetch
        }
      }
    };
  }, [appendLog]);

  // Run high-frequency FPS sampler ONLY while SystemHealthDashboard is open (0 idle CPU when closed)
  useEffect(() => {
    if (!healthOpen) return;
    let rafId = 0;
    let lastFrameAt = performance.now();
    let fpsCounter = 0;
    let fpsWindowStart = lastFrameAt;
    let visibleResumedAt = lastFrameAt;

    const readMemory = () => {
      const mem = (performance as Performance & {
        memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
      }).memory;
      if (!mem) return { memoryUsedMb: null, memoryLimitMb: null };
      return {
        memoryUsedMb: Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10,
        memoryLimitMb: Math.round((mem.jsHeapSizeLimit / (1024 * 1024)) * 10) / 10,
      };
    };

    const initialMem = readMemory();
    perfRef.current.memoryUsedMb = initialMem.memoryUsedMb;
    perfRef.current.memoryLimitMb = initialMem.memoryLimitMb;
    setPerfSnapshot({ ...perfRef.current });

    const tick = (now: number) => {
      if (document.visibilityState === 'visible') {
        const delta = now - lastFrameAt;
        lastFrameAt = now;
        fpsCounter += 1;

        const cur = perfRef.current;
        const isWarm = now - visibleResumedAt > 250;
        const saneDelta = isWarm ? Math.min(delta, 5000) : 16.7;
        cur.lastFrameDeltaMs = Math.round(saneDelta * 10) / 10;
        if (isWarm && saneDelta > cur.maxFrameDeltaMs) {
          cur.maxFrameDeltaMs = Math.round(saneDelta * 10) / 10;
        }
        if (isWarm && saneDelta > 50) {
          cur.jankFramesCount += 1;
        }

        if (now - fpsWindowStart >= 1000) {
          const elapsedSec = (now - fpsWindowStart) / 1000;
          const measuredFps = Math.max(1, Math.round(fpsCounter / Math.max(0.25, elapsedSec)));
          const memInfo = readMemory();
          cur.fps = Math.min(240, measuredFps);
          cur.memoryUsedMb = memInfo.memoryUsedMb;
          cur.memoryLimitMb = memInfo.memoryLimitMb;
          fpsCounter = 0;
          fpsWindowStart = now;
          setPerfSnapshot({ ...cur });
        }
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        visibleResumedAt = performance.now();
        lastFrameAt = visibleResumedAt;
        if (!rafId) rafId = window.requestAnimationFrame(tick);
      } else if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.visibilityState === 'visible') {
      rafId = window.requestAnimationFrame(tick);
    }

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [healthOpen]);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (project.visualSettings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [project.visualSettings.theme]);

  // Stage 7.3: Idle-scheduled debounced autosave + immediate flush on unload
  useEffect(() => {
    let idleId: number | null = null;
    const winWithIdle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const timer = window.setTimeout(() => {
      const runSave = () => {
        const res = saveActiveSession(docStateRef.current.present, activeSheetIdRef.current);
        setLastSavedAt(res.savedAt);
        setRecentProjects(res.recent);
      };
      if (typeof winWithIdle.requestIdleCallback === 'function') {
        idleId = winWithIdle.requestIdleCallback(runSave, { timeout: 600 });
      } else {
        runSave();
      }
    }, 450);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== null && typeof winWithIdle.cancelIdleCallback === 'function') {
        winWithIdle.cancelIdleCallback(idleId);
      }
    };
  }, [project, activeSheetId]);

  useEffect(() => {
    const flushSession = () => {
      saveActiveSession(docStateRef.current.present, activeSheetIdRef.current);
    };
    window.addEventListener('beforeunload', flushSession);
    return () => window.removeEventListener('beforeunload', flushSession);
  }, []);

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

  // Async Web Worker computation for BOM, Cables, Terminals, ERC (scoped to electrical topology changes)
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsBusy(true);
      try {
        const currentProj = docStateRef.current.present;
        const res = await ecadAsync.analyzeProject(currentProj);
        if (cancelled) return;
        setBom(res.bom);
        setCables(res.cables);
        setNetLengths(res.netLengths);
        setTerminals(res.terminals);
        setErc(res.erc);
        appendLog(
          'INFO',
          'WORKER',
          `Пересчитана модель (${currentProj.devices.length} изд., ${currentProj.wires.length} цепей)${res.viaWorker ? ' в Web Worker' : ''}.`,
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
  }, [project.devices, project.wires, project.sheets, appendLog]);

  const setProjectRemote = useCallback(
    (nextOrUpdater: E3Project | ((curr: E3Project) => E3Project)) => {
      setDocState((s) => {
        const rawNext =
          typeof nextOrUpdater === 'function' ? nextOrUpdater(s.present) : nextOrUpdater;
        if (rawNext === s.present) return s;
        return { ...s, present: hydrateProjectDefaults(rawNext) };
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
              return [srvEntry, ...prev.slice(0, 1199)];
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
      _opts?: { coalesceSheetRev?: boolean; sheetSummary?: string; skipSheetTracking?: boolean }
    ) => {
      const cur = docStateRef.current.present;
      const rawNext = updater(cur);
      const next = normalizeProjectSheetRevisions(rawNext);
      const nextDoc = {
        past: recordHistory
          ? [...docStateRef.current.past.slice(-29), docStateRef.current.present]
          : docStateRef.current.past,
        present: next,
        future: recordHistory ? [] : docStateRef.current.future,
      };
      docStateRef.current = nextDoc;
      setDocState(nextDoc);
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
    () => (activeSheetId ? project.sheets.find((s) => s.id === activeSheetId) : undefined),
    [project.sheets, activeSheetId]
  );

  useEffect(() => {
    setOpenSheetIds((prev) => {
      const synced = syncOpenSheetIds(prev, project.sheets);
      return synced.length === prev.length && synced.every((id, i) => id === prev[i]) ? prev : synced;
    });
    if (activeSheetId && !project.sheets.some((s) => s.id === activeSheetId)) {
      const nextFallback =
        openSheetIdsRef.current.find((id) => project.sheets.some((s) => s.id === id)) ||
        project.sheets[0]?.id ||
        '';
      setActiveSheetId(nextFallback);
    }
  }, [project.sheets, activeSheetId]);

  const openSheetTab = useCallback((sheetId: string, vpIdx?: number) => {
    if (!sheetId) return;
    const sheets = docStateRef.current.present.sheets;
    if (!sheets.some((s) => s.id === sheetId)) return;
    const targetVp = typeof vpIdx === 'number' ? vpIdx : activeViewportIdxRef.current;
    setOpenSheetIds((prev) => ensureSheetTabOpen(prev, sheetId, sheets));
    setActiveSheetId(sheetId);
    setViewportSheetIds((prev) => prev.map((sId, idx) => (idx === targetVp ? sheetId : sId)));
  }, []);

  const handleCloseSheetTab = useCallback(
    (sheetId: string) => {
      const res = closeSheetTab(openSheetIdsRef.current, sheetId, activeSheetIdRef.current);
      setOpenSheetIds(res.nextOpenSheetIds);
      setActiveSheetId(res.nextActiveSheetId);
      if (sheetId === activeSheetIdRef.current) {
        applySelection({});
      }
      const closedSheet = docStateRef.current.present.sheets.find((s) => s.id === sheetId);
      if (closedSheet) {
        appendLog(
          'INFO',
          'E3-CORE',
          `Вкладка листа ${closedSheet.number} («${closedSheet.name}») закрыта на холсте (лист сохранён в проекте).`
        );
      }
    },
    [applySelection, appendLog]
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

  const dragSnapshotRef = useRef<{ project: E3Project; startedAt: number } | null>(null);

  const handleBeginDrag = useCallback(() => {
    dragSnapshotRef.current = {
      project: docStateRef.current.present,
      startedAt: performance.now(),
    };
  }, []);

  const handleCommitDrag = useCallback(
    (moved: boolean, opts?: { tryWireBreakDeviceId?: string }) => {
      const dragSnap = dragSnapshotRef.current;
      dragSnapshotRef.current = null;
      if (!dragSnap) return;
      const snap = dragSnap.project;
      const dragDurationMs = Math.round((performance.now() - dragSnap.startedAt) * 10) / 10;

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
      const committed = normalizeProjectSheetRevisions(rawCommitted);
      setDocState((s) => ({
        past: [...s.past.slice(-29), snap],
        present: committed,
        future: [],
      }));
      pushSync(committed);
      if (moved && !didBreak) {
        appendLog(
          'INFO',
          'E3-CORE',
          `Перемещение/правка графики зафиксированы (rev ${committed.revision}).`,
          dragDurationMs,
          undefined,
          {
            cause: 'Перетаскивание объекта/узла на схеме мышью',
            outcome: `Обновлены координаты и перемаршрутизация за ${dragDurationMs} мс`,
          }
        );
      }
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
      const cur = docStateRef.current.present;
      const sheetId = targetSheetId || activeSheet?.id || cur.sheets[0].id;
      const targetSheet = cur.sheets.find((s) => s.id === sheetId) || cur.sheets[0];
      const sheetDevices = cur.devices.filter((d) => d.sheetId === sheetId);
      const des = nextUniqueDesignation(cur.devices, item.defaultPrefix);
      const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const smartPos =
        x === undefined || y === undefined
          ? findSmartCatalogSpot(
              { width: item.width, height: item.height },
              sheetDevices,
              targetSheet,
              cur.visualSettings.gridSize
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
        symbolId: item.symbolId,
        e3BlockName: item.e3BlockName,
        bindingState: 'PLACED',
        pins: item.pins.map((p, idx) => ({ ...p, id: `${id}-p${idx + 1}` })),
        customSymbol: item.customSymbol ? structuredClone(item.customSymbol) : undefined,
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
      openSheetTab(sheetId);
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
    [project.devices, project.sheets, project.visualSettings.gridSize, activeSheet?.id, commitProject, openSheetTab, appendLog]
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
    setOpenSheetIds((prev) => ensureSheetTabOpen(prev, newSheet.id, [...project.sheets, newSheet]));
    setActiveSheetId(newSheet.id);
    setViewportSheetIds((prev) =>
      prev.map((sId, idx) => (idx === activeViewportIdxRef.current ? newSheet.id : sId))
    );
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

  const ensureSymbolEditorDocksVisible = useCallback(() => {
    setDockLayout((prev) => {
      let next = prev;
      if (next.panels.explorer.collapsed) next = togglePanelCollapse(next, 'explorer');
      if (next.panels.inspector.collapsed) next = togglePanelCollapse(next, 'inspector');
      return next;
    });
  }, []);

  const openSymbolInWorkspace = useCallback(
    (sym: E3SymbolDef) => {
      const linkedCat =
        mergedCatalog.find((c) => c.symbolId === sym.id || c.e3BlockName === sym.e3BlockName) ||
        null;
      const shapes =
        sym.shapes.length > 0
          ? structuredClone(sym.shapes)
          : extractBuiltInSymbolShapes(
              sym.category,
              sym.width,
              sym.height,
              sym.e3BlockName,
              sym.defaultPins
            );
      symbolUndoRef.current = [];
      symbolRedoRef.current = [];
      setSymbolUndoStack([]);
      setSymbolRedoStack([]);
      setSymbolDraft((prev) => ({
        ...prev,
        open: true,
        targetMode: linkedCat ? 'component' : 'symbol',
        symbolId: sym.id,
        catalogItemId: linkedCat?.id,
        deviceId: undefined,
        name: sym.name,
        e3BlockName: sym.e3BlockName,
        category: sym.category,
        width: sym.width,
        height: sym.height,
        shapes,
        pins: structuredClone(sym.defaultPins),
        componentName: linkedCat?.componentName || sym.description || sym.name,
        article: linkedCat?.article || sym.e3BlockName,
        manufacturer: linkedCat?.manufacturer || 'Собств. база',
        defaultPrefix: linkedCat?.defaultPrefix || 'K',
        defaultCable: linkedCat?.defaultCable || 'ВВГнг(А)-LS 3х1,5',
        attributes: linkedCat
          ? structuredClone(linkedCat.defaultAttributes)
          : applyAttributeTemplate([], 'gost_base'),
        tool: 'select',
        selectedShapeId: null,
        selectedPinIndex: null,
        dirty: false,
      }));
      ensureSymbolEditorDocksVisible();
      appendLog('INFO', 'E3-CORE', `Открыт блок УГО «${sym.name}» (${sym.e3BlockName}) в редакторе.`);
    },
    [mergedCatalog, ensureSymbolEditorDocksVisible, appendLog]
  );

  const openCatalogItemInWorkspace = useCallback(
    (item: CatalogItem) => {
      const linkedSym = item.symbolId
        ? mergedSymbolLibrary.find((s) => s.id === item.symbolId)
        : mergedSymbolLibrary.find((s) => s.e3BlockName === item.e3BlockName);
      const sym = linkedSym && !item.customSymbol?.shapes.length ? linkedSym : buildSymbolDefFromCatalogItem(item);
      symbolUndoRef.current = [];
      symbolRedoRef.current = [];
      setSymbolUndoStack([]);
      setSymbolRedoStack([]);
      setSymbolDraft((prev) => ({
        ...prev,
        open: true,
        targetMode: 'component',
        symbolId: sym.id,
        catalogItemId: item.id,
        deviceId: undefined,
        name: sym.name,
        e3BlockName: item.e3BlockName,
        category: item.category,
        width: item.width,
        height: item.height,
        shapes: structuredClone(sym.shapes),
        pins: structuredClone(item.pins),
        componentName: item.componentName,
        article: item.article,
        manufacturer: item.manufacturer,
        defaultPrefix: item.defaultPrefix,
        defaultCable: item.defaultCable || '',
        attributes: structuredClone(item.defaultAttributes),
        tool: 'select',
        selectedShapeId: null,
        selectedPinIndex: null,
        dirty: false,
      }));
      ensureSymbolEditorDocksVisible();
      appendLog(
        'INFO',
        'E3-CORE',
        `Открыто изделие «${item.componentName}» (${item.e3BlockName}) в редакторе УГО.`
      );
    },
    [mergedSymbolLibrary, ensureSymbolEditorDocksVisible, appendLog]
  );

  const openDeviceSymbolInWorkspace = useCallback(
    (dev: E3Device) => {
      const shapes =
        dev.customSymbol && dev.customSymbol.shapes.length > 0
          ? structuredClone(dev.customSymbol.shapes)
          : extractBuiltInSymbolShapes(
              dev.category,
              dev.width,
              dev.height,
              dev.e3BlockName,
              dev.pins
            );
      const pins = dev.pins.map(({ id: _id, ...rest }) => ({ ...rest }));
      const matchingCat = mergedCatalog.find(
        (c) => (dev.symbolId && c.symbolId === dev.symbolId) || c.e3BlockName === dev.e3BlockName
      );
      symbolUndoRef.current = [];
      symbolRedoRef.current = [];
      setSymbolUndoStack([]);
      setSymbolRedoStack([]);
      setSymbolDraft((prev) => ({
        ...prev,
        open: true,
        targetMode: 'device',
        symbolId: dev.symbolId || `sym-${dev.e3BlockName || dev.id}`,
        catalogItemId: matchingCat?.id,
        deviceId: dev.id,
        name: `${dev.designation} (${dev.e3BlockName})`,
        e3BlockName: dev.e3BlockName,
        category: dev.category,
        width: dev.width,
        height: dev.height,
        shapes,
        pins,
        componentName: dev.componentName,
        article: dev.article,
        manufacturer: dev.manufacturer,
        defaultPrefix: dev.designation.replace(/\d+.*$/, '') || 'K',
        defaultCable: matchingCat?.defaultCable || '',
        attributes: structuredClone(dev.attributes),
        tool: 'select',
        selectedShapeId: null,
        selectedPinIndex: null,
        dirty: false,
      }));
      ensureSymbolEditorDocksVisible();
      appendLog(
        'INFO',
        'E3-CORE',
        `Открыто УГО аппарата ${dev.designation} (${dev.e3BlockName}) для редактирования.`
      );
    },
    [mergedCatalog, ensureSymbolEditorDocksVisible, appendLog]
  );

  const openCatalogSeedInWorkspace = useCallback(
    (seed: {
      catalogItemId?: string;
      name: string;
      e3BlockName: string;
      category: DeviceCategory;
      width: number;
      height: number;
      componentName: string;
      article: string;
      manufacturer: string;
      defaultPrefix: string;
      defaultCable?: string;
      attributes: E3Attribute[];
      pins: Omit<E3Pin, 'id'>[];
      customSymbol?: CustomSymbolSpec;
    }) => {
      const shapes =
        seed.customSymbol && seed.customSymbol.shapes.length > 0
          ? structuredClone(seed.customSymbol.shapes)
          : extractBuiltInSymbolShapes(
              seed.category,
              seed.width,
              seed.height,
              seed.e3BlockName,
              seed.pins
            );
      symbolUndoRef.current = [];
      symbolRedoRef.current = [];
      setSymbolUndoStack([]);
      setSymbolRedoStack([]);
      setSymbolDraft((prev) => ({
        ...prev,
        open: true,
        targetMode: 'component',
        symbolId: `sym-${seed.e3BlockName || Date.now().toString(36)}`,
        catalogItemId: seed.catalogItemId,
        deviceId: undefined,
        name: seed.name,
        e3BlockName: seed.e3BlockName,
        category: seed.category,
        width: seed.width,
        height: seed.height,
        shapes,
        pins: structuredClone(seed.pins),
        componentName: seed.componentName || seed.name,
        article: seed.article || 'E3-NEW-01',
        manufacturer: seed.manufacturer || 'Собств. база',
        defaultPrefix: seed.defaultPrefix || 'K',
        defaultCable: seed.defaultCable || '',
        attributes: structuredClone(seed.attributes),
        tool: 'select',
        selectedShapeId: null,
        selectedPinIndex: null,
        dirty: true,
      }));
      ensureSymbolEditorDocksVisible();
    },
    [ensureSymbolEditorDocksVisible]
  );

  const createNewBlankSymbolInWorkspace = useCallback(() => {
    const preset = buildSymbolDesignerPreset('blank_box');
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    symbolUndoRef.current = [];
    symbolRedoRef.current = [];
    setSymbolUndoStack([]);
    setSymbolRedoStack([]);
    setSymbolDraft((prev) => ({
      ...prev,
      open: true,
      targetMode: 'symbol',
      symbolId: `sym-custom-${Date.now().toString(36)}`,
      catalogItemId: undefined,
      deviceId: undefined,
      name: `Новое УГО ${suffix}`,
      e3BlockName: `E3_BLK_${suffix}`,
      category: 'relay',
      width: preset.width,
      height: preset.height,
      shapes: structuredClone(preset.shapes),
      pins: structuredClone(preset.pins),
      componentName: `Новое изделие ${suffix}`,
      article: `ART-${suffix}`,
      manufacturer: 'Собств. база',
      defaultPrefix: 'K',
      defaultCable: 'ВВГнг(А)-LS 3х1,5',
      attributes: applyAttributeTemplate([], 'gost_base'),
      tool: 'select',
      selectedShapeId: null,
      selectedPinIndex: null,
      dirty: true,
    }));
    ensureSymbolEditorDocksVisible();
  }, [ensureSymbolEditorDocksVisible]);

  const openBlockEditorWorkspace = useCallback(() => {
    if (selectedDevice) {
      openDeviceSymbolInWorkspace(selectedDevice);
      return;
    }
    if (mergedSymbolLibrary.length > 0) {
      openSymbolInWorkspace(mergedSymbolLibrary[0]);
      return;
    }
    createNewBlankSymbolInWorkspace();
  }, [
    selectedDevice,
    mergedSymbolLibrary,
    openDeviceSymbolInWorkspace,
    openSymbolInWorkspace,
    createNewBlankSymbolInWorkspace,
  ]);

  const commitSymbolGeometry = useCallback(
    (
      nextShapes: CustomSymbolShape[],
      nextPins: Omit<E3Pin, 'id'>[],
      bounds?: { width?: number; height?: number }
    ) => {
      const prev = symbolDraftRef.current;
      const snap: SymbolGeoSnapshot = {
        width: prev.width,
        height: prev.height,
        shapes: structuredClone(prev.shapes),
        pins: structuredClone(prev.pins),
      };
      const nextUndo = [...symbolUndoRef.current.slice(-29), snap];
      const nextDraft: SymbolWorkspaceDraft = {
        ...prev,
        width: bounds?.width ?? prev.width,
        height: bounds?.height ?? prev.height,
        shapes: nextShapes,
        pins: nextPins,
        dirty: true,
      };
      symbolUndoRef.current = nextUndo;
      symbolRedoRef.current = [];
      symbolDraftRef.current = nextDraft;
      setSymbolUndoStack(nextUndo);
      setSymbolRedoStack([]);
      setSymbolDraft(nextDraft);
    },
    []
  );

  const undoSymbolEditor = useCallback(() => {
    const past = symbolUndoRef.current;
    if (past.length === 0) return;
    const prevSnap = past[past.length - 1];
    const curr = symbolDraftRef.current;
    const redoEntry: SymbolGeoSnapshot = {
      width: curr.width,
      height: curr.height,
      shapes: structuredClone(curr.shapes),
      pins: structuredClone(curr.pins),
    };
    const nextPast = past.slice(0, -1);
    const nextRedo = [redoEntry, ...symbolRedoRef.current.slice(0, 29)];
    const nextDraft: SymbolWorkspaceDraft = {
      ...curr,
      width: prevSnap.width,
      height: prevSnap.height,
      shapes: prevSnap.shapes,
      pins: prevSnap.pins,
      selectedShapeId: null,
      selectedPinIndex: null,
      dirty: true,
    };
    symbolUndoRef.current = nextPast;
    symbolRedoRef.current = nextRedo;
    symbolDraftRef.current = nextDraft;
    setSymbolUndoStack(nextPast);
    setSymbolRedoStack(nextRedo);
    setSymbolDraft(nextDraft);
  }, []);

  const redoSymbolEditor = useCallback(() => {
    const fut = symbolRedoRef.current;
    if (fut.length === 0) return;
    const nextSnap = fut[0];
    const curr = symbolDraftRef.current;
    const undoEntry: SymbolGeoSnapshot = {
      width: curr.width,
      height: curr.height,
      shapes: structuredClone(curr.shapes),
      pins: structuredClone(curr.pins),
    };
    const nextUndo = [...symbolUndoRef.current.slice(-29), undoEntry];
    const nextFut = fut.slice(1);
    const nextDraft: SymbolWorkspaceDraft = {
      ...curr,
      width: nextSnap.width,
      height: nextSnap.height,
      shapes: nextSnap.shapes,
      pins: nextSnap.pins,
      selectedShapeId: null,
      selectedPinIndex: null,
      dirty: true,
    };
    symbolUndoRef.current = nextUndo;
    symbolRedoRef.current = nextFut;
    symbolDraftRef.current = nextDraft;
    setSymbolUndoStack(nextUndo);
    setSymbolRedoStack(nextFut);
    setSymbolDraft(nextDraft);
  }, []);

  const saveSymbolWorkspace = useCallback(
    (draftOverride?: SymbolWorkspaceDraft): { sym: E3SymbolDef; catalogItem: CatalogItem } => {
      const d = draftOverride || symbolDraft;
      const norm = normalizeCustomSymbolSpec(d.width, d.height, d.shapes, d.pins);
      const cleanBlock = d.e3BlockName.trim() || 'E3_CUSTOM_BLK';
      const cleanSymId = d.symbolId || `sym-${cleanBlock}`;
      const savedSym: E3SymbolDef = {
        id: cleanSymId,
        name: d.name.trim() || cleanBlock,
        e3BlockName: cleanBlock,
        category: d.category,
        description: d.componentName.trim() || d.name.trim(),
        width: norm.width,
        height: norm.height,
        shapes: structuredClone(norm.customSymbol.shapes),
        defaultPins: structuredClone(norm.pins),
        isCustom: true,
        updatedAt: new Date().toISOString(),
      };

      setCustomSymbols((prev) => {
        const idx = prev.findIndex((s) => s.id === savedSym.id);
        const next = idx >= 0 ? prev.map((s) => (s.id === savedSym.id ? savedSym : s)) : [...prev, savedSym];
        saveCustomSymbols(next);
        return next;
      });

      const existingCat =
        (d.catalogItemId && mergedCatalog.find((c) => c.id === d.catalogItemId)) ||
        mergedCatalog.find((c) => c.symbolId === savedSym.id || c.e3BlockName === cleanBlock);

      const savedCat: CatalogItem = {
        id: existingCat?.id || `custom-cat-${Date.now().toString(36)}`,
        category: d.category,
        stageRole: existingCat?.stageRole || 'custom',
        defaultPrefix: d.defaultPrefix.trim() || 'K',
        componentName: d.componentName.trim() || savedSym.name,
        article: d.article.trim() || cleanBlock,
        manufacturer: d.manufacturer.trim() || 'Собств. база',
        e3BlockName: cleanBlock,
        symbolId: savedSym.id,
        width: norm.width,
        height: norm.height,
        pins: structuredClone(norm.pins),
        customSymbol: structuredClone(norm.customSymbol),
        defaultAttributes: structuredClone(d.attributes),
        defaultCable: d.defaultCable?.trim() || undefined,
        isCustom: true,
        ioProfile: existingCat?.ioProfile,
        fluxMatch: existingCat?.fluxMatch,
      };

      if (d.targetMode === 'component' || existingCat || d.componentName.trim()) {
        handleSaveCustomCatalogItem(savedCat);
      }

      commitProject((prev) => {
        const prevLib = prev.symbolLibrary || [];
        const symIdx = prevLib.findIndex((s) => s.id === savedSym.id);
        const nextLib =
          symIdx >= 0 ? prevLib.map((s) => (s.id === savedSym.id ? savedSym : s)) : [...prevLib, savedSym];

        const nextDevices = prev.devices.map((dev) => {
          const isTargetDev = d.targetMode === 'device' && d.deviceId === dev.id;
          const isSharedSym = dev.symbolId === savedSym.id || (!d.deviceId && dev.e3BlockName === cleanBlock);
          if (!isTargetDev && !isSharedSym) return dev;

          const updatedPins: E3Pin[] = norm.pins.map((p, idx) => ({
            ...p,
            id: dev.pins[idx]?.id || `${dev.id}-p${idx + 1}`,
          }));
          return {
            ...dev,
            symbolId: savedSym.id,
            e3BlockName: cleanBlock,
            category: d.category,
            width: norm.width,
            height: norm.height,
            customSymbol: structuredClone(norm.customSymbol),
            pins: updatedPins,
            ...(isTargetDev
              ? {
                  componentName: d.componentName.trim() || dev.componentName,
                  article: d.article.trim() || dev.article,
                  manufacturer: d.manufacturer.trim() || dev.manufacturer,
                  attributes: structuredClone(d.attributes),
                }
              : {}),
          };
        });

        let nextWires = prev.wires;
        for (const dev of nextDevices) {
          if (
            (d.targetMode === 'device' && d.deviceId === dev.id) ||
            dev.symbolId === savedSym.id
          ) {
            nextWires = rerouteDeviceWires(dev, nextDevices, nextWires, prev.sheets);
          }
        }

        return {
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          symbolLibrary: nextLib,
          devices: nextDevices,
          wires: nextWires,
        };
      });

      setSymbolDraft((curr) => ({
        ...curr,
        symbolId: savedSym.id,
        catalogItemId: savedCat.id,
        width: norm.width,
        height: norm.height,
        shapes: norm.customSymbol.shapes,
        pins: norm.pins,
        dirty: false,
      }));
      appendLog(
        'SYNC',
        'E3-CORE',
        `Сохранён блок УГО «${savedSym.name}» (${cleanBlock}, ${norm.customSymbol.shapes.length} прим., ${norm.pins.length} выв.) и синхронизирован с БД E3.`
      );
      return { sym: savedSym, catalogItem: savedCat };
    },
    [symbolDraft, mergedCatalog, handleSaveCustomCatalogItem, commitProject, appendLog]
  );

  const saveSymbolAsCopyWorkspace = useCallback(
    (copyName: string, copyBlockName?: string, copyArticle?: string) => {
      const norm = normalizeCustomSymbolSpec(
        symbolDraft.width,
        symbolDraft.height,
        symbolDraft.shapes,
        symbolDraft.pins
      );
      const baseSym: E3SymbolDef = {
        id: symbolDraft.symbolId,
        name: symbolDraft.name,
        e3BlockName: symbolDraft.e3BlockName,
        category: symbolDraft.category,
        description: symbolDraft.componentName,
        width: norm.width,
        height: norm.height,
        shapes: norm.customSymbol.shapes,
        defaultPins: norm.pins,
        isCustom: true,
      };
      const newSym = duplicateSymbolDefAsCopy(baseSym, copyName, copyBlockName);
      const sourceCat =
        (symbolDraft.catalogItemId && mergedCatalog.find((c) => c.id === symbolDraft.catalogItemId)) ||
        mergedCatalog[0];
      const newCat = duplicateCatalogItemAsCopy(sourceCat, {
        componentName: copyName.trim() || `${symbolDraft.componentName} (копия)`,
        article: copyArticle?.trim() || `${symbolDraft.article || newSym.e3BlockName}-COPY`,
        e3BlockName: newSym.e3BlockName,
        symbolId: newSym.id,
        shapes: newSym.shapes,
        pins: newSym.defaultPins,
        width: newSym.width,
        height: newSym.height,
        attributes: symbolDraft.attributes,
      });
      newCat.category = symbolDraft.category;
      newCat.manufacturer = symbolDraft.manufacturer || newCat.manufacturer;
      newCat.defaultPrefix = symbolDraft.defaultPrefix || newCat.defaultPrefix;
      newCat.defaultCable = symbolDraft.defaultCable || newCat.defaultCable;

      setCustomSymbols((prev) => {
        const next = [...prev, newSym];
        saveCustomSymbols(next);
        return next;
      });
      handleSaveCustomCatalogItem(newCat);
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        symbolLibrary: [...(prev.symbolLibrary || []), newSym],
      }));

      symbolUndoRef.current = [];
      symbolRedoRef.current = [];
      setSymbolUndoStack([]);
      setSymbolRedoStack([]);
      setSymbolDraft((prev) => ({
        ...prev,
        targetMode: 'component',
        symbolId: newSym.id,
        catalogItemId: newCat.id,
        deviceId: undefined,
        name: newSym.name,
        e3BlockName: newSym.e3BlockName,
        componentName: newCat.componentName,
        article: newCat.article,
        width: newSym.width,
        height: newSym.height,
        shapes: structuredClone(newSym.shapes),
        pins: structuredClone(newSym.defaultPins),
        dirty: false,
      }));
      appendLog(
        'INFO',
        'E3-CORE',
        `Создана независимая копия блока и изделия: «${newSym.name}» (${newSym.e3BlockName} / ${newCat.article}).`
      );
    },
    [symbolDraft, mergedCatalog, handleSaveCustomCatalogItem, commitProject, appendLog]
  );

  const symbolWorkspaceActions = useMemo<SymbolWorkspaceActions>(
    () => ({
      draft: symbolDraft,
      canUndo: symbolUndoStack.length > 0,
      canRedo: symbolRedoStack.length > 0,
      symbolLibrary: mergedSymbolLibrary,
      catalog: mergedCatalog,
      onUndo: undoSymbolEditor,
      onRedo: redoSymbolEditor,
      onSetTool: (nextTool: SymbolEditorTool) =>
        setSymbolDraft((prev) => ({ ...prev, tool: nextTool })),
      onUpdateStyle: (patch: Partial<SymbolActiveDrawStyle>) =>
        setSymbolDraft((prev) => ({
          ...prev,
          activeStyle: { ...prev.activeStyle, ...patch },
        })),
      onSetGridStep: (step: number) =>
        setSymbolDraft((prev) => ({ ...prev, gridStep: step })),
      onToggleSnap: () =>
        setSymbolDraft((prev) => ({ ...prev, snapToGrid: !prev.snapToGrid })),
      onSetAttrTagKey: (key: string) =>
        setSymbolDraft((prev) => ({ ...prev, activeAttrTagKey: key })),
      onSetPinSignal: (sig) =>
        setSymbolDraft((prev) => ({ ...prev, activePinSignal: sig })),
      onUpdateDraftMeta: (patch) =>
        setSymbolDraft((prev) => ({ ...prev, ...patch, dirty: true })),
      onCommitGeometry: commitSymbolGeometry,
      onSelectShape: (shapeId) =>
        setSymbolDraft((prev) => ({
          ...prev,
          selectedShapeId: shapeId,
          selectedPinIndex: shapeId ? null : prev.selectedPinIndex,
        })),
      onSelectPin: (pinIndex) =>
        setSymbolDraft((prev) => ({
          ...prev,
          selectedPinIndex: pinIndex,
          selectedShapeId: pinIndex !== null ? null : prev.selectedShapeId,
        })),
      onDeleteSelection: () => {
        const cur = symbolDraftRef.current;
        if (cur.selectedShapeId) {
          const id = cur.selectedShapeId;
          commitSymbolGeometry(
            cur.shapes.filter((s) => s.id !== id),
            cur.pins
          );
          setSymbolDraft((prev) => ({ ...prev, selectedShapeId: null }));
        } else if (cur.selectedPinIndex !== null) {
          const pIdx = cur.selectedPinIndex;
          commitSymbolGeometry(
            cur.shapes,
            cur.pins.filter((_, idx) => idx !== pIdx)
          );
          setSymbolDraft((prev) => ({ ...prev, selectedPinIndex: null }));
        }
      },
      onDuplicateSelectedShape: () => {
        const cur = symbolDraftRef.current;
        const sh = cur.shapes.find((s) => s.id === cur.selectedShapeId);
        if (!sh) return;
        const copyId = `sh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
        let cloned: CustomSymbolShape = { ...structuredClone(sh), id: copyId };
        if (cloned.kind === 'line') {
          cloned = { ...cloned, x1: cloned.x1 + 10, y1: cloned.y1 + 10, x2: cloned.x2 + 10, y2: cloned.y2 + 10 };
        } else if (cloned.kind === 'polyline') {
          cloned = { ...cloned, points: cloned.points.map((pt) => ({ x: pt.x + 10, y: pt.y + 10 })) };
        } else if (cloned.kind === 'circle' || cloned.kind === 'arc') {
          cloned = { ...cloned, cx: cloned.cx + 10, cy: cloned.cy + 10 };
        } else {
          cloned = { ...cloned, x: cloned.x + 10, y: cloned.y + 10 };
        }
        commitSymbolGeometry([...cur.shapes, cloned], cur.pins);
        setSymbolDraft((prev) => ({ ...prev, selectedShapeId: copyId }));
      },
      onMoveShapeOrder: (dir) => {
        const cur = symbolDraftRef.current;
        const idx = cur.shapes.findIndex((s) => s.id === cur.selectedShapeId);
        if (idx < 0) return;
        const nextIdx = dir === 'up' ? idx + 1 : idx - 1;
        if (nextIdx < 0 || nextIdx >= cur.shapes.length) return;
        const next = [...cur.shapes];
        const [item] = next.splice(idx, 1);
        next.splice(nextIdx, 0, item);
        commitSymbolGeometry(next, cur.pins);
      },
      onRotateBlockCW: () => {
        const cur = symbolDraftRef.current;
        const rot = rotateSymbolGeometryCW(cur.width, cur.height, cur.shapes, cur.pins);
        commitSymbolGeometry(rot.shapes, rot.pins, { width: rot.width, height: rot.height });
      },
      onMirrorBlockX: () => {
        const cur = symbolDraftRef.current;
        const mir = mirrorSymbolGeometryX(cur.width, cur.shapes, cur.pins);
        commitSymbolGeometry(mir.shapes, mir.pins);
      },
      onMirrorBlockY: () => {
        const cur = symbolDraftRef.current;
        const mir = mirrorSymbolGeometryY(cur.height, cur.shapes, cur.pins);
        commitSymbolGeometry(mir.shapes, mir.pins);
      },
      onApplyAttributeTemplate: (presetId) => {
        setSymbolDraft((prev) => ({
          ...prev,
          attributes: applyAttributeTemplate(prev.attributes, presetId, false),
          dirty: true,
        }));
      },
      onApplyPresetShapes: (presetId: SymbolPresetId) => {
        const preset = buildSymbolDesignerPreset(presetId);
        commitSymbolGeometry(structuredClone(preset.shapes), structuredClone(preset.pins), {
          width: preset.width,
          height: preset.height,
        });
      },
      onOpenSymbolInEditor: openSymbolInWorkspace,
      onOpenCatalogItemInEditor: openCatalogItemInWorkspace,
      onCreateNewBlankSymbol: createNewBlankSymbolInWorkspace,
      onCreateNewComponentFromSymbol: () => {
        const cur = symbolDraftRef.current;
        const suffix = Date.now().toString(36).slice(-4).toUpperCase();
        saveSymbolAsCopyWorkspace(
          `${cur.componentName || cur.name} (изделие ${suffix})`,
          `${cur.e3BlockName}_${suffix}`,
          `${cur.article || 'E3'}-${suffix}`
        );
      },
      onSaveCurrent: () => {
        saveSymbolWorkspace();
      },
      onSaveAsCopy: saveSymbolAsCopyWorkspace,
      onPlaceOnActiveSheet: () => {
        const { catalogItem } = saveSymbolWorkspace();
        setSymbolDraft((prev) => ({ ...prev, open: false }));
        handlePlaceCatalogItem(catalogItem);
      },
      onDeleteCustomSymbol: (symId: string) => {
        setCustomSymbols((prev) => {
          const next = prev.filter((s) => s.id !== symId);
          saveCustomSymbols(next);
          return next;
        });
        commitProject((prev) => ({
          ...prev,
          symbolLibrary: (prev.symbolLibrary || []).filter((s) => s.id !== symId),
        }));
        appendLog('WARN', 'E3-CORE', 'Пользовательское УГО удалено из библиотеки.');
      },
      onCloseWorkspace: () => setSymbolDraft((prev) => ({ ...prev, open: false })),
    }),
    [
      symbolDraft,
      symbolUndoStack.length,
      symbolRedoStack.length,
      mergedSymbolLibrary,
      mergedCatalog,
      undoSymbolEditor,
      redoSymbolEditor,
      commitSymbolGeometry,
      openSymbolInWorkspace,
      openCatalogItemInWorkspace,
      createNewBlankSymbolInWorkspace,
      saveSymbolWorkspace,
      saveSymbolAsCopyWorkspace,
      handlePlaceCatalogItem,
      commitProject,
      appendLog,
    ]
  );

  const cancelCameraAnim = useCallback((vpIdx: number) => {
    const raf = cameraAnimRef.current[vpIdx];
    if (raf) {
      window.cancelAnimationFrame(raf);
      delete cameraAnimRef.current[vpIdx];
    }
  }, []);

  const animateCameraTo = useCallback(
    (vpIdx: number, targetZoom: number, targetPan: { x: number; y: number }, animate = true) => {
      cancelCameraAnim(vpIdx);
      const cur = viewportTransformsRef.current[vpIdx] || { zoom: 0.56, pan: { x: 24, y: 12 } };
      if (
        !animate ||
        (Math.abs(cur.zoom - targetZoom) < 0.002 &&
          Math.abs(cur.pan.x - targetPan.x) < 1 &&
          Math.abs(cur.pan.y - targetPan.y) < 1)
      ) {
        setViewportTransforms((prev) => ({
          ...prev,
          [vpIdx]: { zoom: targetZoom, pan: targetPan },
        }));
        return;
      }
      const startZoom = cur.zoom;
      const startPanX = cur.pan.x;
      const startPanY = cur.pan.y;
      const startTime = performance.now();
      const durationMs = 175;
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        const z = startZoom + (targetZoom - startZoom) * eased;
        const px = startPanX + (targetPan.x - startPanX) * eased;
        const py = startPanY + (targetPan.y - startPanY) * eased;
        setViewportTransforms((prev) => ({
          ...prev,
          [vpIdx]: {
            zoom: t >= 1 ? targetZoom : z,
            pan: t >= 1 ? targetPan : { x: px, y: py },
          },
        }));
        if (t < 1) {
          cameraAnimRef.current[vpIdx] = window.requestAnimationFrame(step);
        } else {
          delete cameraAnimRef.current[vpIdx];
        }
      };
      cameraAnimRef.current[vpIdx] = window.requestAnimationFrame(step);
    },
    [cancelCameraAnim]
  );

  const fitSheetToViewport = useCallback(
    (sheetObj?: E3Sheet, vpIdx = activeViewportIdxRef.current, animate = false) => {
      const sheets = docStateRef.current.present.sheets;
      const target =
        sheetObj || sheets.find((s) => s.id === activeSheetIdRef.current) || sheets[0];
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
      animateCameraTo(vpIdx, clampedZ, { x: panX, y: panY }, animate);
    },
    [animateCameraTo]
  );
  const fitSheetToViewportRef = useRef(fitSheetToViewport);
  fitSheetToViewportRef.current = fitSheetToViewport;
  const cancelCameraAnimRef = useRef(cancelCameraAnim);
  cancelCameraAnimRef.current = cancelCameraAnim;

  const centerCameraOnCoords = useCallback(
    (sheetId: string, worldX: number, worldY: number, vpIdx = activeViewportIdx, animate = true) => {
      openSheetTab(sheetId, vpIdx);
      window.requestAnimationFrame(() => {
        const sel = vpIdx === 0 ? '[data-testid="schematic-canvas"]' : `[data-testid="schematic-canvas-${vpIdx}"]`;
        const el = document.querySelector(sel) || document.querySelector('[data-testid="schematic-canvas"]');
        const rect = el?.getBoundingClientRect();
        const vw = rect?.width && rect.width > 100 ? rect.width : 820;
        const vh = rect?.height && rect.height > 100 ? rect.height : 500;
        const curZoom = viewportTransformsRef.current[vpIdx]?.zoom ?? 0.56;
        const nextZ = Math.min(1.35, Math.max(0.68, curZoom));
        animateCameraTo(
          vpIdx,
          nextZ,
          {
            x: Math.round(vw / 2 - worldX * nextZ),
            y: Math.round(vh / 2 - worldY * nextZ),
          },
          animate
        );
      });
    },
    [activeViewportIdx, animateCameraTo, openSheetTab]
  );

  const handleJumpToIssue = useCallback(
    (issue: ErcIssue) => {
      const cur = docStateRef.current.present;
      const dev = issue.deviceId ? cur.devices.find((d) => d.id === issue.deviceId) : undefined;
      const wire = issue.wireId ? cur.wires.find((w) => w.id === issue.wireId) : undefined;
      const targetSheetId = issue.sheetId || dev?.sheetId || wire?.sheetId;
      const targetSheet = targetSheetId ? cur.sheets.find((s) => s.id === targetSheetId) : undefined;

      if (dev) {
        applySelection({ deviceIds: [dev.id] });
        setHighlightedPotentialSeed(null);
        const b = getDeviceBounds(dev);
        centerCameraOnCoords(dev.sheetId, b.x + b.width / 2, b.y + b.height / 2, activeViewportIdx);
      } else if (wire) {
        applySelection({ wireIds: [wire.id] });
        setHighlightedPotentialSeed({ wireId: wire.id });
        const pts = wire.waypoints && wire.waypoints.length > 0 ? wire.waypoints : [];
        let wx = 400;
        let wy = 300;
        if (pts.length >= 2) {
          const mid = pts[Math.floor(pts.length / 2)];
          const prevPt = pts[Math.floor(pts.length / 2) - 1] || mid;
          wx = (prevPt.x + mid.x) / 2;
          wy = (prevPt.y + mid.y) / 2;
        } else if (pts.length === 1) {
          wx = pts[0].x;
          wy = pts[0].y;
        } else {
          const dFrom = cur.devices.find((d) => d.id === wire.fromDeviceId);
          const dTo = cur.devices.find((d) => d.id === wire.toDeviceId);
          const pFrom = dFrom?.pins.find((p) => p.id === wire.fromPinId);
          const pTo = dTo?.pins.find((p) => p.id === wire.toPinId);
          if (dFrom && dTo && pFrom && pTo) {
            const p1 = getAbsolutePinPos(dFrom, pFrom);
            const p2 = getAbsolutePinPos(dTo, pTo);
            wx = (p1.x + p2.x) / 2;
            wy = (p1.y + p2.y) / 2;
          }
        }
        centerCameraOnCoords(wire.sheetId, wx, wy, activeViewportIdx);
      } else if (targetSheet) {
        openSheetTab(targetSheet.id, activeViewportIdx);
        fitSheetToViewport(targetSheet, activeViewportIdx);
      }

      appendLog(
        'INFO',
        'E3-CORE',
        `Переход к замечанию ${issue.code}${targetSheet ? ` (Лист ${targetSheet.number})` : ''}: ${issue.message}`
      );
    },
    [applySelection, centerCameraOnCoords, activeViewportIdx, fitSheetToViewport, openSheetTab, appendLog]
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
      const seededIds =
        viewportLayout === 'single' && mode !== 'single'
          ? [activeSheetId, ...viewportSheetIds.filter((id) => id !== activeSheetId)]
          : viewportSheetIds;
      const nextSheetIds = computeViewportSheets(mode, project.sheets, seededIds, activeSheetId);
      setViewportLayout(mode);
      setViewportSheetIds(nextSheetIds);
      setActiveViewportIdx(0);
      const nextTargetId =
        mode === 'single'
          ? openSheetIdsRef.current.length > 0
            ? activeSheetId || openSheetIdsRef.current[0]
            : ''
          : nextSheetIds[0] || activeSheetId;
      if (nextTargetId) {
        setOpenSheetIds((prev) => ensureSheetTabOpen(prev, nextTargetId, project.sheets));
      }
      setActiveSheetId(nextTargetId);
      window.requestAnimationFrame(() => {
        const cnt = viewportCountForMode(mode);
        for (let i = 0; i < cnt; i++) {
          const id = mode === 'single' ? nextTargetId : nextSheetIds[i];
          if (!id) continue;
          const sh = project.sheets.find((s) => s.id === id);
          if (sh) fitSheetToViewport(sh, i);
        }
      });
      appendLog(
        'INFO',
        'E3-CORE',
        `Режим просмотра листов: ${viewportCountForMode(mode)} в центре (${nextSheetIds.join(', ')}).`,
        undefined,
        undefined,
        {
          cause: `Переключение раскладки холста → "${mode}"`,
          outcome: `Отображены листы: ${nextSheetIds.join(', ')}`,
        }
      );
    },
    [viewportLayout, project.sheets, viewportSheetIds, activeSheetId, fitSheetToViewport, appendLog]
  );

  const handleDuplicateSheet = useCallback(
    (sheetId: string) => {
      const { nextProject, newSheetId } = duplicateSheetInProject(project, sheetId);
      commitProject(() => nextProject);
      setOpenSheetIds((prev) => ensureSheetTabOpen(prev, newSheetId, nextProject.sheets));
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
      const syncedOpen = syncOpenSheetIds(openSheetIdsRef.current, nextProject.sheets);
      setOpenSheetIds(syncedOpen);
      const nextActive =
        activeSheetIdRef.current === sheetId
          ? syncedOpen[0] || (syncedOpen.length > 0 ? nextActiveSheetId : '')
          : activeSheetIdRef.current;
      setActiveSheetId(nextActive);
      setViewportSheetIds((prev) =>
        prev.map((id) => (id === sheetId ? nextActive || nextActiveSheetId : id))
      );
      setSelectedDeviceId(null);
      setSelectedWireId(null);
      setSelectedAnnotationId(null);
      appendLog('WARN', 'E3-CORE', 'Лист удалён из проекта.');
    },
    [project, commitProject, appendLog]
  );

  // Panel dock dragging & edge resizing handlers (GPU translate3d for zero-jitter floating moves)
  const handleStartPanelDrag = useCallback(
    (panelId: PanelId, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const panel = dockLayout.panels[panelId];
      const floatingEl =
        panel.dock === 'floating'
          ? document.querySelector<HTMLElement>(`[data-testid="floating-panel-${panelId}"]`)
          : null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const factor = uiScaleFactor(uiScaleRef.current);
      const chrome = getScaledChromeMetrics(uiScaleRef.current);
      const panelW = floatingEl?.offsetWidth || panel.floating.width;
      const panelH =
        floatingEl?.offsetHeight ||
        (panel.collapsed ? chrome.collapsedHeaderHeight : panel.floating.height);
      const minY = Math.round(40 * Math.min(factor, 1.5));
      const maxX = Math.max(8, vw - panelW - 8);
      const maxY = Math.max(minY, vh - panelH - 8);

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

      let dragRafId: number | null = null;
      let latestEv: { clientX: number; clientY: number } | null = null;
      let lastHover: DockSide | null = null;

      const computeClampedFloating = (dx: number, dy: number) => ({
        x: Math.max(8, Math.min(maxX, Math.round(dragState.origFloatingX + dx))),
        y: Math.max(minY, Math.min(maxY, Math.round(dragState.origFloatingY + dy))),
      });

      const applyMove = (clientX: number, clientY: number) => {
        const dx = clientX - dragState.startX;
        const dy = clientY - dragState.startY;
        const movedEnough = Math.hypot(dx, dy) > 6;
        const bounds = workspaceRef.current?.getBoundingClientRect();
        const hover = movedEnough && bounds ? resolveDropTarget(clientX, clientY, bounds) : null;

        if (panel.dock === 'floating' && floatingEl && movedEnough) {
          const nextPos = computeClampedFloating(dx, dy);
          floatingEl.style.willChange = 'transform';
          floatingEl.style.transform = `translate3d(${nextPos.x - dragState.origFloatingX}px, ${
            nextPos.y - dragState.origFloatingY
          }px, 0)`;
        }

        if (!dragState.wasFloating || hover !== lastHover) {
          lastHover = hover;
          setPanelDrag((curr) =>
            curr
              ? {
                  ...curr,
                  currentX: clientX,
                  currentY: clientY,
                  hoverTarget: hover,
                }
              : null
          );
        }
      };

      const onMove = (ev: PointerEvent) => {
        latestEv = { clientX: ev.clientX, clientY: ev.clientY };
        if (!dragRafId) {
          dragRafId = window.requestAnimationFrame(() => {
            dragRafId = null;
            if (latestEv) applyMove(latestEv.clientX, latestEv.clientY);
          });
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (dragRafId) {
          window.cancelAnimationFrame(dragRafId);
          dragRafId = null;
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);

        if (floatingEl) {
          floatingEl.style.transform = '';
          floatingEl.style.willChange = '';
        }

        const dx = ev.clientX - dragState.startX;
        const dy = ev.clientY - dragState.startY;
        const curFactor = uiScaleFactor(uiScaleRef.current);
        if (Math.hypot(dx, dy) > 6) {
          const bounds = workspaceRef.current?.getBoundingClientRect();
          const target = bounds ? resolveDropTarget(ev.clientX, ev.clientY, bounds) : 'floating';
          if (dragState.wasFloating && target === 'floating') {
            const nextPos = computeClampedFloating(dx, dy);
            setDockLayout((prev) =>
              updateFloatingRect(
                prev,
                panelId,
                nextPos,
                window.innerWidth,
                window.innerHeight,
                curFactor
              )
            );
          } else {
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
                window.innerHeight,
                curFactor
              )
            );
          }
        }
        setPanelDrag(null);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
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

      let resizeRafId: number | null = null;
      let latestNext = startSize;

      const onMove = (ev: PointerEvent) => {
        if (edge === 'left') latestNext = startSize + (ev.clientX - startX);
        else if (edge === 'right') latestNext = startSize - (ev.clientX - startX);
        else if (edge === 'bottom') latestNext = startSize - (ev.clientY - startY);
        else if (edge === 'top') latestNext = startSize + (ev.clientY - startY);

        if (!resizeRafId) {
          resizeRafId = window.requestAnimationFrame(() => {
            resizeRafId = null;
            const targetSize = latestNext;
            const factor = uiScaleFactor(uiScaleRef.current);
            setDockLayout((prev) =>
              resizeDockEdge(prev, edge, targetSize, window.innerWidth, window.innerHeight, factor)
            );
          });
        }
      };

      const onUp = () => {
        if (resizeRafId) {
          window.cancelAnimationFrame(resizeRafId);
          resizeRafId = null;
        }
        const factor = uiScaleFactor(uiScaleRef.current);
        setDockLayout((prev) =>
          resizeDockEdge(prev, edge, latestNext, window.innerWidth, window.innerHeight, factor)
        );
        setResizingDockEdge(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
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

      let floatRafId: number | null = null;
      let latestW = orig.width;
      let latestH = orig.height;

      const onMove = (ev: PointerEvent) => {
        latestW = orig.width + (ev.clientX - startX);
        latestH = orig.height + (ev.clientY - startY);
        if (!floatRafId) {
          floatRafId = window.requestAnimationFrame(() => {
            floatRafId = null;
            const w = latestW;
            const h = latestH;
            const factor = uiScaleFactor(uiScaleRef.current);
            setDockLayout((prev) =>
              updateFloatingRect(
                prev,
                panelId,
                { width: w, height: h },
                window.innerWidth,
                window.innerHeight,
                factor
              )
            );
          });
        }
      };

      const onUp = () => {
        if (floatRafId) {
          window.cancelAnimationFrame(floatRafId);
          floatRafId = null;
        }
        const factor = uiScaleFactor(uiScaleRef.current);
        setDockLayout((prev) =>
          updateFloatingRect(
            prev,
            panelId,
            { width: latestW, height: latestH },
            window.innerWidth,
            window.innerHeight,
            factor
          )
        );
        setResizingDockEdge(null);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [dockLayout.panels]
  );

  const handleBuildHvacDiagram = useCallback(
    (options: HvacBuildOptions) => {
      const res = generateHvacDiagram(options, mergedCatalog, project);
      commitProject(() => res.nextProject);
      setOpenSheetIds((prev) =>
        ensureSheetTabOpen(
          res.wiringSheetId ? ensureSheetTabOpen(prev, res.fsaSheetId, res.nextProject.sheets) : prev,
          res.wiringSheetId || res.fsaSheetId,
          res.nextProject.sheets
        )
      );
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

  const handleReleaseSheetRevision = useCallback(
    (
      sheetId: string,
      opts: { revisionLabel: string; changeDoc?: string; changeDate?: string; comment?: string }
    ) => {
      const cleanLabel = opts.revisionLabel.trim();
      if (!cleanLabel) return;
      const cur = docStateRef.current.present;
      const sheet = cur.sheets.find((s) => s.id === sheetId);
      if (!sheet) return;
      const released = releaseSheetRevision(cur, sheetId, {
        revisionLabel: cleanLabel,
        changeDoc: opts.changeDoc,
        changeDate: opts.changeDate,
        comment: opts.comment,
        author: sheet.titleBlock.designer || cur.author,
      });
      if (released === cur) return;
      commitProject(() => released, true, { skipSheetTracking: true });
      appendLog(
        'SYNC',
        'E3-CORE',
        `Лист «${sheet.name}»: сохранена внутренняя ревизия «Изм. ${cleanLabel}».`
      );
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
            delete sharedPatch.izm;
            delete sharedPatch.changeDoc;
            delete sharedPatch.changeDate;
            if (!shouldCopyForm) {
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
      const restored = restoreSheetFromRevision(cur, sheetId, targetRevision);
      if (restored === cur) return;
      commitProject(() => restored, true, { skipSheetTracking: true });
      applySelection({});
      const nextSheet = restored.sheets.find((s) => s.id === sheetId) || sheet;
      appendLog(
        'INFO',
        'E3-CORE',
        `Лист «${sheet.name}» восстановлен из снимка ${getSheetRevisionLabel(nextSheet)} (v${getSheetRevisionNumber(nextSheet)}).`
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
        true
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
        true
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
        true
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
        true
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
          const px = Number(payload.x);
          const py = Number(payload.y);
          if (cat) {
            handlePlaceCatalogItem(
              { ...cat, componentName: String(payload.componentName || cat.componentName) },
              Number.isFinite(px) ? px : 260,
              Number.isFinite(py) ? py : 240
            );
          }
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
    terminalEditorOpen ||
    autoNumberModalOpen ||
    fluxPublishOpen ||
    healthOpen ||
    stampModalState.open;

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
      setOpenSheetIds(sheetIds);
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
      setOpenSheetIds(sheetIds);
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

  const handleInsertGostTable = useCallback(
    (tableKind: 'bom' | 'cables') => {
      const cur = docStateRef.current.present;
      if (isLayerLocked(cur.layers, 'annotations')) {
        appendLog('WARN', 'E3-CORE', 'Вставка таблицы отклонена: слой «Аннотации и зоны» заблокирован.');
        return;
      }
      const targetSheet = cur.sheets.find((s) => s.id === activeSheetId) || cur.sheets[0];
      if (!targetSheet) return;
      const annKind: AnnotationKind = tableKind === 'cables' ? 'cable_table' : 'bom_table';
      const drawable = getSheetDrawableBounds(targetSheet);
      const existingTables = (cur.annotations || []).filter(
        (a) =>
          a.sheetId === targetSheet.id &&
          (a.kind === 'bom_table' || a.kind === 'cable_table')
      );
      const baseTitle =
        tableKind === 'cables'
          ? `Кабельный журнал — ${cur.projectCode}`
          : `Перечень элементов ПЭ3 (ГОСТ 2.701) — ${cur.projectCode}`;
      const model = buildGostTableRenderModel(
        {
          kind: annKind,
          sheetId: targetSheet.id,
          text: baseTitle,
          tableConfig: { title: baseTitle, maxRows: 0, sheetOnly: false, rowHeight: 22 },
        },
        cur
      );
      const tblW =
        tableKind === 'cables'
          ? Math.max(CABLE_TABLE_TOTAL_WIDTH, model.width)
          : Math.max(BOM_TABLE_TOTAL_WIDTH, model.width);
      const tblH = model.height;
      const minX = drawable?.minX ?? 40;
      const minY = drawable?.minY ?? 40;
      const maxX = drawable?.maxX ?? targetSheet.width - 20;
      const maxY = drawable?.maxY ?? targetSheet.height - 20;
      const offset = existingTables.length * 28;
      const candidates = [
        { x: Math.round(Math.max(minX + 16, maxX - tblW - 20)), y: Math.round(minY + 20 + offset) },
        { x: Math.round(minX + 20 + offset), y: Math.round(Math.max(minY + 20, maxY - tblH - 20)) },
        { x: Math.round(minX + 20 + offset), y: Math.round(minY + 20 + offset) },
      ];
      const obstacleBoxes = [
        ...cur.devices
          .filter((d) => d.sheetId === targetSheet.id && d.bindingState !== 'REMOVED_IN_FLUX')
          .map((d) => {
            const b = getDeviceBounds(d);
            return { x: b.x, y: b.y, w: b.width, h: b.height };
          }),
        ...existingTables.map((t) => ({ x: t.x, y: t.y, w: t.width || tblW, h: t.height || tblH })),
        { x: maxX - 540, y: maxY - 190, w: 540, h: 190 }, // GOST stamp area
      ];
      const scoreOverlap = (cx: number, cy: number) =>
        obstacleBoxes.reduce((acc, ob) => {
          const ix = Math.max(0, Math.min(cx + tblW, ob.x + ob.w) - Math.max(cx, ob.x));
          const iy = Math.max(0, Math.min(cy + tblH, ob.y + ob.h) - Math.max(cy, ob.y));
          return acc + ix * iy;
        }, 0);
      let best = candidates[0];
      let bestScore = scoreOverlap(best.x, best.y);
      for (const c of candidates.slice(1)) {
        const s = scoreOverlap(c.x, c.y);
        if (s < bestScore) {
          bestScore = s;
          best = c;
        }
      }
      const x = best.x;
      const y = best.y;
      const newAnn: E3Annotation = {
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        sheetId: targetSheet.id,
        kind: annKind,
        x,
        y,
        width:
          tableKind === 'cables'
            ? Math.max(CABLE_TABLE_TOTAL_WIDTH, model.width)
            : Math.max(BOM_TABLE_TOTAL_WIDTH, model.width),
        height: model.height,
        text: baseTitle,
        fontSize: 12,
        tableConfig: {
          title: baseTitle,
          maxRows: 0,
          sheetOnly: false,
          rowHeight: 22,
        },
      };
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        annotations: [...(prev.annotations || []), newAnn],
      }));
      openSheetTab(targetSheet.id);
      applySelection({ annotationIds: [newAnn.id] });
      setTool('select');
      appendLog(
        'INFO',
        'E3-CORE',
        `На лист «${targetSheet.name}» вставлена живая таблица: ${baseTitle} (${model.totalRows} поз.).`
      );
    },
    [activeSheetId, commitProject, applySelection, appendLog]
  );

  const handleSaveSessionNow = useCallback(() => {
    const res = saveActiveSession(docStateRef.current.present, activeSheetIdRef.current);
    setLastSavedAt(res.savedAt);
    setRecentProjects(res.recent);
    appendLog(
      'SYNC',
      'E3-CORE',
      `Сессия проекта «${docStateRef.current.present.name}» сохранена локально.`
    );
  }, [appendLog]);

  const handleCreateNewProject = useCallback(() => {
    saveActiveSession(docStateRef.current.present, activeSheetIdRef.current);
    const seed = createSeedProject();
    const suffix = Date.now().toString(36).slice(-4).toUpperCase();
    const fresh: E3Project = {
      ...seed,
      id: `proj-${Date.now().toString(36)}`,
      name: `Новый проект (${suffix})`,
      projectCode: `ПДХ-${suffix}`,
      revision: 1,
      updatedAt: new Date().toISOString(),
    };
    const nextSheetId = fresh.sheets[0]?.id || 'sheet-1';
    setDocState({ past: [], present: fresh, future: [] });
    setOpenSheetIds(fresh.sheets.map((s) => s.id));
    setActiveSheetId(nextSheetId);
    setViewportSheetIds(fresh.sheets.map((s) => s.id));
    applySelection({ deviceIds: fresh.devices[0] ? [fresh.devices[0].id] : [] });
    const res = saveActiveSession(fresh, nextSheetId);
    setLastSavedAt(res.savedAt);
    setRecentProjects(res.recent);
    pushSync(fresh);
    if (fresh.sheets[0]) {
      window.requestAnimationFrame(() => fitSheetToViewport(fresh.sheets[0], activeViewportIdx));
    }
    appendLog('INFO', 'E3-CORE', `Создан новый проект ${fresh.name} (${fresh.projectCode}).`);
  }, [applySelection, pushSync, fitSheetToViewport, activeViewportIdx, appendLog]);

  const handleOpenRecentProject = useCallback(
    (projectId: string) => {
      const latest = loadRecentProjects();
      const target =
        recentProjects.find((r) => r.id === projectId) ||
        latest.find((r) => r.id === projectId);
      if (!target) return;
      saveActiveSession(docStateRef.current.present, activeSheetIdRef.current);
      const restoredProj = hydrateProjectDefaults(structuredClone(target.project));
      const nextSheetId = restoredProj.sheets.some((s) => s.id === target.activeSheetId)
        ? target.activeSheetId
        : restoredProj.sheets[0]?.id || 'sheet-1';
      setDocState({ past: [], present: restoredProj, future: [] });
      setOpenSheetIds(restoredProj.sheets.map((s) => s.id));
      setActiveSheetId(nextSheetId);
      setViewportSheetIds(restoredProj.sheets.map((s) => s.id));
      applySelection({});
      const res = saveActiveSession(restoredProj, nextSheetId);
      setLastSavedAt(res.savedAt);
      setRecentProjects(res.recent);
      pushSync(restoredProj);
      const sh = restoredProj.sheets.find((s) => s.id === nextSheetId) || restoredProj.sheets[0];
      if (sh) {
        window.requestAnimationFrame(() => fitSheetToViewport(sh, activeViewportIdx));
      }
      appendLog(
        'SYNC',
        'E3-CORE',
        `Загружен недавний проект «${restoredProj.name}» (${restoredProj.projectCode}, Rev ${restoredProj.revision}).`
      );
    },
    [recentProjects, applySelection, pushSync, fitSheetToViewport, activeViewportIdx, appendLog]
  );

  const handleRemoveRecentProject = useCallback(
    (projectId: string) => {
      setRecentProjects(removeRecentProject(projectId));
      appendLog('INFO', 'E3-CORE', 'Проект удалён из списка недавних.');
    },
    [appendLog]
  );

  const commandPaletteItems = useMemo(
    () =>
      buildCommandPaletteItems(project, {
        hasSelection:
          selectedDeviceIds.length > 0 ||
          selectedWireIds.length > 0 ||
          selectedAnnotationIds.length > 0,
        hasClipboard,
        selectedDeviceCount: selectedDeviceIds.length,
        canUndo: history.length > 0,
        canRedo: future.length > 0,
        snapToGrid: project.visualSettings.snapToGrid,
        smartGuides: project.visualSettings.smartGuides !== false,
        showGrid: project.visualSettings.showGrid,
        showCrosshair: project.visualSettings.showCrosshair !== false,
      }),
    [
      project,
      selectedDeviceIds.length,
      selectedWireIds.length,
      selectedAnnotationIds.length,
      hasClipboard,
      history.length,
      future.length,
    ]
  );

  const handleExecuteCommandPaletteItem = useCallback(
    (item: CommandPaletteItem) => {
      const act = item.action;
      switch (act.type) {
        case 'set-tool':
          setTool(act.tool);
          break;
        case 'copy-selected':
          handleCopySelected();
          break;
        case 'paste-clipboard':
          handlePasteClipboard();
          break;
        case 'duplicate-selected':
          handleDuplicateSelected();
          break;
        case 'delete-selected':
          handleDeleteSelected();
          break;
        case 'rotate-selected':
          handleRotateSelected();
          break;
        case 'align-selected':
          handleAlignSelectedDevices(act.align);
          break;
        case 'zoom-fit':
          fitSheetToViewport(undefined, activeViewportIdx);
          break;
        case 'zoom-delta':
          setZoom(Math.min(2.5, Math.max(0.18, Math.round((zoom + act.delta) * 100) / 100)));
          break;
        case 'zoom-percent':
          setZoom(Math.min(2.5, Math.max(0.16, Math.round(act.percent) / 100)));
          break;
        case 'toggle-snap':
          handleApplyVisualSettings({
            ...project.visualSettings,
            snapToGrid: !project.visualSettings.snapToGrid,
          });
          appendLog(
            'INFO',
            'E3-CORE',
            `Привязка к сетке (F3): ${!project.visualSettings.snapToGrid ? 'включена' : 'выключена'}.`
          );
          break;
        case 'toggle-guides': {
          const next = !(project.visualSettings.smartGuides !== false);
          handleApplyVisualSettings({ ...project.visualSettings, smartGuides: next });
          appendLog('INFO', 'E3-CORE', `Орто / направляющие (F8): ${next ? 'включены' : 'выключены'}.`);
          break;
        }
        case 'toggle-grid':
          handleApplyVisualSettings({
            ...project.visualSettings,
            showGrid: !project.visualSettings.showGrid,
          });
          appendLog(
            'INFO',
            'E3-CORE',
            `Координатная сетка (F9): ${!project.visualSettings.showGrid ? 'показана' : 'скрыта'}.`
          );
          break;
        case 'toggle-crosshair': {
          const nextCh = !(project.visualSettings.showCrosshair !== false);
          handleApplyVisualSettings({
            ...project.visualSettings,
            showCrosshair: nextCh,
          });
          appendLog('INFO', 'E3-CORE', `Перекрестие курсора: ${nextCh ? 'включено' : 'выключено'}.`);
          break;
        }
        case 'autoroute':
          handleAutoRouteActiveSheetWires();
          break;
        case 'open-erc':
          setConsoleTab('erc');
          setConsoleCollapsed(false);
          break;
        case 'open-health':
          setHealthOpen(true);
          break;
        case 'open-bom':
          setConsoleTab('bom');
          setConsoleCollapsed(false);
          break;
        case 'open-terminals':
          setTerminalEditorOpen(true);
          break;
        case 'open-autonum':
          setAutoNumberModalOpen(true);
          break;
        case 'open-catalog':
          setLeftTab('library');
          setDockLayout((prev) =>
            prev.panels.explorer.collapsed ? togglePanelCollapse(prev, 'explorer') : prev
          );
          break;
        case 'open-hvac-wizard':
          setHvacWizardOpen(true);
          break;
        case 'open-symbol-designer':
          openBlockEditorWorkspace();
          break;
        case 'insert-sheet-table':
          handleInsertGostTable(act.tableKind);
          break;
        case 'save-session':
          handleSaveSessionNow();
          break;
        case 'add-sheet':
          handleAddSheet();
          break;
        case 'export-dxf':
          void handleExportDxf();
          break;
        case 'export-pdf':
          void handleBatchPublish({
            format: 'pdf',
            sheetIds: project.sheets.map((s) => s.id),
            includeBom: true,
            includeCables: true,
            includeGostFrame: true,
            editableBlocks: true,
          });
          break;
        case 'open-publish':
          setPublishModalOpen(true);
          break;
        case 'open-stamp':
          setStampModalState({
            open: true,
            sheetId: activeSheet?.id || project.sheets[0]?.id || 'sheet-1',
            mode: 'values',
            field: null,
          });
          break;
        case 'undo':
          handleUndo();
          break;
        case 'redo':
          handleRedo();
          break;
        case 'open-find':
          setCommandPaletteInitialQuery(act.initialQuery || '');
          setCommandPaletteOpen(true);
          break;
        case 'jump-sheet': {
          const sh = project.sheets.find((s) => s.id === act.sheetId);
          if (sh) {
            openSheetTab(sh.id, activeViewportIdx);
            fitSheetToViewport(sh, activeViewportIdx);
            appendLog('INFO', 'E3-CORE', `Переход на Лист ${sh.number}: «${sh.name}».`);
          }
          break;
        }
        case 'jump-device': {
          const dev = project.devices.find((d) => d.id === act.deviceId);
          if (dev) {
            applySelection({ deviceIds: [dev.id] });
            const b = getDeviceBounds(dev);
            centerCameraOnCoords(dev.sheetId, b.x + b.width / 2, b.y + b.height / 2, activeViewportIdx);
            appendLog('INFO', 'E3-CORE', `Переход к изделию ${dev.designation} (${dev.componentName}).`);
          }
          break;
        }
        case 'jump-wire': {
          const wire = project.wires.find((w) => w.id === act.wireId);
          if (wire) {
            applySelection({ wireIds: [wire.id] });
            setHighlightedPotentialSeed({ wireId: wire.id });
            const mid =
              wire.waypoints[Math.floor(wire.waypoints.length / 2)] || { x: 400, y: 300 };
            centerCameraOnCoords(wire.sheetId, mid.x, mid.y, activeViewportIdx);
            appendLog('INFO', 'E3-CORE', `Переход к цепи ${wire.wireNumber} (${wire.netName}).`);
          }
          break;
        }
        case 'jump-annotation': {
          const ann = (project.annotations || []).find((a) => a.id === act.annotationId);
          if (ann) {
            applySelection({ annotationIds: [ann.id] });
            centerCameraOnCoords(
              ann.sheetId,
              ann.x + ann.width / 2,
              ann.y + ann.height / 2,
              activeViewportIdx
            );
            appendLog('INFO', 'E3-CORE', `Переход к надписи/таблице на схеме.`);
          }
          break;
        }
      }
    },
    [
      handleCopySelected,
      handlePasteClipboard,
      handleDuplicateSelected,
      handleDeleteSelected,
      handleRotateSelected,
      handleAlignSelectedDevices,
      fitSheetToViewport,
      activeViewportIdx,
      setZoom,
      zoom,
      handleApplyVisualSettings,
      project.visualSettings,
      project.sheets,
      project.devices,
      project.wires,
      project.annotations,
      appendLog,
      handleAutoRouteActiveSheetWires,
      setConsoleCollapsed,
      handleInsertGostTable,
      handleSaveSessionNow,
      handleAddSheet,
      handleExportDxf,
      handleBatchPublish,
      activeSheet?.id,
      handleUndo,
      handleRedo,
      applySelection,
      centerCameraOnCoords,
      openBlockEditorWorkspace,
    ]
  );

  const handleExecuteCommandLine = useCallback(
    (rawCommand: string): CommandLineResolution => {
      const res = resolveCommandLineInput(rawCommand, commandPaletteItems, docStateRef.current.present);
      if (res.status === 'ok' && res.action) {
        handleExecuteCommandPaletteItem({
          id: 'cli-exec',
          title: res.message,
          subtitle: '',
          category: 'action',
          keywords: [],
          action: res.action,
        });
      } else {
        appendLog('WARN', 'E3-CORE', `Командная строка: ${res.message}`);
      }
      return res;
    },
    [commandPaletteItems, handleExecuteCommandPaletteItem, appendLog]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const inEditableText = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable ||
            target.closest('.select-text, pre, [data-selectable="true"]'))
      );
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        if (anyModalOpen) return;
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'a' && !inEditableText) {
        e.preventDefault();
        if (!anyModalOpen && !commandPaletteOpen && !symbolDraft.open) {
          handleSelectAllOnSheet();
        }
        return;
      }
      if (anyModalOpen || commandPaletteOpen) return;
      if (inEditableText) {
        return;
      }
      if (symbolDraft.open) {
        if ((e.ctrlKey || e.metaKey) && key === 'z') {
          e.preventDefault();
          if (e.shiftKey) redoSymbolEditor();
          else undoSymbolEditor();
        } else if ((e.ctrlKey || e.metaKey) && key === 'y') {
          e.preventDefault();
          redoSymbolEditor();
        } else if ((e.ctrlKey || e.metaKey) && key === 's') {
          e.preventDefault();
          saveSymbolWorkspace();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          symbolWorkspaceActions.onDeleteSelection();
        } else if (e.key === 'Escape') {
          symbolWorkspaceActions.onSetTool('select');
        }
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        const nextSnap = !project.visualSettings.snapToGrid;
        handleApplyVisualSettings({ ...project.visualSettings, snapToGrid: nextSnap });
        appendLog('INFO', 'E3-CORE', `Привязка к сетке (F3): ${nextSnap ? 'включена' : 'выключена'}.`);
      } else if (e.key === 'F8') {
        e.preventDefault();
        const nextGuides = !(project.visualSettings.smartGuides !== false);
        handleApplyVisualSettings({ ...project.visualSettings, smartGuides: nextGuides });
        appendLog('INFO', 'E3-CORE', `Орто / направляющие (F8): ${nextGuides ? 'включены' : 'выключены'}.`);
      } else if (e.key === 'F9') {
        e.preventDefault();
        const nextGrid = !project.visualSettings.showGrid;
        handleApplyVisualSettings({ ...project.visualSettings, showGrid: nextGrid });
        appendLog('INFO', 'E3-CORE', `Сетка чертежа (F9): ${nextGrid ? 'показана' : 'скрыта'}.`);
      } else if ((e.code === 'Space' || e.key === ' ') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (target && (target.tagName === 'BUTTON' || target.tagName === 'A')) return;
        e.preventDefault();
        setTool((prev) => (prev === 'wire' ? 'select' : 'wire'));
      } else if ((e.ctrlKey || e.metaKey) && key === 'z') {
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
    commandPaletteOpen,
    symbolDraft.open,
    undoSymbolEditor,
    redoSymbolEditor,
    saveSymbolWorkspace,
    symbolWorkspaceActions,
    project.visualSettings,
    handleApplyVisualSettings,
    appendLog,
    handleUndo,
    handleRedo,
    handleCopySelected,
    handlePasteClipboard,
    handleDuplicateSelected,
    handleSelectAllOnSheet,
    handleDeleteSelected,
    handleRotateSelected,
  ]);

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
          const hydratedSrv = hydrateProjectDefaults(srvProj);
          setProjectRemote((curr) => {
            const hasSavedLocal = Boolean(initialSessionRef.current);
            if ((!hasSavedLocal || hydratedSrv.id === curr.id) && hydratedSrv.revision > curr.revision) {
              suppressSyncPushRef.current = true;
              setOpenSheetIds(hydratedSrv.sheets.map((s) => s.id));
              if (hydratedSrv.sheets[0]) setActiveSheetId(hydratedSrv.sheets[0].id);
              return hydratedSrv;
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
            return merged.slice(0, 1200);
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
            openSheetTab(id, activeViewportIdx);
            setSelectedDeviceId(null);
            setSelectedWireId(null);
            setSelectedAnnotationId(null);
          }}
          onSelectDevice={(dev) => {
            openSheetTab(dev.sheetId, activeViewportIdx);
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
          onOpenSymbolDesigner={openBlockEditorWorkspace}
          symbolWorkspace={symbolWorkspaceActions}
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
          onEditDeviceSymbol={openDeviceSymbolInWorkspace}
          symbolWorkspace={symbolWorkspaceActions}
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
          onReleaseSheetRevision={handleReleaseSheetRevision}
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
                  movePanelDock(
                    prev,
                    'console',
                    side,
                    undefined,
                    window.innerWidth,
                    window.innerHeight,
                    uiScaleFactor(uiScaleRef.current)
                  )
                )
            : undefined
        }
        onFluxBusLog={(entry) => setFluxBusMessages((prev) => [entry, ...prev.slice(0, 49)])}
        onSetTab={setConsoleTab}
        onExpandPanel={() => setConsoleCollapsed(false)}
        onToggleCollapse={() => setConsoleCollapsed((c) => !c)}
        onJumpToIssue={handleJumpToIssue}
        onSelectDeviceByDesignation={(designation) => {
          const dev = project.devices.find((d) => d.designation === designation);
          if (!dev) return;
          openSheetTab(dev.sheetId, activeViewportIdx);
          setSelectedDeviceId(dev.id);
          setSelectedWireId(null);
          setSelectedAnnotationId(null);
        }}
        onHighlightNet={(netName) => {
          setHighlightedPotentialSeed({ netName });
          const trace = traceConnectedPotential(project, { netName });
          const firstWire = project.wires.find((w) => trace.wireIds.includes(w.id));
          if (firstWire && firstWire.sheetId !== activeSheetId) {
            openSheetTab(firstWire.sheetId, activeViewportIdx);
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
        onOpenTerminalEditor={() => setTerminalEditorOpen(true)}
        onClearLogs={() => setLogs([])}
        onOpenHealthDashboard={() => setHealthOpen(true)}
        onTestApiSyncPush={handleTestApiSyncPush}
      />
    );
  };

  const leftPanels = getPanelsByDock(dockLayout, 'left');
  const rightPanels = getPanelsByDock(dockLayout, 'right');
  const topPanels = getPanelsByDock(dockLayout, 'top');
  const bottomPanels = getPanelsByDock(dockLayout, 'bottom');
  const floatingPanels = getPanelsByDock(dockLayout, 'floating');

  const chromeMetrics = getScaledChromeMetrics(uiScale);

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
          ? chromeMetrics.collapsedBottomHeight
          : chromeMetrics.collapsedHeaderHeight
        : useSideRail
          ? chromeMetrics.collapsedSideRailWidth
          : Math.round(196 * chromeMetrics.factor)
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
            uiScale={uiScale}
            useSideRail={useSideRail}
            multiPanelInBand={panels.length > 1}
            hideHeaderBar={isBottomConsoleOnly && p.id === 'console'}
            isResizing={isResizingThis}
            className="flex-1"
            onStartDrag={handleStartPanelDrag}
            onMoveDock={handleMoveDockPanel}
            onToggleCollapse={handleToggleDockCollapse}
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
  const effectiveViewportSheetsRef = useRef<string[]>(effectiveViewportSheets);
  effectiveViewportSheetsRef.current = effectiveViewportSheets;

  const getScreenSnapshot = useCallback(() => {
    const curProj = docStateRef.current.present;
    const curSheetId = activeSheetIdRef.current;
    const curSheet = curProj.sheets.find((s) => s.id === curSheetId) || curProj.sheets[0];
    const vpIdx = activeViewportIdxRef.current;
    const vpTr = viewportTransformsRef.current[vpIdx] || { zoom: 0.56, pan: { x: 46, y: 12 } };
    return formatScreenSnapshot({
      projectCode: curProj.projectCode,
      revision: curProj.revision,
      sheetNumber: curSheet?.number,
      sheetName: curSheet?.name,
      viewportIdx: vpIdx,
      viewportLayout,
      zoom: vpTr.zoom,
      pan: vpTr.pan,
      tool,
      selectedDevices: selectedDeviceIds.length,
      selectedWires: selectedWireIds.length,
      selectedAnnotations: selectedAnnotationIds.length,
      openModal: healthOpen
        ? 'SystemHealthDashboard'
        : exchangeOpen
          ? 'ExchangeModal'
          : visualOpen
            ? 'VisualSettingsModal'
            : reportOpen
              ? 'ReportModal'
              : portableOpen
                ? 'PortableBuildModal'
                : hvacWizardOpen
                  ? 'HvacWizardModal'
                  : catalogModalOpen
                    ? 'CatalogItemModal'
                    : publishModalOpen
                      ? 'PublishModal'
                      : fluxPublishOpen
                        ? 'FluxStudioPublishModal'
                        : terminalEditorOpen
                          ? 'TerminalStripModal'
                          : autoNumberModalOpen
                            ? 'AutoNumberingModal'
                            : commandPaletteOpen
                              ? 'CommandPaletteModal'
                              : stampModalState.open
                                ? 'StampEditorModal'
                                : null,
      theme: curProj.visualSettings.theme,
      symbolEditorOpen: symbolDraft.open,
    });
  }, [
    viewportLayout,
    tool,
    selectedDeviceIds.length,
    selectedWireIds.length,
    selectedAnnotationIds.length,
    healthOpen,
    exchangeOpen,
    visualOpen,
    reportOpen,
    portableOpen,
    hvacWizardOpen,
    catalogModalOpen,
    publishModalOpen,
    fluxPublishOpen,
    terminalEditorOpen,
    autoNumberModalOpen,
    commandPaletteOpen,
    stampModalState.open,
    symbolDraft.open,
  ]);
  getScreenSnapshotRef.current = getScreenSnapshot;

  const errorLogCount = useMemo(
    () => logs.reduce((acc, l) => acc + (l.level === 'ERROR' ? 1 : 0), 0),
    [logs]
  );

  const centerGridClass =
    viewportLayout === 'single'
      ? 'flex-1 min-w-0 min-h-0 flex'
      : viewportLayout === 'two'
        ? 'flex-1 min-w-0 min-h-0 grid grid-cols-2 gap-1.5 p-1.5 bg-[var(--flux-line)]/40'
        : 'flex-1 min-w-0 min-h-0 grid grid-cols-2 grid-rows-2 gap-1.5 p-1.5 bg-[var(--flux-line)]/40';

  const handleMoveDockPanel = useCallback((id: PanelId, side: DockSide) => {
    setDockLayout((prev) =>
      movePanelDock(
        prev,
        id,
        side,
        undefined,
        window.innerWidth,
        window.innerHeight,
        uiScaleFactor(uiScaleRef.current)
      )
    );
  }, []);

  const handleToggleDockCollapse = useCallback((id: PanelId) => {
    setDockLayout((prev) => togglePanelCollapse(prev, id));
  }, []);

  const handleCanvasToggleGrid = useCallback(() => {
    const vs = docStateRef.current.present.visualSettings;
    handleApplyVisualSettings({ ...vs, showGrid: !vs.showGrid });
  }, [handleApplyVisualSettings]);

  const handleCanvasToggleSnap = useCallback(() => {
    const vs = docStateRef.current.present.visualSettings;
    handleApplyVisualSettings({ ...vs, snapToGrid: !vs.snapToGrid });
  }, [handleApplyVisualSettings]);

  const handleCanvasToggleSmartGuides = useCallback(() => {
    const vs = docStateRef.current.present.visualSettings;
    handleApplyVisualSettings({ ...vs, smartGuides: !(vs.smartGuides !== false) });
  }, [handleApplyVisualSettings]);

  const handleCanvasToggleCrosshair = useCallback(() => {
    const vs = docStateRef.current.present.visualSettings;
    handleApplyVisualSettings({ ...vs, showCrosshair: !(vs.showCrosshair !== false) });
  }, [handleApplyVisualSettings]);

  const handleCanvasSelectDevice = useCallback(
    (id: string | null, opts?: { toggle?: boolean }) => {
      if (!id) {
        applySelection({});
        return;
      }
      if (opts?.toggle) {
        setSelectedDeviceIds((prev) => toggleIdInSelection(prev, id));
      } else {
        applySelection({ deviceIds: [id] });
      }
    },
    [applySelection]
  );

  const handleCanvasSelectWire = useCallback(
    (id: string | null, opts?: { toggle?: boolean }) => {
      if (!id) {
        applySelection({});
        return;
      }
      if (opts?.toggle) {
        setSelectedWireIds((prev) => toggleIdInSelection(prev, id));
      } else {
        applySelection({ wireIds: [id] });
      }
    },
    [applySelection]
  );

  const handleCanvasSelectAnnotation = useCallback(
    (id: string | null, opts?: { toggle?: boolean }) => {
      if (!id) {
        applySelection({});
        return;
      }
      if (opts?.toggle) {
        setSelectedAnnotationIds((prev) => toggleIdInSelection(prev, id));
      } else {
        applySelection({ annotationIds: [id] });
      }
    },
    [applySelection]
  );

  const handleCanvasSetSelection = useCallback(
    (next: { deviceIds: string[]; wireIds: string[]; annotationIds: string[] }, additive?: boolean) => {
      if (additive) {
        setSelectedDeviceIds((prev) => Array.from(new Set([...prev, ...next.deviceIds])));
        setSelectedWireIds((prev) => Array.from(new Set([...prev, ...next.wireIds])));
        setSelectedAnnotationIds((prev) => Array.from(new Set([...prev, ...next.annotationIds])));
      } else {
        applySelection(next);
      }
    },
    [applySelection]
  );

  const handleCanvasHighlightPotential = useCallback(
    (seed: { wireId?: string; netName?: string; deviceId?: string; pinId?: string }) =>
      setHighlightedPotentialSeed(seed),
    []
  );

  const handleCanvasClearPotentialHighlight = useCallback(
    () => setHighlightedPotentialSeed(null),
    []
  );

  const handleCanvasDropCatalogItem = useCallback(
    (item: CatalogItem, x: number, y: number, shId: string) =>
      handlePlaceCatalogItem(item, x, y, shId),
    [handlePlaceCatalogItem]
  );

  const handleCanvasOpenStampEditor = useCallback(
    (sheetId: string, fieldKey?: StampFieldKey) => {
      if (isLayerLocked(docStateRef.current.present.layers, 'frame')) return;
      setStampModalState({ open: true, sheetId, mode: 'values', field: fieldKey || null });
    },
    []
  );

  const viewportHandlers = useMemo(
    () =>
      Array.from({ length: 4 }, (_, idx) => ({
        onFocusViewport: () => {
          setActiveViewportIdx(idx);
          if (viewportLayoutRef.current === 'single') {
            return;
          }
          const shId =
            effectiveViewportSheetsRef.current[idx] ||
            viewportSheetIdsRef.current[idx] ||
            activeSheetIdRef.current;
          setActiveSheetId(shId);
        },
        onFitViewport: () => {
          const shId =
            viewportLayoutRef.current === 'single'
              ? activeSheetIdRef.current
              : effectiveViewportSheetsRef.current[idx] ||
                viewportSheetIdsRef.current[idx] ||
                activeSheetIdRef.current;
          if (!shId) return;
          const sh = docStateRef.current.present.sheets.find((s) => s.id === shId);
          if (sh) fitSheetToViewportRef.current(sh, idx, true);
        },
        onSelectSheet: (id: string) => {
          setActiveViewportIdx(idx);
          const sheets = docStateRef.current.present.sheets;
          setOpenSheetIds((prev) => ensureSheetTabOpen(prev, id, sheets));
          setActiveSheetId(id);
          setViewportSheetIds((prev) => {
            const base =
              effectiveViewportSheetsRef.current.length >= 4
                ? effectiveViewportSheetsRef.current
                : prev;
            const next = [...base];
            next[idx] = id;
            return next;
          });
          const target = sheets.find((s) => s.id === id);
          if (target) fitSheetToViewportRef.current(target, idx, true);
        },
        onSetZoom: (nextZ: number) => {
          cancelCameraAnimRef.current(idx);
          setViewportTransforms((prev) => ({
            ...prev,
            [idx]: { zoom: nextZ, pan: prev[idx]?.pan || { x: 20, y: 12 } },
          }));
        },
        onSetPan: (nextPan: { x: number; y: number }) => {
          cancelCameraAnimRef.current(idx);
          setViewportTransforms((prev) => ({
            ...prev,
            [idx]: { zoom: prev[idx]?.zoom ?? 0.45, pan: nextPan },
          }));
        },
        onSetTransform: (nextZ: number, nextPan: { x: number; y: number }) => {
          cancelCameraAnimRef.current(idx);
          setViewportTransforms((prev) => ({
            ...prev,
            [idx]: { zoom: nextZ, pan: nextPan },
          }));
        },
      })),
    []
  );

  const workspaceBoundsRect = workspaceRef.current?.getBoundingClientRect();

  return (
    <MotionConfig reducedMotion="user">
    <div
      data-testid="app-shell"
      className="h-screen w-full max-w-full overflow-hidden flex flex-col flux-ambient-shell text-[var(--flux-text)]"
    >
      <TopToolbar
        project={project}
        activeSheet={activeSheet}
        tool={tool}
        zoom={zoom}
        uiScale={uiScale}
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
        onChangeUiScale={handleChangeUiScale}
        onSetViewportLayout={handleSetViewportLayout}
        onResetDockLayout={() => {
          setDockLayout(
            rescaleDockLayoutForUiScale(
              createDefaultDockLayout(),
              100,
              uiScaleRef.current,
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
        onFitView={() => fitSheetToViewport(undefined, activeViewportIdx, true)}
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
        onOpenTerminalEditor={() => setTerminalEditorOpen(true)}
        onOpenAutoNumbering={() => setAutoNumberModalOpen(true)}
        onToggleLayerVisibility={handleToggleLayerVisibility}
        onToggleLayerLock={handleToggleLayerLock}
        onShowAllLayers={handleShowAllLayers}
        onUnlockAllLayers={handleUnlockAllLayers}
        onOpenCommandPalette={() => {
          setCommandPaletteInitialQuery('');
          setCommandPaletteOpen(true);
        }}
        onOpenHealthDashboard={() => setHealthOpen(true)}
        errorLogCount={errorLogCount}
        onOpenSymbolDesigner={openBlockEditorWorkspace}
        symbolWorkspace={symbolWorkspaceActions}
        onInsertGostTable={handleInsertGostTable}
        recentProjects={recentProjects}
        lastSavedAt={lastSavedAt}
        onSaveSessionNow={handleSaveSessionNow}
        onCreateNewProject={handleCreateNewProject}
        onOpenRecentProject={handleOpenRecentProject}
        onRemoveRecentProject={handleRemoveRecentProject}
      />

      {/* Dockable Workspace Shell */}
      <div ref={workspaceRef} className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
        {renderDockBand(topPanels, 'top')}

        <main className="flex-1 min-h-0 flex overflow-hidden">
          {renderDockBand(leftPanels, 'left')}

          {/* Center Area: Sheetless Block Editor (BEDIT) OR Multi-Viewport Schematics */}
          <AnimatePresence mode="wait" initial={false}>
          {symbolDraft.open ? (
            <motion.div
              key="symbol-workspace-pane"
              initial={{ opacity: 0, scale: 0.994 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.996 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1 min-w-0 min-h-0 flex"
            >
              <SymbolWorkspaceCanvas
                workspace={symbolWorkspaceActions}
                isDark={project.visualSettings.theme === 'dark'}
              />
            </motion.div>
          ) : (
            <motion.div
              key="center-viewports-pane"
              initial={{ opacity: 0, scale: 0.994 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.996 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              data-testid="center-viewports"
              data-layout={viewportLayout}
              className={centerGridClass}
            >
            {Array.from({ length: vpCount }, (_, idx) => {
              const vpSheetId =
                viewportLayout === 'single'
                  ? activeSheetId
                  : effectiveViewportSheets[idx] || activeSheetId;
              const vpTr = viewportTransforms[idx] || { zoom: 0.42, pan: { x: 20, y: 12 } };
              const vpH = viewportHandlers[idx] || viewportHandlers[0];
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
                    openSheetIds={viewportLayout === 'single' ? openSheetIds : undefined}
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
                    onFocusViewport={vpH.onFocusViewport}
                    onFitViewport={vpH.onFitViewport}
                    onSelectSheet={vpH.onSelectSheet}
                    onCloseSheet={viewportLayout === 'single' ? handleCloseSheetTab : undefined}
                    onAddSheet={handleAddSheet}
                    onSetTool={setTool}
                    onSetZoom={vpH.onSetZoom}
                    onSetPan={vpH.onSetPan}
                    onSetTransform={vpH.onSetTransform}
                    onToggleGrid={handleCanvasToggleGrid}
                    onToggleSnapToGrid={handleCanvasToggleSnap}
                    onToggleSmartGuides={handleCanvasToggleSmartGuides}
                    onToggleCrosshair={handleCanvasToggleCrosshair}
                    onToggleLayerVisibility={handleToggleLayerVisibility}
                    onToggleLayerLock={handleToggleLayerLock}
                    onShowAllLayers={handleShowAllLayers}
                    onUnlockAllLayers={handleUnlockAllLayers}
                    onSelectDevice={handleCanvasSelectDevice}
                    onSelectWire={handleCanvasSelectWire}
                    onSelectAnnotation={handleCanvasSelectAnnotation}
                    onSetSelection={handleCanvasSetSelection}
                    onBeginDrag={handleBeginDrag}
                    onCommitDrag={handleCommitDrag}
                    highlightedTrace={highlightedTrace}
                    onHighlightPotential={handleCanvasHighlightPotential}
                    onClearPotentialHighlight={handleCanvasClearPotentialHighlight}
                    onNavigateOffPage={handleNavigateOffPage}
                    onCreateOffPageAt={handleCreateOffPageAt}
                    onCreateAnnotation={handleCreateAnnotation}
                    onMoveAnnotation={handleMoveAnnotation}
                    onMoveDevice={handleMoveDevice}
                    onPreviewWireWaypoints={handlePreviewWireWaypoints}
                    onCreateWire={handleCreateWire}
                    onDropCatalogItem={handleCanvasDropCatalogItem}
                    onOpenStampEditor={handleCanvasOpenStampEditor}
                    onCommitInPlaceDeviceDesignation={handleCommitInPlaceDeviceDesignation}
                    onCommitInPlaceWireNumber={handleCommitInPlaceWireNumber}
                    onCommitInPlaceAnnotationText={handleCommitInPlaceAnnotationText}
                    onCommitInPlaceStampCell={handleCommitInPlaceStampCell}
                    commandPaletteItems={commandPaletteItems}
                    onExecuteCommandLine={handleExecuteCommandLine}
                  />
                </div>
              );
            })}
            </motion.div>
          )}
          </AnimatePresence>

          {renderDockBand(rightPanels, 'right')}
        </main>

        {renderDockBand(bottomPanels, 'bottom')}

        {/* Floating Undocked Panels */}
        <AnimatePresence initial={false}>
          {floatingPanels.map((fp) => (
            <FloatingPanelWindow
              key={fp.id}
              panel={fp}
              uiScale={uiScale}
              isResizing={resizingDockEdge === 'floating'}
              isMoving={panelDrag?.panelId === fp.id}
              onStartDrag={handleStartPanelDrag}
              onResizeFloatingStart={handleResizeFloatingStart}
              onMoveDock={handleMoveDockPanel}
              onToggleCollapse={handleToggleDockCollapse}
            >
              {renderPanelContent(fp.id)}
            </FloatingPanelWindow>
          ))}
        </AnimatePresence>

        {/* Live Dock Drop Targets while dragging panel headers */}
        <DockDropOverlay
          drag={panelDrag}
          uiScale={uiScale}
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
        uiScale={uiScale}
        onChangeUiScale={handleChangeUiScale}
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
        onOpenFullSymbolEditor={openCatalogSeedInWorkspace}
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

      <TerminalStripModal
        open={terminalEditorOpen}
        project={project}
        initialDeviceId={selectedDevice?.category === 'terminal' ? selectedDevice.id : null}
        onClose={() => setTerminalEditorOpen(false)}
        onUpdateProject={(nextProj, logMsg) => {
          commitProject(() => nextProj, true);
          appendLog('INFO', 'E3-CORE', logMsg);
        }}
        onGenerateSheet={(targetDevId) => {
          const res = generateOrUpdateTerminalStripSheet(docStateRef.current.present, targetDevId);
          commitProject(() => res.nextProject, true);
          setTerminalEditorOpen(false);
          setOpenSheetIds((prev) =>
            ensureSheetTabOpen(prev, res.sheetId, res.nextProject.sheets)
          );
          setActiveSheetId(res.sheetId);
          setViewportSheetIds((prev) =>
            prev.map((sId, idx) => (idx === activeViewportIdx ? res.sheetId : sId))
          );
          const nextSheet = res.nextProject.sheets.find((s) => s.id === res.sheetId);
          if (nextSheet) fitSheetToViewport(nextSheet, activeViewportIdx);
          appendLog(
            'INFO',
            'E3-CORE',
            res.created
              ? 'Создан графический лист клеммных рядов «Клеммные ряды -XT».'
              : 'Обновлён графический лист клеммных рядов «Клеммные ряды -XT».'
          );
        }}
      />

      <AutoNumberingModal
        open={autoNumberModalOpen}
        project={project}
        activeSheetId={activeSheetId}
        onClose={() => setAutoNumberModalOpen(false)}
        onApplyWires={(nextProj, count, modeLabel) => {
          commitProject(() => nextProj, true);
          appendLog(
            'INFO',
            'E3-CORE',
            `Автонумерация цепей по ГОСТ 2.710 (${modeLabel}): обновлено проводов — ${count}.`
          );
        }}
        onApplyDevices={(nextProj, count, orderLabel) => {
          commitProject(() => nextProj, true);
          appendLog(
            'INFO',
            'E3-CORE',
            `Переиндексация ОУО (${orderLabel}): переименовано изделий — ${count}.`
          );
        }}
      />

      <CommandPaletteModal
        open={commandPaletteOpen}
        items={commandPaletteItems}
        initialQuery={commandPaletteInitialQuery}
        onClose={() => {
          setCommandPaletteOpen(false);
          setCommandPaletteInitialQuery('');
        }}
        onExecute={handleExecuteCommandPaletteItem}
      />

      <SystemHealthDashboard
        open={healthOpen}
        logs={logs}
        perf={perfSnapshot}
        screenSnapshot={healthOpen ? getScreenSnapshot() : ''}
        onClose={() => setHealthOpen(false)}
        onClearLogs={() => setLogs([])}
        onDownloadLogsJson={() => {
          downloadText(
            `e3promax-logs-${Date.now()}.json`,
            JSON.stringify(logs, null, 2),
            'application/json;charset=utf-8'
          );
        }}
        onRunWorkerSelfCheck={() => {
          void (async () => {
            const res = await ecadAsync.analyzeProject(docStateRef.current.present);
            appendLog(
              'INFO',
              'WORKER',
              `Диагностический прогон модели (ПЭ3 + ERC): ${res.bom.length} поз., ${res.erc.length} замеч.`,
              res.durationMs,
              undefined,
              {
                cause: 'Ручной запуск проверки отклика из Монитора здоровья',
                outcome: `Успешно за ${res.durationMs.toFixed(1)} мс (${res.viaWorker ? 'Web Worker' : 'Main Thread'})`,
              }
            );
          })();
        }}
      />
    </div>
    </MotionConfig>
  );
}
