---
name: architecture
description: src/ または scripts/ 配下のコードを書く・修正する前に、プロジェクトのアーキテクチャガイドを参照する。新しい use case / repository / port / infrastructure adapter / HTTP route handler / CLI script を追加するとき、およびレイヤー境界 (presentation / application / domain / infrastructure) をまたぐ変更のときに使う。
---

# Architecture

実装方針を確定する前に、必ず正規のアーキテクチャガイドを参照すること。確立されたレイヤード設計から外れないようにするのが目的。

このプロジェクトの **presentation 層は 2 つのエントリーポイントを持つ**：

- HTTP ルートハンドラ (`src/app/presentation/` 配下)
- CLI スクリプト (`scripts/` 配下)

どちらも application 層の use case を経由しなければならない。`domain/` や `infrastructure/` を直接呼び出してビジネスロジックを実行してはいけない。

## 手順

### 1. アーキテクチャガイドを読む

リポジトリルートの `docs/ARCHITECTURE.md` を読むこと。このファイルがレイヤー境界・依存ルール・実装パターンに関する単一の正規ソース。

### 2. 現在のタスクにルールを適用する

タスクをドキュメント化されたパターンに対応付ける:

- 変更がどのレイヤーに触れるかを特定する。`src/app/presentation/` と `scripts/` の両方を presentation 層のエントリーポイントとして扱う。
- タスクに合うパターンを選ぶ (例: use case の追加、port の導入、`infrastructure/container.ts` を経由した新規 adapter の配線、CLI スクリプトから既存 use case の呼び出し、など)。
- `scripts/` 配下の CLI スクリプトが、まだ application 層の use case として存在しない振る舞いを必要とする場合は、**先に `src/app/application/` 配下に use case を追加**してからスクリプトから呼ぶこと。スクリプトから `domain/` や `infrastructure/` に直接アクセスさせてはいけない。既存の use case があれば必ず再利用する。
- タスクがドキュメント化されたアーキテクチャと衝突しているように見える場合は、勝手に逸脱せず、ユーザーに矛盾点を報告して確認を取ること。黙って回避してはいけない。
- 自明でない設計判断を説明するときは、`docs/ARCHITECTURE.md` の該当ルールを引用すること。
