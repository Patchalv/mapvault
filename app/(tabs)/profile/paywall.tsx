import { useEffect } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { useProfile } from '@/hooks/use-profile';
import { track } from '@/lib/analytics';
import { LEGAL_URLS } from '@/lib/constants';

export default function PaywallScreen() {
  const { trigger } = useLocalSearchParams<{ trigger?: string }>();
  const { data: profile } = useProfile();
  const {
    offerings,
    isLoadingOfferings,
    purchaseAsync,
    isPurchasing,
    restore,
    isRestoring,
  } = useRevenueCat();

  const isPremium = profile?.entitlement === 'premium';

  useEffect(() => {
    const validTriggers = ['map_limit', 'place_limit', 'invite_limit', 'profile_tap', 'profile_cta'] as const;
    type PaywallTrigger = (typeof validTriggers)[number];
    const paywallTrigger: PaywallTrigger = validTriggers.includes(trigger as PaywallTrigger)
      ? (trigger as PaywallTrigger)
      : 'profile_tap';
    track('paywall_viewed', { trigger: paywallTrigger });
  }, [trigger]);

  const annual = offerings?.current?.annual;
  const annualPrice = annual?.product.priceString ?? '€9.99';
  const selectedPackage = annual ?? undefined;

  const handlePurchase = async () => {
    if (!selectedPackage) return;

    track('purchase_started', {});
    try {
      await purchaseAsync(selectedPackage);
      track('purchase_completed', {});
      Alert.alert('Welcome to Premium!', 'You now have unlimited access.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      // RevenueCat throws with userCancelled flag
      if (
        err &&
        typeof err === 'object' &&
        'userCancelled' in err &&
        (err as { userCancelled: boolean }).userCancelled
      ) {
        track('purchase_failed', { reason: 'cancelled' });
        return;
      }
      track('purchase_failed', { reason: 'error' });
      const message =
        err instanceof Error ? err.message : 'Purchase failed. Please try again.';
      Alert.alert('Purchase Failed', message);
    }
  };

  const handleRestore = () => {
    restore(undefined, {
      onSuccess: (customerInfo) => {
        const hasActive = !!customerInfo.entitlements.active['premium'];
        if (hasActive) {
          Alert.alert('Restored!', 'Your premium access has been restored.', [
            { text: 'OK', onPress: () => router.back() },
          ]);
        } else {
          Alert.alert(
            'No Purchases Found',
            'We could not find any previous purchases to restore.',
          );
        }
      },
      onError: () => {
        Alert.alert('Error', 'Failed to restore purchases. Please try again.');
      },
    });
  };

  // Already premium — show confirmation
  if (isPremium) {
    return (
      <SafeAreaView className="flex-1 bg-white" edges={['top']}>
        <View className="flex-row items-center px-4 pb-2 pt-2">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <FontAwesome name="chevron-left" size={18} color="#3B82F6" />
          </Pressable>
          <Text className="ml-3 text-lg font-semibold">Premium</Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-4xl">✨</Text>
          <Text className="mt-4 text-xl font-bold text-gray-900">
            You&apos;re Premium!
          </Text>
          <Text className="mt-2 text-center text-base text-gray-500">
            You have unlimited access to all MapVault features.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center px-4 pb-2 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <FontAwesome name="chevron-left" size={18} color="#3B82F6" />
        </Pressable>
        <Text className="ml-3 text-lg font-semibold">Premium</Text>
      </View>

      <View className="flex-1 px-6 pt-6">
        {/* Hero */}
        <Text className="text-center text-2xl font-bold text-gray-900">
          Unlock MapVault Premium
        </Text>
        <Text className="mt-2 text-center text-base text-gray-500">
          Save more places, create unlimited maps, and share with friends.
        </Text>

        {/* Feature comparison */}
        <View className="mt-8 rounded-2xl bg-gray-50 p-5">
          <View className="mb-3 flex-row">
            <Text className="flex-1 text-sm font-medium text-gray-500">
              Feature
            </Text>
            <Text className="w-20 text-center text-sm font-medium text-gray-500">
              Free
            </Text>
            <Text className="w-20 text-center text-sm font-medium text-amber-600">
              Premium
            </Text>
          </View>

          <FeatureRow label="Maps" free="1" premium="Unlimited" />
          <FeatureRow label="Places" free="20" premium="Unlimited" />
          <FeatureRow label="Invite links" free="—" premium="✓" />
          <FeatureRow label="Manage roles" free="—" premium="✓" />
        </View>

        {/* Loading state */}
        {isLoadingOfferings ? (
          <ActivityIndicator size="large" className="mt-10" color="#3B82F6" />
        ) : (
          <>
            {/* Price display */}
            <View className="mt-8 items-center rounded-xl border-2 border-blue-500 bg-blue-50 p-5">
              <Text className="text-sm font-semibold text-blue-700">
                Yearly
              </Text>
              <Text className="mt-1 text-2xl font-bold text-blue-700">
                {annualPrice}/year
              </Text>
            </View>

            {/* Subscribe button */}
            <Pressable
              className={`mt-6 items-center rounded-xl py-4 ${
                isPurchasing ? 'bg-blue-400' : 'bg-blue-500 active:bg-blue-600'
              }`}
              onPress={handlePurchase}
              disabled={isPurchasing || !selectedPackage}
            >
              {isPurchasing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-base font-bold text-white">
                  Subscribe
                </Text>
              )}
            </Pressable>

            {/* Restore purchases */}
            <Pressable
              className="mt-4 items-center py-2"
              onPress={handleRestore}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <ActivityIndicator size="small" color="#6B7280" />
              ) : (
                <Text className="text-sm text-gray-500 underline">
                  Restore Purchases
                </Text>
              )}
            </Pressable>

            {/* Legal links (required by Apple for auto-renewable subscriptions) */}
            <Text className="mt-4 text-center text-xs leading-5 text-gray-400">
              By subscribing, you agree to our{' '}
              <Text
                className="text-xs text-gray-500 underline"
                onPress={() => Linking.openURL(LEGAL_URLS.terms)}
              >
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                className="text-xs text-gray-500 underline"
                onPress={() => Linking.openURL(LEGAL_URLS.privacy)}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function FeatureRow({
  label,
  free,
  premium,
}: {
  label: string;
  free: string;
  premium: string;
}) {
  return (
    <View className="flex-row border-t border-gray-200 py-3">
      <Text className="flex-1 text-sm text-gray-900">{label}</Text>
      <Text className="w-20 text-center text-sm text-gray-400">{free}</Text>
      <Text className="w-20 text-center text-sm font-semibold text-gray-900">
        {premium}
      </Text>
    </View>
  );
}
