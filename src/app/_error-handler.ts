// 想定外の例外をクライアントに返す際のレスポンス整形を担う純関数。
// HTTPException の分岐やログ出力は onError 側で行い、ここでは
// 「汎用 500 を /api と HTML で出し分ける」責務だけを持たせてテスト可能にする。
export type ErrorResponseShape = {
  status: number;
  contentType: "application/json" | "text/html";
  body: string;
};

// 想定外例外に対する汎用 500 レスポンスを組み立てる。
// スタックや元の err.message はクライアントに含めない（情報漏洩防止）。
// /api パスは requestId 付き JSON、それ以外は固定の HTML を返す。
export function buildErrorResponse(_err: Error, opts: { requestId: string; isApi: boolean }): ErrorResponseShape {
  if (opts.isApi) {
    return {
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Internal Server Error", requestId: opts.requestId }),
    };
  }
  return {
    status: 500,
    contentType: "text/html",
    body: "<!doctype html><h1>500 Internal Server Error</h1>",
  };
}
