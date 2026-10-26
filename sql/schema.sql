-- ClipShift — schéma PostgreSQL
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT,
  source_type VARCHAR(20) NOT NULL DEFAULT 'url', -- url | upload
  platform VARCHAR(50),
  format VARCHAR(10) NOT NULL DEFAULT 'mp4',
  quality VARCHAR(10) NOT NULL DEFAULT '720', -- 360 | 480 | 720 | 1080 | best
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | processing | done | error
  original_filename TEXT,
  output_filename TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
