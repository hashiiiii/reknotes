import { describe, expect, test } from "bun:test";
import { isObjectNotFoundError } from "./s3-storage-provider";

describe("isObjectNotFoundError", () => {
  test("NoSuchKey 例外は not found 扱い (S3/MinIO)", () => {
    expect(isObjectNotFoundError({ name: "NoSuchKey" })).toBe(true);
  });

  test("NotFound 例外は not found 扱い", () => {
    expect(isObjectNotFoundError({ name: "NotFound" })).toBe(true);
  });

  test("httpStatusCode 404 は not found 扱い (R2 など名前が異なる場合の保険)", () => {
    expect(isObjectNotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  test("権限エラーは not found ではない (握り潰さず伝播させる)", () => {
    expect(isObjectNotFoundError({ name: "AccessDenied", $metadata: { httpStatusCode: 403 } })).toBe(false);
  });

  test("サーバエラーは not found ではない", () => {
    expect(isObjectNotFoundError({ name: "InternalError", $metadata: { httpStatusCode: 500 } })).toBe(false);
  });

  test("Error インスタンス (ネットワーク断など) は not found ではない", () => {
    expect(isObjectNotFoundError(new Error("connection reset"))).toBe(false);
  });

  test("null / 文字列など object でない値は not found ではない", () => {
    expect(isObjectNotFoundError(null)).toBe(false);
    expect(isObjectNotFoundError(undefined)).toBe(false);
    expect(isObjectNotFoundError("NoSuchKey")).toBe(false);
  });
});
