import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it.each(['production', 'test'])(
  'refuses development seeds in %s before connecting',
  (environment) => {
    const cli = fileURLToPath(
      new URL('../../../../packages/database/src/seed-cli.ts', import.meta.url),
    );
    const result = spawnSync(process.execPath, ['--import', 'tsx', cli], {
      env: {
        ...process.env,
        NODE_ENV: environment,
        DATABASE_URL: 'postgresql://private:password@127.0.0.1:1/private',
      },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Development seeding requires NODE_ENV=development and DATABASE_URL.',
    );
    expect(result.stderr).not.toMatch(/password|postgresql|private/);
  },
);
