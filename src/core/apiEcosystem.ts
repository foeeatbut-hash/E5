import type { E3Project, ExternalWebhookConfig } from './e3Types.ts';

export interface ApiEndpointDoc {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  tier: 'own' | 'flux-internal' | 'external';
  summary: string;
  sampleBody?: Record<string, unknown>;
}

export const E3_API_ENDPOINTS: ApiEndpointDoc[] = [
  {
    method: 'GET',
    path: '/api/v1/openapi.json',
    tier: 'own',
    summary: 'OpenAPI 3.0 спецификация всех эндпоинтов E3ProMax',
  },
  {
    method: 'GET',
    path: '/api/sync/stream',
    tier: 'own',
    summary: 'SSE поток обновлений проекта, штампов, логов и событий в реальном времени',
  },
  {
    method: 'PATCH',
    path: '/api/v1/projects/:id/sheets/:sheetId/stamp',
    tier: 'own',
    summary: 'Обновление штампа ГОСТ 2.104 на одном листе или на всех листах (applyToAll: true)',
    sampleBody: {
      applyToAll: true,
      patch: { organization: 'ООО «ПромВентАвтоматика»', checker: 'Петров В.И.' },
    },
  },
  {
    method: 'POST',
    path: '/api/v1/projects/:id/devices',
    tier: 'own',
    summary: 'Добавление изделия ГОСТ в схему проекта через REST API',
    sampleBody: { designation: '-KM2', article: 'LC1D25BD', x: 380, y: 540 },
  },
  {
    method: 'POST',
    path: '/api/v1/projects/:id/reroute',
    tier: 'own',
    summary: 'Автотрассировка всех проводов листа без наложения и пересечения блоков',
    sampleBody: { sheetId: 'sheet-1' },
  },
  {
    method: 'POST',
    path: '/api/v1/projects/:id/publish/dxf',
    tier: 'own',
    summary: 'Пакетная публикация листов в редактируемый AutoCAD DXF (или ZIP по листам)',
    sampleBody: { format: 'dxf-single', includeBom: true, editableBlocks: true },
  },
  {
    method: 'POST',
    path: '/api/v1/projects/:id/publish/pdf',
    tier: 'own',
    summary: 'Пакетная публикация многостраничного чертежа ГОСТ + ПЭ3 в векторный PDF',
    sampleBody: { includeBom: true, includeCables: true, includeGostFrame: true },
  },
  {
    method: 'POST',
    path: '/api/v1/integrations/flux-bus',
    tier: 'flux-internal',
    summary: 'Шина команд/событий для других модулей внутри Flux Studio (подбор ПЧ, ОВКВ, шкафы 3D)',
    sampleBody: {
      sourceApp: 'flux-hvac-selector',
      targetApp: 'e3promax-ecad',
      action: 'e3.getBom',
      payload: {},
    },
  },
  {
    method: 'GET',
    path: '/api/v1/integrations/webhooks',
    tier: 'external',
    summary: 'Список подписок внешних программ (1C, PDM Лоцман, SCADA, AutoCAD, E3)',
  },
  {
    method: 'POST',
    path: '/api/v1/integrations/webhooks',
    tier: 'external',
    summary: 'Регистрация внешнего Webhook для приёма событий изменений/публикации',
    sampleBody: {
      name: '1С:ERP Спецификация',
      url: 'http://127.0.0.1:3000/api/v1/integrations/mock-external-receiver',
      events: ['project.updated', 'stamp.updated', 'publish.completed'],
      enabled: true,
    },
  },
  {
    method: 'POST',
    path: '/api/v1/integrations/external-call',
    tier: 'external',
    summary: 'Исходящий REST-запрос во внешнюю систему (ERP/PLM/SCADA) без ограничений CORS',
    sampleBody: {
      method: 'POST',
      url: 'http://127.0.0.1:3000/api/v1/integrations/mock-external-receiver',
      body: { source: 'E3ProMax', sync: 'bom' },
    },
  },
];

export function buildOpenApiSpec(project: E3Project, origin = 'http://localhost:3000'): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of E3_API_ENDPOINTS) {
    const cleanPath = ep.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const m = ep.method.toLowerCase();
    paths[cleanPath] = paths[cleanPath] || {};
    paths[cleanPath][m] = {
      summary: ep.summary,
      tags: [
        ep.tier === 'own'
          ? 'Own ECAD REST API'
          : ep.tier === 'flux-internal'
            ? 'Flux Studio Internal Bus'
            : 'External Webhooks & Bridge',
      ],
      responses: {
        '200': { description: 'Success' },
      },
    };
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'E3ProMax / Flux E3 ECAD API',
      version: '1.2.0',
      description: `REST, SSE, Flux Studio Internal Bus и External Webhook API для проекта "${project.name}" (${project.projectCode}).`,
    },
    servers: [{ url: origin }],
    paths,
  };
}

export function isAllowedExternalUrl(rawUrl: string): { ok: boolean; reason?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, reason: 'Разрешены только протоколы http:// и https://' };
    }
    const host = parsed.hostname.toLowerCase();
    if (host === '169.254.169.254' || host === 'metadata.google.internal') {
      return { ok: false, reason: 'Запрещён доступ к служебным адресам метаданных' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Некорректный формат URL' };
  }
}

export type WebhookSeedInput = Omit<ExternalWebhookConfig, 'id'>;
