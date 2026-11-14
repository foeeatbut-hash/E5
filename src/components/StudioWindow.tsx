import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue } from 'motion/react';
import { GripHorizontal, RotateCcw, X } from 'lucide-react';

export type StudioWindowVariant = 'floating' | 'drawer' | 'spotlight';

interface StudioWindowProps {
  open: boolean;
  onClose: () => void;
  variant?: StudioWindowVariant;
  title?: string;
  titleId?: string;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  maxWidthClass?: string;
  heightClass?: string;
  testId?: string;
  closeDisabled?: boolean;
  closeAriaLabel?: string;
  closeTestId?: string;
  hideHeader?: boolean;
  children: React.ReactNode;
}

/**
 * Modern 2026 iOS 27 Glassmorphic Studio Window.
 * Dragging is driven exclusively via Framer Motion values (dragX / dragY) on an outer translation
 * wrapper, completely decoupled from entrance/exit opacity & scale transitions to eliminate release
 * snap-back and frame jitter at any UI scale.
 */
export const StudioWindow: React.FC<StudioWindowProps> = ({
  open,
  onClose,
  variant = 'floating',
  title,
  titleId,
  icon,
  subtitle,
  headerExtra,
  maxWidthClass = 'max-w-3xl',
  heightClass = 'max-h-[88vh]',
  testId,
  closeDisabled = false,
  closeAriaLabel = 'Закрыть окно',
  closeTestId,
  hideHeader = false,
  children,
}) => {
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const [hasMoved, setHasMoved] = useState(false);
  const panelElRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    minDx: number;
    maxDx: number;
    minDy: number;
    maxDy: number;
    moved: boolean;
  } | null>(null);

  const resetPosition = useCallback(() => {
    dragX.set(0);
    dragY.set(0);
    setHasMoved(false);
  }, [dragX, dragY]);

  useEffect(() => {
    if (!open) {
      resetPosition();
      dragRef.current = null;
    }
  }, [open, resetPosition]);

  useEffect(() => {
    if (!open || variant !== 'floating') return;
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || (e.pointerId !== d.pointerId && e.pointerId !== 0)) return;
      const nx = Math.max(d.minDx, Math.min(d.maxDx, d.origX + (e.clientX - d.startX)));
      const ny = Math.max(d.minDy, Math.min(d.maxDy, d.origY + (e.clientY - d.startY)));
      dragX.set(nx);
      dragY.set(ny);
      if (!d.moved && (Math.abs(e.clientX - d.startX) > 2 || Math.abs(e.clientY - d.startY) > 2)) {
        d.moved = true;
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || (e.pointerId !== d.pointerId && e.pointerId !== 0)) return;
      dragRef.current = null;
      if (d.moved) {
        setHasMoved(dragX.get() !== 0 || dragY.get() !== 0);
      }
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [open, variant, dragX, dragY]);

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (variant !== 'floating' || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [role="tab"]')) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic pointer events in tests
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const el = panelElRef.current;
    const panelW = el?.offsetWidth || Math.min(720, vw - 24);
    const panelH = el?.offsetHeight || Math.min(540, vh - 40);
    const maxFreeX = Math.max(0, Math.floor((vw - panelW) / 2) - 10);
    const maxFreeY = Math.max(0, Math.floor((vh - panelH) / 2) - 10);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: dragX.get(),
      origY: dragY.get(),
      minDx: -maxFreeX,
      maxDx: maxFreeX,
      minDy: -maxFreeY,
      maxDy: maxFreeY,
      moved: false,
    };
  };

  const wrapperClass =
    variant === 'drawer'
      ? 'fixed inset-0 z-50 flex items-stretch justify-end p-2.5 pt-[calc(76px*var(--flux-ui-scale))] pb-9 pointer-events-auto bg-transparent'
      : variant === 'spotlight'
        ? 'fixed inset-0 z-50 flex items-start justify-center pt-[calc(84px*var(--flux-ui-scale))] px-4 pointer-events-auto bg-transparent'
        : 'fixed inset-0 z-50 flex items-center justify-center p-3 pointer-events-auto bg-transparent';

  const panelBaseClass =
    variant === 'drawer'
      ? `w-full ${maxWidthClass} h-full rounded-2xl border border-[var(--flux-line-strong)] flux-glass-modal flex flex-col overflow-hidden pointer-events-auto`
      : variant === 'spotlight'
        ? `w-full ${maxWidthClass} max-h-[calc(100vh-100px)] rounded-2xl border border-[var(--flux-line-strong)] flux-glass-modal flex flex-col overflow-hidden pointer-events-auto`
        : `w-full ${maxWidthClass} ${heightClass} rounded-2xl border border-[var(--flux-line-strong)] flux-glass-modal flex flex-col overflow-hidden pointer-events-auto`;

  const initialAnim =
    variant === 'drawer'
      ? { opacity: 0, x: 20, scale: 0.99 }
      : variant === 'spotlight'
        ? { opacity: 0, y: -8, scale: 0.99 }
        : { opacity: 0, scale: 0.985 };

  const animateAnim =
    variant === 'drawer'
      ? { opacity: 1, x: 0, scale: 1 }
      : variant === 'spotlight'
        ? { opacity: 1, y: 0, scale: 1 }
        : { opacity: 1, scale: 1 };

  const exitAnim =
    variant === 'drawer'
      ? { opacity: 0, x: 16, scale: 0.99 }
      : variant === 'spotlight'
        ? { opacity: 0, y: -6, scale: 0.99 }
        : { opacity: 0, scale: 0.985 };

  const panelCard = (
    <motion.div
      ref={panelElRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      initial={initialAnim}
      animate={animateAnim}
      exit={exitAnim}
      transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
      style={{ maxHeight: 'calc(100vh - 24px)' }}
      onMouseDown={(e) => e.stopPropagation()}
      className={panelBaseClass}
    >
      {!hideHeader && (
        <div
          data-testid={testId ? `${testId}-drag-handle` : undefined}
          onPointerDown={startDrag}
          onDoubleClick={() => {
            if (variant === 'floating') resetPosition();
          }}
          title={variant === 'floating' ? 'Перетащите заголовок для перемещения окна' : undefined}
          className={`px-3.5 h-10 border-b border-[var(--flux-line)] flux-glass-bar flex items-center justify-between gap-2.5 shrink-0 select-none ${
            variant === 'floating' ? 'cursor-grab active:cursor-grabbing' : ''
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {variant === 'floating' && (
              <GripHorizontal className="w-3.5 h-3.5 text-[var(--flux-text-muted)]/60 shrink-0" />
            )}
            {icon && <span className="shrink-0 flex items-center">{icon}</span>}
            {title && (
              <h2
                id={titleId}
                className="text-[length:calc(13px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate tracking-[-0.01em]"
              >
                {title}
              </h2>
            )}
            {subtitle && <span className="shrink-0 flex items-center">{subtitle}</span>}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {headerExtra}
            {variant === 'floating' && hasMoved && (
              <button
                type="button"
                onClick={resetPosition}
                title="Вернуть окно в центр"
                aria-label="Вернуть окно в центр"
                className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              data-testid={closeTestId}
              disabled={closeDisabled}
              onClick={onClose}
              aria-label={closeAriaLabel}
              className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-40 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      {children}
    </motion.div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          data-testid={testId ? `${testId}-backdrop` : undefined}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !closeDisabled) onClose();
          }}
          className={wrapperClass}
        >
          {variant === 'floating' ? (
            <motion.div
              data-testid={testId ? `${testId}-positioner` : undefined}
              style={{ x: dragX, y: dragY }}
              className="w-full max-w-[calc(100vw-24px)] min-w-0 flex items-center justify-center pointer-events-none"
            >
              {panelCard}
            </motion.div>
          ) : (
            <div
              className={`w-full max-w-[calc(100vw-24px)] min-w-0 h-full flex pointer-events-none ${
                variant === 'drawer' ? 'items-stretch justify-end' : 'items-start justify-center'
              }`}
            >
              {panelCard}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
