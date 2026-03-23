const { withNativeWind } = require('nativewind/metro');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");
const config = getSentryExpoConfig(__dirname);

// Stub out mapbox-gl on web — it's a native-only dependency not available in web bundles
const originalResolver = config.resolver?.resolveRequest;
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (platform === 'web' && (moduleName === 'mapbox-gl' || moduleName.startsWith('mapbox-gl/'))) {
      return { type: 'empty' };
    }
    if (originalResolver) {
      return originalResolver(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
