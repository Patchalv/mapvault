import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import { useMapRole } from '@/hooks/use-map-role';
import { useMapMembers } from '@/hooks/use-map-members';
import { useUpdateMemberRole } from '@/hooks/use-update-member-role';
import { useRemoveMember } from '@/hooks/use-remove-member';
import { Spinner } from '@/components/spinner/spinner';
import { ErrorState } from '@/components/error-state/error-state';
import { track } from '@/lib/analytics';

interface MapMember {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  profiles: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

function sortMembers(members: MapMember[]): MapMember[] {
  const byNameThenJoined = (a: MapMember, b: MapMember) => {
    const nameA = (a.profiles?.display_name ?? '').toLowerCase();
    const nameB = (b.profiles?.display_name ?? '').toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  };
  return [
    ...members.filter((m) => m.role === 'owner').sort(byNameThenJoined),
    ...members.filter((m) => m.role === 'contributor').sort(byNameThenJoined),
    ...members.filter((m) => m.role === 'member').sort(byNameThenJoined),
  ];
}

export default function MapMembersScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { isOwner } = useMapRole(id ?? null);
  const { data: members, isLoading, isError, refetch } = useMapMembers(id ?? null);
  const { mutate: updateMemberRole } = useUpdateMemberRole();
  const { mutate: removeMember } = useRemoveMember();
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const isPremiumOwner = isOwner && profile?.entitlement === 'premium';

  useFocusEffect(
    useCallback(() => {
      refetch();
      if (id) track('members_page_viewed', { map_id: id });
    }, [id, refetch])
  );

  const handleManageMember = useCallback(
    (memberId: string, memberName: string, currentRole: string) => {
      if (!id || !isPremiumOwner) return;
      const targetRole = currentRole === 'contributor' ? 'member' : 'contributor';
      const targetRoleLabel = targetRole === 'contributor' ? t('common.roles.contributor') : t('common.roles.member');
      Alert.alert(
        memberName,
        t('mapMembers.manageMessage'),
        [
          {
            text: t('mapMembers.changeRoleTo', { role: targetRoleLabel }),
            onPress: () =>
              updateMemberRole(
                { memberId, mapId: id, newRole: targetRole },
                {
                  onError: (err) => Alert.alert(t('common.error'), err.message),
                }
              ),
          },
          {
            text: t('mapMembers.removeFromMap'),
            style: 'destructive',
            onPress: () =>
              Alert.alert(
                t('mapMembers.removeConfirmTitle', { name: memberName }),
                t('mapMembers.removeConfirmMessage'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('mapMembers.removeConfirm'),
                    style: 'destructive',
                    onPress: () => {
                      setRemovingMemberId(memberId);
                      removeMember(
                        { memberId, mapId: id, role: currentRole as 'contributor' | 'member' },
                        {
                          onSuccess: () => setRemovingMemberId(null),
                          onError: (err) => {
                            setRemovingMemberId(null);
                            Alert.alert(t('common.error'), err.message);
                          },
                        }
                      );
                    },
                  },
                ]
              ),
          },
          { text: t('common.cancel'), style: 'cancel' },
        ]
      );
    },
    [id, isPremiumOwner, updateMemberRole, removeMember, t]
  );

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View
        style={{ paddingTop: insets.top + 8 }}
        className="flex-row items-center border-b border-gray-100 px-4 pb-3"
      >
        <Pressable
          onPress={() => router.back()}
          className="mr-3 h-10 w-10 items-center justify-center rounded-full"
        >
          <FontAwesome name="chevron-left" size={16} color="#374151" />
        </Pressable>
        <Text className="text-lg font-semibold text-gray-900">
          {t('mapMembers.title')}
        </Text>
      </View>

      {isLoading ? (
        <View className="mt-8 items-center">
          <Spinner />
        </View>
      ) : isError ? (
        <ErrorState message={t('errorState.defaultMessage')} onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 32,
          }}
        >
          <Text className="mb-4 text-sm text-gray-500">
            {t('mapMembers.pageDescription')}
          </Text>

          {!members || members.length === 0 ? (
            <Text className="text-sm text-gray-400">{t('mapMembers.noMembers')}</Text>
          ) : (
            sortMembers(members as MapMember[]).map((member) => {
              const name = member.profiles?.display_name ?? t('mapSettings.unknown');
              const initials = name
                .split(' ')
                .map((w: string) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const isCurrentUser = member.user_id === user?.id;
              const canTap = isPremiumOwner && !isCurrentUser && member.role !== 'owner' && removingMemberId === null;

              const roleBadgeBg =
                member.role === 'owner'
                  ? 'bg-blue-100'
                  : member.role === 'contributor'
                    ? 'bg-green-100'
                    : 'bg-gray-100';
              const roleTextColor =
                member.role === 'owner'
                  ? 'text-blue-700'
                  : member.role === 'contributor'
                    ? 'text-green-700'
                    : 'text-gray-600';

              return (
                <Pressable
                  key={member.id}
                  onPress={canTap ? () => handleManageMember(member.id, name, member.role) : undefined}
                  className="mb-2 flex-row items-center rounded-xl border border-gray-100 p-3"
                >
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                    <Text className="text-sm font-semibold text-gray-600">{initials}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-medium text-gray-900">
                      {name}
                      {isCurrentUser ? t('mapMembers.you') : ''}
                    </Text>
                  </View>
                  <View className={`rounded-full px-2 py-0.5 ${roleBadgeBg}`}>
                    <Text className={`text-xs font-medium ${roleTextColor}`}>
                      {member.role === 'owner'
                        ? t('common.roles.owner')
                        : member.role === 'contributor'
                          ? t('common.roles.contributor')
                          : t('common.roles.member')}
                    </Text>
                  </View>
                  {canTap && (
                    <FontAwesome
                      name="chevron-right"
                      size={10}
                      color="#9CA3AF"
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
