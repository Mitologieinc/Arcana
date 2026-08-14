UPDATE user SET email_verified = 1 WHERE email_verified = 0;
ALTER TABLE workspaces DROP COLUMN mail_from;
