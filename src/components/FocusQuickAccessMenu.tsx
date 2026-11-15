import React, { useEffect, useRef } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Archive,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpRight,
  CheckCircle2,
  ClipboardPaste,
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
  Map as MapIcon,
  Maximize2,
  MousePointer2,
  Package,
  Palette,
  PanelLeft,
  PanelsTopLeft,
  PenTool,
  Pin,
  PinOff,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Ruler,
  Send,
  Share2,
  Spline,
  Square,
  Table2,
  Tag,
  Trash2,
  Type,
  Upload,
  Workflow,
} from 'lucide-react';
import {
  type FocusQuickActionId,
  getFocusQuickActionDef,
} from '../core/focusQuickAccess';

export function renderFocusQuickAccessIcon(
  id: FocusQuickActionId,
  className = 'w-3.5 h-3.5'
): React.ReactNode {
  switch (id) {
    case 'tool_select':
      return <MousePointer2 className={className} strokeWidth={1.65} />;
    case 'tool_wire':
      return <Spline className={className} strokeWidth={1.65} />;
    case 'tool_measure':
      return <Ruler className={className} strokeWidth={1.65} />;
    case 'tool_pan':
      return <Hand className={className} strokeWidth={1.65} />;
    case 'tool_rect':
      return <Square className={className} strokeWidth={1.6} />;
    case 'tool_callout':
      return <ArrowUpRight className={className} strokeWidth={1.6} />;
    case 'tool_text':
      return <Type className={className} strokeWidth={1.6} />;
    case 'tool_offpage':
      return <ArrowLeftRight className={className} strokeWidth={1.6} />;
    case 'open_symbol_designer':
      return <PenTool className={className} strokeWidth={1.6} />;
    case 'auto_route':
      return <Workflow className={className} strokeWidth={1.6} />;
    case 'edit_copy':
      return <Copy className={className} strokeWidth={1.6} />;
    case 'edit_paste':
      return <ClipboardPaste className={className} strokeWidth={1.6} />;
    case 'action_rotate':
      return <RotateCw className={className} strokeWidth={1.6} />;
    case 'edit_delete':
      return <Trash2 className={className} strokeWidth={1.6} />;
    case 'mirror_x':
      return <FlipHorizontal2 className={className} strokeWidth={1.6} />;
    case 'mirror_y':
      return <FlipVertical2 className={className} strokeWidth={1.6} />;
    case 'align_left':
      return <AlignStartVertical className={className} strokeWidth={1.6} />;
    case 'align_center':
      return <AlignCenterVertical className={className} strokeWidth={1.6} />;
    case 'align_top':
      return <AlignStartHorizontal className={className} strokeWidth={1.6} />;
    case 'align_middle':
      return <AlignCenterHorizontal className={className} strokeWidth={1.6} />;
    case 'open_catalog_tab':
      return <Database className={className} strokeWidth={1.6} />;
    case 'open_add_catalog':
      return <Plus className={className} strokeWidth={1.6} />;
    case 'run_erc':
      return <CheckCircle2 className={className} strokeWidth={1.6} />;
    case 'open_bom':
      return <FileSpreadsheet className={className} strokeWidth={1.6} />;
    case 'open_report':
      return <Printer className={className} strokeWidth={1.6} />;
    case 'toggle_grid':
      return <Grid3X3 className={className} strokeWidth={1.6} />;
    case 'toggle_snap':
      return <Magnet className={className} strokeWidth={1.6} />;
    case 'toggle_crosshair':
      return <Crosshair className={className} strokeWidth={1.6} />;
    case 'insert_bom_table':
      return <Table2 className={className} strokeWidth={1.6} />;
    case 'insert_cable_table':
      return <FileSpreadsheet className={className} strokeWidth={1.6} />;
    case 'toggle_pins':
      return <Tag className={className} strokeWidth={1.6} />;
    case 'toggle_wires':
      return <Hash className={className} strokeWidth={1.6} />;
    case 'toggle_crossrefs':
      return <PanelsTopLeft className={className} strokeWidth={1.6} />;
    case 'toggle_frame':
      return <Frame className={className} strokeWidth={1.6} />;
    case 'toggle_bridges':
      return <Spline className={className} strokeWidth={1.6} />;
    case 'open_visual_settings':
      return <Palette className={className} strokeWidth={1.6} />;
    case 'add_sheet':
      return <FilePlus2 className={className} strokeWidth={1.6} />;
    case 'duplicate_sheet':
      return <CopyPlus className={className} strokeWidth={1.6} />;
    case 'delete_sheet':
      return <FileX2 className={className} strokeWidth={1.6} />;
    case 'open_stamp_editor':
      return <Type className={className} strokeWidth={1.6} />;
    case 'open_stamp_designer':
      return <LayoutTemplate className={className} strokeWidth={1.6} />;
    case 'open_hvac_wizard':
      return <Cpu className={className} strokeWidth={1.6} />;
    case 'open_terminals':
      return <Tag className={className} strokeWidth={1.6} />;
    case 'open_autonumber':
      return <Hash className={className} strokeWidth={1.6} />;
    case 'viewport_single':
      return <PanelLeft className={className} strokeWidth={1.6} />;
    case 'viewport_two':
      return <Columns2 className={className} strokeWidth={1.6} />;
    case 'viewport_three':
      return <LayoutGrid className={className} strokeWidth={1.6} />;
    case 'viewport_four':
      return <Grid2X2 className={className} strokeWidth={1.6} />;
    case 'action_fit':
      return <Maximize2 className={className} strokeWidth={1.6} />;
    case 'toggle_minimap':
      return <MapIcon className={className} strokeWidth={1.6} />;
    case 'open_layers':
      return <Layers className={className} strokeWidth={1.6} />;
    case 'reset_dock':
      return <RotateCcw className={className} strokeWidth={1.6} />;
    case 'flux_push':
      return <Send className={className} strokeWidth={1.6} />;
    case 'flux_bus':
      return <RefreshCw className={className} strokeWidth={1.6} />;
    case 'flux_publish':
      return <Layers className={className} strokeWidth={1.6} />;
    case 'flux_zip':
      return <Archive className={className} strokeWidth={1.6} />;
    case 'export_bridge_json':
      return <Share2 className={className} strokeWidth={1.6} />;
    case 'e3_open_file':
      return <Upload className={className} strokeWidth={1.6} />;
    case 'e3_direct':
      return <Share2 className={className} strokeWidth={1.6} />;
    case 'e3_exchange':
      return <FolderOpen className={className} strokeWidth={1.6} />;
    case 'open_publish':
      return <FileCode2 className={className} strokeWidth={1.6} />;
    case 'export_dxf':
      return <FileCode2 className={className} strokeWidth={1.6} />;
    case 'export_bom_csv':
      return <FileSpreadsheet className={className} strokeWidth={1.6} />;
    case 'export_cables_csv':
      return <Download className={className} strokeWidth={1.6} />;
    case 'open_portable':
      return <Package className={className} strokeWidth={1.6} />;
    case 'download_codebase':
      return <Archive className={className} strokeWidth={1.6} />;
  }
}

export interface FocusQuickAccessMenuState {
  actionId: FocusQuickActionId;
  mode: 'ribbon' | 'rail';
  x: number;
  y: number;
}

interface FocusQuickAccessMenuProps {
  menu: FocusQuickAccessMenuState | null;
  isPinned: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onClose: () => void;
  onAdd?: (id: FocusQuickActionId) => void;
  onRemove?: (id: FocusQuickActionId) => void;
  onMove?: (id: FocusQuickActionId, delta: -1 | 1) => void;
  onReset?: () => void;
}

export const FocusQuickAccessMenu: React.FC<FocusQuickAccessMenuProps> = ({
  menu,
  isPinned,
  canMoveUp = false,
  canMoveDown = false,
  onClose,
  onAdd,
  onRemove,
  onMove,
  onReset,
}) => {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const def = getFocusQuickActionDef(menu.actionId);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const estWidth = 246;
  const estHeight = menu.mode === 'rail' ? 182 : 96;
  const left = Math.max(8, Math.min(vw - estWidth - 8, menu.x));
  const top = Math.max(8, Math.min(vh - estHeight - 8, menu.y));

  return (
    <div
      ref={popoverRef}
      role="menu"
      data-testid="quick-access-context-menu"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: estWidth }}
      className="no-print fixed z-[80] rounded-xl border border-[var(--flux-line-strong)] flux-glass-popover shadow-2xl overflow-hidden text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)] select-none"
    >
      <div className="px-2.5 py-1.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]/80 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 min-w-0 font-semibold text-[var(--flux-text)]">
          <span className="text-[var(--flux-accent)] shrink-0">
            {renderFocusQuickAccessIcon(menu.actionId, 'w-3.5 h-3.5')}
          </span>
          <span className="truncate">{def.label}</span>
        </span>
        {def.shortcut && (
          <kbd className="font-mono text-[9.5px] px-1 py-0.5 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] text-[var(--flux-text-muted)] shrink-0">
            {def.shortcut}
          </kbd>
        )}
      </div>

      <div className="py-1">
        {menu.mode === 'ribbon' && !isPinned && onAdd && (
          <button
            type="button"
            data-testid="quick-access-add-btn"
            onClick={() => {
              onAdd(menu.actionId);
              onClose();
            }}
            className="w-full px-2.5 py-1.5 text-left hover:bg-[var(--flux-accent-soft)] hover:text-[var(--flux-accent)] flex items-center gap-2 font-medium transition-colors"
          >
            <Pin className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
            <span>Добавить в быстрый доступ</span>
          </button>
        )}

        {isPinned && onRemove && (
          <button
            type="button"
            data-testid="quick-access-remove-btn"
            onClick={() => {
              onRemove(menu.actionId);
              onClose();
            }}
            className="w-full px-2.5 py-1.5 text-left hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-2 font-medium transition-colors"
          >
            <PinOff className="w-3.5 h-3.5 shrink-0" />
            <span>Убрать из быстрого доступа</span>
          </button>
        )}

        {menu.mode === 'rail' && onMove && (
          <>
            <div className="my-1 border-t border-[var(--flux-line)]" />
            <button
              type="button"
              data-testid="quick-access-move-up-btn"
              disabled={!canMoveUp}
              onClick={() => {
                onMove(menu.actionId, -1);
                onClose();
              }}
              className="w-full px-2.5 py-1.5 text-left hover:bg-[var(--flux-hover)] disabled:opacity-35 flex items-center gap-2 transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />
              <span>Переместить выше</span>
            </button>
            <button
              type="button"
              data-testid="quick-access-move-down-btn"
              disabled={!canMoveDown}
              onClick={() => {
                onMove(menu.actionId, 1);
                onClose();
              }}
              className="w-full px-2.5 py-1.5 text-left hover:bg-[var(--flux-hover)] disabled:opacity-35 flex items-center gap-2 transition-colors"
            >
              <ArrowDown className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />
              <span>Переместить ниже</span>
            </button>
          </>
        )}

        {menu.mode === 'rail' && onReset && (
          <>
            <div className="my-1 border-t border-[var(--flux-line)]" />
            <button
              type="button"
              data-testid="quick-access-reset-btn"
              onClick={() => {
                onReset();
                onClose();
              }}
              className="w-full px-2.5 py-1.5 text-left hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>Сбросить по умолчанию</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};
