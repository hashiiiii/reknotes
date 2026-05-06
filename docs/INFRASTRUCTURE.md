# Infrastructure

## このドキュメントについて

reknotes の実行・デプロイ環境の設計をまとめたもの。「どのサービスがどこで動くか」「環境変数がどこで管理されるか」「deploy 時に何が起きるか」を扱う。具体的な設定値は一次資料 (`.env.example`、`compose.local.yaml`、`compose.remote.yaml`、`deploy.yml`、`ci.yml`) を直接参照すること。

## 用語

- **GHCR**: GitHub Container Registry。Docker image を保管する場所。
- **Caddy**: HTTPS 対応のリバースプロキシ。Let's Encrypt から TLS 証明書を自動取得する。
- **oauth2-proxy**: GitHub などの OAuth プロバイダで認証してから後段にリクエストを転送するプロキシ。
- **Neon**: マネージド PostgreSQL のサービス。
- **Cloudflare R2**: S3 互換のオブジェクトストレージ。
- **Cloudflare Workers AI**: REST API 経由で機械学習モデルを呼べる Cloudflare のサービス。

## 2 つのデプロイモード

`DEPLOYMENT` 環境変数で切り替わる。

### `DEPLOYMENT=local`

手元の PC での開発用。すべての依存サービスが手元で完結する。

| 役割 | 使うもの |
|---|---|
| DB | PostgreSQL コンテナ (`compose.local.yaml`) |
| Object Storage | MinIO コンテナ (S3 互換) |
| Embedding | HuggingFace Transformers.js による ONNX 推論 |
| Reverse proxy / 認証 | なし。`bun run dev` でホスト上のプロセスとして起動 |

### `DEPLOYMENT=remote`

外部サービスを利用し、VM 上で Docker Compose によって起動する。

| 役割 | 使うもの |
|---|---|
| DB | Neon |
| Object Storage | Cloudflare R2 |
| Embedding | Cloudflare Workers AI |
| Reverse Proxy | Caddy |
| 認証 | oauth2-proxy + GitHub OAuth App |

## 3 つの環境

`ENVIRONMENT` 環境変数で切り替わる。

| 値 | DB 接続先 (`local`) | DB 接続先 (`remote`) | 主な用途 |
|---|---|---|---|
| `development` | `reknotes_development` | `DATABASE_URL` をそのまま | 開発 |
| `test` | `reknotes_test` | `DATABASE_URL` をそのまま | `bun run test` および CI |
| `production` | `reknotes_production` | `DATABASE_URL` をそのまま | 本番 |

`local` モードでは `DATABASE_URL` のベース URL に `/reknotes_<environment>` を付与する。`remote` モードでは `DATABASE_URL` をそのまま使う (Neon 側の DB はあらかじめ作成しておく)。実装は `src/app/config.ts` の `loadConfig()`。

## サービス構成

### Application

- 単一の Hono サーバー。エントリーポイントは `src/index.ts`。
- リモート: `Dockerfile` (2-stage Bun build) で image を作って GHCR に push する。VM 側が `compose.remote.yaml` の `app` 定義に従って GHCR から pull して起動する (push 型ではなく pull 型)。
- ローカル: `bun run dev` でホスト上に直接起動する。コンテナ化しない。

### PostgreSQL

- ローカル: `compose.local.yaml` の `postgres` サービス。volume で永続化。ユーザー / パスワードはハードコード。
- リモート: Neon。`DATABASE_URL` は GitHub Secret で管理。
- スキーマ管理は Drizzle。マイグレーションは `bun run migrate`。詳細は `docs/MIGRATIONS.md`。

### Object Storage

- ローカル: MinIO (S3 互換)。コンソールは `localhost:9001`。
- リモート: Cloudflare R2 (S3 互換)。
- アプリ側は `S3_*` 環境変数の向き先しか見ない。同じ S3 互換 API なので、コードは local / remote を区別しない。

### Embedding

- ローカル: HuggingFace Transformers.js による ONNX 推論。モデルはアプリプロセス内に load される。
- リモート: Cloudflare Workers AI。`CLOUDFLARE_*` で認証。
- どちらを使うかは `DEPLOYMENT` の値に応じて `infrastructure/container.ts` が分岐する。

### Reverse Proxy + 認証 (リモートのみ)

`compose.remote.yaml` で 2 つのサービスが app の前段に並ぶ。

1. **Caddy** — `80/443` を公開する。`Caddyfile` で `{$DOMAIN} -> oauth2-proxy:4180` のリバースプロキシのみ設定。TLS 証明書は Let's Encrypt から自動取得。
2. **oauth2-proxy** — GitHub OAuth で認証し、認証済みリクエストのみ `app:3000` に転送する。許可ユーザーは `OAUTH2_PROXY_GITHUB_USER` で指定 (リモートでは `deploy.yml` がリポジトリオーナー名を自動設定)。

## 環境変数の管理

完全な変数リストとローカル用デフォルトは `.env.example` を参照。本ドキュメントは **どこで管理されるか** だけを扱う。

### ローカル

`.env` (`.env.example` から `bun run setup` でコピーされる)。`compose.local.yaml` の MinIO サービスは Compose の `${VAR}` 展開で同じ `.env` から値を読む。

### CI (`.github/workflows/ci.yml`)

`env:` セクションに **ハードコード**。PR トリガーで postgres service container を立て、`ENVIRONMENT=test` / `DEPLOYMENT=local` で migrate と test を走らせる。ストレージ系は dummy 値。

### リモート (`.github/workflows/deploy.yml`)

`workflow_dispatch` で起動し、以下を組み立てて VM 上の `~/reknotes/.env` に SCP で配置する。

- **GitHub Secrets から取得**: シークレット全般 (DB 接続文字列、ストレージの API キー、Cloudflare トークン、OAuth secret、Cookie secret など) と、デプロイ先を指す `VM_HOST` / `VM_SSH_KEY`。
- **`deploy.yml` で組み立て**: 公開情報のみ。
  - `ENVIRONMENT`: workflow input
  - `DEPLOYMENT=remote`: 固定値
  - `IMAGE_TAG`: workflow を dispatch した git ref 名 (`github.ref_name`) から組み立てた値
  - `GITHUB_REPOSITORY`: `github.repository` コンテキスト
  - `OAUTH2_PROXY_GITHUB_USER`: `github.repository_owner` コンテキスト

具体的にどの変数がどちら経由かは `deploy.yml` の `cat > /tmp/.env` ヒアドキュメントが一次資料。

## デプロイフロー

`workflow_dispatch` 起動後、`deploy.yml` が以下を順に実行する。

### 1. イメージビルド

GitHub Actions runner 上で `Dockerfile` から 2-stage build する。

### 2. GHCR push

workflow を dispatch した git ref 名 (`github.ref_name`、OCI tag に許されない `/` は `-` に置換) をそのまま image tag として GHCR に push する。

image tag を git ref に 1:1 で揃えることで、main 系の可変な ref は可変 image、release tag のような不変な ref は不変 image、という性質がそのまま GHCR 側に投影される。

### 3. マイグレーション

runner から Neon に対して `bun run migrate -- --apply` を実行する。

runner は破壊的変更 (`DROP TABLE` / `DROP COLUMN` / `SET DATA TYPE` / RENAME) を拒否する設計なので、destructive 差分を含む release は migrate ステップで deploy が止まり、コードと DB が乖離した状態に陥らない。CI 側でも PR 時点で同じ destructive チェックが走るため、destructive 変更は通常 PR レビューで気づける。詳細は `docs/MIGRATIONS.md`。

### 4. `.env` 配置

runner 上で組み立てた `.env` を SCP で VM の作業ディレクトリ (`~/reknotes/.env`) に配置する。`IMAGE_TAG` もここに含まれ、`compose.remote.yaml` の `app` 定義 (`image: ghcr.io/.../${IMAGE_TAG}`) が dispatch された ref に対応する image を pull するための入力になる。

VM に転送するのはこの `.env` だけで、Docker image は VM に直接送らない。

### 5. VM 反映

SSH で VM にログインし、以下を順に実行する。

- `git pull` (compose ファイルや Caddyfile の更新もここで反映)
- `docker compose -f compose.remote.yaml pull` で GHCR から `${IMAGE_TAG}` の image を取得
- `docker compose -f compose.remote.yaml up -d --remove-orphans` で起動
- `docker image prune` で dangling な image を削除 (タグ付き image は VM に残る)

## ドキュメント記述ルール (作成者向け)

- **設定値の完全リストは書かない**: 環境変数名・例示値・port 番号などの動きやすい数値は一次資料 (`compose.local.yaml`、`compose.remote.yaml`、`.env.example`、`deploy.yml`、`ci.yml`) を直接参照させる。本ドキュメントは「**どこに何があるか**」と「**概念とサービスの対応**」だけを扱う。
- **概念レベルの対応を主に書く**: 「`local` モードは MinIO、`remote` モードは R2」のような概念対応は腐りにくい。具体的な image タグやバージョンは書かない (バージョン更新で即腐る)。
- **行番号・関数名は書かない**: `docs/ARCHITECTURE.md` と同じ理由。
- **例外: 概念とファイルが 1:1 のものは固有名で OK**: `compose.local.yaml`、`compose.remote.yaml`、`Caddyfile`、`Dockerfile`、`.env.example`、`.github/workflows/deploy.yml` などのトップレベル設定ファイルは概念上 1 つしかないので、固有名で参照してよい。
