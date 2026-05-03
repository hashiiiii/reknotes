# Infrastructure

このプロジェクトの実行・デプロイ環境のリファレンス。ソフトウェア設計は `docs/ARCHITECTURE.md` を、外部読者向けの概要は `README.md` を参照。

## 2 つのデプロイモード

`DEPLOYMENT` 環境変数で切り替わる。**何が動いているかが変わる** 設計上の switch。

### `DEPLOYMENT=local`

開発機での開発用。すべての依存サービスが手元で完結する。

- DB: PostgreSQL コンテナ (`compose.local.yaml`)
- ストレージ: MinIO コンテナ (同上、S3 互換)
- Embedding: HuggingFace Transformers.js による ONNX 推論 (アプリプロセス内)
- リバースプロキシ・認証: なし。`bun run dev` でホスト上のプロセスとして起動

### `DEPLOYMENT=remote`

本番運用用。外部マネージドサービスを利用し、VM 上で Docker Compose によって起動する。

- DB: Neon (マネージド PostgreSQL)
- ストレージ: Cloudflare R2 (S3 互換)
- Embedding: Cloudflare Workers AI (REST API)
- リバースプロキシ: Caddy (TLS 自動取得)
- 認証: oauth2-proxy + GitHub OAuth App

## 3 つの環境

`ENVIRONMENT` 環境変数で切り替わる。データベースを分離するための switch。

| 値 | DB 接続先 (`local` 時) | DB 接続先 (`remote` 時) | 主な用途 |
|---|---|---|---|
| `development` | `reknotes_development` | `DATABASE_URL` をそのまま | ローカル開発 |
| `test` | `reknotes_test` | `DATABASE_URL` をそのまま | `bun run test` および CI |
| `production` | `reknotes_production` | `DATABASE_URL` をそのまま | 本番 |

`local` モードでは `DATABASE_URL` のベース URL に `/reknotes_<environment>` を付与する。`remote` モードでは `DATABASE_URL` をそのまま使う (Neon の DB はあらかじめ作成しておく)。実装は `src/app/config.ts` の `loadConfig()`。

## サービス構成

### Application

- 単一の Hono サーバー。エントリーポイントは `src/index.ts`。
- 本番では `Dockerfile` (2-stage Bun build) でイメージをビルドし、GHCR に push してから VM 上の `compose.remote.yaml` で `app` サービスとして起動する。
- ローカルでは `bun run dev` でホスト上に直接起動し、コンテナ化しない。

### PostgreSQL

- ローカル: `compose.local.yaml` の `postgres` サービス。volume で永続化。ユーザー / パスワードはハードコード。
- 本番: Neon (マネージド)。`DATABASE_URL` は GitHub Secret で管理。
- スキーマ管理: Drizzle。マイグレーションは `bun run migrate` で application 層の use case 経由で実行 (詳細は `docs/ARCHITECTURE.md`)。

### オブジェクトストレージ

- ローカル: MinIO (S3 互換)。コンソールは `localhost:9001`。
- 本番: Cloudflare R2 (S3 互換)。
- アプリ側は `S3_*` 環境変数の向き先しか見ない。同じ S3 互換 API なのでコードは local / remote を区別しない。

### Embedding

- ローカル: HuggingFace Transformers.js による ONNX 推論。モデルはアプリプロセス内に load される。
- 本番: Cloudflare Workers AI。`CLOUDFLARE_*` で認証。
- どちらを使うかは `DEPLOYMENT` で `infrastructure/container.ts` が分岐 (詳細は `docs/ARCHITECTURE.md` の DI セクション)。

### リバースプロキシ + 認証 (`remote` のみ)

`compose.remote.yaml` で 2 つのサービスが app の前段に並ぶ:

1. **Caddy** — `80/443` で公開。`Caddyfile` で `{$DOMAIN} → oauth2-proxy:4180` のリバースプロキシのみ。TLS 証明書は Let's Encrypt から自動取得。
2. **oauth2-proxy** — GitHub OAuth で認証し、認証済みリクエストのみ `app:3000` に転送。許可ユーザーは `OAUTH2_PROXY_GITHUB_USER` で指定 (本番では `deploy.yml` がリポジトリオーナー名を自動設定)。

## 環境変数の管理

完全な変数リストとローカル用デフォルトは `.env.example` を参照。本ドキュメントでは **どこで管理されるか** だけを扱う。

原則: **真に機密な値だけ GitHub Secrets に置き、公開可能な値は `deploy.yml` にハードコードする。**

### ローカル開発

`.env` (`.env.example` から `bun run setup` でコピー)。`compose.local.yaml` の MinIO サービスは Compose の `${VAR}` 展開で同じ `.env` から値を読む。

### CI (`.github/workflows/ci.yml`)

`env:` セクションに **ハードコード**。PR トリガーで postgres service container を立て、`ENVIRONMENT=test` / `DEPLOYMENT=local` で migrate と test を走らせる。ストレージ系は dummy 値。

### 本番デプロイ (`.github/workflows/deploy.yml`)

`workflow_dispatch` で起動し、以下を組み立てて VM 上の `~/reknotes/.env` に SCP で配置する:

- **GitHub Secrets から取得**: 機密値全般 (DB 接続文字列、ストレージの API キー、Cloudflare トークン、OAuth secret、Cookie secret) と、デプロイ先を指す `VM_HOST` / `VM_SSH_KEY`。
- **`deploy.yml` で組み立て**: 公開情報のみ。`ENVIRONMENT` は workflow input、`DEPLOYMENT=remote` は固定値、`GITHUB_REPOSITORY` は `github.repository` コンテキスト、`OAUTH2_PROXY_GITHUB_USER` は `github.repository_owner` コンテキストから。

具体的にどの変数がどちら経由かは `deploy.yml` の `cat > /tmp/.env` ヒアドキュメントが一次資料。

## デプロイフロー

`workflow_dispatch` 起動後、`deploy.yml` が以下を順に実行:

1. **イメージビルド**: `Dockerfile` で 2-stage build。
2. **GHCR push**: `ghcr.io/<owner>/<repo>:<branch>` と `ghcr.io/<owner>/<repo>:<environment>` の 2 タグ。後者は `compose.remote.yaml` の `app` サービスが pull する固定タグ。
3. **VM 配信**: SSH で VM にログイン → `git pull` (compose ファイルや Caddyfile の更新もここで反映) → `docker compose -f compose.remote.yaml pull` → `docker compose -f compose.remote.yaml up -d --remove-orphans` → `docker image prune`。
4. **マイグレーション**: app コンテナ起動時の自動実行はされない。スキーマ変更を伴うリリースでは `docker compose -f compose.remote.yaml run --rm app bun run migrate -- --apply` を手動実行する想定。

## このドキュメントを保守する原則

ドキュメント自身が時間とともに腐らないように、新しいルールを追記するときは以下に従う (`docs/ARCHITECTURE.md` の保守原則と同じ思想)。

- **設定値の完全リストは書かない**: 環境変数名・例示値・port 番号などの動きやすい数値は `compose.local.yaml`、`compose.remote.yaml`、`.env.example`、`deploy.yml`、`ci.yml` といった一次資料を直接参照させる。本ドキュメントは「**どこに何があるか**」と「**概念とサービスの対応**」だけを扱う。
- **概念レベルの対応を主に書く**: 「`local` モードは MinIO、`remote` モードは R2」のような概念対応は腐りにくい。具体的な image タグやバージョンは書かない (バージョン更新で即腐る)。
- **行番号・関数名は書かない**: `docs/ARCHITECTURE.md` と同じ理由。
- **例外: 概念とファイルが 1:1 のものは固有名で OK**: `compose.local.yaml`、`compose.remote.yaml`、`Caddyfile`、`Dockerfile`、`.env.example`、`.github/workflows/deploy.yml` などのトップレベル設定ファイルは概念上ただ 1 つしかないので固有名で参照してよい。
