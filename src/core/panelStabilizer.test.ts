import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {
  arePanelContainerPropsEqual,
  computePanelPixelFlexBasis,
  createRafCoordinateStabilizer,
  deepEqualProps,
  stabilizePanelCoordinates,
} from './panelStabilizer.ts';

test('deepEqualProps compares nested objects, arrays, and React elements deeply', () => {
  const fn = () => {};
  const elA = React.createElement('div', { id: 'explorer', meta: { count: 14, tags: ['A', 'B'] }, onClick: fn });
  const elB = React.createElement('div', { id: 'explorer', meta: { count: 14, tags: ['A', 'B'] }, onClick: fn });
  const elC = React.createElement('div', { id: 'explorer', meta: { count: 15, tags: ['A', 'B'] }, onClick: fn });

  assert.equal(deepEqualProps(elA, elB), true);
  assert.equal(deepEqualProps(elA, elC), false);

  const cyclicA: Record<string, unknown> = { a: 1 };
  cyclicA.self = cyclicA;
  const cyclicB: Record<string, unknown> = { a: 1 };
  cyclicB.self = cyclicB;
  assert.equal(deepEqualProps(cyclicA, cyclicB), true);
});

test('arePanelContainerPropsEqual skips re-render for cloned panel/child elements with unchanged data and catches real updates', () => {
  const onStartDrag = () => {};
  const onMoveDock = () => {};
  const onToggleCollapse = () => {};
  const sharedProject = { code: 'E3-01', devices: [{ id: 'd1' }] };

  const prev = {
    panel: {
      id: 'explorer',
      title: 'Проект и База',
      dock: 'left',
      order: 0,
      collapsed: false,
      floating: { x: 20, y: 80, width: 320, height: 480 },
    },
    edge: 'left',
    bandSize: 280,
    uiScale: 120,
    onStartDrag,
    onMoveDock,
    onToggleCollapse,
    children: React.createElement('section', { project: sharedProject, activeSheetId: 's1' }),
  };

  const nextSame = {
    panel: {
      id: 'explorer',
      title: 'Проект и База',
      dock: 'left',
      order: 0,
      collapsed: false,
      floating: { x: 20, y: 80, width: 320, height: 480 },
    },
    edge: 'left',
    bandSize: 280,
    uiScale: 120,
    onStartDrag,
    onMoveDock,
    onToggleCollapse,
    children: React.createElement('section', { project: sharedProject, activeSheetId: 's1' }),
  };

  const nextLogsChanged = {
    ...nextSame,
    children: React.createElement('section', { project: sharedProject, activeSheetId: 's2' }),
  };

  assert.equal(arePanelContainerPropsEqual(prev, nextSame), true);
  assert.equal(arePanelContainerPropsEqual(prev, nextLogsChanged), false);
});

test('stabilizePanelCoordinates snaps fractional subpixels and clamps inside bounds cleanly', () => {
  const res = stabilizePanelCoordinates(
    { x: 142.73, y: -4.2, width: 319.6, height: 480.4 },
    { minX: 8, maxX: 900, minY: 48, maxY: 600 }
  );
  assert.deepEqual(res, { x: 143, y: 48, width: 320, height: 480 });
});

test('computePanelPixelFlexBasis always yields explicit integer pixel basis sizes', () => {
  assert.equal(
    computePanelPixelFlexBasis({
      panelCollapsed: false,
      multiPanelInBand: false,
      bandSpanPx: 612,
      bandCrossPx: 260,
      collapsedSizePx: 24,
    }),
    612
  );
  assert.equal(
    computePanelPixelFlexBasis({
      panelCollapsed: true,
      multiPanelInBand: true,
      bandSpanPx: 600,
      bandCrossPx: 260,
      collapsedSizePx: 24,
      expandedCount: 1,
      collapsedCount: 1,
    }),
    24
  );
  assert.equal(
    computePanelPixelFlexBasis({
      panelCollapsed: false,
      multiPanelInBand: true,
      bandSpanPx: 600,
      bandCrossPx: 260,
      collapsedSizePx: 24,
      expandedCount: 2,
      collapsedCount: 1,
    }),
    288
  );
});

test('createRafCoordinateStabilizer coalesces bursts inside a single frame and cancels cleanly', () => {
  let nextRafId = 1;
  const queued = new Map<number, () => void>();
  const committed: Array<{ x: number; y: number }> = [];

  const stabilizer = createRafCoordinateStabilizer(
    (coords) => committed.push({ x: coords.x, y: coords.y }),
    (cb) => {
      const id = nextRafId++;
      queued.set(id, cb);
      return id;
    },
    (id) => {
      queued.delete(id);
    }
  );

  stabilizer.schedule({ x: 10.2, y: 20.8 });
  stabilizer.schedule({ x: 15.9, y: 31.4 });
  assert.equal(stabilizer.hasPending(), true);
  assert.equal(committed.length, 0);

  for (const [, cb] of queued) cb();
  assert.deepEqual(committed, [{ x: 16, y: 31 }]);
  assert.equal(stabilizer.hasPending(), false);

  stabilizer.schedule({ x: 16.1, y: 31.2 }); // identical integer px after stabilization
  for (const [, cb] of queued) cb();
  assert.equal(committed.length, 1);

  stabilizer.schedule({ x: 99, y: 88 });
  stabilizer.cancel();
  assert.equal(stabilizer.hasPending(), false);
});
