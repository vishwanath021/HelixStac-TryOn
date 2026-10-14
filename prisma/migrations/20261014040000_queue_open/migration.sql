ALTER TABLE "public"."QueueState" ALTER COLUMN "isOpen" SET DEFAULT true;

UPDATE "public"."QueueState" AS queue
SET "isOpen" = true
FROM "public"."Tenant" AS tenant
WHERE queue."tenantId" = tenant."id"
  AND tenant."productQueue" = true;
