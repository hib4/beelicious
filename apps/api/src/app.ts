import { DashboardService } from './modules/dashboard/service.js';
import { registerDashboardRoutes } from './modules/dashboard/routes.js';
import {
  createIdentityVerifier,
  type IdentityVerifier,
} from './modules/dashboard/config.js';
import {
  createMidtransGateway,
  createMockGateway,
} from './modules/checkout/gateway.js';
import {
  PaymentService,
  registerPaymentWebhook,
} from './modules/checkout/payments.js';
import { createCheckoutWorker } from './modules/checkout/notifications.js';
import { createCloudAdapter } from './modules/messaging/providers/cloud-api.js';
import type { PaymentGateway } from './modules/checkout/gateway.js';
import { ConversationEngine } from './modules/conversation/engine.js';
import { createCatalogServices } from './modules/catalog/services.js';
import {
  registerCatalogRoutes,
  type CatalogReader,
} from './modules/catalog/routes.js';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  createWhatsAppClient,
  type TextSender,
} from './modules/whatsapp/client.js';
import { registerWhatsAppRoutes } from './modules/whatsapp/routes.js';
import { createWorker } from './modules/whatsapp/worker.js';
import {
  createMessagingRuntime,
  type MessagingRuntime,
} from './modules/messaging/runtime.js';
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
          new DashboardService(prisma, dependencies.now, config.checkout),
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
  if (config.conversationEnabled && !prisma)
    throw new Error('Conversation persistence is required');
  const conversation =
    config.conversationEnabled && prisma
      ? new ConversationEngine(
          prisma,
          dependencies.now,
          config.CART_MAX_ITEM_QUANTITY,
          config.checkout,
        )
      : undefined;
  let worker: ReturnType<typeof createWorker> | undefined;
  let messaging: MessagingRuntime | undefined;
  if (config.whatsapp) {
    const store =
      dependencies.whatsappEvents ??
      (database as Partial<WhatsAppDatabase>).whatsappEvents;
    if (!store) throw new Error('WhatsApp event storage is required');
    const whatsapp = config.whatsapp;
    app.register(async (scope) => {
      await registerWhatsAppRoutes(scope, whatsapp, store, !!conversation);
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
      conversation,
    );
    app.addHook('onListen', async () => {
      worker?.start();
    });
  }
  if (config.messaging && config.messaging.provider !== 'cloud-api') {
    const store =
      dependencies.whatsappEvents ??
      (database as Partial<WhatsAppDatabase>).whatsappEvents;
    if (!store) throw new Error('Messaging event storage is required');
    messaging = createMessagingRuntime(
      config.messaging,
      store,
      config.NODE_ENV === 'development',
      (event) => {
        app.log.info({ event }, 'Messaging provider event');
      },
      {
        ...(conversation ? { conversation } : {}),
        ...(dependencies.messagingAdapterFactory
          ? { adapterFactory: dependencies.messagingAdapterFactory }
          : {}),
        ...(dependencies.qr ? { qr: dependencies.qr } : {}),
        ...(dependencies.now ? { now: dependencies.now } : {}),
      },
    );
    app.addHook('onListen', async () => {
      // Fastify reports onListen failures without failing listen; clean up explicitly.
      try {
        await messaging?.start();
      } catch {
        app.log.error(
          { event: 'messaging_start_failed' },
          'Messaging provider could not start',
        );
        await messaging?.stop();
      }
    });
  }
  const paymentService =
    config.checkout && prisma
      ? new PaymentService(
          prisma,
          config.checkout,
          dependencies.paymentGateway ??
            (config.checkout.provider === 'mock'
              ? createMockGateway(prisma, dependencies.now)
              : createMidtransGateway(config.checkout)),
          dependencies.now,
        )
      : undefined;
  const cloudAdapter =
    (config.checkout || config.dashboard) && config.whatsapp
      ? createCloudAdapter(
          config.whatsapp,
          dependencies.sender ?? createWhatsAppClient(config.whatsapp),
        )
      : undefined;
  const checkoutWorker =
    (paymentService || config.dashboard) && prisma
      ? createCheckoutWorker(
          prisma,
          paymentService,
          config.checkout,
          () => messaging?.adapter() ?? cloudAdapter,
          (event) =>
            app.log.warn({ event }, 'Checkout processing requires attention'),
          dependencies.now,
        )
      : undefined;
  if (config.checkout && prisma)
    registerPaymentWebhook(app, prisma, config.checkout);
  app.addHook('onListen', async () => {
    checkoutWorker?.start();
  });
  app.addHook('onClose', async () => {
    await checkoutWorker?.stop();
    try {
      try {
        await worker?.stop();
      } finally {
        await messaging?.stop();
      }
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
