import type { IEmbeddingService } from "../../domain/embedding/embedding-service";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { suggestTags } from "../embedding/suggest-tags";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { createNote } from "./create-note";

export async function createNoteWithTags(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  embeddingService: IEmbeddingService,
  title: string,
  body: string,
) {
  const note = await createNote(noteRepo, title, body);
  const generatedTags = await suggestTags(embeddingService, tagRepo, title, body);
  if (generatedTags.length > 0) await addTagsToNote(tagRepo, note.id, generatedTags);
  const tags = await noteRepo.findTagsByNoteId(note.id);
  return { note, tags };
}
