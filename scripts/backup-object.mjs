import { readFile, writeFile } from "node:fs/promises";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const mode = process.argv[2];
const file = process.argv[3];
const key = process.argv[4];
if ((mode !== "put" && mode !== "get") || !file || !key) {
  console.error("usage: node scripts/backup-object.mjs put|get <local-file> <object-key>");
  process.exit(1);
}
const bucket = process.env.S3_BUCKET || "";
if (!bucket || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY) {
  console.error("Set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.");
  process.exit(1);
}
const client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  },
});
if (mode === "put") {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: await readFile(file), ContentType: "application/octet-stream" }));
  console.log(`Uploaded ${key}`);
} else {
  const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await out.Body?.transformToByteArray();
  if (!bytes) {
    console.error("Object was empty.");
    process.exit(1);
  }
  await writeFile(file, bytes);
  console.log(`Downloaded ${key}`);
}
