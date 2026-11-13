import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomConsole, type ConsoleTab } from './components/BottomConsole';
import { LeftExplorer } from './components/LeftExplorer';
import { ExchangeModal, ReportModal, VisualSettingsModal } from './components/Modals';
import { RightInspector } from './components/RightInspector';
import { SchematicCanvas } from './components/SchematicCanvas';
import { type CadTool, TopToolbar } from './components/TopToolbar';
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
  TerminalPlanRow,
} from './core/e3Types';
import { detectFluxHost, pushProjectToFluxHost } from './core/fluxHostBridge';
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

  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

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
      durationMs?: number
    ) => {
      setLogs((prev) => [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          level,
          subsystem,
          message,
          durationMs,
        },
        ...prev.slice(0, 299),
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

  // Reroute attached wires whenever a device moves or rotates
  const rerouteDeviceWires = (dev: E3Device, allDevices: E3Device[], wires: E3Wire[]): E3Wire[] => {
    const devMap = new Map(allDevices.map((d) => [d.id, d]));
    return wires.map((w) => {
      if (w.fromDeviceId !== dev.id && w.toDeviceId !== dev.id) return w;
      const d1 = devMap.get(w.fromDeviceId);
      const d2 = devMap.get(w.toDeviceId);
      const p1 = d1?.pins.find((p) => p.id === w.fromPinId);
      const p2 = d2?.pins.find((p) => p.id === w.toPinId);
      if (!d1 || !d2 || !p1 || !p2) return w;
      return {
        ...w,
        waypoints: autoRouteOrthogonal(getAbsolutePinPos(d1, p1), getAbsolutePinPos(d2, p2)),
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
        waypoints: autoRouteOrthogonal(abs1, abs2),
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

  // Export & Import handlers
  const handleExportE3Xml = async () => {
    const res = await ecadAsync.exportXml(project);
    downloadText(`${project.projectCode}.e3x`, res.xml, 'application/xml;charset=utf-8');
    appendLog('INFO', 'E3-XML', `Экспортирован файл совместимости ${project.projectCode}.e3x.`, res.durationMs);
  };

  const handleExportFluxBridge = async () => {
    const res = await ecadAsync.exportFluxBundle(project);
    downloadText(
      `${project.projectCode}.flux-e3.json`,
      JSON.stringify(res.bundle, null, 2),
      'application/json;charset=utf-8'
    );
    appendLog('INFO', 'FLUX-BRIDGE', 'Экспортирован пакет обмена Flux E3 Bridge JSON.', res.durationMs);
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
        onSetTool={setTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRotateSelected={handleRotateSelected}
        onDeleteSelected={handleDeleteSelected}
        onZoomChange={setZoom}
        onFitView={() => {
          setZoom(0.56);
          setPan({ x: 46, y: 12 });
        }}
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
        onOpenExchangeModal={() => setExchangeOpen(true)}
        onOpenVisualModal={() => setVisualOpen(true)}
        onOpenReportModal={() => setReportOpen(true)}
        onToggleTheme={() =>
          handleApplyVisualSettings({
            ...project.visualSettings,
            theme: project.visualSettings.theme === 'dark' ? 'light' : 'dark',
          })
        }
        onDownloadCodebase={() => {
          window.location.assign('/api/export/codebase');
        }}
      />

      {/* Main 3-Pane E3.series Engineering Area */}
      <main className="flex-1 min-h-0 flex overflow-hidden">
        <LeftExplorer
          project={project}
          activeSheetId={activeSheetId}
          selectedDeviceId={selectedDeviceId}
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
          onRunStressBatch={handleRunStressBatch}
        />

        <SchematicCanvas
          project={project}
          activeSheetId={activeSheetId}
          tool={tool}
          zoom={zoom}
          pan={pan}
          selectedDeviceId={selectedDeviceId}
          selectedWireId={selectedWireId}
          onSelectSheet={setActiveSheetId}
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
        onDownloadE3Xml={handleExportE3Xml}
        onDownloadLogs={() => {
          downloadText(
            `flux-e3-logs-${Date.now()}.json`,
            JSON.stringify(logs, null, 2),
            'application/json;charset=utf-8'
          );
        }}
        onTestApiSyncPush={handleTestApiSyncPush}
      />

      <ExchangeModal
        open={exchangeOpen}
        project={project}
        onClose={() => setExchangeOpen(false)}
        onExportE3Xml={handleExportE3Xml}
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
    </div>
  );
}
