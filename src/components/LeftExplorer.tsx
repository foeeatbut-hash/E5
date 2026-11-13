import React, { useMemo, useState } from 'react';
import {
  Cable,
  ChevronDown,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  FolderTree,
  Plus,
  Search,
  Zap,
} from 'lucide-react';
import { E3_CATALOG } from '../core/e3Catalog';
import type { CatalogItem, E3Device, E3Project } from '../core/e3Types';

interface LeftExplorerProps {
  project: E3Project;
  activeSheetId: string;
  selectedDeviceId: string | null;
  onSelectSheet: (sheetId: string) => void;
  onSelectDevice: (device: E3Device) => void;
  onPlaceCatalogItem: (item: CatalogItem) => void;
  onRunStressBatch: (count: number) => void;
}

export const LeftExplorer: React.FC<LeftExplorerProps> = ({
  project,
  activeSheetId,
  selectedDeviceId,
  onSelectSheet,
  onSelectDevice,
  onPlaceCatalogItem,
  onRunStressBatch,
}) => {
  const [tab, setTab] = useState<'project' | 'library'>('project');
  const [query, setQuery] = useState('');
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
    if (!q) return E3_CATALOG;
    return E3_CATALOG.filter(
      (c) =>
        c.componentName.toLowerCase().includes(q) ||
        c.article.toLowerCase().includes(q) ||
        c.manufacturer.toLowerCase().includes(q) ||
        c.defaultPrefix.toLowerCase().includes(q)
    );
  }, [q]);

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <aside
      aria-label="Дерево проекта и библиотека компонентов"
      className="no-print w-72 shrink-0 border-r border-[var(--flux-line)] bg-[var(--flux-bg)] flex flex-col min-h-0 select-none"
    >
      {/* Segmented Tabs */}
      <div className="p-2 border-b border-[var(--flux-line)] flex items-center gap-1 bg-[var(--flux-surface)]">
        <button
          type="button"
          onClick={() => setTab('project')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded text-[12px] font-medium transition-colors whitespace-nowrap ${
            tab === 'project'
              ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
              : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)] hover:text-[var(--flux-text)]'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          <span>Проект ({project.devices.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('library')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded text-[12px] font-medium transition-colors whitespace-nowrap ${
            tab === 'library'
              ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
              : 'text-[var(--flux-text-muted)] hover:bg-[var(--flux-hover)] hover:text-[var(--flux-text)]'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>База УГО ({E3_CATALOG.length})</span>
        </button>
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
          <>
            {/* Sheets */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('sheets')}
                className="w-full flex items-center justify-between px-2 h-7 rounded text-[12px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                <span className="flex items-center gap-1.5">
                  {openSections.sheets ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  )}
                  <span>Листы схемы</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                  {project.sheets.length}
                </span>
              </button>
              {openSections.sheets && (
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
              )}
            </div>

            {/* Devices */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('devices')}
                className="w-full flex items-center justify-between px-2 h-7 rounded text-[12px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                <span className="flex items-center gap-1.5">
                  {openSections.devices ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  )}
                  <span>Устройства (Изделия)</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                  {project.devices.length}
                </span>
              </button>
              {openSections.devices && (
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
              )}
            </div>

            {/* Cables */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('cables')}
                className="w-full flex items-center justify-between px-2 h-7 rounded text-[12px] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
              >
                <span className="flex items-center gap-1.5">
                  {openSections.cables ? (
                    <ChevronDown className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  )}
                  <span>Кабели</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                  {project.cables.length}
                </span>
              </button>
              {openSections.cables && (
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
              )}
            </div>
          </>
        ) : (
          /* Component Catalog Library */
          <div className="space-y-1">
            {filteredCatalog.length === 0 ? (
              <div className="px-2 py-4 text-[12px] text-[var(--flux-text-muted)]">
                Компонент не найден.
              </div>
            ) : (
              filteredCatalog.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-flux-catalog-id', item.id);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] transition-colors flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-medium text-[var(--flux-text)]">
                      -{item.defaultPrefix}? · {item.article}
                    </span>
                    <button
                      type="button"
                      onClick={() => onPlaceCatalogItem(item)}
                      className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium text-white bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      <span>На лист</span>
                    </button>
                  </div>
                  <div className="text-[12px] text-[var(--flux-text)] leading-snug">
                    {item.componentName}
                  </div>
                  <div className="text-[11px] text-[var(--flux-text-muted)] flex items-center gap-1.5">
                    <span>{item.manufacturer}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{item.pins.length} выв.</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer action: Async Large Dataset Benchmark */}
      <div className="p-2 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--flux-text-muted)] truncate">
          Тест нагрузки (Worker)
        </span>
        <button
          type="button"
          onClick={() => onRunStressBatch(500)}
          className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
          title="Добавить 500 связанных элементов на схему и обработать в фоновом потоке Web Worker"
        >
          <Zap className="w-3 h-3 text-[var(--flux-accent)]" />
          <span>+500 эл.</span>
        </button>
      </div>
    </aside>
  );
};
