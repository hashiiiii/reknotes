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
- [force-graph](https://github.com/vasturiano/force-graph) — Knowledge graph visualization
- [zenn-markdown-html](https://github.com/zenn-dev/zenn-editor) (Markdown rendering)

## Setup

```bash
bun install
```

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server (watch mode) |
| `bun run start` | Start production server |
| `bun run seed` | Insert sample data |

## Pages

| Route | Description |
|---|---|
| `/` | Home — post and browse notes |
| `/search` | Full-text search (FTS5 trigram) |
| `/graph` | Knowledge map (force-directed graph) |
| `/tags` | Tag cloud |
| `/tags/:name` | Notes filtered by tag |
| `/notes/:id` | Note detail with backlinks and mini-graph |

## AI Integration (optional)

Set `AI_PROVIDER` in `.env` to enable auto-tagging and auto-linking on note creation.

| Provider | Config |
|---|---|
| Ollama (local) | `AI_PROVIDER=ollama` `OLLAMA_URL=http://localhost:11434` |
| OpenAI | `AI_PROVIDER=openai` `OPENAI_API_KEY=sk-...` |
| None (default) | Falls back to FTS5-based similar note detection |

See `.env.example` for all options.

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
