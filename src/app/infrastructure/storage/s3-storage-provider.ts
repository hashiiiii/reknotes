import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { IStorageProvider } from "../../application/port/storage-provider";

export class S3StorageProvider implements IStorageProvider {
  constructor(
    private s3: S3Client,
    private bucket: string,
  ) {}

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

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async get(key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
    try {
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
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "NoSuchKey") {
        return null;
      }
      throw error;
    }
  }
}
