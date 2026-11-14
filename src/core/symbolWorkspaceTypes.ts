import type {
  CatalogItem,
  CustomSymbolShape,
  CustomSymbolStrokeStyle,
  DeviceCategory,
  E3Attribute,
  E3Pin,
  E3SymbolDef,
  SignalType,
} from './e3Types';
import type { SymbolEditorTool } from './symbolDesigner';

export type SymbolWorkspaceTargetMode = 'symbol' | 'component' | 'device';

export interface SymbolActiveDrawStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: CustomSymbolStrokeStyle;
  filled: boolean;
  fillColor: string;
}

export interface SymbolWorkspaceDraft {
  open: boolean;
  targetMode: SymbolWorkspaceTargetMode;
  symbolId: string;
  catalogItemId?: string;
  deviceId?: string;
  name: string;
  e3BlockName: string;
  category: DeviceCategory;
  width: number;
  height: number;
  shapes: CustomSymbolShape[];
  pins: Omit<E3Pin, 'id'>[];
  // Catalog/Device component-level fields (Изделие в БД Е3)
  componentName: string;
  article: string;
  manufacturer: string;
  defaultPrefix: string;
  defaultCable?: string;
  attributes: E3Attribute[];
  // Interactive drafting state
  tool: SymbolEditorTool;
  activeStyle: SymbolActiveDrawStyle;
  activeAttrTagKey: string;
  activePinSignal: SignalType;
  gridStep: number;
  snapToGrid: boolean;
  selectedShapeId: string | null;
  selectedPinIndex: number | null;
  dirty: boolean;
}

export interface SymbolWorkspaceActions {
  draft: SymbolWorkspaceDraft;
  canUndo: boolean;
  canRedo: boolean;
  symbolLibrary: E3SymbolDef[];
  catalog: CatalogItem[];
  onUndo: () => void;
  onRedo: () => void;
  onSetTool: (tool: SymbolEditorTool) => void;
  onUpdateStyle: (patch: Partial<SymbolActiveDrawStyle>) => void;
  onSetGridStep: (step: number) => void;
  onToggleSnap: () => void;
  onSetAttrTagKey: (key: string) => void;
  onSetPinSignal: (sig: SignalType) => void;
  onUpdateDraftMeta: (
    patch: Partial<
      Pick<
        SymbolWorkspaceDraft,
        | 'name'
        | 'e3BlockName'
        | 'category'
        | 'width'
        | 'height'
        | 'componentName'
        | 'article'
        | 'manufacturer'
        | 'defaultPrefix'
        | 'defaultCable'
        | 'attributes'
      >
    >
  ) => void;
  onCommitGeometry: (
    shapes: CustomSymbolShape[],
    pins: Omit<E3Pin, 'id'>[],
    bounds?: { width?: number; height?: number }
  ) => void;
  onSelectShape: (shapeId: string | null) => void;
  onSelectPin: (pinIndex: number | null) => void;
  onDeleteSelection: () => void;
  onDuplicateSelectedShape: () => void;
  onMoveShapeOrder: (dir: 'up' | 'down') => void;
  onRotateBlockCW: () => void;
  onMirrorBlockX: () => void;
  onMirrorBlockY: () => void;
  onApplyAttributeTemplate: (presetId: string) => void;
  onApplyPresetShapes: (presetId: 'blank_box' | 'sensor_circle' | 'breaker_1p' | 'coil_relay') => void;
  onOpenSymbolInEditor: (sym: E3SymbolDef) => void;
  onOpenCatalogItemInEditor: (item: CatalogItem) => void;
  onCreateNewBlankSymbol: () => void;
  onCreateNewComponentFromSymbol: () => void;
  onSaveCurrent: () => void;
  onSaveAsCopy: (copyName: string, copyBlockName?: string, copyArticle?: string) => void;
  onPlaceOnActiveSheet: () => void;
  onDeleteCustomSymbol: (symbolId: string) => void;
  onCloseWorkspace: () => void;
}
