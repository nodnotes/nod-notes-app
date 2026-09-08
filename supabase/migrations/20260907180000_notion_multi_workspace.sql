-- Allow multiple Notion workspace connections per Nod Notes user
ALTER TABLE notion_connections DROP CONSTRAINT IF EXISTS notion_connections_user_id_unique;

DROP INDEX IF EXISTS notion_connections_user_workspace_unique;

ALTER TABLE notion_connections
  ADD CONSTRAINT notion_connections_user_workspace_unique UNIQUE (user_id, workspace_id);
