# reknotes

**re** + **knowledge** + **notes** — 過去のナレッジをもう一度開きたくなるパーソナルナレッジ管理ツール。ビジュアルグラフによるナレッジ表現、高速な検索、機械学習モデルによる自動タグ付け、オンライン・オフラインの両方に対応しています。

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

[English](README.md) | 日本語

## What is reknotes?

reknotes は「過去に書いたノートをもう一度開きたくなる」ことを軸にしたセルフホスト可能なパーソナルナレッジ管理ツールです。3D のナレッジグラフを開く度に過去のノートをレコメンドしてくれるので、「何を書いたんだっけ、開いてみようか」という気持ちが自然と湧く作りになっています。機械学習モデルによる自動タグ付けがされることで、ナレッジグラフ上では関連するノートがまとまり、1 つのノートを開くと気づいたら関連ノートを見てしまうような導線を用意しています。手元の PC でオフラインに動かすことも、Cloudflare + Neon のようなサービスでオンラインに運用することもできます。

## Features

- **Auto-organization** — 埋め込みベクトルの類似度でノートが自動でタグ付けされるため、ノート作成時にタグを意識する必要が無いです。
- **3D knowledge graph** — [Three.js](https://github.com/mrdoob/three.js/) でノート同士のつながりを 3 次元で可視化します。
- **Markdown notes with file uploads** — [Zenn 記法](https://zenn.dev/zenn/articles/markdown-guide) を用いて Markdown でノートを書く事ができます。画像等は S3 互換のストレージに保存します。
- **Lightweight by design** — Bun + Hono + htmx を採用しました。
- **Run anywhere** — 手元の PC で完結して動かすこともできるし、Cloudflare + Neon のようなサービスにデプロイすることもできます。

## Quick Start

[Bun](https://bun.sh/) (>= 1.3) と [Docker](https://www.docker.com/) をそれぞれインストールしてください。Docker は起動までしておいてください。

```bash
# clone
git clone https://github.com/hashiiiii/reknotes.git
cd reknotes

# PostgreSQL と MinIO をコンテナで起動
docker compose -f compose.local.yaml up -d

# 依存のインストール、アセットのビルド、.env の生成、マイグレーション
bun run setup

# ローカルでサーバーを起動
bun run dev
```

ブラウザで `http://localhost:3000` を開いてください。

## Tech Stack

- **Runtime** — [Bun](https://bun.sh/) >= 1.3、TypeScript (strict)
- **Web** — [Hono](https://hono.dev/) + [LiquidJS](https://liquidjs.com/) + [htmx](https://htmx.org/)
- **Database** — [PostgreSQL](https://www.postgresql.org/) 17 + [Drizzle ORM](https://orm.drizzle.team/)
- **Embeddings** — [HuggingFace Transformers.js](https://huggingface.co/docs/transformers.js) (local) / e.g. [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (remote)
- **Visualization** — [3D Force Graph](https://github.com/vasturiano/3d-force-graph) + [Three.js](https://threejs.org/)
- **Storage** — S3 互換: [MinIO](https://min.io/) (local) / e.g. [Cloudflare R2](https://developers.cloudflare.com/r2/) (remote)
- **Markdown** — [zenn-markdown-html](https://github.com/zenn-dev/zenn-editor)
- **Tooling** — [Biome](https://biomejs.dev/) v2

## Common Scripts

| Command | Description |
|---|---|
| `bun run dev` | ローカルでサーバーを起動します。 |
| `bun run check` | Lint・format・型チェックをまとめて実行します。 |
| `bun run test` | テストを実行します。 |
| `bun run migrate -- <mode>` | DB マイグレーションを実行します。詳細は [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md) を参照してください。 |
| `bun run seed` | サンプルデータを投入します。 |

## Project Structure

```
├── scripts/                # CLI (build, setup, seed, migration)
├── public/                 # 静的アセット (CSS, JS)
├── dist/                   # ビルド成果物
├── docs/                   # ドキュメント
└── src/
    ├── index.ts            # HTTP エントリーポイント
    └── app/
        ├── domain/         # Entity と repository I/F
        ├── application/    # Use case と port I/F
        ├── infrastructure/ # 外部 (Storage, DB) との接続を担うアダプター群
        └── presentation/
            ├── routes/     # Hono ルートハンドラー
            └── views/      # LiquidJS テンプレート (layouts, pages, partials)
```

## Documentation

アーキテクチャ・デプロイ・マイグレーション等の詳細は [`docs/`](./docs/) を参照してください。

## License

[MIT](LICENSE)
