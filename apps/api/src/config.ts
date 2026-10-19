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
export type Config = z.infer<typeof environmentSchema>;
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
  return result.data;
}
