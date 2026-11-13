import type { E3Project } from './e3Types';
import { exportToFluxBridge } from './e3Engine';

declare global {
  interface Window {
    flux?: {
      context?: { projectId?: string; projectName?: string };
      read?: (resource: string, entityId?: string) => Promise<unknown>;
      on?: (event: string, cb: () => void) => () => void;
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
}

export function detectFluxHost(): FluxHostStatus {
  if (typeof window === 'undefined') return { hostedInFlux: false };
  if (window.flux && window.flux.context) {
    return {
      hostedInFlux: true,
      projectId: window.flux.context.projectId,
      projectName: window.flux.context.projectName,
    };
  }
  return { hostedInFlux: false };
}

export async function pushProjectToFluxHost(project: E3Project): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const bundle = exportToFluxBridge(project);

  // If running inside Flux Studio / Flux v2 page runtime
  if (window.flux?.state?.set) {
    await window.flux.state.set({
      fluxProjectKey: project.fluxProjectKey,
      revision: project.revision,
      bridgeBundle: bundle,
    });
    return true;
  }

  // Standard parent postMessage fallback for iframe hosting inside Flux
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
