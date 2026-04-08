import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  NotFound,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { IStorageProvider } from "../../application/port/storage-provider";

export class S3StorageProvider implements IStorageProvider {
  constructor(
    private s3: S3Client,
    private bucket: string,
  ) {}

  async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err) {
      if (err instanceof NotFound) {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        return;
      }
      throw err;
    }
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

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
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
