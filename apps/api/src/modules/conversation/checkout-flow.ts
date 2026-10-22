import {
  paymentInstructions,
  paymentHelp,
  paymentStatusMessage,
} from '../checkout/messages.js';
import { createHash } from 'node:crypto';
import type { Prisma } from '@beelicious/database';
import { matchesGateway, type CheckoutConfig } from '../checkout/config.js';
import { OrderService, type CheckoutScope } from '../checkout/orders.js';
import { PickupSlotService, pickupLabel } from '../checkout/pickup.js';
import { CartService, type LockedCartSession } from '../cart/service.js';
import { DomainError } from '../catalog/validation.js';
import { initialData, rupiah, type Context } from './flow.js';
import type { Command } from './commands.js';
export interface CheckoutDependencies {
  tx: Prisma.TransactionClient;
  config: CheckoutConfig;
  scope: CheckoutScope;
  eventId: string;
  now: () => Date;
  chatId?: string;
  recipientPhone?: string;
  maxQuantity: number;
  lockedSession?: LockedCartSession;
}
const states = [
  'SELECT_PICKUP',
  'CONFIRM_CHECKOUT',
  'AWAITING_PAYMENT',
  'ORDER_CONFIRMED',
  'PAYMENT_UNSUCCESSFUL',
  'REQUIRES_REVIEW',
];
export async function checkoutTransition(
  original: Context,
  command: Command,
  d: CheckoutDependencies,
  refresh = false,
): Promise<{ context: Context; text: string } | null> {
  const c = structuredClone(original);
  const orders = new OrderService(d.tx, d.config, d.now, true, d.lockedSession);
  const carts = new CartService(d.tx, d.maxQuantity, true, d.lockedSession);
  const current = await orders.current(d.scope);
  const ownedFlow = states.includes(c.state);
  const unresolved =
    !!current &&
    ['PENDING_PAYMENT', 'REQUIRES_REVIEW'].includes(current.status);
  const available =
    !current?.payment || matchesGateway(current.payment, d.config);
  const storedProvider = current?.payment?.provider as
    CheckoutConfig['provider'] | undefined;
  const paymentMessage = () =>
    current?.payment
      ? paymentStatusMessage(
          storedProvider!,
          current.payment.status,
          current.payment.expiresAt,
          d.config.timezone,
          {
            unavailable: !available,
            expired: current.payment.expiresAt <= d.now(),
            cancelRequested: current.payment.cancelRequested,
          },
        )
      : '';

  if (command.kind === 'help')
    return {
      context: c,
      text:
        unresolved && !available
          ? paymentMessage()
          : paymentHelp(storedProvider ?? d.config.provider, {
              resend:
                !current?.payment ||
                (current.payment.status === 'PENDING' &&
                  !current.payment.cancelRequested &&
                  current.payment.expiresAt > d.now()),
            }),
    };
  async function status(notice = '') {
    if (!current?.payment) return null;
    const p = current.payment;
    c.state =
      current.status === 'CONFIRMED'
        ? 'ORDER_CONFIRMED'
        : current.status === 'REQUIRES_REVIEW' || p.status === 'REQUIRES_REVIEW'
          ? 'REQUIRES_REVIEW'
          : current.status === 'PENDING_PAYMENT'
            ? 'AWAITING_PAYMENT'
            : 'PAYMENT_UNSUCCESSFUL';
    c.selectedTenantId = current.tenantId;
    c.selectedCategoryId = null;
    c.selectedMenuItemId = null;
    c.data = initialData();
    const body =
      unresolved && !available
        ? paymentMessage()
        : c.state === 'ORDER_CONFIRMED'
          ? '✅ Pembayaran terverifikasi. Persiapan tenant belum dikonfirmasi.\n\n1. Pesan Lagi'
          : c.state === 'REQUIRES_REVIEW'
            ? 'Pembayaran/pickup memerlukan pemeriksaan. Jangan membayar ulang. Pemenuhan dan pengembalian dana belum dapat dijanjikan.'
            : c.state === 'PAYMENT_UNSUCCESSFUL'
              ? 'Pembayaran tidak berhasil. Jangan gunakan QR lama.\n\n1. Salin Pilihan ke Keranjang Baru'
              : paymentMessage();
    return {
      context: c,
      text: `${notice}${current.orderNumber}\n🏪 ${current.tenantName}\nPickup: ${pickupLabel(current.pickupSlot.startsAt, d.config.timezone)}\nTotal: ${rupiah(current.totalAmount)}\n\n${body}`,
    };
  }
  if (
    current?.payment &&
    (command.kind === 'check' ||
      command.kind === 'resend' ||
      (command.kind === 'cancel' &&
        ['PENDING_PAYMENT', 'REQUIRES_REVIEW'].includes(current.status)))
  ) {
    const p = current.payment;
    if (!available) return status();
    if (command.kind === 'cancel' && p.status === 'SUCCEEDED')
      return status(
        'Pembayaran sudah terverifikasi dan tidak dapat dibatalkan melalui percakapan ini.\n\n',
      );
    if (
      ['PENDING_PAYMENT', 'REQUIRES_REVIEW'].includes(current.status) &&
      (!p.checkedAt ||
        d.now().getTime() - p.checkedAt.getTime() >= 30000 ||
        (command.kind === 'cancel' && !p.cancelRequested))
    )
      current.payment = await d.tx.payment.update({
        where: { id: p.id },
        data: {
          availableAt: d.now(),
          ...(command.kind === 'cancel' ? { cancelRequested: true } : {}),
        },
      });
    if (
      command.kind === 'resend' &&
      p.status === 'PENDING' &&
      !p.cancelRequested &&
      p.expiresAt > d.now()
    )
      await d.tx.checkoutNotification.createMany({
        data: [
          {
            orderId: current.id,
            createdAt: d.now(),
            availableAt: d.now(),
            logicalKey: `qr-resend:${d.eventId}`,
            kind: 'qr',
            text: paymentInstructions(
              d.config.provider,
              current.orderNumber,
              p.amount,
              p.expiresAt,
              d.config.timezone,
            ),
          },
        ],
        skipDuplicates: true,
      });
    return status(
      command.kind === 'cancel'
        ? 'Permintaan pembatalan tersimpan; tunggu verifikasi gateway.\n\n'
        : '',
    );
  }
  if (command.kind === 'check' || command.kind === 'resend')
    return current
      ? status()
      : {
          context: c,
          text: 'Belum ada checkout. Buka Keranjang dan pilih Lanjut Checkout.',
        };
  if (unresolved) {
    if (command.kind === 'start') return null;
    const browsing = [
      'IDLE',
      'SELECT_TENANT',
      'SELECT_CATEGORY',
      'SELECT_MENU',
      'VIEW_MENU_ITEM',
    ].includes(c.state);
    const addingItem =
      c.state === 'VIEW_MENU_ITEM' &&
      command.kind === 'select' &&
      command.value === 1;
    if (browsing && !addingItem && command.kind !== 'cart') return null;
    if (addingItem)
      return {
        context: c,
        text: `Selesaikan pembayaran sebelumnya sebelum menambah menu atau membuat checkout baru.\n\n${available ? 'CEK — Periksa pembayaran\nBATAL — Minta pembatalan\nMenu — Lihat menu' : paymentMessage()}`,
      };
    return status();
  }

  if (
    ownedFlow &&
    [
      'ORDER_CONFIRMED',
      'PAYMENT_UNSUCCESSFUL',
      'REQUIRES_REVIEW',
      'AWAITING_PAYMENT',
    ].includes(c.state)
  ) {
    if (command.kind === 'start' || command.kind === 'cancel') return null;
    if (
      !refresh &&
      command.kind === 'select' &&
      command.value === 1 &&
      current &&
      ['CANCELLED', 'EXPIRED', 'CONFIRMED'].includes(current.status)
    ) {
      try {
        const cart = await orders.copyToNewCart(d.scope, current.id);
        c.state = 'CART_REVIEW';
        c.selectedTenantId = cart.tenantId;
        c.selectedCategoryId = null;
        c.selectedMenuItemId = null;
        c.data = initialData();
        return {
          context: c,
          text: 'Pilihan disalin ke keranjang baru. Item yang tidak tersedia dilewati. Harga lama tetap ditampilkan sampai kamu menyetujui perubahan.\n\nKirim Keranjang untuk memeriksa dan menyelesaikan pilihan.',
        };
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        return {
          context: { ...c, state: 'CART_REVIEW', data: initialData() },
          text: 'Keranjang aktif sudah tersedia. Kirim Keranjang untuk melanjutkan.',
        };
      }
    }
    return status();
  }
  if (
    !ownedFlow &&
    !(
      c.state === 'CART_READY' &&
      command.kind === 'select' &&
      command.value === 2
    )
  )
    return null;
  if (
    command.kind === 'start' ||
    command.kind === 'cancel' ||
    command.kind === 'cart'
  )
    return null;
  const cart = await carts.getCartSummary(d.scope);
  if (!cart || cart.status !== 'READY')
    return {
      context: { ...c, state: 'CART_REVIEW', data: initialData() },
      text: 'Selesaikan pilihan di Keranjang sebelum checkout.',
    };
  if (
    !cart.items.length ||
    cart.items.some((i) => !i.available || i.unitPrice !== i.currentPrice)
  )
    return {
      context: {
        ...c,
        state: 'CART_READY',
        selectedTenantId: cart.tenantId,
        selectedCategoryId: null,
        selectedMenuItemId: null,
        data: initialData(),
      },
      text: 'Menu, tenant, atau harga berubah. Kirim Keranjang lalu pilih Edit Keranjang untuk memeriksa pilihan dan menyetujui perubahan sebelum checkout.\n\n1. Edit Keranjang\n2. Lanjut Checkout',
    };
  c.selectedTenantId = cart.tenantId;
  c.selectedCategoryId = null;
  c.selectedMenuItemId = null;
  if (command.kind === 'back') {
    if (c.state === 'CONFIRM_CHECKOUT') c.state = 'SELECT_PICKUP';
    else
      return {
        context: { ...c, state: 'CART_READY', data: initialData() },
        text: 'Keranjang tetap READY.\n1. Edit Keranjang\n2. Lanjut Checkout',
      };
    c.data.checkout = null;
  }
  const slotsService = new PickupSlotService(d.tx, d.config, d.now, true);
  const confirmation = async (slotId: string) => {
    const slot = await d.tx.pickupSlot.findFirst({
      where: { id: slotId, tenantId: cart.tenantId },
    });
    if (!slot) throw new DomainError('not_found');
    const pages = Math.ceil(cart.items.length / 5);
    const page = Math.min(Math.max(0, c.data.cartPage), Math.max(0, pages - 1));
    c.data.cartPage = page;
    return {
      context: c,
      text: `🧾 Konfirmasi Pesanan\n\n🏪 ${cart.tenantName}\nPickup: ${pickupLabel(slot.startsAt, d.config.timezone)}\n\n${cart.items
        .slice(page * 5, page * 5 + 5)
        .map(
          (i) =>
            `${i.quantity}x ${i.name.replace(/\s+/g, ' ')}\n${rupiah(i.unitPrice)} / item\nSubtotal item: ${rupiah(i.lineSubtotal)}`,
        )
        .join(
          '\n\n',
        )}\n\nHalaman ${page + 1}/${pages}\nSubtotal: ${rupiah(cart.subtotal)}\nTotal: ${rupiah(cart.subtotal)}\n\n1. Konfirmasi & Bayar\n2. Ubah Waktu\n${page > 0 ? '8. Sebelumnya\n' : ''}${page + 1 < pages ? '9. Berikutnya\n' : ''}0. Kembali`,
    };
  };

  if (c.state === 'CONFIRM_CHECKOUT' && c.data.checkout) {
    if (command.kind === 'select' && command.value === 2) {
      c.state = 'SELECT_PICKUP';
      c.data.checkout = null;
    } else if (!refresh && command.kind === 'select' && command.value === 1) {
      try {
        const ck = c.data.checkout;
        const order = await orders.createFromCart(d.scope, {
          cartId: ck.cartId,
          revision: ck.revision,
          slotId: ck.slotId!,
          eventId: d.eventId,
          ...(d.chatId ? { chatId: d.chatId } : {}),
          ...(d.recipientPhone ? { recipientPhone: d.recipientPhone } : {}),
        });
        c.state = 'AWAITING_PAYMENT';
        c.data = initialData();
        return {
          context: c,
          text: `Checkout ${order.orderNumber} tersimpan.\nTotal: ${rupiah(order.totalAmount)}\n\nInstruksi pembayaran sedang disiapkan. Kirim CEK untuk status. BATAL untuk meminta pembatalan.`,
        };
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
        c.state = 'CART_READY';
        c.data = initialData();
        return {
          context: c,
          text: 'Checkout belum dibuat. Harga, menu, atau slot berubah. Kirim Keranjang untuk memeriksa pilihan, lalu pilih checkout kembali.\n\n1. Edit Keranjang\n2. Lanjut Checkout',
        };
      }
    } else {
      if (command.kind === 'select' && command.value === 8) c.data.cartPage--;
      if (command.kind === 'select' && command.value === 9) c.data.cartPage++;
      return confirmation(c.data.checkout.slotId!);
    }
  }
  c.state = 'SELECT_PICKUP';
  const slots = await slotsService.listAvailable(cart.tenantId);
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        cart.fingerprint,
        slots.map((s) => [s.id, s.capacity, s._count.reservations]),
      ]),
    )
    .digest('hex');
  let page = c.data.checkout?.page ?? 0;
  if (
    !refresh &&
    command.kind === 'select' &&
    c.data.checkout?.fingerprint === fingerprint &&
    command.value >= 1 &&
    command.value <= 5
  ) {
    const id = c.data.options[command.value - 1];
    const slot = slots.find((s) => s.id === id);
    if (slot) {
      c.state = 'CONFIRM_CHECKOUT';
      c.data.checkout = {
        page,
        cartId: cart.id,
        revision: cart.revision,
        slotId: slot.id,
        fingerprint,
      };
      c.data.cartPage = 0;
      return confirmation(slot.id);
    }
  }
  if (command.kind === 'select' && command.value === 8) page--;
  if (command.kind === 'select' && command.value === 9) page++;
  page = Math.max(
    0,
    Math.min(page, Math.max(0, Math.ceil(slots.length / 5) - 1)),
  );
  const shown = slots.slice(page * 5, page * 5 + 5);
  c.data.options = shown.map((s) => s.id);
  c.data.checkout = {
    page,
    cartId: cart.id,
    revision: cart.revision,
    slotId: null,
    fingerprint,
  };
  return {
    context: c,
    text: `🐝 Pilih Waktu Pickup\n\n🏪 ${cart.tenantName}\n\n${shown.map((s, i) => `${i + 1}. ${pickupLabel(s.startsAt, d.config.timezone)}`).join('\n') || 'Belum ada slot tersedia. Coba lagi nanti.'}\n\n${page > 0 ? '8. Sebelumnya\n' : ''}${(page + 1) * 5 < slots.length ? '9. Berikutnya\n' : ''}Balas nomor waktu yang diinginkan.\n0. Kembali`,
  };
}
