import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, Layers, Lock, Unlock } from 'lucide-react';
import {
  CAD_LAYER_DEFS,
  CAD_LAYER_ORDER,
  resolveCadLayers,
  summarizeCadLayers,
} from '../core/cadLayers';
import type { CadLayerId, CadLayerStateMap } from '../core/e3Types';

interface LayerManagerPopoverProps {
  open: boolean;
  layers?: CadLayerStateMap;
  entityCounts?: Record<CadLayerId, number>;
  align?: 'left' | 'right';
  anchorRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onToggleVisibility: (layerId: CadLayerId) => void;
  onToggleLock: (layerId: CadLayerId) => void;
  onShowAll: () => void;
  onUnlockAll: () => void;
}

export const LayerManagerPopover: React.FC<LayerManagerPopoverProps> = ({
  open,
  layers,
  entityCounts,
  align = 'right',
  anchorRef,
  onClose,
  onToggleVisibility,
  onToggleLock,
  onShowAll,
  onUnlockAll,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        target instanceof Element &&
        target.closest('[data-testid="toolbar-layers-btn"], [data-testid="ribbon-view-layers-btn"]')
      ) {
        return;
      }
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        !(anchorRef?.current && anchorRef.current.contains(target))
      ) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, onClose, anchorRef]);

  const resolved = resolveCadLayers(layers);
  const summary = summarizeCadLayers(resolved);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label="Диспетчер слоёв чертежа"
          data-testid="layer-manager-popover"
          onMouseDown={(e) => e.stopPropagation()}
          initial={{ opacity: 0, y: -4, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.985 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className={`absolute top-full mt-1.5 z-50 w-[calc(332px*var(--flux-ui-scale))] max-w-[calc(100vw-16px)] rounded-2xl border border-[var(--flux-line-strong)] flux-glass-popover overflow-hidden select-none text-[length:calc(11.5px*var(--flux-ui-scale))] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Header */}
          <div className="px-3 h-8 border-b border-[var(--flux-line)] flux-glass-bar flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />
              <span className="font-semibold text-[var(--flux-text)] truncate tracking-[-0.01em]">
                Диспетчер слоёв чертежа
              </span>
            </div>
            <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
              {summary.visibleCount}/{summary.total} вид.
              {summary.lockedCount > 0 ? ` · ${summary.lockedCount} забл.` : ''}
            </span>
          </div>

          {/* Column Headers */}
          <div className="px-2.5 py-1 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] grid grid-cols-[calc(28px*var(--flux-ui-scale))_1fr_calc(38px*var(--flux-ui-scale))_calc(28px*var(--flux-ui-scale))] items-center gap-1.5 text-[length:calc(10px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] tracking-wide">
            <span className="text-center" title="Видимость (Вкл / Выкл)">Вид.</span>
            <span>Слой / DXF</span>
            <span className="text-right" title="Объектов на активном листе">Эл.</span>
            <span className="text-center" title="Блокировка редактирования">Зам.</span>
          </div>

          {/* Layer Rows */}
          <div className="divide-y divide-[var(--flux-line)]">
            {CAD_LAYER_ORDER.map((id) => {
              const meta = CAD_LAYER_DEFS[id];
              const state = resolved[id];
              const count = entityCounts ? entityCounts[id] : undefined;
              return (
                <div
                  key={id}
                  data-testid={`layer-row-${id}`}
                  className={`px-2.5 py-1.5 grid grid-cols-[calc(28px*var(--flux-ui-scale))_1fr_calc(38px*var(--flux-ui-scale))_calc(28px*var(--flux-ui-scale))] items-center gap-1.5 transition-colors hover:bg-[var(--flux-hover)] ${
                    !state.visible ? 'opacity-60' : ''
                  }`}
                >
                  {/* Visibility Toggle */}
                  <button
                    type="button"
                    data-testid={`layer-vis-${id}`}
                    aria-label={
                      state.visible
                        ? `Скрыть слой «${meta.name}»`
                        : `Показать слой «${meta.name}»`
                    }
                    aria-pressed={state.visible}
                    title={state.visible ? 'Скрыть слой (Вкл)' : 'Показать слой (Выкл)'}
                    onClick={() => onToggleVisibility(id)}
                    className={`inline-flex items-center justify-center w-6 h-5 rounded-[2px] border transition-colors ${
                      state.visible
                        ? 'border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)] hover:border-[var(--flux-line-strong)]'
                        : 'border-dashed border-[var(--flux-line-strong)] bg-transparent text-[var(--flux-text-muted)]'
                    }`}
                  >
                    {state.visible ? (
                      <Eye className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {/* Layer Name, Color Swatch & AutoCAD DXF Code */}
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="w-2.5 h-2.5 rounded-xs shrink-0 border border-black/15"
                      style={{ backgroundColor: state.visible ? meta.swatch : 'transparent' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[length:calc(12px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] truncate leading-tight">
                        {meta.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-[length:calc(10px*var(--flux-ui-scale))] font-mono text-[var(--flux-text-muted)] leading-tight mt-0.5">
                        <span className="truncate">{meta.dxfPrimary}</span>
                        {state.locked && (
                          <span className="text-amber-600 dark:text-amber-400 font-sans font-medium">
                            · заблокирован
                          </span>
                        )}
                        {!state.visible && (
                          <span className="text-slate-500 font-sans">· скрыт</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Count */}
                  <span className="font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-right text-[var(--flux-text-muted)]">
                    {count ?? '—'}
                  </span>

                  {/* Lock Toggle */}
                  <button
                    type="button"
                    data-testid={`layer-lock-${id}`}
                    aria-label={
                      state.locked
                        ? `Разблокировать слой «${meta.name}»`
                        : `Заблокировать слой «${meta.name}»`
                    }
                    aria-pressed={state.locked}
                    title={
                      state.locked
                        ? 'Слой заблокирован — нажмите для разблокировки'
                        : 'Заблокировать слой от изменений'
                    }
                    onClick={() => onToggleLock(id)}
                    className={`inline-flex items-center justify-center w-6 h-5 rounded-[2px] border transition-colors ${
                      state.locked
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400'
                        : 'border-transparent text-[var(--flux-text-muted)] hover:border-[var(--flux-line)] hover:bg-[var(--flux-surface-alt)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    {state.locked ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer Quick Actions */}
          <div className="px-2.5 py-1.5 border-t border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex items-center justify-between gap-2">
            <button
              type="button"
              data-testid="layers-show-all-btn"
              disabled={summary.hiddenCount === 0}
              onClick={onShowAll}
              className="h-6 px-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] disabled:opacity-40 transition-colors"
            >
              Показать все
            </button>
            <button
              type="button"
              data-testid="layers-unlock-all-btn"
              disabled={summary.lockedCount === 0}
              onClick={onUnlockAll}
              className="h-6 px-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] disabled:opacity-40 transition-colors"
            >
              Разблокировать все
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
