import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { signInWithApple, signInWithGoogle } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: () => 'mapvault://redirect',
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      signInWithIdToken: jest.fn(),
      setSession: jest.fn(),
      updateUser: jest.fn(),
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

const auth = supabase.auth as unknown as {
  signInWithOAuth: jest.Mock;
  signInWithIdToken: jest.Mock;
  setSession: jest.Mock;
  updateUser: jest.Mock;
  getUser: jest.Mock;
};
const mockFrom = supabase.from as unknown as jest.Mock;
const mockOpenAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;
const mockAppleSignIn = AppleAuthentication.signInAsync as jest.Mock;

const REDIRECT_WITH_TOKENS =
  'mapvault://redirect#access_token=access-123&refresh_token=refresh-456';

function signedInUser(metadata: Record<string, unknown> = {}) {
  return { data: { user: { id: 'user-1', user_metadata: metadata } } };
}

beforeEach(() => {
  jest.clearAllMocks();
  // lib/auth.ts logs the redirect URI and sync failures under __DEV__.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFrom.mockReturnValue({ update: mockUpdate });
  mockUpdateEq.mockResolvedValue({ error: null });
  auth.signInWithOAuth.mockResolvedValue({
    data: { url: 'https://accounts.google.com/o/oauth2/auth' },
    error: null,
  });
  auth.setSession.mockResolvedValue({ error: null });
  auth.signInWithIdToken.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.getUser.mockResolvedValue(signedInUser());
  mockOpenAuthSession.mockResolvedValue({ type: 'success', url: REDIRECT_WITH_TOKENS });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('signInWithGoogle', () => {
  it('sets the session from the tokens in the redirect fragment', async () => {
    await expect(signInWithGoogle()).resolves.toEqual({ success: true });
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'access-123',
      refresh_token: 'refresh-456',
    });
  });

  it('reports a Supabase OAuth error without opening a browser', async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: 'provider disabled' },
    });

    await expect(signInWithGoogle()).resolves.toEqual({
      success: false,
      cancelled: false,
      error: 'provider disabled',
    });
    expect(mockOpenAuthSession).not.toHaveBeenCalled();
  });

  it.each(['dismiss', 'cancel', 'locked'])(
    'treats a %s result as a cancel, not an error',
    async (type) => {
      mockOpenAuthSession.mockResolvedValue({ type });

      await expect(signInWithGoogle()).resolves.toEqual({
        success: false,
        cancelled: true,
      });
      expect(auth.setSession).not.toHaveBeenCalled();
    },
  );

  it('fails when the redirect carries no tokens', async () => {
    mockOpenAuthSession.mockResolvedValue({
      type: 'success',
      url: 'mapvault://redirect#error=access_denied',
    });

    await expect(signInWithGoogle()).resolves.toEqual({
      success: false,
      cancelled: false,
      error: 'Missing tokens in redirect URL.',
    });
  });

  it('reports a failed setSession', async () => {
    auth.setSession.mockResolvedValue({ error: { message: 'invalid refresh token' } });

    await expect(signInWithGoogle()).resolves.toEqual({
      success: false,
      cancelled: false,
      error: 'invalid refresh token',
    });
  });

  it('syncs the Google display name and avatar into profiles', async () => {
    auth.getUser.mockResolvedValue(
      signedInUser({ full_name: 'Ada Lovelace', avatar_url: 'https://img/ada.png' }),
    );

    await signInWithGoogle();

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockUpdate).toHaveBeenCalledWith({
      display_name: 'Ada Lovelace',
      avatar_url: 'https://img/ada.png',
    });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('skips the profile sync when Google returned no name or avatar', async () => {
    auth.getUser.mockResolvedValue(signedInUser({}));

    await signInWithGoogle();

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('still reports success when the profile sync fails', async () => {
    auth.getUser.mockResolvedValue(signedInUser({ full_name: 'Ada Lovelace' }));
    mockUpdateEq.mockResolvedValue({ error: { message: 'row level security' } });

    await expect(signInWithGoogle()).resolves.toEqual({ success: true });
  });
});

describe('signInWithApple', () => {
  it('signs in with the identity token', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-token', fullName: null });

    await expect(signInWithApple()).resolves.toEqual({ success: true });
    expect(auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: 'apple',
      token: 'apple-token',
    });
  });

  it('fails when Apple returns no identity token', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: null });

    await expect(signInWithApple()).resolves.toEqual({
      success: false,
      error: 'No identity token received from Apple.',
    });
    expect(auth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('reports a Supabase sign-in error', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-token', fullName: null });
    auth.signInWithIdToken.mockResolvedValue({ error: { message: 'bad token' } });

    await expect(signInWithApple()).resolves.toEqual({
      success: false,
      error: 'bad token',
    });
  });

  it('persists the name Apple only sends on first sign-in', async () => {
    mockAppleSignIn.mockResolvedValue({
      identityToken: 'apple-token',
      fullName: { givenName: 'Ada', familyName: 'Lovelace' },
    });

    await signInWithApple();

    expect(auth.updateUser).toHaveBeenCalledWith({
      data: {
        full_name: 'Ada Lovelace',
        given_name: 'Ada',
        family_name: 'Lovelace',
      },
    });
    expect(mockUpdate).toHaveBeenCalledWith({ display_name: 'Ada Lovelace' });
  });

  it('falls back to auth metadata on later sign-ins, when Apple sends no name', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-token', fullName: null });
    auth.getUser.mockResolvedValue(signedInUser({ full_name: 'Ada Lovelace' }));

    await signInWithApple();

    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({ display_name: 'Ada Lovelace' });
  });

  it('leaves display_name alone when no name is available anywhere', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-token', fullName: null });
    auth.getUser.mockResolvedValue(signedInUser({}));

    await signInWithApple();

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
