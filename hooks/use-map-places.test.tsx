import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useMapPlaces } from '@/hooks/use-map-places';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { makeMapPlace } from '@/test-utils/fixtures';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: jest.fn() }));

const mockFrom = supabase.from as unknown as jest.Mock;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

interface QueryResult {
  data: unknown;
  error: unknown;
}

interface StubBuilder {
  select: jest.Mock;
  eq: jest.Mock;
  then: (onFulfilled: (value: QueryResult) => unknown) => Promise<unknown>;
}

/** Minimal stand-in for the PostgREST builder: chainable, and awaitable. */
function stubQuery(result: QueryResult): StubBuilder {
  const builder: StubBuilder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    then: (onFulfilled) => Promise.resolve(result).then(onFulfilled),
  };
  return builder;
}

function signedIn(userId: string | null) {
  mockUseAuth.mockReturnValue({
    user: userId ? { id: userId } : null,
    session: null,
    isLoading: false,
    isAuthenticated: !!userId,
  } as unknown as ReturnType<typeof useAuth>);
}

const clients: QueryClient[] = [];

function makeClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  return client;
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  signedIn('user-1');
});

// Query caches keep a GC timer alive; clearing them lets the Jest worker exit.
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

describe('useMapPlaces', () => {
  it('loads the places for a map', async () => {
    const places = [makeMapPlace({ id: 'map-place-1' })];
    mockFrom.mockReturnValue(stubQuery({ data: places, error: null }));

    const { result } = renderHook(() => useMapPlaces('map-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(places);
    expect(mockFrom).toHaveBeenCalledWith('map_places');
  });

  it('scopes the query to the map and the signed-in user visits', async () => {
    const builder = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(builder);

    const { result } = renderHook(() => useMapPlaces('map-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(builder.eq).toHaveBeenCalledWith('map_id', 'map-1');
    expect(builder.eq).toHaveBeenCalledWith('place_visits.user_id', 'user-1');
  });

  it('surfaces a Supabase error instead of returning empty data', async () => {
    mockFrom.mockReturnValue(
      stubQuery({ data: null, error: new Error('permission denied for table map_places') }),
    );

    const { result } = renderHook(() => useMapPlaces('map-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('permission denied for table map_places');
  });

  it('does not query without a map id', () => {
    mockFrom.mockReturnValue(stubQuery({ data: [], error: null }));

    const { result } = renderHook(() => useMapPlaces(null), { wrapper });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('does not query while signed out', () => {
    signedIn(null);
    mockFrom.mockReturnValue(stubQuery({ data: [], error: null }));

    const { result } = renderHook(() => useMapPlaces('map-1'), { wrapper });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('keys the cache per map so switching maps does not reuse places', () => {
    const queryClient = makeClient();
    const sharedWrapper = makeWrapper(queryClient);
    queryClient.setQueryData(['map-places', 'map-1'], [makeMapPlace({ id: 'from-map-1' })]);
    mockFrom.mockReturnValue(stubQuery({ data: [], error: null }));

    const { result } = renderHook(() => useMapPlaces('map-2'), { wrapper: sharedWrapper });

    expect(result.current.data).toBeUndefined();
  });
});
