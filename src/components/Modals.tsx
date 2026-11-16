import React, { useState } from 'react';
import { Check, Copy, Download, ExternalLink, FileCode2, Layers, Printer, SlidersHorizontal, Terminal, Upload } from 'lucide-react';
import { StudioWindow } from './StudioWindow';
import { SCHEMATIC_FONT_OPTIONS } from '../core/e3Catalog';
import {
  buildNetWireLengths,
  encodeUtf16LeWithBom,
  exportVisualSettings,
  generateE3ComScript,
  parseE3BridgeSummary,
  parseVisualSettings,
} from '../core/e3Engine';
import type {
  BomRow,
  CableJournalRow,
  E3BridgeSummary,
  E3Project,
  E3VisualSettings,
  ErcIssue,
  NetWireLengthRow,
  SchematicFontFamily,
  SignalType,
} from '../core/e3Types';
import { UI_SCALE_OPTIONS, type UiScalePercent } from '../core/uiScale';
import { UI_MODE_OPTIONS, type UiWorkspaceMode } from '../core/uiMode';
import { isMinimapEnabled } from '../core/focusLayout';

export interface E3BridgeStatusInfo {
  isWin32: boolean;
  bridgeConnected: boolean;
  bridgeHost: string | null;
}

function parseFiniteClamped(raw: string, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

interface ExchangeModalProps {
  open: boolean;
  project: E3Project;
  bridgeStatus: E3BridgeStatusInfo;
  onClose: () => void;
  onDirectOpenE3: (mode: 'build' | 'export') => Promise<{ ok: boolean; execution: string; host?: string; error?: string }>;
  onDownloadConnector: () => void;
  onExportE3sOle2: () => void;
  onExportE3sXml: () => void;
  onExportFluxBridge: () => void;
  onExportDxf: () => void;
  onImportBytes: (bytes: ArrayBuffer, filename: string) => Promise<void>;
  onImportPayload: (rawText: string) => Promise<void>;
}

export const ExchangeModal: React.FC<ExchangeModalProps> = ({
  open,
  project,
  bridgeStatus,
  onClose,
  onDirectOpenE3,
  onDownloadConnector,
  onExportE3sOle2,
  onExportE3sXml,
  onExportFluxBridge,
  onExportDxf,
  onImportBytes,
  onImportPayload,
}) => {
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState('');
  const [bridgeMsg, setBridgeMsg] = useState('');
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bridgeSummary, setBridgeSummary] = useState<E3BridgeSummary | null>(null);
  const [bridgeJobId, setBridgeJobId] = useState<string | null>(null);
  const [bridgeLogText, setBridgeLogText] = useState('');
  const [showBridgeLog, setShowBridgeLog] = useState(false);

  const applyBridgeResult = (jobId: string | null, summary: E3BridgeSummary | null, logText: string) => {
    setBridgeJobId(jobId);
    setBridgeSummary(summary ?? (logText ? parseE3BridgeSummary(logText) : null));
    setBridgeLogText(logText);
  };

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch('/api/v1/e3-bridge/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.ok && d.summary) {
          setBridgeJobId(d.jobId || null);
          setBridgeSummary(d.summary);
        }
      })
      .catch(() => undefined);
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/sync/stream');
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (payload?.type === 'e3-bridge-log') {
            applyBridgeResult(payload.jobId || null, payload.summary || null, String(payload.message || ''));
          }
        } catch {
          // ignore malformed SSE payload
        }
      };
    } catch {
      // EventSource unavailable
    }
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [open]);

  const handleDownloadBridgeLog = () => {
    if (bridgeJobId || !bridgeLogText) {
      const a = document.createElement('a');
      a.href = `/api/v1/e3-bridge/debug-log${bridgeJobId ? `?jobId=${encodeURIComponent(bridgeJobId)}` : ''}`;
      a.download = 'flux_e3_com_debug.log';
      a.click();
      return;
    }
    const blob = new Blob([bridgeLogText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flux_e3_com_debug.log';
    a.click();
    URL.revokeObjectURL(url);
  };

  const summaryRows: Array<[string, string, boolean]> = bridgeSummary
    ? [
        ['Создано листов', `${bridgeSummary.sheets}/${bridgeSummary.sheetsTotal}`, false],
        ['Изделий из БД', String(bridgeSummary.devNative), false],
        ['Динамических блоков', String(bridgeSummary.devBlock), false],
        ['Уже были в проекте', String(bridgeSummary.devExisting), false],
        ['Без символа', String(bridgeSummary.devNoSymbol), bridgeSummary.devNoSymbol > 0],
        ['Не создано', String(bridgeSummary.devFailed), bridgeSummary.devFailed > 0],
        [
          'Сформировано цепей',
          `${bridgeSummary.wires}/${bridgeSummary.wiresTotal}` +
            (bridgeSummary.wiresGraphicOnly > 0 ? `, только графикой: ${bridgeSummary.wiresGraphicOnly}` : '') +
            (bridgeSummary.wiresFailed > 0 ? `, ошибок: ${bridgeSummary.wiresFailed}` : ''),
          bridgeSummary.wiresGraphicOnly > 0 || bridgeSummary.wiresFailed > 0,
        ],
        ['Перенесено кабелей', `${bridgeSummary.cables}/${bridgeSummary.cablesTotal}`, false],
        ['Таблиц ПЭ3/КЖ', String(bridgeSummary.tables), false],
        ['Выносок', String(bridgeSummary.callouts), false],
        ['Предупреждений по атрибутам', String(bridgeSummary.attrWarn), bridgeSummary.attrWarn > 0],
      ]
    : [];

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      await onImportBytes(buf, file.name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта файла.');
    } finally {
      e.target.value = '';
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

  const handleDownloadVbs = (mode: 'build' | 'export') => {
    // Encode with UTF-16LE BOM so Russian Windows wscript.exe/cscript.exe reads Cyrillic natively
    const bytes = encodeUtf16LeWithBom(generateE3ComScript(project, mode));
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'text/plain;charset=utf-16le' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download =
      mode === 'export'
        ? `${project.projectCode}_e3_to_flux.vbs`
        : `${project.projectCode}_open_in_e3.vbs`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunEmbeddedBridge = async (mode: 'build' | 'export') => {
    setBusy(true);
    setBridgeMsg('');
    try {
      const res = await onDirectOpenE3(mode);
      if (res.ok) {
        setBridgeMsg(
          res.execution === 'local-win32'
            ? `Выполнено локальным сервером Windows (${res.host || 'ПК'}). Проверьте окно E³.series!`
            : `Команда отправлена на ваш ПК (${res.host || 'Windows'}) и запустится в E³.series через 1–2 сек.`
        );
      } else {
        setBridgeMsg(
          'Сервер сейчас в облаке (Linux). Запустите 1 раз локальный коннектор E3ProMax_Connector.cmd на вашем Windows-ПК (или скачайте разовый .vbs), чтобы кнопка открывала E³.series напрямую.'
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const embeddedScript = generateE3ComScript(project, 'build');

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(embeddedScript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard fallback ignored
    }
  };

  return (
    <StudioWindow
      open={open}
      onClose={onClose}
      variant="drawer"
      maxWidthClass="max-w-2xl"
      title="Совместимость E3.series и Flux Studio"
      titleId="exchange-title"
      icon={<Layers className="w-4 h-4 text-[var(--flux-accent)]" />}
      closeDisabled={busy}
      closeAriaLabel="Закрыть окно обмена данными"
    >
        <div className="flex-1 min-h-0 p-4 space-y-5 overflow-y-auto text-[length:calc(12px*var(--flux-ui-scale))]">
          {/* Embedded Bridge section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[length:calc(13px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                Встроенный COM-мост с E³.series 2022 SP2
              </h3>
              <span className="inline-flex items-center gap-1.5 text-[length:calc(11px*var(--flux-ui-scale))] font-mono text-[var(--flux-text-muted)]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    bridgeStatus.isWin32 || bridgeStatus.bridgeConnected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                {bridgeStatus.isWin32
                  ? 'Локальный Windows COM'
                  : bridgeStatus.bridgeConnected
                  ? `ПК подключён: ${bridgeStatus.bridgeHost}`
                  : 'Ожидает коннектор на ПК'}
              </span>
            </div>

            <div className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[length:calc(11px*var(--flux-ui-scale))] leading-relaxed text-[var(--flux-text-muted)]">
              Скрипт уже встроен в программу. При локальном запуске на Windows (или при запущенном{' '}
              <span className="font-mono text-[var(--flux-text)]">E3ProMax_Connector.cmd</span> в облачном режиме) нажатие кнопки ниже автоматически создаёт листы, изделия, кабели и открывает проект в <span className="font-medium text-[var(--flux-text)]">E³.series</span>.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRunEmbeddedBridge('build')}
                className="inline-flex items-center justify-between px-3 h-9 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white font-medium text-left disabled:opacity-50"
              >
                <span>Открыть прямо в E³.series</span>
                <ExternalLink className="w-4 h-4 shrink-0" />
              </button>
              <button
                type="button"
                onClick={onDownloadConnector}
                className="inline-flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium text-left"
              >
                <span>Коннектор для ПК (.cmd, 1 раз)</span>
                <Terminal className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => handleDownloadVbs('build')}
                className="inline-flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium text-left"
              >
                <span>Разовый COM-скрипт (.vbs)</span>
                <FileCode2 className="w-4 h-4 text-[var(--flux-text-muted)] shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => handleDownloadVbs('export')}
                className="inline-flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium text-left"
              >
                <span>Из открытого .e3s → Flux (.vbs)</span>
                <Download className="w-4 h-4 text-[var(--flux-text-muted)] shrink-0" />
              </button>
            </div>

            {bridgeMsg && (
              <div className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-accent-soft)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]">
                {bridgeMsg}
              </div>
            )}

            {(bridgeSummary || bridgeLogText) && (
              <div className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-1.5 text-[length:calc(11px*var(--flux-ui-scale))]">
                <div className="font-semibold text-[var(--flux-text)]">Результат последнего переноса в E³.series</div>
                {bridgeSummary ? (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                    {summaryRows.map(([label, value, warn]) => (
                      <li key={label} className="flex justify-between gap-2">
                        <span className="text-[var(--flux-text-muted)]">{label}</span>
                        <span className={`font-mono ${warn ? 'text-amber-500 font-semibold' : 'text-[var(--flux-text)]'}`}>
                          {value}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-amber-500">Сводка E3_BRIDGE_SUMMARY в логе не найдена — откройте лог ниже.</div>
                )}
                {bridgeSummary && bridgeSummary.missingAttrs.length > 0 && (
                  <div className="p-2 rounded border border-amber-500/50 bg-amber-500/10 text-[var(--flux-text)]">
                    Создайте эти атрибуты в БД атрибутов E3.series: {bridgeSummary.missingAttrs.join(', ')}
                  </div>
                )}
                <div className="flex items-center gap-3 pt-0.5">
                  <button
                    type="button"
                    onClick={handleDownloadBridgeLog}
                    className="inline-flex items-center gap-1 font-medium text-[var(--flux-accent)] hover:underline"
                  >
                    <Download className="w-3 h-3" />
                    <span>Скачать flux_e3_com_debug.log</span>
                  </button>
                  {bridgeLogText && (
                    <button
                      type="button"
                      onClick={() => setShowBridgeLog((v) => !v)}
                      className="font-medium text-[var(--flux-accent)] hover:underline"
                    >
                      {showBridgeLog ? 'Скрыть лог' : 'Показать лог'}
                    </button>
                  )}
                </div>
                {showBridgeLog && bridgeLogText && (
                  <pre className="p-2 max-h-44 overflow-auto rounded border border-[var(--flux-line)] bg-[var(--flux-panel,var(--flux-bg))] font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text)] leading-relaxed whitespace-pre-wrap">
                    {bridgeLogText}
                  </pre>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                onClick={() => setShowScript((s) => !s)}
                className="text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-accent)] hover:underline"
              >
                {showScript ? 'Скрыть код встроенного COM-скрипта' : 'Показать код встроенного COM-скрипта (.vbs)'}
              </button>
              {showScript && (
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex items-center gap-1 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                >
                  {copied ? <Check className="w-3 h-3 text-[var(--flux-accent)]" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Скопировано' : 'Копировать VBScript'}</span>
                </button>
              )}
            </div>

            {showScript && (
              <pre className="p-2.5 max-h-44 overflow-auto rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text)] leading-relaxed">
                {embeddedScript}
              </pre>
            )}
          </div>

          {/* File formats */}
          <div className="pt-4 border-t border-[var(--flux-line)] space-y-2">
            <h3 className="text-[length:calc(13px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
              Файловый обмен (.e3s / .json / .dxf)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onExportE3sOle2}
                className="flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-left"
              >
                <span className="font-medium text-[var(--flux-text)]">Контейнер E3ProMax (.e3s OLE2)</span>
                <Download className="w-4 h-4 text-[var(--flux-text-muted)]" />
              </button>
              <button
                type="button"
                onClick={onExportFluxBridge}
                className="flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-left"
              >
                <span className="font-medium text-[var(--flux-text)]">Мост E3ProMax (.json)</span>
                <Download className="w-4 h-4 text-[var(--flux-accent)]" />
              </button>
              <button
                type="button"
                onClick={onExportE3sXml}
                className="flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-left"
              >
                <span className="font-medium text-[var(--flux-text)]">Схема E3 XML (.e3s)</span>
                <FileCode2 className="w-4 h-4 text-[var(--flux-text-muted)]" />
              </button>
              <button
                type="button"
                onClick={onExportDxf}
                className="flex items-center justify-between px-3 h-9 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-left"
              >
                <span className="font-medium text-[var(--flux-text)]">Чертёж AutoCAD / E3 Импорт (.dxf)</span>
                <Download className="w-4 h-4 text-[var(--flux-text-muted)]" />
              </button>
            </div>
          </div>

          {/* Import section */}
          <div className="pt-4 border-t border-[var(--flux-line)] space-y-2.5">
            <h3 className="text-[length:calc(13px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
              Импорт из E3.series (.e3s OLE2 / ZIP / XML) или Flux Bridge (.json)
            </h3>
            <label className="inline-flex items-center gap-2 h-8 px-3 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              <span>Выбрать файл .e3s / .json с диска</span>
              <input
                type="file"
                accept=".e3s,.e3d,.xml,.json"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>

            <div>
              <label
                htmlFor="import-paste"
                className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Или вставьте содержимое E3 XML / Flux JSON:
              </label>
              <textarea
                id="import-paste"
                rows={4}
                spellCheck={false}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="<?xml version='1.0'?> <E3Project ...> или { 'format': 'flux-e3-bridge/v1', ... }"
                className="w-full p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
              />
            </div>

            {error && <div className="text-[length:calc(12px*var(--flux-ui-scale))] text-rose-600 dark:text-rose-400">{error}</div>}

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
                className="h-8 px-3 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white font-medium disabled:opacity-40"
              >
                Импортировать текст
              </button>
            </div>
          </div>
        </div>
    </StudioWindow>
  );
};

interface VisualSettingsModalProps {
  open: boolean;
  settings: E3VisualSettings;
  uiScale?: UiScalePercent;
  onChangeUiScale?: (scale: UiScalePercent) => void;
  uiMode?: UiWorkspaceMode;
  onChangeUiMode?: (mode: UiWorkspaceMode) => void;
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

export const VisualSettingsModal: React.FC<VisualSettingsModalProps> = React.memo(({
  open,
  settings,
  uiScale = 100,
  onChangeUiScale,
  uiMode = 'classic',
  onChangeUiMode,
  onClose,
  onApply,
}) => {
  const [draft, setDraft] = useState<E3VisualSettings>(() => structuredClone(settings));
  const [error, setError] = useState('');
  const wasOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      setDraft(structuredClone(settings));
      setError('');
    }
    wasOpenRef.current = open;
  }, [open, settings]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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
    <StudioWindow
      open={open}
      onClose={onClose}
      variant="drawer"
      maxWidthClass="max-w-xl"
      title="Настройки и синхронизация визуализации графики"
      titleId="vis-title"
      icon={<SlidersHorizontal className="w-4 h-4 text-[var(--flux-accent)]" />}
      closeAriaLabel="Закрыть настройки визуализации"
    >
        <div className="flex-1 min-h-0 p-4 space-y-4 overflow-y-auto text-[length:calc(12px*var(--flux-ui-scale))]">
          {onChangeUiMode && (
            <div
              data-testid="vs-ui-mode-switcher"
              className="p-2.5 rounded-lg border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                  Режим интерфейса программы
                </span>
                <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                  все функции одинаковы
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {UI_MODE_OPTIONS.map((opt) => {
                  const active = uiMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      data-testid={`vs-ui-mode-${opt.id}`}
                      aria-pressed={active}
                      onClick={() => onChangeUiMode(opt.id)}
                      className={`p-2 rounded border text-left transition-colors ${
                        active
                          ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)] text-[var(--flux-text)]'
                          : 'border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)]'
                      }`}
                    >
                      <div className="text-[length:calc(9.5px*var(--flux-ui-scale))] font-mono text-[var(--flux-accent)] uppercase">
                        {opt.groupLabel}
                      </div>
                      <div className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold truncate mt-0.5">
                        {opt.label}
                      </div>
                      <div className="text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] leading-snug mt-0.5">
                        {opt.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {onChangeUiScale && (
            <div className="p-2.5 rounded-lg border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                  Масштаб интерфейса (кнопки, панели, текст)
                </span>
                <span className="font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-accent)]">
                  {uiScale}%
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {UI_SCALE_OPTIONS.map((opt) => {
                  const active = uiScale === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      data-testid={`vs-ui-scale-${opt}`}
                      aria-pressed={active}
                      onClick={() => onChangeUiScale(opt)}
                      className={`h-7 rounded border font-mono text-[length:calc(11px*var(--flux-ui-scale))] font-medium transition-colors ${
                        active
                          ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)] text-[var(--flux-text)] font-semibold'
                          : 'border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                      }`}
                    >
                      {opt}%
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="vs-preset" className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
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
              <label htmlFor="vs-grid" className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
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
              <label htmlFor="vs-sw" className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Толщина линий изделий (px)
              </label>
              <input
                id="vs-sw"
                type="number"
                step="0.25"
                min="0.5"
                max="6"
                value={draft.symbolStrokeWidth}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    symbolStrokeWidth: parseFiniteClamped(e.target.value, draft.symbolStrokeWidth, 0.5, 6),
                  })
                }
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="vs-ww" className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Толщина линий цепей (px)
              </label>
              <input
                id="vs-ww"
                type="number"
                step="0.25"
                min="0.5"
                max="6"
                value={draft.wireWidth}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    wireWidth: parseFiniteClamped(e.target.value, draft.wireWidth, 0.5, 6),
                  })
                }
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="vs-fw" className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Толщина границ и рамки ГОСТ (px)
              </label>
              <input
                id="vs-fw"
                type="number"
                step="0.2"
                min="0.5"
                max="6"
                value={draft.frameStrokeWidth ?? 1.6}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    frameStrokeWidth: parseFiniteClamped(e.target.value, draft.frameStrokeWidth ?? 1.6, 0.5, 6),
                  })
                }
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="vs-aw" className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Толщина линий аннотаций (px)
              </label>
              <input
                id="vs-aw"
                type="number"
                step="0.2"
                min="0.5"
                max="6"
                value={draft.annotationStrokeWidth ?? 1.4}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    annotationStrokeWidth: parseFiniteClamped(
                      e.target.value,
                      draft.annotationStrokeWidth ?? 1.4,
                      0.5,
                      6
                    ),
                  })
                }
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="vs-fs" className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Масштаб шрифта подписей
              </label>
              <input
                id="vs-fs"
                type="number"
                step="0.1"
                min="0.7"
                max="1.5"
                value={draft.fontScale}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    fontScale: parseFiniteClamped(e.target.value, draft.fontScale, 0.7, 1.5),
                  })
                }
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="vs-font" className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Шрифт обозначений и штампа
              </label>
              <select
                id="vs-font"
                value={draft.fontFamily || 'GOST'}
                onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value as SchematicFontFamily })}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              >
                {SCHEMATIC_FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {(
              [
                ['snapToGrid', 'Привязка к сетке'],
                ['smartGuides', 'Магнитные направляющие'],
                ['showCrosshair', 'Перекрестие курсора (Crosshair)'],
                ['wireCrossingBridge', 'Мостики на пересечении цепей'],
                ['showPinNumbers', 'Номера выводов'],
                ['showWireNumbers', 'Маркировка проводов'],
                ['showCrossRefs', 'Перекрёстные ссылки E3'],
                ['showMinimap', 'Мини-карта листа (Фокус / Гибрид)'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-[var(--flux-text)] cursor-pointer">
                <input
                  type="checkbox"
                  data-testid={`vs-opt-${key}`}
                  checked={
                    key === 'smartGuides'
                      ? draft.smartGuides !== false
                      : key === 'showCrosshair'
                        ? draft.showCrosshair !== false
                        : key === 'wireCrossingBridge'
                          ? draft.wireCrossingBridge !== false
                          : key === 'showMinimap'
                            ? isMinimapEnabled(draft)
                            : Boolean(draft[key])
                  }
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                  className="accent-[var(--flux-accent)]"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="pt-3 border-t border-[var(--flux-line)] space-y-2">
            <h3 className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
              Цветовая кодировка потенциалов
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(SIGNAL_LABELS) as SignalType[]).map((sig) => (
                <label key={sig} className="flex items-center justify-between gap-2 px-2 py-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)]">
                  <span className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]">{SIGNAL_LABELS[sig]}</span>
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
        </div>

        <div className="shrink-0 px-4 py-3 border-t border-[var(--flux-line)] flux-glass-bar flex flex-wrap items-center justify-between gap-2 text-[length:calc(12px*var(--flux-ui-scale))]">
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
              data-testid="vs-cancel-btn"
              onClick={onClose}
              className="h-8 px-3 rounded border border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
            >
              Отмена
            </button>
            <button
              type="button"
              data-testid="vs-apply-btn"
              onClick={() => {
                onApply(draft);
                onClose();
              }}
              className="h-8 px-3 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white font-medium"
            >
              Применить и синхронизировать
            </button>
          </div>
        </div>
    </StudioWindow>
  );
});
VisualSettingsModal.displayName = 'VisualSettingsModal';

interface ReportModalProps {
  open: boolean;
  project: E3Project;
  bom: BomRow[];
  cables: CableJournalRow[];
  netLengths?: NetWireLengthRow[];
  erc: ErcIssue[];
  onClose: () => void;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  open,
  project,
  bom,
  cables,
  netLengths,
  erc,
  onClose,
}) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const resolvedNetLengths = React.useMemo(
    () => netLengths ?? buildNetWireLengths(project),
    [netLengths, project]
  );
  const totalQty = bom.reduce((s, r) => s + r.quantity, 0);

  return (
    <StudioWindow
      open={open}
      onClose={onClose}
      variant="floating"
      maxWidthClass="max-w-4xl"
      heightClass="max-h-[88vh]"
      title={`Перечень элементов ПЭ3 и кабельный журнал — ${project.projectCode}`}
      titleId="report-title"
      icon={<Printer className="w-4 h-4 text-[var(--flux-accent)]" />}
      closeAriaLabel="Закрыть отчёт"
      headerExtra={
        <button
          type="button"
          onClick={() => window.print()}
          className="no-print inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(12px*var(--flux-ui-scale))] font-medium"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Печать / PDF</span>
        </button>
      }
    >
        <div className="flex-1 min-h-0 p-6 overflow-y-auto space-y-6 text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]">
          <div className="flex items-start justify-between border-b border-[var(--flux-line)] pb-4">
            <div>
              <h3 className="text-[length:calc(16px*var(--flux-ui-scale))] font-semibold">{project.name}</h3>
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
            <h4 className="text-[length:calc(13px*var(--flux-ui-scale))] font-semibold mb-2">1. Перечень элементов (ГОСТ 2.701 / 2.106)</h4>
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
            <h4 className="text-[length:calc(13px*var(--flux-ui-scale))] font-semibold mb-2">2. Кабельный журнал</h4>
            <table className="w-full border border-[var(--flux-line)] border-collapse">
              <thead className="bg-[var(--flux-bg)]">
                <tr>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Обозначение</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Марка</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-left">Трасса</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-right">Жилы</th>
                  <th className="border border-[var(--flux-line)] px-2 py-1.5 text-right">Схема, мм</th>
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
                      {c.wireLengthMm ?? 0}
                    </td>
                    <td className="border border-[var(--flux-line)] px-2 py-1 text-right font-mono tabular-nums">
                      {c.lengthMeters}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {resolvedNetLengths.length > 0 && (
              <div className="mt-4">
                <h5 className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold mb-1.5">
                  Суммарная длина проводов по цепям (E3-CORE)
                </h5>
                <table className="w-full border border-[var(--flux-line)] border-collapse">
                  <thead className="bg-[var(--flux-bg)]">
                    <tr>
                      <th className="border border-[var(--flux-line)] px-2 py-1 text-left">Цепь (Net)</th>
                      <th className="border border-[var(--flux-line)] px-2 py-1 text-right">Проводов</th>
                      <th className="border border-[var(--flux-line)] px-2 py-1 text-left">Кабели</th>
                      <th className="border border-[var(--flux-line)] px-2 py-1 text-left">Сечение</th>
                      <th className="border border-[var(--flux-line)] px-2 py-1 text-right">Сумм. длина, мм</th>
                      <th className="border border-[var(--flux-line)] px-2 py-1 text-right">Длина, м</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolvedNetLengths.map((n) => (
                      <tr key={n.netName}>
                        <td className="border border-[var(--flux-line)] px-2 py-1 font-mono font-medium">
                          {n.netName}
                        </td>
                        <td className="border border-[var(--flux-line)] px-2 py-1 text-right font-mono tabular-nums">
                          {n.wireCount}
                        </td>
                        <td className="border border-[var(--flux-line)] px-2 py-1 font-mono">
                          {n.cableDesignations.join(', ') || 'Монтаж'}
                        </td>
                        <td className="border border-[var(--flux-line)] px-2 py-1 font-mono">
                          {n.crossSections.join(', ') || '—'}
                        </td>
                        <td className="border border-[var(--flux-line)] px-2 py-1 text-right font-mono tabular-nums">
                          {n.totalLengthMm}
                        </td>
                        <td className="border border-[var(--flux-line)] px-2 py-1 text-right font-mono tabular-nums">
                          {n.totalLengthMeters.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
            Статус проверки ERC: {erc.filter((i) => i.severity === 'error').length} ошибок,{' '}
            {erc.filter((i) => i.severity === 'warning').length} предупреждений.
          </div>
        </div>
    </StudioWindow>
  );
};
