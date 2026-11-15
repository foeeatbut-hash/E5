import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Cpu,
  Download,
  FileCode2,
  FilePlus2,
  FolderPlus,
  PenTool,
  Plus,
  Save,
  Share2,
  Terminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { SCHEMATIC_FONT_OPTIONS, SHEET_DIMENSIONS } from '../core/e3Catalog';
import { encodeUtf16LeWithBom, generateE3ComScript } from '../core/e3Engine';
import type {
  CatalogItem,
  CustomSymbolShape,
  DeviceCategory,
  E3Pin,
  E3SymbolDef,
  HvacStageRole,
  PinDirection,
  SchematicFontFamily,
  SheetFormat,
  SignalType,
  StandardType,
} from '../core/e3Types';
import {
  buildDefaultHvacStages,
  exportPlcIoCsv,
  type FluxHvacSpecs,
  HVAC_ROLE_LABELS,
  type HvacBuildOptions,
  type HvacTemplateId,
  type HvacWizardStage,
  matchProductFromFlux,
} from '../core/hvacBuilder';
import {
  createProjectFromTemplate,
  DEFAULT_STANDALONE_EXCHANGE_PREFS,
  DEFAULT_STANDALONE_HVAC_PREFS,
  DEFAULT_STANDALONE_UGO_PREFS,
  loadStandalonePrefs,
  saveStandalonePrefs,
  STANDALONE_EXCHANGE_PREFS_KEY,
  STANDALONE_HVAC_PREFS_KEY,
  STANDALONE_UGO_PREFS_KEY,
  type StandaloneExchangePrefs,
  type StandaloneHvacPrefs,
  type StandaloneUgoPrefs,
} from '../core/startHub';
import {
  buildSymbolDesignerPreset,
  inferPinDirection,
  nextPinName,
  normalizeCustomSymbolSpec,
  type SymbolPresetId,
} from '../core/symbolDesigner';
import type { E3BridgeStatusInfo } from './Modals';

/* ============================================================================
 * 1. Standalone HVAC / FSA Layer (Мастер ФСА / ОВиК вне проекта)
 * ========================================================================== */

interface StartHubHvacLayerProps {
  catalog: CatalogItem[];
  onCreateStandaloneHvacProject: (options: HvacBuildOptions) => void;
  trackWaveCursor: (e: React.PointerEvent<HTMLElement>) => void;
}

export const StartHubHvacLayer: React.FC<StartHubHvacLayerProps> = ({
  catalog,
  onCreateStandaloneHvacProject,
  trackWaveCursor,
}) => {
  const [prefs, setPrefs] = useState<StandaloneHvacPrefs>(() =>
    loadStandalonePrefs(STANDALONE_HVAC_PREFS_KEY, DEFAULT_STANDALONE_HVAC_PREFS)
  );
  const [templateId, setTemplateId] = useState<HvacTemplateId>('supply_ahu');
  const [addRole, setAddRole] = useState<HvacStageRole>('temp_sensor');
  const [savedFlag, setSavedFlag] = useState(false);

  const specs: FluxHvacSpecs = useMemo(
    () => ({
      systemTag: prefs.systemTag,
      cabinetTag: prefs.cabinetTag,
      fanPowerKw: prefs.fanPowerKw,
      heaterPowerKw: prefs.heaterPowerKw,
      voltage: prefs.voltage,
      exZone: prefs.exZone,
      heatingType: prefs.heatingType,
      hasCooler: true,
      hasFilter: true,
      hasOutletDamper: true,
      hasLocalPost: true,
      hasFanRedundancy: prefs.hasFanRedundancy,
      hasFreezeProtection: prefs.hasFreezeProtection,
    }),
    [prefs]
  );

  const [stages, setStages] = useState<HvacWizardStage[]>(() =>
    buildDefaultHvacStages('supply_ahu', specs, catalog, {
      hasFanRedundancy: prefs.hasFanRedundancy,
      hasFreezeProtection: prefs.hasFreezeProtection,
    })
  );

  const updatePrefs = (patch: Partial<StandaloneHvacPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveStandalonePrefs(STANDALONE_HVAC_PREFS_KEY, next);
      return next;
    });
  };

  const regenerateStages = (
    nextTpl = templateId,
    nextSpecs = specs,
    redundancy = prefs.hasFanRedundancy,
    freeze = prefs.hasFreezeProtection
  ) => {
    setStages(
      buildDefaultHvacStages(nextTpl, nextSpecs, catalog, {
        hasFanRedundancy: redundancy,
        hasFreezeProtection: freeze,
      })
    );
  };

  const ioSummary = useMemo(() => {
    return stages.reduce(
      (acc, stg) => {
        const item = catalog.find((c) => c.id === stg.catalogItemId);
        const io = item?.ioProfile;
        if (io) {
          acc.di += io.di;
          acc.do += io.do;
          acc.ai += io.ai;
          acc.ao += io.ao;
        }
        return acc;
      },
      { di: 0, do: 0, ai: 0, ao: 0 }
    );
  }, [stages, catalog]);

  const handleSavePrefsExplicit = () => {
    saveStandalonePrefs(STANDALONE_HVAC_PREFS_KEY, prefs);
    setSavedFlag(true);
    window.setTimeout(() => setSavedFlag(false), 1600);
  };

  const handleExportCsv = () => {
    const csv = exportPlcIoCsv(prefs.systemTag, prefs.cabinetTag, stages, catalog);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${prefs.systemTag || 'PV1'}-IO-Signals.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const moveStage = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const copy = [...stages];
    const tmp = copy[idx];
    copy[idx] = copy[target];
    copy[target] = tmp;
    setStages(copy);
  };

  const handleLaunchNewHvacProject = () => {
    onCreateStandaloneHvacProject({
      templateId,
      systemTag: prefs.systemTag,
      cabinetTag: prefs.cabinetTag,
      sheetFormat: prefs.sheetFormat,
      fontFamily: prefs.fontFamily,
      createExternalWiringSheet: prefs.createExternalWiringSheet,
      hasFanRedundancy: prefs.hasFanRedundancy,
      hasFreezeProtection: prefs.hasFreezeProtection,
      stages,
    });
  };

  return (
    <motion.section
      data-testid="start-hub-layer-hvac"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Автономный слой Мастер ФСА и ОВиК"
      className="rounded-[12px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[var(--flux-line)] flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
            <h2 className="text-[length:calc(14px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate">
              Мастер ФСА / ОВиК — автономный профиль
            </h2>
          </div>
          <p className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mt-0.5 line-clamp-1">
            Отдельный слой вне активной схемы: глобальные настройки создают новый изолированный проект ОВиК.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>I/O ПЛК CSV</span>
          </button>

          <button
            type="button"
            onClick={handleSavePrefsExplicit}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:border-[var(--flux-accent)]/60 text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
          >
            {savedFlag ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5 text-[var(--flux-accent)]" />}
            <span>{savedFlag ? 'Профиль сохранён' : 'Сохранить настройки'}</span>
          </button>

          <button
            type="button"
            data-testid="standalone-hvac-create-project-btn"
            onPointerMove={trackWaveCursor}
            onClick={handleLaunchNewHvacProject}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Создать новый проект ОВиК</span>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Global HVAC Parameters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
              Тип установки
            </label>
            <select
              value={templateId}
              onChange={(e) => {
                const nextTpl = e.target.value as HvacTemplateId;
                setTemplateId(nextTpl);
                regenerateStages(nextTpl, specs);
              }}
              className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
            >
              <option value="supply_ahu">Приточная установка (ПВ)</option>
              <option value="supply_exhaust_recovery">Приточно-вытяжная (ПВ-Р)</option>
              <option value="exhaust_ahu">Вытяжная система (В)</option>
              <option value="avo">Аппарат воздушного охлаждения (АВО)</option>
            </select>
          </div>
          <div>
            <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
              Шифр установки
            </label>
            <input
              type="text"
              data-testid="standalone-hvac-systag-input"
              value={prefs.systemTag}
              onChange={(e) => updatePrefs({ systemTag: e.target.value })}
              className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
            />
          </div>
          <div>
            <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
              Шкаф управления
            </label>
            <input
              type="text"
              value={prefs.cabinetTag}
              onChange={(e) => updatePrefs({ cabinetTag: e.target.value })}
              className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
            />
          </div>
          <div>
            <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
              Формат листа / Шрифт
            </label>
            <div className="flex gap-1.5">
              <select
                value={prefs.sheetFormat}
                onChange={(e) => updatePrefs({ sheetFormat: e.target.value as SheetFormat })}
                className="w-20 h-8 px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
              >
                {(Object.keys(SHEET_DIMENSIONS) as SheetFormat[]).map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <select
                value={prefs.fontFamily}
                onChange={(e) => updatePrefs({ fontFamily: e.target.value as SchematicFontFamily })}
                className="flex-1 min-w-0 h-8 px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
              >
                {SCHEMATIC_FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>{f.id}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
              Вентилятор, кВт
            </label>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={prefs.fanPowerKw}
              onChange={(e) => updatePrefs({ fanPowerKw: Number(e.target.value) || 2.2 })}
              className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums text-[var(--flux-text)]"
            />
          </div>
          <div>
            <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
              Тип нагрева
            </label>
            <select
              value={prefs.heatingType}
              onChange={(e) => updatePrefs({ heatingType: e.target.value as StandaloneHvacPrefs['heatingType'] })}
              className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
            >
              <option value="water">Водяной калорифер</option>
              <option value="electric">Электрокалорифер (ТЭН)</option>
              <option value="none">Без нагрева</option>
            </select>
          </div>
          <div>
            <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
              Напряжение приводов
            </label>
            <select
              value={prefs.voltage}
              onChange={(e) => updatePrefs({ voltage: e.target.value as StandaloneHvacPrefs['voltage'] })}
              className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
            >
              <option value="380V">3~380 В</option>
              <option value="230V">~230 В</option>
              <option value="24V">24 В DC</option>
            </select>
          </div>
          <div>
            <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
              Взрывозащита
            </label>
            <select
              value={prefs.exZone}
              onChange={(e) => updatePrefs({ exZone: e.target.value as StandaloneHvacPrefs['exZone'] })}
              className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
            >
              <option value="non-Ex">Общепромышленная</option>
              <option value="Exd">Exd (взрывозащита)</option>
            </select>
          </div>
        </div>

        {/* Toggles + I/O Totals Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 py-2 px-3 rounded-[8px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/70">
          <div className="flex flex-wrap items-center gap-4 text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.createExternalWiringSheet}
                onChange={(e) => updatePrefs({ createExternalWiringSheet: e.target.checked })}
                className="accent-[var(--flux-accent)]"
              />
              <span>Лист внешних соединений</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.hasFanRedundancy}
                onChange={(e) => {
                  const val = e.target.checked;
                  updatePrefs({ hasFanRedundancy: val });
                  regenerateStages(templateId, specs, val, prefs.hasFreezeProtection);
                }}
                className="accent-[var(--flux-accent)]"
              />
              <span>Резервирование (2×)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.hasFreezeProtection}
                onChange={(e) => {
                  const val = e.target.checked;
                  updatePrefs({ hasFreezeProtection: val });
                  regenerateStages(templateId, specs, prefs.hasFanRedundancy, val);
                }}
                className="accent-[var(--flux-accent)]"
              />
              <span>Защита от заморозки</span>
            </label>
          </div>

          <div className="font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
            Каналы ПЛК: <strong className="text-[var(--flux-text)]">DI {ioSummary.di} · DO {ioSummary.do} · AI {ioSummary.ai} · AO {ioSummary.ao}</strong>
          </div>
        </div>

        {/* Stage Equipment Sequence */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
              Последовательность узлов установки ({stages.length})
            </span>
            <div className="flex items-center gap-1.5">
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as HvacStageRole)}
                className="h-7 px-2 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
              >
                {(Object.keys(HVAC_ROLE_LABELS) as HvacStageRole[]).map((r) => (
                  <option key={r} value={r}>{HVAC_ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const matched = matchProductFromFlux(addRole, specs, catalog);
                  setStages((prev) => [
                    ...prev,
                    {
                      id: `stg-${Date.now().toString(36)}`,
                      role: addRole,
                      label: HVAC_ROLE_LABELS[addRole],
                      catalogItemId: matched?.id || catalog[0]?.id || '',
                    },
                  ]);
                }}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[5px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                <span>Добавить узел</span>
              </button>
            </div>
          </div>

          <div className="border border-[var(--flux-line)] rounded-[8px] divide-y divide-[var(--flux-line)] max-h-[260px] overflow-y-auto">
            {stages.map((stg, idx) => (
              <div key={stg.id} className="px-3 py-1.5 flex items-center gap-2 text-[length:calc(11.5px*var(--flux-ui-scale))]">
                <span className="w-5 font-mono tabular-nums text-[var(--flux-text-muted)] shrink-0">
                  {idx + 1}.
                </span>
                <span className="w-48 truncate font-medium text-[var(--flux-text)] shrink-0">
                  {stg.label}
                </span>
                <select
                  value={stg.catalogItemId}
                  onChange={(e) =>
                    setStages((prev) =>
                      prev.map((s) => (s.id === stg.id ? { ...s, catalogItemId: e.target.value } : s))
                    )
                  }
                  className="flex-1 min-w-0 h-7 px-2 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                >
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.componentName} ({c.article})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    aria-label="Переместить выше"
                    onClick={() => moveStage(idx, -1)}
                    className="p-1 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Переместить ниже"
                    onClick={() => moveStage(idx, 1)}
                    className="p-1 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Удалить узел"
                    onClick={() => setStages((prev) => prev.filter((s) => s.id !== stg.id))}
                    className="p-1 rounded text-[var(--flux-text-muted)] hover:text-rose-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
};

/* ============================================================================
 * 2. Standalone UGO & Global Database Layer (Редактор УГО и база вне проекта)
 * ========================================================================== */

interface StartHubUgoLayerProps {
  catalog: CatalogItem[];
  customSymbols: E3SymbolDef[];
  onSaveGlobalCatalogAndSymbol: (item: CatalogItem, sym: E3SymbolDef) => void;
  onDeleteGlobalCatalogItem: (itemId: string, symbolId?: string) => void;
  trackWaveCursor: (e: React.PointerEvent<HTMLElement>) => void;
}

const SIGNAL_TYPES: SignalType[] = ['signal', 'power', 'neutral', 'pe', 'dc24', 'dc0', 'bus'];
const DEVICE_CATEGORIES: DeviceCategory[] = [
  'breaker',
  'contactor',
  'relay',
  'sensor',
  'plc',
  'drive',
  'motor',
  'psu',
  'terminal',
  'lamp',
  'fan',
  'damper',
  'valve',
];

export const StartHubUgoLayer: React.FC<StartHubUgoLayerProps> = ({
  catalog,
  customSymbols,
  onSaveGlobalCatalogAndSymbol,
  onDeleteGlobalCatalogItem,
  trackWaveCursor,
}) => {
  const [ugoPrefs, setUgoPrefs] = useState<StandaloneUgoPrefs>(() =>
    loadStandalonePrefs(STANDALONE_UGO_PREFS_KEY, DEFAULT_STANDALONE_UGO_PREFS)
  );
  const [search, setSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string>(
    () => catalog.find((c) => c.isCustom)?.id || catalog[0]?.id || ''
  );

  const initialSeed = catalog.find((c) => c.id === selectedItemId) || catalog[0];
  const [componentName, setComponentName] = useState(initialSeed?.componentName || 'Пользовательский блок УГО');
  const [article, setArticle] = useState(initialSeed?.article || 'UGO-CUSTOM-01');
  const [manufacturer, setManufacturer] = useState(initialSeed?.manufacturer || 'Собств. база');
  const [e3BlockName, setE3BlockName] = useState(initialSeed?.e3BlockName || 'GOST_CUSTOM_BLK');
  const [defaultPrefix, setDefaultPrefix] = useState(initialSeed?.defaultPrefix || ugoPrefs.defaultPrefix);
  const [category, setCategory] = useState<DeviceCategory>(initialSeed?.category || 'relay');
  const [width, setWidth] = useState(initialSeed?.width || 120);
  const [height, setHeight] = useState(initialSeed?.height || 100);
  const [shapes, setShapes] = useState<CustomSymbolShape[]>(
    () =>
      initialSeed?.customSymbol?.shapes
        ? structuredClone(initialSeed.customSymbol.shapes)
        : buildSymbolDesignerPreset('blank_box').shapes
  );
  const [pins, setPins] = useState<Omit<E3Pin, 'id'>[]>(
    () =>
      initialSeed?.pins
        ? structuredClone(initialSeed.pins)
        : buildSymbolDesignerPreset('blank_box').pins
  );
  const [isEditingExistingCustom, setIsEditingExistingCustom] = useState(Boolean(initialSeed?.isCustom));
  const [savedNotice, setSavedNotice] = useState(false);

  const updateUgoPrefs = (patch: Partial<StandaloneUgoPrefs>) => {
    setUgoPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveStandalonePrefs(STANDALONE_UGO_PREFS_KEY, next);
      return next;
    });
  };

  const loadItemIntoDraft = (item: CatalogItem) => {
    setSelectedItemId(item.id);
    setComponentName(item.componentName);
    setArticle(item.article);
    setManufacturer(item.manufacturer);
    setE3BlockName(item.e3BlockName);
    setDefaultPrefix(item.defaultPrefix);
    setCategory(item.category);
    setWidth(item.width);
    setHeight(item.height);
    const linkedSym = customSymbols.find((s) => s.id === item.symbolId || s.e3BlockName === item.e3BlockName);
    setShapes(
      item.customSymbol?.shapes
        ? structuredClone(item.customSymbol.shapes)
        : linkedSym?.shapes
          ? structuredClone(linkedSym.shapes)
          : buildSymbolDesignerPreset('blank_box').shapes
    );
    setPins(structuredClone(item.pins));
    setIsEditingExistingCustom(Boolean(item.isCustom));
    setSavedNotice(false);
  };

  const handleCreateNewBlock = () => {
    const preset = buildSymbolDesignerPreset('blank_box');
    const stamp = Date.now().toString(36).slice(-4).toUpperCase();
    setSelectedItemId('');
    setComponentName(`Новый блок УГО (${stamp})`);
    setArticle(`USER-${stamp}`);
    setManufacturer('Собств. база');
    setE3BlockName(`GOST_USER_${stamp}`);
    setDefaultPrefix(ugoPrefs.defaultPrefix || 'K');
    setCategory('relay');
    setWidth(preset.width);
    setHeight(preset.height);
    setShapes(preset.shapes);
    setPins(preset.pins);
    setIsEditingExistingCustom(false);
    setSavedNotice(false);
  };

  const applyPreset = (presetId: SymbolPresetId) => {
    const p = buildSymbolDesignerPreset(presetId);
    setWidth(p.width);
    setHeight(p.height);
    setShapes(p.shapes);
    setPins(p.pins);
  };

  const handleSaveGlobal = () => {
    const norm = normalizeCustomSymbolSpec(width, height, shapes, pins);
    const cleanBlock = e3BlockName.trim() || `E3_BLK_${Date.now().toString(36)}`;
    const targetItemId = isEditingExistingCustom && selectedItemId
      ? selectedItemId
      : `custom-cat-${Date.now().toString(36)}`;
    const targetSymId = `sym-${cleanBlock}`;

    const sym: E3SymbolDef = {
      id: targetSymId,
      name: componentName.trim() || cleanBlock,
      e3BlockName: cleanBlock,
      category,
      description: componentName.trim(),
      width: norm.width,
      height: norm.height,
      shapes: norm.customSymbol.shapes,
      defaultPins: norm.pins,
      isCustom: true,
      updatedAt: new Date().toISOString(),
    };

    const existingCat = catalog.find((c) => c.id === targetItemId);
    const item: CatalogItem = {
      id: targetItemId,
      category,
      defaultPrefix: defaultPrefix.trim() || ugoPrefs.defaultPrefix || 'K',
      componentName: componentName.trim() || cleanBlock,
      article: article.trim() || cleanBlock,
      manufacturer: manufacturer.trim() || 'Собств. база',
      e3BlockName: cleanBlock,
      symbolId: targetSymId,
      width: norm.width,
      height: norm.height,
      pins: norm.pins,
      customSymbol: norm.customSymbol,
      defaultAttributes: existingCat?.defaultAttributes || [
        { name: 'Стандарт', value: ugoPrefs.standardConvention, owner: '', conflict: 'flux' },
      ],
      isCustom: true,
    };

    onSaveGlobalCatalogAndSymbol(item, sym);
    setSelectedItemId(item.id);
    setIsEditingExistingCustom(true);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleExportBlockJson = () => {
    const payload = {
      schema: 'e3promax-ugo-block/v1',
      componentName,
      article,
      manufacturer,
      e3BlockName,
      defaultPrefix,
      category,
      width,
      height,
      shapes,
      pins,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${e3BlockName || 'ugo_block'}.e3blk.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...catalog].sort((a, b) => Number(Boolean(b.isCustom)) - Number(Boolean(a.isCustom)));
    if (!q) return sorted.slice(0, 40);
    return sorted
      .filter((c) => `${c.componentName} ${c.article} ${c.e3BlockName}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [catalog, search]);

  const pad = 20;

  return (
    <motion.section
      data-testid="start-hub-layer-ugo"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Автономный редактор УГО и глобальная база"
      className="rounded-[12px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[var(--flux-line)] flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2">
            <PenTool className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
            <h2 className="text-[length:calc(14px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate">
              Редактор УГО и глобальная база элементов
            </h2>
          </div>
          <p className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mt-0.5 line-clamp-1">
            Автономный библиотечный слой программы: редактируйте глобальные блоки E³ без влияния на открытую схему.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="standalone-ugo-new-btn"
            onClick={handleCreateNewBlock}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>Новый блок</span>
          </button>

          <button
            type="button"
            onClick={handleExportBlockJson}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>.e3blk.json</span>
          </button>

          <button
            type="button"
            data-testid="standalone-ugo-save-btn"
            onPointerMove={trackWaveCursor}
            onClick={handleSaveGlobal}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold whitespace-nowrap shrink-0"
          >
            {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>{savedNotice ? 'Сохранено в базу' : 'Сохранить в глобальную базу'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-[var(--flux-line)]">
        {/* Left: Global UGO Preferences + Catalog Browser */}
        <div className="xl:col-span-4 p-3 space-y-3">
          {/* Global UGO Editor Defaults */}
          <div className="p-2.5 rounded-[8px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/60 space-y-2">
            <div className="text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)]">
              Глобальные настройки редактора УГО
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                Сетка, мм
                <select
                  value={ugoPrefs.defaultGridStep}
                  onChange={(e) => updateUgoPrefs({ defaultGridStep: Number(e.target.value) as 5 | 10 | 20 })}
                  className="mt-0.5 w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[var(--flux-text)]"
                >
                  <option value={5}>5 мм</option>
                  <option value={10}>10 мм</option>
                  <option value={20}>20 мм</option>
                </select>
              </label>
              <label className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                Шаг пинов
                <select
                  value={ugoPrefs.defaultPinPitch}
                  onChange={(e) => updateUgoPrefs({ defaultPinPitch: Number(e.target.value) as 10 | 20 })}
                  className="mt-0.5 w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[var(--flux-text)]"
                >
                  <option value={10}>10 мм</option>
                  <option value={20}>20 мм</option>
                </select>
              </label>
              <label className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                Стандарт
                <select
                  value={ugoPrefs.standardConvention}
                  onChange={(e) => updateUgoPrefs({ standardConvention: e.target.value as StandardType })}
                  className="mt-0.5 w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[var(--flux-text)]"
                >
                  <option value="GOST">ГОСТ</option>
                  <option value="IEC">IEC</option>
                </select>
              </label>
            </div>
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по базе УГО (артикул, блок E3)…"
            className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
          />

          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {filteredCatalog.map((item) => {
              const active = selectedItemId === item.id;
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[6px] border ${
                    active
                      ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/50'
                      : 'border-transparent hover:border-[var(--flux-line)] hover:bg-[var(--flux-hover)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => loadItemIntoDraft(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] truncate">
                      {item.componentName}
                    </div>
                    <div className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] truncate">
                      {item.isCustom ? 'СВОЙ · ' : ''}{item.e3BlockName} · {item.pins.length} выв.
                    </div>
                  </button>
                  {item.isCustom && (
                    <button
                      type="button"
                      aria-label={`Удалить ${item.componentName}`}
                      onClick={() => onDeleteGlobalCatalogItem(item.id, item.symbolId)}
                      className="p-1 rounded text-[var(--flux-text-muted)] hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Standalone Symbol Geometry & Pin Editor */}
        <div className="xl:col-span-8 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div className="md:col-span-2">
              <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Наименование элемента в базе
              </label>
              <input
                type="text"
                data-testid="standalone-ugo-name-input"
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Имя блока E³.series
              </label>
              <input
                type="text"
                value={e3BlockName}
                onChange={(e) => setE3BlockName(e.target.value)}
                className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Артикул
              </label>
              <input
                type="text"
                value={article}
                onChange={(e) => setArticle(e.target.value)}
                className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Категория / Префикс ОУО
              </label>
              <div className="flex gap-1.5">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as DeviceCategory)}
                  className="flex-1 min-w-0 h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                >
                  {DEVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={defaultPrefix}
                  onChange={(e) => setDefaultPrefix(e.target.value)}
                  className="w-16 h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-center text-[var(--flux-text)]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Размер УГО (Ш × В, мм)
              </label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  step={10}
                  min={40}
                  max={360}
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value) || 120)}
                  className="w-1/2 h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums text-[var(--flux-text)]"
                />
                <input
                  type="number"
                  step={10}
                  min={40}
                  max={360}
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value) || 100)}
                  className="w-1/2 h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums text-[var(--flux-text)]"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Vector Preview */}
            <div className="lg:col-span-5 space-y-2">
              <div className="space-y-1.5">
                <div className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                  Превью геометрии ({width}×{height})
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      ['blank_box', 'Корпус'],
                      ['sensor_circle', 'Датчик'],
                      ['breaker_1p', 'Автомат'],
                      ['coil_relay', 'Катушка'],
                    ] as const
                  ).map(([pid, lbl]) => (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => applyPreset(pid)}
                      className="px-2 py-0.5 rounded border border-[var(--flux-line)] hover:border-[var(--flux-accent)]/60 text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[8px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] p-3 flex items-center justify-center">
                <svg
                  viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
                  className="w-full max-h-[200px]"
                >
                  <rect
                    x={0}
                    y={0}
                    width={width}
                    height={height}
                    fill="none"
                    stroke="var(--flux-accent)"
                    strokeOpacity={0.35}
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  {shapes.map((sh) => {
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
                          strokeWidth={ugoPrefs.defaultStrokeWidth}
                        />
                      );
                    }
                    if (sh.kind === 'line') {
                      return (
                        <line
                          key={sh.id}
                          x1={sh.x1}
                          y1={sh.y1}
                          x2={sh.x2}
                          y2={sh.y2}
                          stroke="var(--flux-text)"
                          strokeWidth={ugoPrefs.defaultStrokeWidth}
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
                          strokeWidth={ugoPrefs.defaultStrokeWidth}
                        />
                      );
                    }
                    if (sh.kind === 'text') {
                      return (
                        <text
                          key={sh.id}
                          x={sh.x}
                          y={sh.y}
                          textAnchor="middle"
                          fontSize={sh.fontSize || 10}
                          fill="var(--flux-text)"
                          fontFamily="IBM Plex Mono, monospace"
                        >
                          {sh.text}
                        </text>
                      );
                    }
                    return null;
                  })}
                  {pins.map((pin, idx) => (
                    <g key={`${pin.name}-${idx}`}>
                      <circle cx={pin.dx} cy={pin.dy} r={3} fill="var(--flux-accent)" />
                      <text
                        x={pin.dx + 4}
                        y={pin.dy - 4}
                        fontSize={9}
                        fill="var(--flux-accent)"
                        fontFamily="IBM Plex Mono, monospace"
                      >
                        {pin.name}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </div>

            {/* Pins Editor Table */}
            <div className="lg:col-span-7 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                  Выводы блока ({pins.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const name = nextPinName(pins);
                    const dx = Math.min(width, pins.length * ugoPrefs.defaultPinPitch);
                    const dy = height;
                    setPins((prev) => [
                      ...prev,
                      {
                        name,
                        dx,
                        dy,
                        direction: inferPinDirection(dx, dy, width, height) as PinDirection,
                        signalType: 'signal',
                      },
                    ]);
                  }}
                  className="inline-flex items-center gap-1 text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-accent)] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить вывод</span>
                </button>
              </div>

              <div className="border border-[var(--flux-line)] rounded-[8px] divide-y divide-[var(--flux-line)] max-h-[200px] overflow-y-auto">
                {pins.map((p, idx) => (
                  <div key={idx} className="px-2.5 py-1.5 flex items-center gap-2 text-[length:calc(11px*var(--flux-ui-scale))]">
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) =>
                        setPins((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                      }
                      className="w-16 h-6 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
                    />
                    <input
                      type="number"
                      step={5}
                      value={p.dx}
                      onChange={(e) =>
                        setPins((prev) => prev.map((x, i) => (i === idx ? { ...x, dx: Number(e.target.value) || 0 } : x)))
                      }
                      className="w-14 h-6 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums text-[var(--flux-text)]"
                      title="X"
                    />
                    <input
                      type="number"
                      step={5}
                      value={p.dy}
                      onChange={(e) =>
                        setPins((prev) => prev.map((x, i) => (i === idx ? { ...x, dy: Number(e.target.value) || 0 } : x)))
                      }
                      className="w-14 h-6 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums text-[var(--flux-text)]"
                      title="Y"
                    />
                    <select
                      value={p.signalType}
                      onChange={(e) =>
                        setPins((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, signalType: e.target.value as SignalType } : x))
                        )
                      }
                      className="flex-1 min-w-0 h-6 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                    >
                      {SIGNAL_TYPES.map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label={`Удалить вывод ${p.name}`}
                      onClick={() => setPins((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1 rounded text-[var(--flux-text-muted)] hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
};

/* ============================================================================
 * 3. Standalone Exchange Center Layer (Центр обмена E3.series вне проекта)
 * ========================================================================== */

interface StartHubExchangeLayerProps {
  bridgeStatus: E3BridgeStatusInfo;
  onDownloadConnector: () => void;
  onImportAsNewProject: (file: File) => Promise<void>;
  trackWaveCursor: (e: React.PointerEvent<HTMLElement>) => void;
}

export const StartHubExchangeLayer: React.FC<StartHubExchangeLayerProps> = ({
  bridgeStatus,
  onDownloadConnector,
  onImportAsNewProject,
  trackWaveCursor,
}) => {
  const [prefs, setPrefs] = useState<StandaloneExchangePrefs>(() =>
    loadStandalonePrefs(STANDALONE_EXCHANGE_PREFS_KEY, DEFAULT_STANDALONE_EXCHANGE_PREFS)
  );
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [savedNotice, setSavedNotice] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const updatePrefs = (patch: Partial<StandaloneExchangePrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveStandalonePrefs(STANDALONE_EXCHANGE_PREFS_KEY, next);
      return next;
    });
  };

  // Standalone template skeleton script — completely decoupled from currentProject
  const genericComScript = useMemo(() => {
    const cleanBlank = createProjectFromTemplate('gost_blank_a3', { standard: 'GOST' });
    return generateE3ComScript(cleanBlank, 'export');
  }, []);

  const handleDownloadGenericVbs = () => {
    const bytes = encodeUtf16LeWithBom(genericComScript);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'text/plain;charset=utf-16le' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `E3ProMax_${prefs.e3VersionProfile}_to_Flux.vbs`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(genericComScript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setBusy(true);
    try {
      await onImportAsNewProject(file);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Ошибка импорта файла.');
    } finally {
      e.target.value = '';
      setBusy(false);
    }
  };

  return (
    <motion.section
      data-testid="start-hub-layer-exchange"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Автономный центр обмена E3.series"
      className="rounded-[12px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg overflow-hidden"
    >
      <input
        ref={importInputRef}
        type="file"
        accept=".e3flux,.e3s,.e3d,.xml,.json"
        className="sr-only"
        onChange={handleFilePick}
      />

      <div className="px-4 py-3 border-b border-[var(--flux-line)] flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
            <h2 className="text-[length:calc(14px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate">
              Центр обмена E³.series — глобальные настройки
            </h2>
          </div>
          <p className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mt-0.5 line-clamp-1">
            Настройка системного COM-коннектора, профилей DXF/XML и импорт файлов как отдельный новый проект.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            saveStandalonePrefs(STANDALONE_EXCHANGE_PREFS_KEY, prefs);
            setSavedNotice(true);
            window.setTimeout(() => setSavedNotice(false), 1600);
          }}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:border-[var(--flux-accent)]/60 text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
        >
          {savedNotice ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Save className="w-3.5 h-3.5 text-[var(--flux-accent)]" />}
          <span>{savedNotice ? 'Профиль сохранён' : 'Сохранить параметры'}</span>
        </button>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Global Bridge & Format Settings */}
        <div className="lg:col-span-6 space-y-3">
          <div className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)]">
            Параметры интеграции программы
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Профиль E³.series COM
              </label>
              <select
                value={prefs.e3VersionProfile}
                onChange={(e) =>
                  updatePrefs({ e3VersionProfile: e.target.value as StandaloneExchangePrefs['e3VersionProfile'] })
                }
                className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
              >
                <option value="2022_sp2">E³.series 2022 SP2</option>
                <option value="2024_x64">E³.series 2024 x64</option>
              </select>
            </div>
            <div>
              <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Схема XML обмена
              </label>
              <select
                value={prefs.xmlSchemaMode}
                onChange={(e) =>
                  updatePrefs({ xmlSchemaMode: e.target.value as StandaloneExchangePrefs['xmlSchemaMode'] })
                }
                className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
              >
                <option value="extended_flux">Расширенная Flux + E3</option>
                <option value="strict_gost">Строгий формат E3 XML</option>
              </select>
            </div>
            <div>
              <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                Кодировка DXF по умолчанию
              </label>
              <select
                value={prefs.dxfEncoding}
                onChange={(e) =>
                  updatePrefs({ dxfEncoding: e.target.value as StandaloneExchangePrefs['dxfEncoding'] })
                }
                className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
              >
                <option value="utf8">UTF-8 (AutoCAD 2018+)</option>
                <option value="cp1251">Windows-1251 (Кириллица)</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-2 cursor-pointer text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]">
                <input
                  type="checkbox"
                  checked={prefs.autoPollConnector}
                  onChange={(e) => updatePrefs({ autoPollConnector: e.target.checked })}
                  className="accent-[var(--flux-accent)]"
                />
                <span>Автопоиск коннектора Windows</span>
              </label>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--flux-line)] space-y-2">
            <div className="flex items-center justify-between text-[length:calc(11.5px*var(--flux-ui-scale))]">
              <span className="font-medium text-[var(--flux-text)]">Состояние COM-коннектора:</span>
              <span className="font-mono text-[var(--flux-text-muted)]">
                {bridgeStatus.isWin32
                  ? 'Локальный Windows COM'
                  : bridgeStatus.bridgeConnected
                    ? `Подключён (${bridgeStatus.bridgeHost})`
                    : 'Ожидает коннектор на ПК'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onDownloadConnector}
                className="inline-flex items-center justify-between px-3 h-9 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
              >
                <span>Коннектор ПК (.cmd)</span>
                <Terminal className="w-4 h-4 text-[var(--flux-accent)] shrink-0" />
              </button>
              <button
                type="button"
                onClick={handleDownloadGenericVbs}
                className="inline-flex items-center justify-between px-3 h-9 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
              >
                <span>Шаблон выгрузки (.vbs)</span>
                <FileCode2 className="w-4 h-4 text-[var(--flux-text-muted)] shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Standalone File Import & Script Inspector */}
        <div className="lg:col-span-6 space-y-3">
          <div className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)]">
            Импорт в новый отдельный проект
          </div>

          <div className="p-3.5 rounded-[8px] border border-dashed border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)]/50 space-y-2.5">
            <p className="text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] leading-relaxed">
              Выберите файл <span className="font-mono text-[var(--flux-text)]">.e3flux</span>,{' '}
              <span className="font-mono text-[var(--flux-text)]">.e3s</span>,{' '}
              <span className="font-mono text-[var(--flux-text)]">.xml</span> или{' '}
              <span className="font-mono text-[var(--flux-text)]">.json</span> — программа откроет его как самостоятельный проект, не затрагивая текущую сохранённую сессию.
            </p>
            <button
              type="button"
              disabled={busy}
              data-testid="standalone-exchange-import-btn"
              onPointerMove={trackWaveCursor}
              onClick={() => importInputRef.current?.click()}
              className="inline-flex items-center gap-2 h-8 px-3.5 rounded-[6px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{busy ? 'Чтение файла…' : 'Выбрать файл и открыть проект'}</span>
            </button>
            {importError && (
              <div className="text-[length:calc(11px*var(--flux-ui-scale))] text-rose-500">
                {importError}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowScript((s) => !s)}
              className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-accent)] hover:underline"
            >
              {showScript ? 'Скрыть базовый COM-скрипт (.vbs)' : 'Показать базовый COM-скрипт экспорта (.vbs)'}
            </button>
            {showScript && (
              <button
                type="button"
                onClick={handleCopyScript}
                className="inline-flex items-center gap-1 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Скопировано' : 'Копировать'}</span>
              </button>
            )}
          </div>

          {showScript && (
            <pre className="max-h-36 overflow-auto p-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
              {genericComScript}
            </pre>
          )}
        </div>
      </div>
    </motion.section>
  );
};
