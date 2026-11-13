import type { CatalogItem, E3Attribute, E3Device, SchematicFontFamily, SheetFormat } from './e3Types.ts';

export const SHEET_DIMENSIONS: Record<SheetFormat, { width: number; height: number; label: string }> = {
  A4: { width: 1200, height: 848, label: 'А4 (297×210 мм, альбом)' },
  A3: { width: 1680, height: 1188, label: 'А3 (420×297 мм, ГОСТ)' },
  A2: { width: 2380, height: 1684, label: 'А2 (594×420 мм, ФСА)' },
  A1: { width: 3360, height: 2376, label: 'А1 (841×594 мм, большая ФСА)' },
};

export const SCHEMATIC_FONT_OPTIONS: Array<{
  id: SchematicFontFamily;
  label: string;
  cssFamily: string;
  e3FontName: string;
}> = [
  { id: 'GOST', label: 'ГОСТ тип B (ISOCPEUR / DIN)', cssFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif", e3FontName: 'GOST type B' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono (Инженерный)', cssFamily: "'JetBrains Mono', monospace", e3FontName: 'Courier New' },
  { id: 'DM Sans', label: 'DM Sans (Современный Flux)', cssFamily: "'DM Sans', sans-serif", e3FontName: 'Arial' },
  { id: 'Plus Jakarta Sans', label: 'Plus Jakarta Sans', cssFamily: "'Plus Jakarta Sans', sans-serif", e3FontName: 'Tahoma' },
  { id: 'Arial', label: 'Arial / Технический E3', cssFamily: 'Arial, Helvetica, sans-serif', e3FontName: 'Arial' },
];

export function resolveSchematicCssFont(family?: SchematicFontFamily): string {
  const found = SCHEMATIC_FONT_OPTIONS.find((f) => f.id === family);
  return found ? found.cssFamily : SCHEMATIC_FONT_OPTIONS[0].cssFamily;
}

export const E3_CATALOG: CatalogItem[] = [
  // === Стандартная электрическая база УГО ===
  {
    id: 'cat-qf-3p',
    category: 'breaker',
    defaultPrefix: 'QF',
    componentName: 'Автоматический выключатель 3P 25A C',
    article: 'A9F74325',
    manufacturer: 'Schneider Electric',
    e3BlockName: 'GOST_QF_3P_25A',
    width: 100,
    height: 110,
    pins: [
      { name: '1/L1', dx: 20, dy: 0, direction: 'top', signalType: 'power' },
      { name: '3/L2', dx: 50, dy: 0, direction: 'top', signalType: 'power' },
      { name: '5/L3', dx: 80, dy: 0, direction: 'top', signalType: 'power' },
      { name: '2/T1', dx: 20, dy: 110, direction: 'bottom', signalType: 'power' },
      { name: '4/T2', dx: 50, dy: 110, direction: 'bottom', signalType: 'power' },
      { name: '6/T3', dx: 80, dy: 110, direction: 'bottom', signalType: 'power' },
    ],
    defaultAttributes: [
      { name: 'Номинальный ток', value: '25 А', owner: '', conflict: 'flux' },
      { name: 'Кривая отключения', value: 'C', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '3~380 В 50 Гц', owner: '', conflict: 'flux' },
      { name: 'Отключающая способность', value: '6 кА', owner: '', conflict: 'script' },
      { name: 'Степень защиты', value: 'IP20', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-qf-1p',
    category: 'breaker',
    defaultPrefix: 'QF',
    componentName: 'Автоматический выключатель 1P 10A C',
    article: 'A9F74110',
    manufacturer: 'Schneider Electric',
    e3BlockName: 'GOST_QF_1P_10A',
    width: 60,
    height: 100,
    pins: [
      { name: '1', dx: 30, dy: 0, direction: 'top', signalType: 'power' },
      { name: '2', dx: 30, dy: 100, direction: 'bottom', signalType: 'power' },
    ],
    defaultAttributes: [
      { name: 'Номинальный ток', value: '10 А', owner: '', conflict: 'flux' },
      { name: 'Кривая отключения', value: 'C', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '230 В', owner: '', conflict: 'flux' },
      { name: 'Отключающая способность', value: '6 кА', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-km-3p',
    category: 'contactor',
    defaultPrefix: 'KM',
    componentName: 'Контактор модульный 25A 24VDC',
    article: 'LC1D25BD',
    manufacturer: 'Schneider Electric',
    e3BlockName: 'GOST_KM_3P_COIL',
    width: 120,
    height: 120,
    pins: [
      { name: '1/L1', dx: 30, dy: 0, direction: 'top', signalType: 'power' },
      { name: '3/L2', dx: 60, dy: 0, direction: 'top', signalType: 'power' },
      { name: '5/L3', dx: 90, dy: 0, direction: 'top', signalType: 'power' },
      { name: '2/T1', dx: 30, dy: 120, direction: 'bottom', signalType: 'power' },
      { name: '4/T2', dx: 60, dy: 120, direction: 'bottom', signalType: 'power' },
      { name: '6/T3', dx: 90, dy: 120, direction: 'bottom', signalType: 'power' },
      { name: 'A1', dx: 0, dy: 40, direction: 'left', signalType: 'dc24' },
      { name: 'A2', dx: 0, dy: 80, direction: 'left', signalType: 'dc0' },
    ],
    defaultAttributes: [
      { name: 'Ток AC-3', value: '25 А', owner: '', conflict: 'flux' },
      { name: 'Напряжение силовой цепи', value: '3~380 В', owner: '', conflict: 'flux' },
      { name: 'Катушка управления', value: '24 В DC', owner: '#1', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP20', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-uz-vfd',
    category: 'drive',
    defaultPrefix: 'UZ',
    componentName: 'Преобразователь частоты 5.5 кВт 380В',
    article: 'FC-051P5K5T4E20H',
    manufacturer: 'Danfoss',
    e3BlockName: 'GOST_VFD_5K5',
    width: 150,
    height: 160,
    pins: [
      { name: 'L1', dx: 30, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'L2', dx: 75, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'L3', dx: 120, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'U', dx: 30, dy: 160, direction: 'bottom', signalType: 'power' },
      { name: 'V', dx: 75, dy: 160, direction: 'bottom', signalType: 'power' },
      { name: 'W', dx: 120, dy: 160, direction: 'bottom', signalType: 'power' },
      { name: 'PE', dx: 150, dy: 130, direction: 'right', signalType: 'pe' },
      { name: 'DI1', dx: 0, dy: 60, direction: 'left', signalType: 'signal' },
      { name: 'RS485+', dx: 0, dy: 100, direction: 'left', signalType: 'bus' },
    ],
    defaultAttributes: [
      { name: 'Мощность', value: '5.5 кВт', owner: '', conflict: 'flux' },
      { name: 'Протокол', value: 'Modbus RTU', owner: '', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP20', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-motor-3p',
    category: 'motor',
    defaultPrefix: 'M',
    componentName: 'Электродвигатель асинхронный 4.0 кВт',
    article: 'АИР100L4У2',
    manufacturer: 'ВЕЗА / Элдин',
    e3BlockName: 'GOST_MOTOR_3P',
    width: 110,
    height: 110,
    pins: [
      { name: 'U1', dx: 25, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'V1', dx: 55, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'W1', dx: 85, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'PE', dx: 110, dy: 55, direction: 'right', signalType: 'pe' },
    ],
    defaultAttributes: [
      { name: 'Мощность вала', value: '4.0 кВт', owner: '', conflict: 'flux' },
      { name: 'Частота вращения', value: '1440 об/мин', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '380 В 50 Гц', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-psu-24v',
    category: 'psu',
    defaultPrefix: 'G',
    componentName: 'Блок питания импульсный 24VDC 5A',
    article: 'БП120Б-Д4-24',
    manufacturer: 'ОВЕН',
    e3BlockName: 'GOST_PSU_24VDC',
    width: 130,
    height: 110,
    pins: [
      { name: 'L', dx: 30, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'N', dx: 65, dy: 0, direction: 'top', signalType: 'neutral' },
      { name: 'PE', dx: 100, dy: 0, direction: 'top', signalType: 'pe' },
      { name: '+24V', dx: 40, dy: 110, direction: 'bottom', signalType: 'dc24' },
      { name: '0V', dx: 90, dy: 110, direction: 'bottom', signalType: 'dc0' },
    ],
    defaultAttributes: [
      { name: 'Входное напряжение', value: '~230 В 50 Гц', owner: '', conflict: 'flux' },
      { name: 'Выходное напряжение', value: '24 В DC', owner: '', conflict: 'flux' },
      { name: 'Выходной ток', value: '5.0 А', owner: '', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP20', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-plc-210',
    category: 'plc',
    defaultPrefix: 'A',
    componentName: 'Программируемый логический контроллер',
    article: 'ПЛК210-03-CS',
    manufacturer: 'ОВЕН',
    e3BlockName: 'GOST_PLC_210',
    width: 180,
    height: 170,
    pins: [
      { name: '+24V', dx: 50, dy: 0, direction: 'top', signalType: 'dc24' },
      { name: '0V', dx: 130, dy: 0, direction: 'top', signalType: 'dc0' },
      { name: 'DI1', dx: 0, dy: 50, direction: 'left', signalType: 'signal' },
      { name: 'DI2', dx: 0, dy: 90, direction: 'left', signalType: 'signal' },
      { name: 'AI1', dx: 0, dy: 130, direction: 'left', signalType: 'signal' },
      { name: 'DO1', dx: 180, dy: 50, direction: 'right', signalType: 'dc24' },
      { name: 'DO2', dx: 180, dy: 90, direction: 'right', signalType: 'dc24' },
      { name: 'RS485', dx: 180, dy: 130, direction: 'right', signalType: 'bus' },
    ],
    defaultAttributes: [
      { name: 'IP-адрес', value: '192.168.10.21', owner: '', conflict: 'flux' },
      { name: 'Дискретные входы', value: '12 DI', owner: '', conflict: 'script' },
      { name: 'Дискретные выходы', value: '8 DO', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-sensor-pt100',
    category: 'sensor',
    defaultPrefix: 'BT',
    componentName: 'Датчик температуры канальный 4-20 мА',
    article: 'ДТС3005-PT1000',
    manufacturer: 'ОВЕН',
    e3BlockName: 'GOST_SENSOR_TEMP',
    width: 120,
    height: 80,
    pins: [
      { name: '+24V', dx: 120, dy: 25, direction: 'right', signalType: 'dc24' },
      { name: 'OUT', dx: 120, dy: 55, direction: 'right', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Диапазон измерения', value: '-40...+80 °C', owner: '', conflict: 'flux' },
      { name: 'Выходной сигнал', value: '4...20 мА', owner: '', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP65', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-relay-24',
    category: 'relay',
    defaultPrefix: 'KA',
    componentName: 'Промежуточное реле 2CO 24VDC',
    article: 'RXM2AB2BD',
    manufacturer: 'Schneider Electric',
    e3BlockName: 'GOST_RELAY_24V',
    width: 100,
    height: 90,
    pins: [
      { name: 'A1', dx: 0, dy: 30, direction: 'left', signalType: 'dc24' },
      { name: 'A2', dx: 0, dy: 60, direction: 'left', signalType: 'dc0' },
      { name: '11', dx: 100, dy: 30, direction: 'right', signalType: 'dc24' },
      { name: '14', dx: 100, dy: 60, direction: 'right', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Коммутируемый ток', value: '12 А', owner: '', conflict: 'flux' },
      { name: 'Напряжение катушки', value: '24 В DC', owner: '', conflict: 'flux' },
      { name: 'Контактная группа', value: '2CO (перекидные)', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-lamp-hl',
    category: 'lamp',
    defaultPrefix: 'HL',
    componentName: 'Светосигнальная лампа LED зелёная 24В',
    article: 'XB4BVB3',
    manufacturer: 'Schneider Electric',
    e3BlockName: 'GOST_LAMP_LED',
    width: 70,
    height: 70,
    pins: [
      { name: 'X1', dx: 0, dy: 35, direction: 'left', signalType: 'dc24' },
      { name: 'X2', dx: 70, dy: 35, direction: 'right', signalType: 'dc0' },
    ],
    defaultAttributes: [
      { name: 'Цвет свечения', value: 'Зелёный', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '24 В DC', owner: '', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP65', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-xt-4p',
    category: 'terminal',
    defaultPrefix: 'XT',
    componentName: 'Клеммный блок проходной 4-полюсный 4 мм²',
    article: 'UT 4',
    manufacturer: 'Phoenix Contact',
    e3BlockName: 'GOST_TERMINAL_4P',
    width: 120,
    height: 60,
    pins: [
      { name: '1', dx: 20, dy: 0, direction: 'top', signalType: 'power' },
      { name: '2', dx: 45, dy: 0, direction: 'top', signalType: 'power' },
      { name: '3', dx: 75, dy: 0, direction: 'top', signalType: 'power' },
      { name: '4', dx: 100, dy: 0, direction: 'top', signalType: 'pe' },
      { name: '1.1', dx: 20, dy: 60, direction: 'bottom', signalType: 'power' },
      { name: '2.1', dx: 45, dy: 60, direction: 'bottom', signalType: 'power' },
      { name: '3.1', dx: 75, dy: 60, direction: 'bottom', signalType: 'power' },
      { name: '4.1', dx: 100, dy: 60, direction: 'bottom', signalType: 'pe' },
    ],
    defaultAttributes: [
      { name: 'Сечение', value: '0.14...6 мм²', owner: '', conflict: 'flux' },
      { name: 'Номинальный ток', value: '32 А', owner: '', conflict: 'flux' },
      { name: 'Монтаж', value: 'DIN-рейка 35 мм', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'cat-xt-1p',
    category: 'terminal',
    defaultPrefix: 'XT',
    componentName: 'Клемма проходная 1-полюсная 4 мм²',
    article: 'UT 4-1P',
    manufacturer: 'Phoenix Contact',
    e3BlockName: 'GOST_TERMINAL_1P',
    width: 40,
    height: 60,
    pins: [
      { name: '1', dx: 20, dy: 0, direction: 'top', signalType: 'power' },
      { name: '2', dx: 20, dy: 60, direction: 'bottom', signalType: 'power' },
    ],
    defaultAttributes: [
      { name: 'Сечение', value: '0.14...6 мм²', owner: '', conflict: 'flux' },
      { name: 'Номинальный ток', value: '32 А', owner: '', conflict: 'flux' },
      { name: 'Монтаж', value: 'DIN-рейка 35 мм', owner: '', conflict: 'script' },
    ],
  },

  // === База изделий ВЕЗА / ОВКВ для ФСА и Внешних соединений ===
  {
    id: 'hvac-damper-24',
    category: 'damper',
    defaultPrefix: 'DW',
    stageRole: 'intake_damper',
    componentName: 'Клапан воздушный с электроприводом 24В (откр/закр)',
    article: 'BELIMO-NM24A-S',
    manufacturer: 'Belimo / ВЕЗА',
    e3BlockName: 'FSA_DAMPER_24V',
    width: 110,
    height: 150,
    ioProfile: { di: 2, do: 1, ai: 0, ao: 0 },
    fluxMatch: { voltage: '24V', exZone: 'non-Ex' },
    defaultCable: 'ВВГнг(А)-LS 6х0,75',
    pins: [
      { name: 'IN', dx: 0, dy: 105, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 110, dy: 105, direction: 'right', signalType: 'signal' },
      { name: 'CTRL', dx: 55, dy: 0, direction: 'top', signalType: 'dc24' },
      { name: 'FB', dx: 55, dy: 150, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Питание привода', value: '~/=24 В', owner: '', conflict: 'flux' },
      { name: 'Крутящий момент', value: '10 Нм', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '2 DI / 1 DO', owner: '', conflict: 'script' },
      { name: 'Исполнение', value: 'non-Ex', owner: '', conflict: 'flux' },
      { name: 'Функция контроллера', value: 'Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-damper-230-heat',
    category: 'damper',
    defaultPrefix: 'DW',
    stageRole: 'intake_damper',
    componentName: 'Клапан утеплённый с приводом 230В и периметральным обогревом',
    article: 'BELIMO-SM230A-S+H',
    manufacturer: 'Belimo / ВЕЗА',
    e3BlockName: 'FSA_DAMPER_230V_HEAT',
    width: 120,
    height: 160,
    ioProfile: { di: 2, do: 2, ai: 0, ao: 0 },
    fluxMatch: { voltage: '230V', exZone: 'non-Ex' },
    defaultCable: 'ВВГнг(А)-LS-ХЛ 3х2,5 + 6х0,75',
    pins: [
      { name: 'IN', dx: 0, dy: 100, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 120, dy: 100, direction: 'right', signalType: 'signal' },
      { name: 'CTRL', dx: 60, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'FB', dx: 60, dy: 160, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Питание привода', value: '~230 В', owner: '', conflict: 'flux' },
      { name: 'Обогрев периметра', value: 'Да (~230В)', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '2 DI / 2 DO', owner: '', conflict: 'script' },
      { name: 'Исполнение', value: 'non-Exd (ХЛ)', owner: '', conflict: 'flux' },
      { name: 'Функция контроллера', value: 'Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-damper-outlet',
    category: 'damper',
    defaultPrefix: 'DW',
    stageRole: 'outlet_damper',
    componentName: 'Клапан воздушный отсечной на выходе с приводом 24В',
    article: 'BELIMO-LF24-S',
    manufacturer: 'Belimo / ВЕЗА',
    e3BlockName: 'FSA_DAMPER_OUT',
    width: 110,
    height: 150,
    ioProfile: { di: 2, do: 1, ai: 0, ao: 0 },
    fluxMatch: { voltage: '24V', exZone: 'non-Ex' },
    defaultCable: 'МКЭШ 5х0,75',
    pins: [
      { name: 'IN', dx: 0, dy: 105, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 110, dy: 105, direction: 'right', signalType: 'signal' },
      { name: 'CTRL', dx: 55, dy: 0, direction: 'top', signalType: 'dc24' },
      { name: 'FB', dx: 55, dy: 150, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Питание привода', value: '~/=24 В (возвр. пружина)', owner: '', conflict: 'flux' },
      { name: 'Исполнение', value: 'non-Ex', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '2 DI / 1 DO', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-filter-g4',
    category: 'filter',
    defaultPrefix: 'FA',
    stageRole: 'filter',
    componentName: 'Фильтр карманный G4/EU4 с реле перепада давления ΔP',
    article: 'ФяК-G4+PS500',
    manufacturer: 'ВЕЗА / Beck',
    e3BlockName: 'FSA_FILTER_DP',
    width: 110,
    height: 150,
    ioProfile: { di: 1, do: 0, ai: 0, ao: 0 },
    fluxMatch: { exZone: 'non-Ex' },
    defaultCable: 'КВВГнг(А)-LS 1х2х1,0',
    pins: [
      { name: 'IN', dx: 0, dy: 105, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 110, dy: 105, direction: 'right', signalType: 'signal' },
      { name: 'DP', dx: 55, dy: 0, direction: 'top', signalType: 'signal' },
      { name: 'BOT', dx: 55, dy: 150, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Класс очистки', value: 'G4 (EU4)', owner: '', conflict: 'flux' },
      { name: 'Уставка ΔP загрязн.', value: '150 Па (H)', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '1 DI', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Сигнализация', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-filter-f7',
    category: 'filter',
    defaultPrefix: 'FA',
    stageRole: 'filter',
    componentName: 'Фильтр тонкой очистки F7 с реле перепада давления (250 Па)',
    article: 'ФяК-F7+DPS300',
    manufacturer: 'ВЕЗА / Produal',
    e3BlockName: 'FSA_FILTER_F7',
    width: 110,
    height: 150,
    ioProfile: { di: 1, do: 0, ai: 0, ao: 0 },
    fluxMatch: { exZone: 'non-Ex' },
    defaultCable: 'КВВГнг(А)-LS 1х2х1,0',
    pins: [
      { name: 'IN', dx: 0, dy: 105, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 110, dy: 105, direction: 'right', signalType: 'signal' },
      { name: 'DP', dx: 55, dy: 0, direction: 'top', signalType: 'signal' },
      { name: 'BOT', dx: 55, dy: 150, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Класс очистки', value: 'F7 (тонкая)', owner: '', conflict: 'flux' },
      { name: 'Уставка ΔP загрязн.', value: '250 Па (H)', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '1 DI', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Сигнализация', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-heater-water',
    category: 'heater',
    defaultPrefix: 'EB',
    stageRole: 'water_heater',
    componentName: 'Калорифер водяной с узлом обвязки (насос, клапан 0-10В, защита)',
    article: 'КВН-В-3Р+THV010',
    manufacturer: 'ВЕЗА / Grundfos / Belimo',
    e3BlockName: 'FSA_HEATER_WATER',
    width: 150,
    height: 180,
    ioProfile: { di: 2, do: 1, ai: 1, ao: 1 },
    fluxMatch: { voltage: '230V', exZone: 'non-Ex' },
    defaultCable: 'ВВГнг(А)-LS 3х1,5 + МКЭШ 2х2х1,0',
    pins: [
      { name: 'IN', dx: 0, dy: 90, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 150, dy: 90, direction: 'right', signalType: 'signal' },
      { name: 'FREEZE', dx: 75, dy: 0, direction: 'top', signalType: 'signal' },
      { name: 'MIX', dx: 75, dy: 180, direction: 'bottom', signalType: 'dc24' },
    ],
    defaultAttributes: [
      { name: 'Теплоноситель', value: 'Вода 95/70 °C', owner: '', conflict: 'flux' },
      { name: 'Привод клапана THV', value: '0...10 В DC (AO)', owner: '', conflict: 'flux' },
      { name: 'Защита по воздуху / воде', value: 'L (10 °C) + PT1000', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '2 DI / 1 DO / 1 AI / 1 AO', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Измерение, Регулирование, Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-heater-elec',
    category: 'heater',
    defaultPrefix: 'EK',
    stageRole: 'electric_heater',
    componentName: 'Калорифер электрический 15 кВт 380В (2 ступени + термозащита)',
    article: 'КЭН-15-380-2СТ',
    manufacturer: 'ВЕЗА',
    e3BlockName: 'FSA_HEATER_ELEC_15KW',
    width: 140,
    height: 160,
    ioProfile: { di: 2, do: 2, ai: 0, ao: 1 },
    fluxMatch: { minPowerKw: 5, maxPowerKw: 30, voltage: '380V', exZone: 'non-Ex' },
    defaultCable: 'ВВГнг(А)-LS 5х4 + КВВГ 4х1,0',
    pins: [
      { name: 'IN', dx: 0, dy: 90, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 140, dy: 90, direction: 'right', signalType: 'signal' },
      { name: 'PWR', dx: 70, dy: 0, direction: 'top', signalType: 'power' },
      { name: 'PROT', dx: 70, dy: 160, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Мощность ТЭН', value: '15 кВт', owner: '', conflict: 'flux' },
      { name: 'Питание', value: '3~380 В 50 Гц', owner: '', conflict: 'flux' },
      { name: 'Защита перегрева', value: 'Термовыкл. 60°C / 90°C', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '2 DI / 2 DO / 1 AO', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Регулирование, Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-cooler-kkb',
    category: 'cooler',
    defaultPrefix: 'EC',
    stageRole: 'cooler',
    componentName: 'Охладитель фреоновый (секция + ККБ управление 24В)',
    article: 'ВОВ-ККБ-20',
    manufacturer: 'ВЕЗА',
    e3BlockName: 'FSA_COOLER_DX',
    width: 130,
    height: 160,
    ioProfile: { di: 2, do: 1, ai: 0, ao: 1 },
    fluxMatch: { voltage: '380V', exZone: 'non-Ex' },
    defaultCable: 'МКЭШ 4х0,75',
    pins: [
      { name: 'IN', dx: 0, dy: 90, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 130, dy: 90, direction: 'right', signalType: 'signal' },
      { name: 'KKB', dx: 65, dy: 0, direction: 'top', signalType: 'bus' },
      { name: 'DRN', dx: 65, dy: 160, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Холодопроизводительность', value: '18.5 кВт', owner: '', conflict: 'flux' },
      { name: 'Питание', value: '3~380 В / =24 В', owner: '', conflict: 'flux' },
      { name: 'Исполнение', value: 'non-Ex', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '2 DI / 1 DO / 1 AO', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Регулирование, Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-fan-supply-2k2',
    category: 'fan',
    defaultPrefix: 'BL',
    stageRole: 'supply_fan',
    componentName: 'Вентилятор приточный 2.2 кВт 380В + ПЧ + PTC + ΔP + HHS',
    article: 'ВРАН9-2.2-4-VFD',
    manufacturer: 'ВЕЗА',
    e3BlockName: 'FSA_FAN_SUPPLY_2K2',
    width: 140,
    height: 170,
    ioProfile: { di: 3, do: 1, ai: 0, ao: 1 },
    fluxMatch: { minPowerKw: 0.5, maxPowerKw: 3.5, voltage: '380V', exZone: 'non-Ex' },
    defaultCable: 'ВВГнг(А)-LS 4х2,5 + МКЭШ 2х2х0,75',
    pins: [
      { name: 'IN', dx: 0, dy: 85, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 140, dy: 85, direction: 'right', signalType: 'signal' },
      { name: 'DP', dx: 70, dy: 0, direction: 'top', signalType: 'signal' },
      { name: 'MTR', dx: 70, dy: 170, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Мощность двигателя', value: '2.2 кВт', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '3~380 В 50 Гц', owner: '', conflict: 'flux' },
      { name: 'Термозащита', value: '3×PTC (THE)', owner: '', conflict: 'flux' },
      { name: 'Перепад давления', value: 'PDHS LL 250 Па', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '3 DI / 1 DO / 1 AO', owner: '', conflict: 'script' },
      { name: 'Исполнение', value: 'non-Ex', owner: '', conflict: 'flux' },
      { name: 'Функция контроллера', value: 'Измерение, Регулирование, Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-fan-supply-5k5',
    category: 'fan',
    defaultPrefix: 'BL',
    stageRole: 'supply_fan',
    componentName: 'Вентилятор приточный пром. 5.5 кВт 380В + ПЧ + PTC + Exd',
    article: 'ВРАН9-5.5-4-Exd',
    manufacturer: 'ВЕЗА',
    e3BlockName: 'FSA_FAN_SUPPLY_5K5',
    width: 140,
    height: 170,
    ioProfile: { di: 3, do: 1, ai: 0, ao: 1 },
    fluxMatch: { minPowerKw: 3.6, maxPowerKw: 15, voltage: '380V', exZone: 'Exd' },
    defaultCable: 'ВЗ-ВБбШВнг(А)-LS(ХЛ) 4х6',
    pins: [
      { name: 'IN', dx: 0, dy: 85, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 140, dy: 85, direction: 'right', signalType: 'signal' },
      { name: 'DP', dx: 70, dy: 0, direction: 'top', signalType: 'signal' },
      { name: 'MTR', dx: 70, dy: 170, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Мощность двигателя', value: '5.5 кВт', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '3~380 В 50 Гц', owner: '', conflict: 'flux' },
      { name: 'Термозащита', value: '3×PTC (THE)', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '3 DI / 1 DO / 1 AO', owner: '', conflict: 'script' },
      { name: 'Исполнение', value: '1Ex db IIB T4 (Exd)', owner: '', conflict: 'flux' },
      { name: 'Функция контроллера', value: 'Измерение, Регулирование, Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-fan-exhaust-4k0',
    category: 'fan',
    defaultPrefix: 'BL',
    stageRole: 'exhaust_fan',
    componentName: 'Вентилятор вытяжной 4.0 кВт 380В + ПЧ + THE + HHS',
    article: 'УКРОС-4.0-VFD',
    manufacturer: 'ВЕЗА',
    e3BlockName: 'FSA_FAN_EXHAUST_4K0',
    width: 140,
    height: 170,
    ioProfile: { di: 4, do: 1, ai: 0, ao: 1 },
    fluxMatch: { minPowerKw: 1.5, maxPowerKw: 11, voltage: '380V', exZone: 'non-Ex' },
    defaultCable: 'ВВГнг(А)-LS 4х4 + МКЭШ 1х2х1,0',
    pins: [
      { name: 'IN', dx: 0, dy: 85, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 140, dy: 85, direction: 'right', signalType: 'signal' },
      { name: 'DP', dx: 70, dy: 0, direction: 'top', signalType: 'signal' },
      { name: 'MTR', dx: 70, dy: 170, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Мощность двигателя', value: '4.0 кВт', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '3~380 В 50 Гц', owner: '', conflict: 'flux' },
      { name: 'Исполнение', value: 'non-Ex', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '4 DI / 1 DO / 1 AO', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Измерение, Сигнализация, Управление', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-sensor-tht-duct',
    category: 'kip_circle',
    defaultPrefix: 'THT',
    stageRole: 'temp_sensor',
    componentName: 'Датчик температуры канальный после нагревателя 4-20 мА',
    article: 'ДТС3005-PT1000.B2',
    manufacturer: 'ОВЕН / Метран',
    e3BlockName: 'FSA_KIP_THT',
    width: 90,
    height: 130,
    ioProfile: { di: 0, do: 0, ai: 1, ao: 0 },
    fluxMatch: { signalKind: '4-20mA', exZone: 'non-Ex' },
    defaultCable: 'МКЭШ 1х2х1,0',
    pins: [
      { name: 'IN', dx: 0, dy: 90, direction: 'left', signalType: 'signal' },
      { name: 'OUT', dx: 90, dy: 90, direction: 'right', signalType: 'signal' },
      { name: 'AI', dx: 45, dy: 0, direction: 'top', signalType: 'signal' },
      { name: 'BOT', dx: 45, dy: 130, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Тип сигнала', value: '4...20 мА (AI)', owner: '', conflict: 'flux' },
      { name: 'Диапазон', value: '-50...+100 °C', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '1 AI', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Измерение, Регулирование', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-post-hhs',
    category: 'kip_circle',
    defaultPrefix: 'HHS',
    stageRole: 'control_post',
    componentName: 'Пост кнопочный местный Пуск/Стоп (SB1/SB2 =24В)',
    article: 'ПКЕ-212-2У2',
    manufacturer: 'ВЕЗА / IEK',
    e3BlockName: 'FSA_KIP_HHS',
    width: 90,
    height: 110,
    ioProfile: { di: 2, do: 0, ai: 0, ao: 0 },
    fluxMatch: { voltage: '24V', exZone: 'non-Ex' },
    defaultCable: 'КВВГнг(А)-LS 4х1,5',
    pins: [
      { name: 'S1', dx: 0, dy: 55, direction: 'left', signalType: 'dc24' },
      { name: 'S2', dx: 90, dy: 55, direction: 'right', signalType: 'signal' },
      { name: 'TOP', dx: 45, dy: 0, direction: 'top', signalType: 'dc24' },
      { name: 'BOT', dx: 45, dy: 110, direction: 'bottom', signalType: 'signal' },
    ],
    defaultAttributes: [
      { name: 'Контакты', value: 'SB1 (Стоп НЗ) + SB2 (Пуск НО)', owner: '', conflict: 'flux' },
      { name: 'Напряжение', value: '=24 В DC', owner: '', conflict: 'flux' },
      { name: 'Сигналы I/O', value: '2 DI', owner: '', conflict: 'script' },
      { name: 'Функция контроллера', value: 'Сигнализация', owner: '', conflict: 'script' },
    ],
  },
  {
    id: 'hvac-jb-box',
    category: 'junction_box',
    defaultPrefix: 'HJB',
    stageRole: 'custom',
    componentName: 'Клеммная коробка полевая (8 клемм + шина FE)',
    article: 'ЩКП-8-IP65',
    manufacturer: 'ВЕЗА',
    e3BlockName: 'WIRING_HJB_8P',
    width: 140,
    height: 90,
    ioProfile: { di: 0, do: 0, ai: 0, ao: 0 },
    defaultCable: 'ВВГнг(А)-LS 6х1,0',
    pins: [
      { name: '1', dx: 25, dy: 0, direction: 'top', signalType: 'signal' },
      { name: '2', dx: 55, dy: 0, direction: 'top', signalType: 'signal' },
      { name: '3', dx: 85, dy: 0, direction: 'top', signalType: 'dc24' },
      { name: '4', dx: 115, dy: 0, direction: 'top', signalType: 'pe' },
      { name: '1.1', dx: 25, dy: 90, direction: 'bottom', signalType: 'signal' },
      { name: '2.1', dx: 55, dy: 90, direction: 'bottom', signalType: 'signal' },
      { name: '3.1', dx: 85, dy: 90, direction: 'bottom', signalType: 'dc24' },
      { name: '4.1', dx: 115, dy: 90, direction: 'bottom', signalType: 'pe' },
    ],
    defaultAttributes: [
      { name: 'Степень защиты', value: 'IP65', owner: '', conflict: 'flux' },
      { name: 'Номинальное напряжение', value: '690 В', owner: '', conflict: 'flux' },
      { name: 'Количество клемм', value: '8', owner: '', conflict: 'script' },
      { name: 'Размещение', value: 'На корпусе установки', owner: '', conflict: 'flux' },
    ],
  },
  {
    id: 'cat-offpage-out',
    category: 'offpage_ref',
    defaultPrefix: 'XP',
    componentName: 'Ссылка межлистовая исходящая (→ Лист)',
    article: 'E3-OFFPAGE-OUT',
    manufacturer: 'ГОСТ 2.702 / E3.series',
    e3BlockName: 'GOST_OFFPAGE_OUT',
    width: 120,
    height: 36,
    pins: [{ name: 'IN', dx: 0, dy: 18, direction: 'left', signalType: 'signal' }],
    defaultAttributes: [
      { name: 'Потенциал', value: '+24V_DC', owner: '', conflict: 'flux' },
      { name: 'Направление', value: 'Исходящая (→)', owner: '', conflict: 'flux' },
      { name: 'Стандарт', value: 'ГОСТ 2.702 / E3.series', owner: '', conflict: 'flux' },
    ],
  },
  {
    id: 'cat-offpage-in',
    category: 'offpage_ref',
    defaultPrefix: 'XP',
    componentName: 'Ссылка межлистовая входящая (← Лист)',
    article: 'E3-OFFPAGE-IN',
    manufacturer: 'ГОСТ 2.702 / E3.series',
    e3BlockName: 'GOST_OFFPAGE_IN',
    width: 120,
    height: 36,
    pins: [{ name: 'OUT', dx: 120, dy: 18, direction: 'right', signalType: 'signal' }],
    defaultAttributes: [
      { name: 'Потенциал', value: '+24V_DC', owner: '', conflict: 'flux' },
      { name: 'Направление', value: 'Входящая (←)', owner: '', conflict: 'flux' },
      { name: 'Стандарт', value: 'ГОСТ 2.702 / E3.series', owner: '', conflict: 'flux' },
    ],
  },
];

const CUSTOM_CATALOG_STORAGE_KEY = 'e3promax_custom_catalog_v1';

export function loadCustomCatalog(): CatalogItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_CATALOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CatalogItem[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomCatalog(items: CatalogItem[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(CUSTOM_CATALOG_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota errors
  }
}

export function mergeCatalogItems(customItems: CatalogItem[]): CatalogItem[] {
  const byId = new Map<string, CatalogItem>();
  for (const item of E3_CATALOG) {
    byId.set(item.id, item);
  }
  for (const custom of customItems) {
    byId.set(custom.id, { ...custom, isCustom: true });
  }
  return Array.from(byId.values());
}

export function mergeAttributesUnique(...lists: E3Attribute[][]): E3Attribute[] {
  const map = new Map<string, E3Attribute>();
  for (const list of lists) {
    for (const attr of list) {
      const key = attr.name.trim();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, { ...attr, name: key });
      }
    }
  }
  return Array.from(map.values());
}

/** Converts an active canvas device (with its edited attributes & pins) into a reusable integral catalog item. */
export function deviceToCatalogItem(dev: E3Device, existingId?: string): CatalogItem {
  const cleanDes = dev.designation.replace(/^-/, '').trim();
  const prefixMatch = /^([A-Za-zА-Яа-яЁё]+)/.exec(cleanDes);
  const defaultPrefix = prefixMatch?.[1]?.slice(0, 4) || 'K';
  const attrs = dev.attributes
    .filter((a) => !a.service && a.name.trim() !== '')
    .map((a) => ({ ...a }));
  const cableAttr = attrs.find((a) => /кабель/i.test(a.name))?.value;

  return {
    id: existingId || `custom-dev-${Date.now().toString(36)}`,
    category: dev.category,
    defaultPrefix,
    componentName: dev.componentName || dev.designation,
    article: dev.article || dev.e3BlockName,
    manufacturer: dev.manufacturer || 'Пользовательская база',
    e3BlockName: dev.e3BlockName || `USER_${defaultPrefix}`,
    width: dev.width,
    height: dev.height,
    defaultCable: cableAttr || undefined,
    pins: dev.pins.map(({ name, dx, dy, direction, signalType }) => ({
      name,
      dx,
      dy,
      direction,
      signalType,
    })),
    defaultAttributes:
      attrs.length > 0
        ? attrs
        : [{ name: 'Наименование', value: dev.componentName || dev.designation, owner: '', conflict: 'flux' }],
    isCustom: true,
    customSymbol: dev.customSymbol ? structuredClone(dev.customSymbol) : undefined,
  };
}

