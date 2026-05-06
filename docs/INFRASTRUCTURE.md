# Infrastructure

このプロジェクトの実行・デプロイ環境などのインフラ設計を記述したもの。

## 2 つのデプロイモード

`DEPLOYMENT` 環境変数で切り替わる。

### `DEPLOYMENT=local`

手元の PC による開発用。すべての依存サービスが手元で完結する。

- DB: PostgreSQL コンテナ (`compose.local.yaml`)
- Object Storage: MinIO コンテナ (S3 互換)
- Embedding: HuggingFace Transformers.js による ONNX 推論
- Reverse Proxy・Authentication: なし。`bun run dev` でホスト上のプロセスとして起動

### `DEPLOYMENT=remote`

外部サービスを利用し、VM 上で Docker Compose によって起動する。

- DB: Neon (マネージド PostgreSQL)
- Object Storage: Cloudflare R2 (S3 互換)
- Embedding: Cloudflare Workers AI (REST API)
- Reverse Proxy: Caddy (TLS 自動取得)
- Authentication: oauth2-proxy + GitHub OAuth App

## 3 つの環境

`ENVIRONMENT` 環境変数で切り替わる。

| 値 | DB 接続先 (`local` 時) | DB 接続先 (`remote` 時) | 主な用途 |
|---|---|---|---|
| `development` | `reknotes_development` | `DATABASE_URL` をそのまま | 開発 |
| `test` | `reknotes_test` | `DATABASE_URL` をそのまま | `bun run test` および CI |
| `production` | `reknotes_production` | `DATABASE_URL` をそのまま | 本番 |

`local` モードでは `DATABASE_URL` のベース URL に `/reknotes_<environment>` を付与する。`remote` モードでは `DATABASE_URL` をそのまま使う (Neon の DB はあらかじめ作成しておく)。実装は `src/app/config.ts` の `loadConfig()`。

## サービス構成

### Application

- 単一の Hono サーバー。エントリーポイントは `src/index.ts`。
- リモートでは `Dockerfile` (2-stage Bun build) でイメージをビルドして GHCR に push し、VM 側が `compose.remote.yaml` の `app` サービス定義に従って GHCR から pull して起動する (push 型ではなく pull 型)。
- ローカルでは `bun run dev` でホスト上に直接起動し、コンテナ化しない。

### PostgreSQL

- ローカル: `compose.local.yaml` の `postgres` サービス。volume で永続化。ユーザー / パスワードはハードコード。
- リモート: Neon (マネージド)。`DATABASE_URL` は GitHub Secret で管理。
- スキーマ管理: Drizzle。マイグレーションは `bun run migrate` で実行。

### Object Storage

- ローカル: MinIO (S3 互換)。コンソールは `localhost:9001`。
- リモート: Cloudflare R2 (S3 互換)。
- アプリ側は `S3_*` 環境変数の向き先しか見ない。同じ S3 互換 API なのでコードは local / remote を区別しない。

### Embedding

- ローカル: HuggingFace Transformers.js による ONNX 推論。モデルはアプリプロセス内に load される。
- リモート: Cloudflare Workers AI。`CLOUDFLARE_*` で認証。
- どちらを使うかは `DEPLOYMENT` で `infrastructure/container.ts` が分岐。

### Reverse Proxy + Authentication

`compose.remote.yaml` で 2 つのサービスが app の前段に並ぶ。

1. **Caddy** — `80/443` で公開。`Caddyfile` で `{$DOMAIN} → oauth2-proxy:4180` のリバースプロキシのみ。TLS 証明書は Let's Encrypt から自動取得。
2. **oauth2-proxy** — GitHub OAuth で認証し、認証済みリクエストのみ `app:3000` に転送。許可ユーザーは `OAUTH2_PROXY_GITHUB_USER` で指定 (リモートでは `deploy.yml` がリポジトリオーナー名を自動設定)。

## 環境変数の管理

完全な変数リストとローカル用デフォルトは `.env.example` を参照。本ドキュメントでは **どこで管理されるか** だけを扱う。

### ローカル

`.env` (`.env.example` から `bun run setup` でコピー)。`compose.local.yaml` の MinIO サービスは Compose の `${VAR}` 展開で同じ `.env` から値を読む。

### CI (`.github/workflows/ci.yml`)

`env:` セクションに **ハードコード**。PR トリガーで postgres service container を立て、`ENVIRONMENT=test` / `DEPLOYMENT=local` で migrate と test を走らせる。ストレージ系は dummy 値。

### リモート (`.github/workflows/deploy.yml`)

`workflow_dispatch` で起動し、以下を組み立てて VM 上の `~/reknotes/.env` に SCP で配置する:

- **GitHub Secrets から取得**: シークレット全般 (e.g. DB 接続文字列、ストレージの API キー、Cloudflare トークン、OAuth secret、Cookie secret) と、デプロイ先を指す `VM_HOST` / `VM_SSH_KEY`。
- **`deploy.yml` で組み立て**: 公開情報のみ。`ENVIRONMENT` は workflow input、`DEPLOYMENT=remote` は固定値、`IMAGE_TAG` は workflow を dispatch した git ref 名 (`github.ref_name`) から組み立てた値、`GITHUB_REPOSITORY` は `github.repository` コンテキスト、`OAUTH2_PROXY_GITHUB_USER` は `github.repository_owner` コンテキストから。

具体的にどの変数がどちら経由かは `deploy.yml` の `cat > /tmp/.env` ヒアドキュメントが一次資料。

## デプロイフロー

`workflow_dispatch` 起動後、`deploy.yml` が以下を順に実行:

1. **イメージビルド**: GitHub Actions の runner 上で `Dockerfile` から 2-stage build。
2. **GHCR push**: workflow を dispatch した git ref 名 (`github.ref_name`、OCI tag に許されない `/` は `-` に置換) をそのまま image tag として GHCR に push する。image tag を git ref に 1:1 で揃えることで、main 系の可変な ref は可変 image、release tag のような不変な ref は不変 image、という性質がそのまま GHCR 側に投影される。
3. **マイグレーション**: runner から Neon に対して `bun run migrate -- --apply` を実行する。runner が破壊的変更 (`DROP TABLE` / `DROP COLUMN` / `SET DATA TYPE` / RENAME) を拒否する設計なので、destructive 差分を含むリリースは migrate ステップで deploy が止まり、コードと DB が乖離した状態に陥らない。CI 側でも PR 時点で同じ destructive チェックが走るため、destructive 変更は通常 PR レビューで気づける。アトミック性、冪等性、destructive 変更の運用フローなど詳細は `docs/MIGRATIONS.md`。
4. **`.env` 配置**: runner 上で組み立てた `.env` を SCP で VM の作業ディレクトリ (`~/reknotes/.env`) に配置。`IMAGE_TAG` もここに含まれ、`compose.remote.yaml` の `app` サービス定義 (`image: ghcr.io/.../${IMAGE_TAG}`) が dispatch された ref に対応する image を pull するための入力になる。VM に転送するのはこの `.env` だけで、Docker イメージは VM に直接送らない。
5. **VM 反映**: SSH で VM にログイン → `git pull` (compose ファイルや Caddyfile の更新もここで反映) → `docker compose -f compose.remote.yaml pull` で GHCR から `${IMAGE_TAG}` で指された image を取得 → `docker compose -f compose.remote.yaml up -d --remove-orphans` → `docker image prune` (dangling のみ。タグ付き image は VM に残る)。

## Rules

- **設定値の完全リストは書かない**: 環境変数名・例示値・port 番号などの動きやすい数値は `compose.local.yaml`、`compose.remote.yaml`、`.env.example`、`deploy.yml`、`ci.yml` といった一次資料を直接参照させる。本ドキュメントは「**どこに何があるか**」と「**概念とサービスの対応**」だけを扱う。
- **概念レベルの対応を主に書く**: 「`local` モードは MinIO、`remote` モードは R2」のような概念対応は腐りにくい。具体的な image タグやバージョンは書かない (バージョン更新で即腐る)。
- **行番号・関数名は書かない**: `docs/ARCHITECTURE.md` と同じ理由。
- **例外: 概念とファイルが 1:1 のものは固有名で OK**: `compose.local.yaml`、`compose.remote.yaml`、`Caddyfile`、`Dockerfile`、`.env.example`、`.github/workflows/deploy.yml` などのトップレベル設定ファイルは概念上ただ 1 つしかないので固有名で参照してよい。
