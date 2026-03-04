import { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '@/hooks/use-auth';
import { useMaps } from '@/hooks/use-maps';
import { useProfile } from '@/hooks/use-profile';
import { useTags } from '@/hooks/use-tags';
import { useMapMembers } from '@/hooks/use-map-members';
import { useUpdateMap } from '@/hooks/use-update-map';
import { useDeleteMap } from '@/hooks/use-delete-map';
import { useLeaveMap } from '@/hooks/use-leave-map';
import { useCreateTag, useUpdateTag, useDeleteTag } from '@/hooks/use-manage-tags';
import { useInvites } from '@/hooks/use-invites';
import { useCreateInvite } from '@/hooks/use-create-invite';
import { useUpdateMemberRole } from '@/hooks/use-update-member-role';
import { useFreemiumGate } from '@/hooks/use-freemium-gate';
import { TagEditor } from '@/components/tag-editor/tag-editor';
import { InviteSection } from '@/components/invite-section/invite-section';
import { InviteCreator } from '@/components/invite-creator/invite-creator';
import { LoadingState } from '@/components/loading-state/loading-state';
import { ErrorState } from '@/components/error-state/error-state';
import type { Tag } from '@/types';

export default function MapSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data: mapMembers, isLoading: isLoadingMaps, isError: isErrorMaps, refetch: refetchMaps } = useMaps();
  const { data: tags, isLoading: isLoadingTags } = useTags(id ?? null);
  const { data: members, isLoading: isLoadingMembers } = useMapMembers(id ?? null);
  const { mutate: updateMap, isPending: isUpdating } = useUpdateMap();
  const { mutate: deleteMap, isPending: isDeleting } = useDeleteMap();
  const { mutate: leaveMap, isPending: isLeaving } = useLeaveMap();
  const { mutate: createTag, isPending: isCreatingTag } = useCreateTag();
  const { mutate: updateTag, isPending: isUpdatingTag } = useUpdateTag();
  const { mutate: deleteTag, isPending: isDeletingTag } = useDeleteTag();
  const { data: profile } = useProfile();
  const { data: invites, isLoading: isLoadingInvites } = useInvites(id ?? null);
  const { mutate: createInvite, isPending: isCreatingInvite } = useCreateInvite();
  const { mutate: updateMemberRole } = useUpdateMemberRole();
  const { handleMutationError } = useFreemiumGate();

  const tagEditorRef = useRef<BottomSheetModal>(null);
  const inviteCreatorRef = useRef<BottomSheetModal>(null);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  // Find current map and role
  const membership = mapMembers?.find((m) => m.maps?.id === id);
  const map = membership?.maps;
  const isOwner = membership?.role === 'owner';
  const canEdit = membership?.role === 'owner' || membership?.role === 'contributor';
  const isPremium = profile?.entitlement === 'premium';
  const ownedMapCount = mapMembers?.filter((m) => m.role === 'owner').length ?? 0;

  const [mapName, setMapName] = useState(map?.name ?? '');
  const hasNameChanged = mapName.trim() !== (map?.name ?? '');

  const handleSaveName = () => {
    if (!id || !mapName.trim()) return;
    updateMap(
      { mapId: id, name: mapName },
      {
        onError: (err) => Alert.alert('Error', err.message),
      }
    );
  };

  const handleDeleteMap = () => {
    if (!id) return;

    if (ownedMapCount <= 1) {
      Alert.alert(
        'Cannot Delete',
        'You must have at least one map. Create another map before deleting this one.'
      );
      return;
    }

    Alert.alert(
      'Delete Map',
      `Are you sure you want to delete "${map?.name}"? This will permanently remove all places, tags, and members. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMap(id, {
              onSuccess: () => router.back(),
              onError: (err) => Alert.alert('Error', err.message),
            });
          },
        },
      ]
    );
  };

  const handleLeaveMap = () => {
    if (!id) return;

    Alert.alert(
      'Leave Map',
      `Are you sure you want to leave "${map?.name}"? You will lose access to this map.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            leaveMap(id, {
              onSuccess: () => router.back(),
              onError: (err) => Alert.alert('Error', err.message),
            });
          },
        },
      ]
    );
  };

  const handleAddTag = useCallback(() => {
    setEditingTag(null);
    tagEditorRef.current?.present();
  }, []);

  const handleEditTag = useCallback((tag: Tag) => {
    setEditingTag(tag);
    tagEditorRef.current?.present();
  }, []);

  const handleCreateTag = useCallback(
    (input: { mapId: string; name: string; emoji: string; color: string }) => {
      createTag(input, {
        onSuccess: () => tagEditorRef.current?.dismiss(),
        onError: (err) => Alert.alert('Error', err.message),
      });
    },
    [createTag]
  );

  const handleUpdateTag = useCallback(
    (input: {
      tagId: string;
      mapId: string;
      name: string;
      emoji: string;
      color: string;
    }) => {
      updateTag(input, {
        onSuccess: () => tagEditorRef.current?.dismiss(),
        onError: (err) => Alert.alert('Error', err.message),
      });
    },
    [updateTag]
  );

  const handleDeleteTag = useCallback(
    (input: { tagId: string; mapId: string }) => {
      deleteTag(input, {
        onSuccess: () => tagEditorRef.current?.dismiss(),
        onError: (err) => Alert.alert('Error', err.message),
      });
    },
    [deleteTag]
  );

  const handleOpenInviteCreator = useCallback(() => {
    inviteCreatorRef.current?.present();
  }, []);

  const handleCreateInvite = useCallback(
    (input: {
      mapId: string;
      role: 'contributor' | 'member';
      expiresInDays: number | null;
      maxUses: number | null;
    }) => {
      createInvite(input, {
        onSuccess: () => inviteCreatorRef.current?.dismiss(),
        onError: (err) => handleMutationError(err, 'invite_limit'),
      });
    },
    [createInvite, handleMutationError]
  );

  const handleChangeRole = useCallback(
    (memberId: string, memberName: string, currentRole: string) => {
      if (!id || !isPremium) return;
      const newRole = currentRole === 'contributor' ? 'member' : 'contributor';
      const newRoleLabel = newRole === 'contributor' ? 'Contributor' : 'Member';
      Alert.alert(
        'Change Role',
        `Make ${memberName} a ${newRoleLabel}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: newRoleLabel,
            onPress: () =>
              updateMemberRole(
                { memberId, mapId: id, newRole },
                { onError: (err) => Alert.alert('Error', err.message) }
              ),
          },
        ]
      );
    },
    [id, isPremium, updateMemberRole]
  );

  if (isLoadingMaps) {
    return <LoadingState />;
  }

  if (isErrorMaps) {
    return (
      <ErrorState
        message="Couldn't load map details."
        onRetry={refetchMaps}
      />
    );
  }

  if (!map) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-gray-500">Map not found</Text>
      </View>
    );
  }

  return (
    <BottomSheetModalProvider>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
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
            Map Settings
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 32,
          }}
        >
          {/* Map Name */}
          <View className="mb-6">
            <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Map Name
            </Text>
            {isOwner ? (
              <View className="flex-row items-center gap-3">
                <TextInput
                  value={mapName}
                  onChangeText={setMapName}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
                  placeholder="Map name"
                />
                {hasNameChanged && (
                  <Pressable
                    onPress={handleSaveName}
                    disabled={isUpdating}
                    className="rounded-xl bg-blue-500 px-4 py-3"
                  >
                    <Text className="text-sm font-semibold text-white">
                      {isUpdating ? 'Saving...' : 'Save'}
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <Text className="text-base text-gray-700">{map.name}</Text>
            )}
          </View>

          {/* Tags Section */}
          <View className="mb-6">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Tags
              </Text>
              {canEdit && (
                <Pressable
                  onPress={handleAddTag}
                  className="flex-row items-center rounded-lg bg-blue-500 px-3 py-1.5"
                >
                  <FontAwesome name="plus" size={10} color="#FFFFFF" />
                  <Text className="ml-1.5 text-xs font-semibold text-white">
                    Add Tag
                  </Text>
                </Pressable>
              )}
            </View>
            {isLoadingTags ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : tags && tags.length > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {tags.map((tag) =>
                  canEdit ? (
                    <Pressable
                      key={tag.id}
                      onPress={() => handleEditTag(tag)}
                      style={{
                        borderColor: tag.color ?? '#E5E7EB',
                        backgroundColor: `${tag.color ?? '#6B7280'}15`,
                      }}
                      className="flex-row items-center rounded-full border-2 px-3 py-1.5"
                    >
                      {tag.emoji && (
                        <Text className="mr-1 text-sm">{tag.emoji}</Text>
                      )}
                      <Text
                        style={{ color: tag.color ?? '#374151' }}
                        className="text-sm font-medium"
                      >
                        {tag.name}
                      </Text>
                    </Pressable>
                  ) : (
                    <View
                      key={tag.id}
                      style={{
                        borderColor: tag.color ?? '#E5E7EB',
                        backgroundColor: `${tag.color ?? '#6B7280'}15`,
                      }}
                      className="flex-row items-center rounded-full border-2 px-3 py-1.5"
                    >
                      {tag.emoji && (
                        <Text className="mr-1 text-sm">{tag.emoji}</Text>
                      )}
                      <Text
                        style={{ color: tag.color ?? '#374151' }}
                        className="text-sm font-medium"
                      >
                        {tag.name}
                      </Text>
                    </View>
                  )
                )}
              </View>
            ) : (
              <Text className="text-sm text-gray-400">No tags yet</Text>
            )}
          </View>

          {/* Members Section */}
          <View className="mb-6">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Members
              </Text>
            </View>
            {isLoadingMembers ? (
              <ActivityIndicator size="small" color="#9CA3AF" />
            ) : members?.map((member) => {
              const name = member.profiles?.display_name ?? 'Unknown';
              const memberInitials = name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              const isCurrentUser = member.user_id === user?.id;
              const canChangeRole =
                isOwner && isPremium && !isCurrentUser && member.role !== 'owner';

              const roleBadgeColor =
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
                  onPress={
                    canChangeRole
                      ? () => handleChangeRole(member.id, name, member.role)
                      : undefined
                  }
                  className="mb-2 flex-row items-center rounded-xl border border-gray-100 p-3"
                >
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-gray-200">
                    <Text className="text-sm font-semibold text-gray-600">
                      {memberInitials}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-base font-medium text-gray-900">
                      {name}
                      {isCurrentUser ? ' (you)' : ''}
                    </Text>
                  </View>
                  <View
                    className={`rounded-full px-2 py-0.5 ${roleBadgeColor}`}
                  >
                    <Text
                      className={`text-xs font-medium capitalize ${roleTextColor}`}
                    >
                      {member.role}
                    </Text>
                  </View>
                  {canChangeRole && (
                    <FontAwesome
                      name="chevron-right"
                      size={10}
                      color="#9CA3AF"
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Invites Section */}
          <InviteSection
            invites={invites}
            isLoading={isLoadingInvites}
            isOwner={isOwner}
            isPremium={isPremium}
            onCreateInvite={handleOpenInviteCreator}
          />

          {/* Danger Zone */}
          <View className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <Text className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-600">
              Danger Zone
            </Text>
            {isOwner ? (
              <Pressable
                onPress={handleDeleteMap}
                disabled={isDeleting}
                className="items-center rounded-xl border border-red-300 bg-white py-3"
              >
                <Text className="text-base font-semibold text-red-600">
                  {isDeleting ? 'Deleting...' : 'Delete Map'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleLeaveMap}
                disabled={isLeaving}
                className="items-center rounded-xl border border-red-300 bg-white py-3"
              >
                <Text className="text-base font-semibold text-red-600">
                  {isLeaving ? 'Leaving...' : 'Leave Map'}
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>

        {/* Tag Editor Bottom Sheet */}
        {id && (
          <TagEditor
            ref={tagEditorRef}
            mapId={id}
            editingTag={editingTag}
            onCreateTag={handleCreateTag}
            onUpdateTag={handleUpdateTag}
            onDeleteTag={handleDeleteTag}
            isPending={isCreatingTag || isUpdatingTag || isDeletingTag}
          />
        )}

        {/* Invite Creator Bottom Sheet */}
        {id && (
          <InviteCreator
            ref={inviteCreatorRef}
            mapId={id}
            onCreateInvite={handleCreateInvite}
            isPending={isCreatingInvite}
          />
        )}
      </View>
    </BottomSheetModalProvider>
  );
}
