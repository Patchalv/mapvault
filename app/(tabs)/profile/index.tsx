import { ErrorState } from "@/components/error-state/error-state";
import { useTranslation } from "react-i18next";
import { LoadingState } from "@/components/loading-state/loading-state";
import { useActiveMap } from "@/hooks/use-active-map";
import { useAuth } from "@/hooks/use-auth";
import { useCreateMap } from "@/hooks/use-create-map";
import { useFreemiumGate } from "@/hooks/use-freemium-gate";
import { useMaps } from "@/hooks/use-maps";
import { useProfile } from "@/hooks/use-profile";
import { FREE_TIER, LEGAL_URLS } from "@/lib/constants";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { logOutUser } from "@/lib/revenuecat";
import { supabase } from "@/lib/supabase";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import * as StoreReview from "expo-store-review";
import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    data: profile,
    isLoading: isLoadingProfile,
    isError: isErrorProfile,
    refetch: refetchProfile,
  } = useProfile();
  const {
    data: mapMembers,
    isLoading: isLoadingMaps,
    isError: isErrorMaps,
    refetch: refetchMaps,
  } = useMaps();
  const { activeMapId } = useActiveMap();
  const { mutate: createMap, isPending: isCreating } = useCreateMap();
  const { handleMutationError } = useFreemiumGate();
  const shouldShowReviewPrompt = FEATURE_FLAGS.reviewPromptsEnabled;

  const [showNewMapModal, setShowNewMapModal] = useState(false);
  const [newMapName, setNewMapName] = useState('');

  const [hasStoreAction, setHasStoreAction] = useState(false);
  useEffect(() => {
    StoreReview.hasAction()
      .then(setHasStoreAction)
      .catch(() => {});
  }, []);

  const isLoading = isLoadingProfile || isLoadingMaps;
  const isError = isErrorProfile || isErrorMaps;

  if (isLoading) {
    return <LoadingState message={t('profile.loadingProfile')} />;
  }

  if (isError) {
    return (
      <ErrorState
        message={t('profile.couldntLoadProfile')}
        onRetry={() => {
          refetchProfile();
          refetchMaps();
        }}
      />
    );
  }

  const maps = mapMembers ?? [];
  const ownedMapCount = maps.filter((m) => m.role === "owner").length;
  const isFree = profile?.entitlement === "free";
  const displayName = profile?.display_name ?? "User";
  const email = user?.email ?? "";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    await logOutUser();
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert(t('common.error'), error.message);
    }
  };

  const handleNewMap = () => {
    if (isFree && ownedMapCount >= FREE_TIER.maxMaps) {
      Alert.alert(
        t('profile.mapLimitTitle'),
        t('profile.mapLimitMessage'),
        [
          { text: t('common.cancel'), style: "cancel" },
          {
            text: t('common.upgrade'),
            onPress: () =>
              router.push("/(tabs)/profile/paywall?trigger=map_limit"),
          },
        ],
      );
      return;
    }

    setNewMapName('');
    setShowNewMapModal(true);
  };

  const handleCreateMap = () => {
    if (!newMapName.trim()) return;
    setShowNewMapModal(false);
    createMap(
      { name: newMapName.trim() },
      {
        onSuccess: () => {
          router.navigate("/(tabs)/explore");
        },
        onError: (err) => {
          handleMutationError(err);
        },
      },
    );
  };

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 20,
      }}
    >
      {/* User Info */}
      <View className="items-center pb-6">
        {/* Avatar */}
        {profile?.avatar_url ? (
          <View className="mb-3 h-[72px] w-[72px] overflow-hidden rounded-full">
            <Image
              source={{ uri: profile.avatar_url }}
              className="h-full w-full"
              resizeMode="cover"
              accessibilityLabel={`${displayName}'s avatar`}
            />
          </View>
        ) : (
          <View className="mb-3 h-[72px] w-[72px] items-center justify-center rounded-full bg-blue-500">
            <Text className="text-2xl font-bold text-white">{initials}</Text>
          </View>
        )}

        <Text className="text-xl font-bold text-gray-900">{displayName}</Text>
        <Text className="mt-1 text-sm text-gray-500">{email}</Text>

        {/* Entitlement badge */}
        <Pressable
          onPress={
            isFree
              ? () => router.push("/(tabs)/profile/paywall?trigger=profile_tap")
              : undefined
          }
          className={`mt-2 rounded-full px-3 py-1 ${
            isFree ? "bg-gray-100" : "bg-amber-100"
          }`}
        >
          <Text
            className={`text-xs font-semibold uppercase ${
              isFree ? "text-gray-600" : "text-amber-700"
            }`}
          >
            {isFree ? t('profile.freeTier') : t('profile.premiumTier')}
          </Text>
        </Pressable>
      </View>

      {/* Divider */}
      <View className="mb-4 border-b border-gray-100" />

      {/* My Maps Section */}
      <View className="mb-6">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-base font-semibold text-gray-900">
            {t('profile.manageMaps')}
          </Text>
          <Pressable
            onPress={handleNewMap}
            disabled={isCreating}
            className="flex-row items-center rounded-lg bg-blue-500 px-3 py-1.5"
          >
            <FontAwesome name="plus" size={12} color="#FFFFFF" />
            <Text className="ml-1.5 text-sm font-semibold text-white">
              {t('profile.newMap')}
            </Text>
          </Pressable>
        </View>

        {maps.map((membership) => {
          const map = membership.maps;
          if (!map) return null;
          const isActive = activeMapId === map.id;
          return (
            <Pressable
              key={map.id}
              className="mb-2 flex-row items-center rounded-xl border border-gray-100 bg-white p-4"
              onPress={() => router.push(`/(tabs)/profile/map/${map.id}`)}
            >
              {/* Active dot */}
              <View
                className={`mr-3 h-2.5 w-2.5 rounded-full ${
                  isActive ? "bg-green-500" : "bg-transparent"
                }`}
              />

              {/* Map info */}
              <View className="flex-1">
                <Text className="text-base font-medium text-gray-900">
                  {map.name}
                </Text>
              </View>

              {/* Role badge */}
              <View
                className={`mr-3 rounded-full px-2 py-0.5 ${
                  membership.role === "owner"
                    ? "bg-blue-100"
                    : membership.role === "contributor"
                      ? "bg-green-100"
                      : "bg-gray-100"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    membership.role === "owner"
                      ? "text-blue-700"
                      : membership.role === "contributor"
                        ? "text-green-700"
                        : "text-gray-600"
                  }`}
                >
                  {membership.role === 'owner'
                    ? t('common.roles.owner')
                    : membership.role === 'contributor'
                      ? t('common.roles.contributor')
                      : t('common.roles.member')}
                </Text>
              </View>

              {/* Chevron */}
              <FontAwesome name="chevron-right" size={12} color="#9CA3AF" />
            </Pressable>
          );
        })}
      </View>

      {/* Premium Upgrade CTA */}
      {isFree && (
        <Pressable
          onPress={() =>
            router.push("/(tabs)/profile/paywall?trigger=profile_cta")
          }
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4"
        >
          <Text className="text-sm font-semibold text-amber-900">
            {t('profile.upgradeCTATitle')}
          </Text>
          <Text className="mt-1 text-xs text-amber-700">
            {t('profile.upgradeCTASubtitle')}
          </Text>
          <Text className="mt-2 text-xs font-semibold text-amber-600">
            {t('profile.learnMore')}
          </Text>
        </Pressable>
      )}

      {/* Rate MapVault */}
      {hasStoreAction && shouldShowReviewPrompt && (
        <Pressable
          onPress={() => {
            const url = StoreReview.storeUrl();
            if (url) Linking.openURL(url);
          }}
          className="mb-3 items-center rounded-xl border border-gray-200 bg-gray-50 py-3"
        >
          <Text className="text-base font-semibold text-gray-700">
            {t('profile.rateApp')}
          </Text>
        </Pressable>
      )}

      {/* Sign Out */}
      <Pressable
        onPress={handleSignOut}
        className="items-center rounded-xl border border-red-200 bg-red-50 py-3"
      >
        <Text className="text-base font-semibold text-red-600">{t('profile.signOut')}</Text>
      </Pressable>

      {/* Legal Links */}
      <View className="mt-4 flex-row justify-center">
        <Text
          className="text-xs text-gray-400"
          onPress={() => Linking.openURL(LEGAL_URLS.privacy)}
        >
          {t('profile.privacyPolicy')}
        </Text>
        <Text className="mx-2 text-xs text-gray-300">|</Text>
        <Text
          className="text-xs text-gray-400"
          onPress={() => Linking.openURL(LEGAL_URLS.terms)}
        >
          {t('profile.termsOfService')}
        </Text>
      </View>

      {/* Delete Account */}
      <Text
        className="mt-3 text-center text-xs text-gray-400"
        onPress={() => router.push("/(tabs)/profile/delete-account")}
      >
        {t('profile.deleteAccount')}
      </Text>
    </ScrollView>
      <Modal
        visible={showNewMapModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNewMapModal(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50"
          onPress={() => setShowNewMapModal(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View className="w-72 rounded-2xl bg-white p-6">
              <Text className="mb-1 text-lg font-semibold text-gray-900">
                {t('profile.newMapPromptTitle')}
              </Text>
              <Text className="mb-4 text-sm text-gray-500">
                {t('profile.newMapPromptMessage')}
              </Text>
              <TextInput
                autoFocus
                value={newMapName}
                onChangeText={setNewMapName}
                onSubmitEditing={handleCreateMap}
                returnKeyType="done"
                placeholder={t('profile.newMapPlaceholder')}
                className="mb-4 rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
              />
              <View className="flex-row justify-end gap-3">
                <Pressable onPress={() => setShowNewMapModal(false)}>
                  <Text className="text-base text-gray-500">{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={handleCreateMap} disabled={isCreating}>
                  <Text className="text-base font-semibold text-blue-500">
                    {t('profile.create')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
}
