import './load-env.mjs';
import { URL } from 'node:url';
import { spawnSync } from 'node:child_process';

try {
  const url = new URL(
    process.env.WHATSAPP_TEST_DATABASE_URL || process.env.DATABASE_URL || '',
  );
  if (!process.env.WHATSAPP_TEST_DATABASE_URL) url.pathname += '_test';
  const development = new URL(process.env.DATABASE_URL || '');
  if (url.host === development.host && url.pathname === development.pathname)
    throw new Error('Use a separate test database');
  if (!url.pathname.endsWith('_test')) throw new Error('Invalid test database');
  const result = spawnSync('npm', ['run', 'db:migrate'], {
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      // Never inherit the development migration URL when targeting the test DB.
      DIRECT_DATABASE_URL: url.toString(),
    },
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} catch {
  console.error(
    'A PostgreSQL test database ending in _test is required. Check DATABASE_URL or WHATSAPP_TEST_DATABASE_URL.',
  );
  process.exitCode = 1;
}
