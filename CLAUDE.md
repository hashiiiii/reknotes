# CLAUDE.md

プロジェクト概要・スタック・コマンドは README.md を参照。
ここには Claude が開発作業する上で知るべきルールと内部構造を記載する。

## Architecture

レイヤードアーキテクチャ。依存の方向は常に内側へ。

```
Presentation → Application → Domain ← Infrastructure
```

- 1ファイル1ユースケース (application 層)
- Domain は外部依存ゼロ。純粋関数で表現
- DI は関数引数渡し + `infrastructure/container.ts` シングルトン。フレームワーク不使用
- インターフェースは所有者レイヤーに配置 (リポジトリ → `domain/`, ポート → `application/port/`)

## Environment Variables

- `DEPLOYMENT`: embedding 実装切り替え (`remote` → Cloudflare Workers AI / それ以外 → ローカル ONNX)
- `ENVIRONMENT`: DB 分離 (`test` → reknotes_test / `development` → reknotes_development)

## Code Conventions

- タグ名は常に小文字・トリム済み (`normalizeTagName()`)
- テストは実 DB 接続 (モック不使用)。`ENVIRONMENT=test` で test DB を使用
- 日本語コメント OK
- Biome: space indent, line width 120

## Database

テーブル: `notes`, `tags`, `note_tags` (多対多、CASCADE delete)
スキーマ定義: `src/app/infrastructure/db/schema.ts`
