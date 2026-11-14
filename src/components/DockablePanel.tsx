import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  GripHorizontal,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PictureInPicture2,
} from 'lucide-react';
import type { DockEdge, DockSide, PanelConfig, PanelId } from '../core/dockLayout';

export const CAD_PANEL_TRANSITION = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const CAD_FAST_TRANSITION = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const COLLAPSED_SIDE_RAIL_WIDTH = 28;
export const COLLAPSED_HEADER_HEIGHT = 24;
export const COLLAPSED_BOTTOM_TABS_HEIGHT = 28;

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
  edge?: DockEdge | 'floating';
  onStartDrag: (panelId: PanelId, e: React.PointerEvent) => void;
  onMoveDock: (panelId: PanelId, side: DockSide) => void;
  onToggleCollapse: (panelId: PanelId) => void;
}

const PanelHeaderBar: React.FC<PanelHeaderBarProps> = ({
  panel,
  edge = 'bottom',
  onStartDrag,
  onMoveDock,
  onToggleCollapse,
}) => {
  const dockBtnCls = (active: boolean) =>
    `inline-flex items-center justify-center w-[18px] h-[18px] rounded-[2px] transition-colors ${
      active
        ? 'bg-[var(--flux-sel)] text-[var(--flux-accent)]'
        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
    }`;

  const CollapseChevron =
    edge === 'left'
      ? ChevronLeft
      : edge === 'right'
        ? ChevronRight
        : edge === 'top'
          ? ChevronUp
          : ChevronDown;

  return (
    <div
      data-testid={`panel-header-${panel.id}`}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onStartDrag(panel.id, e);
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onToggleCollapse(panel.id);
      }}
      title="Перетащите заголовок для закрепления или дважды кликните для сворачивания"
      className="group/header h-6 px-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex items-center justify-between gap-1.5 shrink-0 cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <GripHorizontal className="w-3 h-3 text-[var(--flux-text-muted)]/50 group-hover/header:text-[var(--flux-text-muted)] transition-colors shrink-0" />
        <span className="text-[11px] font-semibold tracking-normal text-[var(--flux-text)] truncate">
          {panel.title}
        </span>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <div className="flex items-center gap-0.5 opacity-35 group-hover/header:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
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
        </div>
        <button
          type="button"
          onClick={() => onToggleCollapse(panel.id)}
          title={panel.collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          aria-label={panel.collapsed ? `Развернуть «${panel.title}»` : `Свернуть «${panel.title}»`}
          className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors ml-0.5"
        >
          <motion.span
            animate={{ rotate: panel.collapsed ? 180 : 0 }}
            transition={CAD_FAST_TRANSITION}
            className="inline-flex items-center justify-center"
          >
            <CollapseChevron className="w-3.5 h-3.5" />
          </motion.span>
        </button>
      </div>
    </div>
  );
};

interface DockablePanelFrameProps {
  panel: PanelConfig;
  edge: DockEdge;
  bandSize: number;
  useSideRail?: boolean;
  multiPanelInBand?: boolean;
  hideHeaderBar?: boolean;
  isResizing?: boolean;
  className?: string;
  onStartDrag: (panelId: PanelId, e: React.PointerEvent) => void;
  onMoveDock: (panelId: PanelId, side: DockSide) => void;
  onToggleCollapse: (panelId: PanelId) => void;
  children: React.ReactNode;
}

export const DockablePanelFrame: React.FC<DockablePanelFrameProps> = React.memo(({
  panel,
  edge,
  bandSize,
  useSideRail = false,
  multiPanelInBand = false,
  hideHeaderBar = false,
  isResizing = false,
  className = '',
  onStartDrag,
  onMoveDock,
  onToggleCollapse,
  children,
}) => {
  const isSideBand = edge === 'left' || edge === 'right';
  const showSideRail = isSideBand && useSideRail && panel.collapsed;
  const collapseMotion = isResizing ? { duration: 0 } : CAD_PANEL_TRANSITION;

  if (hideHeaderBar) {
    return (
      <div
        data-testid={`dock-panel-${panel.id}`}
        data-dock={panel.dock}
        data-collapsed={panel.collapsed ? 'true' : 'false'}
        className={`flex flex-col min-w-0 min-h-0 bg-[var(--flux-surface)] overflow-hidden ${className}`}
      >
        {children}
      </div>
    );
  }

  if (isSideBand && useSideRail) {
    return (
      <div
        data-testid={`dock-panel-${panel.id}`}
        data-dock={panel.dock}
        data-collapsed={panel.collapsed ? 'true' : 'false'}
        className={`relative flex flex-col min-w-0 min-h-0 bg-[var(--flux-bg)] overflow-hidden ${className}`}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {showSideRail ? (
            <motion.div
              key="rail"
              data-testid={`panel-header-${panel.id}`}
              initial={{ opacity: 0, x: edge === 'left' ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: edge === 'left' ? -8 : 8 }}
              transition={collapseMotion}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('button')) return;
                onStartDrag(panel.id, e);
              }}
              onDoubleClick={() => onToggleCollapse(panel.id)}
              title={`Развернуть «${panel.title}» (или перетащите для перемещения)`}
              className="h-full w-[28px] bg-[var(--flux-surface-alt)] flex flex-col items-center py-1 gap-1 select-none cursor-grab active:cursor-grabbing"
            >
              <button
                type="button"
                data-testid={`panel-expand-${panel.id}`}
                onClick={() => onToggleCollapse(panel.id)}
                title={`Развернуть «${panel.title}»`}
                aria-label={`Развернуть «${panel.title}»`}
                className="inline-flex items-center justify-center w-5 h-5 rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
              >
                {edge === 'left' ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onToggleCollapse(panel.id)}
                aria-label={`Открыть панель «${panel.title}»`}
                className="flex-1 w-full flex items-center justify-center overflow-hidden rounded-xs hover:bg-[var(--flux-hover)]/70 transition-colors py-2 cursor-pointer"
              >
                <span
                  className="text-[11px] font-semibold tracking-wide text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] whitespace-nowrap"
                  style={{
                    writingMode: 'vertical-rl',
                    transform: edge === 'left' ? 'rotate(180deg)' : undefined,
                  }}
                >
                  {panel.title}
                </span>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="expanded"
              initial={{ opacity: 0, x: edge === 'left' ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: edge === 'left' ? -12 : 12 }}
              transition={collapseMotion}
              style={{ width: bandSize }}
              className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--flux-bg)]"
            >
              <PanelHeaderBar
                panel={panel}
                edge={edge}
                onStartDrag={onStartDrag}
                onMoveDock={onMoveDock}
                onToggleCollapse={onToggleCollapse}
              />
              <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <motion.div
      data-testid={`dock-panel-${panel.id}`}
      data-dock={panel.dock}
      data-collapsed={panel.collapsed ? 'true' : 'false'}
      animate={multiPanelInBand ? { flexGrow: panel.collapsed ? 0 : 1 } : undefined}
      transition={collapseMotion}
      className={`flex flex-col min-w-0 min-h-0 bg-[var(--flux-bg)] overflow-hidden ${
        multiPanelInBand && panel.collapsed ? 'shrink-0' : className
      }`}
    >
      <PanelHeaderBar
        panel={panel}
        edge={edge}
        onStartDrag={onStartDrag}
        onMoveDock={onMoveDock}
        onToggleCollapse={onToggleCollapse}
      />
      <AnimatePresence initial={false}>
        {!panel.collapsed && (
          <motion.div
            key="panel-body"
            initial={
              multiPanelInBand
                ? { opacity: 0, height: 0 }
                : { opacity: 0, y: edge === 'top' ? -6 : 6 }
            }
            animate={
              multiPanelInBand
                ? { opacity: 1, height: 'auto' }
                : { opacity: 1, y: 0 }
            }
            exit={
              multiPanelInBand
                ? { opacity: 0, height: 0 }
                : { opacity: 0, y: edge === 'top' ? -6 : 6 }
            }
            transition={collapseMotion}
            style={
              !multiPanelInBand && !isSideBand
                ? { minHeight: Math.max(72, bandSize - COLLAPSED_HEADER_HEIGHT) }
                : undefined
            }
            className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
DockablePanelFrame.displayName = 'DockablePanelFrame';

interface DockResizeHandleProps {
  edge: DockEdge;
  onResizeStart: (edge: DockEdge, e: React.PointerEvent) => void;
}

export const DockResizeHandle: React.FC<DockResizeHandleProps> = React.memo(({ edge, onResizeStart }) => {
  const isVertical = edge === 'left' || edge === 'right';
  return (
    <motion.div
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-label={`Изменить размер области (${edge})`}
      data-testid={`dock-resizer-${edge}`}
      onPointerDown={(e) => onResizeStart(edge, e)}
      initial={isVertical ? { width: 0, opacity: 0 } : { height: 0, opacity: 0 }}
      animate={isVertical ? { width: 4, opacity: 1 } : { height: 4, opacity: 1 }}
      exit={isVertical ? { width: 0, opacity: 0 } : { height: 0, opacity: 0 }}
      transition={CAD_FAST_TRANSITION}
      className={`no-print shrink-0 relative group z-10 transition-colors bg-[var(--flux-line)] hover:bg-[var(--flux-accent)] ${
        isVertical ? 'cursor-col-resize' : 'cursor-row-resize'
      }`}
    >
      <div
        className={`absolute ${
          isVertical ? '-inset-x-1 inset-y-0' : '-inset-y-1 inset-x-0'
        }`}
      />
    </motion.div>
  );
});
DockResizeHandle.displayName = 'DockResizeHandle';

interface FloatingPanelWindowProps {
  panel: PanelConfig;
  isResizing?: boolean;
  onStartDrag: (panelId: PanelId, e: React.PointerEvent) => void;
  onResizeFloatingStart: (panelId: PanelId, e: React.PointerEvent) => void;
  onMoveDock: (panelId: PanelId, side: DockSide) => void;
  onToggleCollapse: (panelId: PanelId) => void;
  children: React.ReactNode;
}

export const FloatingPanelWindow: React.FC<FloatingPanelWindowProps> = React.memo(({
  panel,
  isResizing = false,
  onStartDrag,
  onResizeFloatingStart,
  onMoveDock,
  onToggleCollapse,
  children,
}) => {
  const targetHeight = panel.collapsed ? COLLAPSED_HEADER_HEIGHT : panel.floating.height;
  return (
    <motion.div
      data-testid={`floating-panel-${panel.id}`}
      data-collapsed={panel.collapsed ? 'true' : 'false'}
      initial={{ opacity: 0, scale: 0.97, height: targetHeight }}
      animate={{ opacity: 1, scale: 1, height: targetHeight }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={isResizing ? { duration: 0 } : CAD_PANEL_TRANSITION}
      style={{
        left: panel.floating.x,
        top: panel.floating.y,
        width: panel.floating.width,
        boxShadow: 'var(--flux-paper-shadow)',
      }}
      className="no-print fixed z-40 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] flex flex-col overflow-hidden"
    >
      <PanelHeaderBar
        panel={panel}
        edge="floating"
        onStartDrag={onStartDrag}
        onMoveDock={onMoveDock}
        onToggleCollapse={onToggleCollapse}
      />
      <AnimatePresence initial={false}>
        {!panel.collapsed && (
          <motion.div
            key="floating-body"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={CAD_FAST_TRANSITION}
            style={{ minHeight: Math.max(80, panel.floating.height - COLLAPSED_HEADER_HEIGHT) }}
            className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden relative"
          >
            {children}
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
FloatingPanelWindow.displayName = 'FloatingPanelWindow';

export const DockDropOverlay: React.FC<{
  drag: ActivePanelDrag | null;
  bounds: { left: number; top: number; width: number; height: number } | null;
}> = React.memo(({ drag, bounds }) => (
  <AnimatePresence>
    {drag && bounds && (
      <motion.div
        key="dock-drop-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
        className="no-print fixed z-50 pointer-events-none"
        style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
      >
        <motion.div
          animate={{ scale: drag.hoverTarget === 'left' ? 1.02 : 1 }}
          transition={CAD_FAST_TRANSITION}
          className={`absolute flex items-center justify-center border-2 rounded transition-colors pointer-events-none text-[11px] font-semibold tracking-wide left-2 top-16 bottom-16 w-20 ${
            drag.hoverTarget === 'left'
              ? 'border-[var(--flux-accent)] bg-[var(--flux-accent)]/20 text-[var(--flux-text)]'
              : 'border-dashed border-[var(--flux-line-strong)] bg-[var(--flux-surface)]/45 text-[var(--flux-text-muted)]'
          }`}
        >
          <span className="-rotate-90 whitespace-nowrap">Слева</span>
        </motion.div>
        <motion.div
          animate={{ scale: drag.hoverTarget === 'right' ? 1.02 : 1 }}
          transition={CAD_FAST_TRANSITION}
          className={`absolute flex items-center justify-center border-2 rounded transition-colors pointer-events-none text-[11px] font-semibold tracking-wide right-2 top-16 bottom-16 w-20 ${
            drag.hoverTarget === 'right'
              ? 'border-[var(--flux-accent)] bg-[var(--flux-accent)]/20 text-[var(--flux-text)]'
              : 'border-dashed border-[var(--flux-line-strong)] bg-[var(--flux-surface)]/45 text-[var(--flux-text-muted)]'
          }`}
        >
          <span className="rotate-90 whitespace-nowrap">Справа</span>
        </motion.div>
        <motion.div
          animate={{ scale: drag.hoverTarget === 'top' ? 1.015 : 1 }}
          transition={CAD_FAST_TRANSITION}
          className={`absolute flex items-center justify-center border-2 rounded transition-colors pointer-events-none text-[11px] font-semibold tracking-wide top-2 left-24 right-24 h-12 ${
            drag.hoverTarget === 'top'
              ? 'border-[var(--flux-accent)] bg-[var(--flux-accent)]/20 text-[var(--flux-text)]'
              : 'border-dashed border-[var(--flux-line-strong)] bg-[var(--flux-surface)]/45 text-[var(--flux-text-muted)]'
          }`}
        >
          <span>Сверху</span>
        </motion.div>
        <motion.div
          animate={{ scale: drag.hoverTarget === 'bottom' ? 1.015 : 1 }}
          transition={CAD_FAST_TRANSITION}
          className={`absolute flex items-center justify-center border-2 rounded transition-colors pointer-events-none text-[11px] font-semibold tracking-wide bottom-2 left-24 right-24 h-14 ${
            drag.hoverTarget === 'bottom'
              ? 'border-[var(--flux-accent)] bg-[var(--flux-accent)]/20 text-[var(--flux-text)]'
              : 'border-dashed border-[var(--flux-line-strong)] bg-[var(--flux-surface)]/45 text-[var(--flux-text-muted)]'
          }`}
        >
          <span>Снизу</span>
        </motion.div>
        {!drag.wasFloating && drag.hoverTarget === 'floating' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={CAD_FAST_TRANSITION}
            className="fixed border-2 border-[var(--flux-accent)] bg-[var(--flux-accent)]/10 rounded pointer-events-none shadow-lg flex items-center justify-center text-[11px] font-semibold text-[var(--flux-text)]"
            style={{
              left: Math.max(12, drag.currentX - 140),
              top: Math.max(48, drag.currentY - 14),
              width: 280,
              height: 160,
            }}
          >
            Плавающее окно
          </motion.div>
        )}
      </motion.div>
    )}
  </AnimatePresence>
));
DockDropOverlay.displayName = 'DockDropOverlay';

