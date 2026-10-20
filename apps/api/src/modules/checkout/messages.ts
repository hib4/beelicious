import type { PaymentStatus } from '@beelicious/database';
import type { CheckoutConfig } from './config.js';
import { pickupLabel } from './pickup.js';
import { validQrUrl } from './gateway.js';

type Provider = CheckoutConfig['provider'];
const money = (amount: number) => `Rp${amount.toLocaleString('id-ID')}`;
const mockNotice = (provider: Provider) =>
  provider === 'mock' ? 'SIMULASI — TIDAK DAPAT DIBAYAR\n\n' : '';
export function paymentQrCaption(
  text: string,
  config: Pick<CheckoutConfig, 'provider' | 'development'>,
  qrCodeUrl?: string | null,
): string {
  const suffix =
    config.development &&
    config.provider === 'midtrans' &&
    qrCodeUrl &&
    validQrUrl(qrCodeUrl)
      ? `\n\nLink QR untuk simulator:\n${qrCodeUrl}`
      : '';
  // Keep the complete URL inside the transport's caption limit.
  if (suffix.length > 1024) return text.slice(0, 1024);
  return text.slice(0, 1024 - suffix.length) + suffix;
}
export const paymentStatusLabels: Record<PaymentStatus, string> = {
  INITIATING: 'Menyiapkan pembayaran',
  PENDING: 'Menunggu pembayaran',
  SUCCEEDED: 'Pembayaran diterima',
  FAILED: 'Pembayaran gagal',
  EXPIRED: 'Waktu pembayaran habis',
  CANCELLED: 'Pembayaran dibatalkan',
  REQUIRES_REVIEW: 'Memerlukan pemeriksaan',
};
export function paymentInstructions(
  provider: Provider,
  number: string,
  amount: number,
  expiry: Date,
  timezone: string,
): string {
  return `${mockNotice(provider)}*Pembayaran QRIS*\n\nPesanan: ${number}\nTotal: ${money(amount)}\nBatas pembayaran: ${pickupLabel(expiry, timezone)}\n\nSimpan gambar QRIS, lalu pilih pindai/impor gambar di aplikasi pembayaran yang mendukung.\n\n*CEK* — Periksa pembayaran\n*BATAL* — Minta pembatalan\n*Kirim Ulang QR* — Kirim gambar yang sama`;
}
export function paymentStatusMessage(
  provider: Provider,
  status: PaymentStatus,
  expiry: Date,
  timezone: string,
  options: {
    unavailable?: boolean;
    expired?: boolean;
    cancelRequested?: boolean;
  } = {},
): string {
  if (options.unavailable)
    return `${mockNotice(provider)}Pembayaran sebelumnya belum dapat diproses dengan konfigurasi layanan saat ini. Hubungi pengelola untuk menyelesaikannya. Kamu tetap bisa melihat menu; checkout baru belum tersedia.\n\n*Menu* — Lihat menu\n*Bantuan* — Panduan`;
  const awaiting = status === 'PENDING' || status === 'INITIATING';
  const label =
    awaiting && options.expired
      ? 'Batas pembayaran telah lewat. Status pembayaran belum terverifikasi.'
      : awaiting && options.cancelRequested
        ? 'Pembatalan sedang diverifikasi.'
        : paymentStatusLabels[status];
  const resend =
    status === 'PENDING' && !options.expired && !options.cancelRequested;
  return `${mockNotice(provider)}*Pembayaran QRIS*\n${label}\nBatas pembayaran: ${pickupLabel(expiry, timezone)}\n\n*CEK* — Periksa pembayaran\n*BATAL* — Minta pembatalan${resend ? '\n*Kirim Ulang QR* — Kirim gambar yang sama' : ''}\n*Menu* — Lihat menu`;
}

export function paymentHelp(
  provider: Provider,
  options: { resend?: boolean } = {},
): string {
  return `${mockNotice(provider)}Bantuan Checkout 🐝\n\n*CEK* — Periksa pembayaran terakhir${options.resend === false ? '' : '\n*Kirim Ulang QR* — Kirim gambar pembayaran yang sama'}\n*BATAL* — Minta pembatalan pembayaran tertunda\n*Menu* — Jelajahi katalog\n*Keranjang* — Lihat keranjang\n\nPembayaran dikonfirmasi setelah verifikasi. Jika sudah membayar, kirim CEK sebelum mencoba lagi.`;
}
export function paidConfirmation(
  provider: Provider,
  order: {
    orderNumber: string;
    tenantName: string;
    pickupAt: Date;
    amount: number;
  },
  timezone: string,
): string {
  return `${mockNotice(provider)}✅ Pembayaran terverifikasi\n\nPesanan: ${order.orderNumber}\nTenant: ${order.tenantName}\nPickup: ${pickupLabel(order.pickupAt, timezone)}\nDibayar: ${money(order.amount)}\nStatus: Pembayaran diterima\n\nPersiapan oleh tenant belum dikonfirmasi. Pesanan belum dinyatakan siap diambil.`;
}
