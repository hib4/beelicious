import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@beelicious/database';
import type { MessagingAdapter } from '../messaging/types.js';
import { MessagingError } from '../messaging/types.js';
import { fetchQrImage } from './gateway.js';
import { paymentQrCaption } from './messages.js';
import type { CheckoutConfig } from './config.js';
import type { PaymentService } from './payments.js';
// A plain neutral PNG, not a QR code. The caption explicitly identifies simulation.
export const MOCK_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5f8AAAAASUVORK5CYII=',
  'base64',
);
export function createCheckoutWorker(
  db: PrismaClient,
  payments: PaymentService | undefined,
  config: CheckoutConfig | undefined,
  getAdapter: () => MessagingAdapter | undefined,
  warn: (event: string) => void,
  now = () => new Date(),
  imageLoader = fetchQrImage,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let stopping = false;
  const controller = new AbortController();
  async function deliver() {
    const adapter = getAdapter();
    if (!adapter?.connected() || !adapter.accountId()) return;
    const token = randomUUID();
    const time = now();
    // Interrupted transport invocations are never automatically replayed.
    await db.checkoutNotification.updateMany({
      where: {
        state: 'sending',
        leaseUntil: { lt: time },
        order: {
          identity: {
            provider: adapter.provider,
            accountId: adapter.accountId()!,
          },
        },
      },
      data: { state: 'uncertain', leaseToken: null, leaseUntil: null },
    });
    const row = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT n."id" FROM "CheckoutNotification" n JOIN "Order" o ON o."id" = n."orderId" JOIN "CustomerMessagingIdentity" i ON i."id" = o."messagingIdentityId" JOIN "Payment" payment ON payment."orderId" = o."id" WHERE (n."kind" = 'fulfillment' OR (payment."provider" = ${config?.provider ?? 'disabled'} AND payment."merchantId" = ${config?.merchantId ?? 'disabled'})) AND i."provider" = ${adapter.provider} AND i."accountId" = ${adapter.accountId()!} AND n."availableAt" <= ${time} AND NOT EXISTS (SELECT 1 FROM "WhatsAppEvent" inbox WHERE inbox."id" = o."confirmationEventId" AND inbox."state" IN ('pending','processing','sending')) AND (n."state" = 'pending' OR (n."state" = 'processing' AND n."leaseUntil" < ${time})) AND NOT EXISTS (SELECT 1 FROM "CheckoutNotification" earlier JOIN "Order" eo ON eo."id" = earlier."orderId" WHERE eo."sessionId" = o."sessionId" AND earlier."createdAt" < n."createdAt" AND earlier."state" IN ('pending','processing','sending') AND (n."kind" <> 'fulfillment' OR earlier."kind" = 'fulfillment' OR EXISTS (SELECT 1 FROM "Payment" ep WHERE ep."orderId" = eo."id" AND ep."provider" = ${config?.provider ?? 'disabled'} AND ep."merchantId" = ${config?.merchantId ?? 'disabled'}))) ORDER BY n."createdAt", n."id" FOR UPDATE OF n SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.checkoutNotification.update({
        where: { id: rows[0].id },
        data: {
          state: 'processing',
          leaseToken: token,
          leaseUntil: new Date(time.getTime() + 60000),
        },
        include: { order: { include: { payment: true, session: true } } },
      });
    });
    if (!row) return;
    const finish = (state: string) =>
      db.checkoutNotification.updateMany({
        where: { id: row.id, leaseToken: token },
        data: { state, leaseToken: null, leaseUntil: null },
      });
    if (
      !(await adapter.approved(
        row.order.chatId,
        row.order.recipientPhone ?? undefined,
      ))
    ) {
      await finish('blocked');
      return;
    }
    if (
      adapter.provider === 'cloud-api' &&
      time.getTime() - row.order.session.lastInteractionAt.getTime() >= 86400000
    ) {
      await finish('blocked');
      return;
    }
    if (
      row.kind === 'qr' &&
      (!row.order.payment ||
        row.order.payment.status !== 'PENDING' ||
        row.order.payment.expiresAt <= time)
    ) {
      await finish('obsolete');
      return;
    }
    let image: Buffer | undefined;
    try {
      if (row.kind === 'qr' && config)
        image =
          config?.provider === 'mock'
            ? MOCK_IMAGE
            : row.order.payment?.qrCodeUrl
              ? await imageLoader(row.order.payment.qrCodeUrl)
              : undefined;
      if (row.kind === 'qr' && !image) throw new Error('Image unavailable');
    } catch {
      if (row.attempts >= 2) {
        await finish('failed');
        await db.checkoutNotification.createMany({
          data: [
            {
              orderId: row.orderId,
              createdAt: now(),
              availableAt: now(),
              logicalKey: `image-fallback:${row.id}`,
              kind: 'text',
              text: 'Gambar pembayaran belum dapat dikirim. Pembayaran tetap tersimpan. Kirim CEK atau Kirim Ulang QR. Jangan membuat pembayaran baru.',
            },
          ],
          skipDuplicates: true,
        });
      } else
        await db.checkoutNotification.updateMany({
          where: { id: row.id, leaseToken: token },
          data: {
            state: 'pending',
            attempts: { increment: 1 },
            availableAt: new Date(time.getTime() + 30000),
            leaseToken: null,
            leaseUntil: null,
          },
        });
      return;
    }
    if (
      stopping ||
      !adapter.connected() ||
      !(await adapter.approved(
        row.order.chatId,
        row.order.recipientPhone ?? undefined,
      ))
    ) {
      await finish('pending');
      return;
    }
    const claimed = await db.checkoutNotification.updateMany({
      where: { id: row.id, leaseToken: token, leaseUntil: { gt: now() } },
      data: { state: 'sending', attempts: { increment: 1 } },
    });
    if (!claimed.count) return;
    try {
      const route = {
        chatId: row.order.chatId,
        ...(row.order.recipientPhone
          ? { recipientPhone: row.order.recipientPhone }
          : {}),
      };
      const result = image
        ? await adapter.sendImage?.(
            {
              ...route,
              image,
              mimeType: 'image/png',
              caption: paymentQrCaption(
                row.text,
                config!,
                row.order.payment?.qrCodeUrl,
              ),
            },
            controller.signal,
          )
        : await adapter.sendText(
            { ...route, text: row.text },
            controller.signal,
          );
      if (!result) throw new MessagingError('rejected');
      await db.checkoutNotification.updateMany({
        where: { id: row.id, leaseToken: token },
        data: {
          state: 'sent',
          messageId: result.messageId ?? null,
          leaseToken: null,
          leaseUntil: null,
        },
      });
    } catch (e) {
      if (
        e instanceof MessagingError &&
        e.category === 'rate_limit' &&
        e.safeToRetry &&
        row.attempts < 2
      )
        await db.checkoutNotification.updateMany({
          where: { id: row.id, leaseToken: token },
          data: {
            state: 'pending',
            availableAt: new Date(
              now().getTime() + Math.max(e.retryAfterMs, 5000),
            ),
            leaseToken: null,
            leaseUntil: null,
          },
        });
      else await finish('uncertain');
    }
  }
  async function run() {
    try {
      await payments?.tick();
      await deliver();
    } catch {
      warn('checkout_worker_failed');
    }
  }
  function schedule() {
    if (!stopping)
      timer = setTimeout(() => {
        active = run().finally(() => {
          active = undefined;
          schedule();
        });
      }, 1000);
  }
  return {
    start() {
      if (!timer && !stopping) schedule();
    },
    async tick() {
      if (!active && !stopping) {
        active = run();
        try {
          await active;
        } finally {
          active = undefined;
        }
      }
    },
    async stop() {
      stopping = true;
      clearTimeout(timer);
      controller.abort();
      await active;
    },
  };
}
