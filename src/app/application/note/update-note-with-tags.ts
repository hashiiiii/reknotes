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

// Save text before background tagging so edits return promptly. Reject overlapping
// saves, including repeated clicks and edits from multiple tabs.
export async function updateNoteWithTags(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  storageProvider: IStorageProvider,
  id: number,
  title: string,
  body: string,
): Promise<Note | null | "processing"> {
  // Checking and marking before the first await prevents concurrent saves from both proceeding.
  if (isProcessing(id)) return "processing";
  markNoteProcessing(id);

  let existing: Note | null;
  let oldTagNames: string[];
  let note: Note | null;
  try {
    // Cleanup needs the previous file references and tags to identify removed objects and orphan tags.
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

// Both success and failure must unlock the card and detail menu.
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
  // Keep existing links if inference or cache building fails. A successful empty
  // result still removes old tags.
  const generatedTags = await suggestTags(embeddingProvider, tagRepo, title, body);
  await tagRepo.unlinkAllByNoteId(noteId);
  if (generatedTags.length > 0) await addTagsToNote(tagRepo, noteId, generatedTags);

  // Orphan cleanup preserves tags that were selected again or still belong to other notes.
  for (const tagName of oldTagNames) {
    await removeOrphanTag(tagRepo, tagName);
  }

  // File cleanup must preserve every key still referenced by the updated body.
  if (oldBody !== null) {
    const newKeys = new Set(extractUploadedFileKeys(body));
    const orphanedKeys = extractUploadedFileKeys(oldBody).filter((key) => !newKeys.has(key));
    await Promise.all(orphanedKeys.map((key) => storageProvider.delete(key)));
  }
}
