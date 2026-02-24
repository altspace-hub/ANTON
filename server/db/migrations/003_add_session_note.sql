-- Add user-editable note field to sessions for annotating work
ALTER TABLE sessions ADD COLUMN note TEXT;

-- Ensure solo user exists (fixes FK constraint for solo-mode session creation)
INSERT OR IGNORE INTO users (id, username, password_hash, role, display_name)
VALUES ('solo', 'solo', '', 'admin', 'Solo User');
