-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN "totpSecretCipher" TEXT NOT NULL DEFAULT '';
ALTER TABLE "public"."User" ADD COLUMN "totpPendingCipher" TEXT NOT NULL DEFAULT '';
ALTER TABLE "public"."User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."User" ADD COLUMN "recoveryCodeHashes" TEXT NOT NULL DEFAULT '[]';
