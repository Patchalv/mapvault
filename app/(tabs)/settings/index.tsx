import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, Platform, Linking } from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/hooks/use-profile';
import { useActiveMap } from '@/hooks/use-active-map';
import { logOutUser } from '@/lib/revenuecat';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { LEGAL_URLS } from '@/lib/constants';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { MapSwitcherSheet } from '@/components/map-switcher-sheet/map-switcher-sheet';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: profile, isLoading: isLoadingProfile } = useProfile();
  const { activeMapName, isAllMaps } = useActiveMap();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    track('settings_viewed', {});
  }, []);

  const isPremium = profile?.entitlement === 'premium';
  const isFree = profile?.entitlement === 'free';
  const showRateReview = FEATURE_FLAGS.reviewPromptsEnabled;
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    await logOutUser();
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert(t('common.error'), error.message);
      setIsSigningOut(false);
      return;
    }
    queryClient.clear();
  }

  function handleMyMapPress() {
    track('settings_map_switcher_opened', {});
    bottomSheetRef.current?.present();
  }

  function handleUpgradeCTAPress() {
    track('settings_upgrade_cta_tapped', { entitlement: 'free' });
    router.push('/(tabs)/settings/paywall?trigger=settings_upgrade_cta');
  }

  function handleRateReview() {
    track('settings_rate_review_tapped', {});
    if (Platform.OS === 'ios') {
      Linking.openURL('https://apps.apple.com/app/id6759535400?action=write-review');
    } else {
      Linking.openURL('https://play.google.com/store/apps/details?id=com.patrickalvarez.mapvault&showAllReviews=true');
    }
  }

  function handleExternalLink(link: 'privacy' | 'terms' | 'help') {
    track('settings_external_link_tapped', { link });
    Linking.openURL(LEGAL_URLS[link]);
  }

  const activeMapDisplay = isAllMaps ? t('settings.rows.allMaps') : activeMapName;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="px-4 pb-3 pt-2">
        <Text className="text-2xl font-bold">{t('settings.title')}</Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      >
        {/* Section 0: Premium CTA (free users only, hidden while loading) */}
        {!isLoadingProfile && isFree && (
          <Pressable
            onPress={handleUpgradeCTAPress}
            className="mx-4 mt-6 rounded-2xl bg-indigo-600 p-4"
          >
            <Text className="text-base font-bold text-white">
              {t('settings.premiumCta.title')}
            </Text>
            <Text className="mt-0.5 text-sm text-indigo-100">
              {t('settings.premiumCta.subtitle')}
            </Text>
          </Pressable>
        )}

        {/* Section 1: Maps */}
        <View className="mx-4 mt-6">
          <Text className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('settings.sections.maps')}
          </Text>
          <View className="overflow-hidden rounded-2xl bg-white">
            {/* Manage Maps */}
            <Pressable
              onPress={() => router.push('/(tabs)/settings/maps')}
              className="flex-row items-center px-4 py-3.5"
            >
              <Ionicons name="layers-outline" size={20} color="#374151" />
              <Text className="ml-3 flex-1 text-base text-gray-800">
                {t('settings.rows.manageMaps')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </Pressable>
            <View className="mx-4 h-px bg-gray-100" />
            {/* My Map */}
            <Pressable onPress={handleMyMapPress} className="px-4 py-3.5">
              <View className="flex-row items-center">
                <Ionicons name="location-outline" size={20} color="#374151" />
                <View className="ml-3 flex-1">
                  <Text className="text-base text-gray-800">{t('settings.rows.myMap')}</Text>
                  <Text className="mt-0.5 text-xs text-gray-400">
                    {t('settings.rows.myMapDescription')}
                  </Text>
                </View>
                {activeMapDisplay ? (
                  <Text className="mr-1 text-sm text-gray-400">{activeMapDisplay}</Text>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Section 2: Account */}
        <View className="mx-4 mt-6">
          <Text className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('settings.sections.account')}
          </Text>
          <View className="overflow-hidden rounded-2xl bg-white">
            {/* Profile */}
            <Pressable
              onPress={() => router.push('/(tabs)/settings/profile')}
              className="flex-row items-center px-4 py-3.5"
            >
              <Ionicons name="person-outline" size={20} color="#374151" />
              <Text className="ml-3 flex-1 text-base text-gray-800">
                {t('settings.rows.profile')}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </Pressable>
            <View className="mx-4 h-px bg-gray-100" />
            {/* Membership (no-op placeholder) */}
            <View className="flex-row items-center px-4 py-3.5 opacity-40">
              <Ionicons name="diamond-outline" size={20} color="#374151" />
              <Text className="ml-3 flex-1 text-base text-gray-700">
                {t('settings.rows.membership')}
              </Text>
              {isPremium && (
                <View className="mr-2 rounded-full bg-amber-100 px-2 py-0.5">
                  <Text className="text-xs font-bold text-amber-700">{t('settings.rows.premiumBadge')}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
            </View>
          </View>
        </View>

        {/* Section 3: More */}
        <View className="mx-4 mt-6">
          <Text className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {t('settings.sections.more')}
          </Text>
          <View className="overflow-hidden rounded-2xl bg-white">
            {showRateReview && (
              <>
                <Pressable
                  onPress={handleRateReview}
                  className="flex-row items-center px-4 py-3.5"
                >
                  <Ionicons name="star-outline" size={20} color="#374151" />
                  <Text className="ml-3 flex-1 text-base text-gray-800">
                    {t('settings.rows.rateReview')}
                  </Text>
                </Pressable>
                <View className="mx-4 h-px bg-gray-100" />
              </>
            )}
            <Pressable
              onPress={() => handleExternalLink('privacy')}
              className="flex-row items-center px-4 py-3.5"
            >
              <Ionicons name="shield-checkmark-outline" size={20} color="#374151" />
              <Text className="ml-3 flex-1 text-base text-gray-800">
                {t('settings.rows.privacyPolicy')}
              </Text>
            </Pressable>
            <View className="mx-4 h-px bg-gray-100" />
            <Pressable
              onPress={() => handleExternalLink('terms')}
              className="flex-row items-center px-4 py-3.5"
            >
              <Ionicons name="document-text-outline" size={20} color="#374151" />
              <Text className="ml-3 flex-1 text-base text-gray-800">
                {t('settings.rows.termsOfService')}
              </Text>
            </Pressable>
            <View className="mx-4 h-px bg-gray-100" />
            <Pressable
              onPress={() => handleExternalLink('help')}
              className="flex-row items-center px-4 py-3.5"
            >
              <Ionicons name="help-circle-outline" size={20} color="#374151" />
              <Text className="ml-3 flex-1 text-base text-gray-800">
                {t('settings.rows.help')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Footer: Sign Out */}
        <Pressable onPress={handleSignOut} disabled={isSigningOut} className="mb-10 mt-8 items-center py-2">
          <Text className="text-base text-gray-400">{t('settings.rows.signOut')}</Text>
        </Pressable>
      </ScrollView>

      <MapSwitcherSheet ref={bottomSheetRef} />
    </SafeAreaView>
  );
}
