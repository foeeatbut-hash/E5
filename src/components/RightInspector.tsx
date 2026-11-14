import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowLeftRight,
  BookmarkPlus,
  Check,
  Copy,
  CopyPlus,
  FileSpreadsheet,
  History,
  LayoutTemplate,
  Lock,
  Navigation,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Type,
  Unlink,
  Workflow,
  Zap,
} from 'lucide-react';
import { CAD_LAYER_DEFS, resolveCadLayers } from '../core/cadLayers';
import type { DeviceAlignKind } from '../core/cadSelection';
import { getOffPageMeta, resolveOffPageLinks } from '../core/crossSheetRefs';
import { SCHEMATIC_FONT_OPTIONS, SHEET_DIMENSIONS } from '../core/e3Catalog';
import { buildGostTableRenderModel } from '../core/gostTables';
import {
  getReleasedSheetRevisions,
  getSheetRevisionLabel,
  getSheetRevisionNumber,
  hasSheetUncommittedChanges,
  SHEET_CHANGE_AREA_LABELS,
} from '../core/sheetRevisions';
import type {
  AnnotationKind,
  AnnotationStrokeStyle,
  CadLayerId,
  E3Annotation,
  E3Attribute,
  E3Device,
  E3Project,
  E3Sheet,
  E3Wire,
  GostStampTemplate,
  OffPageRefMeta,
  SchematicFontFamily,
  SheetFormat,
  SignalType,
} from '../core/e3Types';
import type { StampFieldKey } from '../core/gostFrame';
import type { SymbolWorkspaceActions } from '../core/symbolWorkspaceTypes';
import { SymbolEditorInspector } from './SymbolEditorInspector';

interface RightInspectorProps {
  project: E3Project;
  activeSheet: E3Sheet | undefined;
  customTemplates?: GostStampTemplate[];
  selectedDevice: E3Device | null;
  selectedWire: E3Wire | null;
  selectedAnnotation: E3Annotation | null;
  selectedDeviceIds?: string[];
  selectedWireIds?: string[];
  selectedAnnotationIds?: string[];
  symbolWorkspace?: SymbolWorkspaceActions;
  onEditDeviceSymbol?: (device: E3Device) => void;
  onAlignDevices?: (kind: DeviceAlignKind) => void;
  onRotateSelected?: () => void;
  onDuplicateSelected?: () => void;
  onDeleteSelected?: () => void;
  onClearSelection?: () => void;
  onUpdateDevice: (deviceId: string, patch: Partial<E3Device>) => void;
  onSaveDeviceToCatalog?: (device: E3Device) => void;
  onUpdateWire: (wireId: string, patch: Partial<E3Wire>) => void;
  onRerouteWire?: (wireId: string) => void;
  onDeleteWire: (wireId: string) => void;
  onUpdateAnnotation: (annId: string, patch: Partial<E3Annotation>) => void;
  onDeleteAnnotation: (annId: string) => void;
  onUpdateSheetTitle: (sheetId: string, patch: Partial<E3Sheet['titleBlock']>) => void;
  onUpdateSheetFormat: (sheetId: string, format: SheetFormat) => void;
  onUpdateFontFamily: (font: SchematicFontFamily) => void;
  onOpenStampEditor?: (sheetId: string, field?: StampFieldKey) => void;
  onOpenStampDesigner?: (sheetId: string) => void;
  onOpenBomPanel?: () => void;
  onToggleLayerLock?: (layerId: CadLayerId) => void;
  onNavigateOffPage?: (device: E3Device) => void;
  onCreateOffPageCounterpart?: (sourceDevice: E3Device, targetSheetId: string) => void;
  onUpdateOffPageMeta?: (deviceId: string, patch: Partial<OffPageRefMeta>) => void;
  onHighlightPotential?: (seed: { wireId?: string; netName?: string; deviceId?: string; pinId?: string }) => void;
  onRestoreSheetRevision?: (sheetId: string, targetRevision: number) => void;
  onReleaseSheetRevision?: (
    sheetId: string,
    opts: { revisionLabel: string; changeDoc?: string; comment?: string }
  ) => void;
}

const parseFiniteNum = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export const RightInspector: React.FC<RightInspectorProps> = React.memo(({
  project,
  activeSheet,
  customTemplates = [],
  selectedDevice,
  selectedWire,
  selectedAnnotation,
  selectedDeviceIds = [],
  selectedWireIds = [],
  selectedAnnotationIds = [],
  onAlignDevices,
  onRotateSelected,
  onDuplicateSelected,
  onDeleteSelected,
  onClearSelection,
  onUpdateDevice,
  onSaveDeviceToCatalog,
  onUpdateWire,
  onRerouteWire,
  onDeleteWire,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onUpdateSheetTitle,
  onUpdateSheetFormat,
  onUpdateFontFamily,
  onOpenStampEditor,
  onOpenStampDesigner,
  onOpenBomPanel,
  onToggleLayerLock,
  onNavigateOffPage,
  onCreateOffPageCounterpart,
  onUpdateOffPageMeta,
  onHighlightPotential,
  onRestoreSheetRevision,
  onReleaseSheetRevision,
  symbolWorkspace,
  onEditDeviceSymbol,
}) => {
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');
  const [copiedElId, setCopiedElId] = useState(false);
  const [counterpartSheetId, setCounterpartSheetId] = useState<string>('');
  const [pendingScrollToHistory, setPendingScrollToHistory] = useState(false);
  const [releaseCode, setReleaseCode] = useState('');
  const [releaseDoc, setReleaseDoc] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const sheetHistoryRef = useRef<HTMLDivElement | null>(null);

  const totalSelectedCount =
    selectedDeviceIds.length + selectedWireIds.length + selectedAnnotationIds.length;
  const isMultiSelection = totalSelectedCount > 1;
  const isSheetMode = Boolean(activeSheet) && !isMultiSelection && !selectedDevice && !selectedWire && !selectedAnnotation;

  useEffect(() => {
    if (!pendingScrollToHistory || !isSheetMode) return;
    const raf = requestAnimationFrame(() => {
      sheetHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingScrollToHistory(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollToHistory, isSheetMode]);

  if (symbolWorkspace?.draft.open) {
    return <SymbolEditorInspector workspace={symbolWorkspace} />;
  }

  const layersMap = resolveCadLayers(project.layers, project.visualSettings.showGostFrame);
  const activeLayerId: CadLayerId = selectedDevice
    ? 'devices'
    : selectedWire
      ? 'wires'
      : selectedAnnotation
        ? 'annotations'
        : 'frame';
  const activeLayerLocked = !isMultiSelection && layersMap[activeLayerId].locked;
  const activeLayerMeta = CAD_LAYER_DEFS[activeLayerId];
  const wiresLocked = layersMap.wires.locked;

  const handleAttrChange = (idx: number, patch: Partial<E3Attribute>) => {
    if (!selectedDevice) return;
    const nextAttrs = selectedDevice.attributes.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onUpdateDevice(selectedDevice.id, { attributes: nextAttrs });
  };

  const handleAddAttr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice || !newAttrName.trim()) return;
    const nextAttrs: E3Attribute[] = [
      ...selectedDevice.attributes,
      {
        name: newAttrName.trim(),
        value: newAttrValue.trim(),
        owner: '',
        conflict: 'flux',
      },
    ];
    onUpdateDevice(selectedDevice.id, { attributes: nextAttrs });
    setNewAttrName('');
    setNewAttrValue('');
  };

  const handleRemoveAttr = (idx: number) => {
    if (!selectedDevice) return;
    onUpdateDevice(selectedDevice.id, {
      attributes: selectedDevice.attributes.filter((_, i) => i !== idx),
    });
  };

  return (
    <aside
      aria-label="Свойства и атрибуты E3 / Flux"
      data-testid="right-inspector"
      className="no-print w-full h-full flex-1 min-w-0 max-w-full flux-glass-surface flex flex-col min-h-0 overflow-x-hidden select-none"
    >
      <div className="px-2 h-6 border-b border-[var(--flux-line)] flux-glass-bar flex items-center justify-between gap-1.5 shrink-0">
        <span className="text-[11px] font-semibold text-[var(--flux-text)] truncate">
          {isMultiSelection
            ? `Выборка: ${totalSelectedCount} об.`
            : selectedDevice
              ? `Изделие · ${selectedDevice.designation}`
              : selectedWire
                ? `Цепь · ${selectedWire.netName}`
                : selectedAnnotation
                  ? `Аннотация · ${selectedAnnotation.kind === 'rect' ? 'Зона' : selectedAnnotation.kind === 'callout' ? 'Выноска' : 'Текст'}`
                  : activeSheet
                    ? 'Лист ГОСТ 2.104'
                    : 'Нет открытых листов'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selectedDevice && !isMultiSelection && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(selectedDevice.elementId);
                  setCopiedElId(true);
                  window.setTimeout(() => setCopiedElId(false), 1400);
                } catch {
                  // ignore
                }
              }}
              title="Копировать elementId"
              className="inline-flex items-center gap-1 px-1 h-[18px] rounded-[2px] hover:bg-[var(--flux-hover)] font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] transition-colors shrink-0"
            >
              <span className="max-w-[64px] truncate">{selectedDevice.elementId}</span>
              {copiedElId ? (
                <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-2.5 h-2.5 shrink-0" />
              )}
            </button>
          )}
          {activeSheet && (() => {
            const dirty = hasSheetUncommittedChanges(project, activeSheet);
            const revLabel = getSheetRevisionLabel(activeSheet);
            return (
              <button
                type="button"
                data-testid="active-sheet-rev-btn"
                onClick={() => {
                  setPendingScrollToHistory(true);
                  if (!isSheetMode) {
                    onClearSelection?.();
                  } else {
                    requestAnimationFrame(() => {
                      sheetHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      setPendingScrollToHistory(false);
                    });
                  }
                }}
                title={`Открыть историю версий листа «${activeSheet.name}»${dirty ? ' (есть невыпущенные правки)' : ''}`}
                className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] transition-colors shrink-0"
              >
                <History className="w-2.5 h-2.5 text-[var(--flux-accent)] shrink-0" />
                <span>
                  {revLabel}
                  {dirty ? '*' : ''}
                </span>
              </button>
            );
          })()}
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        {activeLayerLocked && (
          <div
            data-testid="inspector-layer-locked-banner"
            className="mx-2 my-1.5 px-2 py-1.5 rounded-[2px] border border-amber-500/50 bg-amber-500/10 flex items-center justify-between gap-2 text-[11px]"
          >
            <div className="flex items-center gap-1.5 min-w-0 text-amber-700 dark:text-amber-300">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <div className="min-w-0 leading-tight">
                <div className="font-semibold">Слой «{activeLayerMeta.shortName}»</div>
                <div className="text-[10px] opacity-90">Редактирование закрыто</div>
              </div>
            </div>
            {onToggleLayerLock && (
              <button
                type="button"
                data-testid="inspector-unlock-layer-btn"
                onClick={() => onToggleLayerLock(activeLayerId)}
                className="h-6 px-2 rounded-[2px] border border-amber-500/60 bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[10.5px] font-medium text-[var(--flux-text)] shrink-0 transition-colors"
              >
                Разблокировать
              </button>
            )}
          </div>
        )}

        {isMultiSelection ? (
          <div data-testid="inspector-multi-selection">
            <div className="cad-prop-section">
              <span>Состав выборки</span>
              <span className="font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)]">
                {totalSelectedCount} об.
              </span>
            </div>
            <div className="grid grid-cols-3 border-b border-[var(--flux-line)] divide-x divide-[var(--flux-line)] bg-[var(--flux-surface)] text-[10.5px]">
              <div className="px-1.5 py-1 text-center">
                <div className="font-mono font-semibold text-[var(--flux-text)] tabular-nums">{selectedDeviceIds.length}</div>
                <div className="text-[9.5px] text-[var(--flux-text-muted)]">Изделия</div>
              </div>
              <div className="px-1.5 py-1 text-center">
                <div className="font-mono font-semibold text-[var(--flux-text)] tabular-nums">{selectedWireIds.length}</div>
                <div className="text-[9.5px] text-[var(--flux-text-muted)]">Цепи</div>
              </div>
              <div className="px-1.5 py-1 text-center">
                <div className="font-mono font-semibold text-[var(--flux-text)] tabular-nums">{selectedAnnotationIds.length}</div>
                <div className="text-[9.5px] text-[var(--flux-text-muted)]">Аннот.</div>
              </div>
            </div>

            {selectedDeviceIds.length >= 2 && onAlignDevices && (
              <div>
                <div className="cad-prop-section">
                  <span>Выравнивание группы изделий</span>
                </div>
                <div className="p-1.5 space-y-1">
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      data-testid="align-left-btn"
                      onClick={() => onAlignDevices('left')}
                      title="Выровнять по левому краю"
                      className="h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[10.5px] text-[var(--flux-text)]"
                    >
                      <AlignStartVertical className="w-3 h-3" />
                      <span>Лево</span>
                    </button>
                    <button
                      type="button"
                      data-testid="align-center-x-btn"
                      onClick={() => onAlignDevices('center-x')}
                      title="Выровнять по центру X"
                      className="h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[10.5px] text-[var(--flux-text)]"
                    >
                      <AlignCenterVertical className="w-3 h-3" />
                      <span>Центр X</span>
                    </button>
                    <button
                      type="button"
                      data-testid="align-right-btn"
                      onClick={() => onAlignDevices('right')}
                      title="Выровнять по правому краю"
                      className="h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[10.5px] text-[var(--flux-text)]"
                    >
                      <AlignEndVertical className="w-3 h-3" />
                      <span>Право</span>
                    </button>
                    <button
                      type="button"
                      data-testid="align-top-btn"
                      onClick={() => onAlignDevices('top')}
                      title="Выровнять по верхнему краю"
                      className="h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[10.5px] text-[var(--flux-text)]"
                    >
                      <AlignStartHorizontal className="w-3 h-3" />
                      <span>Верх</span>
                    </button>
                    <button
                      type="button"
                      data-testid="align-center-y-btn"
                      onClick={() => onAlignDevices('center-y')}
                      title="Выровнять по центру Y"
                      className="h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[10.5px] text-[var(--flux-text)]"
                    >
                      <AlignCenterHorizontal className="w-3 h-3" />
                      <span>Центр Y</span>
                    </button>
                    <button
                      type="button"
                      data-testid="align-bottom-btn"
                      onClick={() => onAlignDevices('bottom')}
                      title="Выровнять по нижнему краю"
                      className="h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[10.5px] text-[var(--flux-text)]"
                    >
                      <AlignEndHorizontal className="w-3 h-3" />
                      <span>Низ</span>
                    </button>
                  </div>

                  {selectedDeviceIds.length >= 3 && (
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        data-testid="distribute-x-btn"
                        onClick={() => onAlignDevices('distribute-x')}
                        className="h-6 px-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[10.5px] text-[var(--flux-text)]"
                      >
                        <AlignHorizontalDistributeCenter className="w-3 h-3" />
                        <span>Шаг по X</span>
                      </button>
                      <button
                        type="button"
                        data-testid="distribute-y-btn"
                        onClick={() => onAlignDevices('distribute-y')}
                        className="h-6 px-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[10.5px] text-[var(--flux-text)]"
                      >
                        <AlignVerticalDistributeCenter className="w-3 h-3" />
                        <span>Шаг по Y</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="cad-prop-section">
              <span>Операции над группой</span>
            </div>
            <div className="p-1.5 space-y-1">
              {selectedDeviceIds.length > 0 && onRotateSelected && (
                <button
                  type="button"
                  data-testid="multi-rotate-btn"
                  onClick={onRotateSelected}
                  className="w-full h-6 px-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1.5 text-[10.5px] font-medium text-[var(--flux-text)]"
                >
                  <RotateCw className="w-3 h-3 text-[var(--flux-text-muted)]" />
                  <span>Повернуть изделия на 90° (R)</span>
                </button>
              )}
              {(selectedDeviceIds.length > 0 || selectedAnnotationIds.length > 0) && onDuplicateSelected && (
                <button
                  type="button"
                  data-testid="multi-duplicate-btn"
                  onClick={onDuplicateSelected}
                  className="w-full h-6 px-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1.5 text-[10.5px] font-medium text-[var(--flux-text)]"
                >
                  <CopyPlus className="w-3 h-3 text-[var(--flux-accent)]" />
                  <span>Дублировать группу (Ctrl+D)</span>
                </button>
              )}
              {onDeleteSelected && (
                <button
                  type="button"
                  data-testid="multi-delete-btn"
                  onClick={onDeleteSelected}
                  className="w-full h-6 px-2 rounded-[2px] border border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/15 inline-flex items-center justify-center gap-1.5 text-[10.5px] font-medium text-rose-600 dark:text-rose-400"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Удалить выделенные (Del)</span>
                </button>
              )}
              {onClearSelection && (
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="w-full h-[22px] rounded-[2px] text-[10.5px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
                >
                  Снять выделение
                </button>
              )}
            </div>
          </div>
        ) : selectedDevice ? (
          <>
            <div className="px-2 py-1 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-1.5">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[var(--flux-text)] truncate">
                  {selectedDevice.designation} · {selectedDevice.attributes.length} атр. · {selectedDevice.pins.length} выв.
                </div>
                <div className="text-[10px] font-mono text-[var(--flux-text-muted)] truncate">
                  {selectedDevice.e3BlockName || selectedDevice.article}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onEditDeviceSymbol && (
                  <button
                    type="button"
                    data-testid="insp-edit-device-symbol-btn"
                    onClick={() => onEditDeviceSymbol(selectedDevice)}
                    title="Открыть графику УГО этого объекта в редакторе блоков"
                    className="inline-flex items-center gap-1 h-[21px] px-1.5 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[10.5px] font-medium text-[var(--flux-accent)] whitespace-nowrap shrink-0 transition-colors"
                  >
                    <span>УГО…</span>
                  </button>
                )}
                {onSaveDeviceToCatalog && (
                  <button
                    type="button"
                    onClick={() => onSaveDeviceToCatalog(selectedDevice)}
                    title="Сохранить изделие со всеми атрибутами и выводами в базу компонентов"
                    className="inline-flex items-center gap-1 h-[21px] px-1.5 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[10.5px] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0 transition-colors"
                  >
                    <BookmarkPlus className="w-3 h-3 text-[var(--flux-text-muted)]" />
                    <span>В базу</span>
                  </button>
                )}
              </div>
            </div>

            <fieldset disabled={activeLayerLocked} className="min-w-0 disabled:opacity-65">
              <div className="cad-prop-section">
                <span>Идентификация и позиция</span>
              </div>
              <div className="cad-prop-grid">
                <label htmlFor="insp-designation" className="cad-prop-label" title="Позиционное обозначение (Device Designation)">
                  Обозначение (ОУО)
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="insp-designation"
                    type="text"
                    spellCheck={false}
                    value={selectedDevice.designation}
                    onChange={(e) => onUpdateDevice(selectedDevice.id, { designation: e.target.value })}
                    className="cad-prop-input font-mono font-semibold"
                  />
                </div>

                <label htmlFor="insp-name" className="cad-prop-label" title="Наименование (ГОСТ / ПЭ3)">
                  Наименование
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="insp-name"
                    type="text"
                    value={selectedDevice.componentName}
                    onChange={(e) => onUpdateDevice(selectedDevice.id, { componentName: e.target.value })}
                    className="cad-prop-input"
                  />
                </div>

                <label htmlFor="insp-article" className="cad-prop-label">
                  Артикул
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="insp-article"
                    type="text"
                    spellCheck={false}
                    value={selectedDevice.article}
                    onChange={(e) => onUpdateDevice(selectedDevice.id, { article: e.target.value })}
                    className="cad-prop-input font-mono"
                  />
                </div>

                <label htmlFor="insp-mfr" className="cad-prop-label">
                  Производитель
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="insp-mfr"
                    type="text"
                    value={selectedDevice.manufacturer}
                    onChange={(e) => onUpdateDevice(selectedDevice.id, { manufacturer: e.target.value })}
                    className="cad-prop-input"
                  />
                </div>

                <label htmlFor="insp-x" className="cad-prop-label">
                  Координата X (мм)
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="insp-x"
                    type="number"
                    value={selectedDevice.x}
                    onChange={(e) => {
                      const n = parseFiniteNum(e.target.value);
                      if (n !== null) onUpdateDevice(selectedDevice.id, { x: n });
                    }}
                    className="cad-prop-input font-mono tabular-nums"
                  />
                </div>

                <label htmlFor="insp-y" className="cad-prop-label">
                  Координата Y (мм)
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="insp-y"
                    type="number"
                    value={selectedDevice.y}
                    onChange={(e) => {
                      const n = parseFiniteNum(e.target.value);
                      if (n !== null) onUpdateDevice(selectedDevice.id, { y: n });
                    }}
                    className="cad-prop-input font-mono tabular-nums"
                  />
                </div>

                <span className="cad-prop-label">Поворот УГО</span>
                <div className="cad-prop-cell px-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDevice(selectedDevice.id, {
                        rotation: ((selectedDevice.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                      })
                    }
                    className="w-full h-[20px] px-1.5 rounded-[2px] hover:bg-[var(--flux-hover)] font-mono tabular-nums text-[11px] text-[var(--flux-text)] inline-flex items-center justify-between gap-1"
                  >
                    <span>{selectedDevice.rotation}°</span>
                    <RotateCw className="w-3 h-3 text-[var(--flux-text-muted)]" />
                  </button>
                </div>

                <label htmlFor="insp-e3block" className="cad-prop-label">
                  Блок E3.series
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="insp-e3block"
                    type="text"
                    spellCheck={false}
                    value={selectedDevice.e3BlockName}
                    onChange={(e) => onUpdateDevice(selectedDevice.id, { e3BlockName: e.target.value })}
                    className="cad-prop-input font-mono text-[11px]"
                  />
                </div>

                <label htmlFor="insp-state" className="cad-prop-label">
                  Статус E3ProMax
                </label>
                <div className="cad-prop-cell">
                  <select
                    id="insp-state"
                    value={selectedDevice.bindingState}
                    onChange={(e) =>
                      onUpdateDevice(selectedDevice.id, {
                        bindingState: e.target.value as E3Device['bindingState'],
                      })
                    }
                    className="cad-prop-input"
                  >
                    <option value="PLACED">В схеме</option>
                    <option value="MODIFIED">Изменено</option>
                    <option value="DETACHED">Отвязано</option>
                    <option value="REMOVED_IN_FLUX">Снято</option>
                  </select>
                </div>
              </div>

            {selectedDevice.category === 'offpage_ref' && (() => {
              const linkMap = resolveOffPageLinks(project);
              const link = linkMap.get(selectedDevice.id);
              const connectedWire = project.wires.find(
                (w) => w.fromDeviceId === selectedDevice.id || w.toDeviceId === selectedDevice.id
              );
              const meta = getOffPageMeta(selectedDevice, connectedWire);
              const otherSheets = project.sheets.filter((s) => s.id !== selectedDevice.sheetId);
              const fallbackTargetSheetId = otherSheets[0]?.id || project.sheets[0]?.id || 'sheet-1';
              const targetSheetId =
                counterpartSheetId && project.sheets.some((s) => s.id === counterpartSheetId && s.id !== selectedDevice.sheetId)
                  ? counterpartSheetId
                  : fallbackTargetSheetId;
              const uniqueNets = Array.from(new Set(project.wires.map((w) => w.netName).filter(Boolean)));

              return (
                <div data-testid="inspector-offpage-panel">
                  <div className="cad-prop-section">
                    <span className="inline-flex items-center gap-1">
                      <ArrowLeftRight className="w-3 h-3 text-[var(--flux-accent)]" />
                      <span>Межлистовая ссылка</span>
                    </span>
                    <span className="font-mono text-[10.5px] font-semibold text-[var(--flux-accent)] whitespace-nowrap shrink-0">
                      {link?.addressText || (meta.direction === 'out' ? '→ Л.?' : '← Л.?')}
                    </span>
                  </div>

                  <div className="cad-prop-grid">
                    <label htmlFor="insp-offpage-dir" className="cad-prop-label">
                      Направление
                    </label>
                    <div className="cad-prop-cell">
                      <select
                        id="insp-offpage-dir"
                        data-testid="inspector-offpage-dir"
                        value={meta.direction}
                        onChange={(e) =>
                          onUpdateOffPageMeta?.(selectedDevice.id, {
                            direction: e.target.value as 'out' | 'in',
                          })
                        }
                        className="cad-prop-input"
                      >
                        <option value="out">Исходящая (→)</option>
                        <option value="in">Входящая (←)</option>
                      </select>
                    </div>

                    <label htmlFor="insp-offpage-sig" className="cad-prop-label">
                      Потенциал / тип
                    </label>
                    <div className="cad-prop-cell">
                      <select
                        id="insp-offpage-sig"
                        value={meta.signalType}
                        onChange={(e) =>
                          onUpdateOffPageMeta?.(selectedDevice.id, {
                            signalType: e.target.value as SignalType,
                          })
                        }
                        className="cad-prop-input"
                      >
                        <option value="power">Силовая фаза</option>
                        <option value="neutral">Нейтраль N</option>
                        <option value="pe">Земля PE</option>
                        <option value="dc24">+24V DC</option>
                        <option value="dc0">0V DC</option>
                        <option value="signal">Сигнал КИП</option>
                        <option value="bus">Шина RS-485</option>
                      </select>
                    </div>

                    <label htmlFor="insp-offpage-potential" className="cad-prop-label">
                      Имя потенциала
                    </label>
                    <div className="cad-prop-cell">
                      <input
                        id="insp-offpage-potential"
                        data-testid="inspector-offpage-potential"
                        type="text"
                        spellCheck={false}
                        list="offpage-potential-nets"
                        value={meta.potentialName}
                        onChange={(e) =>
                          onUpdateOffPageMeta?.(selectedDevice.id, {
                            potentialName: e.target.value,
                          })
                        }
                        className="cad-prop-input font-mono"
                      />
                      <datalist id="offpage-potential-nets">
                        {uniqueNets.map((net) => (
                          <option key={net} value={net} />
                        ))}
                      </datalist>
                    </div>

                    <span className="cad-prop-label">Зона ГОСТ</span>
                    <div className="cad-prop-cell px-1.5 font-mono text-[11px] text-[var(--flux-text)]">
                      Л.{link?.sheetNumber ?? 1} ({link?.ownZone ?? 'А1'})
                    </div>

                    <span className="cad-prop-label">Ответная ссылка</span>
                    <div className="cad-prop-cell px-1.5 text-[10.5px] leading-tight py-1">
                      {link?.counterparts && link.counterparts.length > 0 ? (
                        <span className="font-mono text-[var(--flux-text)] truncate">
                          {link.counterparts
                            .map((cp) => `${cp.designation} · Л.${cp.sheetNumber}(${cp.zone})`)
                            .join(', ')}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          Не найдена
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-1.5 border-b border-[var(--flux-line)] space-y-1">
                    <button
                      type="button"
                      data-testid="inspector-offpage-jump-btn"
                      disabled={!link?.primaryCounterpart}
                      onClick={() => onNavigateOffPage?.(selectedDevice)}
                      className="w-full h-6 inline-flex items-center justify-center gap-1.5 rounded-[2px] border border-[var(--flux-accent)]/70 bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[10.5px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Перейти на ответный лист</span>
                    </button>

                    <button
                      type="button"
                      data-testid="inspector-highlight-potential-btn"
                      onClick={() => onHighlightPotential?.({ deviceId: selectedDevice.id })}
                      className="w-full h-6 inline-flex items-center justify-center gap-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[10.5px] font-medium"
                    >
                      <Zap className="w-3 h-3 text-amber-500" />
                      <span>Подсветить весь потенциал</span>
                    </button>

                    {otherSheets.length > 0 && onCreateOffPageCounterpart && (
                      <div className="flex items-center gap-1 pt-0.5">
                        <select
                          aria-label="Целевой лист для ответной ссылки"
                          data-testid="inspector-offpage-target-sheet"
                          value={targetSheetId}
                          onChange={(e) => setCounterpartSheetId(e.target.value)}
                          className="flex-1 min-w-0 h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[10.5px] text-[var(--flux-text)]"
                        >
                          {otherSheets.map((s) => (
                            <option key={s.id} value={s.id}>
                              Л.{s.number}: {s.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          data-testid="inspector-create-counterpart-btn"
                          onClick={() => onCreateOffPageCounterpart(selectedDevice, targetSheetId)}
                          className="h-6 px-2 shrink-0 inline-flex items-center gap-1 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[10.5px] font-medium text-[var(--flux-text)]"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Создать</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* E3 Attributes 2-Column Table */}
            <div>
              <div className="cad-prop-section">
                <span>Атрибуты E3 / Flux</span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--flux-text-muted)]">
                  {selectedDevice.attributes.length}
                </span>
              </div>

              <div className="cad-prop-grid">
                {selectedDevice.attributes.map((attr, idx) => (
                  <React.Fragment key={`${attr.name}-${idx}`}>
                    <div className="cad-prop-label" title={attr.name}>
                      <span className="truncate text-[var(--flux-text)]">{attr.name}</span>
                    </div>
                    <div className="cad-prop-cell pr-0.5 gap-0.5">
                      <input
                        type="text"
                        spellCheck={false}
                        aria-label={`Значение атрибута ${attr.name}`}
                        value={attr.value}
                        onChange={(e) => handleAttrChange(idx, { value: e.target.value })}
                        className="cad-prop-input flex-1 min-w-0 font-mono text-[11px]"
                      />
                      <select
                        aria-label={`Политика конфликта для ${attr.name}`}
                        value={attr.conflict}
                        onChange={(e) =>
                          handleAttrChange(idx, {
                            conflict: e.target.value as E3Attribute['conflict'],
                          })
                        }
                        className="h-[17px] w-[58px] px-0.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] text-[9.5px] font-mono text-[var(--flux-text-muted)] shrink-0"
                      >
                        <option value="flux">flux</option>
                        <option value="script">script</option>
                        <option value="ask">ask</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttr(idx)}
                        aria-label={`Удалить атрибут ${attr.name}`}
                        className="w-[18px] h-[18px] inline-flex items-center justify-center rounded-[2px] text-[var(--flux-text-muted)] hover:text-rose-600 shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </React.Fragment>
                ))}
              </div>

              {/* Add Attribute */}
              <form onSubmit={handleAddAttr} className="p-1.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex items-center gap-1">
                <input
                  type="text"
                  spellCheck={false}
                  value={newAttrName}
                  onChange={(e) => setNewAttrName(e.target.value)}
                  placeholder="Атрибут"
                  aria-label="Название нового атрибута"
                  className="w-1/2 h-[22px] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[10.5px] text-[var(--flux-text)]"
                />
                <input
                  type="text"
                  spellCheck={false}
                  value={newAttrValue}
                  onChange={(e) => setNewAttrValue(e.target.value)}
                  placeholder="Значение"
                  aria-label="Значение нового атрибута"
                  className="w-1/2 h-[22px] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[10.5px] text-[var(--flux-text)]"
                />
                <button
                  type="submit"
                  disabled={!newAttrName.trim()}
                  aria-label="Добавить атрибут"
                  className="h-[22px] w-[22px] shrink-0 inline-flex items-center justify-center rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </form>
            </div>

            {/* Pin Connections Matrix */}
            <div>
              <div className="cad-prop-section">
                <span>Выводы и связи</span>
                <span className="font-mono text-[10.5px] tabular-nums text-[var(--flux-text-muted)]">
                  {selectedDevice.pins.length}
                </span>
              </div>
              <div className="cad-prop-grid">
                {selectedDevice.pins.map((pin) => {
                  const wire = project.wires.find(
                    (w) =>
                      (w.fromDeviceId === selectedDevice.id && w.fromPinId === pin.id) ||
                      (w.toDeviceId === selectedDevice.id && w.toPinId === pin.id)
                  );
                  return (
                    <React.Fragment key={pin.id}>
                      <span className="cad-prop-label font-mono font-medium text-[var(--flux-text)]">
                        {pin.name}
                      </span>
                      <div className="cad-prop-cell px-1.5 justify-between gap-1 text-[11px]">
                        {wire ? (
                          <>
                            <span className="font-mono text-[10.5px] text-[var(--flux-accent)] truncate">
                              {wire.netName} ({wire.wireNumber})
                            </span>
                            <button
                              type="button"
                              disabled={activeLayerLocked || wiresLocked}
                              onClick={() => onDeleteWire(wire.id)}
                              aria-label={`Отключить цепь от вывода ${pin.name}`}
                              className="text-[var(--flux-text-muted)] hover:text-rose-600 disabled:opacity-35 shrink-0"
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10.5px] text-[var(--flux-text-muted)]">Свободен</span>
                        )}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            </fieldset>
          </>
        ) : selectedWire ? (
          <fieldset disabled={activeLayerLocked} className="min-w-0 disabled:opacity-65">
            <div className="cad-prop-section">
              <span>Параметры цепи и провода</span>
            </div>
            <div className="cad-prop-grid">
              <label htmlFor="wire-net" className="cad-prop-label">
                Имя цепи (Net)
              </label>
              <div className="cad-prop-cell">
                <input
                  id="wire-net"
                  type="text"
                  spellCheck={false}
                  value={selectedWire.netName}
                  onChange={(e) => onUpdateWire(selectedWire.id, { netName: e.target.value })}
                  className="cad-prop-input font-mono font-semibold"
                />
              </div>

              <label htmlFor="wire-num" className="cad-prop-label">
                Маркировка жилы
              </label>
              <div className="cad-prop-cell">
                <input
                  id="wire-num"
                  type="text"
                  spellCheck={false}
                  value={selectedWire.wireNumber}
                  onChange={(e) => onUpdateWire(selectedWire.id, { wireNumber: e.target.value })}
                  className="cad-prop-input font-mono"
                />
              </div>

              <label htmlFor="wire-sec" className="cad-prop-label">
                Сечение
              </label>
              <div className="cad-prop-cell">
                <input
                  id="wire-sec"
                  type="text"
                  spellCheck={false}
                  value={selectedWire.crossSection}
                  onChange={(e) => onUpdateWire(selectedWire.id, { crossSection: e.target.value })}
                  className="cad-prop-input font-mono"
                />
              </div>

              <label htmlFor="wire-sig" className="cad-prop-label">
                Тип потенциала
              </label>
              <div className="cad-prop-cell">
                <select
                  id="wire-sig"
                  value={selectedWire.signalType}
                  onChange={(e) =>
                    onUpdateWire(selectedWire.id, { signalType: e.target.value as SignalType })
                  }
                  className="cad-prop-input"
                >
                  <option value="power">Силовая фаза (380/230В)</option>
                  <option value="neutral">Нейтраль (N)</option>
                  <option value="pe">Защитное заземление (PE)</option>
                  <option value="dc24">Питание +24V DC</option>
                  <option value="dc0">Общий 0V DC</option>
                  <option value="signal">Сигнал КИП (DI/DO/AI)</option>
                  <option value="bus">Шина (RS-485 / Modbus)</option>
                </select>
              </div>

              <label htmlFor="wire-cable" className="cad-prop-label">
                Назначенный кабель
              </label>
              <div className="cad-prop-cell">
                <select
                  id="wire-cable"
                  value={selectedWire.cableId || ''}
                  onChange={(e) =>
                    onUpdateWire(selectedWire.id, { cableId: e.target.value || undefined })
                  }
                  className="cad-prop-input"
                >
                  <option value="">Монтажный провод внутри шкафа</option>
                  {project.cables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.designation} · {c.cableType}
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const dFrom = project.devices.find((d) => d.id === selectedWire.fromDeviceId);
                const dTo = project.devices.find((d) => d.id === selectedWire.toDeviceId);
                const pFrom = dFrom?.pins.find((p) => p.id === selectedWire.fromPinId);
                const pTo = dTo?.pins.find((p) => p.id === selectedWire.toPinId);
                return (
                  <>
                    <span className="cad-prop-label">Трасса</span>
                    <div className="cad-prop-cell px-1.5 font-mono text-[10.5px] text-[var(--flux-text)] truncate">
                      {dFrom ? `${dFrom.designation}:${pFrom?.name || '?'}` : selectedWire.fromDeviceId} →{' '}
                      {dTo ? `${dTo.designation}:${pTo?.name || '?'}` : selectedWire.toDeviceId}
                    </div>
                    <span className="cad-prop-label">Трассировка</span>
                    <div className="cad-prop-cell px-1.5">
                      <span
                        data-testid="inspector-manual-route-badge"
                        data-manual={selectedWire.manualRoute ? 'true' : 'false'}
                        className={`font-mono text-[10.5px] font-medium ${
                          selectedWire.manualRoute
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-[var(--flux-text-muted)]'
                        }`}
                      >
                        {selectedWire.manualRoute ? 'Ручная трасса' : 'Автотрасса'}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="p-1.5 space-y-1">
              {onHighlightPotential && (
                <button
                  type="button"
                  data-testid="inspector-highlight-net-btn"
                  onClick={() => onHighlightPotential({ wireId: selectedWire.id })}
                  className="w-full h-6 inline-flex items-center justify-center gap-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[10.5px] font-medium transition-colors"
                >
                  <Zap className="w-3 h-3 text-amber-500" />
                  <span>Подсветить весь потенциал</span>
                </button>
              )}

              {onRerouteWire && (
                <button
                  type="button"
                  data-testid="inspector-reroute-wire-btn"
                  onClick={() => onRerouteWire(selectedWire.id)}
                  className="w-full h-6 inline-flex items-center justify-center gap-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[10.5px] font-medium transition-colors"
                >
                  <Workflow className="w-3 h-3 text-[var(--flux-accent)]" />
                  <span>{selectedWire.manualRoute ? 'Перестроить (сброс ручной)' : 'Перестроить трассу'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onDeleteWire(selectedWire.id)}
                className="w-full h-6 rounded-[2px] border border-rose-500/40 bg-rose-500/5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 text-[10.5px] font-medium"
              >
                Удалить соединение
              </button>
            </div>
          </fieldset>
        ) : selectedAnnotation ? (
          <fieldset disabled={activeLayerLocked} className="min-w-0 disabled:opacity-65">
            <div className="cad-prop-section">
              <span>Аннотация / таблица</span>
            </div>
            <div className="cad-prop-grid">
              <label htmlFor="ann-kind" className="cad-prop-label">
                Тип объекта
              </label>
              <div className="cad-prop-cell">
                <select
                  id="ann-kind"
                  value={selectedAnnotation.kind}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, { kind: e.target.value as AnnotationKind })
                  }
                  className="cad-prop-input"
                >
                  <option value="text">Текстовая надпись</option>
                  <option value="callout">Выноска со стрелкой</option>
                  <option value="rect">Рамка / Зона шкафа</option>
                  <option value="bom_table">Таблица ПЭ3 (ГОСТ 2.701)</option>
                  <option value="cable_table">Кабельный журнал (таблица)</option>
                </select>
              </div>
            </div>

            {(selectedAnnotation.kind === 'bom_table' || selectedAnnotation.kind === 'cable_table') ? (
              (() => {
                const tableModel = buildGostTableRenderModel(selectedAnnotation, project);
                const cfg = selectedAnnotation.tableConfig || {};
                const updateCfg = (patch: Partial<NonNullable<typeof selectedAnnotation.tableConfig>>) =>
                  onUpdateAnnotation(selectedAnnotation.id, {
                    tableConfig: { ...cfg, ...patch },
                  });
                return (
                  <div data-testid="inspector-gost-table-panel">
                    <div className="cad-prop-section">
                      <span>Таблица ГОСТ</span>
                      <span className="font-mono tabular-nums text-[10px] text-[var(--flux-accent)]">
                        {tableModel.totalRows} стр. · {tableModel.width}×{tableModel.height}
                      </span>
                    </div>
                    <div className="cad-prop-grid">
                      <span className="cad-prop-label">Заголовок</span>
                      <div className="cad-prop-cell">
                        <input
                          type="text"
                          aria-label="Заголовок таблицы ГОСТ"
                          data-testid="inspector-table-title-input"
                          value={cfg.title ?? selectedAnnotation.text ?? ''}
                          onChange={(e) => {
                            onUpdateAnnotation(selectedAnnotation.id, {
                              text: e.target.value,
                              tableConfig: { ...cfg, title: e.target.value },
                            });
                          }}
                          className="cad-prop-input"
                        />
                      </div>

                      <span className="cad-prop-label" title="Максимальное количество строк (0 = все)">
                        Макс. строк (0=все)
                      </span>
                      <div className="cad-prop-cell">
                        <input
                          type="number"
                          min={0}
                          max={200}
                          aria-label="Максимальное количество строк таблицы"
                          data-testid="inspector-table-maxrows-input"
                          value={cfg.maxRows ?? 0}
                          onChange={(e) => {
                            const n = parseFiniteNum(e.target.value);
                            if (n !== null) updateCfg({ maxRows: Math.max(0, Math.min(200, n)) });
                          }}
                          className="cad-prop-input font-mono tabular-nums"
                        />
                      </div>

                      <span className="cad-prop-label">Высота строки (мм)</span>
                      <div className="cad-prop-cell">
                        <input
                          type="number"
                          min={18}
                          max={36}
                          aria-label="Высота строки таблицы в миллиметрах"
                          value={cfg.rowHeight ?? 22}
                          onChange={(e) => {
                            const n = parseFiniteNum(e.target.value);
                            if (n !== null) updateCfg({ rowHeight: Math.max(18, Math.min(36, n)) });
                          }}
                          className="cad-prop-input font-mono tabular-nums"
                        />
                      </div>

                      {selectedAnnotation.kind === 'bom_table' && (
                        <>
                          <span className="cad-prop-label">Фильтр листа</span>
                          <label className="cad-prop-cell px-1.5 gap-1.5 text-[11px] text-[var(--flux-text)] cursor-pointer select-none">
                            <input
                              type="checkbox"
                              data-testid="inspector-table-sheetonly-checkbox"
                              checked={Boolean(cfg.sheetOnly)}
                              onChange={(e) => updateCfg({ sheetOnly: e.target.checked })}
                              className="rounded-[2px] border-[var(--flux-line-strong)] accent-[var(--flux-accent)]"
                            />
                            <span className="truncate">Только текущий лист</span>
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="px-2 py-1.5 bg-[var(--flux-surface)] border-b border-[var(--flux-line)]">
                <label
                  htmlFor="ann-text"
                  className="block text-[10.5px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Текст аннотации
                </label>
                <textarea
                  id="ann-text"
                  rows={3}
                  value={selectedAnnotation.text}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, { text: e.target.value })
                  }
                  className="w-full p-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11.5px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                />
              </div>
            )}

            <div className="cad-prop-section">
              <span>Геометрия и стиль</span>
            </div>
            <div className="cad-prop-grid">
              <label htmlFor="ann-x" className="cad-prop-label">
                Позиция X (мм)
              </label>
              <div className="cad-prop-cell">
                <input
                  id="ann-x"
                  type="number"
                  value={selectedAnnotation.x}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) onUpdateAnnotation(selectedAnnotation.id, { x: n });
                  }}
                  className="cad-prop-input font-mono tabular-nums"
                />
              </div>

              <label htmlFor="ann-y" className="cad-prop-label">
                Позиция Y (мм)
              </label>
              <div className="cad-prop-cell">
                <input
                  id="ann-y"
                  type="number"
                  value={selectedAnnotation.y}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) onUpdateAnnotation(selectedAnnotation.id, { y: n });
                  }}
                  className="cad-prop-input font-mono tabular-nums"
                />
              </div>

              <label htmlFor="ann-w" className="cad-prop-label">
                Ширина (мм)
              </label>
              <div className="cad-prop-cell">
                <input
                  id="ann-w"
                  type="number"
                  min={40}
                  value={selectedAnnotation.width}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) onUpdateAnnotation(selectedAnnotation.id, { width: Math.max(40, n) });
                  }}
                  className="cad-prop-input font-mono tabular-nums"
                />
              </div>

              <label htmlFor="ann-h" className="cad-prop-label">
                Высота (мм)
              </label>
              <div className="cad-prop-cell">
                <input
                  id="ann-h"
                  type="number"
                  min={24}
                  value={selectedAnnotation.height}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) onUpdateAnnotation(selectedAnnotation.id, { height: Math.max(24, n) });
                  }}
                  className="cad-prop-input font-mono tabular-nums"
                />
              </div>

              <label htmlFor="ann-fs" className="cad-prop-label">
                Кегль шрифта
              </label>
              <div className="cad-prop-cell">
                <input
                  id="ann-fs"
                  type="number"
                  min={8}
                  max={36}
                  value={selectedAnnotation.fontSize || 12}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) {
                      onUpdateAnnotation(selectedAnnotation.id, {
                        fontSize: Math.max(8, Math.min(36, n)),
                      });
                    }
                  }}
                  className="cad-prop-input font-mono tabular-nums"
                />
              </div>

              <label htmlFor="ann-sw" className="cad-prop-label">
                Толщина линии
              </label>
              <div className="cad-prop-cell">
                <input
                  id="ann-sw"
                  data-testid="inspector-ann-stroke-width"
                  type="number"
                  step="0.2"
                  min="0.5"
                  max="6"
                  value={selectedAnnotation.strokeWidth ?? project.visualSettings.annotationStrokeWidth ?? 1.4}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) {
                      onUpdateAnnotation(selectedAnnotation.id, {
                        strokeWidth: Math.max(0.5, Math.min(6, n)),
                      });
                    }
                  }}
                  className="cad-prop-input font-mono tabular-nums"
                />
              </div>

              <label htmlFor="ann-style" className="cad-prop-label">
                Тип линии
              </label>
              <div className="cad-prop-cell">
                <select
                  id="ann-style"
                  data-testid="inspector-ann-stroke-style"
                  value={selectedAnnotation.strokeStyle ?? (selectedAnnotation.kind === 'rect' ? 'dashed' : 'solid')}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      strokeStyle: e.target.value as AnnotationStrokeStyle,
                    })
                  }
                  className="cad-prop-input"
                >
                  <option value="solid">Сплошная</option>
                  <option value="dashed">Штриховая</option>
                  <option value="dotted">Пунктир</option>
                </select>
              </div>

              <label htmlFor="ann-color" className="cad-prop-label">
                Цвет
              </label>
              <div className="cad-prop-cell px-1.5 gap-1.5">
                <input
                  id="ann-color"
                  type="color"
                  value={selectedAnnotation.color || '#0f172a'}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, { color: e.target.value })
                  }
                  className="w-5 h-4 border border-[var(--flux-line)] rounded-[1px] bg-transparent cursor-pointer shrink-0"
                />
                <span className="font-mono text-[10.5px] text-[var(--flux-text-muted)] truncate">
                  {selectedAnnotation.color || 'Авто'}
                </span>
                {selectedAnnotation.color && (
                  <button
                    type="button"
                    onClick={() => onUpdateAnnotation(selectedAnnotation.id, { color: undefined })}
                    title="Сбросить цвет"
                    className="ml-auto text-[10px] text-[var(--flux-accent)] hover:underline shrink-0"
                  >
                    Сброс
                  </button>
                )}
              </div>
            </div>

            <div className="p-1.5">
              <button
                type="button"
                onClick={() => onDeleteAnnotation(selectedAnnotation.id)}
                className="w-full h-6 rounded-[2px] border border-rose-500/40 bg-rose-500/5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 text-[10.5px] font-medium"
              >
                Удалить аннотацию
              </button>
            </div>
          </fieldset>
        ) : activeSheet ? (
          <div className="min-w-0">
            <div className="p-1.5 space-y-1 border-b border-[var(--flux-line)] bg-[var(--flux-surface)]">
              <p className="text-[10.5px] leading-snug text-[var(--flux-text-muted)] px-0.5">
                Выберите элемент или провод на схеме либо настройте параметры листа ГОСТ 2.104.
              </p>
              {(onOpenStampEditor || onOpenStampDesigner) && (
                <div className="grid grid-cols-2 gap-1">
                  {onOpenStampEditor && (
                    <button
                      type="button"
                      disabled={activeLayerLocked}
                      data-testid="inspector-open-stamp-btn"
                      onClick={() => onOpenStampEditor(activeSheet.id)}
                      className="inline-flex items-center justify-center gap-1 h-6 px-1.5 rounded-[2px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[10.5px] font-medium whitespace-nowrap truncate disabled:opacity-45 transition-colors"
                    >
                      <Type className="w-3 h-3 shrink-0" />
                      <span className="truncate">Заполнить штамп</span>
                    </button>
                  )}
                  {onOpenStampDesigner && (
                    <button
                      type="button"
                      onClick={() => onOpenStampDesigner(activeSheet.id)}
                      data-testid="inspector-open-designer-btn"
                      className="inline-flex items-center justify-center gap-1 h-6 px-1.5 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[10.5px] font-medium whitespace-nowrap truncate transition-colors"
                    >
                      <LayoutTemplate className="w-3 h-3 text-[var(--flux-text-muted)] shrink-0" />
                      <span className="truncate">Конструктор</span>
                    </button>
                  )}
                </div>
              )}
              {onOpenBomPanel && (
                <button
                  type="button"
                  data-testid="inspector-open-bom-btn"
                  onClick={onOpenBomPanel}
                  className="w-full inline-flex items-center justify-center gap-1.5 h-6 px-2 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface-alt)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[10.5px] font-medium whitespace-nowrap transition-colors"
                >
                  <FileSpreadsheet className="w-3 h-3 text-[var(--flux-text-muted)] shrink-0" />
                  <span>Открыть спецификацию ПЭ3</span>
                </button>
              )}
            </div>

            <fieldset disabled={activeLayerLocked} className="min-w-0 disabled:opacity-65">
              <div className="cad-prop-section">
                <span>Основная надпись ГОСТ 2.104</span>
              </div>
              <div className="cad-prop-grid">
                <label htmlFor="sheet-stamp-form" className="cad-prop-label">
                  Форма штампа
                </label>
                <div className="cad-prop-cell">
                  <select
                    id="sheet-stamp-form"
                    value={
                      activeSheet.titleBlock.stampForm === 'custom' && activeSheet.titleBlock.customTemplateId
                        ? `custom:${activeSheet.titleBlock.customTemplateId}`
                        : activeSheet.titleBlock.stampForm === 'form2a' ||
                            (activeSheet.titleBlock.stampForm === undefined && activeSheet.number > 1)
                          ? 'form2a'
                          : 'form1'
                    }
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.startsWith('custom:')) {
                        onUpdateSheetTitle(activeSheet.id, {
                          stampForm: 'custom',
                          customTemplateId: val.slice('custom:'.length),
                        });
                      } else {
                        onUpdateSheetTitle(activeSheet.id, {
                          stampForm: val as 'form1' | 'form2a',
                          customTemplateId: undefined,
                        });
                      }
                    }}
                    className="cad-prop-input"
                  >
                    <optgroup label="Стандарт ГОСТ 2.104">
                      <option value="form1">Форма 1 (первый лист)</option>
                      <option value="form2a">Форма 2а (последующие листы)</option>
                    </optgroup>
                    {customTemplates.length > 0 && (
                      <optgroup label="Пользовательские и шаблоны">
                        {customTemplates.map((tpl) => (
                          <option key={tpl.id} value={`custom:${tpl.id}`}>
                            {tpl.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <label htmlFor="sheet-doc" className="cad-prop-label">
                  Обозначение
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="sheet-doc"
                    type="text"
                    spellCheck={false}
                    value={activeSheet.titleBlock.documentCode}
                    onChange={(e) =>
                      onUpdateSheetTitle(activeSheet.id, { documentCode: e.target.value })
                    }
                    className="cad-prop-input font-mono"
                  />
                </div>

                <label htmlFor="sheet-proj-title" className="cad-prop-label" title="Наименование проекта (Графа 1)">
                  Проект (Гр.1)
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="sheet-proj-title"
                    type="text"
                    value={activeSheet.titleBlock.projectTitle ?? project.name}
                    onChange={(e) =>
                      onUpdateSheetTitle(activeSheet.id, { projectTitle: e.target.value })
                    }
                    className="cad-prop-input"
                  />
                </div>

                <label htmlFor="sheet-title" className="cad-prop-label">
                  Наим. листа
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="sheet-title"
                    type="text"
                    value={activeSheet.titleBlock.sheetTitle}
                    onChange={(e) =>
                      onUpdateSheetTitle(activeSheet.id, { sheetTitle: e.target.value })
                    }
                    className="cad-prop-input"
                  />
                </div>

                <label htmlFor="sheet-org" className="cad-prop-label" title="Организация (Графа 9)">
                  Организация
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="sheet-org"
                    type="text"
                    value={activeSheet.titleBlock.organization}
                    onChange={(e) =>
                      onUpdateSheetTitle(activeSheet.id, { organization: e.target.value })
                    }
                    className="cad-prop-input"
                  />
                </div>

                <label htmlFor="sheet-des" className="cad-prop-label">
                  Разработал
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="sheet-des"
                    type="text"
                    value={activeSheet.titleBlock.designer}
                    onChange={(e) =>
                      onUpdateSheetTitle(activeSheet.id, { designer: e.target.value })
                    }
                    className="cad-prop-input"
                  />
                </div>

                <label htmlFor="sheet-chk" className="cad-prop-label">
                  Проверил
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="sheet-chk"
                    type="text"
                    value={activeSheet.titleBlock.checker}
                    onChange={(e) =>
                      onUpdateSheetTitle(activeSheet.id, { checker: e.target.value })
                    }
                    className="cad-prop-input"
                  />
                </div>

                <label htmlFor="sheet-nchk" className="cad-prop-label">
                  Н. контроль
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="sheet-nchk"
                    type="text"
                    value={activeSheet.titleBlock.normControl || ''}
                    onChange={(e) =>
                      onUpdateSheetTitle(activeSheet.id, { normControl: e.target.value })
                    }
                    className="cad-prop-input"
                  />
                </div>

                <label htmlFor="sheet-appr" className="cad-prop-label">
                  Утвердил
                </label>
                <div className="cad-prop-cell">
                  <input
                    id="sheet-appr"
                    type="text"
                    value={activeSheet.titleBlock.approver || ''}
                    onChange={(e) =>
                      onUpdateSheetTitle(activeSheet.id, { approver: e.target.value })
                    }
                    className="cad-prop-input"
                  />
                </div>
              </div>
            </fieldset>

            <div className="cad-prop-section">
              <span>Параметры листа и проект</span>
            </div>
            <div className="cad-prop-grid">
              <label htmlFor="sheet-format-sel" className="cad-prop-label">
                Формат (ГОСТ)
              </label>
              <div className="cad-prop-cell">
                <select
                  id="sheet-format-sel"
                  value={activeSheet.format}
                  onChange={(e) => onUpdateSheetFormat(activeSheet.id, e.target.value as SheetFormat)}
                  className="cad-prop-input"
                >
                  {(Object.keys(SHEET_DIMENSIONS) as SheetFormat[]).map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {SHEET_DIMENSIONS[fmt].label}
                    </option>
                  ))}
                </select>
              </div>

              <label htmlFor="sheet-font-sel" className="cad-prop-label">
                Шрифт схемы
              </label>
              <div className="cad-prop-cell">
                <select
                  id="sheet-font-sel"
                  value={project.visualSettings.fontFamily || 'GOST'}
                  onChange={(e) => onUpdateFontFamily(e.target.value as SchematicFontFamily)}
                  className="cad-prop-input"
                >
                  {SCHEMATIC_FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>

              <span className="cad-prop-label">FLUX_PROJECT</span>
              <div className="cad-prop-cell px-1.5 font-mono text-[11px] text-[var(--flux-text)] truncate">
                {project.fluxProjectKey}
              </div>

              <span className="cad-prop-label">Габарит (мм)</span>
              <div className="cad-prop-cell px-1.5 font-mono tabular-nums text-[11px] text-[var(--flux-text)]">
                {activeSheet.width}×{activeSheet.height} ({activeSheet.format})
              </div>
            </div>

            {(() => {
              const currentSheetRev = getSheetRevisionNumber(activeSheet);
              const currentRevLabel = getSheetRevisionLabel(activeSheet);
              const releasedCount = getReleasedSheetRevisions(activeSheet).length;
              const isDirty = hasSheetUncommittedChanges(project, activeSheet);
              const sheetHistory = activeSheet.revisions || [];
              const reversedHistory = [...sheetHistory].reverse();
              const fmtTime = (iso: string) => {
                try {
                  return new Date(iso).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                } catch {
                  return iso;
                }
              };
              const submitRelease = (e: React.FormEvent) => {
                e.preventDefault();
                if (!releaseCode.trim() || !onReleaseSheetRevision) return;
                onReleaseSheetRevision(activeSheet.id, {
                  revisionLabel: releaseCode.trim(),
                  changeDoc: releaseDoc.trim() || undefined,
                  comment: releaseNote.trim() || undefined,
                });
                setReleaseCode('');
                setReleaseDoc('');
                setReleaseNote('');
              };
              return (
                <div ref={sheetHistoryRef} data-testid="sheet-history-panel">
                  <div className="cad-prop-section">
                    <span className="inline-flex items-center gap-1">
                      <History className="w-3 h-3 text-[var(--flux-accent)]" />
                      <span>Ревизии листа</span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-[10px]">
                      <span data-testid="sheet-revision-badge" className="text-[var(--flux-accent)] font-semibold">
                        {currentRevLabel}
                      </span>
                      <span className="text-[var(--flux-text-muted)]">· вып. {releasedCount}</span>
                    </span>
                  </div>

                  <div className="p-1.5 space-y-1.5 bg-[var(--flux-bg)]">
                    {isDirty && (
                      <div
                        data-testid="sheet-uncommitted-badge"
                        className="px-2 py-1 rounded-[2px] border border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300 leading-snug"
                      >
                        Есть невыпущенные правки. Выпустите ревизию, чтобы зафиксировать снимок.
                      </div>
                    )}

                    {onReleaseSheetRevision && (
                      <form
                        onSubmit={submitRelease}
                        className="p-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] space-y-1"
                      >
                        <div className="text-[10.5px] font-semibold text-[var(--flux-text)]">
                          Выпуск ревизии листа
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="text"
                            spellCheck={false}
                            data-testid="release-revision-code-input"
                            value={releaseCode}
                            onChange={(e) => setReleaseCode(e.target.value)}
                            placeholder="Изм. (1, 2, А…)"
                            aria-label="Код ревизии (Изм.)"
                            className="h-[22px] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10.5px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                          />
                          <input
                            type="text"
                            spellCheck={false}
                            data-testid="release-revision-doc-input"
                            value={releaseDoc}
                            onChange={(e) => setReleaseDoc(e.target.value)}
                            placeholder="№ докум."
                            aria-label="Номер документа изменения"
                            className="h-[22px] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[10.5px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            data-testid="release-revision-note-input"
                            value={releaseNote}
                            onChange={(e) => setReleaseNote(e.target.value)}
                            placeholder="Примечание к выпуску…"
                            aria-label="Примечание к ревизии"
                            className="flex-1 min-w-0 h-[22px] px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[10.5px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                          />
                          <button
                            type="submit"
                            data-testid="release-revision-submit-btn"
                            disabled={!releaseCode.trim() || activeLayerLocked}
                            className="h-[22px] px-2 rounded-[2px] bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[10.5px] font-medium whitespace-nowrap shrink-0 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                          >
                            Выпустить
                          </button>
                        </div>
                      </form>
                    )}

                    <div
                      data-testid="sheet-history-list"
                      className="max-h-[240px] overflow-y-auto border border-[var(--flux-line)] rounded-[2px] bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)]"
                    >
                      {reversedHistory.length === 0 ? (
                        <div className="px-2 py-1 text-[10.5px] text-[var(--flux-text-muted)]">
                          Базовая ревизия {currentRevLabel}
                        </div>
                      ) : (
                        reversedHistory.map((entry) => {
                          const isCurrent = entry.revision === currentSheetRev;
                          const canRestore = Boolean(
                            entry.snapshot && onRestoreSheetRevision && (!isCurrent || isDirty)
                          );
                          const isReleasedEntry = Boolean(
                            entry.released || (entry.revisionLabel && entry.revisionLabel !== '0')
                          );
                          return (
                            <div
                              key={`${activeSheet.id}-rev-${entry.revision}`}
                              data-testid={`sheet-rev-item-${entry.revision}`}
                              className={`px-2 py-1 text-[10.5px] space-y-0.5 ${
                                isCurrent ? 'bg-[var(--flux-sel)]/60 border-l-2 border-l-[var(--flux-accent)]' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className={`font-mono tabular-nums text-[10.5px] font-semibold shrink-0 ${
                                      isCurrent
                                        ? 'text-[var(--flux-accent)]'
                                        : 'text-[var(--flux-text)]'
                                    }`}
                                  >
                                    {isReleasedEntry
                                      ? `Изм.${entry.revisionLabel || entry.revision}`
                                      : `База v${entry.revision}`}
                                  </span>
                                  <span className="font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)] truncate">
                                    {entry.changeDate ? `${entry.changeDate} · ` : ''}
                                    {fmtTime(entry.timestamp)}
                                  </span>
                                </div>
                                {canRestore && (
                                  <button
                                    type="button"
                                    data-testid={`restore-sheet-rev-${entry.revision}`}
                                    onClick={() => onRestoreSheetRevision?.(activeSheet.id, entry.revision)}
                                    title={`Откатить лист к снимку ${isReleasedEntry ? `Изм.${entry.revisionLabel || entry.revision}` : `v${entry.revision}`}`}
                                    className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[10px] font-medium text-[var(--flux-text)] shrink-0 transition-colors"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" />
                                    <span>Откатить</span>
                                  </button>
                                )}
                              </div>
                              <div className="text-[11px] text-[var(--flux-text)] leading-snug break-words">
                                {entry.summary}
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5 font-mono text-[10px] text-[var(--flux-text-muted)]">
                                <div className="flex flex-wrap items-center gap-1">
                                  {entry.changeDoc && (
                                    <span className="text-[var(--flux-text)] font-medium">
                                      {entry.changeDoc}
                                    </span>
                                  )}
                                  {entry.changedAreas.length > 0 && (
                                    <span className="font-sans">
                                      {entry.changedAreas.map((area) => SHEET_CHANGE_AREA_LABELS[area] || area).join(', ')}
                                    </span>
                                  )}
                                </div>
                                <span className="truncate">
                                  {entry.author} · r{entry.projectRevision}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div
            data-testid="inspector-no-sheet-empty"
            className="p-3 space-y-2 text-[11.5px] leading-relaxed text-[var(--flux-text-muted)]"
          >
            <div className="font-semibold text-[var(--flux-text)]">Нет открытого листа на холсте</div>
            <p>
              Все вкладки листов закрыты. Откройте любой лист проекта из дерева «Проект и База» слева или прямо на пустом холсте.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
});
RightInspector.displayName = 'RightInspector';
