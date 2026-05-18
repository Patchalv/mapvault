<!--
Sync Impact Report
==================
Version change: 1.1.0 → 1.1.1
Type of bump: PATCH (clarifications to Platform & Stack Constraints — web scope and dual-platform requirement)

Modified principles:
  - II. RLS-First Security → II. RLS-First Security & Database Discipline
    (added: migrations-only schema changes, RLS review against map membership model,
     Edge Function consistency pattern)
Added sections: Branching & Review rule in Governance
Removed sections: None

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no changes needed
  - .specify/templates/spec-template.md ✅ no changes needed
  - .specify/templates/tasks-template.md ✅ no changes needed

Follow-up TODOs: None
-->

# MapVault Constitution

## Core Principles

### I. TypeScript Strict Mode — No `any` (NON-NEGOTIABLE)

All TypeScript code MUST compile under strict mode with zero `any` types.

- Every value, parameter, and return type must be explicitly or structurally typed.
- Database types come exclusively from the generated `supabase/types/database.ts`;
  hand-writing DB shapes is prohibited.
- `npm run typecheck` MUST pass before any commit. Intermediate type errors during
  multi-file edits are acceptable while editing, but the working tree MUST be clean
  before staging.

**Rationale**: Unchecked types are the leading cause of silent runtime failures in
React Native. Strict typing and generated DB types give compile-time safety across
the client–Supabase boundary with no extra effort.

### II. RLS-First Security & Database Discipline (NON-NEGOTIABLE)

Row-Level Security MUST be enabled on every Supabase table. Client code MUST never
bypass RLS.

- Mutations that enforce business rules (freemium limits, invite quotas, role changes)
  MUST go through Edge Functions, not direct client inserts.
- Edge Functions MUST validate auth internally via `auth.getUser()` and MUST be
  deployed with `--no-verify-jwt` (the relay's JWT verification rejects ES256 tokens;
  internal validation keeps this safe).
- API keys and secrets MUST never be hardcoded; all secrets live in EAS environment
  variables or Supabase Vault.

**Schema changes**: All database schema changes MUST be made via SQL migration files
in `supabase/migrations/`. Direct schema edits in Supabase Studio are prohibited for
anything beyond local experimentation.

**RLS review**: Every RLS policy change MUST be reviewed against the map membership
model (`maps` → `map_members` → `profiles`). Any change that alters which users can
read or write a row MUST be documented in the migration file with a comment explaining
the access behavior change.

**Edge Function consistency**: Every Edge Function MUST follow the same internal
structure: authenticate the caller (`auth.getUser()`), check entitlements if required,
execute business logic, handle errors explicitly, and log meaningful context. Functions
that skip any of these steps without documented justification are non-compliant.

**Rationale**: The client is untrusted. RLS and Edge Function validation are the only
reliable enforcement points for multi-tenancy, freemium gating, and invite flow
integrity. Schema migrations ensure all changes are reviewable, reversible, and
consistently applied across environments.

### III. Custom Hooks for All Data Fetching

Every Supabase query MUST be wrapped in a TanStack Query hook inside the `hooks/`
directory. Direct SDK calls in component or screen files are prohibited.

- Filenames: `use-<resource>.ts`; hooks named after the resource they manage.
- Query keys: `['profile']`, `['maps']`, `['map-places', mapId]`, `['tags', mapId]`.
- `queryFn` MUST destructure `{ data, error }` and throw on error.
- Mutations MUST invalidate related queries in `onSuccess`.
- `enabled` option MUST be used for dependent queries (e.g., `enabled: !!mapId`).

**Rationale**: Centralising queries in hooks makes caching, invalidation, and loading
states consistent and testable. Stale data and duplicate fetches are eliminated by
design.

### IV. i18n by Default (NON-NEGOTIABLE)

Every user-visible string MUST use `t()` from `react-i18next`. Hardcoded strings in
JSX or `Alert` calls are not permitted.

- New strings MUST be added to both `locales/en.json` and `locales/es.json`
  simultaneously before committing.
- Namespace convention: one namespace per screen/component (e.g., `signIn`,
  `explore`, `tagEditor`). Interpolation: `t('key', { varName })` matching
  `{{varName}}` in locale files.
- Excluded from translation: the brand name MapVault, DB-stored role values
  (owner/contributor/member), and dynamic error messages from external APIs.
- `npm run check:i18n` MUST pass before every commit (enforced by husky pre-commit).

**Rationale**: Retroactive localization is expensive and error-prone. Mandatory i18n
from the first string means Spanish (and future languages) are never second-class.

### V. Observability Through Wrappers

Analytics, error tracking, and feature flags MUST be accessed exclusively through
their project-level wrappers — never via direct SDK calls.

- Analytics: `track()`, `identifyUser()`, `resetUser()`, `updateUserProperties()`
  from `lib/analytics.ts` only. The PostHog instance is injected at runtime;
  events fired before init are silently dropped (warned in `__DEV__`).
- Feature flags: `FEATURE_FLAGS.<name>` from `lib/feature-flags.ts` only.
- Error tracking: Sentry initializes only when `APP_VARIANT === 'production'`.
  Never log personally-identifiable data to Sentry.

**Rationale**: Wrappers decouple feature code from vendor SDKs, enable silent
no-ops in dev, and enforce PII hygiene at a single chokepoint rather than across
every callsite.

## Platform & Stack Constraints

MapVault targets iOS and Android via Expo SDK 54 (React Native). Web is explicitly
out of scope — do not use web-only APIs or assume web compatibility is required.

Every change MUST work correctly on both iOS and Android. When platform behavior
diverges, use `Platform.OS` guards explicitly — silent iOS-only assumptions are
non-compliant. The following constraints apply to every feature and are not open
to per-feature negotiation:

- **Styling**: NativeWind `className` prop only. `StyleSheet.create` is prohibited.
- **Routing**: Expo Router file-based routing. New screens MUST be route files in
  `app/`. Navigation uses `router.push()` / `router.replace()` from `expo-router`.
- **State**: TanStack Query for server state; React state for UI state only. No
  additional global state libraries (Redux, Zustand, etc.) without an explicit
  architectural decision recorded in `docs/`.
- **Components**: Functional components only. Class components are prohibited.
- **Imports**: `@/` path alias for all cross-directory imports. Relative imports
  across directories (e.g., `../../lib/x`) are prohibited.
- **Generated files**: `supabase/types/database.ts`, `nativewind-env.d.ts`, and
  `.expo/types/` MUST NOT be manually edited. Regenerate with `/sync-types`.
- **Env vars**: New variables MUST be declared in `eas.json` per profile, read
  statically in `app.config.ts`, and accessed at runtime via
  `Constants.expoConfig?.extra`.

## Quality Gates

The following gates MUST pass before any commit lands on a shared branch:

1. **Type check**: `npm run typecheck` — zero TypeScript errors.
2. **Lint**: `npm run lint` — zero lint errors.
3. **i18n validation**: `npm run check:i18n` — both locale files in sync.
4. **Variant hygiene**: `APP_VARIANT` controls bundle ID and service init; never
   hardcode variant-specific behavior outside `app.config.ts`.
5. **Dependency declarations**: New env vars MUST be declared in `eas.json`, read
   statically in `app.config.ts`, exposed via `extra`, and accessed via
   `Constants.expoConfig?.extra`.

Gates 1–3 are enforced automatically by the husky pre-commit hook.
Gates 4–5 are verified during PR review against this constitution.

## Governance

This constitution supersedes informal conventions in commit messages or PR descriptions.
When a practice here conflicts with a doc in `docs/`, this constitution takes
precedence — update the doc to align.

**Amendment procedure**:

1. Propose the change with rationale and migration plan.
2. Update this file with the appropriate version bump.
3. Propagate changes to affected templates (`.specify/templates/`) and runtime docs
   (`CLAUDE.md`, relevant `docs/` files).
4. Commit with message: `docs: amend constitution to vX.Y.Z — <summary>`.

**Versioning policy**:

- MAJOR: Principle removal, redefinition, or backward-incompatible governance change.
- MINOR: New principle or section added, or materially expanded guidance.
- PATCH: Clarification, wording fix, or non-semantic refinement.

**Branching & review**: Direct pushes to `main` are prohibited without exception.
Every change — including one-line fixes, config tweaks, and documentation updates —
MUST be made on a separate branch (or git worktree) and merged via a pull request.
PRs are the mandatory review checkpoint; bypassing them removes the only gate between
a change and production.

**Compliance review**: Every PR must pass the quality gates above. Complexity
violations (e.g., a direct Supabase call in a component, a bypassed RLS check) MUST
be justified in the PR description with a documented reason and a plan to remediate.

**Version**: 1.1.1 | **Ratified**: 2026-05-18 | **Last Amended**: 2026-05-18
