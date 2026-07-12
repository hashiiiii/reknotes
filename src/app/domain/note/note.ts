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
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字をファイル名から除外するのが目的
  const withoutReserved = note.title.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, "-");
  // String.prototype.slice は UTF-16 単位で切ってサロゲートペアを分断し得るため、コードポイント単位で切り詰める
  const sanitized = [...withoutReserved]
    .slice(0, MAX_FILENAME_LENGTH)
    .join("")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return sanitized ? `${sanitized}.md` : `note-${note.id}.md`;
}
