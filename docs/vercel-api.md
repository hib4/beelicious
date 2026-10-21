# Vercel HTTP API and local Baileys worker

Use two Vercel projects from this repository. The existing Next.js project stays as deployed. The new API project serves Fastify HTTP requests. A manually started local process handles Baileys, conversation commands, payment reconciliation and notifications. Both use one hosted Supabase PostgreSQL database.

```text
Browser → Vercel Next.js → authenticated BFF → Vercel Fastify API
                                                    ↓
                                            Supabase PostgreSQL
                                                    ↑
WhatsApp ↔ local Baileys + inbox/payment/notification workers
Midtrans Sandbox → Vercel /webhooks/midtrans → durable PaymentEvent
```

The local process needs outbound access to WhatsApp, PostgreSQL and the Sandbox gateway. It requires no tunnel or public port. Your computer must stay running for processing and WhatsApp delivery. A hosted webhook persists pending work while it is offline. Messages received while Baileys is disconnected are not guaranteed to replay.

## 1. Prepare the hosted pilot database

Use the PostgreSQL database in your Supabase project as the single commerce store; Supabase Auth still authenticates staff independently. This is a fresh development pilot: existing local database data and authentication files remain untouched, and are not transferred.

Before creating application tables, **disable the Supabase Data API** in the project's API settings. This project accesses commerce tables only through Prisma/Fastify and does not use the Data API. Supabase Auth remains enabled. Keep public staff signup disabled. Do not use browser/publishable keys as database credentials. Use private PostgreSQL credentials and a controlled application database role; do not grant commerce table access to `anon` or `authenticated`. If the project must retain a Data API for unrelated work, exclude the commerce schema/tables and review grants/RLS before proceeding rather than exposing the migration's public-schema tables.

Copy connection strings from Supabase's **Connect** panel, URL-encoding the database password:

- API `DATABASE_URL`: Supavisor transaction pooler (typically port 6543), with TLS.
- Local worker `DATABASE_URL`: session pooler (typically port 5432), with TLS.
- Operator `DIRECT_DATABASE_URL`: direct PostgreSQL connection, or session pooler if your network cannot reach the direct IPv6 endpoint. Do not use the transaction pooler for migrations.

All three must identify the **same** database/project and schema. Use the exact host/user format provided by Supabase. Keep TLS verification enabled; do not add `rejectUnauthorized=false`. Prisma uses the PostgreSQL driver adapter with a bounded five-connection pool per application instance and ten-second idle timeout. Size pooler limits for Vercel instance concurrency; the local worker also consumes connections. Test connectivity from both locations before switching.

Configure the ignored root `.env` with the hosted worker `DATABASE_URL`, migration `DIRECT_DATABASE_URL`, and `NODE_ENV=development`. Then deliberately run:

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run tenant:member -- AUTH_USER_UUID 3b000000-0000-4000-8000-000000000001 OWNER active readonly
```

The UUID shown is the reserved Warung Babe development seed tenant. The Auth UUID must be an existing provisioned user in this Supabase project. Seeding is development-only, idempotent, preserves existing edits, and uses prototype menu data and unverified daily operating hours. Never enable automatic seeding on deployment. Migration commands use DIRECT_DATABASE_URL when supplied; application/seed/membership commands use DATABASE_URL.

Keep integration tests on a separate PostgreSQL database ending in `_test`. Set WHATSAPP_TEST_DATABASE_URL explicitly when the development URL points to Supabase. Never point tests at the pilot database. `db:migrate:test` overrides both connection variables with its guarded test target.

## 2. Create the API Vercel project

Import the same Git repository as a **new** Vercel project, suggested name `beelicious-api`:

| Setting                              | Value                                     |
| ------------------------------------ | ----------------------------------------- |
| Root Directory                       | `apps/api`                                |
| Framework                            | Other (Node Functions; `framework: null`) |
| Include files outside Root Directory | Enabled, for workspace packages           |
| Node.js                              | 24.x                                      |
| Install                              | `cd ../.. && npm ci --ignore-scripts`     |
| Build                                | `cd ../.. && npm run build:api`           |
| Output directory                     | Unset                                     |

`apps/api/vercel.json` contains these commands and routes all paths to `api/index.ts`, a conventional Node function. It dispatches the original URL to Fastify after readiness. This intentionally avoids Fastify auto-detection selecting the existing `src/app.ts` factory or starting the long-lived server entrypoint. The API build generates Prisma and compiles workspace packages without building Next.js, migrating, or seeding.

Set private runtime environment variables in this new project:

```dotenv
NODE_ENV=production
DATABASE_URL=YOUR_PRIVATE_HOSTED_TRANSACTION_POOL_URL
DASHBOARD_ENABLED=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
WHATSAPP_ENABLED=false
WHATSAPP_TEST_BOT_ENABLED=false
CONVERSATION_ENABLED=false
CHECKOUT_ENABLED=false
PAYMENT_WEBHOOK_ENABLED=true
PAYMENT_PROVIDER=midtrans
MIDTRANS_ENVIRONMENT=sandbox
MIDTRANS_SERVER_KEY=SB-YOUR_PRIVATE_SANDBOX_KEY
MIDTRANS_MERCHANT_ID=YOUR_SANDBOX_MERCHANT_ID
```

No Baileys auth directory, approved phone numbers, root `.env`, or session credentials belong in Vercel. The HTTP entrypoint rejects messaging/checkout flags instead of silently starting workers. Missing/invalid configuration returns a sanitized 503. Warm function instances reuse their app/pool; no long-lived loops or process signal handlers are installed. Existing restrictive test-contact and payment rules are unchanged.

Do not assign the shared pilot database or webhook credentials to automatic Preview deployments. Configure isolated preview databases/Auth projects when previews are needed; otherwise leave them unconfigured. Deployment protection must permit Midtrans to reach the webhook when using Sandbox; do not distribute Vercel bypass tokens as query parameters. Authenticated dashboard endpoints still verify Supabase tokens and memberships even if the API origin is publicly reachable.

Public paths on the API origin are unchanged:

- `/health`, `/ready`
- `/api/v1/tenants` and existing read-only catalog routes
- `/api/v1/tenant-dashboard/*` (authentication and membership required)
- `/webhooks/midtrans` (signed Sandbox notifications only)

No root services-mode configuration or cross-project bindings are needed. The existing frontend project's configuration remains unchanged.

## 3. Connect the existing frontend

In the frontend Vercel project, retain its public marketing settings and configure server-only dashboard settings:

```dotenv
DASHBOARD_ENABLED=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
DASHBOARD_API_URL=https://YOUR_API_PROJECT.vercel.app
DASHBOARD_SITE_URL=https://YOUR_FRONTEND_ORIGIN
```

Use actual origins without paths, not these placeholders. Redeploy the frontend to apply changes. Add the frontend's `/auth/callback` to Supabase Auth's permitted redirect URLs and set its Site URL appropriately. Never add database credentials, Sandbox Server Key or Baileys secrets to the frontend. Its existing same-origin BFF forwards tokens server-side; browser CORS changes are unnecessary.

## 4. Start Baileys manually

The ignored root `.env` remains the local worker configuration. Keep existing approved contacts and auth directory, and set:

```dotenv
NODE_ENV=development
MESSAGING_PROVIDER=baileys
WHATSAPP_ENABLED=true
WHATSAPP_TEST_BOT_ENABLED=true
CONVERSATION_ENABLED=true
CHECKOUT_ENABLED=true
PAYMENT_PROVIDER=midtrans
MIDTRANS_ENVIRONMENT=sandbox
PAYMENT_WEBHOOK_URL=https://YOUR_API_PROJECT.vercel.app/webhooks/midtrans
```

Also supply the same Sandbox merchant/Server Key as the hosted webhook, hosted session-pool DATABASE_URL, existing BAILEYS_ALLOWED_TEST_CONTACTS and ignored BAILEYS_AUTH_DIR. The worker and API must agree on pickup configuration; this pilot uses the existing default Asia/Jakarta, 30-minute slots, five orders, 60-minute lead time and seven booking days. Set the same existing PICKUP_* settings in both API and worker when overriding defaults; hosted scheduling validation is independent of payment credentials. Do not customize only one process.

```bash
npm run dev:worker
# Or build once, then run compiled code:
npm run build:api
npm run start:worker
```

The command intentionally does not use watch mode, avoiding overlapping socket generations during reloads. Stop with Ctrl+C before restarting. Existing valid sessions restore; QR pairing is rendered only in an interactive terminal. Never run `npm run dev`/`start` and the dedicated worker together against the same Baileys auth directory. Existing full local API commands remain available for local-only development.

For credentials-free payment development, set the **local** PAYMENT_PROVIDER to mock. It continues producing explicitly simulated, non-payable instructions; the hosted Midtrans webhook cannot settle mock payments. Use the existing controlled `payment:mock` CLI against the same hosted database to simulate outcomes. Do not enable an HTTP/customer payment-success bypass.

## 5. Verify and operate

1. Check API `/health` and `/ready`; readiness must query the hosted database.
2. Visit frontend `/login`, authenticate a provisioned owner and verify the hosted membership/catalog.
3. Start the local worker and send Halo from an approved separate test account. Check catalog, cart, checkout and persisted order data through the dashboard.
4. For Sandbox payments, configure the Midtrans notification URL to the deployed webhook. Use only real Sandbox-generated QR instructions. A verified webhook stores evidence; the local worker queries the authenticated status API before settlement confirmation.
5. Advance a paid order through fulfillment. The API commits state and one notification intent; the local worker sends to the original approved messaging identity.
6. Stop the worker: the dashboard continues serving, but payment reconciliation and messaging wait. Restart and verify durable processing resumes without duplicate checkout or logical confirmation. Disconnected inbound WhatsApp replay is not guaranteed.

Never mark payment paid based on customer text, image delivery, local deadline or a plausible webhook. Missing/ambiguous provider outcomes retain reservations or require review. Existing sending-before-transport commits and uncertain-send suppression still apply; WhatsApp exactly-once delivery is not promised.

Local verification:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run db:migrate:test
npm run test:integration
npm run build
```

Actual Vercel function packaging/routing, Supabase pool connectivity and live Auth/WhatsApp/Midtrans behavior require an actual configured deployment. Local mocks do not verify them. This deployment configuration does not activate production payments or provide an always-on worker. Losing the local computer or session storage still interrupts WhatsApp service. Keep database backups and monitor failed/review/uncertain records using existing safe developer tools.

## References

- [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase with Prisma](https://supabase.com/docs/guides/database/prisma)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
