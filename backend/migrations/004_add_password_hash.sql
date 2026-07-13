-- Migration 004: Add password_hash column for email/password authentication

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
