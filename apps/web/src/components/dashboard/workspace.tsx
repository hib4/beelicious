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

// ============================================
// API ERROR
// ============================================

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

// ============================================
// DASHBOARD API
// ============================================

export async function dashboardApi<T>(
  path: string,
  tenant: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await fetch(`/api/dashboard/${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      'x-tenant-id': tenant,
    },
    ...(options.body
      ? { body: JSON.stringify(options.body) }
      : {}),
    ...(options.signal
      ? { signal: options.signal }
      : {}),
    cache: 'no-store',
  });

  const json = await response.json();

  if (!response.ok) {
    throw new ApiError(
      json.error?.message ??
        'Layanan tidak tersedia. Coba kembali.',
      response.status,
    );
  }

  return json.data as T;
}

// ============================================
// WORKSPACE CONTEXT
// ============================================

const Workspace = createContext<{
  tenant: string;
  membership: Membership;
} | null>(null);

export function useWorkspace() {
  const value = useContext(Workspace);

  if (!value) {
    throw new Error('Workspace required');
  }

  return value;
}


// ============================================
// DASHBOARD QUERY
// ============================================

export function useDashboardQuery<T>(
  name: string,
  path: string,
  poll = false,
  enabled = true,
) {
  const { tenant } = useWorkspace();

  return useQuery({
    queryKey: ['dashboard', tenant, name, path],

    queryFn: ({ signal }) =>
      dashboardApi<T>(path, tenant, { signal }),

    enabled,

    ...(poll
      ? {
          refetchInterval: 8000,
          refetchIntervalInBackground: false,
        }
      : {}),

    staleTime: 2000,

    retry: (count, error) =>
      !(
        error instanceof ApiError &&
        [401, 403, 404].includes(error.status)
      ) && count < 1,
  });
}

// ============================================
// WORKSPACE PROVIDER
// ============================================

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
      <Shell account={account}>
        {children}
      </Shell>
    </QueryClientProvider>
  );
}

// ============================================
// DASHBOARD SHELL
// ============================================

function Shell({
  children,
  account,
}: {
  children: ReactNode;
  account: string;
}) {
  // Ambil data membership dari API berdasarkan session pengguna.
  const query = useQuery({
    queryKey: ['memberships'],

    queryFn: ({ signal }) =>
      dashboardApi<Membership[]>('memberships', '', {
        signal,
      }),

    retry: false,

    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const memberships = query.data;

  const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);

  const path = usePathname();
  const router = useRouter();
  const client = useQueryClient();

  const member =
    memberships?.find(
      (m) => m.tenantId === selected,
    ) ?? memberships?.[0];

  // Redirect ke login jika session tidak valid.
  useEffect(() => {
    if (
      query.error instanceof ApiError &&
      query.error.status === 401
    ) {
      client.clear();
      router.replace('/login');
    }
  }, [query.error, client, router]);

  // Loading membership.
  if (query.isPending) {
    return (
      <main id="main" className="dashboard dash-loading">
        <p role="status">Memuat ruang tenant…</p>
      </main>
    );
  }

  // Membership error.
  if (query.error) {
    return (
      <main id="main" className="dashboard dash-loading">
        <h1>Akses belum tersedia</h1>

        <p role="alert">
          {query.error.message}
        </p>

        <button onClick={() => query.refetch()}>
          Coba kembali
        </button>

        <form action={logout}>
          <button>Keluar</button>
        </form>
      </main>
    );
  }

  // Tidak ada membership.
  if (!member) {
    return (
      <main id="main" className="dashboard dash-loading">
        <h1>Belum ada akses tenant</h1>

        <p>
          Hubungi pengelola untuk menghubungkan akun ini
          dengan tenant.
        </p>

        <form action={logout}>
          <button>Keluar</button>
        </form>
      </main>
    );
  }

  // ============================================
  // SIDEBAR NAVIGATION
  // ============================================

  const nav = [
    ['/dashboard', 'Ringkasan', LayoutDashboard],
    ['/dashboard/orders', 'Pesanan', ClipboardList],
    ['/dashboard/menu', 'Menu', Utensils],
    ['/dashboard/pickup', 'Jadwal Pickup', CalendarDays],

    ...(member.role === 'OWNER'
      ? [
          [
            '/dashboard/settings',
            'Pengaturan',
            Settings,
          ] as const,
        ]
      : []),
  ] as const;

  // ============================================
  // DASHBOARD UI
  // ============================================

  return (
    <Workspace.Provider
      value={{
        tenant: member.tenantId,
        membership: member,
      }}
    >
      <div className="dashboard dash-shell">

        {/* MOBILE HEADER */}

        <header className="dash-mobile">
          <Link
            className="dash-brand"
            href="/dashboard"
          >
            beelicious.
          </Link>

          <button
            aria-label={
              open
                ? 'Tutup navigasi'
                : 'Buka navigasi'
            }
            aria-expanded={open}
            aria-controls="dash-sidebar"
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <X size={20} />
            ) : (
              <Menu size={20} />
            )}
          </button>
        </header>

        {/* SIDEBAR */}

        <aside
          id="dash-sidebar"
          className={`dash-sidebar${
            open ? ' is-open' : ''
          }`}
        >
          <Link
            href="/dashboard"
            className="dash-brand"
          >
            beelicious.
          </Link>

          {/* TENANT SELECTOR */}

          {memberships && memberships.length > 1 ? (
            <label>
              Tenant

              <select
                value={member.tenantId}
                onChange={(e) => {
                  void client.cancelQueries();

                  client.removeQueries({
                    queryKey: ['dashboard'],
                  });

                  setSelected(e.target.value);
                  setOpen(false);

                  router.push('/dashboard');
                }}
              >
                {memberships.map((m) => (
                  <option
                    key={m.tenantId}
                    value={m.tenantId}
                  >
                    {m.tenant.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="dash-tenant">
              {member.tenant.name}
            </p>
          )}

          {/* TENANT ROLE */}

          <p className="dash-muted dash-role-badge">
            {member.role === 'OWNER'
              ? 'Pemilik'
              : 'Staf'}

            {!member.tenant.isActive
              ? ' · Tenant nonaktif'
              : ''}
          </p>

          {/* NAVIGATION */}

          <nav aria-label="Navigasi tenant">
            {nav.map(([url, label, Icon]) => (
              <Link
                key={url}
                href={url}
                aria-current={
                  (
                    url === '/dashboard'
                      ? path === url
                      : path.startsWith(url)
                  )
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

          {/* ACCOUNT */}

          <div className="dash-account">
            <span>{account}</span>

            <Link href="/dashboard/password">
              Ganti kata sandi
            </Link>

            <form
              action={logout}
              onSubmit={() => client.clear()}
            >
              <button>Keluar</button>
            </form>
          </div>
        </aside>

        {/* MAIN CONTENT */}

        <main
          id="main"
          className="dash-content"
          key={member.tenantId}
        >
          {children}
        </main>

      </div>
    </Workspace.Provider>
  );
}

// ============================================
// QUERY STATE
// ============================================

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
    if (
      error instanceof ApiError &&
      error.status === 401
    ) {
      client.clear();
      router.replace('/login');
    }
  }, [error, router, client]);

  return pending ? (
    <div
      className="dash-skeleton"
      role="status"
    >
      Memuat data…
    </div>
  ) : error ? (
    <div
      className="dash-error"
      role="alert"
    >
      <p>{error.message}</p>

      <button onClick={refresh}>
        Coba kembali
      </button>
    </div>
  ) : null;
}

// ============================================
// PAGE HEADING
// ============================================

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

      {refresh && (
        <button onClick={refresh}>
          Muat ulang
        </button>
      )}
    </header>
  );
}

// ============================================
// PAGINATION
// ============================================

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

      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Sebelumnya
      </button>

      <button
        disabled={page * size >= total}
        onClick={() => onPage(page + 1)}
      >
        Berikutnya
      </button>
    </div>
  );
}

// ============================================
// CURRENCY FORMATTER
// ============================================

export const money = (amount: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);

// ============================================
// DATE FORMATTER
// ============================================

export const time = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value)) + ' WIB';

// ============================================
// ORDER STATUS LABELS
// ============================================

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

// ============================================
// STATUS COMPONENT
// ============================================


export function Status({
  value,
}: {
  value: string | null;
}) {
  const statusClasses: Record<string, string> = {
    // Payment status
    SUCCEEDED: 'is-paid',
    PENDING: 'is-pending',
    INITIATING: 'is-pending',
    FAILED: 'is-cancelled',
    EXPIRED: 'is-cancelled',

    // Fulfillment status
    NEW: 'is-new',
    ACCEPTED: 'is-accepted',
    PREPARING: 'is-preparing',
    READY_FOR_PICKUP: 'is-ready',
    COMPLETED: 'is-completed',
    REQUIRES_REVIEW: 'is-review',
    CANCELLED: 'is-cancelled',
    REJECTED: 'is-cancelled',
  };

  return (
    <span
      className={`dash-status ${
        value ? statusClasses[value] ?? '' : ''
      }`}
    >
      {value
        ? stageLabels[value] ?? value
        : 'Belum tersedia'}
    </span>
  );
}
