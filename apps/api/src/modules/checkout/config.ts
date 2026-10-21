import { z } from 'zod';

const schema = z.object({
  CHECKOUT_ENABLED: z.enum(['true', 'false']).default('false'),
  PAYMENT_PROVIDER: z.enum(['mock', 'midtrans']).default('mock'),
  MIDTRANS_ENVIRONMENT: z.literal('sandbox').default('sandbox'),
  PAYMENT_EXPIRY_MINUTES: z.coerce.number().int().min(15).max(60).default(15),
  PICKUP_SLOT_MINUTES: z.coerce.number().int().min(15).max(120).default(30),
  PICKUP_SLOT_CAPACITY: z.coerce.number().int().min(1).max(1000).default(5),
  PICKUP_LEAD_MINUTES: z.coerce.number().int().min(60).max(1440).default(60),
  PICKUP_BOOKING_DAYS: z.coerce.number().int().min(1).max(14).default(7),
  PICKUP_TIMEZONE: z
    .string()
    .default('Asia/Jakarta')
    .refine((v) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
});
export interface CheckoutConfig {
  development: boolean;
  provider: 'mock' | 'midtrans';
  merchantId: string;
  serverKey?: string;
  webhookUrl?: string;
  expiryMinutes: number;
  slotMinutes: number;
  capacity: number;
  leadMinutes: number;
  bookingDays: number;
  timezone: string;
}
export type PickupConfig = Pick<
  CheckoutConfig,
  'slotMinutes' | 'capacity' | 'leadMinutes' | 'bookingDays' | 'timezone'
>;
/** Scheduling is usable by hosted dashboard HTTP without payment credentials. */
export function parsePickupConfig(
  env: Record<string, string | undefined>,
): PickupConfig {
  const parsed = schema
    .pick({
      PICKUP_SLOT_MINUTES: true,
      PICKUP_SLOT_CAPACITY: true,
      PICKUP_LEAD_MINUTES: true,
      PICKUP_BOOKING_DAYS: true,
      PICKUP_TIMEZONE: true,
    })
    .safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid environment configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  const v = parsed.data;
  return {
    slotMinutes: v.PICKUP_SLOT_MINUTES,
    capacity: v.PICKUP_SLOT_CAPACITY,
    leadMinutes: v.PICKUP_LEAD_MINUTES,
    bookingDays: v.PICKUP_BOOKING_DAYS,
    timezone: v.PICKUP_TIMEZONE,
  };
}
export type PaymentWebhookConfig = Pick<
  CheckoutConfig,
  'provider' | 'merchantId' | 'serverKey'
>;
function midtransCredentials(env: Record<string, string | undefined>) {
  const credentials = z
    .object({
      MIDTRANS_SERVER_KEY: z.string().startsWith('SB-').min(10),
      MIDTRANS_MERCHANT_ID: z.string().trim().min(1).max(100),
      PAYMENT_WEBHOOK_URL: z
        .url()
        .refine(
          (url) =>
            new URL(url).protocol === 'https:' &&
            !new URL(url).username &&
            !new URL(url).password,
        )
        .optional(),
    })
    .safeParse(env);
  if (!credentials.success)
    throw new Error(
      `Invalid environment configuration: ${[...new Set(credentials.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  return credentials.data;
}
export function parsePaymentWebhook(
  env: Record<string, string | undefined>,
): PaymentWebhookConfig | undefined {
  if (
    env.PAYMENT_WEBHOOK_ENABLED !== undefined &&
    !['true', 'false'].includes(env.PAYMENT_WEBHOOK_ENABLED)
  )
    throw new Error(
      'Invalid environment configuration: PAYMENT_WEBHOOK_ENABLED',
    );
  if (env.PAYMENT_WEBHOOK_ENABLED !== 'true') return undefined;
  if (
    env.PAYMENT_PROVIDER !== 'midtrans' ||
    (env.MIDTRANS_ENVIRONMENT ?? 'sandbox') !== 'sandbox'
  )
    throw new Error(
      'Invalid environment configuration: PAYMENT_PROVIDER, MIDTRANS_ENVIRONMENT',
    );
  const credentials = midtransCredentials(env);
  return {
    provider: 'midtrans',
    merchantId: credentials.MIDTRANS_MERCHANT_ID,
    serverKey: credentials.MIDTRANS_SERVER_KEY,
  };
}
export function parseCheckout(
  env: Record<string, string | undefined>,
): CheckoutConfig | undefined {
  const parsed = schema.safeParse(env);
  const invalid = (fields: string[]): never => {
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  };
  if (!parsed.success)
    return invalid(parsed.error.issues.map((v) => v.path.join('.')));
  const v = parsed.data;
  if (v.CHECKOUT_ENABLED === 'false') return undefined;
  if (env.NODE_ENV === 'production' || env.CONVERSATION_ENABLED !== 'true')
    invalid(['CHECKOUT_ENABLED', 'NODE_ENV', 'CONVERSATION_ENABLED']);
  if (v.PICKUP_LEAD_MINUTES < v.PAYMENT_EXPIRY_MINUTES + 30)
    invalid(['PICKUP_LEAD_MINUTES', 'PAYMENT_EXPIRY_MINUTES']);
  const credentials =
    v.PAYMENT_PROVIDER === 'midtrans' ? midtransCredentials(env) : undefined;
  return {
    development: env.NODE_ENV === 'development',
    provider: v.PAYMENT_PROVIDER,
    merchantId:
      v.PAYMENT_PROVIDER === 'mock'
        ? 'local-mock'
        : credentials
          ? credentials.MIDTRANS_MERCHANT_ID
          : '',
    ...(v.PAYMENT_PROVIDER === 'midtrans' && credentials
      ? {
          serverKey: credentials.MIDTRANS_SERVER_KEY,
          ...(credentials.PAYMENT_WEBHOOK_URL
            ? { webhookUrl: credentials.PAYMENT_WEBHOOK_URL }
            : {}),
        }
      : {}),
    expiryMinutes: v.PAYMENT_EXPIRY_MINUTES,
    slotMinutes: v.PICKUP_SLOT_MINUTES,
    capacity: v.PICKUP_SLOT_CAPACITY,
    leadMinutes: v.PICKUP_LEAD_MINUTES,
    bookingDays: v.PICKUP_BOOKING_DAYS,
    timezone: v.PICKUP_TIMEZONE,
  };
}

export function matchesGateway(
  payment: { provider: string; merchantId: string },
  config: CheckoutConfig,
): boolean {
  return (
    payment.provider === config.provider &&
    payment.merchantId === config.merchantId
  );
}
