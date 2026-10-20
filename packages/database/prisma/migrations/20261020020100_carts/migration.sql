-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'READY', 'ABANDONED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.



-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "messagingIdentityId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cart_customerId_status_idx" ON "Cart"("customerId", "status");

-- CreateIndex
CREATE INDEX "Cart_sessionId_status_idx" ON "Cart"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_id_tenantId_key" ON "Cart"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CartItem_tenantId_menuItemId_idx" ON "CartItem"("tenantId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_menuItemId_key" ON "CartItem"("cartId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_tenantId_id_key" ON "MenuItem"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMessagingIdentity_id_customerId_key" ON "CustomerMessagingIdentity"("id", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSession_id_messagingIdentityId_key" ON "ConversationSession"("id", "messagingIdentityId");

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_messagingIdentityId_customerId_fkey" FOREIGN KEY ("messagingIdentityId", "customerId") REFERENCES "CustomerMessagingIdentity"("id", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_sessionId_messagingIdentityId_fkey" FOREIGN KEY ("sessionId", "messagingIdentityId") REFERENCES "ConversationSession"("id", "messagingIdentityId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_tenantId_fkey" FOREIGN KEY ("cartId", "tenantId") REFERENCES "Cart"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_tenantId_menuItemId_fkey" FOREIGN KEY ("tenantId", "menuItemId") REFERENCES "MenuItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Prisma cannot represent this partial unique index or these CHECK constraints.
CREATE UNIQUE INDEX "Cart_one_open_per_session" ON "Cart" ("sessionId") WHERE "status" IN ('ACTIVE', 'READY');
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_revision_nonnegative" CHECK ("revision" >= 0);
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_price_nonnegative" CHECK ("unitPrice" >= 0);
ALTER TABLE "ConversationSession" DROP CONSTRAINT "ConversationSession_context";
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_context" CHECK (
  ("state" IN ('IDLE', 'SELECT_TENANT') AND "selectedTenantId" IS NULL AND "selectedCategoryId" IS NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" IN ('SELECT_CATEGORY', 'CART_ACTION', 'CART_REVIEW', 'CART_EDIT_QUANTITY', 'CART_EDIT_QUANTITY_INPUT', 'CART_REMOVE_ITEM', 'CART_READY', 'CART_CONFIRM_CLEAR', 'CART_CONFIRM_SWITCH', 'CART_CONFIRM_REOPEN', 'CART_CONFIRM_PRICE') AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" = 'SELECT_MENU' AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NOT NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" IN ('VIEW_MENU_ITEM', 'SELECT_QUANTITY') AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NOT NULL AND "selectedMenuItemId" IS NOT NULL)
);
