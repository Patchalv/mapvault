import { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { track } from '@/lib/analytics';
import { useAcceptInvite, type InviteError } from '@/hooks/use-accept-invite';
import type { MapRole } from '@/types';
import { useTranslation } from 'react-i18next';

type Status = 'loading' | 'success' | 'error';

interface SuccessData {
  mapName: string;
  role: MapRole;
}

export default function InviteScreen() {
  const { t } = useTranslation();
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { mutateAsync: acceptInvite } = useAcceptInvite();

  const ROLE_LABELS = useMemo<Record<string, string>>(() => ({
    contributor: t('common.roles.contributor'),
    member: t('common.roles.member'),
  }), [t]);

  const ROLE_DESCRIPTIONS = useMemo<Record<string, string>>(() => ({
    contributor: t('invite.contributorDescription'),
    member: t('invite.memberDescription'),
  }), [t]);

  const ERROR_MESSAGES = useMemo<Record<string, string>>(() => ({
    INVITE_NOT_FOUND: t('invite.errorNotFound'),
    INVITE_EXPIRED: t('invite.errorExpired'),
    INVITE_MAX_USES: t('invite.errorMaxUses'),
    ALREADY_MEMBER: t('invite.errorAlreadyMember'),
    FALLBACK: t('invite.errorFallback'),
  }), [t]);

  const [status, setStatus] = useState<Status>('loading');
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const errorMessage = useMemo(
    () => (errorCode !== null ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.FALLBACK) : null),
    [errorCode, ERROR_MESSAGES]
  );

  useEffect(() => {
    if (!token || !user) return;

    let cancelled = false;

    async function processInvite() {
      try {
        const result = await acceptInvite(token!);

        if (cancelled) return;

        track('invite_accepted', { map_id: result.mapId });

        // Set the accepted map as active
        await supabase
          .from('profiles')
          .update({ active_map_id: result.mapId })
          .eq('id', user!.id);

        if (cancelled) return;

        setSuccessData({ mapName: result.mapName, role: result.role });
        setStatus('success');
      } catch (err) {
        if (cancelled) return;

        const inviteErr = err as InviteError;
        setErrorCode(inviteErr.code ?? '');
        setStatus('error');
      }
    }

    processInvite();

    return () => {
      cancelled = true;
    };
  }, [token, user, acceptInvite]);

  return (
    <View
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      className="flex-1 items-center justify-center bg-white px-8"
    >
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text className="mt-4 text-base text-gray-500">
            {t('invite.processing')}
          </Text>
        </>
      )}

      {status === 'success' && successData && (
        <>
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <FontAwesome name="check-circle" size={32} color="#22C55E" />
          </View>
          <Text className="mb-2 text-center text-lg font-semibold text-gray-900">
            {t('invite.joinedMap', { mapName: successData.mapName })}
          </Text>
          <Text className="mb-2 text-center text-base text-gray-700">
            {t('invite.asRole', { role: ROLE_LABELS[successData.role] ?? successData.role })}
          </Text>
          <Text className="mb-8 text-center text-sm text-gray-500">
            {ROLE_DESCRIPTIONS[successData.role] ?? ''}
          </Text>
          <Pressable
            onPress={() => router.replace('/(tabs)/explore')}
            className="rounded-xl bg-blue-500 px-8 py-3"
          >
            <Text className="text-base font-semibold text-white">
              {t('invite.openMap')}
            </Text>
          </Pressable>
        </>
      )}

      {status === 'error' && (
        <>
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <FontAwesome name="exclamation-circle" size={32} color="#EF4444" />
          </View>
          <Text className="mb-2 text-center text-lg font-semibold text-gray-900">
            {t('invite.errorTitle')}
          </Text>
          <Text className="mb-8 text-center text-base text-gray-500">
            {errorMessage}
          </Text>
          <Pressable
            onPress={() => router.replace('/(tabs)/explore')}
            className="rounded-xl bg-blue-500 px-8 py-3"
          >
            <Text className="text-base font-semibold text-white">
              {t('invite.goToExplore')}
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
