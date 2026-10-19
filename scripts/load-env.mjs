import { config } from 'dotenv';
import { URL, fileURLToPath } from 'node:url';
config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});
