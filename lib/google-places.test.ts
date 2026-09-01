import { Platform } from 'react-native';
import { getPlaceDetails, searchPlaces } from '@/lib/google-places';

jest.mock('expo-application', () => ({ applicationId: 'com.patrickalvarez.mapvault' }));

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function suggestion(placeId: string, mainText: string, secondaryText: string) {
  return {
    placePrediction: {
      placeId,
      structuredFormat: {
        mainText: { text: mainText },
        secondaryText: { text: secondaryText },
      },
    },
  };
}

let mockFetch: jest.SpyInstance;

function lastRequest() {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return {
    url: url as string,
    init: init as RequestInit,
    body: init?.body ? JSON.parse(init.body as string) : undefined,
    headers: (init?.headers ?? {}) as Record<string, string>,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch = jest.spyOn(global, 'fetch');
  Platform.OS = 'ios';
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('searchPlaces', () => {
  it('does not call the API for an empty query', async () => {
    await expect(searchPlaces('', null)).resolves.toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not call the API for a whitespace-only query', async () => {
    await expect(searchPlaces('   ', null)).resolves.toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps suggestions to predictions', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        suggestions: [suggestion('place-1', 'Bar Nou', 'Carrer de Sant Pere 12')],
      }),
    );

    await expect(searchPlaces('bar nou', null)).resolves.toEqual([
      { placeId: 'place-1', name: 'Bar Nou', address: 'Carrer de Sant Pere 12' },
    ]);
    expect(lastRequest().url).toBe(AUTOCOMPLETE_URL);
  });

  it('skips suggestions that carry no placePrediction', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        suggestions: [{ queryPrediction: {} }, suggestion('place-1', 'Bar Nou', 'BCN')],
      }),
    );

    const results = await searchPlaces('bar', null);

    expect(results).toHaveLength(1);
    expect(results[0].placeId).toBe('place-1');
  });

  it('returns an empty list when the response carries no suggestions', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));

    await expect(searchPlaces('nothing here', null)).resolves.toEqual([]);
  });

  it('biases results to the user location when one is known', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ suggestions: [] }));

    await searchPlaces('bar', { latitude: 41.3874, longitude: 2.1686 });

    expect(lastRequest().body).toEqual({
      input: 'bar',
      locationBias: {
        circle: {
          center: { latitude: 41.3874, longitude: 2.1686 },
          radius: 10000,
        },
      },
    });
  });

  it('omits the location bias when no location is known', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ suggestions: [] }));

    await searchPlaces('bar', null);

    expect(lastRequest().body).toEqual({ input: 'bar' });
  });

  it('sends the API key and the iOS bundle header the key is restricted to', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ suggestions: [] }));

    await searchPlaces('bar', null);

    expect(lastRequest().headers['X-Goog-Api-Key']).toBe('test-ios-places-key');
    expect(lastRequest().headers['X-Ios-Bundle-Identifier']).toBe(
      'com.patrickalvarez.mapvault',
    );
  });

  it('forwards the abort signal so a superseded keystroke cancels', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ suggestions: [] }));
    const controller = new AbortController();

    await searchPlaces('bar', null, controller.signal);

    expect(lastRequest().init.signal).toBe(controller.signal);
  });

  it('throws with the status code on a failed response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 403));

    await expect(searchPlaces('bar', null)).rejects.toThrow(
      'Places autocomplete failed: 403',
    );
  });
});

describe('getPlaceDetails', () => {
  it('returns the coordinates and types for a place', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        location: { latitude: 41.3874, longitude: 2.1686 },
        types: ['bar', 'point_of_interest'],
      }),
    );

    await expect(getPlaceDetails('place-1')).resolves.toEqual({
      latitude: 41.3874,
      longitude: 2.1686,
      types: ['bar', 'point_of_interest'],
    });
    expect(lastRequest().url).toBe('https://places.googleapis.com/v1/places/place-1');
  });

  it('defaults types to an empty list when the response omits them', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ location: { latitude: 1, longitude: 2 } }),
    );

    await expect(getPlaceDetails('place-1')).resolves.toEqual({
      latitude: 1,
      longitude: 2,
      types: [],
    });
  });

  it('requests only the location and types fields', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ location: { latitude: 1, longitude: 2 } }),
    );

    await getPlaceDetails('place-1');

    expect(lastRequest().headers['X-Goog-FieldMask']).toBe('location,types');
  });

  it('throws with the status code on a failed response', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 404));

    await expect(getPlaceDetails('place-1')).rejects.toThrow('Place details failed: 404');
  });
});
