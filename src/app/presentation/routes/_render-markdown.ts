import markdownToHtml from "zenn-markdown-html";

// Zenn hides line breaks around standalone URLs, even without a card renderer.
// Block links preserve those lines for card, GitHub, and tweet URLs. Built-in
// renderers, including YouTube, take precedence when the options are merged.
// A span stays valid inside a paragraph; CSS supplies its block layout.

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function blockLink(url: string): string {
  const escaped = escapeHtml(url);
  return `<span class="md-block-link"><a href="${escaped}" target="_blank" rel="nofollow noopener noreferrer">${escaped}</a></span>`;
}

export async function renderMarkdown(body: string): Promise<string> {
  return markdownToHtml(body, {
    customEmbed: {
      card: blockLink,
      github: blockLink,
      tweet: blockLink,
    },
  });
}
