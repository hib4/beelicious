import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import type { CatalogServices } from '../../src/modules/catalog/services.js';
import { parseCommand } from '../../src/modules/conversation/commands.js';
import {
  idle,
  transition,
  rupiah,
  type Context,
} from '../../src/modules/conversation/flow.js';
import { parseEnvironment } from '../../src/config.js';
import { incomingEvents } from '../../src/modules/messaging/inbox.js';
import { incoming } from '../messaging/fixtures.js';
import { parsePayload } from '../../src/modules/whatsapp/payload.js';
import { payload, message, whatsapp } from '../whatsapp/fixtures.js';

function fixtures() {
  const tenant = {
    id: randomUUID(),
    name: 'Tenant fixture',
    isActive: true,
    updatedAt: new Date(),
  };
  const category = {
    id: randomUUID(),
    tenantId: tenant.id,
    name: 'Kategori',
    isActive: true,
    updatedAt: new Date(),
  };
  const item = {
    id: randomUUID(),
    tenantId: tenant.id,
    categoryId: category.id,
    name: 'Menu fixture',
    price: 20000,
    description: 'Contoh',
    updatedAt: new Date(),
  };
  const tenants = [tenant],
    categories = [category],
    items = [item];
  const catalog = {
    tenants: {
      listActive: vi.fn(async () => tenants),
      getById: vi.fn(async () => tenant),
    },
    categories: { list: vi.fn(async () => categories) },
    menu: { available: vi.fn(async () => items) },
  } as unknown as CatalogServices;
  return { tenant, category, item, tenants, categories, items, catalog };
}
async function advance(c: Context, text: string, catalog: CatalogServices) {
  return transition(c, parseCommand(text), catalog);
}
it.each([' Halo ', 'HI', 'Mulai', 'mEnU'])('starts on %s', async (text) => {
  const f = fixtures();
  const r = await advance(idle(), text, f.catalog);
  expect(r.context.state).toBe('SELECT_TENANT');
  expect(r.text).toContain('1. Tenant fixture');
  expect(r.text).not.toContain(f.tenant.id);
});
it('browses all screens and navigates back without stale selections', async () => {
  const f = fixtures();
  let c = (await advance(idle(), 'halo', f.catalog)).context;
  c = (await advance(c, '1', f.catalog)).context;
  expect(c.state).toBe('SELECT_CATEGORY');
  c = (await advance(c, '1', f.catalog)).context;
  expect(c.state).toBe('SELECT_MENU');
  const details = await advance(c, '1', f.catalog);
  expect(details.context.state).toBe('VIEW_MENU_ITEM');
  expect(details.text).toContain('Rp20.000');
  expect(details.text).toContain('Contoh');
  c = (await advance(details.context, '0', f.catalog)).context;
  expect(c.selectedMenuItemId).toBeNull();
  c = (await advance(c, ' KEMBALI ', f.catalog)).context;
  expect(c.selectedCategoryId).toBeNull();
  c = (await advance(c, '0', f.catalog)).context;
  expect(c.selectedTenantId).toBeNull();
  c = (await advance(c, '0', f.catalog)).context;
  expect(c.state).toBe('IDLE');
});
it('preserves context for invalid input and help, and clears it on cancel/restart', async () => {
  const f = fixtures();
  const c = (await advance(idle(), 'hi', f.catalog)).context;
  for (const text of ['-1', '1.0', '001', '99999999999999', 'hello', '6']) {
    const r = await advance(c, text, f.catalog);
    expect(r.context).toEqual(c);
    expect(r.text).toContain('belum valid');
  }
  expect((await advance(c, 'Bantuan', f.catalog)).context).toEqual(c);
  expect((await advance(c, 'Batal', f.catalog)).context).toEqual(idle());
  expect((await advance(c, 'Menu', f.catalog)).context.state).toBe(
    'SELECT_TENANT',
  );
  expect(parseCommand('  ')).toEqual({ kind: 'empty' });
});
it('refreshes numbering when catalog membership changes', async () => {
  const f = fixtures();
  const c = (await advance(idle(), 'hi', f.catalog)).context;
  f.tenants.unshift({ ...f.tenant, id: randomUUID(), name: 'New' });
  const refreshed = await advance(c, '1', f.catalog);
  expect(refreshed.context.state).toBe('SELECT_TENANT');
  expect(refreshed.text).toContain('telah berubah');
  expect(refreshed.context.data.options[0]).toBe(f.tenants[0]!.id);
});
it('paginates five choices using 8/9 and retains the displayed mapping', async () => {
  const f = fixtures();
  for (let i = 0; i < 6; i++)
    f.tenants.push({ ...f.tenant, id: randomUUID(), name: `Fixture ${i}` });
  let c = (await advance(idle(), 'hi', f.catalog)).context;
  expect(c.data.options).toHaveLength(5);
  let r = await advance(c, '9', f.catalog);
  c = r.context;
  expect(c.data.tenantPage).toBe(1);
  expect(c.data.options).toHaveLength(2);
  expect(r.text).toContain('8.');
  r = await advance(c, '8', f.catalog);
  expect(r.context.data.tenantPage).toBe(0);
});
it('handles empty lists, expiry, uncertain-send refresh and deactivated selections', async () => {
  const f = fixtures();
  let c = (await advance(idle(), 'hi', f.catalog)).context;
  let r = await transition(c, parseCommand('1'), f.catalog, { expired: true });
  expect(r.text).toContain('tidak aktif');
  expect(r.context.state).toBe('SELECT_TENANT');
  r = await transition(c, parseCommand('1'), f.catalog, { refresh: true });
  expect(r.context.state).toBe('SELECT_TENANT');
  c = (await advance(c, '1', f.catalog)).context;
  f.categories.length = 0;
  r = await advance(c, '1', f.catalog);
  expect(r.text).toContain('Belum ada');
  f.tenant.isActive = false;
  r = await advance(c, '1', f.catalog);
  expect(r.context.state).toBe('SELECT_TENANT');
  f.tenants.length = 0;
  expect((await advance(idle(), 'hi', f.catalog)).text).toContain('Belum ada');
});
it('recovers missing categories/items and bounds detail responses', async () => {
  const f = fixtures();
  let c = (await advance(idle(), 'hi', f.catalog)).context;
  c = (await advance(c, '1', f.catalog)).context;
  c = (await advance(c, '1', f.catalog)).context;
  c = (await advance(c, '1', f.catalog)).context;
  f.item.description = 'x'.repeat(2000);
  expect(
    (await advance(c, 'unexpected', f.catalog)).text.length,
  ).toBeLessThanOrEqual(4096);
  f.items.length = 0;
  let r = await advance(c, '1', f.catalog);
  expect(r.context.state).toBe('SELECT_MENU');
  expect(r.context.selectedMenuItemId).toBeNull();
  f.categories.length = 0;
  r = await advance(r.context, '1', f.catalog);
  expect(r.context.state).toBe('SELECT_CATEGORY');
  expect(rupiah(0)).toBe('Rp0');
  expect(rupiah(2147483647)).toBe('Rp2.147.483.647');
});
it('classifies commands without persisting arbitrary text and retains legacy Cloud hashes', () => {
  const secret = 'private customer free text';
  expect(
    JSON.stringify(incomingEvents([incoming({ text: secret })], true)),
  ).not.toContain(secret);
  const a = parsePayload(payload([message('id', 'Menu')]), whatsapp);
  const b = parsePayload(payload([message('id', 'Menu')]), whatsapp, true);
  expect(b[0]!.dedupKey).toBe(a[0]!.dedupKey);
  expect(b[0]!.data.conversation).toMatchObject({ command: { kind: 'start' } });
  expect(
    parsePayload(payload([{ ...message(), type: 'image' }]), whatsapp, true)[0]!
      .processingMode,
  ).toBeUndefined();
});
it('requires explicit safe conversation configuration', () => {
  const env = {
    DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
    MESSAGING_PROVIDER: 'mock',
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_TEST_BOT_ENABLED: 'true',
    WHATSAPP_TEST_RECIPIENTS: '15555550101',
    CONVERSATION_ENABLED: 'true',
  };
  expect(parseEnvironment(env).conversationEnabled).toBe(true);
  for (const override of [
    { NODE_ENV: 'production' },
    { WHATSAPP_ENABLED: 'false' },
    { WHATSAPP_TEST_BOT_ENABLED: 'false' },
    { WHATSAPP_TEST_RECIPIENTS: '' },
    { CONVERSATION_ENABLED: 'yes' },
  ])
    expect(() => parseEnvironment({ ...env, ...override })).toThrow(
      'Invalid environment configuration',
    );
  expect(
    parseEnvironment({ ...env, CONVERSATION_ENABLED: 'false' })
      .conversationEnabled,
  ).toBe(false);
});

it('refreshes repriced item options rather than applying the old numeric selection', async () => {
  const f = fixtures();
  let c = (await advance(idle(), 'hi', f.catalog)).context;
  c = (await advance(c, '1', f.catalog)).context;
  c = (await advance(c, '1', f.catalog)).context;
  f.item.price = 25000;
  const r = await advance(c, '1', f.catalog);
  expect(r.context.state).toBe('SELECT_MENU');
  expect(r.text).toContain('Rp25.000');
  expect(r.text).toContain('telah berubah');
});
