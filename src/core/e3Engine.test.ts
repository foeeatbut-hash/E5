import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import JSZip from 'jszip';
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
  assert.ok(buildVbs.includes('d.CreateDynamic('));
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
  assert.ok(buildVbs.includes('sh.Create(0, shName, cand, 0, 0)'));
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


