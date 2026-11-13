import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAD_LAYER_DEFS,
  CAD_LAYER_ORDER,
  DEFAULT_CAD_LAYERS,
  canEditLayer,
  countSheetLayerEntities,
  isLayerLocked,
  isLayerVisible,
  mapDxfLayerFlags,
  resolveCadLayers,
  setAllLayersLocked,
  setAllLayersVisible,
  summarizeCadLayers,
  toggleLayerLock,
  toggleLayerVisibility,
} from './cadLayers.ts';
import { createSeedProject } from './e3Seed.ts';
import { parseE3Xml, serializeE3Xml } from './e3Engine.ts';
import { exportSheetsToDxf } from './dxfExporter.ts';

describe('cadLayers pure logic', () => {
  it('resolves default layers with all 4 CAD categories visible and unlocked', () => {
    const layers = resolveCadLayers(undefined);
    assert.deepEqual(layers, DEFAULT_CAD_LAYERS);
    assert.equal(CAD_LAYER_ORDER.length, 4);
    for (const id of CAD_LAYER_ORDER) {
      assert.equal(isLayerVisible(layers, id), true);
      assert.equal(isLayerLocked(layers, id), false);
      assert.equal(canEditLayer(layers, id), true);
      assert.ok(CAD_LAYER_DEFS[id].name.length > 0);
    }
  });

  it('toggles visibility and lock independently and computes editability', () => {
    let layers = resolveCadLayers(undefined);
    layers = toggleLayerVisibility(layers, 'wires');
    assert.equal(isLayerVisible(layers, 'wires'), false);
    assert.equal(isLayerLocked(layers, 'wires'), false);
    assert.equal(canEditLayer(layers, 'wires'), false);

    layers = toggleLayerLock(layers, 'devices');
    assert.equal(isLayerVisible(layers, 'devices'), true);
    assert.equal(isLayerLocked(layers, 'devices'), true);
    assert.equal(canEditLayer(layers, 'devices'), false);

    const summary = summarizeCadLayers(layers);
    assert.deepEqual(summary, {
      total: 4,
      visibleCount: 3,
      hiddenCount: 1,
      lockedCount: 1,
    });

    layers = setAllLayersVisible(layers, true);
    layers = setAllLayersLocked(layers, false);
    assert.deepEqual(summarizeCadLayers(layers), {
      total: 4,
      visibleCount: 4,
      hiddenCount: 0,
      lockedCount: 0,
    });
  });

  it('counts devices, wires, annotations and frame per sheet accurately', () => {
    const project = createSeedProject();
    const counts = countSheetLayerEntities(project, 'sheet-1');
    assert.equal(counts.devices, project.devices.filter((d) => d.sheetId === 'sheet-1').length);
    assert.equal(counts.wires, project.wires.filter((w) => w.sheetId === 'sheet-1').length);
    assert.equal(counts.frame, 1);
  });

  it('maps AutoCAD DXF layer flags (group 70 bit 4 lock and group 62 negative color off)', () => {
    let layers = resolveCadLayers(undefined);
    layers = toggleLayerVisibility(layers, 'wires');
    layers = toggleLayerLock(layers, 'devices');

    assert.deepEqual(mapDxfLayerFlags('E3_WIRES', layers, 1), { flags70: 0, color62: -1 });
    assert.deepEqual(mapDxfLayerFlags('E3_NETS', layers, 5), { flags70: 0, color62: -5 });
    assert.deepEqual(mapDxfLayerFlags('E3_DEVICES', layers, 3), { flags70: 4, color62: 3 });
    assert.deepEqual(mapDxfLayerFlags('E3_LABELS', layers, 7), { flags70: 4, color62: 7 });
    assert.deepEqual(mapDxfLayerFlags('E3_ANNOTATIONS', layers, 4), { flags70: 0, color62: 4 });
  });

  it('serializes and parses layer states in E3 XML round-trip and exports DXF layer flags', () => {
    const project = createSeedProject();
    let layers = resolveCadLayers(undefined);
    layers = toggleLayerVisibility(layers, 'annotations');
    layers = toggleLayerLock(layers, 'devices');
    project.layers = layers;

    const xml = serializeE3Xml(project);
    const parsed = parseE3Xml(xml);
    assert.equal(parsed.layers?.annotations.visible, false);
    assert.equal(parsed.layers?.annotations.locked, false);
    assert.equal(parsed.layers?.devices.visible, true);
    assert.equal(parsed.layers?.devices.locked, true);
    assert.equal(parsed.layers?.wires.visible, true);

    const dxf = exportSheetsToDxf(project, { sheetIds: ['sheet-1'] });
    assert.ok(dxf.includes('E3_ANNOTATIONS\n70\n0\n62\n-4'));
    assert.ok(dxf.includes('E3_DEVICES\n70\n4\n62\n3'));
  });
});
