---
name: "source-command-android-preflight"
description: "Pre-submission checklist for Google Play Console - catches common rejection reasons"
---

# source-command-android-preflight

Use this skill when the user asks to run the migrated source command `android-preflight`.

## Command Template

# Google Play Console Pre-flight Check

Validate Google Play Console configuration before submission to catch common issues and policy violations.

## Setup Questionnaire

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
      question: "Is this your first submission to Google Play?",
      header: "First Release",
      options: [
        { label: "Yes, first time", description: "App has never been published to Play Store" },
        { label: "No, updating existing app", description: "App already exists on Play Store" },
      ],
      multiSelect: false,
    },
    {
      question: "What testing track will you use?",
      header: "Testing Track",
      options: [
        { label: "Internal testing", description: "Up to 100 testers, instant availability" },
        { label: "Closed testing", description: "Limited testers, requires review" },
        { label: "Open testing", description: "Anyone can join, requires review" },
        { label: "Production", description: "Public release to all users" },
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

| First Release | Additional Checks |
| ------------- | ------------------------------------------------ |
| Yes | Manual AAB upload guidance, 14-day testing requirement (personal accounts) |
| No  | Version code increment, existing listing updates |

## Code Verification

Search codebase for compliance:

```typescript
// Check for restore purchases implementation
Grep({ pattern: "restorePurchases|restoreTransactions", type: "ts" });

// Check for privacy policy link in-app
Grep({ pattern: "privacy|privacyPolicy|privacy-policy", type: "ts" });

// Check for billing client
Grep({ pattern: "BillingClient|useIAP|react-native-iap|revenuecat", type: "ts" });
```

**Required in Code:**
- [ ] Privacy policy accessible from within app
- [ ] If IAP: Billing library properly integrated
- [ ] If subscriptions: Subscription terms displayed before purchase

## URL Validation

```typescript
WebFetch({ url: privacyPolicyUrl, prompt: "Does this page load successfully? Return YES or NO." });
```

## Checklist

Present this checklist and ask the user to verify each section in Play Console:

### 1. Store Listing (Grow > Store presence > Main store listing)

- [ ] App name present (≤30 characters)
- [ ] Short description present (≤80 characters)
- [ ] Full description present (≤4000 characters)
- [ ] No placeholder text, competitor names, or pricing info
- [ ] App icon uploaded (512x512 PNG)
- [ ] Feature graphic uploaded (1024x500)
- [ ] At least 2 phone screenshots uploaded
- [ ] Screenshots show actual app functionality

### 2. Store Settings (Grow > Store presence > Store settings)

- [ ] Developer email provided
- [ ] Privacy policy URL configured and accessible (HTTPS)

### 3. Content Rating (Policy and programs > App content > Content rating)

- [ ] Content rating questionnaire completed
- [ ] Rating not "Unrated" (will cause rejection)

### 4. Target Audience (Policy and programs > App content > Target audience)

- [ ] Target age group selected
- [ ] If targeting children: Additional requirements met

### 5. Data Safety (Policy and programs > App content > Data safety)

- [ ] Data safety section completed
- [ ] Data collection types declared accurately
- [ ] Security practices described

### 6. Ads Declaration (Policy and programs > App content > Ads)

- [ ] Ads declaration completed accurately

### 7. App Access (Policy and programs > App content > App access)

- [ ] If app requires login: Demo credentials provided and working

### 8. In-App Products (If Freemium) (Monetize > Products)

- [ ] Products exist in "Active" status
- [ ] Product IDs match what's configured in app/RevenueCat
- [ ] Prices configured for target countries

### 9. Release Setup (Release > Testing/Production)

- [ ] All setup tasks show green checkmarks
- [ ] No blocking issues in "Publishing overview"
- [ ] Countries/regions selected for distribution
- [ ] Release notes provided

## First Release Special Guidance

If this is the first submission:

```
FIRST RELEASE REQUIREMENTS
------------------------------------------
1. AAB Upload: First build must be manually uploaded
   - Build: eas build --platform android --profile production
   - Download AAB from EAS dashboard
   - Upload to Play Console > Release > Production > Create release

2. After first upload, EAS --auto-submit will work for future releases

3. Personal Account Testing Requirement:
   - Personal developer accounts must run closed testing
     with 12+ testers for 14+ continuous days
   - Organisation accounts are exempt

4. Review Timeline:
   - First submission: 7+ days typical
   - Updates to existing apps: 1-3 days typical
```

## RevenueCat Cross-Check (If Freemium)

1. Check product IDs in code match RevenueCat dashboard
2. Check RevenueCat product IDs match Play Console
3. Verify current offering is set
4. Verify entitlements are mapped to products

## Output Format

```
GOOGLE PLAY CONSOLE PRE-FLIGHT CHECK
============================================
App: {app_name}
Package: {package_name}
Track: {testing_track}
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
- [Items user must verify in Play Console]

============================================
RECOMMENDATION: [Ready to submit / Fix X issues first]
============================================
```

## Common Rejection Reasons

| Policy Area | Common Issue | Fix |
|-------------|-------------|-----|
| Deceptive behavior | App doesn't match description | Ensure description matches features |
| User data | Privacy policy missing/inaccessible | Add accessible privacy policy |
| Malicious behavior | Unnecessary permissions | Remove unused permissions |
| Content | Age rating mismatch | Re-submit content rating questionnaire |
| Version code | Same version already exists | Increment versionCode |
| Target API | API level too low | Update targetSdkVersion |
