-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(2000),
    "logoUrl" VARCHAR(2048),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000),
    "price" INTEGER NOT NULL,
    "imageUrl" VARCHAR(2048),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMessagingIdentity" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "accountId" VARCHAR(512) NOT NULL,
    "providerUserId" VARCHAR(512) NOT NULL,
    "identifierType" VARCHAR(20) NOT NULL,
    "phoneNumber" VARCHAR(15),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMessagingIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_isActive_name_id_idx" ON "Tenant"("isActive", "name", "id");

-- CreateIndex
CREATE INDEX "MenuCategory_tenantId_isActive_sortOrder_id_idx" ON "MenuCategory"("tenantId", "isActive", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_tenantId_id_key" ON "MenuCategory"("tenantId", "id");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_isAvailable_sortOrder_id_idx" ON "MenuItem"("tenantId", "isAvailable", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_categoryId_sortOrder_id_idx" ON "MenuItem"("tenantId", "categoryId", "sortOrder", "id");

-- CreateIndex
CREATE INDEX "CustomerMessagingIdentity_customerId_idx" ON "CustomerMessagingIdentity"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMessagingIdentity_provider_accountId_providerUserId_key" ON "CustomerMessagingIdentity"("provider", "accountId", "providerUserId");

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_categoryId_fkey" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "MenuCategory"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CustomerMessagingIdentity" ADD CONSTRAINT "CustomerMessagingIdentity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Money must remain nonnegative even when writes bypass application validation.
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "CustomerMessagingIdentity" ADD CONSTRAINT "CustomerMessagingIdentity_provider_type" CHECK (
  ("provider" = 'baileys' AND "identifierType" IN ('jid', 'lid')) OR
  ("provider" = 'cloud-api' AND "identifierType" = 'cloud-user') OR
  ("provider" = 'mock' AND "identifierType" = 'mock-user')
);
