import type { MapPlaceWithDetails, Place, Tag } from '@/types';

/**
 * Fixture builders for the join shapes the app reads back from Supabase.
 * Every field has a default so a test only has to state what it cares about.
 */

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: nextId('place'),
    name: 'Bar Nou',
    address: 'Carrer de Sant Pere 12, Barcelona',
    latitude: 41.3874,
    longitude: 2.1686,
    google_place_id: nextId('gplace'),
    google_category: 'bar',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: nextId('tag'),
    map_id: 'map-1',
    name: 'Bar',
    emoji: '🍸',
    color: '#3B82F6',
    position: 0,
    default_key: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

interface MapPlaceOverrides {
  id?: string;
  note?: string | null;
  map_id?: string;
  places?: Partial<Place>;
  tags?: Tag[];
  visited?: boolean | null;
}

export function makeMapPlace({
  id,
  note = null,
  map_id = 'map-1',
  places = {},
  tags = [],
  visited = null,
}: MapPlaceOverrides = {}): MapPlaceWithDetails {
  const place = makePlace(places);
  return {
    id: id ?? nextId('map-place'),
    note,
    created_at: '2026-01-01T00:00:00.000Z',
    added_by: 'user-1',
    map_id,
    place_id: place.id,
    places: place,
    map_place_tags: tags.map((tag) => ({ tag_id: tag.id, tags: tag })),
    place_visits: visited === null ? [] : [{ visited }],
  };
}
