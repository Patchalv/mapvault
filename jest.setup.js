/* global jest */

// Sentry's native module is unavailable under Jest, and none of these tests
// assert on error reporting — stub the surface the app calls.
jest.mock('@sentry/react-native', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  wrap: (component) => component,
}));

// expo-router pulls in the whole navigation stack; tests only ever assert on
// which route was pushed.
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissAll: jest.fn(),
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  Link: 'Link',
}));

// Supabase env vars are read at module load in lib/supabase.ts. createClient
// throws on an empty URL, so give it something well-formed; every test that
// touches the client mocks the module outright.
process.env.EXPO_PUBLIC_SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'test-publishable-key';
process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_IOS =
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_IOS || 'test-ios-places-key';
process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_ANDROID =
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_ANDROID || 'test-android-places-key';
