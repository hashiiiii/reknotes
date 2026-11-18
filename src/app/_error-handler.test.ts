import { describe, expect, test } from "bun:test";
import { buildErrorResponse } from "./_error-handler";

describe("buildErrorResponse", () => {
  test("returns JSON with status 500 and a request ID for API paths", () => {
    const err = new Error("boom-secret");
    const res = buildErrorResponse(err, { requestId: "req-123", isApi: true });

    expect(res.status).toBe(500);
    expect(res.contentType).toBe("application/json");
    // Clients need the request ID to correlate the failure with server logs.
    expect(res.body).toContain("req-123");
    expect(JSON.parse(res.body)).toEqual({ error: "Internal Server Error", requestId: "req-123" });
  });

  test("omits the original message and stack from API responses", () => {
    const err = new Error("boom-secret");
    const res = buildErrorResponse(err, { requestId: "req-123", isApi: true });

    // Both the original message and stack can reveal internal details.
    expect(res.body).not.toContain("boom-secret");
    expect(err.stack).toBeDefined();
    expect(res.body).not.toContain(err.stack as string);
  });

  test("returns fixed HTML with status 500 for other paths", () => {
    const err = new Error("boom-secret");
    const res = buildErrorResponse(err, { requestId: "req-123", isApi: false });

    expect(res.status).toBe(500);
    expect(res.contentType).toBe("text/html");
    expect(res.body).toBe("<!doctype html><h1>500 Internal Server Error</h1>");
  });

  test("omits the original message and stack from HTML responses", () => {
    const err = new Error("boom-secret");
    const res = buildErrorResponse(err, { requestId: "req-123", isApi: false });

    expect(res.body).not.toContain("boom-secret");
    expect(err.stack).toBeDefined();
    expect(res.body).not.toContain(err.stack as string);
  });
});
