import type { INoteRepository } from "../domain/note/note-repository";
import type { ITagRepository } from "../domain/tag/tag-repository";

// notes 削除で note_tags は CASCADE 削除されるが、tags 自体は残るため別途消す。
// 2 回の delete はトランザクションでまとめていない (途中失敗で orphan tags が残り得るが、再実行で済む seed/reset 用途として許容)。
export async function clearAllData(noteRepo: INoteRepository, tagRepo: ITagRepository): Promise<void> {
  await noteRepo.deleteAll();
  await tagRepo.deleteAll();
}
