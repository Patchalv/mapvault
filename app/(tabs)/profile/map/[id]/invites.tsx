import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { startOfDay, differenceInDays } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useProfile } from '@/hooks/use-profile';
import { useMapRole } from '@/hooks/use-map-role';
import { useInvites } from '@/hooks/use-invites';
import { useCreateInvite } from '@/hooks/use-create-invite';
import { InviteCreator } from '@/components/invite-creator/invite-creator';
import { ErrorState } from '@/components/error-state/error-state';
import { track } from '@/lib/analytics';
import { APP_DOMAIN } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type { MapInvite } from '@/types';

function getInviteLink(token: string): string {
  return `${APP_DOMAIN}/invite/${token}`;
}

function isMaxedOut(invite: MapInvite): boolean {
  if (invite.max_uses === null) return false;
  return invite.use_count >= invite.max_uses;
}

export default function MapInvitesScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: profile } = useProfile();
  const isPremium = profile?.entitlement === 'premium';
  const { isOwner } = useMapRole(id ?? null);
  const { data: invites, isLoading, isFetching, isError, refetch } = useInvites(id ?? null);
  const { mutate: createInvite, isPending: isCreatingInvite } = useCreateInvite();

  const inviteCreatorRef = useRef<BottomSheetModal>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
      if (id) track('invites_screen_viewed', { map_id: id });
    }, [id, refetch])
  );

  const visibleInvites = (invites ?? []).filter(
    (invite) =>
      !invite.revoked_at &&
      (!invite.expires_at || new Date(invite.expires_at) >= startOfDay(new Date()))
  );

  const formatUses = (invite: MapInvite): string => {
    if (invite.max_uses === null) return t('mapInvites.uses', { count: invite.use_count });
    return t('mapInvites.usesWithMax', { count: invite.use_count, max: invite.max_uses });
  };

  const getDaysLabel = (expiresAt: string | null): string => {
    if (!expiresAt) return t('mapInvites.noExpiry');
    const today = startOfDay(new Date());
    const expiry = startOfDay(new Date(expiresAt));
    const days = differenceInDays(expiry, today);
    if (days === 0) return t('mapInvites.expiresToday');
    if (days === 1) return t('mapInvites.oneDayRemaining');
    return t('mapInvites.daysRemaining', { count: days });
  };

  const handleOpenCreator = () => {
    if (!isPremium) {
      Alert.alert(
        t('inviteSection.premiumFeatureTitle'),
        t('inviteSection.premiumFeatureMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.upgrade'),
            onPress: () => router.push('/(tabs)/profile/paywall?trigger=invite_limit'),
          },
        ]
      );
      return;
    }
    inviteCreatorRef.current?.present();
  };

  const handleCreateInvite = useCallback(
    (input: {
      mapId: string;
      role: 'contributor' | 'member';
      expiresInDays: number | null;
      maxUses: number | null;
    }) => {
      createInvite(input, {
        onSuccess: () => inviteCreatorRef.current?.dismiss(),
        onError: () => Alert.alert(t('common.error'), t('mapInvites.createError')),
      });
    },
    [createInvite]
  );

  const handleCopy = useCallback(
    async (token: string) => {
      const link = getInviteLink(token);
      await Clipboard.setStringAsync(link);
      Alert.alert(t('inviteSection.copiedTitle'), t('inviteSection.copiedMessage'));
      if (id) track('invite_link_shared', { map_id: id });
    },
    [t, id]
  );

  const handleShare = useCallback(
    async (token: string) => {
      const link = getInviteLink(token);
      const result = await Share.share({
        message: t('inviteSection.shareMessage', { link }),
        url: link,
      });
      if (result.action === Share.sharedAction && id) {
        track('invite_link_shared', { map_id: id });
      }
    },
    [t, id]
  );

  const handleRevoke = useCallback(
    async (inviteId: string) => {
      if (!id) return;

      queryClient.setQueryData(
        ['invites', id],
        (prev: MapInvite[] | undefined) => (prev ?? []).filter((i) => i.id !== inviteId)
      );

      const { error } = await supabase
        .from('map_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', inviteId);

      if (error) {
        refetch();
        Alert.alert(t('common.error'), error.message);
      } else {
        track('invite_revoked', { map_id: id, invite_id: inviteId });
      }
    },
    [id, queryClient, refetch, t]
  );

  const handleRevokeConfirm = useCallback(
    (inviteId: string) => {
      Alert.alert(t('mapInvites.revokeTitle'), t('mapInvites.revokeMessage'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('mapInvites.revokeConfirm'),
          style: 'destructive',
          onPress: () => handleRevoke(inviteId),
        },
      ]);
    },
    [t, handleRevoke]
  );

  const header = (
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
        {t('mapInvites.title')}
      </Text>
    </View>
  );

  return (
    <BottomSheetModalProvider>
      <View className="flex-1 bg-white">
        {header}

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} />
        ) : isError ? (
          <ErrorState message={t('mapInvites.couldntLoad')} onRetry={refetch} />
        ) : (
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              paddingBottom: insets.bottom + 32,
            }}
          >
            {/* Description */}
            <Text className="mb-4 text-sm text-gray-500">
              {t('mapInvites.description')}
            </Text>

            {/* Create Invite Button */}
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {t('mapInvites.title')}
              </Text>
              <Pressable
                onPress={handleOpenCreator}
                className="flex-row items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5"
              >
                <FontAwesome name="plus" size={10} color="#3B82F6" />
                <Text className="text-xs font-semibold text-blue-600">
                  {t('inviteSection.createInvite')}
                </Text>
              </Pressable>
            </View>

            {/* Background refetch indicator */}
            {isFetching && (
              <ActivityIndicator size="small" color="#9CA3AF" style={{ marginBottom: 12 }} />
            )}

            {/* Invite List */}
            {visibleInvites.length === 0 ? (
              <View className="items-center py-8">
                <Text className="text-sm text-gray-400">{t('mapInvites.emptyTitle')}</Text>
                <Text className="mt-1 text-sm text-gray-400">{t('mapInvites.emptySubtitle')}</Text>
              </View>
            ) : (
              <View>
                {visibleInvites.map((invite) => {
                  const maxed = isMaxedOut(invite);

                  return (
                    <View
                      key={invite.id}
                      className={`mb-2 rounded-xl border p-3 ${
                        maxed ? 'border-gray-100 bg-gray-50' : 'border-gray-100 bg-white'
                      }`}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-1">
                          {/* Role + Status */}
                          <View className="flex-row items-center gap-2">
                            <View className="rounded-full bg-blue-100 px-2 py-0.5">
                              <Text className="text-xs font-medium text-blue-700">
                                {invite.role === 'contributor'
                                  ? t('common.roles.contributor')
                                  : t('common.roles.member')}
                              </Text>
                            </View>
                            {maxed && (
                              <View className="rounded-full bg-red-100 px-2 py-0.5">
                                <Text className="text-xs font-medium text-red-600">
                                  {t('inviteSection.usedUp')}
                                </Text>
                              </View>
                            )}
                          </View>

                          {/* Stats */}
                          <Text
                            className={`mt-1.5 text-xs ${maxed ? 'text-gray-400' : 'text-gray-500'}`}
                          >
                            {formatUses(invite)} · {getDaysLabel(invite.expires_at ?? null)}
                          </Text>
                        </View>

                        {/* Action buttons */}
                        <View className="flex-row items-center gap-2">
                          {!maxed && (
                            <>
                              <Pressable
                                onPress={() => handleCopy(invite.token)}
                                className="items-center justify-center rounded-lg bg-gray-100 px-3 py-2"
                              >
                                <FontAwesome name="copy" size={14} color="#6B7280" />
                              </Pressable>
                              <Pressable
                                onPress={() => handleShare(invite.token)}
                                className="items-center justify-center rounded-lg bg-blue-500 px-3 py-2"
                              >
                                <FontAwesome name="share" size={14} color="#FFFFFF" />
                              </Pressable>
                            </>
                          )}
                          {isOwner && (
                            <Pressable
                              onPress={() => handleRevokeConfirm(invite.id)}
                              className="items-center justify-center px-1 py-2"
                            >
                              <Ionicons name="trash-outline" size={20} color="#E8453C" />
                            </Pressable>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Invite Creator Bottom Sheet */}
      {id && (
        <InviteCreator
          ref={inviteCreatorRef}
          mapId={id}
          onCreateInvite={handleCreateInvite}
          isPending={isCreatingInvite}
        />
      )}
    </BottomSheetModalProvider>
  );
}
