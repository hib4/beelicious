import { Writable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { parsePayload } from '../../src/modules/whatsapp/payload.js';
import {
  config,
  whatsapp,
  payload,
  message,
  signature,
  fakeStore,
} from './fixtures.js';

const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function setup(logging = false) {
  const store = fakeStore();
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(String(chunk));
      callback();
    },
  });
  const sender = {
    sendTextMessage: vi.fn().mockResolvedValue('outbound.fixture'),
  };
  const app = buildApp(
    config,
    { checkConnection: async () => {}, disconnect: async () => {} },
    {
      whatsappEvents: store,
      sender,
      logger: logging ? { stream } : false,
    },
  );
  apps.push(app);
  return { app, store, sender, logs };
}
function post(
  app: ReturnType<typeof buildApp>,
  body: string,
  header: string | undefined = signature(body),
) {
  return app.inject({
    method: 'POST',
    url: '/webhooks/whatsapp',
    headers: {
      'content-type': 'application/json',
      ...(header ? { 'x-hub-signature-256': header } : {}),
    },
    payload: body,
  });
}
it('returns the exact plain-text challenge', async () => {
  const { app } = setup();
  const challenge = '000123 + 🐝';
  const result = await app.inject(
    '/webhooks/whatsapp?' +
      new URLSearchParams({
        'hub.mode': 'subscribe',
        'hub.verify_token': whatsapp.verifyToken,
        'hub.challenge': challenge,
      }),
  );
  expect(result.statusCode).toBe(200);
  expect(result.body).toBe(challenge);
  expect(result.headers['content-type']).toContain('text/plain');
});
it.each([
  'hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1',
  'hub.mode=invalid&hub.verify_token=fixture-verify-token&hub.challenge=1',
  'hub.mode=subscribe&hub.verify_token=fixture-verify-token',
  'hub.mode=subscribe&hub.verify_token=x&hub.verify_token=y&hub.challenge=1',
])('rejects invalid verification: %s', async (query) => {
  expect(
    (await setup().app.inject('/webhooks/whatsapp?' + query)).statusCode,
  ).toBe(403);
});
it('authenticates original whitespace and unicode bytes, records before returning, and does not send inline', async () => {
  const { app, store, sender } = setup();
  let release!: () => void;
  store.receive.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const body = JSON.stringify(payload([message('one', '  HALO 🐝 ')]), null, 2);
  let completed = false;
  const response = post(app, body).then((value) => {
    completed = true;
    return value;
  });
  await vi.waitFor(() => expect(store.receive).toHaveBeenCalledOnce());
  expect(completed).toBe(false);
  release();
  expect((await response).statusCode).toBe(200);
  expect(sender.sendTextMessage).not.toHaveBeenCalled();
});
it.each(['sha256=' + '0'.repeat(64), 'sha256=bad', 'sha1=wrong', 'missing'])(
  'rejects invalid or missing signature before JSON parsing: %s',
  async (header) => {
    const { app, store } = setup();
    expect(
      (await post(app, '{not-json', header === 'missing' ? '' : header))
        .statusCode,
    ).toBe(401);
    expect(store.receive).not.toHaveBeenCalled();
  },
);
it('rejects altered signed bytes', async () => {
  const body = JSON.stringify(payload());
  expect(
    (await post(setup().app, body + ' ', signature(body))).statusCode,
  ).toBe(401);
});
it('rejects authenticated malformed JSON and malformed relevant events', async () => {
  const { app, store } = setup();
  expect((await post(app, '{not-json')).statusCode).toBe(400);
  expect(
    (await post(app, JSON.stringify(payload([{ type: 'text' }])))).statusCode,
  ).toBe(400);
  expect(store.receive).not.toHaveBeenCalled();
});
it('rejects oversized bodies', async () => {
  expect(
    (
      await post(
        setup().app,
        JSON.stringify({ object: 'irrelevant', padding: 'x'.repeat(1048576) }),
      )
    ).statusCode,
  ).toBe(413);
});
it('returns 503 when persistence fails without exposing the underlying error', async () => {
  const { app, store } = setup();
  store.receive.mockRejectedValueOnce(
    new Error('sensitive-database-credentials'),
  );
  const response = await post(app, JSON.stringify(payload()));
  expect(response.statusCode).toBe(503);
  expect(response.body).not.toContain('sensitive');
});
it('preserves JSON parsing in unrelated application routes', async () => {
  const { app } = setup();
  app.post('/ordinary-json', async (request) => ({
    isBuffer: Buffer.isBuffer(request.body),
    body: request.body,
  }));
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/ordinary-json',
        payload: { value: 1 },
      })
    ).json(),
  ).toEqual({ isBuffer: false, body: { value: 1 } });
});
it('logs paths without verification query strings, message bodies, phone numbers, or secrets', async () => {
  const { app, logs } = setup(true);
  await app.inject(
    `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${whatsapp.verifyToken}&hub.challenge=sensitive-challenge`,
  );
  await post(
    app,
    JSON.stringify(payload([message('id', 'private-message-body')])),
  );
  const output = logs.join('');
  expect(output).toContain('/webhooks/whatsapp');
  for (const secret of [
    whatsapp.verifyToken,
    whatsapp.appSecret,
    whatsapp.accessToken,
    'sensitive-challenge',
    '15555550101',
    'private-message-body',
  ])
    expect(output).not.toContain(secret);
});
it('omits webhook routes when disabled', async () => {
  const app = buildApp(
    {
      NODE_ENV: 'test',
      DATABASE_URL: config.DATABASE_URL,
      HOST: '127.0.0.1',
      PORT: 3000,
    },
    { checkConnection: async () => {}, disconnect: async () => {} },
  );
  apps.push(app);
  expect((await app.inject('/webhooks/whatsapp')).statusCode).toBe(404);
});
it('parses multiple nested messages and separates deterministic status identities', () => {
  const input = payload([message('one'), message('two', '  hI  ')]);
  input.entry.push(...payload([message('three')]).entry);
  input.entry[0]!.changes.push(
    ...payload(
      [],
      [
        { id: 'outbound', status: 'delivered', timestamp: '123' },
        { id: 'outbound', status: 'read', timestamp: '124' },
      ],
    ).entry[0]!.changes,
  );
  const events = parsePayload(input, whatsapp);
  expect(events.filter((event) => event.kind === 'message')).toHaveLength(3);
  expect(events.filter((event) => event.kind === 'status')).toHaveLength(2);
  expect(events[0]?.data.greeting).toBe(true);
  expect(events[1]?.data.greeting).toBe(true);
  expect(new Set(events.map((event) => event.dedupKey)).size).toBe(5);
  expect(parsePayload(input, whatsapp)).toEqual(events);
  expect(JSON.stringify(events)).not.toContain('body');
});
it('accepts statuses without a messages array', async () => {
  const input = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: whatsapp.wabaId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: whatsapp.phoneNumberId },
              statuses: [{ id: 'outbound', status: 'sent', timestamp: '123' }],
            },
          },
        ],
      },
    ],
  };
  const { app, store } = setup();
  expect((await post(app, JSON.stringify(input))).statusCode).toBe(200);
  expect(store.receive.mock.calls[0]?.[0][0]?.kind).toBe('status');
});
it('ignores unrelated objects, changes, accounts, and phone scopes', () => {
  expect(
    parsePayload({ object: 'unrelated', entry: 'not-whatsapp' }, whatsapp),
  ).toEqual([]);
  const input = payload();
  input.entry[0]!.changes[0]!.field = 'message_echoes';
  expect(parsePayload(input, whatsapp)).toEqual([]);
  expect(parsePayload(payload(), { ...whatsapp, wabaId: 'other' })).toEqual([]);
  expect(
    parsePayload(payload(), { ...whatsapp, phoneNumberId: 'other' }),
  ).toEqual([]);
});
it('classifies non-text messages and self echoes without creating greetings', () => {
  expect(
    parsePayload(
      payload([
        {
          id: 'image',
          from: '15555550101',
          timestamp: '123',
          type: 'image',
          image: { id: 'media' },
        },
      ]),
      whatsapp,
    )[0]?.data.greeting,
  ).toBe(false);
});
