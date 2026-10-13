-- CreateTable
CREATE TABLE "public"."QueueState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "units" INTEGER NOT NULL DEFAULT 1,
    "unitLabel" TEXT NOT NULL DEFAULT 'chair',
    "avgMinutes" INTEGER NOT NULL DEFAULT 20,
    "alertLeadMin" INTEGER NOT NULL DEFAULT 5,
    "mode" TEXT NOT NULL DEFAULT 'LIVE',

    CONSTRAINT "QueueState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QueueEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "token" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "serviceId" TEXT,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "unitSlot" INTEGER,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "requestedDate" TEXT NOT NULL DEFAULT '',
    "requestedSlot" TEXT NOT NULL DEFAULT '',
    "alertSentAt" TIMESTAMP(3),
    "cancelToken" TEXT NOT NULL,
    "onTheWay" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueState_tenantId_key" ON "public"."QueueState"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_cancelToken_key" ON "public"."QueueEntry"("cancelToken");

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_tenantId_dayKey_token_key" ON "public"."QueueEntry"("tenantId", "dayKey", "token");

-- CreateIndex
CREATE INDEX "QueueEntry_tenantId_dayKey_status_idx" ON "public"."QueueEntry"("tenantId", "dayKey", "status");

-- CreateIndex
CREATE INDEX "QueueEntry_tenantId_phone_idx" ON "public"."QueueEntry"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "QueueEntry_joinedAt_idx" ON "public"."QueueEntry"("joinedAt");

-- AddForeignKey
ALTER TABLE "public"."QueueState" ADD CONSTRAINT "QueueState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QueueEntry" ADD CONSTRAINT "QueueEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."QueueEntry" ADD CONSTRAINT "QueueEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
