import { afterEach, expect, it, vi } from 'vitest';
import {
  createWhatsAppClient,
  WhatsAppSendError,
} from '../../src/modules/whatsapp/client.js';
import { whatsapp } from './fixtures.js';
afterEach(() => {
  vi.useRealTimers();
});
function setup() {
  const transport = vi.fn<typeof fetch>();
  return { transport, client: createWhatsAppClient(whatsapp, transport) };
}
it('sends an authenticated text request using the configured version and returns the Meta ID', async () => {
  const { client, transport } = setup();
  transport.mockResolvedValue(
    Response.json({ messages: [{ id: 'wamid.outbound' }] }),
  );
  expect(await client.sendTextMessage('15555550101', 'Hello')).toBe(
    'wamid.outbound',
  );
  const [url, options] = transport.mock.calls[0]!;
  expect(url).toBe(
    `https://graph.facebook.com/${whatsapp.graphVersion}/${whatsapp.phoneNumberId}/messages`,
  );
  expect(options?.headers).toEqual({
    Authorization: `Bearer ${whatsapp.accessToken}`,
    'Content-Type': 'application/json',
  });
  expect(JSON.parse(String(options?.body))).toMatchObject({
    messaging_product: 'whatsapp',
    to: '15555550101',
    type: 'text',
    text: { body: 'Hello' },
  });
  expect(options?.signal).toBeInstanceOf(AbortSignal);
  expect(options?.redirect).toBe('error');
});
it.each([
  ['bad', 'Hi'],
  ['+15555550101', 'Hi'],
  ['15555550101', ' '],
  ['15555550101', 'x'.repeat(4097)],
])('validates input without performing HTTP', async (recipient, text) => {
  const { client, transport } = setup();
  await expect(client.sendTextMessage(recipient, text)).rejects.toMatchObject({
    category: 'invalid_input',
  });
  expect(transport).not.toHaveBeenCalled();
});
it('sanitizes authentication failures and never retries in the HTTP client', async () => {
  const { client, transport } = setup();
  transport.mockResolvedValue(
    Response.json(
      { error: { code: 190, message: 'secret-token-sensitive-response' } },
      { status: 401 },
    ),
  );
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).rejects.toMatchObject({
    category: 'authentication',
    retryable: false,
    safeToRetry: false,
    metaCode: 190,
  });
  expect(transport).toHaveBeenCalledOnce();
  try {
    await client.sendTextMessage('15555550101', 'Hi');
  } catch (error) {
    expect(String(error)).not.toContain('secret-token');
  }
});
it('marks explicit rate-limit rejections safe for durable retry', async () => {
  const { client, transport } = setup();
  transport.mockResolvedValue(
    Response.json(
      { error: { code: 130429 } },
      { status: 429, headers: { 'Retry-After': '2' } },
    ),
  );
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).rejects.toMatchObject({
    category: 'rate_limit',
    retryable: true,
    safeToRetry: true,
    retryAfterMs: 2000,
  });
});
it.each([400, 500, 408])('does not blindly retry HTTP %s', async (status) => {
  const { client, transport } = setup();
  transport.mockResolvedValue(
    Response.json({ error: { code: 131000 } }, { status }),
  );
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).rejects.toMatchObject({
    safeToRetry: false,
    category: status === 400 ? 'rejected' : 'uncertain',
  });
  expect(transport).toHaveBeenCalledOnce();
});
it('treats an ambiguous connection failure as unsafe to retry', async () => {
  const { client, transport } = setup();
  transport.mockRejectedValue(new Error('sensitive-network-message'));
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).rejects.toMatchObject({
    category: 'uncertain',
    safeToRetry: false,
    retryable: true,
  });
});
it('enforces a five-second real request deadline', async () => {
  const { client, transport } = setup();
  transport.mockImplementation(
    async (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      }),
  );
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).rejects.toBeInstanceOf(WhatsAppSendError);
  expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
}, 8000);
it('uses the same deadline while reading the response body', async () => {
  const { client, transport } = setup();
  transport.mockImplementation(
    async (_url, options) =>
      ({
        ok: true,
        json: () =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              'abort',
              () => reject(new Error('aborted')),
              { once: true },
            );
          }),
      }) as Response,
  );
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).rejects.toMatchObject({ category: 'uncertain' });
}, 8000);
it('does not resend a successful response without a message ID', async () => {
  const { client, transport } = setup();
  transport.mockResolvedValue(Response.json({}));
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).resolves.toBeUndefined();
  expect(transport).toHaveBeenCalledOnce();
});
it('treats non-JSON errors as ambiguous', async () => {
  const { client, transport } = setup();
  transport.mockResolvedValue(new Response('gateway problem', { status: 502 }));
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).rejects.toMatchObject({ category: 'uncertain', safeToRetry: false });
});

it('classifies provider-declared transient errors without assuming resend safety', async () => {
  const { client, transport } = setup();
  transport.mockResolvedValue(
    Response.json(
      { error: { code: 131000, is_transient: true } },
      { status: 400 },
    ),
  );
  await expect(
    client.sendTextMessage('15555550101', 'Hi'),
  ).rejects.toMatchObject({
    category: 'uncertain',
    retryable: true,
    safeToRetry: false,
  });
});
