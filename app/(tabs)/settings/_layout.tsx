import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <Stack initialRouteName="index" screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="profile"
        options={{ headerShown: true, title: t('settings.rows.profile') }}
      />
    </Stack>
  );
}
