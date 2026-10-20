import makeWASocket, {
  DisconnectReason,
  type WASocket,
  type BaileysEventMap,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import type { MessagingConfig } from '../../../../config.js';
import {
  MessagingError,
  textSchema,
  type AdapterCallbacks,
  type MessagingAdapter,
  type SendResult,
} from '../../types.js';
import { openLocalAuth, type LocalAuth } from './auth.js';
import {
  directJid,
  normalizeDelivery,
  normalizeMessage,
  phoneFromJid,
} from './normalize.js';

export interface BaileysDependencies {
  socketFactory?: typeof makeWASocket;
  openAuth?: typeof openLocalAuth;
  qr?: (value: string) => void;
  now?: () => number;
}
// Raw library diagnostics contain private identities and protocol details.
const silentLogger = {
  level: 'silent',
  child() {
    return silentLogger;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};
export function createBaileysAdapter(
  config: MessagingConfig,
  callbacks: AdapterCallbacks,
  dependencies: BaileysDependencies = {},
): MessagingAdapter {
  const now = dependencies.now ?? Date.now;
  const cutoff = now();
  let socket: WASocket | undefined;
  let auth: LocalAuth | undefined;
  let scope: string | undefined;
  let online = false;
  let accepting = false;
  let halted = false;
  let stopping = false;
  let generation = 0;
  let retries = 0;
  let pairingRestarts = 0;
  let openedAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startup: Promise<void> | undefined;
  let transitions = Promise.resolve();
  const tasks = new Set<Promise<void>>();
  let detach = () => {};
  function track(work: Promise<void>) {
    const task = work
      .catch(() => {
        halt('baileys_receipt_failure');
      })
      .finally(() => {
        tasks.delete(task);
      });
    tasks.add(task);
  }
  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  async function retire() {
    generation++;
    online = false;
    detach();
    detach = () => {};
    const old = socket;
    socket = undefined;
    if (old) await old.end(undefined).catch(() => {});
  }
  function enqueue(task: () => Promise<void>) {
    transitions = transitions.then(task).catch(() => {
      halt('baileys_connection_failure');
    });
  }
  function halt(event: string) {
    if (halted || stopping) return;
    halted = true;
    accepting = false;
    online = false;
    clearTimer();
    callbacks.warn(event);
    enqueue(retire);
  }
  function schedule(delay: number) {
    if (timer || halted || stopping || !accepting) return;
    timer = setTimeout(() => {
      timer = undefined;
      enqueue(connect);
    }, delay);
    timer.unref();
  }
  async function connection(update: Partial<ConnectionState>, current: number) {
    if (current !== generation || stopping || halted) return;
    if (update.qr && accepting) {
      if (dependencies.qr) dependencies.qr(update.qr);
      else callbacks.warn('baileys_qr_requires_terminal');
    }
    if (update.connection === 'open') {
      scope = directJid(auth?.state.creds.me?.id ?? socket?.user?.id);
      if (!scope) {
        halt('baileys_invalid_identity');
        return;
      }
      online = true;
      openedAt = now();
      callbacks.warn('baileys_connected');
    }
    if (update.connection !== 'close') return;
    online = false;
    const error = update.lastDisconnect?.error;
    const code =
      error && 'output' in error
        ? (error.output as { statusCode?: number }).statusCode
        : undefined;
    const terminal = [
      DisconnectReason.loggedOut,
      DisconnectReason.badSession,
      DisconnectReason.connectionReplaced,
      DisconnectReason.multideviceMismatch,
      DisconnectReason.forbidden,
    ];
    if (code !== undefined && terminal.includes(code)) {
      halt('baileys_session_stopped');
      return;
    }
    if (openedAt !== undefined && now() - openedAt >= 60000) {
      retries = 0;
      pairingRestarts = 0;
    }
    openedAt = undefined;
    await retire();
    if (code === DisconnectReason.restartRequired && pairingRestarts++ < 2) {
      schedule(0);
      return;
    }
    if (retries >= 6) {
      halt('baileys_reconnect_exhausted');
      return;
    }
    const delay = Math.min(1000 * 2 ** retries++, 30000);
    callbacks.warn('baileys_reconnecting');
    schedule(delay);
  }
  async function connect() {
    if (halted || stopping || !accepting || socket || !auth) return;
    const current = ++generation;
    const sock = (dependencies.socketFactory ?? makeWASocket)({
      auth: auth.state,
      logger: silentLogger,
      connectTimeoutMs: 10000,
      defaultQueryTimeoutMs: 5000,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      markOnlineOnConnect: false,
      emitOwnEvents: false,
      // No application-level resend cache or automatic retry of uncertain sends.
      enableRecentMessageCache: false,
      enableAutoSessionRecreation: false,
      maxMsgRetryCount: 0,
      getMessage: async () => undefined,
      shouldIgnoreJid: (jid) => !directJid(jid),
    });
    socket = sock;
    const valid = () =>
      current === generation && accepting && !halted && !stopping;
    const onConnection = (update: Partial<ConnectionState>) => {
      enqueue(async () => {
        await connection(update, current);
      });
    };
    const onCreds = () => {
      if (valid() && auth)
        track(
          auth.saveCreds().catch(() => {
            halt('baileys_auth_write_failure');
          }),
        );
    };
    const onMessages = (event: BaileysEventMap['messages.upsert']) => {
      if (!valid() || !scope || event.type !== 'notify' || event.requestId)
        return;
      const accountId = scope;
      track(
        (async () => {
          const messages = [];
          for (const raw of event.messages) {
            const message = normalizeMessage(raw, accountId, cutoff, now());
            if (!message) continue;
            if (!message.senderPhone) {
              const phone = phoneFromJid(
                (await sock.signalRepository.lidMapping.getPNForLID(
                  message.chatId,
                )) ?? undefined,
              );
              if (phone) message.senderPhone = phone;
            }
            if (!valid()) return;
            // Unknown/unapproved contacts need no persistent private record.
            if (
              message.senderPhone &&
              config.testRecipients.includes(message.senderPhone)
            )
              messages.push(message);
          }
          if (valid() && messages.length) await callbacks.receive(messages);
        })(),
      );
    };
    const onUpdates = (updates: BaileysEventMap['messages.update']) => {
      if (!valid() || !scope) return;
      const normalized = normalizeDelivery(updates, scope);
      if (normalized.length) track(callbacks.delivery(normalized));
    };
    sock.ev.on('connection.update', onConnection);
    sock.ev.on('creds.update', onCreds);
    sock.ev.on('messages.upsert', onMessages);
    sock.ev.on('messages.update', onUpdates);
    detach = () => {
      sock.ev.off('connection.update', onConnection);
      sock.ev.off('creds.update', onCreds);
      sock.ev.off('messages.upsert', onMessages);
      sock.ev.off('messages.update', onUpdates);
    };
  }
  const adapter: MessagingAdapter = {
    provider: 'baileys',
    accountId: () => scope,
    connected: () => online && !halted && !stopping,
    async start() {
      if (startup) return startup;
      if (stopping) return;
      accepting = true;
      startup = (async () => {
        try {
          auth = await (dependencies.openAuth ?? openLocalAuth)(
            config.authDir!,
            () => {
              halt('baileys_auth_failure');
            },
          );
          if (!stopping && !halted) await connect();
        } catch {
          halt('baileys_auth_invalid_or_locked');
          throw new Error('Baileys initialization failed');
        }
      })();
      return startup;
    },
    pause() {
      accepting = false;
      clearTimer();
    },
    async stop() {
      stopping = true;
      accepting = false;
      online = false;
      clearTimer();
      await startup?.catch(() => {});
      await transitions;
      await retire();
      await Promise.all([...tasks]);
      try {
        try {
          await auth?.saveCreds();
        } finally {
          await auth?.close();
        }
      } catch {
        throw new Error('Baileys shutdown failed');
      } finally {
        auth = undefined;
      }
    },
    async approved(chatId, senderPhone) {
      if (!adapter.connected() || !directJid(chatId)) return false;
      const phone =
        phoneFromJid(chatId) ??
        phoneFromJid(
          (await socket?.signalRepository.lidMapping.getPNForLID(chatId)) ??
            undefined,
        );
      // A phone alias authenticated in the inbound envelope remains valid across restart.
      return config.testRecipients.includes(phone ?? senderPhone ?? '');
    },
    async sendText(message, signal): Promise<SendResult> {
      const chatId = directJid(message.chatId);
      if (!chatId || !textSchema.safeParse(message.text).success)
        throw new MessagingError('invalid_input');
      if (!adapter.connected() || !socket || signal?.aborted)
        throw new MessagingError('unavailable');
      const socketForApproval = socket;
      if (!(await adapter.approved(chatId, message.recipientPhone)))
        throw new MessagingError('rejected');
      if (
        !adapter.connected() ||
        socket !== socketForApproval ||
        signal?.aborted
      )
        throw new MessagingError('unavailable');
      const sock = socket;
      const deadline = AbortSignal.timeout(5000);
      const abort = signal ? AbortSignal.any([signal, deadline]) : deadline;
      let onAbort: () => void = () => {};
      try {
        const sent = await Promise.race([
          sock.sendMessage(chatId, { text: message.text }),
          new Promise<never>((_resolve, reject) => {
            onAbort = () => {
              reject(new MessagingError('uncertain'));
            };
            abort.addEventListener('abort', onAbort, { once: true });
            if (abort.aborted) onAbort();
          }),
        ]);
        return {
          provider: 'baileys',
          status: 'accepted',
          ...(sent?.key.id ? { messageId: sent.key.id } : {}),
        };
      } catch {
        // Once invoked, socket errors/timeouts do not prove the message was rejected.
        throw new MessagingError('uncertain');
      } finally {
        abort.removeEventListener('abort', onAbort);
      }
    },
  };
  return adapter;
}
