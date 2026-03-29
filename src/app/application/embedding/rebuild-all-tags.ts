import type { IEmbeddingService } from "../../domain/embedding/embedding-service";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { suggestTags } from "./suggest-tags";

export async function rebuildAllTags(
  embeddingService: IEmbeddingService,
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
): Promise<void> {
  await tagRepo.deleteAllNoteTagLinks();

  const allNotes = await noteRepo.findAll();

  for (const note of allNotes) {
    const tags = await suggestTags(embeddingService, tagRepo, note.title, note.body);
    if (tags.length > 0) await addTagsToNote(tagRepo, note.id, tags);
  }

  await embeddingService.buildTagCache((await tagRepo.findAllNames()).map((t) => t.name));
}
