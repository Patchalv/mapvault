import { Alert } from 'react-native';
import { router } from 'expo-router';
import { renderHook } from '@testing-library/react-native';
import { useFreemiumGate } from '@/hooks/use-freemium-gate';
import { EdgeFunctionError } from '@/lib/edge-function-error';
import { ERROR_CODES } from '@/lib/constants';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

type AlertButton = { text: string; onPress?: () => void };

function alertButtons(): AlertButton[] {
  const call = (Alert.alert as jest.Mock).mock.calls[0];
  return (call[2] ?? []) as AlertButton[];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useFreemiumGate', () => {
  it('handles a freemium limit error and reports it as handled', () => {
    const { result } = renderHook(() => useFreemiumGate());

    const handled = result.current.handleMutationError(
      new EdgeFunctionError('Free maps hold 20 places', ERROR_CODES.freemiumLimitExceeded),
    );

    expect(handled).toBe(true);
    expect(Alert.alert).toHaveBeenCalledWith(
      'common.upgradeRequired',
      'Free maps hold 20 places',
      expect.any(Array),
    );
  });

  it('routes to the paywall with the default place_limit trigger', () => {
    const { result } = renderHook(() => useFreemiumGate());

    result.current.handleMutationError(
      new EdgeFunctionError('limit', ERROR_CODES.freemiumLimitExceeded),
    );
    alertButtons().find((b) => b.text === 'common.viewPlans')?.onPress?.();

    expect(router.push).toHaveBeenCalledWith('/(tabs)/settings/paywall?trigger=place_limit');
  });

  it('passes the invite_limit trigger through to the paywall route', () => {
    const { result } = renderHook(() => useFreemiumGate());

    result.current.handleMutationError(
      new EdgeFunctionError('limit', ERROR_CODES.freemiumLimitExceeded),
      'invite_limit',
    );
    alertButtons().find((b) => b.text === 'common.viewPlans')?.onPress?.();

    expect(router.push).toHaveBeenCalledWith('/(tabs)/settings/paywall?trigger=invite_limit');
  });

  it('offers a cancel button that navigates nowhere', () => {
    const { result } = renderHook(() => useFreemiumGate());

    result.current.handleMutationError(
      new EdgeFunctionError('limit', ERROR_CODES.freemiumLimitExceeded),
    );
    const cancel = alertButtons().find((b) => b.text === 'common.cancel');
    cancel?.onPress?.();

    expect(cancel?.onPress).toBeUndefined();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows a plain error and reports unhandled for a non-freemium EdgeFunctionError', () => {
    const { result } = renderHook(() => useFreemiumGate());

    const handled = result.current.handleMutationError(
      new EdgeFunctionError('Map not found', 'NOT_FOUND'),
    );

    expect(handled).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('common.error', 'Map not found');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('does not open the paywall for a plain Error carrying the limit code', () => {
    const { result } = renderHook(() => useFreemiumGate());
    const impostor = Object.assign(new Error('limit'), {
      code: ERROR_CODES.freemiumLimitExceeded,
    });

    const handled = result.current.handleMutationError(impostor);

    expect(handled).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('common.error', 'limit');
  });
});
