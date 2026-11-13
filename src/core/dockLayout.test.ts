import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampDockLayoutToViewport,
  clampDockSize,
  clampFloatingRect,
  computeViewportSheets,
  createDefaultDockLayout,
  deleteSheetFromProject,
  duplicateSheetInProject,
  getPanelsByDock,
  movePanelDock,
  resizeDockEdge,
  togglePanelCollapse,
  updateFloatingRect,
} from './dockLayout.ts';
import { createSeedProject } from './e3Seed.ts';

test('default dock layout places explorer left, inspector right, console bottom', () => {
  const layout = createDefaultDockLayout();
  assert.equal(layout.panels.explorer.dock, 'left');
  assert.equal(layout.panels.inspector.dock, 'right');
  assert.equal(layout.panels.console.dock, 'bottom');
  assert.equal(getPanelsByDock(layout, 'left').length, 1);
  assert.equal(getPanelsByDock(layout, 'floating').length, 0);
});

test('movePanelDock supports docking any panel to any border or floating', () => {
  let layout = createDefaultDockLayout();
  layout = movePanelDock(layout, 'inspector', 'left');
  assert.deepEqual(
    getPanelsByDock(layout, 'left').map((p) => p.id),
    ['explorer', 'inspector']
  );

  layout = movePanelDock(layout, 'console', 'floating', { x: 120, y: 180, width: 640, height: 300 });
  assert.equal(layout.panels.console.dock, 'floating');
  assert.equal(layout.panels.console.floating.width, 640);
  assert.equal(getPanelsByDock(layout, 'bottom').length, 0);
});

test('resizeDockEdge and clampFloatingRect keep geometry bounded within viewport', () => {
  let layout = createDefaultDockLayout();
  layout = resizeDockEdge(layout, 'left', 9999, 1440, 900);
  assert.ok(layout.sizes.left <= Math.round(1440 * 0.42));

  layout = resizeDockEdge(layout, 'bottom', 20, 1440, 900);
  assert.equal(layout.sizes.bottom, 120);

  const clamped = clampFloatingRect({ x: -100, y: 10, width: 120, height: 90 }, 1280, 800);
  assert.equal(clamped.width, 240);
  assert.equal(clamped.height, 160);
  assert.ok(clamped.x >= 8);
  assert.ok(clamped.y >= 40);

  layout = updateFloatingRect(layout, 'explorer', { x: 5000, y: 5000 }, 1280, 800);
  assert.ok(layout.panels.explorer.floating.x < 1280);
});

test('togglePanelCollapse toggles collapsed flag cleanly', () => {
  let layout = createDefaultDockLayout();
  assert.equal(layout.panels.console.collapsed, false);
  layout = togglePanelCollapse(layout, 'console');
  assert.equal(layout.panels.console.collapsed, true);
});

test('computeViewportSheets allocates 1, 2, 3, and 4 sheets cleanly', () => {
  const proj = createSeedProject();
  assert.ok(proj.sheets.length >= 3);

  const s1 = computeViewportSheets('single', proj.sheets, [], proj.sheets[0].id);
  assert.equal(s1.length, 1);

  const s2 = computeViewportSheets('two', proj.sheets, s1, proj.sheets[0].id);
  assert.equal(s2.length, 2);
  assert.notEqual(s2[0], s2[1]);

  const s3 = computeViewportSheets('three', proj.sheets, s2, proj.sheets[0].id);
  assert.equal(s3.length, 3);
  assert.equal(new Set(s3).size, 3);

  const s4 = computeViewportSheets('four', proj.sheets, s3, proj.sheets[0].id);
  assert.equal(s4.length, 4);
  // Seed has 3 sheets, so 4th wraps cleanly without throwing
  assert.ok(proj.sheets.some((sh) => sh.id === s4[3]));
});

test('duplicateSheetInProject and deleteSheetFromProject manage sheets safely', () => {
  const proj = createSeedProject();
  const initialCount = proj.sheets.length;
  const targetId = proj.sheets[0].id;

  const { nextProject, newSheetId } = duplicateSheetInProject(proj, targetId);
  assert.equal(nextProject.sheets.length, initialCount + 1);
  assert.ok(nextProject.devices.some((d) => d.sheetId === newSheetId));
  assert.ok(nextProject.wires.some((w) => w.sheetId === newSheetId));

  const deleted = deleteSheetFromProject(nextProject, newSheetId);
  assert.equal(deleted.nextProject.sheets.length, initialCount);
  assert.ok(!deleted.nextProject.devices.some((d) => d.sheetId === newSheetId));
});

test('clampDockSize enforces minimum width and height', () => {
  assert.equal(clampDockSize('right', 50, 1440, 900), 210);
  assert.equal(clampDockSize('top', 40, 1440, 900), 120);
});

test('clampDockLayoutToViewport guarantees right & left panels never clip off narrow viewports', () => {
  const base = createDefaultDockLayout();
  base.sizes.left = 420;
  base.sizes.right = 420;
  base.sizes.bottom = 420;

  for (const [vw, vh] of [
    [1024, 768],
    [1180, 760],
    [1440, 900],
  ] as const) {
    const clamped = clampDockLayoutToViewport(base, vw, vh);
    assert.ok(
      clamped.sizes.left + clamped.sizes.right <= vw - 280,
      `Expected center >= 280px at ${vw}x${vh}, got left=${clamped.sizes.left}, right=${clamped.sizes.right}`
    );
    assert.ok(clamped.sizes.bottom <= vh - 320);
  }
});
