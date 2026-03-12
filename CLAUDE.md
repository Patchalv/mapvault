# MapVault

A mobile app for saving and rediscovering place recommendations in cities.
Expo (React Native) + Supabase + Mapbox + Google Places API.

## Commands

- `npm run start:dev` — Start dev server (development variant, `.dev` bundle ID)
- `npx expo start --dev-client` — Start dev server (production bundle ID, for payments testing)
- `npx expo lint` — Run linter
- `npx tsc --noEmit` — TypeScript check (run after code changes)
- `eas build --profile <name> --platform ios` — Build for iOS (see `docs/builds.md` for profiles)
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
- **Payments:** RevenueCat for iOS IAP
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

## Navigation (Expo Router)

- Use `router.push()` / `router.replace()` from `expo-router`
- For links: `<Link href="/explore">` from `expo-router`
- Invite links use Universal Links: `https://mapvault.app/invite/[token]`
- Custom scheme `mapvault://` is kept as fallback (used by web fallback page)
- iOS: `associatedDomains` in `app.config.ts`; Android: `intentFilters` in `app.config.ts`
- Tab layout: `(tabs)/` with three tabs: explore, add, profile
- Auth routing: `(auth)/` group for unauthenticated screens

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
lib/ ← Utilities (supabase client, constants)
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

## IMPORTANT

- Always run `npx tsc --noEmit` after making TypeScript changes
- The tsc hook runs after every .ts/.tsx edit. During multi-file changes,
  intermediate type errors are expected — continue editing before fixing them.
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

## Reference Documents

- `docs/prd.md` — Product requirements (what and why)
- `docs/technical-plan.md` — Technical plan (how to build it)
- `docs/payments.md` — Payments system, RevenueCat, and testing guide
- `docs/builds.md` — EAS build profiles and variants
- `docs/analytics.md` — PostHog analytics events and instrumentation guide
- `docs/sentry.md` — Sentry error tracking, config, and MCP tools guide
- `docs/app-reviews.md` — In-app review prompts, triggers, and feature flag
- `docs/universal-links-website.md` — AASA, assetlinks.json, and invite fallback page specs for mapvault.app
- `docs/freemium-roles.md` — Freemium tiers, three-role system, and permission matrices
- `docs/mailerlite.md` — MailerLite integration: sync paths, groups, backfill script, error handling
- Read these before starting any new milestone

## Skills & Commands

Skills (invoked automatically): add-screen, new-component, add-edge-function, create-migration, revenuecat, tanstack-query-hook, rls-policy
Commands: /build, /add-screen, /add-edge-function, /fix-issue, /changelog, /ios-preflight, /android-preflight, /update, /milestone, /sync-types
