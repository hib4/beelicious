import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  createWhatsAppClient,
  type TextSender,
} from './modules/whatsapp/client.js';
import { registerWhatsAppRoutes } from './modules/whatsapp/routes.js';
import { createWorker } from './modules/whatsapp/worker.js';
import {
  createDatabase,
  type Database,
  type WhatsAppDatabase,
  type WhatsAppEventStore,
} from '@beelicious/database';
import type { HealthResponse, ReadinessResponse } from '@beelicious/shared';
import type { Config } from './config.js';

export interface AppDependencies {
  whatsappEvents?: WhatsAppEventStore;
  sender?: TextSender;
  now?: () => Date;
  logger?: FastifyServerOptions['logger'];
}
export function buildApp(
  config: Config,
  database: Database = createDatabase(config.DATABASE_URL),
  dependencies: AppDependencies = {},
) {
  const app = Fastify({
    logger:
      dependencies.logger === false ||
      (config.NODE_ENV === 'test' && dependencies.logger === undefined)
        ? false
        : {
            ...(typeof dependencies.logger === 'object'
              ? dependencies.logger
              : {}),
            level: 'info',
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-hub-signature-256"]',
            ],
            serializers: {
              req(request: { id: string; method: string; url: string }) {
                return {
                  id: request.id,
                  method: request.method,
                  url: request.url.split('?')[0] ?? '',
                };
              },
            },
          },
  });
  let worker: ReturnType<typeof createWorker> | undefined;
  if (config.whatsapp) {
    const store =
      dependencies.whatsappEvents ??
      (database as Partial<WhatsAppDatabase>).whatsappEvents;
    if (!store) throw new Error('WhatsApp event storage is required');
    const whatsapp = config.whatsapp;
    app.register(async (scope) => {
      await registerWhatsAppRoutes(scope, whatsapp, store);
    });
    worker = createWorker(
      store,
      dependencies.sender ?? createWhatsAppClient(whatsapp),
      whatsapp,
      config.NODE_ENV === 'development',
      (event) => {
        app.log.warn({ event }, 'WhatsApp processing requires attention');
      },
      dependencies.now,
    );
    app.addHook('onListen', async () => {
      worker?.start();
    });
  }
  app.addHook('onClose', async () => {
    try {
      await worker?.stop();
    } finally {
      await database.disconnect();
    }
  });
  app.get<{ Reply: HealthResponse }>('/health', async () => ({
    status: 'ok',
    service: 'beelicious-api',
  }));
  app.get<{ Reply: ReadinessResponse }>('/ready', async (_request, reply) => {
    try {
      await database.checkConnection();
      return { status: 'ready', service: 'beelicious-api' };
    } catch {
      app.log.warn(
        { event: 'database_unavailable' },
        'Database readiness check failed',
      );
      return reply
        .code(503)
        .send({ status: 'unavailable', service: 'beelicious-api' });
    }
  });
  return app;
}
