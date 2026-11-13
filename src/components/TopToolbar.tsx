import React, { useState } from 'react';
import {
  Activity,
  Archive,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns2,
  CopyPlus,
  Database,
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
  LayoutGrid,
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
  Share2,
  Spline,
  Square,
  Sun,
  Tag,
  Trash2,
  Type,
  Undo2,
  Upload,
  Wand2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { SCHEMATIC_FONT_OPTIONS, SHEET_DIMENSIONS } from '../core/e3Catalog';
import type { ViewportLayoutMode } from '../core/dockLayout';
import type {
  CadTool,
  E3Project,
  E3Sheet,
  SchematicFontFamily,
  SheetFormat,
} from '../core/e3Types';

export type { CadTool };
export type RibbonSectionId = 'home' | 'drafting' | 'annotations' | 'sheet' | 'view' | 'export';

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
  isSyncConnected: boolean;
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
  onOpenAddCatalogItem: () => void;
  onOpenCatalogTab: () => void;
  onAddSheet: () => void;
  onExportDxf: () => void;
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
  onClick: () => void;
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
  isSyncConnected,
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
  onOpenAddCatalogItem,
  onOpenCatalogTab,
  onAddSheet,
  onExportDxf,
}) => {
  const isDark = project.visualSettings.theme === 'dark';
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<RibbonSectionId>('home');
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false);

  const vs = project.visualSettings;

  return (
    <header className="no-print shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] select-none">
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

      {/* Row 1: Quick Access Toolbar + Project Title + Primary CTA */}
      <div className="flex items-center justify-between gap-4 px-3 h-8 border-b border-[var(--flux-line)]">
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1.5 pr-2.5 mr-0.5 border-r border-[var(--flux-line)] whitespace-nowrap shrink-0">
            <svg
              width="17"
              height="17"
              viewBox="0 0 18 18"
              fill="none"
              aria-hidden="true"
              className="shrink-0"
            >
              <rect
                x="1.5"
                y="1.5"
                width="15"
                height="15"
                rx="2.5"
                stroke="var(--flux-accent)"
                strokeWidth="1.5"
              />
              <path
                d="M4.5 9h3.5l2-3.5 2 7 1.5-3.5H13.5"
                stroke="var(--flux-accent)"
                strokeWidth="1.5"
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
              <circle cx="4.5" cy="9" r="1.1" fill="var(--flux-text)" />
              <circle cx="13.5" cy="9" r="1.1" fill="var(--flux-text)" />
            </svg>
            <span
              className="font-semibold text-[13px] tracking-tight text-[var(--flux-text)] whitespace-nowrap"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              E3ProMax
            </span>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Открыть файл .e3s / .e3d / XML / JSON"
            aria-label="Открыть файл .e3s"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            <Upload className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
          </button>

          <button
            type="button"
            onClick={onDirectOpenE3}
            title={
              e3BridgeHost
                ? `Открыть напрямую в E³.series (${e3BridgeHost})`
                : 'Перенести проект напрямую в E³.series 2022'
            }
            aria-label="В E3.series"
            className="relative inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            <Share2 className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            {e3BridgeHost && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 absolute top-0.5 right-0.5" />
            )}
          </button>

          <span className="h-3.5 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            aria-label="Отменить действие"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors shrink-0"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            title="Повторить (Ctrl+Y)"
            aria-label="Повторить действие"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors shrink-0"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-medium text-[var(--flux-text)] truncate max-w-[360px]">
            {project.name}
          </span>
          <span className="hidden xl:inline text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
            {project.projectCode} · Rev {project.revision}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            className="hidden lg:flex items-center gap-1.5 text-[11px] text-[var(--flux-text-muted)] whitespace-nowrap shrink-0"
            title="Синхронизация изменений в реальном времени (SSE)"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSyncConnected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>{isSyncConnected ? 'Синхр. онлайн' : 'Офлайн'}</span>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
            title={isDark ? 'Светлая тема' : 'Тёмная тема'}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setRibbonCollapsed((c) => !c)}
            aria-label={ribbonCollapsed ? 'Развернуть ленту команд' : 'Свернуть ленту команд'}
            title={ribbonCollapsed ? 'Развернуть ленту' : 'Свернуть ленту'}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            {ribbonCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onGenerateBom}
            className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded text-[11px] font-medium text-white bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Спецификация ПЭ3</span>
          </button>
        </div>
      </div>

      {/* Row 2: AutoCAD Section Tabs */}
      <div className="flex items-center justify-between px-3 h-7 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]">
        <div role="tablist" aria-label="Разделы ленты инструментов" className="flex items-end gap-1 h-full pt-0.5 overflow-x-auto no-scrollbar">
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
                  <span
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

      {/* Row 3: AutoCAD Ribbon Panels with Large Clear Icons & Short Labels */}
      {!ribbonCollapsed && (
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
                          ercErrorCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      />
                    )
                  }
                  label={`ERC (${ercErrorCount})`}
                  title="Проверка электрических правил схемы (ERC)"
                  onClick={onRunErc}
                />
                <LargeRibbonBtn
                  icon={<Printer className="w-5 h-5" />}
                  label="Отчёт ПЭ3"
                  title="Печатная форма и перечень элементов ГОСТ"
                  onClick={onOpenReportModal}
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

              <RibbonPanel title="Обозначения на схеме">
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
                  label="Штамп ГОСТ"
                  active={vs.showGostFrame}
                  onClick={onToggleFrame}
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

              <RibbonPanel title="Оформление">
                <LargeRibbonBtn
                  icon={<Frame className="w-5 h-5" />}
                  label="Штамп ГОСТ"
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

              <RibbonPanel title="Документация">
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
                  icon={<FileCode2 className="w-5 h-5" />}
                  label="Чертеж DXF"
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
      )}
    </header>
  );
};
