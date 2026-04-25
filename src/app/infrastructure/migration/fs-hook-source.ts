import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { IHookSource } from "../../application/port/hook-source";
import { computeChecksum } from "../../domain/migration/checksum";
import { classifyHook, type HookFile, isHookFilename, sortHooks } from "../../domain/migration/hook";

export class FsHookSource implements IHookSource {
  constructor(private readonly dir: string) {}

  list(): HookFile[] {
    if (!existsSync(this.dir)) return [];
    const files = readdirSync(this.dir).filter(isHookFilename);
    const hooks = files.map((filename): HookFile => {
      const content = readFileSync(join(this.dir, filename), "utf-8");
      return {
        filename,
        kind: classifyHook(filename),
        checksum: computeChecksum(content),
        content,
      };
    });
    return sortHooks(hooks);
  }
}
