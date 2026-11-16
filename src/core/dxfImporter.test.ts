import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDxfToSymbolPrimitives } from './dxfImporter.ts';

const SAMPLE_DXF = [
  '0', 'SECTION',
  '2', 'ENTITIES',
  // Rectangle as closed LWPOLYLINE (0..100, 0..80 in CAD Y-up)
  '0', 'LWPOLYLINE',
  '8', 'DEVICES',
  '62', '3',
  '90', '4',
  '70', '1',
  '10', '0', '20', '0',
  '10', '100', '20', '0',
  '10', '100', '20', '80',
  '10', '0', '20', '80',
  // Diagonal contact LINE
  '0', 'LINE',
  '8', 'DEVICES',
  '6', 'DASHED',
  '62', '1',
  '10', '20', '20', '10',
  '11', '80', '21', '70',
  // Circle
  '0', 'CIRCLE',
  '8', 'DEVICES',
  '10', '50', '20', '40',
  '40', '15',
  // Arc (0..90 deg in CAD Y-up -> -90..0 deg in SVG Y-down)
  '0', 'ARC',
  '8', 'DEVICES',
  '10', '50', '20', '40',
  '40', '25',
  '50', '0',
  '51', '90',
  // MTEXT with formatting code
  '0', 'MTEXT',
  '8', 'TEXT',
  '10', '50', '20', '65',
  '40', '10',
  '1', '{\\fArial|b1;KM1}',
  '0', 'ENDSEC',
  '0', 'EOF',
].join('\n');

test('parseDxfToSymbolPrimitives imports rect, line, circle, arc (Y-flipped), and cleaned MTEXT', () => {
  const res = parseDxfToSymbolPrimitives(SAMPLE_DXF, { gridStep: 5, snapToGrid: true });

  assert.equal(res.stats.totalEntities, 5);
  assert.equal(res.stats.importedShapes, 5);
  assert.deepEqual(res.stats.layers.sort(), ['DEVICES', 'TEXT']);
  assert.ok(res.width >= 80 && res.width <= 160);
  assert.ok(res.height >= 60 && res.height <= 160);

  const rect = res.shapes.find((s) => s.kind === 'rect');
  assert.ok(rect && rect.kind === 'rect', '4-corner closed LWPOLYLINE converts to rect');
  assert.equal(rect.strokeColor, '#15803d');

  const line = res.shapes.find((s) => s.kind === 'line');
  assert.ok(line && line.kind === 'line');
  assert.equal(line.strokeColor, '#dc2626');
  assert.equal(line.strokeStyle, 'dashed');
  // In CAD, y1=10 < y2=70. After Y-flip, line.y1 should be greater than line.y2
  assert.ok(line.y1 > line.y2, 'Y-axis must flip from CAD Y-up to SVG Y-down');

  const circle = res.shapes.find((s) => s.kind === 'circle');
  assert.ok(circle && circle.kind === 'circle');
  assert.ok(circle.r > 5);

  const arc = res.shapes.find((s) => s.kind === 'arc');
  assert.ok(arc && arc.kind === 'arc');
  assert.equal(arc.startAngle, -90);
  assert.equal(arc.endAngle, 0);

  const text = res.shapes.find((s) => s.kind === 'text');
  assert.ok(text && text.kind === 'text');
  assert.equal(text.text, 'KM1');
});

test('parseDxfToSymbolPrimitives supports legacy POLYLINE/VERTEX/SEQEND and scales oversized CAD coordinates', () => {
  const largeDxf = [
    '0', 'SECTION',
    '2', 'ENTITIES',
    '0', 'POLYLINE',
    '8', '0',
    '70', '0',
    '0', 'VERTEX',
    '10', '1000', '20', '2000',
    '0', 'VERTEX',
    '10', '3000', '20', '2000',
    '0', 'VERTEX',
    '10', '3000', '20', '4000',
    '0', 'SEQEND',
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n');

  const res = parseDxfToSymbolPrimitives(largeDxf, { targetMaxSize: 140, gridStep: 5 });
  assert.equal(res.shapes.length, 1);
  assert.equal(res.shapes[0].kind, 'polyline');
  assert.ok(res.width <= 150 && res.height <= 150, 'Oversized 2000mm CAD geometry scales cleanly to UGO bounds');
});

test('parseDxfToSymbolPrimitives rejects empty or entity-less DXF with clear error', () => {
  assert.throws(() => parseDxfToSymbolPrimitives(''), /пуст/i);
  assert.throws(
    () => parseDxfToSymbolPrimitives('0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF'),
    /не обнаружено/i
  );
});
