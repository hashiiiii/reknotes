import { describe, expect, test } from "bun:test";
import { noteRepository, tagRepository } from "../../infrastructure/container";
import { createNote } from "../note/create-note";
import { addTagToNote } from "./add-tag-to-note";
import { addTagsToNote } from "./add-tags-to-note";
import { deleteTag } from "./delete-tag";
import { getAllTags } from "./get-all-tags";
import { removeOrphanTag } from "./remove-orphan-tag";

describe("tag use cases", () => {
  describe("addTagToNote", () => {
    test("ノートにタグを追加できる", async () => {
      const note = await createNote(noteRepository, "タグ追加テスト", "本文");
      const tag = await addTagToNote(tagRepository, note.id, "JavaScript");
      expect(tag.id).toBeGreaterThan(0);
      expect(tag.name).toBe("javascript");
    });

    test("タグ名が正規化される（大文字→小文字、前後空白除去）", async () => {
      const note = await createNote(noteRepository, "正規化テスト", "本文");
      const tag = await addTagToNote(tagRepository, note.id, "  TypeScript  ");
      expect(tag.name).toBe("typescript");
    });

    test("同じタグ名で findOrCreate すると同一タグが返る", async () => {
      const note1 = await createNote(noteRepository, "重複テスト1", "本文");
      const note2 = await createNote(noteRepository, "重複テスト2", "本文");
      const tag1 = await addTagToNote(tagRepository, note1.id, "rust");
      const tag2 = await addTagToNote(tagRepository, note2.id, "rust");
      expect(tag1.id).toBe(tag2.id);
    });
  });

  describe("addTagsToNote", () => {
    test("複数タグを一括追加できる", async () => {
      const note = await createNote(noteRepository, "一括追加テスト", "本文");
      await addTagsToNote(tagRepository, note.id, ["Go", "Docker", "K8s"]);
      const tags = await noteRepository.findTagsByNoteId(note.id);
      expect(tags).toContain("go");
      expect(tags).toContain("docker");
      expect(tags).toContain("k8s");
    });

    test("空文字やスペースのみのタグ名はスキップされる", async () => {
      const note = await createNote(noteRepository, "空タグテスト", "本文");
      await addTagsToNote(tagRepository, note.id, ["valid", "", "  ", "also-valid"]);
      const tags = await noteRepository.findTagsByNoteId(note.id);
      expect(tags).toContain("valid");
      expect(tags).toContain("also-valid");
      expect(tags.length).toBe(2);
    });

    test("空配列を渡してもエラーにならない", async () => {
      const note = await createNote(noteRepository, "空配列テスト", "本文");
      await addTagsToNote(tagRepository, note.id, []);
      const tags = await noteRepository.findTagsByNoteId(note.id);
      expect(tags.length).toBe(0);
    });
  });

  describe("getAllTags", () => {
    test("タグ一覧をノート数付きで取得できる", async () => {
      const note1 = await createNote(noteRepository, "一覧テスト1", "本文");
      const note2 = await createNote(noteRepository, "一覧テスト2", "本文");
      const tagName = `unique-tag-${Date.now()}`;
      await addTagsToNote(tagRepository, note1.id, [tagName]);
      await addTagsToNote(tagRepository, note2.id, [tagName]);

      const allTags = await getAllTags(tagRepository);
      const found = allTags.find((t) => t.name === tagName);
      expect(found).not.toBeUndefined();
      expect(Number(found?.count)).toBe(2);
    });
  });

  describe("deleteTag", () => {
    test("タグをIDで削除できる", async () => {
      const note = await createNote(noteRepository, "削除テスト", "本文");
      const tag = await addTagToNote(tagRepository, note.id, `del-${Date.now()}`);
      expect(await deleteTag(tagRepository, tag.id)).toBe(true);
    });

    test("存在しないIDはfalseを返す", async () => {
      expect(await deleteTag(tagRepository, 99999)).toBe(false);
    });
  });

  describe("removeOrphanTag", () => {
    test("ノートに紐づかない孤立タグが削除される", async () => {
      const note = await createNote(noteRepository, "孤立タグテスト", "本文");
      const tagName = `orphan-${Date.now()}`;
      await addTagToNote(tagRepository, note.id, tagName);
      // タグとノートの紐付けを解除して孤立させる
      await tagRepository.clearByNoteId(note.id);
      await removeOrphanTag(tagRepository, tagName);

      const found = await tagRepository.findByName(tagName);
      expect(found).toBeNull();
    });

    test("ノートに紐づいているタグは削除されない", async () => {
      const note = await createNote(noteRepository, "非孤立タグテスト", "本文");
      const tagName = `not-orphan-${Date.now()}`;
      await addTagToNote(tagRepository, note.id, tagName);
      await removeOrphanTag(tagRepository, tagName);

      const found = await tagRepository.findByName(tagName);
      expect(found).not.toBeNull();
    });

    test("存在しないタグ名でもエラーにならない", async () => {
      await removeOrphanTag(tagRepository, "nonexistent-tag-xyz");
      // エラーが発生しなければOK
    });
  });
});
