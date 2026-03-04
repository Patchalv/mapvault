import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { track } from '@/lib/analytics';
import { useAcceptInvite, type InviteError } from '@/hooks/use-accept-invite';
import type { MapRole } from '@/types';

type Status = 'loading' | 'success' | 'error';

interface SuccessData {
  mapName: string;
  role: MapRole;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  contributor: 'You can add, edit, and remove places.',
  member: 'You can view places but not edit them.',
};

const ERROR_MESSAGES: Record<string, string> = {
  INVITE_NOT_FOUND: 'This invite link is invalid or has been removed.',
  INVITE_EXPIRED: 'This invite has expired. Ask the map owner for a new link.',
  INVITE_MAX_USES: 'This invite has reached its maximum number of uses.',
  ALREADY_MEMBER: "You're already a member of this map.",
};

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { mutateAsync: acceptInvite } = useAcceptInvite();

  const [status, setStatus] = useState<Status>('loading');
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
        const code = inviteErr.code;
        setErrorMessage(
          (code && ERROR_MESSAGES[code]) ?? inviteErr.message ?? 'Something went wrong.'
        );
        setStatus('error');
      }
    }

    processInvite();

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  return (
    <View
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      className="flex-1 items-center justify-center bg-white px-8"
    >
      {status === 'loading' && (
        <>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text className="mt-4 text-base text-gray-500">
            Processing invite...
          </Text>
        </>
      )}

      {status === 'success' && successData && (
        <>
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <FontAwesome name="check-circle" size={32} color="#22C55E" />
          </View>
          <Text className="mb-2 text-center text-lg font-semibold text-gray-900">
            You joined {successData.mapName}!
          </Text>
          <Text className="mb-2 text-center text-base capitalize text-gray-700">
            as a {successData.role}
          </Text>
          <Text className="mb-8 text-center text-sm text-gray-500">
            {ROLE_DESCRIPTIONS[successData.role] ?? ''}
          </Text>
          <Pressable
            onPress={() => router.replace('/(tabs)/explore')}
            className="rounded-xl bg-blue-500 px-8 py-3"
          >
            <Text className="text-base font-semibold text-white">
              Open Map
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
            Invite Error
          </Text>
          <Text className="mb-8 text-center text-base text-gray-500">
            {errorMessage}
          </Text>
          <Pressable
            onPress={() => router.replace('/(tabs)/explore')}
            className="rounded-xl bg-blue-500 px-8 py-3"
          >
            <Text className="text-base font-semibold text-white">
              Go to Explore
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
