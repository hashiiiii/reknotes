# Architecture

```
Presentation → Application → Domain ← Infrastructure
```

依存方向は常に内側 (`domain/` 方向)。`domain/` はプロジェクト内の他の `domain/` ファイル以外を import しない。

## Layer

### Domain (`src/app/domain/`)

- 純粋な型と純粋な関数のみ。
- 外部依存は一切なし。
- Entity として型を定義する (e.g. `Note`、`Tag`、`Graph`)。
- Repository I/F (`I*Repository`) を定義する。
- 純粋関数を定義する (e.g. タイトル抽出、破壊的変更検出、チェックサム計算)。

### Application (`src/app/application/`)

- **Use case**: 1 ユースケース 1 ファイル。命名は `<verb>-<noun>.ts` パターン。複合的な処理を表す use case は内部でより小さい use case を呼び出してよい。
- **Port**: `application/port/<name>-provider.ts` — `I*Provider` として定義する。インフラレイヤーで提供されるモジュールの抽象化表現であるべき。
- **Test**: use case と同じ場所に `<feature>.test.ts` として配置する。
- **Utility**: 同じ feature フォルダ内の複数の use case で共有される型や関数は、`_<noun>.ts` のようにアンダースコア prefix を付けて配置する。verb-noun の use case ファイルと視覚的に区別するため。

### Infrastructure (`src/app/infrastructure/`)

配置先は **実装するインターフェースがどのレイヤーで宣言されているか** で決まる。

- **`repositories/`**: `domain/*/I*Repository` の実装。命名は `<implementation>-<entity>-repository.ts`。
- **`providers/`**: `application/port/I*Provider` の実装。命名は `<implementation>-<port>-provider.ts`。
- **`db/`**: repository でも provider でもない、infrastructure 内部の plumbing。`schema.ts` (Drizzle スキーマ定義) と `index.ts` (DB との接続処理) のみ。**他の adapter から共有される基盤コード専用の例外フォルダ** であり、ここに新しい責務は基本増えない。もし増やす必要が生まれた場合は provider として表現できないかを必ず検討する。
- **`container.ts`**: DI を担う唯一のファイル。

### Presentation

Presentation 層とは **外部入力を受け取り、どの use case を呼び出すかを決定するもの** を指す。二つの呼び出し元がある:

- **HTTP**: `src/app/presentation/routes/<feature>.ts`。Hono ハンドラ。依存は `c.var.*` 経由で受け取る (`src/app/index.ts` のミドルウェアでセットされる)。
- **CLI**: `scripts/<name>.ts` および `scripts/<group>/<name>.ts`。依存はファイル冒頭で container のファクトリを呼んで取得する。エントリーポイントのガードには `import.meta.main` を使う。

**ビジネスロジックは use case を叩くことで実現する**。use case が既にカプセル化している処理を、`domain/` のリポジトリや `application/` の port を直接呼んで実行してはいけない。`container.ts` 以外のどこからも `infrastructure/` に手を伸ばしてはいけない。

## Interface

二種類のインターフェースとその配置場所:

| 種類 | 配置場所 | ルール |
|---|---|---|
| Repository | `domain/<entity>/<entity>-repository.ts` | Domain Entity に対する永続化契約。Entity と結びついているため、同じ場所に置く。 |
| Port | `application/port/<name>-provider.ts` | Application から Infrastructure レイヤーの技術的機能を呼び出すための抽象パターン。ドメインモデルではない。 |

簡単な判別方法としては

- これはドメインエンティティを永続化するための仕組みか？ → repository、`domain/` に配置。
- これは application が呼び出す技術的機能か？ → port、`application/port/` に配置。

両者とも `I` プレフィックスを付ける (e.g. `INoteRepository`、`IEmbeddingProvider`)。

## Dependency Injection

`src/app/infrastructure/container.ts` が具象実装を構築する唯一のファイル。`create<Thing>(config)` 形式のファクトリ関数を export する。

- **Singleton**: 高コストな共有リソース (e.g. DB 接続、embedding provider)。プロセス内のすべての呼び出し元で再利用される。
- **Transient**: 呼び出しごとにインスタンスが生成される。
- 引数として受け取った config によって環境による違いを分岐処理。分岐は container 内部にのみ存在し、use case には決して書かない。

設定は `src/app/config.ts` の `loadConfig()` で読み込む。すべてのエントリーポイント (`src/index.ts` の HTTP エントリ、各 CLI スクリプト) は同じ起動パターンに従う: `loadConfig() → container ファクトリ → use case 呼び出し`。

## Test

- 可能な限りモック・スタブは使わない。
- テストに利用する DB は **本物の PostgreSQL** インスタンス
  - `ENVIRONMENT=test` で `reknotes_test` に接続する。
- テストファイルは `loadConfig()` + container ファクトリ経由で依存を取得する。本番と同じ経路。
- テストは use case の隣に `<feature>.test.ts` として配置する。

## Rules

ドキュメント自身が時間とともに腐らないように、新しいルールを追記するときは以下に従う。

- 具体ファイル名 (`create-note.ts`) より `<verb>-<noun>.ts` のようなパターン記法を優先する。
- 行番号は書かない `<file>:<line>` のような行番号参照は 1 編集で腐る。
- 例外として、概念とファイルが 1:1 のものは固有名で OK。`infrastructure/container.ts` (DI の唯一の場所)、`src/app/config.ts` の `loadConfig()` など。
