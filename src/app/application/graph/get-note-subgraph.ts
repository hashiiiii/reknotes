import {
  type GraphData,
  type GraphLink,
  type GraphNode,
  toNoteGraphNode,
  toTagGraphNode,
} from "../../domain/graph/graph";
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

  const nodes: GraphNode[] = [...allNotes.map(toNoteGraphNode), ...relatedTags.map(toTagGraphNode)];

  const links: GraphLink[] = linkRows
    .filter((l) => allNoteIds.has(l.noteId))
    .map((l) => ({
      source: `note-${l.noteId}`,
      target: `tag-${l.tagId}`,
      type: "tag" as const,
    }));

  return { nodes, links };
}
