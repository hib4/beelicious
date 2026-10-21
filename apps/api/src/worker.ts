import qrcode from 'qrcode-terminal';
import { createDatabase } from '@beelicious/database';
import { parseEnvironment } from './config.js';
import { createBackgroundRuntime } from './runtime.js';

async function main() {
  // This entrypoint is deliberately local-only; never pair WhatsApp on Vercel.
  if (process.env.VERCEL || process.env.NODE_ENV !== 'development')
    throw new Error(
      'Local worker requires NODE_ENV=development outside Vercel',
    );
  const config = parseEnvironment(process.env);
  if (!config.messaging && !config.whatsapp)
    throw new Error('Local worker requires WHATSAPP_ENABLED=true');
  const database = createDatabase(config.DATABASE_URL);
  const runtime = createBackgroundRuntime(
    config,
    database,
    {
      ...(process.stdout.isTTY
        ? { qr: (value: string) => qrcode.generate(value, { small: true }) }
        : {}),
    },
    (event) => console.warn(JSON.stringify({ event })),
  );
  let closing: Promise<void> | undefined;
  const shutdown = (exitCode: number) =>
    (closing ??= (async () => {
      const timeout = setTimeout(() => process.exit(1), 10000);
      timeout.unref();
      try {
        await runtime.stop();
      } catch {
        console.error('Local worker cleanup failed');
        exitCode = 1;
      } finally {
        try {
          await database.disconnect();
        } catch {
          console.error('Local worker database cleanup failed');
          exitCode = 1;
        }
        clearTimeout(timeout);
        process.exitCode = exitCode;
      }
    })());
  process.once('SIGINT', () => {
    void shutdown(0);
  });
  process.once('SIGTERM', () => {
    void shutdown(0);
  });
  try {
    await runtime.start();
    console.info('Local messaging and background worker started');
  } catch {
    console.error('Local worker startup failed');
    await shutdown(1);
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error &&
      error.message.startsWith('Invalid environment configuration:')
      ? error.message
      : 'Local worker failed. Check development configuration and connectivity.',
  );
  process.exitCode = 1;
});
