import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import JSZip from 'jszip';
import {
  autoRouteOrthogonal,
  buildBom,
  buildCableJournal,
  buildTerminalPlan,
  encodeUtf16LeWithBom,
  exportBomCsv,
  exportToDxf,
  exportToFluxBridge,
  exportVisualSettings,
  generateE3ComScript,
  generateStressBatch,
  generateWindowsBridgeCmd,
  importFromFluxBridge,
  parseE3Xml,
  parseVisualSettings,
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


