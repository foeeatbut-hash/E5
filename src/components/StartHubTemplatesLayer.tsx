import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Check,
  Copy,
  FilePlus2,
  FolderPlus,
  Layers,
  Plus,
  Save,
  SlidersHorizontal,
  Stamp,
  Trash2,
} from 'lucide-react';
import { SCHEMATIC_FONT_OPTIONS, SHEET_DIMENSIONS } from '../core/e3Catalog';
import type { GostStampForm, SchematicFontFamily, SheetFormat, StandardType } from '../core/e3Types';
import {
  BUILTIN_CUSTOM_TEMPLATE_PRESETS,
  buildProjectFromCustomTemplate,
  createDefaultCustomTemplateDraft,
  CUSTOM_TEMPLATE_CATEGORY_LABELS,
  type CustomProjectTemplate,
  type CustomTemplateCategory,
  duplicateCustomTemplate,
} from '../core/startHub';
import { ProjectMiniPreview } from './ProjectMiniPreview';

interface StartHubTemplatesLayerProps {
  customTemplates: CustomProjectTemplate[];
  isDark: boolean;
  onSaveTemplate: (tpl: CustomProjectTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  onCreateProjectFromCustomTemplate: (tpl: CustomProjectTemplate) => void;
  trackWaveCursor: (e: React.PointerEvent<HTMLElement>) => void;
  bindHoverTarget: (el: HTMLElement | null, strength?: number) => void;
}

type TemplatePanelTab = 'structure' | 'visual' | 'stamp' | 'modules';

export const StartHubTemplatesLayer: React.FC<StartHubTemplatesLayerProps> = ({
  customTemplates,
  isDark,
  onSaveTemplate,
  onDeleteTemplate,
  onCreateProjectFromCustomTemplate,
  trackWaveCursor,
  bindHoverTarget,
}) => {
  const allTemplates = useMemo(
    () => [...customTemplates, ...BUILTIN_CUSTOM_TEMPLATE_PRESETS],
    [customTemplates]
  );

  const [selectedId, setSelectedId] = useState<string>(
    () => customTemplates[0]?.id || BUILTIN_CUSTOM_TEMPLATE_PRESETS[0].id
  );
  const [draft, setDraft] = useState<CustomProjectTemplate>(() =>
    structuredClone(customTemplates[0] || BUILTIN_CUSTOM_TEMPLATE_PRESETS[0])
  );
  const [panelTab, setPanelTab] = useState<TemplatePanelTab>('structure');
  const [savedNotice, setSavedNotice] = useState(false);

  const selectTemplate = (tpl: CustomProjectTemplate) => {
    setSelectedId(tpl.id);
    setDraft(structuredClone(tpl));
    setSavedNotice(false);
  };

  const handleCreateBlankDraft = () => {
    const fresh = createDefaultCustomTemplateDraft({
      title: `Шаблон проекта #${customTemplates.length + 1}`,
      theme: isDark ? 'dark' : 'light',
    });
    setSelectedId(fresh.id);
    setDraft(fresh);
    setPanelTab('structure');
    setSavedNotice(false);
  };

  const handleDuplicateCurrent = () => {
    const copy = duplicateCustomTemplate(draft);
    onSaveTemplate(copy);
    setSelectedId(copy.id);
    setDraft(copy);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleSaveCurrent = () => {
    const targetToSave: CustomProjectTemplate = draft.isBuiltin
      ? {
          ...structuredClone(draft),
          id: `tpl-custom-${Date.now().toString(36)}`,
          title: `${draft.title} (свой)`,
          isBuiltin: false,
        }
      : { ...structuredClone(draft), isBuiltin: false };
    onSaveTemplate(targetToSave);
    setSelectedId(targetToSave.id);
    setDraft(targetToSave);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 1800);
  };

  const previewProject = useMemo(
    () =>
      buildProjectFromCustomTemplate(draft, {
        nowIso: '2026-11-15T10:00:00.000Z',
        themeOverride: isDark ? 'dark' : 'light',
      }),
    [draft, isDark]
  );

  const addSheet = () => {
    const num = draft.initialSheets.length + 1;
    setDraft((prev) => ({
      ...prev,
      initialSheets: [
        ...prev.initialSheets,
        {
          id: `sh-${Date.now().toString(36)}`,
          name: `Лист ${num}`,
          format: prev.defaultFormat,
        },
      ],
    }));
  };

  const updateSheet = (id: string, patch: { name?: string; format?: SheetFormat }) => {
    setDraft((prev) => ({
      ...prev,
      initialSheets: prev.initialSheets.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const removeSheet = (id: string) => {
    setDraft((prev) => {
      if (prev.initialSheets.length <= 1) return prev;
      return {
        ...prev,
        initialSheets: prev.initialSheets.filter((s) => s.id !== id),
      };
    });
  };

  return (
    <motion.section
      data-testid="start-hub-layer-templates"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      aria-label="Конструктор шаблонов проектов"
      className="rounded-[12px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg overflow-hidden"
    >
      {/* Top Header Strip */}
      <div className="px-4 py-3 border-b border-[var(--flux-line)] flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-[length:calc(14px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate">
            Конструктор шаблонов проектов
          </h2>
          <p className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] line-clamp-1">
            Настраивайте профили под разные проекты: листы, штамп ГОСТ, графика и стартовые узлы.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="tpl-new-btn"
            onPointerMove={trackWaveCursor}
            onClick={handleCreateBlankDraft}
            className="antigravity-wave-pill inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>Новый шаблон</span>
          </button>

          <button
            type="button"
            data-testid="tpl-save-btn"
            onPointerMove={trackWaveCursor}
            onClick={handleSaveCurrent}
            className="antigravity-wave-pill inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:border-[var(--flux-accent)]/60 text-[length:calc(11.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
          >
            {savedNotice ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Save className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            )}
            <span>{savedNotice ? 'Сохранено' : draft.isBuiltin ? 'Сохранить как свой' : 'Сохранить шаблон'}</span>
          </button>

          <button
            type="button"
            data-testid="tpl-launch-project-btn"
            onPointerMove={trackWaveCursor}
            onClick={() => onCreateProjectFromCustomTemplate(draft)}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold whitespace-nowrap shrink-0 shadow-xs"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>Создать проект</span>
          </button>
        </div>
      </div>

      {/* Main Split: Template List (left) + Multi-Panel Configurator (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-[var(--flux-line)]">
        {/* Left List Column */}
        <div className="xl:col-span-4 p-3 space-y-3">
          <div>
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.05em] text-[var(--flux-text-muted)]">
                Мои шаблоны
              </span>
              <span className="font-mono tabular-nums text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                {customTemplates.length}
              </span>
            </div>

            {customTemplates.length === 0 ? (
              <div className="px-2.5 py-3 rounded-[7px] border border-dashed border-[var(--flux-line)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                Пользовательских шаблонов пока нет. Нажмите «Новый шаблон» или сохраните любой базовый профиль.
              </div>
            ) : (
              <div className="space-y-1 antigravity-wave-cascade">
                {customTemplates.map((tpl) => {
                  const active = selectedId === tpl.id;
                  return (
                    <div
                      key={tpl.id}
                      onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.55)}
                      onMouseLeave={() => bindHoverTarget(null)}
                      onPointerMove={trackWaveCursor}
                      className={`antigravity-wave-row flex items-center justify-between gap-2 px-2.5 py-2 rounded-[7px] border transition-colors ${
                        active
                          ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/50'
                          : 'border-transparent hover:border-[var(--flux-line)] hover:bg-[var(--flux-hover)]'
                      }`}
                    >
                      <button
                        type="button"
                        data-testid={`custom-tpl-item-${tpl.id}`}
                        onClick={() => selectTemplate(tpl)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate">
                          {tpl.title}
                        </div>
                        <div className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] truncate">
                          {tpl.standard === 'IEC' ? 'IEC' : 'ГОСТ'} · {tpl.initialSheets.length} л. · {tpl.defaultFormat}
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={`Удалить шаблон ${tpl.title}`}
                        onClick={() => {
                          onDeleteTemplate(tpl.id);
                          const remaining = allTemplates.filter((t) => t.id !== tpl.id);
                          if (selectedId === tpl.id && remaining[0]) {
                            selectTemplate(remaining[0]);
                          }
                        }}
                        className="p-1 rounded text-[var(--flux-text-muted)] hover:text-rose-500 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-[var(--flux-line)]">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.05em] text-[var(--flux-text-muted)]">
                Базовые профили
              </span>
              <span className="font-mono tabular-nums text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                {BUILTIN_CUSTOM_TEMPLATE_PRESETS.length}
              </span>
            </div>
            <div className="space-y-1 antigravity-wave-cascade">
              {BUILTIN_CUSTOM_TEMPLATE_PRESETS.map((tpl) => {
                const active = selectedId === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    data-testid={`builtin-tpl-item-${tpl.id}`}
                    onPointerMove={trackWaveCursor}
                    onMouseEnter={(e) => bindHoverTarget(e.currentTarget, 0.5)}
                    onMouseLeave={() => bindHoverTarget(null)}
                    onClick={() => selectTemplate(tpl)}
                    className={`antigravity-wave-row w-full px-2.5 py-2 rounded-[7px] border text-left transition-colors ${
                      active
                        ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/50'
                        : 'border-transparent hover:border-[var(--flux-line)] hover:bg-[var(--flux-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] truncate">
                        {tpl.title}
                      </span>
                      <span className="font-mono text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                        {tpl.defaultFormat}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] truncate mt-0.5">
                      {tpl.standard === 'IEC' ? 'IEC' : 'ГОСТ'} · {tpl.initialSheets.length} л. · {CUSTOM_TEMPLATE_CATEGORY_LABELS[tpl.category]}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Functional Panels Area */}
        <div className="xl:col-span-8 p-4 space-y-4">
          {/* Panel Section Switcher + Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--flux-line)] pb-2.5">
            <div className="flex flex-wrap items-center gap-4" role="tablist" aria-label="Панели настройки шаблона">
              {(
                [
                  ['structure', 'Структура и листы', FolderPlus],
                  ['visual', 'Графика и сетка', SlidersHorizontal],
                  ['stamp', 'Штамп ГОСТ 2.104', Stamp],
                  ['modules', 'Функциональные модули', Layers],
                ] as const
              ).map(([tabId, label, Icon]) => {
                const active = panelTab === tabId;
                return (
                  <button
                    key={tabId}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    data-testid={`tpl-panel-tab-${tabId}`}
                    onClick={() => setPanelTab(tabId)}
                    className={`relative pb-1.5 inline-flex items-center gap-1.5 text-[length:calc(12px*var(--flux-ui-scale))] font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'text-[var(--flux-text)]'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                    <span>{label}</span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 right-0 -bottom-[1px] h-[2px] rounded-full bg-[var(--flux-accent)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleDuplicateCurrent}
              className="inline-flex items-center gap-1 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Дублировать</span>
            </button>
          </div>

          {/* Panel 1: Structure & Multi-Sheet Layout */}
          {panelTab === 'structure' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-7 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                      Название шаблона
                    </label>
                    <input
                      type="text"
                      data-testid="tpl-title-input"
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                      Категория назначения
                    </label>
                    <select
                      value={draft.category}
                      onChange={(e) =>
                        setDraft({ ...draft, category: e.target.value as CustomTemplateCategory })
                      }
                      className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                    >
                      {(Object.keys(CUSTOM_TEMPLATE_CATEGORY_LABELS) as CustomTemplateCategory[]).map((cat) => (
                        <option key={cat} value={cat}>
                          {CUSTOM_TEMPLATE_CATEGORY_LABELS[cat]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                    Описание области применения
                  </label>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                      Стандарт УГО
                    </label>
                    <select
                      data-testid="tpl-standard-select"
                      value={draft.standard}
                      onChange={(e) => setDraft({ ...draft, standard: e.target.value as StandardType })}
                      className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                    >
                      <option value="GOST">ГОСТ</option>
                      <option value="IEC">IEC</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                      Префикс шифра
                    </label>
                    <input
                      type="text"
                      value={draft.projectCodePrefix}
                      onChange={(e) => setDraft({ ...draft, projectCodePrefix: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                      Основной формат
                    </label>
                    <select
                      value={draft.defaultFormat}
                      onChange={(e) => setDraft({ ...draft, defaultFormat: e.target.value as SheetFormat })}
                      className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                    >
                      {(Object.keys(SHEET_DIMENSIONS) as SheetFormat[]).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Starter Sheets Table */}
                <div className="pt-2 border-t border-[var(--flux-line)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                      Стартовые листы проекта ({draft.initialSheets.length})
                    </span>
                    <button
                      type="button"
                      data-testid="tpl-add-sheet-btn"
                      onClick={addSheet}
                      className="inline-flex items-center gap-1 text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-accent)] hover:underline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Добавить лист</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {draft.initialSheets.map((sh, idx) => (
                      <div key={sh.id} className="flex items-center gap-2">
                        <span className="w-6 text-right font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] shrink-0">
                          {idx + 1}.
                        </span>
                        <input
                          type="text"
                          value={sh.name}
                          onChange={(e) => updateSheet(sh.id, { name: e.target.value })}
                          className="flex-1 min-w-0 h-7 px-2 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(11.5px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                        />
                        <select
                          value={sh.format}
                          onChange={(e) => updateSheet(sh.id, { format: e.target.value as SheetFormat })}
                          className="w-20 h-7 px-1.5 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                        >
                          <option value="A4">A4</option>
                          <option value="A3">A3</option>
                          <option value="A2">A2</option>
                          <option value="A1">A1</option>
                        </select>
                        <button
                          type="button"
                          disabled={draft.initialSheets.length <= 1}
                          onClick={() => removeSheet(sh.id)}
                          aria-label={`Удалить лист ${idx + 1}`}
                          className="p-1 rounded text-[var(--flux-text-muted)] hover:text-rose-500 disabled:opacity-30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Schematic Preview */}
              <div className="lg:col-span-5 space-y-2">
                <div className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)]">
                  Предпросмотр стартового листа
                </div>
                <ProjectMiniPreview
                  project={previewProject}
                  activeSheetId={previewProject.sheets[0]?.id || 'sheet-1'}
                  className="w-full aspect-[16/10]"
                />
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono tabular-nums text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                  <div>
                    Листов: <strong className="text-[var(--flux-text)]">{previewProject.sheets.length}</strong>
                  </div>
                  <div>
                    Изделий: <strong className="text-[var(--flux-text)]">{previewProject.devices.length}</strong>
                  </div>
                  <div>
                    Цепей: <strong className="text-[var(--flux-text)]">{previewProject.wires.length}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Panel 2: Visuals & Drafting Rules */}
          {panelTab === 'visual' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                    Шрифт схемы и спецификаций
                  </label>
                  <select
                    value={draft.fontFamily}
                    onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value as SchematicFontFamily })}
                    className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                  >
                    {SCHEMATIC_FONT_OPTIONS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                      Шаг сетки
                    </label>
                    <select
                      value={draft.gridSize}
                      onChange={(e) => setDraft({ ...draft, gridSize: Number(e.target.value) as 10 | 20 | 40 })}
                      className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
                    >
                      <option value={10}>10 мм</option>
                      <option value={20}>20 мм</option>
                      <option value={40}>40 мм</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                      Цепи, px
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      step={0.25}
                      value={draft.wireWidth}
                      onChange={(e) => setDraft({ ...draft, wireWidth: Number(e.target.value) || 2 })}
                      className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums text-[var(--flux-text)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                      УГО, px
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={3.5}
                      step={0.25}
                      value={draft.symbolStrokeWidth}
                      onChange={(e) => setDraft({ ...draft, symbolStrokeWidth: Number(e.target.value) || 1.75 })}
                      className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums text-[var(--flux-text)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                    Тема чертежа по умолчанию
                  </label>
                  <select
                    value={draft.theme}
                    onChange={(e) => setDraft({ ...draft, theme: e.target.value as 'light' | 'dark' })}
                    className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                  >
                    <option value="light">Светлая (Бумага ГОСТ)</option>
                    <option value="dark">Тёмная (Графит САПР)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <div className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)] mb-2">
                  Режимы привязки и отображения
                </div>
                {(
                  [
                    ['snapToGrid', 'Привязка компонентов и цепей к сетке'],
                    ['smartGuides', 'Магнитные ортогональные направляющие'],
                    ['wireCrossingBridge', 'Мостики пересечений проводов (арки)'],
                    ['showGostFrame', 'Рамка и основная надпись ГОСТ 2.104'],
                    ['showPinNumbers', 'Номера выводов на УГО'],
                    ['showWireNumbers', 'Маркировка проводов по ГОСТ 2.710'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2.5 py-1 cursor-pointer text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]">
                    <input
                      type="checkbox"
                      checked={draft[key]}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                      className="accent-[var(--flux-accent)]"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Panel 3: GOST Stamp Defaults */}
          {panelTab === 'stamp' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                  Форма штампа первого листа
                </label>
                <select
                  value={draft.stampDefaults.stampForm}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stampDefaults: { ...draft.stampDefaults, stampForm: e.target.value as GostStampForm },
                    })
                  }
                  className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                >
                  <option value="form1">Форма 1 (ГОСТ Р 21.101 / первый лист)</option>
                  <option value="form2a">Форма 2а (сокращённая)</option>
                </select>
              </div>
              <div>
                <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                  Литера документа
                </label>
                <input
                  type="text"
                  value={draft.stampDefaults.litera}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stampDefaults: { ...draft.stampDefaults, litera: e.target.value },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono text-[var(--flux-text)]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                  Организация / Заказчик
                </label>
                <input
                  type="text"
                  data-testid="tpl-stamp-org-input"
                  value={draft.stampDefaults.organization}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stampDefaults: { ...draft.stampDefaults, organization: e.target.value },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                  Разработал
                </label>
                <input
                  type="text"
                  value={draft.stampDefaults.author}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stampDefaults: { ...draft.stampDefaults, author: e.target.value },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                  Проверил
                </label>
                <input
                  type="text"
                  value={draft.stampDefaults.checker}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stampDefaults: { ...draft.stampDefaults, checker: e.target.value },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                  Утвердил
                </label>
                <input
                  type="text"
                  value={draft.stampDefaults.approver}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      stampDefaults: { ...draft.stampDefaults, approver: e.target.value },
                    })
                  }
                  className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                />
              </div>
            </div>
          )}

          {/* Panel 4: Functional Project Modules */}
          {panelTab === 'modules' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-7 divide-y divide-[var(--flux-line)] border border-[var(--flux-line)] rounded-[8px]">
                {(
                  [
                    [
                      'includePowerInfeed',
                      'Силовой ввод 3~380В и привод',
                      'Размещает вводной автомат -QF1, контактор -KM1, ПЧ -UZ1 и электродвигатель -M1 с кабелем -W2.',
                    ],
                    [
                      'includePlcRack',
                      'Контроллер ПЛК и цепи КИП 24VDC',
                      'Добавляет контроллер -A1, первичный датчик -BT1, реле -KA1 и индикацию -HL1.',
                    ],
                    [
                      'includeTerminalStrip',
                      'Клеммные ряды -XT1/-XT2 и кабель -W1',
                      'Формирует клеммную сборку с перемычками и кабельной связью.',
                    ],
                    [
                      'includeGostBomTable',
                      'Автоматическая таблица перечня элементов ПЭ3',
                      'Размещает связанную таблицу ПЭ3 прямо на первом листе чертежа.',
                    ],
                    [
                      'includeCrossRefs',
                      'Межлистовые перекрёстные ссылки потенциалов',
                      'Включает отображение и контроль парных ссылок между листами.',
                    ],
                  ] as const
                ).map(([modKey, title, desc]) => (
                  <label
                    key={modKey}
                    className="flex items-start gap-3 p-3 cursor-pointer hover:bg-[var(--flux-hover)]/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      data-testid={`tpl-module-${modKey}`}
                      checked={draft.modules[modKey]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          modules: { ...draft.modules, [modKey]: e.target.checked },
                        })
                      }
                      className="mt-0.5 accent-[var(--flux-accent)]"
                    />
                    <div className="min-w-0">
                      <div className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                        {title}
                      </div>
                      <div className="text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mt-0.5">
                        {desc}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="lg:col-span-5 space-y-2">
                <div className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)]">
                  Состав генерируемого проекта
                </div>
                <ProjectMiniPreview
                  project={previewProject}
                  activeSheetId={previewProject.sheets[0]?.id || 'sheet-1'}
                  className="w-full aspect-[16/10]"
                />
                <div className="text-[length:calc(11px*var(--flux-ui-scale))] font-mono tabular-nums text-[var(--flux-text-muted)]">
                  Итого: {previewProject.sheets.length} л. · {previewProject.devices.length} изд. · {previewProject.wires.length} цеп. · {(previewProject.annotations || []).length} аннот.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
};
