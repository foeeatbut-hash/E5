import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, Cpu, Hash, Spline } from 'lucide-react';
import { StudioWindow } from './StudioWindow';
import type { E3Project } from '../core/e3Types';
import {
  type DeviceScanOrder,
  type NumberingScope,
  previewAutoNumberDevicesGost,
  previewAutoNumberWiresGost,
  type WireNumberingMode,
} from '../core/gostNumbering';

interface AutoNumberingModalProps {
  open: boolean;
  project: E3Project;
  activeSheetId: string;
  onClose: () => void;
  onApplyWires: (nextProject: E3Project, changesCount: number, modeLabel: string) => void;
  onApplyDevices: (nextProject: E3Project, changesCount: number, orderLabel: string) => void;
}

export const AutoNumberingModal: React.FC<AutoNumberingModalProps> = ({
  open,
  project,
  activeSheetId,
  onClose,
  onApplyWires,
  onApplyDevices,
}) => {
  const [tab, setTab] = useState<'wires' | 'devices'>('wires');

  // Wire numbering options
  const [wireScope, setWireScope] = useState<NumberingScope>('active-sheet');
  const [wireMode, setWireMode] = useState<WireNumberingMode>('sheet-seq');
  const [preservePowerPhases, setPreservePowerPhases] = useState<boolean>(true);

  // Device OUO options
  const [devScope, setDevScope] = useState<NumberingScope>('active-sheet');
  const [devOrder, setDevOrder] = useState<DeviceScanOrder>('top-to-bottom');
  const [prefixFilter, setPrefixFilter] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const wirePreview = useMemo(
    () =>
      previewAutoNumberWiresGost(project, {
        scope: wireScope,
        activeSheetId,
        mode: wireMode,
        preservePowerPhases,
      }),
    [project, wireScope, activeSheetId, wireMode, preservePowerPhases]
  );

  const devicePreview = useMemo(
    () =>
      previewAutoNumberDevicesGost(project, {
        scope: devScope,
        activeSheetId,
        order: devOrder,
        prefixFilter: prefixFilter.trim() || undefined,
      }),
    [project, devScope, activeSheetId, devOrder, prefixFilter]
  );

  const wireModeLabels: Record<WireNumberingMode, string> = {
    'sheet-seq': 'По номеру листа (101, 102…)',
    'zone-seq': 'По зоне ГОСТ (1А1-1, 1Б2-1…)',
    potential: 'По потенциалу (Ц001, Ц002…)',
  };

  return (
    <StudioWindow
      open={open}
      onClose={onClose}
      variant="floating"
      maxWidthClass="max-w-3xl"
      heightClass="max-h-[90vh]"
      title="Пакетная автонумерация по ГОСТ 2.710"
      titleId="autonum-modal-title"
      icon={<Hash className="w-4 h-4 text-[var(--flux-accent)]" />}
      testId="auto-numbering-modal"
      closeAriaLabel="Закрыть окно автонумерации"
    >

            {/* Sub-tabs */}
            <div className="px-3 py-1.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center shrink-0">
              <div className="inline-flex divide-x divide-[var(--flux-line)] border border-[var(--flux-line)] rounded-[2px] overflow-hidden bg-[var(--flux-bg)]">
                <button
                  type="button"
                  data-testid="autonum-tab-wires"
                  onClick={() => setTab('wires')}
                  className={`h-7 px-3 text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                    tab === 'wires'
                      ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-semibold'
                      : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                  }`}
                >
                  <Spline className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Цепи и провода</span>
                  <span className="font-mono tabular-nums text-[10.5px] opacity-80">
                    ({wirePreview.changes.length})
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="autonum-tab-devices"
                  onClick={() => setTab('devices')}
                  className={`h-7 px-3 text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                    tab === 'devices'
                      ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-semibold'
                      : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>ОУО изделий (-QF?, -KM?)</span>
                  <span className="font-mono tabular-nums text-[10.5px] opacity-80">
                    ({devicePreview.changes.length})
                  </span>
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
            {tab === 'wires' ? (
              <motion.div
                key="autonum-wires"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
              >
                <div className="p-4 border-b border-[var(--flux-line)] space-y-3 shrink-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="autonum-wire-scope"
                        className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                      >
                        Область нумерации
                      </label>
                      <select
                        id="autonum-wire-scope"
                        data-testid="autonum-wire-scope"
                        value={wireScope}
                        onChange={(e) => setWireScope(e.target.value as NumberingScope)}
                        className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                      >
                        <option value="active-sheet">Только активный лист</option>
                        <option value="all-sheets">Все листы проекта ({project.sheets.length})</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="autonum-wire-mode"
                        className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                      >
                        Формат маркировки по ГОСТ
                      </label>
                      <select
                        id="autonum-wire-mode"
                        data-testid="autonum-wire-mode"
                        value={wireMode}
                        onChange={(e) => setWireMode(e.target.value as WireNumberingMode)}
                        className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                      >
                        <option value="sheet-seq">{wireModeLabels['sheet-seq']}</option>
                        <option value="zone-seq">{wireModeLabels['zone-seq']}</option>
                        <option value="potential">{wireModeLabels['potential']}</option>
                      </select>
                    </div>
                  </div>

                  <label className="inline-flex items-center gap-2 text-[12px] text-[var(--flux-text)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      data-testid="autonum-preserve-phases"
                      checked={preservePowerPhases}
                      onChange={(e) => setPreservePowerPhases(e.target.checked)}
                      className="rounded border-[var(--flux-line)]"
                    />
                    <span>Сохранять стандартные обозначения питания и фаз (L1, L2, L3, N, PE, +24V, 0V)</span>
                  </label>
                </div>

                <div className="px-4 py-2 bg-[var(--flux-surface)] border-b border-[var(--flux-line)] flex items-center justify-between text-[11.5px] shrink-0">
                  <span className="font-medium text-[var(--flux-text)]">
                    Предпросмотр изменений маркировки проводов
                  </span>
                  <span
                    data-testid="autonum-wire-count"
                    className="font-mono tabular-nums text-[var(--flux-accent)] font-semibold"
                  >
                    Изменится: {wirePreview.changes.length}
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-auto bg-[var(--flux-surface)]">
                  {wirePreview.changes.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-[var(--flux-text-muted)]">
                      Все провода в выбранной области уже соответствуют выбранному формату ГОСТ.
                    </div>
                  ) : (
                    <table
                      data-testid="autonum-wire-preview-table"
                      className="w-full border-collapse text-[11.5px]"
                    >
                      <thead className="sticky top-0 z-10 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                        <tr>
                          <th className="px-3 py-1.5 text-left">Лист</th>
                          <th className="px-3 py-1.5 text-left">Цепь (Потенциал)</th>
                          <th className="px-3 py-1.5 text-right">Было</th>
                          <th className="w-6 px-1 py-1.5 text-center" />
                          <th className="px-3 py-1.5 text-left">Станет</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--flux-line)]">
                        {wirePreview.changes.map((c) => (
                          <tr key={c.wireId} className="hover:bg-[var(--flux-hover)]">
                            <td className="px-3 py-1.5 font-mono text-[var(--flux-text-muted)]">
                              Л.{c.sheetNumber}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[var(--flux-text)]">
                              {c.netName}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-[var(--flux-text-muted)]">
                              {c.oldNumber}
                            </td>
                            <td className="px-1 py-1.5 text-center text-[var(--flux-text-muted)]">
                              <ArrowRight className="w-3 h-3 inline" />
                            </td>
                            <td className="px-3 py-1.5 font-mono font-semibold text-[var(--flux-accent)]">
                              {c.newNumber}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="px-4 py-3 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 px-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] text-[var(--flux-text)]"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    data-testid="autonum-apply-wires-btn"
                    disabled={wirePreview.changes.length === 0}
                    onClick={() => {
                      onApplyWires(
                        wirePreview.nextProject,
                        wirePreview.changes.length,
                        wireModeLabels[wireMode]
                      );
                      onClose();
                    }}
                    className="h-8 px-3.5 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Применить нумерацию цепей ({wirePreview.changes.length})</span>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="autonum-devices"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
              >
                <div className="p-4 border-b border-[var(--flux-line)] grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
                  <div>
                    <label
                      htmlFor="autonum-dev-scope"
                      className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                    >
                      Область переиндексации
                    </label>
                    <select
                      id="autonum-dev-scope"
                      data-testid="autonum-dev-scope"
                      value={devScope}
                      onChange={(e) => setDevScope(e.target.value as NumberingScope)}
                      className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                    >
                      <option value="active-sheet">Только активный лист</option>
                      <option value="all-sheets">Все листы проекта ({project.sheets.length})</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="autonum-dev-order"
                      className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                    >
                      Порядок обхода по ГОСТ
                    </label>
                    <select
                      id="autonum-dev-order"
                      data-testid="autonum-dev-order"
                      value={devOrder}
                      onChange={(e) => setDevOrder(e.target.value as DeviceScanOrder)}
                      className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                    >
                      <option value="top-to-bottom">Сверху вниз → слева направо</option>
                      <option value="left-to-right">Слева направо → сверху вниз</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="autonum-dev-prefix"
                      className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                    >
                      Фильтр буквенного кода
                    </label>
                    <input
                      id="autonum-dev-prefix"
                      data-testid="autonum-dev-prefix"
                      type="text"
                      spellCheck={false}
                      value={prefixFilter}
                      onChange={(e) => setPrefixFilter(e.target.value)}
                      placeholder="Все (или QF, KM, XT…)"
                      className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                    />
                  </div>
                </div>

                <div className="px-4 py-2 bg-[var(--flux-surface)] border-b border-[var(--flux-line)] flex items-center justify-between text-[11.5px] shrink-0">
                  <span className="font-medium text-[var(--flux-text)]">
                    Предпросмотр переиндексации ОУО (с обновлением кабельного журнала)
                  </span>
                  <span
                    data-testid="autonum-dev-count"
                    className="font-mono tabular-nums text-[var(--flux-accent)] font-semibold"
                  >
                    Переименуется: {devicePreview.changes.length}
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-auto bg-[var(--flux-surface)]">
                  {devicePreview.changes.length === 0 ? (
                    <div className="p-6 text-center text-[12px] text-[var(--flux-text-muted)]">
                      Порядок позиционных обозначений (ОУО) уже упорядочен по выбранному направлению.
                    </div>
                  ) : (
                    <table
                      data-testid="autonum-device-preview-table"
                      className="w-full border-collapse text-[11.5px]"
                    >
                      <thead className="sticky top-0 z-10 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                        <tr>
                          <th className="px-3 py-1.5 text-left">Лист</th>
                          <th className="px-3 py-1.5 text-left">Координаты (X, Y)</th>
                          <th className="px-3 py-1.5 text-right">Было ОУО</th>
                          <th className="w-6 px-1 py-1.5 text-center" />
                          <th className="px-3 py-1.5 text-left">Станет ОУО</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--flux-line)]">
                        {devicePreview.changes.map((c) => (
                          <tr key={c.deviceId} className="hover:bg-[var(--flux-hover)]">
                            <td className="px-3 py-1.5 font-mono text-[var(--flux-text-muted)]">
                              Л.{c.sheetNumber}
                            </td>
                            <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--flux-text-muted)]">
                              {c.x}, {c.y}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-[var(--flux-text-muted)]">
                              {c.oldDesignation}
                            </td>
                            <td className="px-1 py-1.5 text-center text-[var(--flux-text-muted)]">
                              <ArrowRight className="w-3 h-3 inline" />
                            </td>
                            <td className="px-3 py-1.5 font-mono font-semibold text-[var(--flux-accent)]">
                              {c.newDesignation}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="px-4 py-3 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 px-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] text-[var(--flux-text)]"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    data-testid="autonum-apply-devices-btn"
                    disabled={devicePreview.changes.length === 0}
                    onClick={() => {
                      onApplyDevices(
                        devicePreview.nextProject,
                        devicePreview.changes.length,
                        devOrder === 'top-to-bottom' ? 'сверху вниз' : 'слева направо'
                      );
                      onClose();
                    }}
                    className="h-8 px-3.5 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[12px] font-medium inline-flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Переиндексировать ОУО ({devicePreview.changes.length})</span>
                  </button>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
    </StudioWindow>
  );
};
