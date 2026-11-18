// Regenerate seed tags with the real embedding model when the seed dataset changes.
// Usage:
//   ENVIRONMENT=development bun run scripts/seed/regenerate-tags.ts
//
// This deletes development notes, tags, and links before inserting notes in order.
// Suggestions depend on previously created tags, so input order affects the results.
//
// The development database is left matching notes.json. To seed a different count,
// rerun `bun run seed --count <N>` afterward.
import { suggestTags } from "../../src/app/application/embedding/suggest-tags";
import { clearAllNotesAndTags } from "../../src/app/application/maintenance/clear-all-notes-and-tags";
import { createNote } from "../../src/app/application/note/create-note";
import { addTagsToNote } from "../../src/app/application/tag/add-tags-to-note";
import { loadConfig } from "../../src/app/config";
import {
  createEmbeddingProvider,
  createNoteRepository,
  createTagRepository,
} from "../../src/app/infrastructure/container";

type SampleNote = { title: string; body: string; tags: string[] };

const NOTES_PATH = `${import.meta.dir}/notes.json`;

if (!import.meta.main) throw new Error("regenerate-tags is meant to be run directly");

const samples = (await Bun.file(NOTES_PATH).json()) as SampleNote[];
if (samples.length === 0) {
  console.error(`${NOTES_PATH} is empty`);
  process.exit(1);
}

const config = loadConfig();
const noteRepo = createNoteRepository(config);
const tagRepo = createTagRepository(config);
const embeddingProvider = createEmbeddingProvider(config);

console.log(`Regenerating tags for ${samples.length} notes (this may take a while on first run)...`);
await clearAllNotesAndTags(noteRepo, tagRepo);

const updated: SampleNote[] = [];
const startedAt = Date.now();

for (let i = 0; i < samples.length; i++) {
  const { title, body } = samples[i];
  const note = await createNote(noteRepo, title, body);
  const tags = await suggestTags(embeddingProvider, tagRepo, title, body);
  if (tags.length > 0) await addTagsToNote(tagRepo, note.id, tags);
  // Match database normalization so variants such as TS and ts do not appear as
  // separate JSON tags while sharing one database row.
  const normalizedTags = [...new Set(tags.map((t) => t.trim().toLowerCase()))];
  updated.push({ title, body, tags: normalizedTags });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[${i + 1}/${samples.length} ${elapsed}s] "${title}" -> [${tags.join(", ")}]`);
}

await Bun.write(NOTES_PATH, `${JSON.stringify(updated, null, 2)}\n`);

const uniqueTags = new Set(updated.flatMap((n) => n.tags)).size;
console.log("");
console.log(`Wrote ${updated.length} notes with ${uniqueTags} unique tags to ${NOTES_PATH}.`);
