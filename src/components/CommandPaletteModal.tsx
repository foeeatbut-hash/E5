import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Command,
  CornerDownLeft,
  Cpu,
  FileText,
  Grid3X3,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import {
  COMMAND_CATEGORY_LABELS,
  type CommandPaletteItem,
  filterCommandPaletteItems,
} from '../core/commandPalette';

interface CommandPaletteModalProps {
  open: boolean;
  items: CommandPaletteItem[];
  initialQuery?: string;
  onClose: () => void;
  onExecute: (item: CommandPaletteItem) => void;
}

const CategoryIcon: React.FC<{ category: CommandPaletteItem['category'] }> = ({ category }) => {
  switch (category) {
    case 'tool':
      return <Wrench className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />;
    case 'view':
      return <Grid3X3 className="w-3.5 h-3.5 text-sky-500 shrink-0" />;
    case 'device':
      return <Cpu className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    case 'sheet':
      return <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    default:
      return <Command className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />;
  }
};

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  items,
  initialQuery = '',
  onClose,
  onExecute,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => filterCommandPaletteItems(items, query), [items, query]);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setSelectedIdx(0);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [open, initialQuery]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>('[data-active="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIdx, filtered.length]);

  const runItem = (item: CommandPaletteItem | undefined) => {
    if (!item || item.disabled) return;
    onClose();
    onExecute(item);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIdx((idx) => (idx + 1) % filtered.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length > 0) {
        setSelectedIdx((idx) => (idx - 1 + filtered.length) % filtered.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(filtered[selectedIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="command-palette-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 bg-slate-950/50 backdrop-blur-[1px]"
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            style={{ boxShadow: 'var(--flux-popover-shadow)' }}
            className="w-full max-w-[640px] rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] overflow-hidden flex flex-col"
          >
            <div className="h-11 px-3 border-b border-[var(--flux-line)] flex items-center gap-2.5 bg-[var(--flux-bg)]">
              <Search className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                data-testid="command-palette-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Команда (WIRE, MOVE, ROTATE, ZOOM, ERC, DXF) или ОУО (-KM1)…"
                aria-label="Палитра команд CAD"
                className="flex-1 min-w-0 bg-transparent text-[13px] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none"
              />
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[10px] text-[var(--flux-text-muted)]">
                Esc
              </kbd>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть палитру команд"
                className="inline-flex items-center justify-center w-6 h-6 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div
              ref={listRef}
              data-testid="command-palette-list"
              className="max-h-[380px] overflow-y-auto divide-y divide-[var(--flux-line)]/70"
            >
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-[12px] text-[var(--flux-text-muted)]">
                  По запросу «{query}» команды или аппараты не найдены.
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const isActive = idx === selectedIdx;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`cmd-item-${item.id}`}
                      data-active={isActive ? 'true' : 'false'}
                      disabled={item.disabled}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => runItem(item)}
                      className={`w-full px-3 py-2 flex items-center justify-between gap-3 text-left transition-colors disabled:opacity-45 ${
                        isActive ? 'bg-[var(--flux-sel)]' : 'hover:bg-[var(--flux-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CategoryIcon category={item.category} />
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-medium text-[var(--flux-text)] truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-[var(--flux-text-muted)] truncate">
                            {item.subtitle}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] text-[10px] text-[var(--flux-text-muted)]">
                          {COMMAND_CATEGORY_LABELS[item.category]}
                        </span>
                        {item.shortcut && (
                          <kbd className="px-1.5 py-0.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10px] text-[var(--flux-text)]">
                            {item.shortcut}
                          </kbd>
                        )}
                        {isActive && !item.disabled && (
                          <CornerDownLeft className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="h-8 px-3 border-t border-[var(--flux-line)] bg-[var(--flux-bg)] flex items-center justify-between gap-2 text-[10.5px] text-[var(--flux-text-muted)]">
              <div className="flex items-center gap-3">
                <span>↑↓ выбор</span>
                <span>Enter выполнить</span>
              </div>
              <div className="hidden sm:flex items-center gap-2.5 font-mono">
                <span>F3 Привязка</span>
                <span>F8 Орто</span>
                <span>F9 Сетка</span>
                <span>Space Провод</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
