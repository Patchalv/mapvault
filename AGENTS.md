# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

# MapVault

A mobile app for saving and rediscovering place recommendations in cities.
Expo (React Native) + Supabase + Mapbox + Google Places API.

## Commands

- `npm run start:dev` — Start dev server (development variant, `.dev` bundle ID)
- `npx expo start --dev-client` — Start dev server (production bundle ID, for payments testing)
- `npm run lint` — Run linter
- `npm run typecheck` — TypeScript check (run after code changes)
- `eas build --profile <name> --platform <ios|android>` — Build (see `docs/builds.md` for the full profile matrix; common combos exposed as `npm run build:*` scripts)
- `supabase db push` — Push migration to Supabase
- `supabase functions deploy <name> --no-verify-jwt` — Deploy Edge Function to Supabase
- `supabase functions serve` — Run Edge Functions locally

## Architecture

- **Framework:** Expo SDK 54 with Expo Router (file-based routing)
- **Styling:** NativeWind (Tailwind CSS for React Native)
- **State:** TanStack Query for server state, React state for UI
- **Backend:** Supabase (Postgres + RLS + Edge Functions + Auth)
- **Maps:** Mapbox (`@rnmapbox/maps`) for map display
- **Place Search:** Google Places API (New) for autocomplete
- **Payments:** RevenueCat for iOS IAP + Google Play Billing
- **Bottom Sheets:** `@gorhom/bottom-sheet`

## Code Style

- TypeScript strict mode. No `any` types.
- Functional components only. No class components.
- Use ES module imports (import/export), not require.
- Destructure imports: `import { useState } from 'react'`
- Use `@/` path alias for all imports: `import { supabase } from '@/lib/supabase'`
- Never use relative imports across directories (e.g., `../../lib/supabase`)
- File naming: kebab-case for files, PascalCase for components
- Colocate component files: `components/place-card/place-card.tsx`
- Custom hooks for all data fetching: `hooks/use-map-places.ts`
- Supabase queries go through custom hooks wrapping TanStack Query

## Styling (NativeWind)

- Use `className` prop for all styling. Never use `StyleSheet.create`.
- Import View, Text, Pressable from `react-native` (NativeWind patches them).
- Conditional classes: template literals with ternary
- Custom colors/spacing go in `tailwind.config.js` under `theme.extend`
- Bottom sheets (`@gorhom/bottom-sheet`) use their own styling API, not className

## Data Fetching (TanStack Query)

- Query keys: `['profile']`, `['maps']`, `['map-places', mapId]`, `['tags', mapId]`
- All hooks in `hooks/` directory, named `use-<resource>.ts`
- Always destructure `{ data, error }` from Supabase, throw on error in queryFn
- Use `enabled` option for dependent queries (e.g., `enabled: !!mapId`)
- Mutations: invalidate related queries in `onSuccess`
- Edge Function calls: `supabase.functions.invoke('fn-name', { body: {...} })`
- Global defaults: `staleTime: 5 minutes`, `retry: 1` — set in the root `QueryClient` in `app/_layout.tsx`

## Navigation (Expo Router)

- Use `router.push()` / `router.replace()` from `expo-router`
- For links: `<Link href="/explore">` from `expo-router`
- Invite links use Universal Links: `https://mapvault.app/invite/[token]`
- Custom scheme `mapvault://` is kept as fallback (used by web fallback page)
- iOS: `associatedDomains` in `app.config.ts`; Android: `intentFilters` in `app.config.ts`
- Tab layout: `(tabs)/` with three tabs: explore, add, settings
- Auth routing: `(auth)/` group for unauthenticated screens

## Analytics

- Use `track()`, `identifyUser()`, `resetUser()`, `updateUserProperties()` from `lib/analytics.ts` — never call PostHog directly
- The PostHog instance is injected at runtime via `PostHogConnector` in `app/_layout.tsx`; events fired before init are silently dropped (warned in `__DEV__`)
- See `docs/analytics.md` for the full event catalog and instrumentation guide

## Feature Flags

- Feature flags are defined in `lib/feature-flags.ts` as the `FEATURE_FLAGS` object
- Check `FEATURE_FLAGS.featureName` to gate behavior; add or toggle flags in that file

## Environment Variables

- `APP_VARIANT` in `eas.json` controls the build variant (`development` / `preview` / `production`) — determines bundle ID, app name, and whether services like Sentry initialize
- Adding a new env var: declare it in `eas.json` per profile → read it **statically** (not dynamically) in `app.config.ts` (required for Metro dead-code elimination; see `expo/no-dynamic-env-var` rule) → expose it via `extra` → access at runtime as `Constants.expoConfig?.extra?.varName`
- `__DEV__` is true only in dev clients; `EAS_BUILD` is set only during native builds (not `eas update`)

## File Structure

app/ ← Expo Router file-based routes
(auth)/ ← Unauthenticated layout
(tabs)/ ← Authenticated tab layout
explore/ ← Map/list view
add/ ← Add place flow (index + save sub-screen)
settings/ ← Settings tab (profile, maps, membership, paywall, delete-account)
invite/[token].tsx ← Universal Link / deep link handler
components/ ← Shared UI components
hooks/ ← Custom hooks (data fetching, auth, etc.)
lib/ ← Utilities (supabase client, analytics, feature-flags, constants)
types/ ← TypeScript type definitions
supabase/
migrations/ ← SQL migrations
functions/ ← Edge Functions

## Database

- All tables have RLS enabled. Never bypass RLS from client.
- Use `supabase-js` SDK for all queries (auto-handles auth tokens).
- Mutations that enforce business rules (freemium limits, invites)
  go through Edge Functions, not direct client inserts.
- The `places` table is shared reference data (Google place info).
  `map_places` is the per-map instance with user context.

### Table Quick Reference

- `profiles` — extends auth.users, has entitlement (free/premium) and active_map_id
- `maps` — user-created collections, accessed via map_members
- `map_members` — junction: profiles <-> maps, with role (owner/contributor/member)
- `tags` — per-map definitions with emoji/color
- `places` — shared Google reference data (deduplicated by google_place_id)
- `map_places` — a place saved to a specific map (core entity)
- `map_place_tags` — junction: map_places <-> tags
- `place_visits` — per-user visited status (personal, not shared)
- `map_invites` — invite tokens for sharing maps
- `drift_check_runs` — internal mutex for the `rc-entitlement-drift-check` cron job (RLS default-deny; not user-facing data — see `docs/database.md` → "Infrastructure Tables")

## IMPORTANT

- Always run `npm run typecheck` after making TypeScript changes
- The tsc hook runs after every .ts/.tsx edit. During multi-file changes,
  intermediate type errors are expected — continue editing before fixing them.
- Pre-commit hook (husky) runs `npm run lint`, `npm run typecheck`, and `npm run check:i18n` before every commit
- Never hardcode API keys. Use environment variables via `.env`
- Mapbox tokens go in `app.json` under `plugins`
- Google Places API key must be restricted in Google Cloud Console
- Always deploy Edge Functions with `--no-verify-jwt` — the relay's JWT
  verification rejects ES256 tokens. Functions validate auth internally via
  `auth.getUser()` so this is safe.
- When creating Supabase queries, always handle the error case
- Bottom sheets use `@gorhom/bottom-sheet` — follow existing patterns
- For new screens, create the route file in `app/` directory first
- Never edit generated files: `supabase/types/database.ts`, `nativewind-env.d.ts`, `.expo/types/`
- The Expo app version is canonical in `app.config.ts:version`. Keep `package.json:version` in sync when bumping — `npm install` rewrites the lockfile's version metadata from `package.json`, so a drift between the two will silently regress the lockfile on the next install.
- Scheduled background work uses `pg_cron` + `pg_net`; bearers for cron → Edge Function calls live in `supabase_vault`, not function env vars. See `docs/payments.md` → "Drift Health Check" for the canonical pattern (mutex table + `SECURITY DEFINER` RPCs + vault-backed bearer).

## Reference Documents

- `docs/prd.md` — Product requirements (what and why)
- `docs/setup.md` — Initial project setup and local environment
- `docs/builds.md` — EAS build profiles and variants
- `docs/release-process.md` — Version bumping and App Store submission
- `docs/deployment.md` — OTA and native deployment guide
- `docs/payments.md` — Payments system, RevenueCat, and testing guide
- `docs/analytics.md` — PostHog analytics events and instrumentation guide
- `docs/sentry.md` — Sentry error tracking, config, and MCP tools guide
- `docs/database.md` — Full database schema reference
- `docs/edge-functions.md` — Edge Functions patterns and catalog
- `docs/app-reviews.md` — In-app review prompts, triggers, and feature flag
- `docs/universal-links-website.md` — AASA, assetlinks.json, and invite fallback page specs for mapvault.app
- `docs/freemium-roles.md` — Freemium tiers, three-role system, and permission matrices
- `docs/mailerlite.md` — MailerLite integration: sync paths, groups, backfill script, error handling
- `docs/membership-page.md` — Membership screen PRD (free/premium layouts, usage progress bar)
- `docs/BRANDING-ASSETS.md` — Brand colors, icon dimensions, and Expo config keys for app assets
- `docs/troubleshooting.md` — Common issues and fixes
- Read these before starting any new milestone

## i18n (Localization)

- All user-visible strings must use `t()` from `react-i18next` — never hardcode strings in JSX or Alert calls
- Locale files: `locales/en.json` (source of truth) and `locales/es.json` (must mirror en.json structure exactly)
- i18n config: `lib/i18n.ts` — auto-detects device language via `expo-localization`, falls back to English
- TypeScript types: `types/i18next.d.ts` — wires `en.json` for type-safe `t()` calls
- Validation: `npm run check:i18n` — runs before every commit (husky pre-commit hook)
- When adding a new string: add to both `en.json` and `es.json` simultaneously, then use `t('namespace.key')` in code
- Namespace convention: one namespace per screen/component (e.g. `signIn`, `explore`, `tagEditor`)
- Interpolation syntax: `t('key', { varName: value })` matches `{{varName}}` in locale files
- Never translate: brand names (MapVault), role values stored in DB (owner/contributor/member), dynamic error messages from API responses

## Skills & Commands

Skills (invoked automatically): add-screen, new-component, add-edge-function, create-migration, revenuecat, tanstack-query-hook, rls-policy
Commands: /build, /add-screen, /add-edge-function, /fix-issue, /changelog, /ios-preflight, /android-preflight, /update, /milestone, /sync-types

---

## This repository is worked by an autonomous factory

Some pull requests here are opened by **`beavify`**, a machine account
driven by [dark-factory](https://github.com/Patchalv/dark-factory) — a lights-out system that turns a
written ticket into a pull request ready for review. It runs on a cron and needs
no prompting.

**It never merges anything.** Every change it makes arrives as a pull request a
human has to approve, and it cannot push to `main`, force-push, or
delete a branch. Those are not policies it follows; they are actions its code
cannot express.

### Giving it work

Open an issue and label it `state:ready`. The issue body needs two things or it
is rejected before anything is spent:

1. **A goal in prose** — what to build, not only what to accept.
2. **An `## Acceptance criteria` heading** with at least one criterion under it.

A rejected ticket gets a comment saying exactly what was missing. Fix it and
re-apply `state:ready` to start a fresh run.

Labels are how the factory reports where a run is. Do not hand-edit them to make
something happen — only `state:ready` starts work.

| Label | Meaning |
|---|---|
| `state:ready` | Waiting to be picked up. **You set this one.** A ticket blocked by an open issue stays here until its blockers close |
| `state:in-progress` | A run is working on it |
| `state:needs-human-input` | Escalated — it asked a question and is waiting. Answer **in a comment on the issue**; that is where it reads from |
| `state:pr-ready` | Pull request open, waiting on human review |
| `state:rejected-at-intake` | Refused before spending, with reasons in a comment |
| `state:done` | Closed |
| `run:stop` | **Kill switch.** Add it to an issue to stop that run |

Only comments from repository collaborators with push access are read. A comment
from anyone else — including bots — is seen, marked read, and never acted on.

### Running a plan in order

A `state:ready` ticket starts when its turn comes, and its turn is decided by
GitHub's own issue dependencies. Link one issue as blocked by another — the
Relationships panel on the issue — and the factory leaves it alone until every
blocker has closed.

That is how you hand it a plan as several tickets, mark them all Ready, and get
them one at a time. Every pull request it opens says `Closes #N`, so merging one
closes its ticket and the next becomes eligible within a minute or two.

Three things to know:

- **Link the blockers before you mark anything Ready.** In the window where a
  ticket is Ready and its blocker is not yet linked, there is nothing to read
  and the factory will start it.
- **Any close satisfies a blocker, including "not planned".** If you abandon a
  ticket mid-chain its dependents become eligible immediately, against plans
  that assumed its work exists. Edit or close them too.
- **Chains get less accurate the further down they go**, because the later
  tickets were written against a repository the earlier ones have since changed.
  Three to five is comfortable; fifteen is not.

### The one rule that is easy to break by accident

**Never commit to a `factory/...` branch.** A human commit on a run's branch
permanently ends the factory's involvement with that run. It is one-way and
there is no hand-back: the run stops working, stays open only to notice the
eventual merge, and no amount of reverting brings it back.

This is deliberate — if you have started editing the work yourself, the factory
racing you is worse than it stopping. But it means "just fixing a typo" on its
branch retires the run. If you want a change, request it in a pull request
review and let the run make it, or take the branch over knowing the factory is
done with it.

### `factory.yml`

At the repository root, read **from `main` only** — never from a
working branch, so an agent blocked by a permission cannot edit the file on its
own branch and grant itself the permission.

```yaml
checks:      # the GitHub Actions JOB names that must pass. Load-bearing
conventions: # free text handed to the planning and implementation stages
network:     # extra egress hosts the sandbox may reach
grants:      # opt-in permissions
budgets:     # may only ever LOWER the factory's own caps
```

Three things about it that are not obvious:

- **`checks:` names Actions job names — the keys under `jobs:` in
  `.github/workflows/`, not workflow names, not check names.** Renaming a job
  without updating `factory.yml` in the same commit makes every run fail
  verification while CI looks green. This repo's are:
  `lint-typecheck` and `test`, both in `.github/workflows/lint-typecheck.yml`.
- **`network:` and `grants:` are requests, not grants.** They resolve as an
  intersection with the factory's own configuration, which lives in a repository
  no agent pushes to. Adding a host here alone does nothing except produce a
  warning. If a build needs a host it cannot reach, it has to be added on both
  sides — say so, do not work around it.
- **`budgets:` can only narrow.** A number above the factory's cap is ignored.

### Working alongside it

- The plan a run intends to follow is posted as a **comment on the issue** before
  implementation starts. That is the cheapest place to redirect it.
- The pull request description carries the **assumptions ledger** — every
  judgement call the run made rather than escalating. Read it; it is usually
  where a disagreement will be.
- A run reviews its own work in an isolated session that sees only the ticket,
  the plan, and the diff. It cannot see the implementer's reasoning, which is
  the point, but it also means a pull request whose justification lives outside
  the diff will read as unjustified.
- CI is the only automated gate. Verify reads **GitHub Actions job conclusions**;
  a third-party check reporting to the Checks API is invisible to it, however
  green it looks here.

### MapVault-specific things it has been told

- **`deno-test` is not a required check, on purpose.** It is filtered to
  `supabase/functions/**`, so on a pull request touching nothing there the job
  never runs, and a required check that never runs fails verification at its
  deadline. Edge Function work is therefore gated by the human reviewing it,
  not by the factory.
- **The i18n hook is the most common way its commits fail.** `check:i18n` runs
  in the husky pre-commit hook and compares `locales/en.json` with
  `locales/es.json` key for key. A new string in one file only will not commit.
- **It holds `deps-update` and `migrations-as-files`.** So it may add an npm
  dependency and may *author* a migration file. It never applies a migration to
  any database, local or remote.
- **It cannot build, submit or ship anything.** No EAS, App Store Connect or
  Play credentials exist anywhere in the factory, and its sandbox can only reach
  GitHub and package registries. Merging one of its pull requests puts code on
  `main` and nothing else — every release is still `eas build` / `eas submit` /
  `eas update` run by a human.
- **Read the release type before the next OTA update.** `runtimeVersion.policy`
  is `fingerprint`, so EAS will refuse to serve a JS bundle across a native
  change rather than crashing users. That is a safety net, not a reason to skip
  reading the diff: it is easier to misjudge "is this JS-only?" on a change
  someone else wrote.
