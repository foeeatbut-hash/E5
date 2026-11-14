import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedProject } from './e3Seed.ts';
import { E3_CATALOG } from './e3Catalog.ts';
import {
  exportToFluxBridge,
  generateE3ComScript,
  importFromFluxBridge,
  parseE3Xml,
  serializeE3Xml,
} from './e3Engine.ts';
import { exportSheetsToDxf } from './dxfExporter.ts';
import { exportProjectToPdfBytes } from './pdfExporter.ts';
import type { CustomSymbolShape, E3Device, E3SymbolDef } from './e3Types.ts';
import {
  applyAttributeTemplate,
  describeSvgArcPath,
  duplicateCatalogItemAsCopy,
  duplicateSymbolDefAsCopy,
  extractBuiltInSymbolShapes,
  mirrorSymbolGeometryX,
  mirrorSymbolGeometryY,
  resolveDynamicSymbolText,
  resolveShapeStrokeDasharray,
  rotateSymbolGeometryCW,
  sampleArcPoints,
} from './symbolLibrary.ts';

test('extractBuiltInSymbolShapes generates editable vector primitives for core ECAD/HVAC categories', () => {
  const categories = ['breaker', 'fan', 'damper', 'valve', 'kip_circle', 'sensor'] as const;
  for (const cat of categories) {
    const shapes = extractBuiltInSymbolShapes(cat, 120, 140, `TEST_${cat.toUpperCase()}`, [
      { name: '1', dx: 30, dy: 0, direction: 'top' },
      { name: '2', dx: 90, dy: 0, direction: 'top' },
    ]);
    assert.ok(shapes.length >= (cat === 'valve' ? 3 : 4), `expected >= 3/4 primitives for ${cat}`);
  }
});

test('arc sampling, SVG arc path, stroke dasharray, and dynamic attribute text resolution', () => {
  const pts = sampleArcPoints(50, 50, 20, 0, 180, 16);
  assert.ok(pts.length >= 8);
  assert.ok(Math.abs(pts[0].x - 70) < 0.01);
  assert.ok(Math.abs(pts[pts.length - 1].x - 30) < 0.01);

  const path = describeSvgArcPath(50, 50, 20, 180, 360);
  assert.ok(path.startsWith('M '));
  assert.ok(path.includes(' A 20.00 20.00 '));

  assert.equal(resolveShapeStrokeDasharray({ kind: 'line', strokeStyle: 'dashed' }), '6 3');
  assert.equal(resolveShapeStrokeDasharray({ kind: 'line', strokeStyle: 'dashdot' }), '8 3 2 3');
  assert.equal(resolveShapeStrokeDasharray({ kind: 'line', strokeStyle: 'dotted' }), '2 3');
  assert.equal(resolveShapeStrokeDasharray({ kind: 'text', strokeStyle: 'dashed' }), undefined);

  const ctx = {
    designation: '-BT5',
    article: 'PT1000-420',
    componentName: 'Датчик Pt1000',
    manufacturer: 'Овен',
    attributes: [{ name: 'Степень защиты', value: 'IP65', owner: '', conflict: 'flux' as const }],
  };
  assert.equal(resolveDynamicSymbolText({ text: '{designation}', attrKey: 'designation' }, ctx), '-BT5');
  assert.equal(resolveDynamicSymbolText({ text: 'Тип: {article} / {attr:Степень защиты}' }, ctx), 'Тип: PT1000-420 / IP65');
});

test('attribute templates, geometry transforms (rotate/mirror), and copy-as-new cloning preserve independence', () => {
  const baseAttrs = [{ name: 'Напряжение', value: '380 В', owner: '', conflict: 'flux' as const }];
  const merged = applyAttributeTemplate(baseAttrs, 'power_switchgear', false);
  assert.ok(merged.some((a) => a.name === 'Номинальный ток'));
  assert.equal(merged.find((a) => a.name === 'Напряжение')?.value, '380 В');

  const shapes: CustomSymbolShape[] = [
    { id: 's1', kind: 'line', x1: 10, y1: 20, x2: 50, y2: 20 },
    { id: 's2', kind: 'arc', cx: 60, cy: 40, r: 15, startAngle: 0, endAngle: 90 },
  ];
  const pins = [{ name: '1', dx: 60, dy: 0, direction: 'top' as const, signalType: 'power' as const }];
  const rot = rotateSymbolGeometryCW(120, 100, shapes, pins);
  assert.equal(rot.width, 100);
  assert.equal(rot.height, 120);
  assert.equal(rot.pins[0].direction, 'right');

  const mirX = mirrorSymbolGeometryX(120, shapes, pins);
  assert.equal((mirX.shapes[0] as Extract<CustomSymbolShape, { kind: 'line' }>).x1, 110);
  const mirY = mirrorSymbolGeometryY(100, shapes, pins);
  assert.equal(mirY.pins[0].direction, 'bottom');

  const origSym: E3SymbolDef = {
    id: 'sym-orig',
    name: 'Исходное УГО',
    e3BlockName: 'E3_ORIG',
    category: 'relay',
    width: 120,
    height: 100,
    shapes,
    defaultPins: pins,
    isCustom: true,
  };
  const symCopy = duplicateSymbolDefAsCopy(origSym, 'Копия УГО', 'E3_COPY_BLK');
  assert.notEqual(symCopy.id, origSym.id);
  assert.equal(symCopy.e3BlockName, 'E3_COPY_BLK');
  assert.equal(symCopy.name, 'Копия УГО');

  const catCopy = duplicateCatalogItemAsCopy(E3_CATALOG[0], {
    componentName: 'Собственное изделие копия',
    article: 'CUSTOM-999',
    e3BlockName: symCopy.e3BlockName,
    symbolId: symCopy.id,
    shapes: symCopy.shapes,
    pins: symCopy.defaultPins,
  });
  assert.notEqual(catCopy.id, E3_CATALOG[0].id);
  assert.equal(catCopy.symbolId, symCopy.id);
  assert.equal(catCopy.article, 'CUSTOM-999');
});

test('bidirectional round-trip for custom polyline/arc/dashdot/attrKey symbols across E3 XML, Flux Bridge, COM VBS, DXF and PDF', () => {
  const proj = createSeedProject();
  const customShapes: CustomSymbolShape[] = [
    {
      id: 'sh-poly',
      kind: 'polyline',
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 90 },
        { x: 10, y: 90 },
      ],
      closed: true,
      filled: true,
      fillColor: '#e0f2fe',
      strokeColor: '#0284c7',
      strokeWidth: 2.2,
      strokeStyle: 'dashdot',
    },
    {
      id: 'sh-arc',
      kind: 'arc',
      cx: 60,
      cy: 50,
      r: 22,
      startAngle: 180,
      endAngle: 360,
      strokeColor: '#dc2626',
      strokeWidth: 2,
    },
    {
      id: 'sh-tag',
      kind: 'text',
      x: 60,
      y: 55,
      text: '{designation}',
      attrKey: 'designation',
      bold: true,
      fontSize: 11,
    },
  ];

  const symDef: E3SymbolDef = {
    id: 'sym-custom-rt',
    name: 'Тестовый блок ПЛК/КИП',
    e3BlockName: 'E3_RT_BLOCK',
    category: 'sensor',
    width: 120,
    height: 100,
    shapes: customShapes,
    defaultPins: [
      { name: '1', dx: 60, dy: 0, direction: 'top', signalType: 'dc24' },
      { name: '2', dx: 60, dy: 100, direction: 'bottom', signalType: 'signal' },
    ],
    isCustom: true,
  };

  const customDev: E3Device = {
    id: 'dev-rt-custom',
    elementId: 'el-rt-custom',
    designation: '-BT99',
    componentName: 'Датчик пользовательский УГО',
    article: 'CUSTOM-RT-99',
    manufacturer: 'ОВЕН',
    category: 'sensor',
    sheetId: proj.sheets[0].id,
    x: 420,
    y: 260,
    rotation: 0,
    width: 120,
    height: 100,
    symbolId: symDef.id,
    e3BlockName: symDef.e3BlockName,
    bindingState: 'PLACED',
    pins: [
      { id: 'dev-rt-p1', name: '1', dx: 60, dy: 0, direction: 'top', signalType: 'dc24' },
      { id: 'dev-rt-p2', name: '2', dx: 60, dy: 100, direction: 'bottom', signalType: 'signal' },
    ],
    customSymbol: { shapes: customShapes, showBodyBorder: false },
    attributes: [
      { name: 'Диапазон измерения', value: '0...100 °C', owner: '', conflict: 'flux' },
      { name: 'Степень защиты', value: 'IP65', owner: '', conflict: 'script' },
    ],
  };

  const richProj = {
    ...proj,
    symbolLibrary: [symDef],
    devices: [...proj.devices, customDev],
  };

  // 1. E3 XML round-trip
  const xml = serializeE3Xml(richProj);
  assert.ok(xml.includes('<SymbolLibrary>'));
  assert.ok(xml.includes('symbolId="sym-custom-rt"'));
  const parsedXml = parseE3Xml(xml);
  assert.equal(parsedXml.symbolLibrary?.length, 1);
  assert.equal(parsedXml.symbolLibrary?.[0].e3BlockName, 'E3_RT_BLOCK');
  const parsedDev = parsedXml.devices.find((d) => d.designation === '-BT99');
  assert.ok(parsedDev);
  assert.equal(parsedDev.symbolId, 'sym-custom-rt');
  assert.equal(parsedDev.customSymbol?.shapes.length, 3);
  assert.equal(parsedDev.customSymbol?.shapes[0].kind, 'polyline');
  assert.equal(parsedDev.customSymbol?.shapes[1].kind, 'arc');

  // 2. Flux Bridge round-trip
  const bridge = exportToFluxBridge(richProj);
  assert.equal(bridge.symbolLibrary?.length, 1);
  const importedFromBridge = importFromFluxBridge(
    {
      ...bridge,
      nodes: bridge.nodes.map((n) =>
        n.designation === '-BT99'
          ? {
              ...n,
              attrs: n.attrs.map((a) =>
                a.name === 'Наименование' ? { ...a, value: 'Датчик пользовательский УГО v2' } : a
              ),
            }
          : n
      ),
    },
    richProj
  );
  const bridgeDev = importedFromBridge.devices.find((d) => d.designation === '-BT99');
  assert.ok(bridgeDev?.customSymbol?.shapes.some((s) => s.kind === 'arc'));
  assert.equal(bridgeDev?.componentName, 'Датчик пользовательский УГО v2');

  // 3. E3.series COM VBScript bridge
  const vbs = generateE3ComScript(richProj);
  assert.ok(vbs.includes('FLUX_CUSTOM_SYMBOL'));
  assert.ok(vbs.includes('DrawCustomLine'));
  assert.ok(vbs.includes('DrawCustomCircle'));
  assert.ok(vbs.includes('DrawCustomText'));
  assert.ok(vbs.includes('-BT99'));
  assert.ok(vbs.includes('SafeSetDevAttr(Dev, "Диапазон измерения"'));

  // 4. AutoCAD DXF export (BLOCK + ARC + LWPOLYLINE + DASHDOT + resolved designation)
  const dxf = exportSheetsToDxf(richProj, { sheetIds: [proj.sheets[0].id] });
  assert.ok(dxf.includes('DASHDOT'));
  assert.ok(dxf.includes('LWPOLYLINE'));
  assert.ok(dxf.includes('\nARC\n') || dxf.includes('\r\nARC\r\n') || dxf.includes('\n0\nARC\n'));
  assert.ok(dxf.includes('-BT99'));

  // 5. PDF export
  const pdf = exportProjectToPdfBytes(richProj, { sheetIds: [proj.sheets[0].id] });
  const header = new TextDecoder().decode(pdf.slice(0, 8));
  assert.ok(header.startsWith('%PDF-1.4'));
  assert.ok(pdf.length > 2000);
});
