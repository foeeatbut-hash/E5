import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSymbolDesignerPreset,
  parseUgoBlockPayload,
  QUICK_SYMBOL_TEMPLATES,
  serializeUgoBlockPayload,
} from './symbolDesigner.ts';

test('QUICK_SYMBOL_TEMPLATES includes Contactor, Relay, Breaker, Terminal with valid GOST presets', () => {
  const labels = QUICK_SYMBOL_TEMPLATES.map((t) => t.label);
  assert.deepEqual(labels, ['Контактор', 'Реле', 'Автомат', 'Клемма']);

  for (const meta of QUICK_SYMBOL_TEMPLATES) {
    const preset = buildSymbolDesignerPreset(meta.id);
    assert.ok(preset.shapes.length >= 4, `${meta.label} should have vector geometry`);
    assert.ok(preset.pins.length >= 2, `${meta.label} should have at least 2 pins`);
    assert.equal(preset.category, meta.category);
    assert.equal(preset.defaultPrefix, meta.defaultPrefix);
  }
});

test('serializeUgoBlockPayload and parseUgoBlockPayload round-trip an independent .e3blk.json library block', () => {
  const preset = buildSymbolDesignerPreset('contactor');
  const payload = serializeUgoBlockPayload({
    name: 'Контактор КМИ-10910',
    componentName: 'Контактор 9А 24VDC',
    article: 'KMI-10910',
    manufacturer: 'IEK',
    e3BlockName: 'IEK_KMI_3P',
    defaultPrefix: 'KM',
    category: 'contactor',
    width: preset.width,
    height: preset.height,
    shapes: preset.shapes,
    pins: preset.pins,
    attributes: [{ name: 'Номинальный ток', value: '9 А', owner: '', conflict: 'flux' }],
  });

  const json = JSON.stringify(payload);
  const parsed = parseUgoBlockPayload(json);

  assert.equal(parsed.schema, 'e3promax-ugo-block/v1');
  assert.equal(parsed.name, 'Контактор КМИ-10910');
  assert.equal(parsed.e3BlockName, 'IEK_KMI_3P');
  assert.equal(parsed.defaultPrefix, 'KM');
  assert.equal(parsed.shapes.length, preset.shapes.length);
  assert.equal(parsed.pins.length, preset.pins.length);
  assert.equal(parsed.attributes.length, 1);

  assert.throws(() => parseUgoBlockPayload('{bad'), /JSON/i);
  assert.throws(() => parseUgoBlockPayload('{}'), /shapes/i);
});
