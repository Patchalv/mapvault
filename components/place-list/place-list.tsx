import { FlatList, RefreshControl, View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { PlaceCard } from '@/components/place-card/place-card';
import type { MapPlaceWithDetails } from '@/types';

interface PlaceListProps {
  places: MapPlaceWithDetails[];
  onPlacePress: (mapPlaceId: string) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function PlaceList({
  places,
  onPlacePress,
  isRefreshing,
  onRefresh,
}: PlaceListProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <FlatList
      data={places}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: insets.top + 60,
        paddingBottom: insets.bottom + 16,
      }}
      renderItem={({ item }) => (
        <PlaceCard
          place={item}
          onPress={() => onPlacePress(item.id)}
        />
      )}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center pt-20">
          <Text className="text-base text-gray-400">{t('placeList.noPlacesFound')}</Text>
        </View>
      }
    />
  );
}
