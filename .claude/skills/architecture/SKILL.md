---
name: architecture
description: src/ または scripts/ 配下のコードを書く前に参照すべき設計ガイドライン。
---

# 1. 設計ガイドラインを読む

`@./docs/ARCHITECTURE.md` を読むこと。

# 2. 現在のタスクにルールを適用する

- 変更がどのレイヤーに触れるかを特定する。
  - `src/app/presentation/` と `scripts/` の両方を presentation 層のエントリーポイントとして扱う。
- タスクに合うパターンを選ぶ (e.g. use case の追加、port の導入、CLI スクリプトから既存 use case の呼び出し)。
- `scripts/` 配下の CLI スクリプトが、まだ application 層の use case として存在しない振る舞いを必要とする場合は、**先に `src/app/application/` 配下に use case を追加** してからスクリプトから呼ぶこと。スクリプトから `domain/` や `infrastructure/` に直接アクセスさせてはいけない。既存の use case があれば必ず再利用する。
- タスクが設計ガイドラインを違反しているように見える場合は、ユーザーにその点を報告して確認を取ること。
- 自明でない設計判断を説明するときは `docs/ARCHITECTURE.md` の該当ルールを引用すること。
