# reknotes

**re** + **know** + **notes** — Personal knowledge management with auto-organization and fast search.

## Stack

- [Bun](https://bun.sh/) (>= 1.3)
- [Hono](https://hono.dev/) — Web framework
- HTML + [Liquid](https://liquidjs.com/) templates
- TypeScript (strict)
- [Biome](https://biomejs.dev/) (lint / format)
- [SQLite](https://www.sqlite.org/) (bun:sqlite) — FTS5 full-text search
- [htmx](https://htmx.org/) — Dynamic UI without SPA
- [Cytoscape.js](https://js.cytoscape.org/) — Knowledge graph visualization
- [zenn-markdown-html](https://github.com/zenn-dev/zenn-editor) (Markdown rendering)

## Setup

```bash
bun install
bun run migrate
```

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server (watch mode) |
| `bun run migrate` | Run database migrations |
| `bun run seed` | Insert sample data |

## Pages

| Route | Description |
|---|---|
| `/` | Home — post and browse notes |
| `/search` | Full-text search (FTS5 trigram) |
| `/graph` | Knowledge map (force-directed graph) |
| `/notes/:id` | Note detail with mini-graph |

## Docker

```bash
docker compose up
```

## Project Structure

```
├── lib/                # Scripts (seed data)
├── public/             # Static assets (CSS, JS)
│   ├── css/            # style.css, zenn.css
│   └── js/             # htmx, force-graph, graph.js
└── src/
    ├── db/             # SQLite schema + connection
    ├── routes/         # Hono route handlers
    ├── services/       # Business logic (notes, search, graph, AI)
    ├── types/          # TypeScript type definitions
    └── views/          # Liquid templates
        ├── layouts/    # base.liquid
        ├── pages/      # Full page templates
        └── partials/   # Reusable components
```

## License

[MIT](LICENSE)
