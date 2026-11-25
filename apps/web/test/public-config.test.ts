import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_WHATSAPP_NUMBER,
  publicConfig,
  resolvePublicConfig,
} from '../src/lib/public-config';
describe('public WhatsApp configuration', () => {
  it('normalizes international format and starts the recognized greeting', () => {
    expect(
      resolvePublicConfig({ number: '+6281234567890', enabled: 'true' })
        .whatsappUrl,
    ).toBe('https://wa.me/6281234567890?text=Halo');
  });
  it.each([
    '',
    '081234567890',
    '62812@s.whatsapp.net',
    '62812@lid',
    '62 81234567890',
    'https://wa.me/123',
    '123',
    '1234567890123456',
  ])('disables invalid number %s', (number) => {
    expect(
      resolvePublicConfig({ number, enabled: 'true' }).whatsappUrl,
    ).toBeUndefined();
  });
  it.each([undefined, 'false', 'TRUE', '1'])(
    'requires explicit true, received %s',
    (enabled) => {
      expect(
        resolvePublicConfig({ number: '6281234567890', enabled })
          .orderingEnabled,
      ).toBe(false);
    },
  );
  it('defaults to the production ordering number', () => {
    expect(PRODUCTION_WHATSAPP_NUMBER).toBe('628194031422');
    if (
      !process.env.NEXT_PUBLIC_WHATSAPP_NUMBER &&
      !process.env.NEXT_PUBLIC_ORDERING_ENABLED
    )
      expect(publicConfig.whatsappUrl).toBe(
        'https://wa.me/628194031422?text=Halo',
      );
  });
  it('disables missing configuration', () => {
    expect(resolvePublicConfig({}).whatsappUrl).toBeUndefined();
  });
  it.each([
    '',
    'http://example.com',
    'https://user:password@example.com',
    'https://example.com/path',
    'https://example.com/?token=secret',
  ])('rejects unsafe or non-origin site URL %s', (siteUrl) => {
    expect(resolvePublicConfig({ siteUrl }).siteUrl).toBeUndefined();
  });
  it('accepts an explicitly supplied HTTPS origin', () => {
    expect(
      resolvePublicConfig({ siteUrl: 'https://example.com' }).siteUrl,
    ).toBe('https://example.com');
  });
});
