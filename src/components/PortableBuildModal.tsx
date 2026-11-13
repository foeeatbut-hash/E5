import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Terminal,
  X,
  AlertTriangle,
} from 'lucide-react';
import type { E3Project } from '../core/e3Types';

interface BuildStage {
  name: string;
  durationMs: number;
  detail: string;
}

interface BuildResult {
  ok: boolean;
  buildId?: string;
  filename?: string;
  builtAt?: string;
  durationMs?: number;
  uiFilesCount?: number;
  serverBytes?: number;
  zipBytes?: number;
  projectCode?: string;
  revision?: number;
  stages?: BuildStage[];
  downloadUrl?: string;
  error?: string;
}

interface PortableBuildModalProps {
  open: boolean;
  project: E3Project;
  onClose: () => void;
  onBuildFinished?: (summary: { filename: string; durationMs: number; zipBytes: number }) => void;
}

export const PortableBuildModal: React.FC<PortableBuildModalProps> = ({
  open,
  project,
  onClose,
  onBuildFinished,
}) => {
  const [building, setBuilding] = useState(false);
  const [result, setResult] = useState<BuildResult | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const onBuildFinishedRef = useRef(onBuildFinished);
  onBuildFinishedRef.current = onBuildFinished;

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const runBuild = useCallback(async () => {
    setBuilding(true);
    setResult(null);
    try {
      const res = await fetch('/api/build/portable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectRef.current }),
      });
      const data = (await res.json()) as BuildResult;
      if (!res.ok || !data.ok || !data.downloadUrl || !data.filename) {
        setResult({
          ok: false,
          error: data.error || `Ошибка сборки (HTTP ${res.status})`,
        });
        return;
      }
      setResult(data);
      onBuildFinishedRef.current?.({
        filename: data.filename,
        durationMs: data.durationMs || 0,
        zipBytes: data.zipBytes || 0,
      });
      triggerDownload(data.downloadUrl, data.filename);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : 'Сбой сети при сборке Portable-архива.',
      });
    } finally {
      setBuilding(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void runBuild();
    }
  }, [open, runBuild]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="portable-build-title"
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xl rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-xl overflow-hidden">
        <div className="px-4 h-11 border-b border-[var(--flux-line)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[var(--flux-accent)]" />
            <h2 id="portable-build-title" className="text-[14px] font-semibold text-[var(--flux-text)]">
              Сборка Portable-версии Flux E3
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно сборки Portable"
            className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-[12px]">
          <div className="p-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium text-[var(--flux-text)] truncate">{project.name}</div>
              <div className="text-[11px] font-mono text-[var(--flux-text-muted)]">
                {project.projectCode} · Rev {project.revision} · {project.devices.length} изд. ·{' '}
                {project.wires.length} цепей
              </div>
            </div>
            <span className="px-2 py-0.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text-muted)] shrink-0">
              Win64 Portable
            </span>
          </div>

          {building && (
            <div className="p-4 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-2.5">
              <div className="flex items-center gap-2.5 font-medium text-[var(--flux-text)]">
                <Loader2 className="w-4 h-4 text-[var(--flux-accent)] animate-spin shrink-0" />
                <span>Идёт живая сборка актуального кода проекта...</span>
              </div>
              <div className="text-[11px] text-[var(--flux-text-muted)] space-y-1 pl-6">
                <div>1. Компиляция интерфейса React + Tailwind (Vite SPA)</div>
                <div>2. Бандлинг сервера, API и COM-моста в автономный server.cjs (без node_modules)</div>
                <div>3. Вшивание текущей схемы, .e3s, .vbs и лаунчера FluxE3_Portable.cmd</div>
              </div>
            </div>
          )}

          {!building && result?.ok && (
            <div className="space-y-3">
              <div className="p-3 rounded border border-emerald-500/40 bg-emerald-500/10 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-semibold text-[var(--flux-text)]">
                    Portable-сборка готова: <span className="font-mono">{result.filename}</span>
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-[var(--flux-text-muted)]">
                    Собрано за {result.durationMs} мс · Архив {Math.round((result.zipBytes || 0) / 1024)} КБ ·{' '}
                    server.cjs {Math.round((result.serverBytes || 0) / 1024)} КБ · {result.uiFilesCount} UI-файлов
                  </div>
                </div>
              </div>

              {result.stages && result.stages.length > 0 && (
                <div className="rounded border border-[var(--flux-line)] divide-y divide-[var(--flux-line)] bg-[var(--flux-bg)]">
                  {result.stages.map((st, idx) => (
                    <div key={idx} className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                      <div>
                        <span className="font-medium text-[var(--flux-text)]">{st.name}</span>
                        <span className="text-[var(--flux-text-muted)] ml-2">{st.detail}</span>
                      </div>
                      <span className="font-mono tabular-nums text-[var(--flux-text-muted)] shrink-0">
                        {st.durationMs} мс
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-1.5 text-[11px] text-[var(--flux-text-muted)]">
                <div className="flex items-center gap-1.5 font-semibold text-[var(--flux-text)]">
                  <Terminal className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>Запуск на вашем Windows-ПК</span>
                </div>
                <div>1. Распакуйте ZIP-архив в любую папку (например, D:\FluxE3_Portable).</div>
                <div>
                  2. Запустите <span className="font-mono text-[var(--flux-text)]">FluxE3_Portable.cmd</span> —
                  если на ПК нет Node.js 18+, лаунчер 1 раз сам скачает портативный{' '}
                  <span className="font-mono text-[var(--flux-text)]">node.exe</span> в папку{' '}
                  <span className="font-mono text-[var(--flux-text)]">runtime\</span>.
                </div>
                <div>
                  3. Браузер откроется сам, а кнопка <strong>«В E³.series»</strong> будет работать напрямую через
                  локальный COM без отдельного коннектора.
                </div>
              </div>
            </div>
          )}

          {!building && result && !result.ok && (
            <div className="p-3 rounded border border-rose-500/40 bg-rose-500/10 flex items-start gap-2.5 text-[12px]">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-[var(--flux-text)]">{result.error}</div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--flux-line)]">
            <button
              type="button"
              disabled={building}
              onClick={() => void runBuild()}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] font-medium disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${building ? 'animate-spin' : ''}`} />
              <span>Пересобрать заново</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-8 px-3 rounded border border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                Закрыть
              </button>
              {result?.ok && result.downloadUrl && result.filename && (
                <a
                  href={result.downloadUrl}
                  download={result.filename}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white font-medium"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Скачать .zip</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
