import { useCallback } from 'react';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '@/lib/analytics';
import { APP_REVIEW } from '@/lib/constants';
import { FEATURE_FLAGS } from '@/lib/feature-flags';

type ReviewTrigger = 'place_visited' | 'places_saved_milestone' | 'directions_after_filter';

export function useAppReview() {
  const maybeRequestReview = useCallback(async (trigger: ReviewTrigger) => {
    try {
      if (!FEATURE_FLAGS.reviewPromptsEnabled) return;

      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) return;

      const lastRequest = await AsyncStorage.getItem(APP_REVIEW.storageKey);
      if (lastRequest) {
        const elapsed = Date.now() - parseInt(lastRequest, 10);
        if (!isNaN(elapsed) && elapsed < APP_REVIEW.cooldownMs) return;
      }

      await StoreReview.requestReview();
      await AsyncStorage.setItem(APP_REVIEW.storageKey, String(Date.now()));
      track('review_prompted', { trigger });

      if (__DEV__) {
        console.log(`[AppReview] Review requested (trigger: ${trigger})`);
      }
    } catch (error) {
      console.warn('[AppReview] Failed to request review:', error);
    }
  }, []);

  return { maybeRequestReview };
}
