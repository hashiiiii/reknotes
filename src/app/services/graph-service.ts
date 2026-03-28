import * as graphRepo from "../repositories/graph-repository";
import type { GraphData, GraphLink, GraphNode } from "../types";

export function getFullGraphData(): GraphData {
  const noteRows = graphRepo.findAllNoteNodes();
  const tagRows = graphRepo.findAllTagNodes();
  const linkRows = graphRepo.findAllLinks();

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

export function getNoteSubgraph(noteId: number): GraphData {
  const relatedNotes = graphRepo.findRelatedNotes(noteId);
  const relatedTags = graphRepo.findRelatedTags(noteId);
  const linkRows = graphRepo.findRelatedLinks(noteId);

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
