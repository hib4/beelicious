import Fastify from 'fastify';
import { createDatabase, type Database } from '@beelicious/database';
import type { HealthResponse, ReadinessResponse } from '@beelicious/shared';
import type { Config } from './config.js';

export function buildApp(
  config: Config,
  database: Database = createDatabase(config.DATABASE_URL),
) {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
  });
  app.addHook('onClose', async () => {
    await database.disconnect();
  });
  app.get<{ Reply: HealthResponse }>('/health', async () => ({
    status: 'ok',
    service: 'beelicious-api',
  }));
  app.get<{ Reply: ReadinessResponse }>('/ready', async (_request, reply) => {
    try {
      await database.checkConnection();
      return { status: 'ready', service: 'beelicious-api' };
    } catch {
      app.log.warn(
        { event: 'database_unavailable' },
        'Database readiness check failed',
      );
      return reply
        .code(503)
        .send({ status: 'unavailable', service: 'beelicious-api' });
    }
  });
  return app;
}
