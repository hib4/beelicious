'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Info, Plus, Search } from 'lucide-react';
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
import { Select } from './select';
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
    false,
    true,
    true,
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
  // Counts are only exact when the unfiltered catalog fits on one page.
  const countsComplete =
    !!q.data &&
    !search &&
    !category &&
    page === 1 &&
    q.data.total <= q.data.items.length;
  const categoryCounts = new Map<string, number>();
  q.data?.items.forEach((item) => {
    categoryCounts.set(
      item.categoryId,
      (categoryCounts.get(item.categoryId) ?? 0) + 1,
    );
  });
  return (
    <div className="dash-page dash-menu-page">
      <PageHeading
        title="Menu"
        description="Kelola katalog dan ketersediaan menu tenant."
        refresh={() => {
          void q.refetch();
        }}
        actions={
          owner && (
            <button
              type="button"
              className="dash-button is-primary"
              onClick={() => setEditing(null)}
            >
              <Plus size={18} aria-hidden="true" />
              Tambah menu
            </button>
          )
        }
      />
      <div className="dash-toolbar dash-menu-toolbar">
        <label className="dash-search">
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
        <div className="dash-tabs" role="group" aria-label="Filter kategori">
          <button
            type="button"
            className="dash-tab"
            aria-pressed={!category}
            onClick={() => {
              setCategory('');
              setPage(1);
            }}
          >
            Semua
            {q.data && !search && !category && (
              <span className="dash-tab-count">{q.data.total}</span>
            )}
          </button>
          {q.data?.categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="dash-tab"
              aria-pressed={category === c.id}
              onClick={() => {
                setCategory(c.id);
                setPage(1);
              }}
            >
              {c.name}
              {countsComplete && (
                <span className="dash-tab-count">
                  {categoryCounts.get(c.id) ?? 0}
                </span>
              )}
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
            <section
              className="dash-card dash-panel dash-menu-editor"
              aria-labelledby="menu-editor-title"
            >
              <h2 id="menu-editor-title">
                {editing ? `Edit ${editing.name}` : 'Tambah menu'}
              </h2>
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
                <Select
                  label="Kategori"
                  name="categoryId"
                  defaultValue={editing?.categoryId}
                  options={q.data.categories.map((c) => ({
                    value: c.id,
                    label: c.isActive ? c.name : `${c.name} (nonaktif)`,
                  }))}
                />
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
                <div className="dash-form-actions">
                  <button
                    type="button"
                    className="dash-button"
                    onClick={() => setEditing(undefined)}
                  >
                    Batal
                  </button>
                  <button
                    className="dash-button is-primary"
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? 'Menyimpan…' : 'Simpan menu'}
                  </button>
                </div>
              </form>
            </section>
          )}
          <div className="dash-card dash-menu-list">
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
                    type="button"
                    className="dash-button is-small dash-menu-edit"
                    onClick={() => {
                      setEditing(item);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
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
          <section
            className="dash-card dash-panel dash-menu-categories"
            aria-labelledby="categories-title"
          >
            <div className="dash-panel-heading">
              <h2 id="categories-title">Kategori &amp; urutan</h2>
              <p>
                Urutan lebih kecil ditampilkan lebih awal. Kategori nonaktif
                disembunyikan dari pelanggan.
              </p>
            </div>
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
                    count={
                      countsComplete ? (categoryCounts.get(c.id) ?? 0) : null
                    }
                    save={(body) =>
                      mutation.mutate({
                        path: `categories/${c.id}`,
                        method: 'PATCH',
                        body,
                      })
                    }
                  />
                ) : (
                  <div
                    key={c.id}
                    className="dash-category-grid dash-category-row"
                  >
                    <span className="dash-category-order" data-label="Urutan">
                      {c.sortOrder}
                    </span>
                    <strong className="dash-category-name">{c.name}</strong>
                    <span
                      className="dash-category-count"
                      data-label="Jumlah menu"
                    >
                      {countsComplete ? (categoryCounts.get(c.id) ?? 0) : '—'}
                    </span>
                    <span
                      className={`dash-state-text${c.isActive ? ' is-on' : ''}`}
                    >
                      {c.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
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
                <label className="dash-field">
                  <span className="dash-field-label">Nama kategori baru</span>
                  <input name="name" required maxLength={120} />
                </label>
                <label className="dash-field">
                  <span className="dash-field-label">Urutan</span>
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={0}
                    required
                  />
                </label>
                <button
                  className="dash-button is-primary"
                  disabled={mutation.isPending}
                >
                  <Plus size={18} aria-hidden="true" />
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
  count: number | null;
  save: (body: unknown) => void;
}) {
  const [active, setActive] = useState(c.isActive);
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
      <label className="dash-category-order" data-label="Urutan">
        <input
          name="sortOrder"
          type="number"
          defaultValue={c.sortOrder}
          required
          aria-label={`Urutan ${c.name}`}
        />
      </label>
      <label className="dash-category-name" data-label="Nama kategori">
        <input
          name="name"
          defaultValue={c.name}
          required
          maxLength={120}
          aria-label="Nama kategori"
        />
      </label>
      <span className="dash-category-count" data-label="Jumlah menu">
        {count ?? '—'}
      </span>
      <label className="dash-switch-field dash-category-active">
        <input
          name="isActive"
          type="checkbox"
          role="switch"
          checked={active}
          onChange={(event) => setActive(event.currentTarget.checked)}
          aria-label={`Status kategori ${c.name}`}
        />
        <span className="dash-switch-visual" aria-hidden="true" />
        <span className={active ? 'is-on' : undefined}>
          {active ? 'Aktif' : 'Nonaktif'}
        </span>
      </label>
      <button
        className="dash-button is-small dash-category-save"
        disabled={pending}
      >
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
    true,
    true,
  );
  const mutation = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      dashboardApi(path, tenant, { method: 'PATCH', body }),
    onSuccess: () => {
      setSlotAvailability({});
      setHoursOpen({});
      setNotice(
        'Perubahan jadwal tersimpan. Reservasi yang ada tetap dilindungi.',
      );
      void client.invalidateQueries({ queryKey: ['dashboard', tenant] });
    },
    onError: () => {
      void q.refetch();
    },
  });
  const slotDay = (value: string) => pickupDateLabel(value);

  return (
    <div className="dash-page dash-pickup-page">
      <PageHeading
        title="Jadwal Pickup"
        description="Satu unit kapasitas mewakili satu pesanan. Semua waktu dalam WIB (Asia/Jakarta)."
        refresh={() => {
          void q.refetch();
        }}
      />
      <div
        className="dash-underline-tabs"
        role="tablist"
        aria-label="Jadwal pickup"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const nextTab = activeTab === 'slots' ? 'hours' : 'slots';
          setActiveTab(nextTab);
          document
            .getElementById(
              nextTab === 'slots' ? 'pickup-slots-tab' : 'pickup-hours-tab',
            )
            ?.focus();
        }}
      >
        <button
          id="pickup-slots-tab"
          type="button"
          role="tab"
          aria-selected={activeTab === 'slots'}
          aria-controls="pickup-slots-panel"
          tabIndex={activeTab === 'slots' ? 0 : -1}
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
          tabIndex={activeTab === 'hours' ? 0 : -1}
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
            <div className="dash-toolbar dash-pickup-toolbar">
              <label className="dash-field">
                <span className="dash-field-label">Tanggal pickup</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              {date && (
                <button
                  type="button"
                  className="dash-button is-ghost dash-toolbar-reset"
                  onClick={() => {
                    setDate('');
                    setPage(1);
                  }}
                >
                  Tampilkan semua tanggal
                </button>
              )}
            </div>
            <div className="dash-callout">
              <Info size={18} aria-hidden="true" />
              <p>
                Reservasi yang menunggu verifikasi pembayaran tetap memakai
                kapasitas.
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
                {q.data.items.map((s, index) => {
                  const day = slotDay(s.startsAt);
                  const firstOfDay =
                    index === 0 ||
                    slotDay(q.data.items[index - 1]!.startsAt) !== day;
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
                    <Fragment key={s.id + ':' + s.updatedAt}>
                      {firstOfDay && <h2 className="dash-slot-day">{day}</h2>}
                      <article className="dash-pickup-slot">
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
                            <label
                              className="dash-pickup-capacity"
                              data-label="Maksimum"
                            >
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
                            <label className="dash-switch-field dash-pickup-switch">
                              <input
                                name="isAvailable"
                                type="checkbox"
                                role="switch"
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
                              <span className={available ? 'is-on' : undefined}>
                                {available ? 'Buka' : 'Tutup'}
                              </span>
                            </label>
                            <button
                              className="dash-button is-small dash-pickup-save"
                              disabled={mutation.isPending}
                            >
                              Simpan
                            </button>
                          </form>
                        ) : (
                          <div className="dash-pickup-grid dash-pickup-slot-form">
                            {details}
                            <strong
                              className="dash-pickup-capacity-readonly"
                              data-label="Maksimum"
                            >
                              {s.capacity}
                            </strong>
                            <span
                              className={
                                'dash-state-text' + (available ? ' is-on' : '')
                              }
                            >
                              {available ? 'Buka' : 'Tutup'}
                            </span>
                            <span />
                          </div>
                        )}
                      </article>
                    </Fragment>
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
            <div className="dash-callout">
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
                          isClosed: f.get('isOpen') !== 'on',
                          updatedAt: h.updatedAt,
                        },
                      })
                    }
                  >
                    <strong className="dash-hours-day">
                      {dayNames[h.dayOfWeek]}
                    </strong>
                    <label className="dash-hours-time" data-label="Buka">
                      <span className="sr-only">
                        Jam buka {dayNames[h.dayOfWeek]}
                      </span>
                      <input
                        name="opensAt"
                        inputMode="numeric"
                        pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
                        placeholder="07:00"
                        title="Format 24 jam, mis. 07:00"
                        defaultValue={clock(h.opensAt)}
                        required
                        aria-disabled={!isOpen}
                      />
                    </label>
                    <label className="dash-hours-time" data-label="Tutup">
                      <span className="sr-only">
                        Jam tutup {dayNames[h.dayOfWeek]}
                      </span>
                      <input
                        name="closesAt"
                        inputMode="numeric"
                        pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00"
                        placeholder="18:00"
                        title="Format 24 jam, mis. 18:00 (24:00 untuk tengah malam)"
                        defaultValue={clock(h.closesAt)}
                        required
                        aria-disabled={!isOpen}
                      />
                    </label>
                    <label className="dash-switch-field dash-hours-switch">
                      <input
                        name="isOpen"
                        type="checkbox"
                        role="switch"
                        aria-label={'Buka ' + dayNames[h.dayOfWeek]}
                        defaultChecked={!h.isClosed}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setHoursOpen((current) => ({
                            ...current,
                            [h.id]: checked,
                          }));
                        }}
                      />
                      <span className="dash-switch-visual" aria-hidden="true" />
                      <span className={isOpen ? 'is-on' : undefined}>
                        {isOpen ? 'Buka' : 'Tutup'}
                      </span>
                    </label>
                    <button
                      className="dash-button is-small dash-hours-save"
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
                    <span
                      className="dash-hours-time-readonly"
                      data-label="Buka"
                    >
                      {clock(h.opensAt)}
                    </span>
                    <span
                      className="dash-hours-time-readonly"
                      data-label="Tutup"
                    >
                      {h.closesAt === 1440 ? '24:00' : clock(h.closesAt)}
                    </span>
                    <span
                      className={'dash-state-text' + (isOpen ? ' is-on' : '')}
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
    return (
      <div className="dash-page">
        <PageHeading title="Pengaturan" />
        <p role="alert" className="dash-notice">
          Halaman ini hanya tersedia untuk pemilik tenant.
        </p>
      </div>
    );
  return (
    <div className="dash-page dash-settings">
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
          className="dash-card dash-panel dash-form"
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
            <input
              value={q.data.timezone}
              readOnly
              aria-readonly="true"
              aria-describedby="timezone-help"
            />
          </label>
          <small id="timezone-help">
            Zona waktu tetap. Kelola jam operasional melalui{' '}
            <Link href="/dashboard/pickup">Jadwal Pickup</Link>, tab Jam
            operasional.
          </small>
          <div className="dash-form-actions">
            <button
              className="dash-button is-primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Menyimpan…' : 'Simpan profil'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
