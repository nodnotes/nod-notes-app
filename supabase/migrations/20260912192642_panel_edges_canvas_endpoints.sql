-- Allow threads to terminate on canvas nodes (drawings / shapes), not only frames.
-- Each side is exactly one of: message (frame) or canvas_node.

ALTER TABLE panel_edges
  DROP CONSTRAINT IF EXISTS panel_edges_source_message_id_target_message_id_key;

ALTER TABLE panel_edges
  ALTER COLUMN source_message_id DROP NOT NULL,
  ALTER COLUMN target_message_id DROP NOT NULL;

ALTER TABLE panel_edges
  ADD COLUMN IF NOT EXISTS source_canvas_node_id UUID REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_canvas_node_id UUID REFERENCES canvas_nodes(id) ON DELETE CASCADE;

ALTER TABLE panel_edges
  DROP CONSTRAINT IF EXISTS panel_edges_source_kind_check,
  DROP CONSTRAINT IF EXISTS panel_edges_target_kind_check;

ALTER TABLE panel_edges
  ADD CONSTRAINT panel_edges_source_kind_check CHECK (
    (source_message_id IS NOT NULL)::int + (source_canvas_node_id IS NOT NULL)::int = 1
  ),
  ADD CONSTRAINT panel_edges_target_kind_check CHECK (
    (target_message_id IS NOT NULL)::int + (target_canvas_node_id IS NOT NULL)::int = 1
  );

ALTER TABLE panel_edges
  ADD COLUMN IF NOT EXISTS source_endpoint TEXT GENERATED ALWAYS AS (
    CASE
      WHEN source_message_id IS NOT NULL THEN 'm:' || source_message_id::text
      ELSE 'c:' || source_canvas_node_id::text
    END
  ) STORED,
  ADD COLUMN IF NOT EXISTS target_endpoint TEXT GENERATED ALWAYS AS (
    CASE
      WHEN target_message_id IS NOT NULL THEN 'm:' || target_message_id::text
      ELSE 'c:' || target_canvas_node_id::text
    END
  ) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS panel_edges_endpoints_unique
  ON panel_edges (source_endpoint, target_endpoint);

CREATE INDEX IF NOT EXISTS idx_panel_edges_source_canvas_node_id
  ON panel_edges (source_canvas_node_id)
  WHERE source_canvas_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_panel_edges_target_canvas_node_id
  ON panel_edges (target_canvas_node_id)
  WHERE target_canvas_node_id IS NOT NULL;
