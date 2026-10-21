import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function login(
  page: import('@playwright/test').Page,
  email = 'owner@example.test',
) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page
    .getByLabel('Kata sandi', { exact: true })
    .fill('test-password-123');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Ringkasan', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Pesanan terbaru' }),
  ).toBeVisible();
}
test('rejects unauthenticated access and invalid login', async ({ page }) => {
  await page.goto('/dashboard/orders');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill('owner@example.test');
  await page.getByLabel('Kata sandi', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(
    page.getByText('Tidak dapat masuk.', { exact: false }),
  ).toBeVisible();
});
test('owner sees real metrics, order snapshots, transitions and history', async ({
  page,
}) => {
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Nilai bruto pembayaran berhasil' }),
  ).toBeVisible();
  await page.screenshot({
    path: '/tmp/beelicious-dashboard-overview.png',
    fullPage: true,
  });
  await page
    .getByRole('navigation', { name: 'Navigasi tenant' })
    .getByRole('link', { name: 'Pesanan', exact: true })
    .click();
  await page.locator('.dash-order-link').first().click();
  await expect(
    page.getByRole('heading', { name: 'Rincian pesanan', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('2× Nasi Uji')).toBeVisible();
  await page.screenshot({
    path: '/tmp/beelicious-dashboard-detail.png',
    fullPage: true,
  });
  for (const label of [
    'Terima pesanan',
    'Mulai siapkan',
    'Tandai siap diambil',
    'Tandai sudah diambil',
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Konfirmasi', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await expect(
    page.locator('.dash-definition').getByText('Selesai', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.dash-history').first().locator('li')).toHaveCount(
    4,
  );
});
test('menu edits and availability persist; tenant switching clears workspace data', async ({
  page,
}) => {
  await login(page);
  await page.goto('/dashboard/menu');
  await expect(
    page.getByRole('heading', { name: 'Nasi Uji', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: '/tmp/beelicious-dashboard-menu.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Harga (Rupiah)').fill('25000');
  await page.getByRole('button', { name: 'Simpan menu' }).click();
  await expect(
    page.locator('.dash-menu-row').getByText(/25\.000/),
  ).toBeVisible();
  await page.getByRole('button', { name: /Nasi Uji: tersedia/ }).click();
  await expect(
    page.getByRole('button', { name: /Nasi Uji: tidak tersedia/ }),
  ).toBeVisible();
  await page
    .locator('.dash-sidebar')
    .getByRole('combobox', { name: 'Tenant', exact: true })
    .selectOption({ label: 'Tenant Kedua' });
  await expect(
    page.getByRole('heading', { name: 'Ringkasan', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.dash-sidebar select')).toHaveValue(
    '99999999-9999-4999-8999-999999999999',
  );
});
test('staff has operational access but not owner settings or gross metrics', async ({
  page,
}) => {
  await login(page, 'staff@example.test');
  await expect(
    page.getByRole('heading', { name: 'Nilai bruto pembayaran berhasil' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Pengaturan', exact: true }),
  ).toHaveCount(0);
  await page.goto('/dashboard/menu');
  await expect(page.getByRole('button', { name: 'Tambah menu' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: 'Edit', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Nasi Uji', exact: true }),
  ).toBeVisible();
});
for (const width of [320, 390, 768, 1440])
  test(`accessible operational layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    if (width <= 1100) {
      await page.getByRole('button', { name: 'Buka navigasi' }).click();
      await page
        .getByRole('navigation', { name: 'Navigasi tenant' })
        .getByRole('link', { name: 'Pesanan', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Buka navigasi' }),
      ).toHaveAttribute('aria-expanded', 'false');
    } else await page.goto('/dashboard/orders');
    await page
      .getByRole('combobox', { name: 'Antrean', exact: true })
      .selectOption('all');
    await expect(page.locator('.dash-order-link')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({
      path: `/tmp/beelicious-dashboard-${width}.png`,
      fullPage: true,
    });
  });
test('pickup data, blocked closure feedback, and logout work', async ({
  page,
}) => {
  await login(page);
  await page.goto('/dashboard/pickup');
  await expect(
    page.getByRole('heading', { name: 'Jam operasional', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.dash-slot-row').first()).toBeVisible();
  await page.screenshot({
    path: '/tmp/beelicious-dashboard-pickup.png',
    fullPage: false,
  });
  await page.goto('/dashboard/settings');
  await expect(page.getByLabel('Zona waktu')).toHaveValue('Asia/Jakarta');
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/dashboard/orders');
  await expect(page).toHaveURL(/\/login$/);
});
