import {
  type GraphData,
  type GraphLink,
  type GraphNode,
  toNoteGraphNode,
  toTagGraphNode,
} from "../../domain/graph/graph";
import type { IGraphRepository } from "../../domain/graph/graph-repository";

export async function getFullGraph(graphRepo: IGraphRepository): Promise<GraphData> {
  const noteRows = await graphRepo.findAllNoteNodes();
  const tagRows = await graphRepo.findAllTagNodes();
  const linkRows = await graphRepo.findAllLinks();

  const nodes: GraphNode[] = [...noteRows.map(toNoteGraphNode), ...tagRows.map(toTagGraphNode)];

  const links: GraphLink[] = linkRows.map((l) => ({
    source: `note-${l.noteId}`,
    target: `tag-${l.tagId}`,
    type: "tag" as const,
  }));

  return { nodes, links };
}
