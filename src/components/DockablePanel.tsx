import React, { useEffect, useRef, useState } from 'react';
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
import {
  arePanelContainerPropsEqual,
  computePanelPixelFlexBasis,
  createRafCoordinateStabilizer,
  stabilizePanelCoordinates,
  type PanelCoords,
} from '../core/panelStabilizer';
import { getScaledChromeMetrics, type UiScalePercent } from '../core/uiScale';

export const CAD_PANEL_TRANSITION = {
  duration: 0.15,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const CAD_FAST_TRANSITION = {
  duration: 0.11,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const COLLAPSED_SIDE_RAIL_WIDTH = 24;
export const COLLAPSED_HEADER_HEIGHT = 24;
export const COLLAPSED_BOTTOM_TABS_HEIGHT = 24;

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

function useStabilizedFloatingRect(rect: PanelConfig['floating']): PanelCoords {
  const initial = stabilizePanelCoordinates({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
  const [stabilized, setStabilized] = useState<PanelCoords>(initial);
  const stabilizerRef = useRef<ReturnType<typeof createRafCoordinateStabilizer> | null>(null);

  if (!stabilizerRef.current) {
    stabilizerRef.current = createRafCoordinateStabilizer((next) => {
      setStabilized((prev) =>
        prev.x === next.x &&
        prev.y === next.y &&
        prev.width === next.width &&
        prev.height === next.height
          ? prev
          : next
      );
    });
  }

  useEffect(() => {
    stabilizerRef.current?.schedule({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }, [rect.x, rect.y, rect.width, rect.height]);

  useEffect(() => {
    return () => {
      stabilizerRef.current?.cancel();
    };
  }, []);

  return stabilized;
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
    `inline-flex items-center justify-center w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] rounded-md transition-colors ${
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
      className="group/header h-6 px-2 border-b border-[var(--flux-line)] flux-glass-bar flex items-center justify-between gap-1.5 shrink-0 cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <GripHorizontal className="w-3 h-3 text-[var(--flux-text-muted)]/50 group-hover/header:text-[var(--flux-text-muted)] transition-colors shrink-0" />
        <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold tracking-normal text-[var(--flux-text)] truncate">
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
          className="inline-flex items-center justify-center w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors ml-0.5"
        >
          <motion.span
            animate={{ rotate: panel.collapsed ? 180 : 0 }}
            transition={CAD_FAST_TRANSITION}
            className="inline-flex items-center justify-center"
          >
            <CollapseChevron className="w-3 h-3" />
          </motion.span>
        </button>
      </div>
    </div>
  );
};

export interface DockablePanelFrameProps {
  panel: PanelConfig;
  edge: DockEdge;
  bandSize: number;
  flexBasisPx?: number;
  uiScale?: UiScalePercent;
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

const DockablePanelFrameImpl: React.FC<DockablePanelFrameProps> = ({
  panel,
  edge,
  bandSize,
  flexBasisPx,
  uiScale = 100,
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
  const chrome = getScaledChromeMetrics(uiScale);
  const resolvedPxBasis = Math.round(
    flexBasisPx ??
      computePanelPixelFlexBasis({
        panelCollapsed: panel.collapsed,
        multiPanelInBand,
        bandSpanPx: bandSize,
        bandCrossPx: bandSize,
        collapsedSizePx: showSideRail
          ? chrome.collapsedSideRailWidth
          : chrome.collapsedHeaderHeight,
      })
  );

  if (hideHeaderBar) {
    return (
      <div
        data-testid={`dock-panel-${panel.id}`}
        data-dock={panel.dock}
        data-collapsed={panel.collapsed ? 'true' : 'false'}
        style={{ flexBasis: `${resolvedPxBasis}px`, flexGrow: 1, flexShrink: 0 }}
        className={`flex flex-col min-w-0 min-h-0 flux-glass-surface overflow-hidden ${className}`}
      >
        {children}
      </div>
    );
  }

  if (isSideBand && useSideRail) {
    const pxWidth = Math.round(showSideRail ? chrome.collapsedSideRailWidth : bandSize);
    return (
      <div
        data-testid={`dock-panel-${panel.id}`}
        data-dock={panel.dock}
        data-collapsed={panel.collapsed ? 'true' : 'false'}
        style={{ width: `${pxWidth}px`, flexBasis: `${resolvedPxBasis}px`, flexGrow: 1, flexShrink: 0 }}
        className={`relative flex flex-col min-w-0 min-h-0 flux-glass-panel overflow-hidden ${className}`}
      >
        {showSideRail ? (
          <div
            data-testid={`panel-header-${panel.id}`}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              onStartDrag(panel.id, e);
            }}
            onDoubleClick={() => onToggleCollapse(panel.id)}
            title={`Развернуть «${panel.title}» (или перетащите для перемещения)`}
            style={{ width: `${chrome.collapsedSideRailWidth}px` }}
            className="h-full flux-glass-bar flex flex-col items-center py-1 gap-1 select-none cursor-grab active:cursor-grabbing"
          >
            <button
              type="button"
              data-testid={`panel-expand-${panel.id}`}
              onClick={() => onToggleCollapse(panel.id)}
              title={`Развернуть «${panel.title}»`}
              aria-label={`Развернуть «${panel.title}»`}
              className="inline-flex items-center justify-center w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] rounded-[2px] text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
            >
              {edge === 'left' ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronLeft className="w-3 h-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => onToggleCollapse(panel.id)}
              aria-label={`Открыть панель «${panel.title}»`}
              className="flex-1 w-full flex items-center justify-center overflow-hidden rounded-xs hover:bg-[var(--flux-hover)]/70 transition-colors py-2 cursor-pointer"
            >
              <span
                className="text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold tracking-wide text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] whitespace-nowrap"
                style={{
                  writingMode: 'vertical-rl',
                  transform: edge === 'left' ? 'rotate(180deg)' : undefined,
                }}
              >
                {panel.title}
              </span>
            </button>
          </div>
        ) : (
          <div
            style={{ width: `${Math.round(bandSize)}px`, flexBasis: `${resolvedPxBasis}px`, flexGrow: 1, flexShrink: 0 }}
            className="h-full flex flex-col min-h-0 overflow-hidden flux-glass-panel"
          >
            <PanelHeaderBar
              panel={panel}
              edge={edge}
              onStartDrag={onStartDrag}
              onMoveDock={onMoveDock}
              onToggleCollapse={onToggleCollapse}
            />
            <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">{children}</div>
          </div>
        )}
      </div>
    );
  }

  const collapsedBasis = chrome.collapsedHeaderHeight;
  const activeFlexBasis = panel.collapsed ? collapsedBasis : resolvedPxBasis;
  const bodyMinHeight = Math.max(
    Math.round(72 * chrome.factor),
    Math.round(bandSize) - chrome.collapsedHeaderHeight
  );

  return (
    <motion.div
      data-testid={`dock-panel-${panel.id}`}
      data-dock={panel.dock}
      data-collapsed={panel.collapsed ? 'true' : 'false'}
      animate={multiPanelInBand ? { flexGrow: panel.collapsed ? 0 : 1 } : undefined}
      transition={collapseMotion}
      style={{
        flexBasis: `${activeFlexBasis}px`,
        flexShrink: 0,
        ...(multiPanelInBand ? {} : { flexGrow: 1 }),
      }}
      className={`flex flex-col min-w-0 min-h-0 flux-glass-panel overflow-hidden ${className}`}
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
                ? { minHeight: `${bodyMinHeight}px`, flexBasis: `${bodyMinHeight}px`, flexGrow: 1, flexShrink: 0 }
                : { flexGrow: 1, flexShrink: 0 }
            }
            className="min-w-0 min-h-0 flex flex-col overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const DockablePanelFrame = React.memo(
  DockablePanelFrameImpl,
  arePanelContainerPropsEqual
);
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

export interface FloatingPanelWindowProps {
  panel: PanelConfig;
  uiScale?: UiScalePercent;
  isResizing?: boolean;
  isMoving?: boolean;
  onStartDrag: (panelId: PanelId, e: React.PointerEvent) => void;
  onResizeFloatingStart: (panelId: PanelId, e: React.PointerEvent) => void;
  onMoveDock: (panelId: PanelId, side: DockSide) => void;
  onToggleCollapse: (panelId: PanelId) => void;
  children: React.ReactNode;
}

const FloatingPanelWindowImpl: React.FC<FloatingPanelWindowProps> = ({
  panel,
  uiScale = 100,
  isResizing = false,
  isMoving = false,
  onStartDrag,
  onResizeFloatingStart,
  onMoveDock,
  onToggleCollapse,
  children,
}) => {
  const chrome = getScaledChromeMetrics(uiScale);
  const stabilizedRect = useStabilizedFloatingRect(panel.floating);
  const pxWidth = Math.round(stabilizedRect.width ?? panel.floating.width);
  const fullPxHeight = Math.round(stabilizedRect.height ?? panel.floating.height);
  const targetHeight = panel.collapsed ? chrome.collapsedHeaderHeight : fullPxHeight;
  const bodyPxHeight = Math.max(
    Math.round(80 * chrome.factor),
    fullPxHeight - chrome.collapsedHeaderHeight
  );
  const disableMotion = isResizing || isMoving;

  return (
    <motion.div
      data-testid={`floating-panel-${panel.id}`}
      data-collapsed={panel.collapsed ? 'true' : 'false'}
      initial={{ opacity: 0, height: targetHeight }}
      animate={{ opacity: 1, height: targetHeight }}
      exit={{ opacity: 0 }}
      transition={disableMotion ? { duration: 0 } : CAD_PANEL_TRANSITION}
      style={{
        left: `${stabilizedRect.x}px`,
        top: `${stabilizedRect.y}px`,
        width: `${pxWidth}px`,
        flexBasis: `${targetHeight}px`,
        flexShrink: 0,
      }}
      className="no-print fixed z-40 rounded-2xl border border-[var(--flux-line-strong)] flux-glass-modal flex flex-col overflow-hidden"
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={disableMotion ? { duration: 0 } : CAD_FAST_TRANSITION}
            style={{
              minHeight: `${bodyPxHeight}px`,
              flexBasis: `${bodyPxHeight}px`,
              flexGrow: 1,
              flexShrink: 0,
            }}
            className="min-w-0 min-h-0 flex flex-col overflow-hidden relative"
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
};

export const FloatingPanelWindow = React.memo(
  FloatingPanelWindowImpl,
  arePanelContainerPropsEqual
);
FloatingPanelWindow.displayName = 'FloatingPanelWindow';

export const DockDropOverlay: React.FC<{
  drag: ActivePanelDrag | null;
  bounds: { left: number; top: number; width: number; height: number } | null;
  uiScale?: UiScalePercent;
}> = React.memo(({ drag, bounds, uiScale = 100 }) => {
  const chrome = getScaledChromeMetrics(uiScale);
  return (
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
            className={`absolute flex items-center justify-center border-2 rounded transition-colors pointer-events-none text-[length:calc(11px*var(--flux-ui-scale))] font-semibold tracking-wide left-2 top-16 bottom-16 w-20 ${
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
            className={`absolute flex items-center justify-center border-2 rounded transition-colors pointer-events-none text-[length:calc(11px*var(--flux-ui-scale))] font-semibold tracking-wide right-2 top-16 bottom-16 w-20 ${
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
            className={`absolute flex items-center justify-center border-2 rounded transition-colors pointer-events-none text-[length:calc(11px*var(--flux-ui-scale))] font-semibold tracking-wide top-2 left-24 right-24 h-12 ${
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
            className={`absolute flex items-center justify-center border-2 rounded transition-colors pointer-events-none text-[length:calc(11px*var(--flux-ui-scale))] font-semibold tracking-wide bottom-2 left-24 right-24 h-14 ${
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
              className="fixed border-2 border-[var(--flux-accent)] bg-[var(--flux-accent)]/10 rounded pointer-events-none shadow-lg flex items-center justify-center text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]"
              style={{
                left: Math.max(12, drag.currentX - Math.round(chrome.floatingGhostWidth / 2)),
                top: Math.max(48, drag.currentY - 14),
                width: chrome.floatingGhostWidth,
                height: chrome.floatingGhostHeight,
              }}
            >
              Плавающее окно
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});
DockDropOverlay.displayName = 'DockDropOverlay';
