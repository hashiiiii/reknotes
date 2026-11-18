import { Hono } from "hono";
import type { AppEnv } from "../..";
import { engine } from "../..";
import { isNoteProcessing } from "../../application/note/is-note-processing";
import { searchNotes } from "../../application/search/search-notes";

const searchRoutes = new Hono<AppEnv>();

searchRoutes.get("/", async (c) => {
  const query = c.req.query("q") ?? "";

  if (!query.trim()) return c.redirect("/api/notes", 303);

  const results = await searchNotes(c.var.noteRepository, query);
  const html = await engine.renderFile("partials/search-results", {
    // Full-text search can return notes whose tags are still being generated.
    results: results.map((note) => ({ ...note, processing: isNoteProcessing(note.id) })),
    query,
  });
  return c.html(html);
});

export { searchRoutes };
