import type { IStorageProvider } from "../port/storage-provider";
import { isAllowedContentType } from "./_allowed-types";
import { buildFileMarkdown, buildFileUrl } from "./_file-url";

const MAX_SIZE = 50 * 1024 * 1024;

export interface UploadResult {
  url: string;
  markdown: string;
  filename: string;
}

export type UploadOutcome = { ok: true; result: UploadResult } | { ok: false; error: string };

export async function uploadFile(storageProvider: IStorageProvider, file: File): Promise<UploadOutcome> {
  if (!isAllowedContentType(file.type)) {
    return { ok: false, error: "対応していないファイル形式です" };
  }
  if (file.size > MAX_SIZE) {
    return { ok: false, error: "ファイルサイズが大きすぎます（上限50MB）" };
  }

  const ext = file.name.split(".").pop() || "bin";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = new Uint8Array(await file.arrayBuffer());
  await storageProvider.upload(filename, buffer, file.type);

  return {
    ok: true,
    result: {
      url: buildFileUrl(filename),
      markdown: buildFileMarkdown({ filename, originalName: file.name, contentType: file.type }),
      filename,
    },
  };
}
