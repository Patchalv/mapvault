import { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

// Static env reads — required by `expo/no-dynamic-env-var` so Expo Metro can
// statically eliminate dead `process.env.FOO` references at bundle time. Do
// not refactor back into a helper that takes the name as a string; the
// dynamic bracket form defeats that optimization.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST;
const REVENUECAT_APPLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
const REVENUECAT_GOOGLE_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY;

// Fail-fast guard for native builds. IS_PREVIEW is intentionally NOT exempt —
// preview native builds (APP_VARIANT=preview) must also fail fast when SDK
// keys are missing.
//
// EAS_BUILD=true is set explicitly in eas.json for the preview and production
// build profiles. During `eas update`, this config is evaluated locally
// before EAS injects env vars, so EAS_BUILD is never set then — we must not
// throw, or `eas update` cannot read the config.
// WARNING: running `eas update` WITHOUT --environment [env] means EAS will
// not inject the real values at bundle time either — the "" will ship. The
// /update skill's pre-flight checklist is the only safeguard for that case.
if (process.env.EAS_BUILD === "true") {
  if (!SENTRY_DSN) {
    throw new Error(
      "Missing required env var EXPO_PUBLIC_SENTRY_DSN. Ensure EAS Build env is configured for this profile.",
    );
  }
  if (!POSTHOG_API_KEY) {
    throw new Error(
      "Missing required env var EXPO_PUBLIC_POSTHOG_API_KEY. Ensure EAS Build env is configured for this profile.",
    );
  }
  if (!POSTHOG_HOST) {
    throw new Error(
      "Missing required env var EXPO_PUBLIC_POSTHOG_HOST. Ensure EAS Build env is configured for this profile.",
    );
  }
  if (!REVENUECAT_APPLE_KEY) {
    throw new Error(
      "Missing required env var EXPO_PUBLIC_REVENUECAT_API_KEY. Ensure EAS Build env is configured for this profile.",
    );
  }
  if (!REVENUECAT_GOOGLE_KEY) {
    throw new Error(
      "Missing required env var EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY. Ensure EAS Build env is configured for this profile.",
    );
  }
}

const getBundleId = () => {
  if (IS_DEV) return "com.patrickalvarez.mapvault.dev";
  if (IS_PREVIEW) return "com.patrickalvarez.mapvault.preview";
  return "com.patrickalvarez.mapvault";
};

const getAppName = () => {
  if (IS_DEV) return "(Dev) MapVault";
  if (IS_PREVIEW) return "(Preview) MapVault";
  return "MapVault";
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: getAppName(),
  slug: "mapvault",
  version: "1.2.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "mapvault",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  owner: "patchalv",
  ios: {
    supportsTablet: false,
    icon: "./assets/images/icon.png",
    bundleIdentifier: getBundleId(),
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "MapVault uses your location to show saved places near you on the map.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "MapVault uses your location to show saved places near you on the map.",
      ITSAppUsesNonExemptEncryption: false,
      ITSAppManagementNonExempt: false,
      LSApplicationQueriesSchemes: [
        "maps",
        "comgooglemaps",
        "citymapper",
        "waze",
      ],
    },
    associatedDomains: ["applinks:mapvault.app", "applinks:www.mapvault.app"],
    entitlements: {
      "com.apple.developer.applesignin": ["Default"],
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#F8F4E8",
    },
    package: getBundleId(),
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: "mapvault.app",
            pathPrefix: "/invite/",
          },
          {
            scheme: "https",
            host: "www.mapvault.app",
            pathPrefix: "/invite/",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    "@rnmapbox/maps",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F8F4E8",
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Allow $(PRODUCT_NAME) to use your location.",
      },
    ],
    "expo-localization",
    [
      "@sentry/react-native/expo",
      {
        url: "https://de.sentry.io/",
        project: "mapvault",
        organization: "patrick-alvarez",
      },
    ],
  ],
  extra: {
    sentryDsn: SENTRY_DSN ?? "",
    posthogApiKey: POSTHOG_API_KEY ?? "",
    posthogHost: POSTHOG_HOST ?? "",
    revenueCatAppleApiKey: REVENUECAT_APPLE_KEY ?? "",
    revenueCatGoogleApiKey: REVENUECAT_GOOGLE_KEY ?? "",
    eas: {
      projectId: "1ec7ed48-2f17-4c59-9e71-0f5aea7ea1f7",
    },
  },
  updates: {
    url: "https://u.expo.dev/1ec7ed48-2f17-4c59-9e71-0f5aea7ea1f7",
  },
  runtimeVersion: {
    policy: "sdkVersion",
  },
  experiments: {
    typedRoutes: true,
  },
});
