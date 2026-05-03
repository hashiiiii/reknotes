# CLAUDE.md

@./README.md

## Architecture

@./docs/ARCHITECTURE.md

Layered architecture. Dependencies always flow inward. See `docs/ARCHITECTURE.md` for the deep reference.

```
Presentation → Application → Domain ← Infrastructure
```

- One file per use case (application layer)
- Domain has zero external dependencies — pure functions only
- DI via function arguments through `infrastructure/container.ts` factories
- Interfaces: `I*Repository` lives in `domain/`, `I*Provider` lives in `application/port/`
- `scripts/` and `src/app/presentation/` are both presentation-layer entry points; both must call use cases rather than reaching into `domain/` or `infrastructure/` directly
