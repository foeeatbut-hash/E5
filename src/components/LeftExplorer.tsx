import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Cable,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  FolderTree,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import type { CatalogItem, E3Device, E3Project } from '../core/e3Types';

interface LeftExplorerProps {
  project: E3Project;
  catalog: CatalogItem[];
  activeSheetId: string;
  selectedDeviceId: string | null;
  activeTab?: 'project' | 'library';
  onTabChange?: (tab: 'project' | 'library') => void;
  onSelectSheet: (sheetId: string) => void;
  onSelectDevice: (device: E3Device) => void;
  onPlaceCatalogItem: (item: CatalogItem) => void;
  onOpenAddCatalogItem: () => void;
  onEditCatalogItem: (item: CatalogItem) => void;
  onDeleteCustomCatalogItem: (itemId: string) => void;
  onOpenHvacWizard: () => void;
}

const TREE_TRANSITION = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

export const LeftExplorer: React.FC<LeftExplorerProps> = ({
  project,
  catalog,
  activeSheetId,
  selectedDeviceId,
  activeTab,
  onTabChange,
  onSelectSheet,
  onSelectDevice,
  onPlaceCatalogItem,
  onOpenAddCatalogItem,
  onEditCatalogItem,
  onDeleteCustomCatalogItem,
  onOpenHvacWizard,
}) => {
  const [internalTab, setInternalTab] = useState<'project' | 'library'>('project');
  const tab = activeTab ?? internalTab;
  const setTab = (next: 'project' | 'library') => {
    if (onTabChange) onTabChange(next);
    else setInternalTab(next);
  };
  const [query, setQuery] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'hvac' | 'elec' | 'custom'>('all');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sheets: true,
    devices: true,
    cables: true,
  });

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

  return (
    <aside
      aria-label="Дерево проекта и библиотека компонентов"
      className="no-print w-full h-full flex-1 min-w-0 bg-[var(--flux-bg)] flex flex-col min-h-0 select-none"
    >
      {/* Segmented Switcher */}
      <div className="p-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]">
        <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md border border-[var(--flux-line)] bg-[var(--flux-bg)]">
          <button
            type="button"
            onClick={() => setTab('project')}
            className={`relative inline-flex items-center justify-center gap-1.5 h-7 rounded text-[12px] font-medium transition-colors whitespace-nowrap ${
              tab === 'project'
                ? 'text-[var(--flux-text)]'
                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
            }`}
          >
            {tab === 'project' && (
              <motion.span
                layoutId="explorer-tab-pill"
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 rounded bg-[var(--flux-surface)] border border-[var(--flux-line)] shadow-2xs"
                aria-hidden="true"
              />
            )}
            <FolderTree className={`relative z-10 w-3.5 h-3.5 ${tab === 'project' ? 'text-[var(--flux-accent)]' : ''}`} />
            <span className="relative z-10">Проект ({project.devices.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('library')}
            className={`relative inline-flex items-center justify-center gap-1.5 h-7 rounded text-[12px] font-medium transition-colors whitespace-nowrap ${
              tab === 'library'
                ? 'text-[var(--flux-text)]'
                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
            }`}
          >
            {tab === 'library' && (
              <motion.span
                layoutId="explorer-tab-pill"
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 rounded bg-[var(--flux-surface)] border border-[var(--flux-line)] shadow-2xs"
                aria-hidden="true"
              />
            )}
            <Database className={`relative z-10 w-3.5 h-3.5 ${tab === 'library' ? 'text-[var(--flux-accent)]' : ''}`} />
            <span className="relative z-10">База ({catalog.length})</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-2 border-b border-[var(--flux-line)]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--flux-text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'project' ? 'Поиск тега, артикула…' : 'Поиск символа или ГОСТ…'}
            aria-label={tab === 'project' ? 'Поиск по проекту' : 'Поиск в базе компонентов'}
            className="w-full h-7 pl-8 pr-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none focus:border-[var(--flux-focus)]"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {tab === 'project' ? (
          <div className="space-y-1">
            {/* Sheets */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('sheets')}
                className="w-full flex items-center justify-between px-2 h-7 rounded text-[12px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <motion.span
                    animate={{ rotate: openSections.sheets ? 90 : 0 }}
                    transition={TREE_TRANSITION}
                    className="inline-flex items-center justify-center"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  </motion.span>
                  <span>Листы схемы</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                  {project.sheets.length}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {openSections.sheets && (
                  <motion.div
                    key="tree-sheets"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={TREE_TRANSITION}
                    className="overflow-hidden"
                  >
                    <div className="mt-0.5 space-y-0.5 pl-2">
                      {project.sheets.map((s) => {
                        const active = s.id === activeSheetId;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => onSelectSheet(s.id)}
                            className={`w-full flex items-center justify-between gap-2 px-2 h-7 rounded text-left text-[12px] transition-colors ${
                              active
                                ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                                : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <FileText
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  active ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'
                                }`}
                              />
                              <span className="truncate">
                                {s.number}. {s.name}
                              </span>
                            </span>
                            <span className="font-mono text-[11px] text-[var(--flux-text-muted)] shrink-0">
                              {s.format}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Devices */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('devices')}
                className="w-full flex items-center justify-between px-2 h-7 rounded text-[12px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <motion.span
                    animate={{ rotate: openSections.devices ? 90 : 0 }}
                    transition={TREE_TRANSITION}
                    className="inline-flex items-center justify-center"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  </motion.span>
                  <span>Устройства (Изделия)</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                  {project.devices.length}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {openSections.devices && (
                  <motion.div
                    key="tree-devices"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={TREE_TRANSITION}
                    className="overflow-hidden"
                  >
                    <div className="mt-0.5 space-y-0.5 pl-2">
                      {filteredDevices.length === 0 ? (
                        <div className="px-2 py-3 text-[12px] text-[var(--flux-text-muted)]">
                          Ничего не найдено по запросу «{query}».
                        </div>
                      ) : (
                        filteredDevices.map((dev) => {
                          const active = dev.id === selectedDeviceId;
                          return (
                            <button
                              key={dev.id}
                              type="button"
                              onClick={() => onSelectDevice(dev)}
                              className={`w-full flex items-center justify-between gap-2 px-2 h-7 rounded text-left text-[12px] transition-colors ${
                                active
                                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                                  : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                              }`}
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <Cpu
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    active ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'
                                  }`}
                                />
                                <span className="font-mono shrink-0">{dev.designation}</span>
                                <span className="truncate text-[var(--flux-text-muted)]">
                                  {dev.article}
                                </span>
                              </span>
                              {dev.bindingState === 'REMOVED_IN_FLUX' && (
                                <span className="text-[11px] text-rose-600 dark:text-rose-400 shrink-0">
                                  Снят
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                      {project.devices.length > 180 && !q && (
                        <div className="px-2 py-1 text-[11px] text-[var(--flux-text-muted)]">
                          Показаны первые 180 из {project.devices.length}. Используйте поиск.
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Cables */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('cables')}
                className="w-full flex items-center justify-between px-2 h-7 rounded text-[12px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <motion.span
                    animate={{ rotate: openSections.cables ? 90 : 0 }}
                    transition={TREE_TRANSITION}
                    className="inline-flex items-center justify-center"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  </motion.span>
                  <span>Кабели</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                  {project.cables.length}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {openSections.cables && (
                  <motion.div
                    key="tree-cables"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={TREE_TRANSITION}
                    className="overflow-hidden"
                  >
                    <div className="mt-0.5 space-y-0.5 pl-2">
                      {project.cables.map((cab) => (
                        <div
                          key={cab.id}
                          className="flex items-center justify-between gap-2 px-2 h-7 rounded text-[12px] text-[var(--flux-text)]"
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <Cable className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />
                            <span className="font-mono shrink-0">{cab.designation}</span>
                            <span className="truncate text-[var(--flux-text-muted)]">{cab.cableType}</span>
                          </span>
                          <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)] shrink-0">
                            {cab.lengthMeters}м
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* Component Catalog Library */
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5 px-0.5 pb-1">
              <button
                type="button"
                onClick={onOpenAddCatalogItem}
                className="inline-flex items-center justify-center gap-1.5 h-7 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                <span>Новое изделие</span>
              </button>
              <button
                type="button"
                onClick={onOpenHvacWizard}
                className="inline-flex items-center justify-center gap-1.5 h-7 px-2 rounded border border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)] hover:bg-[var(--flux-accent)] hover:text-white text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap transition-colors"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Схема ПВ</span>
              </button>
            </div>
            <div
              role="group"
              aria-label="Фильтр категории базы"
              className="grid grid-cols-4 gap-0.5 p-0.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] mx-0.5"
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
                    className={`relative h-6 rounded-xs text-[11px] font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'text-[var(--flux-text)]'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="catalog-filter-pill"
                        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute inset-0 rounded-xs bg-[var(--flux-sel)]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </button>
                );
              })}
            </div>
            {filteredCatalog.length === 0 ? (
              <div className="px-2 py-4 text-[12px] text-[var(--flux-text-muted)] space-y-1.5 text-center">
                <div>Компоненты в выбранной категории не найдены.</div>
                {(q || catalogFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setCatalogFilter('all');
                    }}
                    className="text-[11px] text-[var(--flux-accent)] hover:underline"
                  >
                    Сбросить фильтры
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)] mx-0.5 overflow-hidden">
                {filteredCatalog.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-flux-catalog-id', item.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="px-2.5 py-2 hover:bg-[var(--flux-hover)] transition-colors flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-mono text-[11px] font-medium text-[var(--flux-text)] truncate">
                        -{item.defaultPrefix}? · {item.article}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onEditCatalogItem(item)}
                          title="Редактировать изделие и его атрибуты"
                          aria-label={`Редактировать ${item.componentName}`}
                          className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-bg)] transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        {item.isCustom && (
                          <button
                            type="button"
                            onClick={() => onDeleteCustomCatalogItem(item.id)}
                            aria-label={`Удалить ${item.componentName}`}
                            className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600 hover:bg-[var(--flux-bg)] transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onPlaceCatalogItem(item)}
                          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:border-[var(--flux-accent)] hover:bg-[var(--flux-accent-soft)] text-[11px] font-medium text-[var(--flux-text)] transition-colors whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-3 h-3 text-[var(--flux-accent)]" />
                          <span>На лист</span>
                        </button>
                      </div>
                    </div>
                    <div className="text-[12px] text-[var(--flux-text)] leading-snug">
                      {item.componentName}
                    </div>
                    <div className="text-[11px] text-[var(--flux-text-muted)] flex items-center gap-1.5">
                      <span className="truncate">{item.manufacturer}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums shrink-0">{item.defaultAttributes.length} атр.</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums shrink-0">{item.pins.length} выв.</span>
                      {item.ioProfile && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums shrink-0">
                            {item.ioProfile.di}DI/{item.ioProfile.do}DO
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
