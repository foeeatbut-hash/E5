import os from 'node:os';
import { cableEntryName } from './e3DbNames.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import JSZip from 'jszip';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  autoRouteOrthogonal,
  buildBom,
  buildCableJournal,
  buildNetWireLengths,
  buildTerminalPlan,
  calculateWireLengthMm,
  computeWireCrossingArcs,
  computeWireJunctionDots,
  encodeUtf16LeWithBom,
  exportBomCsv,
  exportCableJournalCsv,
  exportNetWireLengthsCsv,
  exportToDxf,
  exportToFluxBridge,
  exportVisualSettings,
  extractWireSegments,
  generateE3ComScript,
  generateStressBatch,
  generateWindowsBridgeCmd,
  getDeviceBounds,
  getSheetDrawableBounds,
  importFromFluxBridge,
  nextUniqueDesignation,
  parseE3BridgeSummary,
  applyE3FluxMeta,
  parseE3Xml,
  parseVisualSettings,
  rerouteAttachedWires,
  routeSheetWiresCleanly,
  runErc,
  serializeE3Xml,
} from './e3Engine';
import {
  buildOle2E3sContainer,
  isOle2Buffer,
  parseE3sInput,
  parseOle2Streams,
} from './e3SFormat';
import { createSeedProject } from './e3Seed';

test('bidirectional E3 XML round-trip preserves full model and visual settings', () => {
  const seed = createSeedProject();
  seed.visualSettings.wireWidth = 3;
  seed.visualSettings.netColors.power = '#dc2626';

  const xml = serializeE3Xml(seed);
  assert.ok(xml.includes('<E3Project'));
  assert.ok(xml.includes(seed.fluxProjectKey));

  const parsed = parseE3Xml(xml);
  assert.equal(parsed.id, seed.id);
  assert.equal(parsed.name, seed.name);
  assert.equal(parsed.fluxProjectKey, seed.fluxProjectKey);
  assert.equal(parsed.sheets.length, seed.sheets.length);
  assert.equal(parsed.devices.length, seed.devices.length);
  assert.equal(parsed.wires.length, seed.wires.length);
  assert.equal(parsed.cables.length, seed.cables.length);
  assert.equal(parsed.visualSettings.wireWidth, 3);
  assert.equal(parsed.visualSettings.netColors.power, '#dc2626');

  const qf1 = parsed.devices.find((d) => d.designation === '-QF1');
  assert.ok(qf1);
  assert.equal(qf1.article, 'A9F74325');
  assert.equal(qf1.pins.length, 6);
  assert.equal(qf1.attributes.length, 3);
});

test('Flux E3 Bridge bidirectional export/import preserves elementId and updates properties', () => {
  const seed = createSeedProject();
  const bundle = exportToFluxBridge(seed);
  assert.equal(bundle.format, 'flux-e3-bridge/v1');
  assert.equal(bundle.nodes.length, seed.devices.length);

  // Simulate edit in Flux (change designation & article)
  const target = bundle.nodes.find((n) => n.designation === '-M1');
  assert.ok(target);
  target.designation = '-M1.1';
  const artAttr = target.attrs.find((a) => a.name === 'Артикул');
  if (artAttr) artAttr.value = 'АИР112М4';

  const synced = importFromFluxBridge(bundle, seed);
  const updatedM1 = synced.devices.find((d) => d.elementId === target.elementId);
  assert.ok(updatedM1);
  assert.equal(updatedM1.designation, '-M1.1');
  assert.equal(updatedM1.article, 'АИР112М4');
});

test('BOM ПЭ3 groups identical components and excludes REMOVED_IN_FLUX', () => {
  const seed = createSeedProject();
  // Two Phoenix Contact UT 4 terminal blocks in seed (-XT1 and -XT2)
  const bom = buildBom(seed);
  const ut4 = bom.find((r) => r.article === 'UT 4');
  assert.ok(ut4);
  assert.equal(ut4.quantity, 2);
  assert.equal(ut4.designationText, '-XT1, -XT2');

  // Mark one removed in Flux
  const xt2 = seed.devices.find((d) => d.designation === '-XT2');
  assert.ok(xt2);
  xt2.bindingState = 'REMOVED_IN_FLUX';
  const bomAfter = buildBom(seed);
  const ut4After = bomAfter.find((r) => r.article === 'UT 4');
  assert.ok(ut4After);
  assert.equal(ut4After.quantity, 1);

  const csv = exportBomCsv(bomAfter);
  assert.ok(csv.includes('UT 4'));
  assert.ok(csv.includes('Phoenix Contact'));
});

test('Cable journal and terminal plan compute connected cores accurately', () => {
  const seed = createSeedProject();
  const cables = buildCableJournal(seed);
  const w2 = cables.find((c) => c.designation === '-W2');
  assert.ok(w2);
  assert.equal(w2.usedCores, 4);
  assert.equal(w2.coresCount, 4);

  const terminals = buildTerminalPlan(seed);
  assert.equal(terminals.length, 16); // 2 terminal blocks * 8 pins each
});

test('ERC catches duplicate designations and potential conflicts', () => {
  const seed = createSeedProject();
  // Duplicate designation
  const clone = structuredClone(seed.devices[0]);
  clone.id = 'dev-dup';
  clone.elementId = 'el-dup';
  seed.devices.push(clone);

  // Potential conflict wire: power -> pe
  seed.wires.push({
    id: 'w-bad',
    sheetId: 'sheet-1',
    netName: 'SHORT_PE',
    signalType: 'power',
    fromDeviceId: 'dev-qf1',
    fromPinId: 'p-qf1-2',
    toDeviceId: 'dev-m1',
    toPinId: 'p-m1-pe',
    waypoints: [
      { x: 260, y: 230 },
      { x: 630, y: 615 },
    ],
    crossSection: '2.5 мм²',
    wireNumber: 'ERR1',
  });

  const issues = runErc(seed);
  assert.ok(issues.some((i) => i.code === 'E3-DUP-DES' && i.severity === 'error'));
  assert.ok(issues.some((i) => i.code === 'E3-POTENTIAL-CONFLICT' && i.severity === 'error'));
});

test('Visual settings export/import and DXF generation work cleanly', () => {
  const seed = createSeedProject();
  seed.visualSettings.presetName = 'Цеховой тёмный профиль';
  seed.visualSettings.gridSize = 25;
  const exported = exportVisualSettings(seed.visualSettings);
  const restored = parseVisualSettings(exported);
  assert.equal(restored.presetName, 'Цеховой тёмный профиль');
  assert.equal(restored.gridSize, 25);

  const dxf = exportToDxf(seed, 'sheet-1');
  assert.ok(dxf.includes('ENTITIES'));
  assert.ok(dxf.includes('-QF1'));
  assert.ok(dxf.includes('EOF'));
});

test('Large dataset (1000 devices) builds BOM, ERC, and XML quickly', () => {
  const seed = createSeedProject();
  const t0 = performance.now();
  const large = generateStressBatch(seed, 1000);
  const bom = buildBom(large);
  const erc = runErc(large);
  const xml = serializeE3Xml(large);
  const elapsed = performance.now() - t0;

  assert.ok(large.devices.length >= 1010);
  assert.ok(bom.length >= 10);
  assert.ok(Array.isArray(erc));
  assert.ok(xml.length > 100_000);
  assert.ok(elapsed < 2000, `Expected < 2000ms, got ${elapsed}ms`);
});

test('OLE2 .e3s container writes valid CFB magic header and lossless round-trip restores full model', async () => {
  const seed = createSeedProject();
  seed.visualSettings.wireWidth = 3.5;
  seed.visualSettings.presetName = 'ГОСТ Цех №2';

  const container = buildOle2E3sContainer(seed);
  assert.equal(isOle2Buffer(container), true);
  assert.deepEqual(Array.from(container.subarray(0, 8)), [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

  const streams = parseOle2Streams(container);
  assert.deepEqual(
    streams.map((s) => s.name),
    ['E3Project', 'VisualSettings', 'FluxBridge']
  );

  const parsed = await parseE3sInput(container, 'ЩУ-ПВ1.e3s');
  assert.equal(parsed.sourceKind, 'e3s-ole2-lossless');
  assert.equal(parsed.project.id, seed.id);
  assert.equal(parsed.project.fluxProjectKey, seed.fluxProjectKey);
  assert.equal(parsed.project.sheets.length, seed.sheets.length);
  assert.equal(parsed.project.devices.length, seed.devices.length);
  assert.equal(parsed.project.wires.length, seed.wires.length);
  assert.equal(parsed.project.cables.length, seed.cables.length);
  assert.equal(parsed.project.visualSettings.wireWidth, 3.5);
  assert.equal(parsed.project.visualSettings.presetName, 'ГОСТ Цех №2');
});

test('Native binary OLE2 .e3s fallback extracts UTF-16LE device designations and Flux key', async () => {
  const seed = createSeedProject();
  const baseOle2 = new Uint8Array(buildOle2E3sContainer(seed));

  // Clear data sectors (starting at 512) and inject native UTF-16LE MFC stream strings
  baseOle2.fill(0, 512, 4608);
  const writeUtf16 = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      baseOle2[offset + i * 2] = code & 0xff;
      baseOle2[offset + i * 2 + 1] = (code >> 8) & 0xff;
    }
  };
  writeUtf16(512, '-QF99');
  writeUtf16(540, '-KM42');
  writeUtf16(570, 'FLUX_NATIVE_2026');

  // Rename 'E3Project' (9 UTF-16LE chars) to 'NativeE3S' in the OLE2 directory so it triggers native extraction
  const oldName = 'E3Project';
  const newName = 'NativeE3S';
  for (let i = 512; i < baseOle2.length - oldName.length * 2; i += 2) {
    let match = true;
    for (let j = 0; j < oldName.length; j++) {
      if (baseOle2[i + j * 2] !== oldName.charCodeAt(j) || baseOle2[i + j * 2 + 1] !== 0) {
        match = false;
        break;
      }
    }
    if (match) {
      writeUtf16(i, newName);
      break;
    }
  }

  const parsed = await parseE3sInput(baseOle2, 'native_zuken.e3s');
  assert.equal(parsed.sourceKind, 'e3s-ole2-native');
  assert.ok(parsed.discoveredStreams.includes('NativeE3S'));
  assert.equal(parsed.project.fluxProjectKey, 'FLUX_NATIVE_2026');
  assert.ok(parsed.project.devices.some((d) => d.designation === '-QF99'));
  assert.ok(parsed.project.devices.some((d) => d.designation === '-KM42'));
});

test('ZIP-packaged .e3s archive imports embedded E3 XML cleanly', async () => {
  const seed = createSeedProject();
  const zip = new JSZip();
  zip.file('model/E3Project.xml', serializeE3Xml(seed));
  const zipBytes = await zip.generateAsync({ type: 'uint8array' });

  const parsed = await parseE3sInput(zipBytes, 'packaged.e3s');
  assert.equal(parsed.sourceKind, 'e3s-zip');
  assert.equal(parsed.project.devices.length, seed.devices.length);
  assert.equal(parsed.project.wires.length, seed.wires.length);
});

test('E3.series 2022 COM VBScript embeds project sheets, 1-based graphics/wires, integer Sheet.Create args, Prj.Open, and SaveAs .e3s', () => {
  const seed = createSeedProject();
  const buildVbs = generateE3ComScript(seed, 'build');
  assert.ok(buildVbs.includes('CreateObject("CT.Application")'));
  assert.ok(buildVbs.includes(seed.fluxProjectKey));
  assert.ok(buildVbs.includes('"-QF1"'));
  assert.ok(buildVbs.includes('"A9F74325"'));
  assert.ok(buildVbs.includes('"-W2"'));
  assert.ok(buildVbs.includes('DrawDeviceBox'));
  assert.ok(buildVbs.includes('FinalizeIntegralDeviceGroup'));
  assert.ok(buildVbs.includes('g.CreateGroup('));
  assert.ok(buildVbs.includes('Function CreateOrPlaceFluxDevice('));
  assert.ok(buildVbs.includes('PlaceNativeSymbol('));
  assert.ok(buildVbs.includes('sm.PlaceBlock(shId, xMin, yMin, w, h)'));
  assert.ok(buildVbs.includes('sm.GetDevId()'));
  assert.ok(buildVbs.includes('Call d.SetName(des)'));
  assert.ok(buildVbs.includes('sm.PlaceBlock('));
  assert.ok(buildVbs.includes('Prj.CreatePinObject()'));
  assert.ok(buildVbs.includes('SafeSetGraphAttr'));
  assert.ok(buildVbs.includes('d.Create(des, "", "", cabType, "", 0)'));
  assert.ok(buildVbs.includes('DrawWireSeg'));
  assert.ok(buildVbs.includes('GetSheetBounds'));
  assert.ok(buildVbs.includes('MapX('));
  assert.ok(buildVbs.includes('MapY('));
  assert.ok(buildVbs.includes('Sheet.Display'));
  assert.ok(buildVbs.includes('WScript.Arguments.Named.Exists("silent")'));
  assert.ok(buildVbs.includes('flux_e3_com_debug.log'));
  assert.ok(buildVbs.includes('Sub LogTrace('));
  assert.ok(buildVbs.includes('Prj.SaveAs(targetE3s)'));
  assert.ok(buildVbs.includes('Call BuildNativeE3sProject()'));
  // Ensure Sheet.Create passes integer 0 for 'before' instead of empty string "" (Type Mismatch #13 fix)
  assert.ok(buildVbs.includes('sh.Create(0, e3Name, cand, 0, 0)'));
  // E3 отклоняет имена листов с пробелами: имя санитизируется, затем пробуется только номер листа
  assert.ok(buildVbs.includes('Function SafeSheetName('));
  assert.ok(buildVbs.includes('nameList = Array(SafeSheetName(shName), SheetNumberPart(shName))'));
  // Изделие ищется в БД компонентов E3 по ArticleNumber -> ENTRY
  assert.ok(buildVbs.includes('Function FindComponentEntry('));
  assert.ok(!buildVbs.includes('sh.Create(0, shName, cand, 0, "")'));
  // Ensure 1-based VBScript arrays for Zuken COM lines/wires
  assert.ok(buildVbs.includes('Dim xs(2), ys(2)'));
  assert.ok(buildVbs.includes('bx(5), by(5)'));
  assert.ok(buildVbs.includes('xs(1) = x1 : xs(2) = x2'));

  const exportVbs = generateE3ComScript(seed, 'export', 'D:\\Downloads\\ВЕЗА-ПВ1-Э3.001.e3s');
  assert.ok(exportVbs.includes('Call ExportActiveE3sToFluxJson()'));
  assert.ok(exportVbs.includes('ADODB.Stream'));
  assert.ok(exportVbs.includes('Prj.Open(gImportFilePath)'));
  assert.ok(exportVbs.includes('ВЕЗА-ПВ1-Э3.001.e3s'));
});

test('Native binary OLE2 .e3s with zlib-compressed Cyrillic/Latin designations unpacks via DecompressionStream', async () => {
  const seed = createSeedProject();
  const baseOle2 = new Uint8Array(buildOle2E3sContainer(seed));

  // Clear ALL data sectors (before directory sector) and write a zlib-deflated UTF-8/Latin payload
  const view = new DataView(baseOle2.buffer);
  const dirSector = view.getUint32(0x30, true);
  baseOle2.fill(0, 512, (1 + dirSector) * 512);
  const compressed = zlib.deflateSync(Buffer.from('HEADER\x00-Щ1\x00-QF12\x00-КМ3\x00FLUX_ZLIB_TEST\x00', 'utf8'));
  baseOle2.set(compressed, 512);

  // Rename 'E3Project' to 'NativeZip' in the OLE2 directory so it triggers native + zlib extraction
  const oldName = 'E3Project';
  const newName = 'NativeZip';
  const writeUtf16 = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      baseOle2[offset + i * 2] = code & 0xff;
      baseOle2[offset + i * 2 + 1] = (code >> 8) & 0xff;
    }
  };
  for (let i = 512; i < baseOle2.length - oldName.length * 2; i += 2) {
    let match = true;
    for (let j = 0; j < oldName.length; j++) {
      if (baseOle2[i + j * 2] !== oldName.charCodeAt(j) || baseOle2[i + j * 2 + 1] !== 0) {
        match = false;
        break;
      }
    }
    if (match) {
      writeUtf16(i, newName);
      break;
    }
  }

  const parsed = await parseE3sInput(baseOle2, 'ВЕЗА-ПВ1-Э3.001.e3s');
  assert.equal(parsed.sourceKind, 'e3s-ole2-native');
  assert.equal(parsed.project.fluxProjectKey, 'FLUX_ZLIB_TEST');
  assert.ok(parsed.project.devices.some((d) => d.designation === '-QF12'));
  assert.ok(parsed.project.devices.some((d) => d.designation === '-Щ1'));
  assert.ok(parsed.project.devices.some((d) => d.designation === '-КМ3'));
});

test('importFromFluxBridge replaces seed devices cleanly when fluxProjectKey differs or replaceAll is set', () => {
  const seed = createSeedProject();
  const imported = importFromFluxBridge(
    {
      format: 'flux-e3-bridge/v1',
      fluxProjectKey: 'EXTERNAL_E3_PROJECT_99',
      projectName: 'Внешний проект E3',
      exportedAt: new Date().toISOString(),
      revision: 1,
      visualSettings: seed.visualSettings,
      sheets: [
        {
          id: 's-ext-1',
          number: 1,
          name: 'Лист 1',
          format: 'A3',
          width: 1400,
          height: 920,
          titleBlock: {
            documentCode: 'EXT-001',
            organization: 'КБ',
            designer: 'Инженер',
            checker: '',
            sheetTitle: 'Лист 1',
          },
        },
      ],
      nodes: [
        {
          elementId: 'e3-dev-100',
          version: '1',
          tag: '',
          designation: '-QF10',
          status: 'one',
          solutionId: 'A9F74116',
          solutionName: 'Автомат E3 16A',
          rect: { x: 240, y: 240, width: 140, height: 110, rotation: 0, sheet: 's-ext-1' },
          attrs: [{ name: 'Артикул', value: 'A9F74116', owner: '' }],
          checked: true,
        },
      ],
      wires: [],
      cables: [],
    },
    seed
  );

  assert.equal(imported.fluxProjectKey, 'EXTERNAL_E3_PROJECT_99');
  assert.equal(imported.devices.length, 1);
  assert.equal(imported.devices[0].designation, '-QF10');
  assert.equal(imported.sheets.length, 1);
});

test('encodeUtf16LeWithBom writes BOM (FF FE), CRLF line endings, and clean Cyrillic UTF-16LE bytes', () => {
  const bytes = encodeUtf16LeWithBom("Привет\nE3");
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xfe);
  // Decode UTF-16LE payload after 2-byte BOM
  const decoded = new TextDecoder('utf-16le').decode(bytes.subarray(2));
  assert.equal(decoded, 'Привет\r\nE3');
});

test('generateWindowsBridgeCmd embeds server origin, polling/ack routes, connector.log, PS5.1 syntax, //U Unicode, and /silent execution', () => {
  const cmd = generateWindowsBridgeCmd('https://flux-e3.example.com/');
  assert.ok(cmd.includes("https://flux-e3.example.com"));
  assert.ok(!cmd.includes("https://flux-e3.example.com/"));
  assert.ok(cmd.includes('/api/v1/e3-bridge/poll?host='));
  assert.ok(cmd.includes('/api/v1/e3-bridge/ack'));
  assert.ok(cmd.includes('connector.log'));
  assert.ok(cmd.includes('flux_e3_com_debug.log'));
  assert.ok(cmd.includes('[Text.Encoding]::Unicode'));
  assert.ok(cmd.includes('[Console]::OutputEncoding = [Text.Encoding]::Unicode'));
  assert.ok(cmd.includes('cscript.exe //Nologo //U $vbs /silent'));
  assert.ok(!cmd.includes(" ? 'INFO' : "));
});

test('autoRouteOrthogonal builds direct 2-point segments for aligned pins and avoids obstacle boxes', () => {
  const direct = autoRouteOrthogonal(
    { x: 100, y: 200, direction: 'right' },
    { x: 300, y: 200, direction: 'left' }
  );
  assert.deepEqual(direct, [
    { x: 100, y: 200 },
    { x: 300, y: 200 },
  ]);

  // Obstacle sits directly between x=100 and x=300 on y=200
  const detoured = autoRouteOrthogonal(
    { x: 100, y: 200, direction: 'right' },
    { x: 300, y: 200, direction: 'left' },
    20,
    [{ x: 160, y: 150, width: 80, height: 100 }]
  );
  assert.ok(detoured.length > 2);
  // Ensure intermediate lane stays clear of y=[150..250]
  assert.ok(detoured.some((pt) => pt.y < 150 || pt.y > 250));
});

test('routeSheetWiresCleanly separates parallel trunks and XML round-trip keeps A2 + fontFamily', () => {
  const seed = createSeedProject();
  seed.sheets[0].format = 'A2';
  seed.visualSettings.fontFamily = 'JetBrains Mono';

  const routed = routeSheetWiresCleanly(seed.devices, seed.wires, 'sheet-1', 20);
  assert.equal(routed.length, seed.wires.length);

  const xml = serializeE3Xml(seed);
  const parsed = parseE3Xml(xml);
  assert.equal(parsed.sheets[0].format, 'A2');
  assert.equal(parsed.visualSettings.fontFamily, 'JetBrains Mono');
});

test('nextUniqueDesignation skips deleted gaps and avoids collisions', () => {
  const devices = [
    { designation: '-KM1' },
    { designation: '-KM3' },
    { designation: '-qf1' },
    { designation: '-QF2' },
  ];
  assert.equal(nextUniqueDesignation(devices, 'KM'), '-KM2');
  assert.equal(nextUniqueDesignation(devices, 'QF'), '-QF3');
  assert.equal(nextUniqueDesignation(devices, '-K'), '-K1');
});

test('GOST 2.104 stamp fields round-trip cleanly through E3 XML serialization', () => {
  const seed = createSeedProject();
  seed.sheets[0].titleBlock = {
    stampForm: 'form1',
    documentCode: 'ВЕЗА-ПВ1-Э3.001',
    projectTitle: 'Щит управления ПВ1',
    organization: 'ООО «ПромВентАвтоматика»',
    designer: 'Иванов А.С.',
    checker: 'Петров В.И.',
    techControl: 'Сидоров К.М.',
    normControl: 'Смирнова Е.Н.',
    approver: 'Кузнецов Д.А.',
    litera: 'Р',
    mass: '18 кг',
    scale: '1:1',
    date: '11.2026',
    invOriginal: 'ПВА-2026-01',
    invDuplicate: 'ДУБЛ-01',
    sheetTitle: 'Схема электрическая принципиальная',
  };
  seed.sheets[1].titleBlock.stampForm = 'form2a';

  const xml = serializeE3Xml(seed);
  const parsed = parseE3Xml(xml);
  assert.equal(parsed.sheets[0].titleBlock.stampForm, 'form1');
  assert.equal(parsed.sheets[0].titleBlock.techControl, 'Сидоров К.М.');
  assert.equal(parsed.sheets[0].titleBlock.normControl, 'Смирнова Е.Н.');
  assert.equal(parsed.sheets[0].titleBlock.approver, 'Кузнецов Д.А.');
  assert.equal(parsed.sheets[0].titleBlock.invOriginal, 'ПВА-2026-01');
  assert.equal(parsed.sheets[1].titleBlock.stampForm, 'form2a');
});

test('getDeviceBounds swaps width/height around center for 90/270 deg rotations and rerouteAttachedWires keeps orthogonality', () => {
  const dev = { id: 'd1', x: 200, y: 100, width: 120, height: 60, rotation: 90 as const };
  const b = getDeviceBounds(dev);
  assert.equal(b.x, 230);
  assert.equal(b.y, 70);
  assert.equal(b.width, 60);
  assert.equal(b.height, 120);

  const seed = createSeedProject();
  const qf1 = seed.devices.find((d) => d.designation === '-QF1')!;
  const rotatedDevices = seed.devices.map((d) =>
    d.id === qf1.id ? { ...d, rotation: 90 as const, x: d.x + 20, y: d.y + 40 } : d
  );
  const rerouted = rerouteAttachedWires(qf1.id, rotatedDevices, seed.wires, 20, seed.sheets);
  for (const w of rerouted.filter((x) => x.sheetId === qf1.sheetId)) {
    assert.ok(w.waypoints.length >= 2);
    for (let i = 0; i < w.waypoints.length - 1; i++) {
      const a = w.waypoints[i];
      const bPt = w.waypoints[i + 1];
      assert.ok(a.x === bPt.x || a.y === bPt.y, `Non-orthogonal segment in wire ${w.id}`);
    }
  }
});

test('routeSheetWiresCleanly prevents cross-net parallel overlap and stays inside GOST bounds outside stamp', () => {
  const seed = createSeedProject();
  // Shift -KM1 close to another column to stress-test multi-wire bundle anti-merging
  const shiftedDevices = seed.devices.map((d) =>
    d.designation === '-KM1' ? { ...d, x: d.x + 80, y: d.y + 40 } : d
  );
  const routed = routeSheetWiresCleanly(shiftedDevices, seed.wires, 'sheet-1', 20, seed.sheets);
  const sheet1Wires = routed.filter((w) => w.sheetId === 'sheet-1');
  const bounds = getSheetDrawableBounds(seed.sheets[0])!;
  const stamp = bounds.stampBox!;

  // Verify zero cross-net collinear overlap
  for (let i = 0; i < sheet1Wires.length; i++) {
    const segsA = extractWireSegments(sheet1Wires[i].waypoints, sheet1Wires[i].netName);
    for (const sA of segsA) {
      // Check intermediate points stay outside GOST stamp box
      const midX = (sA.x1 + sA.x2) / 2;
      const midY = (sA.y1 + sA.y2) / 2;
      const insideStamp =
        midX > stamp.x && midX < stamp.x + stamp.width && midY > stamp.y && midY < stamp.y + stamp.height;
      assert.equal(insideStamp, false, `Wire ${sheet1Wires[i].netName} crossed GOST stamp`);
    }
    for (let j = i + 1; j < sheet1Wires.length; j++) {
      if (sheet1Wires[i].netName === sheet1Wires[j].netName) continue;
      const segsB = extractWireSegments(sheet1Wires[j].waypoints, sheet1Wires[j].netName);
      for (const a of segsA) {
        const aH = a.y1 === a.y2;
        for (const b of segsB) {
          const bH = b.y1 === b.y2;
          if (aH && bH && Math.abs(a.y1 - b.y1) < 2) {
            const ov = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
            assert.ok(ov <= 1, `Horizontal overlap between ${sheet1Wires[i].netName} and ${sheet1Wires[j].netName}`);
          }
          if (!aH && !bH && Math.abs(a.x1 - b.x1) < 2) {
            const ov = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
            assert.ok(ov <= 1, `Vertical overlap between ${sheet1Wires[i].netName} and ${sheet1Wires[j].netName}`);
          }
        }
      }
    }
  }
});

test('computeWireJunctionDots and computeWireCrossingArcs distinguish T-taps from cross-net crossings', () => {
  const wires = [
    {
      id: 'w1',
      sheetId: 's1',
      netName: 'L1',
      signalType: 'power' as const,
      fromDeviceId: 'd1',
      fromPinId: 'p1',
      toDeviceId: 'd2',
      toPinId: 'p2',
      waypoints: [{ x: 100, y: 200 }, { x: 300, y: 200 }],
      crossSection: '2.5',
      wireNumber: 'L1',
    },
    {
      id: 'w2',
      sheetId: 's1',
      netName: 'L1',
      signalType: 'power' as const,
      fromDeviceId: 'd3',
      fromPinId: 'p1',
      toDeviceId: 'd1',
      toPinId: 'p1',
      waypoints: [{ x: 200, y: 200 }, { x: 200, y: 320 }],
      crossSection: '2.5',
      wireNumber: 'L1',
    },
    {
      id: 'w3',
      sheetId: 's1',
      netName: 'N',
      signalType: 'neutral' as const,
      fromDeviceId: 'd4',
      fromPinId: 'p1',
      toDeviceId: 'd5',
      toPinId: 'p1',
      waypoints: [{ x: 250, y: 120 }, { x: 250, y: 280 }],
      crossSection: '2.5',
      wireNumber: 'N',
    },
  ];

  const dots = computeWireJunctionDots(wires);
  assert.equal(dots.length, 1);
  assert.equal(dots[0].x, 200);
  assert.equal(dots[0].y, 200);

  const arcs = computeWireCrossingArcs(wires, dots);
  assert.equal(arcs.length, 1);
  assert.equal(arcs[0].x, 250);
  assert.equal(arcs[0].y, 200);
  assert.equal(arcs[0].wireId, 'w1');
});

test('XML round-trip preserves visual stroke thicknesses, crossing bridges, and annotation styles', () => {
  const seed = createSeedProject();
  seed.visualSettings.symbolStrokeWidth = 2.5;
  seed.visualSettings.wireWidth = 3.2;
  seed.visualSettings.frameStrokeWidth = 2.2;
  seed.visualSettings.annotationStrokeWidth = 1.8;
  seed.visualSettings.wireCrossingBridge = false;
  seed.annotations = [
    {
      id: 'ann-style-1',
      sheetId: 'sheet-1',
      kind: 'rect',
      x: 100,
      y: 100,
      width: 200,
      height: 120,
      text: 'Шкаф 1',
      fontSize: 13,
      color: '#dc2626',
      strokeWidth: 2.6,
      strokeStyle: 'dotted',
    },
  ];

  const xml = serializeE3Xml(seed);
  const parsed = parseE3Xml(xml);
  assert.equal(parsed.visualSettings.symbolStrokeWidth, 2.5);
  assert.equal(parsed.visualSettings.wireWidth, 3.2);
  assert.equal(parsed.visualSettings.frameStrokeWidth, 2.2);
  assert.equal(parsed.visualSettings.annotationStrokeWidth, 1.8);
  assert.equal(parsed.visualSettings.wireCrossingBridge, false);
  assert.equal(parsed.annotations?.length, 1);
  assert.equal(parsed.annotations?.[0].strokeWidth, 2.6);
  assert.equal(parsed.annotations?.[0].strokeStyle, 'dotted');
  assert.equal(parsed.annotations?.[0].color, '#dc2626');
});

test('calculateWireLengthMm computes multi-segment polyline length and pin-to-pin fallback', () => {
  const seed = createSeedProject();
  const devMap = new Map(seed.devices.map((d) => [d.id, d]));

  const multiSegWire = {
    ...seed.wires[0],
    waypoints: [
      { x: 100, y: 100 },
      { x: 100, y: 250 },
      { x: 300, y: 250 },
    ],
  };
  assert.equal(calculateWireLengthMm(multiSegWire, devMap), 350);

  const diagWire = {
    ...seed.wires[0],
    waypoints: [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
    ],
  };
  assert.equal(calculateWireLengthMm(diagWire, devMap), 50);

  const fallbackWire = {
    ...seed.wires[0],
    waypoints: [],
  };
  assert.ok(calculateWireLengthMm(fallbackWire, devMap) > 0);
});

test('buildNetWireLengths and buildCableJournal aggregate wire lengths per net accurately', () => {
  const seed = createSeedProject();
  const netRows = buildNetWireLengths(seed);
  assert.ok(netRows.length > 0);

  const l11 = netRows.find((r) => r.netName === 'L1.1');
  assert.ok(l11, 'Expected net L1.1 in seed project');
  assert.equal(l11.wireCount, 1);
  assert.equal(l11.totalLengthMm, 90);
  assert.equal(l11.totalLengthMeters, 0.09);

  // Add a second wire to net L1.1 to verify multi-wire net summation
  seed.wires.push({
    id: 'w-extra-l11',
    sheetId: 'sheet-1',
    netName: 'L1.1',
    signalType: 'power',
    fromDeviceId: 'dev-qf1',
    fromPinId: '2',
    toDeviceId: 'dev-km1',
    toPinId: '1',
    waypoints: [
      { x: 100, y: 100 },
      { x: 250, y: 100 },
      { x: 250, y: 160 },
    ],
    crossSection: '2.5',
    wireNumber: 'L1.1b',
    cableId: seed.cables[0]?.id,
  });

  const updatedNets = buildNetWireLengths(seed);
  const updatedL11 = updatedNets.find((r) => r.netName === 'L1.1');
  assert.ok(updatedL11);
  assert.equal(updatedL11.wireCount, 2);
  assert.equal(updatedL11.totalLengthMm, 90 + 210);
  assert.equal(updatedL11.totalLengthMeters, 0.3);
  assert.ok(updatedL11.cableDesignations.includes(seed.cables[0].designation));
  assert.ok(updatedL11.wireNumbers.includes('L1.1b'));

  const cableRows = buildCableJournal(seed);
  const firstCable = cableRows[0];
  assert.ok(firstCable);
  assert.ok((firstCable.wireLengthMm ?? 0) >= 210);
  assert.ok(firstCable.netLengths?.some((nl) => nl.netName === 'L1.1' && nl.lengthMm >= 210));

  const cableCsv = exportCableJournalCsv(cableRows, updatedNets);
  assert.ok(cableCsv.includes('Длина по схеме, мм'));
  assert.ok(cableCsv.includes('Цепь (Net)'));
  assert.ok(cableCsv.includes('Сумм. длина, мм'));

  const netCsv = exportNetWireLengthsCsv(updatedNets);
  assert.ok(netCsv.includes('L1.1'));
  assert.ok(netCsv.includes('300'));
});

test('showCrosshair setting persists through XML and JSON visual settings round-trip', () => {
  const seed = createSeedProject();
  assert.equal(seed.visualSettings.showCrosshair, true);

  seed.visualSettings.showCrosshair = false;
  const xml = serializeE3Xml(seed);
  const parsedXml = parseE3Xml(xml);
  assert.equal(parsedXml.visualSettings.showCrosshair, false);

  const json = exportVisualSettings(seed.visualSettings);
  const parsedJson = parseVisualSettings(json);
  assert.equal(parsedJson.showCrosshair, false);

  seed.visualSettings.showCrosshair = true;
  const parsedTrue = parseE3Xml(serializeE3Xml(seed));
  assert.equal(parsedTrue.visualSettings.showCrosshair, true);
});




// ---------------------------------------------------------------------------
// generateE3ComScript: расширенное покрытие нового генератора VBScript
// ---------------------------------------------------------------------------

function createRichScriptProject() {
  const p = createSeedProject();
  const sh = p.sheets[0].id;
  p.annotations = [
    { id: 'a1', sheetId: sh, kind: 'bom_table', x: 900, y: 500, width: 610, height: 200, text: '' },
    { id: 'a2', sheetId: sh, kind: 'cable_table', x: 100, y: 600, width: 570, height: 150, text: '' },
    { id: 'a3', sheetId: sh, kind: 'callout', x: 300, y: 100, width: 80, height: 60, text: 'Узел "А"' },
    { id: 'a4', sheetId: sh, kind: 'rect', x: 50, y: 50, width: 200, height: 100, text: 'Шкаф' },
    { id: 'a5', sheetId: sh, kind: 'text', x: 60, y: 30, width: 100, height: 20, text: 'Примечание' },
  ] as any;
  const d0 = p.devices[0];
  d0.customSymbol = {
    shapes: [
      { id: 's1', kind: 'rect', x: 0, y: 0, width: 40, height: 20, filled: true, fillColor: '#dc2626' },
      { id: 's2', kind: 'polyline', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 20 }], closed: true, filled: true },
      { id: 's3', kind: 'circle', cx: 20, cy: 10, r: 5, filled: true },
    ],
  } as any;
  d0.attributes.push(
    { name: 'Ток', value: '16', owner: d0.pins[0].name, conflict: 'flux' } as any,
    { name: 'Цвет', value: 'серый', owner: '#1', conflict: 'flux' } as any,
    { name: 'СлужебныйАтрибут', value: 'secret', owner: '', conflict: 'flux', service: true } as any
  );
  p.devices.push({ ...structuredClone(p.devices[1]), id: 'io1', elementId: 'el-io1', designation: '-A9', category: 'io_matrix' } as any);
  return p;
}

test('COM script: devId is read after PlaceBlock, with two-mode device creation and guarded pin ticks', () => {
  const vbs = generateE3ComScript(createSeedProject(), 'build');
  assert.ok(vbs.includes('devId = sm.GetDevId()'));
  assert.ok(vbs.includes('FindNewDeviceId(p)'));
  assert.ok(/curDevId = CreateOrPlaceFluxDevice\(Prj, Dev, Sym, shId_1, [^\n]*, 0, "-QF1", [^\n]*, curMode\)/.test(vbs));
  assert.ok(vbs.includes('If curMode = 1 Or curMode = 3 Then'));
  assert.ok(vbs.includes('Call CollectDevicePinPositions(Dev, PinObj, curDevId, "-QF1"'));
  assert.ok(vbs.includes('SafeCreateDevicePin(Prj, PinObj, curDevId, curMode, shId_1, "-QF1", "1/L1"'));
  assert.ok(vbs.includes('If Not pinOk(1) Then Call DrawPinTickGrouped('));
});

test('COM script: rectangle is normalized and rotated devices use getDeviceBounds (swapped w/h)', () => {
  const seed = createSeedProject();
  const dev = seed.devices[0];
  dev.rotation = 90;
  const b = getDeviceBounds(dev);
  assert.notEqual(b.width, dev.width);
  const sh = seed.sheets.find((s) => s.id === dev.sheetId)!;
  const vbs = generateE3ComScript(seed, 'build');
  assert.ok(vbs.includes('Sub NormRect('));
  assert.ok(vbs.includes('Call NormRect(x1, y1, x2, y2, xMin, yMin, xMax, yMax)'));
  const line = vbs.split('\n').find((l) => l.includes('CreateOrPlaceFluxDevice(Prj') && l.includes(`"${dev.designation}"`))!;
  assert.ok(line);
  const num = (n: number) => String(n);
  const expected = [
    `MapX(shX1_1, shX2_1, ${num(b.x)}, ${sh.width})`,
    `MapY(shY1_1, shY2_1, ${num(b.y + b.height)}, ${sh.height})`,
    `MapX(shX1_1, shX2_1, ${num(b.x + b.width)}, ${sh.width})`,
    `MapY(shY1_1, shY2_1, ${num(b.y)}, ${sh.height})`,
  ];
  for (const e of expected) assert.ok(line.includes(e), `missing ${e} in ${line}`);
  // Flux rotates clockwise, E3 counter-clockwise: 90 -> 270
  assert.ok(line.includes(`, 270, "${dev.designation}"`));
});

test('COM script: attribute errors are captured; pin-owned attrs go to pins, others to device; service attrs excluded', () => {
  const vbs = generateE3ComScript(createRichScriptProject(), 'build');
  assert.ok(vbs.includes('Function SafeSetObjAttr('));
  assert.ok(vbs.includes('Sub RegisterAttrWarn('));
  assert.ok(vbs.includes('attrWarnCnt = attrWarnCnt + 1'));
  assert.ok(vbs.includes("Не удалось записать атрибут '"));
  assert.ok(vbs.includes('Код ошибки: '));
  assert.ok(vbs.includes('Call SafeSetPinAttr(Dev, PinObj, curDevId, "1/L1", "Ток", "16", "-QF1")'));
  assert.ok(vbs.includes('Call SafeSetDevAttr(Dev, curDevId, "[#1] Цвет", "серый", "-QF1")'));
  // service attrs are never written as E3 attributes (they may only live in the fluxMeta JSON)
  assert.ok(!vbs.split('\n').some((l) => /SafeSet(Dev|Pin)Attr\(/.test(l) && l.includes('СлужебныйАтрибут')));
});

test('COM script: sheet stamp attributes are written only when non-empty and unused start sheets are removed', () => {
  const seed = createSeedProject();
  const sheet = seed.sheets[0];
  sheet.titleBlock.designer = '';
  const vbs = generateE3ComScript(seed, 'build');
  const pre = 'Call SafeSetSheetAttr(Sheet, shId_1,';
  assert.ok(vbs.includes(`${pre} "1. ${sheet.name}", "Обозначение", "${sheet.titleBlock.documentCode}")`));
  assert.ok(vbs.includes(`${pre} "1. ${sheet.name}", "Проверил",`));
  assert.ok(vbs.includes(`${pre} "1. ${sheet.name}", "FLUX_SHEET_ID", "${sheet.id}")`));
  assert.ok(!vbs.includes(`${pre} "1. ${sheet.name}", "Разработал"`));
  assert.ok(vbs.includes('RemoveUnusedStartSheets(Sheet, exIds, exCnt)'));
});

test('COM script: cable parameters are created and export reads cores/shield from E3', () => {
  const seed = createSeedProject();
  const vbs = generateE3ComScript(seed, 'build');
  for (const c of seed.cables) {
    const re = `CreateFluxCable(Prj, Dev, "${c.designation}", "${cableEntryName(c)}|${c.cableType}", "${c.fromDevice}", "${c.toDevice}", ${c.lengthMeters}, ${c.coresCount}, "${c.crossSection}", ${c.shielded ? 'True' : 'False'}, "${c.id}")`;
    assert.ok(vbs.includes(re), re);
  }
  const exp = generateE3ComScript(seed, 'export', 'C:\\x\\a.e3s');
  assert.ok(exp.includes('"Число жил"'));
  assert.ok(exp.includes('"Экранированный"'));
  assert.ok(!exp.includes('""coresCount"": 4'));
});

test('COM script: tables, callouts and filled custom shapes are drawn natively', () => {
  const vbs = generateE3ComScript(createRichScriptProject(), 'build');
  assert.equal(vbs.split('tablesOk = tablesOk + 1').length - 1, 2);
  assert.ok(vbs.includes('calloutsOk = calloutsOk + 1'));
  for (const label of ['Поз. обозначение', 'Марка кабеля']) {
    assert.ok(vbs.split('\n').some((l) => l.includes('DrawCustomText(') && l.includes(`"${label}"`)), label);
  }
  assert.ok(/Call DrawCustomLine\(/.test(vbs));
  assert.ok(/Call DrawCustomRect\(/.test(vbs));
  assert.ok(/Call DrawCustomPolygon\(Graph, shId_1, 3, [^\n]*\)/.test(vbs) || vbs.includes('DrawCustomPolygon('));
  const rectEx = vbs.split('\n').find((l) => l.includes('Call DrawCustomRectEx('))!;
  assert.ok(rectEx);
  const fillIdx = Number(rectEx.match(/, (-?\d+), gIds, gCnt\)/)![1]);
  assert.ok(fillIdx >= 0);
  const poly = vbs.split('\n').find((l) => l.includes('Call DrawCustomPolygon(Graph, shId_1, 4,') && l.includes('gIds, gCnt'))!;
  assert.ok(Number(poly.match(/, (-?\d+), gIds, gCnt\)/)![1]) >= 0);
  const fillSub = vbs.slice(vbs.indexOf('Sub ApplyFill('));
  assert.ok(fillSub.slice(0, 400).includes('SetFillColour'));
});

test('COM script: io_matrix devices are included in the build script', () => {
  const vbs = generateE3ComScript(createRichScriptProject(), 'build');
  assert.ok(vbs.includes('"-A9"'));
  assert.ok(vbs.includes('"GOST_KM_3P_COIL"'));
});

test('COM script: wires snap to uppercase pin keys and carry number, section, cable, core and id', () => {
  const seed = createSeedProject();
  const vbs = generateE3ComScript(seed, 'build');
  const w = seed.wires.find((x) => x.cableId && x.coreNumber)!;
  const dFrom = seed.devices.find((d) => d.id === w.fromDeviceId)!;
  const dTo = seed.devices.find((d) => d.id === w.toDeviceId)!;
  const pFrom = dFrom.pins.find((p) => p.id === w.fromPinId)!;
  const pTo = dTo.pins.find((p) => p.id === w.toPinId)!;
  const snap = `nW = SnapWireEndpoints(nW, "${(dFrom.designation + ':' + pFrom.name).toUpperCase()}", "${(dTo.designation + ':' + pTo.name).toUpperCase()}")`;
  assert.ok(vbs.includes(snap), snap);
  const cab = seed.cables.find((c) => c.id === w.cableId)!;
  const draw = vbs.split('\n').find((l) => l.includes('DrawWirePolyline(') && l.includes(`"${w.id}")`))!;
  assert.ok(draw.includes(`"${w.wireNumber}"`));
  assert.ok(draw.includes(`"${w.crossSection}"`));
  assert.ok(draw.includes(`"${cab.designation}"`));
  assert.ok(draw.includes(`"${w.coreNumber}"`));
});

test('COM script: E3_BRIDGE_SUMMARY is emitted and parseE3BridgeSummary returns the last valid line', () => {
  const vbs = generateE3ComScript(createSeedProject(), 'build');
  assert.ok(vbs.includes('E3_BRIDGE_SUMMARY'));
  const log = [
    'garbage line',
    '2026-01-01 INFO E3_BRIDGE_SUMMARY {"mode":"build","sheets":1,"devTotal":3,"wires":2}',
    'E3_BRIDGE_SUMMARY {broken json',
    '2026-01-01 INFO E3_BRIDGE_SUMMARY {"mode":"export","sheets":4,"devTotal":9,"wires":7,"cables":"x"}',
    'trailing noise',
  ].join('\r\n');
  const s = parseE3BridgeSummary(log)!;
  assert.equal(s.mode, 'export');
  assert.equal(s.sheets, 4);
  assert.equal(s.devTotal, 9);
  assert.equal(s.wires, 7);
  assert.equal(s.cables, 0);
  assert.equal(parseE3BridgeSummary('nothing here\nE3_BRIDGE_SUMMARY {oops'), null);
  assert.equal(parseE3BridgeSummary('no summary'), null);
  assert.equal(parseE3BridgeSummary(''), null);
});

test('COM script: generated build scripts pass the VBScript static linter (when available)', (t) => {
  const linter = fileURLToPath(new URL('../../scripts/vbslint.py', import.meta.url));
  if (!fs.existsSync(linter)) {
    t.skip('vbslint.py not available');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbslint-'));
  for (const [name, proj] of [['seed', createSeedProject()], ['rich', createRichScriptProject()]] as const) {
    const f = `${dir}/${name}.vbs`;
    fs.writeFileSync(f, generateE3ComScript(proj, 'build'));
    const r = spawnSync('python3', [linter, f], { encoding: 'utf8' });
    if (r.error) {
      t.skip('python3 not available');
      return;
    }
    assert.ok(String(r.stdout).trim().startsWith('OK'), `${name}: ${r.stdout}${r.stderr}`);
  }
});

test('Flux bridge round-trip through fake E3 export with fluxMeta restores model; E3 edits win', () => {
  const p = createRichScriptProject();
  const src = { ...exportToFluxBridge(p), annotations: p.annotations };
  const sh = p.sheets[0];
  const locs: Record<string, [number, number]> = {};
  p.devices.forEach((d, i) => { locs[d.designation] = [50 + i, 100 + i]; });
  const e3Bundle: any = {
    format: 'flux-e3-bridge/v1', replaceAll: true, fluxProjectKey: p.fluxProjectKey, projectName: 'X_native', exportedAt: '', revision: 1,
    sheets: [{ id: sh.id, number: 1, name: '1. ' + sh.name, format: 'A3', width: 1400, height: 920, titleBlock: { documentCode: 'X_native', designer: 'Петров', sheetTitle: '1. ' + sh.name } }],
    nodes: p.devices.map((d, i) => ({
      elementId: d.elementId, version: 'e3', tag: d.designation, designation: d.designation, status: 'one', solutionId: 'e3', solutionName: d.e3BlockName,
      rect: { sheet: sh.id, x: 1, y: 1, rotation: 0, width: 100, height: 100 },
      e3loc: i === 0 ? [60, 90] : locs[d.designation],
      attrs: [{ name: 'Артикул', value: d.article, owner: '' }, { name: 'Ток', value: '20', owner: '' }], checked: true,
    })),
    cables: [{ id: p.cables[0].id, designation: p.cables[0].designation, cableType: 'ВВГ', coresCount: 7, crossSection: '2.5', lengthMeters: 12.5, fromDevice: '', toDevice: '', shielded: true }],
    wires: [{ id: p.wires[0].id, sheetId: sh.id, netName: 'N1', signalType: 'signal', fromDeviceId: '', fromPinId: '', toDeviceId: '', toPinId: '', waypoints: [{ x: 0, y: 0 }, { x: 5, y: 0 }], crossSection: '', wireNumber: 'N1' }],
    e3SheetBounds: { [sh.id]: [10, 10, 410, 287] },
    fluxMeta: { format: 'flux-e3-meta/v1', e3Locations: locs, sheets: { [sh.id]: { e3Id: 5, bounds: [10, 10, 410, 287] } }, bundle: src },
  };
  const out = importFromFluxBridge(e3Bundle, p);
  assert.equal(out.devices.length, p.devices.length);
  for (const d of p.devices) {
    const o = out.devices.find((x) => x.elementId === d.elementId)!;
    assert.ok(o, d.designation);
    assert.equal(o.id, d.id);
    assert.equal(o.pins.length, d.pins.length);
  }
  const d0 = out.devices.find((d) => d.elementId === p.devices[0].elementId)!;
  const d1 = out.devices.find((d) => d.elementId === p.devices[1].elementId)!;
  assert.ok(d0.customSymbol && d0.customSymbol.shapes.length === 3);
  // moved in E3 -> new position; unmoved -> exact original
  assert.ok(d0.x !== p.devices[0].x || d0.y !== p.devices[0].y);
  assert.equal(d1.x, p.devices[1].x);
  assert.equal(d1.y, p.devices[1].y);
  assert.equal(out.annotations?.length, p.annotations?.length);
  assert.equal(out.wires.length, p.wires.length);
  const devIds = new Set(out.devices.map((d) => d.id));
  const pinIds = new Set(out.devices.flatMap((d) => d.pins.map((x) => x.id)));
  for (const w of out.wires) {
    assert.ok(devIds.has(w.fromDeviceId) && pinIds.has(w.fromPinId) && devIds.has(w.toDeviceId) && pinIds.has(w.toPinId), w.id);
  }
  const cab = out.cables.find((c) => c.id === p.cables[0].id)!;
  assert.equal(cab.coresCount, 7);
  assert.equal(cab.crossSection, '2.5');
  assert.equal(cab.shielded, true);
  assert.equal(out.sheets[0].name, sh.name);
});

test('applyE3FluxMeta is a no-op without fluxMeta', () => {
  const p = createSeedProject();
  const b = exportToFluxBridge(p);
  assert.equal(applyE3FluxMeta(b), b);
});
