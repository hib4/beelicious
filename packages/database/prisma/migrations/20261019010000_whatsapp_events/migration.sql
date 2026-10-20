CREATE TABLE "WhatsAppEvent" (
    "id" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "outboundMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WhatsAppEvent_kind_check" CHECK ("kind" IN ('message', 'status')),
    CONSTRAINT "WhatsAppEvent_state_check" CHECK ("state" IN ('pending', 'processing', 'sending', 'completed', 'ignored', 'failed', 'uncertain')),
    CONSTRAINT "WhatsAppEvent_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "WhatsAppEvent_dedupKey_key" ON "WhatsAppEvent"("dedupKey");
CREATE INDEX "WhatsAppEvent_state_availableAt_idx" ON "WhatsAppEvent"("state", "availableAt");
CREATE INDEX "WhatsAppEvent_state_leaseUntil_idx" ON "WhatsAppEvent"("state", "leaseUntil");
