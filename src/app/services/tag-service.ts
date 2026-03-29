import * as tagRepo from "../repositories/tag-repository";

export async function addTagToNote(noteId: number, tagName: string) {
  const name = tagName.trim().toLowerCase();
  const tag = await tagRepo.findOrCreate(name);
  await tagRepo.linkToNote(noteId, tag.id);
  return tag;
}

export async function addTagsToNote(noteId: number, tagNames: string[]) {
  for (const name of tagNames) {
    if (name.trim()) await addTagToNote(noteId, name);
  }
}

export async function clearNoteTags(noteId: number) {
  await tagRepo.clearByNoteId(noteId);
}

export async function removeOrphanTag(tagName: string) {
  const name = tagName.trim().toLowerCase();
  const tag = await tagRepo.findByName(name);
  if (tag) {
    await tagRepo.removeOrphanTag(tag.id);
  }
}

export async function getAllTags() {
  return tagRepo.findAllWithCount();
}
