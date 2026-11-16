import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Cpu,
  FilePlus2,
  FolderKanban,
  FolderOpen,
  Layers,
  LayoutGrid,
  List,
  Moon,
  PenTool,
  Pin,
  PinOff,
  Search,
  Share2,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  CatalogItem,
  E3Project,
  SheetFormat,
  StandardType,
} from '../core/e3Types';
import type { HvacBuildOptions } from '../core/hvacBuilder';
import type { RecentProjectEntry } from '../core/sessionStorage';
import {
  APP_STANDALONE_SECTIONS,
  type AppStandaloneSectionId,
  type CustomProjectTemplate,
  deleteCustomTemplate,
  filterAndSortRecentProjects,
  filterStartTemplates,
  formatRelativeTimestampRu,
  loadCustomTemplates,
  loadPinnedProjectIds,
  saveCustomTemplates,
  savePinnedProjectIds,
  START_TEMPLATE_DEFS,
  type StartHubLayer,
  type StartHubTab,
  type StartHubViewMode,
  type StartTemplateId,
  summarizeProjectHealth,
  togglePinnedProjectId,
  upsertCustomTemplate,
  type WaveCardFocusRect,
} from '../core/startHub';
import { normalizeUiScalePercent, UI_SCALE_OPTIONS, type UiScalePercent } from '../core/uiScale';
import { AntigravityWaveCanvas } from './AntigravityWaveCanvas';
import type { E3BridgeStatusInfo } from './Modals';
import { ProjectMiniPreview } from './ProjectMiniPreview';
import {
  StartHubExchangeLayer,
  StartHubHvacLayer,
} from './StartHubStandaloneLayers';
import { StartHubTemplatesLayer } from './StartHubTemplatesLayer';

interface StartMenuHubProps {
  open: boolean;
  currentProject: E3Project;
  activeSheetId: string;
  activeFilename: string;
  recentProjects: RecentProjectEntry[];
  catalog: CatalogItem[];
  bridgeStatus: E3BridgeStatusInfo;
  isDark: boolean;
  uiMode: string;
  uiScale: UiScalePercent;
  customTemplates?: CustomProjectTemplate[];
  requestedLayer?: StartHubLayer | null;
  onConsumeRequestedLayer?: () => void;
  onSaveCustomTemplate?: (tpl: CustomProjectTemplate) => void;
  onDeleteCustomTemplate?: (templateId: string) => void;
  onOpenTemplateWorkspace?: () => void;
  onOpenStandaloneSection?: (section: AppStandaloneSectionId) => void;
  onCloseToCanvas: () => void;
  onOpenGlobalUgoWorkspace: () => void;
  onCreateProjectFromTemplate: (
    templateId: StartTemplateId,
    options: { standard: StandardType; format: SheetFormat; gridSize: number }
  ) => void;
  onCreateProjectFromCustomTemplate: (tpl: CustomProjectTemplate) => void;
  onCreateStandaloneHvacProject: (options: HvacBuildOptions) => void;
  onDownloadConnector: () => void;
  onOpenRecentProject: (projectId: string) => void;
  onRemoveRecentProject: (projectId: string) => void;
  onImportE3sFile: (file: File) => void | Promise<void>;
  onOpenCommandPalette: () => void;
  onToggleTheme: () => void;
  onChangeUiScale: (scale: UiScalePercent) => void;
}

const HUB_VIEW_STORAGE_KEY = 'e3promax.startHubView.v1';

export const StartMenuHub: React.FC<StartMenuHubProps> = ({
  open,
  currentProject,
  activeSheetId,
  activeFilename,
  recentProjects,
  catalog,
  bridgeStatus,
  isDark,
  uiMode,
  uiScale,
  customTemplates: externalCustomTemplates,
  requestedLayer,
  onConsumeRequestedLayer,
  onSaveCustomTemplate: externalSaveCustomTemplate,
  onDeleteCustomTemplate: externalDeleteCustomTemplate,
  onOpenTemplateWorkspace,
  onOpenStandaloneSection,
  onCloseToCanvas,
  onOpenGlobalUgoWorkspace,
  onCreateProjectFromTemplate,
  onCreateProjectFromCustomTemplate,
  onCreateStandaloneHvacProject,
  onDownloadConnector,
  onOpenRecentProject,
  onRemoveRecentProject,
  onImportE3sFile,
  onOpenCommandPalette,
  onToggleTheme,
  onChangeUiScale,
}) => {
  const [settling, setSettling] = useState(false);
  const [activeLayer, setActiveLayer] = useState<StartHubLayer>('projects');
  const [tab, setTab] = useState<StartHubTab>('all');
  const [viewMode, setViewMode] = useState<StartHubViewMode>(() => {
    try {
      const saved = window.localStorage.getItem(HUB_VIEW_STORAGE_KEY);
      if (saved === 'table' || saved === 'grid') return saved;
    } catch {
      // ignore storage errors
    }
    return 'grid';
  });
  const [query, setQuery] = useState('');
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => loadPinnedProjectIds());
  const [localCustomTemplates, setLocalCustomTemplates] = useState<CustomProjectTemplate[]>(() =>
    loadCustomTemplates()
  );
  const customTemplates = externalCustomTemplates ?? localCustomTemplates;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hoverRectRef = useRef<WaveCardFocusRect | null>(null);
  const emitPulseRef = useRef<((x: number, y: number, strength?: number) => void) | null>(null);
  const lastPulseMsRef = useRef<number>(0);
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(HUB_VIEW_STORAGE_KEY, viewMode);
    } catch {
      // ignore
    }
  }, [viewMode]);

  useEffect(() => {
    if (open && requestedLayer) {
      setActiveLayer(requestedLayer);
      onConsumeRequestedLayer?.();
    }
  }, [open, requestedLayer, onConsumeRequestedLayer]);

  useEffect(() => {
    if (!open) {
      setSettling(false);
      hoverRectRef.current = null;
      setActiveLayer('projects');
    }
    return () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [open]);

  const triggerGridLockTransition = useCallback((action: () => void) => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      action();
      return;
    }
    setSettling(true);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      setSettling(false);
      action();
    }, 200);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (activeLayer !== 'projects') {
          setActiveLayer('projects');
        } else {
          triggerGridLockTransition(onCloseToCanvas);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        onOpenCommandPalette();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, activeLayer, onCloseToCanvas, onOpenCommandPalette, triggerGridLockTransition]);

  // Ensure current active session is always represented in recents list if storage was empty
  const effectiveRecentEntries = useMemo<RecentProjectEntry[]>(() => {
    const hasCurrent = recentProjects.some((r) => r.id === currentProject.id);
    if (hasCurrent) return recentProjects;
    const currentEntry: RecentProjectEntry = {
      id: currentProject.id,
      name: currentProject.name,
      projectCode: currentProject.projectCode,
      revision: currentProject.revision,
      sheetCount: currentProject.sheets.length,
      deviceCount: currentProject.devices.length,
      wireCount: currentProject.wires.length,
      savedAt: currentProject.updatedAt || new Date().toISOString(),
      activeSheetId,
      project: currentProject,
    };
    return [currentEntry, ...recentProjects];
  }, [recentProjects, currentProject, activeSheetId]);

  const filteredRecents = useMemo(
    () =>
      filterAndSortRecentProjects(effectiveRecentEntries, {
        tab,
        query,
        pinnedIds,
      }),
    [effectiveRecentEntries, tab, query, pinnedIds]
  );

  const filteredTemplates = useMemo(
    () => filterStartTemplates(START_TEMPLATE_DEFS, query),
    [query]
  );

  const healthByProjectId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summarizeProjectHealth>>();
    for (const entry of effectiveRecentEntries) {
      map.set(entry.id, summarizeProjectHealth(entry.project));
    }
    return map;
  }, [effectiveRecentEntries]);

  const activeSheet = useMemo(
    () => currentProject.sheets.find((s) => s.id === activeSheetId) || currentProject.sheets[0],
    [currentProject.sheets, activeSheetId]
  );

  const handleTogglePin = useCallback((projectId: string) => {
    setPinnedIds((prev) => {
      const next = togglePinnedProjectId(prev, projectId);
      savePinnedProjectIds(next);
      return next;
    });
  }, []);

  const handleSaveCustomTemplate = useCallback(
    (tpl: CustomProjectTemplate) => {
      if (externalSaveCustomTemplate) {
        externalSaveCustomTemplate(tpl);
        return;
      }
      setLocalCustomTemplates((prev) => {
        const next = upsertCustomTemplate(prev, tpl);
        saveCustomTemplates(next);
        return next;
      });
    },
    [externalSaveCustomTemplate]
  );

  const handleDeleteCustomTemplate = useCallback(
    (templateId: string) => {
      if (externalDeleteCustomTemplate) {
        externalDeleteCustomTemplate(templateId);
        return;
      }
      setLocalCustomTemplates((prev) => {
        const next = deleteCustomTemplate(prev, templateId);
        saveCustomTemplates(next);
        return next;
      });
    },
    [externalDeleteCustomTemplate]
  );

  const handleSectionSelect = useCallback(
    (secId: AppStandaloneSectionId) => {
      emitPulseRef.current?.(Math.round(window.innerWidth * 0.45), 96, 0.92);
      if (secId === 'hub') {
        setActiveLayer('projects');
        return;
      }
      if (secId === 'templates') {
        if (onOpenTemplateWorkspace) {
          triggerGridLockTransition(onOpenTemplateWorkspace);
        } else {
          setActiveLayer('templates');
        }
        return;
      }
      if (secId === 'ugo') {
        triggerGridLockTransition(onOpenGlobalUgoWorkspace);
        return;
      }
      if (secId === 'hvac' || secId === 'exchange') {
        setActiveLayer(secId);
        onOpenStandaloneSection?.(secId);
      }
    },
    [onOpenTemplateWorkspace, onOpenGlobalUgoWorkspace, onOpenStandaloneSection, triggerGridLockTransition]
  );

  const activeStandaloneSection: AppStandaloneSectionId =
    activeLayer === 'templates'
      ? 'templates'
      : activeLayer === 'hvac'
        ? 'hvac'
        : activeLayer === 'exchange'
          ? 'exchange'
          : 'hub';

  const trackWaveCursor = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--wave-x', `${Math.round(e.clientX - r.left)}px`);
    el.style.setProperty('--wave-y', `${Math.round(e.clientY - r.top)}px`);
  }, []);

  const bindHoverTarget = useCallback((el: HTMLElement | null, pulseStrength = 0.72) => {
    if (!el) {
      hoverRectRef.current = null;
      return;
    }
    const r = el.getBoundingClientRect();
    hoverRectRef.current = {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    };
    const now = performance.now();
    if (now - lastPulseMsRef.current > 95) {
      lastPulseMsRef.current = now;
      emitPulseRef.current?.(r.left + r.width * 0.5, r.top + r.height * 0.5, pulseStrength);
    }
  }, []);

  const pinnedCount = effectiveRecentEntries.filter((e) => pinnedIds.includes(e.id)).length;
  const gostCount = effectiveRecentEntries.filter((e) => e.project.standard === 'GOST').length;
  const iecCount = effectiveRecentEntries.filter((e) => e.project.standard === 'IEC').length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="start-menu-hub-root"
          data-testid="start-menu-hub"
          role="region"
          aria-label="Главное меню E3ProMax"
          initial={{ opacity: 0.96 }}
          animate={{ opacity: settling ? 0 : 1, scale: settling ? 1.006 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[45] flex flex-col overflow-hidden bg-[var(--flux-canvas-bg)]/95 backdrop-blur-[14px]"
        >
          {/* Living Antigravity Wave Field */}
          <AntigravityWaveCanvas
            active={open}
            settling={settling}
            isDark={isDark}
            uiMode={uiMode}
            gridStep={24}
            hoverRectRef={hoverRectRef}
            emitPulseRef={emitPulseRef}
          />

      <input
        ref={fileInputRef}
        type="file"
        accept=".e3flux,.e3s,.e3d,.xml,.json"
        data-testid="start-hub-file-input"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void Promise.resolve(onImportE3sFile(file)).then(() => {
              triggerGridLockTransition(onCloseToCanvas);
            });
          }
          e.target.value = '';
        }}
      />

      {/* Top Navigation & Environment Readiness Strip */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.02, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 shrink-0 px-3 sm:px-6 pt-3 pb-2"
      >
        <div className="max-w-[1380px] mx-auto flex flex-wrap items-center justify-between gap-2.5 px-3 py-2 rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg">
          {/* Left: Brand + Return to Active Canvas */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="inline-flex items-center gap-2 shrink-0">
              <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" className="w-4 h-4 text-[var(--flux-accent)]">
                <rect x="1.5" y="1.5" width="15" height="15" rx="3" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" />
                <path d="M4.2 9h3.4l1.9-3.6 2 7.2 1.6-3.6H14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" />
              </svg>
              <span className="font-semibold tracking-tight text-[length:calc(13px*var(--flux-ui-scale))] text-[var(--flux-text)]">
                E3ProMax
              </span>
            </div>

            <span className="h-4 w-px bg-[var(--flux-line)] shrink-0" aria-hidden="true" />

            <button
              type="button"
              data-testid="start-hub-return-canvas-btn"
              onPointerMove={trackWaveCursor}
              onClick={() => triggerGridLockTransition(onCloseToCanvas)}
              className="antigravity-wave-pill inline-flex items-center gap-1.5 h-[calc(26px*var(--flux-ui-scale))] px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] hover:border-[var(--flux-accent)]/50 text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] transition-colors min-w-0"
              title="Вернуться к открытой схеме (Esc)"
            >
              <ArrowRight className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
              <span className="truncate max-w-[180px] sm:max-w-[240px]">
                К схеме: <span className="font-mono">{activeFilename}</span>
              </span>
            </button>
          </div>

          {/* Center: Quick Project/Template Filter + Ctrl+K */}
          <div className="flex-1 min-w-[200px] max-w-md order-3 lg:order-2 w-full lg:w-auto">
            <div className="relative flex items-center h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] focus-within:border-[var(--flux-accent)] transition-colors">
              <Search className="w-3.5 h-3.5 text-[var(--flux-text-muted)] ml-2.5 shrink-0" />
              <input
                type="search"
                data-testid="start-hub-search-input"
                aria-label="Поиск проектов и шаблонов"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Найти проект, шифр, лист или шаблон…"
                className="flex-1 min-w-0 h-full px-2 bg-transparent text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Очистить поиск"
                  onClick={() => setQuery('')}
                  className="mr-1 p-0.5 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={onOpenCommandPalette}
                title="Открыть палитру команд САПР (Ctrl+K)"
                className="mr-1 px-1.5 py-0.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:border-[var(--flux-accent)]/50 font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0"
              >
                Ctrl+K
              </button>
            </div>
          </div>

          {/* Right: UI Scale & Theme */}
          <div className="flex items-center gap-1.5 order-2 lg:order-3 shrink-0">
            <select
              aria-label="Масштаб интерфейса"
              value={uiScale}
              onChange={(e) => onChangeUiScale(normalizeUiScalePercent(Number(e.target.value)))}
              className="hidden md:inline-block h-[calc(26px*var(--flux-ui-scale))] px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text)] cursor-pointer"
            >
              {UI_SCALE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}%
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid="start-hub-theme-toggle"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
              title={isDark ? 'Светлая тема (Daylight Paper)' : 'Тёмная тема (Precision Graphite)'}
              className="inline-flex items-center justify-center w-[calc(26px*var(--flux-ui-scale))] h-[calc(26px*var(--flux-ui-scale))] rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] transition-colors"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Standalone Sections Bar (independent program spaces) */}
        <div className="max-w-[1380px] mx-auto mt-2 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[10px] border border-[var(--flux-line)] flux-glass-surface/80 overflow-x-auto no-scrollbar">
          <nav
            aria-label="Независимые разделы программы"
            data-testid="start-hub-standalone-sections"
            className="flex items-center gap-1 min-w-0"
          >
            {APP_STANDALONE_SECTIONS.map((sec) => {
              const isSelected = activeStandaloneSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  data-testid={`hub-section-${sec.id}`}
                  onPointerMove={trackWaveCursor}
                  onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.52)}
                  onMouseLeave={() => bindHoverTarget(null)}
                  onClick={() => handleSectionSelect(sec.id)}
                  title={sec.subtitle}
                  className={`relative px-3 h-7 rounded-[6px] inline-flex items-center gap-1.5 text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors ${
                    isSelected
                      ? 'text-[var(--flux-text)] font-semibold'
                      : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="hub-standalone-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                      className="absolute inset-0 rounded-[6px] bg-[var(--flux-surface)] border border-[var(--flux-accent)]/45 shadow-xs"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10">{sec.title}</span>
                </button>
              );
            })}
          </nav>
          <span className="hidden xl:inline-block font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
            Автономные разделы вне проекта
          </span>
        </div>
      </motion.header>

      {/* Main Content Grid: Left Action Rail + Main Recent Projects Stage */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-3">
        <div className="max-w-[1380px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Action Rail */}
          <aside className="lg:col-span-4 xl:col-span-3 space-y-3.5">
            {/* Resume Active Session Card */}
            <motion.button
              type="button"
              data-testid="start-hub-resume-btn"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              onPointerMove={trackWaveCursor}
              onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.85)}
              onMouseLeave={() => bindHoverTarget(null)}
              onClick={() => triggerGridLockTransition(onCloseToCanvas)}
              className="antigravity-wave-item w-full text-left p-3 rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface hover:border-[var(--flux-accent)]/60 shadow-lg group"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[length:calc(10px*var(--flux-ui-scale))] font-mono uppercase tracking-[0.06em] text-[var(--flux-accent)] font-semibold">
                  Продолжить сессию
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--flux-text-muted)] group-hover:text-[var(--flux-accent)] group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="flex items-center gap-3">
                <ProjectMiniPreview
                  project={currentProject}
                  activeSheetId={activeSheetId}
                  compact
                  className="w-20 h-14 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate">
                    {currentProject.name}
                  </div>
                  <div className="text-[length:calc(10.5px*var(--flux-ui-scale))] font-mono text-[var(--flux-text-muted)] truncate mt-0.5">
                    {activeSheet ? `Л.${activeSheet.number} · ${activeSheet.name}` : currentProject.projectCode}
                  </div>
                  <div className="text-[length:calc(10px*var(--flux-ui-scale))] font-mono tabular-nums text-[var(--flux-text-muted)] mt-0.5">
                    rev {currentProject.revision} · {currentProject.sheets.length} л. · {currentProject.devices.length} изд.
                  </div>
                </div>
              </div>
            </motion.button>

            {/* Primary CTA + Quick Tools */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="p-3 rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg space-y-2"
            >
              <button
                type="button"
                data-testid="start-hub-new-project-btn"
                onPointerMove={trackWaveCursor}
                onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.95)}
                onMouseLeave={() => bindHoverTarget(null)}
                onClick={() =>
                  triggerGridLockTransition(() =>
                    onCreateProjectFromTemplate('gost_blank_a3', {
                      standard: 'GOST',
                      format: 'A3',
                      gridSize: 20,
                    })
                  )
                }
                className="antigravity-wave-item w-full h-[calc(36px*var(--flux-ui-scale))] px-3.5 rounded-[7px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white font-semibold text-[length:calc(12px*var(--flux-ui-scale))] flex items-center justify-between gap-2 shadow-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <FilePlus2 className="w-4 h-4 shrink-0" />
                  <span>Новый проект</span>
                </span>
                <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] opacity-85">
                  ГОСТ · A3
                </span>
              </button>

              {/* Dedicated Standalone Template Workspace Button */}
              <button
                type="button"
                data-testid="start-hub-nav-templates"
                onPointerMove={trackWaveCursor}
                onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.72)}
                onMouseLeave={() => bindHoverTarget(null)}
                onClick={() => handleSectionSelect('templates')}
                aria-pressed={activeLayer === 'templates'}
                className={`antigravity-wave-row w-full h-[calc(34px*var(--flux-ui-scale))] px-3 rounded-[7px] border text-left flex items-center justify-between gap-2 transition-colors ${
                  activeLayer === 'templates'
                    ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/55 text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/70 hover:bg-[var(--flux-hover)] text-[var(--flux-text)]'
                }`}
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <Layers className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                  <span className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold truncate">
                    Шаблоны проектов
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                  {customTemplates.length > 0 ? `${customTemplates.length} своих` : 'мастерская'}
                </span>
              </button>

              <div className="grid grid-cols-1 gap-1 pt-1 border-t border-[var(--flux-line)]/70 antigravity-wave-cascade">
                <button
                  type="button"
                  data-testid="start-hub-nav-projects"
                  onPointerMove={trackWaveCursor}
                  onClick={() => handleSectionSelect('hub')}
                  aria-pressed={activeLayer === 'projects'}
                  className={`relative antigravity-wave-row w-full px-2.5 py-2 rounded-[6px] text-left flex items-center justify-between gap-2 transition-colors ${
                    activeLayer === 'projects'
                      ? 'text-[var(--flux-text)] font-semibold'
                      : 'hover:bg-[var(--flux-hover)] text-[var(--flux-text)]'
                  }`}
                >
                  {activeLayer === 'projects' && (
                    <motion.span
                      layoutId="start-hub-nav-active"
                      transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                      className="absolute inset-0 rounded-[6px] bg-[var(--flux-accent-soft)]/60 border border-[var(--flux-accent)]/30"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-2 min-w-0">
                    <FolderKanban className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                    <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium truncate">
                      Проекты и обзор
                    </span>
                  </span>
                  <span className="relative z-10 font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                    {effectiveRecentEntries.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="start-hub-open-file-btn"
                  onPointerMove={trackWaveCursor}
                  onClick={() => fileInputRef.current?.click()}
                  className="antigravity-wave-row w-full px-2.5 py-2 rounded-[6px] hover:bg-[var(--flux-hover)] text-left flex items-center justify-between gap-2"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <Upload className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                    <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] truncate">
                      Открыть с диска
                    </span>
                  </span>
                  <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                    .e3flux / .e3s
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="start-hub-hvac-wizard-btn"
                  onPointerMove={trackWaveCursor}
                  onClick={() => handleSectionSelect('hvac')}
                  aria-pressed={activeLayer === 'hvac'}
                  className={`relative antigravity-wave-row w-full px-2.5 py-2 rounded-[6px] text-left flex items-center justify-between gap-2 transition-colors ${
                    activeLayer === 'hvac'
                      ? 'text-[var(--flux-text)] font-semibold'
                      : 'hover:bg-[var(--flux-hover)] text-[var(--flux-text)]'
                  }`}
                >
                  {activeLayer === 'hvac' && (
                    <motion.span
                      layoutId="start-hub-nav-active"
                      transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                      className="absolute inset-0 rounded-[6px] bg-[var(--flux-accent-soft)]/60 border border-[var(--flux-accent)]/30"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-2 min-w-0">
                    <Cpu className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                    <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium truncate">
                      Мастер ФСА / ОВиК
                    </span>
                  </span>
                  <span className="relative z-10 font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                    автономно
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="start-hub-symbol-editor-btn"
                  onPointerMove={trackWaveCursor}
                  onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.72)}
                  onMouseLeave={() => bindHoverTarget(null)}
                  onClick={() => triggerGridLockTransition(onOpenGlobalUgoWorkspace)}
                  className="antigravity-wave-row w-full px-2.5 py-2 rounded-[6px] hover:bg-[var(--flux-hover)] text-left flex items-center justify-between gap-2 transition-colors"
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <PenTool className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                    <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] truncate">
                      Редактор УГО и база
                    </span>
                  </span>
                  <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                    холст УГО
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="start-hub-exchange-btn"
                  onPointerMove={trackWaveCursor}
                  onClick={() => handleSectionSelect('exchange')}
                  aria-pressed={activeLayer === 'exchange'}
                  className={`relative antigravity-wave-row w-full px-2.5 py-2 rounded-[6px] text-left flex items-center justify-between gap-2 transition-colors ${
                    activeLayer === 'exchange'
                      ? 'text-[var(--flux-text)] font-semibold'
                      : 'hover:bg-[var(--flux-hover)] text-[var(--flux-text)]'
                  }`}
                >
                  {activeLayer === 'exchange' && (
                    <motion.span
                      layoutId="start-hub-nav-active"
                      transition={{ type: 'spring', stiffness: 440, damping: 34 }}
                      className="absolute inset-0 rounded-[6px] bg-[var(--flux-accent-soft)]/60 border border-[var(--flux-accent)]/30"
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-2 min-w-0">
                    <Share2 className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                    <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium truncate">
                      Центр обмена E³.series
                    </span>
                  </span>
                  <span className="relative z-10 font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                    COM / XML
                  </span>
                </button>
              </div>
            </motion.div>

            {/* Quick CAD Templates */}
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
              aria-label="Быстрые шаблоны схем"
              className="p-3 rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg space-y-2"
            >
              <div className="flex items-center justify-between px-0.5">
                <h2 className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.05em] text-[var(--flux-text-muted)]">
                  Быстрые шаблоны
                </h2>
                <button
                  type="button"
                  onClick={() => handleSectionSelect('templates')}
                  className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-accent)] hover:underline"
                >
                  мастерская →
                </button>
              </div>
              <div className="space-y-1 antigravity-wave-cascade">
                {filteredTemplates.map((tpl) => (
                  <motion.button
                    key={tpl.id}
                    type="button"
                    whileHover={{ y: -1.5 }}
                    whileTap={{ scale: 0.992 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    data-testid={`start-template-${tpl.id}`}
                    onPointerMove={trackWaveCursor}
                    onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.65)}
                    onMouseLeave={() => bindHoverTarget(null)}
                    onClick={() =>
                      triggerGridLockTransition(() =>
                        onCreateProjectFromTemplate(tpl.id, {
                          standard: 'GOST',
                          format: tpl.defaultFormat,
                          gridSize: 20,
                        })
                      )
                    }
                    className="antigravity-wave-row w-full px-2.5 py-2 rounded-[7px] border border-transparent hover:border-[var(--flux-line-strong)] hover:bg-[var(--flux-surface-alt)] text-left group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] group-hover:text-[var(--flux-accent)] transition-colors truncate">
                        {tpl.title}
                      </span>
                      <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                        {tpl.badge}
                      </span>
                    </div>
                    <p className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] line-clamp-1 mt-0.5">
                      {tpl.subtitle}
                    </p>
                  </motion.button>
                ))}
                {filteredTemplates.length === 0 && (
                  <div className="px-2 py-3 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                    Нет шаблонов под запрос «{query}».
                  </div>
                )}
              </div>

              {customTemplates.length > 0 && (
                <div className="pt-2 border-t border-[var(--flux-line)]/70 space-y-1">
                  <div className="px-0.5 text-[length:calc(10px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.05em] text-[var(--flux-accent)]">
                    Мои шаблоны ({customTemplates.length})
                  </div>
                  {customTemplates.slice(0, 4).map((ctpl) => (
                    <button
                      key={ctpl.id}
                      type="button"
                      data-testid={`start-custom-tpl-${ctpl.id}`}
                      onPointerMove={trackWaveCursor}
                      onClick={() =>
                        triggerGridLockTransition(() => onCreateProjectFromCustomTemplate(ctpl))
                      }
                      className="antigravity-wave-row w-full px-2.5 py-1.5 rounded-[6px] border border-transparent hover:border-[var(--flux-accent)]/40 hover:bg-[var(--flux-surface-alt)] text-left flex items-center justify-between gap-2"
                    >
                      <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] truncate">
                        {ctpl.title}
                      </span>
                      <span className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                        {ctpl.defaultFormat}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.section>
          </aside>

          {/* Main Stage: Switchable Program Layers with slide-in-right transition */}
          <div className="lg:col-span-8 xl:col-span-9 min-w-0 overflow-x-hidden">
              {activeLayer === 'templates' && (
                <motion.div
                  key="hub-layer-templates"
                  data-transition="slide-in-right"
                  initial={{ opacity: 0, x: 64, scale: 0.985 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.85 }}
                  className="relative"
                >
                  <motion.div
                    aria-hidden="true"
                    initial={{ scaleX: 0, opacity: 0.85 }}
                    animate={{ scaleX: 1, opacity: 0 }}
                    transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: 'right center' }}
                    className="pointer-events-none absolute top-0 left-3 right-3 h-[2px] rounded-full bg-gradient-to-l from-[var(--flux-accent)] via-emerald-300/70 to-transparent z-10"
                  />
                  <div className="animate-slide-in-right">
                    <StartHubTemplatesLayer
                      customTemplates={customTemplates}
                      isDark={isDark}
                      onSaveTemplate={handleSaveCustomTemplate}
                      onDeleteTemplate={handleDeleteCustomTemplate}
                      onCreateProjectFromCustomTemplate={(tpl) =>
                        triggerGridLockTransition(() => onCreateProjectFromCustomTemplate(tpl))
                      }
                      trackWaveCursor={trackWaveCursor}
                      bindHoverTarget={bindHoverTarget}
                    />
                  </div>
                </motion.div>
              )}

              {activeLayer === 'hvac' && (
                <motion.div
                  key="hub-layer-hvac"
                  data-transition="slide-in-right"
                  initial={{ opacity: 0, x: 64, scale: 0.985 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.85 }}
                  className="relative"
                >
                  <motion.div
                    aria-hidden="true"
                    initial={{ scaleX: 0, opacity: 0.85 }}
                    animate={{ scaleX: 1, opacity: 0 }}
                    transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: 'right center' }}
                    className="pointer-events-none absolute top-0 left-3 right-3 h-[2px] rounded-full bg-gradient-to-l from-[var(--flux-accent)] via-emerald-300/70 to-transparent z-10"
                  />
                  <div className="animate-slide-in-right">
                    <StartHubHvacLayer
                      catalog={catalog}
                      onCreateStandaloneHvacProject={(opts) =>
                        triggerGridLockTransition(() => onCreateStandaloneHvacProject(opts))
                      }
                      trackWaveCursor={trackWaveCursor}
                    />
                  </div>
                </motion.div>
              )}

              {activeLayer === 'exchange' && (
                <motion.div
                  key="hub-layer-exchange"
                  data-transition="slide-in-right"
                  initial={{ opacity: 0, x: 64, scale: 0.985 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.85 }}
                  className="relative"
                >
                  <motion.div
                    aria-hidden="true"
                    initial={{ scaleX: 0, opacity: 0.85 }}
                    animate={{ scaleX: 1, opacity: 0 }}
                    transition={{ duration: 0.48, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: 'right center' }}
                    className="pointer-events-none absolute top-0 left-3 right-3 h-[2px] rounded-full bg-gradient-to-l from-[var(--flux-accent)] via-emerald-300/70 to-transparent z-10"
                  />
                  <div className="animate-slide-in-right">
                    <StartHubExchangeLayer
                      bridgeStatus={bridgeStatus}
                      onDownloadConnector={onDownloadConnector}
                      onImportAsNewProject={async (file) => {
                        await Promise.resolve(onImportE3sFile(file));
                        triggerGridLockTransition(onCloseToCanvas);
                      }}
                      trackWaveCursor={trackWaveCursor}
                    />
                  </div>
                </motion.div>
              )}

              {activeLayer === 'projects' && (
                <motion.section
                  key="hub-layer-projects"
                  data-testid="start-hub-layer-projects"
                  data-transition="slide-in-right"
                  initial={{ opacity: 0, x: 52, scale: 0.988 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 29, mass: 0.85 }}
                  aria-label="Недавние проекты"
                  className="relative p-4 rounded-[12px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg flex flex-col"
                >
            {/* Stage Header: Underlined Tabs + Grid/Table Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--flux-line)]">
              <div className="flex items-center gap-4" role="tablist" aria-label="Фильтр проектов">
                {(
                  [
                    ['all', `Все (${effectiveRecentEntries.length})`],
                    ['pinned', `Закреплённые (${pinnedCount})`],
                    ['gost', `ГОСТ (${gostCount})`],
                    ['iec', `IEC (${iecCount})`],
                  ] as const
                ).map(([tabId, label]) => {
                  const active = tab === tabId;
                  return (
                    <button
                      key={tabId}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      data-testid={`start-hub-tab-${tabId}`}
                      onClick={() => setTab(tabId)}
                      className={`relative pb-1.5 text-[length:calc(12px*var(--flux-ui-scale))] font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'text-[var(--flux-text)]'
                          : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                      }`}
                    >
                      {label}
                      {active && (
                        <motion.span
                          layoutId="start-hub-tab-underline"
                          transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                          aria-hidden="true"
                          className="absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full bg-[var(--flux-accent)]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                <div
                  role="group"
                  aria-label="Вид списка проектов"
                  className="inline-flex items-center p-0.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                >
                  <button
                    type="button"
                    data-testid="start-hub-view-grid"
                    aria-pressed={viewMode === 'grid'}
                    aria-label="Вид сеткой"
                    onClick={() => setViewMode('grid')}
                    className={`inline-flex items-center justify-center w-7 h-6 rounded-[4px] transition-colors ${
                      viewMode === 'grid'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-accent)] shadow-xs'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="start-hub-view-table"
                    aria-pressed={viewMode === 'table'}
                    aria-label="Табличный вид"
                    onClick={() => setViewMode('table')}
                    className={`inline-flex items-center justify-center w-7 h-6 rounded-[4px] transition-colors ${
                      viewMode === 'table'
                        ? 'bg-[var(--flux-surface)] text-[var(--flux-accent)] shadow-xs'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Grid View */}
            {filteredRecents.length > 0 && viewMode === 'grid' && (
              <div
                data-testid="start-hub-projects-grid"
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 pt-4"
              >
                {filteredRecents.map((entry, idx) => {
                  const isCurrent = entry.id === currentProject.id;
                  const isPinned = pinnedIds.includes(entry.id);
                  const health = healthByProjectId.get(entry.id);
                  const relTime = formatRelativeTimestampRu(entry.savedAt);

                  return (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 10, scale: 0.988 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{
                        duration: 0.22,
                        delay: Math.min(0.22, 0.07 + idx * 0.028),
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      data-testid={`start-project-card-${entry.id}`}
                      onPointerMove={trackWaveCursor}
                      onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.78)}
                      onMouseLeave={() => bindHoverTarget(null)}
                      className={`antigravity-wave-item group relative rounded-[9px] border p-2.5 flex flex-col ${
                        isCurrent
                          ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/35'
                          : 'border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/75 hover:border-[var(--flux-accent)]/55 hover:bg-[var(--flux-surface)]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          triggerGridLockTransition(() => {
                            if (isCurrent) onCloseToCanvas();
                            else onOpenRecentProject(entry.id);
                          })
                        }
                        aria-label={`Открыть проект ${entry.name}`}
                        className="text-left flex-1 flex flex-col focus:outline-none"
                      >
                        <ProjectMiniPreview
                          project={entry.project}
                          activeSheetId={entry.activeSheetId}
                          className="w-full aspect-[16/10] mb-2.5"
                        />

                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-[length:calc(12.5px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] group-hover:text-[var(--flux-accent)] transition-colors line-clamp-1">
                            {entry.name}
                          </h3>
                          <span
                            title={
                              health?.errors
                                ? `ERC: ${health.errors} ош.`
                                : health?.warnings
                                  ? `ERC: ${health.warnings} замеч.`
                                  : 'ERC: без ошибок'
                            }
                            className={`font-mono tabular-nums text-[length:calc(9.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 mt-0.5 ${
                              health?.errors
                                ? 'text-rose-500'
                                : health?.warnings
                                  ? 'text-amber-500'
                                  : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {health?.errors ? `ERC ${health.errors}` : health?.warnings ? `ERC ~${health.warnings}` : 'ERC ОК'}
                          </span>
                        </div>

                        <div className="mt-1 font-mono tabular-nums text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] truncate">
                          {entry.projectCode} · {entry.project.standard === 'IEC' ? 'IEC' : 'ГОСТ'} · rev {entry.revision}
                        </div>

                        <div className="mt-0.5 font-mono tabular-nums text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] flex items-center justify-between gap-2">
                          <span className="truncate">
                            {entry.sheetCount} л. · {entry.deviceCount} изд. · {entry.wireCount} цеп.
                          </span>
                          <span className="shrink-0">{relTime}</span>
                        </div>
                      </button>

                      {/* Card Quick Actions (Top-right overlay, always accessible on focus/hover) */}
                      <div className="mt-2 pt-2 border-t border-[var(--flux-line)]/70 flex items-center justify-between gap-2 text-[length:calc(10.5px*var(--flux-ui-scale))]">
                        <span className="font-mono text-[var(--flux-accent)]">
                          {isCurrent ? 'Открыт сейчас' : isPinned ? 'Закреплён' : ''}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            data-testid={`start-pin-btn-${entry.id}`}
                            aria-label={isPinned ? `Открепить ${entry.name}` : `Закрепить ${entry.name}`}
                            title={isPinned ? 'Открепить' : 'Закрепить вверху'}
                            onClick={() => handleTogglePin(entry.id)}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-[5px] transition-colors ${
                              isPinned
                                ? 'text-[var(--flux-accent)] bg-[var(--flux-accent-soft)]'
                                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                            }`}
                          >
                            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </button>
                          {!isCurrent && (
                            <button
                              type="button"
                              data-testid={`start-remove-btn-${entry.id}`}
                              aria-label={`Удалить ${entry.name} из недавних`}
                              title="Убрать из недавних"
                              onClick={() => onRemoveRecentProject(entry.id)}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-[5px] text-[var(--flux-text-muted)] hover:text-rose-500 hover:bg-[var(--flux-hover)] transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Table View (CAD PDM style) */}
            {filteredRecents.length > 0 && viewMode === 'table' && (
              <div
                data-testid="start-hub-projects-table"
                className="pt-3 overflow-x-auto"
              >
                <table className="w-full text-left border-collapse text-[length:calc(11.5px*var(--flux-ui-scale))]">
                  <thead>
                    <tr className="border-b border-[var(--flux-line)] text-[length:calc(10px*var(--flux-ui-scale))] uppercase tracking-[0.04em] text-[var(--flux-text-muted)]">
                      <th className="py-2 pr-3 font-semibold">Наименование</th>
                      <th className="py-2 px-3 font-semibold">Шифр</th>
                      <th className="py-2 px-2 font-semibold">Стандарт</th>
                      <th className="py-2 px-2 font-semibold text-right">Состав</th>
                      <th className="py-2 px-2 font-semibold text-center">ERC</th>
                      <th className="py-2 px-2 font-semibold text-right">Изменён</th>
                      <th className="py-2 pl-2 font-semibold text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--flux-line)]/70">
                    {filteredRecents.map((entry) => {
                      const isCurrent = entry.id === currentProject.id;
                      const isPinned = pinnedIds.includes(entry.id);
                      const health = healthByProjectId.get(entry.id);
                      return (
                        <tr
                          key={entry.id}
                          onMouseEnter={(e) => bindHoverTarget(e.currentTarget)}
                          onMouseLeave={() => bindHoverTarget(null)}
                          className="hover:bg-[var(--flux-hover)]/70 transition-colors"
                        >
                          <td className="py-2 pr-3">
                            <button
                              type="button"
                              onClick={() =>
                                triggerGridLockTransition(() => {
                                  if (isCurrent) onCloseToCanvas();
                                  else onOpenRecentProject(entry.id);
                                })
                              }
                              className="font-semibold text-[var(--flux-text)] hover:text-[var(--flux-accent)] text-left"
                            >
                              {entry.name}
                              {isCurrent && (
                                <span className="ml-2 font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-accent)]">
                                  · открыт
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="py-2 px-3 font-mono text-[var(--flux-text-muted)] whitespace-nowrap">
                            {entry.projectCode} · rev {entry.revision}
                          </td>
                          <td className="py-2 px-2 font-mono text-[var(--flux-text-muted)] whitespace-nowrap">
                            {entry.project.standard === 'IEC' ? 'IEC' : 'ГОСТ'}
                          </td>
                          <td className="py-2 px-2 font-mono tabular-nums text-right text-[var(--flux-text-muted)] whitespace-nowrap">
                            {entry.sheetCount} л. · {entry.deviceCount} изд. · {entry.wireCount} цеп.
                          </td>
                          <td className="py-2 px-2 text-center font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] whitespace-nowrap">
                            <span
                              className={
                                health?.errors
                                  ? 'text-rose-500 font-semibold'
                                  : health?.warnings
                                    ? 'text-amber-500 font-medium'
                                    : 'text-emerald-600 dark:text-emerald-400 font-medium'
                              }
                            >
                              {health?.errors ? `${health.errors} ош.` : health?.warnings ? `${health.warnings} зам.` : 'чисто'}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-mono tabular-nums text-right text-[var(--flux-text-muted)] whitespace-nowrap">
                            {formatRelativeTimestampRu(entry.savedAt)}
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={isPinned ? `Открепить ${entry.name}` : `Закрепить ${entry.name}`}
                                onClick={() => handleTogglePin(entry.id)}
                                className={`p-1 rounded ${
                                  isPinned
                                    ? 'text-[var(--flux-accent)]'
                                    : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                                }`}
                              >
                                {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                              </button>
                              {!isCurrent && (
                                <button
                                  type="button"
                                  aria-label={`Удалить ${entry.name} из недавних`}
                                  onClick={() => onRemoveRecentProject(entry.id)}
                                  className="p-1 rounded text-[var(--flux-text-muted)] hover:text-rose-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty Filter / Search State */}
            {filteredRecents.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 px-4">
                <FolderOpen className="w-8 h-8 text-[var(--flux-text-muted)]/60 mb-2" />
                <p className="text-[length:calc(12.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]">
                  Проекты по выбранному фильтру не найдены
                </p>
                <p className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mt-1">
                  Попробуйте сбросить поиск или создайте новый проект из шаблона слева.
                </p>
                {(query || tab !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setTab('all');
                    }}
                    className="mt-3 px-3 py-1.5 rounded-[6px] border border-[var(--flux-line-strong)] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
                  >
                    Показать все проекты
                  </button>
                )}
              </div>
            )}
            {/* Custom Templates Shelf inside Main Stage */}
            <div className="mt-5 pt-4 border-t border-[var(--flux-line)] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                    Мои шаблоны мастерской ({customTemplates.length})
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="start-hub-open-workshop-btn"
                  onClick={() => handleSectionSelect('templates')}
                  className="text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-accent)] hover:underline"
                >
                  Открыть мастерскую →
                </button>
              </div>
              {customTemplates.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {customTemplates.map((ctpl) => (
                    <motion.button
                      key={ctpl.id}
                      type="button"
                      data-testid={`start-hub-stage-custom-tpl-${ctpl.id}`}
                      whileHover={{ y: -2 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                      onClick={() =>
                        triggerGridLockTransition(() => onCreateProjectFromCustomTemplate(ctpl))
                      }
                      className="p-3 rounded-[9px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/75 hover:border-[var(--flux-accent)]/60 text-left transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate">
                          {ctpl.title}
                        </span>
                        <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-accent)] shrink-0">
                          {ctpl.defaultFormat}
                        </span>
                      </div>
                      <div className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] line-clamp-1 mt-0.5">
                        {ctpl.description || `${ctpl.initialSheets.length} л. · ${ctpl.standard === 'IEC' ? 'IEC' : 'ГОСТ'}`}
                      </div>
                      <div className="mt-2 font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] flex items-center justify-between">
                        <span>{ctpl.projectCodePrefix} · {ctpl.initialSheets.length} л.</span>
                        <span className="text-[var(--flux-accent)]">Создать →</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="px-3.5 py-2.5 rounded-[8px] border border-dashed border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)]/40 flex flex-wrap items-center justify-between gap-2 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                  <span>Спроектируйте собственные многолистовые шаблоны со штампами и таблицами в отдельной мастерской.</span>
                  <button
                    type="button"
                    onClick={() => handleSectionSelect('templates')}
                    className="px-2.5 py-1 rounded-[5px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:border-[var(--flux-accent)]/50 text-[var(--flux-text)] font-medium"
                  >
                    + Создать шаблон
                  </button>
                </div>
              )}
            </div>
              </motion.section>
              )}
          </div>
        </div>
      </main>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
