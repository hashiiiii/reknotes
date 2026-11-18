export type ErrorResponseShape = {
  status: number;
  contentType: "application/json" | "text/html";
  body: string;
};

// Generic responses keep exception messages and stack traces out of client-visible output.
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
