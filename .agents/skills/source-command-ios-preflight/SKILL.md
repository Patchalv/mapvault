---
name: "source-command-ios-preflight"
description: "Pre-submission checklist for iOS App Store Connect - catches common rejection reasons"
---

# source-command-ios-preflight

Use this skill when the user asks to run the migrated source command `ios-preflight`.

## Command Template

# iOS App Store Connect Pre-flight Check

Validate App Store Connect configuration before submission to catch common rejection reasons.

## Setup Questionnaire

Before running checks, gather information:

```typescript
AskUserQuestion({
  questions: [
    {
      question: "What is your app's monetization model?",
      header: "Monetization",
      options: [
        { label: "Freemium (IAP/Subscriptions)", description: "Free download with in-app purchases or subscriptions" },
        { label: "Paid Upfront", description: "One-time purchase price to download the app" },
        { label: "Free (No IAP)", description: "Completely free with no monetization" },
      ],
      multiSelect: false,
    },
    {
      question: "Is this your first submission to App Store Connect?",
      header: "First Release",
      options: [
        { label: "Yes, first time", description: "App has never been published" },
        { label: "No, updating existing app", description: "App already exists on App Store" },
      ],
      multiSelect: false,
    },
  ],
});
```

### Conditional Checks

| Monetization  | Skip These Checks |
| ------------- | ------------------------------------------------ |
| Free (No IAP) | IAP validation, RevenueCat cross-check |
| Paid Upfront  | IAP validation, RevenueCat cross-check |
| Freemium      | Run all checks |

## Code Verification

Search codebase for compliance with IAP requirements:

```typescript
// Check for restore purchases implementation
Grep({ pattern: "restorePurchases|restoreTransactions", type: "ts" });

// Check for privacy policy link in-app
Grep({ pattern: "privacy|privacyPolicy|privacy-policy", type: "ts" });

// Check for license key / QR code payment bypass (FORBIDDEN)
Grep({ pattern: "licenseKey|license_key|activationCode|qrCode.*payment", type: "ts" });
```

**Required in Code:**

- [ ] Restore purchases button/function implemented
- [ ] Privacy policy accessible from within app (not just App Store)
- [ ] No alternative payment mechanisms bypassing IAP

**If Free Trial in Paywall:**

- [ ] Trial duration matches App Store Connect configuration
- [ ] Trial terms clearly communicated before starting

## URL Validation

Test that all configured URLs are reachable:

```typescript
WebFetch({ url: privacyPolicyUrl, prompt: "Does this page load successfully? Return YES or NO." });
WebFetch({ url: supportUrl, prompt: "Does this page load successfully? Return YES or NO." });
```

## Checklist

Present this checklist to the user and ask them to verify each section in App Store Connect:

### 1. Version Page (Guideline 2.3 - Accurate Metadata)

**Build:**
- [ ] Build uploaded and selected
- [ ] Build processing complete (no "Processing" status)

**Screenshots:**
- [ ] iPhone 6.9" (Pro Max) screenshots present
- [ ] iPhone 6.7" screenshots present
- [ ] iPhone 6.5" screenshots present
- [ ] iPhone 5.5" screenshots present
- [ ] iPad Pro 12.9" screenshots present (if universal app)
- [ ] Screenshots show actual app functionality (not splash/login screens)
- [ ] If IAP exists: Screenshots/description indicate purchase requirements

**Metadata:**
- [ ] App name ≤30 characters
- [ ] Description filled (not placeholder text)
- [ ] No trademarked terms, competitor names, or pricing info in description
- [ ] Keywords configured and relevant
- [ ] Support URL present
- [ ] Version number set
- [ ] Copyright information present
- [ ] "What's New" text describes changes for this version

### 2. In-App Purchases (Guideline 3.1.1) — If Freemium

**Subscription Group Status:**
- [ ] Subscriptions exist in "Ready to Submit" status
- [ ] NOT "Missing Metadata" or "Developer Action Needed" status

**Version Attachment (CRITICAL - common rejection cause):**
- [ ] Subscriptions are SELECTED and attached to this version (not empty section)
- [ ] All intended products are checked

**Individual Product Validation:**
- [ ] Review screenshot uploaded for each new product
- [ ] Display name and description appropriate
- [ ] Pricing configured for all intended territories

**Subscription Requirements (Guideline 3.1.2):**
- [ ] Subscription period ≥7 days
- [ ] Clear description of what subscriber receives
- [ ] Free trial properly configured in ASC (if offered)
- [ ] Upgrade/downgrade paths configured

### 3. App Review Information (Guideline 2.3)

- [ ] Contact name, phone, and email provided
- [ ] If app requires login: Demo credentials provided and working
- [ ] Demo account has access to premium features being reviewed
- [ ] Notes describe any non-obvious or new features

### 4. App Information

- [ ] Privacy Policy URL configured in App Store Connect
- [ ] Privacy Policy also accessible within the app itself (both required)
- [ ] Primary category selected and appropriate
- [ ] Age rating questionnaire completed honestly

### 5. App Privacy (Guideline 5.1.1)

- [ ] Privacy responses submitted (not "Get Started")
- [ ] Data collection types declared accurately
- [ ] Third-party data sharing disclosed if applicable

### 6. Pricing

- [ ] Base price set (or Free)
- [ ] Availability configured for target countries

## RevenueCat Cross-Check (If Freemium)

If the project uses RevenueCat, verify product ID consistency:

1. Check product IDs in code match RevenueCat dashboard
2. Check RevenueCat product IDs match App Store Connect
3. Verify current offering is set
4. Verify entitlements are mapped to products

## Output Format

```
APP STORE CONNECT PRE-FLIGHT CHECK
============================================
App: {app_name}
Version: {version}
Date: {date}

BLOCKING ISSUES (will cause rejection)
------------------------------------------
- [Area]: [Specific issue]

WARNINGS (may cause rejection or delays)
------------------------------------------
- [Area]: [Issue description]

PASSED CHECKS
------------------------------------------
- [List of verified items]

MANUAL VERIFICATION NEEDED
------------------------------------------
- [Items user must verify in App Store Connect]

============================================
RECOMMENDATION: [Ready to submit / Fix X issues first]
============================================
```

## Common Rejection Reasons

| Guideline | Issue | Fix |
|-----------|-------|-----|
| 2.1 | IAP products not attached to version | Select IAPs on version page |
| 2.3 | Screenshots don't show app in use | Replace with actual app screenshots |
| 2.3 | Demo credentials missing/broken | Add working credentials |
| 3.1.1 | No restore purchases mechanism | Add restore button |
| 3.1.2 | Subscription period <7 days | Adjust subscription period |
| 5.1.1 | Privacy labels don't match app | Update privacy declarations |
