# RevenueCat Integration

This skill provides expert knowledge on integrating RevenueCat for in-app purchases and subscriptions in React Native Expo apps.

## When to Use

- Setting up RevenueCat SDK in an Expo project
- Configuring products, offerings, and entitlements
- Implementing paywalls (RevenueCat Paywalls or custom)
- Cross-referencing RevenueCat with App Store Connect / Play Console products
- Troubleshooting purchase flows and subscription issues
- Understanding RevenueCat dashboard and analytics

## RevenueCat Concepts

### Hierarchy

```
RevenueCat Account
└── Project (your app)
    └── Apps (iOS, Android, etc.)
        └── Products (from App Store Connect / Play Console)
            └── Offerings (groups of products)
                └── Packages (individual purchasable items)
                    └── Entitlements (what the user gets)
```

### Key Terms

| Term | Description |
|------|-------------|
| **Product** | An item in App Store Connect or Play Console |
| **Entitlement** | A feature/access level users can unlock |
| **Offering** | A group of packages to present to users |
| **Package** | A specific purchasable item with a product |
| **Customer** | A user identified by app user ID |

## SDK Installation

### For Expo (Managed Workflow)

```bash
npx expo install react-native-purchases
```

### For Expo (Prebuild/Bare)

```bash
npm install react-native-purchases
npx expo prebuild
```

### Plugin Configuration

Add to `app.config.js` or `app.json`:

```javascript
{
  "expo": {
    "plugins": [
      [
        "react-native-purchases",
        {
          "REVENUECAT_API_KEY": "appl_xxxxxxxx", // iOS key
          // Or for Android:
          // "REVENUECAT_API_KEY": "goog_xxxxxxxx"
        }
      ]
    ]
  }
}
```

**Multi-platform setup:**
```javascript
plugins: [
  [
    "react-native-purchases",
    {
      "REVENUECAT_API_KEY_IOS": "appl_xxxxxxxx",
      "REVENUECAT_API_KEY_ANDROID": "goog_xxxxxxxx"
    }
  ]
]
```

## SDK Initialisation

### Basic Setup

```typescript
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { Platform } from 'react-native';

const API_KEY = Platform.select({
  ios: 'appl_xxxxxxxx',
  android: 'goog_xxxxxxxx',
});

export async function initPurchases() {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
  }

  await Purchases.configure({ apiKey: API_KEY });
}
```

### With User Identification

```typescript
export async function initPurchases(userId?: string) {
  await Purchases.configure({ apiKey: API_KEY });

  if (userId) {
    await Purchases.logIn(userId);
  }
}
```

### App Initialisation

```typescript
// In App.tsx or root component
useEffect(() => {
  initPurchases();
}, []);
```

## Entitlements

### Setting Up Entitlements

In RevenueCat Dashboard:
1. Go to Project Settings → Entitlements
2. Create entitlement (e.g., "premium", "pro")
3. This represents what the user gets access to

### Checking Entitlements

```typescript
import Purchases from 'react-native-purchases';

export async function checkPremiumAccess(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.entitlements.active['premium'] !== undefined;
  } catch (error) {
    console.error('Error checking entitlements:', error);
    return false;
  }
}
```

### Using a Hook

```typescript
import { useEffect, useState } from 'react';
import Purchases, { CustomerInfo } from 'react-native-purchases';

export function usePremiumStatus() {
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const customerInfo = await Purchases.getCustomerInfo();
        setIsPremium(customerInfo.entitlements.active['premium'] !== undefined);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();

    // Listen for changes
    const listener = Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
      setIsPremium(info.entitlements.active['premium'] !== undefined);
    });

    return () => listener.remove();
  }, []);

  return { isPremium, loading };
}
```

## Offerings and Products

### Fetching Offerings

```typescript
import Purchases, { PurchasesOffering } from 'react-native-purchases';

export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (error) {
    console.error('Error fetching offerings:', error);
    return null;
  }
}
```

### Displaying Products

```typescript
const offering = await getOfferings();

if (offering) {
  offering.availablePackages.forEach(pkg => {
    console.log('Package:', pkg.identifier);
    console.log('Product:', pkg.product.title);
    console.log('Price:', pkg.product.priceString);
    console.log('Description:', pkg.product.description);
  });
}
```

### Package Types

| Type | Description |
|------|-------------|
| `$rc_monthly` | Monthly subscription |
| `$rc_annual` | Annual subscription |
| `$rc_weekly` | Weekly subscription |
| `$rc_lifetime` | Lifetime (one-time) purchase |
| Custom | Your own identifier |

## Making Purchases

### Purchase Flow

```typescript
import Purchases, { PurchasesPackage } from 'react-native-purchases';

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);

    if (customerInfo.entitlements.active['premium']) {
      return true;
    }
    return false;
  } catch (error: any) {
    if (error.userCancelled) {
      // User cancelled, not an error
      return false;
    }
    throw error;
  }
}
```

### Complete Paywall Component

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Purchases, { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

export function Paywall({ onPurchase }: { onPurchase: () => void }) {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    const fetchOfferings = async () => {
      try {
        const offerings = await Purchases.getOfferings();
        setOffering(offerings.current);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchOfferings();
  }, []);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active['premium']) {
        onPurchase();
      }
    } catch (error: any) {
      if (!error.userCancelled) {
        console.error('Purchase error:', error);
      }
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return <ActivityIndicator />;
  }

  return (
    <View>
      <Text>Upgrade to Premium</Text>
      {offering?.availablePackages.map(pkg => (
        <TouchableOpacity
          key={pkg.identifier}
          onPress={() => handlePurchase(pkg)}
          disabled={purchasing}
        >
          <Text>{pkg.product.title}</Text>
          <Text>{pkg.product.priceString}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

## Restore Purchases

```typescript
export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo.entitlements.active['premium'] !== undefined;
  } catch (error) {
    console.error('Error restoring purchases:', error);
    throw error;
  }
}
```

**Important:** Apple requires a "Restore Purchases" button in your app.

## RevenueCat Paywalls

RevenueCat offers pre-built paywall templates:

### Installation

```bash
npx expo install react-native-purchases-ui
```

### Usage

```typescript
import RevenueCatUI from 'react-native-purchases-ui';

function MyPaywall() {
  return (
    <RevenueCatUI.Paywall
      options={{
        displayCloseButton: true,
      }}
      onDismiss={() => console.log('Dismissed')}
      onPurchaseCompleted={({ customerInfo }) => {
        console.log('Purchased!', customerInfo);
      }}
    />
  );
}
```

### Presenting as Modal

```typescript
import { presentPaywall, presentPaywallIfNeeded } from 'react-native-purchases-ui';

// Present paywall
await presentPaywall();

// Only show if not subscribed
await presentPaywallIfNeeded({ requiredEntitlementIdentifier: 'premium' });
```

## Cross-Platform Product Setup

### App Store Connect → RevenueCat

1. Create product in App Store Connect
2. Note the Product ID (e.g., `com.yourapp.premium.monthly`)
3. In RevenueCat → Products → New
4. Enter the Product ID exactly as in ASC
5. RevenueCat auto-fetches price and details

### Play Console → RevenueCat

1. Create product in Play Console (In-app products or Subscriptions)
2. Note the Product ID
3. In RevenueCat → Products → New
4. Enter the Product ID exactly as in Play Console
5. RevenueCat auto-fetches details

### Product ID Best Practices

Use consistent naming across platforms:
```
com.yourcompany.yourapp.premium.monthly
com.yourcompany.yourapp.premium.annual
com.yourcompany.yourapp.premium.lifetime
```

## Offerings Configuration

### Default Offering

The "Default" offering is what `offerings.current` returns. Always have one.

### Structure Example

```
Offering: default
├── Package: $rc_monthly
│   └── Product: com.app.premium.monthly
├── Package: $rc_annual (Best Value)
│   └── Product: com.app.premium.annual
└── Package: $rc_lifetime
    └── Product: com.app.premium.lifetime

Offering: sale_50_off
├── Package: $rc_monthly
│   └── Product: com.app.premium.monthly.sale
└── Package: $rc_annual
    └── Product: com.app.premium.annual.sale
```

### Fetching Specific Offering

```typescript
const offerings = await Purchases.getOfferings();

// Current (default) offering
const current = offerings.current;

// Specific offering by ID
const saleOffering = offerings.all['sale_50_off'];
```

## Subscription Management

### Getting Subscription Status

```typescript
const customerInfo = await Purchases.getCustomerInfo();

// Active subscriptions
const activeSubscriptions = customerInfo.activeSubscriptions;

// Entitlement expiration
const premiumEntitlement = customerInfo.entitlements.active['premium'];
if (premiumEntitlement) {
  console.log('Expires:', premiumEntitlement.expirationDate);
  console.log('Will renew:', premiumEntitlement.willRenew);
}
```

### Managing Subscriptions

```typescript
// Open subscription management (platform native)
import { Linking, Platform } from 'react-native';

function openSubscriptionManagement() {
  if (Platform.OS === 'ios') {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  } else {
    Linking.openURL('https://play.google.com/store/account/subscriptions');
  }
}
```

## Sandbox Testing

### iOS Sandbox

1. Create Sandbox Tester in App Store Connect
2. Sign out of App Store on device/simulator
3. Make purchase (will prompt for Sandbox login)
4. Use sandbox credentials

### Android Testing

1. Add tester emails in Play Console (License testers)
2. Publish to internal testing track
3. Install via Play Store
4. Purchases will be test transactions

### RevenueCat Sandbox Mode

RevenueCat automatically detects sandbox purchases. In dashboard:
- Toggle "Sandbox" filter to see test purchases
- Sandbox transactions don't count toward revenue

## Webhooks and Events

### Server-Side Verification

Configure webhooks in RevenueCat Dashboard:
1. Settings → Webhooks
2. Add your endpoint URL
3. Select events to receive

### Event Types

| Event | Description |
|-------|-------------|
| `INITIAL_PURCHASE` | First purchase |
| `RENEWAL` | Subscription renewed |
| `CANCELLATION` | Subscription cancelled |
| `EXPIRATION` | Subscription expired |
| `BILLING_ISSUE` | Payment failed |
| `PRODUCT_CHANGE` | Plan changed |

## Troubleshooting

### Common Issues

**Products not loading:**
- Verify product IDs match exactly
- Check App Store Connect / Play Console product status
- Products must be "Ready to Submit" or approved
- Agreements must be signed in stores

**Purchases failing:**
- Check API key is correct for platform
- Verify sandbox/production environment
- Check device is signed in to store account
- Review RevenueCat error logs

**Entitlements not granting:**
- Verify entitlement is linked to product in RC dashboard
- Check offering configuration
- Verify customer info is refreshing

### Debug Logging

```typescript
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

// Enable verbose logging in development
if (__DEV__) {
  Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
}
```

### Checking Configuration

```typescript
// Get app user ID
const appUserId = await Purchases.getAppUserID();
console.log('App User ID:', appUserId);

// Check if configured
const isConfigured = Purchases.isConfigured;
console.log('Is Configured:', isConfigured);
```

## Pre-Flight Checklist

Before launching with RevenueCat:

### RevenueCat Dashboard
- [ ] API keys created (iOS and Android)
- [ ] Products imported from stores
- [ ] Entitlements configured
- [ ] Offerings set up with packages
- [ ] Default offering selected

### App Store Connect
- [ ] Products created and approved
- [ ] Bank/tax information complete
- [ ] Paid apps agreement signed

### Play Console
- [ ] Products created and active
- [ ] Merchant account set up
- [ ] Products linked to RevenueCat

### App Code
- [ ] SDK initialised on app start
- [ ] Entitlement checks implemented
- [ ] Restore purchases button present
- [ ] Error handling for purchases
- [ ] Subscription management link

### Testing
- [ ] Sandbox purchases work (iOS)
- [ ] Test purchases work (Android)
- [ ] Restore works correctly
- [ ] Entitlements grant correctly

## Quick Reference

```typescript
// Initialise
await Purchases.configure({ apiKey: 'your_key' });

// Get offerings
const offerings = await Purchases.getOfferings();
const current = offerings.current;

// Make purchase
const { customerInfo } = await Purchases.purchasePackage(package);

// Check entitlement
const isPremium = customerInfo.entitlements.active['premium'] !== undefined;

// Restore
await Purchases.restorePurchases();

// Get customer info
const info = await Purchases.getCustomerInfo();

// Listen for updates
Purchases.addCustomerInfoUpdateListener((info) => {
  // Handle updates
});

// User identification
await Purchases.logIn('user_id');
await Purchases.logOut();
```
