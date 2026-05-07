// notes.json の各ノートに対して、本物の embedding モデルで suggestTags を実行し、
// 結果のタグで notes.json を書き直すワンオフ・ツール。
//
// 使い方:
//   ENVIRONMENT=development bun run scripts/seed/regenerate-tags.ts
//
// 副作用:
//   開発 DB の notes / tags / note_tags を一度全削除し、本スクリプトが順番にノートを
//   挿入し直す。タグは「これまでに作られたタグの累積プールに対する suggestTags」で
//   決まるため、入力 (title, body) の順序に依存する。
//
// 実行後はそのまま開発 DB に notes.json と整合した seed が積まれた状態になる。
// 別の件数で seed したい場合は `bun run seed --count <N>` を再実行する。
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
  // DB に書き込まれる normalizeTagName (= trim + lowercase) と同じ正規化を JSON にも適用する。
  // そうしないと JSON 上は "TS" / "ts" 別タグに見えるが DB では同一タグ扱いされ、件数が食い違う。
  const normalizedTags = [...new Set(tags.map((t) => t.trim().toLowerCase()))];
  updated.push({ title, body, tags: normalizedTags });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[${i + 1}/${samples.length} ${elapsed}s] "${title}" -> [${tags.join(", ")}]`);
}

await Bun.write(NOTES_PATH, `${JSON.stringify(updated, null, 2)}\n`);

const uniqueTags = new Set(updated.flatMap((n) => n.tags)).size;
console.log("");
console.log(`Wrote ${updated.length} notes with ${uniqueTags} unique tags to ${NOTES_PATH}.`);
