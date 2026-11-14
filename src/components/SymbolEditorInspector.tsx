import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDown,
  ArrowUp,
  CopyPlus,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  CustomSymbolShape,
  CustomSymbolStrokeStyle,
  DeviceCategory,
  E3Attribute,
  E3Pin,
  PinDirection,
  SignalType,
} from '../core/e3Types';
import {
  ATTRIBUTE_TEMPLATE_PRESETS,
  describeShapeType,
  STROKE_STYLE_OPTIONS,
  SYMBOL_COLOR_PALETTE,
} from '../core/symbolLibrary';
import type { SymbolWorkspaceActions } from '../core/symbolWorkspaceTypes';

interface SymbolEditorInspectorProps {
  workspace: SymbolWorkspaceActions;
}

const CATEGORIES: Array<[DeviceCategory, string]> = [
  ['breaker', 'Автоматический выключатель'],
  ['contactor', 'Контактор / Пускатель'],
  ['relay', 'Реле промежуточное'],
  ['drive', 'ПЧ / Привод'],
  ['motor', 'Электродвигатель'],
  ['psu', 'Блок питания'],
  ['plc', 'Контроллер ПЛК'],
  ['sensor', 'Датчик КИПиА'],
  ['kip_circle', 'Прибор КИП / Пост'],
  ['fan', 'Вентилятор ОВиК'],
  ['damper', 'Клапан воздушный'],
  ['filter', 'Фильтр воздушный'],
  ['heater', 'Калорифер / ТЭН'],
  ['cooler', 'Охладитель'],
  ['pump', 'Насос'],
  ['valve', 'Клапан / Задвижка'],
  ['lamp', 'Светосигнальная арматура'],
  ['terminal', 'Клеммный ряд'],
  ['junction_box', 'Коробка клеммная'],
  ['offpage_ref', 'Межлистовая ссылка'],
];

const parseFiniteNum = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

export const SymbolEditorInspector: React.FC<SymbolEditorInspectorProps> = React.memo(({ workspace }) => {
  const { draft } = workspace;
  const [selectedTemplateId, setSelectedTemplateId] = useState(ATTRIBUTE_TEMPLATE_PRESETS[0].id);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');

  const selectedShape = draft.shapes.find((s) => s.id === draft.selectedShapeId) || null;
  const selectedPin =
    draft.selectedPinIndex !== null ? draft.pins[draft.selectedPinIndex] || null : null;

  const updateSelectedShape = (updater: (sh: CustomSymbolShape) => CustomSymbolShape) => {
    if (!selectedShape) return;
    const nextShapes = draft.shapes.map((sh) => (sh.id === selectedShape.id ? updater(sh) : sh));
    workspace.onCommitGeometry(nextShapes, draft.pins);
  };

  const updateSelectedPin = (patch: Partial<Omit<E3Pin, 'id'>>) => {
    if (draft.selectedPinIndex === null) return;
    const nextPins = draft.pins.map((p, idx) =>
      idx === draft.selectedPinIndex ? { ...p, ...patch } : p
    );
    workspace.onCommitGeometry(draft.shapes, nextPins);
  };

  const updateAttr = (idx: number, patch: Partial<E3Attribute>) => {
    const next = draft.attributes.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    workspace.onUpdateDraftMeta({ attributes: next });
  };

  const handleAddAttr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAttrName.trim()) return;
    workspace.onUpdateDraftMeta({
      attributes: [
        ...draft.attributes,
        { name: newAttrName.trim(), value: newAttrValue.trim(), owner: '', conflict: 'flux' },
      ],
    });
    setNewAttrName('');
    setNewAttrValue('');
  };

  return (
    <aside
      aria-label="Свойства блока УГО и изделия E3"
      data-testid="symbol-editor-inspector"
      className="w-full h-full flex-1 min-w-0 bg-[var(--flux-bg)] flex flex-col min-h-0"
    >
      <div className="px-3 py-2 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-[var(--flux-text)]">
          Инспектор УГО и Изделия
        </span>
        <span className="font-mono tabular-nums text-[10.5px] text-[var(--flux-text-muted)]">
          {draft.shapes.length}ф · {draft.pins.length}в · {draft.attributes.length}а
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <AnimatePresence initial={false}>
        {/* 1. Selected Shape Properties */}
        {selectedShape && (
          <motion.div
            key={`shape-${selectedShape.id}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            data-testid="symbol-insp-shape"
            className="p-2.5 rounded border border-[var(--flux-accent)]/50 bg-[var(--flux-surface)] space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[var(--flux-line)]">
              <span className="text-[11.5px] font-semibold text-[var(--flux-text)]">
                Примитив: {describeShapeType(selectedShape)}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => workspace.onMoveShapeOrder('up')}
                  title="На передний план"
                  aria-label="Переместить примитив на передний план"
                  className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] transition-colors"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => workspace.onMoveShapeOrder('down')}
                  title="На задний план"
                  aria-label="Переместить примитив на задний план"
                  className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] transition-colors"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={workspace.onDuplicateSelectedShape}
                  title="Дублировать примитив"
                  aria-label="Дублировать примитив"
                  className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] transition-colors"
                >
                  <CopyPlus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={workspace.onDeleteSelection}
                  title="Удалить примитив"
                  aria-label="Удалить примитив"
                  className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Stroke Color Swatches */}
            <div className="space-y-1">
              <span className="block text-[10.5px] font-medium text-[var(--flux-text-muted)]">
                Цвет линии / текста
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {SYMBOL_COLOR_PALETTE.map((col) => {
                  const active = (selectedShape.strokeColor || '#111827').toLowerCase() === col.hex;
                  return (
                    <button
                      key={col.hex}
                      type="button"
                      title={col.label}
                      onClick={() =>
                        updateSelectedShape((s) => ({ ...s, strokeColor: col.hex }))
                      }
                      className={`w-5 h-5 rounded-xs border transition-transform ${
                        active
                          ? 'border-[var(--flux-accent)] scale-110 ring-1 ring-[var(--flux-accent)]'
                          : 'border-[var(--flux-line-strong)]'
                      }`}
                      style={{ backgroundColor: col.hex }}
                    />
                  );
                })}
                <input
                  type="color"
                  aria-label="Свой цвет линии"
                  value={selectedShape.strokeColor || '#111827'}
                  onChange={(e) =>
                    updateSelectedShape((s) => ({ ...s, strokeColor: e.target.value }))
                  }
                  className="w-6 h-5 p-0 border border-[var(--flux-line)] rounded-xs bg-transparent cursor-pointer"
                />
              </div>
            </div>

            {selectedShape.kind !== 'text' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                    Толщина (мм)
                  </label>
                  <select
                    aria-label="Толщина линии примитива"
                    value={String(selectedShape.strokeWidth ?? 1.8)}
                    onChange={(e) => {
                      const n = parseFiniteNum(e.target.value);
                      if (n === null) return;
                      updateSelectedShape((s) =>
                        s.kind !== 'text' ? { ...s, strokeWidth: n } : s
                      );
                    }}
                    className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)]"
                  >
                    {[1, 1.2, 1.5, 1.8, 2.2, 2.8, 3.5].map((w) => (
                      <option key={w} value={String(w)}>
                        {w.toFixed(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                    Тип линии
                  </label>
                  <select
                    aria-label="Тип линии примитива"
                    value={
                      selectedShape.strokeStyle ||
                      (selectedShape.dashed ? 'dashed' : 'solid')
                    }
                    onChange={(e) =>
                      updateSelectedShape((s) =>
                        s.kind !== 'text'
                          ? {
                              ...s,
                              strokeStyle: e.target.value as CustomSymbolStrokeStyle,
                              dashed: e.target.value === 'dashed',
                            }
                          : s
                      )
                    }
                    className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
                  >
                    {STROKE_STYLE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {(selectedShape.kind === 'rect' ||
              selectedShape.kind === 'circle' ||
              selectedShape.kind === 'polyline') && (
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--flux-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedShape.filled)}
                    onChange={(e) =>
                      updateSelectedShape((s) =>
                        s.kind === 'rect' || s.kind === 'circle' || s.kind === 'polyline'
                          ? { ...s, filled: e.target.checked }
                          : s
                      )
                    }
                  />
                  <span>Заливка фигуры</span>
                </label>
                {selectedShape.kind === 'polyline' && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--flux-text)]">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedShape.closed)}
                      onChange={(e) =>
                        updateSelectedShape((s) =>
                          s.kind === 'polyline' ? { ...s, closed: e.target.checked } : s
                        )
                      }
                    />
                    <span>Замкнуть</span>
                  </label>
                )}
              </div>
            )}

            {/* Shape-specific Geometry Fields */}
            {selectedShape.kind === 'line' && (
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    ['X1', selectedShape.x1, 'x1'],
                    ['Y1', selectedShape.y1, 'y1'],
                    ['X2', selectedShape.x2, 'x2'],
                    ['Y2', selectedShape.y2, 'y2'],
                  ] as const
                ).map(([lbl, val, field]) => (
                  <div key={field}>
                    <span className="block text-[10px] text-[var(--flux-text-muted)]">{lbl}</span>
                    <input
                      type="number"
                      aria-label={`Координата ${lbl} линии`}
                      value={val}
                      onChange={(e) => {
                        const n = parseFiniteNum(e.target.value);
                        if (n === null) return;
                        updateSelectedShape((s) =>
                          s.kind === 'line' ? { ...s, [field]: n } : s
                        );
                      }}
                      className="w-full h-6 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono tabular-nums text-[11px] text-[var(--flux-text)]"
                    />
                  </div>
                ))}
              </div>
            )}

            {selectedShape.kind === 'rect' && (
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    ['X', selectedShape.x, 'x'],
                    ['Y', selectedShape.y, 'y'],
                    ['Ш', selectedShape.width, 'width'],
                    ['В', selectedShape.height, 'height'],
                  ] as const
                ).map(([lbl, val, field]) => (
                  <div key={field}>
                    <span className="block text-[10px] text-[var(--flux-text-muted)]">{lbl}</span>
                    <input
                      type="number"
                      min={field === 'width' || field === 'height' ? 1 : undefined}
                      aria-label={`Параметр ${lbl} прямоугольника`}
                      value={val}
                      onChange={(e) => {
                        const n = parseFiniteNum(e.target.value);
                        if (n === null) return;
                        const clamped = field === 'width' || field === 'height' ? Math.max(1, n) : n;
                        updateSelectedShape((s) =>
                          s.kind === 'rect' ? { ...s, [field]: clamped } : s
                        );
                      }}
                      className="w-full h-6 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono tabular-nums text-[11px] text-[var(--flux-text)]"
                    />
                  </div>
                ))}
              </div>
            )}

            {selectedShape.kind === 'circle' && (
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['CX', selectedShape.cx, 'cx'],
                    ['CY', selectedShape.cy, 'cy'],
                    ['R', selectedShape.r, 'r'],
                  ] as const
                ).map(([lbl, val, field]) => (
                  <div key={field}>
                    <span className="block text-[10px] text-[var(--flux-text-muted)]">{lbl}</span>
                    <input
                      type="number"
                      min={field === 'r' ? 1 : undefined}
                      aria-label={`Параметр ${lbl} окружности`}
                      value={val}
                      onChange={(e) => {
                        const n = parseFiniteNum(e.target.value);
                        if (n === null) return;
                        const clamped = field === 'r' ? Math.max(1, n) : n;
                        updateSelectedShape((s) =>
                          s.kind === 'circle' ? { ...s, [field]: clamped } : s
                        );
                      }}
                      className="w-full h-6 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono tabular-nums text-[11px] text-[var(--flux-text)]"
                    />
                  </div>
                ))}
              </div>
            )}

            {selectedShape.kind === 'arc' && (
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['CX', selectedShape.cx, 'cx'],
                    ['CY', selectedShape.cy, 'cy'],
                    ['R', selectedShape.r, 'r'],
                    ['Угол1°', selectedShape.startAngle, 'startAngle'],
                    ['Угол2°', selectedShape.endAngle, 'endAngle'],
                  ] as const
                ).map(([lbl, val, field]) => (
                  <div key={field}>
                    <span className="block text-[10px] text-[var(--flux-text-muted)]">{lbl}</span>
                    <input
                      type="number"
                      min={field === 'r' ? 1 : undefined}
                      aria-label={`Параметр ${lbl} дуги`}
                      value={val}
                      onChange={(e) => {
                        const n = parseFiniteNum(e.target.value);
                        if (n === null) return;
                        const clamped = field === 'r' ? Math.max(1, n) : n;
                        updateSelectedShape((s) =>
                          s.kind === 'arc' ? { ...s, [field]: clamped } : s
                        );
                      }}
                      className="w-full h-6 px-1 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono tabular-nums text-[11px] text-[var(--flux-text)]"
                    />
                  </div>
                ))}
              </div>
            )}

            {selectedShape.kind === 'text' && (
              <div className="space-y-1.5">
                <div>
                  <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                    Текст / Шаблон
                  </label>
                  <input
                    type="text"
                    spellCheck={false}
                    aria-label="Текст или шаблон атрибута"
                    value={selectedShape.text}
                    onChange={(e) =>
                      updateSelectedShape((s) =>
                        s.kind === 'text' ? { ...s, text: e.target.value } : s
                      )
                    }
                    className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                      Динамич. атрибут
                    </label>
                    <select
                      aria-label="Привязка динамического атрибута"
                      value={selectedShape.attrKey || ''}
                      onChange={(e) =>
                        updateSelectedShape((s) =>
                          s.kind === 'text'
                            ? {
                                ...s,
                                attrKey: e.target.value || undefined,
                                text: e.target.value ? `{${e.target.value}}` : s.text,
                              }
                            : s
                        )
                      }
                      className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
                    >
                      <option value="">Статический текст</option>
                      <option value="designation">Обозначение (-K1)</option>
                      <option value="article">Артикул</option>
                      <option value="componentName">Наименование</option>
                      <option value="manufacturer">Производитель</option>
                      {draft.attributes.map((a) => (
                        <option key={a.name} value={`attr:${a.name}`}>
                          Атр: {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                      Кегль (px)
                    </label>
                    <input
                      type="number"
                      min={6}
                      max={32}
                      aria-label="Размер шрифта текста"
                      value={selectedShape.fontSize || 11}
                      onChange={(e) => {
                        const n = parseFiniteNum(e.target.value);
                        if (n === null) return;
                        updateSelectedShape((s) =>
                          s.kind === 'text'
                            ? { ...s, fontSize: Math.max(6, Math.min(32, n)) }
                            : s
                        );
                      }}
                      className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)]"
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* 2. Selected Pin Properties */}
        {selectedPin && (
          <motion.div
            key={`pin-${draft.selectedPinIndex}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            data-testid="symbol-insp-pin"
            className="p-2.5 rounded border border-amber-500/50 bg-[var(--flux-surface)] space-y-2"
          >
            <div className="flex items-center justify-between gap-2 pb-1 border-b border-[var(--flux-line)]">
              <span className="text-[11.5px] font-semibold text-[var(--flux-text)]">
                Вывод E3: {selectedPin.name}
              </span>
              <button
                type="button"
                onClick={workspace.onDeleteSelection}
                title="Удалить вывод"
                aria-label="Удалить выбранный вывод"
                className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <span className="block text-[10px] text-[var(--flux-text-muted)]">Имя</span>
                <input
                  type="text"
                  spellCheck={false}
                  aria-label="Имя вывода"
                  value={selectedPin.name}
                  onChange={(e) => updateSelectedPin({ name: e.target.value })}
                  className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <span className="block text-[10px] text-[var(--flux-text-muted)]">DX</span>
                <input
                  type="number"
                  aria-label="Смещение вывода DX"
                  value={selectedPin.dx}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) updateSelectedPin({ dx: n });
                  }}
                  className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono tabular-nums text-[11px] text-[var(--flux-text)]"
                />
              </div>
              <div>
                <span className="block text-[10px] text-[var(--flux-text-muted)]">DY</span>
                <input
                  type="number"
                  aria-label="Смещение вывода DY"
                  value={selectedPin.dy}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) updateSelectedPin({ dy: n });
                  }}
                  className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono tabular-nums text-[11px] text-[var(--flux-text)]"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <select
                aria-label="Направление вывода"
                value={selectedPin.direction}
                onChange={(e) => updateSelectedPin({ direction: e.target.value as PinDirection })}
                className="h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
              >
                <option value="top">Сверху (top)</option>
                <option value="bottom">Снизу (bottom)</option>
                <option value="left">Слева (left)</option>
                <option value="right">Справа (right)</option>
              </select>
              <select
                aria-label="Тип сигнала вывода"
                value={selectedPin.signalType}
                onChange={(e) => updateSelectedPin({ signalType: e.target.value as SignalType })}
                className="h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] text-[var(--flux-text)]"
              >
                <option value="power">Силовая (L)</option>
                <option value="neutral">Нейтраль (N)</option>
                <option value="pe">Заземление (PE)</option>
                <option value="dc24">+24V DC</option>
                <option value="dc0">0V / GND</option>
                <option value="signal">Сигнал (DI/DO/AI)</option>
                <option value="bus">Шина (RS485/Eth)</option>
              </select>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* 3. УГО (Graphic Block Metadata) */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-[var(--flux-text)] pb-1 border-b border-[var(--flux-line)]">
            1. УГО (Графический символ E3)
          </h3>
          <div>
            <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
              Название символа УГО
            </label>
            <input
              type="text"
              data-testid="sym-insp-name"
              aria-label="Название символа УГО"
              value={draft.name}
              onChange={(e) => workspace.onUpdateDraftMeta({ name: e.target.value })}
              className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                Имя блока E3 (.e3s)
              </label>
              <input
                type="text"
                data-testid="sym-insp-blockname"
                spellCheck={false}
                aria-label="Имя блока E3"
                value={draft.e3BlockName}
                onChange={(e) => workspace.onUpdateDraftMeta({ e3BlockName: e.target.value })}
                className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                Категория
              </label>
              <select
                aria-label="Категория УГО"
                value={draft.category}
                onChange={(e) =>
                  workspace.onUpdateDraftMeta({ category: e.target.value as DeviceCategory })
                }
                className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
              >
                {CATEGORIES.map(([cat, lbl]) => (
                  <option key={cat} value={cat}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                Ширина (мм)
              </label>
              <input
                type="number"
                min={40}
                max={480}
                step={10}
                aria-label="Ширина блока УГО в миллиметрах"
                value={draft.width}
                onChange={(e) => {
                  const n = parseFiniteNum(e.target.value);
                  if (n === null) return;
                  workspace.onUpdateDraftMeta({
                    width: Math.max(40, Math.min(480, n)),
                  });
                }}
                className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[11px] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                Высота (мм)
              </label>
              <input
                type="number"
                min={40}
                max={480}
                step={10}
                aria-label="Высота блока УГО в миллиметрах"
                value={draft.height}
                onChange={(e) => {
                  const n = parseFiniteNum(e.target.value);
                  if (n === null) return;
                  workspace.onUpdateDraftMeta({
                    height: Math.max(40, Math.min(480, n)),
                  });
                }}
                className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[11px] text-[var(--flux-text)]"
              />
            </div>
          </div>
        </div>

        {/* 4. Изделие (E3 Database Component) */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-[var(--flux-text)] pb-1 border-b border-[var(--flux-line)]">
            2. Изделие БД (Компонент E3.series)
          </h3>
          <div>
            <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
              Наименование изделия (ПЭ3 / E3)
            </label>
            <input
              type="text"
              data-testid="sym-insp-compname"
              aria-label="Наименование изделия"
              value={draft.componentName}
              onChange={(e) => workspace.onUpdateDraftMeta({ componentName: e.target.value })}
              className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)]"
            />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="col-span-2">
              <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                Артикул
              </label>
              <input
                type="text"
                data-testid="sym-insp-article"
                spellCheck={false}
                aria-label="Артикул изделия"
                value={draft.article}
                onChange={(e) => workspace.onUpdateDraftMeta({ article: e.target.value })}
                className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
                Префикс
              </label>
              <input
                type="text"
                spellCheck={false}
                aria-label="Буквенный префикс ОУО"
                value={draft.defaultPrefix}
                onChange={(e) => workspace.onUpdateDraftMeta({ defaultPrefix: e.target.value })}
                className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10.5px] text-[var(--flux-text-muted)] mb-0.5">
              Производитель
            </label>
            <input
              type="text"
              aria-label="Производитель изделия"
              value={draft.manufacturer}
              onChange={(e) => workspace.onUpdateDraftMeta({ manufacturer: e.target.value })}
              className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11.5px] text-[var(--flux-text)]"
            />
          </div>
        </div>

        {/* 5. Attribute Templates & E3 Attributes */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 pb-1 border-b border-[var(--flux-line)]">
            <h3 className="text-[11px] font-semibold text-[var(--flux-text)]">
              3. Шаблоны характеристик и Атрибуты
            </h3>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              data-testid="sym-insp-template-select"
              aria-label="Шаблон характеристик"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="flex-1 min-w-0 h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
            >
              {ATTRIBUTE_TEMPLATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="sym-insp-apply-template-btn"
              onClick={() => workspace.onApplyAttributeTemplate(selectedTemplateId)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded border border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)] hover:bg-[var(--flux-sel)] text-[11px] font-medium text-[var(--flux-accent)] whitespace-nowrap shrink-0 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              <span>Применить</span>
            </button>
          </div>

          <div className="border border-[var(--flux-line)] rounded bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)]">
            {draft.attributes.map((attr, idx) => (
              <div key={`${attr.name}-${idx}`} className="p-1.5 space-y-1">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    spellCheck={false}
                    aria-label={`Имя атрибута ${idx + 1}`}
                    value={attr.name}
                    onChange={(e) => updateAttr(idx, { name: e.target.value })}
                    className="flex-1 min-w-0 h-6 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] font-medium text-[var(--flux-text)]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      workspace.onUpdateDraftMeta({
                        attributes: draft.attributes.filter((_, i) => i !== idx),
                      })
                    }
                    aria-label={`Удалить атрибут ${attr.name || idx + 1}`}
                    className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600 shrink-0 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <input
                  type="text"
                  spellCheck={false}
                  aria-label={`Значение атрибута ${attr.name || idx + 1}`}
                  value={attr.value}
                  onChange={(e) => updateAttr(idx, { value: e.target.value })}
                  placeholder="Значение"
                  className="w-full h-6 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[11px] text-[var(--flux-text)]"
                />
              </div>
            ))}
            {draft.attributes.length === 0 && (
              <div className="p-2 text-[11px] text-[var(--flux-text-muted)] text-center">
                Атрибуты не заданы. Выберите шаблон выше или добавьте вручную.
              </div>
            )}
          </div>

          <form onSubmit={handleAddAttr} className="flex items-center gap-1.5">
            <input
              type="text"
              data-testid="sym-insp-new-attr-name"
              spellCheck={false}
              aria-label="Название нового атрибута"
              value={newAttrName}
              onChange={(e) => setNewAttrName(e.target.value)}
              placeholder="Новый атрибут"
              className="w-5/12 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
            />
            <input
              type="text"
              data-testid="sym-insp-new-attr-val"
              spellCheck={false}
              aria-label="Значение нового атрибута"
              value={newAttrValue}
              onChange={(e) => setNewAttrValue(e.target.value)}
              placeholder="Значение"
              className="flex-1 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
            />
            <button
              type="submit"
              disabled={!newAttrName.trim()}
              data-testid="sym-insp-add-attr-btn"
              className="inline-flex items-center justify-center w-7 h-7 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] shrink-0 disabled:opacity-40 transition-colors"
              title="Добавить атрибут"
              aria-label="Добавить атрибут"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
});
SymbolEditorInspector.displayName = 'SymbolEditorInspector';
