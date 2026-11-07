# Embedding モデルの移行

## Cloudflare EmbeddingGemma の提供終了

Cloudflare は `@cf/google/embeddinggemma-300m` を **2026年11月20日**に終了予定としている。終了後の呼び出しは HTTP 410 / error code 5028 になる。

- [Cloudflare の告知 (2026-11-05)](https://developers.cloudflare.com/changelog/post/2026-11-05-planned-model-deprecations/)
- [旧モデルのページ](https://developers.cloudflare.com/workers-ai/models/embeddinggemma-300m/)

2026年11月7日の確認時点では、告知で推奨されている `@cf/google/embeddinggemma-2` はまだ「available soon」。その提供開始を前提にせず、公開 API がある多言語モデル `@cf/qwen/qwen3-embedding-0.6b` にリモート provider を移行する。ローカルの ONNX モデルは Cloudflare の提供終了の対象ではなく、変更しない。

## API と類似度計算

- ノートとタイトルは `documents`、タグは `queries` とタスク用 `instruction` で送信する。旧 EmbeddingGemma 固有の prefix は付けない。
- Qwen の配列入力は最大32件なので、タグキャッシュの構築も32件ずつ分割する。
- 出力は1,024次元。件数・次元数・数値・非ゼロ norm を検証し、L2 正規化してから返す。これによりタグ提案で使う内積を cosine similarity として比較できる。
- キャッシュは provider インスタンスのメモリ内だけにある。再起動後に全タグ名を新モデルで embed し直す。DB にベクトルは保存していないため、スキーマ変更や全ノートの再保存は不要。既存タグ名とリンクはそのまま残り、ノートを編集したときに再提案される。
- 異なるモデルのベクトルは混ぜない。障害時の別モデルへの自動フォールバックもしない。

一次資料: [Cloudflare モデルページ](https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/)、[入力 schema](https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/schema-input.json)、[出力 schema](https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/schema-output.json)、[Qwen の公式モデルカード](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B)。

## 障害時の動作

編集時は本文を先に保存し、タグ再生成をバックグラウンドで行う。タグ候補の生成が完了するまで既存タグのリンクを外さない。ノート・タイトル・タグの embed、キャッシュ構築、API 応答検証のいずれかが失敗した場合も、既存タグを保持して処理中ロックを解除する。復旧後の再保存で再試行できる。

正常に候補が0件になった場合は、従来どおり旧タグを外す。DB 書き込み自体の失敗までを原子的に保護する変更ではない。

## デプロイ前の確認

自動テストは API 契約と失敗時の保持動作を検証するもので、実アカウントの推論成功やタグ品質の保証ではない。本番反映前に development 環境で以下を確認する。

1. 起動時のタグキャッシュ構築が成功し、Workers AI の権限・利用枠・新モデルへのアクセスに問題がないこと。
2. 日本語・英語・混在文、短いタイトル、既存タグの多いノートで、作成・編集後の提案を確認する。モデル変更によりタグ順位は変わり得る。
3. 既存タグが付いたテストノートについて、推論の失敗時も本文が保存され、タグが残り、処理中表示が解除されること。

PR の作成だけでは稼働環境は更新されない。マージと通常のデプロイを別途行う必要がある。
