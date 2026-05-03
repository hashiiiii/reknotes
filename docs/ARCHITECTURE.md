# Architecture

このプロジェクトで採用しているレイヤード設計の詳細リファレンス。要約版は `CLAUDE.md` にある。本ドキュメントはそれを展開したものであり、両者の内容が食い違った場合はこちらが正となる。

```
Presentation → Application → Domain ← Infrastructure
```

依存方向は常に内側 (`domain/` 方向)。`domain/` はプロジェクト内の他の `domain/` ファイル以外を import しない。

## レイヤー

### Domain (`src/app/domain/`)

- 純粋な型と純粋な関数のみ。外部依存は一切なし (DB、Hono、Node API、サードパーティパッケージ、すべて不可)。
- **エンティティ型**を持つ (`Note`、`Tag`、`Graph`)。
- **リポジトリインターフェース**を持つ — エンティティに対する永続化契約。エンティティと同じ場所に配置する: `domain/note/note-repository.ts`。
- **ドメイン純粋関数**を持つ — ビジネス用語で表現される小さな計算 (`resolveTitle`、`findDestructive`、`checksum`)。

### Application (`src/app/application/`)

- **Use case**: 1 ユースケース 1 ファイル。動詞 - 名詞の命名：`create-note.ts`、`apply-migration.ts`、`list-notes.ts`。複合 use case (`create-note-with-tags.ts`) も use case の一つであり、内部でより小さい use case を呼び出す。
- **Port** (`application/port/`): application が呼び出す技術的能力を記述するインターフェース — embedding、storage、migration、hook discovery、schema sync など。`I` プレフィックスを付ける (`IStorageProvider`)。
- **Test**: use case と同じ場所に `<feature>.test.ts` として配置する。
- **Other**: 同じ feature フォルダ内の複数の use case で共有される型・ヘルパは、`_<noun>.ts` のようにアンダースコア prefix を付けて配置する (例：`migration/_result.ts`)。verb-noun の use case ファイルと視覚的に区別するため。

### Infrastructure (`src/app/infrastructure/`)

配置先は **「実装するインターフェースがどのレイヤーで宣言されているか」** で決まる：

- **`repositories/`**: `domain/*/I*Repository` の実装。命名は `<implementation>-<entity>-repository.ts` (例: `drizzle-note-repository.ts`）。
- **`providers/`**: `application/port/I*Provider` の実装。命名は `<implementation>-<port>-provider.ts` (例: `cloudflare-embedding-provider.ts`、`s3-storage-provider.ts`、`postgres-migration-provider.ts`)。
- **`db/`**: repository でも provider でもない、infrastructure 内部の plumbing。`schema.ts` (Drizzle スキーマ定義) と `index.ts` (接続構築) のみ。**他の adapter から共有される基盤コード専用の例外フォルダ** であり、ここに新しい責務を増やす前に「これは provider として表現できないか？」を必ず検討する。
- **`container.ts`**: DI を担う唯一のファイル — 「Dependency Injection」セクションを参照。

### Presentation

Presentation 層とは **外部入力を受け取り、どの use case を呼び出すかを決定するもの全般** を指す。二つの呼び出し元がある:

- **HTTP エントリ**: `src/app/presentation/routes/<feature>.ts`。Hono ハンドラ。依存は `c.var.*` 経由で受け取る (`src/app/index.ts` のミドルウェアでセットされる)。
- **CLI エントリ**: `scripts/<name>.ts` および `scripts/<group>/<name>.ts`。依存はファイル冒頭で container のファクトリを呼んで取得する。エントリーポイントのガードには `import.meta.main` を使う (`scripts/migration/migrate.ts` を参照)。

**ビジネス処理は use case を呼んで行う**。use case が既にカプセル化している処理を、`domain/` のリポジトリや `application/` の port を直接呼んで実行してはいけない。`container.ts` 以外のどこからも `infrastructure/` に手を伸ばしてはいけない。

## インターフェースの所有

二種類のインターフェースとその配置場所:

| インターフェース種別 | 配置場所 | ルール |
|---|---|---|
| Repository | `domain/<entity>/<entity>-repository.ts` | ドメインエンティティに対する永続化契約 — エンティティと結びついているため、エンティティと同じ場所に置く。 |
| Port | `application/port/<name>-provider.ts` | application が呼び出す技術的能力 — ドメインモデルの一部ではない。 |

簡単な判別法:「これはドメインエンティティを永続化するための仕組みか？」 → repository、`domain/` に配置。「これは application が呼び出す技術サービスか？」 → port、`application/port/` に配置。

両者とも `I` プレフィックスを付ける (`INoteRepository`、`IEmbeddingProvider`)。

## Dependency Injection

`src/app/infrastructure/container.ts` が具象実装を構築する唯一のファイル。`create<Thing>(config)` 形式のファクトリ関数を export する。

- **シングルトン**: 高コストな共有リソース (DB 接続、embedding provider、storage provider)。プロセス内のすべての呼び出し元で再利用される。
- **トランジェント**: 軽量なラッパー (リポジトリ、migration provider)。呼び出しごとに作り直されるが、シングルトンの DB に乗っかる。
- **分岐**は config 駆動 (`config.deployment === "remote"` で `CloudflareEmbeddingProvider` と `LocalEmbeddingProvider` を切り替え)。分岐は container 内部にのみ存在し、use case には決して書かない。

設定は `src/app/config.ts` の `loadConfig()` で読み込む。すべてのエントリーポイント (`src/index.ts` の HTTP エントリ、各 CLI スクリプト) は同じ起動パターンに従う: `loadConfig() → container ファクトリ → use case 呼び出し`。

## テスト

- テストは **本物の PostgreSQL** インスタンスに対して実行する — `ENVIRONMENT=test` で `reknotes_test` に接続する。DB のモックは使わない。
- テストファイルは `loadConfig()` + container ファクトリ経由で依存を取得する。本番と同じ経路。`src/app/application/note/note.test.ts:11-14` が標準的なセットアップ。
- テストは use case の隣に `<feature>.test.ts` として配置する。

## 禁止パターン

- `domain/` から `domain/` 外のものを import すること。
- `application/` から `infrastructure/` を import すること（application は自身の `port/` 配下の **インターフェース** に依存し、adapter には依存しない）。
- `presentation/` や `scripts/` から `infrastructure/` の具象クラスを直接 import すること。常に `container.ts` のファクトリ経由にする。
- HTTP ルートや CLI スクリプトが、use case に委譲せずビジネスロジックを実行すること。スクリプトが必要とする振る舞いがまだ use case として存在しない場合は、先に `application/` 配下に use case を追加してから呼ぶ。
- テストでリポジトリや DB をモック化すること。
