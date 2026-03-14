import { signInWithApple, signInWithGoogle } from "@/lib/auth";
import { track } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import AntDesign from "@expo/vector-icons/AntDesign";
import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { Alert, Image, Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

async function trackIfNewUser(method: 'apple' | 'google') {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const createdAt = new Date(data.user.created_at).getTime();
  if (Date.now() - createdAt < 30_000) {
    track('signup_completed', { method });
  }
}

export default function SignInScreen() {
  const { t } = useTranslation();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
    }
  }, []);
  const handleAppleSignIn = async () => {
    try {
      const result = await signInWithApple();
      if (!result.success) {
        Alert.alert(t('signIn.signInError'), result.error);
      } else {
        trackIfNewUser('apple');
      }
    } catch (e: unknown) {
      const error = e as { code?: string };
      if (error.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert(t('common.error'), t('signIn.unexpectedError'));
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        Alert.alert(t('signIn.signInError'), result.error);
      } else {
        trackIfNewUser('google');
      }
    } catch {
      Alert.alert(t('common.error'), t('signIn.unexpectedError'));
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-cream px-8">
      <Image
        source={require("@/assets/images/splash-icon.png")}
        className="mb-4 h-32 w-32"
      />
      <Text className="mb-2 text-4xl font-bold">MapVault</Text>
      <Text className="mb-12 text-base text-gray-500">
        {t('signIn.tagline')}
      </Text>

      <View className="w-full gap-4">
        {appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={12}
            style={{ width: "100%", height: 52 }}
            onPress={handleAppleSignIn}
          />
        )}

        <Pressable
          onPress={handleGoogleSignIn}
          className="h-[52px] w-full flex-row items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white"
        >
          <AntDesign name="google" size={24} color="#4285F4" />
          <Text className="text-xl font-medium text-gray-800">
            {t('signIn.continueWithGoogle')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
