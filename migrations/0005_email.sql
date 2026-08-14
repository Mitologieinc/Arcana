ALTER TABLE workspaces ADD COLUMN mail_from TEXT NOT NULL DEFAULT '';
UPDATE user SET email_verified = 1 WHERE email_verified = 0;
