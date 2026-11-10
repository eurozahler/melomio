import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageProvider } from "./index";
import { assertSafeKey } from "./keys";

/**
 * Dateispeicher im Livebetrieb: Hetzner Object Storage (S3-kompatibel, Rechenzentrum in Deutschland).
 * Der Bucket ist privat; ausgeliefert wird ausschließlich über unsere geprüften Server-Routen.
 */
export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

type Sender = Pick<S3Client, "send">;

export function createS3Storage(config: S3Config, client?: Sender): StorageProvider {
  const s3: Sender =
    client ??
    new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: false,
    });
  return {
    name: "s3",
    async putFile(key, sourceFile) {
      assertSafeKey(key);
      const { size } = await stat(sourceFile);
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: createReadStream(sourceFile),
          ContentLength: size,
        }),
      );
    },
    async open(key) {
      assertSafeKey(key);
      try {
        const res = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        if (!res.Body) return null;
        const body = res.Body as Readable | { transformToWebStream(): ReadableStream<Uint8Array> };
        const stream =
          "transformToWebStream" in body
            ? body.transformToWebStream()
            : (Readable.toWeb(body as Readable) as ReadableStream<Uint8Array>);
        return { size: Number(res.ContentLength ?? 0), stream };
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === "NoSuchKey" || name === "NotFound") return null;
        throw error;
      }
    },
    async delete(key) {
      assertSafeKey(key);
      await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
