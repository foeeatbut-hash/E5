import React, { useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Copy,
  FileSpreadsheet,
  LayoutTemplate,
  Lock,
  Plus,
  RotateCw,
  Trash2,
  Type,
  Unlink,
} from 'lucide-react';
import { CAD_LAYER_DEFS, resolveCadLayers } from '../core/cadLayers';
import { SCHEMATIC_FONT_OPTIONS, SHEET_DIMENSIONS } from '../core/e3Catalog';
import type {
  AnnotationKind,
  CadLayerId,
  E3Annotation,
  E3Attribute,
  E3Device,
  E3Project,
  E3Sheet,
  E3Wire,
  GostStampTemplate,
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
  onUpdateDevice: (deviceId: string, patch: Partial<E3Device>) => void;
  onSaveDeviceToCatalog?: (device: E3Device) => void;
  onUpdateWire: (wireId: string, patch: Partial<E3Wire>) => void;
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
}

export const RightInspector: React.FC<RightInspectorProps> = ({
  project,
  activeSheet,
  customTemplates = [],
  selectedDevice,
  selectedWire,
  selectedAnnotation,
  onUpdateDevice,
  onSaveDeviceToCatalog,
  onUpdateWire,
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
}) => {
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');
  const [copiedElId, setCopiedElId] = useState(false);

  const layersMap = resolveCadLayers(project.layers, project.visualSettings.showGostFrame);
  const activeLayerId: CadLayerId = selectedDevice
    ? 'devices'
    : selectedWire
      ? 'wires'
      : selectedAnnotation
        ? 'annotations'
        : 'frame';
  const activeLayerLocked = layersMap[activeLayerId].locked;
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
      <div className="px-3 h-8 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between shrink-0">
        <span className="text-[12px] font-semibold text-[var(--flux-text)] truncate">
          {selectedDevice
            ? `Элемент ${selectedDevice.designation}`
            : selectedWire
              ? `Цепь ${selectedWire.netName}`
              : selectedAnnotation
                ? `Аннотация (${selectedAnnotation.kind === 'rect' ? 'Зона' : selectedAnnotation.kind === 'callout' ? 'Выноска' : 'Текст'})`
                : 'Параметры листа'}
        </span>
        {selectedDevice && (
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
            <span className="max-w-[96px] truncate">{selectedDevice.elementId}</span>
            {copiedElId ? (
              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : (
              <Copy className="w-3 h-3 shrink-0" />
            )}
          </button>
        )}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-3 space-y-4">
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
                className="h-6 px-2 rounded border border-amber-500/60 bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] shrink-0"
              >
                Разблокировать
              </button>
            )}
          </div>
        )}

        {selectedDevice ? (
          <>
            {/* Integral E3 / Flux Component Summary & Save to Base */}
            <div className="p-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-[var(--flux-text)] truncate">
                  Цельное изделие E3 · {selectedDevice.attributes.length} атр. · {selectedDevice.pins.length} выв.
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
                  className="inline-flex items-center gap-1 h-7 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[11px] font-medium text-[var(--flux-text)] whitespace-nowrap shrink-0"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-[var(--flux-accent)]" />
                  <span>В базу</span>
                </button>
              )}
            </div>

            <fieldset disabled={activeLayerLocked} className="space-y-4 min-w-0 disabled:opacity-65">
            {/* Device Core Identity */}
            <div className="space-y-2.5">
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
              </select>
            </div>
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
            <button
              type="button"
              onClick={() => onDeleteAnnotation(selectedAnnotation.id)}
              className="w-full h-8 rounded border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-[12px] font-medium"
            >
              Удалить аннотацию
            </button>
          </fieldset>
        ) : activeSheet ? (
          <div className="space-y-3 min-w-0">
            <p className="text-[12px] text-[var(--flux-text-muted)]">
              Выберите элемент или провод на схеме для редактирования, либо настройте штамп листа ГОСТ 2.104.
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
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white text-[11px] font-medium truncate disabled:opacity-45"
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
                      className="inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[11px] font-medium truncate"
                    >
                      <LayoutTemplate className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
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
                  className="w-full inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] text-[12px] font-medium"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--flux-accent)] shrink-0" />
                  <span>Открыть спецификацию ПЭ3</span>
                </button>
              )}
            </div>
            <fieldset disabled={activeLayerLocked} className="space-y-3 min-w-0 disabled:opacity-65">
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
          </div>
        ) : null}
      </div>
    </aside>
  );
};
