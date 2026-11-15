import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Cable,
  ChevronRight,
  ChevronDown,
  Cpu,
  FileText,
  PenTool,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { CatalogItem, E3Device, E3Project } from '../core/e3Types';
import { getSheetRevisionLabel, hasSheetUncommittedChanges } from '../core/sheetRevisions';
import type { SymbolWorkspaceActions } from '../core/symbolWorkspaceTypes';
import { isTwoPinBreakEligible } from '../core/wireEditing';
import { SymbolLibraryBrowser } from './SymbolLibraryBrowser';
import { SchematicSymbol } from './SchematicSymbol';
import { PinDot } from './PinDot';
import { findPinWire, getPinPotentialColor } from './pinPotential';

const SPLIT_KEY = 'e3promax_explorer_split_v1';
const SPLIT_MIN = 20;
const SPLIT_MAX = 80;
const SPLIT_DEFAULT = 50;
const NOOP = () => {};
const EMPTY_SET: Set<string> = new Set();

function readSplit(): number {
  try {
    const raw = window.localStorage.getItem(SPLIT_KEY);
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n)) return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n));
  } catch {
    /* storage unavailable */
  }
  return SPLIT_DEFAULT;
}

function writeSplit(v: number) {
  try {
    window.localStorage.setItem(SPLIT_KEY, String(Math.round(v * 10) / 10));
  } catch {
    /* storage unavailable */
  }
}

/** Real vector preview of a catalog item rendered by the schematic symbol renderer. */
const CatalogPreview: React.FC<{ item: CatalogItem; visual: E3Project['visualSettings'] }> = React.memo(({ item, visual }) => {
  const device = useMemo<E3Device>(
    () => ({
      id: `preview-${item.id}`,
      elementId: `preview-${item.id}`,
      designation: '',
      componentName: item.componentName,
      article: item.article,
      manufacturer: item.manufacturer,
      category: item.category,
      sheetId: '',
      x: 0,
      y: 0,
      rotation: 0,
      width: item.width,
      height: item.height,
      e3BlockName: item.e3BlockName,
      symbolId: item.symbolId,
      bindingState: 'PLACED',
      pins: item.pins.map((p, i) => ({ ...p, id: `pv${i}` })),
      attributes: [],
      customSymbol: item.customSymbol,
    }),
    [item]
  );
  const previewVisual = useMemo(
    () => ({ ...visual, showPinNumbers: false, showCrossRefs: false }),
    [visual]
  );
  const pad = 10;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${item.width + pad * 2} ${item.height + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      <SchematicSymbol
        device={device}
        selected={false}
        visual={previewVisual}
        wireStartPinKey={null}
        connectedPinKeys={EMPTY_SET}
        onSelectDevice={NOOP}
        onPinClick={NOOP}
      />
    </svg>
  );
});
CatalogPreview.displayName = 'CatalogPreview';



interface LeftExplorerProps {
  project: E3Project;
  catalog: CatalogItem[];
  activeSheetId: string;
  selectedDeviceId: string | null;
  activeTab?: 'project' | 'library';
  symbolWorkspace?: SymbolWorkspaceActions;
  onTabChange?: (tab: 'project' | 'library') => void;
  onSelectSheet: (sheetId: string) => void;
  onSelectDevice: (device: E3Device) => void;
  onPlaceCatalogItem: (item: CatalogItem) => void;
  onOpenAddCatalogItem: () => void;
  onEditCatalogItem: (item: CatalogItem) => void;
  onDeleteCustomCatalogItem: (itemId: string) => void;
  onOpenHvacWizard: () => void;
  onOpenSymbolDesigner?: () => void;
}

interface SectionHeaderProps {
  title: string;
  count: string | number;
  open: boolean;
  onToggle: () => void;
  testId: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, count, open, onToggle, testId }) => (
  <button
    type="button"
    data-testid={testId}
    aria-expanded={open}
    onClick={onToggle}
    className="w-full shrink-0 h-[calc(24px*var(--flux-ui-scale))] flex items-center justify-between gap-1 px-1.5 bg-[var(--flux-surface-alt)] border-y border-[var(--flux-line)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold uppercase tracking-wide text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
  >
    <span className="flex items-center gap-1 min-w-0">
      {open ? (
        <ChevronDown className="w-3 h-3 shrink-0 text-[var(--flux-text-muted)]" strokeWidth={1.6} />
      ) : (
        <ChevronRight className="w-3 h-3 shrink-0 text-[var(--flux-text-muted)]" strokeWidth={1.6} />
      )}
      <span className="truncate">{title}</span>
    </span>
    <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] normal-case">
      {count}
    </span>
  </button>
);

export const LeftExplorer: React.FC<LeftExplorerProps> = React.memo(({
  project,
  catalog,
  activeSheetId,
  selectedDeviceId,
  onSelectSheet,
  onSelectDevice,
  onPlaceCatalogItem,
  onOpenAddCatalogItem,
  onEditCatalogItem,
  onDeleteCustomCatalogItem,
  onOpenHvacWizard,
  onOpenSymbolDesigner,
  symbolWorkspace,
}) => {
  const [query, setQuery] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'hvac' | 'elec' | 'custom'>('all');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sheets: true,
    devices: true,
    cables: true,
  });
  const [openPanes, setOpenPanes] = useState({ top: true, bottom: true });
  const [expandedDevices, setExpandedDevices] = useState<Set<string>>(() => new Set());
  const [split, setSplit] = useState<number>(readSplit);
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const splitValueRef = useRef(split);
  splitValueRef.current = split;

  const q = query.trim().toLowerCase();

  const filteredDevices = useMemo(() => {
    const list = project.devices;
    if (!q) return list.slice(0, 180);
    return list
      .filter(
        (d) =>
          d.designation.toLowerCase().includes(q) ||
          d.componentName.toLowerCase().includes(q) ||
          d.article.toLowerCase().includes(q)
      )
      .slice(0, 180);
  }, [project.devices, q]);

  const filteredCables = useMemo(() => {
    if (!q) return project.cables;
    return project.cables.filter(
      (c) => c.designation.toLowerCase().includes(q) || c.cableType.toLowerCase().includes(q)
    );
  }, [project.cables, q]);

  const filteredCatalog = useMemo(() => {
    const hvacCats = new Set([
      'fan',
      'damper',
      'filter',
      'heater',
      'cooler',
      'sensor',
      'kip_circle',
      'airflow_arrow',
      'junction_box',
    ]);
    return catalog.filter((c) => {
      if (catalogFilter === 'custom' && !c.isCustom) return false;
      if (catalogFilter === 'hvac' && !c.stageRole && !hvacCats.has(c.category)) return false;
      if (catalogFilter === 'elec' && (Boolean(c.stageRole) || hvacCats.has(c.category))) return false;
      if (!q) return true;
      return (
        c.componentName.toLowerCase().includes(q) ||
        c.article.toLowerCase().includes(q) ||
        c.manufacturer.toLowerCase().includes(q) ||
        c.defaultPrefix.toLowerCase().includes(q)
      );
    });
  }, [catalog, catalogFilter, q]);

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleDeviceExpanded = (id: string) =>
    setExpandedDevices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const updateSplitFromPointer = useCallback((clientY: number) => {
    const el = splitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) return;
    const pct = ((clientY - rect.top) / rect.height) * 100;
    setSplit(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct)));
  }, []);

  if (symbolWorkspace?.draft.open) {
    return <SymbolLibraryBrowser workspace={symbolWorkspace} />;
  }

  const bothOpen = openPanes.top && openPanes.bottom;
  const headerPx = 'calc(24px*var(--flux-ui-scale))';
  const topStyle: React.CSSProperties = !openPanes.top
    ? { flex: `0 0 ${headerPx}` }
    : !openPanes.bottom
      ? { flex: '1 1 0%' }
      : { flex: `0 0 ${split}%` };
  const bottomStyle: React.CSSProperties = !openPanes.bottom
    ? { flex: `0 0 ${headerPx}` }
    : { flex: '1 1 0%' };

  const btnCls =
    'inline-flex items-center justify-center gap-1 h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[4px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap transition-colors';

  return (
    <aside
      aria-label="Устройства проекта и библиотека компонентов"
      className="no-print w-full h-full flex-1 min-w-0 flux-glass-panel flex flex-col min-h-0 select-none"
    >
      {/* Single search: filters both the tree and the library */}
      <div className="px-1.5 py-1 border-b border-[var(--flux-line)] bg-transparent shrink-0">
        <div className="relative">
          <Search className="w-3 h-3 text-[var(--flux-text-muted)] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.6} />
          <input
            type="search"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск устройств и библиотеки…"
            aria-label="Поиск по устройствам проекта и библиотеке компонентов"
            className="w-full h-[calc(22px*var(--flux-ui-scale))] pl-6 pr-1.5 rounded-[4px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none focus:border-[var(--flux-focus)]"
          />
        </div>
      </div>

      <div ref={splitRef} className="flex-1 min-h-0 flex flex-col bg-[var(--flux-surface)]">
        {/* ===== Top: Устройства ===== */}
        <section className="min-h-0 flex flex-col overflow-hidden" style={topStyle} aria-label="Устройства">
          <SectionHeader
            testId="explorer-section-devices"
            title="Устройства"
            count={q ? `${filteredDevices.length} / ${project.devices.length}` : project.devices.length}
            open={openPanes.top}
            onToggle={() => setOpenPanes((p) => ({ ...p, top: !p.top }))}
          />
          {openPanes.top && (
            <div className="flex-1 min-h-0 overflow-y-auto p-1 space-y-0.5">
              {/* Sheets */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection('sheets')}
                  className="w-full flex items-center justify-between px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[4px] text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
                >
                  <span className="flex items-center gap-1">
                    <ChevronRight
                      className={`w-3 h-3 text-[var(--flux-text-muted)] transition-transform duration-150 ${openSections.sheets ? 'rotate-90' : ''}`}
                      strokeWidth={1.6}
                    />
                    <span>Листы схемы</span>
                  </span>
                  <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                    {project.sheets.length}
                  </span>
                </button>
                {openSections.sheets && (
                  <div className="ml-2 pl-1.5 border-l border-[var(--flux-line)] space-y-px py-0.5">
                    {project.sheets.map((sh) => {
                      const active = sh.id === activeSheetId;
                      return (
                        <button
                          key={sh.id}
                          type="button"
                          onClick={() => onSelectSheet(sh.id)}
                          className={`w-full flex items-center justify-between gap-1 px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[4px] text-left text-[length:calc(11px*var(--flux-ui-scale))] transition-colors ${
                            active
                              ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                              : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <FileText
                              className={`w-3 h-3 shrink-0 ${active ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'}`}
                              strokeWidth={1.6}
                            />
                            <span className="truncate">
                              {sh.number}. {sh.name}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 shrink-0 font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                            <span data-testid={`explorer-sheet-rev-${sh.id}`}>
                              {getSheetRevisionLabel(sh)}
                              {hasSheetUncommittedChanges(project, sh) ? '*' : ''}
                            </span>
                            <span>{sh.format}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Devices */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection('devices')}
                  className="w-full flex items-center justify-between px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[4px] text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
                >
                  <span className="flex items-center gap-1">
                    <ChevronRight
                      className={`w-3 h-3 text-[var(--flux-text-muted)] transition-transform duration-150 ${openSections.devices ? 'rotate-90' : ''}`}
                      strokeWidth={1.6}
                    />
                    <span>Изделия</span>
                  </span>
                  <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                    {project.devices.length}
                  </span>
                </button>
                {openSections.devices && (
                  <div className="ml-2 pl-1.5 border-l border-[var(--flux-line)] space-y-px py-0.5">
                    {filteredDevices.length === 0 ? (
                      <div className="px-2 py-2 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                        Ничего не найдено по запросу «{query}».
                      </div>
                    ) : (
                      filteredDevices.map((dev) => {
                        const active = dev.id === selectedDeviceId;
                        const expanded = expandedDevices.has(dev.id);
                        const canExpand = dev.pins.length > 0;
                        return (
                          <div key={dev.id}>
                            <div
                              className={`flex items-center rounded-[4px] h-[calc(21px*var(--flux-ui-scale))] transition-colors ${
                                active ? 'bg-[var(--flux-sel)]' : 'hover:bg-[var(--flux-hover)]'
                              }`}
                            >
                              <button
                                type="button"
                                disabled={!canExpand}
                                onClick={() => toggleDeviceExpanded(dev.id)}
                                aria-expanded={expanded}
                                aria-label={`${expanded ? 'Свернуть' : 'Показать'} выводы ${dev.designation}`}
                                className="w-4 h-full shrink-0 inline-flex items-center justify-center text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] disabled:opacity-30"
                              >
                                <ChevronRight
                                  className={`w-3 h-3 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                                  strokeWidth={1.6}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => onSelectDevice(dev)}
                                className={`flex-1 min-w-0 h-full flex items-center justify-between gap-1.5 pr-1.5 text-left text-[length:calc(11px*var(--flux-ui-scale))] ${
                                  active ? 'text-[var(--flux-text)] font-medium' : 'text-[var(--flux-text)]'
                                }`}
                              >
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <Cpu
                                    className={`w-3 h-3 shrink-0 ${active ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'}`}
                                    strokeWidth={1.6}
                                  />
                                  <span className="font-mono shrink-0">{dev.designation}</span>
                                  <span className="truncate text-[var(--flux-text-muted)] text-[length:calc(10.5px*var(--flux-ui-scale))]">
                                    {dev.article}
                                  </span>
                                </span>
                                {dev.bindingState === 'REMOVED_IN_FLUX' && (
                                  <span className="text-[length:calc(10px*var(--flux-ui-scale))] text-rose-600 dark:text-rose-400 shrink-0">
                                    Снят
                                  </span>
                                )}
                              </button>
                            </div>
                            {expanded && (
                              <div className="ml-[calc(16px*var(--flux-ui-scale))] pl-1.5 border-l border-[var(--flux-line)] py-px">
                                {dev.pins.map((pin) => {
                                  const wire = findPinWire(project, dev.id, pin.id);
                                  const color = getPinPotentialColor(project, dev, pin);
                                  return (
                                    <div
                                      key={pin.id}
                                      data-testid={`explorer-pin-${dev.id}-${pin.id}`}
                                      title={wire ? `${wire.netName} (${wire.wireNumber})` : 'Свободен'}
                                      className="flex items-center gap-1.5 px-1.5 h-[calc(18px*var(--flux-ui-scale))] text-[length:calc(10.5px*var(--flux-ui-scale))]"
                                    >
                                      <PinDot color={color} size={7} />
                                      <span className="font-mono tabular-nums text-[var(--flux-text)] shrink-0">{pin.name}</span>
                                      {wire && (
                                        <span className="font-mono tabular-nums truncate text-[var(--flux-text-muted)]">
                                          {wire.netName}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    {project.devices.length > 180 && !q && (
                      <div className="px-2 py-1 text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                        Показаны первые 180 из {project.devices.length}. Используйте поиск.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Cables */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection('cables')}
                  className="w-full flex items-center justify-between px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[4px] text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
                >
                  <span className="flex items-center gap-1">
                    <ChevronRight
                      className={`w-3 h-3 text-[var(--flux-text-muted)] transition-transform duration-150 ${openSections.cables ? 'rotate-90' : ''}`}
                      strokeWidth={1.6}
                    />
                    <span>Кабели</span>
                  </span>
                  <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                    {project.cables.length}
                  </span>
                </button>
                {openSections.cables && (
                  <div className="ml-2 pl-1.5 border-l border-[var(--flux-line)] space-y-px py-0.5">
                    {filteredCables.map((cab) => (
                      <div
                        key={cab.id}
                        className="flex items-center justify-between gap-1.5 px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[4px] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Cable className="w-3 h-3 text-[var(--flux-text-muted)] shrink-0" strokeWidth={1.6} />
                          <span className="font-mono shrink-0">{cab.designation}</span>
                          <span className="truncate text-[var(--flux-text-muted)] text-[length:calc(10.5px*var(--flux-ui-scale))]">{cab.cableType}</span>
                        </span>
                        <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                          {cab.lengthMeters}м
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ===== Splitter ===== */}
        {bothOpen ? (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Изменить соотношение: устройства / библиотека (двойной щелчок — 50/50)"
            aria-valuenow={Math.round(split)}
            aria-valuemin={SPLIT_MIN}
            aria-valuemax={SPLIT_MAX}
            tabIndex={0}
            data-testid="explorer-splitter"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setDragging(true);
            }}
            onPointerMove={(e) => {
              if (dragging) updateSplitFromPointer(e.clientY);
            }}
            onPointerUp={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              setDragging(false);
              writeSplit(splitValueRef.current);
            }}
            onPointerCancel={() => setDragging(false)}
            onDoubleClick={() => {
              setSplit(SPLIT_DEFAULT);
              writeSplit(SPLIT_DEFAULT);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
              e.preventDefault();
              const next = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, split + (e.key === 'ArrowUp' ? -2 : 2)));
              setSplit(next);
              writeSplit(next);
            }}
            className="group relative shrink-0 h-[5px] -my-px z-10 cursor-row-resize touch-none focus:outline-none"
          >
            <span
              className={`absolute inset-x-0 top-[2px] h-px transition-colors ${
                dragging ? 'bg-[var(--flux-accent)]' : 'bg-[var(--flux-line-strong)] group-hover:bg-[var(--flux-accent)] group-focus-visible:bg-[var(--flux-accent)]'
              }`}
            />
          </div>
        ) : null}

        {/* ===== Bottom: Библиотека ===== */}
        <section className="min-h-0 flex flex-col overflow-hidden" style={bottomStyle} aria-label="Библиотека">
          <SectionHeader
            testId="explorer-section-library"
            title="Библиотека"
            count={q || catalogFilter !== 'all' ? `${filteredCatalog.length} / ${catalog.length}` : catalog.length}
            open={openPanes.bottom}
            onToggle={() => setOpenPanes((p) => ({ ...p, bottom: !p.bottom }))}
          />
          {openPanes.bottom && (
            <div className="flex-1 min-h-0 overflow-y-auto p-1 space-y-1">
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={onOpenAddCatalogItem} className={btnCls}>
                    <Plus className="w-3 h-3 text-[var(--flux-text-muted)]" strokeWidth={1.6} />
                    <span>Новое изделие</span>
                  </button>
                  <button type="button" onClick={onOpenHvacWizard} className={btnCls}>
                    <SlidersHorizontal className="w-3 h-3 text-[var(--flux-accent)]" strokeWidth={1.6} />
                    <span>Схема ПВ</span>
                  </button>
                </div>
                {onOpenSymbolDesigner && (
                  <button
                    type="button"
                    data-testid="explorer-symbol-designer-btn"
                    onClick={onOpenSymbolDesigner}
                    className={`w-full ${btnCls}`}
                  >
                    <PenTool className="w-3 h-3 text-[var(--flux-accent)]" strokeWidth={1.6} />
                    <span>Редактор графики УГО…</span>
                  </button>
                )}
              </div>
              <div
                role="group"
                aria-label="Фильтр категории базы"
                className="grid grid-cols-4 rounded-[4px] border border-[var(--flux-line)] divide-x divide-[var(--flux-line)] bg-[var(--flux-bg)] overflow-hidden"
              >
                {(
                  [
                    ['all', 'Все'],
                    ['hvac', 'ФСА'],
                    ['elec', 'Электр.'],
                    ['custom', 'Мои'],
                  ] as const
                ).map(([catKey, label]) => {
                  const active = catalogFilter === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      data-testid={`catalog-filter-${catKey}`}
                      onClick={() => setCatalogFilter(catKey)}
                      className={`h-[calc(21px*var(--flux-ui-scale))] text-[length:calc(10.5px*var(--flux-ui-scale))] transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-semibold'
                          : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] font-medium'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {filteredCatalog.length === 0 ? (
                <div className="px-2 py-4 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] space-y-1.5 text-center">
                  <div>Компоненты в выбранной категории не найдены.</div>
                  {(q || catalogFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setCatalogFilter('all');
                      }}
                      className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-accent)] hover:underline"
                    >
                      Сбросить фильтры
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  {filteredCatalog.map((item) => (
                    <div
                      key={item.id}
                      data-testid={`catalog-item-${item.id}`}
                      draggable
                      title={`${item.componentName}\nПеретащите на лист или дважды щёлкните`}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-flux-catalog-id', item.id);
                        if (isTwoPinBreakEligible(item)) {
                          e.dataTransfer.setData('application/x-flux-2pin', '1');
                        }
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onDoubleClick={() => onPlaceCatalogItem(item)}
                      className="group/card relative flex flex-col min-w-0 rounded-[4px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:border-[var(--flux-accent)] hover:-translate-y-px hover:shadow-sm transition-[transform,border-color,box-shadow] duration-[120ms] cursor-grab active:cursor-grabbing"
                    >
                      <div className="relative h-[calc(52px*var(--flux-ui-scale))] bg-[var(--flux-bg)] rounded-t-[3px] border-b border-[var(--flux-line)] p-1 text-[var(--flux-text)]">
                        <CatalogPreview item={item} visual={project.visualSettings} />
                        {item.isCustom && (
                          <span className="absolute left-0.5 top-0.5 px-1 rounded-[3px] bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] font-mono text-[length:calc(8.5px*var(--flux-ui-scale))] leading-[12px]">
                            мой
                          </span>
                        )}
                        <div className="absolute right-0.5 top-0.5 flex items-center gap-px opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => onPlaceCatalogItem(item)}
                            title="Разместить на листе"
                            aria-label={`На лист: ${item.componentName}`}
                            className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] inline-flex items-center justify-center rounded-[4px] bg-[var(--flux-surface)] border border-[var(--flux-line-strong)] text-[var(--flux-accent)] hover:bg-[var(--flux-sel)]"
                          >
                            <Plus className="w-3 h-3" strokeWidth={1.6} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditCatalogItem(item)}
                            title="Редактировать изделие и его атрибуты"
                            aria-label={`Редактировать ${item.componentName}`}
                            className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] inline-flex items-center justify-center rounded-[4px] bg-[var(--flux-surface)] border border-[var(--flux-line-strong)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
                          >
                            <Pencil className="w-3 h-3" strokeWidth={1.6} />
                          </button>
                          {item.isCustom && (
                            <button
                              type="button"
                              onClick={() => onDeleteCustomCatalogItem(item.id)}
                              title="Удалить из базы"
                              aria-label={`Удалить ${item.componentName}`}
                              className="w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))] inline-flex items-center justify-center rounded-[4px] bg-[var(--flux-surface)] border border-[var(--flux-line-strong)] text-[var(--flux-text-muted)] hover:text-rose-600"
                            >
                              <Trash2 className="w-3 h-3" strokeWidth={1.6} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="px-1.5 py-1 min-w-0">
                        <div
                          className="text-[length:calc(10.5px*var(--flux-ui-scale))] leading-[1.25] text-[var(--flux-text)] font-medium"
                          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {item.componentName}
                        </div>
                        <div className="mt-0.5 font-mono tabular-nums text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] truncate">
                          {item.article}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
});
LeftExplorer.displayName = 'LeftExplorer';
