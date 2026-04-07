import { describe, expect, test } from "bun:test";
import { graphRepository, noteRepository, tagRepository } from "../../infrastructure/container";
import { createNote } from "../note/create-note";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { getFullGraph } from "./get-full-graph";
import { getNoteSubgraph } from "./get-note-subgraph";

describe("graph use cases", () => {
  test("getFullGraph でノードとリンクを取得できる", async () => {
    const note = await createNote(noteRepository, "グラフテスト", "本文");
    const tagName = `graph-${Date.now()}`;
    await addTagsToNote(tagRepository, note.id, [tagName]);

    const graph = await getFullGraph(graphRepository);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.links.length).toBeGreaterThan(0);

    const noteNode = graph.nodes.find((n) => n.id === `note-${note.id}`);
    expect(noteNode).toBeDefined();
    expect(noteNode?.type).toBe("note");

    const tagNode = graph.nodes.find((n) => n.label === tagName);
    expect(tagNode).toBeDefined();
    expect(tagNode?.type).toBe("tag");
  });

  test("getNoteSubgraph で特定ノートのサブグラフを取得できる", async () => {
    const note = await createNote(noteRepository, "サブグラフテスト", "本文");
    const tagName = `subgraph-${Date.now()}`;
    await addTagsToNote(tagRepository, note.id, [tagName]);

    const subgraph = await getNoteSubgraph(graphRepository, note.id);
    expect(subgraph.nodes.length).toBeGreaterThan(0);

    const noteNode = subgraph.nodes.find((n) => n.id === `note-${note.id}`);
    expect(noteNode).toBeDefined();
  });

  test("getNoteSubgraph で存在しないノートは空グラフを返す", async () => {
    const subgraph = await getNoteSubgraph(graphRepository, 99999);
    const noteNode = subgraph.nodes.find((n) => n.id === "note-99999");
    expect(noteNode).toBeUndefined();
  });

  test("同じタグを持つノート同士がサブグラフに含まれる", async () => {
    const sharedTag = `shared-${Date.now()}`;
    const note1 = await createNote(noteRepository, "共有1", "本文");
    const note2 = await createNote(noteRepository, "共有2", "本文");
    await addTagsToNote(tagRepository, note1.id, [sharedTag]);
    await addTagsToNote(tagRepository, note2.id, [sharedTag]);

    const subgraph = await getNoteSubgraph(graphRepository, note1.id);
    const note2Node = subgraph.nodes.find((n) => n.id === `note-${note2.id}`);
    expect(note2Node).toBeDefined();
  });
});
