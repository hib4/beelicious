import { buildApp } from './app.js';
import { parseEnvironment } from './config.js';
import qrcode from 'qrcode-terminal';

async function main() {
  const config = parseEnvironment(process.env);
  const app = buildApp(config, undefined, {
    ...(process.stdout.isTTY
      ? {
          qr: (value: string) => {
            // Pairing material goes only to an interactive local terminal, never JSON logs.
            qrcode.generate(value, { small: true });
          },
        }
      : {}),
  });
  let closing = false;
  async function shutdown(exitCode: number) {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => {
      app.log.error('Graceful shutdown timed out');
      process.exit(1);
    }, 10000);
    timeout.unref();
    try {
      await app.close();
      process.exitCode = exitCode;
    } catch {
      app.log.error('Application cleanup failed');
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  }
  process.once('SIGINT', () => {
    void shutdown(0);
  });
  process.once('SIGTERM', () => {
    void shutdown(0);
  });
  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch {
    app.log.error('Server startup failed');
    await shutdown(1);
  }
}
main().catch((error: unknown) => {
  // Only the configuration parser's field names are safe to print.
  if (
    error instanceof Error &&
    error.message.startsWith('Invalid environment configuration:')
  ) {
    console.error(error.message);
  } else {
    console.error('Application startup failed');
  }
  process.exitCode = 1;
});
