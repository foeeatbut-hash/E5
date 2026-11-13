import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomConsole, type ConsoleTab } from './components/BottomConsole';
import { CatalogItemModal } from './components/CatalogItemModal';
import {
  type ActivePanelDrag,
  DockDropOverlay,
  DockResizeHandle,
  DockablePanelFrame,
  FloatingPanelWindow,
  resolveDropTarget,
} from './components/DockablePanel';
import { HvacWizardModal } from './components/HvacWizardModal';
import { LeftExplorer } from './components/LeftExplorer';
import {
  type E3BridgeStatusInfo,
  ExchangeModal,
  ReportModal,
  VisualSettingsModal,
} from './components/Modals';
import { PortableBuildModal } from './components/PortableBuildModal';
import { RightInspector } from './components/RightInspector';
import { SchematicCanvas } from './components/SchematicCanvas';
import { type CadTool, TopToolbar } from './components/TopToolbar';
import {
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
  buildTerminalPlan,
  exportBomCsv,
  exportCableJournalCsv,
  generateStressBatch,
  getAbsolutePinPos,
  importFromFluxBridge,
  nextUniqueDesignation,
  routeSheetWiresCleanly,
  runErc,
} from './core/e3Engine';
import { createSeedProject } from './core/e3Seed';
import type {
  AnnotationKind,
  BomRow,
  CableJournalRow,
  CatalogItem,
  E3Annotation,
  E3Device,
  E3Project,
  E3Sheet,
  E3VisualSettings,
  E3Wire,
  ErcIssue,
  FluxBridgeBundle,
  ProcessLogEntry,
  SchematicFontFamily,
  SheetFormat,
  TerminalPlanRow,
} from './core/e3Types';
import { detectFluxHost, pushProjectToFluxHost } from './core/fluxHostBridge';
import { generateHvacDiagram, type HvacBuildOptions } from './core/hvacBuilder';
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
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>('dev-qf1');
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [tool, setTool] = useState<CadTool>('select');

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

  // Dockable & resizable panel layout
  const [dockLayout, setDockLayout] = useState<DockLayoutState>(() => loadDockLayout());
  const [panelDrag, setPanelDrag] = useState<ActivePanelDrag | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveDockLayout(dockLayout);
  }, [dockLayout]);

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
  const [terminals, setTerminals] = useState<TerminalPlanRow[]>(() => buildTerminalPlan(project));
  const [erc, setErc] = useState<ErcIssue[]>(() => runErc(project));
  const [lastWorkerMs, setLastWorkerMs] = useState<number>(1.2);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [isSyncConnected, setIsSyncConnected] = useState<boolean>(false);

  const [leftTab, setLeftTab] = useState<'project' | 'library'>('project');
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [portableOpen, setPortableOpen] = useState(false);
  const [hvacWizardOpen, setHvacWizardOpen] = useState(false);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
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
        setTerminals(res.terminals);
        setErc(res.erc);
        setLastWorkerMs(res.durationMs);
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
        setIsSyncConnected(true);
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
          }
        } catch {
          // ignore heartbeat
        }
      };
      es.onerror = () => {
        setIsSyncConnected(false);
      };
    } catch {
      setIsSyncConnected(false);
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
    (updater: (prev: E3Project) => E3Project, recordHistory = true) => {
      const cur = docStateRef.current.present;
      const next = updater(cur);
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

  // Reroute attached wires whenever a device moves or rotates (with obstacle avoidance)
  const rerouteDeviceWires = (dev: E3Device, allDevices: E3Device[], wires: E3Wire[]): E3Wire[] => {
    const devMap = new Map(allDevices.map((d) => [d.id, d]));
    return wires.map((w) => {
      if (w.fromDeviceId !== dev.id && w.toDeviceId !== dev.id) return w;
      const d1 = devMap.get(w.fromDeviceId);
      const d2 = devMap.get(w.toDeviceId);
      const p1 = d1?.pins.find((p) => p.id === w.fromPinId);
      const p2 = d2?.pins.find((p) => p.id === w.toPinId);
      if (!d1 || !d2 || !p1 || !p2) return w;
      const obstacles = allDevices
        .filter((d) => d.sheetId === w.sheetId && d.id !== d1.id && d.id !== d2.id && d.category !== 'io_matrix')
        .map((d) => ({ id: d.id, x: d.x, y: d.y, width: d.width, height: d.height }));
      return {
        ...w,
        waypoints: autoRouteOrthogonal(getAbsolutePinPos(d1, p1), getAbsolutePinPos(d2, p2), 20, obstacles),
      };
    });
  };

  const dragSnapshotRef = useRef<E3Project | null>(null);

  const handleBeginDrag = useCallback(() => {
    dragSnapshotRef.current = docStateRef.current.present;
  }, []);

  const handleCommitDrag = useCallback(
    (moved: boolean) => {
      const snap = dragSnapshotRef.current;
      dragSnapshotRef.current = null;
      if (!moved || !snap) return;
      const cur = docStateRef.current.present;
      const committed: E3Project = {
        ...cur,
        revision: cur.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      setDocState((s) => ({
        past: [...s.past.slice(-29), snap],
        present: committed,
        future: [],
      }));
      pushSync(committed);
    },
    [pushSync]
  );

  const handleMoveDevice = useCallback(
    (deviceId: string, x: number, y: number) => {
      setDocState((s) => {
        const prev = s.present;
        const devices = prev.devices.map((d) => (d.id === deviceId ? { ...d, x, y } : d));
        const moved = devices.find((d) => d.id === deviceId);
        const wires = moved ? rerouteDeviceWires(moved, devices, prev.wires) : prev.wires;
        return {
          ...s,
          present: { ...prev, devices, wires, updatedAt: new Date().toISOString() },
        };
      });
    },
    []
  );

  const handleUpdateDevice = useCallback(
    (deviceId: string, patch: Partial<E3Device>) => {
      commitProject((prev) => {
        const devices = prev.devices.map((d) => (d.id === deviceId ? { ...d, ...patch } : d));
        const updated = devices.find((d) => d.id === deviceId);
        const wires = updated ? rerouteDeviceWires(updated, devices, prev.wires) : prev.wires;
        return {
          ...prev,
          revision: prev.revision + 1,
          updatedAt: new Date().toISOString(),
          devices,
          wires,
        };
      });
    },
    [commitProject]
  );

  const handleRotateSelected = useCallback(() => {
    if (!selectedDevice) return;
    const nextRot = ((selectedDevice.rotation + 90) % 360) as 0 | 90 | 180 | 270;
    handleUpdateDevice(selectedDevice.id, { rotation: nextRot });
    appendLog('INFO', 'E3-CORE', `Элемент ${selectedDevice.designation} повёрнут на ${nextRot}°.`);
  }, [selectedDevice, handleUpdateDevice, appendLog]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedDeviceId) {
      const target = project.devices.find((d) => d.id === selectedDeviceId);
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        devices: prev.devices.filter((d) => d.id !== selectedDeviceId),
        wires: prev.wires.filter(
          (w) => w.fromDeviceId !== selectedDeviceId && w.toDeviceId !== selectedDeviceId
        ),
      }));
      setSelectedDeviceId(null);
      if (target) appendLog('WARN', 'E3-CORE', `Удалён элемент ${target.designation} и связанные цепи.`);
    } else if (selectedWireId) {
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        wires: prev.wires.filter((w) => w.id !== selectedWireId),
      }));
      setSelectedWireId(null);
      appendLog('WARN', 'E3-CORE', 'Удалено соединение со схемы.');
    } else if (selectedAnnotationId) {
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        annotations: (prev.annotations || []).filter((a) => a.id !== selectedAnnotationId),
      }));
      setSelectedAnnotationId(null);
      appendLog('WARN', 'E3-CORE', 'Удалена аннотация с листа.');
    }
  }, [selectedDeviceId, selectedWireId, selectedAnnotationId, project.devices, commitProject, appendLog]);

  const handlePlaceCatalogItem = useCallback(
    (item: CatalogItem, x?: number, y?: number, targetSheetId?: string) => {
      const existingWithPrefix = project.devices.filter((d) =>
        d.designation.startsWith(`-${item.defaultPrefix}`)
      ).length;
      const des = nextUniqueDesignation(project.devices, item.defaultPrefix);
      const id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const posX = x ?? 180 + (existingWithPrefix % 5) * 160;
      const posY = y ?? 180 + Math.floor(existingWithPrefix / 5) * 150;

      const newDev: E3Device = {
        id,
        elementId: `el-${Date.now().toString(36)}`,
        designation: des,
        componentName: item.componentName,
        article: item.article,
        manufacturer: item.manufacturer,
        category: item.category,
        sheetId: targetSheetId || activeSheet?.id || project.sheets[0].id,
        x: posX,
        y: posY,
        rotation: 0,
        width: item.width,
        height: item.height,
        e3BlockName: item.e3BlockName,
        bindingState: 'PLACED',
        pins: item.pins.map((p, idx) => ({ ...p, id: `${id}-p${idx + 1}` })),
        attributes: structuredClone(item.defaultAttributes),
      };

      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        devices: [...prev.devices, newDev],
      }));
      setSelectedDeviceId(newDev.id);
      setSelectedWireId(null);
      setSelectedAnnotationId(null);
      appendLog('INFO', 'E3-CORE', `Размещён компонент ${newDev.designation} (${newDev.article}).`);
    },
    [project.devices, project.sheets, activeSheet?.id, commitProject, appendLog]
  );

  const handleCreateAnnotation = useCallback(
    (sheetId: string, kind: AnnotationKind, x: number, y: number) => {
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
      setSelectedDeviceId(null);
      setSelectedWireId(null);
      setSelectedAnnotationId(newAnn.id);
      setTool('select');
      appendLog('INFO', 'E3-CORE', `Добавлена аннотация (${kind}) на лист.`);
    },
    [commitProject, appendLog]
  );

  const handleMoveAnnotation = useCallback((annId: string, x: number, y: number) => {
    setDocState((s) => ({
      ...s,
      present: {
        ...s.present,
        updatedAt: new Date().toISOString(),
        annotations: (s.present.annotations || []).map((a) => (a.id === annId ? { ...a, x, y } : a)),
      },
    }));
  }, []);

  const handleUpdateAnnotation = useCallback(
    (annId: string, patch: Partial<E3Annotation>) => {
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        annotations: (prev.annotations || []).map((a) => (a.id === annId ? { ...a, ...patch } : a)),
      }));
    },
    [commitProject]
  );

  const handleDeleteAnnotation = useCallback(
    (annId: string) => {
      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        annotations: (prev.annotations || []).filter((a) => a.id !== annId),
      }));
      if (selectedAnnotationId === annId) setSelectedAnnotationId(null);
    },
    [commitProject, selectedAnnotationId]
  );

  const handleCreateWire = useCallback(
    (fromDeviceId: string, fromPinId: string, toDeviceId: string, toPinId: string) => {
      const d1 = project.devices.find((d) => d.id === fromDeviceId);
      const d2 = project.devices.find((d) => d.id === toDeviceId);
      const p1 = d1?.pins.find((p) => p.id === fromPinId);
      const p2 = d2?.pins.find((p) => p.id === toPinId);
      if (!d1 || !d2 || !p1 || !p2) return;

      const abs1 = getAbsolutePinPos(d1, p1);
      const abs2 = getAbsolutePinPos(d2, p2);
      const obstacles = project.devices
        .filter((d) => d.sheetId === d1.sheetId && d.id !== d1.id && d.id !== d2.id && d.category !== 'io_matrix')
        .map((d) => ({ id: d.id, x: d.x, y: d.y, width: d.width, height: d.height }));
      let wireIdx = project.wires.length + 1;
      while (project.wires.some((w) => w.netName === `NET_${wireIdx}`)) {
        wireIdx += 1;
      }
      const newWire: E3Wire = {
        id: `w-${Date.now()}`,
        sheetId: d1.sheetId,
        netName: `NET_${wireIdx}`,
        signalType: p1.signalType,
        fromDeviceId,
        fromPinId,
        toDeviceId,
        toPinId,
        waypoints: autoRouteOrthogonal(abs1, abs2, 20, obstacles),
        crossSection: p1.signalType === 'power' ? '2.5 мм²' : '0.75 мм²',
        wireNumber: String(100 + wireIdx),
      };

      commitProject((prev) => ({
        ...prev,
        revision: prev.revision + 1,
        updatedAt: new Date().toISOString(),
        wires: [...prev.wires, newWire],
      }));
      setSelectedWireId(newWire.id);
      setSelectedDeviceId(null);
      appendLog(
        'INFO',
        'E3-CORE',
        `Создана цепь ${newWire.netName}: ${d1.designation}:${p1.name} → ${d2.designation}:${p2.name}.`
      );
    },
    [project.devices, project.wires.length, commitProject, appendLog]
  );

  const handleAddSheet = useCallback(() => {
    const num = project.sheets.length + 1;
    const newSheet: E3Sheet = {
      id: `sheet-${Date.now()}`,
      number: num,
      name: `Доп. схема ${num}`,
      format: 'A3',
      width: 1400,
      height: 920,
      titleBlock: {
        documentCode: project.projectCode,
        organization: project.sheets[0]?.titleBlock.organization || 'Проектный отдел',
        designer: project.author,
        checker: project.sheets[0]?.titleBlock.checker || '',
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
    commitProject((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      updatedAt: new Date().toISOString(),
      wires: routeSheetWiresCleanly(prev.devices, prev.wires, activeSheetId, prev.visualSettings.gridSize),
    }));
    appendLog('INFO', 'E3-CORE', 'Выполнена автотрассировка линий без наложений и пересечения блоков.');
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

  const anyModalOpen =
    exchangeOpen ||
    visualOpen ||
    reportOpen ||
    portableOpen ||
    hvacWizardOpen ||
    catalogModalOpen;

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (anyModalOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        handleDeleteSelected();
      } else if (e.key.toLowerCase() === 'r') {
        handleRotateSelected();
      } else if (e.key.toLowerCase() === 'v') {
        setTool('select');
      } else if (e.key.toLowerCase() === 'w') {
        setTool('wire');
      } else if (e.key.toLowerCase() === 'h') {
        setTool('pan');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [anyModalOpen, handleUndo, handleRedo, handleDeleteSelected, handleRotateSelected]);

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

      commitProject(() => importedProj as E3Project);
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
      commitProject(() => res.project);
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

  const handleApplyVisualSettings = (nextSettings: E3VisualSettings) => {
    commitProject((prev) => ({
      ...prev,
      revision: prev.revision + 1,
      updatedAt: new Date().toISOString(),
      visualSettings: nextSettings,
    }));
    appendLog('SYNC', 'E3-CORE', `Применены и синхронизированы настройки визуализации «${nextSettings.presetName}».`);
  };

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

  const ercErrorCount = erc.filter((i) => i.severity === 'error').length;

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
          onRunStressBatch={handleRunStressBatch}
        />
      );
    }

    if (panelId === 'inspector') {
      return (
        <RightInspector
          project={project}
          activeSheet={activeSheet}
          selectedDevice={selectedDevice}
          selectedWire={selectedWire}
          selectedAnnotation={selectedAnnotation}
          onUpdateDevice={handleUpdateDevice}
          onSaveDeviceToCatalog={handleSaveDeviceToCatalog}
          onUpdateWire={(wireId, patch) => {
            commitProject((prev) => ({
              ...prev,
              revision: prev.revision + 1,
              wires: prev.wires.map((w) => (w.id === wireId ? { ...w, ...patch } : w)),
            }));
          }}
          onDeleteWire={(wireId) => {
            commitProject((prev) => ({
              ...prev,
              revision: prev.revision + 1,
              wires: prev.wires.filter((w) => w.id !== wireId),
            }));
            if (selectedWireId === wireId) setSelectedWireId(null);
          }}
          onUpdateAnnotation={handleUpdateAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          onUpdateSheetTitle={(sheetId, patch) => {
            commitProject((prev) => ({
              ...prev,
              revision: prev.revision + 1,
              sheets: prev.sheets.map((s) =>
                s.id === sheetId ? { ...s, titleBlock: { ...s.titleBlock, ...patch } } : s
              ),
            }));
          }}
          onUpdateSheetFormat={handleUpdateSheetFormat}
          onUpdateFontFamily={handleUpdateFontFamily}
        />
      );
    }

    return (
      <BottomConsole
        project={project}
        activeTab={consoleTab}
        collapsed={consoleCollapsed}
        bom={bom}
        cables={cables}
        terminals={terminals}
        erc={erc}
        logs={logs}
        lastWorkerMs={lastWorkerMs}
        onSetTab={setConsoleTab}
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
        onDownloadBomCsv={() => {
          downloadText(`${project.projectCode}-PE3.csv`, exportBomCsv(bom), 'text/csv;charset=utf-8');
          appendLog('INFO', 'E3-CORE', `Выгружена спецификация ${project.projectCode}-PE3.csv.`);
        }}
        onDownloadCablesCsv={() => {
          downloadText(
            `${project.projectCode}-cables.csv`,
            exportCableJournalCsv(cables),
            'text/csv;charset=utf-8'
          );
          appendLog('INFO', 'E3-CORE', `Выгружен кабельный журнал ${project.projectCode}-cables.csv.`);
        }}
        onDownloadDxf={handleExportDxf}
        onDownloadE3Xml={handleExportE3sOle2}
        onDownloadLogs={() => {
          downloadText(
            `e3promax-logs-${Date.now()}.json`,
            JSON.stringify(logs, null, 2),
            'application/json;charset=utf-8'
          );
        }}
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
    const bandSize = allCollapsed ? 28 : dockLayout.sizes[edge];

    const dividerClass =
      edge === 'left'
        ? 'border-r border-[var(--flux-line)]'
        : edge === 'right'
          ? 'border-l border-[var(--flux-line)]'
          : edge === 'bottom'
            ? 'border-t border-[var(--flux-line)]'
            : 'border-b border-[var(--flux-line)]';

    const bandStyle: React.CSSProperties = isHorizBand
      ? { height: bandSize }
      : { width: allCollapsed ? 180 : bandSize };

    const band = (
      <div
        data-testid={`dock-zone-${edge}`}
        style={bandStyle}
        className={`no-print shrink-0 flex ${
          isHorizBand ? 'flex-row divide-x' : 'flex-col divide-y'
        } divide-[var(--flux-line)] min-w-0 min-h-0 overflow-hidden ${dividerClass}`}
      >
        {panels.map((p) => (
          <DockablePanelFrame
            key={p.id}
            panel={p}
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
      </div>
    );

    if (edge === 'left' || edge === 'top') {
      return (
        <>
          {band}
          {!allCollapsed && <DockResizeHandle edge={edge} onResizeStart={handleResizeDockEdgeStart} />}
        </>
      );
    }

    return (
      <>
        {!allCollapsed && <DockResizeHandle edge={edge} onResizeStart={handleResizeDockEdgeStart} />}
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
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--flux-bg)] text-[var(--flux-text)]">
      <TopToolbar
        project={project}
        activeSheet={activeSheet}
        tool={tool}
        zoom={zoom}
        viewportLayout={viewportLayout}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        hasSelection={Boolean(selectedDeviceId || selectedWireId || selectedAnnotationId)}
        ercErrorCount={ercErrorCount}
        isSyncConnected={isSyncConnected}
        isBusy={isBusy}
        e3BridgeHost={bridgeStatus.isWin32 ? 'Windows' : bridgeStatus.bridgeConnected ? bridgeStatus.bridgeHost : null}
        onSetTool={setTool}
        onSetViewportLayout={handleSetViewportLayout}
        onResetDockLayout={() => {
          setDockLayout(createDefaultDockLayout());
          appendLog('INFO', 'E3-CORE', 'Расположение окон и панелей сброшено к стандартному.');
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
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
        onDuplicateSheet={handleDuplicateSheet}
        onDeleteSheet={handleDeleteSheet}
        onRunErc={() => {
          setConsoleTab('erc');
          setConsoleCollapsed(false);
        }}
        onGenerateBom={() => {
          setConsoleTab('bom');
          setConsoleCollapsed(false);
          appendLog('INFO', 'E3-CORE', `Сформирована спецификация ПЭ3 (${bom.length} позиций).`);
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
              const spanClass = viewportLayout === 'three' && idx === 0 ? 'row-span-2 flex min-h-0 min-w-0' : 'flex min-h-0 min-w-0';
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
                    selectedDeviceId={selectedDeviceId}
                    selectedWireId={selectedWireId}
                    selectedAnnotationId={selectedAnnotationId}
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
                    onSelectDevice={(id) => {
                      setSelectedDeviceId(id);
                      if (id) {
                        setSelectedWireId(null);
                        setSelectedAnnotationId(null);
                      }
                    }}
                    onSelectWire={(id) => {
                      setSelectedWireId(id);
                      if (id) {
                        setSelectedDeviceId(null);
                        setSelectedAnnotationId(null);
                      }
                    }}
                    onSelectAnnotation={(id) => {
                      setSelectedAnnotationId(id);
                      if (id) {
                        setSelectedDeviceId(null);
                        setSelectedWireId(null);
                      }
                    }}
                    onBeginDrag={handleBeginDrag}
                    onCommitDrag={handleCommitDrag}
                    onCreateAnnotation={handleCreateAnnotation}
                    onMoveAnnotation={handleMoveAnnotation}
                    onMoveDevice={handleMoveDevice}
                    onCreateWire={handleCreateWire}
                    onDropCatalogItem={(item, x, y, shId) => handlePlaceCatalogItem(item, x, y, shId)}
                  />
                </div>
              );
            })}
          </div>

          {renderDockBand(rightPanels, 'right')}
        </main>

        {renderDockBand(bottomPanels, 'bottom')}

        {/* Floating Undocked Panels */}
        {floatingPanels.map((fp) => (
          <FloatingPanelWindow
            key={fp.id}
            panel={fp}
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
    </div>
  );
}
