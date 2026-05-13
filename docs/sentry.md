# Sentry Error Tracking & Performance

## Overview

MapVault uses [Sentry](https://sentry.io) for crash reporting, performance monitoring, and session replay. The SDK is `@sentry/react-native` v8.x. The Sentry instance is hosted in the **EU** (Frankfurt, `de.sentry.io`) for GDPR compliance.

Sentry is **disabled in development** and only runs in production builds.

## Sentry Account Details

| Field | Value |
|---|---|
| **Organization** | `patrick-alvarez` |
| **Project** | `mapvault` |
| **Region** | EU (`de.sentry.io`) |
| **Region URL** | `https://de.sentry.io` |

These values are needed when using the Sentry MCP tools (see below).

## Architecture

```
Sentry.init() (app/_layout.tsx, runs before any component renders)
  └─ Sentry.wrap() wraps root RootLayout component
  └─ getSentryExpoConfig() wraps Metro config for source maps

Sentry.setUser() (hooks/use-auth.ts, on auth state change)
  └─ Sets user ID + email on login
  └─ Clears user context on logout
```

### Key Files

| File | Role |
|---|---|
| `app/_layout.tsx` | `Sentry.init()` configuration; `Sentry.wrap()` around root layout |
| `hooks/use-auth.ts` | `Sentry.setUser()` / `Sentry.setUser(null)` on auth changes |
| `metro.config.js` | `getSentryExpoConfig()` for source map upload |
| `app.config.ts` | `@sentry/react-native/expo` plugin (org, project, URL) |
| `.env` | `SENTRY_AUTH_TOKEN` for source map uploads during builds |

## Configuration

The `Sentry.init()` call in `app/_layout.tsx`:

```typescript
const sentryDsn = Constants.expoConfig?.extra?.sentryDsn as string | undefined;

Sentry.init({
  dsn: sentryDsn,
  enabled: !__DEV__ && !!sentryDsn, // Production only, and only when DSN is present
  tracesSampleRate: 1,              // 100% of transactions (launch phase)
  replaysSessionSampleRate: 1,      // 100% of sessions (launch phase)
  replaysOnErrorSampleRate: 1,      // 100% of error sessions
  integrations: [Sentry.mobileReplayIntegration()],
  spotlight: __DEV__,               // Local Sentry dev UI
});
```

The DSN is **read from `Constants.expoConfig?.extra?.sentryDsn`**, not directly from `process.env`. The mapping from `EXPO_PUBLIC_SENTRY_DSN` → `extra.sentryDsn` happens in `app.config.ts` via a `requireKey()` helper that throws if the env var is missing during native EAS builds (`EAS_BUILD=true`). For OTA updates there is no code-level catch — `--environment production` is the only safeguard. See [Why telemetry can silently disappear in OTAs](./troubleshooting.md#why-telemetry-can-silently-disappear-in-ota-updates).

| Setting | Value | Rationale |
|---|---|---|
| `enabled` | `!__DEV__ && !!sentryDsn` | Dev errors create noise; the DSN check makes the no-telemetry path explicit instead of relying on the SDK's silent-on-falsy-DSN behavior |
| `tracesSampleRate` | `1` | 100% sampling during launch phase for maximum visibility; dial back to `0.2` as user volume grows |
| `replaysSessionSampleRate` | `1` | 100% sampling during launch phase; dial back to `0.1` as user volume grows |
| `replaysOnErrorSampleRate` | `1` | Always capture replay when an error occurs |
| `spotlight` | `__DEV__` | Free local debugging UI in development |
| `sendDefaultPii` | _(not set, defaults to false)_ | GDPR-safe — no automatic IP/device PII collection |

## User Identification

User context is set in `hooks/use-auth.ts` alongside PostHog identification:

- **Login:** `Sentry.setUser({ id: session.user.id, email: session.user.email })`
- **Logout:** `Sentry.setUser(null)`

This means every Sentry error event includes the user ID and email, making it easy to identify who experienced a crash.

## Environment Variables

| Variable | Purpose | Where Set |
|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | Client DSN; surfaced via `extra.sentryDsn` in `app.config.ts` and read at runtime from `Constants.expoConfig?.extra` | `.env` (local), EAS env (`production` / `preview` environments) |
| `SENTRY_AUTH_TOKEN` | Auth token for source map uploads during EAS builds | `.env` (local), EAS Secrets (CI) |

The DSN is ingest-only and safe to commit, but it must still be passed via the right delivery path:
- **Native builds (`eas build`):** EAS Build loads the env automatically.
- **OTA updates (`eas update`):** You **must** pass `--environment production` (or `preview`) or the bundle ships with an empty DSN and Sentry is disabled silently. There is no code-level catch for this — `--environment [env]` is the only safeguard; do not skip it.

## Development: Spotlight

[Sentry Spotlight](https://spotlightjs.com) is enabled in dev mode (`spotlight: __DEV__`). It provides a local UI for inspecting Sentry events without sending them to the cloud. To use it:

1. Install Spotlight globally: `npx @spotlightjs/spotlight`
2. Run the app with `npm run start:dev`
3. Errors and traces appear in the Spotlight overlay

Since `enabled: !__DEV__` disables the SDK in development, Spotlight is the only way to inspect Sentry-formatted events locally.

## Rules for Future Development

### 1. Never enable Sentry in development

Keep `enabled: !__DEV__`. Dev errors, hot-reload noise, and test data should never reach the Sentry dashboard.

### 2. Keep `sendDefaultPii` off

The Sentry instance is on `de.sentry.io` (EU). Automatic PII collection (IP addresses, cookies) has GDPR implications. User identification is handled explicitly via `Sentry.setUser()`.

### 3. Add Sentry context to new error-prone code

When writing code that might fail in interesting ways (API calls, deep links, payment flows), add breadcrumbs or context:

```typescript
import * as Sentry from '@sentry/react-native';

// Add breadcrumbs for debugging context
Sentry.addBreadcrumb({
  category: 'navigation',
  message: 'User opened invite deep link',
  data: { token: inviteToken },
  level: 'info',
});

// Capture non-fatal errors with context
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    tags: { feature: 'invite-flow' },
    extra: { mapId, userId },
  });
}
```

### 4. Use `Sentry.captureException()` for handled errors

Not all errors crash the app. For caught errors worth tracking (failed API calls, unexpected states), use `captureException`:

```typescript
const { data, error } = await supabase.from('maps').select('*');
if (error) {
  Sentry.captureException(error, { tags: { query: 'maps-select' } });
  throw error;
}
```

### 5. Plan sampling rate changes around user growth

During launch, rates are at 100% (`tracesSampleRate: 1`, `replaysSessionSampleRate: 1`) to maximize visibility with minimal quota impact. Once user volume grows significantly (500+ daily active users), dial these back to `0.2` / `0.1` to balance visibility against quota usage.

### 6. Source maps are handled automatically

The `@sentry/react-native/expo` plugin in `app.config.ts` and `getSentryExpoConfig()` in `metro.config.js` handle source map uploads during EAS builds. No manual steps needed — just ensure `SENTRY_AUTH_TOKEN` is set in EAS Secrets.

### 7. User context follows auth state

`Sentry.setUser()` is called in `hooks/use-auth.ts`. If you add new auth flows or change the auth handler, ensure Sentry user context stays in sync.

## Using Sentry MCP to Investigate Issues

Claude Code has access to Sentry via MCP tools. These tools can search issues, inspect details, analyze root causes, and even resolve issues — all from the terminal.

**Important:** Always use these parameters for MapVault queries:
- `organizationSlug: 'patrick-alvarez'`
- `projectSlugOrId: 'mapvault'` (where supported)
- `regionUrl: 'https://de.sentry.io'`

### Available Tools & When to Use Them

#### Triage: "What's broken?"

| Tool | Use When |
|---|---|
| `mcp__sentry__search_issues` | List issues: "unresolved errors this week", "critical bugs", "errors affecting 100+ users" |
| `mcp__sentry__search_events` | Get counts/stats: "how many errors today", "error rate this week" |

```
Example: "Show me unresolved issues from the last 24 hours"
→ search_issues(organizationSlug='patrick-alvarez', projectSlugOrId='mapvault',
     regionUrl='https://de.sentry.io',
     naturalLanguageQuery='unresolved issues from the last 24 hours')
```

#### Investigate: "What happened?"

| Tool | Use When |
|---|---|
| `mcp__sentry__get_issue_details` | Get full stacktrace and metadata for a specific issue ID |
| `mcp__sentry__search_issue_events` | Filter events within an issue: by time, user, release, environment |
| `mcp__sentry__get_trace_details` | Inspect a performance trace (slow screen, API call chain) |

```
Example: "Show me details for MAPVAULT-42"
→ get_issue_details(organizationSlug='patrick-alvarez', issueId='MAPVAULT-42',
     regionUrl='https://de.sentry.io')
```

#### Diagnose: "Why did this happen?"

| Tool | Use When |
|---|---|
| `mcp__sentry__analyze_issue_with_seer` | AI-powered root cause analysis with suggested code fixes |

```
Example: "Analyze the root cause of MAPVAULT-42"
→ analyze_issue_with_seer(organizationSlug='patrick-alvarez', issueId='MAPVAULT-42',
     regionUrl='https://de.sentry.io')
```

This is the most powerful tool — it returns specific file paths, line numbers, and code fix suggestions.

#### Act: "Mark it fixed"

| Tool | Use When |
|---|---|
| `mcp__sentry__update_issue` | Resolve, ignore, or reassign an issue after fixing it |

```
Example: "Resolve MAPVAULT-42"
→ update_issue(organizationSlug='patrick-alvarez', issueId='MAPVAULT-42',
     regionUrl='https://de.sentry.io', status='resolved')
```

#### Context: "What's our setup?"

| Tool | Use When |
|---|---|
| `mcp__sentry__find_organizations` | Find org slug (already known: `patrick-alvarez`) |
| `mcp__sentry__find_projects` | Find project slug (already known: `mapvault`) |
| `mcp__sentry__find_releases` | Check recent releases and deployment history |
| `mcp__sentry__whoami` | Verify authenticated Sentry user |

### Typical Investigation Workflow

1. **Search for issues:** `search_issues` with a natural language query
2. **Pick the worst one:** Look at user count, event count, or recency
3. **Get details:** `get_issue_details` for the full stacktrace
4. **Analyze with AI:** `analyze_issue_with_seer` for root cause and fix suggestions
5. **Fix the code:** Apply the suggested fix in the codebase
6. **Resolve the issue:** `update_issue` with `status='resolved'`

### Example: Full Bug Fix Flow

```
User: "Check Sentry for any critical issues"

1. search_issues(organizationSlug='patrick-alvarez', projectSlugOrId='mapvault',
     regionUrl='https://de.sentry.io',
     naturalLanguageQuery='unresolved critical errors from last 7 days')

2. get_issue_details(organizationSlug='patrick-alvarez', issueId='MAPVAULT-15',
     regionUrl='https://de.sentry.io')
   → See stacktrace: TypeError in place-card.tsx line 42

3. analyze_issue_with_seer(organizationSlug='patrick-alvarez', issueId='MAPVAULT-15',
     regionUrl='https://de.sentry.io')
   → Root cause: optional chaining missing on `place.photos[0]`

4. Fix the code, run tsc, commit

5. update_issue(organizationSlug='patrick-alvarez', issueId='MAPVAULT-15',
     regionUrl='https://de.sentry.io', status='resolved')
```
