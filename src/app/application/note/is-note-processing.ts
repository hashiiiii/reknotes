import { isProcessing } from "./_processing-notes";

// ノートのバックグラウンド処理 (自動タグ付け) が進行中かを返す。
// presentation 層はカードを processing 表示にするかの判定にこれを使う。
export function isNoteProcessing(noteId: number): boolean {
  return isProcessing(noteId);
}
