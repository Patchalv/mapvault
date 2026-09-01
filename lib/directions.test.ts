import { ActionSheetIOS, Linking, Platform } from 'react-native';
import { openDirections } from '@/lib/directions';

const LAT = 41.3874;
const LNG = 2.1686;
const GOOGLE_WEB = `https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}`;

let canOpen: jest.SpyInstance<Promise<boolean>, [url: string]>;
let openUrl: jest.SpyInstance<Promise<unknown>, [url: string]>;
let actionSheet: jest.SpyInstance<
  void,
  Parameters<typeof ActionSheetIOS.showActionSheetWithOptions>
>;

function installedSchemes(schemes: string[]) {
  canOpen.mockImplementation(async (url: string) =>
    schemes.some((scheme) => url.startsWith(scheme)),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  canOpen = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  actionSheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = 'ios';
});

describe('openDirections on Android', () => {
  beforeEach(() => {
    Platform.OS = 'android';
  });

  it('opens the geo: intent with the place name attached', async () => {
    installedSchemes(['geo:']);

    await openDirections(LAT, LNG, 'Bar Nou');

    expect(openUrl).toHaveBeenCalledWith(
      `geo:${LAT},${LNG}?q=${LAT},${LNG}(Bar%20Nou)`,
    );
  });

  it('falls back to Google Maps on the web when no geo: handler exists', async () => {
    installedSchemes([]);

    await openDirections(LAT, LNG, 'Bar Nou');

    expect(openUrl).toHaveBeenCalledWith(GOOGLE_WEB);
  });

  it('handles a missing place name without writing "undefined" into the URL', async () => {
    installedSchemes(['geo:']);

    await openDirections(LAT, LNG);

    expect(openUrl).toHaveBeenCalledWith(`geo:${LAT},${LNG}?q=${LAT},${LNG}()`);
  });
});

describe('openDirections on iOS', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
  });

  it('falls back to the web when no nav app is installed', async () => {
    installedSchemes([]);

    await openDirections(LAT, LNG, 'Bar Nou');

    expect(openUrl).toHaveBeenCalledWith(GOOGLE_WEB);
    expect(actionSheet).not.toHaveBeenCalled();
  });

  it('opens the only installed nav app directly, without an action sheet', async () => {
    installedSchemes(['maps://']);

    await openDirections(LAT, LNG, 'Bar Nou');

    expect(openUrl).toHaveBeenCalledWith(`http://maps.apple.com/?daddr=${LAT},${LNG}`);
    expect(actionSheet).not.toHaveBeenCalled();
  });

  it('falls back to the web when the single installed app refuses to open', async () => {
    installedSchemes(['waze://']);
    openUrl.mockRejectedValueOnce(new Error('cannot open'));

    await openDirections(LAT, LNG, 'Bar Nou');

    expect(openUrl).toHaveBeenLastCalledWith(GOOGLE_WEB);
  });

  it('offers a choice, plus Cancel, when several nav apps are installed', async () => {
    installedSchemes(['maps://', 'comgooglemaps://']);

    await openDirections(LAT, LNG, 'Bar Nou');

    const [options] = actionSheet.mock.calls[0];
    expect(options.options).toEqual(['Apple Maps', 'Google Maps', 'Cancel']);
    expect(options.cancelButtonIndex).toBe(2);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('opens the app the user picked from the action sheet', async () => {
    installedSchemes(['maps://', 'comgooglemaps://']);

    await openDirections(LAT, LNG, 'Bar Nou');
    const [, onSelect] = actionSheet.mock.calls[0];
    onSelect(1);

    expect(openUrl).toHaveBeenCalledWith(
      `comgooglemaps://?daddr=${LAT},${LNG}&directionsmode=driving`,
    );
  });

  it('opens nothing when the user cancels the action sheet', async () => {
    installedSchemes(['maps://', 'comgooglemaps://']);

    await openDirections(LAT, LNG, 'Bar Nou');
    const [, onSelect] = actionSheet.mock.calls[0];
    onSelect(2);

    expect(openUrl).not.toHaveBeenCalled();
  });

  it('URL-encodes the place name for apps that take it as a parameter', async () => {
    installedSchemes(['citymapper://']);

    await openDirections(LAT, LNG, 'Quimet & Quimet');

    expect(openUrl).toHaveBeenCalledWith(
      `citymapper://directions?endcoord=${LAT},${LNG}&endname=Quimet%20%26%20Quimet`,
    );
  });
});
