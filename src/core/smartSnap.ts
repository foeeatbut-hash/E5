import type { E3Device, E3Pin, E3Sheet, E3Wire, PinDirection } from './e3Types.ts';

export type SnapAxisKind = 'pin' | 'center' | 'edge' | 'spacing' | 'grid' | 'free';

export interface AlignmentGuide {
  axis: 'x' | 'y';
  coord: number;
  from: number;
  to: number;
  kind: 'pin' | 'center' | 'edge';
  label: string;
  targetDesignations: string[];
  pinAnchor?: { x: number; y: number };
}

export interface SpacingGuide {
  axis: 'x' | 'y';
  start: number;
  end: number;
  crossCoord: number;
  gap: number;
}

export interface SmartSnapInput {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: 0 | 90 | 180 | 270;
  pins?: Array<Pick<E3Pin, 'id' | 'name' | 'dx' | 'dy' | 'direction'>>;
}

export interface SmartSnapOptions {
  gridSize: number;
  snapToGrid: boolean;
  magneticSnap: boolean;
  bypassAllSnap?: boolean;
  snapThreshold?: number;
  sheet?: Pick<E3Sheet, 'width' | 'height'>;
  wires?: E3Wire[];
}

export interface SmartSnapResult {
  x: number;
  y: number;
  snappedXKind: SnapAxisKind;
  snappedYKind: SnapAxisKind;
  guides: AlignmentGuide[];
  spacingGuides: SpacingGuide[];
}

export interface SnapRectEntity {
  id: string;
  designation: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: 0 | 90 | 180 | 270;
  pins?: Array<Pick<E3Pin, 'id' | 'name' | 'dx' | 'dy' | 'direction'>>;
}

function getLocalRotatedPinOffset(
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270,
  pin: Pick<E3Pin, 'dx' | 'dy' | 'direction'>
): { ox: number; oy: number; direction: PinDirection } {
  const cx = width / 2;
  const cy = height / 2;
  const lx = pin.dx - cx;
  const ly = pin.dy - cy;
  const dirs: PinDirection[] = ['top', 'right', 'bottom', 'left'];
  const idx = dirs.indexOf(pin.direction);
  const steps = ((rotation || 0) / 90) % 4;
  const rotatedDir = dirs[(idx + steps) % 4];

  let rx = lx;
  let ry = ly;
  if (steps === 1) {
    rx = -ly;
    ry = lx;
  } else if (steps === 2) {
    rx = -lx;
    ry = -ly;
  } else if (steps === 3) {
    rx = ly;
    ry = -lx;
  }

  return {
    ox: Math.round(cx + rx),
    oy: Math.round(cy + ry),
    direction: rotatedDir,
  };
}

interface AxisCandidate {
  value: number;
  dist: number;
  score: number;
  kind: 'pin' | 'center' | 'edge' | 'spacing';
  guide?: AlignmentGuide;
  spacing?: SpacingGuide[];
}

export function clampCoordToSheet(
  x: number,
  y: number,
  width: number,
  height: number,
  sheet?: Pick<E3Sheet, 'width' | 'height'>
): { x: number; y: number } {
  const minX = 28;
  const minY = 28;
  const maxX = sheet ? Math.max(minX, sheet.width - width - 16) : Math.max(minX, x);
  const maxY = sheet ? Math.max(minY, sheet.height - height - 16) : Math.max(minY, y);
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(x))),
    y: Math.min(maxY, Math.max(minY, Math.round(y))),
  };
}

export function snapScalarToGrid(val: number, gridSize: number, enabled: boolean): number {
  if (!enabled) return Math.round(val);
  const g = Math.max(5, Math.round(gridSize));
  return Math.round(val / g) * g;
}

export function computeSmartSnap(
  moving: SmartSnapInput,
  rawX: number,
  rawY: number,
  others: SnapRectEntity[],
  options: SmartSnapOptions
): SmartSnapResult {
  const clampedRaw = clampCoordToSheet(rawX, rawY, moving.width, moving.height, options.sheet);
  const rx = clampedRaw.x;
  const ry = clampedRaw.y;

  if (options.bypassAllSnap) {
    return {
      x: rx,
      y: ry,
      snappedXKind: 'free',
      snappedYKind: 'free',
      guides: [],
      spacingGuides: [],
    };
  }

  const gridSize = Math.max(5, Math.round(options.gridSize || 20));
  const threshold = Math.max(6, Math.min(22, options.snapThreshold ?? 12));

  if (!options.magneticSnap || others.length === 0) {
    const gx = snapScalarToGrid(rx, gridSize, options.snapToGrid);
    const gy = snapScalarToGrid(ry, gridSize, options.snapToGrid);
    const finalClamped = clampCoordToSheet(gx, gy, moving.width, moving.height, options.sheet);
    return {
      x: finalClamped.x,
      y: finalClamped.y,
      snappedXKind: options.snapToGrid ? 'grid' : 'free',
      snappedYKind: options.snapToGrid ? 'grid' : 'free',
      guides: [],
      spacingGuides: [],
    };
  }

  const connectedMap = new Set<string>();
  for (const w of options.wires || []) {
    if (w.fromDeviceId === moving.id) connectedMap.add(`${w.fromPinId}->${w.toDeviceId}:${w.toPinId}`);
    if (w.toDeviceId === moving.id) connectedMap.add(`${w.toPinId}->${w.fromDeviceId}:${w.fromPinId}`);
  }

  const movingRot = moving.rotation ?? 0;
  const movingPins = (moving.pins || []).map((pin) => ({
    pin,
    ...getLocalRotatedPinOffset(moving.width, moving.height, movingRot, pin),
  }));

  const xCandidates: AxisCandidate[] = [];
  const yCandidates: AxisCandidate[] = [];

  for (const other of others) {
    if (other.id === moving.id) continue;

    // 1. Edge & Center alignments (X axis)
    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oCenterX = Math.round(other.x + other.width / 2);

    const mSpanYFrom = Math.min(ry, other.y) - 16;
    const mSpanYTo = Math.max(ry + moving.height, other.y + other.height) + 16;

    const xAnchorPairs: Array<{
      targetX: number;
      nextX: number;
      kind: 'center' | 'edge';
      label: string;
    }> = [
      { targetX: oLeft, nextX: oLeft, kind: 'edge', label: `Левый край (${other.designation})` },
      { targetX: oRight, nextX: oRight - moving.width, kind: 'edge', label: `Правый край (${other.designation})` },
      { targetX: oCenterX, nextX: Math.round(oCenterX - moving.width / 2), kind: 'center', label: `Центр (${other.designation})` },
      { targetX: oRight, nextX: oRight, kind: 'edge', label: `Стык (${other.designation})` },
      { targetX: oLeft, nextX: oLeft - moving.width, kind: 'edge', label: `Стык (${other.designation})` },
    ];

    for (const ap of xAnchorPairs) {
      const dist = Math.abs(rx - ap.nextX);
      if (dist <= threshold) {
        const penalty = ap.kind === 'center' ? 1.8 : ap.label.startsWith('Стык') ? 3.2 : 2.5;
        xCandidates.push({
          value: ap.nextX,
          dist,
          score: dist + penalty,
          kind: ap.kind,
          guide: {
            axis: 'x',
            coord: ap.targetX,
            from: mSpanYFrom,
            to: mSpanYTo,
            kind: ap.kind,
            label: ap.label,
            targetDesignations: [other.designation],
          },
        });
      }
    }

    // 1b. Edge & Center alignments (Y axis)
    const oTop = other.y;
    const oBottom = other.y + other.height;
    const oCenterY = Math.round(other.y + other.height / 2);

    const mSpanXFrom = Math.min(rx, other.x) - 16;
    const mSpanXTo = Math.max(rx + moving.width, other.x + other.width) + 16;

    const yAnchorPairs: Array<{
      targetY: number;
      nextY: number;
      kind: 'center' | 'edge';
      label: string;
    }> = [
      { targetY: oTop, nextY: oTop, kind: 'edge', label: `Верх (${other.designation})` },
      { targetY: oBottom, nextY: oBottom - moving.height, kind: 'edge', label: `Низ (${other.designation})` },
      { targetY: oCenterY, nextY: Math.round(oCenterY - moving.height / 2), kind: 'center', label: `Ось (${other.designation})` },
      { targetY: oBottom, nextY: oBottom, kind: 'edge', label: `Стык (${other.designation})` },
      { targetY: oTop, nextY: oTop - moving.height, kind: 'edge', label: `Стык (${other.designation})` },
    ];

    for (const ap of yAnchorPairs) {
      const dist = Math.abs(ry - ap.nextY);
      if (dist <= threshold) {
        const penalty = ap.kind === 'center' ? 1.8 : ap.label.startsWith('Стык') ? 3.2 : 2.5;
        yCandidates.push({
          value: ap.nextY,
          dist,
          score: dist + penalty,
          kind: ap.kind,
          guide: {
            axis: 'y',
            coord: ap.targetY,
            from: mSpanXFrom,
            to: mSpanXTo,
            kind: ap.kind,
            label: ap.label,
            targetDesignations: [other.designation],
          },
        });
      }
    }

    // 2. Pin-to-Pin electrical wire straightening alignment
    if (movingPins.length > 0 && other.pins && other.pins.length > 0) {
      const otherRot = other.rotation ?? 0;
      for (const mp of movingPins) {
        for (const op of other.pins) {
          const oOff = getLocalRotatedPinOffset(other.width, other.height, otherRot, op);
          const targetPinX = other.x + oOff.ox;
          const targetPinY = other.y + oOff.oy;
          const isConnected = connectedMap.has(`${mp.pin.id}->${other.id}:${op.id}`);

          // Align X so vertical wire is straight
          const candX = targetPinX - mp.ox;
          const distX = Math.abs(rx - candX);
          if (distX <= threshold) {
            const penalty = isConnected ? 0 : 1.3;
            xCandidates.push({
              value: candX,
              dist: distX,
              score: distX + penalty,
              kind: 'pin',
              guide: {
                axis: 'x',
                coord: targetPinX,
                from: Math.min(ry + mp.oy, targetPinY) - 10,
                to: Math.max(ry + mp.oy, targetPinY) + 10,
                kind: 'pin',
                label: `Вывод ${mp.pin.name} ↔ ${other.designation}:${op.name}`,
                targetDesignations: [other.designation],
                pinAnchor: { x: targetPinX, y: targetPinY },
              },
            });
          }

          // Align Y so horizontal wire is straight
          const candY = targetPinY - mp.oy;
          const distY = Math.abs(ry - candY);
          if (distY <= threshold) {
            const penalty = isConnected ? 0 : 1.3;
            yCandidates.push({
              value: candY,
              dist: distY,
              score: distY + penalty,
              kind: 'pin',
              guide: {
                axis: 'y',
                coord: targetPinY,
                from: Math.min(rx + mp.ox, targetPinX) - 10,
                to: Math.max(rx + mp.ox, targetPinX) + 10,
                kind: 'pin',
                label: `Вывод ${mp.pin.name} ↔ ${other.designation}:${op.name}`,
                targetDesignations: [other.designation],
                pinAnchor: { x: targetPinX, y: targetPinY },
              },
            });
          }
        }
      }
    }
  }

  // 3. Equal spacing / cadence rhythm (row & column neighbors)
  const rowOthers = others
    .filter((o) => o.id !== moving.id && !(o.y + o.height < ry - 24 || o.y > ry + moving.height + 24))
    .sort((a, b) => a.x - b.x);

  for (let i = 0; i < rowOthers.length - 1; i++) {
    const a = rowOthers[i];
    const b = rowOthers[i + 1];
    const gap = Math.round(b.x - (a.x + a.width));
    if (gap >= 20 && gap <= 420) {
      const crossY = Math.round((Math.min(a.y + a.height, b.y + b.height, ry + moving.height) + Math.max(a.y, b.y, ry)) / 2);

      // Right of B matching gap
      const candRight = b.x + b.width + gap;
      const distR = Math.abs(rx - candRight);
      if (distR <= threshold) {
        xCandidates.push({
          value: candRight,
          dist: distR,
          score: distR + 2.2,
          kind: 'spacing',
          spacing: [
            { axis: 'x', start: a.x + a.width, end: b.x, crossCoord: crossY, gap },
            { axis: 'x', start: b.x + b.width, end: candRight, crossCoord: crossY, gap },
          ],
        });
      }

      // Left of A matching gap
      const candLeft = a.x - gap - moving.width;
      const distL = Math.abs(rx - candLeft);
      if (distL <= threshold) {
        xCandidates.push({
          value: candLeft,
          dist: distL,
          score: distL + 2.2,
          kind: 'spacing',
          spacing: [
            { axis: 'x', start: candLeft + moving.width, end: a.x, crossCoord: crossY, gap },
            { axis: 'x', start: a.x + a.width, end: b.x, crossCoord: crossY, gap },
          ],
        });
      }
    }
    // Centered equally between A and B
    const betweenSpace = b.x - (a.x + a.width);
    if (betweenSpace >= moving.width + 24) {
      const equalGap = Math.round((betweenSpace - moving.width) / 2);
      const candCenter = a.x + a.width + equalGap;
      const distC = Math.abs(rx - candCenter);
      if (distC <= threshold) {
        const crossY = Math.round((Math.min(a.y + a.height, b.y + b.height, ry + moving.height) + Math.max(a.y, b.y, ry)) / 2);
        xCandidates.push({
          value: candCenter,
          dist: distC,
          score: distC + 2.1,
          kind: 'spacing',
          spacing: [
            { axis: 'x', start: a.x + a.width, end: candCenter, crossCoord: crossY, gap: equalGap },
            {
              axis: 'x',
              start: candCenter + moving.width,
              end: b.x,
              crossCoord: crossY,
              gap: Math.round(b.x - (candCenter + moving.width)),
            },
          ],
        });
      }
    }
  }

  const colOthers = others
    .filter((o) => o.id !== moving.id && !(o.x + o.width < rx - 24 || o.x > rx + moving.width + 24))
    .sort((a, b) => a.y - b.y);

  for (let i = 0; i < colOthers.length - 1; i++) {
    const a = colOthers[i];
    const b = colOthers[i + 1];
    const gap = Math.round(b.y - (a.y + a.height));
    if (gap >= 20 && gap <= 420) {
      const crossX = Math.round((Math.min(a.x + a.width, b.x + b.width, rx + moving.width) + Math.max(a.x, b.x, rx)) / 2);

      const candBelow = b.y + b.height + gap;
      const distB = Math.abs(ry - candBelow);
      if (distB <= threshold) {
        yCandidates.push({
          value: candBelow,
          dist: distB,
          score: distB + 2.2,
          kind: 'spacing',
          spacing: [
            { axis: 'y', start: a.y + a.height, end: b.y, crossCoord: crossX, gap },
            { axis: 'y', start: b.y + b.height, end: candBelow, crossCoord: crossX, gap },
          ],
        });
      }

      const candAbove = a.y - gap - moving.height;
      const distA = Math.abs(ry - candAbove);
      if (distA <= threshold) {
        yCandidates.push({
          value: candAbove,
          dist: distA,
          score: distA + 2.2,
          kind: 'spacing',
          spacing: [
            { axis: 'y', start: candAbove + moving.height, end: a.y, crossCoord: crossX, gap },
            { axis: 'y', start: a.y + a.height, end: b.y, crossCoord: crossX, gap },
          ],
        });
      }
    }

    const betweenSpace = b.y - (a.y + a.height);
    if (betweenSpace >= moving.height + 24) {
      const equalGap = Math.round((betweenSpace - moving.height) / 2);
      const candCenter = a.y + a.height + equalGap;
      const distC = Math.abs(ry - candCenter);
      if (distC <= threshold) {
        const crossX = Math.round((Math.min(a.x + a.width, b.x + b.width, rx + moving.width) + Math.max(a.x, b.x, rx)) / 2);
        yCandidates.push({
          value: candCenter,
          dist: distC,
          score: distC + 2.1,
          kind: 'spacing',
          spacing: [
            { axis: 'y', start: a.y + a.height, end: candCenter, crossCoord: crossX, gap: equalGap },
            {
              axis: 'y',
              start: candCenter + moving.height,
              end: b.y,
              crossCoord: crossX,
              gap: Math.round(b.y - (candCenter + moving.height)),
            },
          ],
        });
      }
    }
  }

  xCandidates.sort((a, b) => a.score - b.score || a.dist - b.dist);
  yCandidates.sort((a, b) => a.score - b.score || a.dist - b.dist);

  const bestX = xCandidates[0];
  const bestY = yCandidates[0];

  const finalXRaw = bestX ? bestX.value : snapScalarToGrid(rx, gridSize, options.snapToGrid);
  const finalYRaw = bestY ? bestY.value : snapScalarToGrid(ry, gridSize, options.snapToGrid);
  const finalClamped = clampCoordToSheet(finalXRaw, finalYRaw, moving.width, moving.height, options.sheet);
  const finalX = finalClamped.x;
  const finalY = finalClamped.y;

  const snappedXKind: SnapAxisKind = bestX ? bestX.kind : options.snapToGrid ? 'grid' : 'free';
  const snappedYKind: SnapAxisKind = bestY ? bestY.kind : options.snapToGrid ? 'grid' : 'free';

  // Collect & merge all guides whose coordinate matches finalX / finalY cleanly
  const guideMap = new Map<string, AlignmentGuide>();
  const spacingGuides: SpacingGuide[] = [];

  const absorbCandidates = (list: AxisCandidate[], finalVal: number) => {
    for (const c of list) {
      if (Math.abs(c.value - finalVal) > 1) continue;
      if (c.guide) {
        const key = `${c.guide.axis}:${Math.round(c.guide.coord)}`;
        const existing = guideMap.get(key);
        if (!existing) {
          guideMap.set(key, { ...c.guide, targetDesignations: [...c.guide.targetDesignations] });
        } else {
          existing.from = Math.min(existing.from, c.guide.from);
          existing.to = Math.max(existing.to, c.guide.to);
          for (const des of c.guide.targetDesignations) {
            if (!existing.targetDesignations.includes(des)) {
              existing.targetDesignations.push(des);
            }
          }
          // Pin > Center > Edge priority for visual styling
          const rank = { pin: 0, center: 1, edge: 2 };
          if (rank[c.guide.kind] < rank[existing.kind]) {
            existing.kind = c.guide.kind;
            existing.label = c.guide.label;
            existing.pinAnchor = c.guide.pinAnchor;
          }
        }
      }
      if (c.spacing && spacingGuides.length < 4) {
        for (const sp of c.spacing) {
          if (
            !spacingGuides.some(
              (s) =>
                s.axis === sp.axis &&
                Math.abs(s.start - sp.start) <= 2 &&
                Math.abs(s.end - sp.end) <= 2
            )
          ) {
            spacingGuides.push(sp);
          }
        }
      }
    }
  };

  if (bestX) absorbCandidates(xCandidates, finalX);
  if (bestY) absorbCandidates(yCandidates, finalY);

  return {
    x: finalX,
    y: finalY,
    snappedXKind,
    snappedYKind,
    guides: Array.from(guideMap.values()),
    spacingGuides,
  };
}

/**
 * Finds the cleanest non-overlapping, grid-aligned spot inside the sheet frame
 * (avoiding existing devices and the GOST stamp box) when auto-placing a catalog item.
 */
export function findSmartCatalogSpot(
  item: { width: number; height: number },
  sheetDevices: E3Device[],
  sheet?: Pick<E3Sheet, 'width' | 'height'>,
  gridSize = 20
): { x: number; y: number } {
  const g = Math.max(10, Math.round(gridSize));
  const sheetW = sheet?.width || 1400;
  const sheetH = sheet?.height || 920;
  const marginLeft = 80;
  const marginTop = 80;
  const marginRight = sheetW - item.width - 50;
  const marginBottom = sheetH - item.height - 200; // keep clear of GOST stamp strip
  const pad = 28;

  const activeDevs = sheetDevices.filter((d) => d.bindingState !== 'REMOVED_IN_FLUX');
  const overlapsAny = (cx: number, cy: number) =>
    activeDevs.some(
      (d) =>
        cx < d.x + d.width + pad &&
        cx + item.width + pad > d.x &&
        cy < d.y + d.height + pad &&
        cy + item.height + pad > d.y
    );

  // 1. Try neat CAD row placement aligned to existing devices first, then column placement
  if (activeDevs.length > 0) {
    const ordered = [...activeDevs].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const anchor of ordered) {
      const rightX = snapScalarToGrid(anchor.x + anchor.width + 60, g, true);
      const sameRowY = snapScalarToGrid(anchor.y, g, true);
      if (rightX <= marginRight && sameRowY <= marginBottom && !overlapsAny(rightX, sameRowY)) {
        return { x: rightX, y: sameRowY };
      }
    }
    for (const anchor of ordered) {
      const belowY = snapScalarToGrid(anchor.y + anchor.height + 60, g, true);
      const sameColX = snapScalarToGrid(anchor.x, g, true);
      if (sameColX <= marginRight && belowY <= marginBottom && !overlapsAny(sameColX, belowY)) {
        return { x: sameColX, y: belowY };
      }
    }
  }

  // 2. Grid scan across clear schematic field
  const stepX = Math.max(g * 2, 40);
  const stepY = Math.max(g * 2, 40);
  for (let cy = marginTop; cy <= marginBottom; cy += stepY) {
    for (let cx = marginLeft; cx <= marginRight; cx += stepX) {
      const sx = snapScalarToGrid(cx, g, true);
      const sy = snapScalarToGrid(cy, g, true);
      if (!overlapsAny(sx, sy)) {
        return { x: sx, y: sy };
      }
    }
  }

  return {
    x: snapScalarToGrid(marginLeft + (activeDevs.length % 4) * 140, g, true),
    y: snapScalarToGrid(marginTop + Math.floor(activeDevs.length / 4) * 120, g, true),
  };
}
