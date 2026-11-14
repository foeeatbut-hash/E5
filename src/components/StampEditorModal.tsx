import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  CopyCheck,
  FileText,
  Layers,
  LayoutTemplate,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { StudioWindow } from './StudioWindow';
import type {
  E3Project,
  E3Sheet,
  E3TitleBlock,
  GostStampCellDef,
  GostStampForm,
  GostStampTemplate,
} from '../core/e3Types';
import {
  buildGostSheetGeometry,
  fitStampCellText,
  mergeStampTemplates,
  STAMP_FIELD_OPTIONS,
  type StampFieldKey,
} from '../core/gostFrame';

export type StampModalMode = 'values' | 'designer';

function parseFiniteClamped(raw: string, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

interface StampEditorModalProps {
  open: boolean;
  project: E3Project;
  customTemplates: GostStampTemplate[];
  initialSheetId: string;
  initialMode?: StampModalMode;
  focusedField?: StampFieldKey | null;
  onClose: () => void;
  onApplyStamp: (
    sheetId: string,
    patch: Partial<E3TitleBlock>,
    applyToAll: boolean,
    includeSheetTitleOnAll: boolean,
    applyFormToAll?: boolean
  ) => void;
  onSaveCustomTemplate: (template: GostStampTemplate) => void;
  onDeleteCustomTemplate: (templateId: string) => void;
}

function createBlankTemplate(index: number): GostStampTemplate {
  return {
    id: `custom-stamp-${Date.now().toString(36)}`,
    name: `Пользовательский штамп №${index}`,
    description: 'Собственный шаблон основной надписи ГОСТ / предприятия',
    width: 540,
    height: 112,
    showArchivalStrip: true,
    isPreset: false,
    cells: [
      {
        id: 'cell-1',
        xPct: 0,
        yPct: 0,
        wPct: 30,
        hPct: 50,
        label: 'Разработал',
        fieldKey: 'designer',
        align: 'left',
        fontSize: 8.5,
      },
      {
        id: 'cell-2',
        xPct: 0,
        yPct: 50,
        wPct: 30,
        hPct: 50,
        label: 'Проверил',
        fieldKey: 'checker',
        align: 'left',
        fontSize: 8.5,
      },
      {
        id: 'cell-3',
        xPct: 30,
        yPct: 0,
        wPct: 48,
        hPct: 45,
        label: 'Обозначение документа',
        fieldKey: 'documentCode',
        align: 'center',
        fontSize: 12,
        bold: true,
      },
      {
        id: 'cell-4',
        xPct: 30,
        yPct: 45,
        wPct: 48,
        hPct: 55,
        label: 'Наименование проекта',
        fieldKey: 'projectTitle',
        align: 'center',
        fontSize: 9.5,
        bold: true,
      },
      {
        id: 'cell-5',
        xPct: 78,
        yPct: 0,
        wPct: 22,
        hPct: 35,
        staticText: '{SHEET_INFO}',
        align: 'center',
        fontSize: 8.5,
      },
      {
        id: 'cell-6',
        xPct: 78,
        yPct: 35,
        wPct: 22,
        hPct: 65,
        label: 'Организация',
        fieldKey: 'organization',
        align: 'center',
        fontSize: 9,
        bold: true,
      },
    ],
  };
}

export const StampEditorModal: React.FC<StampEditorModalProps> = ({
  open,
  project,
  customTemplates,
  initialSheetId,
  initialMode = 'values',
  focusedField,
  onClose,
  onApplyStamp,
  onSaveCustomTemplate,
  onDeleteCustomTemplate,
}) => {
  const allTemplates = useMemo(
    () => mergeStampTemplates(project, customTemplates),
    [project, customTemplates]
  );

  const [mode, setMode] = useState<StampModalMode>(initialMode);
  const [selectedSheetId, setSelectedSheetId] = useState(initialSheetId);
  const [draft, setDraft] = useState<E3TitleBlock>({
    stampForm: 'form1',
    customTemplateId: undefined,
    documentCode: '',
    projectTitle: '',
    organization: '',
    designer: '',
    checker: '',
    techControl: '',
    normControl: '',
    approver: '',
    litera: 'Р',
    mass: '—',
    scale: 'б/м',
    date: '',
    invOriginal: '',
    invDuplicate: '',
    sheetTitle: '',
  });
  const [applySheetTitleToAll, setApplySheetTitleToAll] = useState(false);

  // Designer state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(allTemplates[0]?.id || 'preset-kip-3col');
  const [designerDraft, setDesignerDraft] = useState<GostStampTemplate>(() =>
    structuredClone(allTemplates[0] || createBlankTemplate(1))
  );
  const [selectedCellId, setSelectedCellId] = useState<string>(
    allTemplates[0]?.cells[0]?.id || ''
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const fieldRefs = useRef<Partial<Record<StampFieldKey, HTMLInputElement | null>>>({});

  const syncDraftFromSheet = (sheet: E3Sheet) => {
    setDraft({
      stampForm: sheet.titleBlock.stampForm || (sheet.number > 1 ? 'form2a' : 'form1'),
      customTemplateId: sheet.titleBlock.customTemplateId,
      documentCode: sheet.titleBlock.documentCode || '',
      projectTitle: sheet.titleBlock.projectTitle ?? project.name,
      organization: sheet.titleBlock.organization || '',
      designer: sheet.titleBlock.designer || '',
      checker: sheet.titleBlock.checker || '',
      techControl: sheet.titleBlock.techControl || '',
      normControl: sheet.titleBlock.normControl || '',
      approver: sheet.titleBlock.approver || '',
      litera: sheet.titleBlock.litera || 'Р',
      mass: sheet.titleBlock.mass || '—',
      scale: sheet.titleBlock.scale || 'б/м',
      date: sheet.titleBlock.date || '',
      invOriginal: sheet.titleBlock.invOriginal || '',
      invDuplicate: sheet.titleBlock.invDuplicate || '',
      sheetTitle: sheet.titleBlock.sheetTitle || '',
    });
  };

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    const sheet: E3Sheet =
      project.sheets.find((s) => s.id === initialSheetId) || project.sheets[0];
    if (sheet) {
      setSelectedSheetId(sheet.id);
      syncDraftFromSheet(sheet);
      if (sheet.titleBlock.stampForm === 'custom' && sheet.titleBlock.customTemplateId) {
        const match = allTemplates.find((t) => t.id === sheet.titleBlock.customTemplateId);
        if (match) {
          setSelectedTemplateId(match.id);
          setDesignerDraft(structuredClone(match));
          setSelectedCellId(match.cells[0]?.id || '');
        }
      }
    }
    setApplySheetTitleToAll(false);
    setSavedNotice(null);

    if (focusedField) {
      setMode('values');
      window.setTimeout(() => {
        const el = fieldRefs.current[focusedField];
        if (el) {
          el.focus();
          el.select();
        }
      }, 60);
    }
  }, [open, initialSheetId, initialMode, focusedField]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const activeSheet = useMemo(
    () => project.sheets.find((s) => s.id === selectedSheetId) || project.sheets[0],
    [project.sheets, selectedSheetId]
  );

  // Live SVG geometry for values preview
  const previewValuesGeom = useMemo(() => {
    if (!activeSheet) return null;
    const syntheticSheet: E3Sheet = {
      ...activeSheet,
      titleBlock: draft,
    };
    const overrideTpl =
      draft.stampForm === 'custom'
        ? allTemplates.find((t) => t.id === draft.customTemplateId) || allTemplates[0]
        : undefined;
    return buildGostSheetGeometry(syntheticSheet, { ...project, customStampTemplates: allTemplates }, overrideTpl);
  }, [activeSheet, draft, project, allTemplates]);

  // Live SVG geometry for designer preview
  const previewDesignerGeom = useMemo(() => {
    if (!activeSheet) return null;
    const syntheticSheet: E3Sheet = {
      ...activeSheet,
      titleBlock: {
        ...draft,
        stampForm: 'custom',
        customTemplateId: designerDraft.id,
      },
    };
    return buildGostSheetGeometry(syntheticSheet, project, designerDraft);
  }, [activeSheet, draft, project, designerDraft]);

  const handleSwitchSheet = (nextId: string) => {
    setSelectedSheetId(nextId);
    const sh = project.sheets.find((s) => s.id === nextId);
    if (sh) syncDraftFromSheet(sh);
  };

  const handleSelectFormOption = (rawVal: string) => {
    if (rawVal === 'form1' || rawVal === 'form2a') {
      setDraft((prev) => ({
        ...prev,
        stampForm: rawVal as GostStampForm,
        customTemplateId: undefined,
      }));
    } else if (rawVal.startsWith('custom:')) {
      const tplId = rawVal.slice(7);
      setDraft((prev) => ({
        ...prev,
        stampForm: 'custom',
        customTemplateId: tplId,
      }));
    }
  };

  const formSelectValue =
    draft.stampForm === 'custom'
      ? `custom:${draft.customTemplateId || allTemplates[0]?.id || ''}`
      : draft.stampForm || 'form1';

  const setField = (key: StampFieldKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const focusInputField = (key?: StampFieldKey) => {
    if (!key) return;
    const el = fieldRefs.current[key];
    if (el) {
      el.focus();
      el.select();
    }
  };

  // Designer handlers
  const handleSelectDesignerTemplate = (tpl: GostStampTemplate) => {
    setSelectedTemplateId(tpl.id);
    setDesignerDraft(structuredClone(tpl));
    setSelectedCellId(tpl.cells[0]?.id || '');
    setSavedNotice(null);
  };

  const handleCreateNewTemplate = () => {
    const nextIdx = allTemplates.filter((t) => !t.isPreset).length + 1;
    const tpl = createBlankTemplate(nextIdx);
    setSelectedTemplateId(tpl.id);
    setDesignerDraft(tpl);
    setSelectedCellId(tpl.cells[0]?.id || '');
    setSavedNotice('Создан черновик нового штампа — настройте ячейки и сохраните');
  };

  const handleDuplicateTemplate = () => {
    const clone: GostStampTemplate = {
      ...structuredClone(designerDraft),
      id: `custom-stamp-${Date.now().toString(36)}`,
      name: `${designerDraft.name} (копия)`,
      isPreset: false,
    };
    setSelectedTemplateId(clone.id);
    setDesignerDraft(clone);
    setSelectedCellId(clone.cells[0]?.id || '');
    setSavedNotice('Создана копия шаблона — при сохранении появится в списке');
  };

  const handleAddCell = () => {
    const newCell: GostStampCellDef = {
      id: `cell-${Date.now().toString(36)}`,
      xPct: 0,
      yPct: 0,
      wPct: 25,
      hPct: 25,
      label: 'Новое поле',
      staticText: 'Графа',
      align: 'center',
      fontSize: 8.5,
    };
    setDesignerDraft((prev) => ({
      ...prev,
      cells: [...prev.cells, newCell],
    }));
    setSelectedCellId(newCell.id);
  };

  const selectedCell = useMemo(
    () => designerDraft.cells.find((c) => c.id === selectedCellId) || null,
    [designerDraft.cells, selectedCellId]
  );

  const updateSelectedCell = (patch: Partial<GostStampCellDef>) => {
    if (!selectedCellId) return;
    setDesignerDraft((prev) => ({
      ...prev,
      cells: prev.cells.map((c) => (c.id === selectedCellId ? { ...c, ...patch } : c)),
    }));
  };

  const handleDeleteSelectedCell = () => {
    if (!selectedCellId || designerDraft.cells.length <= 1) return;
    const remaining = designerDraft.cells.filter((c) => c.id !== selectedCellId);
    setDesignerDraft((prev) => ({ ...prev, cells: remaining }));
    setSelectedCellId(remaining[0]?.id || '');
  };

  const handleSaveTemplateOnly = (): GostStampTemplate => {
    const toSave: GostStampTemplate = {
      ...structuredClone(designerDraft),
      id: designerDraft.isPreset
        ? `custom-stamp-${Date.now().toString(36)}`
        : designerDraft.id,
      name: designerDraft.name.trim() || 'Пользовательский штамп',
      isPreset: false,
    };
    onSaveCustomTemplate(toSave);
    setSelectedTemplateId(toSave.id);
    setDesignerDraft(structuredClone(toSave));
    setSavedNotice(`Шаблон «${toSave.name}» сохранён`);
    return toSave;
  };

  const handleSaveAndApplyTemplate = (applyToAll: boolean) => {
    const saved = handleSaveTemplateOnly();
    onApplyStamp(
      selectedSheetId,
      {
        ...draft,
        stampForm: 'custom',
        customTemplateId: saved.id,
      },
      applyToAll,
      applySheetTitleToAll,
      true
    );
    onClose();
  };

  const renderInput = (
    key: StampFieldKey,
    label: string,
    opts?: { mono?: boolean; placeholder?: string; span2?: boolean }
  ) => {
    const isFocusedTarget = focusedField === key;
    return (
      <div className={opts?.span2 ? 'sm:col-span-2' : ''}>
        <label
          htmlFor={`stamp-${key}`}
          className={`block text-[length:calc(11px*var(--flux-ui-scale))] font-medium mb-1 ${
            isFocusedTarget ? 'text-[var(--flux-accent)] font-semibold' : 'text-[var(--flux-text-muted)]'
          }`}
        >
          {label}
        </label>
        <input
          ref={(el) => {
            fieldRefs.current[key] = el;
          }}
          id={`stamp-${key}`}
          data-testid={`stamp-input-${key}`}
          type="text"
          spellCheck={opts?.mono ? false : undefined}
          value={String(draft[key] ?? '')}
          placeholder={opts?.placeholder}
          onChange={(e) => setField(key, e.target.value)}
          className={`w-full h-8 px-2.5 rounded border bg-[var(--flux-surface)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)] ${
            opts?.mono ? 'font-mono' : ''
          } ${
            isFocusedTarget
              ? 'border-[var(--flux-accent)] ring-1 ring-[var(--flux-accent)]/30'
              : 'border-[var(--flux-line)]'
          }`}
        />
      </div>
    );
  };

  return (
    <StudioWindow
      open={open}
      onClose={onClose}
      variant="floating"
      maxWidthClass={mode === 'designer' ? 'max-w-[min(94vw,1120px)]' : 'max-w-[min(92vw,980px)]'}
      heightClass="max-h-[86vh]"
      title="Основная надпись и конструктор штампов"
      titleId="stamp-modal-title"
      icon={<FileText className="w-4 h-4 text-[var(--flux-accent)]" />}
      testId="stamp-editor-modal"
      closeAriaLabel="Закрыть редактор штампа"
      headerExtra={
        <div
          role="tablist"
          aria-label="Режим работы со штампами"
          className="inline-flex divide-x divide-[var(--flux-line)] rounded-lg border border-[var(--flux-line)] overflow-hidden bg-[var(--flux-bg)]/80"
        >
          <button
            type="button"
            role="tab"
            data-testid="stamp-tab-values"
            aria-selected={mode === 'values'}
            onClick={() => setMode('values')}
            className={`inline-flex items-center gap-1.5 h-6 px-2.5 text-[length:calc(11px*var(--flux-ui-scale))] font-medium transition-colors whitespace-nowrap ${
              mode === 'values'
                ? 'bg-[var(--flux-surface)] text-[var(--flux-text)] font-semibold'
                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>Заполнение граф</span>
          </button>
          <button
            type="button"
            role="tab"
            data-testid="stamp-tab-designer"
            aria-selected={mode === 'designer'}
            onClick={() => setMode('designer')}
            className={`inline-flex items-center gap-1.5 h-6 px-2.5 text-[length:calc(11px*var(--flux-ui-scale))] font-medium transition-colors whitespace-nowrap ${
              mode === 'designer'
                ? 'bg-[var(--flux-surface)] text-[var(--flux-text)] font-semibold'
                : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
            }`}
          >
            <LayoutTemplate className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
            <span>Создать / настроить штамп</span>
          </button>
        </div>
      }
    >

            {mode === 'values' ? (
              <>
                <div className="p-4 overflow-y-auto space-y-4">
                  {/* Sheet selector & GOST stamp form */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--flux-line)]">
                    <div>
                      <label
                        htmlFor="stamp-sheet-select"
                        className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1"
                      >
                        Редактируемый лист
                      </label>
                      <select
                        id="stamp-sheet-select"
                        value={selectedSheetId}
                        onChange={(e) => handleSwitchSheet(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                      >
                        {project.sheets.map((s) => (
                          <option key={s.id} value={s.id}>
                            Лист {s.number}: {s.name} ({s.format})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="stamp-form-select"
                        className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1"
                      >
                        Форма основной надписи или шаблон
                      </label>
                      <select
                        id="stamp-form-select"
                        data-testid="stamp-form-select"
                        value={formSelectValue}
                        onChange={(e) => handleSelectFormOption(e.target.value)}
                        className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                      >
                        <optgroup label="Стандартные формы ГОСТ 2.104-2006">
                          <option value="form1">Форма 1 (полный штамп, 1-й лист, 55×185 мм)</option>
                          <option value="form2a">Форма 2а (последующие листы, 15×185 мм)</option>
                        </optgroup>
                        <optgroup label="Шаблоны конструктора штампов">
                          {allTemplates.map((tpl) => (
                            <option key={tpl.id} value={`custom:${tpl.id}`}>
                              {tpl.name} ({tpl.cells.length} яч.)
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  {/* Interactive 1:1 Stamp Preview */}
                  {previewValuesGeom && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)]">
                        <span>Предпросмотр штампа (клик по ячейке выбирает поле ввода)</span>
                        <span className="font-mono tabular-nums">
                          {previewValuesGeom.stamp.width}×{previewValuesGeom.stamp.height} ед.
                        </span>
                      </div>
                      <div className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] flex justify-center overflow-x-auto">
                        <svg
                          viewBox={`${previewValuesGeom.stamp.x - 4} ${previewValuesGeom.stamp.y - 4} ${
                            previewValuesGeom.stamp.width + 8
                          } ${previewValuesGeom.stamp.height + 8}`}
                          className="w-full max-w-[600px] h-auto max-h-[156px]"
                        >
                          <rect
                            x={previewValuesGeom.stamp.x}
                            y={previewValuesGeom.stamp.y}
                            width={previewValuesGeom.stamp.width}
                            height={previewValuesGeom.stamp.height}
                            fill="var(--flux-surface)"
                            stroke="var(--flux-text)"
                            strokeWidth={1.6}
                          />
                          {previewValuesGeom.stamp.lines.map((ln, idx) => (
                            <line
                              key={idx}
                              x1={ln.x1}
                              y1={ln.y1}
                              x2={ln.x2}
                              y2={ln.y2}
                              stroke="var(--flux-text)"
                              strokeWidth={ln.thick ? 1.4 : 0.75}
                            />
                          ))}
                          {previewValuesGeom.stamp.cells.map((cell) => {
                            const tx = cell.align === 'center' ? cell.x + cell.width / 2 : cell.x + 4;
                            const fitted = fitStampCellText(
                              cell.text,
                              cell.width,
                              cell.height,
                              cell.fontSize || 8.5,
                              cell.bold
                            );
                            const fitFs = fitted.fontSize;
                            const totalBlockH =
                              fitted.lines.length > 1
                                ? (fitted.lines.length - 1) * fitted.lineHeight
                                : 0;
                            const firstLineY =
                              cell.y + cell.height / 2 - totalBlockH / 2 + fitFs * 0.34;
                            const clipId = `stamp-val-clip-${cell.id}`;
                            return (
                              <g
                                key={cell.id}
                                onClick={() => focusInputField(cell.fieldKey)}
                                className={cell.editable ? 'cursor-pointer' : undefined}
                              >
                                <defs>
                                  <clipPath id={clipId}>
                                    <rect
                                      x={cell.x + 1}
                                      y={cell.y + 1}
                                      width={Math.max(1, cell.width - 2)}
                                      height={Math.max(1, cell.height - 2)}
                                    />
                                  </clipPath>
                                </defs>
                                {cell.editable && (
                                  <rect
                                    x={cell.x + 0.5}
                                    y={cell.y + 0.5}
                                    width={Math.max(1, cell.width - 1)}
                                    height={Math.max(1, cell.height - 1)}
                                    fill="var(--flux-accent)"
                                    fillOpacity={0}
                                    className="hover:fill-opacity-12 transition-opacity"
                                  />
                                )}
                                <text
                                  x={tx}
                                  y={firstLineY}
                                  textAnchor={cell.align === 'center' ? 'middle' : 'start'}
                                  fill={cell.editable ? 'var(--flux-text)' : 'var(--flux-text-muted)'}
                                  fontSize={fitFs}
                                  fontWeight={cell.bold ? 600 : 400}
                                  clipPath={`url(#${clipId})`}
                                >
                                  {fitted.lines.map((lnText, li) => (
                                    <tspan key={li} x={tx} dy={li === 0 ? 0 : fitted.lineHeight}>
                                      {lnText}
                                    </tspan>
                                  ))}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* Primary Document Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {renderInput('documentCode', 'Обозначение документа (Графа 2)', { mono: true })}
                    {renderInput('organization', 'Организация / Предприятие (Графа 9)')}
                    {renderInput('projectTitle', 'Наименование изделия / проекта (Графа 1)', { span2: true })}
                    {renderInput('sheetTitle', 'Наименование схемы / данного листа', { span2: true })}
                  </div>

                  {/* Signatures & Approval */}
                  <div className="pt-3 border-t border-[var(--flux-line)]">
                    <h3 className="text-[length:calc(11px*var(--flux-ui-scale))] font-semibold uppercase tracking-wider text-[var(--flux-text-muted)] mb-2">
                      Подписи и ответственные (Графы 10–13)
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {renderInput('designer', 'Разработал')}
                      {renderInput('checker', 'Проверил')}
                      {renderInput('techControl', 'Т. контроль')}
                      {renderInput('normControl', 'Н. контроль')}
                      {renderInput('approver', 'Утвердил')}
                      {renderInput('date', 'Дата', { mono: true, placeholder: '11.2026' })}
                    </div>
                  </div>

                  {/* Litera / Mass / Scale / Archive */}
                  <div className="pt-3 border-t border-[var(--flux-line)] grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    {renderInput('litera', 'Литера', { mono: true })}
                    {renderInput('mass', 'Масса', { mono: true })}
                    {renderInput('scale', 'Масштаб', { mono: true })}
                    {renderInput('invOriginal', 'Инв. № подл.', { mono: true })}
                    {renderInput('invDuplicate', 'Инв. № дубл.', { mono: true })}
                  </div>

                  <label className="flex items-center gap-2 text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)] pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applySheetTitleToAll}
                      onChange={(e) => setApplySheetTitleToAll(e.target.checked)}
                      className="rounded border-[var(--flux-line)]"
                    />
                    <span>При применении ко всем листам также перезаписать поле «Наименование листа»</span>
                  </label>
                </div>

                <div className="px-4 py-3 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 px-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                  >
                    Отмена
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="stamp-apply-single-btn"
                      onClick={() => {
                        onApplyStamp(selectedSheetId, draft, false, false, false);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[length:calc(12px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
                    >
                      <Check className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                      <span>Только этот лист</span>
                    </button>
                    <button
                      type="button"
                      data-testid="stamp-apply-all-btn"
                      onClick={() => {
                        onApplyStamp(
                          selectedSheetId,
                          draft,
                          true,
                          applySheetTitleToAll,
                          draft.stampForm === 'custom'
                        );
                        onClose();
                      }}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(12px*var(--flux-ui-scale))] font-medium"
                    >
                      <CopyCheck className="w-3.5 h-3.5" />
                      <span>Применить ко всем листам ({project.sheets.length})</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              /* MODE 2: Stamp Template Creator & Designer */
              <>
                <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
                  {/* Left Sidebar: Templates Catalog */}
                  <div className="md:col-span-3 border-b md:border-b-0 md:border-r border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-col min-h-0">
                    <div className="p-2.5 border-b border-[var(--flux-line)] flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid="stamp-new-template-btn"
                        onClick={handleCreateNewTemplate}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-7 px-2 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(11px*var(--flux-ui-scale))] font-medium"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Новый штамп</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDuplicateTemplate}
                        title="Создать копию выбранного шаблона"
                        aria-label="Дублировать шаблон"
                        className="inline-flex items-center justify-center w-7 h-7 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)]"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {!designerDraft.isPreset && (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteCustomTemplate(designerDraft.id);
                            const fallback = allTemplates.find((t) => t.id !== designerDraft.id) || allTemplates[0];
                            if (fallback) handleSelectDesignerTemplate(fallback);
                          }}
                          title="Удалить пользовательский шаблон"
                          aria-label="Удалить шаблон"
                          className="inline-flex items-center justify-center w-7 h-7 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-rose-600 dark:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-[var(--flux-line)]">
                      {allTemplates.map((tpl) => {
                        const active = tpl.id === selectedTemplateId;
                        return (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => handleSelectDesignerTemplate(tpl)}
                            className={`w-full px-3 py-2 text-left transition-colors ${
                              active
                                ? 'bg-[var(--flux-sel)] text-[var(--flux-text)]'
                                : 'hover:bg-[var(--flux-hover)] text-[var(--flux-text)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[length:calc(12px*var(--flux-ui-scale))] font-medium truncate">{tpl.name}</span>
                              <span className="text-[length:calc(10px*var(--flux-ui-scale))] font-mono text-[var(--flux-text-muted)] shrink-0">
                                {tpl.isPreset ? 'ГОСТ/тип' : 'Свой'}
                              </span>
                            </div>
                            <div className="text-[length:calc(10px*var(--flux-ui-scale))] font-mono tabular-nums text-[var(--flux-text-muted)] mt-0.5">
                              {tpl.width}×{tpl.height} · {tpl.cells.length} ячеек
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Center/Right: Template Editor + Interactive SVG Preview + Cell Properties */}
                  <div className="md:col-span-9 flex flex-col min-h-0 overflow-y-auto p-4 space-y-4">
                    {/* Template Metadata */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-3 border-b border-[var(--flux-line)] items-end">
                      <div className="sm:col-span-5">
                        <label
                          htmlFor="tpl-name"
                          className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1"
                        >
                          Название шаблона штампа
                        </label>
                        <input
                          id="tpl-name"
                          data-testid="stamp-designer-name-input"
                          type="text"
                          value={designerDraft.name}
                          onChange={(e) =>
                            setDesignerDraft((prev) => ({ ...prev, name: e.target.value }))
                          }
                          className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="tpl-width"
                          className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1"
                        >
                          Ширина (ед.)
                        </label>
                        <input
                          id="tpl-width"
                          type="number"
                          min={200}
                          max={640}
                          step={10}
                          value={designerDraft.width}
                          onChange={(e) =>
                            setDesignerDraft((prev) => ({
                              ...prev,
                              width: parseFiniteClamped(e.target.value, prev.width, 200, 640),
                            }))
                          }
                          className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label
                          htmlFor="tpl-height"
                          className="block text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)] mb-1"
                        >
                          Высота (ед.)
                        </label>
                        <input
                          id="tpl-height"
                          type="number"
                          min={40}
                          max={240}
                          step={4}
                          value={designerDraft.height}
                          onChange={(e) =>
                            setDesignerDraft((prev) => ({
                              ...prev,
                              height: parseFiniteClamped(e.target.value, prev.height, 40, 240),
                            }))
                          }
                          className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                        />
                      </div>
                      <div className="sm:col-span-3 flex items-center h-8">
                        <label className="inline-flex items-center gap-2 text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={designerDraft.showArchivalStrip}
                            onChange={(e) =>
                              setDesignerDraft((prev) => ({
                                ...prev,
                                showArchivalStrip: e.target.checked,
                              }))
                            }
                            className="rounded border-[var(--flux-line)]"
                          />
                          <span>Архивная полоса ГОСТ</span>
                        </label>
                      </div>
                    </div>

                    {/* Interactive Preview Canvas */}
                    {previewDesignerGeom && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text-muted)]">
                            Интерактивный макет (кликните по ячейке для настройки координат и привязки)
                          </span>
                          <button
                            type="button"
                            data-testid="stamp-add-cell-btn"
                            onClick={handleAddCell}
                            className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[length:calc(11px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
                          >
                            <Plus className="w-3 h-3 text-[var(--flux-accent)]" />
                            <span>Добавить ячейку</span>
                          </button>
                        </div>
                        <div className="p-3 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] flex justify-center overflow-x-auto">
                          <svg
                            viewBox={`${previewDesignerGeom.stamp.x - 4} ${
                              previewDesignerGeom.stamp.y - 4
                            } ${previewDesignerGeom.stamp.width + 8} ${
                              previewDesignerGeom.stamp.height + 8
                            }`}
                            className="w-full max-w-[680px] h-auto max-h-[200px]"
                          >
                            <rect
                              x={previewDesignerGeom.stamp.x}
                              y={previewDesignerGeom.stamp.y}
                              width={previewDesignerGeom.stamp.width}
                              height={previewDesignerGeom.stamp.height}
                              fill="var(--flux-surface)"
                              stroke="var(--flux-text)"
                              strokeWidth={1.6}
                            />
                            {previewDesignerGeom.stamp.lines.map((ln, idx) => (
                              <line
                                key={idx}
                                x1={ln.x1}
                                y1={ln.y1}
                                x2={ln.x2}
                                y2={ln.y2}
                                stroke="var(--flux-text)"
                                strokeWidth={ln.thick ? 1.4 : 0.75}
                              />
                            ))}
                            {previewDesignerGeom.stamp.cells.map((cell) => {
                              const isSel = cell.id === selectedCellId;
                              const tx =
                                cell.align === 'center' ? cell.x + cell.width / 2 : cell.x + 4;
                              const displayText = cell.text || cell.label || '…';
                              const fitted = fitStampCellText(
                                displayText,
                                cell.width,
                                cell.height,
                                cell.fontSize || 8.5,
                                cell.bold
                              );
                              const fitFs = fitted.fontSize;
                              const totalBlockH =
                                fitted.lines.length > 1
                                  ? (fitted.lines.length - 1) * fitted.lineHeight
                                  : 0;
                              const firstLineY =
                                cell.y + cell.height / 2 - totalBlockH / 2 + fitFs * 0.34;
                              const clipId = `stamp-des-clip-${cell.id}`;
                              return (
                                <g
                                  key={cell.id}
                                  onClick={() => setSelectedCellId(cell.id)}
                                  className="cursor-pointer"
                                >
                                  <defs>
                                    <clipPath id={clipId}>
                                      <rect
                                        x={cell.x + 1}
                                        y={cell.y + 1}
                                        width={Math.max(1, cell.width - 2)}
                                        height={Math.max(1, cell.height - 2)}
                                      />
                                    </clipPath>
                                  </defs>
                                  <rect
                                    x={cell.x + 0.5}
                                    y={cell.y + 0.5}
                                    width={Math.max(1, cell.width - 1)}
                                    height={Math.max(1, cell.height - 1)}
                                    fill="var(--flux-accent)"
                                    fillOpacity={isSel ? 0.14 : 0}
                                    stroke={isSel ? 'var(--flux-accent)' : 'none'}
                                    strokeWidth={isSel ? 1.5 : 0}
                                  />
                                  <text
                                    x={tx}
                                    y={firstLineY}
                                    textAnchor={cell.align === 'center' ? 'middle' : 'start'}
                                    fill={cell.editable ? 'var(--flux-text)' : 'var(--flux-text-muted)'}
                                    fontSize={fitFs}
                                    fontWeight={cell.bold ? 600 : 400}
                                    clipPath={`url(#${clipId})`}
                                  >
                                    {fitted.lines.map((lnText, li) => (
                                      <tspan key={li} x={tx} dy={li === 0 ? 0 : fitted.lineHeight}>
                                        {lnText}
                                      </tspan>
                                    ))}
                                  </text>
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                      </div>
                    )}

                    {/* Selected Cell Inspector */}
                    {selectedCell && (
                      <div className="pt-3 border-t border-[var(--flux-line)] space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[length:calc(12px*var(--flux-ui-scale))] font-semibold text-[var(--flux-text)]">
                            Параметры ячейки ({selectedCell.label || selectedCell.staticText || selectedCell.id})
                          </span>
                          <button
                            type="button"
                            disabled={designerDraft.cells.length <= 1}
                            onClick={handleDeleteSelectedCell}
                            className="inline-flex items-center gap-1 h-6 px-2 rounded border border-[var(--flux-line)] text-[length:calc(11px*var(--flux-ui-scale))] text-rose-600 dark:text-rose-400 hover:bg-[var(--flux-hover)] disabled:opacity-40"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Удалить ячейку</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div>
                            <label htmlFor="cell-xpct" className="block text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                              X позиция (%)
                            </label>
                            <input
                              id="cell-xpct"
                              type="number"
                              min={0}
                              max={95}
                              value={Math.round(selectedCell.xPct)}
                              onChange={(e) =>
                                updateSelectedCell({
                                  xPct: parseFiniteClamped(e.target.value, selectedCell.xPct, 0, 95),
                                })
                              }
                              className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(12px*var(--flux-ui-scale))]"
                            />
                          </div>
                          <div>
                            <label htmlFor="cell-ypct" className="block text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                              Y позиция (%)
                            </label>
                            <input
                              id="cell-ypct"
                              type="number"
                              min={0}
                              max={95}
                              value={Math.round(selectedCell.yPct)}
                              onChange={(e) =>
                                updateSelectedCell({
                                  yPct: parseFiniteClamped(e.target.value, selectedCell.yPct, 0, 95),
                                })
                              }
                              className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(12px*var(--flux-ui-scale))]"
                            />
                          </div>
                          <div>
                            <label htmlFor="cell-wpct" className="block text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                              Ширина (%)
                            </label>
                            <input
                              id="cell-wpct"
                              type="number"
                              min={5}
                              max={100}
                              value={Math.round(selectedCell.wPct)}
                              onChange={(e) =>
                                updateSelectedCell({
                                  wPct: parseFiniteClamped(e.target.value, selectedCell.wPct, 5, 100),
                                })
                              }
                              className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(12px*var(--flux-ui-scale))]"
                            />
                          </div>
                          <div>
                            <label htmlFor="cell-hpct" className="block text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                              Высота (%)
                            </label>
                            <input
                              id="cell-hpct"
                              type="number"
                              min={8}
                              max={100}
                              value={Math.round(selectedCell.hPct)}
                              onChange={(e) =>
                                updateSelectedCell({
                                  hPct: parseFiniteClamped(e.target.value, selectedCell.hPct, 8, 100),
                                })
                              }
                              className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(12px*var(--flux-ui-scale))]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                          <div className="sm:col-span-5">
                            <label htmlFor="cell-binding" className="block text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                              Привязка к полю или статичный текст
                            </label>
                            <select
                              id="cell-binding"
                              value={selectedCell.fieldKey ? `field:${selectedCell.fieldKey}` : 'static'}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === 'static') {
                                  updateSelectedCell({
                                    fieldKey: undefined,
                                    staticText: selectedCell.staticText || selectedCell.label || 'Подпись',
                                  });
                                } else if (v.startsWith('field:')) {
                                  const fk = v.slice(6) as StampFieldKey;
                                  const meta = STAMP_FIELD_OPTIONS.find((f) => f.key === fk);
                                  updateSelectedCell({
                                    fieldKey: fk,
                                    label: meta?.label || fk,
                                    staticText: undefined,
                                  });
                                }
                              }}
                              className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                            >
                              <option value="static">Статическая подпись / {'{SHEET_INFO}'}</option>
                              {STAMP_FIELD_OPTIONS.map((opt) => (
                                <option key={opt.key} value={`field:${opt.key}`}>
                                  Поле: {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <label htmlFor="cell-text" className="block text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                              {selectedCell.fieldKey ? 'Подпись ячейки' : 'Текст ячейки'}
                            </label>
                            <input
                              id="cell-text"
                              type="text"
                              spellCheck={selectedCell.fieldKey ? undefined : false}
                              value={
                                selectedCell.fieldKey
                                  ? selectedCell.label || ''
                                  : selectedCell.staticText || ''
                              }
                              onChange={(e) =>
                                selectedCell.fieldKey
                                  ? updateSelectedCell({ label: e.target.value })
                                  : updateSelectedCell({ staticText: e.target.value })
                              }
                              className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label htmlFor="cell-align" className="block text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                              Выравнивание
                            </label>
                            <select
                              id="cell-align"
                              value={selectedCell.align || 'center'}
                              onChange={(e) =>
                                updateSelectedCell({ align: e.target.value as 'left' | 'center' })
                              }
                              className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-text)]"
                            >
                              <option value="center">По центру</option>
                              <option value="left">Слева</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2 flex items-center gap-2">
                            <div className="flex-1">
                              <label htmlFor="cell-fontsize" className="block text-[length:calc(11px*var(--flux-ui-scale))] text-[var(--flux-text-muted)] mb-1">
                                Кегль
                              </label>
                              <input
                                id="cell-fontsize"
                                type="number"
                                min={6}
                                max={16}
                                step={0.5}
                                value={selectedCell.fontSize || 8.5}
                                onChange={(e) =>
                                  updateSelectedCell({
                                    fontSize: parseFiniteClamped(e.target.value, selectedCell.fontSize || 8.5, 6, 16),
                                  })
                                }
                                className="w-full h-8 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[length:calc(12px*var(--flux-ui-scale))]"
                              />
                            </div>
                            <button
                              type="button"
                              aria-label="Полужирное начертание"
                              aria-pressed={Boolean(selectedCell.bold)}
                              onClick={() => updateSelectedCell({ bold: !selectedCell.bold })}
                              title="Полужирное начертание"
                              className={`mt-5 w-8 h-8 rounded border font-bold text-[length:calc(12px*var(--flux-ui-scale))] ${
                                selectedCell.bold
                                  ? 'bg-[var(--flux-sel)] border-[var(--flux-accent)] text-[var(--flux-text)]'
                                  : 'bg-[var(--flux-surface)] border-[var(--flux-line)] text-[var(--flux-text-muted)]'
                              }`}
                            >
                              Ж
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {savedNotice && (
                      <div className="text-[length:calc(12px*var(--flux-ui-scale))] text-[var(--flux-accent)] font-medium">
                        {savedNotice}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="stamp-save-template-btn"
                    onClick={handleSaveTemplateOnly}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[length:calc(12px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
                  >
                    <Save className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                    <span>Сохранить шаблон в базу</span>
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="stamp-apply-template-single-btn"
                      onClick={() => handleSaveAndApplyTemplate(false)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[length:calc(12px*var(--flux-ui-scale))] font-medium text-[var(--flux-text)]"
                    >
                      <Check className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                      <span>Сохранить и на этот лист</span>
                    </button>
                    <button
                      type="button"
                      data-testid="stamp-apply-template-all-btn"
                      onClick={() => handleSaveAndApplyTemplate(true)}
                      className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[length:calc(12px*var(--flux-ui-scale))] font-medium"
                    >
                      <CopyCheck className="w-3.5 h-3.5" />
                      <span>Сохранить и на все листы ({project.sheets.length})</span>
                    </button>
                  </div>
                </div>
              </>
            )}
    </StudioWindow>
  );
};
