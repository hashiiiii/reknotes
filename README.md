# reknotes

**re** + **knowledge** + **notes** — Personal knowledge management with auto-organization and fast search.

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

English | [日本語](README_JA.md)

## What is reknotes?

reknotes is a self-hostable personal knowledge base. Write notes in Markdown, attach files, and let embedding-based auto-tagging cluster related ideas for you. Browse your notes as a 3D knowledge graph, or jump anywhere with fast search.

## Features

- **Auto-organization** — Notes are tagged automatically using embedding similarity. No manual tagging required.
- **3D knowledge graph** — Walk through how your notes connect, rendered with Three.js.
- **Markdown notes with file uploads** — Write in Markdown; attach files to any S3-compatible storage.
- **Lightweight by design** — Bun + Hono + htmx. No SPA bundle, no heavy frontend framework.
- **Run anywhere** — Self-host on your machine, or deploy to Cloudflare + Neon.

## Quick Start

You need [Bun](https://bun.sh/) (>= 1.3) and [Docker](https://www.docker.com/) installed.

```bash
# Clone the repo
git clone https://github.com/hashiiiii/reknotes.git
cd reknotes

# Start PostgreSQL and MinIO in containers
docker compose -f compose.local.yaml up -d

# Install dependencies, build assets, generate .env, run migrations
bun run setup

# Start the dev server
bun run dev
```

Open `http://localhost:3000` in your browser.

## Tech Stack

- **Runtime** — [Bun](https://bun.sh/) >= 1.3, TypeScript (strict)
- **Web** — [Hono](https://hono.dev/) + [LiquidJS](https://liquidjs.com/) + [htmx](https://htmx.org/)
- **Database** — [PostgreSQL](https://www.postgresql.org/) 17 + [Drizzle ORM](https://orm.drizzle.team/)
- **Embeddings** — [HuggingFace Transformers.js](https://huggingface.co/docs/transformers.js) (local) / [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (remote)
- **Visualization** — [3D Force Graph](https://github.com/vasturiano/3d-force-graph) + [Three.js](https://threejs.org/)
- **Storage** — S3-compatible: [MinIO](https://min.io/) (local) / [Cloudflare R2](https://developers.cloudflare.com/r2/) (remote)
- **Markdown** — [zenn-markdown-html](https://github.com/zenn-dev/zenn-editor)
- **Tooling** — [Biome](https://biomejs.dev/) v2

## Common Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start the dev server (with file watch) |
| `bun run check` | Run lint, format, and type checks |
| `bun run test` | Run tests |
| `bun run migrate -- <mode>` | Run database migrations. See [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md). |
| `bun run seed` | Insert sample data |

## Project Structure

```
├── scripts/        # CLI entry points (build, setup, seed, migration)
├── public/         # Source static assets (CSS, JS)
├── dist/           # Built assets
├── docs/           # Architecture & operational docs
└── src/
    ├── index.ts    # HTTP entry point
    └── app/
        ├── domain/         # Entities & repository interfaces
        ├── application/    # Use cases & port interfaces
        ├── infrastructure/ # Adapters & DB plumbing
        └── presentation/
            ├── routes/     # Hono route handlers
            └── views/      # LiquidJS templates (layouts, pages, partials)
```

## Documentation

For architecture, deployment, and migrations, see [`docs/`](./docs/).

## License

[MIT](LICENSE)
