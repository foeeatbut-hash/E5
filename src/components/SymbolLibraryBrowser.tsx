import React, { useMemo, useState } from 'react';
import { Copy, Database, Layers, Plus, Search, Trash2 } from 'lucide-react';
import type { CustomSymbolShape, E3Pin } from '../core/e3Types';
import {
  describeSvgArcPath,
  extractBuiltInSymbolShapes,
  resolveShapeStrokeDasharray,
} from '../core/symbolLibrary';
import type { SymbolWorkspaceActions } from '../core/symbolWorkspaceTypes';

interface SymbolLibraryBrowserProps {
  workspace: SymbolWorkspaceActions;
}

const MiniSymbolPreview: React.FC<{
  width: number;
  height: number;
  shapes: CustomSymbolShape[];
  pins?: Array<Pick<E3Pin, 'dx' | 'dy'>>;
}> = ({ width, height, shapes, pins = [] }) => {
  const pad = 4;
  const vb = `${-pad} ${-pad} ${Math.max(40, width) + pad * 2} ${Math.max(40, height) + pad * 2}`;
  return (
    <svg
      width="32"
      height="32"
      viewBox={vb}
      className="shrink-0 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)]"
      aria-hidden="true"
    >
      {shapes.map((sh) => {
        const stroke = sh.strokeColor || 'var(--flux-text)';
        const sw = Math.max(1.8, ((sh.kind !== 'text' ? sh.strokeWidth : undefined) || 1.8) * 1.4);
        const dash = resolveShapeStrokeDasharray(sh);
        if (sh.kind === 'line') {
          return (
            <line
              key={sh.id}
              x1={sh.x1}
              y1={sh.y1}
              x2={sh.x2}
              y2={sh.y2}
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={dash}
            />
          );
        }
        if (sh.kind === 'polyline') {
          const pts = (sh.points || []).map((p) => `${p.x},${p.y}`).join(' ');
          return sh.closed ? (
            <polygon
              key={sh.id}
              points={pts}
              fill={sh.filled ? sh.fillColor || 'var(--flux-surface)' : 'none'}
              stroke={stroke}
              strokeWidth={sw}
            />
          ) : (
            <polyline key={sh.id} points={pts} fill="none" stroke={stroke} strokeWidth={sw} />
          );
        }
        if (sh.kind === 'rect') {
          return (
            <rect
              key={sh.id}
              x={sh.x}
              y={sh.y}
              width={sh.width}
              height={sh.height}
              fill={sh.filled ? sh.fillColor || 'var(--flux-surface)' : 'none'}
              stroke={stroke}
              strokeWidth={sw}
            />
          );
        }
        if (sh.kind === 'circle') {
          return (
            <circle
              key={sh.id}
              cx={sh.cx}
              cy={sh.cy}
              r={sh.r}
              fill={sh.filled ? sh.fillColor || 'var(--flux-surface)' : 'none'}
              stroke={stroke}
              strokeWidth={sw}
            />
          );
        }
        if (sh.kind === 'arc') {
          return (
            <path
              key={sh.id}
              d={describeSvgArcPath(sh.cx, sh.cy, sh.r, sh.startAngle, sh.endAngle)}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
            />
          );
        }
        return null;
      })}
      {pins.map((p, i) => (
        <circle key={i} cx={p.dx} cy={p.dy} r={2.5} fill="#f59e0b" />
      ))}
    </svg>
  );
};

export const SymbolLibraryBrowser: React.FC<SymbolLibraryBrowserProps> = ({ workspace }) => {
  const { draft, symbolLibrary, catalog } = workspace;
  const [subTab, setSubTab] = useState<'symbols' | 'components'>(
    draft.targetMode === 'component' ? 'components' : 'symbols'
  );
  const [query, setQuery] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | 'custom' | 'builtin'>('all');

  const q = query.trim().toLowerCase();

  const filteredSymbols = useMemo(() => {
    return symbolLibrary.filter((sym) => {
      if (filterKind === 'custom' && !sym.isCustom) return false;
      if (filterKind === 'builtin' && sym.isCustom) return false;
      if (!q) return true;
      return (
        sym.name.toLowerCase().includes(q) ||
        sym.e3BlockName.toLowerCase().includes(q) ||
        sym.category.toLowerCase().includes(q) ||
        (sym.description || '').toLowerCase().includes(q)
      );
    });
  }, [symbolLibrary, filterKind, q]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter((item) => {
      if (filterKind === 'custom' && !item.isCustom) return false;
      if (filterKind === 'builtin' && item.isCustom) return false;
      if (!q) return true;
      return (
        item.componentName.toLowerCase().includes(q) ||
        item.article.toLowerCase().includes(q) ||
        item.manufacturer.toLowerCase().includes(q) ||
        item.e3BlockName.toLowerCase().includes(q)
      );
    });
  }, [catalog, filterKind, q]);

  return (
    <aside
      aria-label="Библиотека УГО и изделий E3"
      data-testid="symbol-library-browser"
      className="w-full h-full flex-1 min-w-0 bg-[var(--flux-bg)] flex flex-col min-h-0 select-none"
    >
      {/* Switcher: УГО (Графика) vs Изделия (БД) */}
      <div className="p-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] space-y-1.5">
        <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)]">
          <button
            type="button"
            data-testid="sym-lib-tab-symbols"
            onClick={() => setSubTab('symbols')}
            className={`inline-flex items-center justify-center gap-1.5 h-7 rounded text-[11.5px] font-medium whitespace-nowrap transition-colors ${
              subTab === 'symbols'
                ? 'bg-[var(--flux-surface)] border border-[var(--flux-line)] text-[var(--flux-text)] shadow-2xs'
                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
            }`}
          >
            <Layers className={`w-3.5 h-3.5 ${subTab === 'symbols' ? 'text-[var(--flux-accent)]' : ''}`} />
            <span>УГО ({symbolLibrary.length})</span>
          </button>
          <button
            type="button"
            data-testid="sym-lib-tab-components"
            onClick={() => setSubTab('components')}
            className={`inline-flex items-center justify-center gap-1.5 h-7 rounded text-[11.5px] font-medium whitespace-nowrap transition-colors ${
              subTab === 'components'
                ? 'bg-[var(--flux-surface)] border border-[var(--flux-line)] text-[var(--flux-text)] shadow-2xs'
                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
            }`}
          >
            <Database className={`w-3.5 h-3.5 ${subTab === 'components' ? 'text-[var(--flux-accent)]' : ''}`} />
            <span>Изделия ({catalog.length})</span>
          </button>
        </div>

        <div className="text-[10.5px] text-[var(--flux-text-muted)] leading-snug">
          {subTab === 'symbols'
            ? 'Графические блоки УГО. Выберите блок для правки или клонируйте.'
            : 'Изделия БД E3: привязывают графику УГО к артикулу и атрибутам.'}
        </div>
      </div>

      {/* Actions + Search + Filter */}
      <div className="p-2 border-b border-[var(--flux-line)] space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="sym-lib-new-symbol-btn"
            onClick={workspace.onCreateNewBlankSymbol}
            className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>Новое УГО</span>
          </button>
          <button
            type="button"
            data-testid="sym-lib-new-component-btn"
            onClick={workspace.onCreateNewComponentFromSymbol}
            className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Изделие</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--flux-text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={subTab === 'symbols' ? 'Поиск блока УГО…' : 'Поиск изделия или артикула…'}
            className="w-full h-7 pl-8 pr-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none focus:border-[var(--flux-focus)]"
          />
        </div>

        <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)]">
          {(
            [
              ['all', 'Все'],
              ['custom', 'Свои'],
              ['builtin', 'База'],
            ] as const
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterKind(k)}
              className={`h-6 rounded-xs text-[11px] font-medium transition-colors ${
                filterKind === k
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Items List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {subTab === 'symbols' ? (
          <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)] overflow-hidden">
            {filteredSymbols.map((sym) => {
              const active = draft.symbolId === sym.id;
              return (
                <div
                  key={sym.id}
                  data-testid={`sym-lib-symbol-${sym.id}`}
                  onClick={() => workspace.onOpenSymbolInEditor(sym)}
                  className={`px-2 py-1.5 cursor-pointer flex items-center gap-2 transition-colors ${
                    active ? 'bg-[var(--flux-sel)]' : 'hover:bg-[var(--flux-hover)]'
                  }`}
                >
                  <MiniSymbolPreview
                    width={sym.width}
                    height={sym.height}
                    shapes={sym.shapes}
                    pins={sym.defaultPins}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11.5px] font-medium text-[var(--flux-text)] truncate">
                        {sym.name}
                      </span>
                      {sym.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            workspace.onDeleteCustomSymbol(sym.id);
                          }}
                          title="Удалить пользовательское УГО"
                          className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600 shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="text-[10.5px] font-mono tabular-nums text-[var(--flux-text-muted)] truncate">
                      {sym.e3BlockName} · {sym.width}×{sym.height} · {sym.shapes.length}ф · {sym.defaultPins.length}в
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredSymbols.length === 0 && (
              <div className="p-3 text-center text-[11.5px] text-[var(--flux-text-muted)]">
                УГО не найдены.
              </div>
            )}
          </div>
        ) : (
          <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)] overflow-hidden">
            {filteredCatalog.map((item) => {
              const active = draft.catalogItemId === item.id;
              const shapes =
                item.customSymbol?.shapes?.length
                  ? item.customSymbol.shapes
                  : extractBuiltInSymbolShapes(item.category, item.width, item.height, item.e3BlockName, item.pins);
              return (
                <div
                  key={item.id}
                  data-testid={`sym-lib-comp-${item.id}`}
                  onClick={() => workspace.onOpenCatalogItemInEditor(item)}
                  className={`px-2 py-1.5 cursor-pointer flex items-center gap-2 transition-colors ${
                    active ? 'bg-[var(--flux-sel)]' : 'hover:bg-[var(--flux-hover)]'
                  }`}
                >
                  <MiniSymbolPreview
                    width={item.width}
                    height={item.height}
                    shapes={shapes}
                    pins={item.pins}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11.5px] font-medium text-[var(--flux-text)] truncate">
                        {item.componentName}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          workspace.onOpenCatalogItemInEditor(item);
                        }}
                        title="Открыть в редакторе УГО"
                        className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="text-[10.5px] font-mono tabular-nums text-[var(--flux-text-muted)] truncate">
                      -{item.defaultPrefix}? · {item.article} · {item.defaultAttributes.length} атр.
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredCatalog.length === 0 && (
              <div className="p-3 text-center text-[var(--flux-text-muted)] text-[11.5px]">
                Изделия не найдены.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
