import {
  paymentInstructions,
  paidConfirmation,
  paymentStatusLabels,
} from './messages.js';
import { createHash, randomUUID } from 'node:crypto';
import { type PrismaClient, type Payment } from '@beelicious/database';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../catalog/validation.js';
import {
  OrderService,
  type CheckoutScope,
  type CheckoutOrder,
  orderInclude,
} from './orders.js';
import { matchesGateway, type CheckoutConfig } from './config.js';
import {
  GatewayError,
  verifySignature,
  parseAmount,
  type GatewayStatus,
  type PaymentGateway,
} from './gateway.js';

export class PaymentService {
  constructor(
    private db: PrismaClient,
    readonly config: CheckoutConfig,
    private gateway: PaymentGateway,
    private now = () => new Date(),
  ) {}
  async request(
    scope: CheckoutScope,
    cancel = false,
    resendEventId?: string,
  ): Promise<CheckoutOrder> {
    return new OrderService(this.db, this.config, this.now).run(
      scope,
      async (tx) => {
        const o = await tx.order.findFirst({
          where: { sessionId: scope.sessionId, customerId: scope.customerId },
          orderBy: { placedAt: 'desc' },
          include: orderInclude,
        });
        if (!o?.payment) throw new DomainError('not_found');
        const p = o.payment;
        if (!matchesGateway(p, this.config)) throw new DomainError('conflict');
        if (
          o.status === 'PENDING_PAYMENT' &&
          (!p.checkedAt ||
            this.now().getTime() - p.checkedAt.getTime() >= 30000 ||
            (cancel && !p.cancelRequested))
        ) {
          o.payment = await tx.payment.update({
            where: { id: p.id },
            data: {
              availableAt: this.now(),
              ...(cancel ? { cancelRequested: true } : {}),
            },
          });
        }
        if (
          resendEventId &&
          !cancel &&
          p.status === 'PENDING' &&
          !p.cancelRequested &&
          p.expiresAt > this.now()
        ) {
          await tx.checkoutNotification.createMany({
            data: [
              {
                orderId: o.id,
                createdAt: this.now(),
                availableAt: this.now(),
                logicalKey: `qr-resend:${resendEventId}`,
                kind: 'qr',
                text: this.instructions(o.orderNumber, p.amount, p.expiresAt),
              },
            ],
            skipDuplicates: true,
          });
        }
        return o;
      },
    );
  }
  instructions(number: string, amount: number, expiry: Date) {
    return paymentInstructions(
      this.config.provider,
      number,
      amount,
      expiry,
      this.config.timezone,
    );
  }
  async tick() {
    const token = randomUUID();
    const now = this.now();
    const payment = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "Payment" WHERE "provider" = ${this.config.provider} AND "merchantId" = ${this.config.merchantId} AND ("status" IN ('INITIATING','PENDING','REQUIRES_REVIEW') OR ("status" IN ('FAILED','CANCELLED','EXPIRED') AND "createdAt" > ${new Date(now.getTime() - 86400000)}) OR EXISTS (SELECT 1 FROM "PaymentEvent" pe WHERE pe."paymentId" = "Payment"."id" AND pe."processingStatus" = 'pending')) AND "availableAt" <= ${now} AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now}) ORDER BY "availableAt", "id" FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!rows[0]) return null;
      return tx.payment.update({
        where: { id: rows[0].id },
        data: {
          leaseToken: token,
          checkedAt: now,
          leaseUntil: new Date(now.getTime() + 60000),
        },
      });
    });
    if (!payment) return;
    try {
      let result: GatewayStatus;
      if (
        !payment.creationStarted &&
        !payment.cancelRequested &&
        payment.expiresAt > now
      ) {
        // The lease token owns the one permitted external creation invocation.
        const changed = await this.db.payment.updateMany({
          where: { id: payment.id, leaseToken: token, creationStarted: false },
          data: { creationStarted: true },
        });
        if (!changed.count) return;
        result = await this.gateway.createPayment({
          reference: payment.providerOrderId,
          paymentId: payment.id,
          amount: payment.amount,
          createdAt: payment.createdAt,
          expiresAt: payment.expiresAt,
        });
      } else if (!payment.creationStarted) {
        // No gateway invocation was possible: local cancellation is safe.
        await this.apply(
          payment,
          token,
          null,
          payment.cancelRequested ? 'cancel' : 'expire',
        );
        return;
      } else
        result = await this.gateway.getPaymentStatus(payment.providerOrderId);
      if (
        result.status === 'pending' &&
        (payment.cancelRequested || payment.expiresAt <= now)
      ) {
        await this.gateway.cancelPayment(payment.providerOrderId);
        result = await this.gateway.getPaymentStatus(payment.providerOrderId);
      }
      await this.apply(payment, token, result);
    } catch (error) {
      const reason =
        error instanceof GatewayError ? error.category : 'unavailable';
      await this.db.payment.updateMany({
        where: { id: payment.id, leaseToken: token },
        data: {
          leaseToken: null,
          leaseUntil: null,
          failures: { increment: 1 },
          availableAt: new Date(
            now.getTime() +
              (payment.failures >= 4
                ? 3600000
                : Math.min(60000 * 2 ** payment.failures, 900000)),
          ),
        },
      });
      if (
        payment.failures >= 4 ||
        reason === 'authentication' ||
        reason === 'invalid_response'
      )
        await this.review(payment.id, reason);
    }
  }
  private async review(paymentId: string, reason: string) {
    const p = await this.db.payment.findUnique({
      where: { id: paymentId },
      include: { order: true },
    });
    if (!p) return;
    await new OrderService(this.db, this.config, this.now).run(
      { customerId: p.order.customerId, sessionId: p.order.sessionId },
      async (tx) => {
        await tx.payment.updateMany({
          where: { id: p.id, status: { not: 'SUCCEEDED' } },
          data: { status: 'REQUIRES_REVIEW' },
        });
        await tx.order.updateMany({
          where: { id: p.orderId, status: { not: 'CONFIRMED' } },
          data: { status: 'REQUIRES_REVIEW', reviewReason: reason },
        });
        await tx.checkoutNotification.createMany({
          data: [
            {
              orderId: p.orderId,
              createdAt: this.now(),
              availableAt: this.now(),
              logicalKey: `review:${p.orderId}`,
              kind: 'text',
              text: `Pesanan ${p.order.orderNumber} memerlukan pemeriksaan pembayaran/pickup. Jangan membayar ulang. Pemenuhan dan pengembalian dana belum dapat dijanjikan.`,
            },
          ],
          skipDuplicates: true,
        });
      },
    );
  }
  async apply(
    claimed: Payment,
    token: string,
    result: GatewayStatus | null,
    localStatus?: string,
  ) {
    const order = await this.db.order.findUniqueOrThrow({
      where: { id: claimed.orderId },
    });
    await new OrderService(this.db, this.config, this.now).run(
      { customerId: order.customerId, sessionId: order.sessionId },
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${claimed.id}::uuid FOR UPDATE`;
        const p = await tx.payment.findFirst({
          where: {
            id: claimed.id,
            leaseToken: token,
            leaseUntil: { gt: this.now() },
          },
          include: { order: { include: orderInclude } },
        });
        if (!p) return;
        const o = p.order;
        await tx.$queryRaw`SELECT "id" FROM "PickupSlot" WHERE "id" = ${o.pickupSlotId}::uuid FOR UPDATE`;
        const status = result?.status ?? localStatus ?? 'unknown';
        const mismatch =
          result &&
          (result.reference !== p.providerOrderId ||
            result.merchantId !== p.merchantId ||
            result.amount !== p.amount ||
            result.currency !== p.currency ||
            result.paymentType !== 'qris' ||
            (p.providerTransactionId &&
              result.transactionId !== p.providerTransactionId) ||
            (status === 'settlement' &&
              result.fraudStatus &&
              result.fraudStatus !== 'accept'));
        const evidence = result
          ? {
              reference: result.reference,
              transactionId: result.transactionId,
              merchantId: result.merchantId,
              amount: result.amount,
              currency: result.currency,
              status: result.status,
              paymentType: result.paymentType,
            }
          : { status, source: 'not_invoked' };
        const eventKey = createHash('sha256')
          .update(JSON.stringify([p.id, evidence]))
          .digest('hex');
        await tx.paymentEvent.createMany({
          data: [
            {
              paymentId: p.id,
              provider: p.provider,
              eventKey,
              eventType: status,
              processingStatus: mismatch ? 'review' : 'verified',
              evidence,
              processedAt: this.now(),
            },
          ],
          skipDuplicates: true,
        });
        await tx.paymentEvent.updateMany({
          where: { paymentId: p.id, processingStatus: 'pending' },
          data: {
            processingStatus: mismatch ? 'review' : 'reconciled',
            processedAt: this.now(),
          },
        });
        const known = [
          'pending',
          'settlement',
          'expire',
          'deny',
          'cancel',
          'failure',
        ].includes(status);
        const review =
          !!mismatch ||
          !known ||
          (status === 'pending' && o.reservation?.status === 'RELEASED');
        const succeeded = !review && status === 'settlement';
        // Never regress financial success, including contradictory late observations.
        if (p.status === 'SUCCEEDED') {
          await tx.payment.update({
            where: { id: p.id },
            data: { leaseToken: null, leaseUntil: null },
          });
          return;
        }
        const next = review
          ? 'REQUIRES_REVIEW'
          : succeeded
            ? 'SUCCEEDED'
            : status === 'pending'
              ? 'PENDING'
              : status === 'expire'
                ? 'EXPIRED'
                : status === 'cancel'
                  ? 'CANCELLED'
                  : 'FAILED';
        // Out-of-order pending cannot revive a terminal failed attempt.
        if (
          ['FAILED', 'EXPIRED', 'CANCELLED'].includes(p.status) &&
          next === 'PENDING'
        ) {
          await tx.payment.update({
            where: { id: p.id },
            data: {
              leaseToken: null,
              leaseUntil: null,
              availableAt: new Date(this.now().getTime() + 3600000),
            },
          });
          return;
        }
        const expiry = result?.expiresAt ?? p.expiresAt;
        await tx.payment.update({
          where: { id: p.id },
          data: {
            status: next,
            ...(result && !mismatch
              ? {
                  providerTransactionId: result.transactionId,
                  ...(result.qrCodeUrl ? { qrCodeUrl: result.qrCodeUrl } : {}),
                }
              : {}),
            expiresAt: expiry,
            ...(succeeded ? { paidAt: result?.paidAt ?? this.now() } : {}),
            checkedAt: this.now(),
            failures: 0,
            availableAt: new Date(this.now().getTime() + 60000),
            leaseToken: null,
            leaseUntil: null,
          },
        });
        if (review) {
          await tx.order.update({
            where: { id: o.id },
            data: {
              status: 'REQUIRES_REVIEW',
              reviewReason: mismatch ? 'provider_mismatch' : 'unknown_status',
            },
          });
          await tx.checkoutNotification.createMany({
            data: [
              {
                orderId: o.id,
                createdAt: this.now(),
                availableAt: this.now(),
                logicalKey: `review:${o.id}`,
                kind: 'text',
                text: `Pesanan ${o.orderNumber} memerlukan pemeriksaan pembayaran/pickup. Jangan membayar ulang. Pemenuhan dan pengembalian dana belum dapat dijanjikan.`,
              },
            ],
            skipDuplicates: true,
          });
        } else if (succeeded) {
          const safe =
            o.reservation?.status === 'HELD' &&
            o.pickupSlot.startsAt > this.now();
          await tx.order.update({
            where: { id: o.id },
            data: {
              status: safe ? 'CONFIRMED' : 'REQUIRES_REVIEW',
              ...(safe && !o.fulfillmentStatus
                ? { fulfillmentStatus: 'NEW' as const }
                : {}),
              confirmedAt: safe ? this.now() : null,
              reviewReason: safe ? null : 'late_settlement',
            },
          });
          if (safe)
            await tx.pickupReservation.update({
              where: { orderId: o.id },
              data: { status: 'CONFIRMED' },
            });
          await tx.checkoutNotification.createMany({
            data: [
              {
                orderId: o.id,
                createdAt: this.now(),
                availableAt: this.now(),
                logicalKey: `settlement:${o.id}`,
                kind: 'text',
                text: safe
                  ? paidConfirmation(
                      p.provider as CheckoutConfig['provider'],
                      {
                        orderNumber: o.orderNumber,
                        tenantName: o.tenantName,
                        pickupAt: o.pickupSlot.startsAt,
                        amount: p.amount,
                      },
                      this.config.timezone,
                    )
                  : `Pembayaran ${o.orderNumber} terverifikasi, tetapi pickup memerlukan pemeriksaan. Jangan membayar ulang. Kami belum dapat menjanjikan pemenuhan atau pengembalian dana.`,
              },
            ],
            skipDuplicates: true,
          });
        } else if (next !== 'PENDING') {
          await tx.order.update({
            where: { id: o.id },
            data: {
              status:
                next === 'EXPIRED' ||
                (!p.cancelRequested && p.expiresAt <= this.now())
                  ? 'EXPIRED'
                  : 'CANCELLED',
            },
          });
          await tx.pickupReservation.updateMany({
            where: { orderId: o.id, status: 'HELD' },
            data: { status: 'RELEASED' },
          });
          await tx.checkoutNotification.createMany({
            data: [
              {
                orderId: o.id,
                createdAt: this.now(),
                availableAt: this.now(),
                logicalKey: `unsuccessful:${o.id}`,
                kind: 'text',
                text: `Pembayaran ${o.orderNumber} tidak berhasil (${paymentStatusLabels[next]}). QR lama tidak boleh digunakan. Kirim CEK untuk melihat pilihan membuat keranjang baru.`,
              },
            ],
            skipDuplicates: true,
          });
        } else {
          await tx.pickupReservation.updateMany({
            where: { orderId: o.id, status: 'HELD' },
            data: { expiresAt: expiry },
          });
          await tx.checkoutNotification.createMany({
            data: [
              {
                orderId: o.id,
                createdAt: this.now(),
                availableAt: this.now(),
                logicalKey: `instructions:${o.id}`,
                kind: 'qr',
                text: this.instructions(o.orderNumber, p.amount, expiry),
              },
            ],
            skipDuplicates: true,
          });
        }
      },
    );
  }
}
const notificationSchema = z.object({
  order_id: z.string().min(1).max(100),
  status_code: z.string().regex(/^\d{3}$/),
  gross_amount: z.string().max(30),
  signature_key: z.string().max(128),
  transaction_id: z.string().min(1).max(100),
  transaction_status: z.string().min(1).max(50),
  merchant_id: z.string().min(1).max(100),
  currency: z.string().max(3),
  payment_type: z.string().max(30),
});
export function registerPaymentWebhook(
  app: FastifyInstance,
  db: PrismaClient,
  config: CheckoutConfig,
) {
  if (config.provider !== 'midtrans') return;
  app.post(
    '/webhooks/midtrans',
    { bodyLimit: 32768 },
    async (request, reply) => {
      const parsed = notificationSchema.safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          error: {
            code: 'invalid_notification',
            message: 'Invalid notification',
          },
        });
      const v = parsed.data;
      if (!verifySignature(v, config.serverKey ?? ''))
        return reply.code(401).send({
          error: { code: 'invalid_signature', message: 'Invalid signature' },
        });
      try {
        const amount = parseAmount(v.gross_amount);
        const p = await db.payment.findFirst({
          where: {
            provider: 'midtrans',
            merchantId: config.merchantId,
            providerOrderId: v.order_id,
          },
        });
        if (!p)
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Payment not found' },
          });
        const evidence = {
          reference: v.order_id,
          transactionId: v.transaction_id,
          status: v.transaction_status,
          merchantId: v.merchant_id,
          amount,
          currency: v.currency,
          paymentType: v.payment_type,
        };
        const eventKey = createHash('sha256')
          .update(JSON.stringify(evidence))
          .digest('hex');
        await db.$transaction(async (tx) => {
          await tx.paymentEvent.createMany({
            data: [
              {
                paymentId: p.id,
                provider: 'midtrans',
                eventKey,
                eventType: v.transaction_status,
                evidence,
              },
            ],
            skipDuplicates: true,
          });
          // Reconcile even terminal payments so late settlement cannot be lost.
          await tx.payment.update({
            where: { id: p.id },
            data: {
              availableAt: new Date(),
            },
          });
        });
        return { received: true };
      } catch (e) {
        if (e instanceof GatewayError)
          return reply.code(400).send({
            error: {
              code: 'invalid_notification',
              message: 'Invalid notification',
            },
          });
        return reply.code(503).send({
          error: {
            code: 'unavailable',
            message: 'Notification storage unavailable',
          },
        });
      }
    },
  );
}
