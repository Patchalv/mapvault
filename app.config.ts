import { ConfigContext, ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "development";
const IS_PREVIEW = process.env.APP_VARIANT === "preview";

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
  version: "1.0.0",
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
    output: "static",
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
        url: "https://sentry.io/",
        project: "mapvault",
        organization: "patrick-alvarez",
      },
    ],
  ],
  extra: {
    revenueCatAppleApiKey: IS_DEV
      ? (process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? "")
      : (process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? ""),
    revenueCatGoogleApiKey: IS_DEV
      ? (process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ?? "")
      : (process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ?? ""),
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
