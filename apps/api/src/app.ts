import { DashboardService } from './modules/dashboard/service.js';
import { registerDashboardRoutes } from './modules/dashboard/routes.js';
import {
  createIdentityVerifier,
  type IdentityVerifier,
} from './modules/dashboard/config.js';
import { registerPaymentWebhook } from './modules/checkout/payments.js';
import { createBackgroundRuntime } from './runtime.js';
import type { PaymentGateway } from './modules/checkout/gateway.js';
import { createCatalogServices } from './modules/catalog/services.js';
import {
  registerCatalogRoutes,
  type CatalogReader,
} from './modules/catalog/routes.js';
import Fastify, { type FastifyServerOptions } from 'fastify';
import type { TextSender } from './modules/whatsapp/client.js';
import { registerWhatsAppRoutes } from './modules/whatsapp/routes.js';
import type {
  AdapterCallbacks,
  MessagingAdapter,
} from './modules/messaging/types.js';
import {
  createDatabase,
  type Database,
  type ApplicationDatabase,
  type WhatsAppDatabase,
  type WhatsAppEventStore,
} from '@beelicious/database';
import type { HealthResponse, ReadinessResponse } from '@beelicious/shared';
import type { Config } from './config.js';

export interface AppDependencies {
  /** Entrypoints choose whether listening starts persistent background work. */
  background?: boolean;
  identityVerifier?: IdentityVerifier;
  paymentGateway?: PaymentGateway;
  catalogServices?: CatalogReader;
  whatsappEvents?: WhatsAppEventStore;
  messagingAdapterFactory?: (
    callbacks: AdapterCallbacks,
  ) => Promise<MessagingAdapter>;
  qr?: (value: string) => void;
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
  const prisma = (database as Partial<ApplicationDatabase>).prisma;
  if (config.dashboard && prisma) {
    app.register(
      async (scope) =>
        registerDashboardRoutes(
          scope,
          new DashboardService(
            prisma,
            dependencies.now,
            config.pickup ?? config.checkout,
          ),
          dependencies.identityVerifier ??
            createIdentityVerifier(config.dashboard!),
        ),
      { prefix: '/api/v1/tenant-dashboard' },
    );
  }
  const catalog =
    dependencies.catalogServices ??
    (prisma ? createCatalogServices(prisma) : undefined);
  app.register(async (scope) => registerCatalogRoutes(scope, catalog));
  if (config.whatsapp) {
    const store =
      dependencies.whatsappEvents ??
      (database as Partial<WhatsAppDatabase>).whatsappEvents;
    if (!store) throw new Error('WhatsApp event storage is required');
    app.register(async (scope) => {
      await registerWhatsAppRoutes(
        scope,
        config.whatsapp!,
        store,
        !!config.conversationEnabled,
      );
    });
  }
  const webhook = config.paymentWebhook ?? config.checkout;
  if (webhook && prisma) registerPaymentWebhook(app, prisma, webhook);
  const runtime =
    dependencies.background === false
      ? undefined
      : createBackgroundRuntime(config, database, dependencies, (event) => {
          app.log.warn({ event }, 'Background processing requires attention');
        });
  app.addHook('onListen', async () => {
    try {
      await runtime?.start();
    } catch {
      app.log.error(
        { event: 'messaging_start_failed' },
        'Messaging provider could not start',
      );
      await runtime?.stop();
    }
  });
  app.addHook('onClose', async () => {
    try {
      await runtime?.stop();
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
