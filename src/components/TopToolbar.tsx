import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Archive,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Columns2,
  CopyPlus,
  Database,
  Download,
  FileCode2,
  FilePlus2,
  FileSpreadsheet,
  FileX2,
  FolderOpen,
  Frame,
  Grid2X2,
  Grid3X3,
  Hand,
  Hash,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Magnet,
  Maximize2,
  Moon,
  MousePointer2,
  Package,
  Palette,
  PanelLeft,
  PanelsTopLeft,
  Plus,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Settings,
  Share2,
  Spline,
  Square,
  Sun,
  Tag,
  Terminal,
  Trash2,
  Type,
  Undo2,
  Upload,
  Wand2,
  Workflow,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  countSheetLayerEntities,
  resolveCadLayers,
  summarizeCadLayers,
} from '../core/cadLayers';
import { SCHEMATIC_FONT_OPTIONS, SHEET_DIMENSIONS } from '../core/e3Catalog';
import type { ViewportLayoutMode } from '../core/dockLayout';
import type {
  CadLayerId,
  CadTool,
  E3Project,
  E3Sheet,
  SchematicFontFamily,
  SheetFormat,
} from '../core/e3Types';
import { LayerManagerPopover } from './LayerManagerPopover';

export type { CadTool };
export type RibbonSectionId = 'home' | 'drafting' | 'annotations' | 'sheet' | 'view' | 'export';
type AppMenuCategory = 'file' | 'export' | 'stamps' | 'system';

interface TopToolbarProps {
  project: E3Project;
  activeSheet: E3Sheet | undefined;
  tool: CadTool;
  zoom: number;
  viewportLayout: ViewportLayoutMode;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  ercErrorCount: number;
  isBusy: boolean;
  e3BridgeHost: string | null;
  onSetTool: (tool: CadTool) => void;
  onSetViewportLayout: (mode: ViewportLayoutMode) => void;
  onResetDockLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onZoomChange: (nextZoom: number) => void;
  onFitView: () => void;
  onToggleGrid: () => void;
  onToggleSnapToGrid: () => void;
  onChangeGridSize: (gridSize: number) => void;
  onToggleFrame: () => void;
  onTogglePinNumbers: () => void;
  onToggleWireNumbers: () => void;
  onToggleCrossRefs: () => void;
  onUpdateSheetFormat: (sheetId: string, format: SheetFormat) => void;
  onUpdateFontFamily: (font: SchematicFontFamily) => void;
  onDuplicateSheet: (sheetId: string) => void;
  onDeleteSheet: (sheetId: string) => void;
  onRunErc: () => void;
  onGenerateBom: () => void;
  onDirectOpenE3: () => void;
  onImportE3sFile: (file: File) => void | Promise<void>;
  onOpenExchangeModal: () => void;
  onOpenVisualModal: () => void;
  onOpenReportModal: () => void;
  onOpenPortableBuild: () => void;
  onOpenHvacWizard: () => void;
  onAutoRouteWires: () => void;
  onToggleTheme: () => void;
  onDownloadCodebase: () => void;
  onDownloadFluxStudioZip: () => void;
  onExportE3sOle2: () => void;
  onExportE3sXml: () => void;
  onExportFluxBridge: () => void;
  onDownloadBomCsv: () => void;
  onDownloadCablesCsv: () => void;
  onDownloadLogsJson: () => void;
  onRunStressBatch: (count: number) => void;
  onOpenAddCatalogItem: () => void;
  onOpenCatalogTab: () => void;
  onAddSheet: () => void;
  onExportDxf: () => void;
  onOpenStampEditor: () => void;
  onOpenStampDesigner: () => void;
  onOpenPublishModal: () => void;
  onToggleLayerVisibility?: (layerId: CadLayerId) => void;
  onToggleLayerLock?: (layerId: CadLayerId) => void;
  onShowAllLayers?: () => void;
  onUnlockAllLayers?: () => void;
}

const RIBBON_TABS: Array<{ id: RibbonSectionId; label: string }> = [
  { id: 'home', label: 'Главная' },
  { id: 'drafting', label: 'Черчение' },
  { id: 'annotations', label: 'Аннотации' },
  { id: 'sheet', label: 'Лист и ФСА' },
  { id: 'view', label: 'Вид' },
  { id: 'export', label: 'E³.series' },
];

const RibbonPanel: React.FC<{ title: string; isLast?: boolean; children: React.ReactNode }> = ({
  title,
  isLast = false,
  children,
}) => (
  <div
    className={`flex flex-col justify-between h-full px-2.5 py-1 shrink-0 ${
      isLast ? '' : 'border-r border-[var(--flux-line)]'
    }`}
  >
    <div className="flex-1 flex items-center gap-1 min-h-0">{children}</div>
    <div className="text-[10px] leading-none text-center text-[var(--flux-text-muted)] tracking-wide pt-0.5 select-none whitespace-nowrap">
      {title}
    </div>
  </div>
);

interface LargeRibbonBtnProps {
  icon: React.ReactNode;
  label: string;
  title?: string;
  active?: boolean;
  accent?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const LargeRibbonBtn: React.FC<LargeRibbonBtnProps> = ({
  icon,
  label,
  title,
  active = false,
  accent = false,
  danger = false,
  disabled = false,
  testId,
  onClick,
}) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    disabled={disabled}
    title={title || label}
    className={`flex flex-col items-center justify-center gap-1 min-w-[56px] h-[54px] px-2 rounded border transition-colors whitespace-nowrap shrink-0 disabled:opacity-35 ${
      active
        ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)] text-[var(--flux-text)] shadow-xs'
        : accent
          ? 'bg-[var(--flux-accent-soft)] border-[var(--flux-accent)]/70 text-[var(--flux-text)] hover:border-[var(--flux-accent)] hover:bg-[var(--flux-hover)]'
          : danger
            ? 'border-transparent text-rose-600 dark:text-rose-400 hover:bg-[var(--flux-hover)] hover:border-[var(--flux-line)]'
            : 'border-transparent text-[var(--flux-text)] hover:bg-[var(--flux-hover)] hover:border-[var(--flux-line)]'
    }`}
  >
    <span className="shrink-0 flex items-center justify-center">{icon}</span>
    <span className="text-[11px] leading-none font-medium text-center">{label}</span>
  </button>
);

interface AppMenuActionRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  href?: string;
  download?: string;
  testId?: string;
  onClick?: () => void;
}

const AppMenuActionRow: React.FC<AppMenuActionRowProps> = ({
  icon,
  title,
  subtitle,
  shortcut,
  danger,
  disabled,
  href,
  download,
  testId,
  onClick,
}) => {
  const cls = `w-full px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors rounded ${
    disabled
      ? 'opacity-40 pointer-events-none'
      : danger
        ? 'text-rose-600 dark:text-rose-400 hover:bg-[var(--flux-hover)]'
        : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
  }`;

  const inner = (
    <>
      <div className="flex items-start gap-2.5 min-w-0">
        <span className="mt-0.5 shrink-0 text-[var(--flux-accent)]">{icon}</span>
        <div className="min-w-0">
          <div className="text-[12px] font-medium leading-tight truncate">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-[var(--flux-text-muted)] leading-snug truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {shortcut && (
        <span className="font-mono text-[10px] text-[var(--flux-text-muted)] shrink-0">
          {shortcut}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <a href={href} download={download} data-testid={testId} onClick={onClick} className={cls}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" data-testid={testId} disabled={disabled} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
};

export const TopToolbar: React.FC<TopToolbarProps> = ({
  project,
  activeSheet,
  tool,
  zoom,
  viewportLayout,
  canUndo,
  canRedo,
  hasSelection,
  ercErrorCount,
  isBusy,
  e3BridgeHost,
  onSetTool,
  onSetViewportLayout,
  onResetDockLayout,
  onUndo,
  onRedo,
  onRotateSelected,
  onDeleteSelected,
  onZoomChange,
  onFitView,
  onToggleGrid,
  onToggleSnapToGrid,
  onChangeGridSize,
  onToggleFrame,
  onTogglePinNumbers,
  onToggleWireNumbers,
  onToggleCrossRefs,
  onUpdateSheetFormat,
  onUpdateFontFamily,
  onDuplicateSheet,
  onDeleteSheet,
  onRunErc,
  onGenerateBom,
  onDirectOpenE3,
  onImportE3sFile,
  onOpenExchangeModal,
  onOpenVisualModal,
  onOpenReportModal,
  onOpenPortableBuild,
  onOpenHvacWizard,
  onAutoRouteWires,
  onToggleTheme,
  onDownloadCodebase,
  onDownloadFluxStudioZip,
  onExportE3sOle2,
  onExportE3sXml,
  onExportFluxBridge,
  onDownloadBomCsv,
  onDownloadCablesCsv,
  onDownloadLogsJson,
  onRunStressBatch,
  onOpenAddCatalogItem,
  onOpenCatalogTab,
  onAddSheet,
  onExportDxf,
  onOpenStampEditor,
  onOpenStampDesigner,
  onOpenPublishModal,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onShowAllLayers,
  onUnlockAllLayers,
}) => {
  const isDark = project.visualSettings.theme === 'dark';
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  const [activeTab, setActiveTab] = useState<RibbonSectionId>('home');
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [layersPopoverOpen, setLayersPopoverOpen] = useState(false);
  const [layersPopoverLeft, setLayersPopoverLeft] = useState<number | null>(null);
  const [menuCategory, setMenuCategory] = useState<AppMenuCategory>('file');

  const vs = project.visualSettings;
  const resolvedLayers = resolveCadLayers(project.layers, vs.showGostFrame);
  const layerSummary = summarizeCadLayers(resolvedLayers);
  const activeSheetCounts = countSheetLayerEntities(
    project,
    activeSheet?.id || project.sheets[0]?.id || ''
  );

  const toggleRibbonLayers = (btnEl: HTMLButtonElement | null) => {
    if (btnEl && headerRef.current) {
      const hRect = headerRef.current.getBoundingClientRect();
      const bRect = btnEl.getBoundingClientRect();
      const clampedLeft = Math.max(8, Math.min(bRect.left - hRect.left, Math.max(8, hRect.width - 344)));
      setLayersPopoverLeft(clampedLeft);
    } else {
      setLayersPopoverLeft(null);
    }
    setLayersPopoverOpen((o) => !o);
  };

  useEffect(() => {
    if (!appMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAppMenuOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(target)
      ) {
        setAppMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [appMenuOpen]);

  const runMenuAction = (fn: () => void) => {
    setAppMenuOpen(false);
    fn();
  };

  return (
    <header
      ref={headerRef}
      className="no-print shrink-0 w-full max-w-full min-w-0 relative z-40 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] select-none"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".e3s,.e3d,.xml,.json"
        data-testid="toolbar-e3s-input"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            void onImportE3sFile(file);
          }
          e.target.value = '';
        }}
      />

      {/* Row 1: AutoCAD Main Application Button + Quick Access Toolbar + Centered Document Title */}
      <div className="flex items-center justify-between gap-2 lg:gap-4 px-2 lg:px-2.5 h-9 border-b border-[var(--flux-line)] min-w-0 bg-[var(--flux-surface)]">
        <div className="flex items-center gap-1 shrink-0">
          {/* AutoCAD-style Left Main Application Button */}
          <button
            ref={menuBtnRef}
            type="button"
            data-testid="app-menu-btn"
            aria-haspopup="menu"
            aria-expanded={appMenuOpen}
            onClick={() => setAppMenuOpen((o) => !o)}
            title="Главное меню программы: файлы, экспорт, штампы, настройки"
            className={`inline-flex items-center gap-1.5 h-7 pl-2 pr-2 rounded font-semibold text-[12px] tracking-tight transition-colors whitespace-nowrap shrink-0 mr-1 ${
              appMenuOpen
                ? 'bg-[var(--flux-accent-hover)] text-white shadow-xs'
                : 'bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="15" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M4.5 9h3.5l2-3.5 2 7 1.5-3.5H13.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
            <span style={{ fontFamily: 'var(--font-display)' }}>E3ProMax</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${appMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <span className="h-4 w-px bg-[var(--flux-line)] mr-1 shrink-0" aria-hidden="true" />

          {/* Quick Access Toolbar (QAT) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Открыть файл .e3s / .e3d / XML / JSON"
            aria-label="Открыть файл .e3s"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
          </button>

          <button
            type="button"
            onClick={onOpenPublishModal}
            title="Пакетная публикация (PDF / AutoCAD DXF)"
            aria-label="Пакетная публикация"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
          </button>

          <button
            type="button"
            onClick={onDirectOpenE3}
            title={
              e3BridgeHost
                ? `Открыть напрямую в E³.series (${e3BridgeHost})`
                : 'Перенести проект в E³.series 2022'
            }
            aria-label="В E3.series"
            className="relative inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            <Share2 className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            {e3BridgeHost && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute top-1 right-1" />
            )}
          </button>

          <span className="h-4 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            aria-label="Отменить действие"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Повторить (Ctrl+Y)"
            aria-label="Повторить действие"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors shrink-0"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Centered Document Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
          <span className="text-[12px] font-medium text-[var(--flux-text)] truncate max-w-[200px] md:max-w-[320px] lg:max-w-[440px]">
            {project.name}
          </span>
          <span className="hidden xl:inline text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
            {project.projectCode} · Rev {project.revision}
          </span>
        </div>

        {/* Minimal Right Window Utilities (Theme + Ribbon Collapse) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenVisualModal}
            aria-label="Настройки программы и графики"
            title="Настройки программы и графики"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
            title={isDark ? 'Светлая тема' : 'Тёмная тема'}
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            data-testid="ribbon-collapse-btn"
            onClick={() => setRibbonCollapsed((c) => !c)}
            aria-label={ribbonCollapsed ? 'Развернуть ленту команд' : 'Свернуть ленту команд'}
            title={ribbonCollapsed ? 'Развернуть ленту' : 'Свернуть ленту'}
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            <motion.span
              animate={{ rotate: ribbonCollapsed ? 180 : 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center justify-center"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </motion.span>
          </button>
        </div>
      </div>

      {/* AutoCAD-style Floating Application Menu Drawer */}
      <AnimatePresence>
        {appMenuOpen && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Главное системное меню"
            data-testid="app-menu-drawer"
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-9 left-2 z-50 w-[min(640px,calc(100vw-16px))] rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 min-h-[340px] max-h-[78vh]">
              {/* Left Navigation Categories */}
              <div className="sm:col-span-4 border-b sm:border-b-0 sm:border-r border-[var(--flux-line)] bg-[var(--flux-bg)] p-2 flex flex-col justify-between gap-2">
                <div className="space-y-0.5">
                  {(
                    [
                      ['file', 'Файл и Проект', <FolderOpen key="f" className="w-4 h-4" />],
                      ['export', 'Экспорт и Печать', <Download key="e" className="w-4 h-4" />],
                      ['stamps', 'Штампы и ГОСТ', <LayoutTemplate key="s" className="w-4 h-4" />],
                      ['system', 'Система и Настройки', <Settings key="sys" className="w-4 h-4" />],
                    ] as const
                  ).map(([catId, label, ic]) => {
                    const active = menuCategory === catId;
                    return (
                      <button
                        key={catId}
                        type="button"
                        data-testid={`app-menu-cat-${catId}`}
                        onMouseEnter={() => setMenuCategory(catId)}
                        onClick={() => setMenuCategory(catId)}
                        className={`w-full px-2.5 h-9 rounded flex items-center justify-between gap-2 text-[12px] font-medium transition-colors ${
                          active
                            ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                            : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)] hover:text-[var(--flux-text)]'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className={active ? 'text-[var(--flux-accent)]' : ''}>{ic}</span>
                          <span className="truncate">{label}</span>
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      </button>
                    );
                  })}
                </div>

                {/* Project Summary Metadata */}
                <div className="pt-2.5 border-t border-[var(--flux-line)] px-1.5 space-y-1 text-[11px] text-[var(--flux-text-muted)]">
                  <div className="font-mono text-[var(--flux-text)] truncate">{project.projectCode}</div>
                  <div className="font-mono tabular-nums">
                    Ревизия {project.revision} · {project.sheets.length} л. · {project.devices.length} изд.
                  </div>
                </div>
              </div>

              {/* Right Category Actions */}
              <div className="sm:col-span-8 p-2 overflow-y-auto divide-y divide-[var(--flux-line)]">
                {menuCategory === 'file' && (
                  <div className="space-y-0.5 pb-1">
                    <AppMenuActionRow
                      icon={<Upload className="w-4 h-4" />}
                      title="Открыть проект E3 (.e3s / .e3d / XML / JSON)"
                      subtitle="Загрузка схемы из файла на компьютере"
                      testId="menu-open-e3s"
                      onClick={() => runMenuAction(() => fileInputRef.current?.click())}
                    />
                    <AppMenuActionRow
                      icon={<Share2 className="w-4 h-4" />}
                      title="Открыть напрямую в E³.series 2022"
                      subtitle={
                        e3BridgeHost
                          ? `Подключён мост: ${e3BridgeHost}`
                          : 'Прямая передача листов, цепей и кабелей по COM API'
                      }
                      onClick={() => runMenuAction(onDirectOpenE3)}
                    />
                    <AppMenuActionRow
                      icon={<FolderOpen className="w-4 h-4" />}
                      title="Центр обмена E3.series и Flux Studio"
                      subtitle="COM-коннектор, VBScript, импорт текста XML/JSON"
                      onClick={() => runMenuAction(onOpenExchangeModal)}
                    />
                    <div className="my-1.5 border-t border-[var(--flux-line)]" />
                    <AppMenuActionRow
                      icon={<FilePlus2 className="w-4 h-4" />}
                      title="Добавить новый лист в проект"
                      subtitle="Создать дополнительный лист с основной надписью Форма 2а"
                      onClick={() => runMenuAction(onAddSheet)}
                    />
                    <AppMenuActionRow
                      icon={<CopyPlus className="w-4 h-4" />}
                      title="Дублировать текущий лист"
                      subtitle={activeSheet ? `Лист ${activeSheet.number}: ${activeSheet.name}` : undefined}
                      disabled={!activeSheet}
                      onClick={() => activeSheet && runMenuAction(() => onDuplicateSheet(activeSheet.id))}
                    />
                    <AppMenuActionRow
                      icon={<FileX2 className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
                      title="Удалить активный лист"
                      danger
                      disabled={!activeSheet || project.sheets.length <= 1}
                      onClick={() => activeSheet && runMenuAction(() => onDeleteSheet(activeSheet.id))}
                    />
                  </div>
                )}

                {menuCategory === 'export' && (
                  <div className="space-y-0.5 pb-1">
                    <AppMenuActionRow
                      icon={<FileCode2 className="w-4 h-4" />}
                      title="Пакетная публикация (PDF и AutoCAD .dxf)"
                      subtitle="Многостраничный векторный PDF, DXF с блоками INSERT + ATTRIB"
                      testId="menu-publish-pdf-dxf"
                      onClick={() => runMenuAction(onOpenPublishModal)}
                    />
                    <AppMenuActionRow
                      icon={<FileCode2 className="w-4 h-4" />}
                      title="Экспорт текущего листа в AutoCAD (.dxf)"
                      subtitle="Слои ГОСТ и редактируемые штампы AC1021 UTF-8"
                      onClick={() => runMenuAction(onExportDxf)}
                    />
                    <AppMenuActionRow
                      icon={<Printer className="w-4 h-4" />}
                      title="Печатный отчёт ПЭ3 и кабельного журнала"
                      subtitle="Просмотр и печать по ГОСТ 2.701 / 2.106"
                      onClick={() => runMenuAction(onOpenReportModal)}
                    />
                    <div className="my-1.5 border-t border-[var(--flux-line)]" />
                    <AppMenuActionRow
                      icon={<FileSpreadsheet className="w-4 h-4" />}
                      title="Выгрузить спецификацию ПЭ3 в CSV (Excel)"
                      testId="menu-export-bom-csv"
                      onClick={() => runMenuAction(onDownloadBomCsv)}
                    />
                    <AppMenuActionRow
                      icon={<Download className="w-4 h-4" />}
                      title="Выгрузить кабельный журнал в CSV"
                      testId="menu-export-cables-csv"
                      onClick={() => runMenuAction(onDownloadCablesCsv)}
                    />
                    <div className="my-1.5 border-t border-[var(--flux-line)]" />
                    <AppMenuActionRow
                      icon={<Download className="w-4 h-4" />}
                      title="Сохранить контейнер E³.series (.e3s OLE2)"
                      onClick={() => runMenuAction(onExportE3sOle2)}
                    />
                    <AppMenuActionRow
                      icon={<FileCode2 className="w-4 h-4" />}
                      title="Экспорт схемы E3 XML (.e3s)"
                      onClick={() => runMenuAction(onExportE3sXml)}
                    />
                    <AppMenuActionRow
                      icon={<Share2 className="w-4 h-4" />}
                      title="Экспорт пакета Flux Bridge (.json)"
                      onClick={() => runMenuAction(onExportFluxBridge)}
                    />
                    <AppMenuActionRow
                      icon={<Archive className="w-4 h-4" />}
                      title="Пакет подпрограммы Flux Studio (.zip)"
                      onClick={() => runMenuAction(onDownloadFluxStudioZip)}
                    />
                  </div>
                )}

                {menuCategory === 'stamps' && (
                  <div className="space-y-0.5 pb-1">
                    <AppMenuActionRow
                      icon={<Type className="w-4 h-4" />}
                      title="Редактор основной надписи ГОСТ 2.104"
                      subtitle="Заполнение граф, подписей и применение на 1 или все листы"
                      testId="menu-stamp-editor"
                      onClick={() => runMenuAction(onOpenStampEditor)}
                    />
                    <AppMenuActionRow
                      icon={<LayoutTemplate className="w-4 h-4" />}
                      title="Конструктор и создание новых штампов"
                      subtitle="Проектирование таблиц штампов, привязка граф, сохранение шаблонов"
                      testId="menu-stamp-designer"
                      onClick={() => runMenuAction(onOpenStampDesigner)}
                    />
                    <div className="my-1.5 border-t border-[var(--flux-line)]" />
                    <AppMenuActionRow
                      icon={<Palette className="w-4 h-4" />}
                      title="Параметры графики, шрифтов и цветов цепей"
                      subtitle={`Текущий шрифт: ${vs.fontFamily || 'GOST'} · Толщина линий: ${vs.wireWidth} px`}
                      onClick={() => runMenuAction(onOpenVisualModal)}
                    />
                    <AppMenuActionRow
                      icon={<Frame className="w-4 h-4" />}
                      title={vs.showGostFrame ? 'Скрыть рамку ГОСТ и штамп на листе' : 'Показать рамку ГОСТ и штамп'}
                      onClick={() => runMenuAction(onToggleFrame)}
                    />
                    <AppMenuActionRow
                      icon={isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                      title={isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему'}
                      onClick={() => runMenuAction(onToggleTheme)}
                    />
                  </div>
                )}

                {menuCategory === 'system' && (
                  <div className="space-y-0.5 pb-1">
                    <AppMenuActionRow
                      icon={<Workflow className="w-4 h-4" />}
                      title="Выровнять провода на листе (Автотрассировка)"
                      subtitle="Перестроить маршруты в обход всех устройств и параллельных цепей"
                      onClick={() => runMenuAction(onAutoRouteWires)}
                    />
                    <AppMenuActionRow
                      icon={<Magnet className="w-4 h-4" />}
                      title={vs.snapToGrid ? `Привязка к сетке включена (${vs.gridSize} мм)` : 'Включить привязку к сетке'}
                      onClick={() => runMenuAction(onToggleSnapToGrid)}
                    />
                    <AppMenuActionRow
                      icon={<RotateCcw className="w-4 h-4" />}
                      title="Сбросить раскладку боковых и нижней панелей"
                      subtitle="Вернуть стандартную компоновку рабочего пространства"
                      onClick={() => runMenuAction(onResetDockLayout)}
                    />
                    <div className="my-1.5 border-t border-[var(--flux-line)]" />
                    <AppMenuActionRow
                      icon={<Terminal className="w-4 h-4" />}
                      title="Скачать системный журнал (diag.log)"
                      href="/api/v1/diagnostics/logs/download"
                      download="e3promax-diag.log"
                      onClick={() => setAppMenuOpen(false)}
                    />
                    <AppMenuActionRow
                      icon={<Download className="w-4 h-4" />}
                      title="Выгрузить журнал процессов (JSON)"
                      onClick={() => runMenuAction(onDownloadLogsJson)}
                    />
                    <AppMenuActionRow
                      icon={<Zap className="w-4 h-4" />}
                      title="Тест производительности: +500 элементов (Worker)"
                      subtitle="Проверка асинхронного пересчёта ПЭ3 и ERC на крупной схеме"
                      testId="menu-stress-test"
                      onClick={() => runMenuAction(() => onRunStressBatch(500))}
                    />
                    <div className="my-1.5 border-t border-[var(--flux-line)]" />
                    <AppMenuActionRow
                      icon={<Package className="w-4 h-4" />}
                      title="Сборка автономной Windows Portable (.zip)"
                      onClick={() => runMenuAction(onOpenPortableBuild)}
                    />
                    <AppMenuActionRow
                      icon={<Archive className="w-4 h-4" />}
                      title="Скачать полный исходный код проекта (.zip)"
                      onClick={() => runMenuAction(onDownloadCodebase)}
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Row 2: AutoCAD Section Tabs */}
      <div className="flex items-center justify-between px-3 h-7 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]">
        <div
          role="tablist"
          aria-label="Разделы ленты инструментов"
          className="flex items-end gap-1 h-full pt-0.5 overflow-x-auto no-scrollbar"
        >
          {RIBBON_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`ribbon-tab-${tab.id}`}
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (ribbonCollapsed) setRibbonCollapsed(false);
                }}
                className={`relative h-full px-3 text-[12px] rounded-t border-x border-t transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[var(--flux-bg)] border-[var(--flux-line)] text-[var(--flux-text)] border-b-transparent -mb-px pb-px font-semibold'
                    : 'bg-transparent border-transparent text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] font-medium'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="ribbon-tab-accent"
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    aria-hidden="true"
                    className="absolute top-0 left-1 right-1 h-0.5 bg-[var(--flux-accent)] rounded-t"
                  />
                )}
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-2 text-[11px] text-[var(--flux-text-muted)] whitespace-nowrap shrink-0 pl-2">
          <span className="font-mono tabular-nums">
            {project.sheets.length} л. · {project.devices.length} изд. · {project.wires.length} цеп.
          </span>
        </div>
      </div>

      {/* Row 3: AutoCAD Ribbon Panels */}
      <AnimatePresence initial={false}>
        {!ribbonCollapsed && (
          <motion.div
            key="ribbon-body"
            data-testid="ribbon-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 78, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden bg-[var(--flux-bg)]"
          >
            <div className="flex items-stretch h-[78px] px-1.5 bg-[var(--flux-bg)] overflow-x-auto no-scrollbar">
          {activeTab === 'home' && (
            <>
              <RibbonPanel title="Инструменты">
                <LargeRibbonBtn
                  icon={<MousePointer2 className="w-5 h-5" />}
                  label="Выбор"
                  title="Выбор и перетаскивание элементов (V)"
                  active={tool === 'select'}
                  onClick={() => onSetTool('select')}
                />
                <LargeRibbonBtn
                  icon={<Spline className="w-5 h-5" />}
                  label="Провод"
                  title="Соединить выводы проводом (W)"
                  active={tool === 'wire'}
                  onClick={() => onSetTool('wire')}
                />
                <LargeRibbonBtn
                  icon={<Hand className="w-5 h-5" />}
                  label="Панорама"
                  title="Перемещение листа (H)"
                  active={tool === 'pan'}
                  onClick={() => onSetTool('pan')}
                />
              </RibbonPanel>

              <RibbonPanel title="Правка">
                <LargeRibbonBtn
                  icon={<RotateCw className="w-5 h-5" />}
                  label="Поворот"
                  title="Повернуть выбранный элемент на 90° (R)"
                  disabled={!hasSelection}
                  onClick={onRotateSelected}
                />
                <LargeRibbonBtn
                  icon={<Trash2 className="w-5 h-5" />}
                  label="Удалить"
                  title="Удалить выбранный элемент (Del)"
                  danger
                  disabled={!hasSelection}
                  onClick={onDeleteSelected}
                />
                {onToggleLayerVisibility && onToggleLayerLock && (
                  <LargeRibbonBtn
                    icon={<Layers className="w-5 h-5 text-[var(--flux-accent)]" />}
                    label={
                      layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0
                        ? `Слои (${layerSummary.visibleCount}/4)`
                        : 'Слои'
                    }
                    title="Диспетчер слоёв AutoCAD (видимость и блокировка)"
                    active={layersPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0}
                    testId="toolbar-layers-btn"
                    onClick={(e) => {
                      toggleRibbonLayers(e.currentTarget);
                    }}
                  />
                )}
              </RibbonPanel>

              <RibbonPanel title="Сборка ФСА и База">
                <LargeRibbonBtn
                  icon={<Wand2 className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Собрать ФСА"
                  title="Мастер автоматической сборки приточной/вытяжной схемы и внешки"
                  accent
                  onClick={onOpenHvacWizard}
                />
                <LargeRibbonBtn
                  icon={<Workflow className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Выровнять"
                  title="Выровнять соединительные линии без пересечения блоков"
                  onClick={onAutoRouteWires}
                />
                <LargeRibbonBtn
                  icon={<Plus className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="+ Изделие"
                  title="Создать новое изделие с атрибутами в базе"
                  onClick={onOpenAddCatalogItem}
                />
                <LargeRibbonBtn
                  icon={<Database className="w-5 h-5" />}
                  label="База"
                  title="Открыть каталог изделий в левом окне"
                  onClick={onOpenCatalogTab}
                />
              </RibbonPanel>

              <RibbonPanel title="Проверка и Документы" isLast>
                <LargeRibbonBtn
                  icon={
                    isBusy ? (
                      <Activity className="w-5 h-5 text-[var(--flux-accent)] animate-spin" />
                    ) : (
                      <CheckCircle2
                        className={`w-5 h-5 ${
                          ercErrorCount > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      />
                    )
                  }
                  label={`ERC (${ercErrorCount})`}
                  title="Проверка электрических правил схемы (ERC)"
                  onClick={onRunErc}
                />
                <LargeRibbonBtn
                  icon={<FileSpreadsheet className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Спецификация"
                  title="Открыть панель спецификации ПЭ3 (ГОСТ 2.701)"
                  testId="toolbar-bom-btn"
                  onClick={onGenerateBom}
                />
                <LargeRibbonBtn
                  icon={<Printer className="w-5 h-5" />}
                  label="Отчёт ПЭ3"
                  title="Печатная форма и перечень элементов ГОСТ"
                  onClick={onOpenReportModal}
                />
                <LargeRibbonBtn
                  icon={<FileCode2 className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="PDF / DXF"
                  title="Пакетная публикация листов в редактируемый AutoCAD (.dxf) и PDF"
                  testId="toolbar-publish-btn"
                  onClick={onOpenPublishModal}
                />
                <LargeRibbonBtn
                  icon={<Type className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Штамп ГОСТ"
                  title="Редактировать основную надпись ГОСТ 2.104 (один лист или все листы)"
                  testId="toolbar-stamp-btn"
                  onClick={onOpenStampEditor}
                />
                <LargeRibbonBtn
                  icon={<LayoutTemplate className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Конструктор"
                  title="Создать и настроить собственный шаблон штампа"
                  testId="toolbar-stamp-designer-btn"
                  onClick={onOpenStampDesigner}
                />
              </RibbonPanel>
            </>
          )}

          {activeTab === 'drafting' && (
            <>
              <RibbonPanel title="Черчение и Примитивы">
                <LargeRibbonBtn
                  icon={<MousePointer2 className="w-5 h-5" />}
                  label="Выбор"
                  active={tool === 'select'}
                  onClick={() => onSetTool('select')}
                />
                <LargeRibbonBtn
                  icon={<Spline className="w-5 h-5" />}
                  label="Провод"
                  active={tool === 'wire'}
                  onClick={() => onSetTool('wire')}
                />
                <LargeRibbonBtn
                  icon={<Square className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Рамка"
                  title="Начертить пунктирный контур / зону шкафа на листе"
                  active={tool === 'rect'}
                  testId="tool-rect-btn"
                  onClick={() => onSetTool('rect')}
                />
                <LargeRibbonBtn
                  icon={<ArrowUpRight className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Выноска"
                  title="Поставить выноску со стрелкой на листе"
                  active={tool === 'callout'}
                  testId="tool-callout-btn"
                  onClick={() => onSetTool('callout')}
                />
                <LargeRibbonBtn
                  icon={<Type className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Текст"
                  title="Добавить текстовую надпись / примечание на лист"
                  active={tool === 'text'}
                  testId="tool-text-btn"
                  onClick={() => onSetTool('text')}
                />
              </RibbonPanel>

              <RibbonPanel title="Сетка и Привязка">
                <LargeRibbonBtn
                  icon={<Grid3X3 className="w-5 h-5" />}
                  label="Сетка"
                  active={vs.showGrid}
                  onClick={onToggleGrid}
                />
                <LargeRibbonBtn
                  icon={<Magnet className="w-5 h-5" />}
                  label="Привязка"
                  title="Магнитная привязка к сетке"
                  active={vs.snapToGrid}
                  onClick={onToggleSnapToGrid}
                />
                <div className="flex flex-col justify-center gap-1 px-1.5 h-[54px] shrink-0">
                  <span className="text-[10px] text-[var(--flux-text-muted)] whitespace-nowrap">Шаг сетки</span>
                  <select
                    aria-label="Шаг чертёжной сетки"
                    value={vs.gridSize}
                    onChange={(e) => onChangeGridSize(Number(e.target.value))}
                    className="h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
                  >
                    <option value={10}>10 мм</option>
                    <option value={20}>20 мм</option>
                    <option value={40}>40 мм</option>
                  </select>
                </div>
              </RibbonPanel>

              <RibbonPanel title="Операции" isLast>
                <LargeRibbonBtn
                  icon={<Workflow className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Выровнять"
                  onClick={onAutoRouteWires}
                />
                <LargeRibbonBtn
                  icon={<RotateCw className="w-5 h-5" />}
                  label="Поворот"
                  disabled={!hasSelection}
                  onClick={onRotateSelected}
                />
                <LargeRibbonBtn
                  icon={<Trash2 className="w-5 h-5" />}
                  label="Удалить"
                  danger
                  disabled={!hasSelection}
                  onClick={onDeleteSelected}
                />
              </RibbonPanel>
            </>
          )}

          {activeTab === 'annotations' && (
            <>
              <RibbonPanel title="Размещение аннотаций">
                <LargeRibbonBtn
                  icon={<Type className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Текст"
                  title="Кликните на лист для вставки надписи"
                  active={tool === 'text'}
                  onClick={() => onSetTool('text')}
                />
                <LargeRibbonBtn
                  icon={<ArrowUpRight className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Выноска"
                  title="Кликните на лист для вставки выноски"
                  active={tool === 'callout'}
                  onClick={() => onSetTool('callout')}
                />
                <LargeRibbonBtn
                  icon={<Square className="w-5 h-5" />}
                  label="Зона"
                  title="Пунктирная рамка зоны или шкафа"
                  active={tool === 'rect'}
                  onClick={() => onSetTool('rect')}
                />
              </RibbonPanel>

              <RibbonPanel title="Обозначения и Штампы">
                <LargeRibbonBtn
                  icon={<Tag className="w-5 h-5" />}
                  label="Выводы"
                  title="Показывать номера контактов"
                  active={vs.showPinNumbers}
                  onClick={onTogglePinNumbers}
                />
                <LargeRibbonBtn
                  icon={<Hash className="w-5 h-5" />}
                  label="Провода"
                  title="Показывать маркировку проводов"
                  active={vs.showWireNumbers}
                  onClick={onToggleWireNumbers}
                />
                <LargeRibbonBtn
                  icon={<PanelsTopLeft className="w-5 h-5" />}
                  label="Ссылки"
                  title="Перекрёстные ссылки между листами"
                  active={vs.showCrossRefs}
                  onClick={onToggleCrossRefs}
                />
                <LargeRibbonBtn
                  icon={<Frame className="w-5 h-5" />}
                  label="Рамка ГОСТ"
                  active={vs.showGostFrame}
                  onClick={onToggleFrame}
                />
                <LargeRibbonBtn
                  icon={<Type className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Штамп ГОСТ"
                  title="Заполнение граф основной надписи"
                  onClick={onOpenStampEditor}
                />
                <LargeRibbonBtn
                  icon={<LayoutTemplate className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Создать штамп"
                  title="Конструктор шаблонов штампов"
                  onClick={onOpenStampDesigner}
                />
              </RibbonPanel>

              <RibbonPanel title="Шрифты и Выпуск" isLast>
                <div className="flex flex-col justify-center gap-1 px-1.5 h-[54px] shrink-0">
                  <span className="text-[10px] text-[var(--flux-text-muted)] whitespace-nowrap">Шрифт ГОСТ</span>
                  <select
                    aria-label="Шрифт аннотаций и таблиц"
                    value={vs.fontFamily || 'GOST'}
                    onChange={(e) => onUpdateFontFamily(e.target.value as SchematicFontFamily)}
                    className="h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)] max-w-[140px]"
                  >
                    {SCHEMATIC_FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <LargeRibbonBtn
                  icon={<Palette className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Графика"
                  onClick={onOpenVisualModal}
                />
                <LargeRibbonBtn
                  icon={<Printer className="w-5 h-5" />}
                  label="Отчёт ПЭ3"
                  onClick={onOpenReportModal}
                />
              </RibbonPanel>
            </>
          )}

          {activeTab === 'sheet' && (
            <>
              <RibbonPanel title="Настройки листа">
                <div className="flex flex-col justify-center gap-1 px-1.5 h-[54px] shrink-0">
                  <span className="text-[10px] text-[var(--flux-text-muted)] whitespace-nowrap">
                    Формат ({activeSheet?.format || 'A3'})
                  </span>
                  <select
                    aria-label="Формат активного листа"
                    value={activeSheet?.format || 'A3'}
                    onChange={(e) =>
                      activeSheet && onUpdateSheetFormat(activeSheet.id, e.target.value as SheetFormat)
                    }
                    className="h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)] max-w-[155px]"
                  >
                    {(Object.keys(SHEET_DIMENSIONS) as SheetFormat[]).map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {SHEET_DIMENSIONS[fmt].label}
                      </option>
                    ))}
                  </select>
                </div>
                <LargeRibbonBtn
                  icon={<FilePlus2 className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="+ Лист"
                  onClick={onAddSheet}
                />
                <LargeRibbonBtn
                  icon={<CopyPlus className="w-5 h-5" />}
                  label="Копия"
                  title="Дублировать текущий лист вместе с элементами"
                  disabled={!activeSheet}
                  onClick={() => activeSheet && onDuplicateSheet(activeSheet.id)}
                />
                <LargeRibbonBtn
                  icon={<FileX2 className="w-5 h-5" />}
                  label="Удал. лист"
                  title="Удалить текущий лист (если в проекте больше 1 листа)"
                  danger
                  disabled={!activeSheet || project.sheets.length <= 1}
                  onClick={() => activeSheet && onDeleteSheet(activeSheet.id)}
                />
              </RibbonPanel>

              <RibbonPanel title="Оформление и Штамп">
                <LargeRibbonBtn
                  icon={<Type className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Штамп ГОСТ"
                  title="Редактор основной надписи ГОСТ 2.104 (один лист / все листы)"
                  testId="sheet-stamp-btn"
                  onClick={onOpenStampEditor}
                />
                <LargeRibbonBtn
                  icon={<LayoutTemplate className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Создать штамп"
                  title="Конструктор пользовательских штампов"
                  onClick={onOpenStampDesigner}
                />
                <LargeRibbonBtn
                  icon={<Frame className="w-5 h-5" />}
                  label="Рамка"
                  active={vs.showGostFrame}
                  onClick={onToggleFrame}
                />
                <LargeRibbonBtn
                  icon={<Grid3X3 className="w-5 h-5" />}
                  label="Сетка"
                  active={vs.showGrid}
                  onClick={onToggleGrid}
                />
                <LargeRibbonBtn
                  icon={<Palette className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Шрифты"
                  onClick={onOpenVisualModal}
                />
              </RibbonPanel>

              <RibbonPanel title="Автоматизация ОВКВ (ФСА)" isLast>
                <LargeRibbonBtn
                  icon={<Wand2 className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Собрать ФСА"
                  accent
                  onClick={onOpenHvacWizard}
                />
                <LargeRibbonBtn
                  icon={<Workflow className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Выровнять"
                  onClick={onAutoRouteWires}
                />
                <LargeRibbonBtn
                  icon={<Plus className="w-5 h-5" />}
                  label="+ Изделие"
                  onClick={onOpenAddCatalogItem}
                />
              </RibbonPanel>
            </>
          )}

          {activeTab === 'view' && (
            <>
              <RibbonPanel title="Листы в центре (Окна)">
                <LargeRibbonBtn
                  icon={<PanelLeft className="w-5 h-5" />}
                  label="1 лист"
                  title="Показывать один активный лист в центре"
                  active={viewportLayout === 'single'}
                  testId="viewport-mode-single"
                  onClick={() => onSetViewportLayout('single')}
                />
                <LargeRibbonBtn
                  icon={<Columns2 className="w-5 h-5" />}
                  label="2 листа"
                  title="Расположить 2 листа рядом в центре"
                  active={viewportLayout === 'two'}
                  testId="viewport-mode-two"
                  onClick={() => onSetViewportLayout('two')}
                />
                <LargeRibbonBtn
                  icon={<LayoutGrid className="w-5 h-5" />}
                  label="3 листа"
                  title="Расположить 3 листа одновременно"
                  active={viewportLayout === 'three'}
                  testId="viewport-mode-three"
                  onClick={() => onSetViewportLayout('three')}
                />
                <LargeRibbonBtn
                  icon={<Grid2X2 className="w-5 h-5" />}
                  label="4 листа"
                  title="Расположить 4 листа сеткой 2×2"
                  active={viewportLayout === 'four'}
                  testId="viewport-mode-four"
                  onClick={() => onSetViewportLayout('four')}
                />
              </RibbonPanel>

              <RibbonPanel title="Навигация и Масштаб">
                <LargeRibbonBtn
                  icon={<Maximize2 className="w-5 h-5" />}
                  label="По листу"
                  onClick={onFitView}
                />
                <LargeRibbonBtn
                  icon={<Hand className="w-5 h-5" />}
                  label="Панорама"
                  active={tool === 'pan'}
                  onClick={() => onSetTool('pan')}
                />
                <div className="flex items-center gap-1 px-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.max(0.18, Math.round((zoom - 0.1) * 100) / 100))}
                    aria-label="Уменьшить масштаб"
                    className="inline-flex items-center justify-center w-7 h-8 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)]"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="w-11 text-center font-mono tabular-nums text-[12px] text-[var(--flux-text)]">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.min(2.5, Math.round((zoom + 0.15) * 100) / 100))}
                    aria-label="Увеличить масштаб"
                    className="inline-flex items-center justify-center w-7 h-8 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)]"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              </RibbonPanel>

              <RibbonPanel title="Панели и Тема" isLast>
                {onToggleLayerVisibility && onToggleLayerLock && (
                  <LargeRibbonBtn
                    icon={<Layers className="w-5 h-5 text-[var(--flux-accent)]" />}
                    label={`Слои (${layerSummary.visibleCount}/4)`}
                    title="Управление видимостью и блокировкой слоёв чертежа"
                    testId="ribbon-view-layers-btn"
                    active={layersPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0}
                    onClick={(e) => toggleRibbonLayers(e.currentTarget)}
                  />
                )}
                <LargeRibbonBtn
                  icon={<RotateCcw className="w-5 h-5" />}
                  label="Сброс окон"
                  title="Вернуть боковые и нижнюю панели в исходное положение"
                  testId="reset-dock-layout-btn"
                  onClick={onResetDockLayout}
                />
                <LargeRibbonBtn
                  icon={isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  label={isDark ? 'Светлая' : 'Тёмная'}
                  onClick={onToggleTheme}
                />
              </RibbonPanel>
            </>
          )}

          {activeTab === 'export' && (
            <>
              <RibbonPanel title="Интеграция Zuken E³.series">
                <LargeRibbonBtn
                  icon={<Upload className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Открыть .e3s"
                  onClick={() => fileInputRef.current?.click()}
                />
                <LargeRibbonBtn
                  icon={<Share2 className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="В E³.series"
                  onClick={onDirectOpenE3}
                />
                <LargeRibbonBtn
                  icon={<FolderOpen className="w-5 h-5" />}
                  label="Обмен E3"
                  onClick={onOpenExchangeModal}
                />
              </RibbonPanel>

              <RibbonPanel title="Документация и Публикация">
                <LargeRibbonBtn
                  icon={<FileSpreadsheet className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Список ПЭ3"
                  onClick={onGenerateBom}
                />
                <LargeRibbonBtn
                  icon={<Printer className="w-5 h-5" />}
                  label="Отчёт ПЭ3"
                  onClick={onOpenReportModal}
                />
                <LargeRibbonBtn
                  icon={<FileCode2 className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Пакет PDF/DXF"
                  title="Пакетная публикация в PDF и редактируемый AutoCAD DXF"
                  onClick={onOpenPublishModal}
                />
                <LargeRibbonBtn
                  icon={<FileCode2 className="w-5 h-5" />}
                  label="Лист DXF"
                  onClick={onExportDxf}
                />
              </RibbonPanel>

              <RibbonPanel title="Сборка и Код" isLast>
                <LargeRibbonBtn
                  icon={<Package className="w-5 h-5 text-[var(--flux-accent)]" />}
                  label="Portable"
                  onClick={onOpenPortableBuild}
                />
                <LargeRibbonBtn
                  icon={<Archive className="w-5 h-5" />}
                  label="Код (.zip)"
                  onClick={onDownloadCodebase}
                />
              </RibbonPanel>
            </>
          )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unclipped Ribbon Layer Manager Popover */}
      {layersPopoverOpen && onToggleLayerVisibility && onToggleLayerLock && (
        <div
          className="absolute top-full z-50"
          style={layersPopoverLeft !== null ? { left: layersPopoverLeft } : { right: 12 }}
        >
          <LayerManagerPopover
            open={layersPopoverOpen}
            layers={resolvedLayers}
            entityCounts={activeSheetCounts}
            align="left"
            onClose={() => setLayersPopoverOpen(false)}
            onToggleVisibility={onToggleLayerVisibility}
            onToggleLock={onToggleLayerLock}
            onShowAll={() => onShowAllLayers?.()}
            onUnlockAll={() => onUnlockAllLayers?.()}
          />
        </div>
      )}
    </header>
  );
};
