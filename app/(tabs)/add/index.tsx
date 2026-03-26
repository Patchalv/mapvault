import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { usePlaceSearch } from '@/hooks/use-place-search';
import { useActiveMap } from '@/hooks/use-active-map';
import { track } from '@/lib/analytics';
import type { PlacePrediction } from '@/lib/google-places';

export default function AddScreen() {
  const { t } = useTranslation();
  const { predictions, isSearching, error, search, clear } = usePlaceSearch();
  const { activeMapName, activeMapRole } = useActiveMap();
  const isMemberOnly = activeMapRole === 'member';
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      setQuery('');
      clear();
      track('place_search_started', {});
    }, [clear])
  );

  const handleChangeText = (text: string) => {
    setQuery(text);
    search(text);
  };

  const handleSelect = (prediction: PlacePrediction) => {
    track('place_search_result_selected', { google_category: null });
    Keyboard.dismiss();
    router.push({
      pathname: '/(tabs)/add/save' as never,
      params: {
        placeId: prediction.placeId,
        name: prediction.name,
        address: prediction.address,
      },
    });
  };

  const handleClear = () => {
    setQuery('');
    clear();
  };

  return (
    <TouchableWithoutFeedback
      onPress={Keyboard.dismiss}
      accessible={false} // prevents VoiceOver treating the whole screen as one element
    >
      <View className="flex-1 bg-white">
        <SafeAreaView className="flex-1 bg-white" edges={['top']}>
          <View className="px-4 pb-3 pt-2">
            <Text className="text-2xl font-bold">{t('addPlace.title')}</Text>
            {activeMapName ? (
              <Text className="mt-1 text-sm text-gray-500">
                {t('addPlace.savingTo', { mapName: activeMapName })}
              </Text>
            ) : null}
          </View>

          {isMemberOnly && (
            <View className="mx-4 mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <Text className="text-sm text-amber-800">
                {t('addPlace.viewerCannotEdit')}
              </Text>
            </View>
          )}

          <View className="mx-4 mb-3 flex-row items-center rounded-xl bg-gray-100 px-4">
            <TextInput
              className="flex-1 py-3 text-base"
              placeholder={t('addPlace.searchPlaceholder')}
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={handleChangeText}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={handleClear} hitSlop={8}>
                <Text className="text-base text-gray-400">✕</Text>
              </Pressable>
            )}
          </View>

          {isSearching && (
            <ActivityIndicator size="small" className="my-4" color="#6B7280" />
          )}

          {error && !isSearching && (
            <View className="mx-4 mt-2 rounded-xl bg-red-50 px-4 py-3">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          )}

          {!query && !isSearching && (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-center text-base text-gray-400">
                {t('addPlace.searchHint')}
              </Text>
            </View>
          )}

          {query.length > 0 && !isSearching && !error && predictions.length === 0 && (
            <View className="flex-1 items-center justify-center px-8">
              <Text className="text-center text-base text-gray-400">
                {t('addPlace.noResults')}
              </Text>
            </View>
          )}

          <FlatList
            data={predictions}
            keyExtractor={(item) => item.placeId}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            renderItem={({ item }) => (
              <Pressable
                className="mx-4 border-b border-gray-100 px-2 py-3 active:bg-gray-50"
                onPress={() => handleSelect(item)}
                disabled={isMemberOnly}
              >
                <Text className="text-base font-medium">{item.name}</Text>
                <Text className="mt-0.5 text-sm text-gray-500">
                  {item.address}
                </Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
}
