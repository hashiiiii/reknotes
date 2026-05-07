import { clearAllNotesAndTags } from "../../src/app/application/maintenance/clear-all-notes-and-tags";
import { createNote } from "../../src/app/application/note/create-note";
import { addTagsToNote } from "../../src/app/application/tag/add-tags-to-note";
import { loadConfig } from "../../src/app/config";
import { createNoteRepository, createTagRepository } from "../../src/app/infrastructure/container";

type SampleNote = { title: string; body: string; tags: string[] };

const HELP_TEXT = `Usage: bun run seed --count <N>
       bun run seed -c <N>

Required:
  --count, -c <N>   Number of notes to insert (N >= 1).

Other:
  --help, -h        Show this help.

Behavior:
  - Truncates all notes/tags before inserting.
  - Sample data is loaded from scripts/seed/notes.json.
  - When N exceeds the sample size, samples are reused with a numeric suffix
    on the title (e.g. "..." -> "... (2)") so titles remain identifiable.

Environment:
  DATABASE_URL  Required.
  ENVIRONMENT   Required (development / test / etc.).
  DEPLOYMENT    Same semantics as migrate.
`;

type ParseResult = { kind: "help" } | { kind: "run"; count: number } | { kind: "error"; message: string };

function parseArgs(argv: string[]): ParseResult {
  const args = argv.slice(2);

  let count: number | undefined;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") return { kind: "help" };

    const eq = arg.indexOf("=");
    const flag = eq >= 0 ? arg.slice(0, eq) : arg;
    const inlineValue = eq >= 0 ? arg.slice(eq + 1) : undefined;

    if (flag === "--count" || flag === "-c") {
      const raw = inlineValue ?? args[i + 1];
      if (raw === undefined) {
        return { kind: "error", message: `${flag} requires a value` };
      }
      const n = Number(raw);
      if (!Number.isInteger(n)) {
        return { kind: "error", message: `${flag} must be an integer, got "${raw}"` };
      }
      if (n < 1) {
        return { kind: "error", message: `${flag} must be >= 1, got ${n}` };
      }
      count = n;
      i += inlineValue === undefined ? 2 : 1;
      continue;
    }

    return { kind: "error", message: `Unknown argument: ${arg}` };
  }

  if (count === undefined) {
    return { kind: "error", message: "--count is required" };
  }
  return { kind: "run", count };
}

function buildNote(samples: SampleNote[], index: number): SampleNote {
  const base = samples[index % samples.length];
  const cycle = Math.floor(index / samples.length);
  const title = cycle === 0 ? base.title : `${base.title} (${cycle + 1})`;
  return { title, body: base.body, tags: base.tags };
}

async function run(parsed: ParseResult): Promise<number> {
  if (parsed.kind === "help") {
    console.log(HELP_TEXT);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error("");
    console.error(HELP_TEXT);
    return 1;
  }

  const { count } = parsed;

  try {
    const config = loadConfig();
    const noteRepository = createNoteRepository(config);
    const tagRepository = createTagRepository(config);

    const notesPath = `${import.meta.dir}/notes.json`;
    const samples = (await Bun.file(notesPath).json()) as SampleNote[];
    if (samples.length === 0) {
      console.error(`${notesPath} contains no entries`);
      return 1;
    }

    console.log(`Seeding database with ${count} notes (sample pool=${samples.length})...`);
    await clearAllNotesAndTags(noteRepository, tagRepository);

    const tagSet = new Set<string>();
    for (let idx = 0; idx < count; idx++) {
      const sample = buildNote(samples, idx);
      const note = await createNote(noteRepository, sample.title, sample.body);
      await addTagsToNote(tagRepository, note.id, sample.tags);
      for (const t of sample.tags) tagSet.add(t);
    }

    console.log(`Created ${count} notes, ${tagSet.size} tags.`);
    return 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ kind: "error", message }));
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await run(parseArgs(process.argv)));
}
