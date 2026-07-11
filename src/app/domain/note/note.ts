export interface Note {
  id: number;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export function resolveTitle(title: string, body: string): string {
  return title.trim() || body.slice(0, 30).trim();
}

const MAX_FILENAME_LENGTH = 100;

export function resolveDownloadFilename(note: Note): string {
  const sanitized = note.title
    // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字をファイル名から除外するのが目的
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, "-")
    .slice(0, MAX_FILENAME_LENGTH)
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return sanitized ? `${sanitized}.md` : `note-${note.id}.md`;
}
