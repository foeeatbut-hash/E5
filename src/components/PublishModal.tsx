import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Archive, CheckSquare, Download, FileCode2, FileText, Loader2, X } from 'lucide-react';
import type { BatchPublishFormat, BatchPublishOptions, E3Project } from '../core/e3Types';

interface PublishModalProps {
  open: boolean;
  project: E3Project;
  activeSheetId: string;
  onClose: () => void;
  onPublish: (options: BatchPublishOptions) => Promise<void>;
}

export const PublishModal: React.FC<PublishModalProps> = ({
  open,
  project,
  activeSheetId,
  onClose,
  onPublish,
}) => {
  const [format, setFormat] = useState<BatchPublishFormat>('pdf');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [includeGostFrame, setIncludeGostFrame] = useState(true);
  const [editableBlocks, setEditableBlocks] = useState(true);
  const [includeBom, setIncludeBom] = useState(true);
  const [includeCables, setIncludeCables] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(project.sheets.map((s) => s.id));
    setErrorMsg(null);
  }, [open, project.sheets]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const toggleSheet = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      setErrorMsg('Выберите хотя бы один лист для публикации.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await onPublish({
        format,
        sheetIds: selectedIds,
        includeGostFrame,
        editableBlocks,
        includeBom,
        includeCables,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-modal-title"
          data-testid="publish-modal"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-xl rounded-lg border border-[var(--flux-line)] bg-[var(--flux-bg)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Download className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
                <h2 id="publish-modal-title" className="text-[14px] font-semibold text-[var(--flux-text)] truncate">
                  Пакетная публикация в AutoCAD (.dxf) и PDF
                </h2>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                aria-label="Закрыть окно публикации"
                className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              {/* Format Picker */}
              <div className="space-y-2">
                <div className="text-[12px] font-semibold text-[var(--flux-text)]">
                  Формат пакета
                </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                data-testid="publish-fmt-pdf"
                onClick={() => setFormat('pdf')}
                className={`p-2.5 rounded border text-left transition-colors ${
                  format === 'pdf'
                    ? 'border-[var(--flux-accent)] bg-[var(--flux-accent-soft)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[12px] text-[var(--flux-text)]">
                  <FileText className="w-4 h-4 text-[var(--flux-accent)]" />
                  <span>PDF пакет (.pdf)</span>
                </div>
                <p className="text-[11px] mt-1 leading-snug">
                  Многостраничный векторный PDF с рамками ГОСТ и кириллицей
                </p>
              </button>

              <button
                type="button"
                data-testid="publish-fmt-dxf-single"
                onClick={() => setFormat('dxf-single')}
                className={`p-2.5 rounded border text-left transition-colors ${
                  format === 'dxf-single'
                    ? 'border-[var(--flux-accent)] bg-[var(--flux-accent-soft)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[12px] text-[var(--flux-text)]">
                  <FileCode2 className="w-4 h-4 text-[var(--flux-accent)]" />
                  <span>AutoCAD (.dxf)</span>
                </div>
                <p className="text-[11px] mt-1 leading-snug">
                  Все выбранные листы в одном файле + слои и блоки с атрибутами
                </p>
              </button>

              <button
                type="button"
                data-testid="publish-fmt-dxf-zip"
                onClick={() => setFormat('dxf-zip')}
                className={`p-2.5 rounded border text-left transition-colors ${
                  format === 'dxf-zip'
                    ? 'border-[var(--flux-accent)] bg-[var(--flux-accent-soft)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-[12px] text-[var(--flux-text)]">
                  <Archive className="w-4 h-4 text-[var(--flux-accent)]" />
                  <span>DXF по листам (.zip)</span>
                </div>
                <p className="text-[11px] mt-1 leading-snug">
                  Отдельный редактируемый .dxf на каждый лист + сводный чертёж
                </p>
              </button>
            </div>
          </div>

          {/* Sheet Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-[var(--flux-text)]">
                Листы в пакете ({selectedIds.length} из {project.sheets.length})
              </span>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedIds(project.sheets.map((s) => s.id))}
                  className="text-[var(--flux-accent)] hover:underline"
                >
                  Выбрать все
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([activeSheetId])}
                  className="text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:underline"
                >
                  Только текущий
                </button>
              </div>
            </div>

            <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)] max-h-44 overflow-y-auto">
              {project.sheets.map((sheet) => {
                const checked = selectedIds.includes(sheet.id);
                const formLabel =
                  sheet.titleBlock.stampForm === 'custom'
                    ? 'Свой штамп'
                    : sheet.titleBlock.stampForm === 'form2a' ||
                        (sheet.titleBlock.stampForm === undefined && sheet.number > 1)
                      ? 'Форма 2а'
                      : 'Форма 1';
                return (
                  <label
                    key={sheet.id}
                    className="px-3 py-2 flex items-center justify-between gap-2 cursor-pointer hover:bg-[var(--flux-hover)] text-[12px]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSheet(sheet.id)}
                        className="rounded border-[var(--flux-line)]"
                      />
                      <span className="font-mono text-[11px] text-[var(--flux-text-muted)] shrink-0">
                        Л.{sheet.number}
                      </span>
                      <span className="text-[var(--flux-text)] truncate">{sheet.name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--flux-text-muted)] shrink-0">
                      {sheet.format} · {formLabel}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2 p-3 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeGostFrame}
                onChange={(e) => setIncludeGostFrame(e.target.checked)}
              />
              <span>Включать рамки, зоны координат и основные надписи ГОСТ 2.104</span>
            </label>

            {format !== 'pdf' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editableBlocks}
                  onChange={(e) => setEditableBlocks(e.target.checked)}
                />
                <span>Экспортировать штампы и УГО как редактируемые блоки AutoCAD (INSERT + ATTRIB)</span>
              </label>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBom}
                onChange={(e) => setIncludeBom(e.target.checked)}
              />
              <span>Добавить перечень элементов ПЭ3</span>
            </label>

            {format === 'pdf' && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCables}
                  onChange={(e) => setIncludeCables(e.target.checked)}
                />
                <span>Добавить страницу кабельного журнала</span>
              </label>
            )}
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-[12px] text-rose-700 dark:text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-3">
          <span className="text-[11px] text-[var(--flux-text-muted)] flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>{project.projectCode} · Rev {project.revision}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="h-8 px-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] text-[var(--flux-text)] disabled:opacity-40"
            >
              Отмена
            </button>
            <button
              type="button"
              data-testid="publish-submit-btn"
              disabled={busy}
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[12px] font-medium disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span>
                {busy
                  ? 'Формирование…'
                  : format === 'pdf'
                    ? 'Скачать PDF пакет'
                    : format === 'dxf-zip'
                      ? 'Скачать архив DXF'
                      : 'Скачать AutoCAD DXF'}
              </span>
            </button>
          </div>
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
