import type { E3Project, FluxBusMessage } from './e3Types.ts';
import { buildBom, exportToFluxBridge, runErc } from './e3Engine.ts';

export interface FluxCommandRequest {
  requestId: string;
  sourceApp: string;
  action:
    | 'e3.getProject'
    | 'e3.getBom'
    | 'e3.runErc'
    | 'e3.getBridgeBundle'
    | 'e3.updateStamp'
    | 'e3.addDevice'
    | 'e3.rerouteWires';
  payload?: Record<string, unknown>;
}

export interface FluxCommandResponse {
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

declare global {
  interface Window {
    flux?: {
      context?: { projectId?: string; projectName?: string; workspaceId?: string };
      read?: (resource: string, entityId?: string) => Promise<unknown>;
      invoke?: (moduleId: string, action: string, payload?: unknown) => Promise<unknown>;
      emit?: (event: string, payload?: unknown) => void;
      on?: (event: string, cb: (payload?: unknown) => void) => () => void;
      state?: {
        get?: () => Promise<Record<string, unknown>>;
        set?: (next: Record<string, unknown>) => Promise<void>;
      };
      saveFile?: (name: string, contentBase64: string, mime?: string) => Promise<void>;
      openFile?: () => Promise<{ name: string; contentBase64: string } | null>;
    };
  }
}

export interface FluxHostStatus {
  hostedInFlux: boolean;
  projectId?: string;
  projectName?: string;
  capabilities: string[];
}

export function detectFluxHost(): FluxHostStatus {
  if (typeof window === 'undefined') {
    return { hostedInFlux: false, capabilities: ['postMessage', 'BroadcastChannel', 'server-flux-bus'] };
  }
  const caps = ['postMessage', 'BroadcastChannel', 'server-flux-bus'];
  if (window.flux) {
    if (window.flux.state) caps.push('flux.state');
    if (window.flux.invoke) caps.push('flux.invoke');
    if (window.flux.on) caps.push('flux.on');
    if (window.flux.saveFile) caps.push('flux.saveFile');
  }
  if (window.flux && window.flux.context) {
    return {
      hostedInFlux: true,
      projectId: window.flux.context.projectId,
      projectName: window.flux.context.projectName,
      capabilities: caps,
    };
  }
  return { hostedInFlux: false, capabilities: caps };
}

export async function pushProjectToFluxHost(project: E3Project): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const bundle = exportToFluxBridge(project);

  // If running inside Flux Studio / Flux v2 runtime
  if (window.flux?.state?.set) {
    await window.flux.state.set({
      fluxProjectKey: project.fluxProjectKey,
      revision: project.revision,
      bridgeBundle: bundle,
    });
    window.flux.emit?.('e3.projectUpdated', {
      projectCode: project.projectCode,
      revision: project.revision,
    });
    return true;
  }

  // Broadcast to sibling Flux modules in same origin via BroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel('flux-studio-bus');
      ch.postMessage({
        flux: 'module',
        v: 1,
        type: 'e3-sync',
        sourceApp: 'e3promax-ecad',
        data: { kind: 'e3-sync', bundle },
      });
      ch.close();
    } catch {
      // ignore BroadcastChannel failures
    }
  }

  // Standard parent postMessage fallback for iframe hosting inside Flux Studio
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        flux: 'module',
        v: 1,
        type: 'page-message',
        data: { kind: 'e3-sync', bundle },
      },
      '*'
    );
    return true;
  }

  return false;
}

/** Handles inbound API commands from other apps inside Flux Studio. */
export function executeFluxInboundCommand(
  cmd: FluxCommandRequest,
  project: E3Project,
  callbacks: {
    onUpdateStamp?: (sheetId: string, patch: Record<string, unknown>, applyToAll: boolean) => void;
    onAddDevice?: (payload: Record<string, unknown>) => unknown;
    onRerouteWires?: (sheetId?: string) => void;
  }
): FluxCommandResponse {
  try {
    switch (cmd.action) {
      case 'e3.getProject':
        return { requestId: cmd.requestId, ok: true, data: project };
      case 'e3.getBom':
        return {
          requestId: cmd.requestId,
          ok: true,
          data: { projectCode: project.projectCode, revision: project.revision, bom: buildBom(project) },
        };
      case 'e3.runErc':
        return { requestId: cmd.requestId, ok: true, data: { issues: runErc(project) } };
      case 'e3.getBridgeBundle':
        return { requestId: cmd.requestId, ok: true, data: exportToFluxBridge(project) };
      case 'e3.updateStamp': {
        const p = cmd.payload || {};
        const sheetId = String(p.sheetId || project.sheets[0]?.id || 'sheet-1');
        const applyToAll = Boolean(p.applyToAll);
        const patch = (p.patch as Record<string, unknown>) || {};
        callbacks.onUpdateStamp?.(sheetId, patch, applyToAll);
        return { requestId: cmd.requestId, ok: true, data: { updated: true, applyToAll } };
      }
      case 'e3.addDevice': {
        const created = callbacks.onAddDevice?.(cmd.payload || {});
        return { requestId: cmd.requestId, ok: true, data: { device: created } };
      }
      case 'e3.rerouteWires': {
        const sheetId = cmd.payload?.sheetId ? String(cmd.payload.sheetId) : undefined;
        callbacks.onRerouteWires?.(sheetId);
        return { requestId: cmd.requestId, ok: true, data: { rerouted: true } };
      }
      default:
        return { requestId: cmd.requestId, ok: false, error: `Неизвестная команда Flux API: ${String(cmd.action)}` };
    }
  } catch (err) {
    return {
      requestId: cmd.requestId,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Invokes another module inside Flux Studio (or relays via server Flux bus when standalone). */
export async function invokeFluxModule(
  targetApp: string,
  action: string,
  payload: Record<string, unknown> = {}
): Promise<{ ok: boolean; via: string; result?: unknown }> {
  if (typeof window !== 'undefined' && window.flux?.invoke) {
    const result = await window.flux.invoke(targetApp, action, payload);
    return { ok: true, via: 'window.flux.invoke', result };
  }

  if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
    window.parent.postMessage(
      {
        flux: 'module-rpc',
        v: 1,
        targetApp,
        action,
        payload,
      },
      '*'
    );
  }

  const res = await fetch('/api/v1/integrations/flux-bus', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceApp: 'e3promax-ecad',
      targetApp,
      action,
      payload,
    }),
  });
  const data = await res.json();
  return { ok: res.ok, via: 'flux-bus-relay', result: data };
}

export function createFluxBusLogEntry(
  direction: FluxBusMessage['direction'],
  channel: string,
  action: string,
  sourceApp: string,
  targetApp: string,
  payloadSummary: string
): FluxBusMessage {
  return {
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    direction,
    channel,
    action,
    sourceApp,
    targetApp,
    payloadSummary,
  };
}
