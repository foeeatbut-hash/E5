import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Cable,
  FilePlus2,
  Link2,
  Link2Off,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import type { E3Project } from '../core/e3Types';
import {
  addTerminalSparePole,
  assignTerminalBridge,
  extractTerminalStrips,
  removeTerminalBridge,
  setTerminalPoleLabel,
  setTerminalPoleSpare,
} from '../core/terminalStrip';

interface TerminalStripModalProps {
  open: boolean;
  project: E3Project;
  initialDeviceId?: string | null;
  onClose: () => void;
  onUpdateProject: (nextProject: E3Project, logMsg: string) => void;
  onGenerateSheet: (targetDeviceId?: string) => void;
}

export const TerminalStripModal: React.FC<TerminalStripModalProps> = ({
  open,
  project,
  initialDeviceId,
  onClose,
  onUpdateProject,
  onGenerateSheet,
}) => {
  const strips = useMemo(() => extractTerminalStrips(project), [project]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [selectedPoleKeys, setSelectedPoleKeys] = useState<string[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const preferred =
      initialDeviceId && strips.some((s) => s.deviceId === initialDeviceId)
        ? initialDeviceId
        : strips[0]?.deviceId || '';
    setSelectedDeviceId(preferred);
    setSelectedPoleKeys([]);
    setLabelDrafts({});
  }, [open, initialDeviceId]);

  useEffect(() => {
    if (!open) return;
    if (strips.length > 0 && !strips.some((s) => s.deviceId === selectedDeviceId)) {
      setSelectedDeviceId(strips[0].deviceId);
    }
  }, [open, strips, selectedDeviceId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const activeStrip = useMemo(
    () => strips.find((s) => s.deviceId === selectedDeviceId) || strips[0] || null,
    [strips, selectedDeviceId]
  );

  const togglePoleSelection = (poleKey: string) => {
    setSelectedPoleKeys((prev) =>
      prev.includes(poleKey) ? prev.filter((k) => k !== poleKey) : [...prev, poleKey]
    );
  };

  const handleAssignBridge = () => {
    if (!activeStrip || selectedPoleKeys.length < 2) return;
    const next = assignTerminalBridge(project, activeStrip.deviceId, selectedPoleKeys);
    onUpdateProject(
      next,
      `На клеммнике ${activeStrip.designation} установлена перемычка (${selectedPoleKeys.join(', ')}).`
    );
    setSelectedPoleKeys([]);
  };

  const handleClearSelectedBridges = () => {
    if (!activeStrip || selectedPoleKeys.length === 0) return;
    let cur = project;
    for (const pk of selectedPoleKeys) {
      cur = removeTerminalBridge(cur, activeStrip.deviceId, undefined, pk);
    }
    onUpdateProject(
      cur,
      `На клеммнике ${activeStrip.designation} сняты перемычки для выбранных контактов.`
    );
    setSelectedPoleKeys([]);
  };

  const handleRemoveBridgeGroup = (bridgeId: string) => {
    if (!activeStrip) return;
    const next = removeTerminalBridge(project, activeStrip.deviceId, bridgeId);
    onUpdateProject(
      next,
      `Удалена перемычка ${bridgeId} на клеммнике ${activeStrip.designation}.`
    );
  };

  const handleAddSpare = () => {
    if (!activeStrip) return;
    const next = addTerminalSparePole(project, activeStrip.deviceId);
    onUpdateProject(
      next,
      `В клеммник ${activeStrip.designation} добавлена резервная клемма №${activeStrip.rows.length + 1}.`
    );
  };

  const handleToggleSpare = (poleKey: string, nextSpare: boolean) => {
    if (!activeStrip) return;
    const next = setTerminalPoleSpare(project, activeStrip.deviceId, poleKey, nextSpare);
    onUpdateProject(
      next,
      `Клемма ${activeStrip.designation}:${poleKey} ${nextSpare ? 'отмечена как резервная' : 'переведена в рабочие'}.`
    );
  };

  const handleCommitLabel = (poleKey: string, val: string) => {
    if (!activeStrip) return;
    const next = setTerminalPoleLabel(project, activeStrip.deviceId, poleKey, val);
    onUpdateProject(
      next,
      `Обновлена маркировка клеммы ${activeStrip.designation}:${poleKey}.`
    );
  };

  const anySelectedHasBridge = useMemo(() => {
    if (!activeStrip) return false;
    return activeStrip.rows.some(
      (r) => selectedPoleKeys.includes(r.poleKey) && Boolean(r.bridgeGroup)
    );
  }, [activeStrip, selectedPoleKeys]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="xt-modal-title"
          data-testid="terminal-strip-modal"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-5xl rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 h-12 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Cable className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
                <h2
                  id="xt-modal-title"
                  className="text-[14px] font-semibold text-[var(--flux-text)] truncate"
                >
                  Редактор клеммных рядов (-XT) · E3.series
                </h2>
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                  Рядов: {strips.length}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть редактор клеммников"
                className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {strips.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[var(--flux-text-muted)]">
                В текущем проекте нет клеммных рядов категории «Клеммник (-XT)». Разместите клеммник из базы компонентов на лист схемы.
              </div>
            ) : (
              <>
                {/* Strip selector tabs */}
                <div className="px-4 py-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]/70 flex items-center justify-between gap-3 flex-wrap shrink-0">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {strips.map((st) => {
                      const active = st.deviceId === activeStrip?.deviceId;
                      return (
                        <button
                          key={st.deviceId}
                          type="button"
                          data-testid={`xt-strip-tab-${st.designation}`}
                          onClick={() => {
                            setSelectedDeviceId(st.deviceId);
                            setSelectedPoleKeys([]);
                          }}
                          className={`h-7 px-2.5 rounded border text-[12px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                            active
                              ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)]/70 text-[var(--flux-text)]'
                              : 'bg-[var(--flux-bg)] border-[var(--flux-line)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                          }`}
                        >
                          <span className="font-mono font-semibold">{st.designation}</span>
                          <span className="font-mono tabular-nums text-[10.5px] opacity-80">
                            ({st.usedCount}/{st.rows.length})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {activeStrip && (
                    <div className="text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)] flex items-center gap-2">
                      <span>{activeStrip.article}</span>
                      <span>·</span>
                      <span>Занято: {activeStrip.usedCount}</span>
                      <span>·</span>
                      <span>Резерв: {activeStrip.spareCount}</span>
                      <span>·</span>
                      <span>Перемычек: {activeStrip.bridges.length}</span>
                    </div>
                  )}
                </div>

                {/* Action toolbar */}
                {activeStrip && (
                  <div className="px-4 py-2 border-b border-[var(--flux-line)] bg-[var(--flux-bg)] flex items-center justify-between gap-2 flex-wrap shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        data-testid="xt-add-bridge-btn"
                        disabled={selectedPoleKeys.length < 2}
                        onClick={handleAssignBridge}
                        className="h-7 px-2.5 rounded border border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)] hover:bg-[var(--flux-accent)] hover:text-white text-[11.5px] font-medium text-[var(--flux-text)] inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>Поставить перемычку ({selectedPoleKeys.length})</span>
                      </button>

                      <button
                        type="button"
                        data-testid="xt-clear-bridge-btn"
                        disabled={!anySelectedHasBridge}
                        onClick={handleClearSelectedBridges}
                        className="h-7 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[11.5px] font-medium text-[var(--flux-text)] inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                      >
                        <Link2Off className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                        <span>Снять перемычки</span>
                      </button>

                      <button
                        type="button"
                        data-testid="xt-add-spare-btn"
                        onClick={handleAddSpare}
                        className="h-7 px-2.5 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[11.5px] font-medium text-[var(--flux-text)] inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                        <span>+ Резервная клемма</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      data-testid="xt-generate-sheet-btn"
                      onClick={() => onGenerateSheet()}
                      className="h-7 px-3 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[11.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" />
                      <span>Сгенерировать / обновить лист клеммника</span>
                    </button>
                  </div>
                )}

                {/* Terminal Pole Table */}
                {activeStrip && (
                  <div className="flex-1 min-h-0 overflow-auto bg-[var(--flux-surface)]">
                    <table
                      data-testid="xt-poles-table"
                      className="w-full border-collapse text-[12px]"
                    >
                      <thead className="sticky top-0 z-10 bg-[var(--flux-bg)] border-b border-[var(--flux-line)] text-[11px] text-[var(--flux-text-muted)]">
                        <tr>
                          <th className="w-9 px-2 py-2 text-center">Выб.</th>
                          <th className="px-2.5 py-2 text-left whitespace-nowrap">Клемма</th>
                          <th className="px-2.5 py-2 text-left whitespace-nowrap">
                            Внутренняя сторона (Шкаф)
                          </th>
                          <th className="px-2.5 py-2 text-center whitespace-nowrap">Мостик</th>
                          <th className="px-2.5 py-2 text-left whitespace-nowrap">
                            Внешняя сторона (Поле)
                          </th>
                          <th className="px-2.5 py-2 text-center whitespace-nowrap">Статус</th>
                          <th className="px-2.5 py-2 text-left whitespace-nowrap">
                            Примечание / Функция
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--flux-line)]">
                        {activeStrip.rows.map((row) => {
                          const checked = selectedPoleKeys.includes(row.poleKey);
                          const draftKey = `${activeStrip.deviceId}::${row.poleKey}`;
                          const labelVal =
                            labelDrafts[draftKey] !== undefined
                              ? labelDrafts[draftKey]
                              : row.label;
                          return (
                            <tr
                              key={row.poleKey}
                              data-testid={`xt-row-${row.poleKey}`}
                              className={`transition-colors ${
                                checked
                                  ? 'bg-[var(--flux-sel)]/60'
                                  : row.isSpare
                                    ? 'bg-[var(--flux-bg)]/45'
                                    : 'hover:bg-[var(--flux-hover)]'
                              }`}
                            >
                              <td className="px-2 py-1.5 text-center">
                                <input
                                  type="checkbox"
                                  data-testid={`xt-pole-check-${row.poleKey}`}
                                  checked={checked}
                                  onChange={() => togglePoleSelection(row.poleKey)}
                                  aria-label={`Выбрать клемму ${row.poleKey}`}
                                  className="rounded border-[var(--flux-line)]"
                                />
                              </td>
                              <td className="px-2.5 py-1.5 font-mono whitespace-nowrap">
                                <span className="font-semibold text-[var(--flux-text)]">
                                  {row.internalPinName}
                                </span>
                                {row.externalPinName && (
                                  <span className="text-[var(--flux-text-muted)]">
                                    /{row.externalPinName}
                                  </span>
                                )}
                              </td>
                              <td className="px-2.5 py-1.5 min-w-[190px]">
                                {row.internalConnections.length === 0 ? (
                                  <span className="text-[11px] text-[var(--flux-text-muted)]">—</span>
                                ) : (
                                  <div className="space-y-0.5">
                                    {row.internalConnections.map((c) => (
                                      <div
                                        key={c.wireId}
                                        className="flex items-center gap-1.5 text-[11.5px]"
                                      >
                                        <span className="font-mono font-medium text-[var(--flux-text)]">
                                          {c.targetText}
                                        </span>
                                        <span className="font-mono text-[10.5px] px-1 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                                          {c.wireNumber || c.netName}
                                        </span>
                                        <span className="font-mono text-[10px] text-[var(--flux-text-muted)]">
                                          {c.crossSection}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
                                {row.bridgeGroup ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--flux-accent-soft)] border border-[var(--flux-accent)]/50 font-mono text-[10.5px] font-semibold text-[var(--flux-accent)]">
                                    <span>{row.bridgeGroup}</span>
                                    <button
                                      type="button"
                                      data-testid={`xt-remove-bridge-${row.bridgeGroup}`}
                                      onClick={() => handleRemoveBridgeGroup(row.bridgeGroup!)}
                                      title={`Удалить перемычку ${row.bridgeGroup}`}
                                      aria-label={`Удалить перемычку ${row.bridgeGroup}`}
                                      className="hover:text-rose-600 leading-none"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-[var(--flux-text-muted)]">—</span>
                                )}
                              </td>
                              <td className="px-2.5 py-1.5 min-w-[190px]">
                                {row.externalConnections.length === 0 ? (
                                  <span className="text-[11px] text-[var(--flux-text-muted)]">—</span>
                                ) : (
                                  <div className="space-y-0.5">
                                    {row.externalConnections.map((c) => (
                                      <div
                                        key={c.wireId}
                                        className="flex items-center gap-1.5 text-[11.5px]"
                                      >
                                        <span className="font-mono font-medium text-[var(--flux-text)]">
                                          {c.targetText}
                                        </span>
                                        {c.cableText && (
                                          <span className="font-mono text-[10.5px] px-1 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] text-[var(--flux-text-muted)]">
                                            {c.cableText}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-2.5 py-1.5 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  data-testid={`xt-spare-toggle-${row.poleKey}`}
                                  onClick={() => handleToggleSpare(row.poleKey, !row.isSpare)}
                                  className={`h-6 px-2 rounded border text-[10.5px] font-medium transition-colors ${
                                    row.isSpare
                                      ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                  }`}
                                >
                                  {row.isSpare ? 'Резерв' : 'Рабочая'}
                                </button>
                              </td>
                              <td className="px-2.5 py-1.5 min-w-[150px]">
                                <input
                                  type="text"
                                  data-testid={`xt-pole-label-${row.poleKey}`}
                                  value={labelVal}
                                  placeholder="Напр. +24В / Пуск"
                                  onChange={(e) =>
                                    setLabelDrafts((prev) => ({
                                      ...prev,
                                      [draftKey]: e.target.value,
                                    }))
                                  }
                                  onBlur={(e) => {
                                    if (e.target.value !== row.label) {
                                      handleCommitLabel(row.poleKey, e.target.value);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur();
                                    }
                                  }}
                                  className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11.5px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--flux-text-muted)]">
                <Sparkles className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                <span>
                  Отметьте 2+ контактов для установки перемычки (M1, M2…) или сгенерируйте графический лист «Клеммные ряды -XT».
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3.5 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] font-medium text-[var(--flux-text)]"
              >
                Закрыть
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
