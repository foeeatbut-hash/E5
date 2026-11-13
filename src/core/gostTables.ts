import { buildBom, buildCableJournal } from './e3Engine.ts';
import type { E3Annotation, E3Project } from './e3Types.ts';

export interface GostTableColumn {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'center' | 'right';
}

export interface GostTableRenderModel {
  kind: 'bom_table' | 'cable_table';
  title: string;
  width: number;
  height: number;
  titleHeight: number;
  headerHeight: number;
  rowHeight: number;
  columns: GostTableColumn[];
  rows: string[][];
  totalRows: number;
  truncatedCount: number;
}

const BOM_COLUMNS: GostTableColumn[] = [
  { key: 'pos', label: 'Поз.', width: 34, align: 'center' },
  { key: 'des', label: 'Поз. обозначение', width: 104, align: 'left' },
  { key: 'name', label: 'Наименование', width: 224, align: 'left' },
  { key: 'art', label: 'Артикул', width: 108, align: 'left' },
  { key: 'qty', label: 'Кол.', width: 42, align: 'center' },
  { key: 'note', label: 'Примечание', width: 98, align: 'left' },
];

const CABLE_COLUMNS: GostTableColumn[] = [
  { key: 'des', label: 'Кабель', width: 64, align: 'left' },
  { key: 'type', label: 'Марка кабеля', width: 162, align: 'left' },
  { key: 'from', label: 'Откуда', width: 84, align: 'left' },
  { key: 'to', label: 'Куда', width: 84, align: 'left' },
  { key: 'cores', label: 'Жилы', width: 52, align: 'center' },
  { key: 'sec', label: 'Сечение', width: 64, align: 'center' },
  { key: 'len', label: 'Длина', width: 60, align: 'center' },
];

export const BOM_TABLE_TOTAL_WIDTH = BOM_COLUMNS.reduce((acc, c) => acc + c.width, 0);
export const CABLE_TABLE_TOTAL_WIDTH = CABLE_COLUMNS.reduce((acc, c) => acc + c.width, 0);

export function buildGostTableRenderModel(
  ann: Pick<E3Annotation, 'kind' | 'sheetId' | 'text' | 'tableConfig'>,
  project: E3Project
): GostTableRenderModel {
  const isCable = ann.kind === 'cable_table';
  const cfg = ann.tableConfig || {};
  const rowHeight = Math.max(18, Math.min(36, cfg.rowHeight ?? 22));
  const titleHeight = 24;
  const headerHeight = 24;

  const columns = isCable ? CABLE_COLUMNS : BOM_COLUMNS;
  const width = columns.reduce((acc, c) => acc + c.width, 0);

  let allRows: string[][] = [];
  if (isCable) {
    const cables = buildCableJournal(project);
    allRows = cables.map((c) => [
      c.designation,
      c.cableType,
      c.fromDevice,
      c.toDevice,
      `${c.usedCores}/${c.coresCount}`,
      c.crossSection,
      `${c.lengthMeters} м`,
    ]);
  } else {
    const filteredProject =
      cfg.sheetOnly && ann.sheetId
        ? {
            ...project,
            devices: project.devices.filter((d) => d.sheetId === ann.sheetId),
          }
        : project;
    const bom = buildBom(filteredProject);
    allRows = bom.map((b) => [
      String(b.pos),
      b.designationText,
      b.componentName,
      b.article,
      `${b.quantity} ${b.unit}`,
      b.note || '',
    ]);
  }

  const maxRows = cfg.maxRows && cfg.maxRows > 0 ? cfg.maxRows : 0;
  const visibleRows = maxRows > 0 ? allRows.slice(0, maxRows) : allRows;
  const truncatedCount = Math.max(0, allRows.length - visibleRows.length);
  const displayRowCount = Math.max(1, visibleRows.length) + (truncatedCount > 0 ? 1 : 0);
  const height = titleHeight + headerHeight + displayRowCount * rowHeight;

  const defaultTitle = isCable
    ? `Кабельный журнал — ${project.projectCode}`
    : cfg.sheetOnly
      ? `Перечень элементов ПЭ3 (лист) — ${project.projectCode}`
      : `Перечень элементов ПЭ3 (ГОСТ 2.701) — ${project.projectCode}`;

  return {
    kind: isCable ? 'cable_table' : 'bom_table',
    title: cfg.title?.trim() || ann.text?.trim() || defaultTitle,
    width,
    height,
    titleHeight,
    headerHeight,
    rowHeight,
    columns,
    rows: visibleRows,
    totalRows: allRows.length,
    truncatedCount,
  };
}

export function estimateGostTableBounds(
  ann: Pick<E3Annotation, 'kind' | 'width' | 'height' | 'tableConfig'>
): { width: number; height: number } {
  const isCable = ann.kind === 'cable_table';
  const defaultW = isCable ? CABLE_TABLE_TOTAL_WIDTH : BOM_TABLE_TOTAL_WIDTH;
  return {
    width: Math.max(defaultW, ann.width || defaultW),
    height: Math.max(88, ann.height || 180),
  };
}
