import React, { useState } from 'react';
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
      <div className="h-6 px-2.5 border-b border-[var(--flux-line)] bg-[var(--flux-surface-alt)] flex items-center justify-between gap-2 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--flux-text-muted)] truncate">
          Инспектор УГО и Изделия
        </span>
        <span className="font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)] shrink-0">
          {draft.shapes.length}ф · {draft.pins.length}в · {draft.attributes.length}а
        </span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* 1. Selected Shape Properties */}
        {selectedShape && (
          <div key={`shape-${selectedShape.id}`} data-testid="symbol-insp-shape">
            <div className="cad-prop-section">
              <span className="truncate text-[var(--flux-accent)]">
                Примитив: {describeShapeType(selectedShape)}
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => workspace.onMoveShapeOrder('up')}
                  title="На передний план"
                  aria-label="Переместить примитив на передний план"
                  className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] transition-colors"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => workspace.onMoveShapeOrder('down')}
                  title="На задний план"
                  aria-label="Переместить примитив на задний план"
                  className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] transition-colors"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={workspace.onDuplicateSelectedShape}
                  title="Дублировать примитив"
                  aria-label="Дублировать примитив"
                  className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] transition-colors"
                >
                  <CopyPlus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={workspace.onDeleteSelection}
                  title="Удалить примитив"
                  aria-label="Удалить примитив"
                  className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Stroke Color Swatches */}
            <div className="cad-prop-grid">
              <span className="cad-prop-label">Цвет</span>
              <div className="cad-prop-cell px-1.5 py-1 flex-wrap gap-1">
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
                      className={`w-4 h-4 rounded-[1px] border ${
                        active
                          ? 'border-[var(--flux-accent)] ring-1 ring-[var(--flux-accent)]'
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
                  className="w-5 h-4 p-0 border border-[var(--flux-line)] rounded-[1px] bg-transparent cursor-pointer"
                />
              </div>

              {selectedShape.kind !== 'text' && (
                <>
                  <span className="cad-prop-label">Толщина (мм)</span>
                  <div className="cad-prop-cell">
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
                      className="cad-prop-input font-mono"
                    >
                      {[1, 1.2, 1.5, 1.8, 2.2, 2.8, 3.5].map((w) => (
                        <option key={w} value={String(w)}>
                          {w.toFixed(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="cad-prop-label">Тип линии</span>
                  <div className="cad-prop-cell">
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
                      className="cad-prop-input"
                    >
                      {STROKE_STYLE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {(selectedShape.kind === 'rect' ||
                selectedShape.kind === 'circle' ||
                selectedShape.kind === 'polyline') && (
                <>
                  <span className="cad-prop-label">Опции</span>
                  <div className="cad-prop-cell px-1.5 gap-2 text-[11px] text-[var(--flux-text)]">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
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
                        className="accent-[var(--flux-accent)]"
                      />
                      <span>Заливка</span>
                    </label>
                    {selectedShape.kind === 'polyline' && (
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedShape.closed)}
                          onChange={(e) =>
                            updateSelectedShape((s) =>
                              s.kind === 'polyline' ? { ...s, closed: e.target.checked } : s
                            )
                          }
                          className="accent-[var(--flux-accent)]"
                        />
                        <span>Замкнуть</span>
                      </label>
                    )}
                  </div>
                </>
              )}

              {selectedShape.kind === 'line' &&
                (
                  [
                    ['X1', selectedShape.x1, 'x1'],
                    ['Y1', selectedShape.y1, 'y1'],
                    ['X2', selectedShape.x2, 'x2'],
                    ['Y2', selectedShape.y2, 'y2'],
                  ] as const
                ).map(([lbl, val, field]) => (
                  <React.Fragment key={field}>
                    <span className="cad-prop-label">{lbl}</span>
                    <div className="cad-prop-cell">
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
                        className="cad-prop-input font-mono tabular-nums"
                      />
                    </div>
                  </React.Fragment>
                ))}

              {selectedShape.kind === 'rect' &&
                (
                  [
                    ['X', selectedShape.x, 'x'],
                    ['Y', selectedShape.y, 'y'],
                    ['Ширина', selectedShape.width, 'width'],
                    ['Высота', selectedShape.height, 'height'],
                  ] as const
                ).map(([lbl, val, field]) => (
                  <React.Fragment key={field}>
                    <span className="cad-prop-label">{lbl}</span>
                    <div className="cad-prop-cell">
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
                        className="cad-prop-input font-mono tabular-nums"
                      />
                    </div>
                  </React.Fragment>
                ))}

              {selectedShape.kind === 'circle' &&
                (
                  [
                    ['CX', selectedShape.cx, 'cx'],
                    ['CY', selectedShape.cy, 'cy'],
                    ['Радиус R', selectedShape.r, 'r'],
                  ] as const
                ).map(([lbl, val, field]) => (
                  <React.Fragment key={field}>
                    <span className="cad-prop-label">{lbl}</span>
                    <div className="cad-prop-cell">
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
                        className="cad-prop-input font-mono tabular-nums"
                      />
                    </div>
                  </React.Fragment>
                ))}

              {selectedShape.kind === 'arc' &&
                (
                  [
                    ['CX', selectedShape.cx, 'cx'],
                    ['CY', selectedShape.cy, 'cy'],
                    ['Радиус R', selectedShape.r, 'r'],
                    ['Угол 1°', selectedShape.startAngle, 'startAngle'],
                    ['Угол 2°', selectedShape.endAngle, 'endAngle'],
                  ] as const
                ).map(([lbl, val, field]) => (
                  <React.Fragment key={field}>
                    <span className="cad-prop-label">{lbl}</span>
                    <div className="cad-prop-cell">
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
                        className="cad-prop-input font-mono tabular-nums"
                      />
                    </div>
                  </React.Fragment>
                ))}

              {selectedShape.kind === 'text' && (
                <>
                  <span className="cad-prop-label">Текст / Шаблон</span>
                  <div className="cad-prop-cell">
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
                      className="cad-prop-input font-mono"
                    />
                  </div>

                  <span className="cad-prop-label">Динам. атрибут</span>
                  <div className="cad-prop-cell">
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
                      className="cad-prop-input"
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

                  <span className="cad-prop-label">Кегль (px)</span>
                  <div className="cad-prop-cell">
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
                      className="cad-prop-input font-mono tabular-nums"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 2. Selected Pin Properties */}
        {selectedPin && (
          <div key={`pin-${draft.selectedPinIndex}`} data-testid="symbol-insp-pin">
            <div className="cad-prop-section">
              <span className="text-amber-600 dark:text-amber-400">
                Вывод E3: {selectedPin.name}
              </span>
              <button
                type="button"
                onClick={workspace.onDeleteSelection}
                title="Удалить вывод"
                aria-label="Удалить выбранный вывод"
                className="w-5 h-5 inline-flex items-center justify-center rounded-[2px] hover:bg-rose-500/15 text-rose-600 dark:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <div className="cad-prop-grid">
              <span className="cad-prop-label">Имя вывода</span>
              <div className="cad-prop-cell">
                <input
                  type="text"
                  spellCheck={false}
                  aria-label="Имя вывода"
                  value={selectedPin.name}
                  onChange={(e) => updateSelectedPin({ name: e.target.value })}
                  className="cad-prop-input font-mono"
                />
              </div>

              <span className="cad-prop-label">Смещение DX</span>
              <div className="cad-prop-cell">
                <input
                  type="number"
                  aria-label="Смещение вывода DX"
                  value={selectedPin.dx}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) updateSelectedPin({ dx: n });
                  }}
                  className="cad-prop-input font-mono tabular-nums"
                />
              </div>

              <span className="cad-prop-label">Смещение DY</span>
              <div className="cad-prop-cell">
                <input
                  type="number"
                  aria-label="Смещение вывода DY"
                  value={selectedPin.dy}
                  onChange={(e) => {
                    const n = parseFiniteNum(e.target.value);
                    if (n !== null) updateSelectedPin({ dy: n });
                  }}
                  className="cad-prop-input font-mono tabular-nums"
                />
              </div>

              <span className="cad-prop-label">Направление</span>
              <div className="cad-prop-cell">
                <select
                  aria-label="Направление вывода"
                  value={selectedPin.direction}
                  onChange={(e) => updateSelectedPin({ direction: e.target.value as PinDirection })}
                  className="cad-prop-input"
                >
                  <option value="top">Сверху (top)</option>
                  <option value="bottom">Снизу (bottom)</option>
                  <option value="left">Слева (left)</option>
                  <option value="right">Справа (right)</option>
                </select>
              </div>

              <span className="cad-prop-label">Сигнал</span>
              <div className="cad-prop-cell">
                <select
                  aria-label="Тип сигнала вывода"
                  value={selectedPin.signalType}
                  onChange={(e) => updateSelectedPin({ signalType: e.target.value as SignalType })}
                  className="cad-prop-input"
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
            </div>
          </div>
        )}

        {/* 3. УГО (Graphic Block Metadata) */}
        <div>
          <div className="cad-prop-section">
            <span>1. УГО (Графический символ E3)</span>
          </div>
          <div className="cad-prop-grid">
            <span className="cad-prop-label">Название УГО</span>
            <div className="cad-prop-cell">
              <input
                type="text"
                data-testid="sym-insp-name"
                aria-label="Название символа УГО"
                value={draft.name}
                onChange={(e) => workspace.onUpdateDraftMeta({ name: e.target.value })}
                className="cad-prop-input"
              />
            </div>

            <span className="cad-prop-label">Блок E3 (.e3s)</span>
            <div className="cad-prop-cell">
              <input
                type="text"
                data-testid="sym-insp-blockname"
                spellCheck={false}
                aria-label="Имя блока E3"
                value={draft.e3BlockName}
                onChange={(e) => workspace.onUpdateDraftMeta({ e3BlockName: e.target.value })}
                className="cad-prop-input font-mono"
              />
            </div>

            <span className="cad-prop-label">Категория</span>
            <div className="cad-prop-cell">
              <select
                aria-label="Категория УГО"
                value={draft.category}
                onChange={(e) =>
                  workspace.onUpdateDraftMeta({ category: e.target.value as DeviceCategory })
                }
                className="cad-prop-input"
              >
                {CATEGORIES.map(([cat, lbl]) => (
                  <option key={cat} value={cat}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>

            <span className="cad-prop-label">Ширина (мм)</span>
            <div className="cad-prop-cell">
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
                className="cad-prop-input font-mono tabular-nums"
              />
            </div>

            <span className="cad-prop-label">Высота (мм)</span>
            <div className="cad-prop-cell">
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
                className="cad-prop-input font-mono tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* 4. Изделие (E3 Database Component) */}
        <div>
          <div className="cad-prop-section">
            <span>2. Изделие БД (E3.series)</span>
          </div>
          <div className="cad-prop-grid">
            <span className="cad-prop-label">Наименование</span>
            <div className="cad-prop-cell">
              <input
                type="text"
                data-testid="sym-insp-compname"
                aria-label="Наименование изделия"
                value={draft.componentName}
                onChange={(e) => workspace.onUpdateDraftMeta({ componentName: e.target.value })}
                className="cad-prop-input"
              />
            </div>

            <span className="cad-prop-label">Артикул</span>
            <div className="cad-prop-cell">
              <input
                type="text"
                data-testid="sym-insp-article"
                spellCheck={false}
                aria-label="Артикул изделия"
                value={draft.article}
                onChange={(e) => workspace.onUpdateDraftMeta({ article: e.target.value })}
                className="cad-prop-input font-mono"
              />
            </div>

            <span className="cad-prop-label">Префикс ОУО</span>
            <div className="cad-prop-cell">
              <input
                type="text"
                spellCheck={false}
                aria-label="Буквенный префикс ОУО"
                value={draft.defaultPrefix}
                onChange={(e) => workspace.onUpdateDraftMeta({ defaultPrefix: e.target.value })}
                className="cad-prop-input font-mono"
              />
            </div>

            <span className="cad-prop-label">Производитель</span>
            <div className="cad-prop-cell">
              <input
                type="text"
                aria-label="Производитель изделия"
                value={draft.manufacturer}
                onChange={(e) => workspace.onUpdateDraftMeta({ manufacturer: e.target.value })}
                className="cad-prop-input"
              />
            </div>
          </div>
        </div>

        {/* 5. Attribute Templates & E3 Attributes */}
        <div>
          <div className="cad-prop-section">
            <span>3. Шаблоны и Атрибуты E3</span>
          </div>
          <div className="p-2 space-y-2 bg-[var(--flux-bg)]">
            <div className="flex items-center gap-1">
              <select
                data-testid="sym-insp-template-select"
                aria-label="Шаблон характеристик"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="flex-1 min-w-0 h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
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
                className="inline-flex items-center gap-1 h-6 px-2 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-sel)] text-[11px] font-medium text-[var(--flux-accent)] whitespace-nowrap shrink-0 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                <span>Применить</span>
              </button>
            </div>

            <div className="border border-[var(--flux-line)] rounded-[2px] bg-[var(--flux-surface)] divide-y divide-[var(--flux-line)]">
              {draft.attributes.map((attr, idx) => (
                <div key={`${attr.name}-${idx}`} className="flex items-center divide-x divide-[var(--flux-line)]">
                  <input
                    type="text"
                    spellCheck={false}
                    aria-label={`Имя атрибута ${idx + 1}`}
                    value={attr.name}
                    onChange={(e) => updateAttr(idx, { name: e.target.value })}
                    className="w-[44%] min-w-0 h-6 px-1.5 bg-[var(--flux-surface-alt)] text-[11px] font-medium text-[var(--flux-text-muted)] focus:outline-none"
                  />
                  <input
                    type="text"
                    spellCheck={false}
                    aria-label={`Значение атрибута ${attr.name || idx + 1}`}
                    value={attr.value}
                    onChange={(e) => updateAttr(idx, { value: e.target.value })}
                    placeholder="Значение"
                    className="flex-1 min-w-0 h-6 px-1.5 bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      workspace.onUpdateDraftMeta({
                        attributes: draft.attributes.filter((_, i) => i !== idx),
                      })
                    }
                    aria-label={`Удалить атрибут ${attr.name || idx + 1}`}
                    className="w-6 h-6 inline-flex items-center justify-center text-[var(--flux-text-muted)] hover:text-rose-600 shrink-0 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {draft.attributes.length === 0 && (
                <div className="p-2 text-[11px] text-[var(--flux-text-muted)] text-center">
                  Атрибуты не заданы. Выберите шаблон или добавьте вручную.
                </div>
              )}
            </div>

            <form onSubmit={handleAddAttr} className="flex items-center gap-1">
              <input
                type="text"
                data-testid="sym-insp-new-attr-name"
                spellCheck={false}
                aria-label="Название нового атрибута"
                value={newAttrName}
                onChange={(e) => setNewAttrName(e.target.value)}
                placeholder="Новый атрибут"
                className="w-5/12 h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
              />
              <input
                type="text"
                data-testid="sym-insp-new-attr-val"
                spellCheck={false}
                aria-label="Значение нового атрибута"
                value={newAttrValue}
                onChange={(e) => setNewAttrValue(e.target.value)}
                placeholder="Значение"
                className="flex-1 h-6 px-1.5 rounded-[2px] border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[11px] text-[var(--flux-text)]"
              />
              <button
                type="submit"
                disabled={!newAttrName.trim()}
                data-testid="sym-insp-add-attr-btn"
                className="inline-flex items-center justify-center w-6 h-6 rounded-[2px] border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)] shrink-0 disabled:opacity-40 transition-colors"
                title="Добавить атрибут"
                aria-label="Добавить атрибут"
              >
                <Plus className="w-3 h-3" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
});
SymbolEditorInspector.displayName = 'SymbolEditorInspector';
