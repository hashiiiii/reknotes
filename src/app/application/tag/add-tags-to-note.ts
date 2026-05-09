import { normalizeTagName } from "../../domain/tag/tag";
import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function addTagsToNote(tagRepo: ITagRepository, noteId: number, tagNames: string[]) {
  const unique = Array.from(new Set(tagNames.map((n) => normalizeTagName(n)).filter((n) => n.length > 0)));
  if (unique.length === 0) return;
  const tags = await tagRepo.findOrCreateMany(unique);
  await tagRepo.linkManyToNote(
    noteId,
    tags.map((t) => t.id),
  );
}
