import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
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
 * Never darkens or blurs the live CAD schematic behind it: uses crisp transparent framing
 * with frosted glass surface refraction (`backdrop-filter: blur(12px) saturate(180%)`).
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
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  offsetRef.current = offset;
  const panelElRef = useRef<HTMLDivElement | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    liveX: number;
    liveY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setOffset({ x: 0, y: 0 });
      offsetRef.current = { x: 0, y: 0 };
      if (dragRafRef.current) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open || variant !== 'floating') return;
    const applyLiveTransform = (nx: number, ny: number) => {
      const el = panelElRef.current;
      if (el) {
        el.style.transform = `translate3d(${nx}px, ${ny}px, 0)`;
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const maxX = Math.max(120, Math.round(window.innerWidth * 0.42));
      const maxY = Math.max(80, Math.round(window.innerHeight * 0.38));
      d.liveX = Math.max(-maxX, Math.min(maxX, d.origX + (e.clientX - d.startX)));
      d.liveY = Math.max(-maxY, Math.min(maxY, d.origY + (e.clientY - d.startY)));
      d.moved = true;
      if (!dragRafRef.current) {
        dragRafRef.current = window.requestAnimationFrame(() => {
          dragRafRef.current = null;
          const activeDrag = dragRef.current;
          if (activeDrag) applyLiveTransform(activeDrag.liveX, activeDrag.liveY);
        });
      }
    };
    const onPointerUp = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (dragRafRef.current) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      if (d?.moved) {
        applyLiveTransform(d.liveX, d.liveY);
        setOffset({ x: d.liveX, y: d.liveY });
      }
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (dragRafRef.current) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
    };
  }, [open, variant]);

  const startDrag = (e: React.PointerEvent) => {
    if (variant !== 'floating') return;
    if ((e.target as HTMLElement).closest('button, input, select, a, [role="tab"]')) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: offsetRef.current.x,
      origY: offsetRef.current.y,
      liveX: offsetRef.current.x,
      liveY: offsetRef.current.y,
      moved: false,
    };
  };

  const wrapperClass =
    variant === 'drawer'
      ? 'fixed inset-0 z-50 flex items-stretch justify-end p-2.5 pt-[76px] pb-9 pointer-events-auto bg-transparent'
      : variant === 'spotlight'
        ? 'fixed inset-0 z-50 flex items-start justify-center pt-[84px] px-4 pointer-events-auto bg-transparent'
        : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 pointer-events-auto bg-transparent';

  const panelBaseClass =
    variant === 'drawer'
      ? `w-full ${maxWidthClass} h-full rounded-2xl border border-[var(--flux-line-strong)] flux-glass-modal flex flex-col overflow-hidden`
      : variant === 'spotlight'
        ? `w-full ${maxWidthClass} rounded-2xl border border-[var(--flux-line-strong)] flux-glass-modal flex flex-col overflow-hidden`
        : `w-full ${maxWidthClass} ${heightClass} rounded-2xl border border-[var(--flux-line-strong)] flux-glass-modal flex flex-col overflow-hidden`;

  const initialAnim =
    variant === 'drawer'
      ? { opacity: 0, x: 20, scale: 0.99 }
      : variant === 'spotlight'
        ? { opacity: 0, y: -8, scale: 0.99 }
        : { opacity: 0, y: 8, scale: 0.99 };

  const animateAnim =
    variant === 'drawer'
      ? { opacity: 1, x: 0, scale: 1 }
      : variant === 'spotlight'
        ? { opacity: 1, y: 0, scale: 1 }
        : { opacity: 1, y: offset.y, x: offset.x, scale: 1 };

  const exitAnim =
    variant === 'drawer'
      ? { opacity: 0, x: 16, scale: 0.99 }
      : variant === 'spotlight'
        ? { opacity: 0, y: -6, scale: 0.99 }
        : { opacity: 0, y: 5, scale: 0.99 };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          data-testid={testId}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !closeDisabled) onClose();
          }}
          className={wrapperClass}
        >
          <motion.div
            ref={panelElRef}
            initial={initialAnim}
            animate={animateAnim}
            exit={exitAnim}
            transition={{ duration: 0.13, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(e) => e.stopPropagation()}
            className={panelBaseClass}
          >
            {!hideHeader && (
              <div
                onPointerDown={startDrag}
                onDoubleClick={() => {
                  if (variant === 'floating') setOffset({ x: 0, y: 0 });
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
                      className="text-[13px] font-semibold text-[var(--flux-text)] truncate tracking-[-0.01em]"
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && <span className="shrink-0 flex items-center">{subtitle}</span>}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {headerExtra}
                  {variant === 'floating' && (offset.x !== 0 || offset.y !== 0) && (
                    <button
                      type="button"
                      onClick={() => setOffset({ x: 0, y: 0 })}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
