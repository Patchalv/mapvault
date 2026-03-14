import { Link, Stack } from 'expo-router';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.stackTitle') }} />
      <View className="flex-1 items-center justify-center p-5">
        <Text className="text-xl font-bold">{t('notFound.message')}</Text>
        <Link href="/(tabs)/explore" className="mt-4 py-4">
          <Text className="text-sm text-blue-500">{t('notFound.goHome')}</Text>
        </Link>
      </View>
    </>
  );
}
