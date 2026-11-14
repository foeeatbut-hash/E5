import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Archive,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  ClipboardPaste,
  Clock,
  Columns2,
  Copy,
  CopyPlus,
  Cpu,
  Crosshair,
  Database,
  Download,
  FileCode2,
  FilePlus2,
  FileSpreadsheet,
  FileX2,
  FlipHorizontal2,
  FlipVertical2,
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
  Minus,
  Moon,
  MousePointer2,
  Package,
  Palette,
  PanelLeft,
  PanelsTopLeft,
  PenTool,
  Plus,
  Printer,
  Redo2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Spline,
  Square,
  Sun,
  Table2,
  Tag,
  Terminal,
  Trash2,
  Type,
  Undo2,
  Upload,
  Workflow,
  X,
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
import type { RecentProjectEntry } from '../core/sessionStorage';
import type {
  CadLayerId,
  CadTool,
  CustomSymbolStrokeStyle,
  E3Project,
  E3Sheet,
  E3VisualSettings,
  SchematicFontFamily,
  SheetFormat,
} from '../core/e3Types';
import {
  ATTRIBUTE_TEMPLATE_PRESETS,
  STROKE_STYLE_OPTIONS,
  SYMBOL_COLOR_PALETTE,
} from '../core/symbolLibrary';
import type { SymbolWorkspaceActions } from '../core/symbolWorkspaceTypes';
import {
  getScaledChromeMetrics,
  normalizeUiScalePercent,
  UI_SCALE_OPTIONS,
  type UiScalePercent,
} from '../core/uiScale';
import { LayerManagerPopover } from './LayerManagerPopover';

export type { CadTool };
export type RibbonSectionId =
  | 'home'
  | 'drafting'
  | 'annotations'
  | 'sheet'
  | 'view'
  | 'flux'
  | 'export'
  | 'ugo_editor';
type AppMenuCategory = 'file' | 'export' | 'stamps' | 'system';

interface TopToolbarProps {
  project: E3Project;
  activeSheet: E3Sheet | undefined;
  tool: CadTool;
  zoom: number;
  uiScale?: UiScalePercent;
  viewportLayout: ViewportLayoutMode;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  hasClipboard?: boolean;
  ercErrorCount: number;
  isBusy: boolean;
  e3BridgeHost: string | null;
  fluxHosted?: boolean;
  onSetTool: (tool: CadTool) => void;
  onChangeUiScale?: (scale: UiScalePercent) => void;
  onSetViewportLayout: (mode: ViewportLayoutMode) => void;
  onResetDockLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopySelected?: () => void;
  onPasteClipboard?: () => void;
  onDuplicateSelected?: () => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onZoomChange: (nextZoom: number) => void;
  onFitView: () => void;
  onToggleGrid: () => void;
  onToggleSnapToGrid: () => void;
  onToggleCrosshair?: () => void;
  onChangeGridSize: (gridSize: number) => void;
  onToggleFrame: () => void;
  onTogglePinNumbers: () => void;
  onToggleWireNumbers: () => void;
  onToggleCrossRefs: () => void;
  onUpdateSheetFormat: (sheetId: string, format: SheetFormat) => void;
  onUpdateFontFamily: (font: SchematicFontFamily) => void;
  onUpdateVisualSettings?: (patch: Partial<E3VisualSettings>) => void;
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
  onOpenFluxPublishModal: () => void;
  onPushToFluxHost: () => void;
  onOpenFluxBusConsole: () => void;
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
  onOpenTerminalEditor?: () => void;
  onOpenAutoNumbering?: () => void;
  onToggleLayerVisibility?: (layerId: CadLayerId) => void;
  onToggleLayerLock?: (layerId: CadLayerId) => void;
  onShowAllLayers?: () => void;
  onUnlockAllLayers?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenHealthDashboard?: () => void;
  errorLogCount?: number;
  onOpenSymbolDesigner?: () => void;
  symbolWorkspace?: SymbolWorkspaceActions;
  onInsertGostTable?: (tableKind: 'bom' | 'cables') => void;
  recentProjects?: RecentProjectEntry[];
  lastSavedAt?: string | null;
  onSaveSessionNow?: () => void;
  onCreateNewProject?: () => void;
  onOpenRecentProject?: (projectId: string) => void;
  onRemoveRecentProject?: (projectId: string) => void;
}

const RIBBON_TABS: Array<{ id: RibbonSectionId; label: string; contextual?: boolean }> = [
  { id: 'home', label: 'Главная' },
  { id: 'drafting', label: 'Черчение' },
  { id: 'annotations', label: 'Аннотации' },
  { id: 'sheet', label: 'Лист и ФСА' },
  { id: 'view', label: 'Вид' },
  { id: 'flux', label: 'Flux' },
  { id: 'export', label: 'E³.series' },
];

const RibbonPanel: React.FC<{ title: string; isLast?: boolean; children: React.ReactNode }> = ({
  title,
  isLast = false,
  children,
}) => (
  <div
    className={`flex flex-col justify-between h-full px-2 pt-1 pb-0.5 shrink-0 ${
      isLast ? '' : 'border-r border-[var(--flux-line)]'
    }`}
  >
    <div className="flex-1 flex items-center gap-0.5 min-h-0">{children}</div>
    <div className="text-[length:calc(10px*var(--flux-ui-scale))] leading-[calc(13px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))] font-medium text-center text-[var(--flux-text-muted)] pt-0.5 select-none whitespace-nowrap">
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
    className={`group flex flex-col items-center justify-center gap-1 min-w-[calc(46px*var(--flux-ui-scale))] h-[calc(50px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border transition-colors whitespace-nowrap shrink-0 disabled:opacity-35 ${
      active
        ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)]/70 text-[var(--flux-text)]'
        : danger
          ? 'border-transparent text-[var(--flux-text)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[var(--flux-hover)] hover:border-[var(--flux-line)]'
          : 'border-transparent text-[var(--flux-text)] hover:bg-[var(--flux-hover)] hover:border-[var(--flux-line)]'
    }`}
  >
    <span
      className={`shrink-0 flex items-center justify-center transition-colors ${
        active || accent
          ? 'text-[var(--flux-accent)]'
          : danger
            ? 'text-[var(--flux-text-muted)] group-hover:text-rose-600 dark:group-hover:text-rose-400'
            : 'text-[var(--flux-text-muted)] group-hover:text-[var(--flux-text)]'
      }`}
    >
      {icon}
    </span>
    <span className="text-[length:calc(10.5px*var(--flux-ui-scale))] leading-[1.1] font-medium text-center">{label}</span>
  </button>
);

const RibbonStack: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-col justify-center h-[calc(50px*var(--flux-ui-scale))] gap-1 shrink-0">{children}</div>
);

interface SmallRibbonBtnProps {
  icon: React.ReactNode;
  label: string;
  title?: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  testId?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const SmallRibbonBtn: React.FC<SmallRibbonBtnProps> = ({
  icon,
  label,
  title,
  active = false,
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
    className={`group h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border inline-flex items-center gap-1.5 text-[length:calc(11px*var(--flux-ui-scale))] font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-35 ${
      active
        ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)]/60 text-[var(--flux-text)]'
        : danger
          ? 'border-transparent text-[var(--flux-text)] hover:text-rose-600 dark:hover:text-rose-400 hover:bg-[var(--flux-hover)] hover:border-[var(--flux-line)]'
          : 'border-transparent text-[var(--flux-text)] hover:bg-[var(--flux-hover)] hover:border-[var(--flux-line)]'
    }`}
  >
    <span
      className={`shrink-0 flex items-center justify-center transition-colors ${
        active
          ? 'text-[var(--flux-accent)]'
          : danger
            ? 'text-[var(--flux-text-muted)] group-hover:text-rose-600 dark:group-hover:text-rose-400'
            : 'text-[var(--flux-text-muted)] group-hover:text-[var(--flux-text)]'
      }`}
    >
      {icon}
    </span>
    <span className="leading-none">{label}</span>
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
  const cls = `group w-full px-2.5 py-1.5 flex items-center justify-between gap-2.5 text-left transition-colors rounded-[2px] ${
    disabled
      ? 'opacity-40 pointer-events-none'
      : danger
        ? 'text-rose-600 dark:text-rose-400 hover:bg-[var(--flux-hover)]'
        : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
  }`;

  const inner = (
    <>
      <div className="flex items-start gap-2.5 min-w-0">
        <span
          className={`mt-0.5 shrink-0 transition-colors ${
            danger
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-[var(--flux-text-muted)] group-hover:text-[var(--flux-accent)]'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[length:calc(12px*var(--flux-ui-scale))] font-medium leading-tight truncate">{title}</div>
          {subtitle && (
            <div className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] leading-snug truncate mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {shortcut && (
        <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
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

const parseFiniteNum = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export const TopToolbar: React.FC<TopToolbarProps> = React.memo(({
  project,
  activeSheet,
  tool,
  zoom,
  uiScale = 100,
  viewportLayout,
  canUndo,
  canRedo,
  hasSelection,
  hasClipboard = false,
  ercErrorCount,
  isBusy,
  e3BridgeHost,
  fluxHosted = false,
  onSetTool,
  onChangeUiScale,
  onSetViewportLayout,
  onResetDockLayout,
  onUndo,
  onRedo,
  onCopySelected,
  onPasteClipboard,
  onRotateSelected,
  onDeleteSelected,
  onZoomChange,
  onFitView,
  onToggleGrid,
  onToggleSnapToGrid,
  onToggleCrosshair,
  onChangeGridSize,
  onToggleFrame,
  onTogglePinNumbers,
  onToggleWireNumbers,
  onToggleCrossRefs,
  onUpdateSheetFormat,
  onUpdateFontFamily,
  onUpdateVisualSettings,
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
  onOpenFluxPublishModal,
  onPushToFluxHost,
  onOpenFluxBusConsole,
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
  onOpenTerminalEditor,
  onOpenAutoNumbering,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onShowAllLayers,
  onUnlockAllLayers,
  onOpenCommandPalette,
  onOpenHealthDashboard,
  errorLogCount = 0,
  onOpenSymbolDesigner,
  symbolWorkspace,
  onInsertGostTable,
  recentProjects = [],
  lastSavedAt = null,
  onSaveSessionNow,
  onCreateNewProject,
  onOpenRecentProject,
  onRemoveRecentProject,
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

  const isSymbolEditorOpen = Boolean(symbolWorkspace?.draft.open);
  const prevSymbolOpenRef = useRef(false);
  useEffect(() => {
    if (isSymbolEditorOpen && !prevSymbolOpenRef.current) {
      setActiveTab('ugo_editor');
      setRibbonCollapsed(false);
      setLayersPopoverOpen(false);
    } else if (!isSymbolEditorOpen && prevSymbolOpenRef.current) {
      setActiveTab((curr) => (curr === 'ugo_editor' ? 'home' : curr));
    }
    prevSymbolOpenRef.current = isSymbolEditorOpen;
  }, [isSymbolEditorOpen]);

  const vs = project.visualSettings;
  const resolvedLayers = resolveCadLayers(project.layers, vs.showGostFrame);
  const layerSummary = summarizeCadLayers(resolvedLayers);
  const activeSheetCounts = countSheetLayerEntities(
    project,
    activeSheet?.id || project.sheets[0]?.id || ''
  );

  const chrome = getScaledChromeMetrics(uiScale);
  const ribbonHeight = chrome.ribbonRowHeight;

  const toggleRibbonLayers = (btnEl: HTMLButtonElement | null) => {
    if (btnEl && headerRef.current) {
      const hRect = headerRef.current.getBoundingClientRect();
      const bRect = btnEl.getBoundingClientRect();
      const popReserve = chrome.layersPopoverWidth + Math.round(12 * chrome.factor);
      const clampedLeft = Math.max(8, Math.min(bRect.left - hRect.left, Math.max(8, hRect.width - popReserve)));
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
      className="no-print shrink-0 w-full max-w-full min-w-0 relative z-40 border-b border-[var(--flux-line)] flux-glass-surface select-none"
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

      {/* Row 1: CAD Application Button + Monochrome Quick Access Toolbar + Document Title */}
      <div className="flex items-center justify-between gap-2 lg:gap-4 px-1.5 h-7 border-b border-[var(--flux-line)] min-w-0 flux-glass-bar">
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            ref={menuBtnRef}
            type="button"
            data-testid="app-menu-btn"
            aria-haspopup="menu"
            aria-expanded={appMenuOpen}
            onClick={() => setAppMenuOpen((o) => !o)}
            title="Главное меню программы: файлы, экспорт, штампы, настройки"
            className={`inline-flex items-center gap-1.5 h-[calc(21px*var(--flux-ui-scale))] pl-1.5 pr-2 rounded-[4px] font-semibold text-[length:calc(11px*var(--flux-ui-scale))] tracking-tight border transition-colors whitespace-nowrap shrink-0 mr-1 ${
              appMenuOpen
                ? 'bg-[var(--flux-accent-solid)] text-white border-[var(--flux-accent-solid)]'
                : 'bg-[#12261e] dark:bg-[#193329] hover:bg-[#183428] dark:hover:bg-[#214235] text-emerald-50 border-[#285442]'
            }`}
          >
            <svg
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
              className="w-[calc(12px*var(--flux-ui-scale))] h-[calc(12px*var(--flux-ui-scale))] shrink-0"
            >
              <rect x="1.5" y="1.5" width="15" height="15" rx="3" stroke="currentColor" strokeOpacity="0.65" strokeWidth="1.5" />
              <path
                d="M4.2 9h3.4l1.9-3.6 2 7.2 1.6-3.6H14"
                stroke="#34d399"
                strokeWidth="1.7"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>
            <span style={{ fontFamily: 'var(--font-display)' }}>E3ProMax</span>
            <ChevronDown className={`w-3 h-3 opacity-80 transition-transform duration-150 ${appMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <span className="h-3.5 w-px bg-[var(--flux-line)] mr-0.5 shrink-0" aria-hidden="true" />

          {/* Quick Access Toolbar (QAT): Undo / Redo */}

          <button
            type="button"
            onClick={() => (isSymbolEditorOpen && symbolWorkspace ? symbolWorkspace.onUndo() : onUndo())}
            disabled={isSymbolEditorOpen && symbolWorkspace ? !symbolWorkspace.canUndo : !canUndo}
            title={isSymbolEditorOpen ? 'Отменить в редакторе УГО (Ctrl+Z)' : 'Отменить (Ctrl+Z)'}
            aria-label="Отменить действие"
            className="inline-flex items-center justify-center w-[calc(22px*var(--flux-ui-scale))] h-[calc(22px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-30 transition-colors shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => (isSymbolEditorOpen && symbolWorkspace ? symbolWorkspace.onRedo() : onRedo())}
            disabled={isSymbolEditorOpen && symbolWorkspace ? !symbolWorkspace.canRedo : !canRedo}
            title={isSymbolEditorOpen ? 'Повторить в редакторе УГО (Ctrl+Y)' : 'Повторить (Ctrl+Y)'}
            aria-label="Повторить действие"
            className="inline-flex items-center justify-center w-[calc(22px*var(--flux-ui-scale))] h-[calc(22px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-30 transition-colors shrink-0"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Centered Document Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
          <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] truncate max-w-[calc(200px*var(--flux-ui-scale))] md:max-w-[calc(320px*var(--flux-ui-scale))] lg:max-w-[calc(460px*var(--flux-ui-scale))]">
            {isSymbolEditorOpen && symbolWorkspace
              ? `Редактор блока УГО · ${symbolWorkspace.draft.name}${symbolWorkspace.draft.dirty ? ' *' : ''}`
              : project.name}
          </span>
          <span className="hidden xl:inline text-[length:calc(10.5px*var(--flux-ui-scale))] font-mono tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
            {isSymbolEditorOpen && symbolWorkspace
              ? `${symbolWorkspace.draft.e3BlockName || 'BLOCK'} · ${symbolWorkspace.draft.width}×${symbolWorkspace.draft.height}`
              : `${project.projectCode} · Rev ${project.revision}`}
          </span>
        </div>

        {/* Right Window Utilities */}
        <div className="flex items-center gap-0.5 shrink-0">
          {onOpenCommandPalette && (
            <button
              type="button"
              data-testid="toolbar-command-palette-btn"
              onClick={onOpenCommandPalette}
              aria-label="Палитра команд (Ctrl+K)"
              title="Палитра команд и быстрый переход (Ctrl+K)"
              className="inline-flex items-center gap-1 h-[calc(21px*var(--flux-ui-scale))] px-1.5 mr-0.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] transition-colors shrink-0"
            >
              <Search className="w-3 h-3 text-[var(--flux-accent)]" />
              <span className="hidden sm:inline">Команды</span>
              <kbd className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                Ctrl+K
              </kbd>
            </button>
          )}
          {onOpenHealthDashboard && (
            <button
              type="button"
              data-testid="toolbar-health-btn"
              onClick={onOpenHealthDashboard}
              aria-label="Монитор здоровья и телеметрия процессов"
              title="Монитор здоровья, частота логов и диагностика лагов"
              className={`inline-flex items-center gap-1 h-[calc(21px*var(--flux-ui-scale))] px-1.5 mr-0.5 rounded-[2px] border text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium transition-colors shrink-0 ${
                errorLogCount > 0
                  ? 'border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20'
                  : 'border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
              }`}
            >
              <Activity
                className={`w-3 h-3 ${
                  errorLogCount > 0 ? 'text-rose-500' : 'text-[var(--flux-text-muted)]'
                }`}
              />
              <span className="hidden lg:inline">Здоровье</span>
              {errorLogCount > 0 && (
                <span className="font-mono tabular-nums text-[length:calc(9.5px*var(--flux-ui-scale))] font-semibold">
                  {errorLogCount}
                </span>
              )}
            </button>
          )}
          {onChangeUiScale && (
            <select
              data-testid="ui-scale-select"
              aria-label="Масштаб интерфейса"
              title="Масштаб интерфейса программы (100%–180%)"
              value={uiScale}
              onChange={(e) => onChangeUiScale(normalizeUiScalePercent(Number(e.target.value)))}
              className="h-[calc(21px*var(--flux-ui-scale))] px-1 mr-0.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] font-mono tabular-nums text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-accent)] transition-colors shrink-0 cursor-pointer"
            >
              {UI_SCALE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}%
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
            title={isDark ? 'Светлая тема' : 'Тёмная тема'}
            className="inline-flex items-center justify-center w-[calc(22px*var(--flux-ui-scale))] h-[calc(22px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            data-testid="ribbon-collapse-btn"
            onClick={() => setRibbonCollapsed((c) => !c)}
            aria-label={ribbonCollapsed ? 'Развернуть ленту команд' : 'Свернуть ленту команд'}
            title={ribbonCollapsed ? 'Развернуть ленту' : 'Свернуть ленту'}
            className="inline-flex items-center justify-center w-[calc(22px*var(--flux-ui-scale))] h-[calc(22px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            <motion.span
              animate={{ rotate: ribbonCollapsed ? 180 : 0 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center justify-center"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </motion.span>
          </button>
        </div>
      </div>

      {/* Floating Application Menu Drawer */}
      <AnimatePresence>
        {appMenuOpen && (
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Главное системное меню"
            data-testid="app-menu-drawer"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-[calc(36px*var(--flux-ui-scale))] left-1.5 z-50 w-[min(calc(640px*var(--flux-ui-scale)),calc(100vw-16px))] rounded-2xl border border-[var(--flux-line-strong)] flux-glass-popover overflow-hidden flex flex-col"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 min-h-[340px] max-h-[78vh]">
              {/* Left Navigation Categories */}
              <div className="sm:col-span-4 border-b sm:border-b-0 sm:border-r border-[var(--flux-line)] bg-[var(--flux-bg)]/55 p-2 flex flex-col justify-between gap-2">
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
                        className={`w-full px-2 h-8 rounded-[2px] flex items-center justify-between gap-2 text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium transition-colors ${
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

                <div className="pt-2.5 border-t border-[var(--flux-line)] px-1.5 space-y-1 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
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
                    {onSaveSessionNow && (
                      <AppMenuActionRow
                        icon={<Save className="w-4 h-4" />}
                        title="Сохранить сессию проекта"
                        subtitle={
                          lastSavedAt
                            ? `Автосохранение активно · ${new Date(lastSavedAt).toLocaleTimeString('ru-RU')}`
                            : 'Зафиксировать проект в браузере и списке недавних'
                        }
                        testId="menu-save-session"
                        onClick={() => runMenuAction(onSaveSessionNow)}
                      />
                    )}
                    {onCreateNewProject && (
                      <AppMenuActionRow
                        icon={<FilePlus2 className="w-4 h-4" />}
                        title="Новый проект (чистый шаблон ЩУ-ПВ1)"
                        subtitle="Создать новый проект с сохранением текущего в недавних"
                        testId="menu-new-project"
                        onClick={() => runMenuAction(onCreateNewProject)}
                      />
                    )}
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
                      icon={<FileX2 className="w-4 h-4" />}
                      title="Удалить активный лист"
                      danger
                      disabled={!activeSheet || project.sheets.length <= 1}
                      onClick={() => activeSheet && runMenuAction(() => onDeleteSheet(activeSheet.id))}
                    />

                    {recentProjects.length > 0 && (
                      <>
                        <div className="my-1.5 border-t border-[var(--flux-line)]" />
                        <div className="px-3 pt-1 pb-0.5 flex items-center justify-between text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)]">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            <span>Недавние проекты</span>
                          </span>
                          <span className="font-mono tabular-nums">{recentProjects.length}</span>
                        </div>
                        <div data-testid="recent-projects-list" className="space-y-0.5 px-1">
                          {recentProjects.map((rp) => {
                            const isCurrent = rp.id === project.id;
                            return (
                                <div
                                  key={rp.id}
                                  className={`group flex items-center justify-between gap-2 px-2 py-1 rounded-[2px] text-[length:calc(11.5px*var(--flux-ui-scale))] transition-colors ${
                                    isCurrent ? 'bg-[var(--flux-sel)]' : 'hover:bg-[var(--flux-hover)]'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    data-testid={`recent-project-${rp.id}`}
                                    onClick={() =>
                                      runMenuAction(() => onOpenRecentProject?.(rp.id))
                                    }
                                    className="min-w-0 flex-1 text-left"
                                  >
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="font-medium text-[var(--flux-text)] truncate">
                                        {rp.name}
                                      </span>
                                      {isCurrent && (
                                        <span className="text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-accent)] font-mono shrink-0">
                                          (акт.)
                                        </span>
                                      )}
                                    </div>
                                  <div className="text-[length:calc(10.5px*var(--flux-ui-scale))] font-mono text-[var(--flux-text-muted)] truncate">
                                    {rp.projectCode} · Rev {rp.revision} · {rp.sheetCount} л. · {rp.deviceCount} изд.
                                  </div>
                                </button>
                                {onRemoveRecentProject && (
                                  <button
                                    type="button"
                                    data-testid={`remove-recent-${rp.id}`}
                                    aria-label={`Удалить ${rp.name} из недавних`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRemoveRecentProject(rp.id);
                                    }}
                                    className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600 hover:bg-[var(--flux-surface)] opacity-70 group-hover:opacity-100 shrink-0"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
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
                    {onOpenTerminalEditor && (
                      <AppMenuActionRow
                        icon={<Tag className="w-4 h-4" />}
                        title="Редактор клеммных рядов (-XT)"
                        subtitle="Перемычки, резервные клеммы, генерация листа клеммника"
                        onClick={() => runMenuAction(onOpenTerminalEditor)}
                      />
                    )}
                    {onOpenAutoNumbering && (
                      <AppMenuActionRow
                        icon={<Hash className="w-4 h-4" />}
                        title="Автонумерация цепей и ОУО (ГОСТ 2.710)"
                        subtitle="Маркировка проводов по листам/зонам и переиндексация -QF/-KM"
                        onClick={() => runMenuAction(onOpenAutoNumbering)}
                      />
                    )}
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
                    {onOpenHealthDashboard && (
                      <AppMenuActionRow
                        icon={<Activity className="w-4 h-4" />}
                        title="Монитор здоровья и телеметрия процессов"
                        subtitle="График частоты логов (Recharts), FPS, лаги и полная трасса событий"
                        testId="menu-health-dashboard"
                        onClick={() => runMenuAction(onOpenHealthDashboard)}
                      />
                    )}
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

      {/* Row 2: CAD Ribbon Section Tabs */}
      <div className="flex items-center justify-between px-2 h-6 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]">
        <div
          role="tablist"
          aria-label="Разделы ленты инструментов"
          className="flex items-end gap-0.5 h-full overflow-x-auto no-scrollbar"
        >
          {(isSymbolEditorOpen
            ? [...RIBBON_TABS, { id: 'ugo_editor' as const, label: 'Редактор УГО', contextual: true }]
            : RIBBON_TABS
          ).map((tab) => {
            const isActive = activeTab === tab.id;
            const isContextual = Boolean(tab.contextual);
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
                className={`relative h-full px-2.5 text-[length:calc(11px*var(--flux-ui-scale))] border-x border-t transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[var(--flux-bg)] border-[var(--flux-line)] border-t-2 border-t-[var(--flux-accent)] text-[var(--flux-text)] border-b-transparent -mb-px pb-px font-semibold'
                    : isContextual
                      ? 'bg-[var(--flux-accent-soft)] border-[var(--flux-accent)]/35 text-[var(--flux-accent)] hover:bg-[var(--flux-sel)] font-semibold'
                      : 'bg-transparent border-transparent text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] font-medium'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-2 text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap shrink-0 pl-2">
          {isSymbolEditorOpen && symbolWorkspace ? (
            <span className="font-mono tabular-nums text-[var(--flux-accent)]">
              Блок: {symbolWorkspace.draft.shapes.length} прим. · {symbolWorkspace.draft.pins.length} выв. · {symbolWorkspace.draft.attributes.length} атр.
            </span>
          ) : (
            <span className="font-mono tabular-nums">
              {project.sheets.length} л. · {project.devices.length} изд. · {project.wires.length} цеп.
            </span>
          )}
        </div>
      </div>

      {/* Row 3: Dual-Hierarchy Structured CAD Ribbon */}
      <AnimatePresence initial={false}>
        {!ribbonCollapsed && (
          <motion.div
            key="ribbon-body"
            data-testid="ribbon-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: ribbonHeight, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden bg-[var(--flux-bg)]"
          >
            <div
              style={{ height: ribbonHeight }}
              className="flex items-stretch px-1 bg-[var(--flux-bg)] overflow-x-auto no-scrollbar"
            >
              <div className="flex items-stretch h-full">
                  {activeTab === 'home' && (
                    <>
                      <RibbonPanel title="Инструменты">
                        <LargeRibbonBtn
                          icon={<MousePointer2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Выбор"
                          title="Выбор и перетаскивание элементов (V)"
                          active={tool === 'select'}
                          onClick={() => onSetTool('select')}
                        />
                        <LargeRibbonBtn
                          icon={<Spline className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Провод"
                          title="Соединить выводы проводом (W)"
                          active={tool === 'wire'}
                          onClick={() => onSetTool('wire')}
                        />
                      </RibbonPanel>

                      <RibbonPanel title="Правка">
                        {(onCopySelected || onPasteClipboard) && (
                          <RibbonStack>
                            <SmallRibbonBtn
                              icon={<Copy className="w-3.5 h-3.5" />}
                              label="Копир."
                              title="Копировать выделенные объекты (Ctrl+C)"
                              disabled={!hasSelection}
                              testId="toolbar-copy-btn"
                              onClick={() => onCopySelected?.()}
                            />
                            <SmallRibbonBtn
                              icon={<ClipboardPaste className="w-3.5 h-3.5" />}
                              label="Вставить"
                              title="Вставить скопированный фрагмент схемы с авто-ОУО (Ctrl+V)"
                              disabled={!hasClipboard}
                              testId="toolbar-paste-btn"
                              onClick={() => onPasteClipboard?.()}
                            />
                          </RibbonStack>
                        )}
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<RotateCw className="w-3.5 h-3.5" />}
                            label="Поворот"
                            title="Повернуть выбранные элементы на 90° (R)"
                            disabled={!hasSelection}
                            onClick={onRotateSelected}
                          />
                          <SmallRibbonBtn
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                            label="Удалить"
                            title="Удалить выбранные элементы (Del)"
                            danger
                            disabled={!hasSelection}
                            onClick={onDeleteSelected}
                          />
                        </RibbonStack>
                      </RibbonPanel>

                      <RibbonPanel title="База изделий">
                        <LargeRibbonBtn
                          icon={<Database className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="База изделий"
                          title="Открыть каталог изделий в левом окне"
                          onClick={onOpenCatalogTab}
                        />
                        <LargeRibbonBtn
                          icon={<Plus className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="+ Изделие"
                          title="Создать новое изделие с атрибутами в базе"
                          onClick={onOpenAddCatalogItem}
                        />
                      </RibbonPanel>

                      <RibbonPanel title="Проверка и ПЭ3" isLast>
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={
                              isBusy ? (
                                <Activity className="w-3.5 h-3.5 text-[var(--flux-accent)] animate-spin" />
                              ) : (
                                <CheckCircle2
                                  className={`w-3.5 h-3.5 ${
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
                          <SmallRibbonBtn
                            icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                            label="Спецификация"
                            title="Открыть панель спецификации ПЭ3 (ГОСТ 2.701)"
                            testId="toolbar-bom-btn"
                            onClick={onGenerateBom}
                          />
                        </RibbonStack>
                        <LargeRibbonBtn
                          icon={<Printer className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Отчёт ПЭ3"
                          title="Печатная форма и перечень элементов ГОСТ"
                          onClick={onOpenReportModal}
                        />
                      </RibbonPanel>
                    </>
                  )}

                  {activeTab === 'drafting' && (
                    <>
                      <RibbonPanel title="Графика и УГО">
                        <LargeRibbonBtn
                          icon={<Square className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Рамка"
                          title="Начертить пунктирный контур / зону шкафа на листе"
                          active={tool === 'rect'}
                          testId="tool-rect-btn"
                          onClick={() => onSetTool('rect')}
                        />
                        <LargeRibbonBtn
                          icon={<ArrowUpRight className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Выноска"
                          title="Поставить выноску со стрелкой на листе"
                          active={tool === 'callout'}
                          testId="tool-callout-btn"
                          onClick={() => onSetTool('callout')}
                        />
                        <LargeRibbonBtn
                          icon={<Type className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Текст"
                          title="Добавить текстовую надпись / примечание на лист"
                          active={tool === 'text'}
                          testId="tool-text-btn"
                          onClick={() => onSetTool('text')}
                        />
                        <LargeRibbonBtn
                          icon={<ArrowLeftRight className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Ссылка Л↔Л"
                          title="Поставить межлистовую ссылку потенциала (E3.series Off-Page Connector)"
                          active={tool === 'offpage'}
                          testId="tool-offpage-btn"
                          onClick={() => onSetTool('offpage')}
                        />
                        {onOpenSymbolDesigner && (
                          <LargeRibbonBtn
                            icon={<PenTool className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                            label="Редактор УГО"
                            title="Создать и нарисовать пользовательское УГО по сетке"
                            accent
                            testId="open-symbol-designer-btn"
                            onClick={onOpenSymbolDesigner}
                          />
                        )}
                      </RibbonPanel>

                      <RibbonPanel title="Трассировка">
                        <LargeRibbonBtn
                          icon={<Workflow className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Выровнять"
                          title="Выровнять соединительные линии без пересечения блоков"
                          onClick={onAutoRouteWires}
                        />
                      </RibbonPanel>

                      <RibbonPanel title="Сетка и Привязка" isLast>
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<Grid3X3 className="w-3.5 h-3.5" />}
                            label="Сетка"
                            title="Показать/скрыть чертёжную сетку"
                            active={vs.showGrid}
                            onClick={onToggleGrid}
                          />
                          <SmallRibbonBtn
                            icon={<Magnet className="w-3.5 h-3.5" />}
                            label="Привязка"
                            title="Магнитная привязка к сетке"
                            active={vs.snapToGrid}
                            onClick={onToggleSnapToGrid}
                          />
                        </RibbonStack>
                        {onToggleCrosshair && (
                          <LargeRibbonBtn
                            icon={<Crosshair className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                            label="Прицел"
                            title="Глобальное перекрестие курсора (Crosshair) для точного выравнивания"
                            active={vs.showCrosshair !== false}
                            testId="toolbar-crosshair-btn"
                            onClick={onToggleCrosshair}
                          />
                        )}
                        <div className="flex flex-col justify-center gap-1 px-1.5 h-[calc(50px*var(--flux-ui-scale))] shrink-0">
                          <span className="text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap">Шаг сетки</span>
                          <select
                            aria-label="Шаг чертёжной сетки"
                            value={vs.gridSize}
                            onChange={(e) => onChangeGridSize(Number(e.target.value))}
                            className="h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                          >
                            <option value={10}>10 мм</option>
                            <option value={20}>20 мм</option>
                            <option value={40}>40 мм</option>
                          </select>
                        </div>
                      </RibbonPanel>
                    </>
                  )}

                  {activeTab === 'annotations' && (
                    <>
                      {onInsertGostTable && (
                        <RibbonPanel title="Таблицы ГОСТ на лист">
                          <LargeRibbonBtn
                            icon={<Table2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                            label="Таблица ПЭ3"
                            title="Вставить автообновляемый перечень элементов ПЭ3 прямо на чертёж"
                            testId="insert-bom-table-btn"
                            onClick={() => onInsertGostTable('bom')}
                          />
                          <LargeRibbonBtn
                            icon={<FileSpreadsheet className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                            label="Каб. журнал"
                            title="Вставить автообновляемую таблицу кабельного журнала на лист"
                            testId="insert-cable-table-btn"
                            onClick={() => onInsertGostTable('cables')}
                          />
                        </RibbonPanel>
                      )}

                      <RibbonPanel title="Обозначения ГОСТ">
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<Tag className="w-3.5 h-3.5" />}
                            label="Выводы"
                            title="Показывать номера контактов"
                            active={vs.showPinNumbers}
                            onClick={onTogglePinNumbers}
                          />
                          <SmallRibbonBtn
                            icon={<Hash className="w-3.5 h-3.5" />}
                            label="Провода"
                            title="Показывать маркировку проводов"
                            active={vs.showWireNumbers}
                            onClick={onToggleWireNumbers}
                          />
                        </RibbonStack>
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<PanelsTopLeft className="w-3.5 h-3.5" />}
                            label="Ссылки"
                            title="Перекрёстные ссылки между листами"
                            active={vs.showCrossRefs}
                            onClick={onToggleCrossRefs}
                          />
                          <SmallRibbonBtn
                            icon={<Frame className="w-3.5 h-3.5" />}
                            label="Рамка ГОСТ"
                            active={vs.showGostFrame}
                            onClick={onToggleFrame}
                          />
                        </RibbonStack>
                      </RibbonPanel>

                      <RibbonPanel title="Толщины и Стиль" isLast>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-1 shrink-0">
                          <label className="flex items-center justify-between gap-1.5 text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap">
                            <span>Изделия</span>
                            <input
                              type="number"
                              data-testid="thickness-devices-input"
                              aria-label="Толщина линий изделий (px)"
                              step="0.25"
                              min="0.5"
                              max="6"
                              value={vs.symbolStrokeWidth}
                              onChange={(e) => {
                                const parsed = parseFiniteNum(e.target.value);
                                if (parsed === null) return;
                                onUpdateVisualSettings?.({ symbolStrokeWidth: Math.max(0.5, Math.min(6, parsed)) });
                              }}
                              className="h-[calc(22px*var(--flux-ui-scale))] w-14 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] text-right"
                            />
                          </label>
                          <label className="flex items-center justify-between gap-1.5 text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap">
                            <span>Цепи</span>
                            <input
                              type="number"
                              data-testid="thickness-wires-input"
                              aria-label="Толщина линий цепей (px)"
                              step="0.25"
                              min="0.5"
                              max="6"
                              value={vs.wireWidth}
                              onChange={(e) => {
                                const parsed = parseFiniteNum(e.target.value);
                                if (parsed === null) return;
                                onUpdateVisualSettings?.({ wireWidth: Math.max(0.5, Math.min(6, parsed)) });
                              }}
                              className="h-[calc(22px*var(--flux-ui-scale))] w-14 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] text-right"
                            />
                          </label>
                          <label className="flex items-center justify-between gap-1.5 text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap">
                            <span>Границы</span>
                            <input
                              type="number"
                              data-testid="thickness-frame-input"
                              aria-label="Толщина границ и рамки ГОСТ (px)"
                              step="0.2"
                              min="0.5"
                              max="6"
                              value={vs.frameStrokeWidth ?? 1.6}
                              onChange={(e) => {
                                const parsed = parseFiniteNum(e.target.value);
                                if (parsed === null) return;
                                onUpdateVisualSettings?.({ frameStrokeWidth: Math.max(0.5, Math.min(6, parsed)) });
                              }}
                              className="h-[calc(22px*var(--flux-ui-scale))] w-14 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] text-right"
                            />
                          </label>
                          <label className="flex items-center justify-between gap-1.5 text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap">
                            <span>Аннот.</span>
                            <input
                              type="number"
                              data-testid="thickness-annotations-input"
                              aria-label="Толщина линий аннотаций и зон (px)"
                              step="0.2"
                              min="0.5"
                              max="6"
                              value={vs.annotationStrokeWidth ?? 1.4}
                              onChange={(e) => {
                                const parsed = parseFiniteNum(e.target.value);
                                if (parsed === null) return;
                                onUpdateVisualSettings?.({ annotationStrokeWidth: Math.max(0.5, Math.min(6, parsed)) });
                              }}
                              className="h-[calc(22px*var(--flux-ui-scale))] w-14 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] text-right"
                            />
                          </label>
                        </div>
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<Spline className="w-3.5 h-3.5" />}
                            label="Мостики"
                            title="Отрисовка перемычек (дуг) на пересечении несвязанных цепей"
                            active={vs.wireCrossingBridge !== false}
                            testId="toggle-crossing-bridge-btn"
                            onClick={() =>
                              onUpdateVisualSettings?.({
                                wireCrossingBridge: !(vs.wireCrossingBridge !== false),
                              })
                            }
                          />
                          <SmallRibbonBtn
                            icon={<Palette className="w-3.5 h-3.5" />}
                            label="Все стили"
                            title="Подробные настройки графики и палитры"
                            onClick={onOpenVisualModal}
                          />
                        </RibbonStack>
                        <div className="flex flex-col justify-center gap-1 px-1.5 h-[calc(50px*var(--flux-ui-scale))] shrink-0">
                          <span className="text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap">Шрифт ГОСТ</span>
                          <select
                            aria-label="Шрифт аннотаций и таблиц"
                            value={vs.fontFamily || 'GOST'}
                            onChange={(e) => onUpdateFontFamily(e.target.value as SchematicFontFamily)}
                            className="h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] max-w-[calc(140px*var(--flux-ui-scale))]"
                          >
                            {SCHEMATIC_FONT_OPTIONS.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </RibbonPanel>
                    </>
                  )}

                  {activeTab === 'sheet' && (
                    <>
                      <RibbonPanel title="Листы схемы">
                        <div className="flex flex-col justify-center gap-1 px-1.5 h-[calc(50px*var(--flux-ui-scale))] shrink-0">
                          <span className="text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap">
                            Формат ({activeSheet?.format || '—'})
                          </span>
                          <select
                            aria-label="Формат активного листа"
                            disabled={!activeSheet}
                            value={activeSheet?.format || 'A3'}
                            onChange={(e) =>
                              activeSheet && onUpdateSheetFormat(activeSheet.id, e.target.value as SheetFormat)
                            }
                            className="h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] max-w-[calc(176px*var(--flux-ui-scale))] disabled:opacity-45"
                          >
                            {(Object.keys(SHEET_DIMENSIONS) as SheetFormat[]).map((fmt) => (
                              <option key={fmt} value={fmt}>
                                {SHEET_DIMENSIONS[fmt].label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <LargeRibbonBtn
                          icon={<FilePlus2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="+ Лист"
                          onClick={onAddSheet}
                        />
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<CopyPlus className="w-3.5 h-3.5" />}
                            label="Копия"
                            title="Дублировать текущий лист вместе с элементами"
                            disabled={!activeSheet}
                            onClick={() => activeSheet && onDuplicateSheet(activeSheet.id)}
                          />
                          <SmallRibbonBtn
                            icon={<FileX2 className="w-3.5 h-3.5" />}
                            label="Удал. лист"
                            title="Удалить текущий лист (если в проекте больше 1 листа)"
                            danger
                            disabled={!activeSheet || project.sheets.length <= 1}
                            onClick={() => activeSheet && onDeleteSheet(activeSheet.id)}
                          />
                        </RibbonStack>
                      </RibbonPanel>

                      <RibbonPanel title="Основная надпись">
                        <LargeRibbonBtn
                          icon={<Type className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Штамп ГОСТ"
                          title="Редактор основной надписи ГОСТ 2.104 (один лист / все листы)"
                          testId="toolbar-stamp-btn"
                          onClick={onOpenStampEditor}
                        />
                        <LargeRibbonBtn
                          icon={<LayoutTemplate className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Создать штамп"
                          title="Конструктор пользовательских шаблонов штампов"
                          testId="toolbar-stamp-designer-btn"
                          onClick={onOpenStampDesigner}
                        />
                      </RibbonPanel>

                      <RibbonPanel title="Автоматизация ФСА и XT" isLast>
                        <LargeRibbonBtn
                          icon={<Cpu className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Собрать ФСА"
                          title="Мастер автоматической сборки приточной/вытяжной схемы и внешки"
                          accent
                          onClick={onOpenHvacWizard}
                        />
                        {(onOpenTerminalEditor || onOpenAutoNumbering) && (
                          <RibbonStack>
                            {onOpenTerminalEditor && (
                              <SmallRibbonBtn
                                icon={<Tag className="w-3.5 h-3.5" />}
                                label="Клеммы XT"
                                title="Интерактивный редактор клеммных рядов (-XT): перемычки, резервы, лист"
                                testId="toolbar-terminal-editor-btn"
                                onClick={onOpenTerminalEditor}
                              />
                            )}
                            {onOpenAutoNumbering && (
                              <SmallRibbonBtn
                                icon={<Hash className="w-3.5 h-3.5" />}
                                label="Нумерация"
                                title="Пакетная автонумерация цепей и ОУО по ГОСТ 2.710"
                                testId="toolbar-autonumber-btn"
                                onClick={onOpenAutoNumbering}
                              />
                            )}
                          </RibbonStack>
                        )}
                      </RibbonPanel>
                    </>
                  )}

                  {activeTab === 'view' && (
                    <>
                      <RibbonPanel title="Окна листов в центре">
                        <LargeRibbonBtn
                          icon={<PanelLeft className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="1 лист"
                          title="Показывать один активный лист в центре"
                          active={viewportLayout === 'single'}
                          testId="viewport-mode-single"
                          onClick={() => onSetViewportLayout('single')}
                        />
                        <LargeRibbonBtn
                          icon={<Columns2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="2 листа"
                          title="Расположить 2 листа рядом в центре"
                          active={viewportLayout === 'two'}
                          testId="viewport-mode-two"
                          onClick={() => onSetViewportLayout('two')}
                        />
                        <LargeRibbonBtn
                          icon={<LayoutGrid className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="3 листа"
                          title="Расположить 3 листа одновременно"
                          active={viewportLayout === 'three'}
                          testId="viewport-mode-three"
                          onClick={() => onSetViewportLayout('three')}
                        />
                        <LargeRibbonBtn
                          icon={<Grid2X2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="4 листа"
                          title="Расположить 4 листа сеткой 2×2"
                          active={viewportLayout === 'four'}
                          testId="viewport-mode-four"
                          onClick={() => onSetViewportLayout('four')}
                        />
                      </RibbonPanel>

                      <RibbonPanel title="Навигация и Масштаб">
                        <LargeRibbonBtn
                          icon={<Maximize2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="По листу"
                          onClick={onFitView}
                        />
                        <LargeRibbonBtn
                          icon={<Hand className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Панорама"
                          title="Перемещение листа (H)"
                          active={tool === 'pan'}
                          onClick={() => onSetTool('pan')}
                        />
                        <div className="flex items-center gap-1 px-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onZoomChange(Math.max(0.18, Math.round((zoom - 0.1) * 100) / 100))}
                            aria-label="Уменьшить масштаб"
                            className="inline-flex items-center justify-center w-6 h-6 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] transition-colors"
                          >
                            <ZoomOut className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-10 text-center font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]">
                            {Math.round(zoom * 100)}%
                          </span>
                          <button
                            type="button"
                            onClick={() => onZoomChange(Math.min(2.5, Math.round((zoom + 0.15) * 100) / 100))}
                            aria-label="Увеличить масштаб"
                            className="inline-flex items-center justify-center w-6 h-6 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] transition-colors"
                          >
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </RibbonPanel>

                      <RibbonPanel title="Слои и Панели" isLast>
                        {onToggleLayerVisibility && onToggleLayerLock && (
                          <LargeRibbonBtn
                            icon={<Layers className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                            label={
                              layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0
                                ? `Слои (${layerSummary.visibleCount}/4)`
                                : 'Слои'
                            }
                            title="Управление видимостью и блокировкой слоёв чертежа"
                            testId="toolbar-layers-btn"
                            active={layersPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0}
                            onClick={(e) => toggleRibbonLayers(e.currentTarget)}
                          />
                        )}
                        <LargeRibbonBtn
                          icon={<RotateCcw className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Сброс окон"
                          title="Вернуть боковые и нижнюю панели в исходное положение"
                          testId="reset-dock-layout-btn"
                          onClick={onResetDockLayout}
                        />
                      </RibbonPanel>
                    </>
                  )}

                  {activeTab === 'flux' && (
                    <>
                      <RibbonPanel title="Среда Flux и Хост">
                        <LargeRibbonBtn
                          icon={<Send className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Во Flux Host"
                          title={
                            fluxHosted
                              ? 'Передать текущую модель и ПЭ3 в родительскую среду Flux'
                              : `Синхронизировать проект (${project.fluxProjectKey}) по шине Flux Studio`
                          }
                          testId="ribbon-flux-push-btn"
                          onClick={onPushToFluxHost}
                        />
                        <LargeRibbonBtn
                          icon={<RefreshCw className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Шина RPC и API"
                          title="Открыть шину вызовов модулей и контракт API внутри Flux Studio"
                          testId="ribbon-flux-bus-btn"
                          onClick={onOpenFluxBusConsole}
                        />
                      </RibbonPanel>

                      <RibbonPanel title="Мост и Студия Flux" isLast>
                        <LargeRibbonBtn
                          icon={<Share2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Мост (.json)"
                          title="Экспортировать пакет обмена flux-e3-bridge/v1 JSON"
                          onClick={onExportFluxBridge}
                        />
                        <LargeRibbonBtn
                          icon={<Layers className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Студия Flux"
                          title={`Настроить привязку ключа (${project.fluxProjectKey}), manifest.json и опубликовать подпрограмму`}
                          accent
                          testId="ribbon-flux-publish-btn"
                          onClick={onOpenFluxPublishModal}
                        />
                        <LargeRibbonBtn
                          icon={<Archive className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Пакет (.zip)"
                          title="Быстро скачать архив модуля Flux Studio (.zip)"
                          testId="ribbon-flux-zip-btn"
                          onClick={onDownloadFluxStudioZip}
                        />
                      </RibbonPanel>
                    </>
                  )}

                  {activeTab === 'export' && (
                    <>
                      <RibbonPanel title="Zuken E³.series">
                        <LargeRibbonBtn
                          icon={<Upload className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Открыть .e3s"
                          title="Открыть файл .e3s / .e3d / XML / JSON"
                          onClick={() => fileInputRef.current?.click()}
                        />
                        <LargeRibbonBtn
                          icon={<Share2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="В E³.series"
                          title={
                            e3BridgeHost
                              ? `Открыть напрямую в E³.series (${e3BridgeHost})`
                              : 'Перенести проект в E³.series 2022'
                          }
                          onClick={onDirectOpenE3}
                        />
                        <LargeRibbonBtn
                          icon={<FolderOpen className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Обмен E3"
                          title="Центр обмена E3.series и импорт пакетов"
                          onClick={onOpenExchangeModal}
                        />
                      </RibbonPanel>

                      <RibbonPanel title="Документация и Таблицы">
                        <LargeRibbonBtn
                          icon={<FileCode2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Пакет PDF/DXF"
                          title="Пакетная публикация листов в редактируемый AutoCAD (.dxf) и PDF"
                          accent
                          testId="toolbar-publish-btn"
                          onClick={onOpenPublishModal}
                        />
                        <LargeRibbonBtn
                          icon={<FileCode2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Лист DXF"
                          title="Экспорт активного листа в AutoCAD (.dxf)"
                          onClick={onExportDxf}
                        />
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                            label="Список ПЭ3 (CSV)"
                            title="Выгрузить спецификацию ПЭ3 в CSV для Excel"
                            onClick={onDownloadBomCsv}
                          />
                          <SmallRibbonBtn
                            icon={<Download className="w-3.5 h-3.5" />}
                            label="Каб. журнал (CSV)"
                            title="Выгрузить кабельный журнал в CSV"
                            onClick={onDownloadCablesCsv}
                          />
                        </RibbonStack>
                      </RibbonPanel>

                      <RibbonPanel title="Дистрибутив" isLast>
                        <LargeRibbonBtn
                          icon={<Package className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Portable (.zip)"
                          title="Сборка автономной Windows Portable (.zip)"
                          onClick={onOpenPortableBuild}
                        />
                        <LargeRibbonBtn
                          icon={<Archive className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Исходники (.zip)"
                          title="Скачать полный архив исходного кода проекта (.zip)"
                          onClick={onDownloadCodebase}
                        />
                      </RibbonPanel>
                    </>
                  )}

                  {activeTab === 'ugo_editor' && symbolWorkspace && (
                    <>
                      <RibbonPanel title="Рисование УГО и Выводы">
                        <LargeRibbonBtn
                          icon={<MousePointer2 className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Выбор"
                          title="Выделение и редактирование примитивов / выводов"
                          active={symbolWorkspace.draft.tool === 'select'}
                          testId="ugo-tool-select"
                          onClick={() => symbolWorkspace.onSetTool('select')}
                        />
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<Minus className="w-3.5 h-3.5" />}
                            label="Линия"
                            title="Отрезок по 2 точкам"
                            active={symbolWorkspace.draft.tool === 'line'}
                            testId="ugo-tool-line"
                            onClick={() => symbolWorkspace.onSetTool('line')}
                          />
                          <SmallRibbonBtn
                            icon={<Spline className="w-3.5 h-3.5" />}
                            label="Полилиния"
                            title="Ломаная или замкнутый контур (двойной клик или Enter завершает)"
                            active={symbolWorkspace.draft.tool === 'polyline'}
                            testId="ugo-tool-polyline"
                            onClick={() => symbolWorkspace.onSetTool('polyline')}
                          />
                        </RibbonStack>
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<Square className="w-3.5 h-3.5" />}
                            label="Прямоуг."
                            title="Прямоугольный контур / корпус"
                            active={symbolWorkspace.draft.tool === 'rect'}
                            testId="ugo-tool-rect"
                            onClick={() => symbolWorkspace.onSetTool('rect')}
                          />
                          <SmallRibbonBtn
                            icon={<Circle className="w-3.5 h-3.5" />}
                            label="Круг"
                            title="Окружность от центра"
                            active={symbolWorkspace.draft.tool === 'circle'}
                            testId="ugo-tool-circle"
                            onClick={() => symbolWorkspace.onSetTool('circle')}
                          />
                        </RibbonStack>
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<Activity className="w-3.5 h-3.5" />}
                            label="Дуга"
                            title="Дуга по центру и радиусу"
                            active={symbolWorkspace.draft.tool === 'arc'}
                            testId="ugo-tool-arc"
                            onClick={() => symbolWorkspace.onSetTool('arc')}
                          />
                          <SmallRibbonBtn
                            icon={<Type className="w-3.5 h-3.5" />}
                            label="Текст"
                            title="Статический текст на УГО"
                            active={symbolWorkspace.draft.tool === 'text'}
                            testId="ugo-tool-text"
                            onClick={() => symbolWorkspace.onSetTool('text')}
                          />
                        </RibbonStack>
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<Tag className="w-3.5 h-3.5" />}
                            label="Тег атр."
                            title="Динамическая метка атрибута ({designation}, {article} и др.)"
                            active={symbolWorkspace.draft.tool === 'attr_tag'}
                            testId="ugo-tool-attr"
                            onClick={() => symbolWorkspace.onSetTool('attr_tag')}
                          />
                          <SmallRibbonBtn
                            icon={<Plus className="w-3.5 h-3.5" />}
                            label="+ Вывод"
                            title="Добавить электрический/сигнальный вывод E3 (Pin)"
                            active={symbolWorkspace.draft.tool === 'pin'}
                            testId="ugo-tool-pin"
                            onClick={() => symbolWorkspace.onSetTool('pin')}
                          />
                        </RibbonStack>
                      </RibbonPanel>

                      <RibbonPanel title="Стиль, Толщина и Линии">
                        <div className="flex flex-col justify-center h-[calc(50px*var(--flux-ui-scale))] gap-1 px-0.5 shrink-0">
                          <div className="flex items-center gap-1 h-[calc(22px*var(--flux-ui-scale))]">
                            {SYMBOL_COLOR_PALETTE.slice(0, 6).map((c) => {
                              const activeColor =
                                symbolWorkspace.draft.activeStyle.strokeColor.toLowerCase() ===
                                c.hex.toLowerCase();
                              return (
                                <button
                                  key={c.hex}
                                  type="button"
                                  title={c.label}
                                  aria-label={`Цвет линии ${c.label}`}
                                  onClick={() => symbolWorkspace.onUpdateStyle({ strokeColor: c.hex })}
                                  className={`w-4 h-4 rounded-[2px] border transition-transform ${
                                    activeColor
                                      ? 'border-[var(--flux-accent)] scale-110 ring-1 ring-[var(--flux-accent)]'
                                      : 'border-[var(--flux-line-strong)] hover:scale-105'
                                  }`}
                                  style={{ backgroundColor: c.hex }}
                                />
                              );
                            })}
                            <input
                              type="color"
                              aria-label="Произвольный цвет линии"
                              value={symbolWorkspace.draft.activeStyle.strokeColor}
                              onChange={(e) =>
                                symbolWorkspace.onUpdateStyle({ strokeColor: e.target.value })
                              }
                              className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] p-0 border border-[var(--flux-line)] rounded-[2px] bg-transparent cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                symbolWorkspace.onUpdateStyle({
                                  filled: !symbolWorkspace.draft.activeStyle.filled,
                                })
                              }
                              title="Включить/выключить заливку фигур"
                              className={`h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors ${
                                symbolWorkspace.draft.activeStyle.filled
                                  ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)] text-[var(--flux-text)]'
                                  : 'border-[var(--flux-line)] text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)]'
                              }`}
                            >
                              Заливка
                            </button>
                          </div>
                          <div className="flex items-center gap-1.5 h-[calc(22px*var(--flux-ui-scale))]">
                            <select
                              aria-label="Толщина линии примитива"
                              value={symbolWorkspace.draft.activeStyle.strokeWidth}
                              onChange={(e) => {
                                const parsed = parseFiniteNum(e.target.value);
                                if (parsed !== null) {
                                  symbolWorkspace.onUpdateStyle({ strokeWidth: parsed });
                                }
                              }}
                              className="h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                            >
                              <option value={1}>1.0 мм</option>
                              <option value={1.4}>1.4 мм</option>
                              <option value={1.8}>1.8 мм</option>
                              <option value={2.2}>2.2 мм</option>
                              <option value={3}>3.0 мм</option>
                              <option value={4}>4.0 мм</option>
                            </select>
                            <select
                              aria-label="Тип линии примитива"
                              value={symbolWorkspace.draft.activeStyle.strokeStyle}
                              onChange={(e) =>
                                symbolWorkspace.onUpdateStyle({
                                  strokeStyle: e.target.value as CustomSymbolStrokeStyle,
                                })
                              }
                              className="h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] max-w-[calc(114px*var(--flux-ui-scale))]"
                            >
                              {STROKE_STYLE_OPTIONS.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </RibbonPanel>

                      <RibbonPanel title="Сетка и Геометрия">
                        <div className="flex flex-col justify-center h-[calc(50px*var(--flux-ui-scale))] gap-1 shrink-0">
                          <select
                            aria-label="Шаг сетки редактора УГО"
                            value={symbolWorkspace.draft.gridStep}
                            onChange={(e) => symbolWorkspace.onSetGridStep(Number(e.target.value))}
                            className="h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                          >
                            <option value={5}>Шаг 5 мм</option>
                            <option value={10}>Шаг 10 мм</option>
                            <option value={20}>Шаг 20 мм</option>
                          </select>
                          <SmallRibbonBtn
                            icon={<Magnet className="w-3.5 h-3.5" />}
                            label="Привязка"
                            active={symbolWorkspace.draft.snapToGrid}
                            onClick={symbolWorkspace.onToggleSnap}
                          />
                        </div>
                        <LargeRibbonBtn
                          icon={<RotateCw className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Поворот 90°"
                          title="Повернуть всю графику и выводы блока на 90°"
                          onClick={symbolWorkspace.onRotateBlockCW}
                        />
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<FlipHorizontal2 className="w-3.5 h-3.5" />}
                            label="Отр. X"
                            title="Отразить блок по горизонтали"
                            onClick={symbolWorkspace.onMirrorBlockX}
                          />
                          <SmallRibbonBtn
                            icon={<FlipVertical2 className="w-3.5 h-3.5" />}
                            label="Отр. Y"
                            title="Отразить блок по вертикали"
                            onClick={symbolWorkspace.onMirrorBlockY}
                          />
                        </RibbonStack>
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<Copy className="w-3.5 h-3.5" />}
                            label="Дубль"
                            title="Дублировать выбранный примитив"
                            disabled={!symbolWorkspace.draft.selectedShapeId}
                            onClick={symbolWorkspace.onDuplicateSelectedShape}
                          />
                          <SmallRibbonBtn
                            icon={<Trash2 className="w-3.5 h-3.5" />}
                            label="Удалить"
                            title="Удалить выбранный примитив или вывод (Del)"
                            danger
                            disabled={
                              !symbolWorkspace.draft.selectedShapeId &&
                              symbolWorkspace.draft.selectedPinIndex === null
                            }
                            onClick={symbolWorkspace.onDeleteSelection}
                          />
                        </RibbonStack>
                      </RibbonPanel>

                      <RibbonPanel title="Заготовки и Шаблоны характеристик">
                        <div className="flex flex-col justify-center h-[calc(50px*var(--flux-ui-scale))] gap-1 shrink-0">
                          <div className="flex items-center gap-1 h-[calc(22px*var(--flux-ui-scale))]">
                            <Layers className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />
                            <select
                              aria-label="Быстрая заготовка графики УГО"
                              value=""
                              onChange={(e) => {
                                const val = e.target.value as
                                  | 'blank_box'
                                  | 'sensor_circle'
                                  | 'breaker_1p'
                                  | 'coil_relay'
                                  | '';
                                if (val) symbolWorkspace.onApplyPresetShapes(val);
                              }}
                              className="h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] w-[calc(144px*var(--flux-ui-scale))]"
                            >
                              <option value="">+ Графика УГО…</option>
                              <option value="blank_box">Корпус с тегами</option>
                              <option value="sensor_circle">Круг КИП / Датчик</option>
                              <option value="breaker_1p">Автомат 1P (QF)</option>
                              <option value="coil_relay">Катушка реле (KA)</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1 h-[calc(22px*var(--flux-ui-scale))]">
                            <Sparkles className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                            <select
                              aria-label="Применить шаблон характеристик изделия"
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  symbolWorkspace.onApplyAttributeTemplate(e.target.value);
                                }
                              }}
                              className="h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] w-[calc(144px*var(--flux-ui-scale))]"
                            >
                              <option value="">+ Атрибуты E3…</option>
                              {ATTRIBUTE_TEMPLATE_PRESETS.map((preset) => (
                                <option key={preset.id} value={preset.id}>
                                  {preset.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </RibbonPanel>

                      <RibbonPanel title="Сохранение и Выход" isLast>
                        <LargeRibbonBtn
                          icon={<Check className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="Сохранить"
                          title="Сохранить УГО и изделие в базу (совместимо с E3.series)"
                          accent
                          testId="ugo-ribbon-save-btn"
                          onClick={symbolWorkspace.onSaveCurrent}
                        />
                        <LargeRibbonBtn
                          icon={<Send className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]" />}
                          label="На схему"
                          title="Сохранить блок и разместить изделие на активном листе схемы"
                          testId="ugo-ribbon-place-btn"
                          onClick={symbolWorkspace.onPlaceOnActiveSheet}
                        />
                        <RibbonStack>
                          <SmallRibbonBtn
                            icon={<FilePlus2 className="w-3.5 h-3.5" />}
                            label="+ Новое УГО"
                            title="Создать пустое УГО с нуля"
                            onClick={symbolWorkspace.onCreateNewBlankSymbol}
                          />
                          <SmallRibbonBtn
                            icon={<X className="w-3.5 h-3.5" />}
                            label="Закрыть УГО"
                            title="Выйти из редактора блока и вернуться на лист схемы"
                            testId="ugo-ribbon-close-btn"
                            onClick={symbolWorkspace.onCloseWorkspace}
                          />
                        </RibbonStack>
                      </RibbonPanel>
                    </>
                  )}
                </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unclipped Ribbon Layer Manager Popover */}
      <div
        className="absolute top-full z-50"
        style={layersPopoverLeft !== null ? { left: layersPopoverLeft } : { right: 12 }}
      >
        {onToggleLayerVisibility && onToggleLayerLock && (
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
        )}
      </div>
    </header>
  );
});
TopToolbar.displayName = 'TopToolbar';
