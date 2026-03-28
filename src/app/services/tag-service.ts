import * as tagRepo from "../repositories/tag-repository";

export function addTagToNote(noteId: number, tagName: string) {
  const name = tagName.trim().toLowerCase();
  const tag = tagRepo.findOrCreate(name);
  tagRepo.linkToNote(noteId, tag.id);
  return tag;
}

export function addTagsToNote(noteId: number, tagNames: string[]) {
  for (const name of tagNames) {
    if (name.trim()) addTagToNote(noteId, name);
  }
}

export function clearNoteTags(noteId: number) {
  tagRepo.clearByNoteId(noteId);
}

export function removeOrphanTag(tagName: string) {
  const name = tagName.trim().toLowerCase();
  const tag = tagRepo.findByName(name);
  if (tag) {
    tagRepo.removeOrphanTag(tag.id);
  }
}

export function getAllTags() {
  return tagRepo.findAllWithCount();
}
