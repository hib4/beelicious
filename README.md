# Beelicious

Phase 1 foundation for a WhatsApp food ordering platform: a TypeScript modular monolith with a Fastify API and PostgreSQL/Prisma infrastructure. Warung Babe is the planned pilot tenant. Business features and WhatsApp integration are deliberately deferred.

## Prerequisites

- Node.js 24 LTS (`.nvmrc` pins 24.22.0), npm 11, and optionally nvm.
- Docker with Docker Compose and a running Docker engine.
- Available local ports 3000 (API) and 5432 (PostgreSQL).

## Install and configure

Run commands from the repository root:

```bash
nvm install
nvm use
cp .env.example .env
```

Edit `.env` before continuing. Replace the password placeholder in both `POSTGRES_PASSWORD` and `DATABASE_URL` with the same strong local-only password. URL-encode special characters in the URL password. Do not commit this file. All other example values work for a local installation.

```bash
npm ci
docker compose up -d --wait
npm run db:migrate
npm run dev
```

`npm ci` generates Prisma Client and builds the two library packages through the root prepare script. It does not require a running database or `.env`. The API and Prisma commands load the root `.env` without overriding environment variables already supplied by the shell. Docker Compose also reads that file. Do not run with placeholder credentials.

`npm run dev` builds the packages and watches API source files. Restart it after editing shared/database sources. Configuration defaults are development mode, port 3000, and host 127.0.0.1. `DATABASE_URL` is required; invalid configuration prevents startup and reports field names only. Override `HOST` when explicitly exposing the API beyond loopback.

## Endpoints

```bash
curl -i http://127.0.0.1:3000/health
curl -i http://127.0.0.1:3000/ready
```

- `/health`: HTTP 200, `{"status":"ok","service":"beelicious-api"}`. Does not query PostgreSQL.
- `/ready`: real Prisma `SELECT 1`; HTTP 200 with status `ready` or HTTP 503 with status `unavailable`. Both include service `beelicious-api`. Failure responses contain no database details.

The API starts even when PostgreSQL is unavailable. Readiness retries on each request, with bounded connection/query timeouts, and recovers when the database returns. SIGINT/SIGTERM close HTTP connections and the database pool, with a ten-second shutdown deadline. Logs are structured JSON.

## Commands

| Command                                    | Purpose                                                   |
| ------------------------------------------ | --------------------------------------------------------- |
| `npm run dev`                              | Build packages and watch API source                       |
| `npm run build`                            | Generate client and compile all workspaces                |
| `npm start`                                | Start compiled API after building                         |
| `npm run typecheck`                        | Check application, package, test, and configuration types |
| `npm run lint`                             | ESLint                                                    |
| `npm run format`                           | Apply Prettier formatting                                 |
| `npm run format:check`                     | Verify formatting                                         |
| `npm test`                                 | Database-independent Vitest tests                         |
| `npm run test:integration`                 | Real database readiness and refused-connection tests      |
| `npm run db:generate`                      | Generate model-free Prisma Client                         |
| `npm run db:migrate`                       | Apply checked-in migrations using migrate deploy          |
| `npm run db:migrate:dev -- --name example` | Author future development migrations                      |

Run the quality checks:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:integration
```

Integration tests require the configured PostgreSQL database. They do not silently skip missing services and do not create business data. To run the compiled application:

```bash
npm run build
npm start
```

For a manual outage check, keep the API running, run `docker compose stop postgres`, and request both endpoints. Health remains 200 and readiness becomes 503. Run `docker compose start postgres` and retry readiness after PostgreSQL is healthy; it returns 200. Stop the API with Ctrl+C. `docker compose down` stops local services and preserves the named volume; avoid `down -v` unless deliberately deleting local data.

## Project layout and decisions

```text
apps/api/
  src/                 # app construction, environment parser, server lifecycle
  test/                # unit and explicit integration tests
packages/database/
  prisma/              # model-free schema and initial migration
  prisma.config.ts     # CLI configuration and root environment loading
  src/                 # database factory; ignored generated client
packages/shared/src/   # shared response types
scripts/               # root environment loader
```

ESM workspaces resolve through compiled package exports, not TypeScript aliases. Libraries build before the API. All packages are private. There is one PostgreSQL service and no extra application or infrastructure service. Prisma 7 uses its TypeScript client generator and PostgreSQL adapter. The initial migration deliberately creates no business tables; Prisma creates its own migration history. Later phases add domain models through new migrations. See `AGENTS.md` for development boundaries.

## Troubleshooting

- **Docker connection error:** start Docker Desktop or the selected engine, then run `docker info` and retry Compose.
- **Port already allocated:** stop the conflicting service. For another database port, update both the Compose port mapping and `DATABASE_URL`; for the API, change `PORT`.
- **Environment validation error:** check the named field in root `.env`; port must be an integer from 1–65535 and the URL must use `postgres:` or `postgresql:`. Shell environment variables take precedence over `.env`.
- **Database authentication failure:** confirm URL and Compose credentials match. PostgreSQL initializes users/passwords only on the first creation of its data volume; editing `.env` does not change an existing database password. Update the existing database deliberately rather than deleting its volume.
- **Readiness 503:** confirm `docker compose ps` shows healthy PostgreSQL, migrations applied, and the API URL points to the published local port. The API runs on the host; use `127.0.0.1`, not the Compose service name.
- **Missing generated client/package output:** run `npm run build:packages`. If lifecycle scripts were disabled during installation, this step is required. Verify the pinned Node version and reinstall with `npm ci` if necessary.
- **Migration drift:** do not edit the baseline or reset an existing database automatically. Inspect migration status and create a new migration for intended changes. `migrate dev` needs a development user able to create a shadow database; the local Compose user supports that.

No WhatsApp webhooks, tenant/menu data, ordering, payments, authentication, UI, AI features, or production deployment are implemented in Phase 1.
