-- ============================================================
-- Migration 002: Communication Tables
-- Vet AI Operating System
-- ============================================================

CREATE TYPE channel_type AS ENUM ('public', 'private', 'announcement', 'direct');

CREATE TABLE channels (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  hospital_id   UUID REFERENCES hospitals(id),
  name          TEXT NOT NULL,
  description   TEXT,
  channel_type  channel_type DEFAULT 'public',
  created_by    UUID REFERENCES profiles(id),
  is_archived   BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_channels_org ON channels(org_id);
CREATE INDEX idx_channels_hospital ON channels(hospital_id);

CREATE TABLE channel_members (
  channel_id    UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  last_read_at  TIMESTAMPTZ DEFAULT NOW(),
  is_admin      BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id),
  content         TEXT NOT NULL,
  content_type    TEXT DEFAULT 'text',
  parent_id       UUID REFERENCES messages(id),
  attachment_url  TEXT,
  attachment_name TEXT,
  is_edited       BOOLEAN DEFAULT FALSE,
  is_deleted      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_channel ON messages(channel_id, created_at DESC);
CREATE INDEX idx_messages_parent ON messages(parent_id);
CREATE INDEX idx_messages_user ON messages(user_id);

CREATE TABLE message_reactions (
  message_id  UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Trigger
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
