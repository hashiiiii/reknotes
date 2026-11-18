import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./_render-markdown";

// Zenn hides line breaks around standalone URLs even when no card renderer exists.
// Block links must preserve these lines without replacing supported built-in embeds.

describe("renderMarkdown", () => {
  test("renders standalone URLs as block links", async () => {
    const html = await renderMarkdown("あいう\nhttps://example.com/page\nかきく");

    // The block wrapper preserves a separate line even when adjacent breaks are hidden.
    expect(html).toContain('<span class="md-block-link">');
    expect(html).toContain('href="https://example.com/page"');
  });

  test("renders standalone GitHub blob URLs as block links", async () => {
    // GitHub URLs use a separate renderer from ordinary cards and need their own regression.
    const url = "https://github.com/hashiiiii/reknotes/blob/main/README.md";
    const html = await renderMarkdown(`あいう\n${url}\nかきく`);

    expect(html).toContain('<span class="md-block-link">');
    expect(html).toContain(`href="${url}"`);
  });

  test("renders standalone Twitter/X URLs as block links", async () => {
    // Tweets use another renderer, so the card test alone cannot cover them.
    const url = "https://x.com/hashiiiii/status/1234567890";
    const html = await renderMarkdown(`あいう\n${url}\nかきく`);

    expect(html).toContain('<span class="md-block-link">');
    expect(html).toContain(`href="${url}"`);
  });

  test("escapes URL query strings", async () => {
    const html = await renderMarkdown("https://example.com/?a=1&b=2");

    expect(html).toContain("?a=1&amp;b=2");
    expect(html).not.toContain('href="https://example.com/?a=1&b=2"');
  });

  test("preserves single line breaks without URLs", async () => {
    // Custom embeds must preserve Zenn's normal breaks: true behavior.
    const html = await renderMarkdown("あいう\nかきく");

    expect(html).toContain("<br />");
    expect(html).not.toContain("display:none");
  });

  test("preserves the built-in player for standalone YouTube URLs", async () => {
    // Merging custom renderers must not replace the built-in YouTube player.
    const html = await renderMarkdown("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).not.toContain('<span class="md-block-link">');
  });
});
