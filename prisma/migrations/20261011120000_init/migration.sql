-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#0E7C74',
    "accentColor" TEXT NOT NULL DEFAULT '#E9897A',
    "languages" TEXT NOT NULL DEFAULT '["en","hi"]',
    "defaultLang" TEXT NOT NULL DEFAULT 'en',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "mapsUrl" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'STARTER',
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "removeBranding" BOOLEAN NOT NULL DEFAULT false,
    "allowedOrigins" TEXT NOT NULL DEFAULT '[]',
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "dailyCap" INTEGER NOT NULL DEFAULT 100,
    "showMen" BOOLEAN NOT NULL DEFAULT true,
    "showWomen" BOOLEAN NOT NULL DEFAULT true,
    "showKids" BOOLEAN NOT NULL DEFAULT true,
    "toolColour" BOOLEAN NOT NULL DEFAULT true,
    "toolStyle" BOOLEAN NOT NULL DEFAULT true,
    "toolBrows" BOOLEAN NOT NULL DEFAULT true,
    "toolBeard" BOOLEAN NOT NULL DEFAULT true,
    "toolNails" BOOLEAN NOT NULL DEFAULT true,
    "hairPickerOn" BOOLEAN NOT NULL DEFAULT true,
    "hairSuggestOn" BOOLEAN NOT NULL DEFAULT false,
    "hairSuggestUsesCredits" BOOLEAN NOT NULL DEFAULT false,
    "anonDailyCap" INTEGER NOT NULL DEFAULT 8,
    "memberDailyCap" INTEGER NOT NULL DEFAULT 30,
    "requireLoginToBook" BOOLEAN NOT NULL DEFAULT false,
    "salonNonce" TEXT NOT NULL DEFAULT '',
    "aiProvider" TEXT NOT NULL DEFAULT '',
    "aiKeyCipher" TEXT NOT NULL DEFAULT '',
    "aiKeyHint" TEXT NOT NULL DEFAULT '',
    "aiTier" TEXT NOT NULL DEFAULT '',
    "hairstyleEngine" TEXT NOT NULL DEFAULT '',
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Domain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Outlet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "mapsUrl" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Service" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameI18n" TEXT NOT NULL DEFAULT '{}',
    "priceInr" INTEGER NOT NULL,
    "durationMin" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantStyle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "customName" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "serviceIds" TEXT NOT NULL DEFAULT '[]',
    "suitabilityJson" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TenantStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantShade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shadeId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "serviceIds" TEXT NOT NULL DEFAULT '[]',

    CONSTRAINT "TenantShade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConsentLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "textHash" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "ageGate" BOOLEAN NOT NULL DEFAULT false,
    "uaHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TryOn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "styleId" TEXT,
    "shadeId" TEXT,
    "kind" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'anon',
    "actorKey" TEXT NOT NULL DEFAULT '',
    "quality" TEXT NOT NULL DEFAULT 'standard',
    "provider" TEXT,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "costMicroUsd" INTEGER,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TryOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CreditLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Lead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "lookName" TEXT NOT NULL,
    "shadeName" TEXT,
    "services" TEXT NOT NULL DEFAULT '[]',
    "lang" TEXT NOT NULL DEFAULT 'en',
    "src" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "externalId" TEXT,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DataRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "sessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "amountExGst" INTEGER NOT NULL,
    "gstInr" INTEGER NOT NULL,
    "totalInr" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MagicLink" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."AiCall" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "estimatePaise" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'CHARGED',
    "tool" TEXT NOT NULL DEFAULT '',
    "tier" TEXT NOT NULL DEFAULT '',
    "imageSize" TEXT NOT NULL DEFAULT '',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "usageJson" TEXT NOT NULL DEFAULT '',
    "costUsdMicros" INTEGER NOT NULL DEFAULT 0,
    "costInrPaise" INTEGER NOT NULL DEFAULT 0,
    "charged" BOOLEAN NOT NULL DEFAULT false,
    "billed" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "costSource" TEXT NOT NULL DEFAULT 'estimate',
    "providerRequestId" TEXT NOT NULL DEFAULT '',
    "costNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HairSuggest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "photoHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL DEFAULT '',
    "callId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HairSuggest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GenerationJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "demoReason" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "imagePath" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "callId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BenchmarkRun" (
    "id" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "estimateInr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimateUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualInr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "imageTokens" INTEGER NOT NULL DEFAULT 0,
    "textTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "clothingWarning" TEXT NOT NULL DEFAULT '',
    "callId" TEXT NOT NULL DEFAULT '',
    "dir" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'benchmark',
    "message" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "dob" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT '',
    "hairLength" TEXT NOT NULL DEFAULT '',
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GuestPerson" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "hairLength" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GuestPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OtpChallenge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "lookName" TEXT NOT NULL DEFAULT '',
    "lookId" TEXT NOT NULL DEFAULT '',
    "tool" TEXT NOT NULL DEFAULT '',
    "services" TEXT NOT NULL DEFAULT '[]',
    "preferredAt" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SavedLook" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "lookId" TEXT NOT NULL,
    "lookName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedLook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RateBucket" (
    "id" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordReset" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "public"."Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_host_key" ON "public"."Domain"("host");

-- CreateIndex
CREATE INDEX "Domain_tenantId_idx" ON "public"."Domain"("tenantId");

-- CreateIndex
CREATE INDEX "Outlet_tenantId_idx" ON "public"."Outlet"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "Membership_tenantId_idx" ON "public"."Membership"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "public"."Membership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "Service_tenantId_idx" ON "public"."Service"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Service_tenantId_key_key" ON "public"."Service"("tenantId", "key");

-- CreateIndex
CREATE INDEX "TenantStyle_tenantId_idx" ON "public"."TenantStyle"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantStyle_tenantId_styleId_key" ON "public"."TenantStyle"("tenantId", "styleId");

-- CreateIndex
CREATE INDEX "TenantShade_tenantId_idx" ON "public"."TenantShade"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantShade_tenantId_shadeId_key" ON "public"."TenantShade"("tenantId", "shadeId");

-- CreateIndex
CREATE INDEX "ConsentLog_tenantId_createdAt_idx" ON "public"."ConsentLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentLog_sessionId_idx" ON "public"."ConsentLog"("sessionId");

-- CreateIndex
CREATE INDEX "TryOn_tenantId_createdAt_idx" ON "public"."TryOn"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "TryOn_tenantId_status_idx" ON "public"."TryOn"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TryOn_tenantId_actorKey_createdAt_idx" ON "public"."TryOn"("tenantId", "actorKey", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_tenantId_createdAt_idx" ON "public"."CreditLedger"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_tenantId_refId_idx" ON "public"."CreditLedger"("tenantId", "refId");

-- CreateIndex
CREATE INDEX "Lead_tenantId_createdAt_idx" ON "public"."Lead"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_name_createdAt_idx" ON "public"."UsageEvent"("tenantId", "name", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "public"."Subscription"("tenantId");

-- CreateIndex
CREATE INDEX "DataRequest_tenantId_createdAt_idx" ON "public"."DataRequest"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "public"."Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "public"."Invoice"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLink_tokenHash_key" ON "public"."MagicLink"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLink_email_idx" ON "public"."MagicLink"("email");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiCall_status_createdAt_idx" ON "public"."AiCall"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AiCall_createdAt_idx" ON "public"."AiCall"("createdAt");

-- CreateIndex
CREATE INDEX "HairSuggest_tenantId_idx" ON "public"."HairSuggest"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HairSuggest_tenantId_photoHash_key" ON "public"."HairSuggest"("tenantId", "photoHash");

-- CreateIndex
CREATE INDEX "GenerationJob_expiresAt_idx" ON "public"."GenerationJob"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_tenantId_requestId_key" ON "public"."GenerationJob"("tenantId", "requestId");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "public"."Customer"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "public"."Customer"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "GuestPerson_customerId_idx" ON "public"."GuestPerson"("customerId");

-- CreateIndex
CREATE INDEX "OtpChallenge_tenantId_phone_idx" ON "public"."OtpChallenge"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Booking_tenantId_createdAt_idx" ON "public"."Booking"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "public"."Booking"("customerId");

-- CreateIndex
CREATE INDEX "SavedLook_customerId_idx" ON "public"."SavedLook"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "public"."PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_email_idx" ON "public"."PasswordReset"("email");

-- AddForeignKey
ALTER TABLE "public"."Domain" ADD CONSTRAINT "Domain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Outlet" ADD CONSTRAINT "Outlet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantStyle" ADD CONSTRAINT "TenantStyle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantShade" ADD CONSTRAINT "TenantShade_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConsentLog" ADD CONSTRAINT "ConsentLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TryOn" ADD CONSTRAINT "TryOn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CreditLedger" ADD CONSTRAINT "CreditLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Lead" ADD CONSTRAINT "Lead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UsageEvent" ADD CONSTRAINT "UsageEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataRequest" ADD CONSTRAINT "DataRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GuestPerson" ADD CONSTRAINT "GuestPerson_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavedLook" ADD CONSTRAINT "SavedLook_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

