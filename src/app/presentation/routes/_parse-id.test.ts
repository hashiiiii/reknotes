import { describe, expect, test } from "bun:test";
import { parseId } from "./_parse-id";

describe("parseId", () => {
  test("正の整数文字列はその数値を返す", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId("1")).toBe(1);
  });

  test("非数値は null", () => {
    expect(parseId("abc")).toBeNull();
  });

  test("小数は null", () => {
    expect(parseId("1.5")).toBeNull();
  });

  test("負の数は null", () => {
    expect(parseId("-1")).toBeNull();
  });

  test("0 は null", () => {
    expect(parseId("0")).toBeNull();
  });

  test("MAX_SAFE_INTEGER 超過は null", () => {
    expect(parseId("9999999999999999999")).toBeNull();
  });

  test("undefined は null", () => {
    expect(parseId(undefined)).toBeNull();
  });

  test("空文字は null", () => {
    expect(parseId("")).toBeNull();
  });
});
