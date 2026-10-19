# Beelicious engineering guide

## Architecture and boundaries

Use a TypeScript modular monolith with npm workspaces. `apps/api` owns HTTP, configuration, logging, and process lifecycle. `packages/database` owns Prisma configuration, migrations, and connections. `packages/shared` contains only reusable types and pure utilities. Dependencies flow from the API to packages; packages must not import the API. Expose packages through their public exports, never through cross-workspace source paths.

Phase 1 contains infrastructure only. Do not add tenants, menus, conversations, carts, orders, pickup scheduling, payments, webhooks, authentication, dashboards, AI, or deployment without an explicit subsequent-phase request. Warung Babe is the planned pilot, not seed data for this phase. Keep future multi-tenant requirements in mind without inventing their schema now.

## Conventions

Use strict TypeScript, ESM, NodeNext resolution, and `.js` extensions in relative TypeScript imports. Keep handwritten sources in `src`, compiled files in `dist`, and tests outside `src`. Prefer small functions and explicit dependencies over abstraction layers. Do not add microservices, Redis, orchestration frameworks, or agents.

Construct Fastify without opening a socket. Only the server entrypoint reads process configuration and installs signal handlers. Each application owns its database instance and disconnects it on close. Liveness is independent of PostgreSQL; readiness executes a real query and must recover after an outage.

## Database

Use Prisma 7 configuration and the PostgreSQL driver adapter. Keep Prisma CLI, client, and adapter versions aligned. Generate the model-free Phase 1 client with `prisma generate` (Prisma 7.10 allows a model-free schema by default). Do not edit generated code or applied migration SQL. Add new migrations for schema changes. `db:migrate` applies checked-in migrations; `db:migrate:dev` authors migrations against a development database. Never reset a database or remove its volume without explicit authorization.

## Security

Never commit `.env`, credentials, tokens, connection URLs with passwords, or generated artifacts. `.env.example` contains placeholders only. Validate configuration before allocating resources; report invalid field names without values. Do not log environment objects, raw database exceptions, authorization headers, or cookies. Do not expose database error details over HTTP. Bind local PostgreSQL to loopback. Preserve existing files and local tool settings.

## Verification

Use `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, and `npm run build`. With local PostgreSQL running, also run `npm run db:migrate` and `npm run test:integration`. Verify the compiled server, outage recovery, and graceful shutdown for lifecycle changes. Unit tests must not require PostgreSQL; integration tests must fail visibly when their required service is unavailable. Report only checks actually run, and distinguish skipped checks from passes.
