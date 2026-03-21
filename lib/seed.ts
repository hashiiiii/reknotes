import { getDb, closeDb } from "../src/db/connection";

const db = getDb();

const sampleNotes = [
  { title: "認知地図の研究", body: "O'Keefe と Nadel (1978) は海馬が認知地図の座であることを提唱した。場所細胞は空間内の特定の位置で発火し、環境の内的表象を構築する。", tags: ["認知科学", "記憶", "海馬"] },
  { title: "間隔反復学習", body: "Ebbinghausの忘却曲線によれば、記憶は時間とともに急速に減衰する。SM-2アルゴリズムは復習間隔を最適化し、長期記憶への定着を促進する。", tags: ["記憶", "学習", "SRS"] },
  { title: "Zettelkasten メソッド", body: "Niklas Luhmannは約9万枚のカードからなるZettelkastenを用いて58冊の書籍を執筆した。各カードは1つの原子的アイデアを持ち、明示的なリンクで接続される。", tags: ["知識管理", "Zettelkasten", "ノート術"] },
  { title: "二重符号化理論", body: "Paivio (1971) の二重符号化理論によると、人間の認知は言語系と画像系の2つのシステムで情報を処理する。両方のシステムに記憶が格納されると想起率が向上する。", tags: ["認知科学", "記憶", "視覚化"] },
  { title: "コンセプトマップの効果", body: "Nesbit & Adesope (2006) のメタ分析では、コンセプトマップを用いた学習はテキスト学習より約0.4SD優れていた。自分でマップを構築した場合が最も効果が高い。", tags: ["学習", "視覚化", "コンセプトマップ"] },
  { title: "TypeScript の型システム", body: "TypeScriptの構造的型付け（structural typing）は、名前ではなく構造で互換性を判定する。Duck typingに近いが、コンパイル時に型安全性を保証する。", tags: ["TypeScript", "プログラミング", "型システム"] },
  { title: "SQLite FTS5 全文検索", body: "SQLite FTS5はtrigramトークナイザーを使うと日本語の部分文字列マッチが可能。3文字以上のクエリで実用的な検索品質を達成できる。", tags: ["SQLite", "全文検索", "データベース"] },
  { title: "Hono フレームワーク", body: "HonoはWeb Standards APIに準拠した超軽量フレームワーク。Cloudflare Workers, Deno, Bunなど様々なランタイムで動作する。Yusuke Wada氏が開発。", tags: ["Hono", "TypeScript", "フレームワーク"] },
  { title: "htmx のアーキテクチャ", body: "htmxはHTML属性（hx-get, hx-post等）でAJAXリクエストを宣言的に記述する。サーバーはHTML断片を返却し、SPAなしで動的UIを実現する。Hypermediaアーキテクチャ。", tags: ["htmx", "フロントエンド", "Hypermedia"] },
  { title: "Docker のレイヤーキャッシュ", body: "Dockerfileの各命令はレイヤーとして保存される。依存のインストール（COPY package.json + RUN install）をアプリコードのCOPYより前に配置すると、コード変更時にキャッシュが効く。", tags: ["Docker", "デプロイ", "パフォーマンス"] },
];

console.log("Seeding database...");

const insertNote = db.prepare("INSERT INTO notes (title, body) VALUES (?, ?) RETURNING id");
const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
const getTag = db.prepare("SELECT id FROM tags WHERE name = ?");
const insertNoteTag = db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)");
const insertLink = db.prepare("INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)");

const noteIds: number[] = [];

for (const sample of sampleNotes) {
  const result = insertNote.get(sample.title, sample.body) as { id: number };
  noteIds.push(result.id);

  for (const tag of sample.tags) {
    insertTag.run(tag);
    const tagRow = getTag.get(tag) as { id: number };
    insertNoteTag.run(result.id, tagRow.id);
  }
}

// サンプルリンクを追加（共通タグを持つノート間）
insertLink.run(noteIds[0], noteIds[1]); // 認知地図 → 間隔反復
insertLink.run(noteIds[0], noteIds[3]); // 認知地図 → 二重符号化
insertLink.run(noteIds[1], noteIds[2]); // 間隔反復 → Zettelkasten
insertLink.run(noteIds[3], noteIds[4]); // 二重符号化 → コンセプトマップ
insertLink.run(noteIds[5], noteIds[7]); // TypeScript → Hono
insertLink.run(noteIds[7], noteIds[8]); // Hono → htmx
insertLink.run(noteIds[6], noteIds[9]); // SQLite → Docker

console.log(`Created ${sampleNotes.length} notes with tags and links.`);

closeDb();
