# MapVault

MapVault is a mobile app for saving and rediscovering place recommendations
in cities — drop a pin on a spot a friend told you about, tag it to a city
map, and find it again next time you're there instead of digging through
old messages and screenshots.

## Tech stack

- **App:** Expo (React Native) with Expo Router for file-based navigation
- **Styling:** NativeWind (Tailwind CSS for React Native)
- **Data & state:** TanStack Query for server state
- **Backend:** Supabase (Postgres + Row Level Security + Edge Functions + Auth)
- **Maps:** Mapbox (`@rnmapbox/maps`)
- **Place search:** Google Places API (New) for autocomplete
- **Payments:** RevenueCat for iOS IAP + Google Play Billing

## Getting started

Follow [docs/setup.md](./docs/setup.md) for the full local setup walkthrough
— prerequisites, environment variables, Supabase configuration, and how to
build and run the dev client.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run start:dev` | Start the Expo dev server against the development app variant (`.dev` bundle ID) |
| `npm run lint` | Run the linter (`expo lint`) |
| `npm run typecheck` | Type-check the project with `tsc --noEmit` |
| `npm test` | Run the Jest unit test suite |

## Documentation

More reference material lives in [docs/](./docs), including architecture
notes, payments, analytics, database schema, deployment, and
troubleshooting guides.
