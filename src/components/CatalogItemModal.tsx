import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { CatalogItem, DeviceCategory, E3Attribute, E3Pin, HvacStageRole } from '../core/e3Types';
import { HVAC_ROLE_LABELS } from '../core/hvacBuilder';

interface CatalogItemModalProps {
  open: boolean;
  editingItem?: CatalogItem | null;
  onClose: () => void;
  onSave: (item: CatalogItem) => void;
}

const CATEGORY_OPTIONS: Array<{ value: DeviceCategory; label: string }> = [
  { value: 'damper', label: 'Клапан воздушный (DW)' },
  { value: 'filter', label: 'Фильтр / ΔP (FA)' },
  { value: 'heater', label: 'Калорифер / Нагреватель (EB/EK)' },
  { value: 'cooler', label: 'Охладитель / ККБ (EC)' },
  { value: 'fan', label: 'Вентилятор (BL)' },
  { value: 'kip_circle', label: 'Прибор КИП / Пост (THT/HHS)' },
  { value: 'junction_box', label: 'Клеммная коробка (HJB)' },
  { value: 'sensor', label: 'Датчик КИПиА (BT)' },
  { value: 'breaker', label: 'Автомат защиты (QF)' },
  { value: 'contactor', label: 'Контактор (KM)' },
  { value: 'drive', label: 'Преобразователь частоты (UZ)' },
  { value: 'plc', label: 'Контроллер ПЛК (A)' },
  { value: 'motor', label: 'Двигатель (M)' },
  { value: 'terminal', label: 'Клеммный блок (XT)' },
  { value: 'relay', label: 'Реле (KA)' },
  { value: 'psu', label: 'Блок питания (G)' },
];

function buildDefaultPins(category: DeviceCategory): Omit<E3Pin, 'id'>[] {
  if (category === 'damper' || category === 'filter' || category === 'cooler' || category === 'fan' || category === 'heater') {
    return [
      { name: 'IN', dx: 0, dy: 90, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 120, dy: 90, direction: 'right', signalType: 'signal' },
      { name: 'CTRL', dx: 60, dy: 0, direction: 'top', signalType: 'dc24' },
      { name: 'MTR', dx: 60, dy: 160, direction: 'bottom', signalType: 'signal' },
    ];
  }
  if (category === 'kip_circle') {
    return [
      { name: 'IN', dx: 0, dy: 55, direction: 'left', signalType: 'dc24' },
      { name: 'OUT', dx: 90, dy: 55, direction: 'right', signalType: 'signal' },
      { name: 'TOP', dx: 45, dy: 0, direction: 'top', signalType: 'signal' },
      { name: 'BOT', dx: 45, dy: 110, direction: 'bottom', signalType: 'signal' },
    ];
  }
  return [
    { name: '1', dx: 30, dy: 0, direction: 'top', signalType: 'signal' },
    { name: '2', dx: 90, dy: 0, direction: 'top', signalType: 'dc24' },
    { name: '3', dx: 30, dy: 100, direction: 'bottom', signalType: 'signal' },
    { name: '4', dx: 90, dy: 100, direction: 'bottom', signalType: 'dc0' },
  ];
}

export const CatalogItemModal: React.FC<CatalogItemModalProps> = ({
  open,
  editingItem,
  onClose,
  onSave,
}) => {
  const [category, setCategory] = useState<DeviceCategory>('fan');
  const [stageRole, setStageRole] = useState<HvacStageRole>('supply_fan');
  const [defaultPrefix, setDefaultPrefix] = useState('BL');
  const [componentName, setComponentName] = useState('');
  const [article, setArticle] = useState('');
  const [manufacturer, setManufacturer] = useState('ВЕЗА');
  const [e3BlockName, setE3BlockName] = useState('');
  const [defaultCable, setDefaultCable] = useState('ВВГнг(А)-LS 4х2,5');
  const [di, setDi] = useState(2);
  const [doCnt, setDoCnt] = useState(1);
  const [ai, setAi] = useState(0);
  const [ao, setAo] = useState(0);
  const [powerKw, setPowerKw] = useState('');
  const [voltage, setVoltage] = useState('380V');
  const [exZone, setExZone] = useState<'non-Ex' | 'Exd'>('non-Ex');
  const [attributes, setAttributes] = useState<E3Attribute[]>([]);
  const [newAttrName, setNewAttrName] = useState('');
  const [newAttrValue, setNewAttrValue] = useState('');

  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      setCategory(editingItem.category);
      setStageRole(editingItem.stageRole || 'custom');
      setDefaultPrefix(editingItem.defaultPrefix);
      setComponentName(editingItem.componentName);
      setArticle(editingItem.article);
      setManufacturer(editingItem.manufacturer);
      setE3BlockName(editingItem.e3BlockName);
      setDefaultCable(editingItem.defaultCable || '');
      setDi(editingItem.ioProfile?.di ?? 1);
      setDoCnt(editingItem.ioProfile?.do ?? 0);
      setAi(editingItem.ioProfile?.ai ?? 0);
      setAo(editingItem.ioProfile?.ao ?? 0);
      setPowerKw(editingItem.fluxMatch?.minPowerKw !== undefined ? String(editingItem.fluxMatch.minPowerKw) : '');
      setVoltage(editingItem.fluxMatch?.voltage || '380V');
      setExZone(editingItem.fluxMatch?.exZone || 'non-Ex');
      setAttributes(structuredClone(editingItem.defaultAttributes));
    } else {
      setCategory('fan');
      setStageRole('supply_fan');
      setDefaultPrefix('BL');
      setComponentName('');
      setArticle('');
      setManufacturer('ВЕЗА');
      setE3BlockName('FSA_CUSTOM_ITEM');
      setDefaultCable('КВВГнг(А)-LS 4х1,5');
      setDi(2);
      setDoCnt(1);
      setAi(0);
      setAo(0);
      setPowerKw('3.0');
      setVoltage('380V');
      setExZone('non-Ex');
      setAttributes([
        { name: 'Функция контроллера', value: 'Сигнализация, Управление', owner: '', conflict: 'flux' },
        { name: 'Степень защиты', value: 'IP54', owner: '', conflict: 'flux' },
      ]);
    }
    setNewAttrName('');
    setNewAttrValue('');
  }, [open, editingItem]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!componentName.trim()) return;
    const isHvac = ['damper', 'filter', 'heater', 'cooler', 'fan'].includes(category);
    const width = editingItem?.width || (category === 'kip_circle' ? 90 : isHvac ? 120 : 120);
    const height = editingItem?.height || (category === 'kip_circle' ? 110 : isHvac ? 160 : 100);
    const pKw = Number(powerKw.replace(',', '.'));
    const nextAttrs = [...attributes];
    if (powerKw.trim()) {
      const idxP = nextAttrs.findIndex((a) => /^мощность$/i.test(a.name.trim()));
      if (idxP >= 0) {
        nextAttrs[idxP] = { ...nextAttrs[idxP], value: `${powerKw.trim()} кВт` };
      } else {
        nextAttrs.unshift({ name: 'Мощность', value: `${powerKw.trim()} кВт`, owner: '', conflict: 'flux' });
      }
    }
    const idxEx = nextAttrs.findIndex((a) => /^исполнение$/i.test(a.name.trim()));
    if (idxEx >= 0) {
      nextAttrs[idxEx] = { ...nextAttrs[idxEx], value: exZone };
    } else {
      nextAttrs.push({ name: 'Исполнение', value: exZone, owner: '', conflict: 'flux' });
    }

    const pins =
      editingItem && editingItem.category === category ? editingItem.pins : buildDefaultPins(category);

    const item: CatalogItem = {
      id: editingItem?.id || `custom-${Date.now().toString(36)}`,
      category,
      stageRole,
      defaultPrefix: defaultPrefix.trim() || 'K',
      componentName: componentName.trim(),
      article: article.trim() || 'CUSTOM-01',
      manufacturer: manufacturer.trim() || 'Собств. база',
      e3BlockName: e3BlockName.trim() || `FSA_${(defaultPrefix || 'DEV').toUpperCase()}`,
      width,
      height,
      pins,
      defaultAttributes: nextAttrs,
      isCustom: true,
      ioProfile: { di, do: doCnt, ai, ao },
      defaultCable: defaultCable.trim() || undefined,
      fluxMatch: {
        minPowerKw: Number.isFinite(pKw) && pKw > 0 ? Math.max(0, pKw * 0.6) : undefined,
        maxPowerKw: Number.isFinite(pKw) && pKw > 0 ? pKw * 1.4 : undefined,
        voltage,
        exZone,
      },
    };
    onSave(item);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-item-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-2xl rounded-md border border-[var(--flux-line-strong)] bg-[var(--flux-surface)] shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-4 h-11 border-b border-[var(--flux-line)] flex items-center justify-between shrink-0">
          <h2 id="catalog-item-title" className="text-[14px] font-semibold text-[var(--flux-text)]">
            {editingItem ? 'Редактировать изделие в базе' : 'Добавить своё изделие в базу E3ProMax'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно изделия"
            className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 text-[12px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="cat-role" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Назначение в ФСА (для автоподбора)
              </label>
              <select
                id="cat-role"
                value={stageRole}
                onChange={(e) => setStageRole(e.target.value as HvacStageRole)}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              >
                {(Object.keys(HVAC_ROLE_LABELS) as HvacStageRole[]).map((r) => (
                  <option key={r} value={r}>
                    {HVAC_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cat-type" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Графическое УГО
              </label>
              <select
                id="cat-type"
                value={category}
                onChange={(e) => setCategory(e.target.value as DeviceCategory)}
                className="w-full h-8 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="cat-name" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Наименование изделия
              </label>
              <input
                id="cat-name"
                type="text"
                required
                value={componentName}
                onChange={(e) => setComponentName(e.target.value)}
                placeholder="Например: Вентилятор приточный 7.5 кВт ВЕЗА"
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="cat-prefix" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Префикс (BL, DW, THT)
              </label>
              <input
                id="cat-prefix"
                type="text"
                value={defaultPrefix}
                onChange={(e) => setDefaultPrefix(e.target.value.toUpperCase())}
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="cat-art" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Артикул / Тип
              </label>
              <input
                id="cat-art"
                type="text"
                value={article}
                onChange={(e) => setArticle(e.target.value)}
                placeholder="ВРАН9-7.5-4"
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="cat-mfr" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Производитель
              </label>
              <input
                id="cat-mfr"
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              />
            </div>
            <div>
              <label htmlFor="cat-block" className="block text-[11px] font-medium text-[var(--flux-text-muted)] mb-1">
                Имя блока E3.series
              </label>
              <input
                id="cat-block"
                type="text"
                value={e3BlockName}
                onChange={(e) => setE3BlockName(e.target.value)}
                className="w-full h-8 px-2.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] font-mono text-[var(--flux-text)]"
              />
            </div>
          </div>

          {/* Flux Matching & Cable */}
          <div className="p-3 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] space-y-3">
            <div className="text-[11px] font-semibold text-[var(--flux-text)]">
              Параметры подбора из Flux / проекта и матрица сигналов I/O
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">Мощность, кВт</label>
                <input
                  type="text"
                  value={powerKw}
                  onChange={(e) => setPowerKw(e.target.value)}
                  placeholder="7.5"
                  className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[var(--flux-text)]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">Напряжение</label>
                <select
                  value={voltage}
                  onChange={(e) => setVoltage(e.target.value)}
                  className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)]"
                >
                  <option value="24V">24V DC/AC</option>
                  <option value="230V">~230V</option>
                  <option value="380V">3~380V</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">Исполнение</label>
                <select
                  value={exZone}
                  onChange={(e) => setExZone(e.target.value as 'non-Ex' | 'Exd')}
                  className="w-full h-7 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] text-[var(--flux-text)]"
                >
                  <option value="non-Ex">non-Ex (Общепром)</option>
                  <option value="Exd">Exd (Взрывозащ.)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">Кабель (Внешка)</label>
                <input
                  type="text"
                  value={defaultCable}
                  onChange={(e) => setDefaultCable(e.target.value)}
                  className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono text-[11px] text-[var(--flux-text)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ['DI', di, setDi],
                  ['DO', doCnt, setDoCnt],
                  ['AI', ai, setAi],
                  ['AO', ao, setAo],
                ] as const
              ).map(([lbl, val, setter]) => (
                <div key={lbl}>
                  <label className="block text-[10px] text-[var(--flux-text-muted)] mb-1">Кол-во {lbl}</label>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    value={val}
                    onChange={(e) => setter(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-surface)] font-mono tabular-nums text-[var(--flux-text)]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Default Attributes */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[var(--flux-text)]">
              Атрибуты изделия (заполняются автоматически при размещении)
            </div>
            <div className="space-y-1.5">
              {attributes.map((attr, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={attr.name}
                    onChange={(e) =>
                      setAttributes((prev) =>
                        prev.map((a, i) => (i === idx ? { ...a, name: e.target.value } : a))
                      )
                    }
                    className="w-2/5 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
                  />
                  <input
                    type="text"
                    value={attr.value}
                    onChange={(e) =>
                      setAttributes((prev) =>
                        prev.map((a, i) => (i === idx ? { ...a, value: e.target.value } : a))
                      )
                    }
                    className="flex-1 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
                  />
                  <button
                    type="button"
                    onClick={() => setAttributes((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Удалить атрибут"
                    className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--flux-text-muted)] hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Имя атрибута"
                value={newAttrName}
                onChange={(e) => setNewAttrName(e.target.value)}
                className="w-2/5 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              />
              <input
                type="text"
                placeholder="Значение"
                value={newAttrValue}
                onChange={(e) => setNewAttrValue(e.target.value)}
                className="flex-1 h-7 px-2 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)]"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newAttrName.trim()) return;
                  setAttributes((prev) => [
                    ...prev,
                    { name: newAttrName.trim(), value: newAttrValue.trim(), owner: '', conflict: 'flux' },
                  ]);
                  setNewAttrName('');
                  setNewAttrValue('');
                }}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[var(--flux-line-strong)] bg-[var(--flux-bg)] hover:bg-[var(--flux-hover)] text-[var(--flux-text)]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Атрибут</span>
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-[var(--flux-line)] flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded border border-[var(--flux-line)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="h-8 px-4 rounded bg-[var(--flux-accent)] hover:bg-[var(--flux-accent-hover)] text-white font-medium"
            >
              Сохранить в базу
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
