FROM oven/bun:1-slim AS build
WORKDIR /app

# Docker は各行ごとにキャッシュを持っているため、コピー元のファイルに変更がなければそのレイヤーは実行されない。
# package.json や bun.lock は頻繁には変わらないので、ソースだけ変えた時に bun install がスキップされて高速になる。
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ src/
COPY public/ public/
COPY scripts/ scripts/

# 成果物は dist/ に配置される想定
RUN bun run build

# ステージを分けることで、build にしか必要ない dev dependencies を最終 image から除外する。
# production stage では --production オプション付きで再 install する。
FROM oven/bun:1-slim
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist dist/

# 実行時に必要なものをコピーする
COPY public/ public/
COPY src/ src/
COPY scripts/ scripts/
COPY drizzle.config.ts ./

# ENVIRONMENT と DEPLOYMENT は実行時に外部から設定する
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
