# ── Build stage ──
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ src/
COPY public/ public/
COPY lib/ lib/

RUN bun run build

# ── Production stage ──
FROM oven/bun:1
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY --from=build /app/dist dist/
COPY public/ public/

# マイグレーション用ファイル（docker compose run --rm app bun run lib/migrate.ts で実行）
COPY drizzle.config.ts ./
COPY src/app/infrastructure/db/schema.ts src/app/infrastructure/db/
COPY lib/migrate.ts lib/

# ENVIRONMENT と DEPLOYMENT は実行時に外部から設定する
EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]
