'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
} from './workspace';
export function OrderRows({ orders }: { orders: DashboardOrder[] }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th>Pesanan / pelanggan</th>
            <th>Menu</th>
            <th>Pickup</th>
            <th>Pembayaran / pemenuhan</th>
            <th className="numeric">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link
                  className="dash-order-link"
                  href={`/dashboard/orders/${o.id}`}
                >
                  {o.orderNumber}
                </Link>
                <small>{o.customer.displayName ?? 'Pelanggan WhatsApp'}</small>
                <small>Dibuat {time(o.placedAt)}</small>
              </td>
              <td>
                {o.items.map((i, n) => (
                  <span className="dash-line" key={n}>
                    {i.quantity}× {i.nameSnapshot}
                  </span>
                ))}
              </td>
              <td>{time(o.pickupSlot.startsAt)}</td>
              <td>
                <Status value={o.payment?.status ?? null} />
                <Status value={o.fulfillmentStatus ?? o.status} />
                <small>
                  {o.payment?.provider === 'mock'
                    ? 'Pembayaran simulasi'
                    : 'Midtrans Sandbox'}
                </small>
              </td>
              <td className="numeric">{money(o.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && (
        <p className="dash-empty">Belum ada pesanan pada pilihan ini.</p>
      )}
    </div>
  );
}
export function OverviewScreen() {
  const q = useDashboardQuery<Overview>('overview', 'overview', true);
  return (
    <>
      <PageHeading
        title="Ringkasan"
        description="Operasional hari ini · Asia/Jakarta"
        refresh={() => q.refetch()}
      />
      <QueryState
        pending={q.isPending}
        error={q.error}
        refresh={() => q.refetch()}
      />
      {q.data && (
        <>
          <div className="dash-metrics">
            {[
              ['Pesanan lunas hari ini', q.data.paidToday],
              ['Menunggu diterima', q.data.awaitingAcceptance],
              ['Diterima', q.data.accepted],
              ['Sedang disiapkan', q.data.preparing],
              ['Siap diambil', q.data.ready],
              ['Selesai hari ini', q.data.completedToday],
              ['Perlu pemeriksaan', q.data.requiresReview],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {q.data.paidGross !== undefined && (
            <section className="dash-gross">
              <h2>Nilai bruto pembayaran berhasil</h2>
              <strong>{money(q.data.paidGross)}</strong>
              <p>
                Berdasarkan pembayaran terverifikasi hari ini. Bukan laba atau
                pencairan merchant.
              </p>
            </section>
          )}
          <p className="dash-notice">
            Lingkungan pengujian:{' '}
            {q.data.providers.includes('mock')
              ? 'termasuk pembayaran simulasi Mock.'
              : 'Midtrans Sandbox / Mock; bukan pembayaran produksi.'}
          </p>
          <section className="dash-section">
            <div className="dash-section-title">
              <h2>Pesanan terbaru</h2>
              <Link href="/dashboard/orders">Lihat semua pesanan</Link>
            </div>
            <OrderRows orders={q.data.recent} />
          </section>
          <p className="dash-muted">
            Diperbarui {time(q.data.asOf)} · Otomatis setiap 8 detik saat
            halaman aktif.
          </p>
        </>
      )}
    </>
  );
}
export function OrdersScreen() {
  const [status, setStatus] = useState(''),
    [date, setDate] = useState(''),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('pickup'),
    [scope, setScope] = useState('actionable'),
    [page, setPage] = useState(1);
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
  );
  const change = (fn: () => void) => {
    fn();
    setPage(1);
  };
  return (
    <>
      <PageHeading
        title="Pesanan"
        description="Pantau pesanan lunas dan proses pemenuhannya."
        refresh={() => q.refetch()}
      />
      <div className="dash-filters">
        <label>
          Cari nomor pesanan
          <input
            type="search"
            value={search}
            onChange={(e) => change(() => setSearch(e.target.value))}
            maxLength={50}
          />
        </label>
        <label>
          Antrean
          <select
            value={scope}
            onChange={(e) => change(() => setScope(e.target.value))}
          >
            <option value="actionable">Lunas & aktif</option>
            <option value="all">Semua pesanan</option>
          </select>
        </label>
        <label>
          Status pemenuhan
          <select
            value={status}
            onChange={(e) => change(() => setStatus(e.target.value))}
          >
            <option value="">Semua status</option>
            {Object.entries(stageLabels)
              .slice(0, 6)
              .map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
          </select>
        </label>
        <label>
          Tanggal pickup
          <input
            type="date"
            value={date}
            onChange={(e) => change(() => setDate(e.target.value))}
          />
        </label>
        <label>
          Urutan
          <select
            value={sort}
            onChange={(e) => change(() => setSort(e.target.value))}
          >
            <option value="pickup">Pickup terdekat</option>
            <option value="created">Pesanan terbaru</option>
          </select>
        </label>
      </div>
      <QueryState
        pending={q.isPending}
        error={q.error}
        refresh={() => q.refetch()}
      />
      {q.data && (
        <>
          <OrderRows orders={q.data.items} />
          <Pagination
            page={page}
            total={q.data.total}
            size={25}
            onPage={setPage}
          />
        </>
      )}
    </>
  );
}
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
  const target = order?.fulfillmentStatus
    ? next[order.fulfillmentStatus]
    : undefined;
  const eligible =
    order?.payment?.status === 'SUCCEEDED' && order.status === 'CONFIRMED';
  return (
    <>
      <Link href="/dashboard/orders">Kembali ke pesanan</Link>
      <PageHeading
        title={order?.orderNumber ?? 'Detail pesanan'}
        description="Rincian tersimpan saat checkout; harga historis tidak berubah."
        refresh={() => q.refetch()}
      />
      <QueryState
        pending={q.isPending}
        error={q.error}
        refresh={() => q.refetch()}
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
            <section className="dash-panel">
              <h2>Rincian pesanan</h2>
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
                <dd>
                  <Status value={order.payment?.status ?? null} />{' '}
                  {order.payment?.provider === 'mock'
                    ? 'Mock (simulasi)'
                    : 'Midtrans Sandbox'}
                </dd>
                <dt>Pemenuhan</dt>
                <dd>
                  <Status value={order.fulfillmentStatus ?? order.status} />
                </dd>
              </dl>
              <ul className="dash-items">
                {order.items.map((i, n) => (
                  <li key={n}>
                    <div>
                      <strong>
                        {i.quantity}× {i.nameSnapshot}
                      </strong>
                      <small>{money(i.unitPrice)} / item</small>
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
              {eligible && target ? (
                <>
                  <p>
                    Langkah berikutnya: {actionLabels[target]!.toLowerCase()}.
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
                  Tidak ada tindakan pemenuhan yang tersedia pada status ini.
                </p>
              )}
              {membership.role === 'OWNER' &&
                eligible &&
                order.fulfillmentStatus &&
                ['NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'].includes(
                  order.fulfillmentStatus,
                ) && (
                  <button onClick={() => setConfirm('REQUIRES_REVIEW')}>
                    Laporkan kendala pemenuhan
                  </button>
                )}
              <p className="dash-muted">
                Perubahan status tidak membatalkan pembayaran atau mengembalikan
                dana.
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
                    <small>Oleh {h.actorUserId.slice(0, 8)}</small>
                    {h.reason && <p>{h.reason}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="dash-empty">Belum ada perubahan oleh tenant.</p>
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
              <p className="dash-empty">Belum ada notifikasi.</p>
            )}
          </section>
          {confirm && (
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
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                      required
                    />
                  </label>
                )}
                <div className="dash-actions">
                  <button onClick={() => setConfirm(null)}>Kembali</button>
                  <button
                    className="dash-primary"
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
            </div>
          )}
        </>
      )}
    </>
  );
}
import { useEffect, useRef, type ReactNode } from 'react';
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
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
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
