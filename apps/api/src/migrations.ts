import { getDatabase } from './db'

const SCHEMA_VERSION = 3

export async function migrateDatabase(): Promise<void> {
  const sql = getDatabase()
  await sql.unsafe(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'banned')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL,
      purpose text NOT NULL DEFAULT 'login',
      code_hash text NOT NULL,
      ip_hash text NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS otp_codes_email_created_idx
      ON otp_codes (email, created_at DESC);
    CREATE INDEX IF NOT EXISTS otp_codes_ip_created_idx
      ON otp_codes (ip_hash, created_at DESC);

    CREATE TABLE IF NOT EXISTS device_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      device_name text NOT NULL,
      platform text NOT NULL CHECK (platform IN ('web', 'macos')),
      client_version text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS device_sessions_user_idx
      ON device_sessions (user_id, last_seen_at DESC);

    CREATE TABLE IF NOT EXISTS websocket_tickets (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_session_id uuid NOT NULL REFERENCES device_sessions(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      consumed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS credit_buckets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL CHECK (kind IN ('free', 'pro', 'paid')),
      source text NOT NULL,
      granted_seconds integer NOT NULL CHECK (granted_seconds >= 0),
      remaining_seconds integer NOT NULL CHECK (remaining_seconds >= 0),
      starts_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (user_id, source)
    );
    CREATE INDEX IF NOT EXISTS credit_buckets_spend_idx
      ON credit_buckets (user_id, kind, expires_at, created_at)
      WHERE remaining_seconds > 0;

    CREATE TABLE IF NOT EXISTS quota_ledger (
      id bigserial PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bucket_id uuid REFERENCES credit_buckets(id) ON DELETE SET NULL,
      delta_seconds integer NOT NULL,
      event_type text NOT NULL,
      request_id text,
      conversation_session_id text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS quota_ledger_request_unique
      ON quota_ledger (user_id, request_id, bucket_id)
      WHERE request_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS quota_ledger_user_created_idx
      ON quota_ledger (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS vouchers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE,
      name text NOT NULL,
      benefit_kind text NOT NULL CHECK (benefit_kind IN ('pro', 'paid')),
      grant_seconds integer NOT NULL CHECK (grant_seconds > 0),
      duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
      max_redemptions integer NOT NULL CHECK (max_redemptions > 0),
      per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
      redemption_count integer NOT NULL DEFAULT 0,
      active boolean NOT NULL DEFAULT true,
      valid_from timestamptz NOT NULL DEFAULT now(),
      valid_until timestamptz,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS voucher_redemptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bucket_id uuid NOT NULL REFERENCES credit_buckets(id) ON DELETE CASCADE,
      redeemed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS voucher_redemptions_lookup_idx
      ON voucher_redemptions (voucher_id, user_id);

    CREATE SEQUENCE IF NOT EXISTS sync_version_sequence;

    CREATE TABLE IF NOT EXISTS synced_sessions (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id text NOT NULL,
      status text NOT NULL,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      ciphertext bytea,
      iv bytea,
      auth_tag bytea,
      version bigint NOT NULL DEFAULT nextval('sync_version_sequence'),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      PRIMARY KEY (user_id, session_id)
    );
    CREATE INDEX IF NOT EXISTS synced_sessions_changes_idx
      ON synced_sessions (user_id, version);

    CREATE TABLE IF NOT EXISTS synced_preferences (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ciphertext bytea NOT NULL,
      iv bytea NOT NULL,
      auth_tag bytea NOT NULL,
      version bigint NOT NULL DEFAULT nextval('sync_version_sequence'),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS telemetry_events (
      id bigserial PRIMARY KEY,
      user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      device_session_id uuid REFERENCES device_sessions(id) ON DELETE SET NULL,
      request_id text,
      event_type text NOT NULL,
      provider text,
      model text,
      status text NOT NULL,
      duration_ms integer,
      billed_audio_seconds integer,
      input_tokens integer,
      output_tokens integer,
      error_code text,
      platform text,
      client_version text,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS telemetry_created_idx
      ON telemetry_events (created_at DESC);
    CREATE INDEX IF NOT EXISTS telemetry_user_created_idx
      ON telemetry_events (user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS active_ai_sessions (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      device_session_id uuid NOT NULL REFERENCES device_sessions(id) ON DELETE CASCADE,
      conversation_session_id text NOT NULL,
      expires_at timestamptz NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS final_ai_allowances (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      conversation_session_id text NOT NULL,
      reply_remaining integer NOT NULL DEFAULT 1 CHECK (reply_remaining BETWEEN 0 AND 1),
      review_remaining integer NOT NULL DEFAULT 1 CHECK (review_remaining BETWEEN 0 AND 1),
      expires_at timestamptz NOT NULL,
      PRIMARY KEY (user_id, conversation_session_id)
    );

    INSERT INTO schema_migrations (version)
    VALUES (2)
    ON CONFLICT (version) DO NOTHING;

    DO $migration$
    BEGIN
      PERFORM pg_advisory_xact_lock(hashtext('kibotalk-schema-migration'));
      IF NOT EXISTS (
        SELECT 1 FROM schema_migrations WHERE version = ${SCHEMA_VERSION}
      ) THEN
        DELETE FROM synced_preferences;
        INSERT INTO schema_migrations (version) VALUES (${SCHEMA_VERSION});
      END IF;
    END
    $migration$;
  `)
}
