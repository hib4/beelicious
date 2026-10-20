# Beelicious

Phase 3 adds tenant, menu catalog, and customer identity services to the TypeScript/Fastify modular monolith. Baileys is the current development messaging provider; the official Meta Cloud API and mock providers remain available. PostgreSQL backs catalog data and the unchanged durable messaging inbox. Ordering, carts, and payments are not implemented.

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
# Set up the separate integration database as described below first.
npm run test:integration
```

Integration tests require the configured PostgreSQL database and a separate WhatsApp integration database. They fail visibly when a required service or migration is missing. They mock every WhatsApp transport and create only suite-owned synthetic inbox and domain fixtures in the test database. To run the compiled application:

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
  prisma/              # schema and additive infrastructure/catalog migrations
  prisma.config.ts     # CLI configuration and root environment loading
  src/                 # database factory; ignored generated client
packages/shared/src/   # shared response types
scripts/               # root environment loader
```

ESM workspaces resolve through compiled package exports, not TypeScript aliases. Libraries build before the API. All packages are private. There is one PostgreSQL service and no extra application or infrastructure service. Prisma 7 uses its TypeScript client generator and PostgreSQL adapter. The unchanged initial migration creates no business tables. The additive Phase 2 migration adds only `WhatsAppEvent`, the durable integration inbox. The additive Phase 3 migration adds tenant/catalog/customer models and constraints without changing the inbox. See `AGENTS.md` for development boundaries.

## Troubleshooting

- **Docker connection error:** start Docker Desktop or the selected engine, then run `docker info` and retry Compose.
- **Port already allocated:** stop the conflicting service. For another database port, update both the Compose port mapping and `DATABASE_URL`; for the API, change `PORT`.
- **Environment validation error:** check the named field in root `.env`; port must be an integer from 1–65535 and the URL must use `postgres:` or `postgresql:`. Shell environment variables take precedence over `.env`.
- **Database authentication failure:** confirm URL and Compose credentials match. PostgreSQL initializes users/passwords only on the first creation of its data volume; editing `.env` does not change an existing database password. Update the existing database deliberately rather than deleting its volume.
- **Readiness 503:** confirm `docker compose ps` shows healthy PostgreSQL, migrations applied, and the API URL points to the published local port. The API runs on the host; use `127.0.0.1`, not the Compose service name.
- **Missing generated client/package output:** run `npm run build:packages`. If lifecycle scripts were disabled during installation, this step is required. Verify the pinned Node version and reinstall with `npm ci` if necessary.
- **Migration drift:** do not edit the baseline or reset an existing database automatically. Inspect migration status and create a new migration for intended changes. `migrate dev` needs a development user able to create a shadow database; the local Compose user supports that.

## WhatsApp configuration

WhatsApp is **disabled by default**. Phase 1 health endpoints and local setup work without Meta credentials. Enable it only after applying migrations and replacing the example placeholders in the ignored root `.env`.

| Variable                     | Purpose                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `WHATSAPP_ENABLED`           | Literal `true` enables the selected provider and PostgreSQL worker; default `false` |
| `WHATSAPP_ACCESS_TOKEN`      | Meta access token; required when Cloud API is enabled                               |
| `WHATSAPP_PHONE_NUMBER_ID`   | Numeric ID of the Meta test sender, not its display phone number                    |
| `WHATSAPP_WABA_ID`           | Numeric WhatsApp Business Account ID                                                |
| `WHATSAPP_VERIFY_TOKEN`      | Your own private random webhook verification token                                  |
| `META_APP_SECRET`            | App secret from the same Meta app that signs deliveries; not the verify token       |
| `META_GRAPH_API_VERSION`     | Required version in `vNN.0` form; no runtime fallback                               |
| `WHATSAPP_TEST_BOT_ENABLED`  | Literal `true` enables greetings; default `false`; only allowed in development      |
| `WHATSAPP_TEST_RECIPIENTS`   | Comma-separated approved customer numbers in international digits-only format       |
| `WHATSAPP_TEST_DATABASE_URL` | Optional override for the separate integration database; must end in `_test`        |

The example selects **v26.0 as a compatibility target**. This version has not been tested against a live Meta account. The main Meta documentation host returned HTTP 429 during implementation; verify the selected version is available in your app before live testing. The endpoint and payload conventions follow Meta's official collection linked below. Do not silently fall back to another API version.

With WhatsApp enabled and `MESSAGING_PROVIDER=cloud-api` (the default), all six Meta settings are mandatory. Inactive providers require no credentials. An enabled greeting bot also requires `NODE_ENV=development` and a nonempty allowlist; production/test startup rejects that bot setting. Automated worker tests construct development configuration with synthetic credentials and mocked transport. Disabled WhatsApp settings do not affect health checks. Configuration failures print field names only.

### Meta dashboard and HTTPS callback

1. Open [Meta for Developers](https://developers.facebook.com/), create an app with the WhatsApp business-messaging use case, and add/select the WhatsApp product. Dashboard labels can change; use its API Setup/Getting Started page.
2. Select the **Meta test phone number**. Copy its Phone Number ID and WABA ID into `.env`. Obtain the dashboard's temporary access token. Obtain the app secret from app settings and create a separate random verify token. Never paste these into commits, screenshots, or shared terminal output.
3. Add a test recipient in API Setup and complete its verification on the customer's WhatsApp phone. Add the same number, without `+` or spaces, to `WHATSAPP_TEST_RECIPIENTS`. Meta's approved test-recipient list and this application's allowlist are separate requirements.
4. Use a token with `whatsapp_business_messaging` for sending and `whatsapp_business_management` for applicable account/subscription operations, with access to the selected test assets. Token type and app/account access determine the permissions available. Production phone registration and app review are outside this phase.
5. Set `WHATSAPP_ENABLED=true`, `WHATSAPP_TEST_BOT_ENABLED=true`, and `NODE_ENV=development`, then run `npm run db:migrate` and `npm run dev`.
6. Expose port 3000 through a trusted HTTPS tunnel, for example `ngrok http 3000`. Install/configure the tunnel separately; no tunnel dependency or service is added to Beelicious. Its traffic inspector may capture private payloads, so restrict access and avoid exporting captures.
7. Configure the WhatsApp webhook callback as `https://YOUR-TUNNEL-HOST/webhooks/whatsapp` and enter your exact `WHATSAPP_VERIFY_TOKEN`. Meta should issue the GET challenge. A valid challenge returns exact plain text; invalid verification returns 403. Keep the tunnel alive and update the callback whenever its hostname changes.
8. Subscribe to the **messages** webhook field and confirm the app is subscribed to the **correct WABA**. The corresponding operation is `POST https://graph.facebook.com/{version}/{WABA-ID}/subscribed_apps` with Bearer authentication; inspect the subscription through the dashboard or the matching GET operation. The dashboard may perform subscription automatically; verify it rather than relying only on its sample-event Test button.

Authoritative references: [Meta webhook overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview), [Meta error codes](https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes), [official send-text request](https://www.postman.com/meta/whatsapp-business-platform/request/8gvd47s/send-text-message), and [official WABA subscription request](https://www.postman.com/meta/whatsapp-business-platform/request/bw8g53p/subscribe-to-your-waba). Consult the current dashboard/docs for account-specific setup.

### Manual end-to-end checklist

- [ ] Apply migrations; confirm `/health` and `/ready` return 200.
- [ ] Meta verifies the HTTPS callback and subscribes the app to `messages` on the intended WABA.
- [ ] From the approved customer phone, send `Halo` to Meta's test number. This opens the customer-service window. Confirm the exact Beelicious greeting arrives once.
- [ ] Send `  hI  ` as a new message; confirm one new reply. Send other text or media; confirm no reply.
- [ ] Run `npm run whatsapp:send` to send the fixed test greeting to the **first** configured approved recipient. This development-only local CLI has no public endpoint and makes one HTTP attempt. Confirm delivery on the phone; HTTP acceptance alone does not prove delivery. Do not blindly rerun an uncertain attempt.
- [ ] Run `npm run whatsapp:events`; confirm message events complete and status events complete without triggering replies. This command prints only internal event UUIDs, kind, state, attempt count, timestamps, sanitized error codes, and recognized delivery-status values.
- [ ] Re-deliver the same signed message event using a private local fixture if needed; it must not generate another reply. An actual new `Halo` has a new message ID and should receive its own reply.
- [ ] Interrupt/restart the API with pending pre-send work and confirm processing resumes. A crash after a send begins intentionally becomes `uncertain`, rather than automatically sending again.
- [ ] Verify expired/invalid test tokens produce a sanitized authentication failure. Restore the token afterward.

No real Meta test has been performed by this implementation. Live callback verification, selected-version compatibility, and test-phone delivery remain pending manual verification.

### Reception and worker guarantees

`POST /webhooks/whatsapp` verifies HMAC-SHA256 over original request bytes before parsing JSON. Missing/invalid signatures return 401, malformed authenticated payloads return 400, oversized requests return 413, and persistence failures return 503. A valid relevant batch is acknowledged with 200 only after its database transaction commits. Unrelated signed event types/accounts are acknowledged without enqueuing work. Other routes keep their normal JSON parsing.

The module handles multiple entries/changes/messages and status-only payloads. Deduplication separates inbound message IDs from deterministic delivery-status identities. The inbox stores minimal normalized fields and greeting classification, not raw payloads, arbitrary message bodies, contact profiles, or full provider error responses. Sender numbers are stored privately because queued replies need them. Scope checks prevent queued events from being sent through a different account after configuration changes.

The in-process worker polls PostgreSQL every second and claims one event at a time using `FOR UPDATE SKIP LOCKED`, ownership tokens, and 30-second leases. Separate API processes can safely compete. There is no Redis, message broker, or additional worker service. Application construction/injection does not start polling; listening starts it. Shutdown stops claims, aborts HTTP, waits for the worker, and disconnects PostgreSQL.

States: `pending` → `processing` → `sending` → `completed`; ignored events become `ignored`, definitive failures become `failed`, and ambiguous sends become `uncertain`. Expired pre-send leases recover after restart. The worker never reclaims `sending` for another send; an expired sending lease becomes uncertain. Greetings older than 24 hours are ignored rather than sent outside the customer-service window. Delivery status events retain their own status and do not assert that HTTP acceptance means delivery.

The native-fetch client makes one request per call, with a five-second deadline including reading the response, and returns the Meta message ID when supplied. The durable worker is the **only automatic retry owner**. Explicit Meta rate-limit rejections can retry up to three total attempts with 1-/2-second backoff; a supported `Retry-After` can extend each wait to 60 seconds. Longer waits stop retries rather than retrying early. Authentication/input failures do not retry. Timeouts, connection failures, ambiguous server errors, and interrupted sends do not automatically retry, because Meta may already have accepted the message. This favors duplicate prevention over guaranteed replies; exactly-once delivery across PostgreSQL and Meta is not claimed.

Inbox records are retained until deliberately maintained. Restrict database access and backups. Do not delete active rows or reset `uncertain`/completed rows to pending: doing so can duplicate replies. Any later retention policy must preserve deduplication coverage for provider retries and remove private data deliberately; automated retention is outside this phase.

### Separate PostgreSQL integration database

Run once against local Compose PostgreSQL (an existing-database error means it already exists):

```bash
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "${POSTGRES_DB}_test"'
npm run db:migrate:test
npm run test:integration
```

By default, WhatsApp integration tests and `db:migrate:test` derive the database name from `DATABASE_URL` by appending `_test`; connection credentials stay unchanged. For a custom test server, set `WHATSAPP_TEST_DATABASE_URL` in ignored `.env`. The target must end in `_test` and differ from the development database. Tests fail rather than skip when it is unavailable. Use a dedicated database with no real inbox data. Tests delete only their synthetic event keys; they never truncate tables or reset a database. Phase 1 readiness tests still use the ordinary configured database.

### WhatsApp troubleshooting

- **Verification 403:** check mode `subscribe`, the callback path, and the independently selected verify token. The Meta access token and app secret are different values. Request logs intentionally omit query strings.
- **Signature 401:** use the app secret of the app delivering the webhook, not its verify token. HMAC must cover exact original bytes, including whitespace/UTF-8 encoding; JSON reserialization changes the signature. Preserve the signature header and avoid proxy body transformations. Never log the secret/body while debugging.
- **No incoming events:** check the tunnel, `messages` field, app-to-WABA subscription, Phone Number ID/WABA ID scope, and that the customer is writing to the actual Meta test number. A successful dashboard sample test alone does not establish real inbound delivery.
- **Authentication/permission failures:** refresh expired temporary tokens, verify asset access and the required messaging/management permissions, and check app/account restrictions. Inspect numeric HTTP/Meta codes through `whatsapp:events`; raw Meta error messages are deliberately excluded.
- **No bot reply:** confirm development mode, both feature flags, both recipient allowlists, a supported greeting, the 24-hour window, and the inbox state. A repeated delivery of the same message ID is intentionally suppressed.
- **`pending`/`processing`:** verify PostgreSQL and migrations, that the API is actually listening, and allow up to 30 seconds for an interrupted lease to expire. `sending` after a crash becomes `uncertain`; it is not automatically resent.
- **Delivery failure after HTTP success:** inspect separate status-event counts/state using the safe CLI. The CLI includes recognized delivery statuses and numeric error codes while excluding private payload fields. Do not dump sender numbers, raw data, or message identifiers into shared logs. Statuses can arrive out of order; this phase records events independently instead of assuming a monotonic delivery state.

No tenant/menu data, carts, scheduling, orders, payments, user authentication, dashboards, AI features, production phone registration, or production deployment are implemented in Phase 2B.

## Phase 2B: messaging providers

Baileys is temporarily available for local development and internal testing because the Meta Business account is restricted. It is **unofficial**, is not affiliated with WhatsApp, can stop working after protocol changes, and may lead to account restrictions. Use a dedicated internal test account and explicitly approved contacts. There is no platform evasion, bulk messaging, or production support.

### Architecture and provider selection

`apps/api/src/modules/messaging` defines normalized text inputs, sending results/errors, delivery updates, greeting classification, and the shared durable worker. Provider payload parsing stays inside adapters; future conversation code can consume normalized inputs without depending on Meta payloads or Baileys objects. The existing Cloud client, HMAC/raw-byte webhook verification, verification route, Graph configuration, and safe rate-limit retry behavior remain in `modules/whatsapp`.

Exactly one provider runs. `WHATSAPP_ENABLED=false` remains the default master switch. `MESSAGING_PROVIDER` defaults to `cloud-api`; setting it alone does not enable messaging. Switching providers requires a server restart. The worker claims only its provider/account scope, including compatible legacy Cloud rows, so another provider's pending messages remain untouched. Existing Cloud deduplication keys are preserved. New providers use account/provider-scoped keys in the existing `WhatsAppEvent` table; no new migration or business model is needed.

| Variable                        | Default                 | Behavior                                                |
| ------------------------------- | ----------------------- | ------------------------------------------------------- |
| `MESSAGING_PROVIDER`            | `cloud-api`             | `cloud-api`, `baileys`, or `mock`                       |
| `WHATSAPP_ENABLED`              | `false`                 | Master switch for the selected provider                 |
| `WHATSAPP_TEST_BOT_ENABLED`     | `false`                 | Greeting replies require this flag and development mode |
| `BAILEYS_AUTH_DIR`              | `./.local/baileys-auth` | Private local linked-device session directory           |
| `BAILEYS_ALLOWED_TEST_CONTACTS` | empty                   | Comma-separated international digits-only phone numbers |
| `WHATSAPP_TEST_RECIPIENTS`      | empty                   | Approved contacts for Cloud API and mock greetings      |

Only the active provider's settings are validated. Baileys is rejected outside `NODE_ENV=development`; it and mock require no Meta settings. `DATABASE_URL` remains required for every provider. An enabled greeting bot requires a nonempty active-provider allowlist. Configuration errors report field names only.

### Connect Baileys with QR authentication

1. Apply existing migrations with `npm run db:migrate`.
2. Edit the ignored root `.env`:

   ```dotenv
   NODE_ENV=development
   WHATSAPP_ENABLED=true
   MESSAGING_PROVIDER=baileys
   WHATSAPP_TEST_BOT_ENABLED=true
   BAILEYS_AUTH_DIR=./.local/baileys-auth
   BAILEYS_ALLOWED_TEST_CONTACTS=REPLACE_WITH_APPROVED_TEST_NUMBER
   ```

   Replace the allowlist placeholder with the test customer's international number, digits only. Keep the existing database configuration. Meta credentials may remain unset.

3. Run `npm run dev` in an interactive local terminal. A QR code appears only there; QR material is excluded from structured logs and HTTP endpoints. Redirected/noninteractive output emits `baileys_qr_requires_terminal` instead. No HTTPS tunnel or webhook subscription is required.
4. On the account being linked, open WhatsApp **Linked Devices**, choose **Link a Device**, and scan the QR. This does not override a WhatsApp account restriction.
5. Wait for the sanitized `baileys_connected` event. From a separate approved customer account, send `Halo` or `  hI  `. Each new message should receive exactly:

   ```text
   Halo! Selamat datang di Beelicious 🐝

   Koneksi WhatsApp berhasil. Fitur pemesanan makanan akan segera tersedia.
   ```

6. Send unsupported text, a group message, or a message from an unapproved contact: expect no reply. Outgoing echoes and delivery updates never become incoming commands.
7. Stop with Ctrl+C and restart with the same auth directory. A valid saved session should reconnect without scanning again. Send a new greeting after reconnection and confirm one reply. `npm run whatsapp:events` safely inspects processing states without printing message text, sender numbers, or private provider IDs.

Baileys is pinned to `@whiskeysockets/baileys@7.0.0-rc14`; the implementation follows its installed types and APIs. Text sends use `sendMessage(jid, { text })`. PN JIDs and opaque LIDs are preserved for routing. LID approval requires a phone alias authenticated in the incoming envelope or a mapping known to Baileys; unknown LIDs are ignored, never treated as phone numbers. Supported inbound forms are original `conversation` and `extendedTextMessage.text`; media, captions, protocol edits, wrappers, groups, broadcasts, and newsletters are ignored.

Only fresh `notify` messages are accepted: timestamps must be at or after process startup, with five seconds of clock skew allowed. History, append, and placeholder-recovery events are ignored. Messages sent while the server was stopped may receive no reply. Already committed inbox work can recover after restart and retains the existing 24-hour expiry.

### Session storage, lifecycle, and recovery

The entire `.local/` directory is ignored by Git. Auth data contains long-lived credentials and Signal keys: do not copy it into source folders, public directories, screenshots, logs, or shared backups. Paths inside this checkout must be below `.local/`; an absolute path outside the checkout is also supported. The directory is private (`0700`), credential files are restricted (`0600`), and auth updates are serialized and drained during shutdown. Local filesystem storage is unencrypted and suitable only for local testing, not production or shared/network storage.

One process owns an auth directory through `proper-lockfile`'s atomic lock and heartbeat. A second process is refused; after a crash stale-lock recovery can take up to 60 seconds. Do not manually remove a live lock. Avoid running multiple clones against the same linked account, even with separate directories. A compromised lock stops the adapter.

Transient disconnects have six bounded reconnect attempts with delays of 1, 2, 4, 8, 16, and 30 seconds. A connection stable for 60 seconds resets that budget. Pairing restart-required events replace the socket separately with a bounded allowance. Old listeners are removed before replacement. Logout, bad sessions, replaced connections, and authentication failures stop automatic reconnection. Workers start only after listening and send only while connected. Shutdown stops ingress and worker activity before socket/auth cleanup and database disconnect.

Invalid/corrupt sessions are preserved and reported through sanitized events such as `baileys_auth_invalid_or_locked`, `baileys_auth_failure`, or `baileys_session_stopped`. Stop the server, confirm no process owns the directory, and deliberately move the old directory aside privately before pairing with a fresh directory. There is no automatic credential deletion, logout, or inbox reset. Never reset `uncertain` records to pending.

Database uniqueness and leases suppress duplicate processing, including competing workers. A `sending` record whose lease expires becomes `uncertain`, without another send. Baileys send timeouts/errors after invocation are uncertain and never automatically retried. Protocol resend support is disabled for this phase. Sending acceptance does not prove phone delivery; delivery updates are recorded separately. There is no exactly-once guarantee across PostgreSQL and WhatsApp.

A Baileys event has no equivalent of the application's durable HTTP acknowledgement to Meta. If inbound persistence fails, the adapter halts rather than continuing silently, but replay of the uncommitted event is not guaranteed. Investigate the database, restart deliberately, and send a **new** test greeting after recovery. Local auth file writes are not crash-atomic; corruption can require relinking.

### Switch back to Cloud API

Stop the server; set `MESSAGING_PROVIDER=cloud-api`, retain `WHATSAPP_ENABLED=true`, and restore all existing Meta credentials and approved recipients described above. Restart and follow the original HTTPS webhook checklist. No Baileys socket or authentication storage is initialized when Cloud API is selected. Baileys pending inbox work remains isolated. The existing `whatsapp:send` CLI remains **Cloud-only**, sending only the fixed greeting to the first approved Cloud recipient; it is a deliberate live action. Do not use it as a Baileys connectivity test.

### Mock and automated testing

Set `MESSAGING_PROVIDER=mock` and `WHATSAPP_ENABLED=true` to start without a WhatsApp connection. For greeting tests also set development mode, `WHATSAPP_TEST_BOT_ENABLED=true`, and `WHATSAPP_TEST_RECIPIENTS`. There is no HTTP injection/send endpoint. Automated tests inject normalized messages through `createMockAdapter().inject(...)`, inspect its in-memory `outgoing` records, and use the shared worker for replies. Records disappear on process exit; message content is not written to application logs or a persistent mock-output file.

```bash
npm exec vitest run apps/api/test/messaging
npm run db:migrate:test
npm run test:integration
```

Unit tests use injected socket/auth implementations, never live WhatsApp. Database-connected tests use the existing separate `_test` database and mock all transports, including Baileys' real adapter with an injected socket. They cover concurrent duplicates, account/provider isolation, legacy Cloud rows, restart/lease recovery, ambiguous sends, normalization, filtering, QR handling, auth corruption/restoration, bounded reconnects, and shutdown.

**Live status:** real-device Baileys pairing and greeting reception/reply were user-confirmed before Phase 3. Post-change live delivery and restart restoration have not been reverified; automated tests do not prove live connectivity. Repeat the manual checklist above, and confirm Cloud callback/delivery separately once Meta account access is restored.

References: [Baileys v7 migration](https://baileys.wiki/migration/v7), [session management](https://baileys.wiki/authentication/session-management), [sending text](https://baileys.wiki/messaging/sending-messages), and [versioned upstream example](https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc14/Example/example.ts).

## Phase 3: tenants, catalog, and customers

The API owns `TenantService`, `MenuCategoryService`, `MenuService`, and `CustomerService`. They use the application's existing Prisma client/pool through the database package's public exports. All writes validate strict Zod inputs and translate persistence failures into sanitized domain errors. Administrative writes remain internal; there are no public write or customer endpoints.

### Models and integrity

| Model                     | Fields and relationships                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Tenant                    | UUID ID, unique lowercase slug, name, optional description/logo URL, isActive, timestamps                                     |
| MenuCategory              | UUID ID, tenantId, name, optional description, sortOrder, isActive, timestamps                                                |
| MenuItem                  | UUID ID, tenantId, categoryId, name, optional description/image URL, integer Rupiah price, isAvailable, sortOrder, timestamps |
| Customer                  | UUID internal ID, optional displayName, timestamps                                                                            |
| CustomerMessagingIdentity | UUID ID, customerId, provider, accountId, providerUserId, identifierType, nullable phoneNumber, timestamps                    |

A tenant has many categories and items; each item references exactly one category. The composite foreign key `(tenantId, categoryId)` references category `(tenantId, id)`, so direct database writes cannot connect an item to another tenant's category. PostgreSQL also enforces nonnegative prices with `MenuItem_price_nonnegative`; services accept only integer values from 0 through 2,147,483,647 Rupiah. Zero-priced items are allowed. Ordering uses sortOrder followed by UUID ID for ties. Category and item names may repeat.

Tenant, category, customer, and identity foreign keys use `RESTRICT` for updates/deletes. There are no deletion services. Deactivate tenants/categories and change item availability for ordinary operations. A tenant/category with dependent rows or customer with identities cannot be deleted directly without deliberate child cleanup. UUID IDs and tenant ownership cannot be changed through services.

### Customer identity rules

Customers are platform-wide, independent of any provider and tenant. An identity is unique within `(provider, accountId, providerUserId)`. Account scope comes from the existing normalized message envelope and prevents accidental linking across connected accounts. Use `senderId` as providerUserId, not messageId or a guessed phone number. Supported identifier types are Baileys `jid`/`lid`, Cloud API `cloud-user`, and mock `mock-user`; a database CHECK enforces valid provider/type combinations.

`CustomerService.register(identity, displayName?)` atomically creates a customer and its identity; concurrent requests for the same identity return the same customer and do not leave orphan rows. `findByIdentity` and `getById` support future conversation logic. A PN JID and LID remain distinct even if they appear to refer to one person. Switching providers may initially create a separate customer until reliable ownership verification explicitly links the identities.

`associateIdentity({ verified: true, customerId, identity })` is a trusted internal contract: its caller must have independently verified ownership of that exact identity for that customer. The boolean is not an authentication mechanism. This phase implements no verification workflow and exposes no way for HTTP callers or incoming messages to invoke it. Association never transfers an existing identity to another customer or merges customers. Concurrent repeated association is idempotent.

No customer registration is wired into messaging in Phase 3. The adapters, normalized envelope, and greeting remain unchanged. Services never infer or populate phoneNumber from opaque identifiers; the nullable column is reserved for future verified, necessary data. Customer and identity records are never included in public catalog responses or application logs.

### Migrations and development seed

Run from the repository root:

```bash
npm run db:generate
npm run db:migrate
# Requires NODE_ENV=development and the existing DATABASE_URL:
npm run db:seed
# Safe to repeat; existing values are preserved:
npm run db:seed
```

The seed is explicit (`prisma db seed` via Prisma 7 configuration), never part of application startup, installation, or migration deployment. Its CLI rejects production/test environments and reports sanitized failures. The reusable seed function is exercised directly against the isolated test database. A transaction-scoped PostgreSQL advisory lock serializes simultaneous fixture seeds; fixed UUIDs and upserts prevent duplicates. Existing names, prices, availability, and other edits are preserved. Conflicting reserved IDs or an existing `warung-babe` slug owned by another ID cause a rollback instead of overwriting data. Do not rename seed identifiers without a deliberate data transition.

| Tenant                      | Category | Prototype item      | Price    |
| --------------------------- | -------- | ------------------- | -------- |
| Warung Babe (`warung-babe`) | Makanan  | Nasi Goreng Spesial | Rp20,000 |
| Warung Babe (`warung-babe`) | Minuman  | Es Teh Manis        | Rp5,000  |

Description: **Indonesian food tenant for the Beelicious pilot.** These two entries are development examples, not a verified production catalog. No other prices, menus, or operational details are asserted.

### Public catalog API

| GET endpoint                                     | Result                                                 |
| ------------------------------------------------ | ------------------------------------------------------ |
| `/api/v1/tenants`                                | Active tenants, ordered by name then ID                |
| `/api/v1/tenants/:tenantId`                      | Active tenant details                                  |
| `/api/v1/tenants/:tenantId/categories`           | Active categories, ordered by sortOrder then ID        |
| `/api/v1/tenants/:tenantId/menu`                 | Available items in active categories                   |
| `/api/v1/tenants/:tenantId/menu?categoryId=UUID` | Available items restricted to an owned active category |
| `/api/v1/tenants/:tenantId/menu/:menuItemId`     | Owned available item in an active category             |

Every public catalog route requires an active tenant. Missing, inactive, unavailable, and cross-tenant detail resources return 404. Invalid UUIDs/filters return 400; database failures return a sanitized 503. Success envelopes are `{ "data": [...] }` or `{ "data": { ... } }`; errors are `{ "error": { "code": "not_found", "message": "Resource not found" } }`. Explicit response schemas omit timestamps and internal active flags; item prices are integers and returned items have `isAvailable: true`. Lists are unpaginated for the pilot. There are no public customer endpoints, administrative writes, or arbitrary messaging sends.

```bash
curl http://127.0.0.1:3000/api/v1/tenants
curl http://127.0.0.1:3000/api/v1/tenants/3b000000-0000-4000-8000-000000000001/categories
curl http://127.0.0.1:3000/api/v1/tenants/3b000000-0000-4000-8000-000000000001/menu
```

Keep the ignored local `.env` on `MESSAGING_PROVIDER=baileys` for current development; no Meta credentials are needed. The backward-compatible provider default and the default-off messaging master switch remain intact. Switching to Cloud API or mock still follows the existing runbooks.

### Testing and Phase 4 consumption

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run db:migrate
npm run db:migrate:test
npm run test:integration
```

Catalog integration tests reuse the separate migrated database ending in `_test`, selected by the existing WHATSAPP_TEST_DATABASE_URL override or derived from DATABASE_URL. They fail when the service/migrations are missing. Tests delete only their own fixture rows, never development data; reserved seed fixtures must not already exist in that test database. Tests cover database-level constraints, tenant isolation, concurrent registration/association, identity namespace separation, repeated/concurrent seeds, public visibility, and error responses. Existing messaging suites continue to mock WhatsApp transports.

Phase 4 can inject the same TenantService and MenuService instances into provider-independent conversation logic: use `tenants.listActive()`, `categories.list(tenantId, true)`, `menu.available(tenantId, categoryId?)`, and `menu.get(tenantId, itemId, true)`. Recheck availability at future checkout; catalog reads are not inventory reservations or price guarantees. Future customer registration should use the normalized envelope and a verified identity-linking policy. No conversation states, cart, checkout, scheduling, payment, authentication, dashboard, or Phase 4 work is included here.
