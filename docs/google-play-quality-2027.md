# Google Play App Quality Requirements (2027)

Google announced (2026-08-26) new Play Console technical quality requirements
that begin affecting app visibility and publishing capability in 2027. This
doc records the thresholds and dates so they don't need to be re-researched.
Tracked in [issue #89](https://github.com/Patchalv/mapvault/issues/89).

## Enforcement: February 2027 — memory, bitmap, and code optimization

Applies to mobile and tablet form factors. Non-compliance risks reduced Play
Store search visibility and publishing restrictions.

### Dynamic memory usage (Anonymous RSS + swap)

- Measured as the 90th percentile over a 28-day window.
- Tracks private app memory (active + compressed), excludes on-disk
  code/assets.
- Thresholds scale with the device's RAM tier. For apps (not games) on a
  4GB RAM device: 2GB foreground / 1GB background-services. Higher RAM tiers
  (6/8/12/16GB) have progressively higher allowances — see the full table in
  Google's technical guide (linked below).

### Bitmap memory usage

- User-perceived services: flagged above 200MB.
- Background: flagged above 200MB.
- Cached: flagged above 400MB.
- No specified threshold while in the foreground.
- Relevant to MapVault's map tile rendering (Mapbox) and place photo loading
  (Google Places photos) — these are the likely bitmap-heavy paths to check
  against Play Console's actual measured numbers.

### DEX code optimization

- Minimum 25% coverage required across R8 optimization, shrinking, and
  obfuscation combined.
- Exempt if DEX size is under 10MB (apps) / 50MB (games).

## Enforcement: April 2027 — zero-tap credential restoration (device migration)

- Apps with user sign-in must auto-restore sign-in state when a user moves to
  a new Android device, via the **Android Restore Credentials API**
  (Credential Manager, available from Android 9+).
- Exempt: games, apps without sign-in, permanently-private/EMM apps, and apps
  with a regulatory exemption request on file.
- MapVault has user sign-in (Sign in with Apple + Sign in with Google) and is
  **not exempt**. Tracked as follow-up work in a separate issue (scoping only
  — see issue #89's acceptance criteria).

## Still needs a human check

Google Play Console → App content → Quality shows each app's actual measured
numbers against these thresholds. That page requires a human logged into
Play Console with access to the MapVault app listing — no automated/API path
exists for it from this repo. Check it before February 2027, with particular
attention to bitmap/memory usage from map tile rendering and place photos.

## Sources

- [Play Console technical quality requirements](https://support.google.com/googleplay/android-developer/answer/17492799?hl=en)
- [Android Developers Blog: Elevating app quality — reducing memory usage and improving device migration](https://android-developers.googleblog.com/2026/08/app-quality-memory-optimization-secure-onboarding.html)
