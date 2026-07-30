# ノート更新の非同期化と処理中ロック 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ノート編集の保存を即座に完了させ、タグ再生成をバックグラウンド化し、処理中の当該ノートへの更新・削除を 409 でロックする。

**Architecture:** `PUT /api/notes/:id` は DB 行更新だけを同期で行い即 `HX-Redirect` を返す。タグ全解除〜再生成〜孤児タグ掃除〜S3 掃除は 1 つのバックグラウンドジョブにまとめ、既存の in-memory processing レジストリ (`_processing-notes.ts`) で囲む。update / delete の use case 入口で同期的に check-and-mark / check して再入を拒否する。detail の kebab メニューは partial 化し、処理中は無効化 + 2 秒ポーリングで自動復帰する。

**Tech Stack:** Bun >= 1.3, TypeScript (strict), Hono, LiquidJS, htmx, bun:test

**Spec:** `docs/superpowers/specs/2026-07-30-async-note-update-design.md`

## Global Constraints

- 絵文字禁止 (コード・コメント・コミット・ログすべて)。
- コミットメッセージは `<type>: <subject>` 1 行のみ、英語、命令形、50 文字以内。
- コード内コメントは日本語 (既存スタイル準拠)。全角と半角の間に半角スペースを入れる。
- console のログメッセージは英語 (既存の `Auto-tagging failed ...` に合わせる)。
- テストは既存パターン (in-memory フェイク + 実 app、または実 DB リポジトリ) を踏襲する。
- 各タスクの完了時に `bun run check` と対象テストが通ること。
- ブランチは `feat/async-note-update` (作成済み) 上で作業する。

---

### Task 1: updateNoteWithTags の非同期化と PUT の 409 応答

**Files:**
- Modify: `src/app/application/note/update-note-with-tags.ts`
- Modify: `src/app/presentation/routes/notes.ts:152-171` (PUT ハンドラ)
- Test: `src/app/application/note/update-note-with-tags.test.ts`
- Test: `src/app/application/note/note.test.ts` (統合テスト 2 件の適応)
- Test: `src/app/presentation/routes/notes-update.test.ts` (バックグラウンド完了待ちの追加)

**Interfaces:**
- Consumes: `_processing-notes.ts` の `isProcessing(id)` / `markNoteProcessing(id)` / `finishNoteProcessing(id)` (既存、変更なし)
- Produces: `updateNoteWithTags(...): Promise<Note | null | "processing">`。
  `"processing"` は処理中の再入拒否。`null` は not found。それ以外は更新後の `Note` を即返し、タグ再生成は継続中。呼び出し側は完了を `isNoteProcessing(id)` で観測する。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/application/note/update-note-with-tags.test.ts` を以下の内容に書き換える (既存 2 テストは非同期化に合わせて完了待ちを足し、新規 4 テストを追加):

```typescript
import { describe, expect, mock, test } from "bun:test";
import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import type { IStorageProvider } from "../port/storage-provider";
import { isNoteProcessing } from "./is-note-processing";
import { updateNoteWithTags } from "./update-note-with-tags";

// updateNoteWithTags は DB 行更新だけを同期で行い、タグ再生成と掃除 (S3 の orphan 削除を含む)
// はバックグラウンドに回す。ここでは「即返すこと」「再入を拒否すること」「バックグラウンドの
// 掃除が最終的に走ること」を検証する。

function makeNote(id: number, body: string): Note {
  return { id, title: "t", body, createdAt: 0, updatedAt: 0 };
}

// embedNote と embedTag に逆向きベクトルを返させ、全候補のスコアを負にする。
// suggestTags の相対閾値 (score >= maxScore * 0.5) は maxScore が負だと全候補を弾くため、
// タグが一つも生成されず addTagsToNote が走らない。これで findOrCreateMany 等の stub が不要になる。
function makeEmbeddingProvider(): IEmbeddingProvider {
  return {
    load: async () => {},
    embedNote: async () => new Float32Array([1, 0]),
    embedTag: async () => new Float32Array([-1, 0]),
    buildTagCache: async () => {},
  };
}

function makeNoteRepo(oldBody: string, newBody: string): INoteRepository {
  return {
    findById: async (id: number) => makeNote(id, oldBody),
    update: async (id: number) => makeNote(id, newBody),
    // 旧タグなし = orphan 掃除の経路は走らない。掃除自体の検証は note.test.ts で行う
    findTagsByNoteId: async () => [],
  } as unknown as INoteRepository;
}

function makeTagRepo(): ITagRepository {
  return {
    unlinkAllByNoteId: async () => {},
    findAll: async () => [],
  } as unknown as ITagRepository;
}

// バックグラウンドジョブの完了 (processing 解除) をポーリングで待つ。
// ジョブがハングした場合は bun test のタイムアウトが検知する。
async function waitForBackground(id: number) {
  while (isNoteProcessing(id)) await Bun.sleep(1);
}

describe("updateNoteWithTags の非同期化", () => {
  test("タグ付け完了を待たずに更新結果を返し、処理中フラグが立つ", async () => {
    // embedNote を手動で解放するまでブロックさせ、「タグ付けが終わる前に返る」ことを決定的に検証する
    let releaseEmbedding: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseEmbedding = resolve;
    });
    const embeddingProvider: IEmbeddingProvider = {
      load: async () => {},
      embedNote: async () => {
        await gate;
        return new Float32Array([1, 0]);
      },
      embedTag: async () => new Float32Array([-1, 0]),
      buildTagCache: async () => {},
    };
    const unlinkSpy = mock((_id: number) => Promise.resolve());
    const tagRepo = { unlinkAllByNoteId: unlinkSpy, findAll: async () => [] } as unknown as ITagRepository;
    const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;

    const note = await updateNoteWithTags(
      makeNoteRepo("旧本文", "新本文"),
      tagRepo,
      embeddingProvider,
      storageProvider,
      10,
      "t",
      "新本文",
    );

    // embedNote がブロックされたままでも更新結果が返り、処理中フラグが立っている
    expect(note).not.toBe("processing");
    expect((note as Note).body).toBe("新本文");
    expect(isNoteProcessing(10)).toBe(true);

    releaseEmbedding();
    await waitForBackground(10);
    expect(unlinkSpy).toHaveBeenCalledWith(10);
  });

  test("処理中の再入は processing を返す", async () => {
    let releaseEmbedding: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseEmbedding = resolve;
    });
    const embeddingProvider: IEmbeddingProvider = {
      load: async () => {},
      embedNote: async () => {
        await gate;
        return new Float32Array([1, 0]);
      },
      embedTag: async () => new Float32Array([-1, 0]),
      buildTagCache: async () => {},
    };
    const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;
    const noteRepo = makeNoteRepo("旧本文", "新本文");

    const first = await updateNoteWithTags(noteRepo, makeTagRepo(), embeddingProvider, storageProvider, 11, "t", "新本文");
    const second = await updateNoteWithTags(noteRepo, makeTagRepo(), embeddingProvider, storageProvider, 11, "t", "別の本文");

    expect(first).not.toBe("processing");
    expect(second).toBe("processing");

    releaseEmbedding();
    await waitForBackground(11);
  });

  test("存在しないノートは null を返しロックを解除する", async () => {
    const noteRepo = {
      findById: async () => null,
      findTagsByNoteId: async () => [],
      update: async () => null,
    } as unknown as INoteRepository;
    const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;

    const result = await updateNoteWithTags(
      noteRepo,
      makeTagRepo(),
      makeEmbeddingProvider(),
      storageProvider,
      12,
      "t",
      "本文",
    );

    expect(result).toBeNull();
    // ロックが解除されていれば、後続の更新は "processing" にならない
    expect(isNoteProcessing(12)).toBe(false);
  });

  test("バックグラウンドジョブが失敗してもロックは解除される", async () => {
    const embeddingProvider: IEmbeddingProvider = {
      load: async () => {},
      embedNote: async () => {
        throw new Error("embedding backend down");
      },
      embedTag: async () => new Float32Array([-1, 0]),
      buildTagCache: async () => {},
    };
    const storageProvider = { delete: async () => {} } as unknown as IStorageProvider;

    const note = await updateNoteWithTags(
      makeNoteRepo("旧本文", "新本文"),
      makeTagRepo(),
      embeddingProvider,
      storageProvider,
      13,
      "t",
      "新本文",
    );

    // 本文の更新は成功したまま返り、失敗はバックグラウンドでログされるだけ
    expect(note).not.toBe("processing");
    expect((note as Note).body).toBe("新本文");
    await waitForBackground(13);
    expect(isNoteProcessing(13)).toBe(false);
  });
});

describe("updateNoteWithTags のファイルクリーンアップ", () => {
  test("旧本文にあって新本文にないキーは削除される", async () => {
    const noteRepo = makeNoteRepo("![](/api/files/old.png)", "![](/api/files/new.png)");
    const tagRepo = makeTagRepo();
    const embeddingProvider = makeEmbeddingProvider();
    const deleteSpy = mock((_key: string) => Promise.resolve());
    const storageProvider = { delete: deleteSpy } as unknown as IStorageProvider;

    await updateNoteWithTags(noteRepo, tagRepo, embeddingProvider, storageProvider, 1, "t", "![](/api/files/new.png)");
    // S3 掃除はバックグラウンドに移ったので、完了を待ってから観測する
    await waitForBackground(1);

    expect(deleteSpy).toHaveBeenCalledWith("old.png");
    expect(deleteSpy).not.toHaveBeenCalledWith("new.png");
  });

  test("旧本文と新本文が同じキーを参照する場合は削除しない", async () => {
    const noteRepo = makeNoteRepo("![](/api/files/keep.png)", "![](/api/files/keep.png)");
    const tagRepo = makeTagRepo();
    const embeddingProvider = makeEmbeddingProvider();
    const deleteSpy = mock((_key: string) => Promise.resolve());
    const storageProvider = { delete: deleteSpy } as unknown as IStorageProvider;

    await updateNoteWithTags(noteRepo, tagRepo, embeddingProvider, storageProvider, 1, "t", "![](/api/files/keep.png)");
    await waitForBackground(1);

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `bun test src/app/application/note/update-note-with-tags.test.ts`
Expected: FAIL。現行実装は同期なので「タグ付け完了を待たずに返す」テストがタイムアウトまたは `isNoteProcessing(10)` が false で失敗し、「再入は processing」も失敗する。

- [ ] **Step 3: updateNoteWithTags を実装する**

`src/app/application/note/update-note-with-tags.ts` を以下の内容に書き換える:

```typescript
import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { suggestTags } from "../embedding/suggest-tags";
import { extractUploadedFileKeys } from "../file/_file-url";
import type { IEmbeddingProvider } from "../port/embedding-provider";
import type { IStorageProvider } from "../port/storage-provider";
import { addTagsToNote } from "../tag/add-tags-to-note";
import { removeOrphanTag } from "../tag/remove-orphan-tag";
import { finishNoteProcessing, isProcessing, markNoteProcessing } from "./_processing-notes";
import { updateNote } from "./update-note";

// 本文の更新だけを同期で行い、タグ再生成と掃除はバックグラウンドに回す。
// 処理中の再入は "processing" で拒否する (保存連打・複数タブ対策)。
export async function updateNoteWithTags(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  storageProvider: IStorageProvider,
  id: number,
  title: string,
  body: string,
): Promise<Note | null | "processing"> {
  // check と mark は最初の await より前の同一 tick で行う。間にイベントループが
  // 割り込まないので、同時に届いた保存は必ず片方だけが通る。
  if (isProcessing(id)) return "processing";
  markNoteProcessing(id);

  let existing: Note | null;
  let oldTagNames: string[];
  let note: Note | null;
  try {
    // 更新前の本文とタグを先に押さえておく。バックグラウンドでの S3 差分計算と
    // 外れたタグの orphan 掃除に使う。
    existing = await noteRepo.findById(id);
    oldTagNames = await noteRepo.findTagsByNoteId(id);
    note = await updateNote(noteRepo, id, title, body);
  } catch (e) {
    finishNoteProcessing(id);
    throw e;
  }
  if (!note) {
    finishNoteProcessing(id);
    return null;
  }

  retagAndCleanupInBackground(tagRepo, embeddingProvider, storageProvider, id, title, note.body, existing?.body ?? null, oldTagNames);
  return note;
}

// タグ再生成と掃除を非同期で実行する (レスポンスをブロックしない)。
// 処理中の間は detail のメニューとカードがロック表示になる。成否に関わらず必ず解除する
function retagAndCleanupInBackground(
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  storageProvider: IStorageProvider,
  noteId: number,
  title: string,
  body: string,
  oldBody: string | null,
  oldTagNames: string[],
) {
  runRetagAndCleanup(tagRepo, embeddingProvider, storageProvider, noteId, title, body, oldBody, oldTagNames)
    .catch((e) => {
      console.error("Background retag failed (note was updated successfully):", e);
    })
    .finally(() => {
      finishNoteProcessing(noteId);
    });
}

async function runRetagAndCleanup(
  tagRepo: ITagRepository,
  embeddingProvider: IEmbeddingProvider,
  storageProvider: IStorageProvider,
  noteId: number,
  title: string,
  body: string,
  oldBody: string | null,
  oldTagNames: string[],
): Promise<void> {
  await tagRepo.unlinkAllByNoteId(noteId);
  const generatedTags = await suggestTags(embeddingProvider, tagRepo, title, body);
  if (generatedTags.length > 0) await addTagsToNote(tagRepo, noteId, generatedTags);

  // 編集で外れた旧タグはどのノートからも参照されなければ消す (delete-note.ts と同じ方式)。
  // 再選択されたタグはリンクが残るので deleteIfOrphan が残す。
  for (const tagName of oldTagNames) {
    await removeOrphanTag(tagRepo, tagName);
  }

  // 旧本文にあって新本文にないキーだけを削除する。新本文に残っているキーは消さない。
  if (oldBody !== null) {
    const newKeys = new Set(extractUploadedFileKeys(body));
    const orphanedKeys = extractUploadedFileKeys(oldBody).filter((key) => !newKeys.has(key));
    await Promise.all(orphanedKeys.map((key) => storageProvider.delete(key)));
  }
}
```

`src/app/presentation/routes/notes.ts` の PUT ハンドラで `"processing"` を 409 にマップする。
現在の

```typescript
  if (!note) return c.notFound();
```

を以下に置き換える:

```typescript
  if (note === "processing") return c.text("タグ付け処理中です。完了までお待ちください", 409);
  if (!note) return c.notFound();
```

- [ ] **Step 4: use case テストが通ることを確認する**

Run: `bun test src/app/application/note/update-note-with-tags.test.ts`
Expected: PASS (6 テスト)

- [ ] **Step 5: 統合テストと route テストを非同期化に適応させる**

`src/app/application/note/note.test.ts` の `updateNoteWithTags` を使う 2 テスト
(「外れた旧タグは...削除される」「他ノートが使っていれば残る」) で、
`await updateNoteWithTags(...)` の直後に完了待ちを足す:

```typescript
    // タグ再生成はバックグラウンドに移ったので、完了を待ってから最終状態を観測する
    while (isNoteProcessing(note.id)) await Bun.sleep(1);
```

(2 つ目のテストでは `note.id` ではなく `edited.id`。`isNoteProcessing` は同ファイルで import 済み。)

`src/app/presentation/routes/notes-update.test.ts` では、成功する PUT を行う 2 テスト
(「htmx からの保存は 200 + HX-Redirect」「htmx 以外からの保存は 303」) のアサーション後に
同様の完了待ちを足し、processing 状態を他テストに持ち越さないようにする:

```typescript
    // バックグラウンドジョブの完了を待ち、processing 状態を他のテストに持ち越さない
    while (isNoteProcessing(1)) await Bun.sleep(1);
```

import を追加する:

```typescript
import { isNoteProcessing } from "../../application/note/is-note-processing";
```

- [ ] **Step 6: 影響範囲のテストがすべて通ることを確認する**

Run: `bun run check && bun test src/app/application/note/ src/app/presentation/routes/`
Expected: PASS (note.test.ts は DB 前提の統合テストなので、コンテナ未起動で失敗する場合は `docker compose -f compose.local.yaml up -d` を先に実行する)

- [ ] **Step 7: コミット**

```bash
git add src/app/application/note/update-note-with-tags.ts src/app/application/note/update-note-with-tags.test.ts src/app/application/note/note.test.ts src/app/presentation/routes/notes.ts src/app/presentation/routes/notes-update.test.ts
git commit -m "feat: run note retag in background on update"
```

---

### Task 2: deleteNote の処理中ガードと DELETE の 409 応答

**Files:**
- Modify: `src/app/application/note/delete-note.ts`
- Modify: `src/app/presentation/routes/notes.ts:174-188` (DELETE ハンドラ)
- Test: `src/app/application/note/note.test.ts`
- Test: `src/app/presentation/routes/notes-processing.test.ts`

**Interfaces:**
- Consumes: `_processing-notes.ts` の `isProcessing(id)` (既存)
- Produces: `deleteNote(...): Promise<boolean | "processing">`。`"processing"` は処理中の拒否。`false` は not found。`true` は削除成功。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/application/note/note.test.ts` の describe 内に追加する
(`markNoteProcessing` / `finishNoteProcessing` は import 済み):

```typescript
  test("処理中のノートは deleteNote が processing を返す", async () => {
    // バックグラウンドのタグ再生成と削除が競合しないよう、処理中の削除は拒否される
    const note = await createNote(noteRepository, "処理中削除ガード", "本文");
    markNoteProcessing(note.id);
    try {
      expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe("processing");
      // 拒否された削除は DB に触れていない
      expect(await getNote(noteRepository, note.id)).not.toBeNull();
    } finally {
      finishNoteProcessing(note.id);
    }
    // 解除後は通常どおり削除できる
    expect(await deleteNote(noteRepository, tagRepository, storageProvider, note.id)).toBe(true);
  });
```

`src/app/presentation/routes/notes-processing.test.ts` の describe 内に route レベルの 409 テストを追加する:

```typescript
  test("処理中のノートへの PUT は 409 を返す", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1 })] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1", {
        method: "PUT",
        body: new URLSearchParams({ title: "更新", body: "本文" }),
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://localhost" },
      });
      expect(res.status).toBe(409);
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("処理中のノートへの DELETE は 409 を返す", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1 })] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1", {
        method: "DELETE",
        headers: { Origin: "http://localhost" },
      });
      expect(res.status).toBe(409);
    } finally {
      finishNoteProcessing(1);
    }
  });
```

補足: どちらのテストも guard が use case の入口で先に返るため、`tagRepository` /
`embeddingProvider` は未スタブのままでよい (呼ばれたら `notStubbed` が例外を投げて検知できる)。
PUT の 409 は Task 1 で実装済みなのでこの時点で通る。DELETE の 409 はこの Task で通す。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `bun test src/app/application/note/note.test.ts src/app/presentation/routes/notes-processing.test.ts`
Expected: FAIL。`deleteNote が processing を返す` は現行実装が `true` を返すので失敗。`DELETE は 409` は現行 route が 200 を返すので失敗。`PUT は 409` は Task 1 実装済みで PASS。

- [ ] **Step 3: deleteNote と DELETE ハンドラを実装する**

`src/app/application/note/delete-note.ts` の import に追加:

```typescript
import { isProcessing } from "./_processing-notes";
```

関数シグネチャと入口を変更する:

```typescript
export async function deleteNote(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  storageProvider: IStorageProvider,
  id: number,
): Promise<boolean | "processing"> {
  // バックグラウンドのタグ再生成・掃除と競合しないよう、処理中の削除は拒否する。
  // ハングしてもプロセス再起動でレジストリごと解除されるので脱出路は要らない。
  if (isProcessing(id)) return "processing";

  const note = await noteRepo.findById(id);
  // (以降は既存のまま)
```

`src/app/presentation/routes/notes.ts` の DELETE ハンドラで、

```typescript
  if (!deleted) return c.notFound();
```

を以下に置き換える:

```typescript
  if (deleted === "processing") return c.text("タグ付け処理中です。完了までお待ちください", 409);
  if (!deleted) return c.notFound();
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `bun run check && bun test src/app/application/note/note.test.ts src/app/presentation/routes/notes-processing.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/application/note/delete-note.ts src/app/application/note/note.test.ts src/app/presentation/routes/notes.ts src/app/presentation/routes/notes-processing.test.ts
git commit -m "feat: reject note delete while processing"
```

---

### Task 3: detail の kebab メニューを partial 化して処理中ロック + ポーリング復帰

**Files:**
- Create: `src/app/presentation/views/partials/note-actions.liquid`
- Modify: `src/app/presentation/views/pages/note.liquid:7-14` (kebab メニューを partial 呼び出しに置換)
- Modify: `src/app/presentation/routes/notes.ts` (`GET /:id/actions` を `/:id/card` の直後に追加)
- Modify: `src/app/presentation/routes/pages.ts:27-46` (`processing` フラグを渡す)
- Modify: `public/css/style.css` (disabled スタイルを 172 行目の danger 規則の後に追加)
- Test: `src/app/presentation/routes/notes-processing.test.ts`

**Interfaces:**
- Consumes: `isNoteProcessing(id)` (既存)、`engine.renderFile` (既存)
- Produces: `GET /api/notes/:id/actions` — detail 用 kebab メニューの partial HTML。処理中は無効化ボタン + `hx-trigger="every 2s"`、通常時はポーリング属性なし。ノートが無ければ 404。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/presentation/routes/notes-processing.test.ts` に追加する。
detail ページは graph サブグラフを描画するので、空を返す graph リポジトリのフェイクを
ファイル冒頭 (describe の外) に定義する:

```typescript
import type { IGraphRepository } from "../../domain/graph/graph-repository";

// detail ページ描画用。関連ノート・タグなし = mini graph セクションは出ない
const emptyGraphRepository: IGraphRepository = {
  findAllNoteNodes: async () => [],
  findAllTagNodes: async () => [],
  findAllLinks: async () => [],
  findNoteNodeById: async () => null,
  findRelatedNotes: async () => [],
  findRelatedTags: async () => [],
  findRelatedLinks: async () => [],
};
```

describe 内にテストを追加する:

```typescript
  test("処理中の GET /notes/:id は編集・削除を無効化しポーリング属性を付ける", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    markNoteProcessing(1);
    try {
      const res = await app.request("/notes/1");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('hx-get="/api/notes/1/actions"');
      expect(html).toContain('hx-trigger="every 2s"');
      // 編集・削除は無効化ラベルになる。base layout の検索ボックスも非トップページでは
      // disabled 属性を持つため、"disabled" 単体ではなく (処理中) ラベルで判定する
      expect(html).toContain("削除 (処理中)");
      // 削除は無効化ボタンになり、hx-delete は出ない
      expect(html).not.toContain("hx-delete");
      // ダウンロードは処理中も使える
      expect(html).toContain('href="/api/notes/1/download"');
    } finally {
      finishNoteProcessing(1);
    }
  });

  test("通常時の GET /notes/:id は従来どおり編集・削除メニューを出す", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note], graphRepository: emptyGraphRepository });
    const res = await app.request("/notes/1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('hx-delete="/api/notes/1"');
    expect(html).not.toContain('hx-trigger="every 2s"');
    // base layout の検索ボックスが disabled を含むため、無効化ラベルの有無で判定する
    expect(html).not.toContain("(処理中)");
  });

  test("GET /api/notes/:id/actions は処理中と通常で出し分ける", async () => {
    const note = makeNote({ id: 1 });
    const { app } = createTestApp({ notes: [note] });
    markNoteProcessing(1);
    try {
      const res = await app.request("/api/notes/1/actions");
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('hx-trigger="every 2s"');
      expect(html).toContain("disabled");
    } finally {
      finishNoteProcessing(1);
    }
    const res = await app.request("/api/notes/1/actions");
    const html = await res.text();
    expect(html).not.toContain("hx-trigger");
    expect(html).toContain('hx-delete="/api/notes/1"');
  });

  test("存在しないノートの GET /api/notes/:id/actions は 404 を返す", async () => {
    const { app } = createTestApp({ notes: [] });
    const res = await app.request("/api/notes/999/actions");
    expect(res.status).toBe(404);
  });
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `bun test src/app/presentation/routes/notes-processing.test.ts`
Expected: FAIL。`/notes/1` にポーリング属性がなく、`/api/notes/1/actions` は 404。

- [ ] **Step 3: partial と route とフラグを実装する**

`src/app/presentation/views/partials/note-actions.liquid` を作成する:

```liquid
{%- comment -%}
detail 画面の kebab メニュー。処理中 (バックグラウンドのタグ再生成) は編集・削除を無効化し、
2 秒ポーリングで完了を検知して通常メニューに戻る。完了後の描画にはポーリング属性が
付かないので自然に停止する。ダウンロードは処理中も使える。
{%- endcomment -%}
<div class="kebab-menu"
  {% if processing %}hx-get="/api/notes/{{ note.id }}/actions" hx-trigger="every 2s" hx-swap="outerHTML"{% endif %}>
  <button class="kebab-btn" aria-label="メニュー" onclick="toggleKebab(this)">&#x22EE;</button>
  <div class="kebab-dropdown">
    {% if processing %}
    <button disabled>編集 (処理中)</button>
    {% else %}
    <button onclick="this.closest('.kebab-menu').classList.remove('open'); document.getElementById('note-view').hidden=true; document.getElementById('note-edit').hidden=false; var g=document.getElementById('note-graph'); if(g) g.hidden=true;">編集</button>
    {% endif %}
    <a href="/api/notes/{{ note.id }}/download" onclick="this.closest('.kebab-menu').classList.remove('open')">ダウンロード</a>
    {% if processing %}
    <button class="danger" disabled>削除 (処理中)</button>
    {% else %}
    <button class="danger" hx-delete="/api/notes/{{ note.id }}" hx-confirm="本当に削除しますか？" hx-target="body">削除</button>
    {% endif %}
  </div>
</div>
```

`src/app/presentation/views/pages/note.liquid` の 7〜14 行目
(`<div class="kebab-menu">` から閉じ `</div>` まで) を以下に置き換える:

```liquid
      {% render 'note-actions', note: note, processing: processing %}
```

`src/app/presentation/routes/notes.ts` の `GET /:id/card` の直後に追加する:

```typescript
// detail 画面の kebab メニュー単体の再描画 (処理完了後にロックを解除するポーリング用)
noteRoutes.get("/:id/actions", async (c) => {
  const id = parseId(c.req.param("id"));
  if (id === null) return c.text("ID が不正です", 400);
  const note = await getNote(c.var.noteRepository, id);
  if (!note) return c.notFound();

  const html = await engine.renderFile("partials/note-actions", {
    note,
    processing: isNoteProcessing(id),
  });
  return c.html(html);
});
```

`src/app/presentation/routes/pages.ts` の `GET /notes/:id` で render に渡すデータに追加する:

```typescript
  const html = await c.var.render("note", {
    title: note.title || "無題",
    note,
    bodyHtml,
    tags,
    graphData,
    // 処理中は編集・削除メニューをロックする (note-actions partial が参照)
    processing: isNoteProcessing(id),
  });
```

`public/css/style.css` の `.kebab-dropdown button.danger:hover` 規則 (172 行目) の直後に追加する
(danger 規則と同じ詳細度なので、後に書くことで disabled が勝つ):

```css
.kebab-dropdown button:disabled { color: var(--muted); cursor: not-allowed; }
.kebab-dropdown button:disabled:hover { background: none; }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `bun run check && bun test src/app/presentation/routes/`
Expected: PASS (xss-regression 等の既存 detail ページ描画テストも含めてすべて通ること)

- [ ] **Step 5: コミット**

```bash
git add src/app/presentation/views/partials/note-actions.liquid src/app/presentation/views/pages/note.liquid src/app/presentation/routes/notes.ts src/app/presentation/routes/pages.ts public/css/style.css src/app/presentation/routes/notes-processing.test.ts
git commit -m "feat: lock detail menu while note processing"
```

---

### Task 4: 処理中カードから削除ボタンを外す

**Files:**
- Modify: `src/app/presentation/views/partials/note-card.liquid:24-37`
- Test: `src/app/presentation/routes/notes-processing.test.ts`

**Interfaces:**
- Consumes: `note-card.liquid` の `processing` 変数 (既存)
- Produces: 処理中カードの kebab はダウンロードのみ。通常カードは従来どおり。

- [ ] **Step 1: 失敗するテストを書く**

`src/app/presentation/routes/notes-processing.test.ts` の既存テスト
「POST /api/notes は処理中カードを返す」のアサーションに追加する:

```typescript
    // 処理中は削除を出さない。DELETE は 409 で拒否されるため、押せても失敗するだけのボタンになる
    expect(html).not.toContain("hx-delete");
```

既存テスト「処理中のノートの GET /api/notes/:id/card は処理中カードを返す」にも同じ 1 行を追加する。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `bun test src/app/presentation/routes/notes-processing.test.ts`
Expected: FAIL。処理中カードに `hx-delete` が含まれている。

- [ ] **Step 3: note-card.liquid を修正する**

`src/app/presentation/views/partials/note-card.liquid` の 24 行目のコメントを更新し、
削除ボタンを `{% unless processing %}` で囲む。該当ブロックを以下に置き換える:

```liquid
      {%- comment -%} 処理中でもメニューは残す (ダウンロード用)。削除は PUT/DELETE の処理中 409 に合わせて出さない {%- endcomment -%}
      {% if showMenu %}
      <div class="kebab-menu">
        <button class="kebab-btn" aria-label="メニュー" onclick="event.stopPropagation(); toggleKebab(this)">&#x22EE;</button>
        <div class="kebab-dropdown">
          <a href="/api/notes/{{ note.id }}/download"
            onclick="event.stopPropagation(); this.closest('.kebab-menu').classList.remove('open')">ダウンロード</a>
          {% unless processing %}
          <button class="danger"
            hx-delete="/api/notes/{{ note.id }}"
            hx-target="#note-{{ note.id }}"
            hx-swap="delete"
            onclick="event.stopPropagation()">削除</button>
          {% endunless %}
        </div>
      </div>
      {% endif %}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `bun run check && bun test src/app/presentation/routes/`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/app/presentation/views/partials/note-card.liquid src/app/presentation/routes/notes-processing.test.ts
git commit -m "feat: hide delete on processing note card"
```

---

### Task 5: 全体検証

**Files:**
- なし (検証のみ)

- [ ] **Step 1: 全テストと静的チェックを実行する**

Run: `bun run check && bun run test`
Expected: すべて PASS (DB 前提のテストがあるため `docker compose -f compose.local.yaml up -d` を先に実行しておく)

- [ ] **Step 2: 実機で挙動を確認する**

`bun run dev` を起動し、ブラウザで以下を確認する:

1. ノート詳細 → 三点リーダ → 編集 → 保存 → 即座に detail に戻る (3 秒待たない)。
2. 戻った直後の三点リーダで編集・削除が「(処理中)」で無効化されている。
3. 数秒後 (ポーリング後) にメニューが自動で通常に戻る。
4. 処理中に home を開くと当該カードがグレーの処理中カードになり、kebab にダウンロードだけが出る。
5. 処理完了後にカードが通常表示に戻り、detail を再ロードすると新しいタグ (グラフ) が反映されている。

Expected: 上記 5 点がすべて確認できる。問題があれば該当タスクに戻って修正する。
