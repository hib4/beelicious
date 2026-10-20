# Beelicious engineering guide

## Architecture and boundaries

Use a TypeScript modular monolith with npm workspaces. `apps/api` owns HTTP, configuration, logging, and process lifecycle. `packages/database` owns Prisma configuration, migrations, and connections. `packages/shared` contains only reusable types and pure utilities. Dependencies flow from the API to packages; packages must not import the API. Expose packages through their public exports, never through cross-workspace source paths.

Phase 3 adds tenant/catalog/customer services and read-only catalog HTTP endpoints alongside the existing messaging integrations. Warung Babe has only the explicitly supplied development prototype seed. Do not add conversation state machines, carts, orders, pickup scheduling, payments, authentication, dashboards, AI, production phone registration, or deployment without an explicit subsequent-phase request.

## Conventions

Use strict TypeScript, ESM, NodeNext resolution, and `.js` extensions in relative TypeScript imports. Keep handwritten sources in `src`, compiled files in `dist`, and tests outside `src`. Prefer small functions and explicit dependencies over abstraction layers. Do not add microservices, Redis, orchestration frameworks, or agents.

Construct Fastify without opening a socket. Only entrypoints (server and local CLIs) read process configuration; only the server installs signal handlers. Each application owns its database instance and disconnects it on close. Liveness is independent of PostgreSQL; readiness executes a real query and must recover after an outage.

## Database

Use Prisma 7 configuration and the PostgreSQL driver adapter. Keep Prisma CLI, client, and adapter versions aligned. Generate with `prisma generate`. The Phase 1 baseline remains unchanged; Phase 2 adds the WhatsAppEvent infrastructure inbox and Phase 3 adds a separate additive catalog/customer migration. Do not edit generated code or applied migration SQL. Add new migrations for schema changes. `db:migrate` applies checked-in migrations; `db:migrate:dev` authors migrations against a development database. Never reset a database or remove its volume without explicit authorization.

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

## Phase 2B messaging providers

`MESSAGING_PROVIDER` selects `cloud-api` (backward-compatible default), `baileys`, or `mock`; `WHATSAPP_ENABLED` remains the default-off master switch. Initialize only the selected provider and require credentials only for it. Preserve the official Meta client, signed webhook routes, Graph settings, existing deduplication hashes, and retry behavior. Phase 3 authorizes catalog/customer work only; keep all later-phase exclusions in force.

Provider-independent contracts, greeting classification, and the shared durable worker live in `apps/api/src/modules/messaging`. Keep Meta payloads in `modules/whatsapp` and Baileys objects in `messaging/providers/baileys`. Normalize provider/account/message/chat/sender IDs, text, timestamps, type, and direction before business logic. Persist only minimal routing/eligibility metadata and greeting classification, never arbitrary incoming text or raw payloads. Use the existing WhatsAppEvent inbox; no Phase 2B schema migration is required.

Claims and expired-send recovery require provider/account scope, including compatibility for legacy Cloud rows. Never claim or discard another provider's pending work after a configuration switch. PostgreSQL uniqueness remains the deduplication authority. Keep `sending` committed before transport invocation, leases and ownership checks intact, and ambiguous sends uncertain. Only explicit Meta rate-limit rejection has automatic sending retries. Never automatically retry a Baileys send after invocation, including timeout/disconnect. Mock every WhatsApp transport in tests.

Baileys is unofficial, temporary, development-only, and carries account-restriction risk. Use the pinned maintained `@whiskeysockets/baileys` version and consult its installed API declarations/versioned upstream sources before upgrades. No platform evasion, bulk messaging, production support, or unsolicited conversations. Greetings require development mode, explicit bot enablement, and `BAILEYS_ALLOWED_TEST_CONTACTS`, rechecked before sending. Preserve PN/LID routing addresses; approve opaque LIDs only through trusted alternate phone identifiers or Baileys mappings. Unknown identities receive no reply.

Accept only fresh one-to-one incoming original text in notify batches. Ignore self/outgoing messages, groups, broadcasts, newsletters, history/append/placeholder events, media, captions, wrappers, and protocol edits. Enforce the process-start timestamp cutoff with five seconds of skew; committed inbox work retains the 24-hour expiry. Process every eligible message in a batch. Keep delivery updates separate from commands.

Start sockets/workers only on listening, never app construction/injection. Maintain one socket generation/listener set and one bounded reconnect timer. Logout/bad sessions/replaced connections stop reconnecting; never auto-delete authentication. Stop ingress and worker activity before socket/auth cleanup and database disconnect. Halt Baileys ingestion on storage failure; document that replay before database commit is not guaranteed.

Local `useMultiFileAuthState` is permitted only for development. Use the ignored `.local/baileys-auth` default or private storage outside the checkout; never point it at application sources. Validate existing auth before the helper can silently regenerate corrupt credentials. Serialize credential/key writes, use private permissions, and hold the auth-directory lock. The atomic heartbeat lock may need 60 seconds for stale recovery after a crash; never remove a live lock. This is single-host storage, not a production session backend. Auth data is unencrypted and file writes are not crash-atomic. Never log raw library errors, payloads, phone numbers, JIDs, message content, or pairing material. Render QR only to an interactive local terminal, never an HTTP endpoint or structured logs.

Mock records outgoing messages in memory and accepts explicit test injection without public HTTP endpoints. The existing `whatsapp:send` remains a deliberate Cloud-only live CLI; `whatsapp:events` stays safe for all inbox providers. Keep real-device pairing/reception/delivery/restart restoration explicitly unverified until demonstrated; mocks never establish live connectivity.

## Phase 3 domain and catalog

TenantService, MenuCategoryService, MenuService, and CustomerService live in API domain modules. Use the existing application-owned Prisma client through `@beelicious/database` public exports; do not create service-specific pools or import generated workspace source paths. Customer registration remains service-only: do not change the greeting pipeline or register arbitrary inbound contacts. Keep the ignored active development configuration on Baileys and preserve both real adapters and mock.

Models: Tenant -> MenuCategory -> MenuItem; MenuItem also references Tenant. Customer -> CustomerMessagingIdentity is independent of catalog tenants. Use UUID internal IDs and timestamps. Tenant slugs are unique. Every category/item operation requires tenant context. A composite `(tenantId, categoryId)` foreign key enforces category ownership; preserve it in future migrations. Prices are integer Rupiah, validated between zero and PostgreSQL Int maximum; preserve the database nonnegative CHECK. Deterministic category/item order is sortOrder then ID. All foreign-key update/delete rules are restrictive; normal operations deactivate rather than delete. No deletion services or cascade deletion are provided.

Validate service inputs with strict Zod schemas and convert raw persistence failures into sanitized DomainError codes. Never expose raw Prisma errors or values in logs/responses. Public catalog routes use explicit DTO/response schemas and `{ data }` / `{ error: { code, message } }` envelopes. Require active tenants, active categories, and available items; hidden/cross-tenant resources return 404. Do not expose administrative writes or customers until explicitly authorized authentication work exists. Catalog lists are currently unpaginated.

Customer identities are unique by provider/accountId/providerUserId. Use existing normalized accountId and senderId, preserving JIDs/LIDs and provider namespaces; never infer a phone number from an opaque LID or merge by phone equality. Register customer+identity atomically and recover concurrent uniqueness races without orphan customers. Additional identity association requires a trusted caller's independent ownership verification for the exact customer and identity; `verified: true` is an internal contract, not proof or an authentication boundary. This phase implements no verification workflow or inbound association. Never transfer an identity to another customer. PhoneNumber is nullable/reserved and is not populated by current services. Keep PII out of public responses and logs.

`npm run db:seed` explicitly invokes the development-only CLI via Prisma 7 migrations.seed configuration. It creates only Warung Babe, Makanan/Minuman, and the supplied Nasi Goreng Spesial Rp20,000 / Es Teh Manis Rp5,000 prototype examples. Preserve fixed fixture UUIDs, transactional rollback, the seed transaction advisory lock, and existing edits. Reserved-ID/slug ownership conflicts must fail safely. Never seed automatically at startup or run against production. Applied migration SQL must not be edited; future integrity changes need new migrations.

Run `npm run db:migrate:test` before database integration tests. Domain tests use the same guarded separate `_test` database as messaging tests and remove only suite-owned rows in dependency order. Never truncate/reset or seed the development inbox. Test direct invalid database writes, tenant isolation, concurrent registration/association/seeding, identity namespace separation, public visibility and privacy, and messaging regressions. User-confirmed pre-Phase-3 Baileys pairing/greeting success is distinct from a post-change live test; mocks do not verify delivery or restart restoration. Phase 4 may consume these services but is not authorized by Phase 3.
