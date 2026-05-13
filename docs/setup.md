# Developer Setup

Personal reference for getting MapVault running on a fresh machine.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 22+ | `brew install node` |
| npm | 10+ | Comes with Node |
| Expo CLI | 54+ | `npm install -g expo-cli` (or use `npx expo`) |
| EAS CLI | 16+ | `npm install -g eas-cli` |
| Supabase CLI | 2+ | `brew install supabase/tap/supabase` |
| Xcode | Latest | Mac App Store (needed for simulator builds) |

## Clone & Install

```bash
git clone git@github.com:patchalv/MapVault.git
cd MapVault
npm install
```

## Environment Variables

Copy the example and fill in your keys:

```bash
cp .env.example .env
```

| Variable | Where to find it |
|----------|-----------------|
| `EXPO_PUBLIC_SUPABASE_URL` | [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API → Project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same page → `anon` `public` key |
| `EXPO_PUBLIC_MAPBOX_TOKEN` | [Mapbox Account](https://account.mapbox.com/) → Access tokens |
| `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_IOS` | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials (restricted to iOS bundle ID) |
| `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_ANDROID` | Same — separate key restricted to Android package name + SHA-1 |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | [PostHog](https://eu.posthog.com/) → Project Settings → Project API Key |
| `EXPO_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` (EU instance, hardcoded) |
| `EXPO_PUBLIC_SENTRY_DSN` | [Sentry](https://patrick-alvarez.sentry.io/) → MapVault project → Client Keys (DSN). Ingest-only, safe to share. |
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | [RevenueCat Dashboard](https://app.revenuecat.com/) → Project → API Keys → Apple public key |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | Same dashboard → Google Play public key |

> All `EXPO_PUBLIC_*` values are surfaced via `app.config.ts` → `extra` and read at runtime through `Constants.expoConfig?.extra`. The `requireKey()` helper in `app.config.ts` throws if any required var is missing during native EAS builds. For OTA updates, `--environment [env]` is the only safeguard — there is no code-level catch. See [docs/troubleshooting.md](./troubleshooting.md#why-telemetry-can-silently-disappear-in-ota-updates).

## Supabase

### Push Migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### Deploy Edge Functions

All 5 functions must be deployed with `--no-verify-jwt`:

```bash
supabase functions deploy create-map --no-verify-jwt
supabase functions deploy add-place --no-verify-jwt
supabase functions deploy accept-invite --no-verify-jwt
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt
```

### Set Server-Side Secrets

These are NOT in `.env` — they live in Supabase Edge Function secrets:

```bash
supabase secrets set REVENUECAT_WEBHOOK_SECRET=<from RevenueCat dashboard>
supabase secrets set REVENUECAT_SECRET_API_KEY=<from RevenueCat dashboard, secret API key>
```

## Build & Run

### First Time: Build the Dev Client

```bash
# For simulator
eas build --profile development:simulator --platform ios

# For physical device
eas build --profile development:device --platform ios
```

This only needs to be repeated when native dependencies change (new SDK, new native module).

### Start the Dev Server

```bash
npm run start:dev
```

Press `i` to open in the iOS simulator.

See `docs/builds.md` for all build profiles and when to use each one.

## Verify It Works

1. App opens to the sign-in screen
2. Sign in with Apple (or Google)
3. Default "My Map" is created automatically
4. Switch to the Add tab, search for a place
5. Save it — should appear on the Explore tab map

## Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run start:dev` | Start dev server (development variant) |
| `npx expo start --dev-client` | Start dev server (production bundle ID, for payment testing) |
| `npx expo lint` | Run linter |
| `npm run typecheck` | TypeScript check |
| `supabase db push` | Push migrations to hosted Supabase |
| `supabase functions serve` | Run Edge Functions locally |
| `supabase functions deploy <name> --no-verify-jwt` | Deploy a single Edge Function |
