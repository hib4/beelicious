import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { parseEnvironment } from '../src/config.js';

it('queries a real PostgreSQL database and closes its pool', async () => {
  const config = parseEnvironment({ ...process.env, NODE_ENV: 'test' });
  const app = buildApp(config);
  try {
    const response = await app.inject('/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      service: 'beelicious-api',
    });
  } finally {
    await app.close();
  }
});
it('returns 503 for an actual refused connection', async () => {
  const config = parseEnvironment({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unavailable',
  });
  const app = buildApp(config);
  try {
    expect((await app.inject('/ready')).statusCode).toBe(503);
    expect((await app.inject('/health')).statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
