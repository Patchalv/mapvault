import type { CustomerInfo } from 'react-native-purchases';

// react-native-purchases talks to a native module, so the SDK surface is
// stubbed. The error codes come from the real (pure JS) enum package so the
// network-error test cannot drift from the values RevenueCat actually sends.
const mockPurchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  logIn: jest.fn().mockResolvedValue(undefined),
  logOut: jest.fn().mockResolvedValue(undefined),
  getOfferings: jest.fn().mockResolvedValue({ current: null, all: {} }),
  purchasePackage: jest.fn(),
  restorePurchases: jest.fn(),
  getCustomerInfo: jest.fn(),
};

jest.mock('react-native-purchases', () => {
  const { PURCHASES_ERROR_CODE } = jest.requireActual(
    '@revenuecat/purchases-typescript-internal',
  );
  return {
    __esModule: true,
    default: mockPurchases,
    LOG_LEVEL: { DEBUG: 'DEBUG' },
    PURCHASES_ERROR_CODE,
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { revenueCatAppleApiKey: 'appl_test_key' } } },
}));

type RevenueCatModule = typeof import('@/lib/revenuecat');

// The module keeps `isConfigured` in module scope, so each test needs a fresh
// copy to control whether the SDK is configured.
async function loadModule(): Promise<RevenueCatModule> {
  let mod: RevenueCatModule;
  jest.isolateModules(() => {
    mod = require('@/lib/revenuecat');
  });
  return mod!;
}

function customerInfo(activeEntitlements: string[]): CustomerInfo {
  return {
    entitlements: {
      active: Object.fromEntries(
        activeEntitlements.map((id) => [id, { identifier: id, isActive: true }]),
      ),
    },
  } as unknown as CustomerInfo;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isPremium', () => {
  it('is true when the premium entitlement is active', async () => {
    const { isPremium } = await loadModule();

    expect(isPremium(customerInfo(['premium']))).toBe(true);
  });

  it('is false with no active entitlements', async () => {
    const { isPremium } = await loadModule();

    expect(isPremium(customerInfo([]))).toBe(false);
  });

  it('is false when some other entitlement is active', async () => {
    const { isPremium } = await loadModule();

    expect(isPremium(customerInfo(['legacy_pro']))).toBe(false);
  });
});

describe('isRevenueCatNetworkError', () => {
  it('recognises NETWORK_ERROR', async () => {
    const { isRevenueCatNetworkError } = await loadModule();

    expect(isRevenueCatNetworkError({ code: '10' })).toBe(true);
  });

  it('recognises OFFLINE_CONNECTION_ERROR', async () => {
    const { isRevenueCatNetworkError } = await loadModule();

    expect(isRevenueCatNetworkError({ code: '35' })).toBe(true);
  });

  it('does not classify a store problem as a network error', async () => {
    const { isRevenueCatNetworkError } = await loadModule();

    // STORE_PROBLEM_ERROR — a real failure that must still reach Sentry.
    expect(isRevenueCatNetworkError({ code: '2' })).toBe(false);
  });

  it('handles a thrown value with no code at all', async () => {
    const { isRevenueCatNetworkError } = await loadModule();

    expect(isRevenueCatNetworkError(new Error('boom'))).toBe(false);
    expect(isRevenueCatNetworkError(undefined)).toBe(false);
  });
});

describe('configureRevenueCat', () => {
  it('configures the SDK anonymously and reports ready', async () => {
    const mod = await loadModule();

    expect(mod.isRevenueCatReady()).toBe(false);
    mod.configureRevenueCat();

    expect(mockPurchases.configure).toHaveBeenCalledWith({
      apiKey: 'appl_test_key',
      appUserID: null,
    });
    expect(mod.isRevenueCatReady()).toBe(true);
  });

  it('is idempotent — a second call does not reconfigure', async () => {
    const mod = await loadModule();

    mod.configureRevenueCat();
    mod.configureRevenueCat();

    expect(mockPurchases.configure).toHaveBeenCalledTimes(1);
  });
});

describe('purchase entry points when the SDK is not configured', () => {
  it('throws rather than calling into an unconfigured SDK on purchase', async () => {
    const { purchasePackage } = await loadModule();

    await expect(purchasePackage({} as never)).rejects.toThrow(
      'RevenueCat is not configured',
    );
    expect(mockPurchases.purchasePackage).not.toHaveBeenCalled();
  });

  it('throws on restore', async () => {
    const { restorePurchases } = await loadModule();

    await expect(restorePurchases()).rejects.toThrow('RevenueCat is not configured');
    expect(mockPurchases.restorePurchases).not.toHaveBeenCalled();
  });

  it('returns null offerings instead of throwing', async () => {
    const { getOfferings } = await loadModule();

    await expect(getOfferings()).resolves.toBeNull();
    expect(mockPurchases.getOfferings).not.toHaveBeenCalled();
  });

  it('returns null customer info instead of throwing', async () => {
    const { getCustomerInfo } = await loadModule();

    await expect(getCustomerInfo()).resolves.toBeNull();
  });

  it('skips identify and log out silently', async () => {
    const mod = await loadModule();

    await mod.identifyUser('user-1');
    await mod.logOutUser();

    expect(mockPurchases.logIn).not.toHaveBeenCalled();
    expect(mockPurchases.logOut).not.toHaveBeenCalled();
  });
});

describe('identity when the SDK is configured', () => {
  it('logs the Supabase user id into RevenueCat', async () => {
    const mod = await loadModule();
    mod.configureRevenueCat();

    await mod.identifyUser('user-1');

    expect(mockPurchases.logIn).toHaveBeenCalledWith('user-1');
  });

  it('swallows log out errors so sign-out is never blocked', async () => {
    const mod = await loadModule();
    mod.configureRevenueCat();
    mockPurchases.logOut.mockRejectedValueOnce(new Error('user is anonymous'));

    await expect(mod.logOutUser()).resolves.toBeUndefined();
  });
});
