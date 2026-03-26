import { View, Text, Pressable } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { getTagDisplayName } from '@/lib/get-tag-display-name';
import type { MapPlaceWithDetails } from '@/types';

const DEFAULT_COLOR = '#6B7280';

interface PlaceCardProps {
  place: MapPlaceWithDetails;
  onPress: () => void;
}

export function PlaceCard({ place, onPress }: PlaceCardProps) {
  const firstTag = place.map_place_tags[0]?.tags;
  const color = firstTag?.color ?? DEFAULT_COLOR;
  const emoji = firstTag?.emoji ?? '📍';
  const isVisited = place.place_visits[0]?.visited ?? false;

  return (
    <Pressable
      onPress={onPress}
      className="mb-3 flex-row items-start rounded-2xl bg-white p-4"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      {/* Emoji Badge */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: `${color}20`,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
      </View>

      {/* Content */}
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className="flex-1 text-base font-semibold text-gray-900"
            numberOfLines={1}
          >
            {place.places.name}
          </Text>
          {isVisited && (
            <FontAwesome name="check-circle" size={16} color="#10B981" />
          )}
        </View>

        {place.places.address && (
          <Text className="mt-0.5 text-sm text-gray-500" numberOfLines={1}>
            {place.places.address}
          </Text>
        )}

        {/* Tag Chips */}
        {place.map_place_tags.length > 0 && (
          <View className="mt-2 flex-row flex-wrap gap-1.5">
            {place.map_place_tags.map((mpt) => (
              <View
                key={mpt.tag_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: `${mpt.tags.color ?? DEFAULT_COLOR}15`,
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                }}
              >
                {mpt.tags.emoji && (
                  <Text style={{ fontSize: 10, marginRight: 3 }}>
                    {mpt.tags.emoji}
                  </Text>
                )}
                <Text
                  style={{
                    fontSize: 12,
                    color: mpt.tags.color ?? DEFAULT_COLOR,
                    fontWeight: '500',
                  }}
                >
                  {getTagDisplayName(mpt.tags)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Note Preview */}
        {place.note && (
          <Text className="mt-1.5 text-sm text-gray-400" numberOfLines={1}>
            {place.note}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
