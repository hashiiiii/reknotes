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

なし。restore は他のスクリプトと同じ `loadConfig()` の値をそのまま使う (= `DATABASE_URL` が復旧先 DB、`S3_*` が復旧先 bucket = 新 primary)。災害時は先に GitHub Secrets を新 infra に向けて deploy workflow を回し、その時点で VM 上の `.env` が新値になっているので、`bun run restore --date <YYYY-MM-DD>` を打つだけでよい。詳細は[復旧手順](#復旧手順-本番障害時)。

## 初回セットアップ (人間がやる作業)

### Backblaze B2 側

1. [Backblaze](https://www.backblaze.com/) アカウントを作成 (B2 Cloud Storage を有効化)。
2. **Buckets** -> **Create a Bucket**:
   - Bucket Unique Name: 推奨 `reknotes-backup` (`.github/workflows/backup.yml` / `deploy.yml` の `BACKUP_S3_BUCKET_NAME` と一致させる。グローバル一意なので衝突すれば prefix を足す)
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

`BACKUP_S3_BUCKET_NAME` は workflow yaml の `env:` に `reknotes-backup` でハードコードされている (bucket 名は機密ではないため)。別名にするなら 2 ファイル (`.github/workflows/backup.yml` の env、`.github/workflows/deploy.yml` の .env heredoc) を同時に書き換える。

### retention (30 日 / 14 日 / 7 日) の選び方

backup 容量 ≒ primary bucket の容量 × retention 日数。B2 free tier (10GB) に収めるには:

| primary 容量 | 30 日 | 14 日 | 7 日 |
|---|---|---|---|
| ~300MB | OK | OK | OK |
| ~700MB | NG | OK | OK |
| ~1.5GB | NG | NG | OK |

primary が膨らんで free tier を超えそうになったら、B2 ダッシュボードで lifecycle ルールの日数を縮める。コード変更不要。

## ローカルでの動作確認

`compose.local.yaml` は primary 用 (`minio`) と backup 用 (`minio-backup`) の 2 つの MinIO を立ち上げる。本番の "primary と backup は別環境" の構造をローカルでも再現するため。

| サービス | API ポート | console ポート | 認証 |
|---|---|---|---|
| `minio` (primary) | `9000` | `9001` | `reknotes` / `reknotes` |
| `minio-backup` | `9002` | `9003` | `reknotes-backup` / `reknotes-backup` |

1. ブラウザで <http://localhost:9003> を開き backup 用 MinIO にログイン
2. Buckets -> Create Bucket -> `reknotes-backup`
3. (primary 側にも事前に `reknotes` bucket を作っておく。`bun run setup` で自動作成済みのはず)
4. 次を実行:

```bash
bun run dump
```

backup bucket に `<日付>/db.sql.gz` と `<日付>/objects/<キー>` が出来ていれば成功。

## 復旧手順 (本番障害時)

新しい Postgres インスタンスと新しい R2 bucket を用意し、**両方とも空であることを確認する**。

VM 上の `.env` は deploy workflow が scp で上書きするので、SSH で手編集してもデプロイで戻る。env の更新は必ず GitHub Secrets 経由で行う。

```
1. 障害検知
2. 新 DB と新 R2 bucket をプロビジョン
3. GitHub Secrets を更新
   - DATABASE_URL   = 新 DB の URL
   - S3_BUCKET_NAME = 新 bucket 名 (例: reknotes-restored)
   - 必要なら S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY も
   - BACKUP_S3_* は変更しない (B2 は生きているので)
4. Deploy workflow を手動実行
   → CI が新 .env を VM に scp、container を up -d --remove-orphans
   → app は起動するがデータは空の状態
5. SSH → VM で restore を実行
   docker compose -f compose.remote.yaml exec app bun run restore --date 2026-05-13
   → 新 .env (= app と同じ env) を読んで、B2 から新 R2 と新 DB に復元
6. 動作確認 → 終わり
```

step 5 のあとに container 再起動は不要。app は request 毎に DB/S3 を読むので、restore で populate した瞬間からデータが見える。

restore.ts は `loadConfig()` の `DATABASE_URL` / `S3_*` を復旧先として書き込む。step 3-4 で deploy workflow が `.env` を新 infra に向け終わっていることが前提なので、その手順を飛ばすと**旧 (= 死んでいる) infra に向かって restore しようとしてエラーになるか、最悪まだ生きている旧 bucket に書き戻して状態を壊す**。先に Secrets 更新 → deploy する手順を厳守すること。

### B2 自体が落ちている場合

本ドキュメントで想定する最も厳しいケース。primary が R2 + Neon、backup が B2 と完全に独立しているので「B2 単体障害」は restore 経路だけが詰まる状態。B2 ダッシュボードが復旧するまで待つしかない。primary は生きているので app の運用継続は可能。

## 復旧 drill (半年に 1 度推奨)

実施しないと「いざという時に動かない」状態になりがち。本番 env は触らず、ローカルで env を override して回す。

```bash
# 1. ローカルに空 Postgres を立てる
docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=test postgres:18

# 2. ローカル MinIO に空の復旧先 bucket を作る (例: reknotes-restored)。

# 3. 最新の backup を B2 から、復旧先 (= ローカル MinIO) に流し込む。
#    primary 側の S3_* はローカル MinIO の primary、BACKUP_S3_* は本番 B2 を指す。
DATABASE_URL=postgres://postgres:test@localhost:5433/postgres \
S3_ENDPOINT=http://localhost:9000 \
S3_ACCESS_KEY_ID=reknotes \
S3_SECRET_ACCESS_KEY=reknotes \
S3_BUCKET_NAME=reknotes-restored \
BACKUP_S3_ENDPOINT=https://s3.<region>.backblazeb2.com \
BACKUP_S3_ACCESS_KEY_ID=<B2 keyID> \
BACKUP_S3_SECRET_ACCESS_KEY=<B2 applicationKey> \
BACKUP_S3_BUCKET_NAME=reknotes-backup \
  bun run restore --date <最新の日付>

# 4. アプリを復旧先に向けて起動して目視確認
DATABASE_URL=postgres://postgres:test@localhost:5433/postgres \
S3_BUCKET_NAME=reknotes-restored \
  bun run dev
```

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
