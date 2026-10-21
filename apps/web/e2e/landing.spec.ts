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
    await expect(page.locator('.journey')).not.toHaveAttribute('data-playback');
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
  expect(failures).toEqual([]);
});
test('live chat reveals a customer, typing indicator, then reply without page scrolling', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const story = page.locator('[data-journey]');
  await expect(story).toHaveAttribute('data-playback', 'true');
  const viewport = page.locator('.journey-chat-viewport');
  await viewport.scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-chat-phase', 'customer');
  const first = page.locator('[data-exchange="halo"]');
  await expect(first.locator('[data-customer]')).toBeVisible();
  await expect(first.locator('[data-response]')).toBeHidden();
  const scrollY = await page.evaluate(() => window.scrollY);
  await expect(page.locator('[data-typing]')).toBeVisible();
  await expect(first.locator('[data-response]')).toBeHidden();
  await expect(first.locator('[data-response]')).toBeVisible();
  await expect(page.locator('[data-typing]')).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await expect(
    page.locator('.pin-spacer, .journey-panel, .stage-progress'),
  ).toHaveCount(0);
  await expect(page.locator('.journey-full-transcript')).not.toHaveAttribute(
    'open',
  );
});

test('pause, chapter selection, continuation, and replay preserve a single conversation', async ({
  page,
}) => {
  await page.goto('/');
  const story = page.locator('[data-journey]');
  await expect(story).toHaveAttribute('data-playback', 'true');
  const links = page.getByRole('navigation', {
    name: 'Bagian contoh percakapan',
  });
  await links.getByRole('link', { name: 'Tentukan waktunya' }).click();
  await expect(story).toHaveAttribute('data-active-chapter', '4');
  await expect(story).toHaveAttribute('data-playback-status', 'paused');
  await expect(page.locator('[data-exchange]:not([hidden])')).toHaveCount(5);
  await expect(page.locator('[data-exchange="ikuti-instruksi"]')).toBeHidden();
  await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
  await page.locator('.journey-chat-viewport').scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-active-chapter', '5');
  await expect(
    page.locator('[data-exchange="ikuti-instruksi"] [data-response]'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  await expect(story).toHaveAttribute('data-playback-status', 'paused');
  await page.waitForTimeout(1500);
  await expect(story).toHaveAttribute('data-playback-status', 'paused');
  await page.getByRole('button', { name: 'Putar Ulang', exact: true }).click();
  await expect(story).toHaveAttribute('data-active-chapter', '0');
  await expect(page.locator('[data-exchange="ikuti-instruksi"]')).toBeHidden();
  await expect(page.locator('[data-chat-track]')).toHaveCount(1);
  await page.getByText('Baca percakapan lengkap', { exact: true }).click();
  for (const step of journeySteps)
    await expect(page.locator(`#${step.id} .inline-transcript`)).toBeVisible();
});

test('playback pauses offscreen and in a hidden tab without overriding manual pause', async ({
  page,
}) => {
  await page.goto('/');
  const story = page.locator('[data-journey]');
  await expect(story).toHaveAttribute('data-playback', 'true');
  await page.locator('.journey-chat-viewport').scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-playback-status', 'playing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(story).toHaveAttribute('data-playback-status', 'paused');
  const phase = await story.getAttribute('data-chat-phase');
  await page.waitForTimeout(1600);
  await expect(story).toHaveAttribute('data-chat-phase', phase!);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(story).toHaveAttribute('data-playback-status', 'playing');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(story).toHaveAttribute('data-playback-status', 'paused');
  await page.locator('.journey-chat-viewport').scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-playback-status', 'playing');
  await page.getByRole('button', { name: 'Jeda', exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.locator('.journey-chat-viewport').scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-playback-status', 'paused');
});

test('mobile playback resizes, follows the latest reply, and fully reverts for reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const story = page.locator('[data-journey]');
  await expect(story).toHaveAttribute('data-playback', 'true');
  await page.locator('.journey-chat-viewport').scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-playback-status', 'playing');
  await page.locator('[data-select-chapter="ikuti-instruksi"]').click();
  await expect(story).toHaveAttribute('data-playback-status', 'complete');
  const assertFinalFits = async () => {
    await expect
      .poll(() =>
        page
          .locator('[data-exchange="ikuti-instruksi"]')
          .evaluate((element) => {
            const viewport = element
              .closest('.journey-chat-viewport')!
              .getBoundingClientRect();
            const box = element.getBoundingClientRect();
            return (
              box.top >= viewport.top - 2 && box.bottom <= viewport.bottom + 2
            );
          }),
      )
      .toBe(true);
  };
  await assertFinalFits();
  await page.setViewportSize({ width: 1280, height: 650 });
  await assertFinalFits();
  await expect(page.locator('.pin-spacer')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(story).not.toHaveAttribute('data-playback');
  await expect(page.locator('[data-chat-track]')).not.toHaveAttribute('style');
  await expect(page.locator('.journey-full-transcript')).toHaveAttribute(
    'open',
    '',
  );
  for (const step of journeySteps)
    await expect(page.locator(`#${step.id} .inline-transcript`)).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(story).toHaveAttribute('data-playback', 'true');
  await expect(page.locator('[data-chat-track]')).toHaveCount(1);
});

test('the full sequence completes once and retains the final payment reply', async ({
  page,
}) => {
  test.setTimeout(45000);
  await page.goto('/');
  const story = page.locator('[data-journey]');
  await expect(story).toHaveAttribute('data-playback', 'true');
  await page.locator('.journey-chat-viewport').scrollIntoViewIfNeeded();
  await expect(story).toHaveAttribute('data-playback-status', 'complete', {
    timeout: 35000,
  });
  await expect(page.locator('[data-exchange]:not([hidden])')).toHaveCount(6);
  await expect(
    page.locator('.journey-chat-track [data-response]:not([hidden])'),
  ).toHaveCount(6);
  await expect(page.locator('[data-typing]')).toBeHidden();
  await page.waitForTimeout(1600);
  await expect(story).toHaveAttribute('data-active-chapter', '5');
  await expect(story).toHaveAttribute('data-playback-status', 'complete');
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
    'data-playback',
  );
  for (const step of journeySteps)
    await expect(page.locator(`#${step.id} .inline-transcript`)).toBeVisible();
  await expect(page.locator('.hero-action .button')).toBeVisible();
  await context.close();
});
