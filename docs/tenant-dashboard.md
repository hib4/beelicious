# Tenant dashboard

Phase 8 adds a private operational workspace to `apps/web`. Fastify remains the business API; Supabase provides authentication only. All commerce data stays in the existing PostgreSQL database. No dashboard page contains mock orders. Browser fixtures run against the separate `_test` database.

## Setup

1. Create a Supabase Auth project. Disable **Allow new users to sign up**. Provision confirmed email/password accounts through the Supabase administration tools; do not add public signup. Configure password policy (at least 12 characters), email delivery, Auth rate limits, and password-recovery redirect URLs.
2. Configure the API `.env` and the web `apps/web/.env.local` separately:

```dotenv
DASHBOARD_ENABLED=true
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

The web additionally needs server-only values:

```dotenv
DASHBOARD_API_URL=http://127.0.0.1:3000
DASHBOARD_SITE_URL=http://127.0.0.1:3001
```

Use actual HTTPS origins when hosted. Allow `/auth/callback` under the web origin in Supabase Auth redirect settings. Never configure a service-role key. These are runtime server settings, not `NEXT_PUBLIC` values. Never copy backend credentials into frontend public configuration. Missing configuration leaves login unavailable; there is no development login bypass.

3. Apply `npm run db:migrate`. Existing paid/confirmed orders with confirmed reservations gain fulfillment status NEW, without sending notifications. Existing commerce data is retained.
4. Associate the account's Supabase Auth UUID with an existing tenant UUID:

```bash
npm run tenant:member -- AUTH_USER_UUID TENANT_UUID OWNER active readonly
npm run tenant:member -- STAFF_AUTH_USER_UUID TENANT_UUID STAFF active availability
# Disable a membership:
npm run tenant:member -- STAFF_AUTH_USER_UUID TENANT_UUID STAFF inactive readonly
```

This is a controlled local operator command requiring database access. It does not create Auth users, accept passwords, or send invitations. Its audit source identifies local provisioning; normal dashboard audit actors are verified users. No owner credentials or memberships are seeded automatically. A user may have multiple memberships.

5. Start the API with `npm run dev` and frontend with `npm run dev:web`. Visit `/login`.

The local messaging provider remains Baileys. Dashboard configuration does not enable WhatsApp or payments. Existing approved-contact restrictions still apply.

## Authentication and authorization

Supabase SSR stores tokens in HttpOnly, SameSite=Lax cookies, secure in production. The scoped Next.js proxy refreshes sessions. Protected server layouts verify the user; the same-origin `/api/dashboard/*` bridge forwards only allowlisted operations with the access token to Fastify. It checks mutation origins against DASHBOARD_SITE_URL and never forwards browser-selected upstream URLs. Private responses are not cached.

Fastify verifies each bearer token using the configured project's authenticated `/auth/v1/user` endpoint with a five-second deadline. It checks active TenantUser membership for every operation, including inside mutation transactions. Browser tenant selection is only context, never authorization. Supabase availability is required; authentication failures fail closed. Logout uses local-session sign-out and removes the SSR cookies; membership revocation takes effect on subsequent API requests. No Supabase business tables, RLS business policies, or second commerce database are introduced.

OWNER can manage all tenant operations. STAFF can read orders/catalog/pickup and advance normal fulfillment. STAFF availability toggles require `canManageAvailability`. Gross aggregate metrics, menu details/prices/categories, profile/schedule writes, and paid-order review actions are OWNER-only. Individual order totals remain visible to staff.

## Routes and data

- `/dashboard`: counts, recent orders, owner-only verified paid gross value.
- `/dashboard/orders`: server-filtered/paginated order queue; default confirmed paid active orders.
- `/dashboard/orders/[orderId]`: immutable checkout snapshots, fulfillment actions/history, notification status.
- `/dashboard/menu`: catalog forms, categories/ordering, permitted availability toggles.
- `/dashboard/pickup`: future slots, effective capacity, operating hours and safe owner edits.
- `/dashboard/settings`: owner-only tenant name, description and existing HTTPS logo URL.
- `/dashboard/password`: authenticated password change.

Asia/Jakarta is read-only in this pilot. Daily paid counts/gross use payment.paidAt; daily completions use fulfillment history time. Outstanding operational counts include older unfinished orders. Mock/Sandbox activity is explicitly identified; gross value is not profit or payout. Only customer display names (when present) are shown; chat IDs, phone numbers, gateway references, and QR URLs are omitted.

Protected Fastify API prefix: `/api/v1/tenant-dashboard`. All tenant-specific requests require `x-tenant-id` and a verified bearer token.

| Method    | Suffix                                                    | Permission                   |
| --------- | --------------------------------------------------------- | ---------------------------- |
| GET       | `/memberships`                                            | Authenticated account        |
| GET       | `/overview`, `/orders`, `/orders/:id`, `/menu`, `/pickup` | Membership                   |
| POST      | `/orders/:id/transition`                                  | Membership; OWNER for review |
| POST      | `/menu`, `/categories`                                    | OWNER                        |
| PATCH     | `/menu/:id`, `/categories/:id`                            | OWNER                        |
| PATCH     | `/menu/:id/availability`                                  | OWNER / permitted STAFF      |
| PATCH     | `/pickup/:id`, `/operating-hours`                         | OWNER                        |
| GET/PATCH | `/settings`                                               | OWNER                        |

Collections accept page/pageSize (25 default, 100 maximum). Orders support status, pickup date, order-number search, pickup/creation sorting, and actionable/all scope. Menu supports search/category. Responses use `{ data }` or `{ error: { code, message } }`. Cross-tenant resources return 404; absent membership/permissions return 403. Conflicts return 409. No deletion APIs exist.

TanStack Query polls overview/orders/detail/pickup every eight seconds when visible, with manual refresh and mutation invalidation. Tenant-specific query keys and cache clearing isolate workspaces. Mutations do not automatically retry. Stale edits require a refresh and renewed action.

## Persistence and transitions

New tables: TenantUser, FulfillmentHistory, TenantAudit. Order gains nullable fulfillmentStatus and fulfillmentVersion. Tenant membership is unique per tenant/Auth user. Fulfillment request IDs are unique per tenant; history revisions are unique per order. Restrictive foreign keys preserve history.

`NEW → ACCEPTED → PREPARING → READY_FOR_PICKUP → COMPLETED`

Only confirmed orders with SUCCEEDED payment and confirmed reservations are actionable. Payment and checkout status remain separate. Row locks follow session/payment/order order, with bounded transaction-conflict retries. Expected revisions reject competing actions. Reusing a request ID with different input is rejected; identical retries do not create more history or notifications. A database trigger rejects invalid/backward fulfillment updates.

OWNER may flag a non-completed paid order REQUIRES_REVIEW with a reason. This preserves payment and capacity; no refund, payment cancellation, reservation release, backward transition, or operator-resolution workflow is implemented.

Normal workflows only append audit/history records; no update/delete endpoint exists. Database administrators are outside this application-level append-only boundary. Audits store safe field changes, tenant/actor/target and timestamps, never tokens or customer routing data.

## Notifications and scheduling

Accepted, preparing and ready transitions atomically create one logical CheckoutNotification each. Existing provider-independent delivery preserves account/identity routing, allowed contacts, Cloud messaging windows, leases and sending-before-transport commits. Fulfillment text notifications do not depend on the active payment provider. Messaging failures do not undo fulfillment; ambiguous sends become uncertain and are not automatically replayed. Only existing explicitly safe transport retries apply. Blocked/uncertain/failed delivery states remain visible; no manual resend tool is added.

Pickup edits use tenant scheduling advisory locks shared with generation/reservation checks, plus slot row locks. HELD and CONFIRMED each consume one order unit, including overdue uncertain holds. Capacity cannot drop below effective reservations; reserved slots cannot be closed. Hour changes reject conflicts with reserved slots, close conflicting empty future slots, and generate valid non-overlapping slots without overwriting existing closures or capacities. Past slots remain unchanged. Empty future slots already within new hours retain their existing intervals. Existing checkout price/availability acknowledgements and immutable order snapshots remain authoritative.

## Development example

1. Use the existing WhatsApp cart/checkout flow with PAYMENT_PROVIDER=mock.
2. Simulate settlement using `payment:inspect` and `payment:mock`; wait for verified local payment processing.
3. Log in as a provisioned member of that order's tenant.
4. Open Pesanan, accept, start preparing, mark ready, then confirm collection.
5. Inspect history and notification delivery states. With Mock messaging these sends are recorded, not delivered to a device.

READY_FOR_PICKUP means the tenant explicitly marked preparation complete. COMPLETED means staff explicitly confirmed collection. The dashboard never invents either status from payment success or elapsed pickup time.

## Tests and limitations

```bash
npm run db:migrate:test
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:integration
npm run build
npm run test:e2e
npm run test:e2e:dashboard
```

Run database integration and dashboard browser suites sequentially; they share the guarded test database. Browser tests use an explicit Node preload to mock external Supabase responses and a test-only API entrypoint with injected identity verification. Neither is imported by application entrypoints. The harness binds loopback ports 3103/3104, creates suite-owned data, and cleans it up. Never point it at development/production commerce data.

Live Supabase login, email recovery, Baileys notifications and Midtrans Sandbox integration need actual external setup/device verification. The approved-contact and Sandbox/development restrictions remain. No production deployment, refunds, payouts, onboarding dashboard, media upload service, or Phase 9 work is included. Apply deployment-origin/TLS/security-header and operational monitoring policies before a public launch.
