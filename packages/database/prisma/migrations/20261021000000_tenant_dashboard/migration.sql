-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'COMPLETED', 'REQUIRES_REVIEW');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfillmentStatus" "FulfillmentStatus",
ADD COLUMN     "fulfillmentVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TenantUser" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "authUserId" UUID NOT NULL,
    "role" "TenantRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canManageAvailability" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TenantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentHistory" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "fromStatus" "FulfillmentStatus" NOT NULL,
    "toStatus" "FulfillmentStatus" NOT NULL,
    "version" INTEGER NOT NULL,
    "requestId" UUID NOT NULL,
    "reason" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FulfillmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantAudit" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" VARCHAR(60) NOT NULL,
    "targetId" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantUser_authUserId_isActive_idx" ON "TenantUser"("authUserId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUser_tenantId_authUserId_key" ON "TenantUser"("tenantId", "authUserId");

-- CreateIndex
CREATE INDEX "FulfillmentHistory_orderId_createdAt_idx" ON "FulfillmentHistory"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentHistory_tenantId_requestId_key" ON "FulfillmentHistory"("tenantId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentHistory_orderId_version_key" ON "FulfillmentHistory"("orderId", "version");

-- CreateIndex
CREATE INDEX "TenantAudit_tenantId_createdAt_id_idx" ON "TenantAudit"("tenantId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Order_tenantId_fulfillmentStatus_placedAt_id_idx" ON "Order"("tenantId", "fulfillmentStatus", "placedAt", "id");

-- CreateIndex
CREATE INDEX "Order_tenantId_placedAt_id_idx" ON "Order"("tenantId", "placedAt", "id");

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FulfillmentHistory" ADD CONSTRAINT "FulfillmentHistory_orderId_tenantId_fkey" FOREIGN KEY ("orderId", "tenantId") REFERENCES "Order"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "TenantAudit" ADD CONSTRAINT "TenantAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Only verified, confirmed checkout records enter the preparation queue.
UPDATE "Order" o SET "fulfillmentStatus" = 'NEW'
WHERE o.status = 'CONFIRMED'
AND EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId"=o.id AND p.status='SUCCEEDED')
AND EXISTS (SELECT 1 FROM "PickupReservation" r WHERE r."orderId"=o.id AND r.status='CONFIRMED');
ALTER TABLE "Order" ADD CONSTRAINT "fulfillment_version_nonnegative" CHECK ("fulfillmentVersion" >= 0);
ALTER TABLE "FulfillmentHistory" ADD CONSTRAINT "fulfillment_history_version_positive" CHECK (version > 0);

-- Keep paid eligibility and forward-only transitions valid even for direct writes.
CREATE FUNCTION guard_fulfillment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."fulfillmentStatus" IS DISTINCT FROM OLD."fulfillmentStatus" THEN
    IF NEW."fulfillmentStatus" IS NULL OR NOT EXISTS (SELECT 1 FROM "Payment" WHERE "orderId"=NEW.id AND status='SUCCEEDED') OR NEW.status <> 'CONFIRMED' THEN
      RAISE EXCEPTION 'Fulfillment requires verified paid order';
    END IF;
    IF OLD."fulfillmentStatus" IS NULL THEN
      IF NEW."fulfillmentStatus" <> 'NEW' THEN RAISE EXCEPTION 'Invalid initial fulfillment'; END IF;
    ELSE
      IF NOT (
        (OLD."fulfillmentStatus"='NEW' AND NEW."fulfillmentStatus"='ACCEPTED') OR
        (OLD."fulfillmentStatus"='ACCEPTED' AND NEW."fulfillmentStatus"='PREPARING') OR
        (OLD."fulfillmentStatus"='PREPARING' AND NEW."fulfillmentStatus"='READY_FOR_PICKUP') OR
        (OLD."fulfillmentStatus"='READY_FOR_PICKUP' AND NEW."fulfillmentStatus"='COMPLETED') OR
        (OLD."fulfillmentStatus" NOT IN ('COMPLETED','REQUIRES_REVIEW') AND NEW."fulfillmentStatus"='REQUIRES_REVIEW')
      ) OR NEW."fulfillmentVersion" <> OLD."fulfillmentVersion"+1 THEN RAISE EXCEPTION 'Invalid fulfillment transition'; END IF;
    END IF;
  ELSIF NEW."fulfillmentVersion" <> OLD."fulfillmentVersion" THEN RAISE EXCEPTION 'Invalid fulfillment revision';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "guard_fulfillment" BEFORE UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION guard_fulfillment();
