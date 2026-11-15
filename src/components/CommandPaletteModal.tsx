import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CornerDownLeft,
  Cpu,
  FileText,
  Layers,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  type CommandPaletteItem,
  type TopSearchCategory,
  TOP_SEARCH_CATEGORY_LABELS,
  filterTopSearchItems,
} from '../core/commandPalette';

interface CommandPaletteModalProps {
  open: boolean;
  items: CommandPaletteItem[];
  initialQuery?: string;
  uiScale?: number;
  onClose: () => void;
  onExecute: (item: CommandPaletteItem) => void;
}

const FILTER_TABS: Array<{ id: 'all' | TopSearchCategory; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'section', label: 'Разделы' },
  { id: 'feature', label: 'Функции' },
  { id: 'sheet', label: 'Листы' },
  { id: 'device', label: 'ОУО' },
];

const SHORT_CATEGORY_HINT: Record<string, string> = {
  section: 'Раздел',
  feature: 'Функция',
  sheet: 'Лист',
  device: 'ОУО',
};

const CategoryIcon: React.FC<{ category: CommandPaletteItem['category']; active?: boolean }> = ({
  category,
  active,
}) => {
  const baseClass = `w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))] shrink-0 ${
    active ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'
  }`;
  switch (category) {
    case 'section':
      return <Layers className={baseClass} />;
    case 'feature':
      return <SlidersHorizontal className={baseClass} />;
    case 'sheet':
      return <FileText className={baseClass} />;
    case 'device':
      return <Cpu className={baseClass} />;
    default:
      return <Search className={baseClass} />;
  }
};

function HighlightedText({ text, query }: { text: string; query: string }) {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 1);
  if (tokens.length === 0) return <>{text}</>;

  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const tok of tokens) {
    let idx = 0;
    while (idx < lower.length) {
      const found = lower.indexOf(tok, idx);
      if (found === -1) break;
      ranges.push([found, found + tok.length]);
      idx = found + tok.length;
    }
  }
  if (ranges.length === 0) return <>{text}</>;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const prev = merged[merged.length - 1];
    if (prev && r[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], r[1]);
    } else {
      merged.push([r[0], r[1]]);
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([start, end], i) => {
    if (start > cursor) {
      parts.push(<React.Fragment key={`n-${i}`}>{text.slice(cursor, start)}</React.Fragment>);
    }
    parts.push(
      <mark
        key={`m-${i}`}
        className="bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] font-semibold rounded-[2px]"
      >
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  });
  if (cursor < text.length) {
    parts.push(<React.Fragment key="tail">{text.slice(cursor)}</React.Fragment>);
  }
  return <>{parts}</>;
}

interface AnchoredGeometry {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function computeAnchoredGeometry(uiScalePercent: number): AnchoredGeometry {
  if (typeof window === 'undefined') {
    return { top: 44, left: 200, width: 500, maxHeight: 380 };
  }
  const scale = Math.max(1, uiScalePercent / 100);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.round(500 * scale), vw - 24);

  const btn = document.querySelector<HTMLElement>('[data-testid="toolbar-command-palette-btn"]');
  const rect = btn?.getBoundingClientRect();

  let top = Math.round(42 * scale);
  let left = Math.round((vw - width) / 2);

  if (rect && rect.width > 0 && rect.height > 0 && rect.bottom < vh * 0.4) {
    top = Math.round(rect.bottom + 6);
    const btnCenter = rect.left + rect.width / 2;
    const isNearCenter = btnCenter >= vw * 0.28 && btnCenter <= vw * 0.72;
    if (isNearCenter) {
      left = Math.round(btnCenter - width / 2);
    } else if (rect.right > vw * 0.55) {
      left = Math.round(rect.right - width);
    } else {
      left = Math.round(rect.left);
    }
  }

  left = Math.max(12, Math.min(vw - width - 12, left));
  const maxHeight = Math.max(220, Math.min(Math.round(410 * scale), vh - top - 20));
  return { top, left, width, maxHeight };
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  items,
  initialQuery = '',
  uiScale = 100,
  onClose,
  onExecute,
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | TopSearchCategory>('all');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [geometry, setGeometry] = useState<AnchoredGeometry>(() =>
    computeAnchoredGeometry(uiScale)
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () => filterTopSearchItems(items, query, activeCategory),
    [items, query, activeCategory]
  );

  const groupedSections = useMemo(() => {
    const isBrowsingGrouped = query.trim().length === 0 && activeCategory === 'all';
    if (!isBrowsingGrouped) {
      return [{ label: null as string | null, items: filtered.map((item, idx) => ({ item, idx })) }];
    }
    const order: TopSearchCategory[] = ['section', 'feature', 'sheet', 'device'];
    const result: Array<{
      label: string | null;
      items: Array<{ item: CommandPaletteItem; idx: number }>;
    }> = [];
    let runningIdx = 0;
    for (const cat of order) {
      const catItems = filtered.filter((i) => i.category === cat);
      if (catItems.length === 0) continue;
      result.push({
        label: TOP_SEARCH_CATEGORY_LABELS[cat],
        items: catItems.map((item) => ({ item, idx: runningIdx++ })),
      });
    }
    return result;
  }, [filtered, query, activeCategory]);

  const orderedFlatItems = useMemo(
    () => groupedSections.flatMap((g) => g.items.map((entry) => entry.item)),
    [groupedSections]
  );

  const refreshGeometry = useCallback(() => {
    setGeometry(computeAnchoredGeometry(uiScale));
  }, [uiScale]);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setActiveCategory('all');
    setSelectedIdx(0);
    refreshGeometry();
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('resize', refreshGeometry);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onWindowKeyDown);
      window.removeEventListener('resize', refreshGeometry);
    };
  }, [open, initialQuery, onClose, refreshGeometry]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, activeCategory]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIdx, orderedFlatItems.length]);

  const runItem = (item: CommandPaletteItem | undefined) => {
    if (!item || item.disabled) return;
    onClose();
    onExecute(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (orderedFlatItems.length > 0) {
        setSelectedIdx((idx) => (idx + 1) % orderedFlatItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (orderedFlatItems.length > 0) {
        setSelectedIdx((idx) => (idx - 1 + orderedFlatItems.length) % orderedFlatItems.length);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const idx = FILTER_TABS.findIndex((t) => t.id === activeCategory);
      const next = e.shiftKey
        ? (idx - 1 + FILTER_TABS.length) % FILTER_TABS.length
        : (idx + 1) % FILTER_TABS.length;
      setActiveCategory(FILTER_TABS[next].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(orderedFlatItems[selectedIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          data-testid="command-palette-modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 bg-black/10 dark:bg-black/25 pointer-events-auto"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Поиск разделов, функций и объектов проекта"
            data-testid="command-palette-modal"
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{
              top: geometry.top,
              left: geometry.left,
              width: geometry.width,
              maxHeight: geometry.maxHeight,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="fixed rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-popover shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
          >
            {/* Top Search Field */}
            <div className="min-h-[calc(38px*var(--flux-ui-scale))] px-3 py-1.5 border-b border-[var(--flux-line)] flex items-center gap-2 shrink-0">
              <Search
                className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))] text-[var(--flux-accent)] shrink-0"
                strokeWidth={1.7}
              />
              <input
                ref={inputRef}
                type="text"
                spellCheck={false}
                data-testid="command-palette-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Поиск разделов, функций, листов, ОУО…"
                aria-label="Поиск разделов, функций, листов и ОУО"
                className="flex-1 min-w-0 bg-transparent text-[length:calc(12.5px*var(--flux-ui-scale))] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)]/80 focus:outline-none"
              />
              {query.trim().length > 0 && (
                <span className="font-mono tabular-nums text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                  {orderedFlatItems.length}
                </span>
              )}
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Очистить поиск"
                  className="inline-flex items-center justify-center w-[calc(20px*var(--flux-ui-scale))] h-[calc(20px*var(--flux-ui-scale))] rounded-[4px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть поиск"
                title="Закрыть (Esc)"
                className="inline-flex items-center justify-center px-1.5 h-[calc(20px*var(--flux-ui-scale))] rounded-[4px] font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors shrink-0"
              >
                Esc
              </button>
            </div>

            {/* Clean Segmented Scope Filter Tabs (Zero Pills) */}
            <div
              role="tablist"
              aria-label="Фильтр области поиска"
              className="px-3 h-[calc(28px*var(--flux-ui-scale))] border-b border-[var(--flux-line)] flex items-center gap-3 overflow-x-auto no-scrollbar shrink-0 bg-[var(--flux-surface-alt)]/55"
            >
              {FILTER_TABS.map((tab) => {
                const isSelected = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    data-testid={`top-search-tab-${tab.id}`}
                    onClick={() => {
                      setActiveCategory(tab.id);
                      inputRef.current?.focus();
                    }}
                    className={`relative h-full inline-flex items-center text-[length:calc(11px*var(--flux-ui-scale))] whitespace-nowrap transition-colors shrink-0 border-b-2 -mb-px ${
                      isSelected
                        ? 'border-[var(--flux-accent)] text-[var(--flux-accent)] font-semibold'
                        : 'border-transparent text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] font-medium'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Results List */}
            <div
              ref={listRef}
              data-testid="command-palette-list"
              className="flex-1 min-h-0 overflow-y-auto py-1"
            >
              {orderedFlatItems.length === 0 ? (
                <div className="px-4 py-7 text-center text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                  <div>По запросу «{query}» ничего не найдено.</div>
                  <div className="mt-1 text-[length:calc(10.5px*var(--flux-ui-scale))] opacity-80">
                    Для команд черчения (ПРОВОД, СЕТКА, ВПИСАТЬ) используйте строку внизу экрана.
                  </div>
                </div>
              ) : (
                groupedSections.map((group, gIdx) => (
                  <div key={group.label ?? `group-${gIdx}`}>
                    {group.label && (
                      <div className="px-3 pt-2 pb-1 text-[length:calc(9.5px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.06em] text-[var(--flux-text-muted)] select-none">
                        {group.label}
                      </div>
                    )}
                    {group.items.map(({ item, idx }) => {
                      const isActive = idx === selectedIdx;
                      const catHint = SHORT_CATEGORY_HINT[item.category] || '';
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`cmd-item-${item.id}`}
                          data-active={isActive ? 'true' : 'false'}
                          disabled={item.disabled}
                          onMouseEnter={() => setSelectedIdx(idx)}
                          onClick={() => runItem(item)}
                          className={`w-full px-3 py-1.5 flex items-center justify-between gap-2.5 text-left transition-colors disabled:opacity-45 ${
                            isActive
                              ? 'bg-[var(--flux-sel)]'
                              : 'hover:bg-[var(--flux-hover)]/75'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <span className="mt-[2px]">
                              <CategoryIcon category={item.category} active={isActive} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[length:calc(12px*var(--flux-ui-scale))] leading-[1.3] font-medium text-[var(--flux-text)] truncate">
                                <HighlightedText text={item.title} query={query} />
                              </div>
                              {item.subtitle && (
                                <div className="text-[length:calc(10.5px*var(--flux-ui-scale))] leading-[1.3] text-[var(--flux-text-muted)] truncate">
                                  <HighlightedText text={item.subtitle} query={query} />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                            {catHint && !group.label && (
                              <span className="hidden sm:inline">{catHint}</span>
                            )}
                            {item.shortcut && (
                              <span className="font-mono text-[var(--flux-text-muted)]">
                                {item.shortcut}
                              </span>
                            )}
                            {isActive && !item.disabled && (
                              <CornerDownLeft className="w-3 h-3 text-[var(--flux-accent)]" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Minimal Quiet Footer */}
            <div className="h-[calc(24px*var(--flux-ui-scale))] px-3 border-t border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/55 flex items-center justify-between gap-2 text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
              <span>↑↓ выбор · Enter открыть · Tab фильтр</span>
              <span className="hidden sm:inline opacity-80">Команды чертежа — снизу</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
