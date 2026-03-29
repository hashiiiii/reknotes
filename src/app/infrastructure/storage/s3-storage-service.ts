import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { IStorageService } from "../../domain/storage/storage-service";

export class S3StorageService implements IStorageService {
  private s3: S3Client;
  private bucket: string;

  constructor() {
    if (!process.env.R2_ENDPOINT) throw new Error("R2_ENDPOINT is not set");
    this.bucket = process.env.R2_BUCKET_NAME ?? "";
    this.s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
      forcePathStyle: true,
    });
  }

  async upload(key: string, buffer: Uint8Array, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
    const object = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
    if (!object.Body) return null;
    return {
      body: object.Body.transformToWebStream(),
      contentType: object.ContentType ?? "application/octet-stream",
    };
  }
}
