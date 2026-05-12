import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import * as Sentry from '@sentry/react-native';
import { useAuth } from '@/hooks/use-auth';
import { track, updateUserProperties } from '@/lib/analytics';
import {
  configureRevenueCat,
  isRevenueCatReady,
  identifyUser,
  getOfferings,
  purchasePackage,
  restorePurchases,
  isPremium,
} from '@/lib/revenuecat';
import type { Profile } from '@/types';

export function useRevenueCat() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const lastIdentifiedIdRef = useRef<string | null>(null);
  const isIdentifyingRef = useRef(false);
  const [revenueCatReady, setRevenueCatReady] = useState(isRevenueCatReady());
  const [configAttempted, setConfigAttempted] = useState(isRevenueCatReady());

  // Configure SDK and identify user when authenticated
  useEffect(() => {
    if (!userId) {
      lastIdentifiedIdRef.current = null; // reset on sign-out so re-login works
      isIdentifyingRef.current = false;
      return;
    }

    configureRevenueCat();

    const ready = isRevenueCatReady();
    setRevenueCatReady(ready);
    setConfigAttempted(true);
    if (!ready) return;
    if (lastIdentifiedIdRef.current === userId) return; // already identified
    if (isIdentifyingRef.current) return; // logIn in flight

    let mounted = true;
    isIdentifyingRef.current = true;

    identifyUser(userId)
      .then(async () => {
        if (!mounted) return;
        lastIdentifiedIdRef.current = userId;
        // Sync entitlement to profile cache as client-side fallback
        try {
          const customerInfo = await Purchases.getCustomerInfo();
          if (!mounted) return;
          const premium = isPremium(customerInfo);
          updateUserProperties({ entitlement: premium ? 'premium' : 'free' });
          queryClient.setQueryData<Profile>(['profile'], (old) => {
            if (!old) return old;
            return { ...old, entitlement: premium ? 'premium' : 'free' };
          });
        } catch {
          // Non-critical — webhook will handle server-side sync
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes('already in progress')) return; // known Android race
        Sentry.captureException(error, { tags: { context: 'revenuecat_login' } });
      })
      .finally(() => {
        isIdentifyingRef.current = false;
      });

    return () => {
      mounted = false;
    };
  }, [userId, queryClient]);

  // Listen for real-time purchase events
  useEffect(() => {
    if (!revenueCatReady) return;

    const listener = (customerInfo: import('react-native-purchases').CustomerInfo) => {
      const premium = isPremium(customerInfo);
      updateUserProperties({ entitlement: premium ? 'premium' : 'free' });
      // Cancel in-flight refetches so they don't overwrite this update
      queryClient.cancelQueries({ queryKey: ['profile'] });
      queryClient.setQueryData<Profile>(['profile'], (old) => {
        if (!old) return old;
        return { ...old, entitlement: premium ? 'premium' : 'free' };
      });
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient, revenueCatReady]);

  const offerings = useQuery({
    queryKey: ['rc-offerings'],
    queryFn: getOfferings,
    staleTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
    enabled: !!userId && revenueCatReady,
  });

  // Capture offering failures once per resolved query (not per retry).
  // queryFn-level capture would multiply by retry count.
  const reportedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!offerings.isFetched) return;
    if (offerings.isError && offerings.error) {
      const key = `error:${offerings.errorUpdatedAt}`;
      if (reportedKeyRef.current === key) return;
      reportedKeyRef.current = key;
      Sentry.captureException(offerings.error, {
        tags: { context: 'rc_offerings', platform: Platform.OS },
        extra: { userId, revenueCatReady },
      });
      track('paywall_offerings_load_failed', { reason: 'error' });
      return;
    }
    const data = offerings.data;
    if (data && !data.current?.annual) {
      const key = `empty:${offerings.dataUpdatedAt}`;
      if (reportedKeyRef.current === key) return;
      reportedKeyRef.current = key;
      Sentry.captureMessage('rc_offerings_empty', {
        level: 'warning',
        tags: { context: 'rc_offerings', platform: Platform.OS },
        extra: {
          userId,
          revenueCatReady,
          hasCurrent: !!data.current,
          currentIdentifier: data.current?.identifier ?? null,
        },
      });
      track('paywall_offerings_load_failed', { reason: 'empty' });
    }
  }, [
    offerings.isFetched,
    offerings.isError,
    offerings.error,
    offerings.errorUpdatedAt,
    offerings.data,
    offerings.dataUpdatedAt,
    userId,
    revenueCatReady,
  ]);

  // PR #37's offerings-failure instrumentation only fires after the query has
  // attempted to fetch. The missing-API-key path early-returns inside
  // configureRevenueCat, so the query stays disabled, isFetched stays false,
  // and the user sees the error UI with zero telemetry. This effect closes
  // that gap — fires once per session when config was attempted but RC never
  // became ready. Skipped in dev because RC is intentionally disabled there
  // (.dev bundle ID, empty API keys) and would otherwise fire every session
  // and pollute the production PostHog signal.
  const notConfiguredReportedRef = useRef(false);
  useEffect(() => {
    if (__DEV__) return;
    if (!configAttempted || revenueCatReady) return;
    if (notConfiguredReportedRef.current) return;
    notConfiguredReportedRef.current = true;
    track('paywall_offerings_load_failed', { reason: 'not_configured' });
  }, [configAttempted, revenueCatReady]);

  // "Try again" needs to also re-attempt configuration: refetch() on a
  // disabled query (revenueCatReady=false) is a no-op, so without this the
  // user-actionable error UI would silently do nothing in the missing-API-key
  // / failed-init case — the same bug class this fix is closing.
  const refetchOfferings = offerings.refetch;
  const retryOfferings = useCallback(async () => {
    configureRevenueCat();
    const ready = isRevenueCatReady();
    setRevenueCatReady(ready);
    setConfigAttempted(true);
    if (!ready) return { ok: false } as const;
    await refetchOfferings();
    return { ok: true } as const;
  }, [refetchOfferings]);

  // True once we know whether offerings are available — either RC failed to
  // configure (so we'll never load them), or the query has completed at least
  // once. False during the initial config + first-fetch window so the paywall
  // can keep a spinner up instead of flashing the error UI.
  const isOfferingsResolved =
    configAttempted && (!revenueCatReady || offerings.isFetched);

  const purchase = useMutation({
    mutationFn: (pkg: PurchasesPackage) => purchasePackage(pkg),
    onSuccess: (customerInfo) => {
      const premium = isPremium(customerInfo);
      queryClient.cancelQueries({ queryKey: ['profile'] });
      queryClient.setQueryData<Profile>(['profile'], (old) => {
        if (!old) return old;
        return { ...old, entitlement: premium ? 'premium' : 'free' };
      });
      // Delayed invalidation — gives webhook time to update DB
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      }, 10_000);
    },
  });

  const restore = useMutation({
    mutationFn: restorePurchases,
    onSuccess: (customerInfo) => {
      const premium = isPremium(customerInfo);
      queryClient.cancelQueries({ queryKey: ['profile'] });
      queryClient.setQueryData<Profile>(['profile'], (old) => {
        if (!old) return old;
        return { ...old, entitlement: premium ? 'premium' : 'free' };
      });
      // Delayed invalidation — gives webhook time to update DB
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      }, 10_000);
    },
  });

  return {
    offerings: offerings.data,
    isOfferingsResolved,
    isFetchingOfferings: offerings.isFetching,
    retryOfferings,
    purchase: purchase.mutate,
    purchaseAsync: purchase.mutateAsync,
    isPurchasing: purchase.isPending,
    restore: restore.mutate,
    isRestoring: restore.isPending,
  };
}
