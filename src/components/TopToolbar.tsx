import React from 'react';
import {
  Activity,
  Archive,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Grid3X3,
  Hand,
  Moon,
  MousePointer2,
  Palette,
  Printer,
  Redo2,
  RotateCw,
  Spline,
  Sun,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { E3Project } from '../core/e3Types';

export type CadTool = 'select' | 'wire' | 'pan';

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
  onOpenExchangeModal: () => void;
  onOpenVisualModal: () => void;
  onOpenReportModal: () => void;
  onToggleTheme: () => void;
  onDownloadCodebase: () => void;
}

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
  onOpenExchangeModal,
  onOpenVisualModal,
  onOpenReportModal,
  onToggleTheme,
  onDownloadCodebase,
}) => {
  const isDark = project.visualSettings.theme === 'dark';

  return (
    <header className="no-print shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] select-none">
      {/* Row 1: Flux 3-zone header bar */}
      <div className="flex items-center justify-between gap-6 px-4 h-11 border-b border-[var(--flux-line)]">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="font-semibold text-[15px] tracking-tight text-[var(--flux-text)] whitespace-nowrap shrink-0"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Flux E3
          </span>
          <span className="text-[var(--flux-line-strong)] shrink-0" aria-hidden="true">
            /
          </span>
          <span className="text-[13px] font-medium text-[var(--flux-text)] truncate max-w-[340px]">
            {project.name}
          </span>
          <span className="hidden xl:inline text-[12px] font-mono tabular-nums text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
            {project.projectCode} · Rev {project.revision}
          </span>
        </div>

        <nav className="flex items-center gap-2 shrink-0" aria-label="Основные действия">
          <button
            type="button"
            onClick={onOpenExchangeModal}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
            <span>Импорт / Экспорт E3</span>
          </button>

          <button
            type="button"
            onClick={onOpenVisualModal}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            <Palette className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
            <span>Синхр. графики</span>
          </button>

          <button
            type="button"
            onClick={onOpenReportModal}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
            <span>Отчёт ПЭ3</span>
          </button>

          <button
            type="button"
            onClick={onDownloadCodebase}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors whitespace-nowrap shrink-0"
          >
            <Archive className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
            <span>Скачать код (.zip)</span>
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div
            className="hidden lg:flex items-center gap-1.5 text-[12px] text-[var(--flux-text-muted)] whitespace-nowrap shrink-0"
            title="Синхронизация изменений в реальном времени через Server-Sent Events"
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
            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
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

      {/* Row 2: CAD Tools Ribbon (E3.series intuitive toolbar) */}
      <div className="flex items-center justify-between gap-4 px-4 h-9 bg-[var(--flux-bg)] overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {/* Primary CAD tools */}
          <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[var(--flux-line)]">
            <button
              type="button"
              onClick={() => onSetTool('select')}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                tool === 'select'
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                  : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)] hover:text-[var(--flux-text)]'
              }`}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
              <span>Выбор (V)</span>
            </button>
            <button
              type="button"
              onClick={() => onSetTool('wire')}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                tool === 'wire'
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                  : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)] hover:text-[var(--flux-text)]'
              }`}
            >
              <Spline className="w-3.5 h-3.5" />
              <span>Провод / Цепь (W)</span>
            </button>
            <button
              type="button"
              onClick={() => onSetTool('pan')}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                tool === 'pan'
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                  : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)] hover:text-[var(--flux-text)]'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Панорама (H)</span>
            </button>
          </div>

          {/* Undo / Redo & Object Actions */}
          <div className="flex items-center gap-0.5 pr-2 mr-1 border-r border-[var(--flux-line)]">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Отменить действие"
              title="Отменить (Ctrl+Z)"
              className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors shrink-0"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Повторить действие"
              title="Повторить (Ctrl+Y)"
              className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors shrink-0"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onRotateSelected}
              disabled={!hasSelection}
              aria-label="Повернуть выбранный элемент на 90 градусов"
              title="Повернуть 90° (R)"
              className="inline-flex items-center gap-1 h-7 px-2 rounded text-[12px] text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>90°</span>
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={!hasSelection}
              aria-label="Удалить выбранный элемент"
              title="Удалить (Del)"
              className="inline-flex items-center justify-center w-7 h-7 rounded text-rose-600 dark:text-rose-400 hover:bg-[var(--flux-hover)] disabled:opacity-35 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Display & ERC */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleGrid}
              className={`inline-flex items-center gap-1 h-7 px-2 rounded text-[12px] transition-colors whitespace-nowrap shrink-0 ${
                project.visualSettings.showGrid
                  ? 'text-[var(--flux-text)] bg-[var(--flux-surface)] border border-[var(--flux-line)]'
                  : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span>Сетка {project.visualSettings.gridSize}</span>
            </button>
            <button
              type="button"
              onClick={onToggleFrame}
              className={`inline-flex items-center gap-1 h-7 px-2 rounded text-[12px] transition-colors whitespace-nowrap shrink-0 ${
                project.visualSettings.showGostFrame
                  ? 'text-[var(--flux-text)] bg-[var(--flux-surface)] border border-[var(--flux-line)]'
                  : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <span>ГОСТ 2.104</span>
            </button>
            <button
              type="button"
              onClick={onRunErc}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors whitespace-nowrap shrink-0"
            >
              {isBusy ? (
                <Activity className="w-3.5 h-3.5 text-[var(--flux-accent)] animate-spin" />
              ) : (
                <CheckCircle2
                  className={`w-3.5 h-3.5 ${
                    ercErrorCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                />
              )}
              <span>Проверка ERC</span>
              <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                ({ercErrorCount})
              </span>
            </button>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(0.3, Math.round((zoom - 0.15) * 100) / 100))}
            aria-label="Уменьшить масштаб"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-12 text-center font-mono tabular-nums text-[12px] text-[var(--flux-text)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(2.5, Math.round((zoom + 0.15) * 100) / 100))}
            aria-label="Увеличить масштаб"
            className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onFitView}
            className="h-6 px-2 rounded text-[11px] font-medium text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] whitespace-nowrap"
          >
            По листу
          </button>
        </div>
      </div>
    </header>
  );
};
