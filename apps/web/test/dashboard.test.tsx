import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OrderRows, OverviewScreen } from '@/components/dashboard/orders';
import {
  paymentSourceLabel,
  WorkspaceProvider,
} from '@/components/dashboard/workspace';
import {
  Pagination,
  QueryState,
  Status,
  money,
} from '@/components/dashboard/workspace';
import type { DashboardOrder } from '@beelicious/shared';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/dashboard',
}));
vi.mock('@/lib/dashboard/actions', () => ({ logout: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({ clear: vi.fn() }),
}));
it('renders empty orders honestly', () => {
  render(<OrderRows orders={[]} />);
  expect(screen.getByText('Belum ada pesanan pada pilihan ini.')).toBeVisible();
});
it('uses historical item snapshots and separate payment/fulfillment labels', () => {
  const order = {
    id: 'order-id',
    orderNumber: 'BEE-TEST',
    tenantName: 'Bakmi Effata',
    placedAt: '2026-10-21T02:00:00Z',
    pickupSlot: { startsAt: '2026-10-21T04:00:00Z' },
    payment: { status: 'SUCCEEDED', provider: 'mock' },
    fulfillmentStatus: 'PREPARING',
    customer: { displayName: null },
    totalAmount: 40000,
    items: [
      {
        nameSnapshot: 'Historical rice',
        quantity: 2,
        unitPrice: 20000,
        lineSubtotal: 40000,
      },
    ],
  } as DashboardOrder;
  render(<OrderRows orders={[order]} />);
  expect(screen.getByText('2× Historical rice')).toBeVisible();
  expect(screen.getByText('Lunas')).toBeVisible();
  expect(screen.getByText('Disiapkan')).toBeVisible();
  expect(screen.getByRole('link', { name: 'BEE-TEST' })).toHaveAttribute(
    'href',
    '/dashboard/orders/order-id',
  );
  expect(screen.getByText('Pembayaran simulasi')).toBeVisible();
});
it('shows loading and retry states', () => {
  const refresh = vi.fn();
  const { rerender } = render(
    <QueryState pending error={null} refresh={refresh} />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Memuat');
  rerender(
    <QueryState
      pending={false}
      error={new Error('Tidak tersedia')}
      refresh={refresh}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Coba kembali' }));
  expect(refresh).toHaveBeenCalledOnce();
});
it('paginates bounded lists and gives statuses readable labels', () => {
  const change = vi.fn();
  render(
    <>
      <Pagination page={1} total={30} size={25} onPage={change} />
      <Status value="READY_FOR_PICKUP" />
    </>,
  );
  expect(screen.getByRole('button', { name: 'Sebelumnya' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
  expect(change).toHaveBeenCalledWith(2);
  expect(screen.getByText('Siap diambil')).toBeVisible();
  expect(money(20000)).toContain('20.000');
});

it('labels payment sources honestly and offers acceptance for new orders', () => {
  expect(paymentSourceLabel(null)).toBe('Belum ada pembayaran');
  expect(paymentSourceLabel({ provider: 'midtrans' })).toBe('Midtrans Sandbox');
  const order = {
    id: 'new-order',
    orderNumber: 'BEE-NEW',
    tenantName: 'Bakmi Effata',
    placedAt: '2026-10-21T02:00:00Z',
    pickupSlot: { startsAt: '2026-10-21T04:00:00Z' },
    payment: null,
    fulfillmentStatus: 'NEW',
    customer: { displayName: null },
    totalAmount: 25000,
    items: [],
  } as unknown as DashboardOrder;
  render(<OrderRows orders={[order]} />);
  expect(screen.getByRole('link', { name: 'Terima pesanan' })).toBeVisible();
  expect(screen.getByText('Belum ada pembayaran')).toBeVisible();
  expect(screen.queryByText('Midtrans Sandbox')).toBeNull();
});

it('greets the signed-in tenant with real data and hides an empty queue banner', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-25T09:30:00Z')); // 16:30 WIB
  const overview = {
    paidToday: 0,
    awaitingAcceptance: 0,
    accepted: 0,
    preparing: 0,
    ready: 0,
    requiresReview: 0,
    completedToday: 0,
    paidGross: 0,
    providers: [],
    recent: [],
    asOf: '2026-11-25T09:30:00Z',
    timezone: 'Asia/Jakarta',
  };
  const memberships = [
    {
      tenantId: 'tenant-1',
      role: 'OWNER',
      canManageAvailability: true,
      tenant: { name: 'Bakmi Effata', isActive: true },
    },
  ];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        data: url.endsWith('/memberships') ? memberships : overview,
      }),
    })),
  );
  render(
    <WorkspaceProvider account="owner@example.test">
      <OverviewScreen />
    </WorkspaceProvider>,
  );
  expect(
    await screen.findByRole('heading', { level: 1, name: 'Ringkasan' }),
  ).toBeVisible();
  expect(
    await screen.findByText(/Selamat sore, tim Bakmi Effata/),
  ).toBeVisible();
  expect(document.body.textContent).not.toMatch(/Agus/);
  expect(screen.queryByText(/pesanan menunggu diterima/)).toBeNull();
  expect(screen.queryByText('SANDBOX')).toBeNull();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
