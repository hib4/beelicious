'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CatalogItem,
  MenuResult,
  PickupResult,
  TenantSettings,
  Category,
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
} from './workspace';
export function MenuScreen() {
  const { tenant, membership } = useWorkspace();
  const owner = membership.role === 'OWNER';
  const client = useQueryClient();
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<CatalogItem | null | undefined>(undefined),
    [notice, setNotice] = useState('');
  const q = useDashboardQuery<MenuResult>(
    'menu',
    `menu?${new URLSearchParams({ page: String(page), search, ...(category ? { categoryId: category } : {}) })}`,
  );
  const mutation = useMutation({
    mutationFn: ({
      path,
      method,
      body,
    }: {
      path: string;
      method: string;
      body: unknown;
    }) => dashboardApi(path, tenant, { method, body }),
    onSuccess: () => {
      setEditing(undefined);
      setNotice('Modifikasi menu tersimpan.');
      void client.invalidateQueries({ queryKey: ['dashboard', tenant] });
    },
    onError: () => {
      void q.refetch();
    },
  });
  function save(form: FormData) {
    mutation.mutate({
      path: editing ? `menu/${editing.id}` : 'menu',
      method: editing ? 'PATCH' : 'POST',
      body: {
        ...(editing ? { updatedAt: editing.updatedAt } : {}),
        data: {
          name: String(form.get('name')),
          categoryId: String(form.get('categoryId')),
          description: String(form.get('description')) || null,
          price: Number(form.get('price')),
          imageUrl: String(form.get('imageUrl')) || null,
          sortOrder: Number(form.get('sortOrder')),
          isAvailable: form.get('isAvailable') === 'on',
        },
      },
    });
  }
  return (
    <>
      <PageHeading
        title="Menu"
        description="Kelola katalog dan ketersediaan menu tenant."
        refresh={() => q.refetch()}
      />
      <div className="dash-filters">
        <label>
          Cari menu
          <input
            type="search"
            maxLength={120}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Kategori
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua kategori</option>
            {q.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.isActive ? ' (nonaktif)' : ''}
              </option>
            ))}
          </select>
        </label>
        {owner && (
          <button className="dash-primary" onClick={() => setEditing(null)}>
            Tambah menu
          </button>
        )}
      </div>
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
      {q.data && (
        <>
          {editing !== undefined && owner && (
            <section className="dash-panel dash-section">
              <h2>{editing ? 'Edit menu' : 'Tambah menu'}</h2>
              <form
                key={editing?.id ?? 'new'}
                className="dash-form"
                action={save}
              >
                <label>
                  Nama
                  <input
                    name="name"
                    defaultValue={editing?.name}
                    required
                    maxLength={120}
                  />
                </label>
                <label>
                  Kategori
                  <select
                    name="categoryId"
                    defaultValue={editing?.categoryId}
                    required
                  >
                    {q.data.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Deskripsi
                  <textarea
                    name="description"
                    defaultValue={editing?.description ?? ''}
                    maxLength={2000}
                  />
                </label>
                <div className="dash-form-row">
                  <label>
                    Harga (Rupiah)
                    <input
                      name="price"
                      type="number"
                      min={0}
                      max={2147483647}
                      step={1}
                      defaultValue={editing?.price ?? 0}
                      required
                    />
                  </label>
                  <label>
                    Urutan
                    <input
                      name="sortOrder"
                      type="number"
                      min={-2147483648}
                      max={2147483647}
                      step={1}
                      defaultValue={editing?.sortOrder ?? 0}
                      required
                    />
                  </label>
                </div>
                <label>
                  URL gambar (opsional)
                  <input
                    name="imageUrl"
                    type="url"
                    defaultValue={editing?.imageUrl ?? ''}
                    maxLength={2048}
                  />
                </label>
                <label className="dash-check">
                  <input
                    name="isAvailable"
                    type="checkbox"
                    defaultChecked={editing?.isAvailable ?? true}
                  />
                  Tersedia untuk dipesan
                </label>
                <div className="dash-actions">
                  <button
                    className="dash-primary"
                    disabled={mutation.isPending}
                  >
                    Simpan menu
                  </button>
                  <button type="button" onClick={() => setEditing(undefined)}>
                    Tutup
                  </button>
                </div>
              </form>
            </section>
          )}
          <div className="dash-menu-list">
            {q.data.items.map((item) => (
              <article key={item.id} className="dash-menu-row">
                <div>
                  <h2>{item.name}</h2>
                  <p>
                    {
                      q.data.categories.find((c) => c.id === item.categoryId)
                        ?.name
                    }
                  </p>
                  {item.description && <p>{item.description}</p>}
                </div>
                <strong className="numeric">{money(item.price)}</strong>
                <div className="dash-actions">
                  <button
                    aria-label={`${item.name}: ${item.isAvailable ? 'tersedia, ubah menjadi tidak tersedia' : 'tidak tersedia, ubah menjadi tersedia'}`}
                    disabled={
                      mutation.isPending ||
                      (!owner && !membership.canManageAvailability)
                    }
                    onClick={() =>
                      mutation.mutate({
                        path: `menu/${item.id}/availability`,
                        method: 'PATCH',
                        body: {
                          updatedAt: item.updatedAt,
                          data: { isAvailable: !item.isAvailable },
                        },
                      })
                    }
                  >
                    {item.isAvailable ? 'Tersedia' : 'Tidak tersedia'}
                  </button>
                  {owner && (
                    <button onClick={() => setEditing(item)}>Edit</button>
                  )}
                </div>
              </article>
            ))}
            {!q.data.items.length && (
              <p className="dash-empty">Belum ada menu pada pilihan ini.</p>
            )}
          </div>
          <Pagination
            page={page}
            size={25}
            total={q.data.total}
            onPage={setPage}
          />
          <section className="dash-section">
            <h2>Kategori & urutan</h2>
            <p className="dash-muted">
              Urutan lebih kecil ditampilkan lebih awal. Kategori nonaktif
              disembunyikan dari pelanggan.
            </p>
            {q.data.categories.map((c) =>
              owner ? (
                <CategoryEditor
                  key={`${c.id}:${c.updatedAt}`}
                  category={c}
                  pending={mutation.isPending}
                  save={(body) =>
                    mutation.mutate({
                      path: `categories/${c.id}`,
                      method: 'PATCH',
                      body,
                    })
                  }
                />
              ) : (
                <p key={c.id}>
                  {c.sortOrder}. {c.name}
                  {!c.isActive ? ' (nonaktif)' : ''}
                </p>
              ),
            )}
            {owner && (
              <form
                className="dash-inline-form"
                action={(form) =>
                  mutation.mutate({
                    path: 'categories',
                    method: 'POST',
                    body: {
                      name: String(form.get('name')),
                      sortOrder: Number(form.get('sortOrder')),
                      isActive: true,
                    },
                  })
                }
              >
                <label>
                  Nama kategori baru
                  <input name="name" required maxLength={120} />
                </label>
                <label>
                  Urutan
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={0}
                    required
                  />
                </label>
                <button disabled={mutation.isPending}>Tambah kategori</button>
              </form>
            )}
          </section>
        </>
      )}
    </>
  );
}
function CategoryEditor({
  category: c,
  pending,
  save,
}: {
  category: Category;
  pending: boolean;
  save: (body: unknown) => void;
}) {
  return (
    <form
      className="dash-inline-form"
      action={(f) =>
        save({
          name: String(f.get('name')),
          sortOrder: Number(f.get('sortOrder')),
          isActive: f.get('isActive') === 'on',
          updatedAt: c.updatedAt,
        })
      }
    >
      <label>
        Nama kategori
        <input name="name" defaultValue={c.name} required maxLength={120} />
      </label>
      <label>
        Urutan
        <input
          name="sortOrder"
          type="number"
          defaultValue={c.sortOrder}
          required
        />
      </label>
      <label className="dash-check">
        <input name="isActive" type="checkbox" defaultChecked={c.isActive} />
        Aktif
      </label>
      <button disabled={pending}>Simpan kategori</button>
    </form>
  );
}
const dayNames = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const minutes = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h! * 60 + m!;
};
export function PickupScreen() {
  const { tenant, membership } = useWorkspace();
  const owner = membership.role === 'OWNER';
  const client = useQueryClient();
  const [page, setPage] = useState(1),
    [date, setDate] = useState(''),
    [notice, setNotice] = useState('');
  const q = useDashboardQuery<PickupResult>(
    'pickup',
    `pickup?${new URLSearchParams({ page: String(page), ...(date ? { date } : {}) })}`,
    true,
  );
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      dashboardApi(path, tenant, { method: 'PATCH', body }),
    onSuccess: () => {
      setNotice(
        'Perubahan jadwal tersimpan. Reservasi yang ada tetap dilindungi.',
      );
      void client.invalidateQueries({ queryKey: ['dashboard', tenant] });
    },
    onError: () => {
      void q.refetch();
    },
  });
  return (
    <>
      <PageHeading
        title="Jadwal Pickup"
        description="Satu unit kapasitas mewakili satu pesanan · WIB."
        refresh={() => q.refetch()}
      />
      <p className="dash-section">
        <a href="#operating-hours">Lihat dan kelola jam operasional</a>
      </p>
      <label className="dash-date-filter">
        Tanggal pickup
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
        />
      </label>
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
      {q.data && (
        <>
          <p className="dash-notice">
            Reservasi menunggu verifikasi tetap memakai kapasitas. Jadwal dan
            kapasitas pilot adalah konfigurasi pengembangan.
          </p>
          <div className="dash-slot-list">
            {q.data.items.map((s) => (
              <article className="dash-slot-row" key={`${s.id}:${s.updatedAt}`}>
                <div>
                  <h2>{time(s.startsAt)}</h2>
                  <p>
                    Sampai {time(s.endsAt)} ·{' '}
                    {s.isAvailable ? 'Dibuka' : 'Ditutup'}
                  </p>
                </div>
                <dl>
                  <dt>Maksimum</dt>
                  <dd>{s.capacity}</dd>
                  <dt>Terkonfirmasi</dt>
                  <dd>{s.confirmed}</dd>
                  <dt>Ditahan</dt>
                  <dd>{s.held}</dd>
                  <dt>Tersisa</dt>
                  <dd>{s.remaining}</dd>
                </dl>
                {owner && (
                  <form
                    className="dash-inline-form"
                    action={(f) =>
                      mutation.mutate({
                        path: `pickup/${s.id}`,
                        body: {
                          capacity: Number(f.get('capacity')),
                          isAvailable: f.get('isAvailable') === 'on',
                          updatedAt: s.updatedAt,
                        },
                      })
                    }
                  >
                    <label>
                      Kapasitas
                      <input
                        name="capacity"
                        type="number"
                        min={Math.max(1, s.confirmed + s.held)}
                        max={1000}
                        defaultValue={s.capacity}
                        required
                      />
                    </label>
                    <label className="dash-check">
                      <input
                        name="isAvailable"
                        type="checkbox"
                        defaultChecked={s.isAvailable}
                      />
                      Dibuka
                    </label>
                    <button disabled={mutation.isPending}>Simpan slot</button>
                  </form>
                )}
              </article>
            ))}
            {!q.data.items.length && (
              <p className="dash-empty">
                Tidak ada slot pickup mendatang pada pilihan ini.
              </p>
            )}
          </div>
          <Pagination
            page={page}
            size={25}
            total={q.data.total}
            onPage={setPage}
          />
          <section className="dash-section">
            <h2 id="operating-hours">Jam operasional</h2>
            <p>
              Zona waktu Asia/Jakarta. Perubahan hanya berlaku untuk waktu
              mendatang dan diblokir jika mengganggu reservasi.
            </p>
            {q.data.hours.map((h) => (
              <div key={`${h.id}:${h.updatedAt}`} className="dash-hours-row">
                <h3>{dayNames[h.dayOfWeek]}</h3>
                {owner ? (
                  <form
                    className="dash-inline-form"
                    action={(f) =>
                      mutation.mutate({
                        path: 'operating-hours',
                        body: {
                          dayOfWeek: h.dayOfWeek,
                          opensAt: minutes(String(f.get('opensAt'))),
                          closesAt:
                            String(f.get('closesAt')) === '24:00'
                              ? 1440
                              : minutes(String(f.get('closesAt'))),
                          isClosed: f.get('isClosed') === 'on',
                          updatedAt: h.updatedAt,
                        },
                      })
                    }
                  >
                    <label>
                      Buka
                      <input
                        name="opensAt"
                        type="time"
                        defaultValue={clock(h.opensAt)}
                        required
                      />
                    </label>
                    <label>
                      Tutup (HH:mm)
                      <input
                        name="closesAt"
                        pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00"
                        defaultValue={clock(h.closesAt)}
                        required
                      />
                    </label>
                    <label className="dash-check">
                      <input
                        name="isClosed"
                        type="checkbox"
                        defaultChecked={h.isClosed}
                      />
                      Tutup
                    </label>
                    <button disabled={mutation.isPending}>Simpan jam</button>
                  </form>
                ) : (
                  <p>
                    {h.isClosed
                      ? 'Tutup'
                      : `${clock(h.opensAt)}–${clock(h.closesAt)} WIB`}
                  </p>
                )}
              </div>
            ))}
            {!q.data.hours.length && (
              <p className="dash-empty">
                Belum ada jam operasional. Minta pengelola menyiapkan jadwal
                tenant.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
export function SettingsScreen() {
  const { tenant, membership } = useWorkspace();
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  const q = useDashboardQuery<TenantSettings>('settings', 'settings');
  const mutation = useMutation({
    mutationFn: (form: FormData) =>
      dashboardApi('settings', tenant, {
        method: 'PATCH',
        body: {
          name: String(form.get('name')),
          description: String(form.get('description')) || null,
          logoUrl: String(form.get('logoUrl')) || null,
          updatedAt: q.data!.updatedAt,
        },
      }),
    onSuccess: () => {
      setNotice('Profil tenant tersimpan.');
      void client.invalidateQueries();
    },
  });
  if (membership.role !== 'OWNER')
    return <p role="alert">Halaman ini hanya tersedia untuk pemilik tenant.</p>;
  return (
    <>
      <PageHeading
        title="Pengaturan"
        description="Informasi dasar tenant. Akses khusus pemilik."
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
      {q.data && (
        <form
          key={q.data.updatedAt}
          className="dash-form dash-panel"
          action={(f) => mutation.mutate(f)}
        >
          <label>
            Nama tenant
            <input
              name="name"
              defaultValue={q.data.name}
              required
              maxLength={120}
            />
          </label>
          <label>
            Deskripsi
            <textarea
              name="description"
              defaultValue={q.data.description ?? ''}
              maxLength={2000}
            />
          </label>
          <label>
            URL logo (HTTPS)
            <input
              name="logoUrl"
              type="url"
              defaultValue={q.data.logoUrl ?? ''}
              maxLength={2048}
            />
          </label>
          <label>
            Zona waktu
            <input value={q.data.timezone} readOnly />
          </label>
          <p>
            Kelola jam operasional melalui halaman{' '}
            <a href="/dashboard/pickup#operating-hours">Jadwal Pickup</a>.
          </p>
          <button className="dash-primary" disabled={mutation.isPending}>
            Simpan profil
          </button>
        </form>
      )}
    </>
  );
}
