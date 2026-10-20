import { expect, it } from 'vitest';
import {
  paymentHelp,
  paymentInstructions,
  paymentStatusMessage,
  paidConfirmation,
  paymentStatusLabels,
  paymentQrCaption,
} from '../../src/modules/checkout/messages.js';
const expiry = new Date('2026-10-20T05:15:00Z');
const zone = 'Asia/Jakarta';
const qrCodeUrl = 'https://api.sandbox.midtrans.com/v2/qris/abc/qr-code';
it('includes the complete original QR URL only for development Midtrans captions', () => {
  const text = paymentInstructions('midtrans', 'BEE-TEST', 40000, expiry, zone);
  const config = { provider: 'midtrans' as const, development: true };
  const caption = paymentQrCaption(text, config, qrCodeUrl);
  expect(caption).toContain(text);
  expect(caption).toContain(`Link QR untuk simulator:\n${qrCodeUrl}`);
  expect(caption.length).toBeLessThanOrEqual(1024);
  expect(
    paymentQrCaption(text, { ...config, development: false }, qrCodeUrl),
  ).toBe(text);
  expect(
    paymentQrCaption(text, { ...config, provider: 'mock' }, qrCodeUrl),
  ).toBe(text);
  expect(paymentQrCaption(text, config)).toBe(text);
  expect(paymentQrCaption(text, config, 'https://example.com/qr-code')).toBe(
    text,
  );
  const long = paymentQrCaption('x'.repeat(1100), config, qrCodeUrl);
  expect(long).toHaveLength(1024);
  expect(long.endsWith(qrCodeUrl)).toBe(true);
});
it('shows customer-facing QRIS instructions without development banners', () => {
  const message = paymentInstructions(
    'midtrans',
    'BEE-TEST',
    40000,
    expiry,
    zone,
  );
  expect(message).toContain('*Pembayaran QRIS*');
  expect(message).toContain('Pesanan: BEE-TEST');
  expect(message).toContain('Rp40.000');
  expect(message).toContain('12.15 WIB');
  expect(message).toContain('pindai/impor gambar');
  expect(message).toContain('*CEK*');
  expect(message).toContain('*BATAL*');
  expect(message).not.toMatch(/sandbox|simula|tidak dapat dibayar|midtrans/i);
  expect(message.length).toBeLessThanOrEqual(1024);
});
it.each(
  Object.keys(paymentStatusLabels) as Array<keyof typeof paymentStatusLabels>,
)('renders %s in Indonesian', (status) => {
  const text = paymentStatusMessage('midtrans', status, expiry, zone);
  expect(text).toContain(paymentStatusLabels[status]);
  expect(text).not.toContain(status);
  expect(text).not.toMatch(/sandbox|simulasi/i);
});
it('keeps help and successful payment wording natural without claiming pickup readiness', () => {
  const help = paymentHelp('midtrans');
  const paid = paidConfirmation(
    'midtrans',
    {
      orderNumber: 'BEE-TEST',
      tenantName: 'Tenant',
      pickupAt: expiry,
      amount: 40000,
    },
    zone,
  );
  expect(help).not.toMatch(/sandbox|simulasi/i);
  expect(paid).not.toMatch(/sandbox|simulasi|CONFIRMED/);
  expect(paid).toContain('Pembayaran terverifikasi');
  expect(paid).toContain('Persiapan oleh tenant belum dikonfirmasi');
  expect(paid).toContain('belum dinyatakan siap diambil');
});
it('retains explicit nonpayable labels for the independent mock gateway', () => {
  for (const message of [
    paymentInstructions('mock', 'BEE-TEST', 40000, expiry, zone),
    paymentStatusMessage('mock', 'PENDING', expiry, zone),
    paymentHelp('mock'),
    paidConfirmation(
      'mock',
      {
        orderNumber: 'BEE-TEST',
        tenantName: 'Tenant',
        pickupAt: expiry,
        amount: 40000,
      },
      zone,
    ),
  ])
    expect(message).toContain('SIMULASI — TIDAK DAPAT DIBAYAR');
});
it('distinguishes overdue verification from verified expiration and hides QR resend', () => {
  const text = paymentStatusMessage('midtrans', 'PENDING', expiry, zone, {
    expired: true,
  });
  expect(text).toContain(
    'Batas pembayaran telah lewat. Status pembayaran belum terverifikasi.',
  );
  expect(text).not.toContain('Menunggu pembayaran');
  expect(text).not.toContain('Kirim Ulang QR');
  expect(text).toContain('*Menu*');
});
it('explains unavailable payment processing without offering unsupported actions', () => {
  const text = paymentStatusMessage('mock', 'PENDING', expiry, zone, {
    unavailable: true,
  });
  expect(text).toContain('konfigurasi layanan saat ini');
  expect(text).toContain('Hubungi pengelola');
  expect(text).toContain('SIMULASI — TIDAK DAPAT DIBAYAR');
  expect(text).not.toMatch(
    /Menunggu pembayaran|\*CEK\*|\*BATAL\*|Kirim Ulang QR/,
  );
});
it('shows cancellation verification without encouraging payment or QR resend', () => {
  const text = paymentStatusMessage('midtrans', 'PENDING', expiry, zone, {
    cancelRequested: true,
  });
  expect(text).toContain('Pembatalan sedang diverifikasi');
  expect(text).not.toContain('Menunggu pembayaran');
  expect(text).not.toContain('Kirim Ulang QR');
});
