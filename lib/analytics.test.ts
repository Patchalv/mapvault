import type { PostHog } from 'posthog-react-native';

type AnalyticsModule = typeof import('@/lib/analytics');

function loadAnalytics(): AnalyticsModule {
  let mod: AnalyticsModule;
  jest.isolateModules(() => {
    mod = require('@/lib/analytics');
  });
  return mod!;
}

function fakePostHog() {
  return {
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
  } as unknown as jest.Mocked<PostHog>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('analytics before PostHog is injected', () => {
  it('drops events instead of throwing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { track } = loadAnalytics();

    expect(() => track('settings_viewed', {})).not.toThrow();
    warn.mockRestore();
  });

  it('warns in dev so a missing init is visible', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { track } = loadAnalytics();

    track('settings_viewed', {});

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('dropping event: settings_viewed'),
    );
    warn.mockRestore();
  });

  it('no-ops on identify and reset', () => {
    const { identifyUser, resetUser } = loadAnalytics();

    expect(() => identifyUser('user-1')).not.toThrow();
    expect(() => resetUser()).not.toThrow();
  });
});

describe('analytics once PostHog is injected', () => {
  it('captures the event name and properties', () => {
    const posthog = fakePostHog();
    const { setPostHogInstance, track } = loadAnalytics();
    setPostHogInstance(posthog);

    track('purchase_failed', { reason: 'cancelled' });

    expect(posthog.capture).toHaveBeenCalledWith('purchase_failed', {
      reason: 'cancelled',
    });
  });

  it('identifies the user with properties', () => {
    const posthog = fakePostHog();
    const { setPostHogInstance, identifyUser } = loadAnalytics();
    setPostHogInstance(posthog);

    identifyUser('user-1', { entitlement: 'premium' });

    expect(posthog.identify).toHaveBeenCalledWith('user-1', { entitlement: 'premium' });
  });

  it('resets on sign-out so the next user is not merged into this one', () => {
    const posthog = fakePostHog();
    const { setPostHogInstance, resetUser } = loadAnalytics();
    setPostHogInstance(posthog);

    resetUser();

    expect(posthog.reset).toHaveBeenCalled();
  });

  it('sends user properties as a $set event', () => {
    const posthog = fakePostHog();
    const { setPostHogInstance, updateUserProperties } = loadAnalytics();
    setPostHogInstance(posthog);

    updateUserProperties({ entitlement: 'free' });

    expect(posthog.capture).toHaveBeenCalledWith('$set', {
      $set: { entitlement: 'free' },
    });
  });
});
