# Backup

## このドキュメントについて

reknotes の災害復旧 (DR) を目的としたバックアップ機構の運用ドキュメント。バックアップの実行方式、復旧手順、復旧 drill のやり方をまとめる。

## 目的と方針

managed Postgres (Neon など) や S3 互換ストレージ (R2 など) の障害でノート資産を全損するリスクを下げる。

- **対象**: ノート本文と紐づく画像
- **方式**: **別ベンダー (Backblaze B2)** への日次フルスナップショット
- **保持期間**: 30 日 (lifecycle で自動削除)
- **コスト**: B2 free tier (10GB) と GitHub Actions free tier に収まる範囲

### なぜ別ベンダーか

primary を Cloudflare (R2 + Neon) に集約しているので、backup を同一アカウントの別 bucket に置くと以下のシナリオで道連れになる:

| シナリオ | Neon (DB) | R2 (primary) | 同 R2 アカウントの backup |
|---|---|---|---|
| R2 のリージョン障害 | 生 | 死 | **死** |
| Neon の障害 | 死 | 生 | 生 (DB ダンプは R2 にあるので復旧可) |
| 両方落ちる | 死 | 死 | **死** |
| Cloudflare アカウント凍結 / 侵害 | 生 | 死 | **死** |

backup を Cloudflare 外 (= Backblaze B2) に置けば、R2 やアカウント単位の障害でも backup は生存する。Neon と R2 はもともと別ベンダーなので、DB と primary S3 が両方落ちるのはほぼアカウント侵害シナリオに限られる。

## 構成

各日 1 つの自己完結したスナップショットを `<date>/` 以下に置く。差分管理はせず、毎日 primary 全体をコピーする。

```
GitHub Actions (daily cron, 03:00 JST)
  └─ scripts/backup/dump.ts (db upload と object upload は並行実行)
       - pg_dump --format=plain | gzip       ->  B2 bucket/<date>/db.sql.gz
       - R2 全 object をそのまま upload      ->  B2 bucket/<date>/objects/<key>

Backblaze B2 backup bucket (lifecycle rule)
  - bucket 全体を 30 日後に自動削除
```

db upload と object upload は並行で走る。pg_dump は REPEATABLE READ snapshot を取った時刻 t (= 取得時刻) のテーブル状態を出力し、object 側も ~t で primary list を開始するので、両者がカバーする時刻がほぼ揃う。これにより「dump が参照しているのに backup に無いオブジェクト」が発生する race 窓が最小化される。逐次 (dump → object) だと t から list 開始までに削除された object がレースになり、逆順 (object → dump) だと list 後に new upload された object を dump が参照する形のレースが起きる。

B2 は AWS S3 互換 API を提供しているので、`@aws-sdk/client-s3` をそのまま使い回せる (`BACKUP_S3_ENDPOINT` を B2 のエンドポイントに向けるだけ)。

## ファイル参照の一貫性 (なぜ復旧が単純か)

ノート本文に保存される画像参照は `/api/files/<filename>` という**内部ルート**で、`<filename>` がそのまま S3 のキーになる (`src/app/application/file/_file-url.ts`)。DB に bucket 名や S3 URL は含まれない。

このため復旧時はオブジェクトを target bucket の root にコピーし、アプリの `S3_BUCKET_NAME` を target bucket に向ければ動く。本文や DB の書き換えは不要。

## 環境変数

`bun run dump` / `bun run restore` も他のスクリプトと同じ `loadConfig()` を使うので、`.env.example` に並ぶ primary 用の env (DATABASE_URL / S3_* / CLOUDFLARE_*) を一通り設定しておく必要がある。backup / restore で固有なのは下表の変数だけ。

### backup 固有 (dump / restore 共通)

| 変数 | 用途 | 備考 |
|---|---|---|
| `BACKUP_S3_BUCKET_NAME` | backup bucket 名 | `S3_BUCKET_NAME` と同じ値だとエラー (lifecycle で復旧データが消える) |
| `BACKUP_S3_ENDPOINT` | backup 側エンドポイント | 本番は B2 の S3 互換 endpoint。ローカルは backup 用 MinIO のエンドポイント |
| `BACKUP_S3_ACCESS_KEY_ID` | backup 用 application key ID | 本番は B2 の application key |
| `BACKUP_S3_SECRET_ACCESS_KEY` | backup 用 application key secret | 同上 |

いずれも **必須**。primary と backup は物理的に別環境であるべきという原則を強制するため、ローカルでも `S3_*` からの fallback はしない。

本番では B2 が primary とは別ベンダーなので、token は必然的に分離される (R2 の token で B2 を読めないし、その逆も無理)。app container が侵害されても backup を破壊できない (write 権限を付けなければ)。

### restore 固有

なし。restore は他のスクリプトと同じ `loadConfig()` の値をそのまま使う (= `DATABASE_URL` が復旧先 DB、`S3_*` が復旧先 bucket = 新 primary)。災害時は先に GitHub Secrets を新 infra に向けて deploy workflow を回し、その時点で VM 上の `.env` が新値になっているので、`bun run restore --date <YYYY-MM-DD>` を打つだけでよい。詳細は[restore (本番障害時)](#restore-本番障害時)。

## 初回セットアップ (人間がやる作業)

### Backblaze B2 側

1. [Backblaze](https://www.backblaze.com/) アカウントを作成 (B2 Cloud Storage を有効化)。
2. **Buckets** -> **Create a Bucket**:
   - Bucket Unique Name: 推奨 `reknotes-backup` (= [GitHub Secrets に追加](#github-secrets-に追加) する `BACKUP_S3_BUCKET_NAME` と一致させる。グローバル一意なので衝突すれば prefix を足す)
   - Files in Bucket are: **Private**
   - Default Encryption: Disable (アプリ側で機密扱いしていない素直なバックアップなので任意)
3. **Lifecycle Settings** -> Custom rule で 1 つだけ:
   - File Path: `*` (bucket 全体)
   - Hide files after: 30 days
   - Delete hidden files after: 1 day
   - (= 約 30 日後にオブジェクトが完全消去される)
4. **Application Keys** -> **Add a New Application Key**:
   - Name: `reknotes-backup-rw`
   - Allow access to Bucket(s): `reknotes-backup` のみに制限
   - Type of Access: **Read and Write**
   - 発行された **keyID** / **applicationKey** / **S3 Endpoint** をメモ
5. S3 Endpoint は `https://s3.<region>.backblazeb2.com` の形 (バケット詳細画面の "Endpoint" 欄に表示される)。

### GitHub Secrets に追加

| Secret 名 | 値 |
|---|---|
| `BACKUP_S3_ENDPOINT` | B2 の S3 endpoint (例: `https://s3.us-west-001.backblazeb2.com`) |
| `BACKUP_S3_ACCESS_KEY_ID` | B2 application keyID |
| `BACKUP_S3_SECRET_ACCESS_KEY` | B2 applicationKey |
| `BACKUP_S3_BUCKET_NAME` | `reknotes-backup` (= 上で作った bucket 名) |

bucket 名は機密ではないがハードコードもしていない (= 別名にしたくなった時に Secret 1 つ書き換えれば済むようにしている)。

### VM (本番) の事前準備

本番障害時の restore は VM host で `bun run restore` を叩く運用 ([restore (本番障害時)](#restore-本番障害時))。app container (`oven/bun:1-slim`) には docker CLI が無く、`pg_dump` / `psql` を `docker run` で呼ぶ実装上、container 内では走らない。よって VM host 側に bun と node_modules を 1 回だけ揃えておく:

```bash
# VM に SSH した上で 1 回だけ
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc   # PATH を反映 (or 再 login)
cd ~/reknotes && bun install --frozen-lockfile
```

VM 上の `~/reknotes` は deploy workflow が `git pull` するリポジトリと scp された `.env` が同居しているので、これで `cd ~/reknotes && bun run restore ...` が `.env` を自動 load して動く。`bun.lock` が更新された後は `bun install --frozen-lockfile` の再実行が必要 (現状 deploy workflow は VM 側で `bun install` を走らせない)。

### retention (30 日 / 14 日 / 7 日) の選び方

backup 容量 ≒ primary bucket の容量 × retention 日数。B2 free tier (10GB) に収めるには:

| primary 容量 | 30 日 | 14 日 | 7 日 |
|---|---|---|---|
| ~300MB | OK | OK | OK |
| ~700MB | NG | OK | OK |
| ~1.5GB | NG | NG | OK |

primary が膨らんで free tier を超えそうになったら、B2 ダッシュボードで lifecycle ルールの日数を縮める。コード変更不要。

## 実行手順

### ローカル

`compose.local.yaml` は primary 用 (`minio`) と backup 用 (`minio-backup`) の 2 つの MinIO を立ち上げる。本番の "primary と backup は別環境" の構造をローカルでも再現するため。

| サービス | API ポート | console ポート | 認証 (`.env.example` 既定) |
|---|---|---|---|
| `minio` (primary) | `9000` | `9001` | `reknotes` / `reknotes` |
| `minio-backup` | `9002` | `9003` | `reknotes-backup` / `reknotes-backup` |

#### 前提

`bun run setup` は `.env` 作成と git hooks 設定のみで bucket は自動作成しない。事前に手作業で:

1. `docker compose -f compose.local.yaml up -d` で primary / backup の MinIO と Postgres を起動。
2. primary MinIO の console (<http://localhost:9001>) にログインして `reknotes` bucket を作成。
3. backup MinIO の console (<http://localhost:9003>) にログインして `reknotes-backup` bucket を作成。

#### dump

`.env` の `S3_*` (primary MinIO) から読み取り、`BACKUP_S3_*` (backup MinIO) に書き出す。

```bash
bun run dump
```

backup bucket に `<日付>/db.sql.gz` と `<日付>/objects/<キー>` が出来ていれば成功。

#### restore

restore は接続先 DB が**存在**していて、かつ**テーブルが無い**状態を前提とする。dump は `pg_dump --format=plain --no-owner --no-privileges` 出力 ([pg-database-backup-provider.ts](file:///Users/hashiiiii/workspace/reknotes/src/app/infrastructure/providers/pg-database-backup-provider.ts)) で `CREATE TABLE ...` から始まる SQL なので、target が空でないと `relation already exists` で落ち、target が無いと `database does not exist` で接続に失敗する (`--create` を付けていないので dump 自体に `CREATE DATABASE` は無い)。

primary を再利用したい (= `.env` の `DATABASE_URL` が指す `reknotes_development` に書き戻したい) なら、先に DB ごと作り直す:

```bash
docker compose -f compose.local.yaml exec postgres \
  psql -U reknotes -d postgres \
  -c 'DROP DATABASE "reknotes_development" WITH (FORCE); CREATE DATABASE "reknotes_development";'
```

`-d postgres` で**管理 DB 側に接続して** target を drop → create する (Postgres は現在自分が繋いでいる DB を drop できない。`WITH (FORCE)` は他セッションを切る Postgres 13+ の構文)。続けて:

```bash
bun run restore --date 2026-05-13
```

`bun run migrate --apply` を挟む必要は無い (dump 内の `CREATE TABLE ...` が schema を作り、migration 履歴の `_hooks_applied` テーブルも dump に含まれる)。むしろ先に migrate するとテーブルが出来てしまい restore が `relation already exists` で詰まる。

primary を壊したくないなら別 DB / 別 bucket を立てる[復旧 drill](#復旧-drill-半年に-1-度推奨) を使う (drill の `docker run` で `-e POSTGRES_DB=reknotes_development` を渡すので、コンテナ起動時点で空の target DB が出来る)。

### 本番

#### dump

GitHub Actions の `Backup` workflow (`.github/workflows/backup.yml`) が毎日 18:00 UTC (= 03:00 JST) に走り、B2 bucket にスナップショットを upload する。手動で走らせたい場合は GitHub Actions UI から `Run workflow` (workflow_dispatch) で `ENVIRONMENT` を選択して起動。

#### restore (本番障害時)

新しい Postgres インスタンスと新しい R2 bucket を用意し、**両方とも空であることを確認する**。

VM 上の `.env` は deploy workflow が scp で上書きするので、SSH で手編集してもデプロイで戻る。env の更新は必ず GitHub Secrets 経由で行う。

```
1. 障害検知
2. 新 DB と新 R2 bucket をプロビジョン
   - Neon は新プロジェクト作成時に default DB を空で同時に作成し、その DB を指す接続
     URL をダッシュボードに表示する。手動で CREATE DATABASE を打つ必要は無い。
   - ローカル restore で必要だった DROP/CREATE 操作の代わりに、本番では「新プロジェクト
     を切る」行為そのものが空 DB の準備を兼ねている。
3. GitHub Secrets を更新
   - DATABASE_URL   = 新 DB の URL (Neon ダッシュボードからコピー)
   - S3_BUCKET_NAME = 新 bucket 名 (例: reknotes-restored)
   - 必要なら S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY も
   - BACKUP_S3_* は変更しない (B2 は生きているので)
4. Deploy workflow を手動実行
   → CI が新 .env を VM に scp、container を up -d --remove-orphans
   → app は起動するがデータは空の状態
5. SSH で VM に入り、~/reknotes で restore を実行
   $ cd ~/reknotes
   $ bun run restore --date 2026-05-13
   → ~/reknotes/.env (= app と同じ env) を bun が自動 load し、B2 から新 R2 と新 DB に復元
6. 動作確認 → 終わり
```

step 5 のあとに container 再起動は不要。app は request 毎に DB/S3 を読むので、restore で populate した瞬間からデータが見える。

restore は VM host で叩く想定 ([VM (本番) の事前準備](#vm-本番-の事前準備) で bun を入れておくこと)。app container 内には docker CLI が無く、`pg_dump` / `psql` の起動に失敗するので `docker compose exec app` 経由では動かない。

なお `bun run migrate --apply` の `ensureDatabaseExists()` は `DEPLOYMENT=remote` 時は no-op で抜けるよう実装されている ([postgres-migration-provider.ts:23-24](file:///Users/hashiiiii/workspace/reknotes/src/app/infrastructure/providers/postgres-migration-provider.ts))。これは「managed Postgres では DB の出自はサービス側の provisioning が握っていて、アプリ側が `CREATE DATABASE` を発行する権限も妥当性も無い」という前提のため。ローカルでだけ「`POSTGRES_DB` を渡していないので postgres image が default で `reknotes` DB を作ってしまう。アプリが欲しいのは `reknotes_development` なのでアプリ側で作る」という補正が走る、という非対称になっている。

restore.ts は `loadConfig()` の `DATABASE_URL` / `S3_*` を復旧先として書き込む。step 3-4 で deploy workflow が `.env` を新 infra に向け終わっていることが前提なので、その手順を飛ばすと**旧 (= 死んでいる) infra に向かって restore しようとしてエラーになるか、最悪まだ生きている旧 bucket に書き戻して状態を壊す**。先に Secrets 更新 → deploy する手順を厳守すること。

#### B2 自体が落ちている場合

本ドキュメントで想定する最も厳しいケース。primary が R2 + Neon、backup が B2 と完全に独立しているので「B2 単体障害」は restore 経路だけが詰まる状態。B2 ダッシュボードが復旧するまで待つしかない。primary は生きているので app の運用継続は可能。

## 復旧 drill (半年に 1 度推奨)

実施しないと「いざという時に動かない」状態になりがち。本番 env は触らず、ローカルで env を override して回す。primary を破壊しないために、復旧先用に別 Postgres と別 bucket を用意する点が[ローカル restore](#restore) との違い。

```bash
# 1. 復旧先用の空 Postgres を host port 5434 で立てる (primary は 5433 占有)。
#    DB 名は loadConfig() の "DEPLOYMENT=local だと /reknotes_<env> を append" に合わせる。
docker run --rm -d --name reknotes-drill-pg \
  -p 5434:5432 \
  -e POSTGRES_USER=reknotes -e POSTGRES_PASSWORD=reknotes \
  -e POSTGRES_DB=reknotes_development \
  postgres:18

# 2. primary 用 MinIO の console (http://localhost:9001) で復旧先 bucket
#    `reknotes-restored` を作成 (drill 間で再利用するなら毎回空にすること)。

# 3. 最新の backup を B2 から、復旧先に流し込む。
#    primary 側の S3_* はローカル MinIO primary、BACKUP_S3_* は本番 B2 を指す。
#    既存 .env の primary S3_BUCKET_NAME / DATABASE_URL を上書きするのが重要。
DEPLOYMENT=local \
ENVIRONMENT=development \
DATABASE_URL=postgres://reknotes:reknotes@localhost:5434 \
S3_ENDPOINT=http://localhost:9000 \
S3_ACCESS_KEY_ID=reknotes \
S3_SECRET_ACCESS_KEY=reknotes \
S3_BUCKET_NAME=reknotes-restored \
BACKUP_S3_ENDPOINT=https://s3.<region>.backblazeb2.com \
BACKUP_S3_ACCESS_KEY_ID=<B2 keyID> \
BACKUP_S3_SECRET_ACCESS_KEY=<B2 applicationKey> \
BACKUP_S3_BUCKET_NAME=reknotes-backup \
  bun run restore --date <最新の日付>

# 4. アプリを復旧先に向けて起動して目視確認。
DEPLOYMENT=local \
ENVIRONMENT=development \
DATABASE_URL=postgres://reknotes:reknotes@localhost:5434 \
S3_BUCKET_NAME=reknotes-restored \
  bun run dev

# 5. 後片付け
docker rm -f reknotes-drill-pg
# (MinIO の reknotes-restored bucket は console から削除)
```

`CLOUDFLARE_*` 等の他の必須 env は `.env` に残っているものを bun が自動で load する。

## 容量試算 (free tier 内に収まるか)

| 項目 | サイズ感 | B2 free tier |
|---|---|---|
| `<date>/db.sql.gz` × 30 日 | 数 MB × 30 = 数百 MB | 10GB storage |
| `<date>/objects/*` × 30 日 | primary × 30 (例: 300MB なら 9GB) | |
| Class B (write) ops | (1 + primary 全件) × 30 日 / 月 | 2,500 / 日 free、超過分は $0.004 / 10k calls |
| Daily download | restore drill 時に primary 全件 | 1GB / 日 free (Cloudflare Bandwidth Alliance で R2↔B2 は egress 無料) |

primary が ~300MB を超えてきたら B2 の lifecycle を 14 日 / 7 日に縮める。

## トラブルシュート

### `aborting because of server version mismatch`

`pg_dump` のバージョンがサーバ (Neon) より古い。`pg_dump` は `src/app/infrastructure/container.ts` の `PG_IMAGE` 定数で指定された postgres image を `docker run` で呼び出している (`PgDatabaseBackupProvider` 参照)。定数の image が Neon サーバのメジャーバージョン以上になっているか確認する。Renovate が `compose.local.yaml` と同じタイミングで更新する設定になっている (`renovate.json` の `customManagers`)。

### `S3_BUCKET_NAME must differ from BACKUP_S3_BUCKET_NAME`

primary と backup が同じ bucket を指している。dump.ts と restore.ts は安全のため起動時にこれを弾く (dump は backup に書き戻すと無限ループ、restore は backup の lifecycle で復旧データが消える)。

### restore 後にアプリが画像を表示しない

deploy workflow を回し忘れて `.env` がまだ旧 bucket を指している、もしくは新 token に該当 bucket の read 権限が無い。GitHub Secrets を更新したあと、必ず deploy workflow を回してから restore を打つ。

### B2 に書き込めない / `403`

B2 application key の "Allow access to Bucket(s)" が `reknotes-backup` を含んでいるか、"Type of Access" が **Read and Write** になっているかを確認。
