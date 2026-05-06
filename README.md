# reknotes

**re** + **knowledge** + **notes** — A personal knowledge management tool that makes you want to revisit your past notes. Visual graph-based knowledge representation, fast search, ML-powered auto-tagging, and full online/offline support.

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

English | [日本語](README_JA.md)

## What is reknotes?

reknotes is a self-hostable personal knowledge management tool built around making you want to revisit notes you wrote in the past. Every time you open the 3D knowledge graph, it recommends past notes for you, naturally sparking the feeling of "what did I write about that? let me take a look." ML-powered auto-tagging clusters related notes on the graph, so opening one note quietly pulls you into related ones before you realize it. Run it offline on your own machine, or online with services like Cloudflare + Neon.

## Features

- **Auto-organization** — Notes are tagged automatically based on embedding similarity, so you don't have to think about tags when writing.
- **3D knowledge graph** — Visualizes how your notes connect in 3D using [Three.js](https://github.com/mrdoob/three.js/).
- **Markdown notes with file uploads** — Write notes in Markdown with [Zenn-flavored syntax](https://zenn.dev/zenn/articles/markdown-guide). Images and other files are stored on S3-compatible storage.
- **Lightweight by design** — Built on Bun + Hono + htmx.
- **Run anywhere** — Run it on your own machine, or deploy it to services like Cloudflare + Neon.

## Quick Start

Install [Bun](https://bun.sh/) (>= 1.3) and [Docker](https://www.docker.com/). Make sure Docker is running.

```bash
# clone
git clone https://github.com/hashiiiii/reknotes.git
cd reknotes

# Start PostgreSQL and MinIO in containers
docker compose -f compose.local.yaml up -d

# Install dependencies, build assets, generate .env, run migrations
bun run setup

# Start the local server
bun run dev
```

Open `http://localhost:3000` in your browser.

## Tech Stack

- **Runtime** — [Bun](https://bun.sh/) >= 1.3, TypeScript (strict)
- **Web** — [Hono](https://hono.dev/) + [LiquidJS](https://liquidjs.com/) + [htmx](https://htmx.org/)
- **Database** — [PostgreSQL](https://www.postgresql.org/) 17 + [Drizzle ORM](https://orm.drizzle.team/)
- **Embeddings** — [HuggingFace Transformers.js](https://huggingface.co/docs/transformers.js) (local) / e.g. [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) (remote)
- **Visualization** — [3D Force Graph](https://github.com/vasturiano/3d-force-graph) + [Three.js](https://threejs.org/)
- **Storage** — S3-compatible: [MinIO](https://min.io/) (local) / e.g. [Cloudflare R2](https://developers.cloudflare.com/r2/) (remote)
- **Markdown** — [zenn-markdown-html](https://github.com/zenn-dev/zenn-editor)
- **Tooling** — [Biome](https://biomejs.dev/) v2

## Common Scripts

| Command | Description |
|---|---|
| `bun run dev` | Starts the local server. |
| `bun run check` | Runs lint, format, and type checks. |
| `bun run test` | Runs tests. |
| `bun run migrate -- <mode>` | Runs database migrations. See [`docs/MIGRATIONS.md`](./docs/MIGRATIONS.md) for details. |
| `bun run seed` | Inserts sample data. |

## Project Structure

```
├── scripts/                # CLI (build, setup, seed, migration)
├── public/                 # Static assets (CSS, JS)
├── dist/                   # Built assets
├── docs/                   # Documentation
└── src/
    ├── index.ts            # HTTP entry point
    └── app/
        ├── domain/         # Entities and repository interfaces
        ├── application/    # Use cases and port interfaces
        ├── infrastructure/ # Adapters connecting to external systems (Storage, DB)
        └── presentation/
            ├── routes/     # Hono route handlers
            └── views/      # LiquidJS templates (layouts, pages, partials)
```

## Documentation

For details on architecture, deployment, migrations, and more, see [`docs/`](./docs/).

## License

[MIT](LICENSE)
