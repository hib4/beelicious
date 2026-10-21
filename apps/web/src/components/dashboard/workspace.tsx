'use client';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  ClipboardList,
  Utensils,
  CalendarDays,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import type { Membership } from '@beelicious/shared';
import { logout } from '@/lib/dashboard/actions';
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function dashboardApi<T>(
  path: string,
  tenant: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api/dashboard/${path}`, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', 'x-tenant-id': tenant },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    cache: 'no-store',
  });
  const json = await response.json();
  if (!response.ok)
    throw new ApiError(
      json.error?.message ?? 'Layanan tidak tersedia. Coba kembali.',
      response.status,
    );
  return json.data as T;
}
const Workspace = createContext<{
  tenant: string;
  membership: Membership;
} | null>(null);
export function useWorkspace() {
  const value = useContext(Workspace);
  if (!value) throw new Error('Workspace required');
  return value;
}
export function useDashboardQuery<T>(name: string, path: string, poll = false) {
  const { tenant } = useWorkspace();
  return useQuery({
    queryKey: ['dashboard', tenant, name, path],
    queryFn: ({ signal }) => dashboardApi<T>(path, tenant, { signal }),
    ...(poll
      ? { refetchInterval: 8000, refetchIntervalInBackground: false }
      : {}),
    staleTime: 2000,
    retry: (count, error) =>
      !(error instanceof ApiError && [401, 403, 404].includes(error.status)) &&
      count < 1,
  });
}
export function WorkspaceProvider({
  children,
  account,
}: {
  children: ReactNode;
  account: string;
}) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <Shell account={account}>{children}</Shell>
    </QueryClientProvider>
  );
}
function Shell({
  children,
  account,
}: {
  children: ReactNode;
  account: string;
}) {
  const query = useQuery({
    queryKey: ['memberships'],
    queryFn: ({ signal }) =>
      dashboardApi<Membership[]>('memberships', '', { signal }),
    retry: false,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const client = useQueryClient();
  const member =
    query.data?.find((m) => m.tenantId === selected) ?? query.data?.[0];
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      client.clear();
      router.replace('/login');
    }
  }, [query.error, client, router]);
  if (query.isPending)
    return (
      <main id="main" className="dashboard dash-loading">
        <p role="status">Memuat ruang tenant…</p>
      </main>
    );
  if (query.error)
    return (
      <main id="main" className="dashboard dash-loading">
        <h1>Akses belum tersedia</h1>
        <p role="alert">{query.error.message}</p>
        <button onClick={() => query.refetch()}>Coba kembali</button>
        <form action={logout}>
          <button>Keluar</button>
        </form>
      </main>
    );
  if (!member)
    return (
      <main id="main" className="dashboard dash-loading">
        <h1>Belum ada akses tenant</h1>
        <p>Hubungi pengelola untuk menghubungkan akun ini dengan tenant.</p>
        <form action={logout}>
          <button>Keluar</button>
        </form>
      </main>
    );
  const nav = [
    ['/dashboard', 'Ringkasan', LayoutDashboard],
    ['/dashboard/orders', 'Pesanan', ClipboardList],
    ['/dashboard/menu', 'Menu', Utensils],
    ['/dashboard/pickup', 'Jadwal Pickup', CalendarDays],
    ...(member.role === 'OWNER'
      ? [['/dashboard/settings', 'Pengaturan', Settings] as const]
      : []),
  ] as const;
  return (
    <Workspace.Provider value={{ tenant: member.tenantId, membership: member }}>
      <div className="dashboard dash-shell">
        <header className="dash-mobile">
          <Link className="dash-brand" href="/dashboard">
            beelicious.
          </Link>
          <button
            aria-label={open ? 'Tutup navigasi' : 'Buka navigasi'}
            aria-expanded={open}
            aria-controls="dash-sidebar"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>
        <aside
          id="dash-sidebar"
          className={`dash-sidebar${open ? ' is-open' : ''}`}
        >
          <Link href="/dashboard" className="dash-brand">
            beelicious.
          </Link>
          {query.data && query.data.length > 1 ? (
            <label>
              Tenant
              <select
                value={member.tenantId}
                onChange={(e) => {
                  void client.cancelQueries();
                  client.removeQueries({ queryKey: ['dashboard'] });
                  setSelected(e.target.value);
                  setOpen(false);
                  router.push('/dashboard');
                }}
              >
                {query.data.map((m) => (
                  <option key={m.tenantId} value={m.tenantId}>
                    {m.tenant.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="dash-tenant">{member.tenant.name}</p>
          )}
          <p className="dash-muted">
            {member.role === 'OWNER' ? 'Pemilik' : 'Staf'}
            {!member.tenant.isActive ? ' · Tenant nonaktif' : ''}
          </p>
          <nav aria-label="Navigasi tenant">
            {nav.map(([url, label, Icon]) => (
              <Link
                key={url}
                href={url}
                aria-current={
                  (url === '/dashboard' ? path === url : path.startsWith(url))
                    ? 'page'
                    : undefined
                }
                onClick={() => setOpen(false)}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
          </nav>
          <div className="dash-account">
            <span>{account}</span>
            <Link href="/dashboard/password">Ganti kata sandi</Link>
            <form action={logout} onSubmit={() => client.clear()}>
              <button>Keluar</button>
            </form>
          </div>
        </aside>
        <main id="main" className="dash-content" key={member.tenantId}>
          {children}
        </main>
      </div>
    </Workspace.Provider>
  );
}
export function QueryState({
  pending,
  error,
  refresh,
}: {
  pending: boolean;
  error: Error | null;
  refresh: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      client.clear();
      router.replace('/login');
    }
  }, [error, router, client]);
  return pending ? (
    <div className="dash-skeleton" role="status">
      Memuat data…
    </div>
  ) : error ? (
    <div className="dash-error" role="alert">
      <p>{error.message}</p>
      <button onClick={refresh}>Coba kembali</button>
    </div>
  ) : null;
}
export function PageHeading({
  title,
  description,
  refresh,
}: {
  title: string;
  description: string;
  refresh?: () => void;
}) {
  return (
    <header className="dash-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {refresh && <button onClick={refresh}>Muat ulang</button>}
    </header>
  );
}
export function Pagination({
  page,
  total,
  size,
  onPage,
}: {
  page: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="dash-pagination">
      <span>
        {total} hasil · Halaman {page}
      </span>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Sebelumnya
      </button>
      <button disabled={page * size >= total} onClick={() => onPage(page + 1)}>
        Berikutnya
      </button>
    </div>
  );
}
export const money = (amount: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
export const time = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value)) + ' WIB';
export const stageLabels: Record<string, string> = {
  NEW: 'Menunggu diterima',
  ACCEPTED: 'Diterima',
  PREPARING: 'Disiapkan',
  READY_FOR_PICKUP: 'Siap diambil',
  COMPLETED: 'Selesai',
  REQUIRES_REVIEW: 'Perlu pemeriksaan',
  PENDING_PAYMENT: 'Menunggu pembayaran',
  CONFIRMED: 'Terkonfirmasi',
  SUCCEEDED: 'Lunas',
  PENDING: 'Menunggu',
  INITIATING: 'Diproses',
  CANCELLED: 'Dibatalkan',
  EXPIRED: 'Kedaluwarsa',
  FAILED: 'Gagal',
};
export function Status({ value }: { value: string | null }) {
  return (
    <span
      className={`dash-status ${value === 'REQUIRES_REVIEW' ? 'is-review' : ''}`}
    >
      {value ? (stageLabels[value] ?? value) : 'Belum tersedia'}
    </span>
  );
}
