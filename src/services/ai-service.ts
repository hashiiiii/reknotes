import { getDb } from "../db/connection";
import * as tagService from "./tag-service";
import * as noteService from "./note-service";

type AiProvider = "ollama" | "openai" | "none";

function getProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === "ollama") return "ollama";
  if (provider === "openai") return "openai";
  return "none";
}

function getOllamaUrl(): string {
  return process.env.OLLAMA_URL ?? "http://localhost:11434";
}

function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL ?? "llama3.2";
}

function getOpenAiKey(): string {
  return process.env.OPENAI_API_KEY ?? "";
}

function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
}

async function chat(prompt: string): Promise<string | null> {
  const provider = getProvider();

  if (provider === "ollama") {
    try {
      const res = await fetch(`${getOllamaUrl()}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: getOllamaModel(),
          prompt,
          stream: false,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { response: string };
      return data.response;
    } catch {
      return null;
    }
  }

  if (provider === "openai") {
    const key = getOpenAiKey();
    if (!key) return null;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: getOpenAiModel(),
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      return data.choices[0]?.message?.content ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

// 自動タグ付与
async function suggestTags(noteBody: string): Promise<string[]> {
  const db = getDb();
  const existingTags = db
    .prepare("SELECT name FROM tags ORDER BY name")
    .all() as { name: string }[];
  const tagList = existingTags.map((t) => t.name).join(", ");

  const prompt = `以下のナレッジノートに適切なタグを3-5個付与してください。
タグは短く（1-3語）、日本語または英語で。
既存タグ: [${tagList}] がある場合は優先的に再利用してください。
タグのみをカンマ区切りで返してください。説明は不要です。

---
${noteBody.slice(0, 1000)}`;

  const response = await chat(prompt);
  if (!response) return [];

  return response
    .split(",")
    .map((t) => t.trim().replace(/^[「\[#]|[」\]]$/g, ""))
    .filter((t) => t.length > 0 && t.length < 30);
}

// 自動リンク推定
async function suggestLinks(noteId: number, noteBody: string): Promise<number[]> {
  const db = getDb();
  const otherNotes = db
    .prepare("SELECT id, title, substr(body, 1, 100) as snippet FROM notes WHERE id != ? ORDER BY created_at DESC LIMIT 50")
    .all(noteId) as { id: number; title: string; snippet: string }[];

  if (otherNotes.length === 0) return [];

  const noteList = otherNotes
    .map((n) => `[${n.id}] ${n.title}: ${n.snippet}`)
    .join("\n");

  const prompt = `以下の新しいノートと、既存ノートのリストが与えられます。
内容的に関連の強いノートIDを最大5件、数字のみをカンマ区切りで返してください。
関連がない場合は空で返してください。

新規ノート:
${noteBody.slice(0, 500)}

既存ノート:
${noteList}`;

  const response = await chat(prompt);
  if (!response) return [];

  return response
    .match(/\d+/g)
    ?.map(Number)
    .filter((id) => otherNotes.some((n) => n.id === id))
    .slice(0, 5) ?? [];
}

// FTS5フォールバック: AI未設定時の類似ノート検索
function findSimilarNotesByFts(noteId: number, noteBody: string): number[] {
  const db = getDb();
  // 本文から最初の意味のある単語を抽出して検索
  const words = noteBody
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .slice(0, 5);

  if (words.length === 0) return [];

  const ids = new Set<number>();
  for (const word of words) {
    try {
      const escaped = `"${word.replace(/"/g, '""')}"`;
      const rows = db
        .prepare(
          `SELECT rowid FROM notes_fts WHERE notes_fts MATCH ? AND rowid != ? LIMIT 3`
        )
        .all(escaped, noteId) as { rowid: number }[];
      for (const r of rows) ids.add(r.rowid);
    } catch {
      // FTS5クエリが失敗した場合はスキップ
    }
  }

  return [...ids].slice(0, 5);
}

// メインエントリポイント: ノート投稿後のバックグラウンド処理
export async function processNoteWithAi(noteId: number): Promise<void> {
  const note = noteService.getNote(noteId);
  if (!note) return;

  const provider = getProvider();

  if (provider !== "none") {
    // AI自動タグ
    const suggestedTags = await suggestTags(note.body);
    if (suggestedTags.length > 0) {
      tagService.addTagsToNote(noteId, suggestedTags);
    }

    // AI自動リンク
    const suggestedLinks = await suggestLinks(noteId, note.body);
    for (const targetId of suggestedLinks) {
      noteService.addLink(noteId, targetId);
    }
  } else {
    // フォールバック: FTS5類似ノート検索でリンク
    const similarIds = findSimilarNotesByFts(noteId, note.body);
    for (const targetId of similarIds) {
      noteService.addLink(noteId, targetId);
    }
  }
}
