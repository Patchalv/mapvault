import { ActionSheetIOS, Linking, Platform } from 'react-native';

interface NavApp {
  name: string;
  scheme: string;
  buildUrl: (lat: number, lng: number, name: string) => string;
}

const IOS_NAV_APPS: NavApp[] = [
  {
    name: 'Apple Maps',
    scheme: 'maps://',
    buildUrl: (lat, lng) =>
      `http://maps.apple.com/?daddr=${lat},${lng}`,
  },
  {
    name: 'Google Maps',
    scheme: 'comgooglemaps://',
    buildUrl: (lat, lng) =>
      `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`,
  },
  {
    name: 'Waze',
    scheme: 'waze://',
    buildUrl: (lat, lng) =>
      `waze://?ll=${lat},${lng}&navigate=yes`,
  },
  {
    name: 'Citymapper',
    scheme: 'citymapper://',
    buildUrl: (lat, lng, name) =>
      `citymapper://directions?endcoord=${lat},${lng}&endname=${encodeURIComponent(name)}`,
  },
];

const GOOGLE_MAPS_WEB_URL = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export async function openDirections(
  latitude: number,
  longitude: number,
  name?: string
) {
  const placeName = name ?? '';

  if (Platform.OS === 'android') {
    const encodedName = encodeURIComponent(placeName);
    const geoUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedName})`;
    const canOpen = await Linking.canOpenURL(geoUrl);
    if (canOpen) {
      await Linking.openURL(geoUrl);
      return;
    }
    await Linking.openURL(GOOGLE_MAPS_WEB_URL(latitude, longitude));
    return;
  }

  // iOS: check which nav apps are installed
  const available: NavApp[] = [];
  for (const app of IOS_NAV_APPS) {
    const canOpen = await Linking.canOpenURL(app.scheme);
    if (canOpen) {
      available.push(app);
    }
  }

  if (available.length === 0) {
    await Linking.openURL(GOOGLE_MAPS_WEB_URL(latitude, longitude));
    return;
  }

  if (available.length === 1) {
    try {
      await Linking.openURL(available[0].buildUrl(latitude, longitude, placeName));
    } catch {
      await Linking.openURL(GOOGLE_MAPS_WEB_URL(latitude, longitude));
    }
    return;
  }

  // Multiple apps available — let user choose
  const options = [...available.map((app) => app.name), 'Cancel'];
  ActionSheetIOS.showActionSheetWithOptions(
    {
      options,
      cancelButtonIndex: options.length - 1,
      title: 'Open directions in…',
    },
    (buttonIndex) => {
      if (buttonIndex < available.length) {
        Linking.openURL(
          available[buttonIndex].buildUrl(latitude, longitude, placeName)
        ).catch(() => {
          Linking.openURL(GOOGLE_MAPS_WEB_URL(latitude, longitude)).catch(() => {});
        });
      }
    }
  );
}
