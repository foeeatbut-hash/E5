import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  Copy,
  Layers,
  Loader2,
  Send,
} from 'lucide-react';
import { StudioWindow } from './StudioWindow';
import type { E3Project } from '../core/e3Types';
import { detectFluxHost } from '../core/fluxHostBridge';
import {
  buildFluxStudioManifest,
  type FluxUiMode,
} from '../core/fluxStudioManifest';

interface FluxStudioPublishModalProps {
  open: boolean;
  project: E3Project;
  onClose: () => void;
  onUpdateFluxProjectKey: (nextKey: string) => void;
  onPushToFluxHost: (nextKey?: string) => Promise<{ hosted: boolean; ok: boolean }>;
  onDownloadFluxPackageSuccess?: (filename: string, manifestId: string, version: string) => void;
}

export const FluxStudioPublishModal: React.FC<FluxStudioPublishModalProps> = ({
  open,
  project,
  onClose,
  onUpdateFluxProjectKey,
  onPushToFluxHost,
  onDownloadFluxPackageSuccess,
}) => {
  const [moduleId, setModuleId] = useState('e3promax-ecad');
  const [moduleName, setModuleName] = useState('E3ProMax — САПР электросхем');
  const [version, setVersion] = useState('1.2.0');
  const [author, setAuthor] = useState(project.author || 'Инженер КИП');
  const [fluxProjectKey, setFluxProjectKey] = useState(project.fluxProjectKey || 'FLUX_PRJ_1');
  const [uiMode, setUiMode] = useState<FluxUiMode>('page');
  const [category, setCategory] = useState('e3');
  const [fluxMinVersion, setFluxMinVersion] = useState('1.21.0');
  const [summary, setSummary] = useState(
    'Редактор электросхем ГОСТ, авто-спецификации ПЭ3, кабельные журналы и двусторонняя синхронизация E3.series внутри Flux Studio.'
  );

  const [includeE3s, setIncludeE3s] = useState(true);
  const [includeXml, setIncludeXml] = useState(true);
  const [includeBridge, setIncludeBridge] = useState(true);
  const [includeVbs, setIncludeVbs] = useState(true);
  const [includeConnector, setIncludeConnector] = useState(true);

  const [distBuilt, setDistBuilt] = useState<boolean | null>(null);
  const [copiedManifest, setCopiedManifest] = useState(false);
  const [busyZip, setBusyZip] = useState(false);
  const [busyPush, setBusyPush] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const hostStatus = useMemo(() => detectFluxHost(), []);

  useEffect(() => {
    if (!open) return;
    setAuthor(project.author || 'Инженер КИП');
    setFluxProjectKey(project.fluxProjectKey || 'FLUX_PRJ_1');
    setStatusMsg(null);
    fetch(`/api/v1/flux/manifest?projectId=${encodeURIComponent(project.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.distBuilt === 'boolean') {
          setDistBuilt(data.distBuilt);
        }
      })
      .catch(() => {
        setDistBuilt(null);
      });
  }, [open, project.author, project.fluxProjectKey, project.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyZip && !busyPush) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busyZip, busyPush, onClose]);

  const manifestPreview = useMemo(
    () =>
      buildFluxStudioManifest(project, {
        id: moduleId,
        name: moduleName,
        version,
        author,
        ui: uiMode,
        category,
        fluxMinVersion,
        summary,
        fluxProjectKey,
      }),
    [project, moduleId, moduleName, version, author, uiMode, category, fluxMinVersion, summary, fluxProjectKey]
  );

  const manifestJson = useMemo(
    () => JSON.stringify(manifestPreview, null, 2),
    [manifestPreview]
  );

  const handleCopyManifest = async () => {
    try {
      await navigator.clipboard.writeText(manifestJson);
      setCopiedManifest(true);
      window.setTimeout(() => setCopiedManifest(false), 1800);
    } catch {
      // ignore
    }
  };

  const handlePushHost = async () => {
    setBusyPush(true);
    setStatusMsg(null);
    try {
      const trimmedKey = fluxProjectKey.trim();
      if (trimmedKey && trimmedKey !== project.fluxProjectKey) {
        onUpdateFluxProjectKey(trimmedKey);
      }
      const res = await onPushToFluxHost(trimmedKey || project.fluxProjectKey);
      setStatusMsg({
        ok: res.ok,
        text: res.hosted
          ? `Модель и ключ ${trimmedKey || project.fluxProjectKey} переданы в активный Flux Host.`
          : `Синхронизация отправлена на шину Flux Studio (BroadcastChannel + /api/v1/integrations/flux-bus).`,
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyPush(false);
    }
  };

  const handleDownloadPackage = async () => {
    setBusyZip(true);
    setStatusMsg(null);
    try {
      const trimmedKey = fluxProjectKey.trim();
      if (trimmedKey && trimmedKey !== project.fluxProjectKey) {
        onUpdateFluxProjectKey(trimmedKey);
      }
      const nextProj =
        trimmedKey && trimmedKey !== project.fluxProjectKey
          ? { ...project, fluxProjectKey: trimmedKey }
          : project;

      const resp = await fetch('/api/export/flux-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: nextProj,
          manifestOptions: {
            id: moduleId,
            name: moduleName,
            version,
            author,
            ui: uiMode,
            category,
            fluxMinVersion,
            summary,
            fluxProjectKey: trimmedKey || project.fluxProjectKey,
          },
          includeAssets: {
            e3s: includeE3s,
            xml: includeXml,
            bridge: includeBridge,
            vbs: includeVbs,
            connector: includeConnector,
          },
        }),
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const filename = `${manifestPreview.id}-studio-v${manifestPreview.version}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      onDownloadFluxPackageSuccess?.(filename, manifestPreview.id, manifestPreview.version);
      setStatusMsg({
        ok: true,
        text: `Пакет ${filename} (contractVersion 2) сформирован и загружен. Откройте его в Flux Studio → Импорт модуля.`,
      });
    } catch (err) {
      setStatusMsg({
        ok: false,
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyZip(false);
    }
  };

  return (
    <StudioWindow
      open={open}
      onClose={onClose}
      variant="floating"
      maxWidthClass="max-w-4xl"
      heightClass="max-h-[92vh]"
      title="Публикация подпрограммы во Flux Studio (contractVersion 2)"
      titleId="flux-publish-title"
      icon={<Layers className="w-4 h-4 text-[var(--flux-accent)]" />}
      testId="flux-publish-modal"
      closeDisabled={busyZip || busyPush}
      closeAriaLabel="Закрыть окно публикации во Flux Studio"
    >

            <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left: Manifest Configuration & Included Payload */}
              <div className="md:col-span-7 space-y-3 min-w-0">
                <div className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 text-[11.5px]">
                  <div className="min-w-0">
                    <div className="font-medium text-[var(--flux-text)]">
                      {hostStatus.hostedInFlux
                        ? `Запущено внутри Flux Host (${hostStatus.projectName || hostStatus.projectId})`
                        : 'Автономный режим + мост Flux Relay'}
                    </div>
                    <div className="text-[11px] text-[var(--flux-text-muted)]">
                      Каналы: {hostStatus.capabilities.join(', ')}
                    </div>
                  </div>
                  <span
                    className={`w-2 h-2 rounded-[1px] shrink-0 ${
                      hostStatus.hostedInFlux ? 'bg-emerald-600 dark:bg-emerald-400' : 'bg-[var(--flux-accent)]'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="flux-pub-id" className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                      ID подпрограммы
                    </label>
                    <input
                      id="flux-pub-id"
                      type="text"
                      spellCheck={false}
                      value={moduleId}
                      onChange={(e) => setModuleId(e.target.value)}
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11.5px] text-[var(--flux-text)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                      Версия и мин. Flux
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        spellCheck={false}
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        aria-label="Версия модуля"
                        className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11.5px] text-[var(--flux-text)]"
                      />
                      <input
                        type="text"
                        spellCheck={false}
                        value={fluxMinVersion}
                        onChange={(e) => setFluxMinVersion(e.target.value)}
                        aria-label="Минимальная версия Flux"
                        className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11.5px] text-[var(--flux-text)]"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="flux-pub-name" className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                    Название в каталоге Flux Studio
                  </label>
                  <input
                    id="flux-pub-name"
                    type="text"
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="flux-pub-uimode" className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                      Режим UI в Flux
                    </label>
                    <select
                      id="flux-pub-uimode"
                      value={uiMode}
                      onChange={(e) => setUiMode(e.target.value as FluxUiMode)}
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11.5px] text-[var(--flux-text)]"
                    >
                      <option value="page">page (страница)</option>
                      <option value="widget">widget (виджет)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="flux-pub-key" className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                      Ключ проекта Flux
                    </label>
                    <input
                      id="flux-pub-key"
                      type="text"
                      spellCheck={false}
                      value={fluxProjectKey}
                      onChange={(e) => setFluxProjectKey(e.target.value)}
                      data-testid="flux-project-key-input"
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11.5px] text-[var(--flux-text)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-2.5">
                  <div className="col-span-5">
                    <label htmlFor="flux-pub-author" className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                      Автор / Отдел
                    </label>
                    <input
                      id="flux-pub-author"
                      type="text"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="flux-pub-cat" className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                      Раздел
                    </label>
                    <input
                      id="flux-pub-cat"
                      type="text"
                      spellCheck={false}
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      aria-label="Категория в Flux Studio"
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11.5px] text-[var(--flux-text)]"
                    />
                  </div>
                  <div className="col-span-5">
                    <label className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                      Сборка UI внутри .zip
                    </label>
                    <div className="h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center text-[11px] text-[var(--flux-text-muted)] whitespace-nowrap overflow-hidden text-ellipsis">
                      {distBuilt === true
                        ? 'Готовая сборка SPA (ui/)'
                        : distBuilt === false
                          ? 'Шаблон ui/ + /_flux/flux.v1.js'
                          : 'Проверка сборки…'}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="flux-pub-summary" className="block text-[11px] text-[var(--flux-text-muted)] mb-1">
                    Описание для магазина / реестра Flux Studio
                  </label>
                  <textarea
                    id="flux-pub-summary"
                    rows={2}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    className="w-full p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)] resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium text-[var(--flux-text)]">
                    Дополнительные артефакты в архиве .zip
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    {(
                      [
                        ['e3-bridge.json', includeBridge, setIncludeBridge],
                        ['e3-seed-model.e3s', includeE3s, setIncludeE3s],
                        ['e3-seed-model.xml', includeXml, setIncludeXml],
                        ['COM-скрипт (.vbs)', includeVbs, setIncludeVbs],
                        ['Connector (.cmd)', includeConnector, setIncludeConnector],
                      ] as const
                    ).map(([label, checked, setter]) => (
                      <label
                        key={label}
                        className="px-2.5 py-1 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setter(e.target.checked)}
                          className="accent-[var(--flux-accent)] shrink-0"
                        />
                        <span className="font-mono text-[10.5px] text-[var(--flux-text)] whitespace-nowrap">
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Live manifest.json Contract Preview */}
              <div className="md:col-span-5 flex flex-col min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-semibold text-[var(--flux-text)]">
                    manifest.json (Flux Studio v2)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyManifest}
                    className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[10.5px] text-[var(--flux-text)]"
                  >
                    {copiedManifest ? (
                      <Check className="w-3 h-3 text-[var(--flux-accent)]" />
                    ) : (
                      <Copy className="w-3 h-3 text-[var(--flux-text-muted)]" />
                    )}
                    <span>{copiedManifest ? 'Скопировано' : 'Копировать'}</span>
                  </button>
                </div>

                <pre
                  data-testid="flux-manifest-preview"
                  className="flex-1 min-h-[240px] max-h-[340px] p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[10.5px] leading-relaxed text-[var(--flux-text)] overflow-auto"
                >
                  {manifestJson}
                </pre>

                <div className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[10.5px] text-[var(--flux-text-muted)] leading-snug">
                  Поддерживаются команды шины Flux: <span className="font-mono text-[var(--flux-text)]">e3.getBom</span>,{' '}
                  <span className="font-mono text-[var(--flux-text)]">e3.runErc</span>,{' '}
                  <span className="font-mono text-[var(--flux-text)]">e3.getBridgeBundle</span>,{' '}
                  <span className="font-mono text-[var(--flux-text)]">e3.updateStamp</span>.
                </div>
              </div>
            </div>

            {statusMsg && (
              <div
                className={`mx-4 mb-3 px-3 py-2 rounded border text-[11.5px] ${
                  statusMsg.ok
                    ? 'border-[var(--flux-accent)]/50 bg-[var(--flux-accent-soft)] text-[var(--flux-text)]'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            <div className="px-4 py-3 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                disabled={busyZip || busyPush}
                onClick={onClose}
                className="h-8 px-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] text-[var(--flux-text)] disabled:opacity-40"
              >
                Закрыть
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="flux-push-host-btn"
                  disabled={busyPush || busyZip}
                  onClick={handlePushHost}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] font-medium text-[var(--flux-text)] disabled:opacity-50"
                >
                  {busyPush ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  )}
                  <span>Передать в Flux Host</span>
                </button>

                <button
                  type="button"
                  data-testid="flux-download-zip-btn"
                  disabled={busyZip || busyPush}
                  onClick={handleDownloadPackage}
                  className="inline-flex items-center gap-1.5 h-8 px-4 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[12px] font-medium disabled:opacity-50"
                >
                  {busyZip ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Archive className="w-3.5 h-3.5" />
                  )}
                  <span>Опубликовать пакет (.zip)</span>
                </button>
              </div>
            </div>
    </StudioWindow>
  );
};
