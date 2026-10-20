# Beelicious 🐝

A WhatsApp-based food ordering platform. Customers can browse tenants and menus, manage a cart, select pickup times, and complete checkout using simulated or Midtrans Sandbox payments.

**Stack:** TypeScript, Node.js, Fastify, PostgreSQL, Prisma, Zod, Vitest, and npm workspaces. Baileys is the current development messaging provider; Meta Cloud API and Mock remain supported.

## Quick start

Requires Node.js 24 (`.nvmrc`), npm 11, and Docker Compose.

```bash
nvm install
nvm use
cp .env.example .env
```

In `.env`, replace `POSTGRES_PASSWORD` and the password in `DATABASE_URL` with the same local password. URL-encode special characters in the connection URL. Then run:

```bash
npm ci
docker compose up -d --wait
npm run db:migrate
npm run db:seed
npm run dev
```

The API runs at `http://127.0.0.1:3000`. `/health` checks the process; `/ready` checks PostgreSQL. Restart the API after changing configuration or shared/database packages.

## WhatsApp development

WhatsApp is disabled by default. To enable the full conversation flow with Baileys, configure `.env`:

```dotenv
NODE_ENV=development
MESSAGING_PROVIDER=baileys
WHATSAPP_ENABLED=true
WHATSAPP_TEST_BOT_ENABLED=true
CONVERSATION_ENABLED=true
CHECKOUT_ENABLED=true
BAILEYS_AUTH_DIR=./.local/baileys-auth
BAILEYS_ALLOWED_TEST_CONTACTS=APPROVED_TEST_NUMBER
```

Replace `APPROVED_TEST_NUMBER` with an international number containing digits only; separate multiple contacts with commas. Start the API, scan the terminal QR through WhatsApp **Linked Devices**, then send **Halo** from an approved separate WhatsApp account. Messages sent by the connected account are ignored.

Authentication persists in the ignored `.local/baileys-auth` directory, so valid sessions reconnect after restart without another scan. Never commit or share authentication files.

| Provider    | Configuration                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------ |
| `baileys`   | Linked-device authentication and `BAILEYS_ALLOWED_TEST_CONTACTS`; no Meta credentials                        |
| `cloud-api` | Meta credentials from `.env.example`, `WHATSAPP_TEST_RECIPIENTS`, and an HTTPS `/webhooks/whatsapp` callback |
| `mock`      | `WHATSAPP_TEST_RECIPIENTS`; no external credentials, programmatic test injection                             |

Only the selected provider initializes. All providers share the same conversation and business logic.

**Customer commands:** `Halo` / `Hi` / `Mulai`, `Menu`, `Keranjang`, `Kembali` / `0`, `Batal`, `Bantuan`, `CEK`, and `Kirim Ulang QR`. Follow numbered options; use `8` / `9` for pagination where shown. `Batal` preserves a browsing cart but requests cancellation while payment is pending.

## Payments

Checkout supports **Mock** and **Midtrans Sandbox** only. Production payment collection is disabled.

For an actual Sandbox QRIS image delivered through Baileys:

```dotenv
PAYMENT_PROVIDER=midtrans
MIDTRANS_ENVIRONMENT=sandbox
MIDTRANS_SERVER_KEY=YOUR_SANDBOX_SERVER_KEY
MIDTRANS_MERCHANT_ID=YOUR_MERCHANT_ID
```

Replace the placeholders with private Sandbox credentials. Configure `/webhooks/midtrans` on an HTTPS tunnel in the Sandbox dashboard, or optionally set `PAYMENT_WEBHOOK_URL` as an override. Authenticated status reconciliation also recovers missed notifications. Use Midtrans's Sandbox simulator, not actual funds. See the [Midtrans QRIS documentation](https://docs.midtrans.com/reference/qris).

With `NODE_ENV=development`, initial QR captions and **Kirim Ulang QR** include the original Midtrans image URL. Paste that URL into the [Sandbox QRIS simulator](https://simulator.sandbox.midtrans.com/v2/qris/index), complete the simulated payment, then send **CEK**. WhatsApp media links cannot be used in the simulator.

Customer messages show normal QRIS checkout wording, order total, expiry, and payment commands. Payment is confirmed only after provider verification; sending a QR image or receiving a customer message is not proof of payment.

Switching providers or merchant credentials does not migrate existing payments. Resolve an old checkout through its original provider before starting another; `Menu` still permits catalog browsing. Overdue or cancellation-pending payments show verification status and do not offer QR resend. An overdue timestamp alone never releases the pickup reservation.

Without credentials, use `PAYMENT_PROVIDER=mock`. It displays an explicitly non-payable placeholder and supports local payment simulation:

```bash
npm run payment:inspect
npm run payment:mock -- MOCK_PROVIDER_REFERENCE settlement
# Other outcomes: deny, expire
```

Copy the reference from inspection output. Simulation controls are development-only local commands, never public endpoints. `npm run whatsapp:events` inspects messaging processing state.

## Catalog and pickup

The idempotent development seed creates **Warung Babe**, categories **Makanan** / **Minuman**, and two prototype items: **Nasi Goreng Spesial — Rp20,000** and **Es Teh Manis — Rp5,000**. Example operating hours are daily **07.00–18.00 WIB**. These are unverified development fixtures, not a production merchant catalog or schedule; repeated seeds preserve existing edits.

Defaults in `.env.example`: 20 units per cart item, 30-minute pickup slots, five orders per slot, 60-minute lead time, seven-day booking window, and 15-minute requested payment expiry. Times display in `Asia/Jakarta`; timestamps persist in UTC. Prices and totals use integer Rupiah.

Carts, conversations, orders, payments, and pickup reservations persist in PostgreSQL. **READY** means a saved cart, not an order. Explicit checkout confirmation freezes the cart and reserves pickup capacity. Uncertain payments retain their reservation until verified resolution; duplicate events do not repeat checkout mutations or create another charge. Payment confirmation does not mean food is ready for pickup.

## API

Public catalog endpoints are read-only and expose active, available resources:

```text
GET /health
GET /ready
GET /api/v1/tenants
GET /api/v1/tenants/:tenantId
GET /api/v1/tenants/:tenantId/categories
GET /api/v1/tenants/:tenantId/menu?categoryId=UUID
GET /api/v1/tenants/:tenantId/menu/:menuItemId
```

Provider webhooks: `GET/POST /webhooks/whatsapp` for Cloud API and `POST /webhooks/midtrans` for Midtrans. There are no public administrative, customer, cart, or arbitrary-send endpoints.

## Development and tests

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm start
```

Unit tests require no external services. For integration tests, create the separate database once, then migrate it and run the suite:

```bash
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" "${POSTGRES_DB}_test"'
npm run db:migrate:test
npm run test:integration
```

The test database defaults to `DATABASE_URL` plus `_test`; override with `WHATSAPP_TEST_DATABASE_URL`. Integration tests require PostgreSQL and mock all WhatsApp/payment network calls. `npm run db:migrate:dev -- --name CHANGE_NAME` authors new development migrations; never edit applied migrations or reset existing data casually.

## Architecture and limitations

```text
apps/api/             HTTP, messaging, conversations, catalog, cart, checkout
packages/database/    Prisma schema, migrations, seeds, and connections
packages/shared/      Reusable types and pure utilities
```

The modular monolith uses PostgreSQL transactions, scoped identities, deduplication, and durable processing. Ambiguous external sends are not automatically replayed; exactly-once WhatsApp delivery is not guaranteed. See [AGENTS.md](AGENTS.md) for engineering rules and the [Prisma schema](packages/database/prisma/schema.prisma) for data models.

- Baileys is unofficial, development-only, and carries account-restriction risk.
- Live Baileys QRIS delivery and Midtrans Sandbox end-to-end checkout remain unverified until tested with a real device and Sandbox account.
- No production collection, automatic refunds, payouts, dashboards, authentication, or tenant fulfillment notifications are implemented. Uncertain payments may require manual investigation.
- Keep `.env`, credentials, and session data private. Preserve database volumes and payment history; avoid `docker compose down -v`.
