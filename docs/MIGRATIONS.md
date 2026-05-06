# Migrations

reknotes はスキーマ管理に Drizzle を使い、`bun run migrate` によってマイグレーションを行う。

## 実行の流れ

`bun run migrate -- --apply` は 3 段階に分けられる。

1. **pre hooks** — `scripts/migration/hooks/*.pre.sql` のうち未適用のものを 1 トランザクションで一括適用。NOT NULL を付ける前に NULL を埋める、UNIQUE を付ける前に重複を解消する、といったスキーマ変更前のデータ整形を担う。
2. **drizzle-kit push** — `schema.ts` と DB の差分を計算し、別プロセスで `bunx drizzle-kit push --force` を実行。差分が destructive (`DROP TABLE` / `DROP COLUMN` / `SET DATA TYPE`) の場合、push を呼ぶ前に runner が `findDestructive` で拒否する。column rename は別経路で止まる: `drizzle-kit generate` が rename 解決のために interactive TTY を要求し非ゼロ exit するので、`generateDiff` がエラーを返して `--check` / `--apply` が失敗する。
3. **post hooks** — `*.post.sql` のうち未適用のものを 1 トランザクションで一括適用。新カラムの backfill、整合性確認のクリーンアップなどを担う。

`_hooks_applied` テーブルが各 hook の filename と SHA-256 チェックサムを記録し、適用済みのものは次回スキップする。

### CI

`ci.yml` の `destructive-check` job が以下を実行:

1. PR の base ブランチの `schema.ts` を空 DB に `--apply` で再現する。
2. PR ブランチの `schema.ts` に切り替え、`--check` で PR の `schema.ts` vs main 適用後の DB の diff を見る。
3. `findDestructive` が `DROP TABLE` / `DROP COLUMN` / `SET DATA TYPE` を検出する、もしくは `drizzle-kit generate` が rename 検出をして、CI が落ちる。

これにより破壊的変更は **PR レビュー時点で気づける**。drizzle-kit push 型は migration ファイルを生成しないので、CI で本番相当のスキーマを再構築しないと検知ができない。空 DB に対して `--apply` するだけのスモークテストでは PR の DROP は検出できない (空 DB との diff は CREATE のみになるため)。

### deploy

`deploy.yml` の `Run migration` ステップが GitHub Actions runner から Neon に対して `bun run migrate -- --apply` を実行する。GHCR への image push 後、VM への反映前に走る。万一 CI を通り抜けた破壊的変更があってもここで本番スキーマと突き合わせて再検出され、deploy abort で本番反映が止まる。過去 release tag への rollback でも同じ runner が走る (後述の "ロールバック")。

## 破壊的変更を行う際の手順

hook (pre/post) は SQL を任意に書けるので、技術的には destructive を hook に入れれば動く。ただし pre hook で `DROP COLUMN slug;` を打って `schema.ts` からも slug を消すと、後段の drizzle-kit push が見る diff は **空** になり、runner の `findDestructive` が素通りする (runner は drizzle-kit が出した diff にしか効かない)。CI の `destructive-check` job は hook を実行せず `schema.ts` と base 適用済 DB の diff だけを見るので、hook 経由で destructive を隠した PR はそこで落ちる — この policy 違反の検出が安全機構の本体になっている。よって destructive は hook に書かず、人間が以下を行う:

CI が落ちた場合:

1. **DB に対して直接 destructive SQL を実行する**: `psql $DATABASE_URL` で対象 DB に接続し、`DROP TABLE IF EXISTS foo;` などを冪等に書いて実行する。column rename は `ALTER TABLE ... RENAME COLUMN ...`。
2. **`schema.ts` の最終形に既に合っていることを確認する**: ローカルで `bun run migrate -- --check` を走らせて diff が空 (= "no-changes") になることを確認する。
3. **CI を再実行**: destructive な diff は消えているはずなので CI が通る。
4. **deploy 実行**: `--apply` ステップは no-op (push の diff が空) になり、コードのみが新リビジョンに切り替わる。

drizzle-kit push 型の運用では migration ファイルが生成されないので、上の手動ステップが「ファイルとしての履歴」の代わりになる。重要な destructive 変更は PR の commit message かリリースノートに記録すると良い。

## ロールバック

過去 release tag に戻したいときは、`workflow_dispatch` の ref selector ("Use workflow from") で対象 tag を選んで通常 deploy と同じ操作で実行する。専用の rollback workflow は持たず、「古い tag から deploy する = ロールバック」という形に集約している。release を tag で運用する限り、ロールバック先は不変 image として GHCR に残り続ける (一方で main から打った可変 tag は次回 deploy で digest が動くので、main の特定コミットへのロールバックは想定しない)。

`Run migration` ステップは forward / rollback いずれでも常に走る。hook が schema 変更を backwards-compat に保っている前提では、古い code から見て schema が前進していても migrate は `no-changes` で素通りし、image だけが古い tag に切り替わる。

destructive な schema 変更を含む release から rollback しようとした場合、migrate が destructive 差分を検知して workflow が fail する。これは意図的な摩擦で、復旧は schema を戻す方向ではなく、修正を含む新しい release tag を切って前進する (forward-fix)。schema を物理的に戻したい場合は前節 "destructive 変更の手順" を実行してから forward 方向の deploy を打ち直す。

## CI で検証されること / されないこと

| 検証される | 検証されない |
|---|---|
| ✅ hook の SQL 文法エラー | ❌ 本番データに依存する制約違反 (例: backfill のデフォルト値が UNIQUE 違反) |
| ✅ `drizzle-kit generate` が失敗するスキーマ (rename 検出など) | ❌ pre OK / push 失敗 / post 失敗の中間状態のリカバリ可否 |
| ✅ destructive 差分 (上記 1 段目) | ❌ deploy と migrate の相対順序が招くごく短い窓 (新スキーマ × 旧コード) |
| ✅ チェックサム不一致による `--apply` 中断 | ❌ 長時間 migration がリクエスト処理に与える影響 |

reknotes の規模 (単一 replica、単一管理者) ではこれらの未検証部分は許容範囲内。本番データの分布に依存する失敗まで catch したい場合、Neon の DB branch を CI で利用する方法もある (現在は採用していない)。

## モード一覧

`bun run migrate -- <mode>`:

| mode | 用途 |
|---|---|
| `--apply` | pre / push / post を順に実行。実際にスキーマを変更するのはこれだけ。 |
| `--check` | diff を計算し destructive を検出するだけ。DB に書き込みはしない。 |
| `--bootstrap` | 空 DB に `drizzle-kit push` で全テーブルを作り、既存 hook 群を SQL を実行せずに `_hooks_applied` に記録する。新しい開発環境やテスト環境を立てるときに 1 度だけ使う。 |

## 関連ファイル

- `scripts/migration/migrate.ts` — エントリポイント
- `src/app/application/migration/` — 3 mode のユースケース
- `src/app/domain/migration/destructive.ts` — destructive パターン定義
- `src/app/infrastructure/providers/postgres-migration-provider.ts` — `_hooks_applied` への書き込み実装
- `src/app/infrastructure/providers/drizzle-kit-schema-sync-provider.ts` — drizzle-kit subprocess 実装
- `scripts/migration/hooks/README.md` — hook の書き方ルール
- `.github/workflows/ci.yml` — CI 検証 (`destructive-check` job)
- `.github/workflows/deploy.yml` — deploy 内 migrate (`Run migration` ステップ)
