import { closeDb, getDb } from "../src/app/db/connection";

const db = getDb();

// 既存データをクリア（notes 削除で note_tags, note_embeddings も CASCADE 削除される）
db.prepare("DELETE FROM notes").run();
db.prepare("DELETE FROM tags").run();

const sampleNotes: { title: string; body: string; tags: string[] }[] = [
  // ── 認知科学・心理学 ──
  {
    title: "認知地図と場所細胞",
    body: "O'Keefe と Nadel (1978) は海馬が認知地図の座であることを提唱した。場所細胞は空間内の特定の位置で発火し、環境の内的表象を構築する。\n\n## 場所細胞とグリッド細胞\n\n場所細胞（place cells）は海馬CA1/CA3領域に存在し、動物が特定の場所に位置するときに発火する。一方、グリッド細胞（grid cells）は2005年にMoser夫妻によって内側嗅内皮質で発見された。グリッド細胞は六角形の規則的なパターンで空間全体をカバーし、自己位置の計算に使われる。\n\n## 応用\n\n- ナビゲーション支援システム\n- VR空間での空間認知研究\n- アルツハイマー病の早期診断指標\n\nこれらの発見は2014年のノーベル生理学・医学賞に結実した。",
    tags: ["認知科学", "神経科学", "記憶"],
  },
  {
    title: "間隔反復と忘却曲線",
    body: "Ebbinghausの忘却曲線によれば、記憶は時間とともに急速に減衰する。SM-2アルゴリズムは復習間隔を最適化し、長期記憶への定着を促進する。\n\n## SM-2の仕組み\n\n1. 初回学習: 1日後に復習\n2. 正解なら間隔を2.5倍に延長\n3. 不正解ならリセット\n4. 各カードに難易度係数を持たせ個別最適化\n\nSuperMemoのPiotr Woźniakが1987年に開発。Ankiはこのアルゴリズムを実装した代表的ツール。",
    tags: ["認知科学", "記憶", "学習法"],
  },
  {
    title: "二重符号化理論",
    body: "Paivio (1971) の二重符号化理論。言語系と画像系の2つのチャネルで情報を処理すると、記憶の定着率が向上する。図解付き教材が有効である根拠。",
    tags: ["認知科学", "記憶", "学習法"],
  },
  {
    title: "ワーキングメモリの容量制限",
    body: "Miller (1956) のマジカルナンバー7±2。チャンキングで実効容量を拡張できる。",
    tags: ["認知科学", "記憶"],
  },
  {
    title: "メタ認知と自己調整学習",
    body: "Flavell (1979) が提唱したメタ認知は「認知についての認知」。学習者が自分の理解度をモニタリングし、適切な戦略を選択する能力は学業成績と強い相関を持つ。Zimmermanの自己調整学習モデルでは、予見フェーズ・遂行フェーズ・自己省察フェーズの3段階を循環的に繰り返す。\n\n## 実践的なテクニック\n\n- 学習前に「自分は何を知っていて何を知らないか」を書き出す\n- 読解中に理解度を1-5で自己評価\n- 学習後のリフレクションジャーナル\n- 他者への説明（ファインマン・テクニック）",
    tags: ["認知科学", "学習法", "メタ認知"],
  },
  {
    title: "認知負荷理論と教材設計",
    body: "Sweller (1988) の認知負荷理論。内在的負荷（題材の本質的難しさ）、外在的負荷（不適切な教材設計）、関連的負荷（スキーマ構築に貢献する負荷）の3種を区別する。冗長効果・スプリットアテンション効果など、実証に基づく設計原則が多数導出されている。",
    tags: ["認知科学", "学習法", "教育設計"],
  },
  {
    title: "フロー状態とパフォーマンス",
    body: "Csíkszentmihályi (1990) のフロー理論。スキルレベルと課題の難易度が釣り合ったとき、人は完全な没入状態に入る。時間感覚の変容、自意識の消失、内発的な報酬感が特徴。プログラマーが「ゾーンに入る」という表現で語る状態はこれに相当する。",
    tags: ["心理学", "生産性"],
  },

  // ── 知識管理・ノート術 ──
  {
    title: "Zettelkasten メソッド",
    body: "Niklas Luhmannは約9万枚のカードからなるZettelkastenを用いて58冊の書籍と数百の論文を執筆した。\n\n## 4つの原則\n\n1. **原子性**: 1枚のカードに1つのアイデアのみ\n2. **自律性**: 各カードは文脈なしでも理解可能\n3. **リンク**: カード間を明示的に接続\n4. **番号体系**: 分岐する思考の系統を表現\n\n## デジタルZettelkasten\n\nObsidian, Logseq, Roam Research などが代表的ツール。双方向リンクとグラフビューでLuhmannの手法を現代的に再現している。\n\n## 参考文献\n\n- Ahrens, S. (2017). *How to Take Smart Notes*\n- Luhmann, N. (1981). *Kommunikation mit Zettelkästen*",
    tags: ["知識管理", "Zettelkasten", "ノート術"],
  },
  {
    title: "Evergreen Notes",
    body: "Andy Matuschakが提唱する概念。原子性・概念志向・密なリンクが特徴。時間とともに育てていくノート。",
    tags: ["知識管理", "ノート術"],
  },
  {
    title: "PARA メソッド",
    body: "Tiago Forteが提唱するPARA（Projects, Areas, Resources, Archives）は情報整理のフレームワーク。アクション可能性の軸で情報を分類し、知識を行動に結びつける。Building a Second Brainの中核概念。\n\n## 4つのカテゴリ\n\n- **Projects**: 期限のある具体的なゴール\n- **Areas**: 継続的に責任を持つ領域\n- **Resources**: 将来役立つかもしれないトピック\n- **Archives**: 完了・非アクティブな情報",
    tags: ["知識管理", "生産性"],
  },
  {
    title: "コンセプトマップの作り方",
    body: "Novakが1970年代に開発。Nesbit & Adesope (2006) のメタ分析では、コンセプトマップ学習はテキスト学習より約0.4SD優れていた。\n\n## 作成手順\n\n1. 中心テーマの設定\n2. 関連概念のブレインストーミング\n3. 概念間の関係をラベル付きリンクで表現\n4. 階層構造の整理\n5. クロスリンクの発見と追加\n\n## ツール\n\n- CmapTools（無料、研究用途向け）\n- Miro\n- Obsidian Canvas",
    tags: ["学習法", "視覚化", "知識管理"],
  },
  {
    title: "ナレッジグラフの個人活用",
    body: "知識をグラフ構造で表現すると、線形ノートでは見えない概念間の関係性が浮かび上がる。ObsidianやLogseqで個人レベルのナレッジグラフを構築できる。",
    tags: ["知識管理", "視覚化"],
  },

  // ── TypeScript ──
  {
    title: "TypeScript の構造的型付け",
    body: "TypeScriptの型システムは構造で互換性を判定する（structural typing）。名前ではなくシェイプが一致すれば代入可能。\n\n```typescript\ninterface Dog { name: string; bark(): void; }\ninterface Pet { name: string; bark(): void; }\nconst dog: Dog = { name: 'Pochi', bark() {} };\nconst pet: Pet = dog; // OK — 構造が同じ\n```\n\nJava/C#の名前的型付け（nominal typing）とは対照的。JavaScriptの動的な性質を型で表現するための設計判断。",
    tags: ["TypeScript", "型システム"],
  },
  {
    title: "Branded Types で型安全なID",
    body: "構造的型付けの弱点を補う技法。`type UserId = string & { __brand: 'UserId' }` でノミナルな型区別を導入する。DDDのValue Objectと相性が良い。",
    tags: ["TypeScript", "型システム", "DDD"],
  },
  {
    title: "条件付き型と infer",
    body: "TypeScriptの条件付き型は型レベルの三項演算子。`infer` と組み合わせると型のパターンマッチングが可能になる。\n\n```typescript\ntype ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;\ntype Unwrap<T> = T extends Promise<infer U> ? U : T;\n```\n\nライブラリの型定義で頻出するテクニック。",
    tags: ["TypeScript", "型システム"],
  },
  {
    title: "Effect-TS による型安全なエラー処理",
    body: "Effect-TSはZIOからインスパイアされたTypeScript向け関数型ライブラリ。`Effect<Success, Error, Requirements>` 型で副作用・エラー・依存性を型レベルで追跡する。\n\n## 従来のtry-catchとの比較\n\ntry-catchではエラーの型が失われるが、Effect-TSではエラーチャネルが型に表れる。呼び出し元は必ずエラーを処理するか伝播させる必要がある。\n\n## 主な機能\n\n- パイプラインベースの合成\n- 構造化された並行処理（Fiber）\n- レイヤーベースの依存性注入\n- リトライ・タイムアウトの宣言的記述",
    tags: ["TypeScript", "関数型プログラミング"],
  },
  {
    title: "TypeScript 5.x の新機能まとめ",
    body: "decorators の Stage 3 対応、const型パラメータ、`satisfies` 演算子など。特に `satisfies` は型チェックしつつリテラル型を保持できる便利な機能。",
    tags: ["TypeScript"],
  },

  // ── JavaScript ランタイム・ツールチェーン ──
  {
    title: "Bun ランタイムの特徴",
    body: "BunはZig言語で書かれたJavaScriptランタイム。Node.js互換APIを提供しつつ、起動速度・インストール速度で大幅改善。\n\n## 組み込み機能\n\n- **bun:sqlite**: ネイティブSQLiteドライバ\n- **bun:test**: Jest互換テストランナー\n- **Bun.serve**: 高速HTTPサーバー\n- **Bun.build**: バンドラー\n\nJarred Sumner氏が2022年に公開。JavaScriptCoreエンジンとZigのコンパイル時最適化が高速性の鍵。",
    tags: ["Bun", "JavaScript", "ランタイム"],
  },
  {
    title: "Node.js と Bun の使い分け",
    body: "Bunは起動速度とインストール速度で圧倒的に速いが、Node.jsはエコシステムの成熟度と安定性で優る。プロダクション環境ではNode.jsが無難、開発ツールやスクリプトではBunの高速性が活きる。",
    tags: ["Bun", "JavaScript", "ランタイム"],
  },
  {
    title: "ESM と CommonJS の移行戦略",
    body: 'Node.jsエコシステムはCJSからESMへの移行期にある。`"type": "module"` の設定、拡張子 `.mjs` / `.cjs` の使い分け、Dynamic Import によるCJSモジュールの読み込みなど、段階的な移行パスがある。Dual Package対応は `exports` フィールドで実現。',
    tags: ["JavaScript", "Node.js"],
  },

  // ── Web フレームワーク ──
  {
    title: "Hono — 軽量Webフレームワーク",
    body: "HonoはWeb Standards APIに準拠した超軽量フレームワーク。Cloudflare Workers, Deno, Bunなど様々なランタイムで動作する。\n\n## 特徴\n\n- ゼロ依存、コアサイズ14KB以下\n- Express風のミドルウェアスタック\n- 型安全なルーティング（RPC mode）\n- JSXサポート\n\nYusuke Wada氏が開発。Web Standardsベースなのでランタイムのロックインがない。",
    tags: ["Hono", "TypeScript", "Webフレームワーク"],
  },
  {
    title: "htmx と Hypermedia 駆動開発",
    body: "htmxはHTML属性だけでAJAXリクエストを記述できるライブラリ。SPAフレームワークなしで動的UIを構築する。\n\n## 基本属性\n\n- `hx-get`, `hx-post`: HTTPリクエスト\n- `hx-target`: レスポンスの挿入先\n- `hx-swap`: 挿入方法（innerHTML, outerHTML等）\n- `hx-trigger`: イベントトリガー\n\nCarson Grossの「Hypermedia Systems」が理論的背景。RESTの本来の意味（HATEOAS）への回帰。",
    tags: ["htmx", "フロントエンド", "Webフレームワーク"],
  },
  {
    title: "Astro のアイランドアーキテクチャ",
    body: "AstroはMPAフレームワーク。ページの大部分を静的HTMLとし、インタラクティブな部分のみReact/Vue/Svelteのアイランドで動的にする。デフォルトでJavaScript 0KBを実現。",
    tags: ["フロントエンド", "Webフレームワーク", "パフォーマンス"],
  },
  {
    title: "React Server Components",
    body: "コンポーネントレベルでサーバー/クライアントの境界を定義する仕組み。サーバーコンポーネントはバンドルに含まれず、DBに直接アクセスできる。Next.js 13のApp Routerで本格導入。`'use client'` ディレクティブで境界を明示する。",
    tags: ["React", "フロントエンド", "Webフレームワーク"],
  },
  {
    title: "Tailwind CSS の設計哲学",
    body: "Utility-First CSS。クラス名を組み合わせてスタイリングする。一見すると冗長だが、デザインシステムの一貫性を保ちやすく、不要CSSの除去（Purge）も自動化される。v4ではCSS-in-JSの代替としてのポジションを強化。",
    tags: ["CSS", "フロントエンド", "デザイン"],
  },
  {
    title: "LiquidJS テンプレートエンジン",
    body: "Shopifyが開発したLiquidのJavaScript実装。ロジックレスに近い設計でセキュリティリスクが低い。`{{ 変数 }}`、`{% 制御構文 %}`、フィルター `{{ name | upcase }}` の3要素で構成される。",
    tags: ["テンプレート", "Webフレームワーク"],
  },

  // ── データベース ──
  {
    title: "SQLite FTS5 による全文検索",
    body: "SQLite FTS5はtrigramトークナイザーで日本語の部分文字列マッチが可能。\n\n## セットアップ\n\n```sql\nCREATE VIRTUAL TABLE notes_fts USING fts5(\n  title, body,\n  tokenize = 'trigram'\n);\n```\n\n## 検索\n\n```sql\nSELECT * FROM notes_fts\nWHERE notes_fts MATCH '認知科学'\nORDER BY bm25(notes_fts);\n```\n\n3文字以上のクエリで実用的な品質。BM25でランキング。10万件でも数ミリ秒で検索完了。",
    tags: ["SQLite", "全文検索", "データベース"],
  },
  {
    title: "SQLite WAL モード",
    body: "WALモードで読み書きの並行実行が可能になる。`PRAGMA journal_mode=WAL` で有効化。読み取りがライター待ちにならない。",
    tags: ["SQLite", "データベース"],
  },
  {
    title: "PostgreSQL のインデックス戦略",
    body: "B-Tree（デフォルト）、GIN（全文検索・JSONB）、GiST（地理空間）、BRIN（時系列データ）を使い分ける。`EXPLAIN ANALYZE` でクエリプランを確認し、Seq Scanが出ていたらインデックス追加を検討する。部分インデックス `WHERE status = 'active'` でサイズを抑える工夫も有効。",
    tags: ["PostgreSQL", "データベース", "パフォーマンス"],
  },
  {
    title: "ORMの功罪",
    body: "ORMはCRUDの定型処理を簡潔にするが、N+1問題やクエリ最適化の難しさがつきまとう。Prisma, Drizzle, Kyselyなど型安全なクエリビルダーが台頭し、従来のActive Record系ORMとは異なるアプローチが増えている。",
    tags: ["データベース", "設計"],
  },

  // ── インフラ・デプロイ ──
  {
    title: "Docker のレイヤーキャッシュ戦略",
    body: 'Dockerfileの各命令はレイヤーとして保存される。依存インストールをアプリコードCOPYの前に配置するとキャッシュが効く。\n\n```dockerfile\nFROM node:20-slim AS builder\nWORKDIR /app\nCOPY package.json bun.lockb ./\nRUN npm install\nCOPY . .\nRUN npm run build\n\nFROM node:20-slim\nWORKDIR /app\nCOPY --from=builder /app/dist ./dist\nCOPY --from=builder /app/node_modules ./node_modules\nCMD ["node", "dist/index.js"]\n```\n\nマルチステージビルドで最終イメージサイズも削減可能。',
    tags: ["Docker", "デプロイ", "インフラ"],
  },
  {
    title: "Fly.io でのエッジデプロイ",
    body: "Dockerコンテナをエッジにデプロイ。LiteFSでSQLiteのリードレプリカを各リージョンに配置できる。SQLite + Fly.ioは小〜中規模アプリに最適な組み合わせ。",
    tags: ["デプロイ", "インフラ", "SQLite"],
  },
  {
    title: "Infrastructure as Code",
    body: "TerraformやPulumiでインフラをコード管理。再現性・バージョン管理・レビュープロセスの導入が可能。宣言的記述で望ましい状態を定義し、差分を自動適用する。Pulumiは汎用言語（TypeScript, Python等）で記述できる点がTerraformのHCLとの差別化。",
    tags: ["DevOps", "インフラ"],
  },
  {
    title: "GitHub Actions の実践パターン",
    body: "CI/CDパイプラインをYAMLで定義。マトリクスビルド、キャッシュ戦略、環境シークレット管理が重要なポイント。\n\n## よく使うパターン\n\n- PRごとにテスト・lint実行\n- mainマージでステージングにデプロイ\n- タグプッシュで本番リリース\n- `actions/cache` でnode_modulesをキャッシュ（ビルド時間50%削減）\n- Concurrency groupで同一PRの重複ビルドをキャンセル",
    tags: ["DevOps", "CI/CD"],
  },

  // ── 設計・アーキテクチャ ──
  {
    title: "ドメイン駆動設計の戦略パターン",
    body: "DDDの戦略的設計では、Bounded Context間の関係をContext Mapで表現する。\n\n## Context Mapのパターン\n\n- **Shared Kernel**: 共有するモデル・コード\n- **Customer-Supplier**: 上流が下流の要求に応じてAPI提供\n- **Anticorruption Layer**: 外部モデルから自コンテキストを保護\n- **Open Host Service**: 公開APIと標準フォーマット\n- **Separate Ways**: 統合しない選択\n\nマイクロサービスでは各サービスがBounded Contextに対応。EventStormingで境界を発見するのが効果的。",
    tags: ["DDD", "設計", "アーキテクチャ"],
  },
  {
    title: "CQRS パターン",
    body: "Command Query Responsibility Segregation。書き込みモデルと読み取りモデルを分離する。イベントソーシングと組み合わせると状態変更の完全な履歴を保持できる。",
    tags: ["DDD", "設計", "アーキテクチャ"],
  },
  {
    title: "関数型ドメインモデリング",
    body: "Scott Wlaschinの提唱。代数的データ型でドメインを表現し、不正な状態を型レベルで排除する（Make Illegal States Unrepresentable）。Railway Oriented Programmingでエラー処理を合成可能にする。TypeScriptではdiscriminated unionで近似できる。",
    tags: ["関数型プログラミング", "DDD", "設計"],
  },
  {
    title: "クリーンアーキテクチャ",
    body: "Robert C. Martin (Uncle Bob) の提唱。依存性は常に外側から内側に向かう。Entities → Use Cases → Interface Adapters → Frameworks & Drivers の4層。フレームワークやDBの選択がビジネスロジックに影響しない設計を目指す。\n\n実プロジェクトでは厳密な4層にこだわるより、「依存の方向を内側に」という原則を守ることが重要。",
    tags: ["設計", "アーキテクチャ"],
  },
  {
    title: "ADR（Architecture Decision Records）",
    body: "アーキテクチャ上の意思決定を記録するドキュメント。タイトル・状況・決定・結果の4セクションで構成。「なぜその選択をしたか」を後から追えるようにする。",
    tags: ["設計", "ドキュメント"],
  },
  {
    title: "テスト戦略とテストピラミッド",
    body: "Martin Fowlerのテストピラミッド: 下層にUnit Test（多数・高速）、中層にIntegration Test、上層にE2E Test（少数・低速）。\n\n## 実務での判断基準\n\n- ビジネスロジック → Unit Test\n- DB・API統合 → Integration Test\n- ユーザーフローの重要パス → E2E Test\n\nテストが遅い・壊れやすい場合はピラミッドのバランスが崩れている可能性が高い。テストのROIを考えて書く。",
    tags: ["テスト", "設計"],
  },

  // ── AI・機械学習 ──
  {
    title: "RAG アーキテクチャの全体像",
    body: "Retrieval-Augmented Generation（RAG）は、LLMの生成能力と外部知識検索を組み合わせる。\n\n## パイプライン\n\n1. **インデックス構築**: ドキュメント→チャンク分割→埋め込みベクトル→ベクトルDB格納\n2. **検索**: クエリを埋め込み→セマンティック検索→Top-K取得\n3. **生成**: 検索結果をプロンプトに注入→LLMが回答\n\n## Advanced RAG\n\n- Hybrid Search（ベクトル + BM25）\n- Re-ranking（Cross-encoder）\n- Parent Document Retrieval\n- Query Expansion\n\nRAGASフレームワークで自動評価可能。",
    tags: ["AI", "LLM", "アーキテクチャ"],
  },
  {
    title: "プロンプトエンジニアリング技法",
    body: "Few-shot、Chain-of-Thought、Self-Consistencyなどの技法でLLMの出力品質を改善。構造化出力（JSON mode）やツール呼び出しの設計も重要。タスク分解とプロンプトチェーンで複雑なワークフローを構築する。",
    tags: ["AI", "LLM"],
  },
  {
    title: "埋め込みベクトルとコサイン類似度",
    body: "テキストを高次元ベクトルに変換し、コサイン類似度で意味的な近さを測る。HNSWアルゴリズムで大規模データでも高速な近似最近傍検索が可能。",
    tags: ["AI", "検索", "データベース"],
  },
  {
    title: "LLM のファインチューニング vs RAG",
    body: "ファインチューニングはモデルの振る舞い（スタイル、フォーマット）を変えるのに適する。RAGは最新の知識や社内ドキュメントなど外部知識の注入に適する。多くのユースケースではRAGで十分であり、ファインチューニングは最後の手段として検討すべき。\n\n## 判断基準\n\n| 要件 | RAG | ファインチューニング |\n|------|-----|---|\n| 最新情報の反映 | ◎ | × |\n| 出力スタイルの統一 | △ | ◎ |\n| 少ないデータで開始 | ◎ | × |\n| ドメイン特化の語彙 | △ | ◎ |",
    tags: ["AI", "LLM"],
  },
  {
    title: "AIエージェントの設計パターン",
    body: "LLMをエージェントとして動かすためのパターン。ReAct（Reasoning + Acting）、Plan-and-Execute、Tool Use、Multi-Agent Collaboration など。自律的に計画を立て、ツールを使い、結果を評価して次のアクションを決める。\n\nHallucination防止のためのガードレール設計が重要。",
    tags: ["AI", "LLM", "アーキテクチャ"],
  },

  // ── セキュリティ ──
  {
    title: "OWASP Top 10 概要",
    body: "Webアプリケーションセキュリティの代表的な脅威リスト。Injection、Broken Authentication、XSS、CSRF などが含まれる。定期的に更新され、2021年版ではInsecure Design（設計段階の脆弱性）が新たに追加された。",
    tags: ["セキュリティ", "Web"],
  },
  {
    title: "JWTの仕組みと注意点",
    body: "JSON Web Token。Header.Payload.Signature の3部構成。ステートレスな認証に使われるが、トークンの失効が難しい（ブラックリスト方式が必要）、ペイロードは暗号化されない（Base64エンコードのみ）など注意点が多い。\n\n## ベストプラクティス\n\n- 有効期限を短く設定（15分程度）\n- リフレッシュトークンとの併用\n- `alg: none` 攻撃への対策\n- HttpOnly + Secure + SameSite Cookie での保存",
    tags: ["セキュリティ", "認証", "Web"],
  },
  {
    title: "Content Security Policy",
    body: "CSPはXSSなどのインジェクション攻撃を緩和するHTTPヘッダー。`script-src 'self'` でインラインスクリプトと外部スクリプトの実行を制限できる。Report-Onlyモードで影響を確認してから本番適用するのが安全。",
    tags: ["セキュリティ", "Web"],
  },

  // ── DevOps・運用 ──
  {
    title: "可観測性の3本柱",
    body: "メトリクス・ログ・トレースが可観測性（Observability）の3本柱。\n\n- **メトリクス**: 数値の時系列データ（レイテンシ、エラーレート、CPU使用率）\n- **ログ**: イベントの離散的な記録\n- **トレース**: リクエストの伝播を追跡（分散トレーシング）\n\nOpenTelemetryがベンダー中立な計装標準として普及しつつある。",
    tags: ["DevOps", "運用", "可観測性"],
  },
  {
    title: "SLI / SLO / SLA の違い",
    body: "- **SLI** (Service Level Indicator): 実測値（例: p99レイテンシ 200ms）\n- **SLO** (Service Level Objective): 内部目標（例: 可用性 99.9%）\n- **SLA** (Service Level Agreement): 顧客との契約\n\nSLOを満たせているかをエラーバジェットで管理。バジェットが枯渇したら新機能開発を止めて信頼性改善に注力する。",
    tags: ["DevOps", "運用"],
  },
  {
    title: "ポストモーテムの書き方",
    body: "障害の振り返りドキュメント。非難しない文化（blameless）が前提。\n\n## 構成\n\n1. インシデント概要（影響範囲・期間）\n2. タイムライン（検知〜復旧）\n3. 根本原因分析\n4. アクションアイテム（再発防止策）\n5. 良かった点・改善点",
    tags: ["DevOps", "運用", "ドキュメント"],
  },

  // ── 数学・アルゴリズム ──
  {
    title: "グラフ理論の基礎",
    body: "ノード（頂点）とエッジ（辺）からなるデータ構造。BFS/DFSの走査、最短経路（Dijkstra, Bellman-Ford）、最小全域木（Kruskal, Prim）が基本的なアルゴリズム。ナレッジグラフ、SNS、ルーティングなど応用範囲が広い。",
    tags: ["アルゴリズム", "グラフ理論"],
  },
  {
    title: "ハッシュテーブルの衝突解決",
    body: "チェイン法（連結リスト）とオープンアドレス法（線形探査、二次探査、ダブルハッシュ）。負荷率が高くなるとパフォーマンスが劣化するため、リサイズ戦略が重要。",
    tags: ["アルゴリズム", "データ構造"],
  },
  {
    title: "計算量のオーダー記法",
    body: "O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2^n)。実務では定数倍も大事。100万件データでO(n²)は1兆回、O(n log n)は約2000万回。",
    tags: ["アルゴリズム"],
  },

  // ── 読書メモ・書評 ──
  {
    title: "『リファクタリング』Martin Fowler",
    body: "既存コードの外部的振る舞いを保ったまま内部構造を改善する技法のカタログ。小さなステップでの変更とテストの繰り返しが核心。\n\n## 代表的なリファクタリング\n\n- Extract Function / Inline Function\n- Rename Variable\n- Replace Temp with Query\n- Introduce Parameter Object\n- Replace Conditional with Polymorphism\n\n「コードの臭い」（Code Smells）を嗅ぎ分ける嗅覚を養うことが重要。",
    tags: ["書評", "設計", "リファクタリング"],
  },
  {
    title: "『A Philosophy of Software Design』John Ousterhout",
    body: "複雑性をいかに管理するかがソフトウェア設計の本質。Deep Module（小さなインターフェース、大きな機能）を推奨し、Shallow Module（大きなインターフェース、小さな機能）を避ける。\n\n「クラスは小さくすべき」という通説に反して、ある程度の大きさのモジュールが適切な場合もあると主張している。",
    tags: ["書評", "設計"],
  },
  {
    title: "『チームトポロジー』",
    body: "4つのチームタイプ: Stream-aligned, Enabling, Complicated Subsystem, Platform。チーム間のインタラクションモード: Collaboration, X-as-a-Service, Facilitating。Conway's Lawを逆手にとり、望ましいアーキテクチャからチーム構造を設計する。",
    tags: ["書評", "組織論"],
  },

  // ── 開発プラクティス ──
  {
    title: "コードレビューのベストプラクティス",
    body: "PRは小さく保つ（300行以下が理想）。レビューでは正しさだけでなく可読性・保守性も見る。建設的なフィードバックを心がけ、「なぜ」を添えて提案する。Nit（些細な指摘）にはプレフィックスをつけて重要度を明示。",
    tags: ["開発プラクティス", "チーム開発"],
  },
  {
    title: "Git ブランチ戦略",
    body: "GitHub Flow: mainブランチ + フィーチャーブランチのシンプルな構成。Git Flow: develop, release, hotfix ブランチを持つ複雑な構成。チームの規模とリリース頻度に応じて選択する。トランクベース開発はCIに厳格な規律が必要だが、マージ地獄を回避できる。",
    tags: ["Git", "開発プラクティス", "チーム開発"],
  },
  {
    title: "モノレポ vs ポリレポ",
    body: "モノレポはコード共有と統一的なCI/CDが利点だが、リポジトリの肥大化とビルド時間の増加が課題。Turborepo, Nx, Bazelなどのビルドツールが緩和策。ポリレポはチーム独立性が高いが、パッケージの依存管理が複雑になる。",
    tags: ["開発プラクティス", "DevOps"],
  },
  {
    title: "ペアプログラミングの効用",
    body: "知識の共有、バグの早期発見、集中力の維持。コストは一見2倍だが、レビュー時間の短縮と品質向上を考慮すると総コストは同等以下という研究結果もある。リモート環境ではVS Code Live Shareが有効。",
    tags: ["開発プラクティス", "チーム開発"],
  },

  // ── デザイン・UX ──
  {
    title: "ダークモードの実装戦略",
    body: "CSS Custom Properties + `prefers-color-scheme` メディアクエリが基本。`:root` にライトテーマの変数、`[data-theme='dark']` にダークテーマの変数を定義。ユーザーのOS設定を尊重しつつ手動切替も提供する。\n\nコントラスト比はWCAG 2.1のAA基準（4.5:1）を満たすこと。",
    tags: ["CSS", "デザイン", "アクセシビリティ"],
  },
  {
    title: "アクセシビリティ（a11y）の基本",
    body: "セマンティックHTML、適切なARIAラベル、キーボードナビゲーション、十分なコントラスト比。スクリーンリーダーでの動作確認も重要。axe-coreやLighthouseで自動チェック可能だが、手動テストも必須。",
    tags: ["アクセシビリティ", "デザイン", "Web"],
  },

  // ── その他のトピック ──
  {
    title: "技術的負債の管理",
    body: "Ward Cunninghamのメタファー。意図的な負債（リリース優先のため）と意図しない負債（知識不足）がある。重要なのは負債を可視化し、計画的に返済すること。負債台帳（Tech Debt Backlog）を維持し、スプリントの20%程度を返済に充てる戦略が一般的。",
    tags: ["設計", "開発プラクティス"],
  },
  {
    title: "OSS ライセンスの基礎知識",
    body: "MIT（最も寛容）、Apache 2.0（特許条項あり）、GPL（コピーレフト、派生物もGPLにする必要）、ISC（MITとほぼ同等）。SaaSとして提供する場合はAGPLに注意。ライセンス互換性を確認してから採用する。",
    tags: ["OSS", "法務"],
  },
];

console.log("Seeding database...");

const insertNote = db.prepare("INSERT INTO notes (title, body) VALUES (?, ?) RETURNING id");
const insertTag = db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)");
const getTag = db.prepare("SELECT id FROM tags WHERE name = ?");
const insertNoteTag = db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)");

for (const sample of sampleNotes) {
  const result = insertNote.get(sample.title, sample.body) as { id: number };

  for (const tag of sample.tags) {
    insertTag.run(tag);
    const tagRow = getTag.get(tag) as { id: number };
    insertNoteTag.run(result.id, tagRow.id);
  }
}

console.log(`Created ${sampleNotes.length} notes, ${new Set(sampleNotes.flatMap((n) => n.tags)).size} tags.`);

closeDb();
