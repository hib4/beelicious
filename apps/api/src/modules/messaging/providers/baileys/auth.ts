import { chmod, lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import lockfile from 'proper-lockfile';
import { BufferJSON, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { z } from 'zod';

const bytes = z.instanceof(Uint8Array);
const keyPair = z.object({ public: bytes, private: bytes });
const credsSchema = z
  .object({
    noiseKey: keyPair,
    pairingEphemeralKeyPair: keyPair,
    signedIdentityKey: keyPair,
    signedPreKey: z.object({ keyPair, signature: bytes, keyId: z.number() }),
    registrationId: z.number(),
    advSecretKey: z.string().min(1),
    registered: z.boolean(),
    nextPreKeyId: z.number(),
    firstUnuploadedPreKeyId: z.number(),
    accountSettings: z.object({ unarchiveChats: z.boolean() }),
    me: z.object({ id: z.string().min(1) }).optional(),
  })
  .refine((creds) => !creds.registered || !!creds.me);

/** Validate before Baileys' helper can turn a read/parse error into fresh credentials. */
export async function validateAuthDirectory(directory: string): Promise<void> {
  const names = await readdir(directory);
  const json = names.filter((name) => name.endsWith('.json'));
  if (json.length && !json.includes('creds.json'))
    throw new Error('baileys_invalid_auth');
  for (const name of json) {
    const path = join(directory, name);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error('baileys_invalid_auth');
    const value: unknown = JSON.parse(
      await readFile(path, 'utf8'),
      BufferJSON.reviver,
    );
    if (
      value === null ||
      value === undefined ||
      (name === 'creds.json' && !credsSchema.safeParse(value).success)
    )
      throw new Error('baileys_invalid_auth');
    await chmod(path, 0o600);
  }
}
export type LocalAuth = Awaited<ReturnType<typeof useMultiFileAuthState>> & {
  close(): Promise<void>;
};
export async function openLocalAuth(
  directory: string,
  compromised: () => void,
): Promise<LocalAuth> {
  const path = resolve(directory);
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('baileys_invalid_auth');
  await chmod(path, 0o700);
  // Atomic directory lock, heartbeat, and bounded stale recovery across processes.
  const release = await lockfile.lock(path, {
    stale: 60000,
    update: 10000,
    retries: 0,
    onCompromised: compromised,
  });
  try {
    await validateAuthDirectory(path);
    const auth = await useMultiFileAuthState(path);
    let writes: Promise<void> = Promise.resolve();
    const keys = auth.state.keys;
    const protectFiles = async () => {
      for (const name of await readdir(path))
        if (name.endsWith('.json'))
          await chmod(join(path, name), 0o600).catch((error: unknown) => {
            // Key removal may race another completed write; permission errors must surface.
            if (!(
              error instanceof Error &&
              'code' in error &&
              error.code === 'ENOENT'
            ))
              throw error;
          });
    };
    // Serialize all file mutations, including key-store writes, and drain on close.
    function write(task: () => Promise<void>): Promise<void> {
      const next = writes.then(task).then(protectFiles);
      writes = next.catch(() => {
        compromised();
      });
      return next;
    }
    auth.state.keys = {
      ...keys,
      set: (data) =>
        write(async () => {
          await keys.set(data);
        }),
    };
    return {
      state: auth.state,
      saveCreds: () => write(auth.saveCreds),
      async close() {
        await writes;
        await release();
      },
    };
  } catch {
    await release();
    throw new Error('baileys_invalid_auth');
  }
}
