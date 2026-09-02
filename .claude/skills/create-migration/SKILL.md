---
name: create-migration
description: Create a new Supabase SQL migration. Use when modifying the database schema.
disable-model-invocation: true
---

Create a new migration: $ARGUMENTS

## Steps

1. **Read the technical plan** in `docs/technical-plan.md` for the schema design
2. **Read existing migrations** in `supabase/migrations/` to understand current schema and naming patterns
3. **Generate a timestamped migration file:**
   ```
   supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql
   ```
   Use: !`date -u +%Y%m%d%H%M%S` for the timestamp prefix.

4. **Write the migration SQL** following these rules:

```sql
-- Enable RLS on all new tables
CREATE TABLE IF NOT EXISTS table_name (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
  -- columns here
);

ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Always create RLS policies
CREATE POLICY "description" ON table_name
  FOR SELECT USING (auth.uid() = user_id);

-- Always grant Data API access — without this the table is unreachable via
-- supabase-js/PostgREST even with RLS enabled and policies in place.
-- MapVault has no unauthenticated (anon) access; grant to authenticated only
-- unless the table is deliberately meant to be publicly readable.
GRANT SELECT, INSERT, UPDATE, DELETE ON table_name TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON table_name TO service_role;
```

5. **Verify the SQL** is valid by reviewing for:
   - RLS enabled on every new table
   - Appropriate RLS policies for SELECT, INSERT, UPDATE, DELETE
   - Data API `GRANT` present for every new table (see Rules — required since Oct 30 2026)
   - Foreign key constraints where needed
   - Indexes on frequently queried columns
   - `NOT NULL` constraints on required fields

6. **Push the migration:** `supabase db push`

## Rules

- Every table MUST have RLS enabled — no exceptions
- Every table MUST have an explicit Data API `GRANT` (see step 4) — Supabase enforces
  no-default-exposure on new tables in existing projects from **Oct 30 2026**; a table
  created after that date with no grant will silently fail to reach via supabase-js
  even though RLS and policies are correct. Grant `authenticated` (and `service_role`
  for Edge Function access); only add `anon` if the table is intentionally public —
  MapVault currently has no anon-accessible tables. Ref:
  https://github.com/orgs/supabase/discussions/45329
- Every table should have `id`, `created_at`, `updated_at` columns
- Use `uuid` for primary keys, not serial/bigserial
- Foreign keys reference `uuid` columns
- Never store API keys or secrets in the database
- Migrations are append-only — never modify a pushed migration, create a new one
- New-table cadence has been ~1 every 3 months historically (last two:
  `20260221000001_create_tables.sql`, `20260513000001_enable_pg_cron_and_drift_check_lock.sql`).
  If a table ships before this rule existed in a given working copy of this skill,
  add the grant retroactively in a follow-up migration rather than assuming it's covered.
