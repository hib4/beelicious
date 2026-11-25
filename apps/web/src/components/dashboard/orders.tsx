'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BellRing, Search } from 'lucide-react';

import type { DashboardOrder, Overview, PageResult } from '@beelicious/shared';

import {
  dashboardApi,
  useDashboardQuery,
  useWorkspace,
  PageHeading,
  QueryState,
  Pagination,
  money,
  time,
  Status,
  stageLabels,
  paymentSourceLabel,
  notificationKindLabels,
  notificationStateLabels,
} from './workspace';
import { Select } from './select';

// =====================================================
// SHARED ORDER HELPERS
// =====================================================

// Label of the next fulfillment step for a row's current stage.
const orderActionLabels: Record<string, string> = {
  NEW: 'Terima pesanan',
  ACCEPTED: 'Mulai siapkan',
  PREPARING: 'Tandai siap',
  READY_FOR_PICKUP: 'Selesaikan',
};

const activeStages = ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'];

const jakarta = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', ...options });

const clockFormat = jakarta({
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dayFormat = jakarta({ day: 'numeric', month: 'short', year: 'numeric' });

function pickupParts(value: string) {
  const date = new Date(value);
  return { time: clockFormat.format(date), day: dayFormat.format(date) };
}

function rowAction(order: DashboardOrder) {
  const stage = order.fulfillmentStatus ?? order.status;
  const actionable =
    order.payment?.status === 'SUCCEEDED' &&
    order.status === 'CONFIRMED' &&
    !!orderActionLabels[stage];
  return {
    stage,
    label: actionable ? orderActionLabels[stage]! : 'Lihat detail',
    tone: !actionable
      ? 'is-quiet'
      : stage === 'NEW'
        ? 'is-primary'
        : 'is-secondary',
  };
}

// =====================================================
// ORDER ROWS (shared by overview and orders list)
// =====================================================

export function OrderRows({
  orders,
  compact = false,
  caption,
}: {
  orders: DashboardOrder[];
  compact?: boolean;
  caption?: string;
}) {
  if (!orders.length) {
    return (
      <div className="dash-card dash-empty-card">
        <p className="dash-empty">Belum ada pesanan pada pilihan ini.</p>
      </div>
    );
  }

  return (
    <div className="dash-card dash-order-table-wrap">
      <table className={`dash-order-table${compact ? ' is-compact' : ''}`}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">Pesanan</th>
            <th scope="col">Menu</th>
            <th scope="col">Pickup</th>
            <th scope="col">Status</th>
            <th scope="col" className="numeric">
              Total
            </th>
            <th scope="col">
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => {
            const action = rowAction(order);
            const pickup = pickupParts(order.pickupSlot.startsAt);

            return (
              <tr key={order.id} data-stage={action.stage}>
                <td data-label="Pesanan" className="dash-order-cell">
                  <Link
                    className="dash-order-link"
                    href={`/dashboard/orders/${order.id}`}
                  >
                    {order.orderNumber}
                  </Link>
                  <span className="dash-order-customer">
                    {order.customer.displayName ?? 'Pelanggan WhatsApp'}
                  </span>
                  {!compact && <small>Dibuat {time(order.placedAt)}</small>}
                </td>

                <td data-label="Menu" className="dash-order-items">
                  <ul>
                    {order.items.map((item, index) => (
                      <li key={index}>
                        <span className="dash-qty">{item.quantity}×</span>{' '}
                        {item.nameSnapshot}
                      </li>
                    ))}
                  </ul>
                </td>

                <td data-label="Pickup" className="dash-order-pickup">
                  <strong>
                    {pickup.time} <span>WIB</span>
                  </strong>
                  <small>{pickup.day}</small>
                </td>

                <td data-label="Status" className="dash-order-status">
                  <div className="dash-status-group">
                    {order.payment && <Status value={order.payment.status} />}
                    <Status value={action.stage} />
                  </div>
                  {(!compact || !order.payment) && (
                    <small>{paymentSourceLabel(order.payment)}</small>
                  )}
                </td>

                <td data-label="Total" className="numeric dash-order-total">
                  {money(order.totalAmount)}
                </td>

                <td className="dash-order-action">
                  <Link
                    href={`/dashboard/orders/${order.id}`}
                    className={`dash-action ${action.tone}`}
                    aria-label={`${action.label} ${order.orderNumber}`}
                  >
                    {action.label}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================
// OVERVIEW SCREEN
// =====================================================

function jakartaGreeting(now: Date) {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function providerBadge(providers: string[]) {
  const mock = providers.includes('mock');
  const sandbox = providers.some((provider) => provider !== 'mock');
  if (mock && sandbox) return 'Mock + Sandbox';
  if (mock) return 'Mock';
  if (sandbox) return 'Sandbox';
  return null;
}

export function OverviewScreen() {
  const { membership } = useWorkspace();
  const q = useDashboardQuery<Overview>('overview', 'overview', true);
  const data = q.data;
  const now = new Date();

  const today = jakarta({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  const upcoming = data
    ? data.recent
        .filter((order) =>
          activeStages.includes(order.fulfillmentStatus ?? order.status),
        )
        .sort(
          (a, b) =>
            new Date(a.pickupSlot.startsAt).getTime() -
            new Date(b.pickupSlot.startsAt).getTime(),
        )
        .slice(0, 3)
    : [];

  const badge = data ? providerBadge(data.providers) : null;

  const flow = data
    ? [
        {
          stage: 'NEW',
          label: 'Menunggu diterima',
          value: data.awaitingAcceptance,
        },
        { stage: 'ACCEPTED', label: 'Diterima', value: data.accepted },
        {
          stage: 'PREPARING',
          label: 'Sedang disiapkan',
          value: data.preparing,
        },
        { stage: 'READY_FOR_PICKUP', label: 'Siap diambil', value: data.ready },
        {
          stage: 'COMPLETED',
          label: 'Selesai hari ini',
          value: data.completedToday,
        },
      ]
    : [];

  return (
    <div className="dash-page dash-overview">
      <PageHeading
        title="Ringkasan"
        description={`${jakartaGreeting(now)}, tim ${membership.tenant.name} · ${today}`}
        refresh={() => {
          void q.refetch();
        }}
      />

      <QueryState
        pending={q.isPending}
        error={q.error}
        refresh={() => {
          void q.refetch();
        }}
      />

      {data && (
        <>
          {data.awaitingAcceptance > 0 && (
            <section className="dash-alert" aria-labelledby="awaiting-title">
              <span className="dash-alert-icon" aria-hidden="true">
                <BellRing size={18} />
              </span>
              <div className="dash-alert-text">
                <strong id="awaiting-title">
                  {data.awaitingAcceptance} pesanan menunggu diterima
                </strong>
                <p>Konfirmasi pesanan agar pickup tetap tepat waktu.</p>
              </div>
              <Link
                href="/dashboard/orders?status=NEW"
                className="dash-button is-primary"
              >
                Lihat pesanan
              </Link>
            </section>
          )}

          <section className="dash-block" aria-labelledby="flow-title">
            <h2 id="flow-title">Alur pesanan hari ini</h2>
            <ul className="dash-flow">
              {flow.map((item) => (
                <li key={item.stage}>
                  <Link
                    href={`/dashboard/orders?status=${item.stage}`}
                    className="dash-flow-item"
                    data-stage={item.stage}
                  >
                    <span className="dash-flow-label">{item.label}</span>
                    <strong>{item.value}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="dash-summary" aria-label="Ringkasan hari ini">
            <div className="dash-card dash-gross">
              <div className="dash-card-heading">
                <h2>Nilai bruto pembayaran berhasil</h2>
                {badge && <span className="dash-badge">{badge}</span>}
              </div>
              {typeof data.paidGross === 'number' && (
                <strong className="dash-gross-value">
                  {money(data.paidGross)}
                </strong>
              )}
              <p>
                {data.paidToday} pembayaran terverifikasi hari ini. Bukan laba
                atau pencairan merchant.
              </p>
            </div>

            <div className="dash-card dash-upcoming">
              <div className="dash-card-heading">
                <h2>Pickup terdekat</h2>
                <Link href="/dashboard/pickup" className="dash-text-link">
                  Jadwal pickup
                </Link>
              </div>
              {upcoming.length > 0 ? (
                <ol className="dash-upcoming-list">
                  {upcoming.map((order) => {
                    const pickup = pickupParts(order.pickupSlot.startsAt);
                    return (
                      <li key={order.id}>
                        <Link href={`/dashboard/orders/${order.id}`}>
                          <strong className="dash-upcoming-time">
                            {pickup.time}
                          </strong>
                          <span className="dash-upcoming-order">
                            {order.orderNumber}
                          </span>
                          <Status
                            value={order.fulfillmentStatus ?? order.status}
                          />
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="dash-empty">Tidak ada pickup aktif.</p>
              )}
            </div>

            <Link
              href="/dashboard/orders?status=REQUIRES_REVIEW"
              className={`dash-card dash-review${data.requiresReview ? ' is-alert' : ''}`}
            >
              <span className="dash-review-label">Perlu pemeriksaan</span>
              <strong>{data.requiresReview}</strong>
              <span className="dash-text-link">
                {data.requiresReview ? 'Periksa pesanan' : 'Tidak ada kendala'}
                {data.requiresReview > 0 && (
                  <ArrowRight size={16} aria-hidden="true" />
                )}
              </span>
            </Link>
          </section>

          <section className="dash-block" aria-labelledby="recent-title">
            <div className="dash-block-heading">
              <h2 id="recent-title">Pesanan terbaru</h2>
              <Link
                href="/dashboard/orders?status=all"
                className="dash-text-link"
              >
                Lihat semua pesanan
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <OrderRows orders={data.recent} compact caption="Pesanan terbaru" />
          </section>

          <p className="dash-updated">
            Diperbarui {time(data.asOf)} · pembaruan otomatis setiap 8 detik
          </p>
        </>
      )}
    </div>
  );
}

// =====================================================
// ORDERS SCREEN
// =====================================================

const orderTabs = [
  { key: 'active', label: 'Perlu diproses', scope: 'actionable', status: '' },
  {
    key: 'NEW',
    label: 'Menunggu diterima',
    scope: 'actionable',
    status: 'NEW',
  },
  {
    key: 'ACCEPTED',
    label: 'Diterima',
    scope: 'actionable',
    status: 'ACCEPTED',
  },
  {
    key: 'PREPARING',
    label: 'Disiapkan',
    scope: 'actionable',
    status: 'PREPARING',
  },
  {
    key: 'READY_FOR_PICKUP',
    label: 'Siap diambil',
    scope: 'actionable',
    status: 'READY_FOR_PICKUP',
  },
  { key: 'COMPLETED', label: 'Selesai', scope: 'all', status: 'COMPLETED' },
  {
    key: 'REQUIRES_REVIEW',
    label: 'Perlu pemeriksaan',
    scope: 'all',
    status: 'REQUIRES_REVIEW',
  },
  { key: 'all', label: 'Semua pesanan', scope: 'all', status: '' },
] as const;

const sortOptions = [
  { value: 'pickup', label: 'Pickup terdekat' },
  { value: 'created', label: 'Pesanan terbaru' },
];

export function OrdersScreen() {
  const params = useSearchParams();
  const requested = params.get('status');
  const initialTab = orderTabs.some((tab) => tab.key === requested)
    ? requested!
    : 'active';

  const [tabKey, setTabKey] = useState<string>(initialTab);
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('pickup');
  const [page, setPage] = useState(1);

  const tab = orderTabs.find((item) => item.key === tabKey) ?? orderTabs[0];

  const query = new URLSearchParams({
    page: String(page),
    pageSize: '25',
    sort,
    scope: tab.scope,
    ...(tab.status ? { status: tab.status } : {}),
    ...(date ? { date } : {}),
    ...(search ? { search } : {}),
  });

  const q = useDashboardQuery<PageResult<DashboardOrder>>(
    'orders',
    `orders?${query}`,
    true,
    true,
    true,
  );

  const change = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const filtered = !!(date || search);

  return (
    <div className="dash-page dash-orders">
      <PageHeading
        title="Pesanan"
        description="Pantau pesanan lunas dan proses pemenuhannya."
        refresh={() => {
          void q.refetch();
        }}
      />

      <div className="dash-tab-select">
        <Select
          label="Status pesanan"
          value={tab.key}
          options={orderTabs.map((item) => ({
            value: item.key,
            label: item.label,
          }))}
          onChange={(value) => change(() => setTabKey(value))}
        />
      </div>

      <div
        className="dash-tabs is-collapsible"
        role="group"
        aria-label="Filter status pesanan"
      >
        {orderTabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className="dash-tab"
            aria-pressed={item.key === tab.key}
            onClick={() => change(() => setTabKey(item.key))}
          >
            {item.label}
            {item.key === tab.key && q.data && (
              <span className="dash-tab-count">{q.data.total}</span>
            )}
          </button>
        ))}
      </div>

      <div className="dash-toolbar">
        <label className="dash-search">
          <span className="sr-only">Cari nomor pesanan</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Cari nomor pesanan, mis. BEE-2026…"
            value={search}
            onChange={(e) => change(() => setSearch(e.target.value))}
            maxLength={50}
          />
        </label>

        <label className="dash-field">
          <span className="dash-field-label">Tanggal pickup</span>
          <input
            type="date"
            value={date}
            onChange={(e) => change(() => setDate(e.target.value))}
          />
        </label>

        <Select
          label="Urutan"
          value={sort}
          options={sortOptions}
          onChange={(value) => change(() => setSort(value))}
        />

        {filtered && (
          <button
            type="button"
            className="dash-button is-ghost dash-toolbar-reset"
            onClick={() =>
              change(() => {
                setDate('');
                setSearch('');
              })
            }
          >
            Hapus filter
          </button>
        )}
      </div>

      <QueryState
        pending={q.isPending}
        error={q.error}
        refresh={() => {
          void q.refetch();
        }}
      />

      {q.data && (
        <>
          <div
            className={q.isPlaceholderData ? 'dash-updating' : undefined}
            aria-busy={q.isPlaceholderData}
          >
            <OrderRows
              orders={q.data.items}
              caption={`Pesanan: ${tab.label}`}
            />
          </div>
          {q.data.total > 0 && (
            <Pagination
              page={page}
              total={q.data.total}
              size={25}
              onPage={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}

// =====================================================
// ORDER DETAIL
// =====================================================

const transitionLabels: Record<string, string> = {
  ACCEPTED: 'Terima pesanan',
  PREPARING: 'Mulai siapkan',
  READY_FOR_PICKUP: 'Tandai siap diambil',
  COMPLETED: 'Tandai sudah diambil',
};

const next: Record<string, string> = {
  NEW: 'ACCEPTED',
  ACCEPTED: 'PREPARING',
  PREPARING: 'READY_FOR_PICKUP',
  READY_FOR_PICKUP: 'COMPLETED',
};

const fulfillmentSteps = [
  'NEW',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'COMPLETED',
];

export function OrderDetailScreen({ id }: { id: string }) {
  const { tenant, membership } = useWorkspace();
  const client = useQueryClient();
  const q = useDashboardQuery<DashboardOrder>('order', `orders/${id}`, true);

  const [confirm, setConfirm] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');

  const mutation = useMutation({
    mutationFn: (target: string) =>
      dashboardApi(`orders/${id}/transition`, tenant, {
        method: 'POST',
        body: {
          target,
          version: q.data!.fulfillmentVersion,
          requestId: crypto.randomUUID(),
          ...(target === 'REQUIRES_REVIEW' ? { reason } : {}),
        },
      }),

    onSuccess: () => {
      setConfirm(null);
      setReason('');
      setNotice(
        'Status pesanan diperbarui. Notifikasi pelanggan diproses terpisah.',
      );
      void client.invalidateQueries({ queryKey: ['dashboard', tenant] });
    },

    onError: () => {
      void q.refetch();
    },
  });

  const order = q.data;
  const stage = order ? (order.fulfillmentStatus ?? order.status) : null;
  const target = order?.fulfillmentStatus
    ? next[order.fulfillmentStatus]
    : undefined;
  const eligible =
    order?.payment?.status === 'SUCCEEDED' && order.status === 'CONFIRMED';
  const stepIndex = stage ? fulfillmentSteps.indexOf(stage) : -1;

  return (
    <div className="dash-page dash-detail">
      <PageHeading
        back={{ href: '/dashboard/orders', label: 'Kembali ke pesanan' }}
        title={order?.orderNumber ?? 'Detail pesanan'}
        description="Rincian tersimpan saat checkout; harga historis tidak berubah."
        refresh={() => {
          void q.refetch();
        }}
      />

      <QueryState
        pending={q.isPending}
        error={q.error}
        refresh={() => {
          void q.refetch();
        }}
      />

      {notice && (
        <p role="status" className="dash-notice">
          {notice}
        </p>
      )}

      {mutation.error && (
        <p role="alert" className="dash-error">
          {mutation.error.message}
        </p>
      )}

      {order && (
        <>
          <div className="dash-detail-grid">
            <section
              className="dash-card dash-panel"
              aria-labelledby="detail-title"
            >
              <h2 id="detail-title">Rincian pesanan</h2>

              <dl className="dash-definition">
                <dt>Tenant</dt>
                <dd>{order.tenantName}</dd>

                <dt>Pelanggan</dt>
                <dd>{order.customer.displayName ?? 'Pelanggan WhatsApp'}</dd>

                <dt>Dibuat</dt>
                <dd>{time(order.placedAt)}</dd>

                <dt>Pickup</dt>
                <dd>{time(order.pickupSlot.startsAt)}</dd>

                <dt>Pembayaran</dt>
                <dd className="dash-definition-status">
                  {order.payment && <Status value={order.payment.status} />}
                  <span>{paymentSourceLabel(order.payment)}</span>
                </dd>

                <dt>Pemenuhan</dt>
                <dd className="dash-definition-status">
                  <Status value={stage} />
                </dd>
              </dl>

              <ul className="dash-items" aria-label="Item pesanan">
                {order.items.map((item, index) => (
                  <li key={index}>
                    <div>
                      <strong>
                        {item.quantity}× {item.nameSnapshot}
                      </strong>
                      <small>{money(item.unitPrice)} / item</small>
                    </div>
                    <strong className="numeric">
                      {money(item.lineSubtotal)}
                    </strong>
                  </li>
                ))}
              </ul>

              <div className="dash-total">
                <span>Total</span>
                <strong className="numeric">{money(order.totalAmount)}</strong>
              </div>
            </section>

            <section
              className="dash-card dash-panel dash-actions-panel"
              aria-labelledby="action-title"
            >
              <h2 id="action-title">Tindakan</h2>

              {stepIndex >= 0 && (
                <ol className="dash-steps" aria-label="Tahap pemenuhan">
                  {fulfillmentSteps.map((step, index) => (
                    <li
                      key={step}
                      className={
                        index < stepIndex
                          ? 'is-done'
                          : index === stepIndex
                            ? 'is-current'
                            : undefined
                      }
                      aria-current={index === stepIndex ? 'step' : undefined}
                    >
                      {stageLabels[step]}
                    </li>
                  ))}
                </ol>
              )}

              {eligible && target ? (
                <>
                  <p className="dash-next-step">
                    Langkah berikutnya:{' '}
                    {transitionLabels[target]!.toLowerCase()}.
                  </p>
                  <button
                    type="button"
                    className="dash-button is-primary is-block"
                    onClick={() => setConfirm(target)}
                    disabled={mutation.isPending}
                  >
                    {transitionLabels[target]}
                  </button>
                </>
              ) : (
                <p className="dash-next-step">
                  Tidak ada tindakan pemenuhan yang tersedia pada status ini.
                </p>
              )}

              {membership.role === 'OWNER' &&
                eligible &&
                order.fulfillmentStatus &&
                activeStages.includes(order.fulfillmentStatus) && (
                  <button
                    type="button"
                    className="dash-button is-danger-outline is-block"
                    onClick={() => setConfirm('REQUIRES_REVIEW')}
                  >
                    Laporkan kendala pemenuhan
                  </button>
                )}

              <p className="dash-fine">
                Perubahan status tidak membatalkan pembayaran atau mengembalikan
                dana.
              </p>
            </section>
          </div>

          <div className="dash-detail-grid is-even">
            <section
              className="dash-card dash-panel"
              aria-labelledby="history-title"
            >
              <h2 id="history-title">Riwayat pemenuhan</h2>

              {order.fulfillmentHistory?.length ? (
                <ol className="dash-history">
                  {order.fulfillmentHistory.map((entry, index) => (
                    <li key={index}>
                      <div className="dash-history-head">
                        <strong>
                          {stageLabels[entry.toStatus] ?? entry.toStatus}
                        </strong>
                        <time dateTime={entry.createdAt}>
                          {time(entry.createdAt)}
                        </time>
                      </div>
                      <small>
                        Oleh pengguna {entry.actorUserId.slice(0, 8)}
                      </small>
                      {entry.reason && <p>{entry.reason}</p>}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="dash-empty">Belum ada perubahan oleh tenant.</p>
              )}
            </section>

            <section
              className="dash-card dash-panel"
              aria-labelledby="notif-title"
            >
              <h2 id="notif-title">Notifikasi pelanggan</h2>

              {order.notifications?.length ? (
                <ul className="dash-history">
                  {order.notifications.map((entry, index) => (
                    <li key={index}>
                      <div className="dash-history-head">
                        <strong>
                          {notificationKindLabels[entry.kind] ?? entry.kind}
                        </strong>
                        <time dateTime={entry.createdAt}>
                          {time(entry.createdAt)}
                        </time>
                      </div>
                      <small>
                        {notificationStateLabels[entry.state] ?? entry.state}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-empty">Belum ada notifikasi.</p>
              )}
            </section>
          </div>

          {confirm && (
            <ConfirmDialog
              title={
                confirm === 'REQUIRES_REVIEW'
                  ? 'Laporkan kendala'
                  : transitionLabels[confirm]!
              }
              close={() => setConfirm(null)}
            >
              <p>
                {confirm === 'REQUIRES_REVIEW'
                  ? 'Pembayaran dan reservasi tetap tersimpan. Tindak lanjut perlu dilakukan pengelola; tidak ada refund otomatis.'
                  : `Pesanan ${order.orderNumber} akan berpindah ke tahap “${stageLabels[confirm]}”. Pastikan kondisi pesanan sesuai.`}
              </p>

              {confirm === 'REQUIRES_REVIEW' && (
                <label className="dash-field">
                  <span className="dash-field-label">Alasan kendala</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    required
                  />
                </label>
              )}

              <div className="dash-dialog-actions">
                <button
                  type="button"
                  className="dash-button"
                  onClick={() => setConfirm(null)}
                >
                  Kembali
                </button>
                <button
                  type="button"
                  className="dash-button is-primary"
                  disabled={
                    mutation.isPending ||
                    (confirm === 'REQUIRES_REVIEW' && !reason.trim())
                  }
                  onClick={() => mutation.mutate(confirm)}
                >
                  {mutation.isPending ? 'Menyimpan…' : 'Konfirmasi'}
                </button>
              </div>
            </ConfirmDialog>
          )}
        </>
      )}
    </div>
  );
}

// =====================================================
// CONFIRM DIALOG
// =====================================================

export function ConfirmDialog({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dash-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      {children}
    </dialog>
  );
}
