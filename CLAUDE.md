# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Tab layout: `(tabs)/` with three tabs: explore, add, profile
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
add/ ← Add place flow
profile/ ← Profile & map management
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

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
