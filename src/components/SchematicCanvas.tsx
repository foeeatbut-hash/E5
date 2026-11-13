import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Grid3X3, Layers, Lock, Magnet, Maximize2, Minus, Plus, Ruler, X } from 'lucide-react';
import {
  countSheetLayerEntities,
  resolveCadLayers,
  summarizeCadLayers,
} from '../core/cadLayers';
import {
  normalizeSelectionBox,
  selectEntitiesInBox,
  type SelectionBox,
} from '../core/cadSelection';
import { resolveSchematicCssFont } from '../core/e3Catalog';
import {
  autoRouteOrthogonal,
  computeWireCrossingArcs,
  computeWireJunctionDots,
  computeWireLabelPositions,
  extractWireSegments,
  getAbsolutePinPos,
  getDeviceBounds,
  getSheetDrawableBounds,
} from '../core/e3Engine';
import { buildGostSheetGeometry, fitStampCellText, type StampFieldKey } from '../core/gostFrame';
import {
  type AlignmentGuide,
  computeSmartSnap,
  type SnapAxisKind,
  type SnapRectEntity,
  type SpacingGuide,
} from '../core/smartSnap';
import type {
  AnnotationKind,
  CadLayerId,
  CadLayerStateMap,
  CadTool,
  CatalogItem,
  E3Annotation,
  E3Device,
  E3Project,
  E3Wire,
  PinDirection,
} from '../core/e3Types';
import { LayerManagerPopover } from './LayerManagerPopover';
import { SchematicSymbol } from './SchematicSymbol';

interface SchematicCanvasProps {
  project: E3Project;
  catalog: CatalogItem[];
  activeSheetId: string;
  viewportIndex?: number;
  isMultiViewport?: boolean;
  isFocused?: boolean;
  tool: CadTool;
  zoom: number;
  pan: { x: number; y: number };
  layers?: CadLayerStateMap;
  selectedDeviceId: string | null;
  selectedWireId: string | null;
  selectedAnnotationId: string | null;
  selectedDeviceIds?: string[];
  selectedWireIds?: string[];
  selectedAnnotationIds?: string[];
  onFocusViewport?: () => void;
  onFitViewport?: () => void;
  onSelectSheet: (sheetId: string) => void;
  onAddSheet: () => void;
  onSetTool?: (tool: CadTool) => void;
  onSetZoom: (zoom: number) => void;
  onSetPan: (pan: { x: number; y: number }) => void;
  onSetTransform?: (zoom: number, pan: { x: number; y: number }) => void;
  onToggleGrid?: () => void;
  onToggleSnapToGrid?: () => void;
  onToggleSmartGuides?: () => void;
  onToggleLayerVisibility?: (layerId: CadLayerId) => void;
  onToggleLayerLock?: (layerId: CadLayerId) => void;
  onShowAllLayers?: () => void;
  onUnlockAllLayers?: () => void;
  onBeginDrag?: () => void;
  onCommitDrag?: (moved: boolean) => void;
  onSelectDevice: (deviceId: string | null, opts?: { toggle?: boolean }) => void;
  onSelectWire: (wireId: string | null, opts?: { toggle?: boolean }) => void;
  onSelectAnnotation: (annId: string | null, opts?: { toggle?: boolean }) => void;
  onSetSelection?: (
    next: { deviceIds: string[]; wireIds: string[]; annotationIds: string[] },
    additive?: boolean
  ) => void;
  onCreateAnnotation: (sheetId: string, kind: AnnotationKind, x: number, y: number) => void;
  onMoveAnnotation: (annId: string, x: number, y: number) => void;
  onMoveDevice: (deviceId: string, x: number, y: number) => void;
  onCreateWire: (fromDeviceId: string, fromPinId: string, toDeviceId: string, toPinId: string) => void;
  onDropCatalogItem: (item: CatalogItem, x: number, y: number, sheetId: string) => void;
  onOpenStampEditor?: (sheetId: string, fieldKey?: StampFieldKey) => void;
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({
  project,
  catalog,
  activeSheetId,
  viewportIndex = 0,
  isMultiViewport = false,
  isFocused = true,
  tool,
  zoom,
  pan,
  layers,
  selectedDeviceId,
  selectedWireId,
  selectedAnnotationId,
  selectedDeviceIds,
  selectedWireIds,
  selectedAnnotationIds,
  onFocusViewport,
  onFitViewport,
  onSelectSheet,
  onAddSheet,
  onSetTool,
  onSetZoom,
  onSetPan,
  onSetTransform,
  onToggleGrid,
  onToggleSnapToGrid,
  onToggleSmartGuides,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onShowAllLayers,
  onUnlockAllLayers,
  onBeginDrag,
  onCommitDrag,
  onSelectDevice,
  onSelectWire,
  onSelectAnnotation,
  onSetSelection,
  onCreateAnnotation,
  onMoveAnnotation,
  onMoveDevice,
  onCreateWire,
  onDropCatalogItem,
  onOpenStampEditor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeSnapHud, setActiveSnapHud] = useState<{
    entityId: string;
    x: number;
    y: number;
    width: number;
    guides: AlignmentGuide[];
    spacingGuides: SpacingGuide[];
    snappedXKind: SnapAxisKind;
    snappedYKind: SnapAxisKind;
    altBypass: boolean;
  } | null>(null);
  const [layerPopoverOpen, setLayerPopoverOpen] = useState(false);
  const layerBtnRef = useRef<HTMLButtonElement | null>(null);
  const [wireStart, setWireStart] = useState<{
    deviceId: string;
    pinId: string;
    x: number;
    y: number;
    direction: 'top' | 'right' | 'bottom' | 'left';
  } | null>(null);
  const [hoveredPin, setHoveredPin] = useState<{
    deviceId: string;
    pinId: string;
    x: number;
    y: number;
    direction: 'top' | 'right' | 'bottom' | 'left';
  } | null>(null);

  const resolvedLayers = useMemo(
    () => resolveCadLayers(layers ?? project.layers, project.visualSettings.showGostFrame),
    [layers, project.layers, project.visualSettings.showGostFrame]
  );
  const layerSummary = useMemo(() => summarizeCadLayers(resolvedLayers), [resolvedLayers]);
  const devicesVisible = resolvedLayers.devices.visible;
  const wiresVisible = resolvedLayers.wires.visible;
  const annotationsVisible = resolvedLayers.annotations.visible;
  const frameVisible = resolvedLayers.frame.visible && project.visualSettings.showGostFrame;
  const devicesLocked = resolvedLayers.devices.locked;
  const wiresLocked = resolvedLayers.wires.locked;
  const annotationsLocked = resolvedLayers.annotations.locked;
  const frameLocked = resolvedLayers.frame.locked;

  useEffect(() => {
    if ((!wiresVisible || wiresLocked) && wireStart) {
      setWireStart(null);
    }
  }, [wiresVisible, wiresLocked, wireStart]);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const onSetTransformRef = useRef(onSetTransform);
  onSetTransformRef.current = onSetTransform;
  const onSetZoomRef = useRef(onSetZoom);
  onSetZoomRef.current = onSetZoom;
  const onSetPanRef = useRef(onSetPan);
  onSetPanRef.current = onSetPan;

  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const selectedDeviceIdSet = useMemo(() => {
    const s = new Set<string>(selectedDeviceIds || []);
    if (selectedDeviceId) s.add(selectedDeviceId);
    return s;
  }, [selectedDeviceIds, selectedDeviceId]);

  const selectedWireIdSet = useMemo(() => {
    const s = new Set<string>(selectedWireIds || []);
    if (selectedWireId) s.add(selectedWireId);
    return s;
  }, [selectedWireIds, selectedWireId]);

  const selectedAnnotationIdSet = useMemo(() => {
    const s = new Set<string>(selectedAnnotationIds || []);
    if (selectedAnnotationId) s.add(selectedAnnotationId);
    return s;
  }, [selectedAnnotationIds, selectedAnnotationId]);

  const totalSelectedCount =
    selectedDeviceIdSet.size + selectedWireIdSet.size + selectedAnnotationIdSet.size;

  const dragRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; origPanX: number; origPanY: number; moved: boolean }
    | { kind: 'device'; deviceId: string; startWorldX: number; startWorldY: number; origX: number; origY: number; moved: boolean }
    | { kind: 'annotation'; annId: string; startWorldX: number; startWorldY: number; origX: number; origY: number; moved: boolean }
    | { kind: 'marquee'; startWorldX: number; startWorldY: number; additive: boolean; moved: boolean; currentBox?: SelectionBox }
    | null
  >(null);

  const sheet = useMemo(
    () => project.sheets.find((s) => s.id === activeSheetId) || project.sheets[0],
    [project.sheets, activeSheetId]
  );

  const sheetLayerCounts = useMemo(
    () => countSheetLayerEntities(project, sheet?.id || ''),
    [project, sheet?.id]
  );

  const sheetDevices = useMemo(
    () => project.devices.filter((d) => d.sheetId === sheet?.id),
    [project.devices, sheet?.id]
  );

  const sheetWires = useMemo(
    () => project.wires.filter((w) => w.sheetId === sheet?.id),
    [project.wires, sheet?.id]
  );

  const sheetAnnotations = useMemo(
    () => (project.annotations || []).filter((a) => a.sheetId === sheet?.id),
    [project.annotations, sheet?.id]
  );

  const connectedPinKeys = useMemo(() => {
    const set = new Set<string>();
    if (!wiresVisible) return set;
    for (const w of sheetWires) {
      set.add(`${w.fromDeviceId}:${w.fromPinId}`);
      set.add(`${w.toDeviceId}:${w.toPinId}`);
    }
    return set;
  }, [sheetWires, wiresVisible]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.round((clientX - rect.left - pan.x) / zoom),
      y: Math.round((clientY - rect.top - pan.y) / zoom),
    };
  };

  const snap = (val: number) => {
    if (!project.visualSettings.snapToGrid) return Math.round(val);
    const g = Math.max(5, project.visualSettings.gridSize);
    return Math.round(val / g) * g;
  };

  const finishDrag = useCallback(() => {
    const d = dragRef.current;
    setActiveSnapHud(null);
    setSelectionBox(null);
    if (!d) return;
    dragRef.current = null;
    if (d.kind === 'device' || d.kind === 'annotation') {
      onCommitDrag?.(d.moved);
    } else if (d.kind === 'marquee') {
      if (d.moved && d.currentBox) {
        const matched = selectEntitiesInBox(
          sheetDevices,
          sheetWires,
          sheetAnnotations,
          d.currentBox,
          resolvedLayers,
          project.visualSettings.showGostFrame
        );
        if (onSetSelection) {
          onSetSelection(matched, d.additive);
        } else if (matched.deviceIds[0]) {
          onSelectDevice(matched.deviceIds[0]);
        }
      } else if (!d.additive) {
        if (onSetSelection) {
          onSetSelection({ deviceIds: [], wireIds: [], annotationIds: [] }, false);
        } else {
          onSelectDevice(null);
          onSelectWire(null);
          onSelectAnnotation(null);
        }
      }
    }
  }, [
    onCommitDrag,
    sheetDevices,
    sheetWires,
    sheetAnnotations,
    resolvedLayers,
    project.visualSettings.showGostFrame,
    onSetSelection,
    onSelectDevice,
    onSelectWire,
    onSelectAnnotation,
  ]);

  useEffect(() => {
    window.addEventListener('mouseup', finishDrag);
    return () => window.removeEventListener('mouseup', finishDrag);
  }, [finishDrag]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      if (wireStart) {
        e.preventDefault();
        setWireStart(null);
      } else if (isFocused && tool !== 'select') {
        e.preventDefault();
        onSetTool?.('select');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [wireStart, tool, isFocused, onSetTool]);

  // Cursor-centered non-passive wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) === 0 && Math.abs(e.deltaX) === 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const curZoom = zoomRef.current;
      const curPan = panRef.current;
      const step = e.deltaY < 0 ? 0.1 : -0.1;
      const nextZoom = Math.min(2.5, Math.max(0.16, Math.round((curZoom + step) * 100) / 100));
      if (nextZoom === curZoom) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldX = (sx - curPan.x) / curZoom;
      const worldY = (sy - curPan.y) / curZoom;
      const nextPan = {
        x: Math.round(sx - worldX * nextZoom),
        y: Math.round(sy - worldY * nextZoom),
      };
      if (onSetTransformRef.current) {
        onSetTransformRef.current(nextZoom, nextPan);
      } else {
        onSetZoomRef.current(nextZoom);
        onSetPanRef.current(nextPan);
      }
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const handleMouseDownBg = (e: React.MouseEvent<SVGSVGElement>) => {
    onFocusViewport?.();
    if (e.button === 1 || tool === 'pan') {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        moved: false,
      };
      return;
    }
    if (wireStart) {
      setWireStart(null);
      return;
    }
    if ((tool === 'text' || tool === 'rect' || tool === 'callout') && sheet) {
      if (annotationsLocked || !annotationsVisible) return;
      const world = toWorld(e.clientX, e.clientY);
      onCreateAnnotation(sheet.id, tool, snap(world.x), snap(world.y));
      return;
    }
    if (tool === 'select' && e.button === 0) {
      const world = toWorld(e.clientX, e.clientY);
      setSelectionBox(null);
      dragRef.current = {
        kind: 'marquee',
        startWorldX: world.x,
        startWorldY: world.y,
        additive: e.shiftKey,
        moved: false,
      };
      return;
    }
    onSelectDevice(null);
    onSelectWire(null);
    onSelectAnnotation(null);
  };

  const handleSelectDeviceDown = (e: React.MouseEvent, device: E3Device) => {
    e.stopPropagation();
    onFocusViewport?.();
    if (tool === 'pan' || e.button === 1) {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        moved: false,
      };
      return;
    }
    if (e.shiftKey) {
      onSelectDevice(device.id, { toggle: true });
      return;
    }
    const alreadyInMulti = selectedDeviceIdSet.has(device.id) && totalSelectedCount > 1;
    if (!alreadyInMulti) {
      onSelectDevice(device.id);
    }
    if (tool === 'select' && !devicesLocked) {
      const world = toWorld(e.clientX, e.clientY);
      onBeginDrag?.();
      dragRef.current = {
        kind: 'device',
        deviceId: device.id,
        startWorldX: world.x,
        startWorldY: world.y,
        origX: device.x,
        origY: device.y,
        moved: false,
      };
    }
  };

  const handleAnnotationDown = (e: React.MouseEvent, ann: E3Annotation) => {
    e.stopPropagation();
    onFocusViewport?.();
    if (tool === 'pan' || e.button === 1) {
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origPanX: pan.x,
        origPanY: pan.y,
        moved: false,
      };
      return;
    }
    if (e.shiftKey) {
      onSelectAnnotation(ann.id, { toggle: true });
      return;
    }
    const alreadyInMulti = selectedAnnotationIdSet.has(ann.id) && totalSelectedCount > 1;
    if (!alreadyInMulti) {
      onSelectAnnotation(ann.id);
    }
    if (annotationsLocked) return;
    const world = toWorld(e.clientX, e.clientY);
    onBeginDrag?.();
    dragRef.current = {
      kind: 'annotation',
      annId: ann.id,
      startWorldX: world.x,
      startWorldY: world.y,
      origX: ann.x,
      origY: ann.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const world = toWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    const drag = dragRef.current;
    if (!drag) return;
    const vsCurr = project.visualSettings;
    const magneticEnabled = vsCurr.smartGuides !== false;
    const snapThresholdWorld = Math.max(8, Math.min(18, Math.round(12 / Math.max(0.35, zoom))));

    if (drag.kind === 'pan') {
      drag.moved = true;
      onSetPan({
        x: drag.origPanX + (e.clientX - drag.startX),
        y: drag.origPanY + (e.clientY - drag.startY),
      });
    } else if (drag.kind === 'marquee') {
      const box = normalizeSelectionBox(
        { x: drag.startWorldX, y: drag.startWorldY },
        world
      );
      if (box.width >= 4 || box.height >= 4) {
        drag.moved = true;
        drag.currentBox = box;
        setSelectionBox(box);
      }
    } else if (drag.kind === 'device') {
      const dev = sheetDevices.find((d) => d.id === drag.deviceId);
      const rawX = drag.origX + (world.x - drag.startWorldX);
      const rawY = drag.origY + (world.y - drag.startWorldY);
      if (dev) {
        const others: SnapRectEntity[] = sheetDevices
          .filter((d) => d.id !== dev.id && d.bindingState !== 'REMOVED_IN_FLUX')
          .map((d) => ({
            id: d.id,
            designation: d.designation,
            x: d.x,
            y: d.y,
            width: d.width,
            height: d.height,
            rotation: d.rotation,
            pins: d.pins,
          }));
        const res = computeSmartSnap(dev, rawX, rawY, others, {
          gridSize: vsCurr.gridSize,
          snapToGrid: vsCurr.snapToGrid,
          magneticSnap: magneticEnabled,
          bypassAllSnap: e.altKey,
          snapThreshold: snapThresholdWorld,
          sheet,
          wires: wiresVisible ? sheetWires : [],
        });
        setActiveSnapHud({
          entityId: dev.id,
          x: res.x,
          y: res.y,
          width: dev.width,
          guides: res.guides,
          spacingGuides: res.spacingGuides,
          snappedXKind: res.snappedXKind,
          snappedYKind: res.snappedYKind,
          altBypass: e.altKey,
        });
        if (res.x !== drag.origX || res.y !== drag.origY) drag.moved = true;
        if (res.x !== dev.x || res.y !== dev.y) {
          onMoveDevice(drag.deviceId, res.x, res.y);
        }
      } else {
        const nx = Math.max(30, snap(rawX));
        const ny = Math.max(30, snap(rawY));
        if (nx !== drag.origX || ny !== drag.origY) drag.moved = true;
        onMoveDevice(drag.deviceId, nx, ny);
      }
    } else if (drag.kind === 'annotation') {
      const ann = sheetAnnotations.find((a) => a.id === drag.annId);
      const rawX = drag.origX + (world.x - drag.startWorldX);
      const rawY = drag.origY + (world.y - drag.startWorldY);
      if (ann) {
        const others: SnapRectEntity[] = [
          ...(devicesVisible
            ? sheetDevices
                .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX')
                .map((d) => ({
                  id: d.id,
                  designation: d.designation,
                  x: d.x,
                  y: d.y,
                  width: d.width,
                  height: d.height,
                }))
            : []),
          ...sheetAnnotations
            .filter((a) => a.id !== ann.id)
            .map((a) => ({
              id: a.id,
              designation: a.kind === 'rect' ? 'Зона' : 'Выноска',
              x: a.x,
              y: a.y,
              width: a.width,
              height: a.height,
            })),
        ];
        const res = computeSmartSnap(
          { id: ann.id, x: ann.x, y: ann.y, width: ann.width, height: ann.height },
          rawX,
          rawY,
          others,
          {
            gridSize: vsCurr.gridSize,
            snapToGrid: vsCurr.snapToGrid,
            magneticSnap: magneticEnabled,
            bypassAllSnap: e.altKey,
            snapThreshold: snapThresholdWorld,
            sheet,
          }
        );
        setActiveSnapHud({
          entityId: ann.id,
          x: res.x,
          y: res.y,
          width: ann.width,
          guides: res.guides,
          spacingGuides: res.spacingGuides,
          snappedXKind: res.snappedXKind,
          snappedYKind: res.snappedYKind,
          altBypass: e.altKey,
        });
        if (res.x !== drag.origX || res.y !== drag.origY) drag.moved = true;
        if (res.x !== ann.x || res.y !== ann.y) {
          onMoveAnnotation(drag.annId, res.x, res.y);
        }
      } else {
        const nx = Math.max(20, snap(rawX));
        const ny = Math.max(20, snap(rawY));
        if (nx !== drag.origX || ny !== drag.origY) drag.moved = true;
        onMoveAnnotation(drag.annId, nx, ny);
      }
    }
  };

  const handlePinHover = useCallback(
    (device: E3Device, pinId: string | null) => {
      if (!pinId) {
        setHoveredPin((prev) => (prev && prev.deviceId === device.id ? null : prev));
        return;
      }
      const pin = device.pins.find((p) => p.id === pinId);
      if (!pin) return;
      const abs = getAbsolutePinPos(device, pin);
      setHoveredPin({
        deviceId: device.id,
        pinId: pin.id,
        x: abs.x,
        y: abs.y,
        direction: abs.direction,
      });
    },
    []
  );

  const handlePinClick = (e: React.MouseEvent, device: E3Device, pinId: string) => {
    e.stopPropagation();
    onFocusViewport?.();
    if (wiresLocked || !wiresVisible) return;
    const pin = device.pins.find((p) => p.id === pinId);
    if (!pin) return;
    const abs = getAbsolutePinPos(device, pin);

    if (!wireStart) {
      setWireStart({
        deviceId: device.id,
        pinId: pin.id,
        x: abs.x,
        y: abs.y,
        direction: abs.direction,
      });
    } else {
      if (wireStart.deviceId === device.id && wireStart.pinId === pin.id) {
        setWireStart(null);
        return;
      }
      onCreateWire(wireStart.deviceId, wireStart.pinId, device.id, pin.id);
      setWireStart(null);
      setHoveredPin(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onFocusViewport?.();
    if (devicesLocked || !devicesVisible) return;
    const catId = e.dataTransfer.getData('application/x-flux-catalog-id');
    if (!catId || !sheet) return;
    const item = catalog.find((c) => c.id === catId);
    if (!item) return;
    const world = toWorld(e.clientX, e.clientY);
    const rawX = world.x - item.width / 2;
    const rawY = world.y - item.height / 2;
    const others: SnapRectEntity[] = (devicesVisible ? sheetDevices : [])
      .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX')
      .map((d) => ({
        id: d.id,
        designation: d.designation,
        x: d.x,
        y: d.y,
        width: d.width,
        height: d.height,
        rotation: d.rotation,
        pins: d.pins,
      }));
    const snapped = computeSmartSnap(
      {
        id: '__drop__',
        x: rawX,
        y: rawY,
        width: item.width,
        height: item.height,
        pins: item.pins.map((p, idx) => ({ ...p, id: `drop-${idx}` })),
      },
      rawX,
      rawY,
      others,
      {
        gridSize: project.visualSettings.gridSize,
        snapToGrid: project.visualSettings.snapToGrid,
        magneticSnap: project.visualSettings.smartGuides !== false,
        bypassAllSnap: e.altKey,
        snapThreshold: Math.max(8, Math.min(18, Math.round(12 / Math.max(0.35, zoom)))),
        sheet,
      }
    );
    onDropCatalogItem(item, snapped.x, snapped.y, sheet.id);
  };

  const previewWirePoints = useMemo(() => {
    if (!wireStart) return '';
    const obstacles = sheetDevices
      .filter((d) => d.bindingState !== 'REMOVED_IN_FLUX' && d.category !== 'io_matrix')
      .map((d) => getDeviceBounds(d));
    const occupied = sheetWires.flatMap((w) => extractWireSegments(w.waypoints, w.netName));
    const sheetBounds = getSheetDrawableBounds(sheet);
    const snapTarget =
      hoveredPin && !(hoveredPin.deviceId === wireStart.deviceId && hoveredPin.pinId === wireStart.pinId)
        ? hoveredPin
        : null;
    const dx = cursorWorld.x - wireStart.x;
    const dy = cursorWorld.y - wireStart.y;
    const inferredDir: PinDirection =
      Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom';
    const targetEndpoint = snapTarget
      ? {
          x: snapTarget.x,
          y: snapTarget.y,
          direction: snapTarget.direction,
          deviceId: snapTarget.deviceId,
        }
      : {
          x: cursorWorld.x,
          y: cursorWorld.y,
          direction: inferredDir,
        };
    const pts = autoRouteOrthogonal(
      { x: wireStart.x, y: wireStart.y, direction: wireStart.direction, deviceId: wireStart.deviceId },
      targetEndpoint,
      20,
      obstacles,
      0,
      occupied,
      { sheetBounds }
    );
    return pts.map((p) => `${p.x},${p.y}`).join(' ');
  }, [wireStart, hoveredPin, cursorWorld, sheetDevices, sheetWires, sheet]);

  const gostGeom = useMemo(
    () => (sheet ? buildGostSheetGeometry(sheet, project) : null),
    [sheet, project]
  );

  const junctionDots = useMemo(() => computeWireJunctionDots(sheetWires), [sheetWires]);

  const vs = project.visualSettings;
  const crossingArcs = useMemo(
    () => (vs.wireCrossingBridge !== false ? computeWireCrossingArcs(sheetWires, junctionDots) : []),
    [sheetWires, junctionDots, vs.wireCrossingBridge]
  );
  const wireLabelMap = useMemo(
    () => computeWireLabelPositions(sheetWires, sheetDevices),
    [sheetWires, sheetDevices]
  );
  const frameSw = Math.max(0.5, vs.frameStrokeWidth ?? 1.6);
  const frameThinSw = Math.max(0.35, Number((frameSw * 0.44).toFixed(2)));
  const stampThickSw = Math.max(0.6, Number((frameSw * 0.88).toFixed(2)));
  const stampThinSw = Math.max(0.35, Number((frameSw * 0.47).toFixed(2)));
  const fontCss = resolveSchematicCssFont(vs.fontFamily);
  const gridPatternId = `flux-cad-grid-vp-${viewportIndex}`;

  const isDrawingTool = tool === 'wire' || tool === 'text' || tool === 'rect' || tool === 'callout';

  return (
    <section
      aria-label={`Рабочий холст электросхемы ${viewportIndex + 1}`}
      data-testid={`viewport-pane-${viewportIndex}`}
      onMouseDown={() => onFocusViewport?.()}
      className={`flex-1 w-full h-full min-w-0 min-h-0 flex flex-col bg-[var(--flux-canvas-bg)] relative ${
        isMultiViewport
          ? `border rounded-sm overflow-hidden ${
              isFocused ? 'border-[var(--flux-accent)] ring-1 ring-[var(--flux-accent)]/40' : 'border-[var(--flux-line)]'
            }`
          : ''
      }`}
    >
      {/* Sheet Tabs Bar (single) OR Compact Viewport Header (multi-viewport) */}
      {isMultiViewport ? (
        <div className="no-print h-7 shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] px-2 flex items-center justify-between gap-2 relative z-20">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                isFocused
                  ? 'bg-[var(--flux-accent-solid)] text-white font-semibold'
                  : 'bg-[var(--flux-bg)] text-[var(--flux-text-muted)] border border-[var(--flux-line)]'
              }`}
            >
              В{viewportIndex + 1}
            </span>
            <select
              aria-label={`Лист для окна ${viewportIndex + 1}`}
              value={sheet?.id || ''}
              onChange={(e) => {
                onFocusViewport?.();
                onSelectSheet(e.target.value);
              }}
              className="h-5 px-1.5 rounded border border-[var(--flux-line)] bg-[var(--flux-bg)] text-[11px] font-medium text-[var(--flux-text)] max-w-[230px] truncate"
            >
              {project.sheets.map((s) => (
                <option key={s.id} value={s.id}>
                  Лист {s.number}: {s.name} ({s.format})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-mono tabular-nums text-[var(--flux-text-muted)]">
            <div className="relative font-sans">
              <button
                ref={layerBtnRef}
                type="button"
                data-testid={viewportIndex === 0 ? 'canvas-layers-btn' : `canvas-layers-btn-${viewportIndex}`}
                onClick={() => {
                  onFocusViewport?.();
                  setLayerPopoverOpen((o) => !o);
                }}
                aria-expanded={layerPopoverOpen}
                title="Слои чертежа (видимость и блокировка)"
                className={`inline-flex items-center gap-1 h-5 px-1.5 rounded border text-[10px] font-medium transition-colors ${
                  layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0
                    ? 'border-[var(--flux-accent)]/60 bg-[var(--flux-accent-soft)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                }`}
              >
                <Layers className={`w-3 h-3 ${layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0 ? 'text-[var(--flux-accent)]' : ''}`} />
                <span>Слои</span>
              </button>
              {onToggleLayerVisibility && onToggleLayerLock && (
                <LayerManagerPopover
                  open={layerPopoverOpen}
                  layers={resolvedLayers}
                  entityCounts={sheetLayerCounts}
                  anchorRef={layerBtnRef}
                  onClose={() => setLayerPopoverOpen(false)}
                  onToggleVisibility={onToggleLayerVisibility}
                  onToggleLock={onToggleLayerLock}
                  onShowAll={() => onShowAllLayers?.()}
                  onUnlockAll={() => onUnlockAllLayers?.()}
                />
              )}
            </div>
            <span>{Math.round(zoom * 100)}%</span>
            <span>Эл:{sheetDevices.length}</span>
            {onFitViewport && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFocusViewport?.();
                  onFitViewport();
                }}
                title="Вписать лист в это окно"
                aria-label="По размеру окна"
                className="inline-flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--flux-hover)] text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="no-print h-8 shrink-0 border-b border-[var(--flux-line)] bg-[var(--flux-surface)] px-2 flex items-center justify-between gap-2 relative z-20">
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
              {project.sheets.map((s) => {
                const active = s.id === sheet?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelectSheet(s.id)}
                    title={`Лист ${s.number}: ${s.name} (${s.format})`}
                    className={`relative h-8 px-2.5 max-w-[200px] text-[12px] font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                      active
                        ? 'text-[var(--flux-text)]'
                        : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)]'
                    }`}
                  >
                    <span className="truncate">
                      Лист {s.number}: {s.name}
                    </span>
                    {active && (
                      <motion.span
                        layoutId={`sheet-tab-accent-${viewportIndex}`}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        aria-hidden="true"
                        className="absolute bottom-0 left-1 right-1 h-0.5 bg-[var(--flux-accent)]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onAddSheet}
              aria-label="Добавить новый лист схемы"
              className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)] whitespace-nowrap shrink-0 border border-transparent hover:border-[var(--flux-line)]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Лист</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 text-[11px] text-[var(--flux-text-muted)] shrink-0">
            {wireStart && (
              <span className="hidden md:inline font-mono text-[var(--flux-accent)] font-medium">
                Выберите целевой вывод (Esc — отмена)
              </span>
            )}
            <span className="hidden md:inline font-mono tabular-nums">Эл.: {sheetDevices.length}</span>
            <span className="hidden md:inline font-mono tabular-nums">Связи: {sheetWires.length}</span>

            <div className="relative">
              <button
                ref={layerBtnRef}
                type="button"
                data-testid={viewportIndex === 0 ? 'canvas-layers-btn' : `canvas-layers-btn-${viewportIndex}`}
                onClick={() => {
                  onFocusViewport?.();
                  setLayerPopoverOpen((o) => !o);
                }}
                aria-expanded={layerPopoverOpen}
                title="Диспетчер слоёв чертежа (видимость и блокировка)"
                className={`inline-flex items-center gap-1.5 h-6 px-2 rounded border text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0
                    ? 'border-[var(--flux-accent)]/70 bg-[var(--flux-accent-soft)] text-[var(--flux-text)]'
                    : 'border-[var(--flux-line)] bg-[var(--flux-bg)] text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
                }`}
              >
                <Layers className={`w-3.5 h-3.5 shrink-0 ${layerPopoverOpen || layerSummary.hiddenCount > 0 || layerSummary.lockedCount > 0 ? 'text-[var(--flux-accent)]' : 'text-[var(--flux-text-muted)]'}`} />
                <span>Слои</span>
                <span className="font-mono tabular-nums text-[10px] text-[var(--flux-text-muted)]">
                  {layerSummary.visibleCount}/{layerSummary.total}
                </span>
                {layerSummary.lockedCount > 0 && (
                  <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                )}
              </button>
              {onToggleLayerVisibility && onToggleLayerLock && (
                <LayerManagerPopover
                  open={layerPopoverOpen}
                  layers={resolvedLayers}
                  entityCounts={sheetLayerCounts}
                  anchorRef={layerBtnRef}
                  onClose={() => setLayerPopoverOpen(false)}
                  onToggleVisibility={onToggleLayerVisibility}
                  onToggleLock={onToggleLayerLock}
                  onShowAll={() => onShowAllLayers?.()}
                  onUnlockAll={() => onUnlockAllLayers?.()}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interactive SVG Viewport */}
      <div
        ref={containerRef}
        data-testid={viewportIndex === 0 ? 'schematic-canvas' : `schematic-canvas-${viewportIndex}`}
        data-layer-devices-visible={String(devicesVisible)}
        data-layer-wires-visible={String(wiresVisible)}
        data-layer-annotations-visible={String(annotationsVisible)}
        data-layer-frame-visible={String(frameVisible)}
        data-layer-devices-locked={String(devicesLocked)}
        data-layer-wires-locked={String(wiresLocked)}
        data-layer-annotations-locked={String(annotationsLocked)}
        data-layer-frame-locked={String(frameLocked)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{
          cursor:
            tool === 'pan'
              ? 'grab'
              : (tool === 'wire' && (wiresLocked || !wiresVisible)) ||
                  ((tool === 'text' || tool === 'rect' || tool === 'callout') &&
                    (annotationsLocked || !annotationsVisible))
                ? 'not-allowed'
                : wireStart || isDrawingTool
                  ? 'crosshair'
                  : 'default',
        }}
      >
        <svg
          width="100%"
          height="100%"
          onMouseDown={handleMouseDownBg}
          onMouseMove={handleMouseMove}
          onMouseUp={finishDrag}
          className="block w-full h-full"
        >
          <defs>
            <pattern
              id={gridPatternId}
              width={vs.gridSize}
              height={vs.gridSize}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={1} cy={1} r={0.9} fill="var(--flux-grid-dot)" />
            </pattern>
          </defs>

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Sheet Paper & Grid */}
            {sheet && (
              <g>
                <rect
                  x={0}
                  y={0}
                  width={sheet.width}
                  height={sheet.height}
                  fill="var(--flux-surface)"
                  stroke="var(--flux-line-strong)"
                  strokeWidth={1.5}
                  style={{ filter: 'drop-shadow(0 6px 18px rgba(15, 23, 42, 0.09))' }}
                />
                {vs.showGrid && (
                  <rect
                    x={0}
                    y={0}
                    width={sheet.width}
                    height={sheet.height}
                    fill={`url(#${gridPatternId})`}
                  />
                )}

                {/* GOST 2.104-2006 Frame, Zones, Left Archival Strip & Editable Form 1/2a Title Block */}
                {frameVisible && gostGeom && (
                  <g data-testid="layer-group-frame">
                    {/* Outer paper border & inner main GOST frame */}
                    <rect
                      data-testid="gost-main-frame"
                      x={gostGeom.frame.left}
                      y={gostGeom.frame.top}
                      width={gostGeom.frame.width}
                      height={gostGeom.frame.height}
                      fill="none"
                      stroke="var(--flux-text)"
                      strokeWidth={frameSw}
                      pointerEvents="none"
                    />
                    <rect
                      x={4}
                      y={4}
                      width={sheet.width - 8}
                      height={sheet.height - 8}
                      fill="none"
                      stroke="var(--flux-line-strong)"
                      strokeWidth={frameThinSw}
                      pointerEvents="none"
                    />
                    {/* Top Coordinate Zones 1..6 */}
                    {['1', '2', '3', '4', '5', '6'].map((zoneNum, zi, arr) => {
                      const spanW = gostGeom.frame.width / arr.length;
                      const zx = gostGeom.frame.left + zi * spanW;
                      return (
                        <g key={`z-top-${zoneNum}`} pointerEvents="none">
                          {zi > 0 && (
                            <line
                              x1={zx}
                              y1={4}
                              x2={zx}
                              y2={gostGeom.frame.top}
                              stroke="var(--flux-line-strong)"
                              strokeWidth={frameThinSw}
                            />
                          )}
                          <text
                            x={zx + spanW / 2}
                            y={14}
                            textAnchor="middle"
                            fill="var(--flux-text-muted)"
                            fontSize={9.5}
                            fontFamily={fontCss}
                          >
                            {zoneNum}
                          </text>
                        </g>
                      );
                    })}
                    {/* Left Coordinate Zones А..Д */}
                    {['А', 'Б', 'В', 'Г', 'Д'].map((zoneLet, zi, arr) => {
                      const spanH = gostGeom.frame.height / arr.length;
                      const zy = gostGeom.frame.top + zi * spanH;
                      return (
                        <g key={`z-left-${zoneLet}`} pointerEvents="none">
                          {zi > 0 && (
                            <line
                              x1={4}
                              y1={zy}
                              x2={20}
                              y2={zy}
                              stroke="var(--flux-line-strong)"
                              strokeWidth={frameThinSw}
                            />
                          )}
                          <text
                            x={12}
                            y={zy + spanH / 2 + 3}
                            textAnchor="middle"
                            fill="var(--flux-text-muted)"
                            fontSize={9.5}
                            fontFamily={fontCss}
                          >
                            {zoneLet}
                          </text>
                        </g>
                      );
                    })}

                    {/* Left Archival Strip (Графы 19-23 ГОСТ 2.104) */}
                    {gostGeom.archivalBox.visible && (
                    <g pointerEvents="none">
                      <rect
                        x={gostGeom.archivalBox.x}
                        y={gostGeom.archivalBox.y}
                        width={gostGeom.archivalBox.width}
                        height={gostGeom.archivalBox.height}
                        fill="var(--flux-surface)"
                        stroke="var(--flux-text)"
                        strokeWidth={Math.max(0.5, Number((frameSw * 0.68).toFixed(2)))}
                      />
                      <line
                        x1={gostGeom.archivalBox.x + 17}
                        y1={gostGeom.archivalBox.y}
                        x2={gostGeom.archivalBox.x + 17}
                        y2={gostGeom.archivalBox.y + gostGeom.archivalBox.height}
                        stroke="var(--flux-text)"
                        strokeWidth={stampThinSw}
                      />
                      {(() => {
                        let curY = gostGeom.archivalBox.y;
                        return gostGeom.archivalBox.rows.map((r, ri) => {
                          const rowY = curY;
                          curY += r.h;
                          return (
                            <g key={`arch-${ri}`}>
                              {ri > 0 && (
                                <line
                                  x1={gostGeom.archivalBox.x}
                                  y1={rowY}
                                  x2={gostGeom.archivalBox.x + gostGeom.archivalBox.width}
                                  y2={rowY}
                                  stroke="var(--flux-text)"
                                  strokeWidth={stampThinSw}
                                />
                              )}
                              <text
                                transform={`translate(${gostGeom.archivalBox.x + 12}, ${rowY + r.h / 2}) rotate(-90)`}
                                textAnchor="middle"
                                fill="var(--flux-text-muted)"
                                fontSize={7.5}
                                fontFamily={fontCss}
                              >
                                {r.label}
                              </text>
                              {r.value && (
                                <text
                                  transform={`translate(${gostGeom.archivalBox.x + 30}, ${rowY + r.h / 2}) rotate(-90)`}
                                  textAnchor="middle"
                                  fill="var(--flux-text)"
                                  fontSize={8}
                                  fontFamily={fontCss}
                                >
                                  {r.value}
                                </text>
                              )}
                            </g>
                          );
                        });
                      })()}
                    </g>
                    )}

                    {/* GOST 2.104 Stamp (Form 1 or Form 2a) */}
                    <g data-testid="gost-stamp">
                      <rect
                        x={gostGeom.stamp.x}
                        y={gostGeom.stamp.y}
                        width={gostGeom.stamp.width}
                        height={gostGeom.stamp.height}
                        fill="var(--flux-surface)"
                        stroke="var(--flux-text)"
                        strokeWidth={frameSw}
                      />
                      {gostGeom.stamp.lines.map((ln, li) => (
                        <line
                          key={`st-ln-${li}`}
                          x1={ln.x1}
                          y1={ln.y1}
                          x2={ln.x2}
                          y2={ln.y2}
                          stroke="var(--flux-text)"
                          strokeWidth={ln.thick ? stampThickSw : stampThinSw}
                          pointerEvents="none"
                        />
                      ))}
                      {gostGeom.stamp.cells.map((cell) => {
                        const hasField = Boolean(cell.editable && cell.fieldKey);
                        const isEditable = hasField && !frameLocked;
                        const fitted = fitStampCellText(
                          cell.text,
                          cell.width,
                          cell.height,
                          cell.fontSize || 8.5,
                          cell.bold
                        );
                        const fs = fitted.fontSize;
                        const tx = cell.align === 'center' ? cell.x + cell.width / 2 : cell.x + 4;
                        const totalBlockH =
                          fitted.lines.length > 1
                            ? (fitted.lines.length - 1) * fitted.lineHeight
                            : 0;
                        const firstLineY =
                          cell.y + cell.height / 2 - totalBlockH / 2 + fs * 0.34;
                        const clipId = `vp-${viewportIndex}-st-clip-${cell.id}`;
                        return (
                          <g
                            key={cell.id}
                            data-testid={hasField ? `gost-stamp-cell-${cell.id}` : undefined}
                            onMouseDown={(e) => {
                              if (isEditable) e.stopPropagation();
                            }}
                            onClick={(e) => {
                              if (!isEditable) return;
                              e.stopPropagation();
                              onFocusViewport?.();
                              onOpenStampEditor?.(sheet.id, cell.fieldKey);
                            }}
                            onDoubleClick={(e) => {
                              if (!isEditable) return;
                              e.stopPropagation();
                              onOpenStampEditor?.(sheet.id, cell.fieldKey);
                            }}
                            className={isEditable ? 'cursor-pointer group' : undefined}
                          >
                            <defs>
                              <clipPath id={clipId}>
                                <rect
                                  x={cell.x + 1}
                                  y={cell.y + 1}
                                  width={Math.max(1, cell.width - 2)}
                                  height={Math.max(1, cell.height - 2)}
                                />
                              </clipPath>
                            </defs>
                            <rect
                              x={cell.x + 0.5}
                              y={cell.y + 0.5}
                              width={Math.max(1, cell.width - 1)}
                              height={Math.max(1, cell.height - 1)}
                              fill={isEditable ? 'var(--flux-accent)' : 'transparent'}
                              fillOpacity={0}
                              className={isEditable ? 'hover:fill-opacity-10 transition-opacity' : undefined}
                            />
                            {isEditable && cell.label && <title>{`${cell.label} — кликните для редактирования`}</title>}
                            {hasField && frameLocked && cell.label && (
                              <title>{`${cell.label} (слой «Рамка и штамп ГОСТ» заблокирован)`}</title>
                            )}
                            <text
                              x={tx}
                              y={firstLineY}
                              textAnchor={cell.align === 'center' ? 'middle' : 'start'}
                              fill={hasField ? 'var(--flux-text)' : 'var(--flux-text-muted)'}
                              fontSize={fs}
                              fontFamily={fontCss}
                              fontWeight={cell.bold ? 600 : 400}
                              clipPath={`url(#${clipId})`}
                              pointerEvents="none"
                            >
                              {fitted.lines.map((lnText, li) => (
                                <tspan key={li} x={tx} dy={li === 0 ? 0 : fitted.lineHeight}>
                                  {lnText}
                                </tspan>
                              ))}
                            </text>
                          </g>
                        );
                      })}
                      {/* Quick AutoCAD-like edit badge above stamp corner */}
                      <g
                        data-testid="gost-stamp-edit-btn"
                        className={`${frameLocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} no-print`}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onFocusViewport?.();
                          if (frameLocked) return;
                          onOpenStampEditor?.(sheet.id);
                        }}
                      >
                        <rect
                          x={gostGeom.stamp.x}
                          y={gostGeom.stamp.y - 18}
                          width={gostGeom.stamp.form === 'custom' ? 182 : 126}
                          height={16}
                          rx={2}
                          fill="var(--flux-surface)"
                          stroke={frameLocked ? '#d97706' : 'var(--flux-accent)'}
                          strokeWidth={0.9}
                        />
                        <text
                          x={gostGeom.stamp.x + (gostGeom.stamp.form === 'custom' ? 91 : 63)}
                          y={gostGeom.stamp.y - 7}
                          textAnchor="middle"
                          fill={frameLocked ? '#b45309' : 'var(--flux-accent)'}
                          fontSize={8.5}
                          fontFamily={fontCss}
                          fontWeight={600}
                        >
                          {frameLocked
                            ? '🔒 Штамп заблокирован'
                            : gostGeom.stamp.form === 'custom'
                              ? `✎ ${(gostGeom.stamp.templateName || 'Свой штамп').slice(0, 22)}`
                              : `✎ Штамп (${gostGeom.stamp.form === 'form1' ? 'Форма 1' : 'Форма 2а'})`}
                        </text>
                      </g>
                    </g>
                  </g>
                )}
              </g>
            )}

            {/* Drafting Zones / Annotations (under wires/devices for rect zones) */}
            {annotationsVisible && (
              <g data-testid="layer-group-annotations">
                {sheetAnnotations.map((ann) => {
                  const selected = selectedAnnotationIdSet.has(ann.id);
                  const strokeColor = selected
                    ? annotationsLocked
                      ? '#d97706'
                      : 'var(--flux-accent)'
                    : ann.color || 'var(--flux-text)';
                  const annSw = Math.max(0.5, ann.strokeWidth ?? vs.annotationStrokeWidth ?? 1.4);
                  const activeSw = selected ? Math.max(annSw + 0.6, 2) : annSw;
                  const annStyle = ann.strokeStyle ?? (ann.kind === 'rect' ? 'dashed' : 'solid');
                  const dashArray =
                    annStyle === 'dashed' ? '8 4' : annStyle === 'dotted' ? '2.5 3' : undefined;
                  const fs = (ann.fontSize || 12) * vs.fontScale;
                  const lines = (ann.text || '').split(/\r?\n/);
                  const lineH = Math.round(fs * 1.3);
                  const maxLineLen = Math.max(4, ...lines.map((l) => l.length));
                  const annCls = annotationsLocked ? 'cursor-default' : 'cursor-move';

                  if (ann.kind === 'rect') {
                    return (
                      <g
                        key={ann.id}
                        data-testid={`annotation-${ann.id}`}
                        onMouseDown={(e) => handleAnnotationDown(e, ann)}
                        className={annCls}
                      >
                        <rect
                          x={ann.x}
                          y={ann.y}
                          width={ann.width}
                          height={ann.height}
                          fill={selected ? 'var(--flux-accent)' : 'transparent'}
                          fillOpacity={selected ? 0.06 : 0}
                          stroke={strokeColor}
                          strokeWidth={activeSw}
                          strokeDasharray={dashArray}
                          rx={2}
                        />
                        <rect
                          x={ann.x + 8}
                          y={ann.y - 11}
                          width={Math.max(88, Math.round(maxLineLen * (fs * 0.7) + 22))}
                          height={Math.max(19, lines.length * lineH + 4)}
                          fill="var(--flux-surface)"
                          stroke={strokeColor}
                          strokeWidth={Math.max(0.6, Number((annSw * 0.65).toFixed(2)))}
                          rx={2}
                        />
                        <text
                          x={ann.x + 16}
                          y={ann.y + 3}
                          fill={strokeColor}
                          fontSize={fs}
                          fontFamily={fontCss}
                          fontWeight={600}
                        >
                          {lines.map((line, li) => (
                            <tspan key={li} x={ann.x + 16} dy={li === 0 ? 0 : lineH}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    );
                  }

                  if (ann.kind === 'callout') {
                    const boxW = Math.max(90, ann.width - 6, Math.round(maxLineLen * (fs * 0.6) + 14));
                    const boxH = Math.max(17, lines.length * lineH + 4);
                    return (
                      <g
                        key={ann.id}
                        data-testid={`annotation-${ann.id}`}
                        onMouseDown={(e) => handleAnnotationDown(e, ann)}
                        className={annCls}
                      >
                        <circle
                          cx={ann.x}
                          cy={ann.y + ann.height}
                          r={Math.max(2.8, annSw * 1.6 + 1.2)}
                          fill={strokeColor}
                        />
                        <polyline
                          points={`${ann.x},${ann.y + ann.height} ${ann.x + 26},${ann.y + 18} ${ann.x + 26 + boxW + 6},${ann.y + 18}`}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={activeSw}
                          strokeDasharray={dashArray}
                        />
                        <rect
                          x={ann.x + 28}
                          y={ann.y}
                          width={boxW}
                          height={boxH}
                          fill="var(--flux-surface)"
                          fillOpacity={0.92}
                          stroke={selected ? strokeColor : 'none'}
                          strokeWidth={Math.max(0.6, Number((annSw * 0.7).toFixed(2)))}
                          strokeDasharray="3 2"
                        />
                        <text
                          x={ann.x + 32}
                          y={ann.y + 13}
                          fill={strokeColor}
                          fontSize={fs}
                          fontFamily={fontCss}
                          fontWeight={500}
                        >
                          {lines.map((line, li) => (
                            <tspan key={li} x={ann.x + 32} dy={li === 0 ? 0 : lineH}>
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    );
                  }

                  return (
                    <g
                      key={ann.id}
                      data-testid={`annotation-${ann.id}`}
                      onMouseDown={(e) => handleAnnotationDown(e, ann)}
                      className={annCls}
                    >
                      <rect
                        x={ann.x - 4}
                        y={ann.y - fs - 2}
                        width={Math.max(80, Math.round(maxLineLen * (fs * 0.6) + 14))}
                        height={Math.max(fs + 10, lines.length * lineH + 6)}
                        fill="var(--flux-surface)"
                        fillOpacity={0.85}
                        stroke={selected || annStyle !== 'solid' ? strokeColor : 'transparent'}
                        strokeWidth={activeSw}
                        strokeDasharray={dashArray || (selected ? '4 2' : undefined)}
                        rx={2}
                      />
                      <text
                        x={ann.x}
                        y={ann.y}
                        fill={strokeColor}
                        fontSize={fs}
                        fontFamily={fontCss}
                        fontWeight={500}
                      >
                        {lines.map((line, li) => (
                          <tspan key={li} x={ann.x} dy={li === 0 ? 0 : lineH}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* Wires */}
            {wiresVisible && (
              <g data-testid="layer-group-wires">
                {sheetWires.map((wire: E3Wire) => {
                  const selected = selectedWireIdSet.has(wire.id);
                  const pts = wire.waypoints.map((p) => `${p.x},${p.y}`).join(' ');
                  const color = selected
                    ? wiresLocked
                      ? '#d97706'
                      : 'var(--flux-accent)'
                    : vs.netColors[wire.signalType] || 'var(--flux-text)';
                  const midPt =
                    wireLabelMap.get(wire.id) ||
                    (wire.waypoints.length >= 2
                      ? {
                          x: Math.round((wire.waypoints[0].x + wire.waypoints[1].x) / 2),
                          y: Math.round((wire.waypoints[0].y + wire.waypoints[1].y) / 2),
                        }
                      : wire.waypoints[0]);
                  const wireArcs = crossingArcs.filter((a) => a.wireId === wire.id);
                  return (
                    <g
                      key={wire.id}
                      data-testid={`wire-${wire.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectWire(wire.id, { toggle: e.shiftKey });
                      }}
                      className="cursor-pointer"
                    >
                      <polyline points={pts} fill="none" stroke="transparent" strokeWidth={10} />
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={color}
                        strokeWidth={selected ? vs.wireWidth + 1.5 : vs.wireWidth}
                        strokeLinejoin="round"
                      />
                      {/* GOST Crossing Jump Bridges (Мостики при пересечении разных цепей) */}
                      {wireArcs.map((arc, ai) => (
                        <g key={`arc-${wire.id}-${ai}`} pointerEvents="none">
                          <line
                            x1={arc.x - 6}
                            y1={arc.y}
                            x2={arc.x + 6}
                            y2={arc.y}
                            stroke="var(--flux-surface)"
                            strokeWidth={Math.max(4, vs.wireWidth + 3)}
                          />
                          <path
                            d={`M ${arc.x - 6} ${arc.y} A 6 6 0 0 1 ${arc.x + 6} ${arc.y}`}
                            fill="none"
                            stroke={color}
                            strokeWidth={selected ? vs.wireWidth + 1.2 : vs.wireWidth}
                            strokeLinecap="round"
                          />
                        </g>
                      ))}
                      {vs.showWireNumbers && midPt && (() => {
                        const boxW = Math.max(24, wire.wireNumber.length * 6.2 + 8);
                        return (
                          <g transform={`translate(${midPt.x - boxW / 2}, ${midPt.y - 6})`}>
                            <rect
                              x={0}
                              y={-10}
                              width={boxW}
                              height={13}
                              rx={2}
                              fill="var(--flux-surface)"
                              opacity={0.92}
                            />
                            <text
                              x={boxW / 2}
                              y={0}
                              textAnchor="middle"
                              fill={color}
                              fontSize={9.5 * vs.fontScale}
                              fontFamily={fontCss}
                              fontWeight={500}
                            >
                              {wire.wireNumber}
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}

                {/* Electrical Junction Dots (T-nodes) */}
                {junctionDots.map((dot, idx) => (
                  <circle
                    key={`jdot-${idx}`}
                    data-testid={`junction-dot-${idx}`}
                    cx={dot.x}
                    cy={dot.y}
                    r={Math.max(2.6, Number((vs.wireWidth * 1.35 + 0.7).toFixed(2)))}
                    fill={vs.netColors[dot.signalType] || 'var(--flux-text)'}
                    pointerEvents="none"
                  />
                ))}

                {/* Live Rubber-band Wire Preview */}
                {wireStart && previewWirePoints && (
                  <polyline
                    data-testid="wire-preview-polyline"
                    points={previewWirePoints}
                    fill="none"
                    stroke="var(--flux-accent)"
                    strokeWidth={vs.wireWidth}
                    strokeDasharray="5 3"
                    pointerEvents="none"
                  />
                )}
              </g>
            )}

            {/* Devices */}
            {devicesVisible && (
              <g data-testid="layer-group-devices">
                {sheetDevices.slice(0, 1200).map((device) => (
                  <SchematicSymbol
                    key={device.id}
                    device={device}
                    selected={selectedDeviceIdSet.has(device.id)}
                    locked={devicesLocked}
                    wiresLocked={wiresLocked || !wiresVisible}
                    visual={vs}
                    wireStartPinKey={wireStart ? `${wireStart.deviceId}:${wireStart.pinId}` : null}
                    hoveredPinKey={
                      wireStart && hoveredPin ? `${hoveredPin.deviceId}:${hoveredPin.pinId}` : null
                    }
                    connectedPinKeys={connectedPinKeys}
                    onSelectDevice={handleSelectDeviceDown}
                    onPinClick={handlePinClick}
                    onPinHover={wireStart ? handlePinHover : undefined}
                  />
                ))}
              </g>
            )}

            {/* AutoCAD Window (blue solid) / Crossing (green dashed) Marquee Selection */}
            {selectionBox && (
              <rect
                data-testid="selection-marquee"
                data-mode={selectionBox.mode}
                x={selectionBox.x}
                y={selectionBox.y}
                width={selectionBox.width}
                height={selectionBox.height}
                fill={
                  selectionBox.mode === 'window'
                    ? 'rgba(37, 99, 235, 0.09)'
                    : 'rgba(22, 163, 74, 0.10)'
                }
                stroke={selectionBox.mode === 'window' ? '#2563eb' : '#16a34a'}
                strokeWidth={1.3 / Math.max(0.25, zoom)}
                strokeDasharray={
                  selectionBox.mode === 'crossing'
                    ? `${5 / Math.max(0.25, zoom)} ${3 / Math.max(0.25, zoom)}`
                    : undefined
                }
                pointerEvents="none"
              />
            )}

            {/* CAD Magnetic Alignment Guides, Pin Anchors & Spacing Cadence */}
            {activeSnapHud && (
              <g
                data-testid="smart-guides-layer"
                data-guide-count={activeSnapHud.guides.length}
                data-spacing-count={activeSnapHud.spacingGuides.length}
                data-snap-x={activeSnapHud.snappedXKind}
                data-snap-y={activeSnapHud.snappedYKind}
                pointerEvents="none"
              >
                {activeSnapHud.guides.map((g, gi) => {
                  const strokeColor =
                    g.kind === 'pin' ? '#10b981' : g.kind === 'center' ? '#0ea5e9' : '#0284c7';
                  const inv = 1 / Math.max(0.2, zoom);
                  const dash =
                    g.kind === 'center'
                      ? `${6 * inv} ${3 * inv} ${2 * inv} ${3 * inv}`
                      : `${4.5 * inv} ${3 * inv}`;
                  return (
                    <g key={`guide-${g.axis}-${g.coord}-${gi}`}>
                      {g.axis === 'x' ? (
                        <line
                          x1={g.coord}
                          y1={g.from}
                          x2={g.coord}
                          y2={g.to}
                          stroke={strokeColor}
                          strokeWidth={1.25 * inv}
                          strokeDasharray={dash}
                        />
                      ) : (
                        <line
                          x1={g.from}
                          y1={g.coord}
                          x2={g.to}
                          y2={g.coord}
                          stroke={strokeColor}
                          strokeWidth={1.25 * inv}
                          strokeDasharray={dash}
                        />
                      )}
                      {g.pinAnchor && (
                        <circle
                          cx={g.pinAnchor.x}
                          cy={g.pinAnchor.y}
                          r={4.5 * inv}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth={1.5 * inv}
                        />
                      )}
                    </g>
                  );
                })}

                {activeSnapHud.spacingGuides.map((sp, si) => {
                  const inv = 1 / Math.max(0.2, zoom);
                  const tick = 5 * inv;
                  const mid = Math.round((sp.start + sp.end) / 2);
                  const labelText = `${sp.gap} мм`;
                  const pillW = Math.max(38 * inv, labelText.length * 6.5 * inv + 10 * inv);
                  const pillH = 15 * inv;
                  return (
                    <g key={`sp-${sp.axis}-${si}`}>
                      {sp.axis === 'x' ? (
                        <>
                          <line
                            x1={sp.start}
                            y1={sp.crossCoord}
                            x2={sp.end}
                            y2={sp.crossCoord}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <line
                            x1={sp.start}
                            y1={sp.crossCoord - tick}
                            x2={sp.start}
                            y2={sp.crossCoord + tick}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <line
                            x1={sp.end}
                            y1={sp.crossCoord - tick}
                            x2={sp.end}
                            y2={sp.crossCoord + tick}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <rect
                            x={mid - pillW / 2}
                            y={sp.crossCoord - pillH / 2}
                            width={pillW}
                            height={pillH}
                            rx={2 * inv}
                            fill="var(--flux-surface)"
                            stroke="#d97706"
                            strokeWidth={0.9 * inv}
                          />
                          <text
                            x={mid}
                            y={sp.crossCoord + 3.2 * inv}
                            textAnchor="middle"
                            fill="#b45309"
                            fontSize={9.5 * inv}
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight={600}
                          >
                            {labelText}
                          </text>
                        </>
                      ) : (
                        <>
                          <line
                            x1={sp.crossCoord}
                            y1={sp.start}
                            x2={sp.crossCoord}
                            y2={sp.end}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <line
                            x1={sp.crossCoord - tick}
                            y1={sp.start}
                            x2={sp.crossCoord + tick}
                            y2={sp.start}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <line
                            x1={sp.crossCoord - tick}
                            y1={sp.end}
                            x2={sp.crossCoord + tick}
                            y2={sp.end}
                            stroke="#d97706"
                            strokeWidth={1.2 * inv}
                          />
                          <rect
                            x={sp.crossCoord - pillW / 2}
                            y={mid - pillH / 2}
                            width={pillW}
                            height={pillH}
                            rx={2 * inv}
                            fill="var(--flux-surface)"
                            stroke="#d97706"
                            strokeWidth={0.9 * inv}
                          />
                          <text
                            x={sp.crossCoord}
                            y={mid + 3.2 * inv}
                            textAnchor="middle"
                            fill="#b45309"
                            fontSize={9.5 * inv}
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight={600}
                          >
                            {labelText}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}

                {(() => {
                  const inv = 1 / Math.max(0.2, zoom);
                  const primaryGuide = activeSnapHud.guides[0];
                  const reason = activeSnapHud.altBypass
                    ? 'Alt: свободно'
                    : activeSnapHud.spacingGuides.length > 0
                      ? `Шаг ${activeSnapHud.spacingGuides[0].gap} мм`
                      : primaryGuide
                        ? primaryGuide.label
                        : activeSnapHud.snappedXKind === 'grid' || activeSnapHud.snappedYKind === 'grid'
                          ? `Сетка ${vs.gridSize} мм`
                          : '';
                  const hudText = reason
                    ? `X:${activeSnapHud.x} Y:${activeSnapHud.y} · ${reason}`
                    : `X:${activeSnapHud.x} Y:${activeSnapHud.y}`;
                  const boxW = Math.max(108 * inv, hudText.length * 6.1 * inv + 18 * inv);
                  const boxH = 18 * inv;
                  const maxBx = (sheet?.width || 1400) - boxW - 8;
                  const bx = Math.min(Math.max(8, activeSnapHud.x), Math.max(8, maxBx));
                  const by = Math.max(6, activeSnapHud.y - 23 * inv);
                  const accentStroke = activeSnapHud.altBypass
                    ? '#64748b'
                    : primaryGuide?.kind === 'pin'
                      ? '#10b981'
                      : activeSnapHud.spacingGuides.length > 0
                        ? '#d97706'
                        : '#0284c7';
                  return (
                    <g data-testid="snap-hud-badge">
                      <rect
                        x={bx}
                        y={by}
                        width={boxW}
                        height={boxH}
                        rx={2.5 * inv}
                        fill="var(--flux-surface)"
                        fillOpacity={0.96}
                        stroke={accentStroke}
                        strokeWidth={1 * inv}
                      />
                      <text
                        x={bx + 6 * inv}
                        y={by + 11.5 * inv}
                        fill="var(--flux-text)"
                        fontSize={9.5 * inv}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight={500}
                      >
                        {hudText}
                      </text>
                    </g>
                  );
                })()}
              </g>
            )}
          </g>
        </svg>
      </div>

      {/* Compact CAD Canvas Footer Strip */}
      <div className="no-print h-7 px-2 border-t border-[var(--flux-line)] bg-[var(--flux-surface)] flex items-center justify-between gap-2 shrink-0 overflow-hidden select-none text-[11px]">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden whitespace-nowrap font-mono tabular-nums text-[var(--flux-text-muted)]">
          <span data-testid="canvas-coords" className="shrink-0">
            X:{cursorWorld.x} Y:{cursorWorld.y}{isMultiViewport ? '' : ' мм'}
          </span>
          {sheet && !isMultiViewport && (
            <span className="hidden lg:inline truncate">
              · {sheet.format} ({sheet.width}×{sheet.height})
            </span>
          )}
          {totalSelectedCount > 1 && (
            <span
              data-testid="canvas-selection-count"
              className="inline-flex items-center h-5 px-1.5 rounded bg-[var(--flux-sel)] text-[var(--flux-accent)] font-sans font-semibold whitespace-nowrap shrink-0"
            >
              Выделено: {totalSelectedCount}
            </span>
          )}
          {(wireStart || tool !== 'select') && (
            <button
              type="button"
              data-testid="cancel-tool-btn"
              onClick={() => {
                if (wireStart) setWireStart(null);
                else onSetTool?.('select');
              }}
              className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-[var(--flux-accent-soft)] text-[var(--flux-accent)] hover:bg-[var(--flux-hover)] font-sans font-medium whitespace-nowrap shrink-0"
            >
              <span>{wireStart ? 'Укажите вывод' : `Режим: ${tool}`}</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onToggleGrid && (
            <button
              type="button"
              onClick={onToggleGrid}
              title="Показать/скрыть чертёжную сетку"
              aria-label="Переключить сетку"
              className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.showGrid
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Grid3X3 className={`w-3 h-3 ${vs.showGrid ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden md:inline'}>Сетка</span>
            </button>
          )}
          {onToggleSnapToGrid && (
            <button
              type="button"
              data-testid="toggle-snap-grid-btn"
              onClick={onToggleSnapToGrid}
              title="Привязка к чертёжной сетке"
              aria-label="Переключить привязку"
              className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.snapToGrid
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Magnet className={`w-3 h-3 ${vs.snapToGrid ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden md:inline'}>Привязка</span>
            </button>
          )}
          {onToggleSmartGuides && (
            <button
              type="button"
              data-testid="toggle-smart-guides-btn"
              onClick={onToggleSmartGuides}
              title="Магнитные направляющие выравнивания (удерживайте Alt при перетаскивании для свободного хода)"
              aria-label="Переключить магнитные направляющие"
              className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] transition-colors whitespace-nowrap shrink-0 ${
                vs.smartGuides !== false
                  ? 'bg-[var(--flux-sel)] text-[var(--flux-text)] font-medium'
                  : 'text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]'
              }`}
            >
              <Ruler className={`w-3 h-3 ${vs.smartGuides !== false ? 'text-[var(--flux-accent)]' : ''}`} />
              <span className={isMultiViewport ? 'hidden' : 'hidden md:inline'}>Направл.</span>
            </button>
          )}

          <span className="h-3.5 w-px bg-[var(--flux-line)] mx-0.5 shrink-0" aria-hidden="true" />

          <button
            type="button"
            onClick={() => onSetZoom(Math.max(0.16, Math.round((zoom - 0.1) * 100) / 100))}
            aria-label="Уменьшить масштаб холста"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="w-10 text-center font-mono tabular-nums text-[var(--flux-text)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onSetZoom(Math.min(2.5, Math.round((zoom + 0.1) * 100) / 100))}
            aria-label="Увеличить масштаб холста"
            className="inline-flex items-center justify-center w-5 h-5 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
          >
            <Plus className="w-3 h-3" />
          </button>
          {onFitViewport && (
            <button
              type="button"
              onClick={onFitViewport}
              title="Вписать лист в окно"
              aria-label="Вписать лист в окно"
              className="inline-flex items-center justify-center w-5 h-5 rounded text-[var(--flux-text-muted)] hover:text-[var(--flux-text)] hover:bg-[var(--flux-hover)]"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
