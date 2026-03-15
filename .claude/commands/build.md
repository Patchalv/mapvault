---
name: build
description: Interactive build preparation - validates config, credentials, and environment before providing the EAS build command
argument-hint: "[dev|preview|production] [--ios|--android|--all]"
model: sonnet
---

# EAS Build Preparation

Prepare for an EAS build by validating all configuration, credentials, and environment settings. This command does NOT run the build - it ensures everything is ready and provides the exact command to run.

## Workflow Overview

1. **Gather build parameters** - Platform, profile, submission preference
2. **Validate configuration** - eas.json, app.config.js
3. **Check credentials** - iOS certificates, Android keystore, push notifications
4. **Verify environment** - Environment variables, secrets
5. **Run pre-flight checks** - expo doctor, native dependencies
6. **Output ready-to-run command** - With all validated parameters

## Interactive Setup

Use AskUserQuestion to gather build parameters:

```typescript
AskUserQuestion({
  questions: [
    {
      question: "Which platform are you building for?",
      header: "Platform",
      options: [
        {
          label: "iOS",
          description: "Build for iPhone/iPad",
        },
        {
          label: "Android",
          description: "Build for Android devices",
        },
        {
          label: "Both",
          description: "Build for iOS and Android",
        },
      ],
      multiSelect: false,
    },
    {
      question: "Which build profile?",
      header: "Profile",
      options: [
        {
          label: "development",
          description: "Dev client build for local development",
        },
        {
          label: "preview",
          description: "Internal testing build (TestFlight/Internal track)",
        },
        {
          label: "production",
          description: "Production build for app store release",
        },
      ],
      multiSelect: false,
    },
    {
      question: "Auto-submit after build completes?",
      header: "Submit",
      options: [
        {
          label: "Yes, auto-submit (Recommended for iOS)",
          description: "Automatically submit to TestFlight/Play Store",
        },
        {
          label: "No, just build",
          description: "Build only, submit manually later",
        },
      ],
      multiSelect: false,
    },
  ],
});
```

## Pre-Flight Validation

### 1. Configuration Files Check

**Check eas.json exists and is valid:**

```bash
# Verify eas.json exists
cat eas.json
```

**Validate required fields:**

- [ ] `eas.json` exists at project root
- [ ] Selected build profile exists in `build` section
- [ ] If auto-submit: `submit` section exists for selected profile
- [ ] CLI version requirement met

**Check app.config.js/app.json:**

```bash
# View app configuration
npx expo config
```

**Validate configuration:**

- [ ] `app.config.js` or `app.json` exists
- [ ] `name` and `slug` are set
- [ ] iOS: `bundleIdentifier` is set
- [ ] Android: `package` is set
- [ ] `extra.eas.projectId` is set (for EAS builds)

### 2. Environment Variables Check

**Check build profile environment variables:**

```typescript
// Read eas.json and extract env vars for selected profile
Read({ file_path: "eas.json" });
```

**Validate:**

- [ ] `APP_VARIANT` set (if using dynamic config)
- [ ] No sensitive values hardcoded (API keys should use EAS Secrets)
- [ ] Environment-specific URLs correct for profile

**Check EAS Secrets (if applicable):**

```bash
# List configured secrets
eas secret:list
```

- [ ] Required secrets are configured
- [ ] No placeholder values

### 3. Credentials Check

**iOS Credentials (if building for iOS):**

```bash
# Check iOS credential status
eas credentials --platform ios --non-interactive 2>&1 || echo "Run interactively for setup"
```

**Validate iOS:**

- [ ] Distribution certificate exists and valid
- [ ] Provisioning profile exists and valid
- [ ] Push notification key configured (if app uses push)
- [ ] Certificate not expiring soon (warn if <30 days)

**Android Credentials (if building for Android):**

```bash
# Check Android credential status
eas credentials --platform android --non-interactive 2>&1 || echo "Run interactively for setup"
```

**Validate Android:**

- [ ] Keystore exists
- [ ] FCM key configured (if app uses push notifications)

### 4. Project Health Check

**Run expo doctor:**

```bash
npx expo-doctor
```

**Check for:**

- [ ] No critical issues
- [ ] SDK version compatible
- [ ] Dependencies up to date
- [ ] No conflicting native modules

**Check native dependencies (if applicable):**

```bash
# For iOS, check Podfile.lock exists
ls ios/Podfile.lock 2>/dev/null && echo "Pods configured" || echo "No iOS native project"

# For Android, check build.gradle exists
ls android/build.gradle 2>/dev/null && echo "Android configured" || echo "No Android native project"
```

### 5. Version Check

**Read current version from app config:**

```typescript
Read({ file_path: "app.config.ts" }); // or app.config.js
```

**For production builds only, actively check for version collision (skip for `development` and `preview`):**

```bash
# Get last finished builds for the selected platform and profile
eas build:list --platform {platform} --profile {profile} --status finished --limit 5 2>&1 | head -60
```

Parse the `Version` field from the output. Compare against the `version` field in the app config export (top-level, not nested under `expo`).

If the command fails or the `Version` field cannot be parsed, warn the user and continue without blocking — do not silently skip.

**Decision logic:**

- If local version == last build version → 🚫 BLOCKING: version collision, prompt to bump
- If local version != last build version → ✅ version is new
- If no previous production builds → ✅ first production build, any version is fine

**If collision detected, ask:**

- Bump patch (e.g. 1.0.0 → 1.0.1) — for bug fixes
- Bump minor (e.g. 1.0.0 → 1.1.0) — for new features
- I'll handle it manually — stop and let user edit

If user selects patch or minor, edit the app config file (`app.config.ts` or `app.config.js`, whichever exists) to update the `version` field, then re-run the `eas build:list` comparison to confirm the new version is clear before continuing.

**Checklist:**

- [ ] `version` is set in app config
- [ ] For production: version not already used in a finished build (blocking if fails)
- [ ] If using `autoIncrement`: enabled in production profile (handles build number only, not version string)

### 6. Submission Readiness (if auto-submit)

**iOS Submission Check:**

- [ ] `appleId` configured in submit profile (or will prompt)
- [ ] `ascAppId` configured (App Store Connect app ID)
- [ ] App exists in App Store Connect

**iOS ASC Key File Check (iOS only — skip if platform is Android):**

Read `eas.json` to extract `ascApiKeyPath` from the iOS submit profile, then verify the file exists:

```bash
ls {ascApiKeyPath} 2>&1
```

- If missing → 🚫 BLOCKING:
  ```text
  🚫 ASC API KEY FILE MISSING
  Expected: {ascApiKeyPath}
  Download AuthKey_{ascApiKeyId}.p8 from App Store Connect →
  Users and Access → Integrations → App Store Connect API,
  then place it at {ascApiKeyPath}.
  ```
- If present → `✅ ASC API Key file: found`

- [ ] `ascApiKeyPath` file exists on disk at the configured path (blocking if fails)

**Android Submission Check:**

- [ ] `serviceAccountKeyPath` configured
- [ ] Service account JSON file exists
- [ ] `track` specified (internal, alpha, beta, production)
- [ ] **First release?** Remind about manual upload requirement

```
📱 ANDROID FIRST RELEASE REMINDER
------------------------------------------
If this is your first Android release:
1. First AAB must be manually uploaded to Play Console
2. After first upload, --auto-submit will work
3. Download AAB from EAS dashboard after build completes
```

## Output Report

Generate comprehensive pre-flight report:

```
============================================
EAS BUILD PRE-FLIGHT CHECK
============================================
Platform: {platform}
Profile: {profile}
Auto-submit: {yes/no}
Date: {date}

📋 CONFIGURATION
------------------------------------------
✅ eas.json valid
✅ Build profile "{profile}" found
✅ app.config.js valid
✅ Bundle ID: {bundleIdentifier}
✅ Package: {package}
✅ Version: {version} — not previously built

🔐 CREDENTIALS
------------------------------------------
iOS:
  ✅ Distribution Certificate: Valid (expires {date})
  ✅ Provisioning Profile: Valid
  ✅ Push Notification Key: Configured

Android:
  ✅ Keystore: Configured
  ✅ FCM Key: Configured

🌍 ENVIRONMENT
------------------------------------------
✅ APP_VARIANT: {value}
✅ EAS Secrets: 3 configured
⚠️  Check EXPO_PUBLIC_* variables for correct values

🏥 PROJECT HEALTH
------------------------------------------
✅ expo doctor: No critical issues
✅ SDK Version: {version}
✅ Dependencies: Up to date

{if auto-submit}
📤 SUBMISSION
------------------------------------------
iOS:
  ✅ Apple ID configured
  ✅ ASC App ID: {ascAppId}
  ✅ ASC API Key file: found

Android:
  ✅ Service account configured
  ✅ Track: {track}
  {if first release}
  ⚠️  First release: Manual AAB upload required
  {/if}
{/if}

============================================
✅ ALL CHECKS PASSED - READY TO BUILD
============================================

Run this command to start the build:

{command}

============================================
```

## Final Command Generation

Based on validated parameters, generate the exact command:

**Standard build:**

```bash
eas build --platform {ios|android|all} --profile {profile}
```

**With auto-submit:**

```bash
eas build --platform {ios|android|all} --profile {profile} --auto-submit
```

**With message:**

```bash
eas build --platform {ios|android|all} --profile {profile} --message "Build description"
```

**With clear cache (if issues detected):**

```bash
eas build --platform {ios|android|all} --profile {profile} --clear-cache
```

## Handling Issues

### Missing Credentials

If credentials are missing:

```
🚫 CREDENTIAL ISSUE DETECTED
------------------------------------------
iOS Distribution Certificate: Missing

To fix, run:
  eas credentials --platform ios

Then re-run this build preparation command.
```

### Configuration Errors

If configuration is invalid:

```
🚫 CONFIGURATION ERROR
------------------------------------------
Issue: Build profile "staging" not found in eas.json

Available profiles:
  - development
  - preview
  - production

Either use an existing profile or add "staging" to eas.json.
```

### Environment Issues

If expo doctor reports issues:

```
⚠️  PROJECT HEALTH ISSUES
------------------------------------------
expo doctor reported:

  ✗ react-native version mismatch
    Expected: 0.74.0
    Found: 0.73.0

Recommended: Run `npx expo install --fix` to resolve

Build may still succeed, but issues could occur.
Proceed anyway? (command will include --clear-cache)
```

## Quick Reference

### Common Build Commands

```bash
# Development build for iOS simulator
eas build --platform ios --profile development

# Development build for physical iOS device
eas build --platform ios --profile development

# Preview build for internal testing
eas build --platform all --profile preview

# Production build with auto-submit
eas build --platform all --profile production --auto-submit

# Production iOS only, submit to TestFlight
eas build --platform ios --profile production --auto-submit

# Build with clear cache
eas build --platform ios --profile development --clear-cache
```

### Profile Quick Guide

| Profile     | Use Case                  | Distribution |
| ----------- | ------------------------- | ------------ |
| development | Local dev with dev client | internal     |
| preview     | Testing before production | internal     |
| production  | App store release         | store        |

### Auto-Submit Behaviour

| Platform | What Happens                              |
| -------- | ----------------------------------------- |
| iOS      | Uploads to App Store Connect → TestFlight |
| Android  | Uploads to Play Console → Specified track |

**Note:** iOS auto-submit works immediately. Android requires first manual upload.
