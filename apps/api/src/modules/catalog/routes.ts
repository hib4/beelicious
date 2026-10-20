import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Tenant, MenuCategory, MenuItem } from '@beelicious/database';
import type { CatalogServices } from './services.js';
import { DomainError, idSchema } from './validation.js';

export type CatalogReader = {
  tenants: Pick<CatalogServices['tenants'], 'listActive' | 'getById'>;
  categories: Pick<CatalogServices['categories'], 'list'>;
  menu: Pick<CatalogServices['menu'], 'available' | 'get'>;
};
const tenantParams = z.strictObject({ tenantId: idSchema });
const itemParams = tenantParams.extend({ menuItemId: idSchema });
const query = z.strictObject({ categoryId: idSchema.optional() });
const string = { type: 'string' };
const nullableString = { anyOf: [string, { type: 'null' }] };
function object(properties: Record<string, unknown>) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}
const tenantResponse = object({
  id: string,
  name: string,
  slug: string,
  description: nullableString,
  logoUrl: nullableString,
});
const categoryResponse = object({
  id: string,
  tenantId: string,
  name: string,
  description: nullableString,
  sortOrder: { type: 'integer' },
});
const menuResponse = object({
  id: string,
  tenantId: string,
  categoryId: string,
  name: string,
  description: nullableString,
  price: { type: 'integer', minimum: 0 },
  imageUrl: nullableString,
  isAvailable: { type: 'boolean', const: true },
  sortOrder: { type: 'integer' },
});
const errorResponse = object({
  error: object({ code: string, message: string }),
});
function response(data: object, list = false) {
  return {
    200: object({ data: list ? { type: 'array', items: data } : data }),
    400: errorResponse,
    404: errorResponse,
    503: errorResponse,
  };
}
function tenantDto(t: Tenant) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    logoUrl: t.logoUrl,
  };
}
function categoryDto(c: MenuCategory) {
  return {
    id: c.id,
    tenantId: c.tenantId,
    name: c.name,
    description: c.description,
    sortOrder: c.sortOrder,
  };
}
function menuDto(m: MenuItem) {
  return {
    id: m.id,
    tenantId: m.tenantId,
    categoryId: m.categoryId,
    name: m.name,
    description: m.description,
    price: m.price,
    imageUrl: m.imageUrl,
    isAvailable: m.isAvailable,
    sortOrder: m.sortOrder,
  };
}
export async function registerCatalogRoutes(
  app: FastifyInstance,
  services?: CatalogReader,
) {
  function catalog() {
    if (!services) throw new DomainError('unavailable');
    return services;
  }
  async function activeTenant(id: string) {
    const tenant = await catalog().tenants.getById(id);
    if (!tenant.isActive) throw new DomainError('not_found');
    return tenant;
  }
  app.setErrorHandler((error, _request, reply) => {
    const failure =
      error instanceof z.ZodError
        ? new DomainError('invalid_input')
        : error instanceof DomainError
          ? error
          : new DomainError('unavailable');
    const status = {
      invalid_input: 400,
      not_found: 404,
      conflict: 409,
      unavailable: 503,
    }[failure.code];
    if (status === 503)
      app.log.warn(
        { event: 'catalog_storage_failure' },
        'Catalog request failed',
      );
    return reply
      .code(status)
      .send({ error: { code: failure.code, message: failure.message } });
  });
  app.get(
    '/api/v1/tenants',
    { schema: { response: response(tenantResponse, true) } },
    async () => ({
      data: (await catalog().tenants.listActive()).map(tenantDto),
    }),
  );
  app.get(
    '/api/v1/tenants/:tenantId',
    { schema: { response: response(tenantResponse) } },
    async (request) => {
      const { tenantId } = tenantParams.parse(request.params);
      return { data: tenantDto(await activeTenant(tenantId)) };
    },
  );
  app.get(
    '/api/v1/tenants/:tenantId/categories',
    { schema: { response: response(categoryResponse, true) } },
    async (request) => {
      const { tenantId } = tenantParams.parse(request.params);
      await activeTenant(tenantId);
      return {
        data: (await catalog().categories.list(tenantId, true)).map(
          categoryDto,
        ),
      };
    },
  );
  app.get(
    '/api/v1/tenants/:tenantId/menu',
    { schema: { response: response(menuResponse, true) } },
    async (request) => {
      const { tenantId } = tenantParams.parse(request.params);
      const { categoryId } = query.parse(request.query);
      await activeTenant(tenantId);
      return {
        data: (await catalog().menu.available(tenantId, categoryId)).map(
          menuDto,
        ),
      };
    },
  );
  app.get(
    '/api/v1/tenants/:tenantId/menu/:menuItemId',
    { schema: { response: response(menuResponse) } },
    async (request) => {
      const { tenantId, menuItemId } = itemParams.parse(request.params);
      await activeTenant(tenantId);
      return {
        data: menuDto(await catalog().menu.get(tenantId, menuItemId, true)),
      };
    },
  );
}
