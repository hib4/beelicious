import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
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
  WHATSAPP_ENABLED: flag,
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
export type Config = z.infer<typeof environmentSchema> & {
  whatsapp?: WhatsAppConfig;
};
function invalid(fields: string[]): never {
  throw new Error(
    `Invalid environment configuration: ${[...new Set(fields)].join(', ')}`,
  );
}
export function parseEnvironment(
  environment: Record<string, string | undefined>,
): Config {
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
  if (!flags.data.WHATSAPP_ENABLED) {
    if (flags.data.WHATSAPP_TEST_BOT_ENABLED)
      invalid(['WHATSAPP_TEST_BOT_ENABLED']);
    return result.data;
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
