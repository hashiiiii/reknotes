# ノート更新の非同期化と処理中ロック 設計

## 背景

detail 画面からノートを編集して保存すると、detail 画面へ戻るまでに約 3 秒かかる。
原因は `PUT /api/notes/:id` が `updateNoteWithTags` 内の `suggestTags` (embedding 生成) を
同期的に待ってから `HX-Redirect` を返しているため。

作成フロー (`create-note-with-tags.ts`) には issue #162 で
「即レスポンス + バックグラウンドタグ付け + in-memory processing レジストリ + カードの 2 秒ポーリング」
が導入済み。更新フローはこれに未対応。

## 要件

- 保存後は即座に detail 画面へ戻る。タグ再生成はバックグラウンドで行う。
- タグは次に detail や home が描画された時点で正しければよい (結果整合)。
- バックグラウンド処理中は当該ノートの更新・削除をブロックする。
  作成直後のタグ付け中も同じロックを適用する (一律ロック)。
  従来の「タグ付けがハングしてもノートを削除できる」脱出路は廃止する。
  processing レジストリは in-memory なので、ハングしてもプロセス再起動で必ず解除される。
- home 画面の当該カードは既存の処理中カード (グレー表示・詳細リンクなし・2 秒ポーリング) を流用する。
- detail 画面の編集・削除ボタンは処理中は無効化し、ポーリングで自動復帰させる。

## 全体フロー

```
PUT /api/notes/:id
  ├─ [同期] isProcessing チェック + markNoteProcessing (同一 tick でアトミック)
  ├─ [同期] 旧ノート・旧タグを控える → DB 行更新 (title/body)
  ├─ 即座に HX-Redirect → /notes/:id
  └─ [背景] タグ全解除 → suggestTags → タグ再リンク → 孤児タグ掃除
       → S3 孤児ファイル削除 → finishNoteProcessing
```

## application 層

### update-note-with-tags.ts

- 入口で同期的に `isProcessing(id)` をチェックし、続けて同一 tick で
  `markNoteProcessing(id)` する。check-and-mark をアトミックにすることで
  保存ボタン連打による二重実行を防ぐ。処理中なら literal `"processing"` を返す。
- 同期フェーズ: `findById` (S3 差分用の旧本文) → `findTagsByNoteId` (旧タグ) → `updateNote`。
  ノートが無ければ `finishNoteProcessing` して `null` を返す。
- 成功したらバックグラウンドジョブを起動して即 `note` を返す。
- 戻り値は `Note | null | "processing"`。view 系 use case は生のドメイン値を返す
  既存方針に合わせ、専用エラークラスは作らない。
- バックグラウンドジョブの内容 (1 ジョブにまとめ、全体を processing で囲む):
  1. `unlinkAllByNoteId`
  2. `suggestTags`
  3. `addTagsToNote`
  4. 旧タグの `removeOrphanTag`
  5. 旧本文にだけ含まれる S3 ファイルの削除
  6. `finally` で `finishNoteProcessing`

### delete-note.ts

- 入口で同期的に `isProcessing(id)` をチェックし、処理中なら `"processing"` を返す。
- 戻り値は `boolean | "processing"`。

### そのほか

- `_processing-notes.ts` / `is-note-processing.ts` は変更なしで流用する。
- `create-note-with-tags.ts` も変更不要。作成フローは既にレスポンス前に
  `markNoteProcessing` しており、update / delete の入口ガードが同じレジストリを
  見るだけで一律ロックが成立する。

## presentation 層 (routes)

- `PUT /api/notes/:id`: 戻り値が `"processing"` なら 409 + テキスト
  「タグ付け処理中です。完了までお待ちください」。既存 400 と同じ text 応答方式。
  それ以外は現行どおり (HX-Redirect / 303)。
- `DELETE /api/notes/:id`: 同様に `"processing"` なら 409。
- `GET /api/notes/:id/actions` を新設: detail 用 kebab メニューの partial を返す。
  `GET /api/notes/:id/card` と同じパターン。ノートが無ければ 404。
- `pages.ts` の `GET /notes/:id`: `processing: isNoteProcessing(id)` をテンプレートに渡す。
- home / 一覧 / カード単体の各 route は既存の processing カード機構がレジストリを
  共有しているため変更不要。

## views

- `note.liquid` の kebab メニューを `partials/note-actions.liquid` に切り出す。
  - 通常時: 現行の 編集 / ダウンロード / 削除 メニュー。
  - 処理中: 編集・削除ボタンを `disabled` にし「処理中」ラベルを表示する。
    ダウンロードは残す (カードと同じ方針)。
    `hx-get="/api/notes/:id/actions" hx-trigger="every 2s" hx-swap="outerHTML"` で
    自動復帰する。完了後のレンダリングにはポーリング属性が付かないので自然に停止する。
- 保存直後のリダイレクトで detail を開いた時点では処理中状態で描画され、
  数秒後にメニューが自動で有効に戻る。
- `note-card.liquid`: 処理中カードの kebab メニューから削除ボタンを外す
  (ダウンロードは残す)。従来は「タグ付けがハングしても削除できる」脱出路として
  意図的に残していたが、一律ロックで DELETE が 409 になるため、押せても
  黙って失敗するだけのボタンになる。コメントも脱出路廃止に合わせて更新する。

## エラー処理

- バックグラウンドジョブの失敗は `console.error` でログに残し、`finally` で必ず
  `finishNoteProcessing` する (作成フローと同じ方式)。
- 本文は同期フェーズで保存済みなので、ジョブが失敗してもユーザーのデータは失われない。
  タグ・S3 掃除が不完全に終わる可能性はあるが、次回編集時の再タグ付けで回復する。
- S3 削除は「消し損ね (ファイルが残る)」方向にしか失敗しない。
  データ消失方向の劣化はない。

## テスト

既存の `notes-update.test.ts` / `notes-processing.test.ts` / `update-note-with-tags.test.ts` の
パターン (in-memory フェイク + 実 app) を踏襲する。

- PUT がタグ付け完了を待たずに HX-Redirect を返すこと。
- processing 中の PUT / DELETE が 409 を返すこと。
  連打の二重実行防止は use case 単体でも検証する。
- processing 中の `GET /notes/:id` が無効化メニューとポーリング属性を描画すること。
- `GET /api/notes/:id/actions` の処理中 / 通常の出し分け。
- 処理中カードに削除ボタンが出ず、ダウンロードは残ること。
- バックグラウンドジョブ失敗時 (embedding が throw) に本文更新が残り、
  processing が解除されること。
