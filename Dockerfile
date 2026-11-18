FROM oven/bun:1.4.4-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS base
# The pinned Bun image predates available Debian security fixes for apt and zlib.
RUN apt-get update && apt-get upgrade --yes && rm -rf /var/lib/apt/lists/*

# The remote app uses Cloudflare for embeddings. The CPU runtime is included in the ONNX package.
ARG ONNXRUNTIME_NODE_INSTALL=skip

FROM base AS build
WORKDIR /app

# Install dependencies before copying source so source edits can reuse this layer.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ src/
COPY public/ public/
COPY scripts/ scripts/

RUN bun run build

# A separate stage keeps build-only dependencies out of the runtime image.
FROM base
WORKDIR /app
RUN chown bun:bun /app
USER bun

COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist dist/

COPY public/ public/
COPY src/ src/
COPY scripts/ scripts/
COPY drizzle.config.ts ./

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
