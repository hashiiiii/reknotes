import { mock } from "bun:test";
import { createApp } from "../..";
import type { IEmbeddingProvider } from "../../application/port/embedding-provider";
import type { IStorageProvider } from "../../application/port/storage-provider";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";

// Route tests isolate HTTP routing and rendering from DB, S3, and inference.

// Unexpected dependency calls must fail so a test cannot pass through the wrong path.
function notStubbed<T extends object>(label: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      return () => {
        throw new Error(`${label}.${String(prop)} is not configured for this test`);
      };
    },
  });
}

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 1,
    pinned: false,
    title: "タイトル",
    body: "本文",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

export interface TestAppOptions {
  notes?: Note[];
  // Search fixtures supply the content used to verify highlighting.
  searchResults?: Note[];
  // Omitted dependencies reject access rather than silently supplying data.
  graphRepository?: IGraphRepository;
  tagRepository?: ITagRepository;
  embeddingProvider?: IEmbeddingProvider;
}

export function createTestApp(options: TestAppOptions = {}) {
  const notes = options.notes ?? [];
  const searchResults = options.searchResults ?? [];
  // Generated IDs must not collide with the supplied note fixtures.
  let nextId = 1000;

  const noteRepository: INoteRepository = {
    setPinned: notStubbed<INoteRepository>("noteRepository").setPinned,
    list: async () => ({ notes, hasMore: false }),
    findTagsByNoteIds: async () => new Map<number, string[]>(),
    searchByQuery: async () => searchResults,
    create: async (title, body) => {
      const note = makeNote({ id: nextId++, title, body });
      notes.unshift(note);
      return note;
    },
    findById: async (id) => notes.find((note) => note.id === id) ?? null,
    update: async (id, title, body) => {
      const note = notes.find((n) => n.id === id);
      if (!note) return null;
      note.title = title;
      note.body = body;
      return note;
    },
    delete: async () => false,
    deleteAll: async () => {},
    findTagsByNoteId: async () => [],
  };

  // Rejected SVG uploads must never reach storage.
  const storageUpload = mock(async (_key: string, _buffer: Uint8Array, _contentType: string): Promise<void> => {});
  const storageProvider: IStorageProvider = {
    upload: storageUpload,
    uploadStream: async () => {},
    get: async () => null,
    delete: async () => {},
    list: async function* () {},
  };

  const app = createApp(
    noteRepository,
    options.tagRepository ?? notStubbed<ITagRepository>("tagRepository"),
    options.graphRepository ?? notStubbed<IGraphRepository>("graphRepository"),
    storageProvider,
    options.embeddingProvider ?? notStubbed<IEmbeddingProvider>("embeddingProvider"),
  );

  return { app, storageUpload };
}
