import type { ConversationState } from '@beelicious/database';
import type { CatalogServices } from '../catalog/services.js';
import { DomainError } from '../catalog/validation.js';
import {
  CartError,
  type CartAction,
  type CartScope,
  type CartService,
} from '../cart/service.js';
import type { Command } from './commands.js';
import { idle, rupiah, transition, type Context } from './flow.js';

export interface CartDependencies {
  service: CartService;
  scope: CartScope;
}
type Result = { context: Context; text: string };
const footer =
  '\n\n0. Kembali\n\n*Menu* — Mulai dari awal\n*Keranjang* — Lihat keranjang\n*Bantuan* — Lihat panduan\n*Batal* — Akhiri sesi';
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const cartState = (s: ConversationState) => s.startsWith('CART_');
function enter(c: Context, state: ConversationState, tenantId: string) {
  c.state = state;
  c.selectedTenantId = tenantId;
  c.selectedCategoryId = null;
  c.selectedMenuItemId = null;
  c.data.options = [];
  c.data.fingerprint = '';
  c.data.pending = null;
  c.data.editItemId = null;
  c.data.expectedPrice = null;
}
async function categories(
  c: Context,
  tenantId: string,
  catalog: CatalogServices,
  deps: CartDependencies,
): Promise<Result> {
  enter(c, 'SELECT_CATEGORY', tenantId);
  return await transition(
    c,
    { kind: 'invalid' },
    catalog,
    { refresh: true },
    deps,
  );
}
export async function tenantSelection(
  c: Context,
  tenantId: string,
  catalog: CatalogServices,
  deps: CartDependencies,
): Promise<Result | null> {
  const cart = await deps.service.getCart(deps.scope);
  if (!cart || cart.tenantId === tenantId) return null;
  if (!cart.items.length) {
    await deps.service.perform(deps.scope, { kind: 'abandon' });
    return null;
  }
  enter(c, 'CART_CONFIRM_SWITCH', cart.tenantId);
  c.data.pending = { kind: 'switch', tenantId, fingerprint: cart.fingerprint };
  return {
    context: c,
    text: `Keranjang ${clean(cart.tenantName)} masih berisi menu. Ganti tenant akan meninggalkan keranjang ini.\n\n1. Tinggalkan keranjang dan ganti tenant\n2. Pertahankan keranjang${footer}`,
  };
}
export async function cartTransition(
  original: Context,
  command: Command,
  catalog: CatalogServices,
  deps: CartDependencies,
  flags: { expired?: boolean; refresh?: boolean },
): Promise<Result | null> {
  const c = structuredClone(original);
  // Global navigation remains owned by the original browsing flow.
  if (['start', 'cancel', 'help'].includes(command.kind)) return null;
  if (flags.expired) return null;
  if (
    !cartState(c.state) &&
    c.state !== 'SELECT_QUANTITY' &&
    command.kind !== 'cart' &&
    !(
      c.state === 'VIEW_MENU_ITEM' &&
      command.kind === 'select' &&
      command.value === 1
    )
  )
    return null;
  let cart = await deps.service.getCart(deps.scope);
  let notice = '';
  const result = (text: string): Result => {
    const combined = notice + text;
    if (combined.length > 4096)
      throw new Error('Cart response exceeds text limit');
    return { context: c, text: combined };
  };
  async function review() {
    cart = await deps.service.getCart(deps.scope);
    if (!cart)
      return {
        context: idle(),
        text: 'Keranjang masih kosong. Kirim Menu untuk memilih tenant.',
      };
    enter(
      c,
      cart.status === 'READY' ? 'CART_READY' : 'CART_REVIEW',
      cart.tenantId,
    );
    return await render();
  }
  async function apply(
    action: CartAction,
    fingerprint?: string,
  ): Promise<Result> {
    const performed = await deps.service.perform(
      deps.scope,
      action,
      fingerprint,
    );
    cart = performed.cart;
    if (performed.proposal) {
      const p = performed.proposal;
      enter(c, 'CART_CONFIRM_PRICE', cart.tenantId);
      c.data.cartPage = 0;
      c.data.pending = { kind: 'price', ...p };
      return await render();
    }
    if (action.kind === 'add') {
      enter(c, 'CART_ACTION', cart.tenantId);
      notice = '✅ Menu berhasil ditambahkan!\n\n';
      return await render();
    }
    notice =
      action.kind === 'remove'
        ? 'Menu telah dihapus.\n\n'
        : action.kind === 'clear'
          ? 'Keranjang dikosongkan.\n\n'
          : action.kind === 'update'
            ? 'Jumlah diperbarui.\n\n'
            : '';
    return await review();
  }
  try {
    if (command.kind === 'cart') {
      c.data.cartPage = 0;
      return await review();
    }
    if (c.state === 'VIEW_MENU_ITEM') {
      if (flags.refresh) return null;
      const item = await catalog.menu.get(
        c.selectedTenantId!,
        c.selectedMenuItemId!,
        true,
      );
      cart = await deps.service.getCart(deps.scope);
      if (cart && cart.tenantId !== c.selectedTenantId)
        return await tenantSelection(c, c.selectedTenantId!, catalog, deps);
      if (cart?.status === 'READY') {
        enter(c, 'CART_CONFIRM_REOPEN', cart.tenantId);
        c.data.fingerprint = cart.fingerprint;
        return await render();
      }
      c.state = 'SELECT_QUANTITY';
      c.data.expectedPrice = item.price;
      return await render();
    }
    if (c.state === 'SELECT_QUANTITY') {
      if (command.kind === 'back') {
        c.state = 'VIEW_MENU_ITEM';
        return await transition(
          c,
          { kind: 'invalid' },
          catalog,
          { refresh: true },
          deps,
        );
      }
      const item = await catalog.menu.get(
        c.selectedTenantId!,
        c.selectedMenuItemId!,
        true,
      );
      if (flags.refresh) {
        c.data.expectedPrice = item.price;
        notice = 'Tampilan diperbarui. Silakan masukkan jumlah kembali.\n\n';
        return await render();
      }
      if (
        command.kind !== 'select' ||
        command.value > deps.service.maxQuantity
      ) {
        notice = `Masukkan jumlah bulat 1–${deps.service.maxQuantity}.\n\n`;
        return await render();
      }
      cart = await deps.service.getOrCreateActiveCart(
        deps.scope,
        c.selectedTenantId!,
      );
      return await apply({
        kind: 'add',
        menuItemId: item.id,
        quantity: command.value,
        expectedPrice: c.data.expectedPrice ?? item.price,
      });
    }
    if (!cart)
      return {
        context: idle(),
        text: 'Keranjang masih kosong. Kirim Menu untuk memilih tenant.',
      };
    if (flags.refresh) {
      notice =
        'Tampilan diperbarui. Periksa keranjang sebelum melanjutkan.\n\n';
      return await review();
    }
    if (command.kind === 'back') {
      if (c.state === 'CART_ACTION' || c.state === 'CART_REVIEW')
        return await categories(c, cart.tenantId, catalog, deps);
      return await review();
    }
    if (command.kind !== 'select') {
      notice = 'Balas nomor pilihan yang ditampilkan.\n\n';
      return await render();
    }
    const n = command.value;
    if (
      ['CART_CONFIRM_CLEAR', 'CART_CONFIRM_REOPEN'].includes(c.state) &&
      c.data.fingerprint !== cart.fingerprint
    ) {
      notice = 'Keranjang berubah. Silakan periksa kembali.\n\n';
      return await review();
    }
    if (c.state === 'CART_ACTION') {
      if (n === 1) return await categories(c, cart.tenantId, catalog, deps);
      if (n === 2) {
        c.data.cartPage = 0;
        return await review();
      }
      if (n === 3) return await apply({ kind: 'ready' });
    } else if (c.state === 'CART_REVIEW') {
      if (n === 8 || n === 9) {
        paginate(cart.items.length, n);
        return await render();
      }
      if (n === 1) return await categories(c, cart.tenantId, catalog, deps);
      if (n === 2 || n === 3) {
        enter(
          c,
          n === 2 ? 'CART_EDIT_QUANTITY' : 'CART_REMOVE_ITEM',
          cart.tenantId,
        );
        c.data.cartPage = 0;
        return await render();
      }
      if (n === 4) return await apply({ kind: 'ready' });
      if (n === 6) {
        enter(c, 'CART_CONFIRM_CLEAR', cart.tenantId);
        c.data.fingerprint = cart.fingerprint;
        return await render();
      }
    } else if (c.state === 'CART_READY') {
      if (n === 8 || n === 9) {
        paginate(cart.items.length, n);
        return await render();
      }
      if (n === 1) {
        enter(c, 'CART_CONFIRM_REOPEN', cart.tenantId);
        c.data.fingerprint = cart.fingerprint;
        return await render();
      }
    } else if (c.state === 'CART_CONFIRM_CLEAR' && n === 1)
      return await apply({ kind: 'clear' });
    else if (c.state === 'CART_CONFIRM_REOPEN' && n === 1)
      return await apply({ kind: 'reopen' });
    else if (c.state === 'CART_CONFIRM_SWITCH') {
      const pending = c.data.pending;
      if (n === 2) return await review();
      if (n === 1 && pending?.kind === 'switch') {
        if (pending.fingerprint !== cart.fingerprint) {
          notice = 'Keranjang berubah. Silakan pilih tenant kembali.\n\n';
          return await review();
        }
        const target = await catalog.tenants.getById(pending.tenantId);
        if (!target.isActive) throw new CartError('unavailable');
        await deps.service.perform(deps.scope, { kind: 'abandon' });
        return await categories(c, target.id, catalog, deps);
      }
    } else if (c.state === 'CART_CONFIRM_PRICE') {
      const pending = c.data.pending;
      if (pending?.kind !== 'price') return await review();
      if (n === 8 || n === 9) {
        paginate(pending.changes.length, n);
        return await render();
      }
      if (n === 1) return await apply(pending.action, pending.fingerprint);
    } else if (
      c.state === 'CART_EDIT_QUANTITY' ||
      c.state === 'CART_REMOVE_ITEM'
    ) {
      if (c.data.fingerprint !== cart.fingerprint) {
        notice = 'Isi keranjang berubah. Silakan pilih kembali.\n\n';
        return await render();
      }
      if (n === 8 || n === 9) {
        paginate(cart.items.length, n);
        return await render();
      }
      const id = n <= 5 ? c.data.options[n - 1] : undefined;
      const selected = cart.items.find((i) => i.id === id);
      if (selected) {
        if (c.state === 'CART_REMOVE_ITEM')
          return await apply({ kind: 'remove', itemId: selected.id });
        c.state = 'CART_EDIT_QUANTITY_INPUT';
        c.data.editItemId = selected.id;
        return await render();
      }
    } else if (c.state === 'CART_EDIT_QUANTITY_INPUT') {
      if (n > deps.service.maxQuantity) {
        notice = `Jumlah maksimal ${deps.service.maxQuantity}.\n\n`;
        return await render();
      }
      if (!c.data.editItemId) return await review();
      if (c.data.fingerprint !== cart.fingerprint) {
        notice = 'Isi keranjang berubah. Silakan pilih kembali.\n\n';
        return await review();
      }
      return await apply({
        kind: 'update',
        itemId: c.data.editItemId,
        quantity: n,
      });
    }
    notice = 'Pilihan belum valid. Balas nomor yang ditampilkan.\n\n';
    return await render();
  } catch (error) {
    if (error instanceof CartError) {
      const messages: Record<CartError['reason'], string> = {
        quantity: `Jumlah gabungan per menu maksimal ${deps.service.maxQuantity}. Gunakan Ubah Jumlah atau Hapus Menu.`,
        unavailable:
          'Tenant atau menu tidak tersedia. Hapus menu yang tidak tersedia sebelum melanjutkan.',
        empty: 'Keranjang masih kosong. Tambahkan menu terlebih dahulu.',
        ready:
          'Keranjang sudah READY. Pilih Edit Keranjang untuk membukanya kembali.',
        tenant:
          'Keranjang berasal dari tenant lain. Gunakan Menu untuk mengganti tenant.',
        missing: 'Menu atau keranjang berubah. Silakan pilih kembali.',
      };
      notice = messages[error.reason] + '\n\n';
      if (error.reason === 'quantity' && c.state === 'SELECT_QUANTITY')
        return await render();
      return await review();
    }
    if (error instanceof DomainError && error.code === 'not_found') {
      if (c.selectedTenantId)
        return await categories(c, c.selectedTenantId, catalog, deps);
      return {
        context: idle(),
        text: 'Menu tidak tersedia. Kirim Menu untuk mulai kembali.',
      };
    }
    throw error;
  }
  function paginate(count: number, n: number) {
    const pages = Math.max(1, Math.ceil(count / 5));
    if (n === 8 && c.data.cartPage > 0) c.data.cartPage--;
    else if (n === 9 && c.data.cartPage + 1 < pages) c.data.cartPage++;
    else notice = 'Halaman tidak tersedia.\n\n';
  }
  function page<T>(rows: T[]) {
    const pages = Math.max(1, Math.ceil(rows.length / 5));
    c.data.cartPage = Math.min(c.data.cartPage, pages - 1);
    return {
      rows: rows.slice(c.data.cartPage * 5, c.data.cartPage * 5 + 5),
      suffix: `${pages > 1 ? `\n\nHalaman ${c.data.cartPage + 1}/${pages}` : ''}${c.data.cartPage ? '\n8. Halaman sebelumnya' : ''}${c.data.cartPage + 1 < pages ? '\n9. Halaman berikutnya' : ''}`,
    };
  }
  async function render(): Promise<Result> {
    if (c.state === 'SELECT_QUANTITY') {
      const item = await catalog.menu.get(
        c.selectedTenantId!,
        c.selectedMenuItemId!,
        true,
      );
      return result(
        `🍳 ${clean(item.name)}\n\nHarga: ${rupiah(item.price)}\n\nBerapa porsi yang ingin dipilih?\nBalas jumlah (1–${deps.service.maxQuantity}).${footer}`,
      );
    }
    if (!cart)
      return {
        context: idle(),
        text: 'Keranjang masih kosong. Kirim Menu untuk mulai kembali.',
      };
    if (c.state === 'CART_ACTION')
      return result(
        `Mau tambah menu lainnya?\n\n1. Tambah Menu\n2. Lihat Keranjang\n3. Selesai Memilih${footer}`,
      );
    if (c.state === 'CART_CONFIRM_SWITCH')
      return result(
        `Ganti tenant akan meninggalkan keranjang ${clean(cart.tenantName)}.\n\n1. Tinggalkan keranjang dan ganti tenant\n2. Pertahankan keranjang${footer}`,
      );
    if (c.state === 'CART_CONFIRM_CLEAR')
      return result(
        `Kosongkan semua isi keranjang?\n\n1. Ya, kosongkan keranjang${footer}`,
      );
    if (c.state === 'CART_CONFIRM_REOPEN')
      return result(
        `Keranjang READY belum menjadi pesanan. Buka kembali untuk mengedit?\n\n1. Edit Keranjang${footer}`,
      );
    if (c.state === 'CART_CONFIRM_PRICE') {
      const p = c.data.pending;
      if (p?.kind !== 'price') return await review();
      const changes = page(p.changes);
      return result(
        `Harga berubah. Periksa semua perubahan sebelum menerima:\n\n${changes.rows.map((i) => `${clean(i.name)}\n${rupiah(i.oldPrice)} → ${rupiah(i.newPrice)}`).join('\n\n') || 'Harga diperbarui kembali.'}\n\nSubtotal setelah tindakan: ${rupiah(p.subtotal)}${changes.suffix}\n\n1. Terima semua perubahan harga${footer}`,
      );
    }
    if (c.state === 'CART_EDIT_QUANTITY_INPUT') {
      const item = cart.items.find((i) => i.id === c.data.editItemId);
      if (!item) return await review();
      return result(
        `Ubah jumlah ${clean(item.name)}\n\nJumlah saat ini: ${item.quantity}\nBalas jumlah baru (1–${deps.service.maxQuantity}).\nUntuk menghapus, gunakan Hapus Menu.${footer}`,
      );
    }
    const items = page(cart.items);
    if (c.state === 'CART_EDIT_QUANTITY' || c.state === 'CART_REMOVE_ITEM') {
      c.data.options = items.rows.map((i) => i.id);
      c.data.fingerprint = cart.fingerprint;
      return result(
        `${c.state === 'CART_REMOVE_ITEM' ? 'Pilih menu untuk dihapus:' : 'Pilih menu untuk diubah:'}\n\n${items.rows.map((i, n) => `${n + 1}. ${clean(i.name)} — ${i.quantity}x`).join('\n') || 'Keranjang kosong.'}${items.suffix}${footer}`,
      );
    }
    const warnings = cart.items.some(
      (i) =>
        !i.available ||
        i.unitPrice !== i.currentPrice ||
        i.quantity > deps.service.maxQuantity,
    )
      ? '\n\n⚠️ Ada menu tidak tersedia, harga berubah, atau jumlah melebihi batas. Periksa sebelum melanjutkan.'
      : '';
    const ready = c.state === 'CART_READY';
    return result(
      `${ready ? '✅ Pilihan menu tersimpan!\n\n' : ''}🛒 Keranjang Beelicious\n🏪 ${clean(cart.tenantName)}\n\n${items.rows.map((i) => `${i.quantity}x ${clean(i.name)}${!i.available ? ' (tidak tersedia)' : ''}\n${rupiah(i.lineSubtotal)}${i.unitPrice !== i.currentPrice ? ' (harga tersimpan)' : ''}`).join('\n\n') || 'Keranjang masih kosong.'}\n\nSubtotal: ${rupiah(cart.subtotal)}${items.suffix}${warnings}\n\n${ready ? 'Keranjang READY belum menjadi pesanan.\nPickup dan pembayaran tersedia pada tahap berikutnya.\n\n1. Edit Keranjang' : '1. Tambah Menu\n2. Ubah Jumlah\n3. Hapus Menu\n4. Selesai Memilih\n6. Kosongkan Keranjang'}${footer}`,
    );
  }
}
