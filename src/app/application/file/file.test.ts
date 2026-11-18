import { describe, expect, test } from "bun:test";
import { buildFileMarkdown, buildFileUrl, extractUploadedFileKeys } from "./_file-url";

describe("buildFileUrl", () => {
  test("prefixes filenames with /api/files", () => {
    expect(buildFileUrl("abc.png")).toBe("/api/files/abc.png");
  });
});

describe("buildFileMarkdown", () => {
  test("uses Markdown image syntax for images", () => {
    expect(buildFileMarkdown({ filename: "abc.png", originalName: "photo.png", contentType: "image/png" })).toBe(
      "![photo.png](/api/files/abc.png)",
    );
  });

  test("uses a video element for videos", () => {
    expect(buildFileMarkdown({ filename: "v.mp4", originalName: "clip.mp4", contentType: "video/mp4" })).toBe(
      '<video src="/api/files/v.mp4" controls></video>',
    );
  });

  test("escapes brackets and parentheses in alt text", () => {
    expect(buildFileMarkdown({ filename: "f.png", originalName: "img(1)[draft].png", contentType: "image/png" })).toBe(
      "![img\\(1\\)\\[draft\\].png](/api/files/f.png)",
    );
  });
});

describe("extractUploadedFileKeys", () => {
  test("returns an empty list for empty input", () => {
    expect(extractUploadedFileKeys("")).toEqual([]);
  });

  test("returns an empty list for text without file URLs", () => {
    expect(extractUploadedFileKeys("hello world")).toEqual([]);
  });

  test("extracts the key from a Markdown image", () => {
    expect(extractUploadedFileKeys("![photo](/api/files/abc.png)")).toEqual(["abc.png"]);
  });

  test("extracts the key from a video element", () => {
    expect(extractUploadedFileKeys('<video src="/api/files/v.mp4" controls></video>')).toEqual(["v.mp4"]);
  });

  test("extracts every key from multiple file URLs", () => {
    const text = "![](/api/files/a.png) と ![](/api/files/b.jpg)";
    expect(extractUploadedFileKeys(text)).toEqual(["a.png", "b.jpg"]);
  });

  test("extracts the key when alt text contains an escaped closing bracket", () => {
    const text = "![weird\\]name](/api/files/safe.png)";
    expect(extractUploadedFileKeys(text)).toEqual(["safe.png"]);
  });
});
