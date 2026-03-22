import { getDb, closeDb } from "../src/db/connection";

const db = getDb();

const sampleNotes = [
  // 認知科学・心理学クラスタ
  { title: "認知地図の研究", body: "O'Keefe と Nadel (1978) は海馬が認知地図の座であることを提唱した。場所細胞は空間内の特定の位置で発火し、環境の内的表象を構築する。\n\n## 場所細胞とグリッド細胞\n\n場所細胞（place cells）は海馬CA1/CA3領域に存在し、動物が特定の場所に位置するときに発火する。一方、グリッド細胞（grid cells）は2005年にMoser夫妻によって内側嗅内皮質で発見された。グリッド細胞は六角形の規則的なパターンで空間全体をカバーし、自己位置の計算に使われる。\n\n## 認知地図の応用\n\n- ナビゲーション支援システムへの示唆\n- VR空間での空間認知の研究\n- 加齢による空間認知能力の低下メカニズム\n- アルツハイマー病の早期診断指標としての空間記憶テスト\n\nこれらの発見は2014年のノーベル生理学・医学賞に結実した。", tags: ["認知科学", "記憶", "海馬"] },
  { title: "間隔反復学習", body: "Ebbinghausの忘却曲線によれば、記憶は時間とともに急速に減衰する。SM-2アルゴリズムは復習間隔を最適化し、長期記憶への定着を促進する。Ankiはこのアルゴリズムを実装した代表的なツール。\n\n## SM-2アルゴリズムの仕組み\n\n1. 初回学習: 1日後に復習\n2. 正解なら間隔を2.5倍に延長\n3. 不正解ならリセットして1日後から再開\n4. 各カードにEase Factor（難易度係数）を持たせ、個別に最適化\n\nこのシンプルなルールで、数万枚のカードの復習スケジュールを自動管理できる。SuperMemoのPiotr Woźniakが1987年に開発した歴史あるアルゴリズム。", tags: ["記憶", "学習", "SRS"] },
  { title: "二重符号化理論", body: "Paivio (1971) の二重符号化理論。言語系と画像系の2つで情報処理。図解付き教材が有効。", tags: ["認知科学", "記憶", "視覚化"] },
  { title: "コンセプトマップの効果", body: "Nesbit & Adesope (2006) のメタ分析では、コンセプトマップを用いた学習はテキスト学習より約0.4SD優れていた。自分でマップを構築した場合が最も効果が高い。Novakが1970年代に開発した手法。\n\n## コンセプトマップの作成手順\n\n1. 中心テーマの設定\n2. 関連概念のブレインストーミング\n3. 概念間の関係をリンクで表現（ラベル付き）\n4. 階層構造の整理（上位概念→下位概念）\n5. クロスリンクの発見と追加\n\n階層的な構造と横断的なリンクの両方が学習効果を最大化する鍵。特にクロスリンクの発見は深い理解の指標となる。Novak & Cañas (2008) はコンセプトマップのスコアリング手法も提案している。\n\n## ツール\n\n- CmapTools（無料、研究用途で広く利用）\n- MindMeister\n- Miro\n- Obsidian Canvas", tags: ["学習", "視覚化", "コンセプトマップ"] },
  { title: "ワーキングメモリとチャンキング", body: "Miller (1956) のマジカルナンバー7±2。チャンキングで容量拡張。", tags: ["認知科学", "記憶", "学習"] },
  { title: "メタ認知と自己調整学習", body: "Flavell (1979) が提唱したメタ認知は「認知についての認知」。学習者が自分の理解度を正確にモニタリングし、適切な戦略を選択する能力は学業成績と強い相関を持つ。", tags: ["認知科学", "学習", "メタ認知"] },
  { title: "認知負荷理論", body: "Sweller (1988) の認知負荷理論は、学習教材の設計において内在的・外在的・関連的認知負荷のバランスが重要であることを示した。冗長効果やスプリットアテンション効果など、具体的な設計原則が導出されている。", tags: ["認知科学", "学習", "教育設計"] },

  // 知識管理クラスタ
  { title: "Zettelkasten メソッド", body: "Niklas Luhmannは約9万枚のカードからなるZettelkastenを用いて58冊の書籍と数百の論文を執筆した。\n\n## Zettelkastenの4つの原則\n\n1. **原子性**: 1枚のカードに1つのアイデアのみを記録\n2. **自律性**: 各カードは文脈なしでも理解可能であるべき\n3. **リンク**: カード間を明示的に接続し、思考の流れを形成\n4. **番号体系**: 独自の番号付けで分岐する思考の系統を表現\n\n## デジタルZettelkasten\n\nObsidian, Logseq, Roam Research などがデジタルZettelkastenツールとして人気。双方向リンクとグラフビューにより、Luhmannの手法を現代的に再現している。\n\n## 参考文献\n\n- Ahrens, S. (2017). *How to Take Smart Notes*\n- Luhmann, N. (1981). *Kommunikation mit Zettelkästen*\n- Schmidt, J. (2018). *Niklas Luhmann's Card Index*\n\nZettelkastenの本質は「出力のためのインプット」という考え方。読んだものを自分の言葉で書き直し、既存の知識体系に位置づけることで、知識が有機的に成長する。", tags: ["知識管理", "Zettelkasten", "ノート術"] },
  { title: "Evergreen Notes の設計原則", body: "Andy Matuschakが提唱。原子性・概念志向・密なリンクが特徴。", tags: ["知識管理", "ノート術", "PKM"] },
  { title: "PARA メソッド", body: "Tiago Forteが提唱するPARA（Projects, Areas, Resources, Archives）は情報整理のフレームワーク。アクション可能性の軸で情報を分類することで、知識を行動に結びつける。Building a Second Brainの中核概念。", tags: ["知識管理", "PKM", "生産性"] },
  { title: "ナレッジグラフの構築", body: "知識をグラフ構造で表現することで、線形的なノートでは見えない概念間の関係性が可視化される。RDF/OWLのようなセマンティックWebの技術、あるいはObsidianのようなツールで個人レベルのナレッジグラフを構築できる。", tags: ["知識管理", "グラフ理論", "視覚化"] },

  // プログラミング・TypeScript クラスタ
  { title: "TypeScript の型システム", body: "TypeScriptの構造的型付け（structural typing）は、名前ではなく構造で互換性を判定する。Duck typingに近いが、コンパイル時に型安全性を保証する。ユニオン型・交差型・条件付き型による高度な型レベルプログラミングが可能。\n\n## 構造的型付け vs 名前的型付け\n\n```typescript\ninterface Dog { name: string; bark(): void; }\ninterface Pet { name: string; bark(): void; }\n// Dog と Pet は構造が同じなので互換!\nconst dog: Dog = { name: 'Pochi', bark() {} };\nconst pet: Pet = dog; // OK\n```\n\nJava/C#のような名前的型付け（nominal typing）では、たとえ同じ構造でも型名が異なれば非互換。TypeScriptの構造的型付けはJavaScriptの動的な性質を型システムに反映したもの。\n\n## 条件付き型\n\n```typescript\ntype IsString<T> = T extends string ? true : false;\ntype A = IsString<'hello'>; // true\ntype B = IsString<42>;      // false\n```\n\ninfer キーワードとの組み合わせで、型レベルのパターンマッチングが可能になる。", tags: ["TypeScript", "プログラミング", "型システム"] },
  { title: "TypeScript の Branded Types", body: "Branded Typesは構造的型付けの弱点を補う技法。`type UserId = string & { __brand: 'UserId' }` でノミナルな型区別を導入。DDDのValue Objectと相性が良い。", tags: ["TypeScript", "プログラミング", "型システム"] },
  { title: "Effect-TS による関数型プログラミング", body: "Effect-TSはTypeScriptでの関数型プログラミングを実現するライブラリ。エラー処理・並行性・依存性注入を型安全に扱える。ZIOからインスパイアされたEffect型で副作用を明示的に管理する。", tags: ["TypeScript", "関数型", "プログラミング"] },
  { title: "Bun ランタイムの特徴", body: "BunはZig言語で書かれたJavaScriptランタイム。Node.js互換APIを提供しつつ、起動速度・インストール速度で大幅改善。\n\n## ベンチマーク比較\n\n| 項目 | Node.js | Bun |\n|------|---------|-----|\n| 起動時間 | ~40ms | ~6ms |\n| npm install | ~15s | ~1s |\n| HTTPスループット | ~80k req/s | ~120k req/s |\n\n## 主な組み込み機能\n\n- **bun:sqlite**: ネイティブSQLiteドライバ（better-sqlite3より高速）\n- **bun:test**: ビルトインテストランナー（Jest互換API）\n- **Bun.serve**: 高速HTTPサーバー\n- **Bun.build**: バンドラー（esbuild互換）\n- **Bun.password**: bcryptハッシュ\n\nJarred Sumner氏が2022年に公開。Zig言語のコンパイル時最適化とJavaScriptCoreエンジンの組み合わせが高速性の鍵。", tags: ["Bun", "JavaScript", "ランタイム"] },

  // Web フレームワーククラスタ
  { title: "Hono フレームワーク", body: "HonoはWeb Standards APIに準拠した超軽量フレームワーク。Cloudflare Workers, Deno, Bunなど様々なランタイムで動作する。Yusuke Wada氏が開発。ミドルウェアスタックとルーティングの設計が秀逸。", tags: ["Hono", "TypeScript", "フレームワーク"] },
  { title: "htmx のアーキテクチャ", body: "htmxはHTML属性でAJAX。SPAなしで動的UI。Hypermediaの復興。", tags: ["htmx", "フロントエンド", "Hypermedia"] },
  { title: "Astro のアイランドアーキテクチャ", body: "AstroはMPA（Multi-Page Application）フレームワーク。Islands Architectureにより、ページの大部分を静的HTMLとしつつ、インタラクティブな部分のみReact/Vue/Svelteで動的にする。パフォーマンスとDXの両立。", tags: ["フロントエンド", "フレームワーク", "パフォーマンス"] },
  { title: "Server Components の設計思想", body: "React Server Componentsはコンポーネントレベルでサーバー/クライアントの境界を定義する。サーバーコンポーネントはバンドルサイズに含まれず、データベースに直接アクセスできる。Next.js 13のApp Routerで本格導入された。", tags: ["React", "フロントエンド", "フレームワーク"] },

  // データベース・インフラクラスタ
  { title: "SQLite FTS5 全文検索", body: "SQLite FTS5はtrigramトークナイザーを使うと日本語の部分文字列マッチが可能。\n\n## セットアップ\n\n```sql\nCREATE VIRTUAL TABLE notes_fts USING fts5(\n  title, body,\n  tokenize = 'trigram'\n);\n```\n\n## 検索クエリ\n\n```sql\nSELECT * FROM notes_fts\nWHERE notes_fts MATCH '認知科学'\nORDER BY bm25(notes_fts);\n```\n\n3文字以上のクエリで実用的な検索品質。BM25ランキングで関連度スコアリング。trigramの弱点は1-2文字の検索ができないこと。ICU拡張による形態素解析も選択肢だが、辞書管理が必要。\n\n## パフォーマンス\n\n10万件のノートでも数ミリ秒で検索完了。ただしINSERT/UPDATE時にインデックス更新コストがかかるため、大量書き込み時はバッチ処理を推奨。", tags: ["SQLite", "全文検索", "データベース"] },
  { title: "SQLite の WAL モード", body: "WALモードで読み書き並行実行。`PRAGMA journal_mode=WAL`で有効化。", tags: ["SQLite", "データベース", "パフォーマンス"] },
  { title: "Docker のレイヤーキャッシュ", body: "Dockerfileの各命令はレイヤーとして保存される。依存のインストール（COPY package.json + RUN install）をアプリコードのCOPYより前に配置すると、コード変更時にキャッシュが効く。マルチステージビルドでイメージサイズも削減可能。\n\n## 最適化されたDockerfile例\n\n```dockerfile\nFROM node:20-slim AS builder\nWORKDIR /app\nCOPY package.json bun.lockb ./\nRUN npm install\nCOPY . .\nRUN npm run build\n\nFROM node:20-slim\nWORKDIR /app\nCOPY --from=builder /app/dist ./dist\nCOPY --from=builder /app/node_modules ./node_modules\nEXPOSE 3000\nCMD [\"node\", \"dist/index.js\"]\n```\n\n## レイヤーキャッシュの仕組み\n\nDockerは各命令のハッシュを計算し、前回のビルドと一致すればキャッシュを再利用。`COPY . .` が変わっても、それより上のレイヤー（依存インストール）はキャッシュが効く。これにより、コード変更のみの場合のビルド時間が数秒に短縮される。\n\n## .dockerignore\n\n```\nnode_modules\n.git\n*.md\ndata/\n```\n\n不要なファイルをコンテキストから除外して転送量を削減。", tags: ["Docker", "デプロイ", "パフォーマンス"] },
  { title: "Fly.io でのエッジデプロイ", body: "Fly.ioでDockerコンテナをエッジにデプロイ。LiteFSでSQLiteレプリケーション。", tags: ["デプロイ", "エッジコンピューティング", "SQLite"] },
  { title: "Infrastructure as Code", body: "TerraformやPulumiによるインフラのコード管理は、再現性・バージョン管理・レビュープロセスの導入を可能にする。宣言的な記述でインフラの望ましい状態を定義し、差分を自動適用する。", tags: ["デプロイ", "DevOps", "インフラ"] },

  // 設計・アーキテクチャクラスタ
  { title: "ドメイン駆動設計の戦略的パターン", body: "DDDの戦略的設計では、Bounded Context間の関係をContext Mapで表現する。Shared Kernel、Customer-Supplier、Anticorruption Layerなどのパターンで、コンテキスト間の統合戦略を明示する。\n\n## Context Map のパターン一覧\n\n- **Shared Kernel**: 2つのコンテキストが共有するモデル・コード\n- **Customer-Supplier**: 上流が下流の要求に応じてAPIを提供\n- **Conformist**: 下流が上流のモデルにそのまま従う\n- **Anticorruption Layer**: 外部モデルから自コンテキストを保護する翻訳層\n- **Open Host Service / Published Language**: 公開APIと標準フォーマット\n- **Separate Ways**: 統合しない選択\n\n## 実務での適用\n\nマイクロサービスアーキテクチャでは、各サービスがBounded Contextに対応する。Context Mapはチーム間のコミュニケーション構造を反映する（Conway's Law）。EventStormingワークショップでBounded Contextの境界を発見するのが効果的。", tags: ["DDD", "設計", "アーキテクチャ"] },
  { title: "CQRSとイベントソーシング", body: "CQRS: 書き込みと読み取りモデルの分離。イベントソーシングで状態変更の履歴を完全保持。", tags: ["DDD", "設計", "アーキテクチャ"] },
  { title: "関数型ドメインモデリング", body: "Scott Wlaschinの提唱する関数型DDD。代数的データ型でドメインを表現し、不正な状態を型レベルで排除する（Make Illegal States Unrepresentable）。Railway Oriented Programmingでエラーハンドリングを合成可能にする。", tags: ["関数型", "DDD", "設計"] },

  // AI・機械学習クラスタ
  { title: "RAG アーキテクチャ", body: "Retrieval-Augmented Generation（RAG）は、LLMの生成能力と外部知識検索を組み合わせるアーキテクチャ。\n\n## 基本パイプライン\n\n1. **インデックス構築**: ドキュメントをチャンクに分割→埋め込みベクトル生成→ベクトルDB格納\n2. **クエリ処理**: ユーザークエリを埋め込み→セマンティック検索→Top-K取得\n3. **生成**: 検索結果をコンテキストとしてプロンプトに注入→LLMが回答生成\n\n## Advanced RAG テクニック\n\n- **Hybrid Search**: ベクトル検索 + BM25キーワード検索の組み合わせ\n- **Re-ranking**: Cross-encoderで検索結果を再ランク付け\n- **Query Expansion**: LLMでクエリを拡張して検索精度向上\n- **Chunk Overlap**: チャンク間で重複を持たせて文脈断裂を防ぐ\n- **Parent Document Retrieval**: 小チャンクで検索→親ドキュメント全体を返却\n\n## 評価指標\n\n- Faithfulness（生成内容の事実整合性）\n- Answer Relevancy（回答の関連性）\n- Context Precision / Recall（検索の精度・再現率）\n\nRAGASフレームワークでこれらを自動評価できる。", tags: ["AI", "LLM", "アーキテクチャ"] },
  { title: "プロンプトエンジニアリングの技法", body: "Few-shot、Chain-of-Thought、Self-Consistencyなどの技法でLLMの出力品質を改善できる。構造化出力（JSON mode）やツール呼び出しの設計も重要。タスク分解とプロンプトチェーンで複雑なワークフローを構築する。", tags: ["AI", "LLM", "プロンプト"] },
  { title: "埋め込みベクトルと類似度検索", body: "埋め込みモデルで文章をベクトル化。コサイン類似度で意味的近傍検索。HNSWでスケール。", tags: ["AI", "検索", "データベース"] },
];

// ノート間リンクの定義（[sourceIndex, targetIndex]）
const sampleLinks: [number, number][] = [
  // 認知科学内
  [0, 1],   // 認知地図 → 間隔反復
  [0, 2],   // 認知地図 → 二重符号化
  [1, 4],   // 間隔反復 → ワーキングメモリ
  [2, 3],   // 二重符号化 → コンセプトマップ
  [4, 5],   // ワーキングメモリ → メタ認知
  [5, 6],   // メタ認知 → 認知負荷理論
  [3, 10],  // コンセプトマップ → ナレッジグラフ

  // 知識管理内
  [7, 8],   // Zettelkasten → Evergreen Notes
  [8, 9],   // Evergreen Notes → PARA
  [7, 10],  // Zettelkasten → ナレッジグラフ

  // 認知科学 ↔ 知識管理
  [1, 7],   // 間隔反復 → Zettelkasten
  [6, 3],   // 認知負荷理論 → コンセプトマップ

  // プログラミング内
  [11, 12], // TypeScript型 → Branded Types
  [11, 13], // TypeScript型 → Effect-TS
  [14, 15], // Bun → Hono

  // Web フレームワーク内
  [15, 16], // Hono → htmx
  [17, 18], // Astro → Server Components

  // データベース・インフラ内
  [19, 20], // FTS5 → WAL
  [21, 22], // Docker → Fly.io
  [22, 23], // Fly.io → IaC

  // 設計クラスタ内
  [24, 25], // DDD戦略 → CQRS
  [25, 26], // CQRS → 関数型DDD
  [26, 13], // 関数型DDD → Effect-TS
  [24, 12], // DDD → Branded Types

  // AI クラスタ内
  [27, 28], // RAG → プロンプト
  [27, 29], // RAG → 埋め込みベクトル
  [29, 19], // 埋め込みベクトル → FTS5

  // クラスタ横断
  [10, 29], // ナレッジグラフ → 埋め込みベクトル
  [16, 15], // htmx → Hono
  [20, 14], // WAL → Bun
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

for (const [src, tgt] of sampleLinks) {
  insertLink.run(noteIds[src], noteIds[tgt]);
}

console.log(`Created ${sampleNotes.length} notes, ${new Set(sampleNotes.flatMap(n => n.tags)).size} tags, ${sampleLinks.length} links.`);

closeDb();
