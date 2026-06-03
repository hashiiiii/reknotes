import { describe, expect, test } from "bun:test";
import { buildErrorResponse } from "./_error-handler";

describe("buildErrorResponse", () => {
  test("/api パスは requestId 付き JSON を 500 で返す", () => {
    const err = new Error("boom-secret");
    const res = buildErrorResponse(err, { requestId: "req-123", isApi: true });

    expect(res.status).toBe(500);
    expect(res.contentType).toBe("application/json");
    // requestId はクライアントへ返る JSON ボディに含まれる
    expect(res.body).toContain("req-123");
    expect(JSON.parse(res.body)).toEqual({ error: "Internal Server Error", requestId: "req-123" });
  });

  test("/api の JSON ボディに元メッセージ/スタックを含めない", () => {
    const err = new Error("boom-secret");
    const res = buildErrorResponse(err, { requestId: "req-123", isApi: true });

    // 情報漏洩防止: 元の err.message も err.stack もクライアントへ漏らさない
    expect(res.body).not.toContain("boom-secret");
    expect(err.stack).toBeDefined();
    expect(res.body).not.toContain(err.stack as string);
  });

  test("非 /api パスは固定の HTML を 500 で返す", () => {
    const err = new Error("boom-secret");
    const res = buildErrorResponse(err, { requestId: "req-123", isApi: false });

    expect(res.status).toBe(500);
    expect(res.contentType).toBe("text/html");
    expect(res.body).toBe("<!doctype html><h1>500 Internal Server Error</h1>");
  });

  test("HTML ボディにも元メッセージ/スタックを含めない", () => {
    const err = new Error("boom-secret");
    const res = buildErrorResponse(err, { requestId: "req-123", isApi: false });

    expect(res.body).not.toContain("boom-secret");
    expect(err.stack).toBeDefined();
    expect(res.body).not.toContain(err.stack as string);
  });
});
