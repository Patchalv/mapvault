import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useProfile } from '@/hooks/use-profile';
import { useMaps } from '@/hooks/use-maps';
import { useActiveMap } from '@/hooks/use-active-map';
import { useCreateMap } from '@/hooks/use-create-map';
import { useFreemiumGate } from '@/hooks/use-freemium-gate';
import { LoadingState } from '@/components/loading-state/loading-state';
import { ErrorState } from '@/components/error-state/error-state';
import { FREE_TIER } from '@/lib/constants';
import { track } from '@/lib/analytics';

export default function ManageMapsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const {
    data: profile,
    isLoading: isLoadingProfile,
    isError: isErrorProfile,
    refetch: refetchProfile,
  } = useProfile();
  const {
    data: mapMembers,
    isLoading: isLoadingMaps,
    isError: isErrorMaps,
    refetch: refetchMaps,
  } = useMaps();
  const { activeMapId } = useActiveMap();
  const { mutate: createMap, isPending: isCreating } = useCreateMap();
  const { handleMutationError } = useFreemiumGate();

  const [showNewMapModal, setShowNewMapModal] = useState(false);
  const [newMapName, setNewMapName] = useState('');

  useEffect(() => {
    track('manage_maps_viewed', {});
  }, []);

  const isLoading = isLoadingProfile || isLoadingMaps;
  const isError = isErrorProfile || isErrorMaps;

  if (isLoading) {
    return <LoadingState message={t('manageMaps.loading')} />;
  }

  if (isError) {
    return (
      <ErrorState
        message={t('manageMaps.loadError')}
        onRetry={() => {
          refetchProfile();
          refetchMaps();
        }}
      />
    );
  }

  const maps = mapMembers ?? [];
  const ownedMapCount = maps.filter((m) => m.role === 'owner').length;
  const isFree = profile?.entitlement === 'free';

  const handleNewMap = () => {
    if (isFree && ownedMapCount >= FREE_TIER.maxMaps) {
      Alert.alert(
        t('profile.mapLimitTitle'),
        t('profile.mapLimitMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.upgrade'),
            onPress: () =>
              router.push('/(tabs)/settings/paywall?trigger=map_limit'),
          },
        ],
      );
      return;
    }

    setNewMapName('');
    setShowNewMapModal(true);
  };

  const handleCreateMap = () => {
    if (isCreating || !newMapName.trim()) return;
    setShowNewMapModal(false);
    createMap(
      { name: newMapName.trim() },
      {
        onSuccess: () => {
          router.navigate('/(tabs)/explore');
        },
        onError: (err) => {
          handleMutationError(err);
        },
      },
    );
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 20,
        }}
      >
        {/* My Maps Section */}
        <View className="mb-6">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-gray-900">
              {t('profile.manageMaps')}
            </Text>
            <Pressable
              onPress={handleNewMap}
              disabled={isCreating}
              className="flex-row items-center rounded-lg bg-blue-500 px-3 py-1.5"
            >
              <FontAwesome name="plus" size={12} color="#FFFFFF" />
              <Text className="ml-1.5 text-sm font-semibold text-white">
                {t('profile.newMap')}
              </Text>
            </Pressable>
          </View>

          {maps.map((membership) => {
            const map = membership.maps;
            if (!map) return null;
            const isActive = activeMapId === map.id;
            return (
              <Pressable
                key={map.id}
                className="mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4"
                onPress={() => router.push(`/(tabs)/settings/map/${map.id}`)}
              >
                {/* Active dot */}
                <View
                  className={`mr-3 h-2.5 w-2.5 rounded-full ${
                    isActive ? 'bg-green-500' : 'bg-transparent'
                  }`}
                />

                {/* Map info */}
                <View className="flex-1">
                  <Text className="text-base font-medium text-gray-900">
                    {map.name}
                  </Text>
                </View>

                {/* Role badge */}
                <View
                  className={`mr-3 rounded-full px-2 py-0.5 ${
                    membership.role === 'owner'
                      ? 'bg-blue-100'
                      : membership.role === 'contributor'
                        ? 'bg-green-100'
                        : 'bg-gray-100'
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      membership.role === 'owner'
                        ? 'text-blue-700'
                        : membership.role === 'contributor'
                          ? 'text-green-700'
                          : 'text-gray-600'
                    }`}
                  >
                    {membership.role === 'owner'
                      ? t('common.roles.owner')
                      : membership.role === 'contributor'
                        ? t('common.roles.contributor')
                        : t('common.roles.member')}
                  </Text>
                </View>

                {/* Chevron */}
                <FontAwesome name="chevron-right" size={12} color="#9CA3AF" />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={showNewMapModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewMapModal(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50"
          onPress={() => setShowNewMapModal(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View className="w-72 rounded-2xl bg-white p-6" onStartShouldSetResponder={() => true}>
              <Text className="mb-1 text-lg font-semibold text-gray-900">
                {t('profile.newMapPromptTitle')}
              </Text>
              <Text className="mb-4 text-sm text-gray-500">
                {t('profile.newMapPromptMessage')}
              </Text>
              <TextInput
                autoFocus
                value={newMapName}
                onChangeText={setNewMapName}
                onSubmitEditing={handleCreateMap}
                returnKeyType="done"
                placeholder={t('profile.newMapPlaceholder')}
                placeholderTextColor="#9CA3AF"
                className="mb-4 rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
              />
              <View className="flex-row justify-end gap-3">
                <Pressable onPress={() => setShowNewMapModal(false)}>
                  <Text className="text-base text-gray-500">{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={handleCreateMap} disabled={isCreating}>
                  <Text className="text-base font-semibold text-blue-500">
                    {t('profile.create')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
}
