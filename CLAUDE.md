# CLAUDE.md

@./README.md

## Architecture

Layered architecture. Dependencies always flow inward.

```
Presentation → Application → Domain ← Infrastructure
```

- One file per use case (application layer)
- Domain has zero external dependencies — pure functions only
- DI via function arguments + `infrastructure/container.ts` singleton (no DI framework)
- Interfaces owned by the consuming layer (repositories → `domain/`, ports → `application/port/`)

## Environment Variables

- `DEPLOYMENT`: Switches embedding implementation (`remote` → Cloudflare Workers AI / otherwise → local ONNX)
- `ENVIRONMENT`: Isolates databases (`test` → reknotes_test / `development` → reknotes_development)

## Code Conventions

- Tag names are always lowercase and trimmed (`normalizeTagName()`)
- Tests use a real database (no mocks). `ENVIRONMENT=test` connects to the test DB
- Japanese comments are acceptable
- Biome: space indent, line width 120

## Database

Tables: `notes`, `tags`, `note_tags` (many-to-many, CASCADE delete)
Schema: `src/app/infrastructure/db/schema.ts`
