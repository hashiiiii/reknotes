import { describe, expect, test } from "bun:test";
import { noteRepository, tagRepository } from "../../infrastructure/container";
import { createNote } from "../note/create-note";
import { addTagToNote } from "./add-tag-to-note";
import { addTagsToNote } from "./add-tags-to-note";
import { deleteTag } from "./delete-tag";
import { getAllTags } from "./get-all-tags";
import { removeOrphanTag } from "./remove-orphan-tag";

describe("tag use cases", () => {
  test("addTagToNote でタグを追加できる", async () => {
    const note = await createNote(noteRepository, "タグテスト", "本文");
    const tag = await addTagToNote(tagRepository, note.id, "TestTag");
    expect(tag.name).toBe("testtag"); // normalized to lowercase
    const noteTags = await noteRepository.findTagsByNoteId(note.id);
    expect(noteTags).toContain("testtag");
  });

  test("addTagsToNote で複数タグを一括追加できる", async () => {
    const note = await createNote(noteRepository, "複数タグ", "本文");
    await addTagsToNote(tagRepository, note.id, ["Rust", "Go", "TypeScript"]);
    const tags = await noteRepository.findTagsByNoteId(note.id);
    expect(tags).toContain("rust");
    expect(tags).toContain("go");
    expect(tags).toContain("typescript");
  });

  test("addTagsToNote は空文字タグをスキップする", async () => {
    const note = await createNote(noteRepository, "空タグ", "本文");
    await addTagsToNote(tagRepository, note.id, ["valid", "", "  "]);
    const tags = await noteRepository.findTagsByNoteId(note.id);
    expect(tags).toContain("valid");
    expect(tags.length).toBe(1);
  });

  test("getAllTags でタグとカウントを取得できる", async () => {
    const note1 = await createNote(noteRepository, "カウント1", "本文");
    const note2 = await createNote(noteRepository, "カウント2", "本文");
    const uniqueTag = `count-test-${Date.now()}`;
    await addTagToNote(tagRepository, note1.id, uniqueTag);
    await addTagToNote(tagRepository, note2.id, uniqueTag);
    const allTags = await getAllTags(tagRepository);
    const found = allTags.find((t) => t.name === uniqueTag);
    expect(found).toBeDefined();
    expect(found!.count).toBe(2);
  });

  test("deleteTag で存在するタグを削除できる", async () => {
    const note = await createNote(noteRepository, "削除タグ", "本文");
    const tag = await addTagToNote(tagRepository, note.id, `del-${Date.now()}`);
    const result = await deleteTag(tagRepository, tag.id);
    expect(result).toBe(true);
  });

  test("deleteTag で存在しないIDはfalseを返す", async () => {
    const result = await deleteTag(tagRepository, 99999);
    expect(result).toBe(false);
  });

  test("removeOrphanTag はノートに紐づかないタグを削除する", async () => {
    const note = await createNote(noteRepository, "孤立タグ", "本文");
    const tagName = `orphan-${Date.now()}`;
    await addTagToNote(tagRepository, note.id, tagName);
    // タグのリンクを解除
    await tagRepository.clearByNoteId(note.id);
    // 孤立タグを削除
    await removeOrphanTag(tagRepository, tagName);
    const found = await tagRepository.findByName(tagName);
    expect(found).toBeNull();
  });

  test("removeOrphanTag はノートに紐づくタグを削除しない", async () => {
    const note = await createNote(noteRepository, "紐付きタグ", "本文");
    const tagName = `linked-${Date.now()}`;
    await addTagToNote(tagRepository, note.id, tagName);
    await removeOrphanTag(tagRepository, tagName);
    const found = await tagRepository.findByName(tagName);
    expect(found).not.toBeNull();
  });
});
