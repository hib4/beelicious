import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ConversationState } from '@beelicious/database';
import type { CatalogServices } from '../catalog/services.js';
import { DomainError } from '../catalog/validation.js';
import { cartActionSchema } from '../cart/service.js';
import {
  cartTransition,
  tenantSelection,
  type CartDependencies,
} from './cart-flow.js';
import type { Command } from './commands.js';

export const stateDataSchema = z.strictObject({
  version: z.literal(1),
  tenantPage: z.number().int().nonnegative().max(2147483647),
  categoryPage: z.number().int().nonnegative().max(2147483647),
  menuPage: z.number().int().nonnegative().max(2147483647),
  options: z.array(z.uuid()).max(5),
  fingerprint: z.string(),
  cartPage: z.number().int().nonnegative().max(2147483647).default(0),
  editItemId: z.uuid().nullable().default(null),
  expectedPrice: z.number().int().nonnegative().nullable().default(null),
  checkout: z
    .strictObject({
      page: z.number().int().nonnegative(),
      cartId: z.uuid(),
      revision: z.number().int().nonnegative(),
      slotId: z.uuid().nullable(),
      fingerprint: z.string(),
    })
    .nullable()
    .default(null),
  pending: z
    .discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('switch'),
        tenantId: z.uuid(),
        fingerprint: z.string(),
      }),
      z.strictObject({
        kind: z.literal('price'),
        action: cartActionSchema,
        fingerprint: z.string(),
        changes: z.array(
          z.strictObject({
            name: z.string(),
            oldPrice: z.number().int().nonnegative(),
            newPrice: z.number().int().nonnegative(),
          }),
        ),
        subtotal: z.number().int().nonnegative(),
      }),
    ])
    .nullable()
    .default(null),
});
export type StateData = z.infer<typeof stateDataSchema>;
export const initialData = (): StateData => ({
  version: 1,
  tenantPage: 0,
  categoryPage: 0,
  menuPage: 0,
  options: [],
  fingerprint: '',
  cartPage: 0,
  editItemId: null,
  expectedPrice: null,
  pending: null,
  checkout: null,
});
export interface Context {
  state: ConversationState;
  selectedTenantId: string | null;
  selectedCategoryId: string | null;
  selectedMenuItemId: string | null;
  data: StateData;
}
export const idle = (): Context => ({
  state: 'IDLE',
  selectedTenantId: null,
  selectedCategoryId: null,
  selectedMenuItemId: null,
  data: initialData(),
});
export const HELP =
  'Bantuan Beelicious 🐝\n\nHalo / Hi / Mulai / Menu: mulai dari daftar tenant.\nBalas nomor pilihan yang ditampilkan.\n8 / 9: halaman sebelumnya / berikutnya (jika tersedia).\n0 / Kembali: kembali.\nBatal: akhiri sesi.\nBantuan: tampilkan panduan.\n\nKeranjang: lihat pilihan tersimpan. Batal tidak menghapus keranjang.\nPickup dan pembayaran belum tersedia.';
export const rupiah = (value: number) =>
  `Rp${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const label = (value: string) => value.replace(/\s+/g, ' ').trim();
const navigation =
  '\n\n0. Kembali\n\n*Menu* — Mulai dari awal\n*Keranjang* — Lihat keranjang\n*Bantuan* — Lihat panduan\n*Batal* — Akhiri sesi';
function setState(c: Context, state: ConversationState) {
  c.state = state;
  if (state === 'IDLE' || state === 'SELECT_TENANT') {
    c.selectedTenantId = null;
    c.data.categoryPage = 0;
  }
  if (['IDLE', 'SELECT_TENANT', 'SELECT_CATEGORY'].includes(state)) {
    c.selectedCategoryId = null;
    c.data.menuPage = 0;
  }
  if (state !== 'VIEW_MENU_ITEM') c.selectedMenuItemId = null;
  c.data.options = [];
  c.data.fingerprint = '';
  c.data.pending = null;
  c.data.editItemId = null;
  c.data.expectedPrice = null;
}
function back(c: Context) {
  const previous: Partial<Record<ConversationState, ConversationState>> = {
    IDLE: 'IDLE',
    SELECT_TENANT: 'IDLE',
    SELECT_CATEGORY: 'SELECT_TENANT',
    SELECT_MENU: 'SELECT_CATEGORY',
    VIEW_MENU_ITEM: 'SELECT_MENU',
  };
  setState(c, previous[c.state] ?? 'IDLE');
}
function validShape(c: Context) {
  if (c.state.startsWith('CART_'))
    return (
      !!c.selectedTenantId && !c.selectedCategoryId && !c.selectedMenuItemId
    );
  return c.state === 'IDLE' || c.state === 'SELECT_TENANT'
    ? !c.selectedTenantId && !c.selectedCategoryId && !c.selectedMenuItemId
    : c.state === 'SELECT_CATEGORY'
      ? !!c.selectedTenantId && !c.selectedCategoryId && !c.selectedMenuItemId
      : c.state === 'SELECT_MENU'
        ? !!c.selectedTenantId &&
          !!c.selectedCategoryId &&
          !c.selectedMenuItemId
        : !!c.selectedTenantId &&
          !!c.selectedCategoryId &&
          !!c.selectedMenuItemId;
}
interface Screen {
  text: string;
  fingerprint: string;
  ids: string[];
  pageKey?: 'tenantPage' | 'categoryPage' | 'menuPage';
  pageCount: number;
}
export async function transition(
  original: Context,
  command: Command,
  catalog: CatalogServices,
  flags: { expired?: boolean; refresh?: boolean } = {},
  carts?: CartDependencies,
): Promise<{ context: Context; text: string }> {
  const cartResult = carts
    ? await cartTransition(original, command, catalog, carts, flags)
    : null;
  if (cartResult) return cartResult;
  let c = structuredClone(original);
  let notice = '';
  const reset = () => {
    c = idle();
    setState(c, 'SELECT_TENANT');
  };
  if (!validShape(c)) {
    reset();
    notice = 'Sesi diperbarui. Silakan pilih kembali.\n\n';
  }
  if (flags.expired && c.state !== 'IDLE') {
    reset();
    notice =
      'Sesi telah berakhir karena tidak aktif. Silakan mulai kembali.\n\n';
  }
  if (command.kind === 'cancel')
    return {
      context: idle(),
      text: 'Keranjang tetap tersimpan. Sesi dibatalkan. Kirim Halo, Hi, Mulai, atau Menu untuk mulai kembali.',
    };
  if (command.kind === 'start') {
    reset();
    return renderResult(await screen());
  }
  if (command.kind === 'help') return { context: c, text: HELP };
  if (command.kind === 'back') {
    back(c);
    return renderResult(await screen());
  }
  const before = {
    fingerprint: c.data.fingerprint,
    options: [...c.data.options],
    state: c.state,
  };
  let current = await screen();
  if (flags.expired || flags.refresh || before.state !== c.state) {
    if (flags.refresh)
      notice = 'Tampilan diperbarui. Silakan pilih kembali.\n\n';
    return renderResult(current);
  }
  if (command.kind === 'select' && current.pageKey) {
    if (
      before.fingerprint !== current.fingerprint ||
      JSON.stringify(before.options) !== JSON.stringify(current.ids)
    ) {
      notice = 'Pilihan menu telah berubah. Silakan pilih kembali.\n\n';
      return renderResult(current);
    }
    const pageKey = current.pageKey;
    if (
      (command.value === 8 && c.data[pageKey] > 0) ||
      (command.value === 9 && c.data[pageKey] + 1 < current.pageCount)
    ) {
      c.data[pageKey] += command.value === 8 ? -1 : 1;
      return renderResult(await screen());
    }
    const id =
      command.value <= 5 ? before.options[command.value - 1] : undefined;
    if (id) {
      if (c.state === 'SELECT_TENANT') {
        if (carts) {
          const intercepted = await tenantSelection(c, id, catalog, carts);
          if (intercepted) return intercepted;
        }
        setState(c, 'SELECT_CATEGORY');
        c.selectedTenantId = id;
      } else if (c.state === 'SELECT_CATEGORY') {
        setState(c, 'SELECT_MENU');
        c.selectedCategoryId = id;
      } else if (c.state === 'SELECT_MENU') {
        c.state = 'VIEW_MENU_ITEM';
        c.selectedMenuItemId = id;
      }
      current = await screen();
      return renderResult(current);
    }
  }
  notice ||=
    'Pilihan belum valid. Balas nomor yang ditampilkan atau Bantuan.\n\n';
  return renderResult(current);

  function renderResult(s: Screen) {
    c.data.options = s.ids;
    c.data.fingerprint = s.fingerprint;
    const text = notice + s.text;
    if (text.length > 4096)
      throw new Error('Conversation response exceeds text limit');
    return { context: c, text };
  }
  function list(
    title: string,
    rows: Array<{ id: string; name: string; updatedAt: Date; price?: number }>,
    key: 'tenantPage' | 'categoryPage' | 'menuPage',
  ): Screen {
    const pageCount = Math.max(1, Math.ceil(rows.length / 5));
    c.data[key] = Math.min(c.data[key], pageCount - 1);
    const page = rows.slice(c.data[key] * 5, c.data[key] * 5 + 5);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify(rows.map((r) => [r.id, r.name, r.updatedAt, r.price])),
      )
      .digest('hex');
    const choices = page
      .map(
        (r, i) =>
          `${i + 1}. ${label(r.name)}${r.price === undefined ? '' : `\n   ${rupiah(r.price)}`}`,
      )
      .join('\n');
    return {
      text: `${title}\n\n${choices || 'Belum ada pilihan tersedia.'}${pageCount > 1 ? `\n\nHalaman ${c.data[key] + 1}/${pageCount}` : ''}${c.data[key] > 0 ? '\n8. Halaman sebelumnya' : ''}${c.data[key] + 1 < pageCount ? '\n9. Halaman berikutnya' : ''}\n\nBalas nomor pilihan untuk melanjutkan.${navigation}`,
      fingerprint,
      ids: page.map((r) => r.id),
      pageKey: key,
      pageCount,
    };
  }
  async function screen(): Promise<Screen> {
    if (c.state === 'IDLE')
      return {
        text: 'Kirim Halo, Hi, Mulai, atau Menu untuk melihat tenant Beelicious 🐝',
        ids: [],
        fingerprint: '',
        pageCount: 1,
      };
    if (c.state === 'SELECT_TENANT')
      return list(
        '🐝 Selamat datang di Beelicious!\n\nMau melihat menu tenant mana hari ini?',
        await catalog.tenants.listActive(),
        'tenantPage',
      );
    const tenant = await catalog.tenants
      .getById(c.selectedTenantId!)
      .catch((error) => {
        if (error instanceof DomainError && error.code === 'not_found')
          return null;
        throw error;
      });
    if (!tenant?.isActive) {
      setState(c, 'SELECT_TENANT');
      notice = 'Tenant tidak tersedia. Silakan pilih tenant lain.\n\n';
      return screen();
    }
    const categories = await catalog.categories.list(tenant.id, true);
    if (c.state === 'SELECT_CATEGORY')
      return list(
        `🍽️ ${label(tenant.name)}\n\nSilakan pilih kategori:`,
        categories,
        'categoryPage',
      );
    const category = categories.find((r) => r.id === c.selectedCategoryId);
    if (!category) {
      setState(c, 'SELECT_CATEGORY');
      notice = 'Kategori tidak tersedia. Silakan pilih kembali.\n\n';
      return screen();
    }
    const items = await catalog.menu.available(tenant.id, category.id);
    if (c.state === 'SELECT_MENU')
      return list(
        `🍳 Menu ${label(category.name)} — ${label(tenant.name)}`,
        items,
        'menuPage',
      );
    const item = items.find((r) => r.id === c.selectedMenuItemId);
    if (!item) {
      setState(c, 'SELECT_MENU');
      notice = 'Menu tidak tersedia. Silakan pilih kembali.\n\n';
      return screen();
    }
    return {
      text: `🍳 ${label(item.name)}\n\nHarga: ${rupiah(item.price)}\nTenant: ${label(tenant.name)}${item.description ? `\n\n${item.description}` : ''}\n\n${carts ? '1. Tambah ke Keranjang' : 'Fitur pemesanan akan tersedia pada tahap berikutnya.'}${navigation}`,
      ids: [],
      fingerprint: '',
      pageCount: 1,
    };
  }
}
