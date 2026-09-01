import { renderHook } from '@testing-library/react-native';
import { useFilteredPlaces } from '@/hooks/use-filtered-places';
import { makeMapPlace, makeTag } from '@/test-utils/fixtures';
import type { VisitedFilter } from '@/types';

const bar = makeTag({ id: 'tag-bar', name: 'Bar' });
const food = makeTag({ id: 'tag-food', name: 'Food' });

const barVisited = makeMapPlace({
  id: 'bar-visited',
  places: { name: 'Bar Nou' },
  tags: [bar],
  visited: true,
});
const foodUnvisited = makeMapPlace({
  id: 'food-unvisited',
  places: { name: 'Quimet & Quimet' },
  note: 'ask for the salmon montadito',
  tags: [food],
  visited: false,
});
const untaggedNoVisitRow = makeMapPlace({
  id: 'untagged',
  places: { name: 'Parc de la Ciutadella' },
  tags: [],
  visited: null,
});

const ALL = [barVisited, foodUnvisited, untaggedNoVisitRow];

function filter(params: {
  places?: typeof ALL | undefined;
  selectedTagIds?: string[];
  visitedFilter?: VisitedFilter;
  searchQuery?: string;
}) {
  const { result } = renderHook(() =>
    useFilteredPlaces({
      places: 'places' in params ? params.places : ALL,
      selectedTagIds: params.selectedTagIds ?? [],
      visitedFilter: params.visitedFilter ?? 'all',
      searchQuery: params.searchQuery ?? '',
    }),
  );
  return result.current.map((p) => p.id);
}

describe('useFilteredPlaces', () => {
  it('returns an empty list while places are still loading', () => {
    expect(filter({ places: undefined })).toEqual([]);
  });

  it('returns everything with no filters applied', () => {
    expect(filter({})).toEqual(['bar-visited', 'food-unvisited', 'untagged']);
  });

  it('keeps places carrying any selected tag, not only all of them', () => {
    expect(filter({ selectedTagIds: ['tag-bar', 'tag-food'] })).toEqual([
      'bar-visited',
      'food-unvisited',
    ]);
  });

  it('drops untagged places when a tag filter is active', () => {
    expect(filter({ selectedTagIds: ['tag-bar'] })).toEqual(['bar-visited']);
  });

  it('filters to visited places', () => {
    expect(filter({ visitedFilter: 'visited' })).toEqual(['bar-visited']);
  });

  it('treats a missing place_visits row as not visited', () => {
    expect(filter({ visitedFilter: 'not_visited' })).toEqual([
      'food-unvisited',
      'untagged',
    ]);
  });

  it('matches the search query against the place name, case-insensitively', () => {
    expect(filter({ searchQuery: 'bar nou' })).toEqual(['bar-visited']);
  });

  it('matches the search query against the note', () => {
    expect(filter({ searchQuery: 'montadito' })).toEqual(['food-unvisited']);
  });

  it('ignores a whitespace-only search query', () => {
    expect(filter({ searchQuery: '   ' })).toEqual([
      'bar-visited',
      'food-unvisited',
      'untagged',
    ]);
  });

  it('composes tag, visited and search filters', () => {
    expect(
      filter({
        selectedTagIds: ['tag-bar', 'tag-food'],
        visitedFilter: 'not_visited',
        searchQuery: 'quimet',
      }),
    ).toEqual(['food-unvisited']);
  });

  it('returns an empty list when the filters exclude everything', () => {
    expect(filter({ selectedTagIds: ['tag-bar'], visitedFilter: 'not_visited' })).toEqual([]);
  });

  it('returns a stable reference while the inputs are unchanged', () => {
    const { result, rerender } = renderHook(
      (props: { searchQuery: string }) =>
        useFilteredPlaces({
          places: ALL,
          selectedTagIds: [],
          visitedFilter: 'all',
          searchQuery: props.searchQuery,
        }),
      { initialProps: { searchQuery: '' } },
    );
    const first = result.current;

    rerender({ searchQuery: '' });

    expect(result.current).toBe(first);
  });
});
