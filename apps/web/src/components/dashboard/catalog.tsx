'use client';
import { useState } from 'react';
import { CalendarDays, Info, Plus, RefreshCw, Search } from 'lucide-react';
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
  const categoryCounts = new Map<string, number>();
  q.data?.items.forEach((item) => {
    categoryCounts.set(
      item.categoryId,
      (categoryCounts.get(item.categoryId) ?? 0) + 1,
    );
  });
  return (
    <div className="dash-menu-page">
      <header className="dash-heading dash-menu-heading">
        <div>
          <h1>Menu</h1>
          <p>Kelola katalog dan ketersediaan menu tenant.</p>
        </div>
        <div className="dash-menu-heading-actions">
          <button
            className="dash-menu-icon-button"
            aria-label="Muat ulang"
            onClick={() => q.refetch()}
          >
            <RefreshCw size={18} aria-hidden="true" />
          </button>
          {owner && (
            <button
              className="dash-primary dash-menu-add"
              onClick={() => setEditing(null)}
            >
              <Plus size={18} aria-hidden="true" /> Tambah menu
            </button>
          )}
        </div>
      </header>
      <div className="dash-menu-toolbar">
        <label className="dash-menu-search">
          <span className="sr-only">Cari nama menu</span>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            maxLength={120}
            placeholder="Cari nama menu…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <div
          className="dash-menu-category-filters"
          aria-label="Filter kategori"
        >
          <button
            className={!category ? 'is-active' : ''}
            aria-pressed={!category}
            onClick={() => {
              setCategory('');
              setPage(1);
            }}
          >
            Semua <span>{q.data?.total ?? 0}</span>
          </button>
          {q.data?.categories.map((c) => (
            <button
              key={c.id}
              className={category === c.id ? 'is-active' : ''}
              aria-pressed={category === c.id}
              onClick={() => {
                setCategory(c.id);
                setPage(1);
              }}
            >
              {c.name} <span>{categoryCounts.get(c.id) ?? 0}</span>
            </button>
          ))}
        </div>
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
            <div className="dash-menu-columns" aria-hidden="true">
              <span>Menu</span>
              <span>Harga</span>
              <span>Status</span>
              <span />
            </div>
            {q.data.items.map((item) => (
              <article
                key={item.id}
                className={`dash-menu-row${item.isAvailable ? '' : ' is-unavailable'}`}
              >
                <div
                  className={`dash-menu-thumb ${categoryTone(q.data.categories.find((c) => c.id === item.categoryId)?.name ?? '')}`}
                  aria-hidden="true"
                >
                  {item.name.trim().charAt(0).toUpperCase()}
                </div>
                <div className="dash-menu-info">
                  <div className="dash-menu-title">
                    <h2>{item.name}</h2>
                    <span className="dash-menu-category-chip">
                      {
                        q.data.categories.find((c) => c.id === item.categoryId)
                          ?.name
                      }
                    </span>
                  </div>
                  {item.description && (
                    <p title={item.description}>{item.description}</p>
                  )}
                </div>
                <strong className="dash-menu-price numeric">
                  {money(item.price)}
                </strong>
                <div className="dash-menu-status">
                  <button
                    className="dash-switch"
                    role="switch"
                    aria-checked={item.isAvailable}
                    aria-label={`Ketersediaan ${item.name}`}
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
                    <span className="dash-switch-track" aria-hidden="true">
                      <span />
                    </span>
                  </button>
                  <span>
                    {item.isAvailable ? 'Tersedia' : 'Tidak tersedia'}
                  </span>
                </div>
                {owner ? (
                  <button
                    className="dash-menu-edit"
                    onClick={() => setEditing(item)}
                  >
                    Edit
                  </button>
                ) : (
                  <span />
                )}
              </article>
            ))}
            {!q.data.items.length && (
              <p className="dash-empty">Belum ada menu pada pilihan ini.</p>
            )}
          </div>
          <div className="dash-menu-results">
            {q.data.total <= 25 && <span>{q.data.total} menu</span>}
            {q.data.total > 25 && (
              <Pagination
                page={page}
                size={25}
                total={q.data.total}
                onPage={setPage}
              />
            )}
          </div>
          <section className="dash-menu-categories">
            <header>
              <div>
                <h2>Kategori &amp; urutan</h2>
                <p>
                  Urutan lebih kecil ditampilkan lebih awal. Kategori nonaktif
                  disembunyikan dari pelanggan.
                </p>
              </div>
            </header>
            <div className="dash-category-table">
              <div className="dash-category-grid dash-category-head">
                <span>Urutan</span>
                <span>Nama kategori</span>
                <span>Jumlah menu</span>
                <span>Status</span>
                <span />
              </div>
              {q.data.categories.map((c) =>
                owner ? (
                  <CategoryEditor
                    key={`${c.id}:${c.updatedAt}`}
                    category={c}
                    pending={mutation.isPending}
                    count={categoryCounts.get(c.id) ?? 0}
                    save={(body) =>
                      mutation.mutate({
                        path: `categories/${c.id}`,
                        method: 'PATCH',
                        body,
                      })
                    }
                  />
                ) : (
                  <div key={c.id} className="dash-category-grid">
                    <span>{c.sortOrder}</span>
                    <strong>{c.name}</strong>
                    <span>{categoryCounts.get(c.id) ?? 0}</span>
                    <span>{c.isActive ? 'Aktif' : 'Nonaktif'}</span>
                    <span />
                  </div>
                ),
              )}
            </div>
            {owner && (
              <form
                className="dash-inline-form dash-category-add"
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
                <button className="dash-primary" disabled={mutation.isPending}>
                  Tambah kategori
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
function categoryTone(name: string) {
  if (name.toLocaleLowerCase('id') === 'makanan') return 'is-food';
  if (name.toLocaleLowerCase('id') === 'minuman') return 'is-drink';
  if (name.toLocaleLowerCase('id') === 'dessert') return 'is-dessert';
  return 'is-neutral';
}
function CategoryEditor({
  category: c,
  pending,
  count,
  save,
}: {
  category: Category;
  pending: boolean;
  count: number;
  save: (body: unknown) => void;
}) {
  return (
    <form
      className="dash-category-grid dash-category-row"
      action={(f) =>
        save({
          name: String(f.get('name')),
          sortOrder: Number(f.get('sortOrder')),
          isActive: f.get('isActive') === 'on',
          updatedAt: c.updatedAt,
        })
      }
    >
      <label className="dash-category-order">
        <input
          name="sortOrder"
          type="number"
          defaultValue={c.sortOrder}
          required
        />
      </label>
      <label className="dash-category-name">
        <input
          name="name"
          defaultValue={c.name}
          required
          maxLength={120}
          aria-label="Nama kategori"
        />
      </label>
      <span className="dash-category-count">{count}</span>
      <label className="dash-category-active">
        <input
          name="isActive"
          type="checkbox"
          role="switch"
          defaultChecked={c.isActive}
          aria-label={`Status kategori ${c.name}`}
        />
        <span>{c.isActive ? 'Aktif' : 'Nonaktif'}</span>
      </label>
      <button className="dash-category-save" disabled={pending}>
        Simpan kategori
      </button>
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
  String(Math.floor(n / 60)).padStart(2, '0') +
  ':' +
  String(n % 60).padStart(2, '0');
const minutes = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h! * 60 + m!;
};
const slotClock = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(value))
    .replace(':', '.');
const pickupDateLabel = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

export function PickupScreen() {
  const { tenant, membership } = useWorkspace();
  const owner = membership.role === 'OWNER';
  const client = useQueryClient();
  const [page, setPage] = useState(1),
    [date, setDate] = useState(''),
    [notice, setNotice] = useState(''),
    [activeTab, setActiveTab] = useState<'slots' | 'hours'>('slots'),
    [slotAvailability, setSlotAvailability] = useState<Record<string, boolean>>(
      {},
    ),
    [hoursOpen, setHoursOpen] = useState<Record<string, boolean>>({});
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
  const displayedDateValue = date
    ? date + 'T12:00:00+07:00'
    : (q.data?.items[0]?.startsAt ?? new Date().toISOString());

  return (
    <div className="dash-pickup-page">
      <header className="dash-heading dash-pickup-heading">
        <div>
          <h1>Jadwal Pickup</h1>
          <p>Satu unit kapasitas mewakili satu pesanan · WIB.</p>
        </div>
        <button
          className="dash-menu-icon-button"
          aria-label="Muat ulang"
          onClick={() => q.refetch()}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </header>
      <div
        className="dash-pickup-tabs"
        role="tablist"
        aria-label="Jadwal pickup"
      >
        <button
          id="pickup-slots-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'slots'}
          aria-controls="pickup-slots-panel"
          className={activeTab === 'slots' ? 'is-active' : ''}
          onClick={() => setActiveTab('slots')}
        >
          Slot pickup
        </button>
        <button
          id="pickup-hours-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'hours'}
          aria-controls="pickup-hours-panel"
          className={activeTab === 'hours' ? 'is-active' : ''}
          onClick={() => setActiveTab('hours')}
        >
          Jam operasional
        </button>
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

      {q.data &&
        (activeTab === 'slots' ? (
          <section
            id="pickup-slots-panel"
            role="tabpanel"
            aria-labelledby="pickup-slots-tab"
            className="dash-pickup-panel"
          >
            <div className="dash-pickup-datebar">
              <div className="dash-pickup-date-title">
                <CalendarDays size={19} aria-hidden="true" />
                <strong>{pickupDateLabel(displayedDateValue)}</strong>
              </div>
              <label className="dash-date-filter">
                <span className="sr-only">Tanggal pickup</span>
                <input
                  type="date"
                  aria-label="Tanggal pickup"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <span className="dash-timezone-badge">WIB · Asia/Jakarta</span>
            </div>
            <div className="dash-pickup-callout">
              <Info size={18} aria-hidden="true" />
              <p>
                Reservasi menunggu verifikasi tetap memakai kapasitas. Jadwal
                dan kapasitas pilot adalah konfigurasi pengembangan.
              </p>
            </div>
            <div className="dash-pickup-table-wrap">
              <div
                className="dash-pickup-grid dash-pickup-table-head"
                aria-hidden="true"
              >
                <span>Slot</span>
                <span>Kapasitas terpakai</span>
                <span>Maksimum</span>
                <span>Buka</span>
                <span></span>
              </div>
              <div className="dash-pickup-slot-list">
                {q.data.items.map((s) => {
                  const available = slotAvailability[s.id] ?? s.isAvailable;
                  const confirmedWidth =
                    s.capacity > 0
                      ? Math.min((s.confirmed / s.capacity) * 100, 100)
                      : 0;
                  const heldWidth =
                    s.capacity > 0
                      ? Math.min(
                          (s.held / s.capacity) * 100,
                          Math.max(0, 100 - confirmedWidth),
                        )
                      : 0;
                  const details = (
                    <>
                      <div
                        className={
                          'dash-pickup-slot-title' +
                          (available ? '' : ' is-muted')
                        }
                      >
                        <strong>
                          {slotClock(s.startsAt)} – {slotClock(s.endsAt)} WIB
                        </strong>
                        <span
                          className={
                            'dash-pickup-status' + (available ? ' is-open' : '')
                          }
                        >
                          {available ? 'Dibuka' : 'Ditutup'}
                        </span>
                      </div>
                      <div
                        className={
                          'dash-capacity' + (available ? '' : ' is-muted')
                        }
                      >
                        <div
                          className="dash-capacity-track"
                          role="img"
                          aria-label={
                            s.confirmed +
                            ' terkonfirmasi, ' +
                            s.held +
                            ' ditahan, tersisa ' +
                            s.remaining +
                            ' dari ' +
                            s.capacity
                          }
                        >
                          <span
                            className="dash-capacity-confirmed"
                            style={{ width: confirmedWidth + '%' }}
                          />
                          <span
                            className="dash-capacity-held"
                            style={{ width: heldWidth + '%' }}
                          />
                        </div>
                        <div className="dash-capacity-legend">
                          <span>
                            Terkonfirmasi <strong>{s.confirmed}</strong>
                          </span>
                          <span>
                            Ditahan <strong>{s.held}</strong>
                          </span>
                          <span className={s.remaining <= 2 ? 'is-low' : ''}>
                            Tersisa <strong>{s.remaining}</strong>
                          </span>
                        </div>
                      </div>
                    </>
                  );
                  return (
                    <article
                      className="dash-pickup-slot"
                      key={s.id + ':' + s.updatedAt}
                    >
                      {owner ? (
                        <form
                          className="dash-pickup-grid dash-pickup-slot-form"
                          action={(f) =>
                            mutation.mutate({
                              path: 'pickup/' + s.id,
                              body: {
                                capacity: Number(f.get('capacity')),
                                isAvailable: f.get('isAvailable') === 'on',
                                updatedAt: s.updatedAt,
                              },
                            })
                          }
                        >
                          {details}
                          <label className="dash-pickup-capacity">
                            <span className="sr-only">
                              Maksimum kapasitas {slotClock(s.startsAt)}
                            </span>
                            <input
                              name="capacity"
                              type="number"
                              min={Math.max(1, s.confirmed + s.held)}
                              max={1000}
                              defaultValue={s.capacity}
                              required
                            />
                          </label>
                          <label className="dash-pickup-switch">
                            <input
                              name="isAvailable"
                              type="checkbox"
                              role="switch"
                              aria-checked={available}
                              aria-label={
                                'Buka slot ' +
                                slotClock(s.startsAt) +
                                ' – ' +
                                slotClock(s.endsAt)
                              }
                              defaultChecked={s.isAvailable}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setSlotAvailability((current) => ({
                                  ...current,
                                  [s.id]: checked,
                                }));
                              }}
                            />
                            <span
                              className="dash-switch-visual"
                              aria-hidden="true"
                            />
                          </label>
                          <button
                            className="dash-pickup-save"
                            disabled={mutation.isPending}
                          >
                            Simpan
                          </button>
                        </form>
                      ) : (
                        <div className="dash-pickup-grid dash-pickup-slot-form">
                          {details}
                          <strong className="dash-pickup-capacity-readonly">
                            {s.capacity}
                          </strong>
                          <span
                            className={
                              'dash-pickup-status-text' +
                              (available ? ' is-open' : '')
                            }
                          >
                            {available ? 'Buka' : 'Tutup'}
                          </span>
                          <span />
                        </div>
                      )}
                    </article>
                  );
                })}
                {!q.data.items.length && (
                  <p className="dash-empty">
                    Tidak ada slot pickup mendatang pada pilihan ini.
                  </p>
                )}
              </div>
            </div>
            <div className="dash-pickup-results">
              <span>{q.data.total} slot ditampilkan</span>
              {q.data.total > 25 && (
                <Pagination
                  page={page}
                  size={25}
                  total={q.data.total}
                  onPage={setPage}
                />
              )}
            </div>
          </section>
        ) : (
          <section
            id="pickup-hours-panel"
            role="tabpanel"
            aria-labelledby="pickup-hours-tab"
            className="dash-pickup-panel"
          >
            <div className="dash-pickup-callout">
              <Info size={18} aria-hidden="true" />
              <p>
                Zona waktu Asia/Jakarta. Perubahan hanya berlaku untuk waktu
                mendatang dan diblokir jika mengganggu reservasi.
              </p>
            </div>
            <div className="dash-hours-table-wrap">
              <div
                className="dash-hours-grid dash-hours-table-head"
                aria-hidden="true"
              >
                <span>Hari</span>
                <span>Buka</span>
                <span>Tutup</span>
                <span>Status</span>
                <span></span>
              </div>
              {q.data.hours.map((h) => {
                const isOpen = hoursOpen[h.id] ?? !h.isClosed;
                return owner ? (
                  <form
                    key={h.id + ':' + h.updatedAt}
                    className={
                      'dash-hours-grid dash-hours-row' +
                      (isOpen ? '' : ' is-closed')
                    }
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
                    <strong className="dash-hours-day">
                      {dayNames[h.dayOfWeek]}
                    </strong>
                    <label className="dash-hours-time">
                      <span className="sr-only">
                        Buka {dayNames[h.dayOfWeek]}
                      </span>
                      <input
                        name="opensAt"
                        type="time"
                        defaultValue={clock(h.opensAt)}
                        required
                        aria-disabled={!isOpen}
                      />
                    </label>
                    <label className="dash-hours-time">
                      <span className="sr-only">
                        Tutup {dayNames[h.dayOfWeek]}
                      </span>
                      <input
                        name="closesAt"
                        pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00"
                        defaultValue={clock(h.closesAt)}
                        required
                        aria-disabled={!isOpen}
                      />
                    </label>
                    <label className="dash-hours-switch">
                      <input
                        name="isClosed"
                        type="checkbox"
                        role="switch"
                        aria-checked={isOpen}
                        aria-label={'Buka ' + dayNames[h.dayOfWeek]}
                        defaultChecked={h.isClosed}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setHoursOpen((current) => ({
                            ...current,
                            [h.id]: !checked,
                          }));
                        }}
                      />
                      <span className="dash-switch-visual" aria-hidden="true" />
                      <span className={isOpen ? 'is-open' : ''}>
                        {isOpen ? 'Buka' : 'Tutup'}
                      </span>
                    </label>
                    <button
                      className="dash-hours-save"
                      disabled={mutation.isPending}
                    >
                      Simpan jam
                    </button>
                  </form>
                ) : (
                  <div
                    key={h.id + ':' + h.updatedAt}
                    className={
                      'dash-hours-grid dash-hours-row' +
                      (isOpen ? '' : ' is-closed')
                    }
                  >
                    <strong className="dash-hours-day">
                      {dayNames[h.dayOfWeek]}
                    </strong>
                    <span className="dash-hours-time-readonly">
                      {clock(h.opensAt)}
                    </span>
                    <span className="dash-hours-time-readonly">
                      {h.closesAt === 1440 ? '24:00' : clock(h.closesAt)}
                    </span>
                    <span
                      className={
                        'dash-hours-switch-text' + (isOpen ? ' is-open' : '')
                      }
                    >
                      {isOpen ? 'Buka' : 'Tutup'}
                    </span>
                    <span />
                  </div>
                );
              })}
              {!q.data.hours.length && (
                <p className="dash-empty">
                  Belum ada jam operasional. Minta pengelola menyiapkan jadwal
                  tenant.
                </p>
              )}
            </div>
          </section>
        ))}
    </div>
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
