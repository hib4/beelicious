import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app.js';
import { parseHttpEnvironment } from './config.js';

/** A warm function instance reuses one application and its bounded database pool. */
export function createHttpHandler(
  initialize = async () => {
    const config = parseHttpEnvironment(process.env);
    const app = buildApp(config, undefined, { background: false });
    try {
      await app.ready();
      return app;
    } catch {
      await app.close();
      throw new Error('HTTP initialization failed');
    }
  },
) {
  let application: ReturnType<typeof initialize> | undefined;
  return async (request: IncomingMessage, response: ServerResponse) => {
    try {
      application ??= initialize();
      const app = await application;
      app.server.emit('request', request, response);
    } catch (error) {
      application = undefined;
      // Configuration errors contain field names only; never log raw persistence errors.
      console.error(
        error instanceof Error &&
          error.message.startsWith('Invalid environment configuration:')
          ? error.message
          : 'HTTP initialization failed',
      );
      response.statusCode = 503;
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          error: { code: 'unavailable', message: 'Service unavailable' },
        }),
      );
    }
  };
}
