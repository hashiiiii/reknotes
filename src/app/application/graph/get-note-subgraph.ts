import type { GraphData, GraphLink, GraphNode } from "../../domain/graph/graph";
import type { IGraphRepository } from "../../domain/graph/graph-repository";

export async function getNoteSubgraph(graphRepo: IGraphRepository, noteId: number): Promise<GraphData> {
  const [selfNote, relatedNotes, relatedTags, linkRows] = await Promise.all([
    graphRepo.findNoteNodeById(noteId),
    graphRepo.findRelatedNotes(noteId),
    graphRepo.findRelatedTags(noteId),
    graphRepo.findRelatedLinks(noteId),
  ]);

  const allNotes = selfNote ? [selfNote, ...relatedNotes.filter((n) => n.id !== noteId)] : relatedNotes;

  const allNoteIds = new Set(allNotes.map((n) => n.id));

  const nodes: GraphNode[] = [
    ...allNotes.map((n) => ({
      id: `note-${n.id}`,
      label: n.title || "無題",
      type: "note" as const,
      val: Math.max(1, n.linkCount),
      created_at: n.createdAt,
      snippet: n.snippet,
    })),
    ...relatedTags.map((t) => ({
      id: `tag-${t.id}`,
      label: t.name,
      type: "tag" as const,
      val: Math.max(1, t.noteCount),
    })),
  ];

  const links: GraphLink[] = linkRows
    .filter((l) => allNoteIds.has(l.noteId))
    .map((l) => ({
      source: `note-${l.noteId}`,
      target: `tag-${l.tagId}`,
      type: "tag" as const,
    }));

  return { nodes, links };
}
