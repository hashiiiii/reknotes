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
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY --from=build /app/dist dist/

# ENVIRONMENT と DEPLOYMENT は実行時に外部から設定する
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
