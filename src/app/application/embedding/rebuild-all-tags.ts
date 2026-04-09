import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { suggestTags } from "./suggest-tags";

export async function rebuildAllTags(
  embeddingProvider: IEmbeddingProvider,
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
): Promise<void> {
  await tagRepo.deleteAllNoteTagLinks();

  const allNotes = await noteRepo.findAll();

  for (const note of allNotes) {
    const tags = await suggestTags(embeddingProvider, tagRepo, note.title, note.body);
    if (tags.length > 0) await addTagsToNote(tagRepo, note.id, tags);
  }

  await embeddingProvider.buildTagCache((await tagRepo.findAll()).map((t) => t.name));
}
