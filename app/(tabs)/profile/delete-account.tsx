import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useProfile } from '@/hooks/use-profile';
import { useDeleteAccount } from '@/hooks/use-delete-account';
import { logOutUser } from '@/lib/revenuecat';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const { mutate: deleteAccount, isPending } = useDeleteAccount();

  const consequences = [
    t('deleteAccount.consequence1'),
    t('deleteAccount.consequence2'),
    t('deleteAccount.consequence3'),
    t('deleteAccount.consequence4'),
    t('deleteAccount.consequence5'),
  ];

  const isPremium = profile?.entitlement === 'premium';

  const handleDelete = () => {
    Alert.alert(
      t('deleteAccount.confirmTitle'),
      t('deleteAccount.confirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteAccount(undefined, {
              onSuccess: async () => {
                await logOutUser();
                const { error } = await supabase.auth.signOut();
                if (error) {
                  await supabase.auth.signOut({ scope: 'local' });
                }
              },
              onError: (err) => {
                Alert.alert(
                  t('deleteAccount.deletionFailedTitle'),
                  err instanceof Error
                    ? err.message
                    : t('deleteAccount.deletionFailedFallback'),
                );
              },
            });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pb-2 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <FontAwesome name="chevron-left" size={18} color="#3B82F6" />
        </Pressable>
        <Text className="ml-3 text-lg font-semibold">{t('deleteAccount.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
      >
        {/* Title */}
        <Text className="mt-6 text-xl font-bold text-gray-900">
          {t('deleteAccount.heading')}
        </Text>
        <Text className="mt-2 text-base text-gray-500">
          {t('deleteAccount.subtitle')}
        </Text>

        {/* Consequences */}
        <Text className="mb-3 mt-6 text-sm font-semibold text-gray-900">
          {t('deleteAccount.whatWillHappen')}
        </Text>
        <View className="rounded-2xl bg-gray-50 p-4">
          {consequences.map((item) => (
            <View key={item} className="mb-2 flex-row">
              <Text className="mr-2 text-sm text-gray-400">{'\u2022'}</Text>
              <Text className="flex-1 text-sm leading-5 text-gray-600">
                {item}
              </Text>
            </View>
          ))}
        </View>

        {/* Subscription warning (premium only) */}
        {isPremium && (
          <View className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <Text className="text-sm font-semibold text-amber-800">
              {t('deleteAccount.activeSubscriptionTitle')}
            </Text>
            <Text className="mt-1 text-sm leading-5 text-amber-700">
              {t('deleteAccount.activeSubscriptionMessage')}
            </Text>
            <Pressable
              className="mt-3"
              onPress={() =>
                Linking.openURL(
                  'https://apps.apple.com/account/subscriptions',
                )
              }
            >
              <Text className="text-sm font-semibold text-amber-800 underline">
                {t('deleteAccount.openSubscriptionSettings')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Delete button */}
        <Pressable
          className={`mt-8 items-center rounded-xl py-4 ${
            isPending ? 'bg-red-400' : 'bg-red-600 active:bg-red-700'
          }`}
          onPress={handleDelete}
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-base font-bold text-white">
              {t('deleteAccount.deleteButton')}
            </Text>
          )}
        </Pressable>

        {/* Cancel link */}
        <Pressable className="mt-4 items-center py-2" onPress={() => router.back()}>
          <Text className="text-sm text-gray-500">{t('common.cancel')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
