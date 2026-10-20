import { afterEach, expect, it, vi } from 'vitest';
import { createBaileysAdapter } from '../../src/modules/messaging/providers/baileys/index.js';
import {
  ACCOUNT,
  CHAT,
  LID,
  NOW,
  PHONE,
  authFixture,
  callbacksFixture,
  factoryFor,
  messagingConfig,
  rawMessage,
  socketFixture,
} from './fixtures.js';
const adapters: ReturnType<typeof createBaileysAdapter>[] = [];
afterEach(async () => {
  await Promise.all(adapters.splice(0).map((a) => a.stop()));
  vi.useRealTimers();
});
function setup() {
  const f = socketFixture();
  const auth = authFixture();
  const callbacks = callbacksFixture();
  const qr = vi.fn();
  const factory = factoryFor(f);
  const adapter = createBaileysAdapter(messagingConfig, callbacks, {
    socketFactory: factory,
    openAuth: async () => auth,
    qr,
    now: () => Date.now(),
  });
  adapters.push(adapter);
  return { ...f, auth, callbacks, qr, factory, adapter };
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}
async function connect(f: ReturnType<typeof setup>) {
  await f.adapter.start();
  f.emit('connection.update', { connection: 'open' });
  await flush();
}
it('constructs without connecting, starts once, restores identity, saves creds, and closes without logout', async () => {
  const f = setup();
  expect(f.factory).not.toHaveBeenCalled();
  await Promise.all([f.adapter.start(), f.adapter.start()]);
  expect(f.factory).toHaveBeenCalledOnce();
  f.emit('connection.update', { connection: 'open' });
  f.emit('creds.update', {});
  await flush();
  expect(f.adapter.accountId()).toBe(ACCOUNT);
  expect(f.adapter.connected()).toBe(true);
  expect(f.auth.saveCreds).toHaveBeenCalled();
  await f.adapter.stop();
  expect(f.socket.end).toHaveBeenCalledOnce();
  expect(f.socket.ev.listenerCount('messages.upsert')).toBe(0);
});
it('renders QR only through the injected local callback', async () => {
  const f = setup();
  await f.adapter.start();
  f.emit('connection.update', { qr: 'private-qr' });
  await flush();
  expect(f.qr).toHaveBeenCalledWith('private-qr');
  expect(JSON.stringify(f.callbacks.warn.mock.calls)).not.toContain(
    'private-qr',
  );
});
it('processes multiple fresh messages, approves alternate LIDs, and ignores history/outgoing/groups', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = setup();
  await connect(f);
  f.emit('messages.upsert', { type: 'append', messages: [rawMessage()] });
  f.emit('messages.upsert', {
    type: 'notify',
    requestId: 'history',
    messages: [rawMessage()],
  });
  f.emit('messages.upsert', {
    type: 'notify',
    messages: [
      rawMessage(),
      rawMessage({
        key: { id: 'lid', remoteJid: LID, remoteJidAlt: CHAT, fromMe: false },
      }),
      rawMessage({ key: { id: 'out', remoteJid: CHAT, fromMe: true } }),
      rawMessage({ key: { id: 'group', remoteJid: '1@g.us', fromMe: false } }),
    ],
  });
  await flush();
  expect(f.callbacks.receive).toHaveBeenCalledOnce();
  expect(f.callbacks.receive.mock.calls[0]![0]).toHaveLength(2);
  expect(await f.adapter.approved(LID, PHONE)).toBe(true);
  f.socket.signalRepository.lidMapping.getPNForLID.mockResolvedValue(undefined);
  f.emit('messages.upsert', {
    type: 'notify',
    messages: [
      rawMessage({
        key: { id: 'unresolved', remoteJid: '123@lid', fromMe: false },
      }),
    ],
  });
  await flush();
  expect(f.callbacks.receive).toHaveBeenCalledOnce();
});
it('bounds reconnects, removes old listeners, and does not create simultaneous sockets', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = setup();
  await connect(f);
  const close = () => f.emit('connection.update', { connection: 'close' });
  close();
  close();
  await flush();
  expect(f.socket.ev.listenerCount('messages.upsert')).toBe(0);
  await vi.advanceTimersByTimeAsync(999);
  expect(f.factory).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.factory).toHaveBeenCalledTimes(2);
  for (const delay of [2000, 4000, 8000, 16000, 30000]) {
    close();
    await flush();
    await vi.advanceTimersByTimeAsync(delay);
  }
  expect(f.factory).toHaveBeenCalledTimes(7);
  close();
  await flush();
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.factory).toHaveBeenCalledTimes(7);
  expect(f.callbacks.warn).toHaveBeenCalledWith('baileys_reconnect_exhausted');
});
it('replaces the pairing socket on restart-required and stops after logout', async () => {
  vi.useFakeTimers();
  const f = setup();
  await f.adapter.start();
  const disconnect = (statusCode: number) =>
    f.emit('connection.update', {
      connection: 'close',
      lastDisconnect: {
        date: new Date(),
        error: Object.assign(new Error('private-error'), {
          output: { statusCode },
        }),
      },
    });
  disconnect(515);
  await flush();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.factory).toHaveBeenCalledTimes(2);
  disconnect(401);
  await flush();
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.factory).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(f.callbacks.warn.mock.calls)).not.toContain(
    'private-error',
  );
});
it('handles invalid authentication without creating a socket or printing raw errors', async () => {
  const callbacks = callbacksFixture();
  const factory = factoryFor(socketFixture());
  const adapter = createBaileysAdapter(messagingConfig, callbacks, {
    socketFactory: factory,
    openAuth: async () => {
      throw new Error('private-session');
    },
  });
  adapters.push(adapter);
  await expect(adapter.start()).rejects.toThrow(
    'Baileys initialization failed',
  );
  expect(factory).not.toHaveBeenCalled();
  expect(JSON.stringify(callbacks.warn.mock.calls)).not.toContain(
    'private-session',
  );
});
it('uses documented text sending, validates input, and never retries timed-out sends', async () => {
  vi.useFakeTimers();
  const f = setup();
  await connect(f);
  expect(await f.adapter.sendText({ chatId: CHAT, text: 'Hi' })).toEqual({
    provider: 'baileys',
    status: 'accepted',
    messageId: 'outbound',
  });
  expect(f.socket.sendMessage).toHaveBeenCalledWith(CHAT, { text: 'Hi' });
  await expect(
    f.adapter.sendText({ chatId: 'group@g.us', text: 'Hi' }),
  ).rejects.toMatchObject({ category: 'invalid_input' });
  f.socket.sendMessage.mockImplementationOnce(() => new Promise(() => {}));
  const controller = new AbortController();
  const sending = f.adapter.sendText(
    { chatId: CHAT, text: 'Hi' },
    controller.signal,
  );
  const assertion = expect(sending).rejects.toMatchObject({
    category: 'uncertain',
  });
  await flush();
  controller.abort();
  await assertion;
  expect(f.socket.sendMessage).toHaveBeenCalledTimes(2);
});
it('halts ingestion after persistence failure and preserves privacy', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = setup();
  await connect(f);
  f.callbacks.receive.mockRejectedValueOnce(
    new Error('private content and phone'),
  );
  f.emit('messages.upsert', { type: 'notify', messages: [rawMessage()] });
  await flush();
  expect(f.adapter.connected()).toBe(false);
  expect(f.callbacks.warn).toHaveBeenCalledWith('baileys_receipt_failure');
  expect(JSON.stringify(f.callbacks.warn.mock.calls)).not.toContain(
    'private content',
  );
});
it('handles the five-second send deadline as uncertain without another send', async () => {
  const f = setup();
  await connect(f);
  const deadline = new AbortController();
  const timeout = vi
    .spyOn(AbortSignal, 'timeout')
    .mockReturnValue(deadline.signal);
  f.socket.sendMessage.mockImplementationOnce(() => new Promise(() => {}));
  try {
    const send = f.adapter.sendText({ chatId: CHAT, text: 'Hi' });
    const assertion = expect(send).rejects.toMatchObject({
      category: 'uncertain',
    });
    await flush();
    expect(timeout).toHaveBeenCalledWith(5000);
    deadline.abort();
    await assertion;
    expect(f.socket.sendMessage).toHaveBeenCalledOnce();
  } finally {
    timeout.mockRestore();
  }
});
it('stops on credential persistence failure and suppresses unapproved contacts at send time', async () => {
  const f = setup();
  await connect(f);
  await expect(
    f.adapter.sendText({ chatId: '15555550102@s.whatsapp.net', text: 'Hi' }),
  ).rejects.toMatchObject({ category: 'rejected' });
  expect(f.socket.sendMessage).not.toHaveBeenCalled();
  f.auth.saveCreds = vi
    .fn()
    .mockRejectedValue(new Error('private-credentials'));
  f.emit('creds.update', {});
  await flush();
  expect(f.adapter.connected()).toBe(false);
  expect(f.callbacks.warn).toHaveBeenCalledWith('baileys_auth_write_failure');
  // Stop must still release the auth lock even when the final flush fails.
  await expect(f.adapter.stop()).rejects.toThrow('Baileys shutdown failed');
  expect(f.auth.close).toHaveBeenCalled();
  f.auth.saveCreds = vi.fn().mockResolvedValue(undefined);
});
it('resets reconnect budget only after a stable connection and cancels retries on shutdown', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = setup();
  await connect(f);
  f.emit('connection.update', { connection: 'close' });
  await flush();
  await vi.advanceTimersByTimeAsync(1000);
  f.emit('connection.update', { connection: 'open' });
  await flush();
  await vi.advanceTimersByTimeAsync(60000);
  f.emit('connection.update', { connection: 'close' });
  await flush();
  await vi.advanceTimersByTimeAsync(999);
  expect(f.factory).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(f.factory).toHaveBeenCalledTimes(3);
  f.emit('connection.update', { connection: 'close' });
  await flush();
  await f.adapter.stop();
  await vi.advanceTimersByTimeAsync(120000);
  expect(f.factory).toHaveBeenCalledTimes(3);
});
it('sends validated image bytes through the existing linked socket', async () => {
  const f = setup();
  await connect(f);
  const image = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  await f.adapter.sendImage!({
    chatId: CHAT,
    image,
    mimeType: 'image/png',
    caption: 'QRIS Sandbox',
  });
  expect(f.socket.sendMessage).toHaveBeenCalledWith(CHAT, {
    image,
    mimetype: 'image/png',
    caption: 'QRIS Sandbox',
  });
});
it('delivers Midtrans QR image bytes through Baileys without Facebook Graph requests', async () => {
  const { createMidtransGateway, fetchQrImage } =
    await import('../../src/modules/checkout/gateway.js');
  const { paymentInstructions } =
    await import('../../src/modules/checkout/messages.js');
  const { MOCK_IMAGE } =
    await import('../../src/modules/checkout/notifications.js');
  const qrUrl = 'https://api.sandbox.midtrans.com/v2/qris/qr-test/qr-code';
  const transport = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === 'https://api.sandbox.midtrans.com/v2/charge')
      return new Response(
        JSON.stringify({
          status_code: '201',
          order_id: 'test-ref',
          transaction_id: 'qr-test',
          merchant_id: 'test-merchant',
          gross_amount: '40000.00',
          currency: 'IDR',
          payment_type: 'qris',
          transaction_status: 'pending',
          actions: [{ name: 'generate-qr-code', method: 'GET', url: qrUrl }],
        }),
      );
    if (url === qrUrl)
      return new Response(new Uint8Array(MOCK_IMAGE), {
        headers: { 'content-type': 'image/png' },
      });
    throw new Error('Unexpected external request');
  });
  vi.stubGlobal('fetch', transport);
  try {
    const config = {
      provider: 'midtrans' as const,
      serverKey: 'SB-test-key',
      merchantId: 'test-merchant',
      development: true,
      expiryMinutes: 15,
      slotMinutes: 30,
      capacity: 5,
      leadMinutes: 60,
      bookingDays: 7,
      timezone: 'Asia/Jakarta',
    };
    const createdAt = new Date('2026-10-20T05:00:00Z'),
      expiresAt = new Date('2026-10-20T05:15:00Z');
    const payment = await createMidtransGateway(config).createPayment({
      reference: 'test-ref',
      paymentId: 'test-payment',
      amount: 40000,
      createdAt,
      expiresAt,
    });
    const image = await fetchQrImage(payment.qrCodeUrl!);
    const f = setup();
    await connect(f);
    const caption = paymentInstructions(
      'midtrans',
      'BEE-TEST',
      40000,
      expiresAt,
      config.timezone,
    );
    await f.adapter.sendImage!({
      chatId: CHAT,
      image,
      mimeType: 'image/png',
      caption,
    });
    expect(f.socket.sendMessage).toHaveBeenCalledWith(CHAT, {
      image: MOCK_IMAGE,
      mimetype: 'image/png',
      caption,
    });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      transport.mock.calls.every(([url]) =>
        String(url).startsWith('https://api.sandbox.midtrans.com/'),
      ),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
