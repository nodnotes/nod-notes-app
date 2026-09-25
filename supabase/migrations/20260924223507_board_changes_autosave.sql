-- Google Docs-style history: named pins + coalesced autosaves.

ALTER TABLE board_changes
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'named', -- named = + Save; auto = session snapshot
  ADD COLUMN IF NOT EXISTS content_hash TEXT; -- Skip a write when the board did not change

ALTER TABLE board_changes
  DROP CONSTRAINT IF EXISTS board_changes_kind_check;

ALTER TABLE board_changes
  ADD CONSTRAINT board_changes_kind_check
  CHECK (kind IN ('named', 'auto')); -- Known kinds only

CREATE INDEX IF NOT EXISTS idx_board_changes_user_board_kind_updated
  ON board_changes (user_id, conversation_id, kind, updated_at DESC); -- Session lookup + prune
