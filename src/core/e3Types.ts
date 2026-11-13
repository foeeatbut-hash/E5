export type StandardType = 'GOST' | 'IEC';

export type SheetFormat = 'A4' | 'A3' | 'A2' | 'A1';

export type SchematicFontFamily = 'GOST' | 'DM Sans' | 'JetBrains Mono' | 'Plus Jakarta Sans' | 'Arial';

export type SignalType = 'power' | 'neutral' | 'pe' | 'dc24' | 'dc0' | 'signal' | 'bus';

export type DeviceCategory =
  | 'breaker'
  | 'contactor'
  | 'plc'
  | 'sensor'
  | 'motor'
  | 'psu'
  | 'terminal'
  | 'relay'
  | 'drive'
  | 'lamp'
  | 'fan'
  | 'damper'
  | 'filter'
  | 'heater'
  | 'cooler'
  | 'pump'
  | 'valve'
  | 'kip_circle'
  | 'junction_box'
  | 'io_matrix'
  | 'airflow_arrow'
  | 'offpage_ref';

export type PinDirection = 'left' | 'right' | 'top' | 'bottom';

export type BindingState = 'PLACED' | 'MODIFIED' | 'DETACHED' | 'REMOVED_IN_FLUX';

export interface E3Pin {
  id: string;
  name: string;
  dx: number;
  dy: number;
  direction: PinDirection;
  signalType: SignalType;
}

export interface E3Attribute {
  name: string;
  value: string;
  owner: string; // '' for block, '#1' or sub-item name for internal part
  conflict: 'flux' | 'script' | 'ask';
  service?: boolean;
}

export interface OffPageRefMeta {
  direction: 'out' | 'in';
  potentialName: string;
  signalType: SignalType;
  pairId?: string;
  targetDeviceId?: string;
}

export interface E3Device {
  id: string;
  elementId: string; // Persistent Flux ID (never recycled)
  designation: string; // e.g., -QF1, -KM1, -A1
  componentName: string;
  article: string;
  manufacturer: string;
  category: DeviceCategory;
  sheetId: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  width: number;
  height: number;
  e3BlockName: string;
  bindingState: BindingState;
  pins: E3Pin[];
  attributes: E3Attribute[];
  offPageRef?: OffPageRefMeta;
}

export interface E3Wire {
  id: string;
  sheetId: string;
  netName: string;
  signalType: SignalType;
  fromDeviceId: string;
  fromPinId: string;
  toDeviceId: string;
  toPinId: string;
  waypoints: Array<{ x: number; y: number }>;
  crossSection: string;
  wireNumber: string;
  cableId?: string;
  coreNumber?: string;
  manualRoute?: boolean;
}

export interface E3Cable {
  id: string;
  designation: string;
  cableType: string;
  coresCount: number;
  crossSection: string;
  lengthMeters: number;
  fromDevice: string;
  toDevice: string;
  shielded: boolean;
}

export type GostStampForm = 'form1' | 'form2a' | 'custom';

export interface E3TitleBlock {
  stampForm?: GostStampForm;
  customTemplateId?: string;
  documentCode: string;
  projectTitle?: string;
  organization: string;
  designer: string;
  checker: string;
  techControl?: string;
  normControl?: string;
  approver?: string;
  litera?: string;
  mass?: string;
  scale?: string;
  date?: string;
  invOriginal?: string;
  invDuplicate?: string;
  sheetTitle: string;
}

export type StampTextFieldKey = Exclude<keyof E3TitleBlock, 'stampForm' | 'customTemplateId'>;

export interface GostStampCellDef {
  id: string;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  label?: string;
  fieldKey?: StampTextFieldKey;
  staticText?: string;
  align?: 'left' | 'center';
  fontSize?: number;
  bold?: boolean;
}

export interface GostStampTemplate {
  id: string;
  name: string;
  description?: string;
  width: number;
  height: number;
  showArchivalStrip: boolean;
  isPreset?: boolean;
  cells: GostStampCellDef[];
}

export type SheetChangeArea =
  | 'devices'
  | 'wires'
  | 'annotations'
  | 'stamp'
  | 'format'
  | 'metadata';

export interface E3SheetSnapshot {
  name: string;
  format: SheetFormat;
  width: number;
  height: number;
  titleBlock: E3TitleBlock;
  devices: E3Device[];
  wires: E3Wire[];
  annotations: E3Annotation[];
}

export interface E3SheetRevisionEntry {
  revision: number;
  projectRevision: number;
  timestamp: string;
  author: string;
  summary: string;
  changedAreas: SheetChangeArea[];
  snapshot?: E3SheetSnapshot;
}

export interface E3Sheet {
  id: string;
  number: number;
  name: string;
  format: SheetFormat;
  width: number;
  height: number;
  titleBlock: E3TitleBlock;
  revision?: number;
  updatedAt?: string;
  revisions?: E3SheetRevisionEntry[];
}

export type BatchPublishFormat = 'pdf' | 'dxf-single' | 'dxf-zip';

export interface BatchPublishOptions {
  format: BatchPublishFormat;
  sheetIds: string[];
  includeBom: boolean;
  includeCables: boolean;
  includeGostFrame: boolean;
  editableBlocks: boolean;
}

export interface ExternalWebhookConfig {
  id: string;
  name: string;
  url: string;
  events: Array<'project.updated' | 'stamp.updated' | 'device.changed' | 'publish.completed'>;
  enabled: boolean;
  secret?: string;
  lastStatus?: number | null;
  lastDeliveredAt?: string;
  lastError?: string;
}

export interface FluxBusMessage {
  id: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  channel: string;
  action: string;
  sourceApp: string;
  targetApp: string;
  payloadSummary: string;
}

export interface E3VisualSettings {
  schemaVersion: number;
  presetName: string;
  theme: 'light' | 'dark';
  gridSize: number;
  snapToGrid: boolean;
  smartGuides?: boolean;
  showCrosshair?: boolean;
  showGrid: boolean;
  showGostFrame: boolean;
  showPinNumbers: boolean;
  showWireNumbers: boolean;
  showCrossRefs: boolean;
  wireWidth: number;
  symbolStrokeWidth: number;
  frameStrokeWidth?: number;
  annotationStrokeWidth?: number;
  wireCrossingBridge?: boolean;
  fontScale: number;
  fontFamily?: SchematicFontFamily;
  netColors: Record<SignalType, string>;
}

export type CadTool = 'select' | 'wire' | 'pan' | 'text' | 'rect' | 'callout' | 'offpage';

export type AnnotationKind = 'text' | 'rect' | 'callout';
export type AnnotationStrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface E3Annotation {
  id: string;
  sheetId: string;
  kind: AnnotationKind;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: string;
  fontSize?: number;
  strokeWidth?: number;
  strokeStyle?: AnnotationStrokeStyle;
}

export type CadLayerId = 'devices' | 'wires' | 'annotations' | 'frame';

export interface CadLayerState {
  visible: boolean;
  locked: boolean;
}

export type CadLayerStateMap = Record<CadLayerId, CadLayerState>;

export interface E3Project {
  schemaVersion: string;
  id: string;
  name: string;
  projectCode: string;
  fluxProjectKey: string;
  author: string;
  revision: number;
  standard: StandardType;
  updatedAt: string;
  sheets: E3Sheet[];
  devices: E3Device[];
  wires: E3Wire[];
  cables: E3Cable[];
  annotations?: E3Annotation[];
  layers?: CadLayerStateMap;
  customStampTemplates?: GostStampTemplate[];
  visualSettings: E3VisualSettings;
}

export type HvacStageRole =
  | 'intake_damper'
  | 'filter'
  | 'water_heater'
  | 'electric_heater'
  | 'cooler'
  | 'supply_fan'
  | 'exhaust_fan'
  | 'temp_sensor'
  | 'pressure_sensor'
  | 'control_post'
  | 'outlet_damper'
  | 'fire_signal'
  | 'custom';

export interface CatalogItem {
  id: string;
  category: DeviceCategory;
  defaultPrefix: string;
  componentName: string;
  article: string;
  manufacturer: string;
  e3BlockName: string;
  width: number;
  height: number;
  pins: Omit<E3Pin, 'id'>[];
  defaultAttributes: E3Attribute[];
  isCustom?: boolean;
  stageRole?: HvacStageRole;
  ioProfile?: { di: number; do: number; ai: number; ao: number };
  fluxMatch?: {
    minPowerKw?: number;
    maxPowerKw?: number;
    voltage?: string;
    exZone?: 'non-Ex' | 'Exd';
    signalKind?: string;
  };
  defaultCable?: string;
}

export interface BomRow {
  pos: number;
  designations: string[];
  designationText: string;
  componentName: string;
  article: string;
  manufacturer: string;
  category: DeviceCategory;
  quantity: number;
  unit: string;
  note: string;
}

export interface CableJournalRow {
  designation: string;
  cableType: string;
  coresCount: number;
  usedCores: number;
  crossSection: string;
  lengthMeters: number;
  fromDevice: string;
  toDevice: string;
  shielded: boolean;
  wireLengthMm?: number;
  netLengths?: Array<{ netName: string; lengthMm: number }>;
}

export interface NetWireLengthRow {
  netName: string;
  signalType: SignalType;
  wireCount: number;
  totalLengthMm: number;
  totalLengthMeters: number;
  crossSections: string[];
  wireNumbers: string[];
  cableDesignations: string[];
  sheetIds: string[];
}

export interface TerminalPlanRow {
  terminalDesignation: string;
  pinName: string;
  netName: string;
  wireNumber: string;
  crossSection: string;
  connectedTo: string;
  cableInfo: string;
}

export type ErcSeverity = 'error' | 'warning' | 'info';

export interface ErcIssue {
  id: string;
  severity: ErcSeverity;
  code: string;
  message: string;
  sheetId?: string;
  deviceId?: string;
  wireId?: string;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SYNC';

export interface ProcessLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  subsystem:
    | 'E3-CORE'
    | 'WORKER'
    | 'SYNC-API'
    | 'E3-XML'
    | 'FLUX-BRIDGE'
    | 'CAD-DXF'
    | 'PORTABLE'
    | 'SERVER'
    | 'E3-COM';
  message: string;
  durationMs?: number;
  details?: string;
}

export interface FluxExportNode {
  elementId: string;
  version: string;
  tag: string;
  designation: string;
  status: 'one' | 'many' | 'none';
  solutionId: string;
  solutionName: string;
  rect: { sheet: string; x: number; y: number; rotation: number; width: number; height: number };
  attrs: Array<{ name: string; value: string; owner: string; conflict?: 'flux' | 'script' | 'ask'; service?: boolean }>;
  checked: boolean;
}

export interface FluxBridgeBundle {
  format: 'flux-e3-bridge/v1';
  fluxProjectKey: string;
  projectName: string;
  exportedAt: string;
  revision: number;
  visualSettings: E3VisualSettings;
  nodes: FluxExportNode[];
  wires: E3Wire[];
  cables: E3Cable[];
  sheets: E3Sheet[];
}
