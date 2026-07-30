import { describe, expect, test } from "bun:test";
import { loadConfig } from "../../config";
import { createNoteRepository, createStorageProvider, createTagRepository } from "../../infrastructure/container";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { finishNoteProcessing, markNoteProcessing } from "./_processing-notes";
import { createNote } from "./create-note";
import { deleteNote } from "./delete-note";
import { downloadNote } from "./download-note";
import { getNote } from "./get-note";
import { getNoteTags } from "./get-note-tags";
import { isNoteProcessing } from "./is-note-processing";
import { updateNote } from "./update-note";
import { updateNoteWithTags } from "./update-note-with-tags";

// embedNote と embedTag に逆向きベクトルを返させ、suggestTags の相対閾値で全候補を落とす。
// これで更新後はタグが一つも付かず、「旧タグが全て外れた」状態を決定的に作れる。
const noTagEmbeddingProvider: IEmbeddingProvider = {
  load: async () => {},
  embedNote: async () => new Float32Array([1, 0]),
  embedTag: async () => new Float32Array([-1, 0]),
  buildTagCache: async () => {},
};

const config = loadConfig();
const noteRepository = createNoteRepository(config);
const tagRepository = createTagRepository(config);
const storageProvider = createStorageProvider(config);

describe("note use cases", () => {
  test("createNote でノートを作成できる", async () => {
    const note = await createNote(noteRepository, "テストタイトル", "テスト本文");
    expect(note.id).toBeGreaterThan(0);
    expect(note.title).toBe("テストタイトル");
    expect(note.body).toBe("テスト本文");
  });

  test("タイトル空欄なら本文先頭30文字が自動タイトルになる", async () => {
    const note = await createNote(
      noteRepository,
      "",
      "これは自動タイトルのテストです。本文が長い場合は切り詰められます。",
    );
    expect(note.title).toBe("これは自動タイトルのテストです。本文が長い場合は切り詰められ");
  });

  test("getNote で取得できる", async () => {
    const created = await createNote(noteRepository, "取得テスト", "本文");
    const fetched = await getNote(noteRepository, created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.title).toBe("取得テスト");
  });

  test("存在しないIDはnullを返す", async () => {
    expect(await getNote(noteRepository, 99999)).toBeNull();
  });

  test("updateNote でノートを更新できる", async () => {
    const note = await createNote(noteRepository, "更新前", "本文");
    const updated = await updateNote(noteRepository, note.id, "更新後", "新しい本文");
    expect(updated).not.toBeNull();
    expect(updated?.title).toBe("更新後");
    expect(updated?.body).toBe("新しい本文");
  });

  test("deleteNote でノートを削除できる", async () => {
    const note = await createNote(noteRepository, "削除対象", "本文");
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe(true);
    expect(await getNote(noteRepository, note.id)).toBeNull();
  });

  test("deleteNote で存在しないIDはfalseを返す", async () => {
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, 99999)).toBe(false);
  });

  test("listNotes でページネーションが動作する", async () => {
    const result = await noteRepository.list();
    expect(result.notes.length).toBeGreaterThan(0);
    expect(typeof result.hasMore).toBe("boolean");
  });

  test("downloadNote で本文とサニタイズ済みファイル名が返る", async () => {
    const note = await createNote(noteRepository, "設計/実装メモ", "# 本文\n\nそのまま返ること。");
    const result = await downloadNote(noteRepository, note.id);
    expect(result).not.toBeNull();
    // ファイル名の "/" はファイルシステムで使えないので "-" に置換される
    expect(result?.filename).toBe("設計-実装メモ.md");
    expect(result?.body).toBe("# 本文\n\nそのまま返ること。");
  });

  test("downloadNote で存在しないIDはnullを返す", async () => {
    expect(await downloadNote(noteRepository, 99999)).toBeNull();
  });

  test("processing レジストリで処理中のノートを追跡できる", () => {
    // バックグラウンドのタグ付けが走っている間だけ true になる in-memory の印
    expect(isNoteProcessing(123)).toBe(false);
    markNoteProcessing(123);
    expect(isNoteProcessing(123)).toBe(true);
    finishNoteProcessing(123);
    expect(isNoteProcessing(123)).toBe(false);
  });

  test("処理中のノートは deleteNote が processing を返す", async () => {
    // バックグラウンドのタグ再生成と削除が競合しないよう、処理中の削除は拒否される
    const note = await createNote(noteRepository, "処理中削除ガード", "本文");
    markNoteProcessing(note.id);
    try {
      expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe("processing");
      // 拒否された削除は DB に触れていない
      expect(await getNote(noteRepository, note.id)).not.toBeNull();
    } finally {
      finishNoteProcessing(note.id);
    }
    // 解除後は通常どおり削除できる
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe(true);
  });

  test("タグの追加と取得ができる", async () => {
    const note = await createNote(noteRepository, "タグテスト", "本文");
    await addTagsToNote(tagRepository, note.id, ["TypeScript", "テスト"]);
    const tags = await getNoteTags(noteRepository, note.id);
    expect(tags).toContain("typescript");
    expect(tags).toContain("テスト");
  });

  test("updateNoteWithTags で外れた旧タグはどのノートからも参照されなければ削除される", async () => {
    // 削除時 (deleteNote) と同様に、更新で外れたタグも orphan なら tags テーブルから消えること
    const note = await createNote(noteRepository, "orphan 掃除テスト", "本文");
    await addTagsToNote(tagRepository, note.id, ["編集前だけのタグ"]);

    await updateNoteWithTags(
      noteRepository,
      tagRepository,
      noTagEmbeddingProvider,
      storageProvider,
      note.id,
      "更新後",
      "新しい本文",
    );
    // タグ再生成はバックグラウンドに移ったので、完了を待ってから最終状態を観測する
    while (isNoteProcessing(note.id)) await Bun.sleep(1);

    expect(await getNoteTags(noteRepository, note.id)).toEqual([]);
    expect(await tagRepository.findByName("編集前だけのタグ")).toBeNull();
  });

  test("updateNoteWithTags で外れた旧タグでも他ノートが使っていれば残る", async () => {
    const edited = await createNote(noteRepository, "編集するノート", "本文");
    const other = await createNote(noteRepository, "使い続けるノート", "本文");
    await addTagsToNote(tagRepository, edited.id, ["共有中のタグ"]);
    await addTagsToNote(tagRepository, other.id, ["共有中のタグ"]);

    await updateNoteWithTags(
      noteRepository,
      tagRepository,
      noTagEmbeddingProvider,
      storageProvider,
      edited.id,
      "更新後",
      "新しい本文",
    );
    // タグ再生成はバックグラウンドに移ったので、完了を待ってから最終状態を観測する
    while (isNoteProcessing(edited.id)) await Bun.sleep(1);

    expect(await getNoteTags(noteRepository, edited.id)).toEqual([]);
    expect(await tagRepository.findByName("共有中のタグ")).not.toBeNull();
  });
});
