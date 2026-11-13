import {
  buildBom,
  buildCableJournal,
  buildNetWireLengths,
  buildTerminalPlan,
  exportToDxf,
  exportToFluxBridge,
  parseE3Xml,
  runErc,
  serializeE3Xml,
} from '../core/e3Engine';
import { buildOle2E3sContainer, parseE3sInput } from '../core/e3SFormat';
import type {
  BomRow,
  CableJournalRow,
  E3Project,
  ErcIssue,
  FluxBridgeBundle,
  NetWireLengthRow,
  TerminalPlanRow,
} from '../core/e3Types';
import type { WorkerRequest, WorkerResponse } from './ecadWorker';

export interface AnalysisResult {
  durationMs: number;
  bom: BomRow[];
  cables: CableJournalRow[];
  netLengths: NetWireLengthRow[];
  terminals: TerminalPlanRow[];
  erc: ErcIssue[];
  viaWorker: boolean;
}

class EcadAsyncRunner {
  private worker: Worker | null = null;
  private pending = new Map<string, { resolve: (val: any) => void; reject: (err: Error) => void }>();

  private ensureWorker(): Worker | null {
    if (typeof Worker === 'undefined') return null;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./ecadWorker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          const entry = this.pending.get(msg.id);
          if (!entry) return;
          this.pending.delete(msg.id);
          if (msg.ok) entry.resolve(msg);
          else entry.reject(new Error(msg.error));
        };
        this.worker.onerror = () => {
          this.worker = null;
        };
      } catch {
        this.worker = null;
      }
    }
    return this.worker;
  }

  private callWorker<T extends WorkerResponse>(req: WorkerRequest): Promise<T | null> {
    const w = this.ensureWorker();
    if (!w) return Promise.resolve(null);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(req.id, { resolve, reject });
      w.postMessage(req);
    }).catch(() => null);
  }

  async analyzeProject(project: E3Project): Promise<AnalysisResult> {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const res = await this.callWorker<Extract<WorkerResponse, { type: 'ANALYZE_ALL' }>>({
      id,
      type: 'ANALYZE_ALL',
      project,
    });
    if (res) {
      return {
        durationMs: res.durationMs,
        bom: res.bom,
        cables: res.cables,
        netLengths: res.netLengths,
        terminals: res.terminals,
        erc: res.erc,
        viaWorker: true,
      };
    }

    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 0));
    return {
      durationMs: Math.round((performance.now() - t0) * 100) / 100,
      bom: buildBom(project),
      cables: buildCableJournal(project),
      netLengths: buildNetWireLengths(project),
      terminals: buildTerminalPlan(project),
      erc: runErc(project),
      viaWorker: false,
    };
  }

  async exportXml(project: E3Project): Promise<{ xml: string; durationMs: number; viaWorker: boolean }> {
    const id = `xml-${Date.now()}`;
    const res = await this.callWorker<Extract<WorkerResponse, { type: 'EXPORT_XML' }>>({
      id,
      type: 'EXPORT_XML',
      project,
    });
    if (res) return { xml: res.xml, durationMs: res.durationMs, viaWorker: true };
    const t0 = performance.now();
    const xml = serializeE3Xml(project);
    return { xml, durationMs: Math.round((performance.now() - t0) * 100) / 100, viaWorker: false };
  }

  async exportE3sOle2(project: E3Project): Promise<{ bytes: Uint8Array; durationMs: number; viaWorker: boolean }> {
    const id = `e3s-${Date.now()}`;
    const res = await this.callWorker<Extract<WorkerResponse, { type: 'EXPORT_E3S_OLE2' }>>({
      id,
      type: 'EXPORT_E3S_OLE2',
      project,
    });
    if (res) {
      return { bytes: new Uint8Array(res.bytes), durationMs: res.durationMs, viaWorker: true };
    }
    const t0 = performance.now();
    const bytes = buildOle2E3sContainer(project);
    return { bytes, durationMs: Math.round((performance.now() - t0) * 100) / 100, viaWorker: false };
  }

  async importXml(xml: string): Promise<{ project: E3Project; durationMs: number; viaWorker: boolean }> {
    const id = `ixml-${Date.now()}`;
    const res = await this.callWorker<Extract<WorkerResponse, { type: 'IMPORT_XML' }>>({
      id,
      type: 'IMPORT_XML',
      xml,
    });
    if (res) return { project: res.project, durationMs: res.durationMs, viaWorker: true };
    const t0 = performance.now();
    const project = parseE3Xml(xml);
    return { project, durationMs: Math.round((performance.now() - t0) * 100) / 100, viaWorker: false };
  }

  async importE3sBytes(
    bytes: ArrayBuffer,
    filename?: string
  ): Promise<{
    project: E3Project;
    sourceKind: string;
    discoveredStreams: string[];
    durationMs: number;
    viaWorker: boolean;
  }> {
    const id = `ie3s-${Date.now()}`;
    const res = await this.callWorker<Extract<WorkerResponse, { type: 'IMPORT_E3S_BYTES' }>>({
      id,
      type: 'IMPORT_E3S_BYTES',
      bytes,
      filename,
    });
    if (res) {
      return {
        project: res.project,
        sourceKind: res.sourceKind,
        discoveredStreams: res.discoveredStreams,
        durationMs: res.durationMs,
        viaWorker: true,
      };
    }
    const t0 = performance.now();
    const parsed = await parseE3sInput(bytes, filename);
    return {
      ...parsed,
      durationMs: Math.round((performance.now() - t0) * 100) / 100,
      viaWorker: false,
    };
  }

  async exportDxf(project: E3Project, sheetId?: string): Promise<{ dxf: string; durationMs: number }> {
    const id = `dxf-${Date.now()}`;
    const res = await this.callWorker<Extract<WorkerResponse, { type: 'EXPORT_DXF' }>>({
      id,
      type: 'EXPORT_DXF',
      project,
      sheetId,
    });
    if (res) return { dxf: res.dxf, durationMs: res.durationMs };
    const t0 = performance.now();
    return { dxf: exportToDxf(project, sheetId), durationMs: Math.round((performance.now() - t0) * 100) / 100 };
  }

  async exportFluxBundle(project: E3Project): Promise<{ bundle: FluxBridgeBundle; durationMs: number }> {
    const id = `flux-${Date.now()}`;
    const res = await this.callWorker<Extract<WorkerResponse, { type: 'EXPORT_FLUX' }>>({
      id,
      type: 'EXPORT_FLUX',
      project,
    });
    if (res) return { bundle: res.bundle, durationMs: res.durationMs };
    const t0 = performance.now();
    return { bundle: exportToFluxBridge(project), durationMs: Math.round((performance.now() - t0) * 100) / 100 };
  }
}

export const ecadAsync = new EcadAsyncRunner();
