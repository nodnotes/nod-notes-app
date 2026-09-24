-- Frozen template snapshots: submit for easayani@goalfish.io review before public.
-- Later board edits do not change a submitted row.

ALTER TABLE board_templates
  ADD COLUMN IF NOT EXISTS description TEXT, -- Listing copy from the creation page
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  ADD COLUMN IF NOT EXISTS snapshot JSONB, -- Frozen board (frames / threads / drawings) at submit
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ, -- When the reviewer decided
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL; -- Reviewer

ALTER TABLE board_templates
  DROP CONSTRAINT IF EXISTS board_templates_status_check;

ALTER TABLE board_templates
  ADD CONSTRAINT board_templates_status_check
  CHECK (status IN ('pending', 'approved', 'rejected')); -- Known review states

-- One submit = one frozen row; drop the upsert unique so a later submit is a new snapshot
ALTER TABLE board_templates
  DROP CONSTRAINT IF EXISTS board_templates_user_conversation_unique;

-- Existing public rows were live-published; treat them as already approved
UPDATE board_templates
SET status = 'approved',
    is_public = TRUE
WHERE is_public = TRUE AND status IS DISTINCT FROM 'approved';

UPDATE board_templates
SET status = 'pending',
    is_public = FALSE
WHERE status IS DISTINCT FROM 'approved' AND status IS DISTINCT FROM 'rejected';

ALTER TABLE board_templates
  ALTER COLUMN is_public SET DEFAULT FALSE; -- New submits wait for review

CREATE INDEX IF NOT EXISTS idx_board_templates_status_created
  ON board_templates (status, created_at DESC); -- Submissions + All lists

-- Reviewer is the signed-in JWT email (auth email, not user_metadata)
CREATE OR REPLACE FUNCTION public.is_board_template_reviewer()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'easayani@goalfish.io';
$$;

REVOKE ALL ON FUNCTION public.is_board_template_reviewer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_board_template_reviewer() TO authenticated;

-- Content is frozen after insert; only review fields may change
CREATE OR REPLACE FUNCTION public.board_templates_freeze_content()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.author_name IS DISTINCT FROM OLD.author_name
     OR NEW.preview_data_url IS DISTINCT FROM OLD.preview_data_url
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
  THEN
    RAISE EXCEPTION 'Templates cannot be changed after submit';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS board_templates_freeze_content ON board_templates;
CREATE TRIGGER board_templates_freeze_content
  BEFORE UPDATE ON board_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.board_templates_freeze_content();

DROP POLICY IF EXISTS "Signed-in users can view public templates or their own" ON board_templates;
DROP POLICY IF EXISTS "Users can insert their own templates" ON board_templates;
DROP POLICY IF EXISTS "Users can update their own templates" ON board_templates;
DROP POLICY IF EXISTS "Users can delete their own templates" ON board_templates;

CREATE POLICY "View approved public, own, or reviewer queue"
  ON board_templates FOR SELECT
  TO authenticated
  USING (
    (status = 'approved' AND is_public = TRUE)
    OR user_id = auth.uid()
    OR public.is_board_template_reviewer()
  );

CREATE POLICY "Users submit their own pending templates"
  ON board_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND is_public = FALSE
  );

CREATE POLICY "Reviewer updates status only"
  ON board_templates FOR UPDATE
  TO authenticated
  USING (public.is_board_template_reviewer())
  WITH CHECK (public.is_board_template_reviewer());

CREATE POLICY "Withdraw pending or reviewer delete"
  ON board_templates FOR DELETE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR public.is_board_template_reviewer()
  );
