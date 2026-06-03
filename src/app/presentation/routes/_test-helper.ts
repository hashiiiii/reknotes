import { mock } from "bun:test";
import { createApp } from "../..";
import type { IEmbeddingProvider } from "../../application/port/embedding-provider";
import type { IStorageProvider } from "../../application/port/storage-provider";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";

// route テスト用に Hono アプリを mock provider で組み立てるハーネス。
// DB / S3 / embedding には一切触れず、HTTP -> ルーティング -> テンプレート描画だけを検証する。

// このテストでスタブしていないメソッドが呼ばれたら、黙って通さず例外にする。
// silent fallback で「実は別経路を叩いていた」を見逃さないため。
function notStubbed<T extends object>(label: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      return () => {
        throw new Error(`${label}.${String(prop)} はこのテストでスタブされていません`);
      };
    },
  });
}

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    title: "タイトル",
    body: "本文",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

export interface TestAppOptions {
  // GET / と GET /api/notes の一覧が返すノート
  notes?: Note[];
  // searchByQuery が返す行 (検索ハイライトの素材)
  searchResults?: Note[];
}

export function createTestApp(options: TestAppOptions = {}) {
  const notes = options.notes ?? [];
  const searchResults = options.searchResults ?? [];

  const noteRepository: INoteRepository = {
    list: async () => ({ notes, hasMore: false }),
    findTagsByNoteIds: async () => new Map<number, string[]>(),
    searchByQuery: async () => searchResults,
    create: async () => {
      throw new Error("create はこのテストで未対応");
    },
    findById: async () => null,
    update: async () => null,
    delete: async () => false,
    deleteAll: async () => {},
    findTagsByNoteId: async () => [],
  };

  // upload が呼ばれたかを検証できるよう spy にする (SVG は配信前に弾かれる想定)。
  const storageUpload = mock(async (_key: string, _buffer: Uint8Array, _contentType: string): Promise<void> => {});
  const storageProvider: IStorageProvider = {
    upload: storageUpload,
    uploadStream: async () => {},
    get: async () => null,
    delete: async () => {},
    list: async function* () {},
  };

  const app = createApp(
    noteRepository,
    notStubbed<ITagRepository>("tagRepository"),
    notStubbed<IGraphRepository>("graphRepository"),
    storageProvider,
    notStubbed<IEmbeddingProvider>("embeddingProvider"),
  );

  return { app, storageUpload };
}
