-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATING', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.



-- AlterEnum

-- CreateTable
CREATE TABLE "TenantOperatingHour" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" INTEGER NOT NULL,
    "closesAt" INTEGER NOT NULL,
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Jakarta',
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TenantOperatingHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupSlot" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reservedCount" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PickupSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "orderNumber" VARCHAR(50) NOT NULL,
    "customerId" UUID NOT NULL,
    "messagingIdentityId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "tenantName" VARCHAR(120) NOT NULL,
    "sourceCartId" UUID NOT NULL,
    "chatId" VARCHAR(512) NOT NULL,
    "recipientPhone" VARCHAR(15),
    "confirmationEventId" TEXT NOT NULL,
    "pickupSlotId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotal" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "reviewReason" VARCHAR(100),
    "placedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "nameSnapshot" VARCHAR(120) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "lineSubtotal" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupReservation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "pickupSlotId" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PickupReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "merchantId" VARCHAR(100) NOT NULL,
    "providerOrderId" VARCHAR(100) NOT NULL,
    "providerTransactionId" VARCHAR(100),
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATING',
    "amount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "qrCodeUrl" VARCHAR(2048),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "creationStarted" BOOLEAN NOT NULL DEFAULT false,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMPTZ(3),
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "failures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "eventKey" VARCHAR(128) NOT NULL,
    "eventType" VARCHAR(50) NOT NULL,
    "processingStatus" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "evidence" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockPaymentTransaction" (
    "paymentId" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "transactionId" VARCHAR(100) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MockPaymentTransaction_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "CheckoutNotification" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "logicalKey" VARCHAR(150) NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "text" VARCHAR(4096) NOT NULL,
    "state" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "messageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CheckoutNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantOperatingHour_tenantId_dayOfWeek_key" ON "TenantOperatingHour"("tenantId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "PickupSlot_tenantId_startsAt_idx" ON "PickupSlot"("tenantId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PickupSlot_tenantId_startsAt_endsAt_key" ON "PickupSlot"("tenantId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PickupSlot_id_tenantId_key" ON "PickupSlot"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_sourceCartId_key" ON "Order"("sourceCartId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_confirmationEventId_key" ON "Order"("confirmationEventId");

-- CreateIndex
CREATE INDEX "Order_sessionId_placedAt_idx" ON "Order"("sessionId", "placedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_tenantId_key" ON "Order"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_sourceCartId_tenantId_key" ON "Order"("sourceCartId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_tenantId_pickupSlotId_key" ON "Order"("id", "tenantId", "pickupSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_menuItemId_key" ON "OrderItem"("orderId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PickupReservation_orderId_key" ON "PickupReservation"("orderId");

-- CreateIndex
CREATE INDEX "PickupReservation_pickupSlotId_status_idx" ON "PickupReservation"("pickupSlotId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PickupReservation_orderId_tenantId_key" ON "PickupReservation"("orderId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_provider_merchantId_availableAt_idx" ON "Payment"("provider", "merchantId", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_merchantId_providerOrderId_key" ON "Payment"("provider", "merchantId", "providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_merchantId_providerTransactionId_key" ON "Payment"("provider", "merchantId", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_eventKey_key" ON "PaymentEvent"("provider", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "MockPaymentTransaction_transactionId_key" ON "MockPaymentTransaction"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutNotification_logicalKey_key" ON "CheckoutNotification"("logicalKey");

-- CreateIndex
CREATE INDEX "CheckoutNotification_state_availableAt_idx" ON "CheckoutNotification"("state", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_id_customerId_sessionId_messagingIdentityId_key" ON "Cart"("id", "customerId", "sessionId", "messagingIdentityId");

-- AddForeignKey
ALTER TABLE "TenantOperatingHour" ADD CONSTRAINT "TenantOperatingHour_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PickupSlot" ADD CONSTRAINT "PickupSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_messagingIdentityId_customerId_fkey" FOREIGN KEY ("messagingIdentityId", "customerId") REFERENCES "CustomerMessagingIdentity"("id", "customerId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sessionId_messagingIdentityId_fkey" FOREIGN KEY ("sessionId", "messagingIdentityId") REFERENCES "ConversationSession"("id", "messagingIdentityId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceCartId_tenantId_fkey" FOREIGN KEY ("sourceCartId", "tenantId") REFERENCES "Cart"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupSlotId_tenantId_fkey" FOREIGN KEY ("pickupSlotId", "tenantId") REFERENCES "PickupSlot"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_tenantId_fkey" FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_tenantId_menuItemId_fkey" FOREIGN KEY ("tenantId", "menuItemId") REFERENCES "MenuItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PickupReservation" ADD CONSTRAINT "PickupReservation_orderId_tenantId_fkey" FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PickupReservation" ADD CONSTRAINT "PickupReservation_pickupSlotId_tenantId_fkey" FOREIGN KEY ("pickupSlotId", "tenantId") REFERENCES "PickupSlot"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MockPaymentTransaction" ADD CONSTRAINT "MockPaymentTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CheckoutNotification" ADD CONSTRAINT "CheckoutNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Critical domain invariants not expressible in Prisma's schema language.
CREATE UNIQUE INDEX "Order_one_unresolved_per_session" ON "Order" ("sessionId") WHERE "status" IN ('PENDING_PAYMENT','REQUIRES_REVIEW');
ALTER TABLE "TenantOperatingHour" ADD CONSTRAINT "hours_valid" CHECK ("dayOfWeek" BETWEEN 0 AND 6 AND "opensAt" >= 0 AND "closesAt" <= 1440 AND "opensAt" < "closesAt");
ALTER TABLE "PickupSlot" ADD CONSTRAINT "slot_valid" CHECK ("startsAt" < "endsAt" AND "capacity" > 0 AND "reservedCount" BETWEEN 0 AND "capacity");
ALTER TABLE "Order" ADD CONSTRAINT "order_money" CHECK ("subtotal" > 0 AND "totalAmount" = "subtotal" AND "currency" = 'IDR');
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_money" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "lineSubtotal"::bigint = "quantity"::bigint * "unitPrice"::bigint);
ALTER TABLE "Payment" ADD CONSTRAINT "payment_money" CHECK ("amount" > 0 AND "currency" = 'IDR' AND "provider" IN ('mock','midtrans'));
ALTER TABLE "Order" ADD CONSTRAINT "order_cart_owner" FOREIGN KEY ("sourceCartId", "customerId", "sessionId", "messagingIdentityId") REFERENCES "Cart" ("id", "customerId", "sessionId", "messagingIdentityId") ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE "PickupReservation" ADD CONSTRAINT "reservation_order_slot" FOREIGN KEY ("orderId", "tenantId", "pickupSlotId") REFERENCES "Order" ("id", "tenantId", "pickupSlotId") ON UPDATE RESTRICT ON DELETE RESTRICT;

-- Guarded counters make even direct/concurrent reservation writes capacity-safe.
CREATE FUNCTION checkout_reservation_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_used integer := 0; new_used integer := 0; slot uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_used := CASE WHEN OLD.status IN ('HELD','CONFIRMED') THEN 1 ELSE 0 END; slot := OLD."pickupSlotId"; END IF;
  IF TG_OP <> 'DELETE' THEN
    new_used := CASE WHEN NEW.status IN ('HELD','CONFIRMED') THEN 1 ELSE 0 END;
    IF TG_OP = 'UPDATE' AND (NEW."pickupSlotId", NEW."orderId", NEW."tenantId") IS DISTINCT FROM (OLD."pickupSlotId", OLD."orderId", OLD."tenantId") THEN RAISE EXCEPTION 'Reservation ownership immutable'; END IF;
    slot := NEW."pickupSlotId";
  END IF;
  UPDATE "PickupSlot" SET "reservedCount" = "reservedCount" + new_used - old_used WHERE id = slot;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER reservation_capacity BEFORE INSERT OR UPDATE OR DELETE ON "PickupReservation" FOR EACH ROW EXECUTE FUNCTION checkout_reservation_capacity();
CREATE FUNCTION checkout_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'OrderItem' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Order item snapshot immutable'; END IF;
  IF TG_TABLE_NAME = 'Order' AND (NEW."sourceCartId",NEW."customerId",NEW."sessionId",NEW."messagingIdentityId",NEW."tenantId",NEW."pickupSlotId",NEW."subtotal",NEW."totalAmount",NEW."currency",NEW."tenantName") IS DISTINCT FROM (OLD."sourceCartId",OLD."customerId",OLD."sessionId",OLD."messagingIdentityId",OLD."tenantId",OLD."pickupSlotId",OLD."subtotal",OLD."totalAmount",OLD."currency",OLD."tenantName") THEN RAISE EXCEPTION 'Order snapshot immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_snapshot BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION checkout_snapshot_immutable();
CREATE TRIGGER item_snapshot BEFORE UPDATE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION checkout_snapshot_immutable();
CREATE FUNCTION checkout_cart_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cart_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN cart_id := OLD."cartId"; ELSE cart_id := NEW."cartId"; END IF;
  IF EXISTS (SELECT 1 FROM "Order" WHERE "sourceCartId" = cart_id) THEN RAISE EXCEPTION 'Checked out cart frozen'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER cart_frozen BEFORE INSERT OR UPDATE OR DELETE ON "CartItem" FOR EACH ROW EXECUTE FUNCTION checkout_cart_frozen();
ALTER TABLE "ConversationSession" DROP CONSTRAINT "ConversationSession_context";
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_context" CHECK (
  ("state" IN ('IDLE','SELECT_TENANT') AND "selectedTenantId" IS NULL AND "selectedCategoryId" IS NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" IN ('SELECT_CATEGORY','CART_ACTION','CART_REVIEW','CART_EDIT_QUANTITY','CART_EDIT_QUANTITY_INPUT','CART_REMOVE_ITEM','CART_READY','CART_CONFIRM_CLEAR','CART_CONFIRM_SWITCH','CART_CONFIRM_REOPEN','CART_CONFIRM_PRICE','SELECT_PICKUP','CONFIRM_CHECKOUT','AWAITING_PAYMENT','ORDER_CONFIRMED','PAYMENT_UNSUCCESSFUL','REQUIRES_REVIEW') AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" = 'SELECT_MENU' AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NOT NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" IN ('VIEW_MENU_ITEM','SELECT_QUANTITY') AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NOT NULL AND "selectedMenuItemId" IS NOT NULL)
);
