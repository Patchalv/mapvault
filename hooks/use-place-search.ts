import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from '@/hooks/use-location';
import { searchPlaces, type PlacePrediction } from '@/lib/google-places';
import { track } from '@/lib/analytics';
import { PLACES_SEARCH } from '@/lib/constants';

export function usePlaceSearch() {
  const { t } = useTranslation();
  const { location } = useLocation();
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(
    (input: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setError(null);

      if (input.trim().length < PLACES_SEARCH.minQueryLength) {
        setPredictions([]);
        setIsSearching(false);
        return;
      }

      abortControllerRef.current?.abort();

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setIsSearching(true);

        try {
          const results = await searchPlaces(input, location, controller.signal);
          setPredictions(results);
          track('place_search_query', { query_length: input.length });
          setIsSearching(false);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          setPredictions([]);
          setError(t('addPlace.searchError'));
          setIsSearching(false);
        }
      }, PLACES_SEARCH.debounceMs);
    },
    [location]
  );

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    abortControllerRef.current?.abort();
    setPredictions([]);
    setIsSearching(false);
    setError(null);
  }, []);

  return { predictions, isSearching, error, search, clear };
}
