# Migrations

## このドキュメントについて

reknotes は Drizzle ORM でスキーマを管理し、`bun run migrate` でマイグレーションを実行する。本ドキュメントは migrate コマンドの動作、CI / deploy で何が検査されるか、破壊的変更をどう運用するかをまとめたもの。

## 用語

- **schema.ts**: Drizzle のスキーマ定義ファイル。テーブルやカラムをここで宣言する。
- **drizzle-kit push**: `schema.ts` と DB の差分を計算し、その差分を直接 DB に反映する Drizzle のサブコマンド。マイグレーションファイルを生成しない。
- **hook (pre / post)**: `scripts/migration/hooks/*.sql` に置く SQL スクリプト。drizzle-kit push の前後でデータ整形を行う。
- **`_hooks_applied`**: 適用済み hook のファイル名と SHA-256 チェックサムを記録するテーブル。同じ hook を二重適用しないために使う。
- **destructive な変更**: `DROP TABLE`、`DROP COLUMN`、`SET DATA TYPE`、カラム rename。データ消失の恐れがあるためデフォルトで拒否する。

## 実行の流れ

`bun run migrate -- --apply` は 3 段階で動く。

1. **pre hooks** — `scripts/migration/hooks/*.pre.sql` のうち未適用のものを 1 トランザクションで一括適用する。スキーマ変更前のデータ整形が役割。
   - 例: NOT NULL を付ける前に NULL を埋める、UNIQUE を付ける前に重複を解消する。
2. **drizzle-kit push** — `schema.ts` と DB の差分を別プロセスで `bunx drizzle-kit push --force` として実行する。
   - 差分が destructive な場合、push を呼ぶ前に runner が `findDestructive` で拒否する。
   - カラム rename は別経路で止まる。`drizzle-kit generate` が rename 解決のため interactive TTY を要求して非ゼロ exit するので、`generateDiff` がエラーを返して `--check` / `--apply` が失敗する。
3. **post hooks** — `*.post.sql` のうち未適用のものを 1 トランザクションで一括適用する。新カラムへの backfill、整合性確認後のクリーンアップなどが役割。

各 hook は filename と SHA-256 チェックサムが `_hooks_applied` に記録され、次回以降はスキップされる。

## モード一覧

`bun run migrate -- <mode>`:

| mode | 用途 |
|---|---|
| `--apply` | pre / push / post を順に実行する。実際にスキーマを変更するのはこれだけ。 |
| `--check` | 差分を計算し、destructive を検出するだけ。DB への書き込みはしない。 |
| `--bootstrap` | 空 DB に `drizzle-kit push` で全テーブルを作り、既存 hook 群を SQL を実行せずに `_hooks_applied` に記録する。新しい開発・テスト環境を立てるときに 1 度だけ使う。 |

## CI での検査

`.github/workflows/ci.yml` の `destructive-check` job が以下を実行する。

1. PR の base ブランチの `schema.ts` を空 DB に `--apply` で再現する。
2. PR ブランチの `schema.ts` に切り替え、`--check` で差分を見る (= PR の `schema.ts` vs main 適用後の DB)。
3. `findDestructive` が destructive な diff を検出するか、`drizzle-kit generate` が rename を検出すると CI が fail する。

これにより破壊的変更は **PR レビュー時点で気づける**。drizzle-kit push 型の運用ではマイグレーションファイルが生成されないので、本番相当のスキーマを CI で再構築しないと検出できない。空 DB に `--apply` するだけのスモークテストでは PR の DROP は見つからない (空 DB との diff は CREATE のみになるため)。

## deploy での実行

`.github/workflows/deploy.yml` の `Run migration` ステップが、GitHub Actions runner から Neon に対して `bun run migrate -- --apply` を実行する。GHCR への image push 後、VM への反映前に走る。

仮に CI を通り抜けた destructive 変更があっても、ここで本番スキーマと突き合わせて再検出され deploy が止まる。過去 release tag への rollback でも同じ runner が走る (後述)。

## 破壊的変更を行う手順

hook (pre / post) は SQL を任意に書けるので、技術的には destructive を hook に入れれば動く。だが pre hook で `DROP COLUMN slug;` を打って `schema.ts` からも `slug` を消すと、後段の drizzle-kit push が見る差分は **空** になり、runner の `findDestructive` を素通りしてしまう。

これを防ぐため、CI の `destructive-check` job は hook を実行せず `schema.ts` と base 適用済 DB の差分だけを見る。hook 経由で destructive を隠した PR はここで落ちる。**この policy 違反検出が安全機構の本体になっている**。

よって destructive な変更は hook には書かず、人間が以下の手順を踏む。

CI が落ちた場合:

1. **DB に対して直接 destructive SQL を実行する**。`psql $DATABASE_URL` で対象 DB に接続し、`DROP TABLE IF EXISTS foo;` のように冪等な SQL を実行する。カラム rename は `ALTER TABLE ... RENAME COLUMN ...`。
2. **`schema.ts` の最終形と DB が一致することを確認する**。ローカルで `bun run migrate -- --check` を走らせ、差分が空 (= "no-changes") になることを確認する。
3. **CI を再実行する**。destructive な diff は消えているはずなので CI が通る。
4. **deploy を実行する**。`--apply` ステップは no-op (push の差分が空) になり、コードのみが新リビジョンに切り替わる。

drizzle-kit push 型の運用ではマイグレーションファイルが生成されないので、上の手動ステップが「ファイルとしての履歴」の代わりになる。重要な destructive 変更は PR の commit message かリリースノートに記録するとよい。

## ロールバック

過去の release tag に戻したいときは、`workflow_dispatch` の ref selector ("Use workflow from") で対象 tag を選び、通常 deploy と同じ操作で実行する。専用の rollback workflow は持たず、**「古い tag から deploy する = ロールバック」** という形に集約している。

release tag は不変な image として GHCR に残り続ける。一方、main から打った可変 tag は次回 deploy で digest が動くので、main の特定コミットへのロールバックは想定しない。

`Run migration` ステップは forward / rollback いずれの deploy でも常に走る。hook がスキーマ変更を後方互換に保っている前提では、古いコードから見てスキーマが前進していても migrate は `no-changes` で素通りし、image だけが古い tag に切り替わる。

destructive なスキーマ変更を含む release から rollback しようとすると、migrate が destructive 差分を検知して workflow が fail する。これは意図的な摩擦。復旧は「スキーマを戻す」のではなく、修正を含む新しい release tag を切って前進する (forward-fix)。物理的にスキーマを戻したいときは、前節「破壊的変更を行う手順」を実行してから forward 方向の deploy をやり直す。

## CI で検証されること / されないこと

| 検証される | 検証されない |
|---|---|
| hook の SQL 文法エラー | 本番データに依存する制約違反 (例: backfill のデフォルト値が UNIQUE 違反) |
| `drizzle-kit generate` が失敗するスキーマ (rename 検出など) | pre OK / push 失敗 / post 失敗の中間状態のリカバリ可否 |
| destructive 差分 (上記 1 段目) | deploy と migrate の相対順序が招くごく短い窓 (新スキーマ x 旧コード) |
| チェックサム不一致による `--apply` 中断 | 長時間 migration がリクエスト処理に与える影響 |

reknotes の規模 (単一 replica、単一管理者) では、未検証部分は許容範囲内。本番データ分布に依存する失敗まで検出したい場合は Neon の DB branch を CI で利用する方法もある (現在は採用していない)。

## 関連ファイル

- `scripts/migration/migrate.ts` — エントリーポイント
- `src/app/application/migration/` — 3 mode のユースケース
- `src/app/domain/migration/destructive.ts` — destructive パターン定義
- `src/app/infrastructure/providers/postgres-migration-provider.ts` — `_hooks_applied` への書き込み実装
- `src/app/infrastructure/providers/drizzle-kit-schema-sync-provider.ts` — drizzle-kit のサブプロセス実行
- `scripts/migration/hooks/README.md` — hook の書き方ルール
- `.github/workflows/ci.yml` — CI 検証 (`destructive-check` job)
- `.github/workflows/deploy.yml` — deploy 内の migrate (`Run migration` ステップ)
