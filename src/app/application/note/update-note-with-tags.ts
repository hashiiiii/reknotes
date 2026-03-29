import type { IEmbeddingService } from "../../domain/embedding/embedding-service";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { suggestTags } from "../embedding/suggest-tags";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { updateNote } from "./update-note";

export async function updateNoteWithTags(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  embeddingService: IEmbeddingService,
  id: number,
  title: string,
  body: string,
) {
  const note = await updateNote(noteRepo, id, title, body);
  if (!note) return null;
  await tagRepo.clearByNoteId(id);
  const generatedTags = await suggestTags(embeddingService, tagRepo, title, body);
  if (generatedTags.length > 0) await addTagsToNote(tagRepo, id, generatedTags);
  return note;
}
