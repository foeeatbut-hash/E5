import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Cable,
  Check,
  AlertTriangle,
  XCircle,
  Eye,
  EyeOff,
  Layers,
  Lock,
  LockOpen,
  PencilRuler,
  ShieldCheck,
  X,
} from 'lucide-react';
import { CAD_LAYER_DEFS, CAD_LAYER_ORDER } from '../core/cadLayers';
import type { CadLayerId, CadLayerStateMap } from '../core/e3Types';

export type WorkspaceMode = 'draft' | 'wiring' | 'layers' | 'qa';

export interface QaChecklistItem {
  id: string;
  label: string;
  count: number;
  status: 'ok' | 'warn' | 'error';
  onClick?: () => void;
}

interface ModeRailProps {
  mode: WorkspaceMode;
  onChangeMode: (mode: WorkspaceMode) => void;
  ercErrorCount: number;
  layers: CadLayerStateMap;
  soloLayer: CadLayerId | null;
  onToggleSolo: (layerId: CadLayerId) => void;
  onToggleLayerVisibility: (layerId: CadLayerId) => void;
  onToggleLayerLock: (layerId: CadLayerId) => void;
  onShowAllLayers: () => void;
  onUnlockAllLayers: () => void;
  showGrid?: boolean;
  snapToGrid?: boolean;
  onToggleGrid?: () => void;
  onToggleSnap?: () => void;
  qaItems: QaChecklistItem[];
  onPublish: () => void;
}

const MODES: Array<{ id: WorkspaceMode; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { id: 'draft', label: 'Схема', Icon: PencilRuler },
  { id: 'wiring', label: 'Клеммы и ПЛК', Icon: Cable },
  { id: 'layers', label: 'Слои и вид', Icon: Layers },
  { id: 'qa', label: 'Проверка и выпуск', Icon: ShieldCheck },
];

const ease = [0.22, 1, 0.36, 1] as const;

const iconBtn =
  'inline-flex items-center justify-center w-[calc(22px*var(--flux-ui-scale))] h-[calc(22px*var(--flux-ui-scale))] rounded-[4px] transition-colors shrink-0';

const QaStatusIcon: React.FC<{ status: QaChecklistItem['status'] }> = ({ status }) => {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-500 shrink-0">
        <Check className="w-3 h-3" strokeWidth={2} />
      </span>
    );
  }
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={1.6} />;
  return <XCircle className="w-4 h-4 text-red-500 shrink-0" strokeWidth={1.6} />;
};

export const ModeRail: React.FC<ModeRailProps> = ({
  mode,
  onChangeMode,
  ercErrorCount,
  layers,
  soloLayer,
  onToggleSolo,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onShowAllLayers,
  onUnlockAllLayers,
  showGrid,
  snapToGrid,
  onToggleGrid,
  onToggleSnap,
  qaItems,
  onPublish,
}) => {
  const flyoutOpen = mode === 'layers' || mode === 'qa';
  const doneCount = qaItems.filter((i) => i.status === 'ok').length;
  const progress = qaItems.length ? (doneCount / qaItems.length) * 100 : 0;

  return (
    <div className="flex shrink-0 min-h-0" data-testid="mode-rail-shell">
      <nav
        aria-label="Режимы работы"
        data-testid="mode-rail"
        className="w-[calc(40px*var(--flux-ui-scale))] shrink-0 flex flex-col items-center gap-1 py-2 border-r border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
      >
        {MODES.map(({ id, label, Icon }) => {
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={active}
              data-testid={`mode-rail-${id}`}
              onClick={() => onChangeMode(id)}
              className={`relative inline-flex items-center justify-center w-[calc(32px*var(--flux-ui-scale))] h-[calc(32px*var(--flux-ui-scale))] rounded-[6px] transition-colors ${
                active
                  ? 'text-[var(--flux-accent)]'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="mode-rail-active"
                  className="absolute inset-0 rounded-[6px] bg-[var(--flux-accent-soft)]"
                  transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                >
                  <span className="absolute left-[calc(-4px*var(--flux-ui-scale))] top-1.5 bottom-1.5 w-[2px] rounded-full bg-[var(--flux-accent)]" />
                </motion.span>
              )}
              <Icon className="relative w-[18px] h-[18px]" strokeWidth={1.6} />
              {id === 'qa' && ercErrorCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-red-500 text-white text-[9px] leading-[14px] font-mono tabular-nums text-center">
                  {ercErrorCount > 99 ? '99+' : ercErrorCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <AnimatePresence initial={false}>
        {flyoutOpen && (
          <motion.aside
            key="mode-flyout"
            data-testid={`mode-flyout-${mode}`}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.15, ease }}
            className="w-[calc(232px*var(--flux-ui-scale))] shrink-0 flex flex-col min-h-0 border-r border-[var(--flux-line)] bg-[var(--flux-surface)] overflow-hidden"
          >
            <header className="flex items-center justify-between h-[calc(32px*var(--flux-ui-scale))] px-3 border-b border-[var(--flux-line)] shrink-0">
              <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] truncate">
                {mode === 'layers' ? 'Слои и вид' : 'Готовность к выпуску'}
              </span>
              <button
                type="button"
                title="Закрыть"
                aria-label="Закрыть панель"
                onClick={() => onChangeMode('draft')}
                className={`${iconBtn} text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]`}
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.6} />
              </button>
            </header>

            {mode === 'layers' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
                {CAD_LAYER_ORDER.map((id) => {
                  const st = layers[id];
                  const solo = soloLayer === id;
                  return (
                    <div
                      key={id}
                      className="flex items-center gap-1.5 px-1.5 h-[calc(30px*var(--flux-ui-scale))] rounded-[4px] hover:bg-[var(--flux-hover)]"
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: CAD_LAYER_DEFS[id].swatch, opacity: st.visible ? 1 : 0.35 }}
                      />
                      <span
                        className={`flex-1 min-w-0 truncate text-[length:calc(11px*var(--flux-ui-scale))] ${
                          st.visible ? 'text-[var(--flux-text)]' : 'text-[var(--flux-text-muted)]'
                        }`}
                        title={CAD_LAYER_DEFS[id].name}
                      >
                        {CAD_LAYER_DEFS[id].shortName}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleSolo(id)}
                        title="Показать только этот слой"
                        aria-pressed={solo}
                        className={`px-1.5 h-[calc(20px*var(--flux-ui-scale))] rounded-[4px] text-[length:calc(10px*var(--flux-ui-scale))] transition-colors ${
                          solo
                            ? 'bg-[var(--flux-accent-soft)] text-[var(--flux-accent)]'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-sel)]'
                        }`}
                      >
                        Solo
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleLayerVisibility(id)}
                        title={st.visible ? 'Скрыть слой' : 'Показать слой'}
                        aria-label={st.visible ? 'Скрыть слой' : 'Показать слой'}
                        className={`${iconBtn} ${st.visible ? 'text-[var(--flux-text-muted)]' : 'text-[var(--flux-accent)]'} hover:bg-[var(--flux-sel)]`}
                      >
                        {st.visible ? (
                          <Eye className="w-3.5 h-3.5" strokeWidth={1.6} />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" strokeWidth={1.6} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleLayerLock(id)}
                        title={st.locked ? 'Разблокировать слой' : 'Заблокировать слой'}
                        aria-label={st.locked ? 'Разблокировать слой' : 'Заблокировать слой'}
                        className={`${iconBtn} ${st.locked ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'} hover:bg-[var(--flux-sel)]`}
                      >
                        {st.locked ? (
                          <Lock className="w-3.5 h-3.5" strokeWidth={1.6} />
                        ) : (
                          <LockOpen className="w-3.5 h-3.5" strokeWidth={1.6} />
                        )}
                      </button>
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5 mt-1 px-1">
                  <button
                    type="button"
                    onClick={onShowAllLayers}
                    className="flex-1 h-[calc(24px*var(--flux-ui-scale))] rounded-[4px] border border-[var(--flux-line)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
                  >
                    Показать все
                  </button>
                  <button
                    type="button"
                    onClick={onUnlockAllLayers}
                    className="flex-1 h-[calc(24px*var(--flux-ui-scale))] rounded-[4px] border border-[var(--flux-line)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
                  >
                    Разблокировать
                  </button>
                </div>

                {(onToggleGrid || onToggleSnap) && (
                  <div className="mt-3 pt-2 border-t border-[var(--flux-line)] flex flex-col gap-1">
                    <span className="px-1.5 text-[length:calc(10px*var(--flux-ui-scale))] uppercase tracking-wide text-[var(--flux-text-muted)]">
                      Вид
                    </span>
                    {onToggleGrid && (
                      <button
                        type="button"
                        onClick={onToggleGrid}
                        aria-pressed={!!showGrid}
                        className="flex items-center justify-between px-1.5 h-[calc(26px*var(--flux-ui-scale))] rounded-[4px] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                      >
                        Сетка (F9)
                        <span className={showGrid ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'}>
                          {showGrid ? 'вкл' : 'выкл'}
                        </span>
                      </button>
                    )}
                    {onToggleSnap && (
                      <button
                        type="button"
                        onClick={onToggleSnap}
                        aria-pressed={!!snapToGrid}
                        className="flex items-center justify-between px-1.5 h-[calc(26px*var(--flux-ui-scale))] rounded-[4px] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                      >
                        Привязка (F3)
                        <span className={snapToGrid ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'}>
                          {snapToGrid ? 'вкл' : 'выкл'}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="px-3 pt-2.5 pb-2 border-b border-[var(--flux-line)] shrink-0">
                  <div className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] font-mono tabular-nums">
                    {doneCount} из {qaItems.length} готово
                  </div>
                  <div className="mt-1.5 h-[3px] rounded-full bg-[var(--flux-line)] overflow-hidden">
                    <motion.div
                      className="h-full bg-[var(--flux-accent)]"
                      initial={false}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.25, ease }}
                    />
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-0.5">
                  {qaItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.onClick}
                      className="flex items-center gap-2 px-1.5 h-[calc(30px*var(--flux-ui-scale))] rounded-[4px] text-left hover:bg-[var(--flux-hover)] transition-colors"
                    >
                      <QaStatusIcon status={item.status} />
                      <span className="flex-1 min-w-0 truncate text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]">
                        {item.label}
                      </span>
                      <span className="font-mono tabular-nums text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="p-2 border-t border-[var(--flux-line)] shrink-0">
                  <button
                    type="button"
                    onClick={onPublish}
                    className="w-full h-[calc(28px*var(--flux-ui-scale))] rounded-[4px] bg-[var(--flux-accent-solid)] text-white text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium hover:brightness-110 transition"
                  >
                    Выпуск PDF / DXF
                  </button>
                </div>
              </>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
};
