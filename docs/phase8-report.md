# Phase 8 implementation report

## Result

Implemented the private tenant dashboard, Supabase Auth integration, tenant memberships, paid-order fulfillment, audited catalog/settings/pickup management, and durable customer notification intents. The existing marketing application, WhatsApp ordering, cart and payment flows remain available. No Phase 9 work or production payment activation was performed.

See [setup, contracts, permissions and limitations](tenant-dashboard.md) for operational instructions. Configure both API and web, provision Supabase accounts with public signup disabled, then associate existing Auth users with tenants using `tenant:member`. Dashboard remains disabled by default. No credentials or memberships were seeded.

## Architecture and schema

Next.js owns login/recovery/private layouts, a same-origin authenticated bridge, and TanStack Query operational views. Fastify owns identity verification, active membership/role authorization, domain mutations and sanitized responses. PostgreSQL remains the sole commerce database. Supabase stores authentication identities/passwords only.

Additive Prisma migration `20261021000000_tenant_dashboard` adds TenantUser (unique tenant/Auth user), FulfillmentHistory (unique tenant/request and order/revision), TenantAudit, Order.fulfillmentStatus and fulfillmentVersion, plus queue indexes and a forward-transition database guard. Restrictive FKs preserve ownership/history. Existing eligible paid orders are backfilled to NEW without notifications.

The first migration attempt failed before any DDL or data updates because the root Prisma diff command produced empty output. It was marked rolled back, regenerated from the database workspace, and successfully applied to both local development and `_test` databases. No reset, truncation, volume removal or commerce-history deletion occurred. Previously applied migrations were not edited.

Fulfillment is independent of payment/checkout status: NEW → ACCEPTED → PREPARING → READY_FOR_PICKUP → COMPLETED. OWNER can flag non-completed paid fulfillment for review with a reason. Session/payment/order locks, expected revisions, request idempotency, history/audit/outbox transactions and safe conflict retries protect concurrent actions. Payments, immutable item snapshots and pickup reservations are preserved. There is no backward/review-resolution/refund workflow.

Accepted/preparing/ready notifications reuse CheckoutNotification and existing provider routing/allowlists/leases. Delivery does not depend on the active gateway. Ambiguous sends remain uncertain and do not repeat the state mutation. Payment jobs remain provider-scoped. Scheduling edits share locks with generation/reservation checks, preserve effective held/confirmed capacity, reject unsafe changes and retain past records/closures. Transaction-bound generation does not open nested transactions.

## Dashboard and APIs

Routes: `/login`, `/reset-password`, `/auth/callback`, `/dashboard`, `/dashboard/orders`, `/dashboard/orders/[orderId]`, `/dashboard/menu`, `/dashboard/pickup`, `/dashboard/settings`, `/dashboard/password`.

Fastify API prefix `/api/v1/tenant-dashboard` provides memberships; overview; paginated/filterable orders/details/transitions; menu CRUD without deletion; availability; categories/ordering; pickup slots/hours; and owner settings. See the setup guide for the full method/permission matrix. Tokens are verified with trusted Supabase Auth; tenant context is checked against database membership on each operation. OWNER-only aggregate gross and settings are never returned to STAFF. Staff availability permission is explicit. Public signup and untrusted login bypasses are absent.

Scoped operational CSS reuses brand colors and fonts, with a responsive sidebar/mobile navigation, stacked mobile orders, accessible native dialogs and real loading/error/empty states. Marketing styles and animations remain separate. Polling uses eight-second visible-page intervals with query invalidation and tenant-separated caches. Asia/Jakarta remains read-only.

## Commands and verification

Executed `npm ci`, dependency installation for the approved Auth/query packages, Prisma generation/diff/deploy/failed-migration resolution, `npm run db:migrate:test`, `npm run db:migrate`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run test:web`, `npm run test:integration`, `npm run build`, `npm run build:web`, `npm run test:e2e`, `npm run test:e2e:dashboard`, `npm audit`, and `git diff --check`.

- Backend/shared unit tests: **225 passed**.
- Frontend unit tests: **30 passed**.
- PostgreSQL integration tests: **134 passed** across eight suites; 24 dashboard tests cover isolation, revisions/idempotency, competing transitions, immutable payment/snapshots, pickup changes, capacity/checkout races, uncertain delivery and verified settlement entering the queue.
- Typecheck, lint, format check and production builds: passed.
- Landing-page browser regressions: **14 passed**.
- Dashboard browser suite: **9 passed** against injected/mock authentication and real suite-owned PostgreSQL data.
- Compiled API: listen, readiness query, simulated dependency outage/recovery, liveness independence, dashboard-worker shutdown and database disconnect passed with messaging disabled. This was a simulated dependency outage, not a PostgreSQL server shutdown.

Initial failed test attempts exposed fixture/schema mismatches, nested transaction generation, proxy-origin reconstruction and test-selector issues; they were corrected. Integration/browser database suites were then run sequentially with isolated account namespaces. Automated tests made no real WhatsApp or payment calls.

Screenshots were captured at 320/390/768/1440px and desktop overview/detail/menu/pickup views. Desktop and mobile screenshots were inspected. Browser checks report zero automated axe violations at the four dashboard widths and verify no significant horizontal overflow. This is not manual screen-reader certification or a production performance audit. Captures are local `/tmp/beelicious-dashboard-*.png` artifacts, not committed customer data.

## Live verification and limitations

Live Supabase login, email recovery, Baileys fulfillment delivery and Midtrans Sandbox end-to-end behavior remain **unverified** in this phase. Browser Auth responses and transport calls are mocked. Warung Babe can be enabled by provisioning a real account/membership; no private credentials were requested, exposed or changed.

Five high-severity dependency advisories remain in the pre-existing eslint-config-next/fast-glob/micromatch development tooling chain. They were reported by npm ci before adding Auth dependencies; no forced incompatible downgrade was applied. npm audit details should be reviewed separately. Existing pg query deprecation and browser NO_COLOR warnings remain non-failing.

No production payment collection, deployment, fulfillment exception resolution, automatic refunds, payouts, media upload service or public merchant onboarding is implemented. Supabase email/rate-limit policy, HTTPS origins, public service readiness, observability and real-device validation require operator setup before production use. The dashboard is ready for controlled pilot validation after authentication provisioning; Phase 9 is not started.

Baileys, official Cloud API and Mock adapter implementations are preserved. Narrow checkout changes initialize fulfillment and share safe scheduling/notification infrastructure; existing regressions pass. The marketing journey file had a separate user edit during this work, which was preserved and is excluded from this implementation inventory.

## Files created or modified

- `.env.example`
- `AGENTS.md`
- `README.md`
- `apps/api/src/app.ts`
- `apps/api/src/config.ts`
- `apps/api/src/modules/checkout/notifications.ts`
- `apps/api/src/modules/checkout/orders.ts`
- `apps/api/src/modules/checkout/payments.ts`
- `apps/api/src/modules/checkout/pickup.ts`
- `apps/api/src/modules/conversation/checkout-flow.ts`
- `apps/web/.env.example`
- `apps/web/package.json`
- `apps/web/playwright.config.ts`
- `package-lock.json`
- `package.json`
- `packages/database/prisma/schema.prisma`
- `packages/database/src/index.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/modules/dashboard/config.ts`
- `apps/api/src/modules/dashboard/membership-cli.ts`
- `apps/api/src/modules/dashboard/routes.ts`
- `apps/api/src/modules/dashboard/service.ts`
- `apps/api/test/dashboard/auth.test.ts`
- `apps/api/test/dashboard/dashboard.integration.test.ts`
- `apps/web/e2e/dashboard.spec.ts`
- `apps/web/e2e/support/api.ts`
- `apps/web/e2e/support/auth-preload.mjs`
- `apps/web/playwright.dashboard.config.ts`
- `apps/web/src/app/(auth)/auth/callback/route.ts`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/reset-password/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/layout.tsx`
- `apps/web/src/app/(dashboard)/dashboard/menu/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/orders/[orderId]/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/orders/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/password/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/pickup/page.tsx`
- `apps/web/src/app/(dashboard)/dashboard/settings/page.tsx`
- `apps/web/src/app/api/dashboard/[...path]/route.ts`
- `apps/web/src/components/dashboard/SURFACE.md`
- `apps/web/src/components/dashboard/catalog.tsx`
- `apps/web/src/components/dashboard/dashboard.css`
- `apps/web/src/components/dashboard/orders.tsx`
- `apps/web/src/components/dashboard/workspace.tsx`
- `apps/web/src/lib/dashboard/actions.ts`
- `apps/web/src/lib/dashboard/auth.ts`
- `apps/web/src/lib/dashboard/config.ts`
- `apps/web/src/proxy.ts`
- `apps/web/test/dashboard-config.test.ts`
- `apps/web/test/dashboard.test.tsx`
- `docs/tenant-dashboard.md`
- `packages/database/prisma/migrations/20261021000000_tenant_dashboard/migration.sql`
- `packages/shared/src/dashboard.ts`
