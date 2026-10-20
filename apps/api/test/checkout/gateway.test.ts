import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { parseCheckout } from '../../src/modules/checkout/config.js';
import {
  createMidtransGateway,
  fetchQrImage,
  parseAmount,
  validQrUrl,
  verifySignature,
} from '../../src/modules/checkout/gateway.js';
import {
  localInstant,
  pickupLabel,
} from '../../src/modules/checkout/pickup.js';
import { MOCK_IMAGE } from '../../src/modules/checkout/notifications.js';
import { createMockAdapter } from '../../src/modules/messaging/providers/mock.js';
import { parseCommand } from '../../src/modules/conversation/commands.js';
const env = {
  NODE_ENV: 'development',
  CONVERSATION_ENABLED: 'true',
  CHECKOUT_ENABLED: 'true',
};
const config = parseCheckout(env)!;
const midtrans = {
  ...config,
  provider: 'midtrans' as const,
  serverKey: 'SB-test-secret-key',
  merchantId: 'M-test',
};
const response = (extra = {}) => ({
  status_code: '201',
  order_id: 'ref',
  transaction_id: 'tx',
  merchant_id: 'M-test',
  gross_amount: '25000.00',
  currency: 'IDR',
  payment_type: 'qris',
  transaction_status: 'pending',
  actions: [
    {
      name: 'generate-qr-code',
      method: 'GET',
      url: 'https://api.sandbox.midtrans.com/v2/qris/abc/qr-code',
    },
  ],
  ...extra,
});
it('defaults to credential-free mock and validates only active credentials', () => {
  expect(config.provider).toBe('mock');
  expect(config.development).toBe(true);
  expect(parseCheckout({ ...env, NODE_ENV: 'test' })?.development).toBe(false);
  expect(config.expiryMinutes).toBe(15);
  expect(parseCheckout({})).toBeUndefined();
  expect(() => parseCheckout({ ...env, PAYMENT_PROVIDER: 'midtrans' })).toThrow(
    'MIDTRANS_SERVER_KEY',
  );
  expect(() => parseCheckout({ ...env, NODE_ENV: 'production' })).toThrow(
    'NODE_ENV',
  );
  expect(() =>
    parseCheckout({ ...env, MIDTRANS_ENVIRONMENT: 'production' }),
  ).toThrow('MIDTRANS_ENVIRONMENT');
  expect(() =>
    parseCheckout({ ...env, PICKUP_TIMEZONE: 'not-a-zone' }),
  ).toThrow('PICKUP_TIMEZONE');
});
it.each(['1.50', '-1', 'NaN', '9007199254740992', '1e3'])(
  'rejects non-integer Rupiah %s',
  (amount) => expect(() => parseAmount(amount)).toThrow(),
);
it('constructs Sandbox QRIS with immutable reference, amount, expiry and Basic auth', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(JSON.stringify(response()), { status: 200 }),
    );
  const gateway = createMidtransGateway(midtrans, transport);
  const result = await gateway.createPayment({
    reference: 'ref',
    amount: 25000,
    paymentId: 'id',
    createdAt: new Date('2026-10-20T03:00:00Z'),
    expiresAt: new Date('2026-10-20T03:15:00Z'),
  });
  expect(result.amount).toBe(25000);
  expect(transport.mock.calls[0]?.[0]).toBe(
    'https://api.sandbox.midtrans.com/v2/charge',
  );
  const init = transport.mock.calls[0]?.[1];
  const body = JSON.parse(String(init?.body));
  expect(body).toMatchObject({
    payment_type: 'qris',
    transaction_details: { order_id: 'ref', gross_amount: 25000 },
    custom_expiry: { expiry_duration: 15, unit: 'minute' },
  });
  expect((init?.headers as Record<string, string>).Authorization).toBe(
    `Basic ${Buffer.from('SB-test-secret-key:').toString('base64')}`,
  );
});
it('normalizes gateway authentication and timeout failures without leaking credentials', async () => {
  const auth = createMidtransGateway(
    midtrans,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"status_code":"401"}', { status: 401 }),
      ),
  );
  await expect(auth.getPaymentStatus('ref')).rejects.toThrow('authentication');
  const timeout = createMidtransGateway(
    midtrans,
    vi.fn<typeof fetch>().mockRejectedValue(new Error('secret personal data')),
  );
  await expect(timeout.getPaymentStatus('ref')).rejects.toThrow('unavailable');
});
it('normalizes authenticated expired status responses with transaction code 407', async () => {
  const gateway = createMidtransGateway(
    midtrans,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          response({ status_code: '407', transaction_status: 'expire' }),
        ),
      ),
  );
  await expect(gateway.getPaymentStatus('ref')).resolves.toMatchObject({
    reference: 'ref',
    status: 'expire',
    amount: 25000,
  });
});
it.each([
  { http: 500, extra: { transaction_status: 'expire' } },
  { http: 401, extra: { transaction_status: 'expire' } },
  { http: 200, extra: { transaction_status: 'pending' } },
  { http: 200, extra: { transaction_status: 'settlement' } },
  {
    http: 200,
    extra: { transaction_status: 'expire', merchant_id: undefined },
  },
])('rejects invalid 407 expiration evidence: %j', async ({ http, extra }) => {
  const gateway = createMidtransGateway(
    midtrans,
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(response({ status_code: '407', ...extra }), {
        status: http,
      }),
    ),
  );
  await expect(gateway.getPaymentStatus('ref')).rejects.toThrow();
});
it('does not accept code 407 as a successful charge or cancellation', async () => {
  const gateway = createMidtransGateway(
    midtrans,
    vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json(
          response({ status_code: '407', transaction_status: 'expire' }),
        ),
      ),
  );
  await expect(
    gateway.createPayment({
      reference: 'ref',
      amount: 25000,
      paymentId: 'id',
      createdAt: new Date(),
      expiresAt: new Date(),
    }),
  ).rejects.toThrow('rejected');
  await expect(gateway.cancelPayment('ref')).rejects.toThrow('rejected');
});
it('verifies signature and rejects modified signature fields', () => {
  const v = {
    order_id: 'ref',
    status_code: '200',
    gross_amount: '25000.00',
    signature_key: createHash('sha512')
      .update('ref20025000.00key')
      .digest('hex'),
  };
  expect(verifySignature(v, 'key')).toBe(true);
  expect(verifySignature({ ...v, gross_amount: '1.00' }, 'key')).toBe(false);
  expect(verifySignature({ ...v, signature_key: 'a' }, 'key')).toBe(false);
});
it.each([
  'http://api.sandbox.midtrans.com/v2/qris/a/qr-code',
  'https://evil.test/v2/qris/a/qr-code',
  'https://api.sandbox.midtrans.com.evil.test/v2/qris/a/qr-code',
  'https://user:pass@api.sandbox.midtrans.com/v2/qris/a/qr-code',
  'https://api.sandbox.midtrans.com/v2/charge',
])('rejects unsafe image URL %s', (url) => expect(validQrUrl(url)).toBe(false));
it('bounds image type, size, redirects and validates PNG bytes', async () => {
  const url = 'https://api.sandbox.midtrans.com/v2/qris/abc/qr-code';
  const transport = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(new Uint8Array(MOCK_IMAGE), {
      headers: { 'content-type': 'image/png' },
    }),
  );
  expect(await fetchQrImage(url, transport)).toEqual(MOCK_IMAGE);
  expect(transport.mock.calls[0]?.[1]?.redirect).toBe('error');
  await expect(
    fetchQrImage(
      url,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('bad', { headers: { 'content-type': 'text/html' } }),
        ),
    ),
  ).rejects.toThrow();
  await expect(
    fetchQrImage(
      url,
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('bad', {
          headers: {
            'content-type': 'image/png',
            'content-length': '2000001',
          },
        }),
      ),
    ),
  ).rejects.toThrow();
});
it('converts Jakarta local times and rejects DST gaps and folds', () => {
  expect(localInstant(2026, 10, 20, 420, 'Asia/Jakarta').toISOString()).toBe(
    '2026-10-20T00:00:00.000Z',
  );
  expect(pickupLabel(new Date('2026-10-20T00:00:00Z'))).toContain('07.00');
  expect(() => localInstant(2026, 3, 8, 150, 'America/New_York')).toThrow();
  expect(() => localInstant(2026, 11, 1, 90, 'America/New_York')).toThrow();
});
it('records mock image metadata and supports payment commands', async () => {
  const adapter = createMockAdapter(['628123456789'], {
    receive: async () => {},
    delivery: async () => {},
    warn: () => {},
  });
  await adapter.start();
  await adapter.sendImage!({
    chatId: '628123456789',
    image: MOCK_IMAGE,
    caption: 'SIMULASI — TIDAK DAPAT DIBAYAR',
    mimeType: 'image/png',
  });
  expect(adapter.images).toHaveLength(1);
  expect(parseCommand(' CEK ')).toEqual({ kind: 'check' });
  expect(parseCommand('Kirim Ulang QR')).toEqual({ kind: 'resend' });
});
it('uploads validated PNG bytes and sends Cloud API media without changing text behavior', async () => {
  const { sendCloudImage } =
    await import('../../src/modules/messaging/images.js');
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{"id":"media-id"}'))
    .mockResolvedValueOnce(new Response('{"messages":[{"id":"wamid-image"}]}'));
  const config = {
    accessToken: 'private',
    phoneNumberId: '123',
    wabaId: '456',
    verifyToken: 'test',
    appSecret: 'test',
    graphVersion: 'v26.0',
    testBotEnabled: true,
    testRecipients: ['628123456789'],
  };
  const result = await sendCloudImage(
    config,
    {
      chatId: '628123456789',
      image: MOCK_IMAGE,
      mimeType: 'image/png',
      caption: 'QRIS Sandbox',
    },
    undefined,
    transport,
  );
  expect(result.messageId).toBe('wamid-image');
  expect(transport.mock.calls[0]?.[0]).toBe(
    'https://graph.facebook.com/v26.0/123/media',
  );
  expect(JSON.parse(String(transport.mock.calls[1]?.[1]?.body))).toMatchObject({
    type: 'image',
    image: { id: 'media-id', caption: 'QRIS Sandbox' },
  });
});
