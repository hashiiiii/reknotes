import type { GraphData, GraphLink, GraphNode } from "../../domain/graph/graph";
import type { IGraphRepository } from "../../domain/graph/graph-repository";

export async function getNoteSubgraph(graphRepo: IGraphRepository, noteId: number): Promise<GraphData> {
  const relatedNotes = await graphRepo.findRelatedNotes(noteId);
  const relatedTags = await graphRepo.findRelatedTags(noteId);
  const linkRows = await graphRepo.findRelatedLinks(noteId);

  const relatedNoteIds = new Set(relatedNotes.map((n) => n.id));

  const nodes: GraphNode[] = [
    ...relatedNotes.map((n) => ({
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
    .filter((l) => relatedNoteIds.has(l.noteId))
    .map((l) => ({
      source: `note-${l.noteId}`,
      target: `tag-${l.tagId}`,
      type: "tag" as const,
    }));

  return { nodes, links };
}
