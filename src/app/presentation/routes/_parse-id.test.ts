import { describe, expect, test } from "bun:test";
import { parseId } from "./_parse-id";

describe("parseId", () => {
  test("parses positive integer strings", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId("1")).toBe(1);
  });

  test("rejects nonnumeric input", () => {
    expect(parseId("abc")).toBeNull();
  });

  test("rejects fractions", () => {
    expect(parseId("1.5")).toBeNull();
  });

  test("rejects negative numbers", () => {
    expect(parseId("-1")).toBeNull();
  });

  test("rejects zero", () => {
    expect(parseId("0")).toBeNull();
  });

  test("rejects numbers above MAX_SAFE_INTEGER", () => {
    expect(parseId("9999999999999999999")).toBeNull();
  });

  test("rejects undefined input", () => {
    expect(parseId(undefined)).toBeNull();
  });

  test("rejects empty strings", () => {
    expect(parseId("")).toBeNull();
  });
});
