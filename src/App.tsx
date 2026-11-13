import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomConsole, type ConsoleTab } from './components/BottomConsole';
import { CatalogItemModal } from './components/CatalogItemModal';
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
  routeSheetWiresCleanly,
  runErc,
} from './core/e3Engine';
import { createSeedProject } from './core/e3Seed';
import type {
  BomRow,
  CableJournalRow,
  CatalogItem,
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
  const [project, setProject] = useState<E3Project>(() => createSeedProject());
  const [history, setHistory] = useState<E3Project[]>([]);
  const [future, setFuture] = useState<E3Project[]>([]);

  const [activeSheetId, setActiveSheetId] = useState<string>('sheet-1');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>('dev-qf1');
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [tool, setTool] = useState<CadTool>('select');
  const [zoom, setZoom] = useState<number>(0.56);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 46, y: 12 });

  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('bom');
  const [consoleCollapsed, setConsoleCollapsed] = useState<boolean>(false);

  const [bom, setBom] = useState<BomRow[]>(() => buildBom(createSeedProject()));
  const [cables, setCables] = useState<CableJournalRow[]>(() => buildCableJournal(createSeedProject()));
  const [terminals, setTerminals] = useState<TerminalPlanRow[]>(() => buildTerminalPlan(createSeedProject()));
  const [erc, setErc] = useState<ErcIssue[]>(() => runErc(createSeedProject()));
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

  // Real-time multi-tab + Server-Sent Events sync
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('flux-e3-sync');
      broadcastRef.current = bc;
      bc.onmessage = (ev) => {
        if (ev.data?.sender === clientIdRef.current) return;
        if (ev.data?.project) {
          suppressSyncPushRef.current = true;
          setProject(ev.data.project);
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
            setProject(payload.project);
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
  }, [appendLog]);

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
      setProject((prev) => {
        const next = updater(prev);
        if (recordHistory) {
          setHistory((h) => [...h.slice(-24), prev]);
          setFuture([]);
        }
        if (!suppressSyncPushRef.current) {
          pushSync(next);
        }
        suppressSyncPushRef.current = false;
        return next;
      });
    },
    [pushSync]
  );

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const previous = h[h.length - 1];
      setFuture((f) => [project, ...f]);
      setProject(previous);
      appendLog('INFO', 'E3-CORE', `Отмена действия (возврат к ревизии ${previous.revision}).`);
      return h.slice(0, -1);
    });
  }, [project, appendLog]);

  const handleRedo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, project]);
      setProject(next);
      appendLog('INFO', 'E3-CORE', `Повтор действия (ревизия ${next.revision}).`);
      return f.slice(1);
    });
  }, [project, appendLog]);

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

  const handleMoveDevice = useCallback(
    (deviceId: string, x: number, y: number) => {
      setProject((prev) => {
        const devices = prev.devices.map((d) => (d.id === deviceId ? { ...d, x, y } : d));
        const moved = devices.find((d) => d.id === deviceId);
        const wires = moved ? rerouteDeviceWires(moved, devices, prev.wires) : prev.wires;
        return { ...prev, devices, wires, updatedAt: new Date().toISOString() };
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
    }
  }, [selectedDeviceId, selectedWireId, project.devices, commitProject, appendLog]);

  const handlePlaceCatalogItem = useCallback(
    (item: CatalogItem, x?: number, y?: number) => {
      const existingWithPrefix = project.devices.filter((d) =>
        d.designation.startsWith(`-${item.defaultPrefix}`)
      ).length;
      const des = `-${item.defaultPrefix}${existingWithPrefix + 1}`;
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
        sheetId: activeSheet?.id || project.sheets[0].id,
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
      appendLog('INFO', 'E3-CORE', `Размещён компонент ${newDev.designation} (${newDev.article}).`);
    },
    [project.devices, project.sheets, activeSheet?.id, commitProject, appendLog]
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
      const wireIdx = project.wires.length + 1;
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
    (sheetObj?: E3Sheet) => {
      const target =
        sheetObj || project.sheets.find((s) => s.id === activeSheetId) || project.sheets[0];
      if (!target) return;
      const el = document.querySelector('[data-testid="schematic-canvas"]');
      const rect = el?.getBoundingClientRect();
      const vw = rect?.width && rect.width > 120 ? rect.width : 820;
      const vh = rect?.height && rect.height > 120 ? rect.height : 500;
      const fitZ = Math.min((vw - 36) / target.width, (vh - 24) / target.height);
      const clampedZ = Math.min(1.2, Math.max(0.18, Math.floor(fitZ * 100) / 100));
      const panX = Math.max(12, Math.round((vw - target.width * clampedZ) / 2));
      const panY = Math.max(8, Math.round((vh - target.height * clampedZ) / 2));
      setZoom(clampedZ);
      setPan({ x: panX, y: panY });
    },
    [project.sheets, activeSheetId]
  );

  const handleBuildHvacDiagram = useCallback(
    (options: HvacBuildOptions) => {
      const res = generateHvacDiagram(options, mergedCatalog, project);
      commitProject(() => res.nextProject);
      setActiveSheetId(res.fsaSheetId);
      setSelectedDeviceId(null);
      setSelectedWireId(null);
      const fsaSheet = res.nextProject.sheets.find((s) => s.id === res.fsaSheetId);
      if (fsaSheet) {
        fitSheetToViewport(fsaSheet);
      }
      appendLog(
        'INFO',
        'E3-CORE',
        `Сгенерирована ФСА ${options.systemTag} (${options.sheetFormat}, шрифт ${options.fontFamily}): ${res.createdDevicesCount} узлов, ${res.createdWiresCount} связей${res.wiringSheetId ? ' + лист внешних соединений' : ''}.`
      );
    },
    [mergedCatalog, project, commitProject, fitSheetToViewport, appendLog]
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

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
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
  }, [handleUndo, handleRedo, handleDeleteSelected, handleRotateSelected]);

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
              throw new Error(String(errData.error));
            }
          }
        } catch (err) {
          // If server explicitly returned a parse error, rethrow; otherwise fall back to local Web Worker
          if (err instanceof Error && !err.message.includes('fetch') && !err.message.includes('NetworkError')) {
            // Try local Web Worker fallback before failing
          }
        }
      }

      if (!importedProj) {
        const res = await ecadAsync.importE3sBytes(bytes, filename);
        importedProj = res.project;
        sourceKind = res.sourceKind;
        discoveredStreams = res.discoveredStreams;
        durationMs = res.durationMs;
      }

      commitProject(() => importedProj as E3Project);
      if (importedProj.sheets[0]) setActiveSheetId(importedProj.sheets[0].id);
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
    [project.id, commitProject, appendLog]
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
      if (res.project.sheets[0]) setActiveSheetId(res.project.sheets[0].id);
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
        designation: `-KM${project.devices.length + 1}`,
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
      setProject(data.project);
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
          setProject((curr) => {
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

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--flux-bg)] text-[var(--flux-text)]">
      <TopToolbar
        project={project}
        tool={tool}
        zoom={zoom}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        hasSelection={Boolean(selectedDeviceId || selectedWireId)}
        ercErrorCount={ercErrorCount}
        isSyncConnected={isSyncConnected}
        isBusy={isBusy}
        e3BridgeHost={bridgeStatus.isWin32 ? 'Windows' : bridgeStatus.bridgeConnected ? bridgeStatus.bridgeHost : null}
        onSetTool={setTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRotateSelected={handleRotateSelected}
        onDeleteSelected={handleDeleteSelected}
        onZoomChange={setZoom}
        onFitView={() => fitSheetToViewport()}
        onToggleGrid={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            showGrid: !project.visualSettings.showGrid,
          })
        }
        onToggleFrame={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            showGostFrame: !project.visualSettings.showGostFrame,
          })
        }
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
        onOpenCatalogTab={() => setLeftTab('library')}
        onAddSheet={handleAddSheet}
        onExportDxf={handleExportDxf}
      />

      {/* Main 3-Pane E3.series Engineering Area */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        <LeftExplorer
          project={project}
          catalog={mergedCatalog}
          activeSheetId={activeSheetId}
          selectedDeviceId={selectedDeviceId}
          activeTab={leftTab}
          onTabChange={setLeftTab}
          onSelectSheet={(id) => {
            setActiveSheetId(id);
            setSelectedDeviceId(null);
            setSelectedWireId(null);
          }}
          onSelectDevice={(dev) => {
            setActiveSheetId(dev.sheetId);
            setSelectedDeviceId(dev.id);
            setSelectedWireId(null);
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

        <SchematicCanvas
          project={project}
          catalog={mergedCatalog}
          activeSheetId={activeSheetId}
          tool={tool}
          zoom={zoom}
          pan={pan}
          selectedDeviceId={selectedDeviceId}
          selectedWireId={selectedWireId}
          onSelectSheet={(id) => {
            setActiveSheetId(id);
            const target = project.sheets.find((s) => s.id === id);
            if (target) fitSheetToViewport(target);
          }}
          onAddSheet={handleAddSheet}
          onSetZoom={setZoom}
          onSetPan={setPan}
          onSelectDevice={(id) => {
            setSelectedDeviceId(id);
            if (id) setSelectedWireId(null);
          }}
          onSelectWire={(id) => {
            setSelectedWireId(id);
            if (id) setSelectedDeviceId(null);
          }}
          onMoveDevice={handleMoveDevice}
          onCreateWire={handleCreateWire}
          onDropCatalogItem={(item, x, y) => handlePlaceCatalogItem(item, x, y)}
        />

        <RightInspector
          project={project}
          activeSheet={activeSheet}
          selectedDevice={selectedDevice}
          selectedWire={selectedWire}
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
      </main>

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
          if (issue.sheetId) setActiveSheetId(issue.sheetId);
          if (issue.deviceId) {
            setSelectedDeviceId(issue.deviceId);
            setSelectedWireId(null);
          } else if (issue.wireId) {
            setSelectedWireId(issue.wireId);
            setSelectedDeviceId(null);
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
