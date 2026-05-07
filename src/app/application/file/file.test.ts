import { describe, expect, test } from "bun:test";
import { buildFileMarkdown, buildFileUrl, extractUploadedFileKeys } from "./_file-url";

describe("buildFileUrl", () => {
  test("filename を /api/files プレフィックスで URL 化する", () => {
    expect(buildFileUrl("abc.png")).toBe("/api/files/abc.png");
  });
});

describe("buildFileMarkdown", () => {
  test("画像は markdown image syntax で組む", () => {
    expect(buildFileMarkdown({ filename: "abc.png", originalName: "photo.png", contentType: "image/png" })).toBe(
      "![photo.png](/api/files/abc.png)",
    );
  });

  test("動画は <video> タグで組む", () => {
    expect(buildFileMarkdown({ filename: "v.mp4", originalName: "clip.mp4", contentType: "video/mp4" })).toBe(
      '<video src="/api/files/v.mp4" controls></video>',
    );
  });

  test("alt テキストの [ ] ( ) はエスケープされる", () => {
    expect(buildFileMarkdown({ filename: "f.png", originalName: "img(1)[draft].png", contentType: "image/png" })).toBe(
      "![img\\(1\\)\\[draft\\].png](/api/files/f.png)",
    );
  });
});

describe("extractUploadedFileKeys", () => {
  test("空文字列は空配列を返す", () => {
    expect(extractUploadedFileKeys("")).toEqual([]);
  });

  test("URL を含まないテキストは空配列を返す", () => {
    expect(extractUploadedFileKeys("hello world")).toEqual([]);
  });

  test("単一の image markdown からキーを抽出する", () => {
    expect(extractUploadedFileKeys("![photo](/api/files/abc.png)")).toEqual(["abc.png"]);
  });

  test("video タグからキーを抽出する", () => {
    expect(extractUploadedFileKeys('<video src="/api/files/v.mp4" controls></video>')).toEqual(["v.mp4"]);
  });

  test("複数の URL からそれぞれのキーを抽出する", () => {
    const text = "![](/api/files/a.png) と ![](/api/files/b.jpg)";
    expect(extractUploadedFileKeys(text)).toEqual(["a.png", "b.jpg"]);
  });

  test("alt にエスケープ済みの ] が含まれる markdown でも URL 部分のキーを正しく抽出する", () => {
    const text = "![weird\\]name](/api/files/safe.png)";
    expect(extractUploadedFileKeys(text)).toEqual(["safe.png"]);
  });
});
