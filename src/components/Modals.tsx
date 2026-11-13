import React, { useState } from 'react';
import { Archive, Download, FileCode2, Printer, Upload, X } from 'lucide-react';
import {
  exportVisualSettings,
  generateE3ComScript,
  parseVisualSettings,
} from '../core/e3Engine';
import type {
  BomRow,
  CableJournalRow,
  E3Project,
  E3VisualSettings,
  ErcIssue,
  SignalType,
} from '../core/e3Types';

interface ExchangeModalProps {
  open: boolean;
  project: E3Project;
  onClose: () => void;
  onExportE3Xml: () => void;
  onExportFluxBridge: () => void;
  onExportDxf: () => void;
  onDownloadFluxStudioZip: () => void;
  onDownloadCodebaseZip: () => void;
  onImportPayload: (rawText: string) => Promise<void>;
}

export const ExchangeModal: React.FC<ExchangeModalProps> = ({
  open,
  project,
  onClose,
  onExportE3Xml,
  onExportFluxBridge,
  onExportDxf,
  onDownloadFluxStudioZip,
  onDownloadCodebaseZip,
  onImportPayload,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const text = await file.text();
      await onImportPayload(text);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта файла.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasteImport = async () => {
    if (!pasteText.trim()) return;
    setError('');
    setBusy(true);
    try {
      await onImportPayload(pasteText);
      setPasteText('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось распознать формат.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadVbs = () => {
    const blob = new Blob([generateE3ComScript()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'e3_flux_bridge.vbs';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exchange-title"
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-xl overflow-hidden">
        <div className="px-4 h-11 border-b border-[var(--flux-line)] flex items-center justify-between">
          <h2 id="exchange-title" className="text-[14px] font-semibold text-[var(--flux-text)]">
            Совместимость E3.series и Flux Studio
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно обмена данными"
            className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 max-h-[80vh] overflow-y-auto text-[12px]">
          {/* Export section */}
          <div className="space-y-2">
            <h3 className="text-[13px] font-semibold text-[var(--flux-text)]">
              Экспорт модели и пакетов совместимости
            </h3>
            <p className="text-[var(--flux-text-muted)]">
              Сохранённый файл полностью сохраняет узлы, выводы, цепи, атрибуты, настройки визуализации и ключ{' '}
              <span className="font-mono text-[var(--flux-text)]">{project.fluxProjectKey}</span> для обратного открытия в E3.series и Flux.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={onExportE3Xml}
                className="flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-left"
              >
                <span className="font-medium text-[var(--flux-text)]">Модель E3.series XML (.e3x)</span>
                <FileCode2 className="w-4 h-4 text-[var(--flux-accent)]" />
              </button>
              <button
                type="button"
                onClick={onExportFluxBridge}
                className="flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-left"
              >
                <span className="font-medium text-[var(--flux-text)]">Мост Flux E3 (.json)</span>
                <Download className="w-4 h-4 text-[var(--flux-accent)]" />
              </button>
              <button
                type="button"
                onClick={onExportDxf}
                className="flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-left"
              >
                <span className="font-medium text-[var(--flux-text)]">Чертёж AutoCAD / CAD (.dxf)</span>
                <Download className="w-4 h-4 text-[var(--flux-text-muted)]" />
              </button>
              <button
                type="button"
                onClick={handleDownloadVbs}
                className="flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-left"
              >
                <span className="font-medium text-[var(--flux-text)]">COM-скрипт для E3.series (.vbs)</span>
                <Download className="w-4 h-4 text-[var(--flux-text-muted)]" />
              </button>
            </div>
          </div>

          {/* Flux Studio & Full Codebase */}
          <div className="pt-4 border-t border-[var(--flux-line)] space-y-2">
            <h3 className="text-[13px] font-semibold text-[var(--flux-text)]">
              Выпуск подпрограммы через Flux Studio и база кода
            </h3>
            <p className="text-[var(--flux-text-muted)]">
              Экспортируйте готовый пакет подпрограммы с <span className="font-mono">manifest.json</span> (договор v2, <span className="font-mono">ui: page</span>) для импорта в Flux Studio или скачайте полный исходный код проекта.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={onDownloadFluxStudioZip}
                className="inline-flex items-center gap-2 h-8 px-3 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white font-medium"
              >
                <Archive className="w-4 h-4" />
                <span>Пакет Flux Studio (.zip)</span>
              </button>
              <button
                type="button"
                onClick={onDownloadCodebaseZip}
                className="inline-flex items-center gap-2 h-8 px-3 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium"
              >
                <Download className="w-4 h-4" />
                <span>Скачать всю базу кода (.zip)</span>
              </button>
            </div>
          </div>

          {/* Import section */}
          <div className="pt-4 border-t border-[var(--flux-line)] space-y-2.5">
            <h3 className="text-[13px] font-semibold text-[var(--flux-text)]">
              Импорт из E3.series (.e3x / .xml) или Flux Bridge (.json)
            </h3>
            <label className="inline-flex items-center gap-2 h-8 px-3 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Выбрать файл с диска</span>
              <input
                type="file"
                accept=".e3x,.xml,.json"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <div>
              <label
                htmlFor="import-paste"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Или вставьте содержимое E3 XML / Flux JSON:
              </label>
              <textarea
                id="import-paste"
                rows={4}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="<?xml version='1.0'?> <E3Project ...> или { 'format': 'flux-e3-bridge/v1', ... }"
                className="w-full p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)]"
              />
            </div>

            {error && <div className="text-[12px] text-rose-600 dark:text-rose-400">{error}</div>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded border border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={busy || !pasteText.trim()}
                onClick={handlePasteImport}
                className="h-8 px-3 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white font-medium disabled:opacity-40"
              >
                Импортировать текст
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface VisualSettingsModalProps {
  open: boolean;
  settings: E3VisualSettings;
  onClose: () => void;
  onApply: (next: E3VisualSettings) => void;
}

const SIGNAL_LABELS: Record<SignalType, string> = {
  power: 'Силовые цепи (L1/L2/L3)',
  neutral: 'Нейтраль (N)',
  pe: 'Заземление (PE)',
  dc24: 'Питание +24V DC',
  dc0: 'Общий провод 0V DC',
  signal: 'Сигналы КИПиА (AI/DI)',
  bus: 'Промышленная шина (RS-485)',
};

export const VisualSettingsModal: React.FC<VisualSettingsModalProps> = ({
  open,
  settings,
  onClose,
  onApply,
}) => {
  const [draft, setDraft] = useState<E3VisualSettings>(settings);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (open) setDraft(structuredClone(settings));
  }, [open, settings]);

  if (!open) return null;

  const handleExportJson = () => {
    const json = exportVisualSettings(draft);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visual-profile-${draft.presetName.replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const parsed = parseVisualSettings(await file.text());
      setDraft(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка чтения профиля визуализации.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vis-title"
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xl rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-xl overflow-hidden">
        <div className="px-4 h-11 border-b border-[var(--flux-line)] flex items-center justify-between">
          <h2 id="vis-title" className="text-[14px] font-semibold text-[var(--flux-text)]">
            Настройки и синхронизация визуализации графики
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройки визуализации"
            className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto text-[12px]">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="vs-preset" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Название профиля
              </label>
              <input
                id="vs-preset"
                type="text"
                value={draft.presetName}
                onChange={(e) => setDraft({ ...draft, presetName: e.target.value })}
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="vs-grid" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Шаг сетки (мм)
              </label>
              <select
                id="vs-grid"
                value={draft.gridSize}
                onChange={(e) => setDraft({ ...draft, gridSize: Number(e.target.value) })}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              >
                <option value={10}>10 мм</option>
                <option value={20}>20 мм</option>
                <option value={25}>25 мм</option>
                <option value={40}>40 мм</option>
              </select>
            </div>
            <div>
              <label htmlFor="vs-ww" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Толщина линий цепей (px)
              </label>
              <input
                id="vs-ww"
                type="number"
                step="0.5"
                min="1"
                max="5"
                value={draft.wireWidth}
                onChange={(e) => setDraft({ ...draft, wireWidth: Number(e.target.value) || 2 })}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="vs-fs" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Масштаб шрифта подписей
              </label>
              <input
                id="vs-fs"
                type="number"
                step="0.1"
                min="0.7"
                max="1.5"
                value={draft.fontScale}
                onChange={(e) => setDraft({ ...draft, fontScale: Number(e.target.value) || 1 })}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            {(
              [
                ['snapToGrid', 'Привязка к сетке'],
                ['showPinNumbers', 'Номера выводов'],
                ['showWireNumbers', 'Маркировка проводов'],
                ['showCrossRefs', 'Перекрёстные ссылки E3'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-[var(--flux-text)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                  className="accent-[var(--flux-accent)]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="pt-3 border-t border-[var(--flux-line)] space-y-2">
            <h3 className="text-[12px] font-semibold text-[var(--flux-text)]">
              Цветовая кодировка потенциалов
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(SIGNAL_LABELS) as SignalType[]).map((sig) => (
                <label key={sig} className="flex items-center justify-between gap-2 px-2 py-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)]">
                  <span className="text-[11px] text-[var(--flux-text)]">{SIGNAL_LABELS[sig]}</span>
                  <input
                    type="color"
                    value={draft.netColors[sig]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        netColors: { ...draft.netColors, [sig]: e.target.value },
                      })
                    }
                    className="w-6 h-5 border-0 bg-transparent cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </div>

          {error && <div className="text-rose-600 dark:text-rose-400">{error}</div>}

          <div className="pt-3 border-t border-[var(--flux-line)] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Экспорт настроек JSON</span>
              </button>
              <label className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Импорт JSON</span>
                <input type="file" accept=".json" onChange={handleImportJson} className="sr-only" />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded border border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply(draft);
                  onClose();
                }}
                className="h-8 px-3 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white font-medium"
              >
                Применить и синхронизировать
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ReportModalProps {
  open: boolean;
  project: E3Project;
  bom: BomRow[];
  cables: CableJournalRow[];
  erc: ErcIssue[];
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  open,
  project,
  bom,
  cables,
  erc,
  onClose,
}) => {
  if (!open) return null;

  const totalQty = bom.reduce((s, r) => s + r.quantity, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-4xl rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="no-print px-4 h-11 border-b border-[var(--flux-line)] flex items-center justify-between shrink-0">
          <h2 id="report-title" className="text-[14px] font-semibold text-[var(--flux-text)]">
            Перечень элементов ПЭ3 и кабельный журнал — {project.projectCode}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 h-7 px-3 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white text-[12px] font-medium"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Печать / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть отчёт"
              className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-[12px] text-[var(--flux-text)]">
          <div className="flex items-start justify-between border-b border-[var(--flux-line)] pb-4">
            <div>
              <h3 className="text-[16px] font-semibold">{project.name}</h3>
              <p className="text-[var(--flux-text-muted)] mt-0.5">
                Документ: <span className="font-mono">{project.projectCode}-ПЭ3</span> · Ревизия {project.revision} · Ключ Flux:{' '}
                <span className="font-mono">{project.fluxProjectKey}</span>
              </p>
            </div>
            <div className="text-right font-mono tabular-nums text-[var(--flux-text-muted)]">
              <div>Позиций: {bom.length}</div>
              <div>Изделий: {totalQty} шт.</div>
            </div>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold mb-2">1. Перечень элементов (ГОСТ 2.701 / 2.106)</h4>
            <table className="w-full border border-[var(--flux-line)] border-collapse">
              <thead className="bg-[var(--flux-bg)]">
                <tr>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Поз.</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Поз. обозначение</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Наименование</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Артикул</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Производитель</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-right">Кол.</th>
                </tr>
              </thead>
              <tbody>
                {bom.map((r) => (
                  <tr key={`${r.pos}-${r.article}`}>
                    <td className="border border-[var(--flux-line)] px-2 py-1 font-mono tabular-nums">{r.pos}</td>
                    <td className="border border-[var(--flux-line)] px-2 py-1 font-mono">{r.designationText}</td>
                    <td className="border border-[var(--flux-line)] px-2 py-1">{r.componentName}</td>
                    <td className="border border-[var(--flux-line)] px-2 py-1 font-mono">{r.article}</td>
                    <td className="border border-[var(--flux-line)] px-2 py-1">{r.manufacturer}</td>
                    <td className="border border-[var(--flux-line)] px-2 py-1 text-right font-mono tabular-nums">
                      {r.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="text-[13px] font-semibold mb-2">2. Кабельный журнал</h4>
            <table className="w-full border border-[var(--flux-line)] border-collapse">
              <thead className="bg-[var(--flux-bg)]">
                <tr>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Обозначение</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Марка</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Трасса</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-right">Жилы</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-right">Длина, м</th>
                </tr>
              </thead>
              <tbody>
                {cables.map((c) => (
                  <tr key={c.designation}>
                    <td className="border border-[var(--flux-line)] px-2 py-1 font-mono">{c.designation}</td>
                    <td className="border border-[var(--flux-line)] px-2 py-1">{c.cableType}</td>
                    <td className="border border-[var(--flux-line)] px-2 py-1 font-mono">
                      {c.fromDevice} → {c.toDevice}
                    </td>
                    <td className="border border-[var(--flux-line)] px-2 py-1 text-right font-mono tabular-nums">
                      {c.usedCores}/{c.coresCount}
                    </td>
                    <td className="border border-[var(--flux-line)] px-2 py-1 text-right font-mono tabular-nums">
                      {c.lengthMeters}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-[var(--flux-text-muted)]">
            Статус проверки ERC: {erc.filter((i) => i.severity === 'error').length} ошибок,{' '}
            {erc.filter((i) => i.severity === 'warning').length} предупреждений.
          </div>
        </div>
      </div>
    </div>
  );
};
