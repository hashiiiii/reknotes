import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  paginateListObjectsV2,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { IStorageProvider } from "../../application/port/storage-provider";

// S3/R2/MinIO でキーが存在しないときの GetObject は例外として返る。
// 「存在しない」は port 契約上 null で表現するため、この種の例外だけを null に変換し、
// それ以外の障害 (権限・ネットワーク等) は握り潰さず伝播させる (silent fallback を避ける)。
export function isObjectNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}

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
    let object: GetObjectCommandOutput;
    try {
      object = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      // キー不在は 500 ではなく「無い (null)」として返す。呼び出し側 (files route) は
      // null を 404 に変換する。それ以外の例外はそのまま投げて 500 にする。
      if (isObjectNotFoundError(err)) return null;
      throw err;
    }
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
