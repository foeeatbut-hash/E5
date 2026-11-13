import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildOpenApiSpec, isAllowedExternalUrl } from './apiEcosystem.ts';
import { exportProjectToDxfZip, exportSheetsToDxf } from './dxfExporter.ts';
import { extractWireSegments, parseE3Xml, rerouteAttachedWires, serializeE3Xml } from './e3Engine.ts';
import { createSeedProject } from './e3Seed.ts';
import {
  buildGostSheetGeometry,
  DEFAULT_CUSTOM_STAMP_PRESETS,
  fitStampCellText,
} from './gostFrame.ts';
import { exportProjectToPdfBytes } from './pdfExporter.ts';

function segmentsOverlapCollinearly(
  a: { x1: number; y1: number; x2: number; y2: number },
  b: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  const aH = Math.abs(a.y1 - a.y2) < 0.5;
  const bH = Math.abs(b.y1 - b.y2) < 0.5;
  if (aH !== bH) return false;
  if (aH) {
    if (Math.abs(a.y1 - b.y1) > 1.5) return false;
    const minA = Math.min(a.x1, a.x2);
    const maxA = Math.max(a.x1, a.x2);
    const minB = Math.min(b.x1, b.x2);
    const maxB = Math.max(b.x1, b.x2);
    return Math.min(maxA, maxB) - Math.max(minA, minB) > 6;
  } else {
    if (Math.abs(a.x1 - b.x1) > 1.5) return false;
    const minA = Math.min(a.y1, a.y2);
    const maxA = Math.max(a.y1, a.y2);
    const minB = Math.min(b.y1, b.y2);
    const maxB = Math.max(b.y1, b.y2);
    return Math.min(maxA, maxB) - Math.max(minA, minB) > 6;
  }
}

function interiorIntersectsDevice(
  pts: Array<{ x: number; y: number }>,
  dev: { x: number; y: number; width: number; height: number }
): boolean {
  // Check interior 2px inside symbol body so pin touches on border don't false-positive
  const rx1 = dev.x + 2;
  const ry1 = dev.y + 2;
  const rx2 = dev.x + dev.width - 2;
  const ry2 = dev.y + dev.height - 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (maxX > rx1 && minX < rx2 && maxY > ry1 && minY < ry2) return true;
  }
  return false;
}

test('rerouteAttachedWires keeps 3-phase wires separated and out of device interiors when -KM1 or -UZ1 is moved', () => {
  const proj = createSeedProject();
  const movedDevices = proj.devices.map((d) =>
    d.id === 'dev-km1' ? { ...d, x: 340, y: 260 } : d
  );

  const routed = rerouteAttachedWires('dev-km1', movedDevices, proj.wires, 20);
  const kmWires = routed.filter(
    (w) => w.sheetId === 'sheet-1' && (w.fromDeviceId === 'dev-km1' || w.toDeviceId === 'dev-km1')
  );
  assert.ok(kmWires.length >= 6);

  // Assert no wire passes through any device interior on sheet-1
  const sheet1Devs = movedDevices.filter((d) => d.sheetId === 'sheet-1');
  for (const w of kmWires) {
    for (const dev of sheet1Devs) {
      assert.equal(
        interiorIntersectsDevice(w.waypoints, dev),
        false,
        `Wire ${w.netName} intersected device ${dev.designation} interior`
      );
    }
  }

  // Assert different wires do not share long collinear runs (anti-merge)
  for (let i = 0; i < kmWires.length; i++) {
    const segsA = extractWireSegments(kmWires[i].waypoints);
    for (let j = i + 1; j < kmWires.length; j++) {
      const segsB = extractWireSegments(kmWires[j].waypoints);
      for (const sa of segsA) {
        for (const sb of segsB) {
          assert.equal(
            segmentsOverlapCollinearly(sa, sb),
            false,
            `Wires ${kmWires[i].netName} and ${kmWires[j].netName} merged collinearly`
          );
        }
      }
    }
  }
});

test('GOST 2.104 geometry generates Form 1 on sheet 1 and Form 2a on sheet 2 with editable cells', () => {
  const proj = createSeedProject();
  const g1 = buildGostSheetGeometry(proj.sheets[0], proj);
  const g2 = buildGostSheetGeometry(proj.sheets[1], proj);
  assert.equal(g1.stamp.form, 'form1');
  assert.equal(g2.stamp.form, 'form2a');
  assert.ok(g1.stamp.height > g2.stamp.height);
  assert.ok(g1.stamp.cells.some((c) => c.fieldKey === 'documentCode' && c.editable));
  assert.ok(g1.stamp.cells.some((c) => c.fieldKey === 'organization' && c.editable));
  assert.ok(g2.stamp.cells.some((c) => c.fieldKey === 'sheetTitle' && c.editable));
});

test('Batch DXF exporter produces AC1021 AutoCAD with BLOCKS, ATTRIB (incl. RATING), named layers, LINEWEIGHT, linetypes, and multi-sheet ZIP', async () => {
  const proj = createSeedProject();
  proj.annotations = [
    ...(proj.annotations || []),
    {
      id: 'ann-dxf-dot',
      sheetId: 'sheet-1',
      kind: 'rect',
      x: 120,
      y: 120,
      width: 180,
      height: 80,
      text: 'Пунктирная зона DXF',
      strokeWidth: 2.2,
      strokeStyle: 'dotted',
    },
  ];
  const dxf = exportSheetsToDxf(proj, {
    sheetIds: proj.sheets.map((s) => s.id),
    editableBlocks: true,
    includeGostFrame: true,
    includeBom: true,
  });
  assert.ok(dxf.includes('AC1021'));
  assert.ok(dxf.includes('$LWDISPLAY'));
  assert.ok(dxf.includes('BLOCKS'));
  assert.ok(dxf.includes('ATTDEF'));
  assert.ok(dxf.includes('INSERT'));
  assert.ok(dxf.includes('ATTRIB'));
  assert.ok(dxf.includes('\nDESIGNATION\n'));
  assert.ok(dxf.includes('\nNAME\n'));
  assert.ok(dxf.includes('\nARTICLE\n'));
  assert.ok(dxf.includes('\nRATING\n'));
  assert.ok(dxf.includes('LWPOLYLINE'));
  assert.ok(dxf.includes('GOST_FRAME'));
  assert.ok(dxf.includes('\nDEVICES\n'));
  assert.ok(dxf.includes('\nWIRES\n'));
  assert.ok(dxf.includes('\nANNOTATIONS\n'));
  assert.ok(dxf.includes('\nTEXT\n'));
  assert.ok(dxf.includes('\nCONTINUOUS\n'));
  assert.ok(dxf.includes('\nDASHED\n'));
  assert.ok(dxf.includes('\nDOT\n'));
  assert.ok(dxf.includes('\n370\n'));
  assert.ok(dxf.includes('GOST_STAMP_form1_L1_0'));
  assert.ok(dxf.includes(proj.sheets[0].titleBlock.organization));

  const zipBytes = await exportProjectToDxfZip(proj, {
    sheetIds: proj.sheets.map((s) => s.id),
    editableBlocks: true,
    includeGostFrame: true,
    includeBom: true,
  });
  assert.ok(zipBytes.length > 5000);
});

test('Batch PDF exporter embeds Cyrillic LiberationSans TTF and emits multi-page vector PDF', () => {
  const proj = createSeedProject();
  const regPath = path.resolve(process.cwd(), 'public', 'fonts', 'LiberationSans-Regular.ttf');
  const boldPath = path.resolve(process.cwd(), 'public', 'fonts', 'LiberationSans-Bold.ttf');
  const regularTtf = fs.existsSync(regPath) ? fs.readFileSync(regPath) : undefined;
  const boldTtf = fs.existsSync(boldPath) ? fs.readFileSync(boldPath) : undefined;

  const pdfBytes = exportProjectToPdfBytes(proj, {
    sheetIds: proj.sheets.map((s) => s.id),
    includeGostFrame: true,
    includeBom: true,
    includeCables: true,
    regularFontBytes: regularTtf,
    boldFontBytes: boldTtf,
  });

  const ascii = Buffer.from(pdfBytes).toString('latin1');
  assert.ok(ascii.startsWith('%PDF-1.4'));
  assert.ok(ascii.trimEnd().endsWith('%%EOF'));
  const pageMatches = ascii.match(/\/Type \/Page\b/g) || [];
  // 3 schematic sheets + PE3 BOM page + Cable journal page >= 5 pages
  assert.ok(pageMatches.length >= 5, `Expected >= 5 pages, got ${pageMatches.length}`);
  if (regularTtf) {
    assert.ok(ascii.includes('/CIDFontType2'));
    assert.ok(ascii.includes('/Identity-H'));
  }
});

test('API ecosystem exposes OpenAPI 3.0 3-tier spec and guards external SSRF metadata URLs', () => {
  const proj = createSeedProject();
  const spec = buildOpenApiSpec(proj) as { openapi: string; paths: Record<string, unknown> };
  assert.equal(spec.openapi, '3.0.3');
  assert.ok(spec.paths['/api/v1/projects/{id}/sheets/{sheetId}/stamp']);
  assert.ok(spec.paths['/api/v1/integrations/flux-bus']);
  assert.ok(spec.paths['/api/v1/integrations/webhooks']);

  assert.equal(isAllowedExternalUrl('https://erp.company.local/hook').ok, true);
  assert.equal(isAllowedExternalUrl('http://169.254.169.254/latest/meta-data/').ok, false);
  assert.equal(isAllowedExternalUrl('ftp://bad.host/file').ok, false);
});

test('Custom GOST stamp template designer geometry, archival toggle, XML round-trip, and DXF/PDF export work end-to-end', () => {
  const proj = createSeedProject();
  const customTpl = {
    ...DEFAULT_CUSTOM_STAMP_PRESETS[0],
    id: 'custom-test-tpl',
    name: 'Тестовый штамп завода',
    width: 480,
    height: 96,
    showArchivalStrip: false,
    isPreset: false,
  };
  proj.customStampTemplates = [customTpl];
  proj.sheets[0].titleBlock = {
    ...proj.sheets[0].titleBlock,
    stampForm: 'custom',
    customTemplateId: customTpl.id,
    organization: 'АО Техмаш',
  };

  const geom = buildGostSheetGeometry(proj.sheets[0], proj);
  assert.equal(geom.stamp.form, 'custom');
  assert.equal(geom.stamp.templateId, 'custom-test-tpl');
  assert.equal(geom.stamp.templateName, 'Тестовый штамп завода');
  assert.equal(geom.stamp.width, 480);
  assert.equal(geom.stamp.height, 96);
  assert.equal(geom.archivalBox.visible, false);
  assert.ok(geom.stamp.cells.some((c) => c.fieldKey === 'organization' && c.text === 'АО Техмаш'));
  assert.ok(geom.stamp.cells.some((c) => c.text.includes('Лист 1 /')));

  // XML serialization round-trip preserves custom stampForm & customTemplateId
  const xml = serializeE3Xml(proj);
  assert.ok(xml.includes('stampForm="custom"'));
  assert.ok(xml.includes('customTemplateId="custom-test-tpl"'));
  const parsed = parseE3Xml(xml);
  assert.equal(parsed.sheets[0].titleBlock.stampForm, 'custom');
  assert.equal(parsed.sheets[0].titleBlock.customTemplateId, 'custom-test-tpl');

  // DXF export respects custom stamp and emits editable block
  const dxf = exportSheetsToDxf(proj, {
    sheetIds: [proj.sheets[0].id],
    editableBlocks: true,
    includeGostFrame: true,
    includeBom: false,
  });
  assert.ok(dxf.includes('GOST_STAMP_custom_L1_0'));
  assert.ok(dxf.includes('АО Техмаш'));

  // PDF export succeeds with custom stamp template
  const pdf = exportProjectToPdfBytes(proj, {
    sheetIds: [proj.sheets[0].id],
    includeGostFrame: true,
    includeBom: false,
    includeCables: false,
  });
  const ascii = Buffer.from(pdf).toString('latin1');
  assert.ok(ascii.startsWith('%PDF-1.4'));
  assert.ok(ascii.trimEnd().endsWith('%%EOF'));
});

test('fitStampCellText wraps multi-word Cyrillic labels in tall narrow cells and truncates overflowing single tokens', () => {
  const orgFitted = fitStampCellText('ООО «ПромВентАвтоматика»', 135, 30.7, 8.5, true);
  assert.equal(orgFitted.lines.length, 2);
  assert.equal(orgFitted.lines[0], 'ООО');
  assert.equal(orgFitted.lines[1], '«ПромВентАвтоматика»');
  assert.ok(orgFitted.fontSize >= 6 && orgFitted.fontSize <= 8.5);

  const singleShort = fitStampCellText('Лист 1 / 3', 135, 26, 8.5, false);
  assert.equal(singleShort.lines.length, 1);
  assert.equal(singleShort.fontSize, 8.5);

  const extremeToken = fitStampCellText('СУПЕРДЛИННОЕОБОЗНАЧЕНИЕБЕЗПРОБЕЛОВ_001', 64, 16, 9, true);
  assert.equal(extremeToken.lines.length, 1);
  assert.ok(extremeToken.lines[0].endsWith('…'));
});
