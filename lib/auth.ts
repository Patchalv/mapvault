import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

export async function signInWithGoogle(): Promise<
  | { success: true }
  | { success: false; cancelled: true }
  | { success: false; cancelled: false; error: string }
> {
  const redirectTo = makeRedirectUri({ scheme: 'mapvault' });
  if (__DEV__) {
    console.log('[Auth] Redirect URI:', redirectTo);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    return { success: false, cancelled: false, error: error.message };
  }

  if (!data.url) {
    return { success: false, cancelled: false, error: 'No OAuth URL returned from Supabase.' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    // 'locked' means another auth session is already open — treat as a no-op,
    // not a hard error, to avoid showing the user a confusing error alert.
    const wasCancelled =
      result.type === 'dismiss' || result.type === 'cancel' || result.type === 'locked';
    if (wasCancelled) {
      return { success: false, cancelled: true };
    }
    return { success: false, cancelled: false, error: 'Authentication was cancelled.' };
  }

  const hashParams = new URLSearchParams(
    result.url.includes('#') ? result.url.split('#')[1] : '',
  );

  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return { success: false, cancelled: false, error: 'Missing tokens in redirect URL.' };
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    return { success: false, cancelled: false, error: sessionError.message };
  }

  // Sync Google profile data to profiles table.
  // The DB trigger (handle_new_user) also does this, but there is a race
  // condition where the client query fires before the trigger commits.
  // This mirrors the Apple auth pattern for consistency.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const meta = user.user_metadata;
    const displayName = meta?.full_name ?? meta?.name ?? null;
    const avatarUrl = meta?.avatar_url ?? meta?.picture ?? null;

    if (displayName || avatarUrl) {
      const { error: syncError } = await supabase
        .from('profiles')
        .update({
          ...(displayName ? { display_name: displayName } : {}),
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        })
        .eq('id', user.id);

      if (syncError && __DEV__) {
        console.warn('[Auth] Google profile sync failed:', syncError.message);
      }
    }
  }

  return { success: true };
}

export async function signInWithApple(): Promise<
  { success: true } | { success: false; error: string }
> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    return { success: false, error: 'No identity token received from Apple.' };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Apple only provides full name on first sign-in — persist it to auth metadata now or lose it
  let credentialName: string | null = null;
  if (credential.fullName?.givenName) {
    credentialName = [credential.fullName.givenName, credential.fullName.familyName]
      .filter(Boolean)
      .join(' ');
    await supabase.auth.updateUser({
      data: {
        full_name: credentialName,
        given_name: credential.fullName.givenName,
        family_name: credential.fullName.familyName ?? undefined,
      },
    });
  }

  // Sync profile data — always attempt, using credential name or auth metadata as fallback.
  // The DB trigger creates the profile with NULL display_name because Apple's ID token
  // does not contain the user's name. This ensures the profile is updated from all
  // available sources: the native credential (first sign-in only) or auth metadata
  // (persisted by updateUser above on a previous sign-in).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const meta = user.user_metadata;
    const displayName = credentialName ?? meta?.full_name ?? meta?.name ?? null;

    if (displayName) {
      const { error: syncError } = await supabase
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', user.id);

      if (syncError && __DEV__) {
        console.warn('[Auth] Apple profile sync failed:', syncError.message);
      }
    }
  }

  return { success: true };
}
