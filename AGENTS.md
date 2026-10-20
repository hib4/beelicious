# Beelicious engineering guide

## Architecture and boundaries

Use a TypeScript modular monolith with npm workspaces. `apps/api` owns HTTP, configuration, logging, and process lifecycle. `packages/database` owns Prisma configuration, migrations, and connections. `packages/shared` contains only reusable types and pure utilities. Dependencies flow from the API to packages; packages must not import the API. Expose packages through their public exports, never through cross-workspace source paths.

Phase 2 adds official Meta WhatsApp integration, durable inbox processing, and an approved-recipient development greeting bot only. Do not add tenants, menus, conversation state machines, carts, orders, pickup scheduling, payments, authentication, dashboards, AI, production phone registration, or deployment without an explicit subsequent-phase request. Warung Babe is the planned pilot, not seed data for this phase. Keep future multi-tenant requirements in mind without inventing their schema now.

## Conventions

Use strict TypeScript, ESM, NodeNext resolution, and `.js` extensions in relative TypeScript imports. Keep handwritten sources in `src`, compiled files in `dist`, and tests outside `src`. Prefer small functions and explicit dependencies over abstraction layers. Do not add microservices, Redis, orchestration frameworks, or agents.

Construct Fastify without opening a socket. Only entrypoints (server and local CLIs) read process configuration; only the server installs signal handlers. Each application owns its database instance and disconnects it on close. Liveness is independent of PostgreSQL; readiness executes a real query and must recover after an outage.

## Database

Use Prisma 7 configuration and the PostgreSQL driver adapter. Keep Prisma CLI, client, and adapter versions aligned. Generate with `prisma generate`. The Phase 1 baseline remains unchanged; Phase 2 adds only the WhatsAppEvent infrastructure inbox. Do not edit generated code or applied migration SQL. Add new migrations for schema changes. `db:migrate` applies checked-in migrations; `db:migrate:dev` authors migrations against a development database. Never reset a database or remove its volume without explicit authorization.

## Security

Never commit `.env`, credentials, tokens, connection URLs with passwords, or generated artifacts. `.env.example` contains placeholders only. Validate configuration before allocating resources; report invalid field names without values. Do not log environment objects, raw database exceptions, authorization headers, or cookies. Do not expose database error details over HTTP. Bind local PostgreSQL to loopback. Preserve existing files and local tool settings.

## Verification

Use `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, and `npm run build`. With local PostgreSQL running, also run `npm run db:migrate` and `npm run test:integration`. Verify the compiled server, outage recovery, and graceful shutdown for lifecycle changes. Unit tests must not require PostgreSQL; integration tests must fail visibly when their required service is unavailable. Report only checks actually run, and distinguish skipped checks from passes.

## WhatsApp integration

Keep Meta payloads in `apps/api/src/modules/whatsapp`; future conversation code must use normalized inputs. Never add an unauthenticated send endpoint. Use native fetch, explicit configured Graph version, five-second HTTP deadlines, and typed sanitized failures. The documented v26.0 target requires live account verification; never claim a mock proves Meta delivery.

WhatsApp defaults off. Require all Meta settings when enabled. The greeting bot requires development mode, explicit enablement, and approved recipients, checked again before sending. Preserve account scope, timestamp eligibility, and message/status separation. Store minimal normalized data and greeting classification rather than raw payloads or arbitrary text.

Authenticate raw Buffer bytes with HMAC-SHA256 and timing-safe comparison before JSON parsing. Keep the raw parser encapsulated to webhook routes. Strip query strings from request logs so GET verification tokens cannot leak. Persist relevant batches atomically before HTTP 200; use 503 for storage failure. Unsupported signed events can be acknowledged without work.

PostgreSQL uniqueness owns deduplication. The worker owns retries and uses atomic claims, ownership tokens, and leases. Commit `sending` before HTTP. Reclaim expired pre-send work; never automatically resend interrupted/ambiguous sends. Explicit Meta rate-limit rejections are the only automatic HTTP retry category, up to three total attempts. Preserve `uncertain` records for deliberate investigation; do not reset them or purge deduplication keys casually. Keep worker shutdown ahead of database disconnect. Start workers only when listening, not during app construction/injection.

WhatsApp integration tests use a separate migrated database ending in `_test`, derived from DATABASE_URL unless WHATSAPP_TEST_DATABASE_URL overrides it. Run `npm run db:migrate:test` after creating that database. Never truncate or reset development inbox data. Mock every Meta request in tests, including database-connected tests. Test concurrency, restart recovery, expired leases, ambiguous send suppression, retry scheduling, and logging privacy. Safe inspection is available through `npm run whatsapp:events`; the development-only `whatsapp:send` CLI sends the fixed greeting to the first approved test recipient and is a deliberate live action.
