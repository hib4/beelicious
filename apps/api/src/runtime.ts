import type { AppDependencies } from './app.js';
import type { Config } from './config.js';
import type {
  Database,
  ApplicationDatabase,
  WhatsAppDatabase,
} from '@beelicious/database';
import { ConversationEngine } from './modules/conversation/engine.js';
import { createWorker } from './modules/whatsapp/worker.js';
import { createWhatsAppClient } from './modules/whatsapp/client.js';
import {
  createMessagingRuntime,
  type MessagingRuntime,
} from './modules/messaging/runtime.js';
import { createCloudAdapter } from './modules/messaging/providers/cloud-api.js';
import { createCheckoutWorker } from './modules/checkout/notifications.js';
import { PaymentService } from './modules/checkout/payments.js';
import {
  createMockGateway,
  createMidtransGateway,
} from './modules/checkout/gateway.js';

/** Long-lived work. Construction never opens a socket or starts a timer. */
export function createBackgroundRuntime(
  config: Config,
  database: Database,
  dependencies: AppDependencies = {},
  warn: (event: string) => void = () => {},
) {
  const prisma = (database as Partial<ApplicationDatabase>).prisma;
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
  const store =
    dependencies.whatsappEvents ??
    (database as Partial<WhatsAppDatabase>).whatsappEvents;
  if ((config.whatsapp || config.messaging) && !store)
    throw new Error('Messaging event storage is required');
  const cloudWorker =
    config.whatsapp && store
      ? createWorker(
          store,
          dependencies.sender ?? createWhatsAppClient(config.whatsapp),
          config.whatsapp,
          config.NODE_ENV === 'development',
          warn,
          dependencies.now,
          conversation,
        )
      : undefined;
  let messaging: MessagingRuntime | undefined;
  if (config.messaging && config.messaging.provider !== 'cloud-api' && store) {
    messaging = createMessagingRuntime(
      config.messaging,
      store,
      config.NODE_ENV === 'development',
      warn,
      {
        ...(conversation ? { conversation } : {}),
        ...(dependencies.messagingAdapterFactory
          ? { adapterFactory: dependencies.messagingAdapterFactory }
          : {}),
        ...(dependencies.qr ? { qr: dependencies.qr } : {}),
        ...(dependencies.now ? { now: dependencies.now } : {}),
      },
    );
  }
  const payments =
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
    (payments || config.dashboard) && prisma
      ? createCheckoutWorker(
          prisma,
          payments,
          config.checkout,
          () => messaging?.adapter() ?? cloudAdapter,
          warn,
          dependencies.now,
        )
      : undefined;
  let startup: Promise<void> | undefined;
  let stopping = false;
  let cleanup: Promise<void> | undefined;
  const stop = () =>
    (cleanup ??= (async () => {
      stopping = true;
      await startup?.catch(() => {});
      try {
        await checkoutWorker?.stop();
      } finally {
        try {
          await cloudWorker?.stop();
        } finally {
          await messaging?.stop();
        }
      }
    })());
  return {
    start() {
      return (startup ??= (async () => {
        if (stopping) return;
        await messaging?.start();
        if (stopping) return;
        cloudWorker?.start();
        checkoutWorker?.start();
      })());
    },
    stop,
  };
}
