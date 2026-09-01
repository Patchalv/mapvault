import { EdgeFunctionError } from '@/lib/edge-function-error';
import { ERROR_CODES } from '@/lib/constants';

describe('EdgeFunctionError', () => {
  it('is an Error subclass so it survives a catch-and-rethrow', () => {
    const error = new EdgeFunctionError('Place limit reached');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(EdgeFunctionError);
    expect(error.name).toBe('EdgeFunctionError');
    expect(error.message).toBe('Place limit reached');
  });

  it('defaults code to null when the function returned no code', () => {
    expect(new EdgeFunctionError('boom').code).toBeNull();
  });

  it('carries the freemium limit code the paywall gate keys off', () => {
    const error = new EdgeFunctionError(
      'Free maps hold 20 places',
      ERROR_CODES.freemiumLimitExceeded,
    );

    expect(error.code).toBe('FREEMIUM_LIMIT_EXCEEDED');
  });
});
