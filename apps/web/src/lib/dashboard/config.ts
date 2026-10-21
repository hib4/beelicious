import { z } from 'zod';
const origin = z.url().refine((value) => {
  const url = new URL(value);
  return (
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === '/' &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname)))
  );
});
/** Server-only configuration; no root .env loader or NEXT_PUBLIC export. */
export function dashboardConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.DASHBOARD_ENABLED !== 'true') return null;
  const result = z
    .object({
      SUPABASE_URL: origin.refine(
        (value) => new URL(value).protocol === 'https:',
      ),
      SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
      DASHBOARD_API_URL: origin,
      DASHBOARD_SITE_URL: origin,
    })
    .safeParse(env);
  if (!result.success) return null;
  return {
    url: result.data.SUPABASE_URL,
    key: result.data.SUPABASE_PUBLISHABLE_KEY,
    apiUrl: result.data.DASHBOARD_API_URL,
    siteUrl: result.data.DASHBOARD_SITE_URL,
  };
}
