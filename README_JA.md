# reknotes

**re** + **knowledge** + **notes** — 自動分類と高速な検索を備えた個人ナレッジ管理ツール。

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](README.md) | 日本語

## What is reknotes?

reknotes はセルフホスト可能な個人向けナレッジベースです。Markdown でノートを書き、ファイルを添付すれば、埋め込みベクトルによる自動タグ付けが関連するアイデアをまとめてくれる。3D のナレッジグラフでノート同士のつながりを眺めたり、高速な検索で目的のノートに一瞬で飛べる。

## Features

- **Auto-organization** — 埋め込みベクトルの類似度でノートが自動的にタグ付けされる。手動でタグを付ける必要はない。
- **3D knowledge graph** — Three.js でノート同士のつながりを 3 次元で可視化する。
- **Markdown notes with file uploads** — Markdown でノートを書く。ファイルは S3 互換のストレージに保存できる。
- **Lightweight by design** — Bun + Hono + htmx。重量級の SPA フレームワークは使わない。
- **Run anywhere** — 手元の PC で完結して動かすこともできるし、Cloudflare + Neon にデプロイすることもできる。

## Quick Start

[Bun](https://bun.sh/) (>= 1.3) と [Docker](https://www.docker.com/) があらかじめ入っている前提。

```bash
# リポジトリを clone
git clone https://github.com/hashiiiii/reknotes.git
cd reknotes

# PostgreSQL と MinIO をコンテナで起動
docker compose -f compose.local.yaml up -d

# 依存をインストール、アセットをビルド、.env を生成、マイグレーションまで一括実行
bun run setup

# 開発サーバを起動
bun run dev
```

ブラウザで `http://localhost:3000` を開く。

## Tech Stack

- **Runtime** — [Bun](https://bun.sh/) >= 1.3、TypeScript (strict)
- **Web** — [Hono](https://hono.dev/) + [LiquidJS](https://liquidjs.com/) + [htmx](https://htmx.org/)
- **Database** — [PostgreSQL](https://www.postgresql.org/) 17 + [Drizzle ORM](https://orm.drizzle.team/)
- **Embeddings** — [HuggingFace Transformers.js](https://huggingface.co/docs/transformers.js) (local) / [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (remote)
- **Visualization** — [3D Force Graph](https://github.com/vasturiano/3d-force-graph) + [Three.js](https://threejs.org/)
- **Storage** — S3 互換: [MinIO](https://min.io/) (local) / [Cloudflare R2](https://developers.cloudflare.com/r2/) (remote)
- **Markdown** — [zenn-markdown-html](https://github.com/zenn-dev/zenn-editor)
- **Tooling** — [Biome](https://biomejs.dev/) v2

## Common Scripts

| Command | Description |
|---|---|
| `bun run dev` | 開発サーバを起動 (watch モード) |
| `bun run check` | Lint・format・型チェックをまとめて実行 |
| `bun run test` | テストを実行 |
| `bun run migrate -- <mode>` | DB マイグレーションを実行。詳細は [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md)。 |
| `bun run seed` | サンプルデータを投入 |

## Project Structure

```
├── scripts/        # CLI エントリーポイント (build, setup, seed, migration)
├── public/         # 静的アセットのソース (CSS, JS)
├── dist/           # ビルド成果物
├── docs/           # アーキテクチャ・運用ドキュメント
└── src/
    ├── index.ts    # HTTP エントリーポイント
    └── app/
        ├── domain/         # Entity と repository インターフェース
        ├── application/    # Use case と port インターフェース
        ├── infrastructure/ # アダプタと DB plumbing
        └── presentation/
            ├── routes/     # Hono ルートハンドラ
            └── views/      # LiquidJS テンプレート (layouts, pages, partials)
```

## Documentation

アーキテクチャ・デプロイ・マイグレーションの詳細は [`docs/`](./docs/) を参照。

## License

[MIT](LICENSE)
