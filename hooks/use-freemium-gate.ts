import { Alert } from 'react-native';
import { router } from 'expo-router';
import { EdgeFunctionError } from '@/lib/edge-function-error';
import { ERROR_CODES } from '@/lib/constants';

type PaywallTrigger = 'place_limit' | 'invite_limit';

export function useFreemiumGate() {
  /** Returns true if the error was a freemium limit error (and was handled). */
  function handleMutationError(
    error: Error,
    trigger: PaywallTrigger = 'place_limit',
  ): boolean {
    if (
      error instanceof EdgeFunctionError &&
      error.code === ERROR_CODES.freemiumLimitExceeded
    ) {
      Alert.alert(
        'Upgrade Required',
        error.message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View Plans',
            onPress: () => router.push(`/(tabs)/settings/paywall?trigger=${trigger}`),
          },
        ],
      );
      return true;
    }

    Alert.alert('Error', error.message);
    return false;
  }

  return { handleMutationError };
}
