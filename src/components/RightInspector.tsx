import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
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

export const RightInspector: React.FC<RightInspectorProps> = ({
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
  const isSheetMode = !isMultiSelection && !selectedDevice && !selectedWire && !selectedAnnotation;

  useEffect(() => {
    if (!pendingScrollToHistory || !isSheetMode) return;
    const raf = requestAnimationFrame(() => {
      sheetHistoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingScrollToHistory(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollToHistory, isSheetMode]);

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
      className="no-print w-full h-full flex-1 min-w-0 max-w-full bg-[var(--flux-bg)] flex flex-col min-h-0 overflow-x-hidden select-none"
    >
      <div className="px-3 h-8 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-1.5 shrink-0">
        <span className="text-[12px] font-semibold text-[var(--flux-text)] truncate">
          {isMultiSelection
            ? `Группа: ${totalSelectedCount} об.`
            : selectedDevice
              ? `Элемент ${selectedDevice.designation}`
              : selectedWire
                ? `Цепь ${selectedWire.netName}`
                : selectedAnnotation
                  ? `Аннотация (${selectedAnnotation.kind === 'rect' ? 'Зона' : selectedAnnotation.kind === 'callout' ? 'Выноска' : 'Текст'})`
                  : 'Параметры листа'}
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
              className="inline-flex items-center gap-1 px-1.5 h-6 rounded hover:bg-[var(--flux-hover)] font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] transition-colors shrink-0"
            >
              <span className="max-w-[78px] truncate">{selectedDevice.elementId}</span>
              {copiedElId ? (
                <Check className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 shrink-0" />
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
                className="inline-flex items-center gap-1 px-1.5 h-6 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] transition-colors shrink-0"
              >
                <History className="w-3 h-3 text-[var(--flux-accent)] shrink-0" />
                <span>
                  {revLabel}
                  {dirty ? '*' : ''}
                </span>
              </button>
            );
          })()}
        </div>
      </div>

      <motion.div
        key={
          isMultiSelection
            ? `multi-${totalSelectedCount}`
            : selectedDevice?.id || selectedWire?.id || selectedAnnotation?.id || `sheet-${activeSheet?.id || 'none'}`
        }
        initial={{ opacity: 0.65, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-4"
      >
        {activeLayerLocked && (
          <div
            data-testid="inspector-layer-locked-banner"
            className="px-2.5 py-2 rounded border border-amber-500/50 bg-amber-500/10 flex items-center justify-between gap-2 text-[11px]"
          >
            <div className="flex items-center gap-2 min-w-0 text-amber-700 dark:text-amber-300">
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
                className="h-6 px-2 rounded border border-amber-500/60 bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] shrink-0 transition-colors"
              >
                Разблокировать
              </button>
            )}
          </div>
        )}

        {isMultiSelection ? (
          <div data-testid="inspector-multi-selection" className="space-y-4">
            <div className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] space-y-1.5">
              <div className="text-[11px] font-semibold text-[var(--flux-text)]">
                Состав выделения
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                <div className="px-2 py-1 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] text-center">
                  <div className="font-mono font-semibold text-[var(--flux-text)]">{selectedDeviceIds.length}</div>
                  <div className="text-[10px] text-[var(--flux-text-muted)]">Изделий</div>
                </div>
                <div className="px-2 py-1 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] text-center">
                  <div className="font-mono font-semibold text-[var(--flux-text)]">{selectedWireIds.length}</div>
                  <div className="text-[10px] text-[var(--flux-text-muted)]">Цепей</div>
                </div>
                <div className="px-2 py-1 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] text-center">
                  <div className="font-mono font-semibold text-[var(--flux-text)]">{selectedAnnotationIds.length}</div>
                  <div className="text-[10px] text-[var(--flux-text-muted)]">Аннот.</div>
                </div>
              </div>
            </div>

            {selectedDeviceIds.length >= 2 && onAlignDevices && (
              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold text-[var(--flux-text)] pb-1 border-b border-[var(--flux-line)]">
                  Выравнивание группы изделий
                </h3>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    data-testid="align-left-btn"
                    onClick={() => onAlignDevices('left')}
                    title="Выровнять по левому краю"
                    className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[11px] text-[var(--flux-text)]"
                  >
                    <AlignStartVertical className="w-3.5 h-3.5" />
                    <span>Лево</span>
                  </button>
                  <button
                    type="button"
                    data-testid="align-center-x-btn"
                    onClick={() => onAlignDevices('center-x')}
                    title="Выровнять по центру X"
                    className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[11px] text-[var(--flux-text)]"
                  >
                    <AlignCenterVertical className="w-3.5 h-3.5" />
                    <span>Центр X</span>
                  </button>
                  <button
                    type="button"
                    data-testid="align-right-btn"
                    onClick={() => onAlignDevices('right')}
                    title="Выровнять по правому краю"
                    className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[11px] text-[var(--flux-text)]"
                  >
                    <AlignEndVertical className="w-3.5 h-3.5" />
                    <span>Право</span>
                  </button>
                  <button
                    type="button"
                    data-testid="align-top-btn"
                    onClick={() => onAlignDevices('top')}
                    title="Выровнять по верхнему краю"
                    className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[11px] text-[var(--flux-text)]"
                  >
                    <AlignStartHorizontal className="w-3.5 h-3.5" />
                    <span>Верх</span>
                  </button>
                  <button
                    type="button"
                    data-testid="align-center-y-btn"
                    onClick={() => onAlignDevices('center-y')}
                    title="Выровнять по центру Y"
                    className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[11px] text-[var(--flux-text)]"
                  >
                    <AlignCenterHorizontal className="w-3.5 h-3.5" />
                    <span>Центр Y</span>
                  </button>
                  <button
                    type="button"
                    data-testid="align-bottom-btn"
                    onClick={() => onAlignDevices('bottom')}
                    title="Выровнять по нижнему краю"
                    className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[11px] text-[var(--flux-text)]"
                  >
                    <AlignEndHorizontal className="w-3.5 h-3.5" />
                    <span>Низ</span>
                  </button>
                </div>

                {selectedDeviceIds.length >= 3 && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      data-testid="distribute-x-btn"
                      onClick={() => onAlignDevices('distribute-x')}
                      className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[11px] text-[var(--flux-text)]"
                    >
                      <AlignHorizontalDistributeCenter className="w-3.5 h-3.5" />
                      <span>Шаг по X</span>
                    </button>
                    <button
                      type="button"
                      data-testid="distribute-y-btn"
                      onClick={() => onAlignDevices('distribute-y')}
                      className="h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1 text-[11px] text-[var(--flux-text)]"
                    >
                      <AlignVerticalDistributeCenter className="w-3.5 h-3.5" />
                      <span>Шаг по Y</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5 pt-1">
              {selectedDeviceIds.length > 0 && onRotateSelected && (
                <button
                  type="button"
                  data-testid="multi-rotate-btn"
                  onClick={onRotateSelected}
                  className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] inline-flex items-center justify-center gap-1.5 text-[11.5px] font-medium text-[var(--flux-text)]"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Повернуть изделия на 90° (R)</span>
                </button>
              )}
              {(selectedDeviceIds.length > 0 || selectedAnnotationIds.length > 0) && onDuplicateSelected && (
                <button
                  type="button"
                  data-testid="multi-duplicate-btn"
                  onClick={onDuplicateSelected}
                  className="w-full h-8 px-2.5 rounded border border-[var(--flux-accent)]/50 bg-[var(--flux-accent-soft)] hover:bg-[var(--flux-sel)] inline-flex items-center justify-center gap-1.5 text-[11.5px] font-medium text-[var(--flux-accent)]"
                >
                  <CopyPlus className="w-3.5 h-3.5" />
                  <span>Дублировать группу (Ctrl+D)</span>
                </button>
              )}
              {onDeleteSelected && (
                <button
                  type="button"
                  data-testid="multi-delete-btn"
                  onClick={onDeleteSelected}
                  className="w-full h-8 px-2.5 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 inline-flex items-center justify-center gap-1.5 text-[11.5px] font-medium text-rose-600 dark:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Удалить выделенные (Del)</span>
                </button>
              )}
              {onClearSelection && (
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="w-full h-7 rounded text-[11px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
                >
                  Снять выделение
                </button>
              )}
            </div>
          </div>
        ) : selectedDevice ? (
          <>
            {/* Integral E3 / Flux Component Summary & Save to Base */}
            <div className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[var(--flux-text)] truncate">
                  Изделие E3 · {selectedDevice.attributes.length} атр. · {selectedDevice.pins.length} выв.
                </div>
                <div className="text-[10px] font-mono text-[var(--flux-text-muted)] truncate">
                  {selectedDevice.e3BlockName || selectedDevice.article}
                </div>
              </div>
              {onSaveDeviceToCatalog && (
                <button
                  type="button"
                  onClick={() => onSaveDeviceToCatalog(selectedDevice)}
                  title="Сохранить изделие со всеми атрибутами и выводами в базу компонентов"
                  className="inline-flex items-center gap-1 h-7 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0 transition-colors"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-[var(--flux-text-muted)]" />
                  <span>В базу</span>
                </button>
              )}
            </div>

            <fieldset disabled={activeLayerLocked} className="space-y-4 min-w-0 disabled:opacity-65">
            {/* Device Core Identity */}
            <div className="space-y-2.5">
              <h3 className="text-[11px] font-semibold text-[var(--flux-text)] pb-1 border-b border-[var(--flux-line)]">
                Идентификация и позиция
              </h3>
              <div>
                <label
                  htmlFor="insp-designation"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Позиционное обозначение (Device Designation)
                </label>
                <input
                  id="insp-designation"
                  type="text"
                  value={selectedDevice.designation}
                  onChange={(e) => onUpdateDevice(selectedDevice.id, { designation: e.target.value })}
                  className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                />
              </div>

              <div>
                <label
                  htmlFor="insp-name"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Наименование (ГОСТ / ПЭ3)
                </label>
                <input
                  id="insp-name"
                  type="text"
                  value={selectedDevice.componentName}
                  onChange={(e) => onUpdateDevice(selectedDevice.id, { componentName: e.target.value })}
                  className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="insp-article"
                    className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                  >
                    Артикул
                  </label>
                  <input
                    id="insp-article"
                    type="text"
                    value={selectedDevice.article}
                    onChange={(e) => onUpdateDevice(selectedDevice.id, { article: e.target.value })}
                    className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="insp-mfr"
                    className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                  >
                    Производитель
                  </label>
                  <input
                    id="insp-mfr"
                    type="text"
                    value={selectedDevice.manufacturer}
                    onChange={(e) => onUpdateDevice(selectedDevice.id, { manufacturer: e.target.value })}
                    className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label
                    htmlFor="insp-x"
                    className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                  >
                    X (мм)
                  </label>
                  <input
                    id="insp-x"
                    type="number"
                    value={selectedDevice.x}
                    onChange={(e) =>
                      onUpdateDevice(selectedDevice.id, { x: Number(e.target.value) || 0 })
                    }
                    className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[12px] text-[var(--flux-text)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="insp-y"
                    className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                  >
                    Y (мм)
                  </label>
                  <input
                    id="insp-y"
                    type="number"
                    value={selectedDevice.y}
                    onChange={(e) =>
                      onUpdateDevice(selectedDevice.id, { y: Number(e.target.value) || 0 })
                    }
                    className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[12px] text-[var(--flux-text)]"
                  />
                </div>
                <div>
                  <span className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                    Поворот
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDevice(selectedDevice.id, {
                        rotation: ((selectedDevice.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                      })
                    }
                    className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] font-mono tabular-nums text-[12px] text-[var(--flux-text)] inline-flex items-center justify-center gap-1"
                  >
                    <RotateCw className="w-3 h-3" />
                    <span>{selectedDevice.rotation}°</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label
                    htmlFor="insp-e3block"
                    className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                  >
                    Блок E3.series
                  </label>
                  <input
                    id="insp-e3block"
                    type="text"
                    value={selectedDevice.e3BlockName}
                    onChange={(e) => onUpdateDevice(selectedDevice.id, { e3BlockName: e.target.value })}
                    className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="insp-state"
                    className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                  >
                    Статус E3ProMax
                  </label>
                  <select
                    id="insp-state"
                    value={selectedDevice.bindingState}
                    onChange={(e) =>
                      onUpdateDevice(selectedDevice.id, {
                        bindingState: e.target.value as E3Device['bindingState'],
                      })
                    }
                    className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                  >
                    <option value="PLACED">В схеме</option>
                    <option value="MODIFIED">Изменено</option>
                    <option value="DETACHED">Отвязано</option>
                    <option value="REMOVED_IN_FLUX">Снято</option>
                  </select>
                </div>
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
                <div
                  data-testid="inspector-offpage-panel"
                  className="pt-3 border-t border-[var(--flux-line)] space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--flux-text)]">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                      <span>Межлистовая ссылка (E3.series)</span>
                    </h3>
                    <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] whitespace-nowrap shrink-0">
                      {link?.addressText || (meta.direction === 'out' ? '→ Л.?' : '← Л.?')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="insp-offpage-dir"
                        className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                      >
                        Направление
                      </label>
                      <select
                        id="insp-offpage-dir"
                        data-testid="inspector-offpage-dir"
                        value={meta.direction}
                        onChange={(e) =>
                          onUpdateOffPageMeta?.(selectedDevice.id, {
                            direction: e.target.value as 'out' | 'in',
                          })
                        }
                        className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                      >
                        <option value="out">Исходящая (→)</option>
                        <option value="in">Входящая (←)</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="insp-offpage-sig"
                        className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                      >
                        Потенциал / тип
                      </label>
                      <select
                        id="insp-offpage-sig"
                        value={meta.signalType}
                        onChange={(e) =>
                          onUpdateOffPageMeta?.(selectedDevice.id, {
                            signalType: e.target.value as SignalType,
                          })
                        }
                        className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
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
                  </div>

                  <div>
                    <label
                      htmlFor="insp-offpage-potential"
                      className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                    >
                      Имя потенциала / цепи
                    </label>
                    <input
                      id="insp-offpage-potential"
                      data-testid="inspector-offpage-potential"
                      type="text"
                      list="offpage-potential-nets"
                      value={meta.potentialName}
                      onChange={(e) =>
                        onUpdateOffPageMeta?.(selectedDevice.id, {
                          potentialName: e.target.value,
                        })
                      }
                      className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                    />
                    <datalist id="offpage-potential-nets">
                      {uniqueNets.map((net) => (
                        <option key={net} value={net} />
                      ))}
                    </datalist>
                  </div>

                  <div className="px-2.5 py-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-[var(--flux-text-muted)]">
                      <span>Текущая зона ГОСТ:</span>
                      <span className="font-mono font-semibold text-[var(--flux-text)]">
                        Л.{link?.sheetNumber ?? 1} ({link?.ownZone ?? 'А1'})
                      </span>
                    </div>
                    {link?.counterparts && link.counterparts.length > 0 ? (
                      <div className="text-[var(--flux-text-muted)]">
                        Ответная:{' '}
                        <span className="font-mono font-semibold text-[var(--flux-text)]">
                          {link.counterparts
                            .map((cp) => `${cp.designation} · Л.${cp.sheetNumber} (${cp.zone})`)
                            .join(', ')}
                        </span>
                      </div>
                    ) : (
                      <div className="text-amber-600 dark:text-amber-400">
                        Ответная ссылка не найдена. Создайте парную ниже или задайте совпадающий потенциал.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      data-testid="inspector-offpage-jump-btn"
                      disabled={!link?.primaryCounterpart}
                      onClick={() => onNavigateOffPage?.(selectedDevice)}
                      className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded border border-[var(--flux-accent)]/70 bg-[var(--flux-accent-soft)] hover:bg-[var(--flux-accent)] hover:text-white text-[var(--flux-text)] text-[12px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Перейти на ответный лист</span>
                    </button>

                    <button
                      type="button"
                      data-testid="inspector-highlight-potential-btn"
                      onClick={() => onHighlightPotential?.({ deviceId: selectedDevice.id })}
                      className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[12px] font-medium"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>Подсветить весь потенциал</span>
                    </button>

                    {otherSheets.length > 0 && onCreateOffPageCounterpart && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <select
                          aria-label="Целевой лист для ответной ссылки"
                          data-testid="inspector-offpage-target-sheet"
                          value={targetSheetId}
                          onChange={(e) => setCounterpartSheetId(e.target.value)}
                          className="flex-1 min-w-0 h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)]"
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
                          className="h-8 px-2.5 shrink-0 inline-flex items-center gap-1 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[11.5px] font-medium text-[var(--flux-text)]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Создать ответную</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* E3 Attributes Table */}
            <div className="pt-3 border-t border-[var(--flux-line)] space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-[var(--flux-text)]">
                  Атрибуты E3 / Flux
                </h3>
                <span className="font-mono text-[11px] text-[var(--flux-text-muted)]">
                  {selectedDevice.attributes.length}
                </span>
              </div>

              <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)] overflow-hidden">
                {selectedDevice.attributes.map((attr, idx) => (
                  <div
                    key={`${attr.name}-${idx}`}
                    className="px-2.5 py-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[var(--flux-text)] truncate">
                        {attr.name}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <select
                          aria-label={`Политика конфликта для ${attr.name}`}
                          value={attr.conflict}
                          onChange={(e) =>
                            handleAttrChange(idx, {
                              conflict: e.target.value as E3Attribute['conflict'],
                            })
                          }
                          className="h-5 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[10px] font-mono text-[var(--flux-text-muted)]"
                        >
                          <option value="flux">flux</option>
                          <option value="script">script</option>
                          <option value="ask">ask</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttr(idx)}
                          aria-label={`Удалить атрибут ${attr.name}`}
                          className="w-5 h-5 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      aria-label={`Значение атрибута ${attr.name}`}
                      value={attr.value}
                      onChange={(e) => handleAttrChange(idx, { value: e.target.value })}
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[12px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                    />
                  </div>
                ))}
              </div>

              {/* Add Attribute */}
              <form onSubmit={handleAddAttr} className="flex items-center gap-1 pt-1">
                <input
                  type="text"
                  value={newAttrName}
                  onChange={(e) => setNewAttrName(e.target.value)}
                  placeholder="Атрибут"
                  aria-label="Название нового атрибута"
                  className="w-1/2 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                />
                <input
                  type="text"
                  value={newAttrValue}
                  onChange={(e) => setNewAttrValue(e.target.value)}
                  placeholder="Значение"
                  aria-label="Значение нового атрибута"
                  className="w-1/2 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                />
                <button
                  type="submit"
                  aria-label="Добавить атрибут"
                  className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            {/* Pin Connections Matrix */}
            <div className="pt-3 border-t border-[var(--flux-line)] space-y-2">
              <h3 className="text-[12px] font-semibold text-[var(--flux-text)]">
                Выводы и связи ({selectedDevice.pins.length})
              </h3>
              <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)]">
                {selectedDevice.pins.map((pin) => {
                  const wire = project.wires.find(
                    (w) =>
                      (w.fromDeviceId === selectedDevice.id && w.fromPinId === pin.id) ||
                      (w.toDeviceId === selectedDevice.id && w.toPinId === pin.id)
                  );
                  return (
                    <div key={pin.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[12px]">
                      <span className="font-mono font-medium text-[var(--flux-text)]">{pin.name}</span>
                      {wire ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[11px] text-[var(--flux-accent)] truncate">
                            {wire.netName} ({wire.wireNumber})
                          </span>
                          <button
                            type="button"
                            disabled={activeLayerLocked || wiresLocked}
                            onClick={() => onDeleteWire(wire.id)}
                            aria-label={`Отключить цепь от вывода ${pin.name}`}
                            className="text-[var(--flux-text-muted)] hover:text-rose-600 disabled:opacity-35"
                          >
                            <Unlink className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-[var(--flux-text-muted)]">Свободен</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            </fieldset>
          </>
        ) : selectedWire ? (
          <fieldset disabled={activeLayerLocked} className="space-y-3 min-w-0 disabled:opacity-65">
            <div>
              <label
                htmlFor="wire-net"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Имя цепи (Net)
              </label>
              <input
                id="wire-net"
                type="text"
                value={selectedWire.netName}
                onChange={(e) => onUpdateWire(selectedWire.id, { netName: e.target.value })}
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="wire-num"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Маркировка жилы
                </label>
                <input
                  id="wire-num"
                  type="text"
                  value={selectedWire.wireNumber}
                  onChange={(e) => onUpdateWire(selectedWire.id, { wireNumber: e.target.value })}
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label
                  htmlFor="wire-sec"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Сечение
                </label>
                <input
                  id="wire-sec"
                  type="text"
                  value={selectedWire.crossSection}
                  onChange={(e) => onUpdateWire(selectedWire.id, { crossSection: e.target.value })}
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="wire-sig"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Тип потенциала / сигнала
              </label>
              <select
                id="wire-sig"
                value={selectedWire.signalType}
                onChange={(e) =>
                  onUpdateWire(selectedWire.id, { signalType: e.target.value as SignalType })
                }
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
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

            <div>
              <label
                htmlFor="wire-cable"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Назначенный кабель
              </label>
              <select
                id="wire-cable"
                value={selectedWire.cableId || ''}
                onChange={(e) =>
                  onUpdateWire(selectedWire.id, { cableId: e.target.value || undefined })
                }
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
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
                <div className="px-2.5 py-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--flux-text-muted)]">
                    Трасса подключения
                  </div>
                  <div className="font-mono text-[var(--flux-text)] truncate">
                    {dFrom ? `${dFrom.designation}:${pFrom?.name || '?'}` : selectedWire.fromDeviceId} →{' '}
                    {dTo ? `${dTo.designation}:${pTo?.name || '?'}` : selectedWire.toDeviceId}
                  </div>
                  <div className="flex items-center justify-between pt-0.5 text-[10.5px]">
                    <span className="text-[var(--flux-text-muted)]">Режим трассировки:</span>
                    <span
                      data-testid="inspector-manual-route-badge"
                      data-manual={selectedWire.manualRoute ? 'true' : 'false'}
                      className={`font-medium px-1.5 py-0.5 rounded ${
                        selectedWire.manualRoute
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/40'
                          : 'bg-[var(--flux-surface)] text-[var(--flux-text-muted)] border border-[var(--flux-line)]'
                      }`}
                    >
                      {selectedWire.manualRoute ? 'Ручная трасса' : 'Автотрасса'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {onHighlightPotential && (
              <button
                type="button"
                data-testid="inspector-highlight-net-btn"
                onClick={() => onHighlightPotential({ wireId: selectedWire.id })}
                className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded border border-amber-400/70 bg-amber-500/10 hover:bg-amber-500 hover:text-white text-[var(--flux-text)] text-[12px] font-medium transition-colors"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Подсветить весь потенциал</span>
              </button>
            )}

            {onRerouteWire && (
              <button
                type="button"
                data-testid="inspector-reroute-wire-btn"
                onClick={() => onRerouteWire(selectedWire.id)}
                className="w-full h-8 inline-flex items-center justify-center gap-1.5 rounded border border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)] hover:bg-[var(--flux-accent)] hover:text-white text-[var(--flux-text)] text-[12px] font-medium transition-colors"
              >
                <Workflow className="w-3.5 h-3.5" />
                <span>{selectedWire.manualRoute ? 'Перестроить (сброс ручной)' : 'Перестроить трассу'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onDeleteWire(selectedWire.id)}
              className="w-full h-8 rounded border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[12px] font-medium"
            >
              Удалить соединение
            </button>
          </fieldset>
        ) : selectedAnnotation ? (
          <fieldset disabled={activeLayerLocked} className="space-y-3 min-w-0 disabled:opacity-65">
            <div>
              <label
                htmlFor="ann-kind"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Тип черчения / аннотации
              </label>
              <select
                id="ann-kind"
                value={selectedAnnotation.kind}
                onChange={(e) =>
                  onUpdateAnnotation(selectedAnnotation.id, { kind: e.target.value as AnnotationKind })
                }
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
              >
                <option value="text">Текстовая надпись</option>
                <option value="callout">Выноска со стрелкой</option>
                <option value="rect">Рамка / Зона шкафа</option>
                <option value="bom_table">Таблица ПЭ3 (ГОСТ 2.701)</option>
                <option value="cable_table">Кабельный журнал (таблица)</option>
              </select>
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
                  <div
                    data-testid="inspector-gost-table-panel"
                    className="p-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[var(--flux-text)]">
                        Автообновляемая таблица ГОСТ
                      </span>
                      <span className="font-mono text-[10.5px] text-[var(--flux-accent)]">
                        {tableModel.totalRows} стр. · {tableModel.width}×{tableModel.height}
                      </span>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                        Заголовок таблицы
                      </label>
                      <input
                        type="text"
                        data-testid="inspector-table-title-input"
                        value={cfg.title ?? selectedAnnotation.text ?? ''}
                        onChange={(e) => {
                          onUpdateAnnotation(selectedAnnotation.id, {
                            text: e.target.value,
                            tableConfig: { ...cfg, title: e.target.value },
                          });
                        }}
                        className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[12px] text-[var(--flux-text)]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-1">
                          Макс. строк (0 = все)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={200}
                          data-testid="inspector-table-maxrows-input"
                          value={cfg.maxRows ?? 0}
                          onChange={(e) =>
                            updateCfg({ maxRows: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11.5px] text-[var(--flux-text)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-1">
                          Высота строки (мм)
                        </label>
                        <input
                          type="number"
                          min={18}
                          max={36}
                          value={cfg.rowHeight ?? 22}
                          onChange={(e) =>
                            updateCfg({
                              rowHeight: Math.max(18, Math.min(36, Number(e.target.value) || 22)),
                            })
                          }
                          className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11.5px] text-[var(--flux-text)]"
                        />
                      </div>
                    </div>
                    {selectedAnnotation.kind === 'bom_table' && (
                      <label className="flex items-center gap-2 text-[11.5px] text-[var(--flux-text)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          data-testid="inspector-table-sheetonly-checkbox"
                          checked={Boolean(cfg.sheetOnly)}
                          onChange={(e) => updateCfg({ sheetOnly: e.target.checked })}
                          className="rounded border-[var(--flux-line-strong)] accent-[var(--flux-accent)]"
                        />
                        <span>Только аппараты текущего листа</span>
                      </label>
                    )}
                  </div>
                );
              })()
            ) : (
              <div>
                <label
                  htmlFor="ann-text"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
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
                  className="w-full p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor="ann-x"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  X (мм)
                </label>
                <input
                  id="ann-x"
                  type="number"
                  value={selectedAnnotation.x}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, { x: Number(e.target.value) || 0 })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ann-y"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Y (мм)
                </label>
                <input
                  id="ann-y"
                  type="number"
                  value={selectedAnnotation.y}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, { y: Number(e.target.value) || 0 })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label
                  htmlFor="ann-w"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Ширина
                </label>
                <input
                  id="ann-w"
                  type="number"
                  value={selectedAnnotation.width}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      width: Math.max(40, Number(e.target.value) || 120),
                    })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ann-h"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Высота
                </label>
                <input
                  id="ann-h"
                  type="number"
                  value={selectedAnnotation.height}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      height: Math.max(24, Number(e.target.value) || 60),
                    })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ann-fs"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Шрифт
                </label>
                <input
                  id="ann-fs"
                  type="number"
                  value={selectedAnnotation.fontSize || 12}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      fontSize: Math.max(8, Math.min(36, Number(e.target.value) || 12)),
                    })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label
                  htmlFor="ann-sw"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Толщина
                </label>
                <input
                  id="ann-sw"
                  data-testid="inspector-ann-stroke-width"
                  type="number"
                  step="0.2"
                  min="0.5"
                  max="6"
                  value={selectedAnnotation.strokeWidth ?? project.visualSettings.annotationStrokeWidth ?? 1.4}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      strokeWidth: Math.max(0.5, Math.min(6, Number(e.target.value) || 1.4)),
                    })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label
                  htmlFor="ann-style"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Линия
                </label>
                <select
                  id="ann-style"
                  data-testid="inspector-ann-stroke-style"
                  value={selectedAnnotation.strokeStyle ?? (selectedAnnotation.kind === 'rect' ? 'dashed' : 'solid')}
                  onChange={(e) =>
                    onUpdateAnnotation(selectedAnnotation.id, {
                      strokeStyle: e.target.value as AnnotationStrokeStyle,
                    })
                  }
                  className="w-full h-8 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)]"
                >
                  <option value="solid">Сплошная</option>
                  <option value="dashed">Штриховая</option>
                  <option value="dotted">Пунктир</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="ann-color"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Цвет
                </label>
                <div className="flex items-center gap-1 h-8 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)]">
                  <input
                    id="ann-color"
                    type="color"
                    value={selectedAnnotation.color || '#0f172a'}
                    onChange={(e) =>
                      onUpdateAnnotation(selectedAnnotation.id, { color: e.target.value })
                    }
                    className="w-6 h-5 border-0 bg-transparent cursor-pointer shrink-0"
                  />
                  {selectedAnnotation.color && (
                    <button
                      type="button"
                      onClick={() => onUpdateAnnotation(selectedAnnotation.id, { color: undefined })}
                      title="Сбросить цвет"
                      className="text-[10px] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] ml-auto"
                    >
                      Авто
                    </button>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDeleteAnnotation(selectedAnnotation.id)}
              className="w-full h-8 rounded border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[12px] font-medium"
            >
              Удалить аннотацию
            </button>
          </fieldset>
        ) : activeSheet ? (
          <div className="space-y-3.5 min-w-0">
            <p className="text-[11.5px] leading-relaxed text-[var(--flux-text-muted)]">
              Выберите элемент или провод на схеме для редактирования либо настройте параметры листа ГОСТ 2.104.
            </p>
            <div className="space-y-1.5">
              {(onOpenStampEditor || onOpenStampDesigner) && (
                <div className="grid grid-cols-2 gap-1.5">
                  {onOpenStampEditor && (
                    <button
                      type="button"
                      disabled={activeLayerLocked}
                      data-testid="inspector-open-stamp-btn"
                      onClick={() => onOpenStampEditor(activeSheet.id)}
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded border border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)] hover:bg-[var(--flux-accent)] hover:text-white text-[var(--flux-text)] text-[11px] font-medium truncate disabled:opacity-45 transition-colors"
                    >
                      <Type className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Заполнить штамп</span>
                    </button>
                  )}
                  {onOpenStampDesigner && (
                    <button
                      type="button"
                      onClick={() => onOpenStampDesigner(activeSheet.id)}
                      data-testid="inspector-open-designer-btn"
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[11px] font-medium truncate transition-colors"
                    >
                      <LayoutTemplate className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />
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
                  className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[12px] font-medium transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--flux-text-muted)] shrink-0" />
                  <span>Открыть спецификацию ПЭ3</span>
                </button>
              )}
            </div>
            <fieldset disabled={activeLayerLocked} className="space-y-3 min-w-0 disabled:opacity-65">
              <h3 className="text-[11px] font-semibold text-[var(--flux-text)] pb-1 border-b border-[var(--flux-line)]">
                Основная надпись ГОСТ 2.104
              </h3>
            <div>
              <label
                htmlFor="sheet-stamp-form"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Форма основной надписи ГОСТ 2.104
              </label>
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
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
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
            <div>
              <label
                htmlFor="sheet-doc"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Обозначение документа
              </label>
              <input
                id="sheet-doc"
                type="text"
                value={activeSheet.titleBlock.documentCode}
                onChange={(e) =>
                  onUpdateSheetTitle(activeSheet.id, { documentCode: e.target.value })
                }
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[12px] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label
                htmlFor="sheet-proj-title"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Наименование проекта (Графа 1)
              </label>
              <input
                id="sheet-proj-title"
                type="text"
                value={activeSheet.titleBlock.projectTitle ?? project.name}
                onChange={(e) =>
                  onUpdateSheetTitle(activeSheet.id, { projectTitle: e.target.value })
                }
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label
                htmlFor="sheet-title"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Наименование листа
              </label>
              <input
                id="sheet-title"
                type="text"
                value={activeSheet.titleBlock.sheetTitle}
                onChange={(e) =>
                  onUpdateSheetTitle(activeSheet.id, { sheetTitle: e.target.value })
                }
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label
                htmlFor="sheet-org"
                className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
              >
                Организация (Графа 9)
              </label>
              <input
                id="sheet-org"
                type="text"
                value={activeSheet.titleBlock.organization}
                onChange={(e) =>
                  onUpdateSheetTitle(activeSheet.id, { organization: e.target.value })
                }
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <label
                  htmlFor="sheet-des"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Разработал
                </label>
                <input
                  id="sheet-des"
                  type="text"
                  value={activeSheet.titleBlock.designer}
                  onChange={(e) =>
                    onUpdateSheetTitle(activeSheet.id, { designer: e.target.value })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="sheet-chk"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Проверил
                </label>
                <input
                  id="sheet-chk"
                  type="text"
                  value={activeSheet.titleBlock.checker}
                  onChange={(e) =>
                    onUpdateSheetTitle(activeSheet.id, { checker: e.target.value })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="sheet-nchk"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Н. контроль
                </label>
                <input
                  id="sheet-nchk"
                  type="text"
                  value={activeSheet.titleBlock.normControl || ''}
                  onChange={(e) =>
                    onUpdateSheetTitle(activeSheet.id, { normControl: e.target.value })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                />
              </div>
              <div className="min-w-0">
                <label
                  htmlFor="sheet-appr"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Утвердил
                </label>
                <input
                  id="sheet-appr"
                  type="text"
                  value={activeSheet.titleBlock.approver || ''}
                  onChange={(e) =>
                    onUpdateSheetTitle(activeSheet.id, { approver: e.target.value })
                  }
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                />
              </div>
            </div>
            </fieldset>
            <div className="grid grid-cols-1 gap-2 pt-1">
              <div>
                <label
                  htmlFor="sheet-format-sel"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Формат листа (ГОСТ)
                </label>
                <select
                  id="sheet-format-sel"
                  value={activeSheet.format}
                  onChange={(e) => onUpdateSheetFormat(activeSheet.id, e.target.value as SheetFormat)}
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                >
                  {(Object.keys(SHEET_DIMENSIONS) as SheetFormat[]).map((fmt) => (
                    <option key={fmt} value={fmt}>
                      {SHEET_DIMENSIONS[fmt].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="sheet-font-sel"
                  className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1"
                >
                  Шрифт схемы и таблиц
                </label>
                <select
                  id="sheet-font-sel"
                  value={project.visualSettings.fontFamily || 'GOST'}
                  onChange={(e) => onUpdateFontFamily(e.target.value as SchematicFontFamily)}
                  className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[12px] text-[var(--flux-text)]"
                >
                  {SCHEMATIC_FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="pt-2 border-t border-[var(--flux-line)] text-[12px] space-y-1 text-[var(--flux-text-muted)]">
              <div className="flex justify-between">
                <span>Ключ FLUX_PROJECT</span>
                <span className="font-mono text-[var(--flux-text)]">{project.fluxProjectKey}</span>
              </div>
              <div className="flex justify-between">
                <span>Размер листа</span>
                <span className="font-mono tabular-nums text-[var(--flux-text)]">
                  {activeSheet.width}×{activeSheet.height} ({activeSheet.format})
                </span>
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
                <div
                  ref={sheetHistoryRef}
                  data-testid="sheet-history-panel"
                  className="pt-3 border-t border-[var(--flux-line)] space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--flux-text-muted)]">
                      <History className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                      <span>Ревизии листа</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        data-testid="sheet-revision-badge"
                        className="px-1.5 py-0.5 rounded bg-[var(--flux-sel)] text-[var(--flux-accent)] font-mono tabular-nums text-[11px] font-semibold"
                      >
                        {currentRevLabel}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] text-[var(--flux-text-muted)]">
                        (вып. {releasedCount})
                      </span>
                    </div>
                  </div>

                  {isDirty && (
                    <div
                      data-testid="sheet-uncommitted-badge"
                      className="px-2 py-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300 leading-snug"
                    >
                      Есть правки на листе. Выпустите ревизию ниже, чтобы сохранить снимок.
                    </div>
                  )}

                  {onReleaseSheetRevision && (
                    <form
                      onSubmit={submitRelease}
                      className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] space-y-1.5"
                    >
                      <div className="text-[11px] font-medium text-[var(--flux-text)]">
                        Выпуск ревизии листа (внутри программы)
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          data-testid="release-revision-code-input"
                          value={releaseCode}
                          onChange={(e) => setReleaseCode(e.target.value)}
                          placeholder="Изм. (1, 2, А…)"
                          aria-label="Код ревизии (Изм.)"
                          className="h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11.5px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                        />
                        <input
                          type="text"
                          data-testid="release-revision-doc-input"
                          value={releaseDoc}
                          onChange={(e) => setReleaseDoc(e.target.value)}
                          placeholder="№ докум. (опц.)"
                          aria-label="Номер документа изменения"
                          className="h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11.5px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          data-testid="release-revision-note-input"
                          value={releaseNote}
                          onChange={(e) => setReleaseNote(e.target.value)}
                          placeholder="Примечание к выпуску…"
                          aria-label="Примечание к ревизии"
                          className="flex-1 min-w-0 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11.5px] text-[var(--flux-text)] focus:outline-none focus:border-[var(--flux-focus)]"
                        />
                        <button
                          type="submit"
                          data-testid="release-revision-submit-btn"
                          disabled={!releaseCode.trim() || activeLayerLocked}
                          className="h-7 px-2.5 rounded bg-[var(--flux-accent-solid)] hover:bg-[var(--flux-accent-solid-hover)] text-white text-[11px] font-medium whitespace-nowrap shrink-0 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                        >
                          Выпустить
                        </button>
                      </div>
                    </form>
                  )}

                  <div
                    data-testid="sheet-history-list"
                    className="max-h-[260px] overflow-y-auto space-y-1.5 pr-0.5"
                  >
                    {reversedHistory.length === 0 ? (
                      <div className="px-2.5 py-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text-muted)]">
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
                            className={`p-2 rounded border text-[11px] space-y-1 ${
                              isCurrent
                                ? 'border-[var(--flux-accent)]/50 bg-[var(--flux-accent-soft)]'
                                : 'border-[var(--flux-line)] bg-[var(--flux-surface)]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-mono tabular-nums text-[10px] font-semibold shrink-0 ${
                                    isCurrent
                                      ? 'bg-[var(--flux-accent-solid)] text-white'
                                      : isReleasedEntry
                                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-[var(--flux-bg)] border border-[var(--flux-line)] text-[var(--flux-text)]'
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
                                  className="inline-flex items-center gap-1 h-5 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[10px] font-medium text-[var(--flux-text)] shrink-0 transition-colors"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                  <span>Откатить</span>
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--flux-text)] leading-snug break-words">
                              {entry.summary}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                              <div className="flex flex-wrap gap-1">
                                {entry.changeDoc && (
                                  <span className="px-1 py-0 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] font-mono text-[10px] text-[var(--flux-text)]">
                                    {entry.changeDoc}
                                  </span>
                                )}
                                {entry.changedAreas.map((area) => (
                                  <span
                                    key={area}
                                    className="px-1 py-0 rounded bg-[var(--flux-bg)] border border-[var(--flux-line)] text-[10px] text-[var(--flux-text-muted)]"
                                  >
                                    {SHEET_CHANGE_AREA_LABELS[area] || area}
                                  </span>
                                ))}
                              </div>
                              <span className="font-mono text-[10px] text-[var(--flux-text-muted)] truncate">
                                {entry.author} · r{entry.projectRevision}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}
      </motion.div>
    </aside>
  );
};
