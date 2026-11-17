import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSymbolDesignerPreset,
  normalizeCustomSymbolSpec,
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

test('normalizeCustomSymbolSpec preserves bounds up to 480 and shapes outside body box', () => {
  const result = normalizeCustomSymbolSpec(
    440,
    460,
    [
      { id: 'r1', kind: 'rect', x: -30, y: -20, width: 140, height: 80 },
      { id: 'c1', kind: 'circle', cx: 220, cy: 230, r: 210 },
      { id: 'l1', kind: 'line', x1: -15, y1: 10, x2: 470, y2: 475 },
      {
        id: 'p1',
        kind: 'polyline',
        points: [
          { x: -10, y: 0 },
          { x: 455, y: 465 },
        ],
      },
      { id: 'a1', kind: 'arc', cx: 450, cy: 20, r: 95, startAngle: 0, endAngle: 180 },
    ],
    [{ name: '1', dx: 0, dy: 20, direction: 'left', signalType: 'power' }]
  );

  assert.equal(result.width, 440);
  assert.equal(result.height, 460);
  assert.equal(result.customSymbol.shapes.length, 5);

  const rect = result.customSymbol.shapes[0];
  assert.equal(rect.kind, 'rect');
  assert.equal(rect.x, -30);
  assert.equal(rect.y, -20);

  const circle = result.customSymbol.shapes[1];
  assert.equal(circle.kind, 'circle');
  assert.equal(circle.r, 210);

  const line = result.customSymbol.shapes[2];
  assert.equal(line.kind, 'line');
  assert.equal(line.x1, -15);
  assert.equal(line.x2, 470);
  assert.equal(line.y2, 475);

  const poly = result.customSymbol.shapes[3];
  assert.equal(poly.kind, 'polyline');
  assert.deepEqual(poly.points, [
    { x: -10, y: 0 },
    { x: 455, y: 465 },
  ]);

  const arc = result.customSymbol.shapes[4];
  assert.equal(arc.kind, 'arc');
  assert.equal(arc.r, 95);
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
