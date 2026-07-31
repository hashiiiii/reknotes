import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./_render-markdown";

// issue: URL 単独行の前後の単一改行がプレビューで潰れる。
// zenn-markdown-html は URL 単独行をリンクカードに変換する前提で前後の <br> を
// display:none にするが、カード生成器が無いとインラインリンクにフォールバックし、
// 改行だけが消える。生成器をブロック要素のリンクとして与えることで行を保つ。

describe("renderMarkdown", () => {
  test("URL 単独行はブロック要素のリンクとして描画される", async () => {
    const html = await renderMarkdown("あいう\nhttps://example.com/page\nかきく");

    // ブロック要素で包まれていれば、隠された <br> に関係なく行として分かれる
    expect(html).toContain('<span class="md-block-link">');
    expect(html).toContain('href="https://example.com/page"');
  });

  test("GitHub の blob URL 単独行もブロック要素のリンクとして描画される", async () => {
    // github URL は card とは別の生成器 (github) に振り分けられるため個別に確認する
    const url = "https://github.com/hashiiiii/reknotes/blob/main/README.md";
    const html = await renderMarkdown(`あいう\n${url}\nかきく`);

    expect(html).toContain('<span class="md-block-link">');
    expect(html).toContain(`href="${url}"`);
  });

  test("Twitter/X の URL 単独行もブロック要素のリンクとして描画される", async () => {
    // tweet も card とは別の生成器に振り分けられる
    const url = "https://x.com/hashiiiii/status/1234567890";
    const html = await renderMarkdown(`あいう\n${url}\nかきく`);

    expect(html).toContain('<span class="md-block-link">');
    expect(html).toContain(`href="${url}"`);
  });

  test("URL のクエリ文字列はエスケープされて出力される", async () => {
    const html = await renderMarkdown("https://example.com/?a=1&b=2");

    expect(html).toContain("?a=1&amp;b=2");
    expect(html).not.toContain('href="https://example.com/?a=1&b=2"');
  });

  test("URL を含まない単一改行は <br> として保持される", async () => {
    // zenn-markdown-html 標準の挙動 (breaks: true) が壊れていないことの保証
    const html = await renderMarkdown("あいう\nかきく");

    expect(html).toContain("<br />");
    expect(html).not.toContain("display:none");
  });

  test("YouTube の URL 単独行は既定の埋め込みプレイヤーのまま", async () => {
    // customEmbed はデフォルト生成器とマージされる。card 以外を上書きして
    // 既定の youtube 埋め込みを潰していないことの保証
    const html = await renderMarkdown("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).not.toContain('<span class="md-block-link">');
  });
});
