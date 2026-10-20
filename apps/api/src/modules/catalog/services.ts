import { z } from 'zod';
import type { PrismaClient } from '@beelicious/database';
import {
  defined,
  descriptionSchema,
  domainOperation,
  DomainError,
  idSchema,
  integerSchema,
  nameSchema,
  nonempty,
  slugSchema,
  urlSchema,
} from './validation.js';

const tenantInput = z.strictObject({
  name: nameSchema,
  slug: slugSchema,
  description: descriptionSchema,
  logoUrl: urlSchema,
  isActive: z.boolean().optional(),
});
const tenantUpdate = nonempty(tenantInput);
const categoryInput = z.strictObject({
  name: nameSchema,
  description: descriptionSchema,
  sortOrder: integerSchema.optional(),
  isActive: z.boolean().optional(),
});
const categoryUpdate = nonempty(categoryInput);
const menuInput = z.strictObject({
  categoryId: idSchema,
  name: nameSchema,
  description: descriptionSchema,
  price: integerSchema.nonnegative(),
  imageUrl: urlSchema,
  isAvailable: z.boolean().optional(),
  sortOrder: integerSchema.optional(),
});
const menuUpdate = nonempty(menuInput);
const order = [{ sortOrder: 'asc' }, { id: 'asc' }] as const;

export class TenantService {
  constructor(private readonly db: PrismaClient) {}
  create(input: unknown) {
    return domainOperation(() =>
      this.db.tenant.create({ data: defined(tenantInput.parse(input)) }),
    );
  }
  getById(id: string) {
    return domainOperation(() =>
      this.db.tenant.findUniqueOrThrow({ where: { id: idSchema.parse(id) } }),
    );
  }
  getBySlug(slug: string) {
    return domainOperation(() =>
      this.db.tenant.findUniqueOrThrow({
        where: { slug: slugSchema.parse(slug) },
      }),
    );
  }
  listActive() {
    return domainOperation(() =>
      this.db.tenant.findMany({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    );
  }
  update(id: string, input: unknown) {
    return domainOperation(() =>
      this.db.tenant.update({
        where: { id: idSchema.parse(id) },
        data: defined(tenantUpdate.parse(input)),
      }),
    );
  }
  setActive(id: string, isActive: boolean) {
    return this.update(id, { isActive });
  }
}

export class MenuCategoryService {
  constructor(private readonly db: PrismaClient) {}
  create(tenantId: string, input: unknown) {
    return domainOperation(async () => {
      const tenant = idSchema.parse(tenantId);
      const data = defined(categoryInput.parse(input));
      await this.db.tenant.findUniqueOrThrow({
        where: { id: tenant },
        select: { id: true },
      });
      return this.db.menuCategory.create({
        data: { ...data, tenantId: tenant },
      });
    });
  }
  list(tenantId: string, activeOnly = false) {
    return domainOperation(async () => {
      const id = idSchema.parse(tenantId);
      await this.db.tenant.findUniqueOrThrow({
        where: { id },
        select: { id: true },
      });
      return this.db.menuCategory.findMany({
        where: {
          tenantId: id,
          ...(activeOnly ? { isActive: true, tenant: { isActive: true } } : {}),
        },
        orderBy: [...order],
      });
    });
  }
  update(tenantId: string, categoryId: string, input: unknown) {
    return domainOperation(() =>
      this.db.menuCategory.update({
        where: {
          tenantId_id: {
            tenantId: idSchema.parse(tenantId),
            id: idSchema.parse(categoryId),
          },
        },
        data: defined(categoryUpdate.parse(input)),
      }),
    );
  }
  setOrder(tenantId: string, categoryId: string, sortOrder: number) {
    return this.update(tenantId, categoryId, { sortOrder });
  }
  setActive(tenantId: string, categoryId: string, isActive: boolean) {
    return this.update(tenantId, categoryId, { isActive });
  }
}

export class MenuService {
  constructor(private readonly db: PrismaClient) {}
  create(tenantId: string, input: unknown) {
    return domainOperation(async () => {
      const id = idSchema.parse(tenantId);
      const data = defined(menuInput.parse(input));
      await this.db.menuCategory.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: id, id: data.categoryId } },
        select: { id: true },
      });
      return this.db.menuItem.create({ data: { ...data, tenantId: id } });
    });
  }
  get(tenantId: string, menuItemId: string, availableOnly = false) {
    return domainOperation(() =>
      this.db.menuItem.findFirstOrThrow({
        where: {
          tenantId: idSchema.parse(tenantId),
          id: idSchema.parse(menuItemId),
          ...(availableOnly
            ? {
                isAvailable: true,
                category: { isActive: true },
                tenant: { isActive: true },
              }
            : {}),
        },
      }),
    );
  }
  list(
    tenantId: string,
    filter: { categoryId?: string; availableOnly?: boolean } = {},
  ) {
    return domainOperation(async () => {
      const id = idSchema.parse(tenantId);
      const parsed = z
        .strictObject({
          categoryId: idSchema.optional(),
          availableOnly: z.boolean().optional(),
        })
        .parse(filter);
      await this.db.tenant.findUniqueOrThrow({
        where: { id },
        select: { id: true },
      });
      if (parsed.categoryId) {
        const category = await this.db.menuCategory.findUnique({
          where: { tenantId_id: { tenantId: id, id: parsed.categoryId } },
          select: { isActive: true },
        });
        if (!category || (parsed.availableOnly && !category.isActive))
          throw new DomainError('not_found');
      }
      return this.db.menuItem.findMany({
        where: {
          tenantId: id,
          ...(parsed.categoryId ? { categoryId: parsed.categoryId } : {}),
          ...(parsed.availableOnly
            ? {
                isAvailable: true,
                category: { isActive: true },
                tenant: { isActive: true },
              }
            : {}),
        },
        orderBy: [...order],
      });
    });
  }
  available(tenantId: string, categoryId?: string) {
    return this.list(tenantId, {
      availableOnly: true,
      ...(categoryId ? { categoryId } : {}),
    });
  }
  update(tenantId: string, menuItemId: string, input: unknown) {
    return domainOperation(async () => {
      const id = idSchema.parse(tenantId);
      const itemId = idSchema.parse(menuItemId);
      const data = defined(menuUpdate.parse(input));
      if (data.categoryId)
        await this.db.menuCategory.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: id, id: data.categoryId } },
          select: { id: true },
        });
      return this.db.menuItem.update({
        where: { id: itemId, tenantId: id },
        data,
      });
    });
  }
  setPrice(tenantId: string, menuItemId: string, price: number) {
    return this.update(tenantId, menuItemId, { price });
  }
  setAvailable(tenantId: string, menuItemId: string, isAvailable: boolean) {
    return this.update(tenantId, menuItemId, { isAvailable });
  }
}
export function createCatalogServices(db: PrismaClient) {
  return {
    tenants: new TenantService(db),
    categories: new MenuCategoryService(db),
    menu: new MenuService(db),
  };
}
export type CatalogServices = ReturnType<typeof createCatalogServices>;
