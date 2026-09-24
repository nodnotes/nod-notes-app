-- Public board templates: utility Templates tab (yours + others) with view previews.

CREATE TABLE IF NOT EXISTS board_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Template row
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- Publisher
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL, -- Source board; thumb stays if the board is deleted
  title TEXT NOT NULL DEFAULT 'New board', -- Board name at publish
  author_name TEXT, -- Cached publisher label for Others rows
  preview_data_url TEXT, -- JPEG of the board view (utility thumb + expanded preview)
  is_public BOOLEAN NOT NULL DEFAULT TRUE, -- Gallery visibility; Create public template is always public
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- First publish
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Last republish
  CONSTRAINT board_templates_user_conversation_unique UNIQUE (user_id, conversation_id) -- One public template per board per user
);

CREATE INDEX IF NOT EXISTS idx_board_templates_public_created
  ON board_templates (is_public, created_at DESC)
  WHERE is_public = TRUE; -- Others gallery: newest public first

CREATE INDEX IF NOT EXISTS idx_board_templates_user_id ON board_templates(user_id); -- Yours list

ALTER TABLE board_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view public templates or their own"
  ON board_templates FOR SELECT
  TO authenticated
  USING (is_public = TRUE OR user_id = auth.uid()); -- Public gallery + own drafts

CREATE POLICY "Users can insert their own templates"
  ON board_templates FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid()); -- Publisher only

CREATE POLICY "Users can update their own templates"
  ON board_templates FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid()); -- Republish preview / title

CREATE POLICY "Users can delete their own templates"
  ON board_templates FOR DELETE
  TO authenticated
  USING (user_id = auth.uid()); -- Unpublish

CREATE OR REPLACE FUNCTION update_board_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW(); -- Stamp republish
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS board_templates_updated_at ON board_templates;
CREATE TRIGGER board_templates_updated_at
  BEFORE UPDATE ON board_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_board_templates_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON board_templates TO authenticated; -- Utility gallery
GRANT ALL ON board_templates TO service_role; -- Admin / service
