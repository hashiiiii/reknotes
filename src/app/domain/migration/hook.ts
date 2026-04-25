export type HookKind = "pre" | "post";

export type HookFile = {
  filename: string;
  kind: HookKind;
  checksum: string;
  content: string;
};

export type AppliedHook = {
  filename: string;
  checksum: string;
};

const HOOK_FILENAME_PATTERN = /\.(pre|post)\.sql$/;

export function isHookFilename(filename: string): boolean {
  return HOOK_FILENAME_PATTERN.test(filename);
}

export function classifyHook(filename: string): HookKind {
  return filename.endsWith(".pre.sql") ? "pre" : "post";
}

export function sortHooks(hooks: HookFile[]): HookFile[] {
  return [...hooks].sort((a, b) => a.filename.localeCompare(b.filename));
}
