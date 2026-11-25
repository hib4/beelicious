
'use client';

import Link from 'next/link';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type {
  DashboardOrder,
  Overview,
  PageResult,
} from '@beelicious/shared';

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
} from './workspace';

// =====================================================
// MOCK ORDERS
// =====================================================

const mockOrders = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    orderNumber: 'BL-2026-001',

    customer: {
      displayName: 'Andi Pratama',
    },

    placedAt: new Date().toISOString(),

    items: [
      {
        quantity: 2,
        nameSnapshot: 'Nasi Ayam',
        unitPrice: 25000,
        lineSubtotal: 50000,
      },
      {
        quantity: 1,
        nameSnapshot: 'Es Teh',
        unitPrice: 10000,
        lineSubtotal: 10000,
      },
    ],

    pickupSlot: {
      startsAt: '2026-11-17T09:20:00.000Z',
    },

    payment: {
      status: 'SUCCEEDED',
      provider: 'mock',
    },

    fulfillmentStatus: 'ACCEPTED',
    status: 'CONFIRMED',

    totalAmount: 60000,
    fulfillmentVersion: 1,
    tenantName: 'Beelicious Demo Tenant',

    fulfillmentHistory: [],
    notifications: [],
  },

  {
    id: '22222222-2222-4222-8222-222222222222',
    orderNumber: 'BL-2026-002',

    customer: {
      displayName: 'Siti Rahma',
    },

    placedAt: new Date().toISOString(),

    items: [
      {
        quantity: 2,
        nameSnapshot: 'Burger',
        unitPrice: 25000,
        lineSubtotal: 50000,
      },
    ],

    pickupSlot: {
      startsAt: '2026-11-17T10:20:00.000Z',
    },

    payment: {
      status: 'SUCCEEDED',
      provider: 'mock',
    },

    fulfillmentStatus: 'PREPARING',
    status: 'CONFIRMED',

    totalAmount: 50000,
    fulfillmentVersion: 1,
    tenantName: 'Beelicious Demo Tenant',

    fulfillmentHistory: [],
    notifications: [],
  },

  {
    id: '33333333-3333-4333-8333-333333333333',
    orderNumber: 'BL-2026-003',

    customer: {
      displayName: 'Budi Santoso',
    },

    placedAt: new Date().toISOString(),

    items: [
      {
        quantity: 1,
        nameSnapshot: 'Paket Hemat',
        unitPrice: 100000,
        lineSubtotal: 100000,
      },
    ],

    pickupSlot: {
      startsAt: '2026-11-17T11:20:00.000Z',
    },

    payment: {
      status: 'SUCCEEDED',
      provider: 'mock',
    },

    fulfillmentStatus: 'READY_FOR_PICKUP',
    status: 'CONFIRMED',

    totalAmount: 100000,
    fulfillmentVersion: 1,
    tenantName: 'Beelicious Demo Tenant',

    fulfillmentHistory: [],
    notifications: [],
  },
] as unknown as DashboardOrder[];

// =====================================================
// ORDER ROWS
// =====================================================


// =====================================================
// ORDER ROWS
// =====================================================

const orderActionLabels: Record<string, string> = {
  ACCEPTED: 'Mulai siapkan',
  PREPARING: 'Tandai siap',
  READY_FOR_PICKUP: 'Selesaikan',
  COMPLETED: 'Selesai',
};

function formatPickupTime(value: string) {
  const date = new Date(value);

  const time = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const day = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

  return { time, day };
}

export function OrderRows({
  orders,
}: {
  orders: DashboardOrder[];
}) {
  return (
    <div className="dash-orders-table-wrap">
      <table className="dash-orders-table">
        <thead>
          <tr>
            <th>Pesanan / Pelanggan</th>
            <th>Menu</th>
            <th>Pickup</th>
            <th>Pembayaran / Pemenuhan</th>
            <th className="numeric">Total</th>
            <th className="dash-orders-action-heading">Aksi</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => {
            const fulfillment =
              order.fulfillmentStatus ?? order.status;

            const action =
              orderActionLabels[fulfillment] ?? 'Lihat detail';

            const pickup = formatPickupTime(
              order.pickupSlot.startsAt,
            );

            const rowStatus =
              fulfillment === 'ACCEPTED'
                ? 'is-accepted'
                : fulfillment === 'PREPARING'
                  ? 'is-preparing'
                  : fulfillment === 'READY_FOR_PICKUP'
                    ? 'is-ready'
                    : '';

            const actionStyle =
              fulfillment === 'ACCEPTED'
                ? 'is-yellow'
                : fulfillment === 'PREPARING'
                  ? 'is-dark'
                  : fulfillment === 'READY_FOR_PICKUP'
                    ? 'is-outline'
                    : 'is-outline';

            return (
              <tr
                key={order.id}
                className={rowStatus}
              >
                <td>
                  <Link
                    className="dash-order-link"
                    href={`/dashboard/orders/${order.id}`}
                  >
                    {order.orderNumber}
                  </Link>

                  <span className="dash-orders-customer">
                    {order.customer.displayName ??
                      'Pelanggan WhatsApp'}
                  </span>

                  <small>
                    Dibuat {time(order.placedAt)}
                  </small>
                </td>

                <td>
                  {order.items.map((item, index) => (
                    <span
                      className="dash-line"
                      key={index}
                    >
                      {item.quantity}× {item.nameSnapshot}
                    </span>
                  ))}
                </td>

                <td>
                  <div className="dash-orders-pickup">
                    <strong>{pickup.time}</strong>
                    <span>WIB</span>
                  </div>

                  <small>{pickup.day}</small>
                </td>

                <td>
                  <div className="dash-orders-statuses">
                    <Status
                      value={order.payment?.status ?? null}
                    />

                    <Status value={fulfillment} />
                  </div>

                  <small>
                    {order.payment?.provider === 'mock'
                      ? 'Pembayaran simulasi'
                      : 'Midtrans Sandbox'}
                  </small>
                </td>

                <td className="numeric">
                  {money(order.totalAmount)}
                </td>

                <td className="dash-orders-action-cell">
                  <Link
                    href={`/dashboard/orders/${order.id}`}
                    className={`dash-orders-action ${actionStyle}`}
                  >
                    {action}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!orders.length && (
        <p className="dash-empty">
          Belum ada pesanan pada pilihan ini.
        </p>
      )}
    </div>
  );
}


// =====================================================
// OVERVIEW SCREEN
// =====================================================


export function OverviewScreen() {
  const { bypass } = useWorkspace();

  const q = useDashboardQuery<Overview>(
    'overview',
    'overview',
    true,
    !bypass,
  );

  const mockOverview = {
    paidToday: 24,
    awaitingAcceptance: 3,
    accepted: 5,
    preparing: 4,
    ready: 6,
    completedToday: 18,
    requiresReview: 1,
    paidGross: 1250000,
    providers: ['mock'],
    recent: mockOrders,
    asOf: '2026-11-17T09:20:00.000Z',
  } as unknown as Overview;

  const data = bypass ? mockOverview : q.data;

  const pickupOrders = data
    ? [...data.recent]
        .sort(
          (a, b) =>
            new Date(a.pickupSlot.startsAt).getTime() -
            new Date(b.pickupSlot.startsAt).getTime(),
        )
        .slice(0, 3)
    : [];

const pickupTime = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));

const today = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date());  

  const actionLabels: Record<string, string> = {
    ACCEPTED: 'Mulai siapkan',
    PREPARING: 'Tandai siap',
    READY_FOR_PICKUP: 'Selesaikan',
    COMPLETED: 'Selesai',
  };

  return (
    <div className="dash-overview">
  <PageHeading
    title="Selamat siang, Agus"
    description={`${today} · Operasional hari ini · Asia/Jakarta`}
    refresh={() => {
      if (!bypass) {
        void q.refetch();
      }
    }}
/>

      {!bypass && (
        <QueryState
          pending={q.isPending}
          error={q.error}
          refresh={() => {
            void q.refetch();
          }}
        />
      )}

      {data && (
        <>
          {/* BANNER PESANAN MENUNGGU */}
          <section className="dash-overview-alert">
            <div className="dash-overview-alert-icon">
              <span>♟</span>
            </div>

            <div className="dash-overview-alert-content">
              <strong>
                {data.awaitingAcceptance} pesanan menunggu diterima
              </strong>
              <p>
                Segera konfirmasi pesanan agar pickup tetap tepat waktu.
              </p>
            </div>

            <Link
              href="/dashboard/orders"
              className="dash-overview-alert-button"
            >
              Lihat pesanan
            </Link>
          </section>

          {/* ALUR PESANAN */}
          <section className="dash-overview-flow">
            <h2>Alur pesanan hari ini</h2>

            <div className="dash-overview-metrics">
              {[
                {
                  label: 'Menunggu diterima',
                  value: data.awaitingAcceptance,
                  color: 'waiting',
                },
                {
                  label: 'Diterima',
                  value: data.accepted,
                  color: 'accepted',
                },
                {
                  label: 'Sedang disiapkan',
                  value: data.preparing,
                  color: 'preparing',
                },
                {
                  label: 'Siap diambil',
                  value: data.ready,
                  color: 'ready',
                },
                {
                  label: 'Selesai hari ini',
                  value: data.completedToday,
                  color: 'completed',
                },
              ].map((item) => (
                <div
                  className={`dash-overview-metric is-${item.color}`}
                  key={item.label}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <div className="dash-overview-metric-line" />
                </div>
              ))}
            </div>
          </section>

          {/* RINGKASAN PEMBAYARAN DAN PICKUP */}
          <section className="dash-overview-summary">
            <div className="dash-overview-gross">
              <div className="dash-overview-card-heading">
                <span>Nilai bruto pembayaran berhasil</span>
                <span className="dash-overview-mock-badge">
                  {data.providers.includes('mock') ? 'MOCK' : 'SANDBOX'}
                </span>
              </div>

              {typeof data.paidGross === 'number' && (
                  <strong>{money(data.paidGross)}</strong>
              )}

              <p>
                Dari pembayaran terverifikasi hari ini. Bukan laba
                atau pencairan merchant.
              </p>
            </div>

            <div className="dash-overview-pickup">
              <div className="dash-overview-card-heading">
                <strong>Pickup terdekat</strong>
                <Link href="/dashboard/pickup">
                  Jadwal Pickup
                </Link>
              </div>

              {pickupOrders.length > 0 ? (
                <div className="dash-overview-timeline">
                  {pickupOrders.map((order, index) => (
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="dash-overview-timeline-item"
                      key={order.id}
                    >
                      <span
                        className={`dash-overview-timeline-dot ${
                          index === 0 ? 'is-active' : ''
                        }`}
                      />

                      <strong>
                        {pickupTime(order.pickupSlot.startsAt)}
                      </strong>

                      <small>{order.orderNumber}</small>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="dash-empty">
                  Belum ada jadwal pickup.
                </p>
              )}
            </div>

            <Link
              href="/dashboard/orders"
              className="dash-overview-review"
            >
              <span>Perlu pemeriksaan</span>
              <strong>{data.requiresReview}</strong>
              <small>Periksa pembayaran</small>
            </Link>
          </section>

          {/* PESANAN TERBARU */}
          <section className="dash-overview-recent">
            <div className="dash-section-title">
              <h2>Pesanan terbaru</h2>
              <Link href="/dashboard/orders">
                Lihat semua pesanan
              </Link>
            </div>

            <div className="dash-table-wrap">
              <table className="dash-table dash-overview-table">
                <thead>
                  <tr>
                    <th>Pesanan</th>
                    <th>Menu</th>
                    <th>Pickup</th>
                    <th>Status</th>
                    <th className="numeric">Total</th>
                    <th>Aksi</th>
                  </tr>
                </thead>

                <tbody>
                  {data.recent.map((order) => {
                    const fulfillment =
                      order.fulfillmentStatus ?? order.status;

                    const action =
                      actionLabels[fulfillment] ?? 'Lihat detail';

                    return (
                      <tr key={order.id}>
                        <td>
                          <Link
                            className="dash-order-link"
                            href={`/dashboard/orders/${order.id}`}
                          >
                            {order.orderNumber}
                          </Link>

                          <small>
                            {order.customer.displayName ??
                              'Pelanggan WhatsApp'}
                          </small>
                        </td>

                        <td>
                          {order.items.map((item, index) => (
                            <span
                              className="dash-line"
                              key={index}
                            >
                              {item.quantity}× {item.nameSnapshot}
                            </span>
                          ))}
                        </td>

                        <td>{time(order.pickupSlot.startsAt)}</td>

                        <td>
                          <Status
                            value={order.payment?.status ?? null}
                          />
                          <Status value={fulfillment} />
                        </td>

                        <td className="numeric">
                          {money(order.totalAmount)}
                        </td>

                        <td>
                          <Link
                            href={`/dashboard/orders/${order.id}`}
                            className={`dash-overview-action ${
                              fulfillment === 'ACCEPTED' ||
                              fulfillment === 'PREPARING'
                                ? 'is-dark'
                                : fulfillment === 'READY_FOR_PICKUP'
                                  ? 'is-outline'
                                  : ''
                            }`}
                          >
                            {action}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!data.recent.length && (
                <p className="dash-empty">
                  Belum ada pesanan terbaru.
                </p>
              )}
            </div>
          </section>

          <p className="dash-muted dash-overview-updated">
            Diperbarui {time(data.asOf)}
            {bypass
              ? ' · Data simulasi development · Pembayaran simulasi (Mock)'
              : ' · Pembaruan otomatis setiap 8 detik'}
          </p>
        </>
      )}
    </div>
  );
}


// =====================================================
// ORDERS SCREEN
// =====================================================


// =====================================================
// ORDERS SCREEN
// =====================================================

export function OrdersScreen() {
  const { bypass } = useWorkspace();

  const [status, setStatus] = useState('');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('pickup');
  const [scope, setScope] = useState('actionable');
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({
    page: String(page),
    pageSize: '25',
    sort,
    scope,
    ...(status ? { status } : {}),
    ...(date ? { date } : {}),
    ...(search ? { search } : {}),
  });

  const q = useDashboardQuery<PageResult<DashboardOrder>>(
    'orders',
    `orders?${params}`,
    true,
    !bypass,
  );

  // Mock order filtering.
  const filteredOrders = mockOrders.filter((order) => {
    const matchesStatus =
      !status ||
      order.fulfillmentStatus === status ||
      order.status === status;

    const matchesSearch =
      !search ||
      order.orderNumber
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (order.customer.displayName ?? '')
        .toLowerCase()
        .includes(search.toLowerCase());

    const matchesDate =
      !date ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
      }).format(new Date(order.pickupSlot.startsAt)) === date;

    const currentStatus =
      order.fulfillmentStatus ?? order.status;

    const matchesScope =
      scope === 'all' ||
      !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(
        currentStatus,
      );

    return (
      matchesStatus &&
      matchesSearch &&
      matchesDate &&
      matchesScope
    );
  });

  // Sorting.
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (sort === 'created') {
      return (
        new Date(b.placedAt).getTime() -
        new Date(a.placedAt).getTime()
      );
    }

    return (
      new Date(a.pickupSlot.startsAt).getTime() -
      new Date(b.pickupSlot.startsAt).getTime()
    );
  });

  // Pagination.
  const displayedOrders = bypass
    ? sortedOrders.slice((page - 1) * 25, page * 25)
    : q.data?.items ?? [];

  const total = bypass
    ? sortedOrders.length
    : q.data?.total ?? 0;

  // Quick status counts.
  const countSource = bypass
    ? mockOrders
    : q.data?.items ?? [];

  const counts = {
    all: countSource.length,
    accepted: countSource.filter(
      (order) =>
        (order.fulfillmentStatus ?? order.status) === 'ACCEPTED',
    ).length,
    preparing: countSource.filter(
      (order) =>
        (order.fulfillmentStatus ?? order.status) === 'PREPARING',
    ).length,
    ready: countSource.filter(
      (order) =>
        (order.fulfillmentStatus ?? order.status) ===
        'READY_FOR_PICKUP',
    ).length,
  };

  const change = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="dash-orders-page">
      <PageHeading
        title="Pesanan"
        description="Pantau pesanan lunas dan proses pemenuhannya."
        refresh={() => {
          if (!bypass) {
            void q.refetch();
          }
        }}
      />

      {/* FILTER PANEL */}
      <div className="dash-orders-filter-panel">
        <div className="dash-filters">
          <label>
            Cari nomor pesanan

            <input
              type="search"
              placeholder="Cari BL-2026-..."
              value={search}
              onChange={(e) =>
                change(() => setSearch(e.target.value))
              }
              maxLength={50}
            />
          </label>

          <label>
            Antrean

            <select
              value={scope}
              onChange={(e) =>
                change(() => setScope(e.target.value))
              }
            >
              <option value="actionable">Lunas & aktif</option>
              <option value="all">Semua pesanan</option>
            </select>
          </label>

          <label>
            Status pemenuhan

            <select
              value={status}
              onChange={(e) =>
                change(() => setStatus(e.target.value))
              }
            >
              <option value="">Semua status</option>

              {Object.entries(stageLabels)
                .slice(0, 6)
                .map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Tanggal pickup

            <input
              type="date"
              value={date}
              onChange={(e) =>
                change(() => setDate(e.target.value))
              }
            />
          </label>

          <label>
            Urutan

            <select
              value={sort}
              onChange={(e) =>
                change(() => setSort(e.target.value))
              }
            >
              <option value="pickup">Pickup terdekat</option>
              <option value="created">Pesanan terbaru</option>
            </select>
          </label>
        </div>

        {/* QUICK STATUS FILTER */}
        <div className="dash-order-tabs">
          <button
            type="button"
            className={!status ? 'is-active' : ''}
            onClick={() => change(() => setStatus(''))}
          >
            Semua <span>{counts.all}</span>
          </button>

          <button
            type="button"
            className={status === 'ACCEPTED' ? 'is-active' : ''}
            onClick={() =>
              change(() => setStatus('ACCEPTED'))
            }
          >
            Diterima <span>{counts.accepted}</span>
          </button>

          <button
            type="button"
            className={status === 'PREPARING' ? 'is-active' : ''}
            onClick={() =>
              change(() => setStatus('PREPARING'))
            }
          >
            Disiapkan <span>{counts.preparing}</span>
          </button>

          <button
            type="button"
            className={
              status === 'READY_FOR_PICKUP' ? 'is-active' : ''
            }
            onClick={() =>
              change(() => setStatus('READY_FOR_PICKUP'))
            }
          >
            Siap diambil <span>{counts.ready}</span>
          </button>
        </div>
      </div>

      {!bypass && (
        <QueryState
          pending={q.isPending}
          error={q.error}
          refresh={() => {
            void q.refetch();
          }}
        />
      )}

      {(bypass || q.data) && (
        <>
          <OrderRows orders={displayedOrders} />

          <Pagination
            page={page}
            total={total}
            size={25}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}


// =====================================================
// ORDER DETAIL CONSTANTS
// =====================================================

const actionLabels: Record<string, string> = {
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

// =====================================================
// ORDER DETAIL SCREEN
// =====================================================

export function OrderDetailScreen({
  id,
}: {
  id: string;
}) {
  const { tenant, membership, bypass } = useWorkspace();

  const client = useQueryClient();

  const q = useDashboardQuery<DashboardOrder>(
    'order',
    `orders/${id}`,
    true,
    !bypass,
  );

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
          ...(target === 'REQUIRES_REVIEW'
            ? { reason }
            : {}),
        },
      }),

        onSuccess: () => {
      setConfirm(null);
      setReason('');

      setNotice(
        'Status pesanan diperbarui. Notifikasi pelanggan diproses terpisah.',
      );

      void client.invalidateQueries({
        queryKey: ['dashboard', tenant],
      });
    },

    onError: () => {
      void q.refetch();
    },
  });

  const mockOrder = mockOrders.find((order) => order.id === id);

  const order = bypass ? mockOrder : q.data;

  const target = order?.fulfillmentStatus
    ? next[order.fulfillmentStatus]
    : undefined;

  const eligible =
    order?.payment?.status === 'SUCCEEDED' &&
    order.status === 'CONFIRMED';

  return (
    <>
      <Link href="/dashboard/orders">
        Kembali ke pesanan
      </Link>

      <PageHeading
        title={order?.orderNumber ?? 'Detail pesanan'}
        description="Rincian tersimpan saat checkout; harga historis tidak berubah."
        refresh={() => {
          if (!bypass) {
            void q.refetch();
          }
        }}
      />

      {!bypass && (
        <QueryState
          pending={q.isPending}
          error={q.error}
          refresh={() => {
            void q.refetch();
          }}
        />
      )}

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

      {bypass && !mockOrder && (
        <p className="dash-empty">
          Data pesanan simulasi tidak ditemukan.
        </p>
      )}

      {order && (
        <>
          <div className="dash-detail-grid">
            <section className="dash-panel">
              <h2>Rincian pesanan</h2>

              <dl className="dash-definition">
                <dt>Tenant</dt>
                <dd>{order.tenantName}</dd>

                <dt>Pelanggan</dt>
                <dd>
                  {order.customer.displayName ??
                    'Pelanggan WhatsApp'}
                </dd>

                <dt>Dibuat</dt>
                <dd>{time(order.placedAt)}</dd>

                <dt>Pickup</dt>
                <dd>{time(order.pickupSlot.startsAt)}</dd>

                <dt>Pembayaran</dt>
                <dd>
                  <Status
                    value={order.payment?.status ?? null}
                  />

                  {order.payment?.provider === 'mock'
                    ? ' Mock (simulasi)'
                    : ' Midtrans Sandbox'}
                </dd>

                <dt>Pemenuhan</dt>
                <dd>
                  <Status
                    value={
                      order.fulfillmentStatus ?? order.status
                    }
                  />
                </dd>
              </dl>

              <ul className="dash-items">
                {order.items.map((i, n) => (
                  <li key={n}>
                    <div>
                      <strong>
                        {i.quantity}× {i.nameSnapshot}
                      </strong>

                      <small>
                        {money(i.unitPrice)} / item
                      </small>
                    </div>

                    <strong>{money(i.lineSubtotal)}</strong>
                  </li>
                ))}
              </ul>

              <div className="dash-total">
                <span>Total</span>
                <strong>{money(order.totalAmount)}</strong>
              </div>
            </section>

            <section className="dash-panel">
              <h2>Tindakan</h2>

              {bypass ? (
                <p className="dash-empty">
                  Tindakan perubahan status dinonaktifkan
                  dalam mode simulasi development.
                </p>
              ) : eligible && target ? (
                <>
                  <p>
                    Langkah berikutnya:{' '}
                    {actionLabels[target]!.toLowerCase()}.
                  </p>

                  <button
                    className="dash-primary"
                    onClick={() => setConfirm(target)}
                    disabled={mutation.isPending}
                  >
                    {actionLabels[target]}
                  </button>
                </>
              ) : (
                <p className="dash-empty">
                  Tidak ada tindakan pemenuhan yang tersedia
                  pada status ini.
                </p>
              )}

              {!bypass &&
                membership.role === 'OWNER' &&
                eligible &&
                order.fulfillmentStatus &&
                [
                  'NEW',
                  'ACCEPTED',
                  'PREPARING',
                  'READY_FOR_PICKUP',
                ].includes(order.fulfillmentStatus) && (
                  <button
                    onClick={() =>
                      setConfirm('REQUIRES_REVIEW')
                    }
                  >
                    Laporkan kendala pemenuhan
                  </button>
                )}

              <p className="dash-muted">
                Perubahan status tidak membatalkan pembayaran
                atau mengembalikan dana.
              </p>
            </section>
          </div>

          <section className="dash-section">
            <h2>Riwayat pemenuhan</h2>

            {order.fulfillmentHistory?.length ? (
              <ol className="dash-history">
                {order.fulfillmentHistory.map((h, n) => (
                  <li key={n}>
                    <strong>{stageLabels[h.toStatus]}</strong>

                    <span>{time(h.createdAt)}</span>

                    <small>
                      Oleh {h.actorUserId.slice(0, 8)}
                    </small>

                    {h.reason && <p>{h.reason}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="dash-empty">
                Belum ada perubahan oleh tenant.
              </p>
            )}
          </section>

          <section className="dash-section">
            <h2>Notifikasi pelanggan</h2>

            {order.notifications?.length ? (
              <ul className="dash-history">
                {order.notifications.map((n, i) => (
                  <li key={i}>
                    <span>
                      {n.kind === 'fulfillment'
                        ? 'Pemenuhan'
                        : n.kind === 'qr'
                          ? 'Instruksi pembayaran'
                          : 'Checkout'}
                    </span>

                    <span>{n.state}</span>

                    <small>{time(n.createdAt)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-empty">
                Belum ada notifikasi.
              </p>
            )}
          </section>

          {!bypass && confirm && (
            <div className="dash-dialog-backdrop">
              <ConfirmDialog
                title={
                  confirm === 'REQUIRES_REVIEW'
                    ? 'Laporkan kendala'
                    : actionLabels[confirm]!
                }
                close={() => setConfirm(null)}
              >
                <p>
                  {confirm === 'REQUIRES_REVIEW'
                    ? 'Pembayaran dan reservasi tetap tersimpan. Tindak lanjut perlu dilakukan pengelola; tidak ada refund otomatis.'
                    : 'Pastikan kondisi pesanan sesuai sebelum melanjutkan.'}
                </p>

                {confirm === 'REQUIRES_REVIEW' && (
                  <label>
                    Alasan kendala

                    <textarea
                      value={reason}
                      onChange={(e) =>
                        setReason(e.target.value)
                      }
                      maxLength={500}
                      required
                    />
                  </label>
                )}

                <div className="dash-actions">
                  <button onClick={() => setConfirm(null)}>
                    Kembali
                  </button>

                  <button
                    className="dash-primary"
                    disabled={
                      mutation.isPending ||
                      (confirm === 'REQUIRES_REVIEW' &&
                        !reason.trim())
                    }
                    onClick={() => mutation.mutate(confirm)}
                  >
                    {mutation.isPending
                      ? 'Menyimpan…'
                      : 'Konfirmasi'}
                  </button>
                </div>
              </ConfirmDialog>
            </div>
          )}
        </>
      )}
    </>
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
