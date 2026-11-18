import { describe, expect, test } from "bun:test";
import { loadConfig } from "../../config";
import { createNoteRepository, createTagRepository } from "../../infrastructure/container";
import { createNote } from "../note/create-note";
import { addTagsToNote } from "./add-tags-to-note";
import { removeOrphanTag } from "./remove-orphan-tag";

const config = loadConfig();
const noteRepository = createNoteRepository(config);
const tagRepository = createTagRepository(config);

describe("tag use cases", () => {
  describe("addTagsToNote", () => {
    test("adds a tag to a note", async () => {
      const note = await createNote(noteRepository, "タグ追加テスト", "本文");
      await addTagsToNote(tagRepository, note.id, ["JavaScript"]);
      const tags = await noteRepository.findTagsByNoteId(note.id);
      expect(tags).toContain("javascript");
    });

    test("normalizes tag names by trimming and lowercasing", async () => {
      const note = await createNote(noteRepository, "正規化テスト", "本文");
      await addTagsToNote(tagRepository, note.id, ["  TypeScript  "]);
      const tags = await noteRepository.findTagsByNoteId(note.id);
      expect(tags).toContain("typescript");
    });

    test("reuses the same tag across notes", async () => {
      const note1 = await createNote(noteRepository, "重複テスト1", "本文");
      const note2 = await createNote(noteRepository, "重複テスト2", "本文");
      await addTagsToNote(tagRepository, note1.id, ["rust"]);
      await addTagsToNote(tagRepository, note2.id, ["rust"]);
      const tags1 = await noteRepository.findTagsByNoteId(note1.id);
      const tags2 = await noteRepository.findTagsByNoteId(note2.id);
      expect(tags1).toContain("rust");
      expect(tags2).toContain("rust");
      // Returning the same tag is insufficient if duplicate rows were also inserted.
      const allTags = await tagRepository.findAll();
      const rustRows = allTags.filter((t) => t.name === "rust");
      expect(rustRows.length).toBe(1);
    });

    test("adds multiple tags together", async () => {
      const note = await createNote(noteRepository, "一括追加テスト", "本文");
      await addTagsToNote(tagRepository, note.id, ["Go", "Docker", "K8s"]);
      const tags = await noteRepository.findTagsByNoteId(note.id);
      expect(tags).toContain("go");
      expect(tags).toContain("docker");
      expect(tags).toContain("k8s");
    });

    test("skips empty and whitespace-only tag names", async () => {
      const note = await createNote(noteRepository, "空タグテスト", "本文");
      await addTagsToNote(tagRepository, note.id, ["valid", "", "  ", "also-valid"]);
      const tags = await noteRepository.findTagsByNoteId(note.id);
      expect(tags).toContain("valid");
      expect(tags).toContain("also-valid");
      expect(tags.length).toBe(2);
    });

    test("accepts an empty tag list", async () => {
      const note = await createNote(noteRepository, "空配列テスト", "本文");
      await addTagsToNote(tagRepository, note.id, []);
      const tags = await noteRepository.findTagsByNoteId(note.id);
      expect(tags.length).toBe(0);
    });
  });

  describe("removeOrphanTag", () => {
    test("deletes tags that no note references", async () => {
      const note = await createNote(noteRepository, "孤立タグテスト", "本文");
      const tagName = `orphan-${Date.now()}`;
      await addTagsToNote(tagRepository, note.id, [tagName]);
      // The tag must be orphaned before cleanup can remove it.
      await tagRepository.unlinkAllByNoteId(note.id);
      await removeOrphanTag(tagRepository, tagName);

      const found = await tagRepository.findByName(tagName);
      expect(found).toBeNull();
    });

    test("preserves tags still referenced by a note", async () => {
      const note = await createNote(noteRepository, "非孤立タグテスト", "本文");
      const tagName = `not-orphan-${Date.now()}`;
      await addTagsToNote(tagRepository, note.id, [tagName]);
      await removeOrphanTag(tagRepository, tagName);

      const found = await tagRepository.findByName(tagName);
      expect(found).not.toBeNull();
    });

    test("accepts a tag name that does not exist", async () => {
      await removeOrphanTag(tagRepository, "nonexistent-tag-xyz");
    });
  });
});
