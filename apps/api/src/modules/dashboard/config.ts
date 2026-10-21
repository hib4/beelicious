import { z } from 'zod';
export interface DashboardConfig {
  url: string;
  key: string;
}
export function parseDashboard(
  env: Record<string, string | undefined>,
): DashboardConfig | undefined {
  if (
    env.DASHBOARD_ENABLED !== undefined &&
    !['true', 'false'].includes(env.DASHBOARD_ENABLED)
  )
    throw new Error('Invalid environment configuration: DASHBOARD_ENABLED');
  if (env.DASHBOARD_ENABLED !== 'true') return undefined;
  const parsed = z
    .object({
      SUPABASE_URL: z.url().refine((v) => new URL(v).protocol === 'https:'),
      SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
    })
    .safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid environment configuration: ${[...new Set(parsed.error.issues.map((i) => i.path.join('.')))].join(', ')}`,
    );
  return {
    url: parsed.data.SUPABASE_URL,
    key: parsed.data.SUPABASE_PUBLISHABLE_KEY,
  };
}
export type IdentityVerifier = (token: string) => Promise<string | null>;
/** Auth server validation, not decoding an untrusted JWT. No session persistence. */
export function createIdentityVerifier(
  config: DashboardConfig,
): IdentityVerifier {
  return async (token) => {
    try {
      const response = await fetch(new URL('/auth/v1/user', config.url), {
        headers: { apikey: config.key, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
      });
      if (!response.ok) return null;
      const parsed = z
        .object({ id: z.uuid() })
        .safeParse(await response.json());
      return parsed.success ? parsed.data.id : null;
    } catch {
      return null;
    }
  };
}
