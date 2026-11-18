import { isProcessing } from "./_processing-notes";

// Presentation uses this use case to keep cards locked during background tagging.
export function isNoteProcessing(noteId: number): boolean {
  return isProcessing(noteId);
}
