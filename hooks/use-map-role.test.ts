import { renderHook } from '@testing-library/react-native';
import { useMapRole } from '@/hooks/use-map-role';
import { useMaps } from '@/hooks/use-maps';

jest.mock('@/hooks/use-maps', () => ({ useMaps: jest.fn() }));

const mockUseMaps = useMaps as jest.MockedFunction<typeof useMaps>;

function withMemberships(
  memberships: Array<{ map_id: string; role: string }> | undefined,
  isLoading = false,
) {
  mockUseMaps.mockReturnValue({
    data: memberships,
    isLoading,
  } as unknown as ReturnType<typeof useMaps>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useMapRole', () => {
  it('reports the owner role and edit permission', () => {
    withMemberships([{ map_id: 'map-1', role: 'owner' }]);

    const { result } = renderHook(() => useMapRole('map-1'));

    expect(result.current.role).toBe('owner');
    expect(result.current.isOwner).toBe(true);
    expect(result.current.canEdit).toBe(true);
  });

  it('grants a contributor edit permission without ownership', () => {
    withMemberships([{ map_id: 'map-1', role: 'contributor' }]);

    const { result } = renderHook(() => useMapRole('map-1'));

    expect(result.current.isContributor).toBe(true);
    expect(result.current.isOwner).toBe(false);
    expect(result.current.canEdit).toBe(true);
  });

  it('denies a member edit permission', () => {
    withMemberships([{ map_id: 'map-1', role: 'member' }]);

    const { result } = renderHook(() => useMapRole('map-1'));

    expect(result.current.isMember).toBe(true);
    expect(result.current.canEdit).toBe(false);
  });

  it('picks the membership matching the requested map', () => {
    withMemberships([
      { map_id: 'map-1', role: 'owner' },
      { map_id: 'map-2', role: 'member' },
    ]);

    const { result } = renderHook(() => useMapRole('map-2'));

    expect(result.current.role).toBe('member');
    expect(result.current.canEdit).toBe(false);
  });

  it('returns no role for a map the user does not belong to', () => {
    withMemberships([{ map_id: 'map-1', role: 'owner' }]);

    const { result } = renderHook(() => useMapRole('map-999'));

    expect(result.current.role).toBeNull();
    expect(result.current.canEdit).toBe(false);
  });

  it('returns no role for a null map id', () => {
    withMemberships([{ map_id: 'map-1', role: 'owner' }]);

    const { result } = renderHook(() => useMapRole(null));

    expect(result.current.role).toBeNull();
  });

  it('denies edit permission while memberships are still loading', () => {
    withMemberships(undefined, true);

    const { result } = renderHook(() => useMapRole('map-1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.role).toBeNull();
    expect(result.current.canEdit).toBe(false);
  });
});
