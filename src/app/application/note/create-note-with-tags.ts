import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { suggestTags } from "../embedding/suggest-tags";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { createNote } from "./create-note";

export async function createNoteWithTags(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  title: string,
  body: string,
) {
  const note = await createNote(noteRepo, title, body);

  // タグ付けを非同期で実行（レスポンスをブロックしない）
  // ノートが先に削除された場合は FK 制約違反で失敗するが、try-catch で安全に処理される
  autoTagInBackground(tagRepo, embeddingProvider, note.id, title, body);

  return { note, tags: [] };
}

function autoTagInBackground(
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  noteId: number,
  title: string,
  body: string,
) {
  suggestTags(embeddingProvider, tagRepo, title, body)
    .then((generatedTags) => {
      if (generatedTags.length > 0) return addTagsToNote(tagRepo, noteId, generatedTags);
    })
    .catch((e) => {
      console.error("Auto-tagging failed (note was created successfully):", e);
    });
}
