import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function client() {
  const region = process.env.S3_REGION || "auto";
  return new S3Client({
    region,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
  });
}

function bucket() {
  const name = process.env.S3_BUCKET || "";
  if (!name) throw new Error("S3_BUCKET is required");
  return name;
}

export async function s3Put(key: string, body: Buffer, contentType: string) {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function s3Get(key: string): Promise<Buffer | null> {
  try {
    const out = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const bytes = await out.Body?.transformToByteArray();
    return bytes ? Buffer.from(bytes) : null;
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw error;
  }
}

export async function s3Delete(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })).catch(() => undefined);
}

export async function s3SignedGet(key: string, ttlSeconds: number) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: ttlSeconds });
}
