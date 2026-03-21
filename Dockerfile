FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY public/ public/

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/knowmap.sqlite

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
