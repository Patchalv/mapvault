# EAS Build Profiles & Variants

## How Variants Work

The `APP_VARIANT` environment variable drives bundle ID and app name via `app.config.ts`:

| `APP_VARIANT` | Bundle ID | App Name |
|---|---|---|
| `development` | `com.patrickalvarez.mapvault.dev` | (Dev) MapVault |
| `preview` | `com.patrickalvarez.mapvault.preview` | (Preview) MapVault |
| _(not set)_ | `com.patrickalvarez.mapvault` | MapVault |

Different bundle IDs allow multiple variants to be installed side-by-side on the same device.

## Build Infrastructure

All iOS build profiles pin `ios.resourceClass: "medium"` in `eas.json` explicitly. This is
EAS's default and has run on Apple Silicon (M-series) worker VMs since 2023 — pinned here so
it's not left ambiguous. EAS cloud builds are unaffected by the developer's own Mac
architecture; see `docs/setup.md` for local build requirements.

## Build Profiles

All profiles are defined in `eas.json`. All profiles work for both iOS and Android except `development:simulator` (iOS only).

| Profile | APP_VARIANT | Bundle ID | Target | Purpose |
|---|---|---|---|---|
| `development` | `development` | `.dev` | (base profile) | Base for dev builds |
| `development:simulator` | `development` | `.dev` | iOS Simulator | Daily dev work on iOS simulator |
| `development:device` | `development` | `.dev` | Physical device | Daily dev work on physical iOS device |
| `development:payments` | _(none)_ | production | Physical device | Payment/IAP testing with sandbox (iOS & Android) |
| `preview` | `preview` | `.preview` | Internal distribution | Stakeholder testing, QA |
| `production` | _(none)_ | production | App Store / Play Store | Store submission |

### `development` / `development:simulator` / `development:device`

Standard development builds with the `.dev` bundle ID. Use for everyday development. **RevenueCat is disabled** in these builds (the API key is only valid for the production bundle ID). Freemium limits and entitlements still work via server-side enforcement and the database. Use `development:payments` for payment testing.

```bash
# iOS Simulator
eas build --profile development:simulator --platform ios

# iOS Physical device
eas build --profile development:device --platform ios

# Android device (builds from "development" base — always targets device)
eas build --profile development --platform android
```

Start the dev server:
```bash
npm run start:dev
# Press 'i' for iOS simulator, 'a' for Android emulator/device
```

### `development:payments`

Special dev client build that uses the **production bundle ID** (`com.patrickalvarez.mapvault`). Required for payment testing because RevenueCat, App Store Connect, and Google Play only recognize the production bundle ID.

```bash
# iOS
eas build --profile development:payments --platform ios

# Android (builds as APK for easy sideloading)
eas build --profile development:payments --platform android
```

Start the dev server (**without** the development variant):
```bash
npx expo start --dev-client
```

**Important:** This build shares the production bundle ID, so it **cannot be installed alongside the production app** on the same device. Uninstall one before installing the other.

See `docs/payments.md` for the full payment testing guide.

### `preview`

Internal distribution builds for stakeholder testing and QA. Uses the `.preview` bundle ID so it can coexist with dev and production builds.

```bash
# iOS
eas build --profile preview --platform ios

# Android
eas build --profile preview --platform android
```

### `production`

Store submission builds. Version auto-increments on each build.

```bash
# iOS
eas build --profile production --platform ios
eas submit --profile production --platform ios

# Android
eas build --profile production --platform android
eas submit --profile production --platform android
```

## Dev Server Commands

| Command | When to Use |
|---|---|
| `npm run start:dev` | Normal development (sets `APP_VARIANT=development`). Press `i` for iOS, `a` for Android |
| `npx expo start --dev-client` | Payment testing with `development:payments` build (no variant = production bundle ID) |
| `npx expo start` | General dev server without dev client |

## Common Workflows

**Daily development (iOS):**
1. Build once: `eas build --profile development:simulator --platform ios`
2. Start server: `npm run start:dev`
3. Press `i` to open in simulator

**Daily development (Android):**
1. Build once: `eas build --profile development --platform android`
2. Install APK on emulator or physical device
3. Start server: `npm run start:dev`
4. Press `a` to connect to Android

**Testing payments (iOS):**
1. Build once: `eas build --profile development:payments --platform ios`
2. Install on physical device
3. Start server: `npx expo start --dev-client`
4. Follow testing flows in `docs/payments.md`

**Testing payments (Android):**
1. Build once: `eas build --profile development:payments --platform android`
2. Install APK on physical device
3. Start server: `npx expo start --dev-client`
4. Follow testing flows in `docs/payments.md`

**Preparing a release (iOS):**
1. Build: `eas build --profile production --platform ios`
2. Submit: `eas submit --profile production --platform ios`

**Preparing a release (Android):**
1. Build: `eas build --profile production --platform android`
2. Submit: `eas submit --profile production --platform android`
