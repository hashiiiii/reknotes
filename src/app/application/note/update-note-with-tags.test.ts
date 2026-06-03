import { describe, expect, mock, test } from "bun:test";
import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import type { IStorageProvider } from "../port/storage-provider";
import { updateNoteWithTags } from "./update-note-with-tags";

// 更新で参照が外れた画像 (orphan) を S3 から消すことだけを検証するテスト。
// suggestTags / addTagsToNote の経路は負の類似度で抑止し (下記の embedding mock 参照)、
// タグ生成のノイズを排除して storageProvider.delete の呼び出しだけを観測する。

function makeNote(id: number, body: string): Note {
  return { id, title: "t", body, createdAt: 0, updatedAt: 0 };
}

// embedNote と embedTag に逆向きベクトルを返させ、全候補のスコアを負にする。
// suggestTags の相対閾値 (score >= maxScore * 0.5) は maxScore が負だと全候補を弾くため、
// タグが一つも生成されず addTagsToNote が走らない。これで findOrCreateMany 等の stub が不要になる。
function makeEmbeddingProvider(): IEmbeddingProvider {
  return {
    load: async () => {},
    embedNote: async () => new Float32Array([1, 0]),
    embedTag: async () => new Float32Array([-1, 0]),
    buildTagCache: async () => {},
  };
}

function makeNoteRepo(oldBody: string, newBody: string): INoteRepository {
  return {
    findById: async (id: number) => makeNote(id, oldBody),
    update: async (id: number) => makeNote(id, newBody),
  } as unknown as INoteRepository;
}

function makeTagRepo(): ITagRepository {
  return {
    unlinkAllByNoteId: async () => {},
    findAll: async () => [],
  } as unknown as ITagRepository;
}

describe("updateNoteWithTags のファイルクリーンアップ", () => {
  test("旧本文にあって新本文にないキーは削除される", async () => {
    const noteRepo = makeNoteRepo("![](/api/files/old.png)", "![](/api/files/new.png)");
    const tagRepo = makeTagRepo();
    const embeddingProvider = makeEmbeddingProvider();
    const deleteSpy = mock((_key: string) => Promise.resolve());
    const storageProvider = { delete: deleteSpy } as unknown as IStorageProvider;

    await updateNoteWithTags(noteRepo, tagRepo, embeddingProvider, storageProvider, 1, "t", "![](/api/files/new.png)");

    expect(deleteSpy).toHaveBeenCalledWith("old.png");
    expect(deleteSpy).not.toHaveBeenCalledWith("new.png");
  });

  test("旧本文と新本文が同じキーを参照する場合は削除しない", async () => {
    const noteRepo = makeNoteRepo("![](/api/files/keep.png)", "![](/api/files/keep.png)");
    const tagRepo = makeTagRepo();
    const embeddingProvider = makeEmbeddingProvider();
    const deleteSpy = mock((_key: string) => Promise.resolve());
    const storageProvider = { delete: deleteSpy } as unknown as IStorageProvider;

    await updateNoteWithTags(noteRepo, tagRepo, embeddingProvider, storageProvider, 1, "t", "![](/api/files/keep.png)");

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
