import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { openLocalAuth } from '../../src/modules/messaging/providers/baileys/auth.js';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'beelicious-auth-'));
  dirs.push(path);
  return path;
}
it('persists and restores a session with private permissions and exclusive ownership', async () => {
  const path = await directory();
  const auth = await openLocalAuth(path, vi.fn());
  const secret = auth.state.creds.advSecretKey;
  auth.state.creds.registered = true;
  auth.state.creds.me = { id: '15555550999:1@s.whatsapp.net' };
  await auth.saveCreds();
  await auth.state.keys.set({ 'lid-mapping': { '123_lid': '15555550101' } });
  expect((await stat(path)).mode & 0o777).toBe(0o700);
  expect((await stat(join(path, 'creds.json'))).mode & 0o777).toBe(0o600);
  await expect(openLocalAuth(path, vi.fn())).rejects.toThrow();
  await auth.close();
  const restored = await openLocalAuth(path, vi.fn());
  try {
    expect(restored.state.creds.advSecretKey).toBe(secret);
    expect(restored.state.creds.registered).toBe(true);
    expect(restored.state.creds.me?.id).toBe('15555550999:1@s.whatsapp.net');
    expect(await restored.state.keys.get('lid-mapping', ['123_lid'])).toEqual({
      '123_lid': '15555550101',
    });
  } finally {
    await restored.close();
  }
});
it.each(['{broken', '{}', 'null'])(
  'preserves invalid creds rather than silently replacing them: %s',
  async (value) => {
    const path = await directory();
    await writeFile(join(path, 'creds.json'), value);
    await expect(openLocalAuth(path, vi.fn())).rejects.toThrow(
      'baileys_invalid_auth',
    );
    expect(await readFile(join(path, 'creds.json'), 'utf8')).toBe(value);
  },
);
it('rejects orphaned key files', async () => {
  const path = await directory();
  await writeFile(join(path, 'session-test.json'), '{}');
  await expect(openLocalAuth(path, vi.fn())).rejects.toThrow(
    'baileys_invalid_auth',
  );
});

it('rejects a corrupt key file without replacing the valid credentials', async () => {
  const path = await directory();
  const auth = await openLocalAuth(path, vi.fn());
  await auth.saveCreds();
  await auth.close();
  const before = await readFile(join(path, 'creds.json'), 'utf8');
  await writeFile(join(path, 'session-corrupt.json'), '{broken');
  await expect(openLocalAuth(path, vi.fn())).rejects.toThrow(
    'baileys_invalid_auth',
  );
  expect(await readFile(join(path, 'creds.json'), 'utf8')).toBe(before);
});
