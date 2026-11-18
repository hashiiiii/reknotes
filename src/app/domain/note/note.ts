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
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Filenames must exclude control characters.
  const withoutReserved = note.title.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, "-");
  // Truncating by code point avoids splitting UTF-16 surrogate pairs.
  const sanitized = [...withoutReserved]
    .slice(0, MAX_FILENAME_LENGTH)
    .join("")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return sanitized ? `${sanitized}.md` : `note-${note.id}.md`;
}
