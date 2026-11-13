import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Cpu, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { SCHEMATIC_FONT_OPTIONS, SHEET_DIMENSIONS } from '../core/e3Catalog';
import type { CatalogItem, E3Project, HvacStageRole, SchematicFontFamily, SheetFormat } from '../core/e3Types';
import {
  buildDefaultHvacStages,
  type FluxHvacSpecs,
  HVAC_ROLE_LABELS,
  type HvacBuildOptions,
  type HvacTemplateId,
  type HvacWizardStage,
  matchProductFromFlux,
  parseFluxSpecsFromProject,
} from '../core/hvacBuilder';

interface HvacWizardModalProps {
  open: boolean;
  project: E3Project;
  catalog: CatalogItem[];
  onClose: () => void;
  onBuild: (options: HvacBuildOptions) => void;
}

export const HvacWizardModal: React.FC<HvacWizardModalProps> = ({
  open,
  project,
  catalog,
  onClose,
  onBuild,
}) => {
  const [templateId, setTemplateId] = useState<HvacTemplateId>('supply_ahu');
  const [selectionMode, setSelectionMode] = useState<'flux' | 'manual'>('flux');
  const [specs, setSpecs] = useState<FluxHvacSpecs>(() => parseFluxSpecsFromProject(project));
  const [sheetFormat, setSheetFormat] = useState<SheetFormat>('A2');
  const [fontFamily, setFontFamily] = useState<SchematicFontFamily>(project.visualSettings.fontFamily || 'GOST');
  const [createExternalWiring, setCreateExternalWiring] = useState<boolean>(true);
  const [stages, setStages] = useState<HvacWizardStage[]>([]);
  const [addRole, setAddRole] = useState<HvacStageRole>('temp_sensor');
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const parsed = parseFluxSpecsFromProject(project);
      setSpecs(parsed);
      setFontFamily(project.visualSettings.fontFamily || 'GOST');
      setStages(buildDefaultHvacStages(templateId, parsed, catalog));
    }
    wasOpenRef.current = open;
  }, [open, project, catalog, templateId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleAutoMatchFromFlux = () => {
    setStages((prev) =>
      prev.map((stg) => {
        const matched = matchProductFromFlux(stg.role, specs, catalog);
        return matched ? { ...stg, catalogItemId: matched.id } : stg;
      })
    );
  };

  const handleRegenerateTemplate = (nextTpl: HvacTemplateId, nextSpecs: FluxHvacSpecs) => {
    setTemplateId(nextTpl);
    setStages(buildDefaultHvacStages(nextTpl, nextSpecs, catalog));
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

  const addStage = () => {
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

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hvac-wizard-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-4xl rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-4 h-11 border-b border-[var(--flux-line)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-[var(--flux-accent)]" />
            <h2 id="hvac-wizard-title" className="text-[14px] font-semibold text-[var(--flux-text)]">
              Мастер построения ФСА и Схемы внешних соединений (Приточная / Вытяжная система)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть мастер ФСА"
            className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 text-[12px]">
          {/* Top Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="wiz-tpl" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Тип установки
              </label>
              <select
                id="wiz-tpl"
                value={templateId}
                onChange={(e) => handleRegenerateTemplate(e.target.value as HvacTemplateId, specs)}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)] font-medium"
              >
                <option value="supply_ahu">Приточная установка (ПВ)</option>
                <option value="exhaust_ahu">Вытяжная система (В)</option>
                <option value="avo">Аппарат воздушного охлаждения (АВО)</option>
              </select>
            </div>
            <div>
              <label htmlFor="wiz-systag" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Шифр установки / системы
              </label>
              <input
                id="wiz-systag"
                type="text"
                value={specs.systemTag}
                onChange={(e) => setSpecs({ ...specs, systemTag: e.target.value })}
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="wiz-cabtag" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Шкаф управления (для матрицы I/O и XT)
              </label>
              <input
                id="wiz-cabtag"
                type="text"
                value={specs.cabinetTag}
                onChange={(e) => setSpecs({ ...specs, cabinetTag: e.target.value })}
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
          </div>

          {/* Sheet format, Font, Mode Switch */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label htmlFor="wiz-fmt" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Формат листа
              </label>
              <select
                id="wiz-fmt"
                value={sheetFormat}
                onChange={(e) => setSheetFormat(e.target.value as SheetFormat)}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              >
                {(Object.keys(SHEET_DIMENSIONS) as SheetFormat[]).map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {SHEET_DIMENSIONS[fmt].label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wiz-font" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Шрифт чертежа и таблиц
              </label>
              <select
                id="wiz-font"
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value as SchematicFontFamily)}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              >
                {SCHEMATIC_FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-[var(--flux-text)]">
                <input
                  type="checkbox"
                  checked={createExternalWiring}
                  onChange={(e) => setCreateExternalWiring(e.target.checked)}
                  className="accent-[var(--flux-accent)]"
                />
                <span>Построить Схему внешних соединений КИПиА</span>
              </label>
            </div>
          </div>

          {/* Selection Mode Tabs: Auto from Flux vs Manual */}
          <div className="p-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-[var(--flux-surface)] p-0.5 rounded border border-[var(--flux-line)]">
                <button
                  type="button"
                  onClick={() => setSelectionMode('flux')}
                  className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-[12px] font-medium transition-colors ${
                    selectionMode === 'flux'
                      ? 'bg-[var(--flux-accent)] text-white'
                      : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Автоподбор из проекта / Flux</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectionMode('manual')}
                  className={`inline-flex items-center gap-1.5 h-7 px-3 rounded text-[12px] font-medium transition-colors ${
                    selectionMode === 'manual'
                      ? 'bg-[var(--flux-accent)] text-white'
                      : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Ручной выбор из базы</span>
                </button>
              </div>

              {selectionMode === 'flux' && (
                <button
                  type="button"
                  onClick={handleAutoMatchFromFlux}
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded border border-[var(--flux-accent)] text-[var(--flux-accent)] hover:bg-[var(--flux-accent-soft)] font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Подобрать точные изделия</span>
                </button>
              )}
            </div>

            {selectionMode === 'flux' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div>
                  <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">
                    Мощность вентилятора (кВт)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={specs.fanPowerKw}
                    onChange={(e) => setSpecs({ ...specs, fanPowerKw: Number(e.target.value) || 2.2 })}
                    className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[var(--flux-text)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">Нагрев</label>
                  <select
                    value={specs.heatingType}
                    onChange={(e) => {
                      const nextSpecs = { ...specs, heatingType: e.target.value as FluxHvacSpecs['heatingType'] };
                      setSpecs(nextSpecs);
                      setStages(buildDefaultHvacStages(templateId, nextSpecs, catalog));
                    }}
                    className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)]"
                  >
                    <option value="water">Водяной калорифер</option>
                    <option value="electric">Электрокалорифер</option>
                    <option value="none">Без нагрева</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">Напряжение приводов</label>
                  <select
                    value={specs.voltage}
                    onChange={(e) => setSpecs({ ...specs, voltage: e.target.value as FluxHvacSpecs['voltage'] })}
                    className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)]"
                  >
                    <option value="24V">~24 В / =24 В</option>
                    <option value="230V">~230 В (с обогревом)</option>
                    <option value="380V">3~380 В (смешанное)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">Зона / Исполнение</label>
                  <select
                    value={specs.exZone}
                    onChange={(e) => setSpecs({ ...specs, exZone: e.target.value as 'non-Ex' | 'Exd' })}
                    className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)]"
                  >
                    <option value="non-Ex">non-Ex (Обычное)</option>
                    <option value="Exd">Exd (Взрывозащищённое)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Ordered Stages List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-[var(--flux-text)]">
                Порядок секций и изделий на схеме слева направо ({stages.length})
              </h3>
              <div className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                Итого I/O: DI {ioSummary.di} · DO {ioSummary.do} · AI {ioSummary.ai} · AO {ioSummary.ao}
              </div>
            </div>

            <div className="border border-[var(--flux-line)] rounded divide-y divide-[var(--flux-line)] bg-[var(--flux-bg)]">
              {stages.map((stg, idx) => {
                const selectedItem = catalog.find((c) => c.id === stg.catalogItemId);
                return (
                  <div key={stg.id} className="p-2 flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <span className="w-6 text-center font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)] shrink-0">
                      {idx + 1}.
                    </span>
                    <div className="w-44 shrink-0 text-[11px] font-medium text-[var(--flux-text)] truncate">
                      {HVAC_ROLE_LABELS[stg.role]}
                    </div>
                    <select
                      value={stg.catalogItemId}
                      onChange={(e) =>
                        setStages((prev) =>
                          prev.map((s) => (s.id === stg.id ? { ...s, catalogItemId: e.target.value } : s))
                        )
                      }
                      aria-label={`Изделие для секции ${idx + 1}`}
                      className="flex-1 min-w-[180px] h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
                    >
                      {catalog.map((item) => (
                        <option key={item.id} value={item.id}>
                          [{item.defaultPrefix}] {item.componentName} ({item.article})
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={stg.tagOverride || ''}
                      onChange={(e) =>
                        setStages((prev) =>
                          prev.map((s) => (s.id === stg.id ? { ...s, tagOverride: e.target.value } : s))
                        )
                      }
                      placeholder="Автотег"
                      aria-label={`Позиционное обозначение секции ${idx + 1}`}
                      className="w-28 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)] shrink-0"
                    />
                    {selectedItem?.ioProfile && (
                      <span className="font-mono text-[10px] text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
                        DI:{selectedItem.ioProfile.di} DO:{selectedItem.ioProfile.do} AI:{selectedItem.ioProfile.ai} AO:{selectedItem.ioProfile.ao}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveStage(idx, -1)}
                        disabled={idx === 0}
                        aria-label="Переместить выше"
                        className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-[var(--flux-hover)] disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStage(idx, 1)}
                        disabled={idx === stages.length - 1}
                        aria-label="Переместить ниже"
                        className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-[var(--flux-hover)] disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStages((prev) => prev.filter((s) => s.id !== stg.id))}
                        aria-label="Удалить секцию"
                        className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Stage Row */}
            <div className="flex items-center gap-2 pt-1">
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as HvacStageRole)}
                className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[12px] text-[var(--flux-text)]"
              >
                {(Object.keys(HVAC_ROLE_LABELS) as HvacStageRole[]).map((r) => (
                  <option key={r} value={r}>
                    {HVAC_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addStage}
                className="inline-flex items-center gap-1 h-8 px-3 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[12px] font-medium text-[var(--flux-text)]"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                <span>Добавить секцию в порядок</span>
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[var(--flux-line)] bg-[var(--flux-bg)] flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-[var(--flux-text-muted)]">
            Схема и таблица сигналов I/O ПЛК расставятся по порядку с ровной ортогональной трассировкой.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded border border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => {
                onBuild({
                  templateId,
                  systemTag: specs.systemTag,
                  cabinetTag: specs.cabinetTag,
                  sheetFormat,
                  fontFamily,
                  createExternalWiringSheet: createExternalWiring,
                  stages,
                });
                onClose();
              }}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white font-medium"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Построить схему на листе</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
