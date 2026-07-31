import markdownToHtml from "zenn-markdown-html";

// zenn-markdown-html は URL 単独行をリンクカードに変換する前提で前後の <br> を
// display:none にする。カード生成器が無い種別 (card / github / tweet) は
// インラインリンクにフォールバックし、改行だけが消えて行が潰れる。
// ブロック表示のリンクを生成器として与えることで行を保つ。
// youtube などデフォルト生成器を持つ種別はマージで既定の埋め込みが優先される。
// <p> 内に挿入されるため span (+ CSS で display:block) を使う。

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
