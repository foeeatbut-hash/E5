import { mergeAttributesUnique, SHEET_DIMENSIONS } from './e3Catalog.ts';
import type {
  CatalogItem,
  E3Attribute,
  E3Cable,
  E3Device,
  E3Project,
  E3Sheet,
  E3Wire,
  HvacStageRole,
  PinDirection,
  SchematicFontFamily,
  SheetFormat,
} from './e3Types.ts';

export type HvacTemplateId = 'supply_ahu' | 'exhaust_ahu' | 'avo';

export interface FluxHvacSpecs {
  systemTag: string;
  cabinetTag: string;
  fanPowerKw: number;
  heaterPowerKw: number;
  voltage: '24V' | '230V' | '380V';
  exZone: 'non-Ex' | 'Exd';
  heatingType: 'water' | 'electric' | 'none';
  hasCooler: boolean;
  hasFilter: boolean;
  hasOutletDamper: boolean;
  hasLocalPost: boolean;
}

export interface HvacWizardStage {
  id: string;
  role: HvacStageRole;
  label: string;
  catalogItemId: string;
  tagOverride?: string;
}

export interface HvacBuildOptions {
  templateId: HvacTemplateId;
  systemTag: string;
  cabinetTag: string;
  sheetFormat: SheetFormat;
  fontFamily: SchematicFontFamily;
  createExternalWiringSheet: boolean;
  replaceExistingHvacSheets?: boolean;
  stages: HvacWizardStage[];
}

export interface FsaMatrixColumn {
  num: number;
  tag: string;
  desc: string;
  di: number;
  do: number;
  ai: number;
  ao: number;
  measure: boolean;
  regulate: boolean;
  alarm: boolean;
  control: boolean;
}

export interface FsaMatrixData {
  cabinetTag: string;
  systemTag: string;
  totals: { di: number; do: number; ai: number; ao: number };
  reserve20: { di: number; do: number; ai: number; ao: number };
  columns: FsaMatrixColumn[];
}

export const HVAC_ROLE_LABELS: Record<HvacStageRole, string> = {
  intake_damper: 'Приточный клапан (DW)',
  filter: 'Воздушный фильтр (FA / ΔP)',
  water_heater: 'Водяной калорифер (EB / THV)',
  electric_heater: 'Электрокалорифер (EK)',
  cooler: 'Охладитель / ККБ (EC)',
  supply_fan: 'Приточный вентилятор (BL)',
  exhaust_fan: 'Вытяжной вентилятор (BL)',
  temp_sensor: 'Датчик температуры (THT)',
  pressure_sensor: 'Реле / датчик перепада ΔP (PDHS)',
  control_post: 'Местный пост Пуск/Стоп (HHS)',
  outlet_damper: 'Отсечной клапан на выходе (DW)',
  fire_signal: 'Противопожарный клапан / сигнал',
  custom: 'Доп. модуль / коробка (HJB)',
};

function parseKwFromText(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(?:квт|kw)/i.exec(text);
  if (!m) return null;
  const val = Number(m[1].replace(',', '.'));
  return Number.isFinite(val) ? val : null;
}

/** Extracts active project / Flux attributes so the HVAC builder can auto-match equipment. */
export function parseFluxSpecsFromProject(project: E3Project): FluxHvacSpecs {
  let fanPowerKw = 2.2;
  let heaterPowerKw = 15;
  let exZone: 'non-Ex' | 'Exd' = 'non-Ex';
  let voltage: '24V' | '230V' | '380V' = '380V';
  let cabinetTag = '3700-NK-DB-009';
  let systemTag = '3700-B06-AS-001A';

  if (project.projectCode && project.projectCode.trim()) {
    const codeUpper = project.projectCode.trim();
    if (codeUpper.includes('ПВ1')) {
      systemTag = 'ПВ1-01';
    } else {
      systemTag = codeUpper;
    }
  }

  for (const dev of project.devices) {
    if (dev.bindingState === 'REMOVED_IN_FLUX') continue;
    const joined = `${dev.componentName} ${dev.article} ${dev.attributes.map((a) => `${a.name}:${a.value}`).join(' ')}`;
    if (/exd|1ex|взрывозащ/i.test(joined)) {
      exZone = 'Exd';
    }
    if (dev.category === 'motor' || dev.category === 'drive' || dev.category === 'fan') {
      const kw = parseKwFromText(joined);
      if (kw && kw > 0) fanPowerKw = kw;
    }
    if (dev.category === 'heater') {
      const kw = parseKwFromText(joined);
      if (kw && kw > 0) heaterPowerKw = kw;
    }
    const cabAttr = dev.attributes.find((a) => /шкаф|cabinet|щит/i.test(a.name));
    if (cabAttr?.value) cabinetTag = cabAttr.value;
    if (/24\s*в|24v/i.test(joined) && dev.category === 'damper') {
      voltage = '24V';
    }
  }

  return {
    systemTag,
    cabinetTag,
    fanPowerKw,
    heaterPowerKw,
    voltage,
    exZone,
    heatingType: project.devices.some((d) => /тэн|эл\.?калорифер/i.test(d.componentName))
      ? 'electric'
      : 'water',
    hasCooler: true,
    hasFilter: true,
    hasOutletDamper: true,
    hasLocalPost: true,
  };
}

/** Selects the best matching CatalogItem from the DB based on Flux / project parameters. */
export function matchProductFromFlux(
  role: HvacStageRole,
  specs: FluxHvacSpecs,
  catalog: CatalogItem[]
): CatalogItem | undefined {
  const candidates = catalog.filter((c) => c.stageRole === role);
  if (candidates.length === 0) {
    return catalog.find((c) => c.category === 'kip_circle') || catalog[0];
  }

  let best = candidates[0];
  let bestScore = -1e9;

  for (const item of candidates) {
    let score = 0;
    const fm = item.fluxMatch;
    if (fm) {
      if (fm.exZone) {
        score += fm.exZone === specs.exZone ? 30 : -15;
      }
      if (fm.voltage) {
        if (role === 'intake_damper' || role === 'outlet_damper') {
          score += fm.voltage === (specs.voltage === '24V' ? '24V' : '230V') ? 15 : 0;
        } else if (fm.voltage === specs.voltage) {
          score += 15;
        }
      }
      if (role === 'supply_fan' || role === 'exhaust_fan') {
        const targetKw = specs.fanPowerKw;
        if (fm.minPowerKw !== undefined && fm.maxPowerKw !== undefined) {
          if (targetKw >= fm.minPowerKw && targetKw <= fm.maxPowerKw) {
            score += 40;
          } else {
            const dist = targetKw < fm.minPowerKw ? fm.minPowerKw - targetKw : targetKw - fm.maxPowerKw;
            score -= dist * 4;
          }
        }
      }
      if (role === 'electric_heater') {
        const targetKw = specs.heaterPowerKw;
        if (fm.minPowerKw !== undefined && fm.maxPowerKw !== undefined) {
          if (targetKw >= fm.minPowerKw && targetKw <= fm.maxPowerKw) score += 35;
        }
      }
    }
    if (item.isCustom) {
      // Slight preference if user added a custom exact item that fits
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best;
}

export function buildDefaultHvacStages(
  templateId: HvacTemplateId,
  specs: FluxHvacSpecs,
  catalog: CatalogItem[]
): HvacWizardStage[] {
  const roles: HvacStageRole[] = [];

  if (templateId === 'supply_ahu') {
    roles.push('intake_damper');
    if (specs.hasFilter) roles.push('filter');
    if (specs.heatingType === 'water') roles.push('water_heater');
    else if (specs.heatingType === 'electric') roles.push('electric_heater');
    if (specs.hasCooler) roles.push('cooler');
    roles.push('supply_fan');
    roles.push('temp_sensor');
    if (specs.hasOutletDamper) roles.push('outlet_damper');
    if (specs.hasLocalPost) roles.push('control_post');
  } else if (templateId === 'exhaust_ahu') {
    roles.push('intake_damper');
    if (specs.hasFilter) roles.push('filter');
    roles.push('exhaust_fan');
    if (specs.hasOutletDamper) roles.push('outlet_damper');
    if (specs.hasLocalPost) roles.push('control_post');
  } else {
    // АВО (Аппарат воздушного охлаждения)
    roles.push('intake_damper');
    roles.push('supply_fan');
    roles.push('temp_sensor');
    if (specs.hasLocalPost) roles.push('control_post');
  }

  return roles.map((role, idx) => {
    const matched = matchProductFromFlux(role, specs, catalog);
    return {
      id: `stg-${idx + 1}-${role}`,
      role,
      label: HVAC_ROLE_LABELS[role],
      catalogItemId: matched?.id || catalog[0]?.id || '',
    };
  });
}

function getIoProfile(item: CatalogItem): { di: number; do: number; ai: number; ao: number } {
  if (item.ioProfile) return item.ioProfile;
  if (item.category === 'damper') return { di: 2, do: 1, ai: 0, ao: 0 };
  if (item.category === 'filter') return { di: 1, do: 0, ai: 0, ao: 0 };
  if (item.category === 'heater') return { di: 2, do: 1, ai: 1, ao: 1 };
  if (item.category === 'cooler') return { di: 2, do: 1, ai: 0, ao: 1 };
  if (item.category === 'fan') return { di: 3, do: 1, ai: 0, ao: 1 };
  if (item.category === 'kip_circle') {
    return item.defaultPrefix === 'HHS' ? { di: 2, do: 0, ai: 0, ao: 0 } : { di: 0, do: 0, ai: 1, ao: 0 };
  }
  if (item.category === 'sensor') return { di: 0, do: 0, ai: 1, ao: 0 };
  return { di: 1, do: 0, ai: 0, ao: 0 };
}

function getPinAbs(dev: E3Device, pinName: string): { x: number; y: number; pinId: string; dir: PinDirection } {
  const pin =
    dev.pins.find((p) => p.name === pinName) ||
    dev.pins.find((p) => p.direction === 'bottom') ||
    dev.pins[0];
  return {
    x: dev.x + (pin?.dx ?? 0),
    y: dev.y + (pin?.dy ?? 0),
    pinId: pin?.id ?? '',
    dir: pin?.direction ?? 'right',
  };
}

/**
 * Generates an ordered, well-spaced FSA sheet (and optional External Wiring sheet)
 * directly from the wizard stage selection and active catalog.
 */
export function generateHvacDiagram(
  options: HvacBuildOptions,
  catalog: CatalogItem[],
  baseProject: E3Project
): {
  nextProject: E3Project;
  fsaSheetId: string;
  wiringSheetId?: string;
  createdDevicesCount: number;
  createdWiresCount: number;
} {
  const next = structuredClone(baseProject);
  const dims = SHEET_DIMENSIONS[options.sheetFormat] || SHEET_DIMENSIONS.A2;
  const sysPrefix = options.systemTag.trim() || 'ПВ1';
  const cabTag = options.cabinetTag.trim() || '3700-NK-DB-009';
  const stamp = Date.now().toString(36);

  next.visualSettings = {
    ...next.visualSettings,
    fontFamily: options.fontFamily,
  };

  const fsaSheetId = `sheet-fsa-${stamp}`;
  const fsaSheet: E3Sheet = {
    id: fsaSheetId,
    number: next.sheets.length + 1,
    name: `ФСА ${sysPrefix}`,
    format: options.sheetFormat,
    width: dims.width,
    height: dims.height,
    titleBlock: {
      documentCode: `${next.projectCode}-АТМ`,
      organization: next.sheets[0]?.titleBlock.organization || 'ООО «ПромВентАвтоматика»',
      designer: next.author || 'Инженер АСУ ТП',
      checker: next.sheets[0]?.titleBlock.checker || '',
      sheetTitle: `Схема автоматизации функциональная. Установка ${sysPrefix}`,
    },
  };
  next.sheets.push(fsaSheet);

  // Separate inline airflow stages vs control post (mounted below fan)
  const inlineStages = options.stages.filter((s) => s.role !== 'control_post');
  const postStages = options.stages.filter((s) => s.role === 'control_post');

  const resolvedInline = inlineStages
    .map((stg) => ({
      stage: stg,
      item: catalog.find((c) => c.id === stg.catalogItemId) || catalog[0],
    }))
    .filter((x): x is { stage: HvacWizardStage; item: CatalogItem } => Boolean(x.item));

  // Layout math: center airflow axis vertically in upper half, reserve bottom for I/O matrix
  const leftMargin = 80;
  const rightMargin = 80;
  const ductAxisY = Math.round(dims.height * 0.28);

  const arrowInDev: E3Device = {
    id: `dev-fsa-arr-in-${stamp}`,
    elementId: `el-fsa-arr-in-${stamp}`,
    designation: 'IN',
    componentName: 'Вход наружного воздуха',
    article: 'AIRFLOW-IN',
    manufacturer: 'ГОСТ',
    category: 'airflow_arrow',
    sheetId: fsaSheetId,
    x: leftMargin,
    y: ductAxisY - 20,
    rotation: 0,
    width: 40,
    height: 40,
    e3BlockName: 'FSA_AIRFLOW_IN',
    bindingState: 'PLACED',
    pins: [{ id: `p-arr-in-${stamp}`, name: 'OUT', dx: 40, dy: 20, direction: 'right', signalType: 'signal' }],
    attributes: [{ name: 'Назначение', value: 'Подача воздуха', owner: '', conflict: 'script', service: true }],
  };
  next.devices.push(arrowInDev);

  const count = Math.max(1, resolvedInline.length);
  const startX = leftMargin + 90;
  const endX = dims.width - rightMargin - 90;
  const totalWidthOfItems = resolvedInline.reduce((acc, r) => acc + r.item.width, 0);
  const gap = Math.max(40, Math.min(110, Math.floor((endX - startX - totalWidthOfItems) / Math.max(1, count))));

  const placedInline: Array<{ dev: E3Device; item: CatalogItem; stage: HvacWizardStage }> = [];
  const prefixCounters: Record<string, number> = {};
  let cursorX = startX;
  let createdDevicesCount = 1;
  let createdWiresCount = 0;

  for (let i = 0; i < resolvedInline.length; i++) {
    const { stage, item } = resolvedInline[i];
    const pfx = item.defaultPrefix || 'K';
    prefixCounters[pfx] = (prefixCounters[pfx] || 0) + 1;
    const seqNum = String(prefixCounters[pfx]).padStart(3, '0');
    const des = stage.tagOverride?.trim() || `${sysPrefix}-${pfx}-${seqNum}`;

    // Align device duct pin vertically with ductAxisY
    const inPin = item.pins.find((p) => p.direction === 'left' || p.name === 'IN') || item.pins[0];
    const pinDy = inPin ? inPin.dy : Math.round(item.height / 2);
    const devY = Math.max(60, ductAxisY - pinDy);
    const devId = `dev-fsa-${stamp}-${i + 1}`;

    const attrs: E3Attribute[] = [
      ...structuredClone(item.defaultAttributes),
      { name: 'Шкаф управления', value: cabTag, owner: '', conflict: 'flux' },
      { name: 'Установка', value: sysPrefix, owner: '', conflict: 'flux' },
    ];
    if (item.defaultCable) {
      attrs.push({ name: 'Кабель', value: item.defaultCable, owner: '', conflict: 'script' });
    }

    const dev: E3Device = {
      id: devId,
      elementId: `el-fsa-${stamp}-${i + 1}`,
      designation: des,
      componentName: item.componentName,
      article: item.article,
      manufacturer: item.manufacturer,
      category: item.category,
      sheetId: fsaSheetId,
      x: cursorX,
      y: devY,
      rotation: 0,
      width: item.width,
      height: item.height,
      e3BlockName: item.e3BlockName,
      bindingState: 'PLACED',
      pins: item.pins.map((p, pIdx) => ({ ...p, id: `${devId}-p${pIdx + 1}` })),
      attributes: attrs,
    };

    next.devices.push(dev);
    placedInline.push({ dev, item, stage });
    createdDevicesCount++;
    cursorX += item.width + gap;
  }

  const arrowOutX = Math.max(cursorX + 10, endX);
  let requiredFsaWidth = Math.max(dims.width, arrowOutX + 40 + rightMargin);
  fsaSheet.width = requiredFsaWidth;
  const arrowOutDev: E3Device = {
    id: `dev-fsa-arr-out-${stamp}`,
    elementId: `el-fsa-arr-out-${stamp}`,
    designation: 'OUT',
    componentName: 'Подача в помещение',
    article: 'AIRFLOW-OUT',
    manufacturer: 'ГОСТ',
    category: 'airflow_arrow',
    sheetId: fsaSheetId,
    x: arrowOutX,
    y: ductAxisY - 20,
    rotation: 0,
    width: 40,
    height: 40,
    e3BlockName: 'FSA_AIRFLOW_OUT',
    bindingState: 'PLACED',
    pins: [{ id: `p-arr-out-${stamp}`, name: 'IN', dx: 0, dy: 20, direction: 'left', signalType: 'signal' }],
    attributes: [{ name: 'Назначение', value: 'Выход воздуха', owner: '', conflict: 'script', service: true }],
  };
  next.devices.push(arrowOutDev);
  createdDevicesCount++;

  // Connect airflow duct left-to-right cleanly with straight colinear segments
  const ductChain: E3Device[] = [arrowInDev, ...placedInline.map((p) => p.dev), arrowOutDev];
  for (let i = 0; i < ductChain.length - 1; i++) {
    const dFrom = ductChain[i];
    const dTo = ductChain[i + 1];
    const fromPin = dFrom.pins.find((p) => p.direction === 'right' || p.name === 'OUT') || dFrom.pins[0];
    const toPin = dTo.pins.find((p) => p.direction === 'left' || p.name === 'IN') || dTo.pins[0];
    if (!fromPin || !toPin) continue;

    const p1 = { x: dFrom.x + fromPin.dx, y: dFrom.y + fromPin.dy };
    const p2 = { x: dTo.x + toPin.dx, y: dTo.y + toPin.dy };
    const pts = p1.y === p2.y ? [p1, p2] : [p1, { x: Math.round((p1.x + p2.x) / 2), y: p1.y }, { x: Math.round((p1.x + p2.x) / 2), y: p2.y }, p2];

    next.wires.push({
      id: `w-fsa-duct-${stamp}-${i + 1}`,
      sheetId: fsaSheetId,
      netName: `AIR_${i + 1}`,
      signalType: 'signal',
      fromDeviceId: dFrom.id,
      fromPinId: fromPin.id,
      toDeviceId: dTo.id,
      toPinId: toPin.id,
      waypoints: pts,
      crossSection: 'Воздуховод',
      wireNumber: `W${i + 1}`,
    });
    createdWiresCount++;
  }

  // Place control posts (HHS) cleanly under the fan (or last motor device) and wire orthogonally
  const fanEntry =
    placedInline.find((p) => p.item.category === 'fan') ||
    placedInline[placedInline.length - 1];
  const allPlacedForMatrix: Array<{ dev: E3Device; item: CatalogItem }> = [...placedInline];

  postStages.forEach((stg, idx) => {
    const item = catalog.find((c) => c.id === stg.catalogItemId) || catalog[0];
    if (!item) return;
    const anchorX = fanEntry ? fanEntry.dev.x + fanEntry.dev.width + 20 : startX + 120;
    const postX = anchorX + idx * (item.width + 30);
    requiredFsaWidth = Math.max(requiredFsaWidth, postX + item.width + rightMargin);
    fsaSheet.width = requiredFsaWidth;
    const postY = ductAxisY + 130;
    const devId = `dev-fsa-post-${stamp}-${idx + 1}`;
    const des = stg.tagOverride?.trim() || `${sysPrefix}-HHS-038${idx > 0 ? String.fromCharCode(65 + idx) : ''}`;

    const postDev: E3Device = {
      id: devId,
      elementId: `el-fsa-post-${stamp}-${idx + 1}`,
      designation: des,
      componentName: item.componentName,
      article: item.article,
      manufacturer: item.manufacturer,
      category: item.category,
      sheetId: fsaSheetId,
      x: postX,
      y: postY,
      rotation: 0,
      width: item.width,
      height: item.height,
      e3BlockName: item.e3BlockName,
      bindingState: 'PLACED',
      pins: item.pins.map((p, pIdx) => ({ ...p, id: `${devId}-p${pIdx + 1}` })),
      attributes: [
        ...structuredClone(item.defaultAttributes),
        { name: 'Шкаф управления', value: cabTag, owner: '', conflict: 'flux' },
        ...(item.defaultCable ? [{ name: 'Кабель', value: item.defaultCable, owner: '', conflict: 'script' as const }] : []),
      ],
    };
    next.devices.push(postDev);
    allPlacedForMatrix.push({ dev: postDev, item });
    createdDevicesCount++;

    if (fanEntry) {
      const fanBot = getPinAbs(fanEntry.dev, 'MTR');
      const postLeft = getPinAbs(postDev, 'S1');
      if (fanBot.pinId && postLeft.pinId) {
        const elbowY = postLeft.y;
        next.wires.push({
          id: `w-fsa-post-${stamp}-${idx + 1}`,
          sheetId: fsaSheetId,
          netName: `${des}_CMD`,
          signalType: 'dc24',
          fromDeviceId: fanEntry.dev.id,
          fromPinId: fanBot.pinId,
          toDeviceId: postDev.id,
          toPinId: postLeft.pinId,
          waypoints: [
            { x: fanBot.x, y: fanBot.y },
            { x: fanBot.x, y: elbowY },
            { x: postLeft.x, y: elbowY },
          ],
          crossSection: '1.5 мм²',
          wireNumber: `HHS${idx + 1}`,
        });
        createdWiresCount++;
      }
    }
  });

  // Compute I/O Controller Matrix table & place it cleanly at bottom-left
  const matrixColumns: FsaMatrixColumn[] = allPlacedForMatrix.map(({ dev, item }, idx) => {
    const io = getIoProfile(item);
    const fnStr = dev.attributes.find((a) => /функция/i.test(a.name))?.value || '';
    return {
      num: idx + 1,
      tag: dev.designation,
      desc: item.componentName.slice(0, 38),
      di: io.di,
      do: io.do,
      ai: io.ai,
      ao: io.ao,
      measure: /измер/i.test(fnStr) || io.ai > 0,
      regulate: /регул/i.test(fnStr) || io.ao > 0,
      alarm: /сигнал/i.test(fnStr) || io.di > 0,
      control: /управл/i.test(fnStr) || io.do > 0,
    };
  });

  const totals = matrixColumns.reduce(
    (acc, c) => ({
      di: acc.di + c.di,
      do: acc.do + c.do,
      ai: acc.ai + c.ai,
      ao: acc.ao + c.ao,
    }),
    { di: 0, do: 0, ai: 0, ao: 0 }
  );
  const reserve20 = {
    di: Math.ceil(totals.di * 1.2),
    do: Math.ceil(totals.do * 1.2),
    ai: Math.ceil(totals.ai * 1.2),
    ao: Math.ceil(totals.ao * 1.2),
  };

  const matrixData: FsaMatrixData = {
    cabinetTag: cabTag,
    systemTag: sysPrefix,
    totals,
    reserve20,
    columns: matrixColumns,
  };

  const matrixW = Math.max(540, 260 + matrixColumns.length * 64);
  requiredFsaWidth = Math.max(requiredFsaWidth, leftMargin + matrixW + rightMargin);
  fsaSheet.width = requiredFsaWidth;
  const matrixH = 310;
  const matrixY = Math.max(ductAxisY + 260, dims.height - matrixH - 130);

  next.devices.push({
    id: `dev-fsa-matrix-${stamp}`,
    elementId: `el-fsa-matrix-${stamp}`,
    designation: `IO-${cabTag}`,
    componentName: `Матрица сигналов контроллера ПЛК (${cabTag})`,
    article: `DI:${totals.di} DO:${totals.do} AI:${totals.ai} AO:${totals.ao}`,
    manufacturer: 'E3ProMax ФСА',
    category: 'io_matrix',
    sheetId: fsaSheetId,
    x: leftMargin,
    y: matrixY,
    rotation: 0,
    width: matrixW,
    height: matrixH,
    e3BlockName: 'FSA_IO_MATRIX',
    bindingState: 'PLACED',
    pins: [],
    attributes: [
      { name: 'Шкаф управления', value: cabTag, owner: '', conflict: 'flux' },
      { name: 'DI (+20%)', value: `${totals.di} (${reserve20.di})`, owner: '', conflict: 'script' },
      { name: 'DO (+20%)', value: `${totals.do} (${reserve20.do})`, owner: '', conflict: 'script' },
      { name: 'AI (+20%)', value: `${totals.ai} (${reserve20.ai})`, owner: '', conflict: 'script' },
      { name: 'AO (+20%)', value: `${totals.ao} (${reserve20.ao})`, owner: '', conflict: 'script' },
      { name: 'FSA_MATRIX_JSON', value: JSON.stringify(matrixData), owner: '', conflict: 'script', service: true },
    ],
  });
  createdDevicesCount++;

  // Optional External Connections Sheet (Схема внешних соединений КИПиА)
  let wiringSheetId: string | undefined;
  if (options.createExternalWiringSheet && allPlacedForMatrix.length > 0) {
    wiringSheetId = `sheet-ext-${stamp}`;
    const extSheet: E3Sheet = {
      id: wiringSheetId,
      number: next.sheets.length + 1,
      name: `Внеш. соед. ${sysPrefix}`,
      format: options.sheetFormat,
      width: dims.width,
      height: dims.height,
      titleBlock: {
        documentCode: `${next.projectCode}-КЖ`,
        organization: next.sheets[0]?.titleBlock.organization || 'ООО «ПромВентАвтоматика»',
        designer: next.author || 'Инженер АСУ ТП',
        checker: next.sheets[0]?.titleBlock.checker || '',
        sheetTitle: `Схема внешних соединений КИПиА. Установка ${sysPrefix}`,
      },
    };
    next.sheets.push(extSheet);

    const fieldCols = allPlacedForMatrix;
    const colSpan = Math.max(176, Math.floor((dims.width - 180) / Math.max(1, fieldCols.length)));
    const topFieldY = 120;
    const maxLaneY = topFieldY + 140 + Math.max(0, fieldCols.length - 1) * 28 + 24;
    const extSheetWidth = Math.max(dims.width, 180 + fieldCols.length * colSpan);
    const extSheetHeight = Math.max(dims.height, maxLaneY + 230);
    extSheet.width = extSheetWidth;
    extSheet.height = extSheetHeight;
    const botTermY = extSheetHeight - 190;

    const usedCableNums = new Set<number>();
    for (const c of next.cables) {
      const m = /^-?W(\d+)$/i.exec(c.designation.trim());
      if (m) usedCableNums.add(Number(m[1]));
    }
    let nextCableNum = 1;

    fieldCols.forEach(({ dev, item }, idx) => {
      while (usedCableNums.has(nextCableNum)) nextCableNum += 1;
      usedCableNums.add(nextCableNum);

      const colX = 90 + idx * colSpan;
      const jbId = `dev-ext-jb-${stamp}-${idx + 1}`;
      const xtId = `dev-ext-xt-${stamp}-${idx + 1}`;
      const cableId = `cab-ext-${stamp}-${idx + 1}`;
      const cableDes = `-W${nextCableNum}`;
      const cableMark = item.defaultCable || 'МКЭШ 2х2х0,75';

      const jbDev: E3Device = {
        id: jbId,
        elementId: `el-ext-jb-${stamp}-${idx + 1}`,
        designation: `${dev.designation}`,
        componentName: `Полевое подключение: ${item.componentName}`,
        article: item.article,
        manufacturer: item.manufacturer,
        category: 'junction_box',
        sheetId: wiringSheetId!,
        x: colX,
        y: topFieldY,
        rotation: 0,
        width: 140,
        height: 90,
        e3BlockName: 'EXT_FIELD_UNIT',
        bindingState: 'PLACED',
        pins: [
          { id: `${jbId}-p1`, name: '1', dx: 25, dy: 90, direction: 'bottom', signalType: 'signal' },
          { id: `${jbId}-p2`, name: '2', dx: 55, dy: 90, direction: 'bottom', signalType: 'signal' },
          { id: `${jbId}-p3`, name: '3', dx: 85, dy: 90, direction: 'bottom', signalType: 'dc24' },
          { id: `${jbId}-p4`, name: 'FE', dx: 115, dy: 90, direction: 'bottom', signalType: 'pe' },
        ],
        attributes: mergeAttributesUnique(
          [
            { name: 'Шкаф назначения', value: cabTag, owner: '', conflict: 'flux' },
            { name: 'Марка кабеля', value: cableMark, owner: '', conflict: 'flux' },
            { name: 'Установка', value: sysPrefix, owner: '', conflict: 'flux' },
          ],
          dev.attributes.filter((a) => !a.service)
        ),
      };

      const xtDev: E3Device = {
        id: xtId,
        elementId: `el-ext-xt-${stamp}-${idx + 1}`,
        designation: `${cabTag}:XT${170 + idx}`,
        componentName: `Клеммный ряд шкафа ${cabTag}`,
        article: 'UT 4',
        manufacturer: 'Phoenix Contact',
        category: 'terminal',
        sheetId: wiringSheetId!,
        x: colX + 10,
        y: botTermY,
        rotation: 0,
        width: 120,
        height: 60,
        e3BlockName: 'EXT_CABINET_XT',
        bindingState: 'PLACED',
        pins: [
          { id: `${xtId}-p1`, name: '1', dx: 20, dy: 0, direction: 'top', signalType: 'signal' },
          { id: `${xtId}-p2`, name: '2', dx: 45, dy: 0, direction: 'top', signalType: 'signal' },
          { id: `${xtId}-p3`, name: '3', dx: 75, dy: 0, direction: 'top', signalType: 'dc24' },
          { id: `${xtId}-p4`, name: 'FE', dx: 100, dy: 0, direction: 'top', signalType: 'pe' },
        ],
        attributes: [
          { name: 'Шкаф', value: cabTag, owner: '', conflict: 'flux' },
          { name: 'Назначение', value: `Подключение ${dev.designation}`, owner: '', conflict: 'flux' },
          { name: 'Количество клемм', value: '4', owner: '', conflict: 'script' },
          { name: 'Сечение', value: '0.75...2.5 мм²', owner: '', conflict: 'script' },
          { name: 'Монтаж', value: 'DIN-рейка 35 мм', owner: '', conflict: 'script' },
        ],
      };

      const cable: E3Cable = {
        id: cableId,
        designation: cableDes,
        cableType: cableMark,
        coresCount: 4,
        crossSection: '1.0 мм²',
        lengthMeters: 22 + idx * 3,
        fromDevice: dev.designation,
        toDevice: `${cabTag}:XT${170 + idx}`,
        shielded: /мкэш|экран/i.test(cableMark),
      };

      next.devices.push(jbDev, xtDev);
      next.cables.push(cable);
      createdDevicesCount += 2;

      // Clean staggered horizontal trunk lanes between field unit & terminal strip
      const laneY = topFieldY + 140 + idx * 28;
      [0, 1, 2].forEach((coreIdx) => {
        const pFrom = jbDev.pins[coreIdx];
        const pTo = xtDev.pins[coreIdx];
        if (!pFrom || !pTo) return;
        const x1 = jbDev.x + pFrom.dx;
        const y1 = jbDev.y + pFrom.dy;
        const x2 = xtDev.x + pTo.dx;
        const y2 = xtDev.y + pTo.dy;
        const subLaneY = laneY + coreIdx * 6;
        const pts =
          x1 === x2
            ? [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
              ]
            : [
                { x: x1, y: y1 },
                { x: x1, y: subLaneY },
                { x: x2, y: subLaneY },
                { x: x2, y: y2 },
              ];
        next.wires.push({
          id: `w-ext-${stamp}-${idx + 1}-${coreIdx + 1}`,
          sheetId: wiringSheetId!,
          netName: `${dev.designation}_K${coreIdx + 1}`,
          signalType: pFrom.signalType,
          fromDeviceId: jbDev.id,
          fromPinId: pFrom.id,
          toDeviceId: xtDev.id,
          toPinId: pTo.id,
          waypoints: pts,
          crossSection: '1.0 мм²',
          wireNumber: coreIdx === 0 ? `${cableDes} (${cableMark.split(' ')[0]})` : `${idx + 1}.${coreIdx + 1}`,
          cableId,
          coreNumber: String(coreIdx + 1),
        });
        createdWiresCount++;
      });
    });
  }

  next.revision += 1;
  next.updatedAt = new Date().toISOString();

  return {
    nextProject: next,
    fsaSheetId,
    wiringSheetId,
    createdDevicesCount,
    createdWiresCount,
  };
}
