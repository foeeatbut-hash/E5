import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  error: Error | null;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[E3ProMax ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || 'Непредвиденная ошибка интерфейса';
      return (
        <div
          role="alert"
          className="h-screen w-screen flex items-center justify-center p-6 bg-slate-950 text-slate-100 select-text"
        >
          <div className="max-w-lg w-full rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-5 shadow-2xl space-y-3">
            <div className="text-sm font-semibold text-emerald-400">
              E3ProMax · Восстановление после сбоя интерфейса
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">
              Произошло исключение при отрисовке рабочей области:
            </div>
            <pre className="p-2.5 rounded-lg bg-black/50 border border-slate-800 text-[11px] font-mono text-rose-300 overflow-x-auto max-h-40">
              {msg}
            </pre>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => this.setState({ error: null })}
                className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Попробовать снова
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage?.removeItem('e3promax_active_session_v1');
                    window.localStorage?.removeItem('e3promax.dockLayout.v1');
                    window.localStorage?.removeItem('e3promax_cmd_history_v1');
                  } catch {
                    // ignore
                  }
                  window.location.reload();
                }}
                className="h-8 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
              >
                Сбросить кэш сессии и перезагрузить
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

