import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { suggestTags } from "../embedding/suggest-tags";
import { extractUploadedFileKeys } from "../file/_file-url";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import type { IStorageProvider } from "../port/storage-provider";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { removeOrphanTag } from "../tag/remove-orphan-tag";
import { finishNoteProcessing, isProcessing, markNoteProcessing } from "./_processing-notes";
import { updateNote } from "./update-note";

// 本文の更新だけを同期で行い、タグ再生成と掃除はバックグラウンドに回す。
// 処理中の再入は "processing" で拒否する (保存連打・複数タブ対策)。
export async function updateNoteWithTags(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  storageProvider: IStorageProvider,
  id: number,
  title: string,
  body: string,
): Promise<Note | null | "processing"> {
  // check と mark は最初の await より前の同一 tick で行う。間にイベントループが
  // 割り込まないので、同時に届いた保存は必ず片方だけが通る。
  if (isProcessing(id)) return "processing";
  markNoteProcessing(id);

  let existing: Note | null;
  let oldTagNames: string[];
  let note: Note | null;
  try {
    // 更新前の本文とタグを先に押さえておく。バックグラウンドでの S3 差分計算と
    // 外れたタグの orphan 掃除に使う。
    existing = await noteRepo.findById(id);
    oldTagNames = await noteRepo.findTagsByNoteId(id);
    note = await updateNote(noteRepo, id, title, body);
  } catch (e) {
    finishNoteProcessing(id);
    throw e;
  }
  if (!note) {
    finishNoteProcessing(id);
    return null;
  }

  retagAndCleanupInBackground(
    tagRepo,
    embeddingProvider,
    storageProvider,
    id,
    title,
    note.body,
    existing?.body ?? null,
    oldTagNames,
  );
  return note;
}

// タグ再生成と掃除を非同期で実行する (レスポンスをブロックしない)。
// 処理中の間は detail のメニューとカードがロック表示になる。成否に関わらず必ず解除する
function retagAndCleanupInBackground(
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  storageProvider: IStorageProvider,
  noteId: number,
  title: string,
  body: string,
  oldBody: string | null,
  oldTagNames: string[],
) {
  runRetagAndCleanup(tagRepo, embeddingProvider, storageProvider, noteId, title, body, oldBody, oldTagNames)
    .catch((e) => {
      console.error("Background retag failed (note was updated successfully):", e);
    })
    .finally(() => {
      finishNoteProcessing(noteId);
    });
}

async function runRetagAndCleanup(
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  storageProvider: IStorageProvider,
  noteId: number,
  title: string,
  body: string,
  oldBody: string | null,
  oldTagNames: string[],
): Promise<void> {
  await tagRepo.unlinkAllByNoteId(noteId);
  const generatedTags = await suggestTags(embeddingProvider, tagRepo, title, body);
  if (generatedTags.length > 0) await addTagsToNote(tagRepo, noteId, generatedTags);

  // 編集で外れた旧タグはどのノートからも参照されなければ消す (delete-note.ts と同じ方式)。
  // 再選択されたタグはリンクが残るので deleteIfOrphan が残す。
  for (const tagName of oldTagNames) {
    await removeOrphanTag(tagRepo, tagName);
  }

  // 旧本文にあって新本文にないキーだけを削除する。新本文に残っているキーは消さない。
  if (oldBody !== null) {
    const newKeys = new Set(extractUploadedFileKeys(body));
    const orphanedKeys = extractUploadedFileKeys(oldBody).filter((key) => !newKeys.has(key));
    await Promise.all(orphanedKeys.map((key) => storageProvider.delete(key)));
  }
}
