import { describe, expect, test } from "bun:test";
import { isObjectNotFoundError } from "./s3-storage-provider";

describe("isObjectNotFoundError", () => {
  test("recognizes NoSuchKey from S3 and MinIO", () => {
    expect(isObjectNotFoundError({ name: "NoSuchKey" })).toBe(true);
  });

  test("recognizes NotFound errors", () => {
    expect(isObjectNotFoundError({ name: "NotFound" })).toBe(true);
  });

  test("recognizes HTTP 404 even when the provider uses a different error name", () => {
    expect(isObjectNotFoundError({ $metadata: { httpStatusCode: 404 } })).toBe(true);
  });

  test("does not hide permission errors as missing objects", () => {
    expect(isObjectNotFoundError({ name: "AccessDenied", $metadata: { httpStatusCode: 403 } })).toBe(false);
  });

  test("does not treat server errors as missing objects", () => {
    expect(isObjectNotFoundError({ name: "InternalError", $metadata: { httpStatusCode: 500 } })).toBe(false);
  });

  test("does not treat generic network errors as missing objects", () => {
    expect(isObjectNotFoundError(new Error("connection reset"))).toBe(false);
  });

  test("rejects null, strings, and other values that are not error objects", () => {
    expect(isObjectNotFoundError(null)).toBe(false);
    expect(isObjectNotFoundError(undefined)).toBe(false);
    expect(isObjectNotFoundError("NoSuchKey")).toBe(false);
  });
});
