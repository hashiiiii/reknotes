# VM Setup

## このドキュメントについて

`DEPLOYMENT=remote` 用の VM を用意し、`.github/workflows/deploy.yml` から `ssh ubuntu@${VM_HOST}` で `~/reknotes/` 配下の `docker compose -f compose.remote.yaml` が起動できる状態まで持っていく手順をまとめたもの。

要件は **Docker が動く任意の Linux ホスト + 公開 IP + 任意のドメイン 1 つ** だけ。ここでは無料で始められる例として Oracle Cloud Infrastructure (以下 OCI) の Always Free 枠を使うが、`ubuntu` ユーザーで SSH でき 80/443 を公開できる環境なら他の VPS / クラウドでも読み替えられる。

本ドキュメントは単一環境 (`production` のみ) の構築を基本とする。`development` など複数環境を分けたい場合は VM を環境ごとに用意して同じ手順を繰り返す (差分は最後のセクション参照)。設計の背景は `docs/INFRASTRUCTURE.md` を参照。

## 前提

- S3 互換ストレージ (例: Cloudflare R2) と PostgreSQL (例: Neon) を用意済みであること (本ドキュメントは扱わない)
- 公開ドメインを取得済みで、A レコードを編集できる DNS provider を持っていること
- リポジトリの GitHub Settings に、運用する environment (最低 `production`) が作成されていること

## なぜ例として OCI Free Tier か

- Always Free 枠で AMD shape (`VM.Standard.E2.1.Micro`) が 2 台まで完全無料で立てられる。`production` だけなら 1 台、`development` も分けるなら 2 台で枠内に収まる。
- 東京リージョンと大阪リージョンがあるので、日本からの遅延が小さい。

ARM Ampere shape (`VM.Standard.A1.Flex`) も Always Free だが、現在の `deploy.yml` は GitHub Actions の `ubuntu-latest` runner (linux/amd64) で build した image を GHCR に push しているため、ARM VM では pull した image が動かない。ARM を使いたい場合は `deploy.yml` の `docker/build-push-action` に `platforms: linux/amd64,linux/arm64` を追加して multi-arch build に切り替えてから本手順に戻ってくる必要がある。本手順は AMD shape 前提で書く。

## 用意するもの

| 物 | 用途 |
|---|---|
| クレジットカード | OCI アカウントの本人確認 (Always Free 枠内なら課金されない) |
| SMS が受け取れる電話番号 | OCI アカウントの SMS 認証 |
| 公開ドメイン 1 つ | Caddy が Let's Encrypt から TLS 証明書を取得するのに必要 |

## 手順

production VM の構築を例に書く。development VM は最後のセクションを参照して同じ手順を繰り返す。

### 1. OCI アカウントを作成する

[Oracle Cloud Free Tier のサインアップページ](https://www.oracle.com/cloud/free/) から登録する。途中で **ホームリージョンを選ぶ画面**があるので、`Japan East (Tokyo)` または `Japan Central (Osaka)` を選ぶ。ホームリージョンは後から変更できないので、ここだけは間違えないように注意。

アカウント作成後、サインインして OCI コンソールに入る。

### 2. SSH 鍵ペアを手元で生成する

VM にログインするための鍵を作る。GitHub Actions からも同じ鍵で SSH するので、後で秘密鍵を `VM_SSH_KEY` secret に登録する。

```sh
# ~/.ssh/reknotes_production と ~/.ssh/reknotes_production.pub が生成される
ssh-keygen -t ed25519 -f ~/.ssh/reknotes_production -N ""
```

`-N ""` で passphrase 無しにしておく。GitHub Actions が非対話で SSH するので passphrase は付けられない。

### 3. Compute インスタンスを作成する

OCI コンソール左上のハンバーガーメニューから `Compute > Instances > Create instance` に進む。次の値を設定する。

| 項目 | 値 |
|---|---|
| Name | `reknotes-production` (任意) |
| Image | `Canonical Ubuntu 24.04` (Always Free 対象) |
| Shape | `VM.Standard.E2.1.Micro` (Always Free 対象。「Always Free Eligible」のラベルが付いていることを確認) |
| Networking | `Create new virtual cloud network` と `Create new public subnet` を選ぶ (初回はこれがデフォルトになっている)。Public IPv4 address は `Assign a public IPv4 address` を選択 |
| SSH keys | `Paste public keys` を選び、ステップ 2 で生成した `~/.ssh/reknotes_production.pub` の内容を貼り付ける |
| Boot volume | デフォルト (50GB 程度。Always Free 内) |

`Create` を押す。1〜2 分で Running になる。インスタンス詳細画面の `Public IPv4 address` (例: `132.226.xxx.xxx`) を控えておく。これを後で `VM_HOST` secret として GitHub に登録する。

### 4. VCN の Security List で 80 / 443 を開放する

OCI は VM の OS とは別に、VCN レベルでもファイアウォールが効いている。デフォルトでは SSH (22) しか開いていないので、Caddy が使う 80 と 443 を明示的に開ける必要がある。

`Networking > Virtual cloud networks > <作成された VCN> > Subnets > <subnet> > Security Lists > Default Security List` に進み、`Add Ingress Rules` で次の 2 つを追加する。

| Source CIDR | IP Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

22 番は最初から開いているので追加不要。

### 5. SSH ログインを確認する

```sh
ssh -i ~/.ssh/reknotes_production ubuntu@<Public IPv4 address>
```

初回は `The authenticity of host ...` と聞かれるので `yes` で進む。`ubuntu@reknotes-production:~$` のプロンプトに変われば成功。以降のステップはすべて VM 内で実行する。

### 6. VM 内のファイアウォールでも 80 / 443 を開放する

OCI の Canonical Ubuntu image は、cloud-init が `iptables` で SSH 以外をブロックする設定で起動する。VCN 側で開けても VM 内側で塞いでいると外から到達できないので、こちらも開ける。

```sh
sudo apt-get update
sudo apt-get install -y iptables-persistent
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

`-I INPUT` は INPUT chain の先頭に挿入する指定で、デフォルトの REJECT ルールより前に置かれる。`iptables-persistent` を入れておくと `netfilter-persistent save` で `/etc/iptables/rules.v4` に永続化され、再起動後も設定が残る。

### 7. Docker と git をインストールする

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git

# Docker の公式リポジトリを追加
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# ubuntu ユーザーが sudo 無しで docker を叩けるようにする (deploy.yml はそうしている)
sudo usermod -aG docker ubuntu
```

ここでいったんログアウトして再ログインする (group の変更を反映するため)。

```sh
exit
ssh -i ~/.ssh/reknotes_production ubuntu@<Public IPv4 address>
docker compose version  # コマンドが通れば OK
```

`VM.Standard.E2.1.Micro` は RAM が 1GB しかなく、Caddy + oauth2-proxy + アプリ + Docker daemon が常駐すると残量が薄い。OOM kill による謎の停止を避けるため、ここで 2GB の swapfile も作っておく。

```sh
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

`free -h` で `Swap` 行に `2.0Gi` が出ていれば成功。

### 8. リポジトリを clone する

`deploy.yml` は VM 上の `~/reknotes/` で `git pull` と `docker compose` を叩く。あらかじめ clone しておく。

```sh
git clone https://github.com/<your_user>/reknotes.git ~/reknotes
```

private リポジトリの場合は GitHub の Personal Access Token (`repo` scope) を URL に埋めるか、deploy key を VM に置く。本ドキュメントでは public 前提で書いているので適宜読み替えてほしい。

### 9. GHCR から pull できることを確認する

`compose.remote.yaml` の `app` は private な GHCR image を pull する。VM 側で GHCR にログインしておく。

GitHub の `Settings > Developer settings > Personal access tokens > Tokens (classic)` で `read:packages` scope だけを持つ token を発行し、VM 上で次を実行する。

```sh
echo "<PAT>" | docker login ghcr.io -u <your_github_user> --password-stdin
```

`Login Succeeded` が出れば OK。token は `~/.docker/config.json` に保存されるので、以降のステップでは `docker compose pull` がそのまま通る。

### 10. ドメインの DNS A レコードを設定する

DNS provider のコンソールで、`DOMAIN` (例: `reknotes.example.com`) の A レコードを VM の Public IPv4 address に向ける。TTL は 300 秒程度で十分。

設定が反映されたか手元から確認する。

```sh
dig +short reknotes.example.com  # VM の IP が返ってくれば OK
```

DNS が未反映だと Caddy の Let's Encrypt 証明書取得が失敗する (HTTP-01 challenge が VM に到達しない) ので、必ずここで反映を確認してから次に進む。

### 11. GitHub OAuth App をこの環境用に作成する

oauth2-proxy が GitHub OAuth で認証するために、environment ごとに別の OAuth App を作る (callback URL がドメインに紐づくので production と development で共有できない)。

GitHub の `Settings > Developer settings > OAuth Apps > New OAuth App` を開いて次を入力する。

| 項目 | 値 |
|---|---|
| Application name | `reknotes-production` (任意) |
| Homepage URL | `https://<DOMAIN>` (例: `https://reknotes.example.com`) |
| Authorization callback URL | `https://<DOMAIN>/oauth2/callback` |

`Register application` を押し、生成された `Client ID` を控える。続けて `Generate a new client secret` で secret を発行し、これも控える。両方とも次のステップで GitHub Secrets に登録する。

callback URL は `compose.remote.yaml` の `OAUTH2_PROXY_REDIRECT_URL` と完全一致している必要があり、ズレていると oauth2-proxy が `redirect_uri_mismatch` でログインを通さない。

### 12. GitHub の Environment Secrets に値を登録する

リポジトリの `Settings > Environments > production` を開き、次の secrets を登録する。

| Secret 名 | 値 |
|---|---|
| `VM_HOST` | VM の Public IPv4 address |
| `VM_SSH_KEY` | 手元の `~/.ssh/reknotes_production` (private 鍵) の中身全体。`-----BEGIN OPENSSH PRIVATE KEY-----` から `-----END OPENSSH PRIVATE KEY-----` まで、改行込みで貼り付ける |
| `DOMAIN` | `reknotes.example.com` |
| `DATABASE_URL` | Neon の接続文字列 |
| `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET_NAME` | Cloudflare R2 のエンドポイントとキー |
| `OAUTH2_PROXY_CLIENT_ID` / `OAUTH2_PROXY_CLIENT_SECRET` | ステップ 11 で作成した GitHub OAuth App の Client ID と Secret |
| `OAUTH2_PROXY_COOKIE_SECRET` | `openssl rand -base64 32` で生成した 32 byte の base64 文字列 |

`CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` は両環境で共有してよいので、`Settings > Secrets and variables > Actions > Repository secrets` の方に登録する (`docs/INFRASTRUCTURE.md` 参照)。

### 13. 初回 deploy を流す

リポジトリの `Actions > Deploy > Run workflow` から `production` を選んで実行する。runner が image を build → GHCR に push → Neon にマイグレーション → VM に SCP で `.env` を送る → SSH で `docker compose up -d` を流す、という順に動く。

### 14. ブラウザで疎通確認する

`https://<DOMAIN>/` を開く。GitHub OAuth のログイン画面に飛び、登録した GitHub ユーザーで承認すると reknotes のトップページが表示されれば成功。

うまくいかない時は VM 上で次を見る。

```sh
cd ~/reknotes
docker compose -f compose.remote.yaml ps     # 各サービスが Up になっているか
docker compose -f compose.remote.yaml logs caddy | tail -50         # 証明書取得の失敗はここに出る
docker compose -f compose.remote.yaml logs oauth2-proxy | tail -50
docker compose -f compose.remote.yaml logs app | tail -50
```

## development VM (任意)

複数環境を運用する場合のみ必要。単一環境 (`production` だけ) なら読み飛ばしてよい。

同じ手順をもう一度繰り返す。production と異なるのは次の 4 点だけ。

| 項目 | 違い |
|---|---|
| Compute インスタンス名 | `reknotes-development` (任意) |
| SSH 鍵ペア | `~/.ssh/reknotes_development` を新規に生成する (production と分ける) |
| `DOMAIN` | development 用の別サブドメイン (`docs/INFRASTRUCTURE.md` 参照) |
| GitHub Secrets の登録先 | `Settings > Environments > development` |

OCI を使う場合、Compute インスタンス作成時の Networking で `Select existing virtual cloud network` を選び、production で作った VCN と subnet を再利用できる (Security List も共通で OK)。OCI Always Free の AMD shape は 2 台まで無料なので、production / development を 1 台ずつでも枠内に収まる。
