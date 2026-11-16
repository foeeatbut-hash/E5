import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Cpu,
  Download,
  FilePlus2,
  FolderKanban,
  FolderPlus,
  Frame,
  Layers,
  Magnet,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  PanelLeft,
  PenTool,
  Plus,
  Save,
  Scan,
  Search,
  Share2,
  SlidersHorizontal,
  Stamp,
  Sun,
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

const SECTION_SHORT_LABELS: Record<AppStandaloneSectionId, string> = {
  hub: 'Меню',
  templates: 'Шаблоны',
  hvac: 'ФСА',
  ugo: 'УГО',
  exchange: 'Обмен',
};

const SECTION_ICONS: Record<AppStandaloneSectionId, React.ReactNode> = {
  hub: <FolderKanban className="w-3 h-3 shrink-0" />,
  templates: <Layers className="w-3 h-3 shrink-0" />,
  hvac: <Cpu className="w-3 h-3 shrink-0" />,
  ugo: <PenTool className="w-3 h-3 shrink-0" />,
  exchange: <Share2 className="w-3 h-3 shrink-0" />,
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

  const [libraryOpen, setLibraryOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1100 : true
  );
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [canvasFocusClean, setCanvasFocusClean] = useState(false);

  const [zoom, setZoom] = useState(0.55);
  const [pan, setPan] = useState({ x: 320, y: 76 });
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

  useEffect(() => {
    if (!open) return;
    saveTemplateWorkspaceDraft(draft);
  }, [open, draft]);

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

  const effectiveLibraryOpen = !canvasFocusClean && libraryOpen;
  const effectiveInspectorOpen = !canvasFocusClean && inspectorOpen;

  const fitSheetToCanvas = useCallback(() => {
    const el = canvasWrapRef.current;
    if (!el || !activeSheet) return;
    const rect = el.getBoundingClientRect();
    const isDesktop = rect.width >= 1024;
    const leftPad = isDesktop && effectiveLibraryOpen ? 336 : 64;
    const rightPad = isDesktop && effectiveInspectorOpen ? 356 : 24;
    const topPad = 64;
    const bottomPad = 64;

    const availW = Math.max(180, rect.width - leftPad - rightPad);
    const availH = Math.max(160, rect.height - topPad - bottomPad);
    const nextZoom = Number(
      Math.max(0.22, Math.min(1.4, Math.min(availW / activeSheet.width, availH / activeSheet.height))).toFixed(3)
    );
    setZoom(nextZoom);
    setPan({
      x: Math.round(leftPad + (availW - activeSheet.width * nextZoom) / 2),
      y: Math.round(topPad + (availH - activeSheet.height * nextZoom) / 2),
    });
  }, [activeSheet, effectiveLibraryOpen, effectiveInspectorOpen]);

  const fitRef = useRef(fitSheetToCanvas);
  fitRef.current = fitSheetToCanvas;

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => fitRef.current());
    return () => cancelAnimationFrame(raf);
  }, [open, activeSheet?.id, activeSheet?.format, effectiveLibraryOpen, effectiveInspectorOpen]);

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
    if (canvasFocusClean) setCanvasFocusClean(false);
    setInspectorOpen(true);
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
    flashNotice(`Шаблон «${targetToSave.title}» сохранён`, true);
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
          aria-label="Мастерская шаблонов проекта (Фокус-холст)"
          initial={{ opacity: 0.96 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 z-[47] overflow-hidden bg-[var(--flux-canvas-bg)] text-[var(--flux-text)] select-none"
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

          {/* Full-Bleed Interactive Focus Sheet Canvas */}
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
            className="absolute inset-0 overflow-hidden cursor-grab active:cursor-grabbing animate-slide-in-right"
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
          </div>

          {/* Floating Focus Top HUD Row (Top-Left Template Actions | Top-Center Sheets | Top-Right Sections) */}
          <div className="pointer-events-none absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2">
            {/* Top-Left Floating Glass Pill: Dedicated Template Studio Controls */}
            <div
              data-testid="tpl-ws-top-left"
              onMouseDown={(e) => e.stopPropagation()}
              className="pointer-events-auto inline-flex items-center gap-0.5 h-[calc(34px*var(--flux-ui-scale))] pl-1.5 pr-1.5 rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg min-w-0 max-w-[min(600px,52vw)] xl:max-w-[640px] overflow-x-auto no-scrollbar shrink-0"
            >
              <span className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-2 rounded-[5px] bg-[var(--flux-accent-soft)] border border-[var(--flux-accent)]/35 font-semibold text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-accent)] whitespace-nowrap shrink-0">
                <Layers className="w-3 h-3 shrink-0" />
                <span>Шаблоны</span>
              </span>
              <span className="h-4 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" aria-hidden="true" />
              <button
                type="button"
                data-testid="tpl-ws-new-btn"
                onClick={handleCreateNewBlank}
                title="Создать новый чистый шаблон проекта"
                className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0 transition-colors"
              >
                <Plus className="w-3 h-3 text-[var(--flux-accent)] shrink-0" />
                <span>Новый</span>
              </button>
              <button
                type="button"
                data-testid="tpl-ws-duplicate-btn"
                onClick={handleDuplicate}
                title="Дублировать текущий шаблон как копию"
                className="hidden sm:inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0 transition-colors"
              >
                <Copy className="w-3 h-3 text-[var(--flux-accent)] shrink-0" />
                <span>Дубл.</span>
              </button>
              <button
                type="button"
                data-testid="tpl-ws-import-btn"
                onClick={() => importInputRef.current?.click()}
                title="Импортировать шаблон из файла .e3tpl.json"
                className="hidden md:inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0 transition-colors"
              >
                <Upload className="w-3 h-3 text-[var(--flux-accent)] shrink-0" />
                <span>Импорт</span>
              </button>
              <button
                type="button"
                data-testid="tpl-ws-export-btn"
                onClick={handleExportFile}
                title="Экспортировать шаблон в файл .e3tpl.json"
                className="hidden xl:inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0 transition-colors"
              >
                <Download className="w-3 h-3 text-[var(--flux-accent)] shrink-0" />
                <span>.e3tpl</span>
              </button>
              <button
                type="button"
                data-testid="tpl-ws-save-btn"
                onClick={handleSaveCurrent}
                title="Сохранить изменения шаблона в профиль"
                className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-2 rounded-[5px] border border-[var(--flux-accent)]/45 bg-[var(--flux-accent-soft)]/55 hover:bg-[var(--flux-accent-soft)] text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)] whitespace-nowrap shrink-0 transition-colors"
              >
                {savedNotice ? (
                  <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                ) : (
                  <Save className="w-3 h-3 text-[var(--flux-accent)] shrink-0" />
                )}
                <span>{savedNotice ? 'Сохранено' : 'Сохранить'}</span>
              </button>
              <button
                type="button"
                data-testid="tpl-ws-create-project-btn"
                onClick={handleLaunchProject}
                title="Создать новый проект САПР по этому шаблону"
                className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-2.5 rounded-[5px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(10.5px*var(--flux-ui-scale))] font-semibold whitespace-nowrap shrink-0 shadow-xs transition-colors"
              >
                <FilePlus2 className="w-3 h-3 shrink-0" />
                <span>Создать проект</span>
              </button>
            </div>

            {/* Top-Center Floating Glass Pill: Preview Sheet Tabs */}
            <div className="hidden lg:flex flex-1 min-w-0 justify-center">
              <div
                data-testid="tpl-ws-sheet-tabs"
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => {
                  if (Math.abs(e.deltaY) > 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
                className="pointer-events-auto inline-flex items-center gap-0.5 h-[calc(34px*var(--flux-ui-scale))] px-1.5 rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg max-w-full overflow-x-auto no-scrollbar"
              >
                {previewProject.sheets.map((sh, idx) => {
                  const active = sh.id === activeSheet?.id;
                  return (
                    <button
                      key={sh.id}
                      type="button"
                      data-testid={`tpl-ws-sheet-tab-${idx + 1}`}
                      onClick={() => setActivePreviewSheetIdx(idx)}
                      className={`h-[calc(24px*var(--flux-ui-scale))] px-2 rounded-[5px] inline-flex items-center gap-1 text-[length:calc(11px*var(--flux-ui-scale))] whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-[var(--flux-surface)] border border-[var(--flux-accent)]/45 text-[var(--flux-text)] font-semibold shadow-xs'
                          : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                      }`}
                    >
                      <span className="font-mono text-[var(--flux-accent)]">Л.{sh.number}</span>
                      <span className="truncate max-w-[104px]">{sh.name}</span>
                      <span className="font-mono text-[length:calc(9.5px*var(--flux-ui-scale))] opacity-70">
                        {sh.format}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  data-testid="tpl-ws-add-sheet-btn"
                  onClick={addSheet}
                  title="Добавить лист в шаблон"
                  aria-label="Добавить лист"
                  className="inline-flex items-center justify-center w-[calc(24px*var(--flux-ui-scale))] h-[calc(24px*var(--flux-ui-scale))] rounded-[5px] text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] shrink-0 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Top-Right Floating Glass Pill: Standalone Section Switcher & Close */}
            <div
              data-testid="tpl-ws-top-right"
              onMouseDown={(e) => e.stopPropagation()}
              className="pointer-events-auto inline-flex items-center gap-1 h-[calc(34px*var(--flux-ui-scale))] px-1.5 rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg shrink-0 max-w-[min(420px,44vw)] overflow-x-auto no-scrollbar"
            >
              <nav aria-label="Разделы программы" className="inline-flex items-center gap-0.5 shrink-0">
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
                      title={`${sec.title} — ${sec.subtitle}`}
                      className={`relative h-[calc(24px*var(--flux-ui-scale))] px-1.5 rounded-[5px] inline-flex items-center gap-1 text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors ${
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
                      <span className={`relative z-10 inline-flex items-center gap-1 ${active ? 'text-[var(--flux-accent)]' : ''}`}>
                        {SECTION_ICONS[sec.id]}
                        <span className="hidden sm:inline text-[var(--flux-text)]">
                          {SECTION_SHORT_LABELS[sec.id]}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>
              <span className="h-4 w-px bg-[var(--flux-line)] shrink-0" aria-hidden="true" />
              <button
                type="button"
                data-testid="tpl-ws-close-btn"
                onClick={onCloseToHub}
                title="Вернуться в Главное меню (Esc)"
                className="inline-flex items-center gap-1 h-[calc(24px*var(--flux-ui-scale))] px-2 rounded-[5px] border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap shrink-0 transition-colors"
              >
                <X className="w-3 h-3" strokeWidth={1.8} />
                <span>В меню</span>
              </button>
            </div>
          </div>

          {/* Left Floating Vertical Tool Rail (identical to SchematicCanvas & UGO Focus Dock) */}
          <div
            data-testid="tpl-ws-tool-dock"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className="no-print absolute top-[56px] left-3 z-20 p-[4px] rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl flex flex-col items-center gap-[2px] max-h-[calc(100vh-116px)] overflow-y-auto no-scrollbar"
          >
            <button
              type="button"
              data-testid="tpl-ws-library-toggle"
              aria-pressed={effectiveLibraryOpen}
              onClick={() => {
                setCanvasFocusClean(false);
                setLibraryOpen((o) => !o);
              }}
              title="Библиотека и профили шаблонов"
              aria-label="Переключить библиотеку шаблонов"
              className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                effectiveLibraryOpen
                  ? 'bg-[var(--flux-accent-solid)] text-white shadow-xs'
                  : 'text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <PanelLeft className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
            </button>
            <button
              type="button"
              data-testid="tpl-ws-clean-canvas-btn"
              aria-pressed={canvasFocusClean}
              onClick={() => setCanvasFocusClean((c) => !c)}
              title={canvasFocusClean ? 'Показать плавающие панели шаблона' : 'Чистый холст (скрыть панели)'}
              aria-label={canvasFocusClean ? 'Показать панели' : 'Чистый холст'}
              className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                canvasFocusClean
                  ? 'bg-[var(--flux-accent-solid)] text-white shadow-xs'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              {canvasFocusClean ? (
                <Minimize2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
              ) : (
                <Maximize2 className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
              )}
            </button>

            <span className="w-[calc(20px*var(--flux-ui-scale))] h-px bg-[var(--flux-line)] my-[2px] shrink-0" />

            <button
              type="button"
              onClick={addSheet}
              title="Добавить новый лист в шаблон"
              aria-label="Добавить лист"
              className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] transition-colors"
            >
              <Plus className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.7} />
            </button>
            <button
              type="button"
              data-testid="tpl-ws-toggle-frame-btn"
              aria-pressed={draft.showGostFrame}
              onClick={() => setDraft((prev) => ({ ...prev, showGostFrame: !prev.showGostFrame }))}
              title="Показать / скрыть рамку и штамп ГОСТ 2.104"
              aria-label="Переключить рамку ГОСТ"
              className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                draft.showGostFrame
                  ? 'bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] border border-[var(--flux-accent)]/35'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Frame className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
            </button>
            <button
              type="button"
              aria-pressed={draft.snapToGrid}
              onClick={() => setDraft((prev) => ({ ...prev, snapToGrid: !prev.snapToGrid }))}
              title="Привязка к сетке по умолчанию"
              aria-label="Переключить привязку к сетке"
              className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                draft.snapToGrid
                  ? 'bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] border border-[var(--flux-accent)]/35'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Magnet className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
            </button>
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }))
              }
              title={draft.theme === 'dark' ? 'Бумага шаблона: тёмная → светлая' : 'Бумага шаблона: светлая → тёмная'}
              aria-label="Переключить бумагу шаблона"
              className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] transition-colors"
            >
              {draft.theme === 'dark' ? (
                <Sun className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
              ) : (
                <Moon className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
              )}
            </button>

            <span className="w-[calc(20px*var(--flux-ui-scale))] h-px bg-[var(--flux-line)] my-[2px] shrink-0" />

            <button
              type="button"
              data-testid="tpl-ws-fit-btn"
              onClick={fitSheetToCanvas}
              title="Вписать лист по центру"
              aria-label="Вписать лист"
              className="inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 text-[var(--flux-text-muted)] hover:text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] transition-colors"
            >
              <Scan className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
            </button>
            <button
              type="button"
              data-testid="tpl-ws-inspector-toggle"
              aria-pressed={effectiveInspectorOpen}
              onClick={() => {
                setCanvasFocusClean(false);
                setInspectorOpen((o) => !o);
              }}
              title="Параметры шаблона, штамп и модули"
              aria-label="Переключить инспектор шаблона"
              className={`inline-flex items-center justify-center w-[calc(28px*var(--flux-ui-scale))] h-[calc(28px*var(--flux-ui-scale))] rounded-[6px] shrink-0 transition-colors ${
                effectiveInspectorOpen
                  ? 'bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] border border-[var(--flux-accent)]/35'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <SlidersHorizontal className="w-[calc(14px*var(--flux-ui-scale))] h-[calc(14px*var(--flux-ui-scale))]" strokeWidth={1.65} />
            </button>
          </div>

          {/* Floating Collapsible Glass Left Library Drawer */}
          <AnimatePresence>
            {effectiveLibraryOpen && (
              <motion.aside
                key="tpl-ws-library-drawer"
                data-testid="tpl-ws-library-drawer"
                aria-label="Библиотека шаблонов проектов"
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="no-print absolute top-[56px] bottom-[56px] left-[56px] w-[min(264px,calc(100vw-72px))] z-20 rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-2xl flex flex-col min-h-0 overflow-hidden"
              >
                <div className="shrink-0 px-2.5 py-2 border-b border-[var(--flux-line)] flex items-center justify-between gap-2">
                  <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                    Библиотека шаблонов
                  </span>
                  <button
                    type="button"
                    onClick={() => setLibraryOpen(false)}
                    aria-label="Свернуть библиотеку"
                    className="p-1 rounded hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-2 border-b border-[var(--flux-line)]">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--flux-text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Поиск шаблона…"
                      aria-label="Поиск шаблона"
                      className="w-full h-7 pl-8 pr-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-accent)]"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-3.5">
                  <div>
                    <div className="flex items-center justify-between px-1 mb-1">
                      <span className="text-[length:calc(10px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.05em] text-[var(--flux-text-muted)]">
                        Мои шаблоны
                      </span>
                      <span className="font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                        {filteredCustom.length}
                      </span>
                    </div>
                    {filteredCustom.length === 0 ? (
                      <div className="px-2.5 py-2.5 rounded-[7px] border border-dashed border-[var(--flux-line)] text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] leading-snug">
                        Нет сохранённых профилей. Нажмите «Сохранить» сверху слева.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredCustom.map((tpl) => {
                          const active = selectedId === tpl.id;
                          return (
                            <div
                              key={tpl.id}
                              className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-[7px] border transition-colors ${
                                active
                                  ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/55'
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
                    <div className="px-1 mb-1 text-[length:calc(10px*var(--flux-ui-scale))] font-semibold uppercase tracking-[0.05em] text-[var(--flux-text-muted)]">
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
                            className={`w-full px-2 py-1.5 rounded-[7px] border text-left transition-colors ${
                              active
                                ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)]/55'
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
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Floating Collapsible Glass Right Inspector OR Compact Collapsed Pill */}
          {!effectiveInspectorOpen && (
            <button
              type="button"
              data-testid="tpl-ws-inspector-collapsed-pill"
              onClick={() => {
                setCanvasFocusClean(false);
                setInspectorOpen(true);
              }}
              className="no-print absolute top-[56px] right-3 z-20 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-[8px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-lg text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)] hover:border-[var(--flux-accent)]/50 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
              <span>Инспектор</span>
            </button>
          )}

          <AnimatePresence>
            {effectiveInspectorOpen && (
              <motion.aside
                key="tpl-ws-inspector-drawer"
                data-testid="tpl-ws-inspector-drawer"
                aria-label="Инспектор параметров шаблона"
                onMouseDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="no-print absolute top-[56px] bottom-[56px] right-3 w-[min(332px,calc(100vw-24px))] z-20 rounded-[10px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-2xl flex flex-col min-h-0 overflow-hidden"
              >
                <div className="shrink-0 p-1.5 border-b border-[var(--flux-line)] flex items-center gap-1">
                  <div className="flex-1 min-w-0 flex items-center gap-0.5">
                    {INSPECTOR_TABS.map((t) => {
                      const active = inspectorTab === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          data-testid={`tpl-ws-tab-${t.id}`}
                          onClick={() => setInspectorTab(t.id)}
                          className={`relative flex-1 h-7 px-1 rounded-[5px] inline-flex items-center justify-center gap-1 text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium whitespace-nowrap transition-colors ${
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
                  <button
                    type="button"
                    onClick={() => setInspectorOpen(false)}
                    aria-label="Свернуть инспектор"
                    title="Свернуть инспектор"
                    className="p-1 rounded hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] shrink-0"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3 text-[length:calc(11.5px*var(--flux-ui-scale))]">
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
                          className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 text-[var(--flux-text)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1">
                          Категория
                        </label>
                        <select
                          value={draft.category}
                          onChange={(e) => setDraft({ ...draft, category: e.target.value as CustomTemplateCategory })}
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 text-[var(--flux-text)]"
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
                          className="w-full p-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 text-[var(--flux-text)] resize-none"
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
                            className="w-full h-8 px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 font-mono"
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
                            className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                            Формат
                          </label>
                          <select
                            value={draft.defaultFormat}
                            onChange={(e) => setDraft({ ...draft, defaultFormat: e.target.value as SheetFormat })}
                            className="w-full h-8 px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 font-mono"
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
                                className="flex-1 min-w-0 h-7 px-2 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80"
                              />
                              <select
                                value={sh.format}
                                onChange={(e) => updateSheet(sh.id, { format: e.target.value as SheetFormat })}
                                className="w-16 h-7 px-1 rounded-[5px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 font-mono"
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
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80"
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
                            className="w-full h-8 px-1.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 font-mono"
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
                            className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 font-mono tabular-nums"
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
                            className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 font-mono tabular-nums"
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
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80"
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
                          className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80"
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
                          className="w-full h-8 px-2.5 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80"
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
                            className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80"
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
                            className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80 font-mono"
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
                            className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80"
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
                            className="w-full h-8 px-2 rounded-[6px] border border-[var(--flux-line)] bg-[var(--flux-surface)]/80"
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
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Bottom-Center Floating Template Health & Active Profile Pill */}
          <div
            data-testid="tpl-ws-status-pill"
            onMouseDown={(e) => e.stopPropagation()}
            className="no-print absolute bottom-3 left-3 sm:left-1/2 sm:-translate-x-1/2 z-20 inline-flex items-center gap-2 h-[calc(36px*var(--flux-ui-scale))] px-3 rounded-[9px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] max-w-[calc(100vw-170px)] sm:max-w-[520px] min-w-0"
          >
            <CheckCircle2
              className={`w-3.5 h-3.5 shrink-0 ${previewHealth.clean ? 'text-[var(--flux-accent)]' : 'text-rose-500'}`}
            />
            <span className="truncate font-medium text-[var(--flux-text)]">
              {statusMessage || draft.title}
            </span>
            <span className="hidden md:inline-block h-3.5 w-px bg-[var(--flux-line)] shrink-0" />
            <span className="hidden md:inline-block font-mono tabular-nums text-[length:calc(10px*var(--flux-ui-scale))] whitespace-nowrap shrink-0">
              {previewHealth.clean ? 'ERC чисто' : `ERC: ${previewHealth.errors} ош.`} · {previewProject.devices.length} изд. · {previewProject.wires.length} цеп.
            </span>
          </div>

          {/* Bottom-Right Floating Zoom & Format HUD */}
          <div
            data-testid="tpl-ws-zoom-hud"
            onMouseDown={(e) => e.stopPropagation()}
            className="no-print absolute bottom-3 right-3 z-20 inline-flex items-center gap-1 h-[calc(36px*var(--flux-ui-scale))] px-2 rounded-[9px] border border-[var(--flux-line-strong)] flux-glass-surface shadow-xl font-mono text-[length:calc(10.5px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]"
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
