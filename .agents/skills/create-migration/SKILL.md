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
```

5. **Verify the SQL** is valid by reviewing for:
   - RLS enabled on every new table
   - Appropriate RLS policies for SELECT, INSERT, UPDATE, DELETE
   - Foreign key constraints where needed
   - Indexes on frequently queried columns
   - `NOT NULL` constraints on required fields

6. **Push the migration:** `supabase db push`

## Rules

- Every table MUST have RLS enabled — no exceptions
- Every table should have `id`, `created_at`, `updated_at` columns
- Use `uuid` for primary keys, not serial/bigserial
- Foreign keys reference `uuid` columns
- Never store API keys or secrets in the database
- Migrations are append-only — never modify a pushed migration, create a new one
