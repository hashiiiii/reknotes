# Architecture

## このドキュメントについて

reknotes のソースコードのレイヤー構成と依存ルールをまとめたもの。新しいコードをどこに置けばよいか迷ったときに参照する。

## 全体像

依存方向は常に内側 (`domain/` 方向) を向く。

```
Presentation -> Application -> Domain <- Infrastructure
```

- 内側のレイヤーは外側を知らない (= import しない)。
- `domain/` はプロジェクト内の他の `domain/` ファイル以外を一切 import しない。

## Layer

### Domain (`src/app/domain/`)

ビジネスの中心となる純粋な型と純粋な関数を置く。

- 外部依存は一切なし (DB、HTTP、ファイル I/O などを使わない)。
- Entity の型を定義する (例: `Note`、`Tag`、`Graph`)。
- Repository インターフェース (`I*Repository`) を定義する。
- 純粋関数を定義する (例: タイトル抽出、破壊的変更の検出、チェックサム計算)。

### Application (`src/app/application/`)

Domain を組み合わせてユースケースを実現する。

- **Use case**: 1 ユースケース 1 ファイル。命名は `<verb>-<noun>.ts` パターン。複合的な処理は内部で他の use case を呼び出してよい。
- **Port**: `application/port/<name>-provider.ts` `I*Provider` として定義する。Infrastructure が提供する技術的機能の抽象。
- **Test**: use case と同じ場所に `<feature>.test.ts` として配置する。
- **共有ユーティリティ**: 同じ feature フォルダ内の複数 use case で共有される型や関数は、`_<noun>.ts` のようにアンダースコア prefix を付けて配置する。verb-noun の use case ファイルと視覚的に区別するため。

### Infrastructure (`src/app/infrastructure/`)

外部世界 (DB、外部 API、ファイル I/O) との接続を担う。配置先は **実装するインターフェースがどのレイヤーで宣言されているか** で決まる。

- **`repositories/`**: `domain/*/I*Repository` の実装。命名は `<implementation>-<entity>-repository.ts`。
- **`providers/`**: `application/port/I*Provider` の実装。命名は `<implementation>-<port>-provider.ts`。
- **`db/`**: repository でも provider でもない、Infrastructure 内部の plumbing。`schema.ts` (Drizzle スキーマ定義) と `index.ts` (DB 接続処理) のみ。**他の adapter から共有される基盤コード専用の例外フォルダ** であり、ここに新しい責務は基本増やさない。増やしたくなった場合は provider として表現できないかをまず検討する。
- **`container.ts`**: DI を担う唯一のファイル。詳細は後述。

### Presentation

外部からの入力を受け取り、どの use case を呼び出すかを決定するレイヤー。エントリーポイントは 2 種類ある。

- **HTTP**: `src/app/presentation/routes/<feature>.ts`。Hono のハンドラ。依存は `c.var.*` 経由で受け取る (`src/app/index.ts` のミドルウェアでセットされる)。
- **CLI**: `scripts/<name>.ts` および `scripts/<group>/<name>.ts`。依存はファイル冒頭で container のファクトリを呼んで取得する。エントリーポイント判定には `import.meta.main` を使う。

**ビジネスロジックは必ず use case を経由して呼び出す。** Presentation 層から `domain/` の repository や `application/` の port を直接呼んではいけない。`infrastructure/` への直接アクセスも `container.ts` 以外からは禁止。

## Interface

reknotes には 2 種類のインターフェースがある。

| 種類 | 配置場所 | 役割 |
|---|---|---|
| Repository | `domain/<entity>/<entity>-repository.ts` | Domain Entity の永続化契約。Entity と結びついているので同じ場所に置く。 |
| Port | `application/port/<name>-provider.ts` | Application から Infrastructure の技術的機能を呼び出すための抽象。ドメインモデルではない。 |

判別の目安:

- ドメインエンティティを永続化するための仕組み -> Repository。`domain/` に配置。
- Application が呼び出す技術的機能 -> Port。`application/port/` に配置。

両者とも `I` プレフィックスを付ける (例: `INoteRepository`、`IEmbeddingProvider`)。

## Dependency Injection

`src/app/infrastructure/container.ts` は具象実装を構築する **唯一のファイル**。`create<Thing>(config)` 形式のファクトリ関数を export する。

- **Singleton**: 高コストな共有リソース (例: DB 接続、embedding provider)。プロセス内のすべての呼び出し元で再利用される。
- **Transient**: 呼び出しごとにインスタンスを生成する。
- 環境による分岐 (local / remote など) は `container.ts` の中だけで行う。use case や presentation 層には絶対に書かない。

設定は `src/app/config.ts` の `loadConfig()` で読み込む。すべてのエントリーポイント (HTTP の `src/index.ts`、各 CLI スクリプト) は同じ起動パターンに従う。

```
loadConfig() -> container ファクトリ -> use case 呼び出し
```

## Test

- 可能な限りモック・スタブは使わない。
- DB は **本物の PostgreSQL** を使う。`ENVIRONMENT=test` で `reknotes_test` に接続する。
- テストファイルも `loadConfig()` + container ファクトリ経由で依存を取得する。本番と同じ経路を通す。
- テストは use case の隣に `<feature>.test.ts` として配置する。

## ドキュメント記述ルール (作成者向け)

このドキュメント自身が時間とともに古くならないよう、新しいルールを追記するときは以下に従う。

- 具体ファイル名 (`create-note.ts`) ではなく、`<verb>-<noun>.ts` のようなパターン記法を優先する。
- `<file>:<line>` のような行番号参照は書かない。1 編集で腐るため。
- 例外: 概念とファイルが 1:1 のものは固有名で OK。例えば `infrastructure/container.ts` (DI の唯一の場所) や `src/app/config.ts` の `loadConfig()` など。
