-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('IDLE', 'SELECT_TENANT', 'SELECT_CATEGORY', 'SELECT_MENU', 'VIEW_MENU_ITEM');

-- AlterTable
ALTER TABLE "WhatsAppEvent" ADD COLUMN     "preparationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "processingMode" TEXT NOT NULL DEFAULT 'greeting',
ADD COLUMN     "receiptSequence" BIGSERIAL NOT NULL,
ADD COLUMN     "streamKey" TEXT;

-- CreateTable
CREATE TABLE "ConversationSession" (
    "id" UUID NOT NULL,
    "messagingIdentityId" UUID NOT NULL,
    "state" "ConversationState" NOT NULL DEFAULT 'IDLE',
    "selectedTenantId" UUID,
    "selectedCategoryId" UUID,
    "selectedMenuItemId" UUID,
    "stateData" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "requiresRefresh" BOOLEAN NOT NULL DEFAULT false,
    "lastInteractionAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "sessionId" UUID NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "responseText" VARCHAR(4096) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSession_messagingIdentityId_key" ON "ConversationSession"("messagingIdentityId");

-- CreateIndex
CREATE INDEX "ConversationSession_lastInteractionAt_idx" ON "ConversationSession"("lastInteractionAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_eventId_key" ON "ConversationTurn"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_sessionId_sessionVersion_key" ON "ConversationTurn"("sessionId", "sessionVersion");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppEvent_receiptSequence_key" ON "WhatsAppEvent"("receiptSequence");

-- CreateIndex
CREATE INDEX "WhatsAppEvent_streamKey_receiptSequence_state_idx" ON "WhatsAppEvent"("streamKey", "receiptSequence", "state");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_tenantId_categoryId_id_key" ON "MenuItem"("tenantId", "categoryId", "id");

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_messagingIdentityId_fkey" FOREIGN KEY ("messagingIdentityId") REFERENCES "CustomerMessagingIdentity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_selectedTenantId_fkey" FOREIGN KEY ("selectedTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_selectedTenantId_selectedCategoryId_fkey" FOREIGN KEY ("selectedTenantId", "selectedCategoryId") REFERENCES "MenuCategory"("tenantId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_selectedTenantId_selectedCategoryId_se_fkey" FOREIGN KEY ("selectedTenantId", "selectedCategoryId", "selectedMenuItemId") REFERENCES "MenuItem"("tenantId", "categoryId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WhatsAppEvent"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ConversationTurn" ADD CONSTRAINT "ConversationTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Session selections must match the current state; no partial foreign-key contexts.
ALTER TABLE "ConversationSession" ADD CONSTRAINT "ConversationSession_context" CHECK (
  ("state" IN ('IDLE', 'SELECT_TENANT') AND "selectedTenantId" IS NULL AND "selectedCategoryId" IS NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" = 'SELECT_CATEGORY' AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" = 'SELECT_MENU' AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NOT NULL AND "selectedMenuItemId" IS NULL)
  OR ("state" = 'VIEW_MENU_ITEM' AND "selectedTenantId" IS NOT NULL AND "selectedCategoryId" IS NOT NULL AND "selectedMenuItemId" IS NOT NULL)
);
ALTER TABLE "WhatsAppEvent" ADD CONSTRAINT "WhatsAppEvent_conversation_stream" CHECK (
  "processingMode" = 'greeting' OR ("processingMode" = 'conversation' AND "streamKey" IS NOT NULL)
);
