import { useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import Purchases from 'react-native-purchases';
import { router } from 'expo-router';
import { useProfile } from '@/hooks/use-profile';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { usePlaceCount } from '@/hooks/use-place-count';
import { track } from '@/lib/analytics';
import { FREE_TIER } from '@/lib/constants';
import { FeatureRow } from '@/components/feature-row/feature-row';

export default function MembershipScreen() {
  const { t } = useTranslation();
  const { data: profile } = useProfile();
  const { offerings, restore, isRestoring } = useRevenueCat();
  const { data: placeCount, isLoading: isLoadingCount } = usePlaceCount();

  const isPremium = profile?.entitlement === 'premium';
  const plan = isPremium ? ('premium' as const) : ('free' as const);

  useEffect(() => {
    track('membership_screen_viewed', { plan });
  }, [plan]);

  const priceString = offerings?.current?.annual?.product.priceString ?? null;

  const handleUpgradeTap = () => {
    track('membership_upgrade_tapped', { plan: 'free' });
    router.push('/(tabs)/settings/paywall?trigger=settings_upgrade_cta');
  };

  const handleRestoreTap = () => {
    track('membership_restore_tapped', { plan: 'free' });
    restore(undefined, {
      onSuccess: (customerInfo) => {
        const hasActive = !!customerInfo.entitlements.active['premium'];
        if (!hasActive) {
          Alert.alert(t('paywall.noPurchasesTitle'), t('paywall.noPurchasesMessage'));
        }
      },
      onError: () => {
        Alert.alert(t('common.error'), t('paywall.restoreErrorMessage'));
      },
    });
  };

  const handleManageSubscription = async () => {
    track('membership_manage_subscription_tapped', { plan: 'premium' });
    if (Platform.OS === 'ios') {
      await Purchases.showManageSubscriptions();
    } else {
      await Linking.openURL('https://play.google.com/store/account/subscriptions');
    }
  };

  const safeCount = isLoadingCount ? null : (placeCount ?? null);
  const barPercent = safeCount !== null ? (safeCount / FREE_TIER.maxPlaces) * 100 : 0;
  const isWarning = safeCount !== null && safeCount >= 15;

  if (isPremium) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Header Card */}
          <View className="mx-4 mt-6 items-center rounded-2xl bg-gray-900 p-6">
            <Ionicons name="location" size={40} color="#EF4444" />
            <Text className="mt-3 text-2xl font-bold text-white">
              {t('membership.youArePremium')}
            </Text>
          </View>

          {/* What's Included */}
          <View className="mx-4 mt-6">
            <Text className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('membership.whatsIncluded')}
            </Text>
            <View className="overflow-hidden rounded-2xl bg-white">
              <IncludedFeatureRow
                title={t('features.unlimitedPlaces')}
                subtitle={t('features.unlimitedPlacesSubtitle')}
              />
              <View className="mx-4 h-px bg-gray-100" />
              <IncludedFeatureRow
                title={t('features.shareMaps')}
                subtitle={t('features.shareMapsSubtitle')}
              />
              <View className="mx-4 h-px bg-gray-100" />
              <IncludedFeatureRow
                title={t('features.multipleMaps')}
                subtitle={t('features.multipleMapsSubtitle')}
              />
              <View className="mx-4 h-px bg-gray-100" />
              <IncludedFeatureRow
                title={t('features.tagsAndFilters')}
                subtitle={t('features.tagsAndFiltersSubtitle')}
              />
            </View>
          </View>

          {/* Subscription Management */}
          <View className="mx-4 mt-6">
            <Text className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {t('membership.subscription')}
            </Text>
            <View className="overflow-hidden rounded-2xl bg-white">
              <Pressable
                className="flex-row items-center px-4 py-3.5 active:bg-gray-50"
                onPress={handleManageSubscription}
              >
                <View className="flex-1">
                  <Text className="text-base text-gray-800">
                    {t('membership.manageSubscription')}
                  </Text>
                  <Text className="mt-0.5 text-xs text-gray-400">
                    {t('membership.manageSubscriptionHint')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header Card */}
        <View className="mx-4 mt-6 rounded-2xl bg-white p-5">
          <Text className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('membership.currentPlan')}
          </Text>
          <Text className="mt-1 text-3xl font-bold text-gray-900">
            {t('membership.free')}
          </Text>
          <View className="mt-4">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm text-gray-500">{t('membership.placesUsed')}</Text>
              <Text className="text-sm font-semibold text-gray-700">
                {safeCount !== null ? safeCount : '—'} / {FREE_TIER.maxPlaces}
              </Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full bg-gray-100">
              <View
                className={`h-full rounded-full ${isWarning ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${barPercent}%` }}
              />
            </View>
          </View>
        </View>

        {/* Upgrade CTA */}
        <Pressable
          className="mx-4 mt-4 items-center rounded-2xl bg-red-500 px-4 py-4 active:bg-red-600"
          onPress={handleUpgradeTap}
        >
          <Text className="text-base font-bold text-white">
            {t('membership.upgradeButton')}
          </Text>
          {priceString ? (
            <Text className="mt-0.5 text-sm text-red-100">{priceString}</Text>
          ) : null}
        </Pressable>

        {/* Compare Plans */}
        <View className="mx-4 mt-6">
          <Text className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('membership.comparePlans')}
          </Text>
          <View className="rounded-2xl bg-white p-4">
            <View className="mb-3 flex-row">
              <Text className="flex-1 text-sm font-medium text-gray-500">
                {t('paywall.featureCol')}
              </Text>
              <Text className="w-16 text-center text-sm font-medium text-gray-500">
                {t('paywall.freeCol')}
              </Text>
              <Text className="w-20 text-center text-sm font-medium text-red-500">
                {t('paywall.premiumCol')}
              </Text>
            </View>
            <FeatureRow
              label={t('features.places')}
              free="20"
              premium={t('paywall.unlimited')}
            />
            <FeatureRow label={t('features.shareMaps')} free="✗" premium="✓" />
            <FeatureRow label={t('features.multipleMaps')} free="✗" premium="✓" />
            <FeatureRow label={t('features.tagsAndFilters')} free="✓" premium="✓" />
          </View>
        </View>

        {/* Restore Purchases */}
        <Pressable
          className="mb-8 mt-6 items-center py-2"
          onPress={handleRestoreTap}
          disabled={isRestoring}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color="#6B7280" />
          ) : (
            <Text className="text-sm text-gray-400 underline">
              {t('membership.restorePurchases')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function IncludedFeatureRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View className="flex-row items-center px-4 py-3.5">
      <Ionicons name="checkmark-circle" size={20} color="#EF4444" />
      <View className="ml-3 flex-1">
        <Text className="text-sm font-semibold text-gray-900">{title}</Text>
        <Text className="mt-0.5 text-xs text-gray-500">{subtitle}</Text>
      </View>
    </View>
  );
}
