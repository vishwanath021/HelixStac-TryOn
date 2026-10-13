-- AlterTable
ALTER TABLE "public"."Tenant" ADD COLUMN "productTryOn" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "public"."Tenant" ADD COLUMN "productQueue" BOOLEAN NOT NULL DEFAULT false;
