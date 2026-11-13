import {
  buildBom,
  buildCableJournal,
  buildTerminalPlan,
  exportToDxf,
  exportToFluxBridge,
  parseE3Xml,
  runErc,
  serializeE3Xml,
} from '../core/e3Engine';
import type { E3Project } from '../core/e3Types';

export type WorkerRequest =
  | { id: string; type: 'ANALYZE_ALL'; project: E3Project }
  | { id: string; type: 'EXPORT_XML'; project: E3Project }
  | { id: string; type: 'IMPORT_XML'; xml: string }
  | { id: string; type: 'EXPORT_DXF'; project: E3Project; sheetId?: string }
  | { id: string; type: 'EXPORT_FLUX'; project: E3Project };

export type WorkerResponse =
  | {
      id: string;
      ok: true;
      type: 'ANALYZE_ALL';
      durationMs: number;
      bom: ReturnType<typeof buildBom>;
      cables: ReturnType<typeof buildCableJournal>;
      terminals: ReturnType<typeof buildTerminalPlan>;
      erc: ReturnType<typeof runErc>;
    }
  | { id: string; ok: true; type: 'EXPORT_XML'; durationMs: number; xml: string }
  | { id: string; ok: true; type: 'IMPORT_XML'; durationMs: number; project: E3Project }
  | { id: string; ok: true; type: 'EXPORT_DXF'; durationMs: number; dxf: string }
  | { id: string; ok: true; type: 'EXPORT_FLUX'; durationMs: number; bundle: ReturnType<typeof exportToFluxBridge> }
  | { id: string; ok: false; error: string };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  const t0 = performance.now();
  try {
    if (req.type === 'ANALYZE_ALL') {
      const bom = buildBom(req.project);
      const cables = buildCableJournal(req.project);
      const terminals = buildTerminalPlan(req.project);
      const erc = runErc(req.project);
      const res: WorkerResponse = {
        id: req.id,
        ok: true,
        type: 'ANALYZE_ALL',
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        bom,
        cables,
        terminals,
        erc,
      };
      self.postMessage(res);
    } else if (req.type === 'EXPORT_XML') {
      const xml = serializeE3Xml(req.project);
      self.postMessage({
        id: req.id,
        ok: true,
        type: 'EXPORT_XML',
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        xml,
      } satisfies WorkerResponse);
    } else if (req.type === 'IMPORT_XML') {
      const project = parseE3Xml(req.xml);
      self.postMessage({
        id: req.id,
        ok: true,
        type: 'IMPORT_XML',
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        project,
      } satisfies WorkerResponse);
    } else if (req.type === 'EXPORT_DXF') {
      const dxf = exportToDxf(req.project, req.sheetId);
      self.postMessage({
        id: req.id,
        ok: true,
        type: 'EXPORT_DXF',
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        dxf,
      } satisfies WorkerResponse);
    } else if (req.type === 'EXPORT_FLUX') {
      const bundle = exportToFluxBridge(req.project);
      self.postMessage({
        id: req.id,
        ok: true,
        type: 'EXPORT_FLUX',
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        bundle,
      } satisfies WorkerResponse);
    }
  } catch (err) {
    self.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
