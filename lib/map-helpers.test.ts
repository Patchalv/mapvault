import { placesToGeoJSON } from '@/lib/map-helpers';
import { makeMapPlace, makeTag } from '@/test-utils/fixtures';

describe('placesToGeoJSON', () => {
  it('returns an empty feature collection for no places', () => {
    expect(placesToGeoJSON([])).toEqual({
      type: 'FeatureCollection',
      features: [],
    });
  });

  it('emits coordinates in GeoJSON [longitude, latitude] order', () => {
    const place = makeMapPlace({
      places: { latitude: 41.3874, longitude: 2.1686 },
    });

    const [feature] = placesToGeoJSON([place]).features;

    expect(feature.geometry.coordinates).toEqual([2.1686, 41.3874]);
  });

  it('takes the marker emoji and color from the first tag', () => {
    const first = makeTag({ emoji: '🍸', color: '#3B82F6' });
    const second = makeTag({ emoji: '🍕', color: '#EF4444' });
    const place = makeMapPlace({ tags: [first, second] });

    const [feature] = placesToGeoJSON([place]).features;

    expect(feature.properties.emoji).toBe('🍸');
    expect(feature.properties.color).toBe('#3B82F6');
  });

  it('falls back to null emoji and color for an untagged place', () => {
    const [feature] = placesToGeoJSON([makeMapPlace({ tags: [] })]).features;

    expect(feature.properties.emoji).toBeNull();
    expect(feature.properties.color).toBeNull();
  });

  it('carries the map_place id and place name into feature properties', () => {
    const place = makeMapPlace({
      id: 'map-place-42',
      places: { name: 'Quimet & Quimet' },
    });

    const [feature] = placesToGeoJSON([place]).features;

    expect(feature.properties.id).toBe('map-place-42');
    expect(feature.properties.name).toBe('Quimet & Quimet');
  });

  it('preserves input order across many places', () => {
    const places = [
      makeMapPlace({ id: 'a' }),
      makeMapPlace({ id: 'b' }),
      makeMapPlace({ id: 'c' }),
    ];

    const ids = placesToGeoJSON(places).features.map((f) => f.properties.id);

    expect(ids).toEqual(['a', 'b', 'c']);
  });
});
