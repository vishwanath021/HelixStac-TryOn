-- Change the defaults for new salons. Existing primaryColor and accentColor values stay as stored.
ALTER TABLE "public"."Tenant" ALTER COLUMN "primaryColor" SET DEFAULT '#69517D';
ALTER TABLE "public"."Tenant" ALTER COLUMN "accentColor" SET DEFAULT '#B6A0C9';
