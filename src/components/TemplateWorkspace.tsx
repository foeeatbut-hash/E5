import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Copy,
  Cpu,
  Download,
  FilePlus2,
  FolderKanban,
  FolderPlus,
  Layers,
  Maximize2,
  Minus,
  PenTool,
  Plus,
  Save,
  Search,
  Share2,
  SlidersHorizontal,
  Stamp,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { SCHEMATIC_FONT_OPTIONS, SHEET_DIMENSIONS } from '../core/e3Catalog';
import type { GostStampForm, SchematicFontFamily, SheetFormat, StandardType } from '../core/e3Types';
import { buildGostSheetGeometry } from '../core/gostFrame';
import {
  APP_STANDALONE_SECTIONS,
  type AppStandaloneSectionId,
  BUILTIN_CUSTOM_TEMPLATE_PRESETS,
  buildProjectFromCustomTemplate,
  clearTemplateWorkspaceDraft,
  createDefaultCustomTemplateDraft,
  CUSTOM_TEMPLATE_CATEGORY_LABELS,
  type CustomProjectTemplate,
  type CustomTemplateCategory,
  duplicateCustomTemplate,
  loadTemplateWorkspaceDraft,
  parseCustomTemplateFile,
  saveTemplateWorkspaceDraft,
  serializeCustomTemplateFile,
  summarizeProjectHealth,
} from '../core/startHub';

interface TemplateWorkspaceProps {
  open: boolean;
  customTemplates: CustomProjectTemplate[];
  isDark: boolean;
  onSaveTemplate: (tpl: CustomProjectTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
  onCreateProjectFromTemplate: (tpl: CustomProjectTemplate) => void;
  onOpenStandaloneSection: (section: AppStandaloneSectionId) => void;
  onCloseToHub: () => void;
}

type InspectorTab = 'structure' | 'visual' | 'stamp' | 'modules';

const SECTION_ICONS: Record<AppStandaloneSectionId, React.ReactNode> = {
  hub: <FolderKanban className="w-3.5 h-3.5 shrink-0" />,
  templates: <Layers className="w-3.5 h-3.5 shrink-0" />,
  hvac: <Cpu className="w-3.5 h-3.5 shrink-0" />,
  ugo: <PenTool className="w-3.5 h-3.5 shrink-0" />,
  exchange: <Share2 className="w-3.5 h-3.5 shrink-0" />,
};

const INSPECTOR_TABS: Array<{ id: InspectorTab; label: string; icon: React.ReactNode }> = [
  { id: 'structure', label: 'Структура', icon: <FolderPlus className="w-3.5 h-3.5 shrink-0" /> },
  { id: 'visual', label: 'Графика', icon: <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" /> },
  { id: 'stamp', label: 'Штамп', icon: <Stamp className="w-3.5 h-3.5 shrink-0" /> },
  { id: 'modules', label: 'Модули', icon: <Layers className="w-3.5 h-3.5 shrink-0" /> },
];

export const TemplateWorkspace: React.FC<TemplateWorkspaceProps> = ({
  open,
  customTemplates,
  isDark,
  onSaveTemplate,
  onDeleteTemplate,
  onCreateProjectFromTemplate,
  onOpenStandaloneSection,
  onCloseToHub,
}) => {
  const [draft, setDraft] = useState<CustomProjectTemplate>(() => {
    const recovered = loadTemplateWorkspaceDraft();
    if (recovered) return recovered;
    return structuredClone(customTemplates[0] || BUILTIN_CUSTOM_TEMPLATE_PRESETS[0]);
  });
  const [selectedId, setSelectedId] = useState<string>(() => draft.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('structure');
  const [activePreviewSheetIdx, setActivePreviewSheetIdx] = useState(0);
  const [savedNotice, setSavedNotice] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 36, y: 28 });
  const panDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const canvasWrapRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const flashNotice = useCallback((msg: string, markSaved = false) => {
    if (markSaved) setSavedNotice(true);
    setStatusMessage(msg);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setSavedNotice(false);
      setStatusMessage(null);
    }, 2200);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // Autosave template studio draft cleanly on every edit while open
  useEffect(() => {
    if (!open) return;
    saveTemplateWorkspaceDraft(draft);
  }, [open, draft]);

  // Esc returns cleanly to StartMenuHub unless inside text field
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseToHub();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCloseToHub]);

  const previewProject = useMemo(
    () =>
      buildProjectFromCustomTemplate(draft, {
        nowIso: '2026-11-15T10:00:00.000Z',
        themeOverride: isDark ? 'dark' : 'light',
      }),
    [draft, isDark]
  );

  const previewHealth = useMemo(() => summarizeProjectHealth(previewProject), [previewProject]);

  const activeSheet =
    previewProject.sheets[Math.min(activePreviewSheetIdx, Math.max(0, previewProject.sheets.length - 1))] ||
    previewProject.sheets[0];

  const gostGeometry = useMemo(
    () => (activeSheet ? buildGostSheetGeometry(activeSheet, previewProject) : null),
    [activeSheet, previewProject]
  );

  const fitSheetToCanvas = useCallback(() => {
    const el = canvasWrapRef.current;
    if (!el || !activeSheet) return;
    const rect = el.getBoundingClientRect();
    const pad = 28;
    const availW = Math.max(200, rect.width - pad * 2);
    const availH = Math.max(160, rect.height - pad * 2);
    const nextZoom = Number(
      Math.max(0.22, Math.min(1.4, Math.min(availW / activeSheet.width, availH / activeSheet.height))).toFixed(3)
    );
    setZoom(nextZoom);
    setPan({
      x: Math.round((rect.width - activeSheet.width * nextZoom) / 2),
      y: Math.round((rect.height - activeSheet.height * nextZoom) / 2),
    });
  }, [activeSheet]);

  const fitRef = useRef(fitSheetToCanvas);
  fitRef.current = fitSheetToCanvas;

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => fitRef.current());
    return () => cancelAnimationFrame(raf);
  }, [open, activeSheet?.id, activeSheet?.format]);

  const selectTemplate = (tpl: CustomProjectTemplate) => {
    setSelectedId(tpl.id);
    setDraft(structuredClone(tpl));
    setActivePreviewSheetIdx(0);
    setSavedNotice(false);
  };

  const handleCreateNewBlank = () => {
    const fresh = createDefaultCustomTemplateDraft({
      title: `Шаблон проекта #${customTemplates.length + 1}`,
      theme: isDark ? 'dark' : 'light',
    });
    setSelectedId(fresh.id);
    setDraft(fresh);
    setActivePreviewSheetIdx(0);
    setInspectorTab('structure');
    flashNotice('Создан чистый черновик шаблона проекта');
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
    saveTemplateWorkspaceDraft(targetToSave);
    flashNotice(`Шаблон «${targetToSave.title}» сохранён и доступен в Главном меню`, true);
  };

  const handleDuplicate = () => {
    const copy = duplicateCustomTemplate(draft);
    onSaveTemplate(copy);
    setSelectedId(copy.id);
    setDraft(copy);
    flashNotice(`Создана копия «${copy.title}»`, true);
  };

  const handleExportFile = () => {
    const jsonText = serializeCustomTemplateFile(draft);
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slug = (draft.projectCodePrefix || draft.title || 'template')
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '_')
      .slice(0, 40);
    a.download = `${slug}.e3tpl.json`;
    a.click();
    URL.revokeObjectURL(url);
    flashNotice('Шаблон экспортирован в файл .e3tpl.json');
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCustomTemplateFile(text);
    if (!parsed) {
      flashNotice('Не удалось распознать файл шаблона .e3tpl.json');
      return;
    }
    onSaveTemplate(parsed);
    setSelectedId(parsed.id);
    setDraft(parsed);
    setActivePreviewSheetIdx(0);
    flashNotice(`Импортирован шаблон «${parsed.title}»`, true);
  };

  const handleLaunchProject = () => {
    if (!draft.isBuiltin) {
      onSaveTemplate(draft);
    }
    clearTemplateWorkspaceDraft();
    onCreateProjectFromTemplate(draft);
  };

  const addSheet = () => {
    const num = draft.initialSheets.length + 1;
    setDraft((prev) => ({
      ...prev,
      initialSheets: [
        ...prev.initialSheets,
        { id: `sh-${Date.now().toString(36)}`, name: `Лист ${num}`, format: prev.defaultFormat },
      ],
    }));
    setActivePreviewSheetIdx(draft.initialSheets.length);
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
      return { ...prev, initialSheets: prev.initialSheets.filter((s) => s.id !== id) };
    });
    setActivePreviewSheetIdx((idx) => Math.max(0, idx - 1));
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredCustom = useMemo(
    () =>
      q
        ? customTemplates.filter((t) =>
            `${t.title} ${t.description} ${t.projectCodePrefix}`.toLowerCase().includes(q)
          )
        : customTemplates,
    [customTemplates, q]
  );
  const filteredBuiltin = useMemo(
    () =>
      q
        ? BUILTIN_CUSTOM_TEMPLATE_PRESETS.filter((t) =>
            `${t.title} ${t.description} ${t.projectCodePrefix}`.toLowerCase().includes(q)
          )
        : BUILTIN_CUSTOM_TEMPLATE_PRESETS,
    [q]
  );

  const sheetDevices = useMemo(
    () => previewProject.devices.filter((d) => d.sheetId === activeSheet?.id),
    [previewProject.devices, activeSheet?.id]
  );
  const sheetWires = useMemo(
    () => previewProject.wires.filter((w) => w.sheetId === activeSheet?.id),
    [previewProject.wires, activeSheet?.id]
  );
  const sheetAnnotations = useMemo(
    () => (previewProject.annotations || []).filter((a) => a.sheetId === activeSheet?.id),
    [previewProject.annotations, activeSheet?.id]
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="template-workspace-root"
          data-testid="template-workspace"
          role="region"
          aria-label="Мастерская шаблонов проекта"
          initial={{ opacity: 0.96 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[47] flex flex-col overflow-hidden bg-[var(--flux-canvas-bg)] text-[var(--flux-text)] select-none"
        >
          <input
            ref={importInputRef}
            type="file"
            accept=".e3tpl.json,.json"
            data-testid="tpl-ws-import-input"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = '';
            }}
          />

          {/* Top Workspace Header + Standalone Section Switcher */}
          <header className="shrink-0 px-3 py-2 border-b border-[var(--flux-line)] flux-glass-bar flex flex-wrap items-center justify-between gap-2 z-20">
            {/* Standalone Section Switcher */}
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              <span className="font-semibold tracking-tight text-[length:calc(12.5px*var(--flux-ui-scale))] text-[var(--flux-text)] mr-1 whitespace-nowrap shrink-0">
                Мастерская шаблонов
              </span>
              <span className="h-4 w-px bg-[var(--flux-line)] mx-1 shrink-0" aria-hidden="true" />
              <nav
                aria-label="Разделы программы"
                className="flex items-center gap-0.5 p-0.5 rounded-[7px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/70"
              >
                {APP_STANDALONE_SECTIONS.map((sec) => {
                  const active = sec.id === 'templates';
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      data-testid={`standalone-nav-${sec.id}`}
                      onClick={() => {
                        if (!active) onOpenStandaloneSection(sec.id);
                      }}
                      title={sec.subtitle}
                      className={`relative px-2.5 h-6 rounded-[5px] inline-flex items-center gap-1.5 text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'text-[var(--flux-text)] font-semibold'
                          : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="tpl-ws-standalone-pill"
                          transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                          className="absolute inset-0 rounded-[5px] bg-[var(--flux-surface)] border border-[var(--flux-accent)]/40 shadow-xs"
                          aria-hidden="true"
                        />
                      )}
                      <span className={`relative z-10 inline-flex items-center gap-1.5 ${active ? 'text-[var(--flux-accent)]' : ''}`}>
                        {SECTION_ICONS[sec.id]}
                        <span className="text-[var(--flux-text)]">{sec.title}</span>
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <button
                type="button"
                data-testid="tpl-ws-new-btn"
                onClick={handleCreateNewBlank}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                <span>Новый</span>
              </button>

              <button
                type="button"
                data-testid="tpl-ws-import-btn"
                onClick={() => importInputRef.current?.click()}
                className="hidden sm:inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                <span>Импорт .e3tpl</span>
              </button>

              <button
                type="button"
                data-testid="tpl-ws-export-btn"
                onClick={handleExportFile}
                className="hidden md:inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                <span>Экспорт .e3tpl</span>
              </button>

              <button
                type="button"
                data-testid="tpl-ws-save-btn"
                onClick={handleSaveCurrent}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border border-[var(--flux-accent)]/45 bg-[var(--flux-accent-soft)]/50 hover:bg-[var(--flux-accent-soft)] text-[length:calc(11px*var(--flux-ui-scale))] font-semibold whitespace-nowrap shrink-0 transition-colors"
              >
                {savedNotice ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Save className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                )}
                <span>{savedNotice ? 'Сохранено' : 'Сохранить шаблон'}</span>
              </button>

              <button
                type="button"
                data-testid="tpl-ws-create-project-btn"
                onClick={handleLaunchProject}
                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11px*var(--flux-ui-scale))] font-semibold whitespace-nowrap shrink-0 shadow-xs transition-colors"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                <span>Создать проект</span>
              </button>

              <button
                type="button"
                data-testid="tpl-ws-close-btn"
                onClick={onCloseToHub}
                title="Вернуться в Главное меню (Esc)"
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[6px] border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>В меню</span>
              </button>
            </div>
          </header>

          {/* 3-Column Standalone Studio Layout */}
          <div className="flex-1 min-h-0 flex overflow-hidden animate-slide-in-right">
            {/* Left Rail: Template Library */}
            <aside
              aria-label="Библиотека шаблонов проектов"
              className="w-60 lg:w-72 shrink-0 border-r border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-col min-h-0"
            >
              <div className="p-2.5 border-b border-[var(--flux-line)]">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[var(--flux-text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск шаблона…"
                    aria-label="Поиск шаблона"
                    className="w-full h-7 pl-8 pr-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-accent)]"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 space-y-4">
                <div>
                  <div className="flex items-center justify-between px-1 mb-1.5">
                    <span className="text-[length:calc(10px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.05em] text-[var(--flux-text-muted)]">
                      Мои шаблоны
                    </span>
                    <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                      {filteredCustom.length}
                    </span>
                  </div>
                  {filteredCustom.length === 0 ? (
                    <div className="px-2.5 py-3 rounded-[7px] border border-dashed border-[var(--flux-line)] text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] leading-snug">
                      Нет сохранённых шаблонов. Настройте профиль справа и нажмите «Сохранить шаблон».
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredCustom.map((tpl) => {
                        const active = selectedId === tpl.id;
                        return (
                          <div
                            key={tpl.id}
                            className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-[7px] border transition-colors ${
                              active
                                ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/50'
                                : 'border-transparent hover:border-[var(--flux-line)] hover:bg-[var(--flux-hover)]'
                            }`}
                          >
                            <button
                              type="button"
                              data-testid={`tpl-ws-item-${tpl.id}`}
                              onClick={() => selectTemplate(tpl)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold truncate">
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
                                if (selectedId === tpl.id) {
                                  selectTemplate(BUILTIN_CUSTOM_TEMPLATE_PRESETS[0]);
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

                <div>
                  <div className="px-1 mb-1.5 text-[length:calc(10px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.05em] text-[var(--flux-text-muted)]">
                    Базовые профили
                  </div>
                  <div className="space-y-1">
                    {filteredBuiltin.map((tpl) => {
                      const active = selectedId === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          data-testid={`tpl-ws-builtin-${tpl.id}`}
                          onClick={() => selectTemplate(tpl)}
                          className={`w-full px-2.5 py-2 rounded-[7px] border text-left transition-colors ${
                            active
                              ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/50'
                              : 'border-transparent hover:border-[var(--flux-line)] hover:bg-[var(--flux-hover)]'
                          }`}
                        >
                          <div className="text-[length:calc(11.5px*var(--flux-ui-scale))] font-semibold truncate">
                            {tpl.title}
                          </div>
                          <div className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] truncate">
                            {tpl.standard === 'IEC' ? 'IEC' : 'ГОСТ'} · {tpl.initialSheets.length} л. · {CUSTOM_TEMPLATE_CATEGORY_LABELS[tpl.category]}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>

            {/* Center Interactive Sheet Canvas */}
            <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">
              {/* Sheet Tabs Strip */}
              <div className="shrink-0 h-9 px-3 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]/80 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
                  {previewProject.sheets.map((sh, idx) => {
                    const active = sh.id === activeSheet?.id;
                    return (
                      <button
                        key={sh.id}
                        type="button"
                        data-testid={`tpl-ws-sheet-tab-${idx + 1}`}
                        onClick={() => setActivePreviewSheetIdx(idx)}
                        className={`relative h-6 px-2.5 rounded-[5px] inline-flex items-center gap-1.5 text-[length:calc(11px*var(--flux-ui-scale))] whitespace-nowrap shrink-0 transition-colors ${
                          active
                            ? 'bg-[var(--flux-surface-alt)] border border-[var(--flux-accent)]/45 text-[var(--flux-text)] font-semibold'
                            : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                        }`}
                      >
                        <span className="font-mono text-[var(--flux-accent)]">Л.{sh.number}</span>
                        <span className="truncate max-w-[140px]">{sh.name}</span>
                        <span className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] opacity-70">
                          {sh.format}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addSheet}
                    title="Добавить лист в шаблон"
                    className="h-6 px-2 rounded-[5px] inline-flex items-center gap-1 text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Лист</span>
                  </button>
                </div>

                <div className="font-mono tabular-nums text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] whitespace-nowrap shrink-0">
                  {previewHealth.clean ? 'ERC чисто' : `ERC: ${previewHealth.errors} ош.`} · {previewProject.devices.length} изд. · {previewProject.wires.length} цеп.
                </div>
              </div>

              {/* Interactive SVG Sheet Viewport */}
              <div
                ref={canvasWrapRef}
                data-testid="tpl-ws-canvas"
                onWheel={(e) => {
                  e.preventDefault();
                  const wrap = canvasWrapRef.current;
                  if (!wrap) return;
                  const rect = wrap.getBoundingClientRect();
                  const mx = e.clientX - rect.left;
                  const my = e.clientY - rect.top;
                  const factor = e.deltaY < 0 ? 1.12 : 0.89;
                  const nextZoom = Math.max(0.2, Math.min(2.2, Number((zoom * factor).toFixed(3))));
                  const wx = (mx - pan.x) / zoom;
                  const wy = (my - pan.y) / zoom;
                  setZoom(nextZoom);
                  setPan({ x: Math.round(mx - wx * nextZoom), y: Math.round(my - wy * nextZoom) });
                }}
                onMouseDown={(e) => {
                  if (e.button === 0 || e.button === 1) {
                    panDragRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      origX: pan.x,
                      origY: pan.y,
                    };
                  }
                }}
                onMouseMove={(e) => {
                  if (!panDragRef.current) return;
                  setPan({
                    x: panDragRef.current.origX + (e.clientX - panDragRef.current.startX),
                    y: panDragRef.current.origY + (e.clientY - panDragRef.current.startY),
                  });
                }}
                onMouseUp={() => {
                  panDragRef.current = null;
                }}
                onMouseLeave={() => {
                  panDragRef.current = null;
                }}
                className="flex-1 min-h-0 relative overflow-hidden cursor-grab active:cursor-grabbing"
              >
                {activeSheet && gostGeometry && (
                  <svg className="w-full h-full block">
                    <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                      {/* Paper Sheet Surface */}
                      <rect
                        x={0}
                        y={0}
                        width={activeSheet.width}
                        height={activeSheet.height}
                        fill={draft.theme === 'dark' ? '#14171c' : '#fdfdfd'}
                        stroke={draft.theme === 'dark' ? '#334155' : '#cbd5e1'}
                        strokeWidth={2 / zoom}
                        rx={3}
                      />

                      {/* Drafting Grid */}
                      <defs>
                        <pattern
                          id="tpl-ws-grid"
                          width={draft.gridSize}
                          height={draft.gridSize}
                          patternUnits="userSpaceOnUse"
                        >
                          <circle
                            cx={1}
                            cy={1}
                            r={Math.max(0.6, 0.9 / zoom)}
                            fill={draft.theme === 'dark' ? '#2c333d' : '#cbd5e1'}
                          />
                        </pattern>
                      </defs>
                      <rect
                        x={gostGeometry.frame.left}
                        y={gostGeometry.frame.top}
                        width={gostGeometry.frame.width}
                        height={gostGeometry.frame.height}
                        fill="url(#tpl-ws-grid)"
                      />

                      {/* GOST Frame & Stamp */}
                      {draft.showGostFrame && (
                        <g stroke={draft.theme === 'dark' ? '#cbd5e1' : '#111827'} fill="none">
                          <rect
                            x={gostGeometry.frame.left}
                            y={gostGeometry.frame.top}
                            width={gostGeometry.frame.width}
                            height={gostGeometry.frame.height}
                            strokeWidth={2}
                          />
                          <rect
                            x={gostGeometry.stamp.x}
                            y={gostGeometry.stamp.y}
                            width={gostGeometry.stamp.width}
                            height={gostGeometry.stamp.height}
                            fill={draft.theme === 'dark' ? '#161a20' : '#ffffff'}
                            strokeWidth={2}
                          />
                          {gostGeometry.stamp.lines.map((ln, idx) => (
                            <line
                              key={idx}
                              x1={ln.x1}
                              y1={ln.y1}
                              x2={ln.x2}
                              y2={ln.y2}
                              strokeWidth={ln.thick ? 1.8 : 0.9}
                            />
                          ))}
                          {gostGeometry.stamp.cells.map((cell) => (
                            <text
                              key={cell.id}
                              x={cell.align === 'center' ? cell.x + cell.width / 2 : cell.x + 4}
                              y={cell.y + cell.height / 2 + (cell.fontSize || 9) * 0.34}
                              textAnchor={cell.align === 'center' ? 'middle' : 'start'}
                              fill={draft.theme === 'dark' ? '#e2e8f0' : '#0f172a'}
                              stroke="none"
                              fontSize={cell.fontSize || 9}
                              fontWeight={cell.bold ? 600 : 400}
                              fontFamily="IBM Plex Sans, sans-serif"
                            >
                              {cell.text}
                            </text>
                          ))}
                        </g>
                      )}

                      {/* Live Schematic Preview: Wires */}
                      {sheetWires.map((w) => {
                        const pts = w.waypoints.map((p) => `${p.x},${p.y}`).join(' ');
                        const strokeCol =
                          w.signalType === 'power'
                            ? '#dc2626'
                            : w.signalType === 'dc24'
                              ? '#2563eb'
                              : w.signalType === 'pe'
                                ? '#16a34a'
                                : draft.theme === 'dark'
                                  ? '#94a3b8'
                                  : '#334155';
                        return (
                          <polyline
                            key={w.id}
                            points={pts}
                            fill="none"
                            stroke={strokeCol}
                            strokeWidth={draft.wireWidth}
                            strokeLinecap="square"
                          />
                        );
                      })}

                      {/* Live Schematic Preview: Devices */}
                      {sheetDevices.map((dev) => (
                        <g key={dev.id} transform={`translate(${dev.x}, ${dev.y})`}>
                          <rect
                            x={0}
                            y={0}
                            width={dev.width}
                            height={dev.height}
                            rx={3}
                            fill={draft.theme === 'dark' ? '#1e242c' : '#ffffff'}
                            stroke={draft.theme === 'dark' ? '#e2e8f0' : '#0f172a'}
                            strokeWidth={draft.symbolStrokeWidth}
                          />
                          <text
                            x={dev.width / 2}
                            y={dev.height / 2 + 4}
                            textAnchor="middle"
                            fontSize={10}
                            fontWeight={600}
                            fontFamily="IBM Plex Mono, monospace"
                            fill={draft.theme === 'dark' ? '#38bdf8' : '#0f766e'}
                          >
                            {dev.designation}
                          </text>
                        </g>
                      ))}

                      {/* Live Schematic Preview: BOM PЭ3 Box */}
                      {sheetAnnotations.map((ann) => (
                        <g key={ann.id} transform={`translate(${ann.x}, ${ann.y})`}>
                          <rect
                            x={0}
                            y={0}
                            width={ann.width}
                            height={ann.height}
                            fill={draft.theme === 'dark' ? '#181c23' : '#f8fafc'}
                            stroke={draft.theme === 'dark' ? '#64748b' : '#475569'}
                            strokeWidth={1.2}
                          />
                          <line
                            x1={0}
                            y1={28}
                            x2={ann.width}
                            y2={28}
                            stroke={draft.theme === 'dark' ? '#64748b' : '#475569'}
                            strokeWidth={1}
                          />
                          <text
                            x={12}
                            y={18}
                            fontSize={11}
                            fontWeight={600}
                            fill={draft.theme === 'dark' ? '#e2e8f0' : '#0f172a'}
                          >
                            {ann.text || 'Перечень элементов (ПЭ3)'}
                          </text>
                        </g>
                      ))}
                    </g>
                  </svg>
                )}

                {/* Bottom-Left Status Flash */}
                {statusMessage && (
                  <div className="absolute bottom-3 left-3 z-20 px-3 py-1.5 rounded-[8px] border border-[var(--flux-accent)]/40 flux-glass-surface shadow-lg text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]">
                    {statusMessage}
                  </div>
                )}

                {/* Bottom-Right Canvas Zoom & Format HUD */}
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute bottom-3 right-3 z-20 inline-flex items-center gap-1 h-8 px-2 rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]"
                >
                  {activeSheet && (
                    <>
                      <span className="px-1 text-[var(--flux-text)] font-semibold">
                        {activeSheet.format}
                      </span>
                      <span className="h-3.5 w-px bg-[var(--flux-line)] mx-0.5" />
                    </>
                  )}
                  <button
                    type="button"
                    aria-label="Отдалить"
                    onClick={() => setZoom((z) => Math.max(0.2, Number((z * 0.85).toFixed(3))))}
                    className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-[var(--flux-hover)]"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="min-w-[38px] text-center tabular-nums text-[var(--flux-text)]">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    aria-label="Приблизить"
                    onClick={() => setZoom((z) => Math.min(2.2, Number((z * 1.18).toFixed(3))))}
                    className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-[var(--flux-hover)]"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="Вписать лист"
                    onClick={fitSheetToCanvas}
                    className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-[var(--flux-hover)] hover:text-[var(--flux-accent)]"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </main>

            {/* Right Inspector: Template Structure, Graphics, Stamp, Modules */}
            <aside
              aria-label="Инспектор параметров шаблона"
              className="w-80 lg:w-96 shrink-0 border-l border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-col min-h-0"
            >
              {/* Animated Tab Strip */}
              <div className="shrink-0 p-1.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)]/60 flex items-center gap-0.5">
                {INSPECTOR_TABS.map((t) => {
                  const active = inspectorTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`tpl-ws-tab-${t.id}`}
                      onClick={() => setInspectorTab(t.id)}
                      className={`relative flex-1 h-7 px-1.5 rounded-[5px] inline-flex items-center justify-center gap-1 text-[length:calc(11px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors ${
                        active
                          ? 'text-[var(--flux-text)] font-semibold'
                          : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="tpl-ws-inspector-tab"
                          transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                          className="absolute inset-0 rounded-[5px] bg-[var(--flux-surface)] border border-[var(--flux-accent)]/35 shadow-xs"
                          aria-hidden="true"
                        />
                      )}
                      <span className={`relative z-10 inline-flex items-center gap-1 ${active ? 'text-[var(--flux-accent)]' : ''}`}>
                        {t.icon}
                        <span className="text-[var(--flux-text)]">{t.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-[length:calc(11.5px*var(--flux-ui-scale))]">
                {inspectorTab === 'structure' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                        Название шаблона
                      </label>
                      <input
                        type="text"
                        data-testid="tpl-ws-title-input"
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                        Категория
                      </label>
                      <select
                        value={draft.category}
                        onChange={(e) => setDraft({ ...draft, category: e.target.value as CustomTemplateCategory })}
                        className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)]"
                      >
                        {(Object.keys(CUSTOM_TEMPLATE_CATEGORY_LABELS) as CustomTemplateCategory[]).map((cat) => (
                          <option key={cat} value={cat}>
                            {CUSTOM_TEMPLATE_CATEGORY_LABELS[cat]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                        Описание
                      </label>
                      <textarea
                        rows={2}
                        value={draft.description}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        className="w-full p-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[var(--flux-text)] resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                          Стандарт
                        </label>
                        <select
                          value={draft.standard}
                          onChange={(e) => setDraft({ ...draft, standard: e.target.value as StandardType })}
                          className="w-full h-8 px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono"
                        >
                          <option value="GOST">ГОСТ</option>
                          <option value="IEC">IEC</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                          Префикс
                        </label>
                        <input
                          type="text"
                          value={draft.projectCodePrefix}
                          onChange={(e) => setDraft({ ...draft, projectCodePrefix: e.target.value })}
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                          Формат
                        </label>
                        <select
                          value={draft.defaultFormat}
                          onChange={(e) => setDraft({ ...draft, defaultFormat: e.target.value as SheetFormat })}
                          className="w-full h-8 px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono"
                        >
                          {(Object.keys(SHEET_DIMENSIONS) as SheetFormat[]).map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="pt-2.5 border-t border-[var(--flux-line)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Стартовые листы ({draft.initialSheets.length})</span>
                        <button
                          type="button"
                          onClick={addSheet}
                          className="inline-flex items-center gap-1 text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-accent)] hover:underline"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Добавить</span>
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {draft.initialSheets.map((sh, idx) => (
                          <div key={sh.id} className="flex items-center gap-1.5">
                            <span className="w-5 font-mono tabular-nums text-[var(--flux-text-muted)] text-right shrink-0">
                              {idx + 1}.
                            </span>
                            <input
                              type="text"
                              value={sh.name}
                              onChange={(e) => updateSheet(sh.id, { name: e.target.value })}
                              className="flex-1 min-w-0 h-7 px-2 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                            />
                            <select
                              value={sh.format}
                              onChange={(e) => updateSheet(sh.id, { format: e.target.value as SheetFormat })}
                              className="w-16 h-7 px-1 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono"
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
                              className="p-1 rounded text-[var(--flux-text-muted)] hover:text-rose-500 disabled:opacity-30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[var(--flux-line)] flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleDuplicate}
                        className="inline-flex items-center gap-1.5 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Дублировать как копию</span>
                      </button>
                    </div>
                  </div>
                )}

                {inspectorTab === 'visual' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                        Шрифт схемы
                      </label>
                      <select
                        value={draft.fontFamily}
                        onChange={(e) => setDraft({ ...draft, fontFamily: e.target.value as SchematicFontFamily })}
                        className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                      >
                        {SCHEMATIC_FONT_OPTIONS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                          Сетка
                        </label>
                        <select
                          value={draft.gridSize}
                          onChange={(e) => setDraft({ ...draft, gridSize: Number(e.target.value) as 10 | 20 | 40 })}
                          className="w-full h-8 px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono"
                        >
                          <option value={10}>10 мм</option>
                          <option value={20}>20 мм</option>
                          <option value={40}>40 мм</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                          Цепь, px
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={4}
                          step={0.25}
                          value={draft.wireWidth}
                          onChange={(e) => setDraft({ ...draft, wireWidth: Number(e.target.value) || 2 })}
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                          УГО, px
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={3.5}
                          step={0.25}
                          value={draft.symbolStrokeWidth}
                          onChange={(e) => setDraft({ ...draft, symbolStrokeWidth: Number(e.target.value) || 1.75 })}
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono tabular-nums"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                        Тема чертежа
                      </label>
                      <select
                        value={draft.theme}
                        onChange={(e) => setDraft({ ...draft, theme: e.target.value as 'light' | 'dark' })}
                        className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                      >
                        <option value="light">Светлая (Бумага ГОСТ)</option>
                        <option value="dark">Тёмная (Графит САПР)</option>
                      </select>
                    </div>
                    <div className="pt-2 border-t border-[var(--flux-line)] space-y-1.5">
                      {(
                        [
                          ['snapToGrid', 'Привязка к сетке'],
                          ['smartGuides', 'Магнитные направляющие'],
                          ['wireCrossingBridge', 'Мостики пересечений цепей'],
                          ['showGostFrame', 'Рамка и штамп ГОСТ 2.104'],
                          ['showPinNumbers', 'Номера выводов на УГО'],
                          ['showWireNumbers', 'Маркировка цепей ГОСТ 2.710'],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 py-0.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft[k]}
                            onChange={(e) => setDraft({ ...draft, [k]: e.target.checked })}
                            className="accent-[var(--flux-accent)]"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {inspectorTab === 'stamp' && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                        Форма штампа 1-го листа
                      </label>
                      <select
                        value={draft.stampDefaults.stampForm}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            stampDefaults: { ...draft.stampDefaults, stampForm: e.target.value as GostStampForm },
                          })
                        }
                        className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                      >
                        <option value="form1">Форма 1 (ГОСТ Р 21.101 / основной)</option>
                        <option value="form2a">Форма 2а (сокращённая)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                        Организация / Заказчик
                      </label>
                      <input
                        type="text"
                        data-testid="tpl-ws-org-input"
                        value={draft.stampDefaults.organization}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            stampDefaults: { ...draft.stampDefaults, organization: e.target.value },
                          })
                        }
                        className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
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
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                          Литера
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
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
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
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
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
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {inspectorTab === 'modules' && (
                  <div className="divide-y divide-[var(--flux-line)] border border-[var(--flux-line)] rounded-[8px]">
                    {(
                      [
                        [
                          'includePowerInfeed',
                          'Силовой ввод 3~380В и привод',
                          'QF1, контактор KM1, ПЧ UZ1 и двигатель M1.',
                        ],
                        [
                          'includePlcRack',
                          'Контроллер ПЛК и цепи КИП 24VDC',
                          'ПЛК A1, датчик BT1, реле KA1 и лампа HL1.',
                        ],
                        [
                          'includeTerminalStrip',
                          'Клеммные ряды -XT1/-XT2 и кабель -W1',
                          'Клеммная сборка с перемычками.',
                        ],
                        [
                          'includeGostBomTable',
                          'Таблица перечня элементов ПЭ3',
                          'Размещение таблицы ПЭ3 на первом листе.',
                        ],
                        [
                          'includeCrossRefs',
                          'Перекрёстные ссылки потенциалов',
                          'Парные межлистовые ссылки.',
                        ],
                      ] as const
                    ).map(([k, title, desc]) => (
                      <label key={k} className="flex items-start gap-2.5 p-2.5 cursor-pointer hover:bg-[var(--flux-hover)]/50">
                        <input
                          type="checkbox"
                          data-testid={`tpl-ws-mod-${k}`}
                          checked={draft.modules[k]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              modules: { ...draft.modules, [k]: e.target.checked },
                            })
                          }
                          className="mt-0.5 accent-[var(--flux-accent)]"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold">{title}</div>
                          <div className="text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                            {desc}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
