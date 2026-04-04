# CLAUDE.md

reknotes — ナレッジ管理アプリ。自動タグ付け・全文検索・3Dグラフ可視化。

## Tech Stack

- **Runtime**: Bun (>=1.3) / TypeScript (strict, ESNext)
- **Web**: Hono v4 + LiquidJS テンプレート + htmx (SPA ではない)
- **DB**: PostgreSQL 17 + Drizzle ORM
- **Embedding**: HuggingFace Transformers (ONNX: embeddinggemma-300m q8) / Cloudflare Workers AI
- **Storage**: S3互換 (Cloudflare R2 / MinIO)
- **Frontend**: zenn-markdown-html + 3d-force-graph + Three.js
- **Lint/Format**: Biome v2 (space indent, line width 120)
- **Test**: bun:test

## Architecture

レイヤードアーキテクチャ。依存の方向は常に内側へ。

```
Presentation → Application → Domain ← Infrastructure
```

- **Presentation** (`src/app/presentation/`) — Hono ルート、HTTP I/O のみ
- **Application** (`src/app/application/`) — ユースケース、1ファイル1ユースケース
- **Domain** (`src/app/domain/`) — エンティティ・純粋関数・リポジトリインターフェース。外部依存ゼロ
- **Infrastructure** (`src/app/infrastructure/`) — DB・embedding・storage の実装

DI は関数引数渡し + `infrastructure/container.ts` シングルトン。フレームワーク不使用。

## Key Environment Variables

- `DEPLOYMENT`: embedding 実装切り替え (`remote` → Cloudflare Workers AI / それ以外 → ローカル ONNX)
- `ENVIRONMENT`: DB 分離 (`test` → reknotes_test DB / `development` → reknotes_development DB)

## Commands

```bash
bun install          # 依存インストール
bun test             # テスト実行 (実DB接続、モック不使用)
bun run check        # Biome lint/format + tsc --noEmit
bun run build        # フロントエンドアセットビルド
bun run migrate      # Drizzle マイグレーション実行
```

## Code Conventions

- インターフェースは所有者レイヤーに配置 (リポジトリ → domain/, ポート → application/port/)
- Domain 層は外部依存ゼロ。純粋関数で表現
- タグ名は常に小文字・トリム済み (`normalizeTagName()`)
- 日本語コメント OK

## Database

テーブル: `notes`, `tags`, `note_tags` (多対多、CASCADE delete)
スキーマ定義: `src/app/infrastructure/db/schema.ts`
