// Both deployment modes use one process, so an in-memory registry is sufficient.
// Restarting clears the registry and returns cards to their normal state.
const processingNoteIds = new Set<number>();

export function markNoteProcessing(noteId: number): void {
  processingNoteIds.add(noteId);
}

export function finishNoteProcessing(noteId: number): void {
  processingNoteIds.delete(noteId);
}

export function isProcessing(noteId: number): boolean {
  return processingNoteIds.has(noteId);
}
