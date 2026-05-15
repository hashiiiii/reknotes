import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  paginateListObjectsV2,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
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

  async uploadStream(key: string, body: ReadableStream, contentType: string): Promise<void> {
    // 内部で 5MB チャンクずつ読むので RAM 使用量が一定
    await new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    }).done();
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

  async *list(prefix?: string): AsyncIterable<string> {
    const pages = paginateListObjectsV2({ client: this.s3 }, { Bucket: this.bucket, Prefix: prefix });
    for await (const page of pages) {
      for (const obj of page.Contents ?? []) {
        if (obj.Key) yield obj.Key;
      }
    }
  }
}
