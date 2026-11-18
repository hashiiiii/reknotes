import { describe, expect, test } from "bun:test";
import { createTestApp, makeNote } from "./_test-helper";

// These regressions guard the fixes recorded in private security advisories:
//   GHSA-cg9f-774f-c45r (Liquid auto-escape)
//   GHSA-f36f-v24r-855m (search highlighting)
//   GHSA-j2m9-c6gf-6vfx (SVG upload)
// Removing Liquid escaping or returning raw highlight content must fail these tests.

describe("XSS route regressions", () => {
  const TITLE_PAYLOAD = "<script>alert(1)</script>";
  const BODY_PAYLOAD = "<img src=x onerror=alert(1)>";

  test("escapes script elements in titles on the home page", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1, title: TITLE_PAYLOAD, body: "本文" })] });

    const res = await app.request("/");

    expect(res.status).toBe(200);
    const html = await res.text();
    // The same content must remain visible as text without becoming executable markup.
    expect(html).not.toContain(TITLE_PAYLOAD);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  test("escapes image error handlers in home-page snippets", async () => {
    const { app } = createTestApp({ notes: [makeNote({ id: 1, title: "タイトル", body: BODY_PAYLOAD })] });

    const res = await app.request("/");

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain(BODY_PAYLOAD);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  test("escapes scripts in search highlights while allowing trusted mark elements", async () => {
    const { app } = createTestApp({
      searchResults: [makeNote({ id: 1, title: "タイトル", body: "<script>alert(1)</script> script" })],
    });

    const res = await app.request("/api/search?q=script");

    expect(res.status).toBe(200);
    const html = await res.text();
    // Highlight marks can split escaped text, so checking for executable opening
    // tags is more reliable than requiring a contiguous escaped script tag.
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;");
    // Intentional highlight markup may wrap text only after that text is escaped.
    expect(html).toContain("<mark>");
  });

  test("rejects SVG uploads with status 400 before writing to storage", async () => {
    const { app, storageUpload } = createTestApp();

    const svg = "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>";
    const form = new FormData();
    form.append("file", new File([svg], "xss.svg", { type: "image/svg+xml" }));

    // Form requests need a matching origin to reach upload validation through CSRF protection.
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
