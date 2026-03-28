-- reknotes database schema

-- ナレッジノート（原子的アイデア単位 = Zettelkasten原則）
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);

-- タグ
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

-- ノートとタグの中間テーブル
CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);

-- 孤立タグ自動削除（note_tags から行が消えたとき、どのノートにも紐づかないタグを削除）
CREATE TRIGGER IF NOT EXISTS cleanup_orphan_tags AFTER DELETE ON note_tags
BEGIN
    DELETE FROM tags WHERE id = OLD.tag_id
      AND NOT EXISTS (SELECT 1 FROM note_tags WHERE tag_id = OLD.tag_id);
END;

-- ノート embedding テーブル（384次元ベクトルを BLOB で保存）
CREATE TABLE IF NOT EXISTS note_embeddings (
    note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL
);

