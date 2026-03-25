import { ErrorState } from "@/components/error-state/error-state";
import { useTranslation } from "react-i18next";
import { LoadingState } from "@/components/loading-state/loading-state";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { supabase } from "@/lib/supabase";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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
  const queryClient = useQueryClient();
  const {
    data: profile,
    isLoading,
    isError,
    refetch,
  } = useProfile();

  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const { mutate: updateDisplayName, isPending: isSavingName } = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setShowEditNameModal(false);
    },
    onError: (err: Error) => {
      Alert.alert(t('common.error'), err.message);
    },
  });

  if (isLoading) {
    return <LoadingState message={t('profile.loadingProfile')} />;
  }

  if (isError) {
    return (
      <ErrorState
        message={t('profile.couldntLoadProfile')}
        onRetry={refetch}
      />
    );
  }

  const displayName = profile?.display_name ?? "User";
  const email = user?.email ?? "";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleEditName = () => {
    setEditNameValue(displayName);
    setShowEditNameModal(true);
  };

  const handleSaveName = () => {
    if (isSavingName || !editNameValue.trim()) return;
    updateDisplayName(editNameValue.trim());
  };

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 20,
          flexGrow: 1,
        }}
      >
        {/* User Info */}
        <View className="items-center pb-8">
          {/* Avatar */}
          {profile?.avatar_url ? (
            <View className="mb-4 h-24 w-24 overflow-hidden rounded-full">
              <Image
                source={{ uri: profile.avatar_url }}
                className="h-full w-full"
                resizeMode="cover"
                accessibilityLabel={`${displayName}'s avatar`}
              />
            </View>
          ) : (
            <View className="mb-4 h-24 w-24 items-center justify-center rounded-full bg-blue-500">
              <Text className="text-3xl font-bold text-white">{initials}</Text>
            </View>
          )}

          {/* Display Name with edit button */}
          <View className="flex-row items-center gap-2">
            <Text className="text-xl font-bold text-gray-900">{displayName}</Text>
            <Pressable onPress={handleEditName} hitSlop={8}>
              <FontAwesome name="pencil" size={14} color="#9CA3AF" />
            </Pressable>
          </View>

          <Text className="mt-1 text-sm text-gray-500">{email}</Text>
        </View>

        {/* Delete Account */}
        <View className="flex-1 justify-end">
          <Text
            className="text-center text-xs text-gray-400"
            onPress={() => router.push("/(tabs)/settings/delete-account")}
          >
            {t('profile.deleteAccount')}
          </Text>
        </View>
      </ScrollView>

      {/* Edit Display Name Modal */}
      <Modal
        visible={showEditNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEditNameModal(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/50"
          onPress={() => setShowEditNameModal(false)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View className="w-72 rounded-2xl bg-white p-6" onStartShouldSetResponder={() => true}>
              <Text className="mb-4 text-lg font-semibold text-gray-900">
                {t('profile.editDisplayNameTitle')}
              </Text>
              <TextInput
                autoFocus
                value={editNameValue}
                onChangeText={setEditNameValue}
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
                placeholder={t('profile.displayNamePlaceholder')}
                placeholderTextColor="#9CA3AF"
                className="mb-4 rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
              />
              <View className="flex-row justify-end gap-3">
                <Pressable onPress={() => setShowEditNameModal(false)}>
                  <Text className="text-base text-gray-500">{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={handleSaveName} disabled={isSavingName}>
                  <Text className="text-base font-semibold text-blue-500">
                    {isSavingName ? t('common.saving') : t('common.save')}
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
