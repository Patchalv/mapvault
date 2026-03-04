import { useCallback } from 'react';
import { ActivityIndicator, Alert, View, Text, Pressable, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { track } from '@/lib/analytics';
import { APP_DOMAIN } from '@/lib/constants';
import type { MapInvite } from '@/types';

interface InviteSectionProps {
  invites: MapInvite[] | undefined;
  isLoading?: boolean;
  isOwner: boolean;
  isPremium: boolean;
  onCreateInvite: () => void;
}

function isExpired(invite: MapInvite): boolean {
  if (!invite.expires_at) return false;
  return new Date(invite.expires_at) < new Date();
}

function isMaxedOut(invite: MapInvite): boolean {
  if (invite.max_uses === null) return false;
  return invite.use_count >= invite.max_uses;
}

function formatExpiry(invite: MapInvite): string {
  if (!invite.expires_at) return 'No expiry';
  const date = new Date(invite.expires_at);
  if (date < new Date()) return 'Expired';
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function formatUses(invite: MapInvite): string {
  if (invite.max_uses === null) return `${invite.use_count} uses`;
  return `${invite.use_count}/${invite.max_uses} uses`;
}

function getInviteLink(token: string): string {
  return `${APP_DOMAIN}/invite/${token}`;
}

export function InviteSection({ invites, isLoading, isOwner, isPremium, onCreateInvite }: InviteSectionProps) {
  const handleShare = useCallback(async (token: string, mapId: string) => {
    const link = getInviteLink(token);
    const result = await Share.share({
      message: `Join my map on MapVault! ${link}`,
      url: link,
    });
    if (result.action === Share.sharedAction) {
      track('invite_link_shared', { map_id: mapId });
    }
  }, []);

  const handleCopy = useCallback(async (token: string) => {
    const link = getInviteLink(token);
    await Clipboard.setStringAsync(link);
    Alert.alert('Copied', 'Invite link copied to clipboard.');
  }, []);

  return (
    <View className="mt-6">
      {/* Section Header */}
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Invites
        </Text>
        {isOwner && (
          <Pressable
            onPress={() => {
              if (!isPremium) {
                Alert.alert(
                  'Premium Feature',
                  'Invite links are a Premium feature. Upgrade to share your maps.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Upgrade',
                      onPress: () => router.push('/(tabs)/profile/paywall?trigger=invite_limit'),
                    },
                  ],
                );
                return;
              }
              onCreateInvite();
            }}
            className="flex-row items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5"
          >
            <FontAwesome name="plus" size={10} color="#3B82F6" />
            <Text className="text-xs font-semibold text-blue-600">
              Create Invite
            </Text>
          </Pressable>
        )}
      </View>

      {/* Invite List */}
      {isLoading ? (
        <ActivityIndicator size="small" color="#9CA3AF" />
      ) : invites && invites.length > 0 ? (
        <View>
          {invites.map((invite) => {
            const expired = isExpired(invite);
            const maxed = isMaxedOut(invite);
            const inactive = expired || maxed;

            return (
              <View
                key={invite.id}
                className={`mb-2 rounded-xl border p-3 ${
                  inactive
                    ? 'border-gray-100 bg-gray-50'
                    : 'border-gray-100 bg-white'
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    {/* Role + Status */}
                    <View className="flex-row items-center gap-2">
                      <View className="rounded-full bg-blue-100 px-2 py-0.5">
                        <Text className="text-xs font-medium capitalize text-blue-700">
                          {invite.role}
                        </Text>
                      </View>
                      {inactive && (
                        <View className="rounded-full bg-red-100 px-2 py-0.5">
                          <Text className="text-xs font-medium text-red-600">
                            {expired ? 'Expired' : 'Used up'}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Stats */}
                    <Text
                      className={`mt-1.5 text-xs ${
                        inactive ? 'text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      {formatUses(invite)} · {formatExpiry(invite)}
                    </Text>
                  </View>

                  {/* Action buttons */}
                  {!inactive && (
                    <View className="flex-row gap-2">
                      <Pressable
                        onPress={() => handleCopy(invite.token)}
                        className="items-center justify-center rounded-lg bg-gray-100 px-3 py-2"
                      >
                        <FontAwesome name="copy" size={14} color="#6B7280" />
                      </Pressable>
                      <Pressable
                        onPress={() => handleShare(invite.token, invite.map_id)}
                        className="items-center justify-center rounded-lg bg-blue-500 px-3 py-2"
                      >
                        <FontAwesome name="share" size={14} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text className="text-sm text-gray-400">
          No invites yet. Create one to share this map.
        </Text>
      )}
    </View>
  );
}
