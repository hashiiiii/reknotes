import type { GraphData, GraphLink, GraphNode } from "../../domain/graph/graph";
import type { IGraphRepository } from "../../domain/graph/graph-repository";

export async function getFullGraph(graphRepo: IGraphRepository): Promise<GraphData> {
  const noteRows = await graphRepo.findAllNoteNodes();
  const tagRows = await graphRepo.findAllTagNodes();
  const linkRows = await graphRepo.findAllLinks();

  const nodes: GraphNode[] = [
    ...noteRows.map((n) => ({
      id: `note-${n.id}`,
      label: n.title || "無題",
      type: "note" as const,
      val: Math.max(1, n.linkCount),
      created_at: n.createdAt,
      snippet: n.snippet,
    })),
    ...tagRows.map((t) => ({
      id: `tag-${t.id}`,
      label: t.name,
      type: "tag" as const,
      val: Math.max(1, t.noteCount),
    })),
  ];

  const links: GraphLink[] = linkRows.map((l) => ({
    source: `note-${l.noteId}`,
    target: `tag-${l.tagId}`,
    type: "tag" as const,
  }));

  return { nodes, links };
}
