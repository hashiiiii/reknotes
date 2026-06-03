import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { suggestTags } from "../embedding/suggest-tags";
import { extractUploadedFileKeys } from "../file/_file-url";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import type { IStorageProvider } from "../port/storage-provider";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { updateNote } from "./update-note";

export async function updateNoteWithTags(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  storageProvider: IStorageProvider,
  id: number,
  title: string,
  body: string,
) {
  // 更新前の本文を先に押さえておき、編集で参照が外れた画像を S3 から消すための差分計算に使う。
  const existing = await noteRepo.findById(id);

  const note = await updateNote(noteRepo, id, title, body);
  if (!note) return null;
  await tagRepo.unlinkAllByNoteId(id);
  const generatedTags = await suggestTags(embeddingProvider, tagRepo, title, body);
  if (generatedTags.length > 0) await addTagsToNote(tagRepo, id, generatedTags);

  // 旧本文にあって新本文にないキーだけを削除する。新本文に残っているキーは消さない。
  // delete-note.ts と同様、削除失敗はそのまま伝播させる (try/catch で握り潰さない)。
  if (existing) {
    const newKeys = new Set(extractUploadedFileKeys(note.body));
    const orphanedKeys = extractUploadedFileKeys(existing.body).filter((key) => !newKeys.has(key));
    await Promise.all(orphanedKeys.map((key) => storageProvider.delete(key)));
  }

  return note;
}
