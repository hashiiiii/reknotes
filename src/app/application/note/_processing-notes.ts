// バックグラウンド処理 (自動タグ付け) が走っているノートの in-memory レジストリ。
// 単一プロセス前提 (local は bun プロセス 1 つ、remote も app コンテナ 1 つ)。
// プロセス再起動で消えるが、その場合カードは通常表示に戻るだけで実害はない。
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
