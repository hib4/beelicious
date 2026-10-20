# Beelicious

Phase 2 adds official Meta WhatsApp Cloud API communication to the TypeScript/Fastify modular monolith. PostgreSQL backs durable webhook receipt and processing. Warung Babe remains the planned pilot; tenant/menu/cart/order/payment functionality is not implemented.

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

Integration tests require the configured PostgreSQL database and a separate WhatsApp integration database. They fail visibly when a required service or migration is missing. They mock every Meta HTTP request and create only synthetic infrastructure events in the test database. To run the compiled application:

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

ESM workspaces resolve through compiled package exports, not TypeScript aliases. Libraries build before the API. All packages are private. There is one PostgreSQL service and no extra application or infrastructure service. Prisma 7 uses its TypeScript client generator and PostgreSQL adapter. The unchanged initial migration creates no business tables. The additive Phase 2 migration adds only `WhatsAppEvent`, the durable integration inbox. Later phases add domain models through new migrations. See `AGENTS.md` for development boundaries.

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

| Variable                     | Purpose                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `WHATSAPP_ENABLED`           | Literal `true` enables webhook routes and the PostgreSQL worker; default `false` |
| `WHATSAPP_ACCESS_TOKEN`      | Meta access token; required when integration is enabled                          |
| `WHATSAPP_PHONE_NUMBER_ID`   | Numeric ID of the Meta test sender, not its display phone number                 |
| `WHATSAPP_WABA_ID`           | Numeric WhatsApp Business Account ID                                             |
| `WHATSAPP_VERIFY_TOKEN`      | Your own private random webhook verification token                               |
| `META_APP_SECRET`            | App secret from the same Meta app that signs deliveries; not the verify token    |
| `META_GRAPH_API_VERSION`     | Required version in `vNN.0` form; no runtime fallback                            |
| `WHATSAPP_TEST_BOT_ENABLED`  | Literal `true` enables greetings; default `false`; only allowed in development   |
| `WHATSAPP_TEST_RECIPIENTS`   | Comma-separated approved customer numbers in international digits-only format    |
| `WHATSAPP_TEST_DATABASE_URL` | Optional override for the separate integration database; must end in `_test`     |

The example selects **v26.0 as a compatibility target**. This version has not been tested against a live Meta account. The main Meta documentation host returned HTTP 429 during implementation; verify the selected version is available in your app before live testing. The endpoint and payload conventions follow Meta's official collection linked below. Do not silently fall back to another API version.

With WhatsApp enabled, all six Meta settings are mandatory. An enabled greeting bot also requires `NODE_ENV=development` and a nonempty allowlist; production/test startup rejects that bot setting. Automated worker tests construct development configuration with synthetic credentials and mocked transport. Disabled WhatsApp settings do not affect health checks. Configuration failures print field names only.

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

No tenant/menu data, carts, scheduling, orders, payments, authentication, dashboards, AI features, production phone registration, or production deployment are implemented in Phase 2.
