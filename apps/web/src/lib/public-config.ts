import { z } from 'zod';
const phone = z.string().regex(/^\+?[1-9]\d{7,14}$/);
export function resolvePublicConfig(input: {
  number?: string | undefined;
  enabled?: string | undefined;
  siteUrl?: string | undefined;
}) {
  const parsed = phone.safeParse(input.number?.trim());
  const number = parsed.success ? parsed.data.replace(/^\+/, '') : undefined;
  const orderingEnabled = input.enabled === 'true' && number !== undefined;
  let siteUrl: string | undefined;
  try {
    const url = new URL(input.siteUrl ?? '');
    if (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    )
      siteUrl = url.origin;
  } catch {
    /* A missing origin must not produce a fabricated canonical URL. */
  }
  return {
    orderingEnabled,
    whatsappUrl: orderingEnabled
      ? `https://wa.me/${number}?text=Halo`
      : undefined,
    siteUrl,
  };
}
export const publicConfig = resolvePublicConfig({
  number: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  enabled: process.env.NEXT_PUBLIC_ORDERING_ENABLED,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
});
