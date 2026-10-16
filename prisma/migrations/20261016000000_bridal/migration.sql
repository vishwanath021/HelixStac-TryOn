-- Bridal trial fields. IF NOT EXISTS because production already received this SQL by hand.
ALTER TABLE "public"."Lead" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'LOOK';
ALTER TABLE "public"."Lead" ADD COLUMN IF NOT EXISTS "eventName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "public"."Lead" ADD COLUMN IF NOT EXISTS "eventDate" TEXT NOT NULL DEFAULT '';
ALTER TABLE "public"."Tenant" ADD COLUMN IF NOT EXISTS "productBridal" BOOLEAN NOT NULL DEFAULT true;
