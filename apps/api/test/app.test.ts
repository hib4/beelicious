import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { parseEnvironment } from '../src/config.js';

const config = parseEnvironment({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
});
const apps: ReturnType<typeof buildApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function setup() {
  const database = {
    checkConnection: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  const app = buildApp(config, database);
  apps.push(app);
  return { app, database };
}
describe('health and readiness', () => {
  it('returns the exact health response without querying the database', async () => {
    const { app, database } = setup();
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'beelicious-api',
    });
    expect(database.checkConnection).not.toHaveBeenCalled();
  });
  it('returns readiness success', async () => {
    const { app, database } = setup();
    const response = await app.inject('/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      service: 'beelicious-api',
    });
    expect(database.checkConnection).toHaveBeenCalledOnce();
  });
  it('returns a safe 503 and recovers after a database outage', async () => {
    const { app, database } = setup();
    database.checkConnection.mockRejectedValueOnce(
      new Error('postgresql://secret:password@internal/db'),
    );
    const response = await app.inject('/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'unavailable',
      service: 'beelicious-api',
    });
    expect(response.body).not.toMatch(/secret|password|internal/);
    expect((await app.inject('/health')).statusCode).toBe(200);
    expect((await app.inject('/ready')).statusCode).toBe(200);
  });
  it('disconnects its database when closed', async () => {
    const { app, database } = setup();
    await app.ready();
    await app.close();
    expect(database.disconnect).toHaveBeenCalledOnce();
  });
});
