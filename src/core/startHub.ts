import { SHEET_DIMENSIONS } from './e3Catalog.ts';
import { runErc } from './e3Engine.ts';
import { createSeedProject, DEFAULT_VISUAL_SETTINGS } from './e3Seed.ts';
import { generateHvacDiagram, type HvacBuildOptions } from './hvacBuilder.ts';
import type {
  CatalogItem,
  E3Annotation,
  E3Cable,
  E3Device,
  E3Project,
  E3Sheet,
  E3Wire,
  GostStampForm,
  SchematicFontFamily,
  SheetFormat,
  StandardType,
} from './e3Types.ts';
import { hydrateProjectDefaults, type RecentProjectEntry } from './sessionStorage.ts';

export type StartHubLayer = 'projects' | 'templates' | 'hvac' | 'ugo' | 'exchange';
export type StartHubTab = 'all' | 'pinned' | 'gost' | 'iec';
export type StartHubViewMode = 'grid' | 'table';
export type AppStandaloneSectionId = 'hub' | 'templates' | 'hvac' | 'ugo' | 'exchange';

export interface AppStandaloneSectionMeta {
  id: AppStandaloneSectionId;
  title: string;
  subtitle: string;
  badge: string;
}

export const APP_STANDALONE_SECTIONS: ReadonlyArray<AppStandaloneSectionMeta> = [
  {
    id: 'hub',
    title: 'Главное меню',
    subtitle: 'Обзор проектов, быстрые шаблоны и недавние чертежи',
    badge: 'Главная',
  },
  {
    id: 'templates',
    title: 'Шаблон проекта',
    subtitle: 'Независимая мастерская шаблонов листов, ГОСТ штампов и модулей',
    badge: 'Шаблоны',
  },
  {
    id: 'hvac',
    title: 'Мастер ФСА',
    subtitle: 'Автономный генератор функциональных схем автоматизации ОВиК/КИП',
    badge: 'ФСА',
  },
  {
    id: 'ugo',
    title: 'Редактор УГО',
    subtitle: 'Отдельная студия создания векторных символов и изделий базы E3',
    badge: 'УГО',
  },
  {
    id: 'exchange',
    title: 'Центр обмена',
    subtitle: 'Двусторонний шлюз E3.series COM/XML, DXF и Flux Studio',
    badge: 'Обмен',
  },
];

export type StartTemplateId =
  | 'gost_blank_a3'
  | 'control_cabinet'
  | 'compressor_fsa'
  | 'power_24v'
  | 'power_380v'
  | 'plc_automation'
  | 'terminal_x1';

export interface StartTemplateDef {
  id: StartTemplateId;
  title: string;
  subtitle: string;
  badge: string;
  defaultFormat: SheetFormat;
  sheetCount: number;
  deviceCount: number;
  tags: string[];
}

export const PINNED_PROJECTS_STORAGE_KEY = 'e3promax.pinnedProjects.v1';

export const START_TEMPLATE_DEFS: ReadonlyArray<StartTemplateDef> = [
  {
    id: 'gost_blank_a3',
    title: 'Чистый лист ГОСТ',
    subtitle: 'Основная надпись Форма 1, готовая рамка и сетка',
    badge: 'А3 · Э3',
    defaultFormat: 'A3',
    sheetCount: 1,
    deviceCount: 0,
    tags: ['чистый', 'пустой', 'гост', 'а3', 'а4', 'blank'],
  },
  {
    id: 'control_cabinet',
    title: 'Щит управления',
    subtitle: 'Ввод 3~380В, питание 24VDC, ПЛК и цепи управления на 2 листах',
    badge: 'А3 · ЩУ',
    defaultFormat: 'A3',
    sheetCount: 2,
    deviceCount: 10,
    tags: ['щит', 'управления', 'щу', 'ввод', 'плк', 'шкаф', 'control', 'cabinet'],
  },
  {
    id: 'compressor_fsa',
    title: 'ФСА компрессора',
    subtitle: 'Функциональная схема: привод, давление P, температура T, клапан разгрузки',
    badge: 'А2 · ФСА',
    defaultFormat: 'A2',
    sheetCount: 1,
    deviceCount: 7,
    tags: ['фса', 'компрессор', 'автоматизация', 'давление', 'температура', 'кип', 'compressor'],
  },
  {
    id: 'power_24v',
    title: 'Электропитание 24В',
    subtitle: 'Автомат QF2 10А, блок питания 24VDC -G1, реле -KA1 и индикация -HL1',
    badge: 'А4 · 24В',
    defaultFormat: 'A4',
    sheetCount: 1,
    deviceCount: 4,
    tags: ['питание', '24в', 'бп', 'dc24', 'power', '24v', 'psu'],
  },
  {
    id: 'power_380v',
    title: 'Силовой ввод 3~380В + ПЧ',
    subtitle: 'Вводной автомат QF1, контактор KM1, ПЧ UZ1 и двигатель M1',
    badge: 'А3 · 380В',
    defaultFormat: 'A3',
    sheetCount: 1,
    deviceCount: 4,
    tags: ['силовая', '380', 'пч', 'двигатель', 'автомат', 'power', 'vfd'],
  },
  {
    id: 'plc_automation',
    title: 'Щит автоматизации (ПЛК)',
    subtitle: 'БП 24VDC, контроллер ПЛК210, датчик КИП и выходное реле',
    badge: 'А3 · ПЛК',
    defaultFormat: 'A3',
    sheetCount: 1,
    deviceCount: 4,
    tags: ['плк', 'автоматика', 'кип', '24в', 'датчик', 'plc', 'hvac'],
  },
  {
    id: 'terminal_x1',
    title: 'Клеммный ряд и кабели X1',
    subtitle: 'Проходные клеммники XT1/XT2, перемычки и таблица ПЭ3',
    badge: 'А4 · XT',
    defaultFormat: 'A4',
    sheetCount: 1,
    deviceCount: 2,
    tags: ['клеммник', 'xt', 'кабель', 'зажим', 'terminal'],
  },
];

export interface CreateTemplateOptions {
  standard?: StandardType;
  format?: SheetFormat;
  gridSize?: number;
  theme?: 'light' | 'dark';
  nowIso?: string;
}

export function createProjectFromTemplate(
  templateId: StartTemplateId,
  options: CreateTemplateOptions = {}
): E3Project {
  const seed = createSeedProject();
  const nowIso = options.nowIso ?? new Date().toISOString();
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const standard: StandardType = options.standard ?? 'GOST';
  const gridSize =
    options.gridSize === 10 || options.gridSize === 20 || options.gridSize === 40
      ? options.gridSize
      : DEFAULT_VISUAL_SETTINGS.gridSize;
  const theme = options.theme ?? DEFAULT_VISUAL_SETTINGS.theme;

  const visualSettings = {
    ...structuredClone(DEFAULT_VISUAL_SETTINGS),
    theme,
    gridSize,
  };

  if (templateId === 'gost_blank_a3') {
    const format: SheetFormat = options.format ?? 'A3';
    const dims = SHEET_DIMENSIONS[format];
    return hydrateProjectDefaults({
      ...seed,
      id: `proj-blank-${Date.now().toString(36)}`,
      name: `Новый проект (${suffix})`,
      projectCode: `ПДХ-${suffix}-Э3`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          id: 'sheet-1',
          number: 1,
          name: 'Схема электрическая принципиальная',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[0].titleBlock,
            stampForm: 'form1',
            documentCode: `ПДХ-${suffix}-Э3`,
            projectTitle: `Новый проект (${suffix})`,
            sheetTitle: 'Схема электрическая принципиальная',
            date: formatStampMonthYear(nowIso),
            litera: '',
            izm: '',
          },
        },
      ],
      devices: [],
      wires: [],
      cables: [],
      annotations: [],
    });
  }

  if (templateId === 'control_cabinet') {
    const format: SheetFormat = options.format ?? 'A3';
    const dims = SHEET_DIMENSIONS[format];
    const cabIds = new Set([
      'dev-qf1',
      'dev-km1',
      'dev-qf2',
      'dev-g1',
      'dev-xp1',
      'dev-a1',
      'dev-bt1',
      'dev-ka1',
      'dev-hl1',
      'dev-xp2',
    ]);
    const devices = seed.devices
      .filter((d) => cabIds.has(d.id))
      .map((d) => structuredClone(d));
    const wires = seed.wires
      .filter((w) => cabIds.has(w.fromDeviceId) && cabIds.has(w.toDeviceId))
      .map((w) => structuredClone(w));
    return hydrateProjectDefaults({
      ...seed,
      id: `proj-ctrl-cab-${Date.now().toString(36)}`,
      name: `Щит управления ЩУ (${suffix})`,
      projectCode: `ЩУ-${suffix}-Э3`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          ...structuredClone(seed.sheets[0]),
          id: 'sheet-1',
          number: 1,
          name: 'Силовой ввод и питание 24В',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[0].titleBlock,
            stampForm: 'form1',
            documentCode: `ЩУ-${suffix}-Э3`,
            projectTitle: `Щит управления ЩУ (${suffix})`,
            sheetTitle: 'Схема электрическая принципиальная. Ввод 380В и БП 24VDC',
            date: formatStampMonthYear(nowIso),
          },
        },
        {
          ...structuredClone(seed.sheets[1]),
          id: 'sheet-2',
          number: 2,
          name: 'ПЛК и цепи управления',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[1].titleBlock,
            stampForm: 'form2a',
            documentCode: `ЩУ-${suffix}-Э3`,
            projectTitle: `Щит управления ЩУ (${suffix})`,
            sheetTitle: 'Контроллер, датчики и выходные реле щита управления',
            date: formatStampMonthYear(nowIso),
          },
        },
      ],
      devices,
      wires,
      cables: seed.cables.filter((c) => c.id === 'cab-w1' || c.id === 'cab-w3').map((c) => structuredClone(c)),
      annotations: (seed.annotations || [])
        .filter((a) => a.sheetId === 'sheet-1' || a.sheetId === 'sheet-2')
        .map((a) => structuredClone(a)),
    });
  }

  if (templateId === 'compressor_fsa') {
    const format: SheetFormat = options.format ?? 'A2';
    const dims = SHEET_DIMENSIONS[format];
    const devices: E3Device[] = [
      {
        id: 'cmp-qf1',
        elementId: 'el-cmp-qf1',
        designation: '-QF1',
        componentName: 'Автоматический выключатель защиты двигателя 3P 32A',
        article: 'GV2ME32',
        manufacturer: 'Schneider Electric',
        category: 'breaker',
        sheetId: 'sheet-1',
        x: 160,
        y: 120,
        rotation: 0,
        width: 100,
        height: 110,
        e3BlockName: 'GOST_QF_3P_32A',
        bindingState: 'PLACED',
        pins: [
          { id: 'p-cqf-2', name: '2/T1', dx: 20, dy: 110, direction: 'bottom', signalType: 'power' },
          { id: 'p-cqf-4', name: '4/T2', dx: 50, dy: 110, direction: 'bottom', signalType: 'power' },
          { id: 'p-cqf-6', name: '6/T3', dx: 80, dy: 110, direction: 'bottom', signalType: 'power' },
        ],
        attributes: [{ name: 'Номинальный ток', value: '32 А', owner: '', conflict: 'flux' }],
      },
      {
        id: 'cmp-km1',
        elementId: 'el-cmp-km1',
        designation: '-KM1',
        componentName: 'Контактор привода компрессора 32А 24VDC',
        article: 'LC1D32BD',
        manufacturer: 'Schneider Electric',
        category: 'contactor',
        sheetId: 'sheet-1',
        x: 150,
        y: 300,
        rotation: 0,
        width: 120,
        height: 120,
        e3BlockName: 'GOST_KM_3P_COIL',
        bindingState: 'PLACED',
        pins: [
          { id: 'p-ckm-1', name: '1/L1', dx: 30, dy: 0, direction: 'top', signalType: 'power' },
          { id: 'p-ckm-3', name: '3/L2', dx: 60, dy: 0, direction: 'top', signalType: 'power' },
          { id: 'p-ckm-5', name: '5/L3', dx: 90, dy: 0, direction: 'top', signalType: 'power' },
          { id: 'p-ckm-2', name: '2/T1', dx: 30, dy: 120, direction: 'bottom', signalType: 'power' },
          { id: 'p-ckm-4', name: '4/T2', dx: 60, dy: 120, direction: 'bottom', signalType: 'power' },
          { id: 'p-ckm-6', name: '6/T3', dx: 90, dy: 120, direction: 'bottom', signalType: 'power' },
          { id: 'p-ckm-a1', name: 'A1', dx: 120, dy: 40, direction: 'right', signalType: 'dc24' },
          { id: 'p-ckm-a2', name: 'A2', dx: 120, dy: 80, direction: 'right', signalType: 'dc0' },
        ],
        attributes: [{ name: 'Категория AC-3', value: '32 А', owner: '', conflict: 'flux' }],
      },
      {
        id: 'cmp-m1',
        elementId: 'el-cmp-m1',
        designation: '-M1',
        componentName: 'Винтовой компрессорный агрегат 11 кВт',
        article: 'АИР132M2У2',
        manufacturer: 'Элдин',
        category: 'motor',
        sheetId: 'sheet-1',
        x: 155,
        y: 500,
        rotation: 0,
        width: 110,
        height: 110,
        e3BlockName: 'GOST_MOTOR_3P',
        bindingState: 'PLACED',
        pins: [
          { id: 'p-cm1-u', name: 'U1', dx: 25, dy: 0, direction: 'top', signalType: 'power' },
          { id: 'p-cm1-v', name: 'V1', dx: 55, dy: 0, direction: 'top', signalType: 'power' },
          { id: 'p-cm1-w', name: 'W1', dx: 85, dy: 0, direction: 'top', signalType: 'power' },
        ],
        attributes: [{ name: 'Мощность привода', value: '11 кВт', owner: '', conflict: 'flux' }],
      },
      {
        id: 'cmp-a1',
        elementId: 'el-cmp-a1',
        designation: '-A1',
        componentName: 'Контроллер управления компрессорной станцией ПЛК210',
        article: 'ПЛК210-03-CS',
        manufacturer: 'ОВЕН',
        category: 'plc',
        sheetId: 'sheet-1',
        x: 560,
        y: 250,
        rotation: 0,
        width: 180,
        height: 170,
        e3BlockName: 'GOST_PLC_210',
        bindingState: 'PLACED',
        pins: [
          { id: 'p-ca1-ai1', name: 'AI1', dx: 0, dy: 50, direction: 'left', signalType: 'signal' },
          { id: 'p-ca1-ai2', name: 'AI2', dx: 0, dy: 90, direction: 'left', signalType: 'signal' },
          { id: 'p-ca1-do1', name: 'DO1', dx: 0, dy: 130, direction: 'left', signalType: 'dc24' },
          { id: 'p-ca1-do2', name: 'DO2', dx: 180, dy: 70, direction: 'right', signalType: 'dc24' },
          { id: 'p-ca1-di1', name: 'DI1', dx: 180, dy: 120, direction: 'right', signalType: 'signal' },
        ],
        attributes: [{ name: 'Алгоритм ФСА', value: 'Пуск / Разгрузка / Авария Т°', owner: '', conflict: 'flux' }],
      },
      {
        id: 'cmp-pt1',
        elementId: 'el-cmp-pt1',
        designation: '-BP1',
        componentName: 'Датчик давления нагнетания 0..16 бар 4-20 мА (PT-101)',
        article: 'ПД100И-ДИ1.6',
        manufacturer: 'ОВЕН',
        category: 'sensor',
        sheetId: 'sheet-1',
        x: 360,
        y: 210,
        rotation: 0,
        width: 120,
        height: 80,
        e3BlockName: 'GOST_SENSOR_PRESSURE',
        bindingState: 'PLACED',
        pins: [{ id: 'p-cpt1-out', name: 'OUT', dx: 120, dy: 40, direction: 'right', signalType: 'signal' }],
        attributes: [{ name: 'Позиция ФСА', value: 'PT-101 Нагнетание', owner: '', conflict: 'flux' }],
      },
      {
        id: 'cmp-bt1',
        elementId: 'el-cmp-bt1',
        designation: '-BT1',
        componentName: 'Датчик температуры масла/воздуха 4-20 мА (TT-102)',
        article: 'ДТС3005-PT1000',
        manufacturer: 'ОВЕН',
        category: 'sensor',
        sheetId: 'sheet-1',
        x: 360,
        y: 330,
        rotation: 0,
        width: 120,
        height: 80,
        e3BlockName: 'GOST_SENSOR_TEMP',
        bindingState: 'PLACED',
        pins: [{ id: 'p-cbt1-out', name: 'OUT', dx: 120, dy: 40, direction: 'right', signalType: 'signal' }],
        attributes: [{ name: 'Позиция ФСА', value: 'TT-102 Масло', owner: '', conflict: 'flux' }],
      },
      {
        id: 'cmp-yv1',
        elementId: 'el-cmp-yv1',
        designation: '-YV1',
        componentName: 'Электромагнитный клапан разгрузки компрессора 24VDC',
        article: 'EV220B 15B',
        manufacturer: 'Danfoss',
        category: 'valve',
        sheetId: 'sheet-1',
        x: 840,
        y: 280,
        rotation: 0,
        width: 110,
        height: 80,
        e3BlockName: 'GOST_VALVE_24V',
        bindingState: 'PLACED',
        pins: [{ id: 'p-cyv1-a1', name: 'Y1', dx: 0, dy: 40, direction: 'left', signalType: 'dc24' }],
        attributes: [{ name: 'Позиция ФСА', value: 'HS-103 Клапан разгрузки', owner: '', conflict: 'flux' }],
      },
    ];

    const wires: E3Wire[] = [
      {
        id: 'cw-1',
        sheetId: 'sheet-1',
        netName: 'L1.CMP',
        signalType: 'power',
        fromDeviceId: 'cmp-qf1',
        fromPinId: 'p-cqf-2',
        toDeviceId: 'cmp-km1',
        toPinId: 'p-ckm-1',
        waypoints: [{ x: 180, y: 230 }, { x: 180, y: 300 }],
        crossSection: '6.0 мм²',
        wireNumber: 'L1.1',
      },
      {
        id: 'cw-2',
        sheetId: 'sheet-1',
        netName: 'L2.CMP',
        signalType: 'power',
        fromDeviceId: 'cmp-qf1',
        fromPinId: 'p-cqf-4',
        toDeviceId: 'cmp-km1',
        toPinId: 'p-ckm-3',
        waypoints: [{ x: 210, y: 230 }, { x: 210, y: 300 }],
        crossSection: '6.0 мм²',
        wireNumber: 'L2.1',
      },
      {
        id: 'cw-3',
        sheetId: 'sheet-1',
        netName: 'L3.CMP',
        signalType: 'power',
        fromDeviceId: 'cmp-qf1',
        fromPinId: 'p-cqf-6',
        toDeviceId: 'cmp-km1',
        toPinId: 'p-ckm-5',
        waypoints: [{ x: 240, y: 230 }, { x: 240, y: 300 }],
        crossSection: '6.0 мм²',
        wireNumber: 'L3.1',
      },
      {
        id: 'cw-4',
        sheetId: 'sheet-1',
        netName: 'U.CMP',
        signalType: 'power',
        fromDeviceId: 'cmp-km1',
        fromPinId: 'p-ckm-2',
        toDeviceId: 'cmp-m1',
        toPinId: 'p-cm1-u',
        waypoints: [{ x: 180, y: 420 }, { x: 180, y: 500 }],
        crossSection: '6.0 мм²',
        wireNumber: 'U1',
      },
      {
        id: 'cw-5',
        sheetId: 'sheet-1',
        netName: 'V.CMP',
        signalType: 'power',
        fromDeviceId: 'cmp-km1',
        fromPinId: 'p-ckm-4',
        toDeviceId: 'cmp-m1',
        toPinId: 'p-cm1-v',
        waypoints: [{ x: 210, y: 420 }, { x: 210, y: 500 }],
        crossSection: '6.0 мм²',
        wireNumber: 'V1',
      },
      {
        id: 'cw-6',
        sheetId: 'sheet-1',
        netName: 'W.CMP',
        signalType: 'power',
        fromDeviceId: 'cmp-km1',
        fromPinId: 'p-ckm-6',
        toDeviceId: 'cmp-m1',
        toPinId: 'p-cm1-w',
        waypoints: [{ x: 240, y: 420 }, { x: 240, y: 500 }],
        crossSection: '6.0 мм²',
        wireNumber: 'W1',
      },
      {
        id: 'cw-7',
        sheetId: 'sheet-1',
        netName: 'PT101_AI1',
        signalType: 'signal',
        fromDeviceId: 'cmp-pt1',
        fromPinId: 'p-cpt1-out',
        toDeviceId: 'cmp-a1',
        toPinId: 'p-ca1-ai1',
        waypoints: [{ x: 480, y: 250 }, { x: 520, y: 250 }, { x: 520, y: 300 }, { x: 560, y: 300 }],
        crossSection: '0.75 мм²',
        wireNumber: '201',
      },
      {
        id: 'cw-8',
        sheetId: 'sheet-1',
        netName: 'TT102_AI2',
        signalType: 'signal',
        fromDeviceId: 'cmp-bt1',
        fromPinId: 'p-cbt1-out',
        toDeviceId: 'cmp-a1',
        toPinId: 'p-ca1-ai2',
        waypoints: [{ x: 480, y: 370 }, { x: 520, y: 370 }, { x: 520, y: 340 }, { x: 560, y: 340 }],
        crossSection: '0.75 мм²',
        wireNumber: '202',
      },
      {
        id: 'cw-9',
        sheetId: 'sheet-1',
        netName: 'CMD_RUN_CMP',
        signalType: 'dc24',
        fromDeviceId: 'cmp-a1',
        fromPinId: 'p-ca1-do1',
        toDeviceId: 'cmp-km1',
        toPinId: 'p-ckm-a1',
        waypoints: [{ x: 560, y: 380 }, { x: 310, y: 380 }, { x: 310, y: 340 }, { x: 270, y: 340 }],
        crossSection: '1.0 мм²',
        wireNumber: '301',
      },
      {
        id: 'cw-10',
        sheetId: 'sheet-1',
        netName: 'CMD_UNLOAD',
        signalType: 'dc24',
        fromDeviceId: 'cmp-a1',
        fromPinId: 'p-ca1-do2',
        toDeviceId: 'cmp-yv1',
        toPinId: 'p-cyv1-a1',
        waypoints: [{ x: 740, y: 320 }, { x: 840, y: 320 }],
        crossSection: '1.0 мм²',
        wireNumber: '302',
      },
    ];

    return hydrateProjectDefaults({
      ...seed,
      id: `proj-cmp-fsa-${Date.now().toString(36)}`,
      name: `ФСА компрессора (${suffix})`,
      projectCode: `КМП-${suffix}-ФСА`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          ...structuredClone(seed.sheets[0]),
          id: 'sheet-1',
          number: 1,
          name: 'ФСА компрессорной установки',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[0].titleBlock,
            stampForm: 'form1',
            documentCode: `КМП-${suffix}-ФСА`,
            projectTitle: `ФСА компрессора (${suffix})`,
            sheetTitle: 'Схема автоматизации функциональная компрессорного агрегата',
            date: formatStampMonthYear(nowIso),
          },
        },
      ],
      devices,
      wires,
      cables: [],
      annotations: [
        {
          id: `ann-cmp-${suffix}`,
          sheetId: 'sheet-1',
          kind: 'callout',
          x: 560,
          y: 120,
          width: 380,
          height: 80,
          text: 'Контур ФСА компрессора: Pнагн (PT-101), Tмасла (TT-102), пуск -KM1 и разгрузка -YV1',
        },
      ],
    });
  }

  if (templateId === 'power_24v') {
    const format: SheetFormat = options.format ?? 'A4';
    const dims = SHEET_DIMENSIONS[format];
    const qf2 = structuredClone(seed.devices.find((d) => d.id === 'dev-qf2')!);
    const g1 = structuredClone(seed.devices.find((d) => d.id === 'dev-g1')!);
    const ka1 = structuredClone(seed.devices.find((d) => d.id === 'dev-ka1')!);
    const hl1 = structuredClone(seed.devices.find((d) => d.id === 'dev-hl1')!);

    qf2.sheetId = 'sheet-1';
    qf2.x = 180;
    qf2.y = 120;
    g1.sheetId = 'sheet-1';
    g1.x = 150;
    g1.y = 280;
    ka1.sheetId = 'sheet-1';
    ka1.x = 460;
    ka1.y = 320;
    hl1.sheetId = 'sheet-1';
    hl1.x = 460;
    hl1.y = 480;
    hl1.bindingState = 'PLACED';

    const wires: E3Wire[] = [
      {
        id: 'p24-w1',
        sheetId: 'sheet-1',
        netName: 'L1.PSU',
        signalType: 'power',
        fromDeviceId: qf2.id,
        fromPinId: 'p-qf2-2',
        toDeviceId: g1.id,
        toPinId: 'p-g1-l',
        waypoints: [{ x: 210, y: 220 }, { x: 210, y: 250 }, { x: 180, y: 250 }, { x: 180, y: 280 }],
        crossSection: '1.5 мм²',
        wireNumber: '101',
      },
      {
        id: 'p24-w2',
        sheetId: 'sheet-1',
        netName: '+24V_DC',
        signalType: 'dc24',
        fromDeviceId: g1.id,
        fromPinId: 'p-g1-24',
        toDeviceId: ka1.id,
        toPinId: 'p-ka1-a1',
        waypoints: [{ x: 190, y: 390 }, { x: 190, y: 420 }, { x: 380, y: 420 }, { x: 380, y: 350 }, { x: 460, y: 350 }],
        crossSection: '1.5 мм²',
        wireNumber: '24V+',
      },
      {
        id: 'p24-w3',
        sheetId: 'sheet-1',
        netName: '+24V_DC',
        signalType: 'dc24',
        fromDeviceId: g1.id,
        fromPinId: 'p-g1-24',
        toDeviceId: hl1.id,
        toPinId: 'p-hl1-x1',
        waypoints: [{ x: 190, y: 390 }, { x: 190, y: 515 }, { x: 460, y: 515 }],
        crossSection: '1.0 мм²',
        wireNumber: '24V+',
      },
      {
        id: 'p24-w4',
        sheetId: 'sheet-1',
        netName: '0V_DC',
        signalType: 'dc0',
        fromDeviceId: g1.id,
        fromPinId: 'p-g1-0',
        toDeviceId: ka1.id,
        toPinId: 'p-ka1-a2',
        waypoints: [{ x: 240, y: 390 }, { x: 240, y: 440 }, { x: 410, y: 440 }, { x: 410, y: 380 }, { x: 460, y: 380 }],
        crossSection: '1.5 мм²',
        wireNumber: '0V',
      },
      {
        id: 'p24-w5',
        sheetId: 'sheet-1',
        netName: '0V_DC',
        signalType: 'dc0',
        fromDeviceId: g1.id,
        fromPinId: 'p-g1-0',
        toDeviceId: hl1.id,
        toPinId: 'p-hl1-x2',
        waypoints: [{ x: 240, y: 390 }, { x: 240, y: 560 }, { x: 560, y: 560 }, { x: 560, y: 515 }, { x: 530, y: 515 }],
        crossSection: '1.0 мм²',
        wireNumber: '0V',
      },
    ];

    return hydrateProjectDefaults({
      ...seed,
      id: `proj-pwr24-${Date.now().toString(36)}`,
      name: `Электропитание 24В (${suffix})`,
      projectCode: `БП24-${suffix}-Э3`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          ...structuredClone(seed.sheets[0]),
          id: 'sheet-1',
          number: 1,
          name: 'Цепь электропитания 24VDC',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[0].titleBlock,
            stampForm: 'form1',
            documentCode: `БП24-${suffix}-Э3`,
            projectTitle: `Электропитание 24В (${suffix})`,
            sheetTitle: 'Схема электрическая принципиальная. Блок питания 24VDC и нагрузка',
            date: formatStampMonthYear(nowIso),
          },
        },
      ],
      devices: [qf2, g1, ka1, hl1],
      wires,
      cables: [],
      annotations: [],
    });
  }

  if (templateId === 'power_380v') {
    const format: SheetFormat = options.format ?? 'A3';
    const dims = SHEET_DIMENSIONS[format];
    const powerIds = new Set(['dev-qf1', 'dev-km1', 'dev-uz1', 'dev-m1']);
    const devices = seed.devices
      .filter((d) => powerIds.has(d.id))
      .map((d) => ({ ...structuredClone(d), sheetId: 'sheet-1' }));
    const wires = seed.wires
      .filter(
        (w) =>
          w.sheetId === 'sheet-1' &&
          powerIds.has(w.fromDeviceId) &&
          powerIds.has(w.toDeviceId)
      )
      .map((w) => structuredClone(w));
    return hydrateProjectDefaults({
      ...seed,
      id: `proj-pwr-${Date.now().toString(36)}`,
      name: `Силовой привод ПВ (${suffix})`,
      projectCode: `СИЛ-${suffix}-Э3`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          ...structuredClone(seed.sheets[0]),
          id: 'sheet-1',
          number: 1,
          name: 'Силовая цепь 3~380В',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[0].titleBlock,
            documentCode: `СИЛ-${suffix}-Э3`,
            projectTitle: `Силовой привод ПВ (${suffix})`,
            sheetTitle: 'Схема электрическая принципиальная. Силовая цепь 3~380В',
            date: formatStampMonthYear(nowIso),
          },
        },
      ],
      devices,
      wires,
      cables: seed.cables.filter((c) => c.id === 'cab-w2').map((c) => structuredClone(c)),
      annotations: (seed.annotations || [])
        .filter((a) => a.sheetId === 'sheet-1')
        .map((a) => structuredClone(a)),
    });
  }

  if (templateId === 'plc_automation') {
    const format: SheetFormat = options.format ?? 'A3';
    const dims = SHEET_DIMENSIONS[format];
    const ctrlIds = new Set(['dev-a1', 'dev-bt1', 'dev-ka1', 'dev-hl1']);
    const devices = seed.devices
      .filter((d) => ctrlIds.has(d.id))
      .map((d) => ({ ...structuredClone(d), sheetId: 'sheet-1' }));
    const wires = seed.wires
      .filter(
        (w) =>
          w.sheetId === 'sheet-2' &&
          ctrlIds.has(w.fromDeviceId) &&
          ctrlIds.has(w.toDeviceId)
      )
      .map((w) => ({ ...structuredClone(w), sheetId: 'sheet-1' }));
    return hydrateProjectDefaults({
      ...seed,
      id: `proj-plc-${Date.now().toString(36)}`,
      name: `Щит автоматизации (${suffix})`,
      projectCode: `АВТ-${suffix}-Э3`,
      revision: 1,
      standard,
      updatedAt: nowIso,
      visualSettings,
      sheets: [
        {
          ...structuredClone(seed.sheets[1]),
          id: 'sheet-1',
          number: 1,
          name: 'Цепь управления ПЛК 24В',
          format,
          width: dims.width,
          height: dims.height,
          titleBlock: {
            ...seed.sheets[1].titleBlock,
            stampForm: 'form1',
            documentCode: `АВТ-${suffix}-Э3`,
            projectTitle: `Щит автоматизации (${suffix})`,
            sheetTitle: 'Контроллер ПЛК210 и цепи управления 24VDC',
            date: formatStampMonthYear(nowIso),
          },
        },
      ],
      devices,
      wires,
      cables: seed.cables.filter((c) => c.id === 'cab-w3').map((c) => structuredClone(c)),
      annotations: (seed.annotations || [])
        .filter((a) => a.sheetId === 'sheet-2')
        .map((a) => ({ ...structuredClone(a), sheetId: 'sheet-1' })),
    });
  }

  // terminal_x1
  const format: SheetFormat = options.format ?? 'A4';
  const dims = SHEET_DIMENSIONS[format];
  const termIds = new Set(['dev-xt1', 'dev-xt2']);
  const devices = seed.devices
    .filter((d) => termIds.has(d.id))
    .map((d) => ({ ...structuredClone(d), sheetId: 'sheet-1' }));
  const wires = seed.wires
    .filter(
      (w) =>
        w.sheetId === 'sheet-3' &&
        termIds.has(w.fromDeviceId) &&
        termIds.has(w.toDeviceId)
    )
    .map((w) => ({ ...structuredClone(w), sheetId: 'sheet-1' }));
  return hydrateProjectDefaults({
    ...seed,
    id: `proj-xt-${Date.now().toString(36)}`,
    name: `Клеммный шкаф X1 (${suffix})`,
    projectCode: `КЛМ-${suffix}-Э4`,
    revision: 1,
    standard,
    updatedAt: nowIso,
    visualSettings,
    sheets: [
      {
        ...structuredClone(seed.sheets[2]),
        id: 'sheet-1',
        number: 1,
        name: 'Клеммный ряд X1',
        format,
        width: dims.width,
        height: dims.height,
        titleBlock: {
          ...seed.sheets[2].titleBlock,
          stampForm: 'form1',
          documentCode: `КЛМ-${suffix}-Э4`,
          projectTitle: `Клеммный шкаф X1 (${suffix})`,
          sheetTitle: 'Ряд зажимов и кабельные подключения',
          date: formatStampMonthYear(nowIso),
        },
      },
    ],
    devices,
    wires,
    cables: seed.cables.filter((c) => c.id === 'cab-w1').map((c) => structuredClone(c)),
    annotations: (seed.annotations || [])
      .filter((a) => a.sheetId === 'sheet-3')
      .map((a) => ({ ...structuredClone(a), sheetId: 'sheet-1' })),
  });
}

function formatStampMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '11.2026';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${m}.${d.getFullYear()}`;
}

export function loadPinnedProjectIds(
  storage?: Pick<Storage, 'getItem'> | null
): string[] {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return [];
    const raw = store.getItem(PINNED_PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
  } catch {
    return [];
  }
}

export function savePinnedProjectIds(
  ids: string[],
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return;
    const deduped = Array.from(new Set(ids.filter(Boolean)));
    store.setItem(PINNED_PROJECTS_STORAGE_KEY, JSON.stringify(deduped));
  } catch {
    // ignore quota errors
  }
}

export function togglePinnedProjectId(current: string[], projectId: string): string[] {
  if (!projectId) return current;
  if (current.includes(projectId)) {
    return current.filter((id) => id !== projectId);
  }
  return [projectId, ...current];
}

export function filterAndSortRecentProjects(
  entries: RecentProjectEntry[],
  options: {
    tab: StartHubTab;
    query: string;
    pinnedIds: string[];
  }
): RecentProjectEntry[] {
  const pinnedSet = new Set(options.pinnedIds);
  const q = options.query.trim().toLowerCase();

  const filtered = entries.filter((entry) => {
    if (options.tab === 'pinned' && !pinnedSet.has(entry.id)) {
      return false;
    }
    if (options.tab === 'gost' && entry.project.standard !== 'GOST') {
      return false;
    }
    if (options.tab === 'iec' && entry.project.standard !== 'IEC') {
      return false;
    }
    if (!q) return true;
    const haystack = [
      entry.name,
      entry.projectCode,
      entry.project.author,
      entry.project.standard,
      ...entry.project.sheets.map((s) => s.name),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  return [...filtered].sort((a, b) => {
    const aPin = pinnedSet.has(a.id) ? 1 : 0;
    const bPin = pinnedSet.has(b.id) ? 1 : 0;
    if (aPin !== bPin) return bPin - aPin;
    return b.savedAt.localeCompare(a.savedAt);
  });
}

export function filterStartTemplates(
  templates: ReadonlyArray<StartTemplateDef>,
  query: string
): StartTemplateDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...templates];
  return templates.filter((tpl) => {
    const hay = `${tpl.title} ${tpl.subtitle} ${tpl.badge} ${tpl.tags.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}

export function formatRelativeTimestampRu(iso: string, nowMs = Date.now()): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'недавно';
  const diffSec = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (diffSec < 45) return 'только что';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return new Date(ts).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export interface ProjectHealthSummary {
  errors: number;
  warnings: number;
  clean: boolean;
}

export function summarizeProjectHealth(project: E3Project): ProjectHealthSummary {
  const issues = runErc(project);
  let errors = 0;
  let warnings = 0;
  for (const iss of issues) {
    if (iss.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return {
    errors,
    warnings,
    clean: errors === 0 && warnings === 0,
  };
}

/**
 * Antigravity Wave Field pure math helpers
 */
export interface WavePointerState {
  x: number;
  y: number;
  active: boolean;
  speed: number; // px/frame impulse
}

export interface WaveCardFocusRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WavePulse {
  x: number;
  y: number;
  bornAtSec: number;
  strength?: number;
}

export const WAVE_PULSE_LIFETIME_SEC = 0.9;

export interface WavePulseContribution {
  offsetX: number;
  offsetY: number;
  accentMix: number;
  radiusBoost: number;
}

export function computeWavePulseContribution(
  baseX: number,
  baseY: number,
  timeSec: number,
  pulse: WavePulse
): WavePulseContribution {
  const age = timeSec - pulse.bornAtSec;
  if (age < 0 || age > WAVE_PULSE_LIFETIME_SEC) {
    return { offsetX: 0, offsetY: 0, accentMix: 0, radiusBoost: 0 };
  }

  const strength = Math.max(0.25, Math.min(1.6, pulse.strength ?? 1));
  const ageNorm = age / WAVE_PULSE_LIFETIME_SEC;
  const decay = Math.pow(1 - ageNorm, 1.45) * strength;
  const ringRadius = 18 + ageNorm * 320;
  const bandHalfWidth = 64;

  const dx = baseX - pulse.x;
  const dy = baseY - pulse.y;
  const dist = Math.hypot(dx, dy);
  const distDelta = Math.abs(dist - ringRadius);
  if (distDelta >= bandHalfWidth) {
    return { offsetX: 0, offsetY: 0, accentMix: 0, radiusBoost: 0 };
  }

  const bell = Math.pow(Math.cos((distDelta / bandHalfWidth) * (Math.PI * 0.5)), 2);
  const amplitude = bell * decay;
  const nx = dist > 0.001 ? dx / dist : 0;
  const ny = dist > 0.001 ? dy / dist : 0;

  return {
    offsetX: nx * amplitude * 7.5,
    offsetY: ny * amplitude * 7.5,
    accentMix: amplitude * 0.72,
    radiusBoost: amplitude * 0.85,
  };
}

export interface WaveDotSample {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  accentMix: number; // 0..1
}

export function easeGridLockSettle(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

export function computeWaveDotSample(params: {
  baseX: number;
  baseY: number;
  timeSec: number;
  pointer: WavePointerState;
  hoverRect: WaveCardFocusRect | null;
  gridLockProgress: number; // 0 = living wave, 1 = locked static CAD grid
  reducedMotion?: boolean;
  pulses?: ReadonlyArray<WavePulse>;
}): WaveDotSample {
  const { baseX, baseY, timeSec, pointer, hoverRect, gridLockProgress, reducedMotion, pulses } = params;
  const settle = easeGridLockSettle(gridLockProgress);
  const waveWeight = reducedMotion ? 0 : 1 - settle;

  // Calm horizontal potential wave (left -> right schematic energy flow) + slight diagonal phase
  const phase = baseX * 0.0145 - timeSec * 1.45 + Math.sin(baseY * 0.011 + timeSec * 0.55) * 0.65;
  const harmonic = Math.sin(phase); // -1..1
  const secondary = Math.cos(baseX * 0.008 + baseY * 0.013 - timeSec * 0.9);
  const waveHeight = (harmonic * 0.68 + secondary * 0.32) * waveWeight;

  let offsetX = 0;
  let offsetY = waveHeight * 2.2;
  let accentMix = Math.max(0, waveHeight) * 0.24;
  let radiusBoost = Math.max(0, waveHeight) * 0.42;

  // Cursor gravitational displacement + luminescence
  if (pointer.active && waveWeight > 0.01) {
    const dx = baseX - pointer.x;
    const dy = baseY - pointer.y;
    const distSq = dx * dx + dy * dy;
    const maxRadius = 185 + Math.min(70, pointer.speed * 1.8);
    if (distSq < maxRadius * maxRadius && distSq > 0.001) {
      const dist = Math.sqrt(distSq);
      const norm = 1 - dist / maxRadius;
      const influence = norm * norm * waveWeight;
      const push = influence * (10.5 + Math.min(8, pointer.speed * 0.22));
      offsetX += (dx / dist) * push * 0.72;
      offsetY += (dy / dist) * push * 0.72;
      accentMix = Math.min(1, accentMix + influence * 0.85);
      radiusBoost += influence * 0.85;
    }
  }

  // Expanding Antigravity wave pulses triggered by hover/open interactions
  if (pulses && pulses.length > 0 && waveWeight > 0.01) {
    for (let i = 0; i < pulses.length; i++) {
      const p = computeWavePulseContribution(baseX, baseY, timeSec, pulses[i]);
      if (p.accentMix > 0.001) {
        offsetX += p.offsetX * waveWeight;
        offsetY += p.offsetY * waveWeight;
        accentMix = Math.min(1, accentMix + p.accentMix * waveWeight);
        radiusBoost += p.radiusBoost * waveWeight;
      }
    }
  }

  // Semantic magnetic alignment toward hovered project/template card
  if (hoverRect && waveWeight > 0.01) {
    const cx = hoverRect.left + hoverRect.width / 2;
    const cy = hoverRect.top + hoverRect.height / 2;
    const nearX = Math.max(hoverRect.left, Math.min(baseX, hoverRect.left + hoverRect.width));
    const nearY = Math.max(hoverRect.top, Math.min(baseY, hoverRect.top + hoverRect.height));
    const dx = baseX - nearX;
    const dy = baseY - nearY;
    const dist = Math.hypot(dx, dy);
    if (dist < 72) {
      const ring = (1 - dist / 72) * waveWeight;
      // Gently align dots to orthogonal border around hovered card
      const pull = ring * 0.45;
      offsetX = offsetX * (1 - pull) + (cx - baseX) * 0.012 * ring;
      offsetY = offsetY * (1 - pull) + (cy - baseY) * 0.012 * ring;
      accentMix = Math.min(1, accentMix + ring * 0.42);
      radiusBoost += ring * 0.35;
    }
  }

  const baseAlpha = 0.26 + Math.max(0, harmonic) * 0.14 * waveWeight;
  const alpha = Math.min(0.82, baseAlpha + accentMix * 0.42);
  const radius = 0.95 + radiusBoost * (1 - settle * 0.65);

  return {
    x: baseX + offsetX,
    y: baseY + offsetY,
    radius,
    alpha,
    accentMix: Math.max(0, Math.min(1, accentMix)),
  };
}

export function parseCssColorToRgb(
  color: string,
  fallback: [number, number, number]
): [number, number, number] {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b];
    } else if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) return [r, g, b];
    }
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return fallback;
}

/**
 * Custom Project Templates (Конструктор шаблонов проектов)
 */
export type CustomTemplateCategory = 'power' | 'automation' | 'hvac' | 'terminal' | 'custom';

export const CUSTOM_TEMPLATE_CATEGORY_LABELS: Record<CustomTemplateCategory, string> = {
  power: 'Силовые щиты 3~380В',
  automation: 'Автоматизация и ПЛК',
  hvac: 'Вентиляция и ОВиК',
  terminal: 'Клеммные шкафы / Кросс',
  custom: 'Универсальный профиль',
};

export interface CustomTemplateSheetSpec {
  id: string;
  name: string;
  format: SheetFormat;
}

export interface CustomProjectTemplate {
  id: string;
  title: string;
  description: string;
  category: CustomTemplateCategory;
  standard: StandardType;
  projectCodePrefix: string;
  defaultFormat: SheetFormat;
  initialSheets: CustomTemplateSheetSpec[];
  gridSize: 10 | 20 | 40;
  fontFamily: SchematicFontFamily;
  theme: 'light' | 'dark';
  wireWidth: number;
  symbolStrokeWidth: number;
  snapToGrid: boolean;
  smartGuides: boolean;
  wireCrossingBridge: boolean;
  showGostFrame: boolean;
  showPinNumbers: boolean;
  showWireNumbers: boolean;
  showCrossRefs: boolean;
  stampDefaults: {
    stampForm: GostStampForm;
    organization: string;
    author: string;
    checker: string;
    approver: string;
    litera: string;
  };
  modules: {
    includePowerInfeed: boolean;
    includePlcRack: boolean;
    includeTerminalStrip: boolean;
    includeGostBomTable: boolean;
    includeCrossRefs: boolean;
  };
  isBuiltin?: boolean;
  updatedAt: string;
}

export const CUSTOM_TEMPLATES_STORAGE_KEY = 'e3promax.customTemplates.v1';

export function createDefaultCustomTemplateDraft(
  overrides: Partial<CustomProjectTemplate> = {}
): CustomProjectTemplate {
  const nowIso = new Date().toISOString();
  return {
    id: overrides.id || `tpl-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    title: 'Новый пользовательский шаблон',
    description: 'Настроенный шаблон с основной надписью ГОСТ, параметрами трассировки и составом листов.',
    category: 'custom',
    standard: 'GOST',
    projectCodePrefix: 'ПДХ',
    defaultFormat: 'A3',
    initialSheets: [
      { id: 'sh-1', name: 'Схема электрическая принципиальная', format: 'A3' },
    ],
    gridSize: 20,
    fontFamily: 'GOST',
    theme: 'light',
    wireWidth: 2,
    symbolStrokeWidth: 1.75,
    snapToGrid: true,
    smartGuides: true,
    wireCrossingBridge: true,
    showGostFrame: true,
    showPinNumbers: true,
    showWireNumbers: true,
    showCrossRefs: true,
    stampDefaults: {
      stampForm: 'form1',
      organization: 'ООО «ПромВентАвтоматика»',
      author: 'Инженер-проектировщик',
      checker: '',
      approver: '',
      litera: 'Р',
    },
    modules: {
      includePowerInfeed: false,
      includePlcRack: false,
      includeTerminalStrip: false,
      includeGostBomTable: false,
      includeCrossRefs: true,
    },
    isBuiltin: false,
    updatedAt: nowIso,
    ...overrides,
  };
}

export const BUILTIN_CUSTOM_TEMPLATE_PRESETS: ReadonlyArray<CustomProjectTemplate> = [
  createDefaultCustomTemplateDraft({
    id: 'builtin-tpl-power-shield',
    title: 'Щит силовой ВРУ / ПЧ 380В',
    description: 'Многолистовой шаблон с вводной цепью 380В, таблицей ПЭ3 и Формой 1.',
    category: 'power',
    standard: 'GOST',
    projectCodePrefix: 'ВРУ',
    defaultFormat: 'A3',
    initialSheets: [
      { id: 'sh-1', name: 'Силовая цепь 3~380В', format: 'A3' },
      { id: 'sh-2', name: 'Клеммный ряд и кабели', format: 'A4' },
    ],
    modules: {
      includePowerInfeed: true,
      includePlcRack: false,
      includeTerminalStrip: true,
      includeGostBomTable: true,
      includeCrossRefs: true,
    },
    isBuiltin: true,
  }),
  createDefaultCustomTemplateDraft({
    id: 'builtin-tpl-plc-cabinet',
    title: 'Шкаф автоматизации ПЛК + КИП',
    description: 'Питание 24VDC, контроллер ПЛК210, каналы датчиков и перекрёстные ссылки.',
    category: 'automation',
    standard: 'GOST',
    projectCodePrefix: 'ШУА',
    defaultFormat: 'A3',
    initialSheets: [
      { id: 'sh-1', name: 'Ввод питания и БП 24В', format: 'A3' },
      { id: 'sh-2', name: 'Контроллер ПЛК и цепи КИП', format: 'A3' },
    ],
    modules: {
      includePowerInfeed: true,
      includePlcRack: true,
      includeTerminalStrip: false,
      includeGostBomTable: true,
      includeCrossRefs: true,
    },
    isBuiltin: true,
  }),
  createDefaultCustomTemplateDraft({
    id: 'builtin-tpl-iec-compact',
    title: 'IEC 60617 Compact Panel',
    description: 'Международный профиль IEC с шагом сетки 10 мм, шрифтом DM Sans и ПЭ3.',
    category: 'terminal',
    standard: 'IEC',
    projectCodePrefix: 'IEC',
    defaultFormat: 'A4',
    gridSize: 10,
    fontFamily: 'DM Sans',
    initialSheets: [
      { id: 'sh-1', name: 'Main Power & Control', format: 'A4' },
    ],
    stampDefaults: {
      stampForm: 'form2a',
      organization: 'Flux Engineering Lab',
      author: 'Lead Electrical Engineer',
      checker: '',
      approver: '',
      litera: 'A',
    },
    modules: {
      includePowerInfeed: false,
      includePlcRack: false,
      includeTerminalStrip: true,
      includeGostBomTable: false,
      includeCrossRefs: true,
    },
    isBuiltin: true,
  }),
];

export function loadCustomTemplates(
  storage?: Pick<Storage, 'getItem'> | null
): CustomProjectTemplate[] {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return [];
    const raw = store.getItem(CUSTOM_TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is CustomProjectTemplate => Boolean(x && typeof x.id === 'string' && typeof x.title === 'string'))
      .map((tpl) =>
        createDefaultCustomTemplateDraft({
          ...tpl,
          isBuiltin: false,
          initialSheets:
            Array.isArray(tpl.initialSheets) && tpl.initialSheets.length > 0
              ? tpl.initialSheets
              : [{ id: 'sh-1', name: 'Лист 1', format: tpl.defaultFormat || 'A3' }],
        })
      );
  } catch {
    return [];
  }
}

export function saveCustomTemplates(
  templates: CustomProjectTemplate[],
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return;
    const onlyCustom = templates.filter((t) => !t.isBuiltin);
    store.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(onlyCustom));
  } catch {
    // ignore storage quota errors
  }
}

export function upsertCustomTemplate(
  list: CustomProjectTemplate[],
  template: CustomProjectTemplate
): CustomProjectTemplate[] {
  const clean: CustomProjectTemplate = {
    ...structuredClone(template),
    isBuiltin: false,
    updatedAt: new Date().toISOString(),
  };
  const idx = list.findIndex((t) => t.id === clean.id);
  if (idx >= 0) {
    return list.map((t) => (t.id === clean.id ? clean : t));
  }
  return [clean, ...list];
}

export function deleteCustomTemplate(
  list: CustomProjectTemplate[],
  templateId: string
): CustomProjectTemplate[] {
  return list.filter((t) => t.id !== templateId);
}

export function duplicateCustomTemplate(
  source: CustomProjectTemplate,
  nowIso = new Date().toISOString()
): CustomProjectTemplate {
  return {
    ...structuredClone(source),
    id: `tpl-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    title: `${source.title} (копия)`,
    isBuiltin: false,
    updatedAt: nowIso,
  };
}

export function buildProjectFromCustomTemplate(
  template: CustomProjectTemplate,
  options: { nowIso?: string; themeOverride?: 'light' | 'dark' } = {}
): E3Project {
  const seed = createSeedProject();
  const nowIso = options.nowIso ?? new Date().toISOString();
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const prefix = (template.projectCodePrefix || 'ПДХ').trim().toUpperCase();
  const docCode = `${prefix}-${suffix}-Э3`;

  const sheetSpecs =
    template.initialSheets.length > 0
      ? template.initialSheets
      : [{ id: 'sh-1', name: 'Схема электрическая принципиальная', format: template.defaultFormat }];

  const sheets: E3Sheet[] = sheetSpecs.map((spec, idx) => {
    const dims = SHEET_DIMENSIONS[spec.format] || SHEET_DIMENSIONS[template.defaultFormat] || SHEET_DIMENSIONS.A3;
    return {
      id: `sheet-${idx + 1}`,
      number: idx + 1,
      name: spec.name.trim() || `Лист ${idx + 1}`,
      format: spec.format,
      width: dims.width,
      height: dims.height,
      titleBlock: {
        ...seed.sheets[0].titleBlock,
        stampForm: idx === 0 ? template.stampDefaults.stampForm : 'form2a',
        documentCode: docCode,
        projectTitle: template.title,
        organization: template.stampDefaults.organization || 'ООО «ПромВентАвтоматика»',
        designer: template.stampDefaults.author || 'Инженер',
        checker: template.stampDefaults.checker || '',
        approver: template.stampDefaults.approver || '',
        litera: template.stampDefaults.litera || '',
        date: formatStampMonthYear(nowIso),
        sheetTitle: spec.name.trim() || `Лист ${idx + 1}`,
        izm: '',
      },
    };
  });

  const devices: E3Device[] = [];
  const wires: E3Wire[] = [];
  const cables: E3Cable[] = [];
  const annotations: E3Annotation[] = [];

  const getSheetId = (preferredIndex: number) =>
    sheets[Math.min(preferredIndex, sheets.length - 1)]?.id || 'sheet-1';

  const usedSheets = new Set<string>();

  if (template.modules.includePowerInfeed) {
    const targetSheet = getSheetId(0);
    usedSheets.add(targetSheet);
    const powerIds = new Set(['dev-qf1', 'dev-km1', 'dev-uz1', 'dev-m1']);
    for (const d of seed.devices) {
      if (powerIds.has(d.id)) {
        devices.push({ ...structuredClone(d), sheetId: targetSheet });
      }
    }
    for (const w of seed.wires) {
      if (w.sheetId === 'sheet-1' && powerIds.has(w.fromDeviceId) && powerIds.has(w.toDeviceId)) {
        wires.push({ ...structuredClone(w), sheetId: targetSheet });
      }
    }
    for (const c of seed.cables) {
      if (c.id === 'cab-w2') cables.push(structuredClone(c));
    }
  }

  if (template.modules.includePlcRack) {
    // Prefer sheet 2 if sheet 1 already carries power infeed, otherwise sheet 1
    let targetIdx = template.modules.includePowerInfeed && sheets.length > 1 ? 1 : 0;
    let targetSheet = getSheetId(targetIdx);
    const shiftX = usedSheets.has(targetSheet) ? 580 : 0;
    usedSheets.add(targetSheet);
    const ctrlIds = new Set(['dev-a1', 'dev-bt1', 'dev-ka1', 'dev-hl1']);
    for (const d of seed.devices) {
      if (ctrlIds.has(d.id)) {
        const clone = structuredClone(d);
        clone.sheetId = targetSheet;
        clone.x += shiftX;
        devices.push(clone);
      }
    }
    for (const w of seed.wires) {
      if (w.sheetId === 'sheet-2' && ctrlIds.has(w.fromDeviceId) && ctrlIds.has(w.toDeviceId)) {
        const clone = structuredClone(w);
        clone.sheetId = targetSheet;
        clone.waypoints = clone.waypoints.map((pt) => ({ x: pt.x + shiftX, y: pt.y }));
        wires.push(clone);
      }
    }
    for (const c of seed.cables) {
      if (c.id === 'cab-w3') cables.push(structuredClone(c));
    }
  }

  if (template.modules.includeTerminalStrip) {
    const targetIdx = sheets.length > 2 ? 2 : sheets.length > 1 ? 1 : 0;
    const targetSheet = getSheetId(targetIdx);
    const shiftX = usedSheets.has(targetSheet) ? 520 : 0;
    const termIds = new Set(['dev-xt1', 'dev-xt2']);
    for (const d of seed.devices) {
      if (termIds.has(d.id)) {
        const clone = structuredClone(d);
        clone.sheetId = targetSheet;
        clone.x += shiftX;
        devices.push(clone);
      }
    }
    for (const w of seed.wires) {
      if (w.sheetId === 'sheet-3' && termIds.has(w.fromDeviceId) && termIds.has(w.toDeviceId)) {
        const clone = structuredClone(w);
        clone.sheetId = targetSheet;
        clone.waypoints = clone.waypoints.map((pt) => ({ x: pt.x + shiftX, y: pt.y }));
        wires.push(clone);
      }
    }
    for (const c of seed.cables) {
      if (c.id === 'cab-w1') cables.push(structuredClone(c));
    }
  }

  if (template.modules.includeGostBomTable) {
    const sheet1 = sheets[0];
    annotations.push({
      id: `ann-bom-${suffix}`,
      sheetId: sheet1.id,
      kind: 'bom_table',
      x: Math.max(80, sheet1.width - 540),
      y: 80,
      width: 460,
      height: 220,
      text: 'Перечень элементов (ПЭ3)',
      tableConfig: {
        title: 'Перечень элементов (ПЭ3)',
        maxRows: 12,
        sheetOnly: false,
        rowHeight: 22,
      },
    });
  }

  return hydrateProjectDefaults({
    ...seed,
    id: `proj-tpl-${Date.now().toString(36)}`,
    name: `${template.title} (${suffix})`,
    projectCode: docCode,
    author: template.stampDefaults.author || seed.author,
    revision: 1,
    standard: template.standard,
    updatedAt: nowIso,
    visualSettings: {
      ...structuredClone(DEFAULT_VISUAL_SETTINGS),
      theme: options.themeOverride ?? template.theme,
      gridSize: template.gridSize,
      fontFamily: template.fontFamily,
      wireWidth: template.wireWidth,
      symbolStrokeWidth: template.symbolStrokeWidth,
      snapToGrid: template.snapToGrid,
      smartGuides: template.smartGuides,
      wireCrossingBridge: template.wireCrossingBridge,
      showGostFrame: template.showGostFrame,
      showPinNumbers: template.showPinNumbers,
      showWireNumbers: template.showWireNumbers,
      showCrossRefs: template.modules.includeCrossRefs && template.showCrossRefs,
    },
    sheets,
    devices,
    wires,
    cables,
    annotations,
  });
}

/**
 * Standalone Main Menu Layer Global Preferences (isolated from active project)
 */
export interface StandaloneHvacPrefs {
  systemTag: string;
  cabinetTag: string;
  fanPowerKw: number;
  heaterPowerKw: number;
  voltage: '24V' | '230V' | '380V';
  exZone: 'non-Ex' | 'Exd';
  heatingType: 'water' | 'electric' | 'none';
  sheetFormat: SheetFormat;
  fontFamily: SchematicFontFamily;
  createExternalWiringSheet: boolean;
  hasFanRedundancy: boolean;
  hasFreezeProtection: boolean;
}

export interface StandaloneUgoPrefs {
  defaultGridStep: 5 | 10 | 20;
  defaultStrokeWidth: number;
  defaultPinPitch: 10 | 20;
  defaultPrefix: string;
  autoSnapPins: boolean;
  standardConvention: StandardType;
}

export interface StandaloneExchangePrefs {
  e3VersionProfile: '2022_sp2' | '2024_x64';
  dxfEncoding: 'utf8' | 'cp1251';
  xmlSchemaMode: 'strict_gost' | 'extended_flux';
  autoPollConnector: boolean;
  importModeDefault: 'new_project' | 'inspect_only';
}

export const STANDALONE_HVAC_PREFS_KEY = 'e3promax.standaloneHvacPrefs.v1';
export const STANDALONE_UGO_PREFS_KEY = 'e3promax.standaloneUgoPrefs.v1';
export const STANDALONE_EXCHANGE_PREFS_KEY = 'e3promax.standaloneExchangePrefs.v1';

export const DEFAULT_STANDALONE_HVAC_PREFS: StandaloneHvacPrefs = {
  systemTag: 'ПВ1-01',
  cabinetTag: 'ЩУ-ПВ1',
  fanPowerKw: 2.2,
  heaterPowerKw: 15,
  voltage: '380V',
  exZone: 'non-Ex',
  heatingType: 'water',
  sheetFormat: 'A2',
  fontFamily: 'GOST',
  createExternalWiringSheet: true,
  hasFanRedundancy: false,
  hasFreezeProtection: true,
};

export const DEFAULT_STANDALONE_UGO_PREFS: StandaloneUgoPrefs = {
  defaultGridStep: 10,
  defaultStrokeWidth: 1.75,
  defaultPinPitch: 20,
  defaultPrefix: 'K',
  autoSnapPins: true,
  standardConvention: 'GOST',
};

export const DEFAULT_STANDALONE_EXCHANGE_PREFS: StandaloneExchangePrefs = {
  e3VersionProfile: '2022_sp2',
  dxfEncoding: 'utf8',
  xmlSchemaMode: 'extended_flux',
  autoPollConnector: true,
  importModeDefault: 'new_project',
};

export function loadStandalonePrefs<T extends object>(
  key: string,
  defaults: T,
  storage?: Pick<Storage, 'getItem'> | null
): T {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return structuredClone(defaults);
    const raw = store.getItem(key);
    if (!raw) return structuredClone(defaults);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return structuredClone(defaults);
    return { ...structuredClone(defaults), ...parsed };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveStandalonePrefs<T extends object>(
  key: string,
  value: T,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return;
    store.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export function createStandaloneHvacProject(
  options: HvacBuildOptions,
  catalog: CatalogItem[],
  extra: { theme?: 'light' | 'dark'; nowIso?: string } = {}
): { project: E3Project; fsaSheetId: string; wiringSheetId?: string } {
  const base = createProjectFromTemplate('gost_blank_a3', {
    standard: 'GOST',
    format: options.sheetFormat,
    theme: extra.theme,
    nowIso: extra.nowIso,
  });
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const sysTag = options.systemTag.trim() || 'ПВ1';
  base.id = `proj-fsa-${Date.now().toString(36)}`;
  base.name = `ФСА ${sysTag} (${suffix})`;
  base.projectCode = `${sysTag}-АТМ`;
  // Start with empty sheet list so FSA sheet becomes sheet #1 cleanly
  base.sheets = [];

  const res = generateHvacDiagram(options, catalog, base);
  const hydrated = hydrateProjectDefaults(res.nextProject);
  return {
    project: hydrated,
    fsaSheetId: res.fsaSheetId,
    wiringSheetId: res.wiringSheetId,
  };
}

/**
 * Standalone Template Studio Workspace persistence & .e3tpl.json file format
 */
export const TEMPLATE_WORKSPACE_DRAFT_KEY = 'e3promax.templateWorkspaceDraft.v1';

export interface CustomTemplateFilePayload {
  format: 'e3promax-template';
  version: 1;
  exportedAt: string;
  template: CustomProjectTemplate;
}

export function serializeCustomTemplateFile(
  template: CustomProjectTemplate,
  nowIso = new Date().toISOString()
): string {
  const clean: CustomProjectTemplate = {
    ...structuredClone(template),
    isBuiltin: false,
    updatedAt: nowIso,
  };
  const payload: CustomTemplateFilePayload = {
    format: 'e3promax-template',
    version: 1,
    exportedAt: nowIso,
    template: clean,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseCustomTemplateFile(rawText: string): CustomProjectTemplate | null {
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate =
      parsed.format === 'e3promax-template' && parsed.template && typeof parsed.template === 'object'
        ? (parsed.template as Partial<CustomProjectTemplate>)
        : typeof parsed.title === 'string' && Array.isArray(parsed.initialSheets)
          ? (parsed as Partial<CustomProjectTemplate>)
          : null;
    if (!candidate || typeof candidate.title !== 'string' || !candidate.title.trim()) {
      return null;
    }
    return createDefaultCustomTemplateDraft({
      ...candidate,
      id: `tpl-custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      isBuiltin: false,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

export function loadTemplateWorkspaceDraft(
  storage?: Pick<Storage, 'getItem'> | null
): CustomProjectTemplate | null {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return null;
    const raw = store.getItem(TEMPLATE_WORKSPACE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CustomProjectTemplate>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.title !== 'string') return null;
    return createDefaultCustomTemplateDraft(parsed);
  } catch {
    return null;
  }
}

export function saveTemplateWorkspaceDraft(
  template: CustomProjectTemplate,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return;
    store.setItem(TEMPLATE_WORKSPACE_DRAFT_KEY, JSON.stringify(template));
  } catch {
    // ignore storage quota errors
  }
}

export function clearTemplateWorkspaceDraft(
  storage?: Pick<Storage, 'removeItem'> | null
): void {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.localStorage
          : null;
    if (!store) return;
    store.removeItem(TEMPLATE_WORKSPACE_DRAFT_KEY);
  } catch {
    // ignore
  }
}


