import { Platform } from 'react-native';
import * as Application from 'expo-application';

import { PLACES_SEARCH } from '@/lib/constants';

const API_KEY =
  Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_IOS!
    : process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_ANDROID!;

function getPlatformHeaders(): Record<string, string> {
  if (Platform.OS === 'ios' && Application.applicationId) {
    return { 'X-Ios-Bundle-Identifier': Application.applicationId };
  }
  if (Platform.OS === 'android' && Application.applicationId) {
    return { 'X-Android-Package': Application.applicationId };
  }
  return {};
}

export interface PlacePrediction {
  placeId: string;
  name: string;
  address: string;
}

interface PlaceDetails {
  latitude: number;
  longitude: number;
  types: string[];
}

interface AutocompleteResponse {
  suggestions?: Array<{
    placePrediction?: {
      placeId: string;
      structuredFormat: {
        mainText: { text: string };
        secondaryText: { text: string };
      };
    };
  }>;
}

interface PlaceDetailsResponse {
  location: {
    latitude: number;
    longitude: number;
  };
  types?: string[];
}

export async function searchPlaces(
  input: string,
  location: { latitude: number; longitude: number } | null,
  signal?: AbortSignal
): Promise<PlacePrediction[]> {
  if (!input.trim()) return [];

  const body: Record<string, unknown> = { input };

  if (location) {
    body.locationBias = {
      circle: {
        center: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        radius: PLACES_SEARCH.locationBiasRadius,
      },
    };
  }

  const res = await fetch(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        ...getPlatformHeaders(),
      },
      body: JSON.stringify(body),
      signal,
    }
  );

  if (!res.ok) {
    throw new Error(`Places autocomplete failed: ${res.status}`);
  }

  const data: AutocompleteResponse = await res.json();

  return (
    data.suggestions
      ?.map((s) => {
        const p = s.placePrediction;
        if (!p) return null;
        return {
          placeId: p.placeId,
          name: p.structuredFormat.mainText.text,
          address: p.structuredFormat.secondaryText.text,
        };
      })
      .filter((p): p is PlacePrediction => p !== null) ?? []
  );
}

export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}`,
    {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'location,types',
        ...getPlatformHeaders(),
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Place details failed: ${res.status}`);
  }

  const data: PlaceDetailsResponse = await res.json();

  return {
    latitude: data.location.latitude,
    longitude: data.location.longitude,
    types: data.types ?? [],
  };
}
