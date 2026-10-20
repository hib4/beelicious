import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { journeySteps } from '../src/lib/journey';
for (const width of [320, 375, 390, 768, 1280, 1440]) {
  test(`responsive and reduced-motion page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'LAPAR?CHAT AJA.',
    );
    await expect(page.locator('.hero-action .button')).toBeVisible();
    await expect(page.locator('.journey')).not.toHaveAttribute('data-enhanced');
    await expect(page.locator('.pin-spacer')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator('.mascot-hero')
        .evaluate((element) => getComputedStyle(element).transform),
    ).toBe('none');
    for (const step of journeySteps)
      await expect(
        page.locator(`#${step.id} .inline-transcript`),
      ).toBeVisible();
    for (const photo of await page.locator('[data-editorial-photo]').all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          photo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    await expect(page.locator('html')).toHaveAttribute('lang', 'id');
    await expect(page).toHaveTitle(/Beelicious/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /WhatsApp/,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      /noindex/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      /Lapar/,
    );
    expect(errors).toEqual([]);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
}
test('mobile navigation is keyboard accessible and anchors work', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const trigger = page.locator('button[aria-controls="mobile-navigation"]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole('navigation', { name: 'Navigasi seluler' })
    .getByRole('link', { name: 'Cara Kerja' })
    .click();
  await expect(page).toHaveURL(/#cara-kerja$/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
test('ordering configuration and local assets remain safe', async ({
  page,
  request,
}) => {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400)
      failures.push(new URL(response.url()).pathname);
  });
  await page.goto('/');
  const enabled =
    process.env.NEXT_PUBLIC_ORDERING_ENABLED === 'true' &&
    /^\+?[1-9]\d{7,14}$/.test(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '');
  if (enabled) {
    const links = page.getByRole('link', { name: 'Pesan via WhatsApp' });
    await expect(links.first()).toHaveAttribute(
      'href',
      /^https:\/\/wa.me\/[1-9]\d{7,14}\?text=Halo$/,
    );
    await expect(links.first()).toHaveAttribute('target', '_blank');
  } else {
    await expect(
      page.getByRole('button', { name: 'Segera Hadir' }).first(),
    ).toBeDisabled();
    await expect(page.locator('a[href*="wa.me"]')).toHaveCount(0);
  }
  for (const path of [
    '/brand/bee-bot.png',
    '/editorial/nasi-goreng.jpg',
    '/editorial/sate-ayam.jpg',
    '/editorial/es-teh.jpg',
    '/icon.png',
    '/robots.txt',
    '/sitemap.xml',
  ])
    expect((await request.get(path)).ok()).toBe(true);
  expect(await (await request.get('/robots.txt')).text()).toContain(
    'Disallow: /',
  );
  await page.getByText('Kredit fotografi editorial').click();
  await expect(page.locator('.photo-credits li')).toHaveCount(3);
  expect(failures).toEqual([]);
});
test('one desktop pin follows chapters in both scroll directions and cleans up on resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const story = page.locator('[data-journey]');
  await expect(story).toHaveAttribute('data-enhanced', 'true');
  await expect(page.locator('.pin-spacer')).toHaveCount(1);
  for (const index of [0, 1, 2, 3, 4, 5, 3, 1, 0]) {
    const id = journeySteps[index]!.id;
    await page
      .locator(`#${id}`)
      .evaluate((element) =>
        window.scrollTo(
          0,
          element.getBoundingClientRect().top + scrollY - innerHeight * 0.3,
        ),
      );
    await expect(story).toHaveAttribute('data-active-chapter', String(index));
    await expect(page.locator(`[data-panel="${id}"]`)).toBeVisible();
  }
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(story).not.toHaveAttribute('data-enhanced');
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.pin-spacer')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(story).not.toHaveAttribute('data-enhanced');
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.pin-spacer')).toHaveCount(1);
});
test('chapter links navigate to the actual story and short desktops never pin', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.locator('[data-journey]')).toHaveAttribute(
    'data-enhanced',
    'true',
  );
  await page
    .getByRole('navigation', { name: 'Bagian contoh percakapan' })
    .getByRole('link', { name: 'Tentukan waktunya' })
    .click();
  await expect(page).toHaveURL(/#atur-pickup$/);
  await expect(page.locator('[data-journey]')).toHaveAttribute(
    'data-active-chapter',
    '4',
  );
  await page.setViewportSize({ width: 1280, height: 650 });
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
});
test('without JavaScript all content and transcripts remain accessible', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3101/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('[data-journey]')).not.toHaveAttribute(
    'data-enhanced',
  );
  for (const step of journeySteps)
    await expect(page.locator(`#${step.id} .inline-transcript`)).toBeVisible();
  await expect(page.locator('.hero-action .button')).toBeVisible();
  await context.close();
});
