import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@beelicious/database';
import type { CheckoutConfig } from './config.js';

export class GatewayError extends Error {
  constructor(
    readonly category:
      | 'unavailable'
      | 'authentication'
      | 'rejected'
      | 'not_found'
      | 'invalid_response',
  ) {
    super(`Payment gateway: ${category}`);
  }
}
export interface PaymentRequest {
  reference: string;
  amount: number;
  expiresAt: Date;
  createdAt: Date;
  paymentId: string;
}
export interface GatewayStatus {
  reference: string;
  transactionId: string;
  merchantId: string;
  amount: number;
  currency: string;
  status: string;
  paymentType: string;
  fraudStatus?: string;
  qrCodeUrl?: string;
  expiresAt?: Date;
  paidAt?: Date;
}
export interface PaymentGateway {
  createPayment(input: PaymentRequest): Promise<GatewayStatus>;
  getPaymentStatus(reference: string): Promise<GatewayStatus>;
  cancelPayment(reference: string): Promise<GatewayStatus>;
  getPaymentInstructions(status: GatewayStatus): {
    simulated: boolean;
    qrCodeUrl?: string;
  };
}
export function parseAmount(value: string): number {
  if (!/^\d+(?:\.00)?$/.test(value)) throw new GatewayError('invalid_response');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2147483647)
    throw new GatewayError('invalid_response');
  return amount;
}
export function validQrUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      ['https://api.sandbox.midtrans.com', 'https://api.midtrans.com'].includes(
        u.origin,
      ) &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      /^\/(?:v2|v4)\/qris\/[A-Za-z0-9-]+\/qr-code$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}
const responseSchema = z.object({
  order_id: z.string().min(1),
  transaction_id: z.string().min(1),
  merchant_id: z.string().min(1),
  gross_amount: z.string(),
  currency: z.string(),
  transaction_status: z.string(),
  payment_type: z.string(),
  fraud_status: z.string().optional(),
  expiry_time: z.string().optional(),
  settlement_time: z.string().optional(),
  actions: z
    .array(z.object({ name: z.string(), method: z.string(), url: z.string() }))
    .optional(),
});
function gatewayDate(value: string): Date {
  // Legacy Midtrans timestamps use GMT+7, independent of the tenant timezone.
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    throw new GatewayError('invalid_response');
  const result = new Date(value.replace(' ', 'T') + '+07:00');
  if (!Number.isFinite(result.getTime()))
    throw new GatewayError('invalid_response');
  return result;
}
export function createMidtransGateway(
  config: CheckoutConfig,
  transport: typeof fetch = fetch,
): PaymentGateway {
  const request = async (
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<GatewayStatus> => {
    let response: Response;
    let data: unknown;
    try {
      response = await transport(
        `https://api.sandbox.midtrans.com/v2/${path}`,
        {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
          headers: {
            Authorization: `Basic ${Buffer.from(`${config.serverKey}:`).toString('base64')}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(body && config.webhookUrl
              ? { 'X-Override-Notification': config.webhookUrl }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      data = await response.json();
    } catch {
      throw new GatewayError('unavailable');
    }
    const code =
      typeof data === 'object' && data !== null && 'status_code' in data
        ? String(data.status_code)
        : '';
    if (response.status === 401 || code === '401')
      throw new GatewayError('authentication');
    if (response.status === 404 || code === '404')
      throw new GatewayError('not_found');
    // Status responses report transaction expiration with code 407 even over HTTP 200.
    // This is transaction evidence, not permission to accept a rejected charge.
    const expiredStatus =
      method === 'GET' &&
      path.endsWith('/status') &&
      code === '407' &&
      typeof data === 'object' &&
      data !== null &&
      'transaction_status' in data &&
      data.transaction_status === 'expire';
    if (
      !response.ok ||
      (!['200', '201', '202'].includes(code) && !expiredStatus)
    )
      throw new GatewayError('rejected');
    const p = responseSchema.safeParse(data);
    if (!p.success) throw new GatewayError('invalid_response');
    const v = p.data;
    const qr = v.actions?.find(
      (a) => a.name === 'generate-qr-code' && a.method === 'GET',
    )?.url;
    if (qr && !validQrUrl(qr)) throw new GatewayError('invalid_response');
    return {
      reference: v.order_id,
      transactionId: v.transaction_id,
      merchantId: v.merchant_id,
      amount: parseAmount(v.gross_amount),
      currency: v.currency,
      status: v.transaction_status,
      paymentType: v.payment_type,
      ...(v.fraud_status ? { fraudStatus: v.fraud_status } : {}),
      ...(qr ? { qrCodeUrl: qr } : {}),
      ...(v.expiry_time ? { expiresAt: gatewayDate(v.expiry_time) } : {}),
      ...(v.settlement_time ? { paidAt: gatewayDate(v.settlement_time) } : {}),
    };
  };
  return {
    createPayment: (i) =>
      request('charge', 'POST', {
        payment_type: 'qris',
        qris: { acquirer: 'gopay' },
        transaction_details: { order_id: i.reference, gross_amount: i.amount },
        custom_expiry: {
          order_time: i.createdAt
            .toISOString()
            .replace('T', ' ')
            .replace(/\.\d{3}Z$/, ' +0000'),
          expiry_duration: Math.round(
            (i.expiresAt.getTime() - i.createdAt.getTime()) / 60000,
          ),
          unit: 'minute',
        },
      }),
    getPaymentStatus: (ref) => request(`${encodeURIComponent(ref)}/status`),
    cancelPayment: (ref) =>
      request(`${encodeURIComponent(ref)}/cancel`, 'POST'),
    getPaymentInstructions: (s) => ({
      simulated: false,
      ...(s.qrCodeUrl ? { qrCodeUrl: s.qrCodeUrl } : {}),
    }),
  };
}
export function createMockGateway(
  db: PrismaClient,
  now = () => new Date(),
): PaymentGateway {
  async function status(reference: string): Promise<GatewayStatus> {
    const payment = await db.payment.findFirst({
      where: {
        provider: 'mock',
        merchantId: 'local-mock',
        providerOrderId: reference,
      },
      include: { mockTransaction: true },
    });
    if (!payment?.mockTransaction) throw new GatewayError('not_found');
    const t = payment.mockTransaction;
    return {
      reference,
      transactionId: t.transactionId,
      merchantId: 'local-mock',
      amount: payment.amount,
      currency: 'IDR',
      paymentType: 'qris',
      fraudStatus: 'accept',
      status:
        t.status === 'pending' && payment.expiresAt <= now()
          ? 'expire'
          : t.status,
      expiresAt: payment.expiresAt,
      ...(t.status === 'settlement' ? { paidAt: t.updatedAt } : {}),
    };
  }
  return {
    async createPayment(i) {
      await db.mockPaymentTransaction.upsert({
        where: { paymentId: i.paymentId },
        create: {
          paymentId: i.paymentId,
          transactionId: `mock-${i.paymentId}`,
        },
        update: {},
      });
      return status(i.reference);
    },
    getPaymentStatus: status,
    async cancelPayment(ref) {
      const s = await status(ref);
      if (s.status === 'pending')
        await db.mockPaymentTransaction.updateMany({
          where: { transactionId: s.transactionId, status: 'pending' },
          data: { status: 'cancel' },
        });
      return status(ref);
    },
    getPaymentInstructions: () => ({ simulated: true }),
  };
}
export function verifySignature(
  v: {
    order_id: string;
    status_code: string;
    gross_amount: string;
    signature_key: string;
  },
  key: string,
): boolean {
  if (!/^[a-fA-F0-9]{128}$/.test(v.signature_key)) return false;
  const hash = createHash('sha512')
    .update(v.order_id + v.status_code + v.gross_amount + key)
    .digest();
  return timingSafeEqual(hash, Buffer.from(v.signature_key, 'hex'));
}
export async function fetchQrImage(
  url: string,
  transport: typeof fetch = fetch,
): Promise<Buffer> {
  if (!validQrUrl(url)) throw new GatewayError('invalid_response');
  const response = await transport(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (
    !response.ok ||
    response.headers.get('content-type')?.split(';')[0] !== 'image/png' ||
    Number(response.headers.get('content-length') ?? 0) > 2_000_000
  )
    throw new GatewayError('invalid_response');
  if (!response.body) throw new GatewayError('invalid_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) throw new GatewayError('invalid_response');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const image = Buffer.concat(chunks);
  if (!image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    throw new GatewayError('invalid_response');
  return image;
}
