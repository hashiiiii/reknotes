# Security

## このドキュメントについて

reknotes の脅威モデルと脆弱性報告手順をまとめたもの。「誰が使う想定か」「何を守り、何を守らないか」「どこに前提と限界があるか」を明文化し、後から追加される機能や PR で前提が崩れたときに気づけるようにする。

具体的な運用・デプロイ構成は `docs/INFRASTRUCTURE.md` を、防御コードの根拠 (各 advisory ID) はソース中の該当コメントを直接参照すること。

## 想定運用

reknotes は **単一ユーザーの個人用ツール** であり、複数人での共有運用は想定しない。デプロイモードによって信頼境界が異なる。詳細は `docs/INFRASTRUCTURE.md` の「2 つのデプロイモード」を参照。

### Local (`DEPLOYMENT=local`)

- 手元の PC 上で `bun run dev` がホストプロセスとして動く。
- **アプリ自身は認証を持たない**。localhost に bind して使う前提。
- 信頼境界は OS のローカルユーザー。マシンに触れる人 = 操作してよい人、とみなす。

### Remote (`DEPLOYMENT=remote`)

- VM 上で Caddy + oauth2-proxy の後段にアプリが並ぶ。
- 真のセキュリティ境界は **oauth2-proxy + GitHub OAuth による認証** で、許可されるのは whitelist (`OAUTH2_PROXY_GITHUB_USER`) に載った GitHub ユーザーのみ。
- アプリへ到達するリクエストは「認証を通過した自分自身」だけ、という前提に立つ。

## In-scope / Out-of-scope

### In-scope (守る対象)

| 脅威 | 想定シナリオ |
|---|---|
| note 内容経由の XSS | 自分が書いた Markdown 本文・タイトルがレンダリング時にスクリプトとして実行される (stored XSS)。LiquidJS のデフォルト HTML エスケープ、検索ハイライトのエスケープで防御している。 |
| アップロードファイル経由の XSS | アップロードした SVG などが同一オリジンから配信され、スクリプトとして実行される。アップロード許可リスト (SVG 不許可) と配信時の content-type 再検証 + `nosniff` + `Content-Disposition` で防御している。 |
| 経路認証 | Remote で oauth2-proxy を通さず直接アプリへ到達されること。リバースプロキシ + oauth2-proxy で前段を固める。 |

これらは「自分自身が書いた / アップロードしたコンテンツであっても、後から自動処理やレンダリングを通る際に害を成しうる」という前提に立つ。単一ユーザーであっても入力を無条件に信頼しない。

### Out-of-scope (守らない対象)

| 非対象 | 理由 |
|---|---|
| 複数人での共有運用 | 単一ユーザー前提。ユーザー間の権限分離やマルチテナンシーは設計に含めない。 |
| 匿名アクセス | Local は localhost 限定、Remote は oauth2-proxy gate 前提。認証なしの公開アクセスは想定しない。 |
| 外部 API キーの漏洩 | secret 管理は deploy パイプラインの責務 (`docs/INFRASTRUCTURE.md` および `.github/workflows/deploy.yml` を参照)。アプリ本体のコードでは扱わない。 |

## 既知の前提と限界

- **Local は認証を持たない**。したがって **localhost 以外に bind しない**こと。LAN や `0.0.0.0` に公開すると、同一ネットワークの第三者が無認証でアクセスできてしまう。LAN を信頼するのではなく、そもそも公開しない。
- **secret は `.env` (Local) / GitHub Secrets (Remote) で管理する**。コードにハードコードしない。どの変数がどこで管理されるかは `docs/INFRASTRUCTURE.md` の「環境変数の管理」を参照。
- **Remote の development サブドメインは秘匿だが秘密ではない**。Let's Encrypt の証明書は Certificate Transparency log に記録されるため、サブドメイン名は第三者から discover 可能。秘匿サブドメインは軽い隔離にすぎず、真の境界は oauth2-proxy。
- ここで挙げた防御は **多層 (defense in depth)** であり、いずれか単独で完全な保証を与えるものではない。新しい route や入力経路を追加するときは、上記の In-scope な脅威が再導入されていないかを確認すること。

## 脆弱性報告手順

脆弱性を見つけた場合は、**GitHub Security Advisory の private reporting 機能** から報告してほしい。GitHub リポジトリの "Security" タブ -> "Report a vulnerability" から非公開で起票できる (GitHub は `docs/SECURITY.md` を自動認識し、この導線を有効化する)。

公開 issue や PR では報告しないこと。修正前の詳細が公開状態になるのを避けるため。

直近では以下の advisory を修正済み。報告から修正までの流れの参考にしてほしい。

- GHSA-cg9f-774f-c45r
- GHSA-f36f-v24r-855m
- GHSA-j2m9-c6gf-6vfx
- GHSA-g8cw-cxgp-g6r8
- GHSA-72qg-2xg9-547p

## ドキュメント記述ルール (作成者向け)

- **具体的な設定値・変数名は書かない**: 信頼境界や脅威の概念対応だけを扱い、ポート番号や変数の具体値は一次資料 (`docs/INFRASTRUCTURE.md`、`.env.example`、`.github/workflows/deploy.yml`) を参照させる。動く数値を二重管理しない。
- **行番号・関数名は書かない**: `docs/ARCHITECTURE.md` と同じ理由。1 編集で腐るため。
- **advisory ID は固有名で参照してよい**: 1 つの ID は 1 つの修正に 1:1 で対応するので腐らない。対応コードのコメントにも同じ ID が書かれている。
