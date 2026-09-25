-- Named board change history: utility Changes tab (JPEG thumbs + live snapshot preview).

CREATE TABLE IF NOT EXISTS board_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Change row
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Owner
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL, -- Source board; thumb stays if the board is deleted
  title TEXT NOT NULL DEFAULT 'New board', -- Board name at save
  preview_data_url TEXT, -- JPEG of the board view (utility thumb)
  snapshot JSONB, -- Frozen board (frames / threads / drawings) at save
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Save time
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- Last title edit
);

CREATE INDEX IF NOT EXISTS idx_board_changes_user_created
  ON board_changes (user_id, created_at DESC); -- Own list: newest first

CREATE INDEX IF NOT EXISTS idx_board_changes_user_conversation
  ON board_changes (user_id, conversation_id, created_at DESC); -- This board filter

ALTER TABLE board_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own changes"
  ON board_changes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()); -- Private history

CREATE POLICY "Users can insert their own changes"
  ON board_changes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()); -- Owner only

CREATE POLICY "Users can update their own changes"
  ON board_changes FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid()); -- Rename

CREATE POLICY "Users can delete their own changes"
  ON board_changes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()); -- Drop a save

CREATE OR REPLACE FUNCTION update_board_changes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW(); -- Stamp rename
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS board_changes_updated_at ON board_changes;
CREATE TRIGGER board_changes_updated_at
  BEFORE UPDATE ON board_changes
  FOR EACH ROW
  EXECUTE FUNCTION update_board_changes_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON board_changes TO authenticated; -- Utility gallery
GRANT ALL ON board_changes TO service_role; -- Admin / service
