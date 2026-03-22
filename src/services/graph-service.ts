import { getDb } from "../db/connection";
import type { GraphData, GraphNode, GraphLink } from "../types";

export function getFullGraphData(): GraphData {
  const db = getDb();

  // ノートノード
  const notes = db
    .prepare(
      `SELECT n.id, n.title, n.created_at, SUBSTR(n.body, 1, 120) as snippet,
        (SELECT COUNT(*) FROM note_links WHERE source_id = n.id OR target_id = n.id) +
        (SELECT COUNT(*) FROM note_tags WHERE note_id = n.id) as link_count
      FROM notes n`
    )
    .all() as { id: number; title: string; created_at: string; snippet: string; link_count: number }[];

  // タグノード
  const tags = db
    .prepare(
      `SELECT t.id, t.name, COUNT(nt.note_id) as note_count
       FROM tags t
       JOIN note_tags nt ON t.id = nt.tag_id
       GROUP BY t.id`
    )
    .all() as { id: number; name: string; note_count: number }[];

  // ノート間リンク
  const noteLinks = db
    .prepare("SELECT source_id, target_id FROM note_links")
    .all() as { source_id: number; target_id: number }[];

  // ノート-タグリンク
  const tagLinks = db
    .prepare("SELECT note_id, tag_id FROM note_tags")
    .all() as { note_id: number; tag_id: number }[];

  const nodes: GraphNode[] = [
    ...notes.map((n) => ({
      id: `note-${n.id}`,
      label: n.title || "無題",
      type: "note" as const,
      val: Math.max(1, n.link_count),
      created_at: n.created_at,
      snippet: n.snippet,
    })),
    ...tags.map((t) => ({
      id: `tag-${t.id}`,
      label: t.name,
      type: "tag" as const,
      val: Math.max(1, t.note_count),
    })),
  ];

  const links: GraphLink[] = [
    ...noteLinks.map((l) => ({
      source: `note-${l.source_id}`,
      target: `note-${l.target_id}`,
      type: "link" as const,
    })),
    ...tagLinks.map((l) => ({
      source: `note-${l.note_id}`,
      target: `tag-${l.tag_id}`,
      type: "tag" as const,
    })),
  ];

  return { nodes, links };
}

export function getNoteSubgraph(noteId: number, depth = 1): GraphData {
  const full = getFullGraphData();
  const targetId = `note-${noteId}`;

  // 対象ノードから depth 階層以内のノードを収集
  const collected = new Set<string>([targetId]);
  for (let d = 0; d < depth; d++) {
    for (const link of full.links) {
      if (collected.has(link.source)) collected.add(link.target);
      if (collected.has(link.target)) collected.add(link.source);
    }
  }

  return {
    nodes: full.nodes.filter((n) => collected.has(n.id)),
    links: full.links.filter(
      (l) => collected.has(l.source) && collected.has(l.target)
    ),
  };
}
