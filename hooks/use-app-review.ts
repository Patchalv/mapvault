import { useCallback } from 'react';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from '@/lib/analytics';

/** Flip to true when ready to start prompting users for reviews */
const REVIEW_PROMPTS_ENABLED = false;

const LAST_REVIEW_KEY = 'mapvault_last_review_request';
const COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

type ReviewTrigger = 'place_visited' | 'places_saved_milestone' | 'directions_after_filter';

export function useAppReview() {
  const maybeRequestReview = useCallback(async (trigger: ReviewTrigger) => {
    try {
      if (!REVIEW_PROMPTS_ENABLED) return;

      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) return;

      const lastRequest = await AsyncStorage.getItem(LAST_REVIEW_KEY);
      if (lastRequest) {
        const elapsed = Date.now() - parseInt(lastRequest, 10);
        if (!isNaN(elapsed) && elapsed < COOLDOWN_MS) return;
      }

      await StoreReview.requestReview();
      await AsyncStorage.setItem(LAST_REVIEW_KEY, String(Date.now()));
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
