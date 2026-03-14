import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

interface EmptyStateProps {
  variant: 'map' | 'list';
}

export function EmptyState({ variant }: EmptyStateProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const handleAddPlace = () => {
    router.push('/(tabs)/add');
  };

  if (variant === 'map') {
    return (
      <View
        pointerEvents="box-none"
        className="absolute inset-0 z-[5] items-center justify-center"
      >
        <View className="mx-8 items-center rounded-2xl bg-white/95 px-6 py-8 shadow-lg">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Text className="text-3xl">📍</Text>
          </View>
          <Text className="mb-2 text-center text-xl font-bold text-gray-900">
            {t('emptyState.title')}
          </Text>
          <Text className="mb-6 text-center text-sm leading-5 text-gray-500">
            {t('emptyState.subtitle')}
          </Text>
          <Pressable
            className="rounded-full bg-blue-500 px-6 py-3 active:bg-blue-600"
            onPress={handleAddPlace}
          >
            <Text className="text-base font-semibold text-white">
              {t('emptyState.addButton')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{ paddingTop: insets.top + 60, paddingBottom: insets.bottom + 16 }}
      className="flex-1 items-center justify-center bg-gray-100 px-8"
    >
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-blue-100">
        <Text className="text-3xl">📍</Text>
      </View>
      <Text className="mb-2 text-center text-xl font-bold text-gray-900">
        {t('emptyState.title')}
      </Text>
      <Text className="mb-6 text-center text-sm leading-5 text-gray-500">
        {t('emptyState.subtitle')}
      </Text>
      <Pressable
        className="rounded-full bg-blue-500 px-6 py-3 active:bg-blue-600"
        onPress={handleAddPlace}
      >
        <Text className="text-base font-semibold text-white">{t('emptyState.addButton')}</Text>
      </Pressable>
    </View>
  );
}
