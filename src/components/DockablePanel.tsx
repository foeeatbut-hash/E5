import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PictureInPicture2,
} from 'lucide-react';
import type { DockEdge, DockSide, PanelConfig, PanelId } from '../core/dockLayout';

export interface ActivePanelDrag {
  panelId: PanelId;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  origFloatingX: number;
  origFloatingY: number;
  wasFloating: boolean;
  hoverTarget: DockSide | null;
}

export function resolveDropTarget(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; right: number; bottom: number }
): DockSide {
  const w = Math.max(1, bounds.right - bounds.left);
  const h = Math.max(1, bounds.bottom - bounds.top);
  const rx = clientX - bounds.left;
  const ry = clientY - bounds.top;

  const edgeX = Math.min(110, Math.round(w * 0.14));
  const edgeY = Math.min(96, Math.round(h * 0.16));

  if (rx >= 0 && rx <= edgeX) return 'left';
  if (rx <= w && rx >= w - edgeX) return 'right';
  if (ry <= h && ry >= h - edgeY) return 'bottom';
  if (ry >= 0 && ry <= edgeY) return 'top';
  return 'floating';
}

interface PanelHeaderBarProps {
  panel: PanelConfig;
  onStartDrag: (panelId: PanelId, e: React.PointerEvent) => void;
  onMoveDock: (panelId: PanelId, side: DockSide) => void;
  onToggleCollapse: (panelId: PanelId) => void;
}

const PanelHeaderBar: React.FC<PanelHeaderBarProps> = ({
  panel,
  onStartDrag,
  onMoveDock,
  onToggleCollapse,
}) => {
  const dockBtnCls = (active: boolean) =>
    `inline-flex items-center justify-center w-5 h-5 rounded transition-colors ${
      active
        ? 'bg-[var(--flux-sel)] text-[var(--flux-accent)]'
        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
    }`;

  return (
    <div
      data-testid={`panel-header-${panel.id}`}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onStartDrag(panel.id, e);
      }}
      title="Перетащите заголовок, чтобы переместить или закрепить панель на любой границе окна"
      className="h-7 px-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0 cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <GripHorizontal className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />
        <span className="text-[11px] font-semibold tracking-wide text-[var(--flux-text)] truncate">
          {panel.title}
        </span>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onMoveDock(panel.id, 'left')}
          title="Закрепить слева"
          aria-label={`Закрепить панель «${panel.title}» слева`}
          className={dockBtnCls(panel.dock === 'left')}
        >
          <PanelLeft className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onMoveDock(panel.id, 'bottom')}
          title="Закрепить снизу"
          aria-label={`Закрепить панель «${panel.title}» снизу`}
          className={dockBtnCls(panel.dock === 'bottom')}
        >
          <PanelBottom className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onMoveDock(panel.id, 'right')}
          title="Закрепить справа"
          aria-label={`Закрепить панель «${panel.title}» справа`}
          className={dockBtnCls(panel.dock === 'right')}
        >
          <PanelRight className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onMoveDock(panel.id, 'floating')}
          title="Открепить (плавающее окно)"
          aria-label={`Открепить панель «${panel.title}»`}
          className={dockBtnCls(panel.dock === 'floating')}
        >
          <PictureInPicture2 className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onToggleCollapse(panel.id)}
          title={panel.collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          aria-label={panel.collapsed ? `Развернуть «${panel.title}»` : `Свернуть «${panel.title}»`}
          className="inline-flex items-center justify-center w-5 h-5 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
        >
          {panel.collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
};

interface DockablePanelFrameProps {
  panel: PanelConfig;
  className?: string;
  onStartDrag: (panelId: PanelId, e: React.PointerEvent) => void;
  onMoveDock: (panelId: PanelId, side: DockSide) => void;
  onToggleCollapse: (panelId: PanelId) => void;
  children: React.ReactNode;
}

export const DockablePanelFrame: React.FC<DockablePanelFrameProps> = ({
  panel,
  className = '',
  onStartDrag,
  onMoveDock,
  onToggleCollapse,
  children,
}) => (
  <div
    data-testid={`dock-panel-${panel.id}`}
    data-dock={panel.dock}
    className={`flex flex-col min-w-0 min-h-0 bg-[var(--flux-bg)] overflow-hidden ${className}`}
  >
    <PanelHeaderBar
      panel={panel}
      onStartDrag={onStartDrag}
      onMoveDock={onMoveDock}
      onToggleCollapse={onToggleCollapse}
    />
    {!panel.collapsed && <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">{children}</div>}
  </div>
);

interface DockResizeHandleProps {
  edge: DockEdge;
  onResizeStart: (edge: DockEdge, e: React.PointerEvent) => void;
}

export const DockResizeHandle: React.FC<DockResizeHandleProps> = ({ edge, onResizeStart }) => {
  const isVertical = edge === 'left' || edge === 'right';
  return (
    <div
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-label={`Изменить размер области (${edge})`}
      data-testid={`dock-resizer-${edge}`}
      onPointerDown={(e) => onResizeStart(edge, e)}
      className={`no-print shrink-0 relative group z-10 transition-colors bg-[var(--flux-line)] hover:bg-[var(--flux-accent)] ${
        isVertical ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'
      }`}
    >
      <div
        className={`absolute ${
          isVertical ? '-inset-x-1 inset-y-0' : '-inset-y-1 inset-x-0'
        }`}
      />
    </div>
  );
};

interface FloatingPanelWindowProps {
  panel: PanelConfig;
  onStartDrag: (panelId: PanelId, e: React.PointerEvent) => void;
  onResizeFloatingStart: (panelId: PanelId, e: React.PointerEvent) => void;
  onMoveDock: (panelId: PanelId, side: DockSide) => void;
  onToggleCollapse: (panelId: PanelId) => void;
  children: React.ReactNode;
}

export const FloatingPanelWindow: React.FC<FloatingPanelWindowProps> = ({
  panel,
  onStartDrag,
  onResizeFloatingStart,
  onMoveDock,
  onToggleCollapse,
  children,
}) => {
  const height = panel.collapsed ? 28 : panel.floating.height;
  return (
    <div
      data-testid={`floating-panel-${panel.id}`}
      style={{
        left: panel.floating.x,
        top: panel.floating.y,
        width: panel.floating.width,
        height,
      }}
      className="no-print fixed z-40 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] shadow-xl flex flex-col overflow-hidden"
    >
      <PanelHeaderBar
        panel={panel}
        onStartDrag={onStartDrag}
        onMoveDock={onMoveDock}
        onToggleCollapse={onToggleCollapse}
      />
      {!panel.collapsed && (
        <>
          <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">{children}</div>
          <div
            data-testid={`floating-resizer-${panel.id}`}
            onPointerDown={(e) => onResizeFloatingStart(panel.id, e)}
            title="Потяните для изменения размера окна"
            className="absolute right-0 bottom-0 w-3.5 h-3.5 cursor-nwse-resize z-20 flex items-end justify-end p-0.5 text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)]"
          >
            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5 fill-current">
              <path d="M9 1v8H1l8-8z" opacity="0.45" />
            </svg>
          </div>
        </>
      )}
    </div>
  );
};

export const DockDropOverlay: React.FC<{
  drag: ActivePanelDrag | null;
  bounds: { left: number; top: number; width: number; height: number } | null;
}> = ({ drag, bounds }) => {
  if (!drag || !bounds) return null;

  const zoneCls = (active: boolean) =>
    `absolute flex items-center justify-center border-2 rounded transition-all pointer-events-none text-[11px] font-semibold tracking-wide ${
      active
        ? 'border-[var(--flux-accent)] bg-[var(--flux-accent)]/20 text-[var(--flux-text)]'
        : 'border-dashed border-[var(--flux-line-strong)] bg-[var(--flux-surface)]/45 text-[var(--flux-text-muted)]'
    }`;

  return (
    <div
      className="no-print fixed z-50 pointer-events-none"
      style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
    >
      <div className={`${zoneCls(drag.hoverTarget === 'left')} left-2 top-16 bottom-16 w-20`}>
        <span className="-rotate-90 whitespace-nowrap">Слева</span>
      </div>
      <div className={`${zoneCls(drag.hoverTarget === 'right')} right-2 top-16 bottom-16 w-20`}>
        <span className="rotate-90 whitespace-nowrap">Справа</span>
      </div>
      <div className={`${zoneCls(drag.hoverTarget === 'top')} top-2 left-24 right-24 h-12`}>
        <span>Сверху</span>
      </div>
      <div className={`${zoneCls(drag.hoverTarget === 'bottom')} bottom-2 left-24 right-24 h-14`}>
        <span>Снизу</span>
      </div>
      {!drag.wasFloating && drag.hoverTarget === 'floating' && (
        <div
          className="fixed border-2 border-[var(--flux-accent)] bg-[var(--flux-accent)]/10 rounded pointer-events-none shadow-lg flex items-center justify-center text-[11px] font-semibold text-[var(--flux-text)]"
          style={{
            left: Math.max(12, drag.currentX - 140),
            top: Math.max(48, drag.currentY - 14),
            width: 280,
            height: 160,
          }}
        >
          Плавающее окно
        </div>
      )}
    </div>
  );
};
