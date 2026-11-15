import React, { useMemo, useState } from 'react';
import {
  Cable,
  ChevronRight,
  Cpu,
  Database,
  FileText,
  FolderTree,
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
import { isNewUiMode, type UiWorkspaceMode } from '../core/uiMode';
import { isTwoPinBreakEligible } from '../core/wireEditing';
import { SymbolLibraryBrowser } from './SymbolLibraryBrowser';

interface LeftExplorerProps {
  uiMode?: UiWorkspaceMode;
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

function renderCatalogMiniSymbol(category: CatalogItem['category']) {
  const stroke = 'currentColor';
  if (category === 'breaker') {
    return (
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none" className="shrink-0 text-[var(--flux-accent)]" aria-hidden="true">
        <line x1="12" y1="1" x2="12" y2="5" stroke={stroke} strokeWidth="1.4" />
        <line x1="12" y1="5" x2="8" y2="11" stroke={stroke} strokeWidth="1.4" />
        <line x1="12" y1="11" x2="12" y2="15" stroke={stroke} strokeWidth="1.4" />
      </svg>
    );
  }
  if (category === 'motor' || category === 'fan' || category === 'pump') {
    return (
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none" className="shrink-0 text-[var(--flux-accent)]" aria-hidden="true">
        <circle cx="12" cy="8" r="6" stroke={stroke} strokeWidth="1.3" />
        <text x="12" y="10.5" textAnchor="middle" fontSize="7" fill={stroke} fontFamily="monospace">M</text>
      </svg>
    );
  }
  if (category === 'contactor' || category === 'relay') {
    return (
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none" className="shrink-0 text-[var(--flux-accent)]" aria-hidden="true">
        <rect x="4" y="4" width="7" height="8" stroke={stroke} strokeWidth="1.3" />
        <line x1="16" y1="2" x2="16" y2="6" stroke={stroke} strokeWidth="1.3" />
        <line x1="16" y1="6" x2="19" y2="10" stroke={stroke} strokeWidth="1.3" />
        <line x1="16" y1="10" x2="16" y2="14" stroke={stroke} strokeWidth="1.3" />
      </svg>
    );
  }
  if (category === 'terminal') {
    return (
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none" className="shrink-0 text-[var(--flux-accent)]" aria-hidden="true">
        <circle cx="12" cy="8" r="4" stroke={stroke} strokeWidth="1.3" />
        <line x1="12" y1="1" x2="12" y2="15" stroke={stroke} strokeWidth="1.3" />
      </svg>
    );
  }
  if (category === 'heater' || category === 'cooler') {
    return (
      <svg width="24" height="16" viewBox="0 0 24 16" fill="none" className="shrink-0 text-[var(--flux-accent)]" aria-hidden="true">
        <rect x="4" y="3" width="16" height="10" stroke={stroke} strokeWidth="1.3" />
        <line x1="4" y1="3" x2="20" y2="13" stroke={stroke} strokeWidth="1.1" />
        <line x1="20" y1="3" x2="4" y2="13" stroke={stroke} strokeWidth="1.1" />
      </svg>
    );
  }
  return (
    <svg width="24" height="16" viewBox="0 0 24 16" fill="none" className="shrink-0 text-[var(--flux-text-muted)]" aria-hidden="true">
      <rect x="4" y="3" width="16" height="10" rx="1.5" stroke={stroke} strokeWidth="1.3" />
      <line x1="1" y1="8" x2="4" y2="8" stroke={stroke} strokeWidth="1.2" />
      <line x1="20" y1="8" x2="23" y2="8" stroke={stroke} strokeWidth="1.2" />
    </svg>
  );
}

export const LeftExplorer: React.FC<LeftExplorerProps> = React.memo(({
  uiMode = 'classic',
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
  onOpenSymbolDesigner,
  symbolWorkspace,
}) => {
  const isNewUi = isNewUiMode(uiMode);
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

  const [libQuery, setLibQuery] = useState('');
  const q = query.trim().toLowerCase();
  const lq = (uiMode === 'hybrid' ? libQuery : query).trim().toLowerCase();

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
      if (!lq) return true;
      return (
        c.componentName.toLowerCase().includes(lq) ||
        c.article.toLowerCase().includes(lq) ||
        c.manufacturer.toLowerCase().includes(lq) ||
        c.defaultPrefix.toLowerCase().includes(lq)
      );
    });
  }, [catalog, catalogFilter, lq]);

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  if (symbolWorkspace?.draft.open) {
    return <SymbolLibraryBrowser workspace={symbolWorkspace} />;
  }

  const projectTreeContent = (
    <div className="space-y-0.5">
      {/* Sheets */}
      <div>
        <button
          type="button"
          onClick={() => toggleSection('sheets')}
          className="w-full flex items-center justify-between px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[2px] text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
        >
          <span className="flex items-center gap-1">
            <ChevronRight
              className={`w-3 h-3 text-[var(--flux-text-muted)] transition-transform duration-150 ${
                openSections.sheets ? 'rotate-90' : ''
              }`}
            />
            <span>Листы схемы</span>
          </span>
          <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
            {project.sheets.length}
          </span>
        </button>
        {openSections.sheets && (
          <div className="ml-2 pl-1.5 border-l border-[var(--flux-line)] space-y-px py-0.5">
            {project.sheets.map((s) => {
              const active = s.id === activeSheetId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelectSheet(s.id)}
                  className={`w-full flex items-center justify-between gap-1 px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[2px] text-left text-[length:calc(11px*var(--flux-ui-scale))] transition-colors ${
                    active
                      ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                      : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <FileText
                      className={`w-3 h-3 shrink-0 ${
                        active ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'
                      }`}
                    />
                    <span className="truncate">
                      {s.number}. {s.name}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0 font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                    <span data-testid={`explorer-sheet-rev-${s.id}`}>
                      {getSheetRevisionLabel(s)}
                      {hasSheetUncommittedChanges(project, s) ? '*' : ''}
                    </span>
                    <span>{s.format}</span>
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
          className="w-full flex items-center justify-between px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[2px] text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
        >
          <span className="flex items-center gap-1">
            <ChevronRight
              className={`w-3 h-3 text-[var(--flux-text-muted)] transition-transform duration-150 ${
                openSections.devices ? 'rotate-90' : ''
              }`}
            />
            <span>Устройства (Изделия)</span>
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
                return (
                  <button
                    key={dev.id}
                    type="button"
                    onClick={() => onSelectDevice(dev)}
                    className={`w-full flex items-center justify-between gap-1.5 px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[2px] text-left text-[length:calc(11px*var(--flux-ui-scale))] transition-colors ${
                      active
                        ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                        : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Cpu
                        className={`w-3 h-3 shrink-0 ${
                          active ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'
                        }`}
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
          className="w-full flex items-center justify-between px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[2px] text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
        >
          <span className="flex items-center gap-1">
            <ChevronRight
              className={`w-3 h-3 text-[var(--flux-text-muted)] transition-transform duration-150 ${
                openSections.cables ? 'rotate-90' : ''
              }`}
            />
            <span>Кабели</span>
          </span>
          <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
            {project.cables.length}
          </span>
        </button>
        {openSections.cables && (
          <div className="ml-2 pl-1.5 border-l border-[var(--flux-line)] space-y-px py-0.5">
            {project.cables.map((cab) => (
              <div
                key={cab.id}
                className="flex items-center justify-between gap-1.5 px-1.5 h-[calc(21px*var(--flux-ui-scale))] rounded-[2px] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Cable className="w-3 h-3 text-[var(--flux-text-muted)] shrink-0" />
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
  );

  const catalogListContent = (compactGrid: boolean) => (
    <div className="space-y-1">
      {!compactGrid && (
        <div className="space-y-1 px-0.5 pb-0.5">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={onOpenAddCatalogItem}
              className="inline-flex items-center justify-center gap-1 h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap transition-colors"
            >
              <Plus className="w-3 h-3 text-[var(--flux-text-muted)]" />
              <span>Новое изделие</span>
            </button>
            <button
              type="button"
              onClick={onOpenHvacWizard}
              className="inline-flex items-center justify-center gap-1 h-[calc(22px*var(--flux-ui-scale))] px-1.5 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap transition-colors"
            >
              <SlidersHorizontal className="w-3 h-3 text-[var(--flux-accent)]" />
              <span>Схема ПВ</span>
            </button>
          </div>
          {onOpenSymbolDesigner && (
            <button
              type="button"
              data-testid="explorer-symbol-designer-btn"
              onClick={onOpenSymbolDesigner}
              className="w-full inline-flex items-center justify-center gap-1.5 h-[calc(22px*var(--flux-ui-scale))] px-2 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap transition-colors"
            >
              <PenTool className="w-3 h-3 text-[var(--flux-accent)]" />
              <span>Редактор графики УГО…</span>
            </button>
          )}
        </div>
      )}
      <div
        role="group"
        aria-label="Фильтр категории базы"
        className="grid grid-cols-4 rounded-[2px] border border-[var(--flux-line)] divide-x divide-[var(--flux-line)] bg-[var(--flux-bg)] mx-0.5 overflow-hidden"
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
          {(lq || catalogFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setLibQuery('');
                setCatalogFilter('all');
              }}
              className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-accent)] hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div
          data-testid="catalog-items-container"
          className={
            compactGrid
              ? 'grid grid-cols-2 gap-1.5 px-0.5'
              : 'border border-[var(--flux-line)] rounded-[4px] bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)] mx-0.5 overflow-hidden'
          }
        >
          {filteredCatalog.map((item) => (
            <div
              key={item.id}
              data-testid={`catalog-item-${item.id}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-flux-catalog-id', item.id);
                if (isTwoPinBreakEligible(item)) {
                  e.dataTransfer.setData('application/x-flux-2pin', '1');
                }
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className={
                compactGrid
                  ? 'p-1.5 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:border-[var(--flux-accent)] hover:bg-[var(--flux-hover)] transition-colors flex flex-col gap-1 cursor-grab active:cursor-grabbing min-w-0'
                  : 'px-2 py-1 hover:bg-[var(--flux-hover)] transition-colors flex flex-col gap-0.5'
              }
            >
              <div className="flex items-center justify-between gap-1 min-w-0">
                <div className="flex items-center gap-1 min-w-0">
                  {isNewUi && renderCatalogMiniSymbol(item.category)}
                  <span
                    className={`font-mono font-medium text-[var(--flux-text)] ${
                      compactGrid
                        ? 'text-[length:calc(10px*var(--flux-ui-scale))] whitespace-nowrap'
                        : 'text-[length:calc(10.5px*var(--flux-ui-scale))] truncate'
                    }`}
                  >
                    -{item.defaultPrefix}?{compactGrid ? '' : ` · ${item.article}`}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onEditCatalogItem(item)}
                    title="Редактировать изделие и его атрибуты"
                    aria-label={`Редактировать ${item.componentName}`}
                    className={`${
                      compactGrid
                        ? 'w-[calc(15px*var(--flux-ui-scale))] h-[calc(15px*var(--flux-ui-scale))]'
                        : 'w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]'
                    } inline-flex items-center justify-center rounded-[4px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-bg)] transition-colors`}
                  >
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                  {item.isCustom && (
                    <button
                      type="button"
                      onClick={() => onDeleteCustomCatalogItem(item.id)}
                      aria-label={`Удалить ${item.componentName}`}
                      className={`${
                        compactGrid
                          ? 'w-[calc(15px*var(--flux-ui-scale))] h-[calc(15px*var(--flux-ui-scale))]'
                          : 'w-[calc(18px*var(--flux-ui-scale))] h-[calc(18px*var(--flux-ui-scale))]'
                      } inline-flex items-center justify-center rounded-[4px] text-[var(--flux-text-muted)] hover:text-rose-600 hover:bg-[var(--flux-bg)] transition-colors`}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onPlaceCatalogItem(item)}
                    title={`Добавить ${item.componentName} на лист`}
                    aria-label={`Добавить ${item.componentName} на лист`}
                    className={`inline-flex items-center justify-center gap-1 rounded-[4px] border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:border-[var(--flux-accent)] hover:bg-[var(--flux-sel)] text-[length:calc(10px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] transition-colors whitespace-nowrap shrink-0 ${
                      compactGrid
                        ? 'w-[calc(17px*var(--flux-ui-scale))] h-[calc(17px*var(--flux-ui-scale))] px-0'
                        : 'h-[calc(19px*var(--flux-ui-scale))] px-1.5'
                    }`}
                  >
                    <Plus className="w-2.5 h-2.5 text-[var(--flux-accent)]" />
                    {!compactGrid && <span>На лист</span>}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {item.customSymbol && item.customSymbol.shapes.length > 0 && (
                  <svg
                    viewBox={`0 0 ${item.width} ${item.height}`}
                    className="w-[calc(22px*var(--flux-ui-scale))] h-[calc(22px*var(--flux-ui-scale))] shrink-0 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] p-0.5"
                    aria-hidden="true"
                  >
                    {item.customSymbol.shapes.map((sh) => {
                      if (sh.kind === 'line') {
                        return (
                          <line
                            key={sh.id}
                            x1={sh.x1}
                            y1={sh.y1}
                            x2={sh.x2}
                            y2={sh.y2}
                            stroke="var(--flux-text)"
                            strokeWidth={Math.max(2, sh.strokeWidth || 2)}
                          />
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
                            fill="none"
                            stroke="var(--flux-text)"
                            strokeWidth={Math.max(2, sh.strokeWidth || 2)}
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
                            fill="none"
                            stroke="var(--flux-text)"
                            strokeWidth={Math.max(2, sh.strokeWidth || 2)}
                          />
                        );
                      }
                      return null;
                    })}
                  </svg>
                )}
                <div className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text)] leading-snug truncate">
                  {item.componentName}
                </div>
              </div>
              {!compactGrid && (
                <div className="text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] flex items-center gap-1">
                  <span className="truncate">{item.manufacturer}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums shrink-0">{item.defaultAttributes.length} атр.</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums shrink-0">{item.pins.length} выв.</span>
                  {item.customSymbol && item.customSymbol.shapes.length > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] text-[var(--flux-accent)] shrink-0">УГО</span>
                    </>
                  )}
                  {item.ioProfile && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {item.ioProfile.di}DI/{item.ioProfile.do}DO
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* HYBRID MODE (Variant A): 50/50 Simultaneous Vertical Split (Devices top + 2xN Library bottom) */
  if (uiMode === 'hybrid') {
    return (
      <aside
        aria-label="Устройства проекта и библиотека компонентов 2×N"
        data-testid="hybrid-left-split"
        className="no-print w-full h-full flex-1 min-w-0 flux-glass-panel flex flex-col min-h-0 select-none divide-y divide-[var(--flux-line)]"
      >
        {/* Top 50%: Project Tree & Devices */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="h-[calc(26px*var(--flux-ui-scale))] px-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex items-center justify-between gap-1.5 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)]">
              <FolderTree className="w-3 h-3 text-[var(--flux-accent)]" />
              <span>Устройства</span>
            </span>
            <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
              {project.devices.length} изд. · {project.sheets.length} л.
            </span>
          </div>
          <div className="px-1.5 py-1 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] shrink-0">
            <div className="relative">
              <Search className="w-3 h-3 text-[var(--flux-text-muted)] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                spellCheck={false}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск тега, артикула…"
                aria-label="Поиск устройств по проекту"
                className="w-full h-[calc(21px*var(--flux-ui-scale))] pl-6 pr-1.5 rounded-[4px] border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none focus:border-[var(--flux-focus)]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1 bg-[var(--flux-surface)]">
            {projectTreeContent}
          </div>
        </div>

        {/* Bottom 50%: Simultaneous 2×N Library */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="h-[calc(26px*var(--flux-ui-scale))] px-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex items-center justify-between gap-1 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)]">
              <Database className="w-3 h-3 text-[var(--flux-accent)]" />
              <span>Библиотека</span>
              <span className="font-mono tabular-nums text-[var(--flux-text-muted)]">({catalog.length})</span>
            </span>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onOpenAddCatalogItem}
                title="Новое изделие в базу"
                aria-label="Новое изделие в базу"
                className="w-[calc(20px*var(--flux-ui-scale))] h-[calc(20px*var(--flux-ui-scale))] inline-flex items-center justify-center rounded-[4px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)]"
              >
                <Plus className="w-3 h-3 text-[var(--flux-accent)]" />
              </button>
              <button
                type="button"
                onClick={onOpenHvacWizard}
                title="Мастер схемы ПВ / ФСА"
                aria-label="Мастер схемы ПВ"
                className="h-[calc(20px*var(--flux-ui-scale))] px-1.5 inline-flex items-center justify-center rounded-[4px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(10px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
              >
                ПВ
              </button>
              {onOpenSymbolDesigner && (
                <button
                  type="button"
                  data-testid="explorer-symbol-designer-btn"
                  onClick={onOpenSymbolDesigner}
                  title="Редактор графики УГО…"
                  aria-label="Редактор графики УГО"
                  className="h-[calc(20px*var(--flux-ui-scale))] px-1.5 inline-flex items-center justify-center rounded-[4px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(10px*var(--flux-ui-scale))] font-medium text-[var(--flux-accent)]"
                >
                  УГО
                </button>
              )}
            </div>
          </div>
          <div className="px-1.5 py-1 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] shrink-0">
            <div className="relative">
              <Search className="w-3 h-3 text-[var(--flux-text-muted)] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                spellCheck={false}
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
                placeholder="Поиск символа, артикула или ГОСТ…"
                aria-label="Поиск в базе компонентов"
                className="w-full h-[calc(21px*var(--flux-ui-scale))] pl-6 pr-1.5 rounded-[4px] border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none focus:border-[var(--flux-focus)]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1 bg-[var(--flux-surface)]">
            {catalogListContent(true)}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Дерево проекта и библиотека компонентов"
      className="no-print w-full h-full flex-1 min-w-0 flux-glass-panel flex flex-col min-h-0 select-none"
    >
      {/* CAD Navigator Tabs: Segmented in Focus drawer, Flush in Classic */}
      {isNewUi ? (
        <div className="p-1.5 pb-1 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] shrink-0">
          <div className="grid grid-cols-2 p-0.5 rounded-[5px] bg-[var(--flux-bg)] border border-[var(--flux-line)]">
            <button
              type="button"
              onClick={() => setTab('project')}
              className={`inline-flex items-center justify-center gap-1.5 h-[calc(22px*var(--flux-ui-scale))] rounded-[4px] text-[length:calc(11px*var(--flux-ui-scale))] transition-all whitespace-nowrap ${
                tab === 'project'
                  ? 'bg-[var(--flux-surface)] text-[var(--flux-text)] font-semibold shadow-xs border border-[var(--flux-line)]'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] font-medium'
              }`}
            >
              <FolderTree className={`w-3 h-3 ${tab === 'project' ? 'text-[var(--flux-accent)]' : ''}`} strokeWidth={1.7} />
              <span>Проект ({project.devices.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('library')}
              className={`inline-flex items-center justify-center gap-1.5 h-[calc(22px*var(--flux-ui-scale))] rounded-[4px] text-[length:calc(11px*var(--flux-ui-scale))] transition-all whitespace-nowrap ${
                tab === 'library'
                  ? 'bg-[var(--flux-surface)] text-[var(--flux-text)] font-semibold shadow-xs border border-[var(--flux-line)]'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] font-medium'
              }`}
            >
              <Database className={`w-3 h-3 ${tab === 'library' ? 'text-[var(--flux-accent)]' : ''}`} strokeWidth={1.7} />
              <span>База ({catalog.length})</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 h-6 border-b border-[var(--flux-line)] flux-glass-bar shrink-0">
          <button
            type="button"
            onClick={() => setTab('project')}
            className={`relative inline-flex items-center justify-center gap-1 h-full border-r border-[var(--flux-line)] text-[length:calc(11px*var(--flux-ui-scale))] transition-colors whitespace-nowrap ${
              tab === 'project'
                ? 'bg-[var(--flux-surface)]/80 text-[var(--flux-text)] font-semibold border-b-2 border-b-[var(--flux-accent)]'
                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] font-medium'
            }`}
          >
            <FolderTree className={`w-3 h-3 ${tab === 'project' ? 'text-[var(--flux-accent)]' : ''}`} />
            <span>Проект ({project.devices.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('library')}
            className={`relative inline-flex items-center justify-center gap-1 h-full text-[length:calc(11px*var(--flux-ui-scale))] transition-colors whitespace-nowrap ${
              tab === 'library'
                ? 'bg-[var(--flux-surface)]/80 text-[var(--flux-text)] font-semibold border-b-2 border-b-[var(--flux-accent)]'
                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] font-medium'
            }`}
          >
            <Database className={`w-3 h-3 ${tab === 'library' ? 'text-[var(--flux-accent)]' : ''}`} />
            <span>База ({catalog.length})</span>
          </button>
        </div>
      )}

      {/* Search */}
      <div className="px-1.5 py-1 border-b border-[var(--flux-line)] bg-transparent shrink-0">
        <div className="relative">
          <Search className="w-3 h-3 text-[var(--flux-text-muted)] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'project' ? 'Поиск тега, артикула…' : 'Поиск символа или ГОСТ…'}
            aria-label={tab === 'project' ? 'Поиск по проекту' : 'Поиск в базе компонентов'}
            className="w-full h-[calc(22px*var(--flux-ui-scale))] pl-6 pr-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] placeholder:text-[var(--flux-text-muted)] focus:outline-none focus:border-[var(--flux-focus)]"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-1 space-y-0.5 bg-[var(--flux-surface)]">
        {tab === 'project' ? projectTreeContent : catalogListContent(false)}
      </div>
    </aside>
  );
});
LeftExplorer.displayName = 'LeftExplorer';
