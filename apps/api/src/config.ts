import {
  parseDashboard,
  type DashboardConfig,
} from './modules/dashboard/config.js';
import {
  parseCheckout,
  type CheckoutConfig,
} from './modules/checkout/config.js';
import { z } from 'zod';
import { relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MessagingProvider } from './modules/messaging/types.js';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  CART_MAX_ITEM_QUANTITY: z.coerce.number().int().min(1).max(1000).default(20),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(?:ql)?:/.test(value), 'Must use PostgreSQL'),
});
const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');
const flagsSchema = z.object({
  MESSAGING_PROVIDER: z
    .enum(['cloud-api', 'baileys', 'mock'])
    .default('cloud-api'),
  WHATSAPP_ENABLED: flag,
  CONVERSATION_ENABLED: flag,
  WHATSAPP_TEST_BOT_ENABLED: flag,
});
const whatsappSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: z.string().trim().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/),
  WHATSAPP_WABA_ID: z.string().regex(/^\d+$/),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().regex(/^v[1-9]\d*\.0$/),
  WHATSAPP_TEST_RECIPIENTS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^[1-9]\d{6,14}$/))),
});
export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  verifyToken: string;
  appSecret: string;
  graphVersion: string;
  testBotEnabled: boolean;
  testRecipients: string[];
}
export interface MessagingConfig {
  provider: MessagingProvider;
  testBotEnabled: boolean;
  testRecipients: string[];
  authDir?: string;
}
const contactsSchema = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().regex(/^[1-9]\d{6,14}$/)));
export type Config = Omit<
  z.infer<typeof environmentSchema>,
  'CART_MAX_ITEM_QUANTITY'
> & {
  CART_MAX_ITEM_QUANTITY?: number;
  checkout?: CheckoutConfig;
  dashboard?: DashboardConfig;
  conversationEnabled?: boolean;
  whatsapp?: WhatsAppConfig;
  messaging?: MessagingConfig;
};
function validAuthPath(path: string): boolean {
  if (!path.trim() || path.includes('\0')) return false;
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const destination = resolve(path);
  const inside = relative(root, destination);
  // Within a checkout, credentials belong only below the ignored .local directory.
  return (
    isAbsolute(inside) ||
    inside.startsWith('../') ||
    inside.startsWith('.local/')
  );
}
function invalid(fields: string[]): never {
  throw new Error(
    `Invalid environment configuration: ${[...new Set(fields)].join(', ')}`,
  );
}
export function parseEnvironment(
  environment: Record<string, string | undefined>,
): Config {
  const checkout = parseCheckout(environment);
  const dashboard = parseDashboard(environment);
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Invalid environment configuration: ${fields.join(', ')}`);
  }
  const flags = flagsSchema.safeParse(environment);
  if (!flags.success)
    invalid(flags.error.issues.map((issue) => issue.path.join('.')));
  if (
    flags.data.CONVERSATION_ENABLED &&
    (!flags.data.WHATSAPP_ENABLED ||
      !flags.data.WHATSAPP_TEST_BOT_ENABLED ||
      result.data.NODE_ENV !== 'development')
  )
    invalid([
      'CONVERSATION_ENABLED',
      'WHATSAPP_ENABLED',
      'WHATSAPP_TEST_BOT_ENABLED',
      'NODE_ENV',
    ]);
  if (!flags.data.WHATSAPP_ENABLED) {
    if (flags.data.WHATSAPP_TEST_BOT_ENABLED)
      invalid(['WHATSAPP_TEST_BOT_ENABLED']);
    return { ...result.data, ...(dashboard ? { dashboard } : {}) };
  }
  const provider = flags.data.MESSAGING_PROVIDER;
  if (provider !== 'cloud-api') {
    const contactsField =
      provider === 'baileys'
        ? 'BAILEYS_ALLOWED_TEST_CONTACTS'
        : 'WHATSAPP_TEST_RECIPIENTS';
    const contacts = contactsSchema.safeParse(environment[contactsField]);
    if (!contacts.success) invalid([contactsField]);
    if (provider === 'baileys' && result.data.NODE_ENV !== 'development')
      invalid(['NODE_ENV', 'MESSAGING_PROVIDER']);
    if (
      flags.data.WHATSAPP_TEST_BOT_ENABLED &&
      (result.data.NODE_ENV !== 'development' || contacts.data.length === 0)
    )
      invalid(['WHATSAPP_TEST_BOT_ENABLED', 'NODE_ENV', contactsField]);
    const authDir = environment.BAILEYS_AUTH_DIR ?? './.local/baileys-auth';
    if (provider === 'baileys' && !validAuthPath(authDir))
      invalid(['BAILEYS_AUTH_DIR']);
    return {
      ...result.data,
      ...(dashboard ? { dashboard } : {}),
      ...(checkout ? { checkout } : {}),
      conversationEnabled: flags.data.CONVERSATION_ENABLED,
      messaging: {
        provider,
        testBotEnabled: flags.data.WHATSAPP_TEST_BOT_ENABLED,
        testRecipients: contacts.data,
        ...(provider === 'baileys' ? { authDir } : {}),
      },
    };
  }
  const whatsapp = whatsappSchema.safeParse(environment);
  if (!whatsapp.success)
    invalid(whatsapp.error.issues.map((issue) => issue.path.join('.')));
  const values = whatsapp.data;
  if (
    flags.data.WHATSAPP_TEST_BOT_ENABLED &&
    (result.data.NODE_ENV !== 'development' ||
      values.WHATSAPP_TEST_RECIPIENTS.length === 0)
  ) {
    invalid([
      'WHATSAPP_TEST_BOT_ENABLED',
      'NODE_ENV',
      'WHATSAPP_TEST_RECIPIENTS',
    ]);
  }
  return {
    ...result.data,
    ...(dashboard ? { dashboard } : {}),
    ...(checkout ? { checkout } : {}),
    conversationEnabled: flags.data.CONVERSATION_ENABLED,
    messaging: {
      provider,
      testBotEnabled: flags.data.WHATSAPP_TEST_BOT_ENABLED,
      testRecipients: values.WHATSAPP_TEST_RECIPIENTS,
    },
    whatsapp: {
      accessToken: values.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: values.WHATSAPP_PHONE_NUMBER_ID,
      wabaId: values.WHATSAPP_WABA_ID,
      verifyToken: values.WHATSAPP_VERIFY_TOKEN,
      appSecret: values.META_APP_SECRET,
      graphVersion: values.META_GRAPH_API_VERSION,
      testBotEnabled: flags.data.WHATSAPP_TEST_BOT_ENABLED,
      testRecipients: values.WHATSAPP_TEST_RECIPIENTS,
    },
  };
}
