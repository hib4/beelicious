import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OrderRows } from '@/components/dashboard/orders';
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
    tenantName: 'Warung Babe',
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
