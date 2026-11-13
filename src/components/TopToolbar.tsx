import React, { useState } from 'react';
import {
  Activity,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FileCode2,
  FilePlus2,
  FileSpreadsheet,
  FolderOpen,
  Grid3X3,
  Hand,
  Moon,
  MousePointer2,
  Package,
  Palette,
  Plus,
  Printer,
  Redo2,
  RotateCw,
  Share2,
  Spline,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  Workflow,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { E3Project } from '../core/e3Types';

export type CadTool = 'select' | 'wire' | 'pan';
export type RibbonSectionId = 'home' | 'hvac' | 'view' | 'export';

interface TopToolbarProps {
  project: E3Project;
  tool: CadTool;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  ercErrorCount: number;
  isSyncConnected: boolean;
  isBusy: boolean;
  e3BridgeHost: string | null;
  onSetTool: (tool: CadTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRotateSelected: () => void;
  onDeleteSelected: () => void;
  onZoomChange: (nextZoom: number) => void;
  onFitView: () => void;
  onToggleGrid: () => void;
  onToggleFrame: () => void;
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
  { id: 'hvac', label: 'Схема и ФСА' },
  { id: 'view', label: 'Вид' },
  { id: 'export', label: 'E³.series и Экспорт' },
];

const RibbonPanel: React.FC<{ title: string; isLast?: boolean; children: React.ReactNode }> = ({
  title,
  isLast = false,
  children,
}) => (
  <div
    className={`flex flex-col justify-between h-full px-3 py-1 shrink-0 ${
      isLast ? '' : 'border-r border-[var(--flux-line)]'
    }`}
  >
    <div className="flex-1 flex items-center gap-1 min-h-0">{children}</div>
    <div className="text-[10px] leading-none text-center text-[var(--flux-text-muted)] tracking-wide pt-1 select-none whitespace-nowrap">
      {title}
    </div>
  </div>
);

export const TopToolbar: React.FC<TopToolbarProps> = ({
  project,
  tool,
  zoom,
  canUndo,
  canRedo,
  hasSelection,
  ercErrorCount,
  isSyncConnected,
  isBusy,
  e3BridgeHost,
  onSetTool,
  onUndo,
  onRedo,
  onRotateSelected,
  onDeleteSelected,
  onZoomChange,
  onFitView,
  onToggleGrid,
  onToggleFrame,
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

  const btnBase =
    'inline-flex items-center gap-1.5 h-7 px-2 rounded text-[12px] font-medium transition-colors whitespace-nowrap shrink-0';
  const btnGhost = `${btnBase} text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35`;
  const btnOutline = `${btnBase} border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35`;
  const btnActive = `${btnBase} bg-[var(--flux-sel)] border border-[var(--flux-accent)]/40 text-[var(--flux-text)]`;

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

      {/* Row 1: AutoCAD-style Quick Access Toolbar + Project Title + Status */}
      <div className="flex items-center justify-between gap-4 px-3 h-9 border-b border-[var(--flux-line)]">
        {/* Left: App Brand + Quick Access Toolbar (QAT) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className="font-semibold text-[14px] tracking-tight text-[var(--flux-text)] whitespace-nowrap shrink-0 pr-2 border-r border-[var(--flux-line)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            E3ProMax
          </span>

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
            onClick={onDirectOpenE3}
            title={
              e3BridgeHost
                ? `Открыть напрямую в E³.series (${e3BridgeHost})`
                : 'Перенести проект напрямую в E³.series 2022'
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

        {/* Center: Active Project & Revision */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-medium text-[var(--flux-text)] truncate max-w-[360px]">
            {project.name}
          </span>
          <span className="hidden xl:inline text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
            {project.projectCode} · Rev {project.revision}
          </span>
        </div>

        {/* Right: Sync Status + Theme + Collapse + Primary CTA */}
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
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setRibbonCollapsed((c) => !c)}
            aria-label={ribbonCollapsed ? 'Развернуть ленту команд' : 'Свернуть ленту команд'}
            title={ribbonCollapsed ? 'Развернуть ленту' : 'Свернуть ленту'}
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            {ribbonCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onGenerateBom}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded text-[12px] font-medium text-white bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Спецификация 1 клик</span>
          </button>
        </div>
      </div>

      {/* Row 2: AutoCAD Section Tabs */}
      <div className="flex items-center justify-between px-3 h-8 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]">
        <div role="tablist" aria-label="Разделы ленты инструментов" className="flex items-end gap-1 h-full pt-1">
          {RIBBON_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (ribbonCollapsed) setRibbonCollapsed(false);
                }}
                className={`h-full px-3.5 text-[12px] font-medium rounded-t border-x border-t transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[var(--flux-bg)] border-[var(--flux-line)] text-[var(--flux-text)] border-b-transparent -mb-px pb-px font-semibold'
                    : 'bg-transparent border-transparent text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-2 text-[11px] text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
          <span className="font-mono tabular-nums">
            {project.sheets.length} л. · {project.devices.length} изд. · {project.wires.length} цеп.
          </span>
        </div>
      </div>

      {/* Row 3: AutoCAD Named Panels */}
      {!ribbonCollapsed && (
        <div className="flex items-stretch h-[66px] px-2 bg-[var(--flux-bg)] overflow-x-auto">
          {activeTab === 'home' && (
            <>
              <RibbonPanel title="Инструменты">
                <button
                  type="button"
                  onClick={() => onSetTool('select')}
                  className={tool === 'select' ? btnActive : btnGhost}
                >
                  <MousePointer2 className="w-3.5 h-3.5" />
                  <span>Выбор (V)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetTool('wire')}
                  className={tool === 'wire' ? btnActive : btnGhost}
                >
                  <Spline className="w-3.5 h-3.5" />
                  <span>Провод (W)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetTool('pan')}
                  className={tool === 'pan' ? btnActive : btnGhost}
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Панорама (H)</span>
                </button>
              </RibbonPanel>

              <RibbonPanel title="Правка">
                <button
                  type="button"
                  onClick={onRotateSelected}
                  disabled={!hasSelection}
                  title="Повернуть выбранный элемент на 90° (R)"
                  className={btnOutline}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>90°</span>
                </button>
                <button
                  type="button"
                  onClick={onDeleteSelected}
                  disabled={!hasSelection}
                  title="Удалить выбранный элемент (Del)"
                  aria-label="Удалить выбранный элемент"
                  className="inline-flex items-center justify-center w-7 h-7 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-rose-600 dark:text-rose-400 hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </RibbonPanel>

              <RibbonPanel title="ФСА и База изделий">
                <button
                  type="button"
                  onClick={onOpenHvacWizard}
                  title="Мастер сборки ФСА и Схемы внешних соединений"
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-[var(--flux-accent)] bg-[var(--flux-accent-soft)] text-[12px] font-medium text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors whitespace-nowrap shrink-0"
                >
                  <Wand2 className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Собрать ФСА</span>
                </button>
                <button
                  type="button"
                  onClick={onAutoRouteWires}
                  title="Выровнять линии на активном листе без пересечения блоков"
                  className={btnOutline}
                >
                  <Workflow className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Выровнять линии</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAddCatalogItem}
                  title="Создать новое изделие с атрибутами в базе"
                  className={btnOutline}
                >
                  <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>+ Изделие</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenCatalogTab}
                  title="Открыть базу изделий слева"
                  className={btnGhost}
                >
                  <Database className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  <span>База</span>
                </button>
              </RibbonPanel>

              <RibbonPanel title="Вид листа">
                <button type="button" onClick={onFitView} className={btnOutline}>
                  <span>По листу</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleGrid}
                  className={project.visualSettings.showGrid ? btnActive : btnGhost}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  <span>Сетка {project.visualSettings.gridSize}</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleFrame}
                  className={project.visualSettings.showGostFrame ? btnActive : btnGhost}
                >
                  <span>ГОСТ 2.104</span>
                </button>
                <div className="flex items-center gap-0.5 pl-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.max(0.18, Math.round((zoom - 0.1) * 100) / 100))}
                    aria-label="Уменьшить масштаб"
                    className="inline-flex items-center justify-center w-6 h-7 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-10 text-center font-mono tabular-nums text-[11px] text-[var(--flux-text)]">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.min(2.5, Math.round((zoom + 0.15) * 100) / 100))}
                    aria-label="Увеличить масштаб"
                    className="inline-flex items-center justify-center w-6 h-7 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </RibbonPanel>

              <RibbonPanel title="Контроль и Документация" isLast>
                <button type="button" onClick={onRunErc} className={btnOutline}>
                  {isBusy ? (
                    <Activity className="w-3.5 h-3.5 text-[var(--flux-accent)] animate-spin" />
                  ) : (
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${
                        ercErrorCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    />
                  )}
                  <span>ERC ({ercErrorCount})</span>
                </button>
                <button type="button" onClick={onOpenReportModal} className={btnGhost}>
                  <Printer className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  <span>Отчёт ПЭ3</span>
                </button>
              </RibbonPanel>
            </>
          )}

          {activeTab === 'hvac' && (
            <>
              <RibbonPanel title="Автоматизация ОВКВ (ФСА)">
                <button
                  type="button"
                  onClick={onOpenHvacWizard}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded border border-[var(--flux-accent)] bg-[var(--flux-accent-soft)] text-[12px] font-medium text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors whitespace-nowrap shrink-0"
                >
                  <Wand2 className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Собрать ФСА</span>
                </button>
                <button type="button" onClick={onAutoRouteWires} className={btnOutline}>
                  <Workflow className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Выровнять линии</span>
                </button>
              </RibbonPanel>

              <RibbonPanel title="Изделия и Атрибуты">
                <button type="button" onClick={onOpenAddCatalogItem} className={btnOutline}>
                  <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>+ Изделие</span>
                </button>
                <button type="button" onClick={onOpenCatalogTab} className={btnOutline}>
                  <Database className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>База изделий</span>
                </button>
              </RibbonPanel>

              <RibbonPanel title="Цепи и Листы" isLast>
                <button type="button" onClick={onAddSheet} className={btnOutline}>
                  <FilePlus2 className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>+ Лист</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetTool('wire')}
                  className={tool === 'wire' ? btnActive : btnOutline}
                >
                  <Spline className="w-3.5 h-3.5" />
                  <span>Провод (W)</span>
                </button>
                <button
                  type="button"
                  onClick={onRotateSelected}
                  disabled={!hasSelection}
                  className={btnOutline}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>90°</span>
                </button>
                <button
                  type="button"
                  onClick={onDeleteSelected}
                  disabled={!hasSelection}
                  className="inline-flex items-center gap-1 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-rose-600 dark:text-rose-400 hover:bg-[var(--flux-hover)] disabled:opacity-35 text-[12px] font-medium whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить</span>
                </button>
              </RibbonPanel>
            </>
          )}

          {activeTab === 'view' && (
            <>
              <RibbonPanel title="Навигация и Масштаб">
                <button type="button" onClick={onFitView} className={btnOutline}>
                  <span>По листу</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetTool('pan')}
                  className={tool === 'pan' ? btnActive : btnOutline}
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Панорама (H)</span>
                </button>
                <div className="flex items-center gap-1 pl-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.max(0.18, Math.round((zoom - 0.1) * 100) / 100))}
                    aria-label="Уменьшить масштаб"
                    className={btnOutline}
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-11 text-center font-mono tabular-nums text-[12px] text-[var(--flux-text)]">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => onZoomChange(Math.min(2.5, Math.round((zoom + 0.15) * 100) / 100))}
                    aria-label="Увеличить масштаб"
                    className={btnOutline}
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </RibbonPanel>

              <RibbonPanel title="Чертёжная сетка и ГОСТ">
                <button
                  type="button"
                  onClick={onToggleGrid}
                  className={project.visualSettings.showGrid ? btnActive : btnOutline}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  <span>Сетка {project.visualSettings.gridSize}</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleFrame}
                  className={project.visualSettings.showGostFrame ? btnActive : btnOutline}
                >
                  <span>ГОСТ 2.104</span>
                </button>
              </RibbonPanel>

              <RibbonPanel title="Оформление и Шрифты" isLast>
                <button type="button" onClick={onOpenVisualModal} className={btnOutline}>
                  <Palette className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Графика и шрифты</span>
                </button>
                <button type="button" onClick={onToggleTheme} className={btnOutline}>
                  {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  <span>{isDark ? 'Светлая тема' : 'Тёмная тема'}</span>
                </button>
              </RibbonPanel>
            </>
          )}

          {activeTab === 'export' && (
            <>
              <RibbonPanel title="Интеграция Zuken E³.series">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={btnOutline}
                >
                  <Upload className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Открыть .e3s</span>
                </button>
                <button type="button" onClick={onDirectOpenE3} className={btnOutline}>
                  <Share2 className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>В E³.series</span>
                  {e3BridgeHost && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                </button>
                <button type="button" onClick={onOpenExchangeModal} className={btnOutline}>
                  <FolderOpen className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  <span>Обмен E3</span>
                </button>
              </RibbonPanel>

              <RibbonPanel title="Выпуск документации">
                <button type="button" onClick={onGenerateBom} className={btnOutline}>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Спецификация ПЭ3</span>
                </button>
                <button type="button" onClick={onOpenReportModal} className={btnOutline}>
                  <Printer className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  <span>Отчёт ПЭ3</span>
                </button>
                <button type="button" onClick={onExportDxf} className={btnOutline}>
                  <FileCode2 className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  <span>Чертёж DXF</span>
                </button>
              </RibbonPanel>

              <RibbonPanel title="Сборка и Исходники" isLast>
                <button
                  type="button"
                  onClick={onOpenPortableBuild}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] text-[12px] font-medium text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors whitespace-nowrap shrink-0"
                >
                  <Package className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Скачать Portable</span>
                </button>
                <button type="button" onClick={onDownloadCodebase} className={btnOutline}>
                  <Archive className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  <span>Код (.zip)</span>
                </button>
              </RibbonPanel>
            </>
          )}
        </div>
      )}
    </header>
  );
};
