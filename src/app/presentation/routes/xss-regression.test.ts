import { describe, expect, test } from "bun:test";
import { createTestApp, makeNote } from "./_test-helper";

// private security advisory への回帰テスト:
//   GHSA-cg9f-774f-c45r (Liquid auto-escape)
//   GHSA-f36f-v24r-855m (検索ハイライト)
//   GHSA-j2m9-c6gf-6vfx (SVG upload)
// Liquid の outputEscape を外したり、highlightText を unescape 版に戻すと、ここが落ちる。

describe("XSS 回帰テスト (route)", () => {
  const TITLE_PAYLOAD = "<script>alert(1)</script>";
  const BODY_PAYLOAD = "<img src=x onerror=alert(1)>";

  test("タイトルの <script> は GET / の一覧でエスケープされ、裸では出力されない", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1, title: TITLE_PAYLOAD, body: "本文" })] });

    const res = await app.request("/");

    expect(res.status).toBe(200);
    const html = await res.text();
    // ペイロードがそのまま (裸の script タグとして) 出ていないこと
    expect(html).not.toContain(TITLE_PAYLOAD);
    // エスケープされた形で含まれていること
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("本文の <img onerror> は GET / の一覧スニペットでエスケープされる", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1, title: "タイトル", body: BODY_PAYLOAD })] });

    const res = await app.request("/");

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain(BODY_PAYLOAD);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  test("検索ハイライトは GET /api/search で裸の <script> を出力しない (<mark> は trusted)", async () => {
    const { app } = createTestApp({
      searchResults: [makeNote({ id: 1, title: "タイトル", body: "<script>alert(1)</script> script" })],
    });

    const res = await app.request("/api/search?q=script");

    expect(res.status).toBe(200);
    const html = await res.text();
    // 裸の script タグが一切残らないこと (<mark> がエスケープ文字列の中に挿入されるため
    // "&lt;script&gt;" は連続しないが、"<script" が出ないことで XSS でないと言える)
    expect(html).not.toContain("<script");
    // 山括弧はエスケープされていること
    expect(html).toContain("&lt;");
    // ハイライト用の <mark> は use case 側で escape 済みのテキストに付与されるので出てよい
    expect(html).toContain("<mark>");
  });

  test("SVG アップロードは 400 で拒否され、storage に書き込まれない", async () => {
    const { app, storageUpload } = createTestApp();

    const svg = "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>";
    const form = new FormData();
    form.append("file", new File([svg], "xss.svg", { type: "image/svg+xml" }));

    // csrf ミドルウェアが unsafe メソッド + form 系 content-type で Origin 一致を要求するため明示する
    const res = await app.request("http://localhost/api/upload", {
      method: "POST",
      headers: { Origin: "http://localhost" },
      body: form,
    });

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("対応していないファイル形式です");
    expect(storageUpload).not.toHaveBeenCalled();
  });
});
