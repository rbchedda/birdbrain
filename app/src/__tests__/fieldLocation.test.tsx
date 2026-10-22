import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { LocateButton, LOCATE_SIZE } from '@/components/map/LocateButton';
import { meMessage, useMapBridge } from '@/components/map/useMapBridge';
import { pointInGeometry } from '@/lib/geo';
import { askForegroundPermission, LOCATION_DENIED_MESSAGE, useMyLocation } from '@/lib/location';

const appJson = require('../../app.json');

const fix = (lng: number, lat: number, accuracy = 12) =>
  ({ coords: { longitude: lng, latitude: lat, accuracy }, timestamp: 0 }) as unknown as Location.LocationObject;

function api(opts: { granted?: boolean; canAskAgain?: boolean; askResult?: boolean; position?: Location.LocationObject }) {
  const remove = jest.fn();
  return {
    remove,
    getForegroundPermissionsAsync: jest.fn(async () => ({ granted: !!opts.granted, canAskAgain: opts.canAskAgain ?? true })),
    requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: !!opts.askResult, canAskAgain: false })),
    watchPositionAsync: jest.fn(async (_o: unknown, cb: (p: Location.LocationObject) => void) => {
      if (opts.position) cb(opts.position);
      return { remove };
    }),
    getCurrentPositionAsync: jest.fn(async () => {
      if (!opts.position) throw new Error('no fix');
      return opts.position;
    }),
  } as any;
}

describe('location permission', () => {
  it('denied: returns denied, never watches, never throws', async () => {
    const a = api({ askResult: false });
    const { result } = await renderHook(() => useMyLocation(a));
    let got: unknown;
    await act(async () => {
      got = await result.current.start();
    });
    expect(got).toBeNull();
    expect(result.current.status).toBe('denied');
    expect(result.current.location).toBeNull();
    expect(a.watchPositionAsync).not.toHaveBeenCalled();
  });

  it('does not re-prompt when the OS says it cannot ask again', async () => {
    const a = api({ canAskAgain: false });
    expect(await askForegroundPermission(a)).toBe('denied');
    expect(a.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('a throwing permission API counts as denied', async () => {
    const a = api({});
    a.getForegroundPermissionsAsync.mockRejectedValue(new Error('boom'));
    expect(await askForegroundPermission(a)).toBe('denied');
  });

  it('granted: watches and returns the fix', async () => {
    const a = api({ askResult: true, position: fix(-77.8, 40.8) });
    const { result, unmount } = await renderHook(() => useMyLocation(a));
    let got: unknown;
    await act(async () => {
      got = await result.current.start();
    });
    expect(got).toEqual({ lng: -77.8, lat: 40.8, accuracy: 12 });
    expect(result.current.status).toBe('granted');
    expect(result.current.location).toEqual({ lng: -77.8, lat: 40.8, accuracy: 12 });
    await unmount();
    expect(a.remove).toHaveBeenCalled();
  });

  it('already granted: shows the dot without prompting', async () => {
    const a = api({ granted: true, position: fix(-77, 41) });
    const { result } = await renderHook(() => useMyLocation(a));
    await waitFor(() => expect(result.current.location).not.toBeNull());
    expect(a.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('only foreground APIs exist in the mock surface we use (no background)', () => {
    const src = require('fs').readFileSync(require.resolve('@/lib/location'), 'utf8');
    expect(src).not.toMatch(/Background/);
  });
});

describe('position to WebView', () => {
  it('meMessage carries [lng, lat] and accuracy', () => {
    expect(meMessage({ lng: -77.8, lat: 40.8, accuracy: 20 })).toEqual({ type: 'me', center: [-77.8, 40.8], accuracy: 20 });
    expect(meMessage({ lng: 1, lat: 2, accuracy: null })).toEqual({ type: 'me', center: [1, 2], accuracy: 0 });
    expect(meMessage(null)).toEqual({ type: 'me', center: null, accuracy: 0 });
  });

  it('the bridge posts the position once the map is ready', async () => {
    const post = jest.fn();
    const props = { places: [], basemap: 'topo' as const, onSelect: () => {}, me: { lng: -77.8, lat: 40.8, accuracy: 9 } };
    const { result } = await renderHook(() => useMapBridge(post, props));
    expect(post).not.toHaveBeenCalled();
    await act(async () => result.current.receive(JSON.stringify({ type: 'ready' })));
    expect(post).toHaveBeenCalledWith({ type: 'me', center: [-77.8, 40.8], accuracy: 9 });
  });

  it('the map page draws a dot and an accuracy circle', () => {
    const { mapHtml } = require('@/components/map/mapHtml');
    expect(mapHtml).toContain("id: 'me-dot'");
    expect(mapHtml).toContain("id: 'me-accuracy'");
    expect(mapHtml).toContain("m.type === 'me'");
    // The zoom control was hidden under the bottom sheet, behind the locate button's corner.
    expect(mapHtml).not.toContain('new maplibregl.NavigationControl');
    expect(mapHtml).not.toMatch(/addControl\([^)]*NavigationControl/);
  });
});

describe('LocateButton', () => {
  it('is at least 56pt with an accessibility label', async () => {
    await render(<LocateButton status="idle" onPress={() => {}} onOpenSettings={() => {}} onDismiss={() => {}} showMessage={false} />);
    const b = screen.getByLabelText('Center map on my location');
    expect(LOCATE_SIZE).toBeGreaterThanOrEqual(56);
    expect(b).toBeTruthy();
  });

  it('denied: explains and offers Settings', async () => {
    const open = jest.fn();
    await render(<LocateButton status="denied" onPress={() => {}} onOpenSettings={open} onDismiss={() => {}} showMessage />);
    expect(screen.getByText(LOCATION_DENIED_MESSAGE)).toBeTruthy();
    fireEvent.press(screen.getByText('Open Settings'));
    expect(open).toHaveBeenCalled();
  });

  it('shows the access label of the place you are in', async () => {
    await render(
      <LocateButton status="granted" onPress={() => {}} onOpenSettings={() => {}} onDismiss={() => {}} showMessage={false} hereLabel="State Game Land" />,
    );
    expect(screen.getByText("You're on: State Game Land")).toBeTruthy();
  });
});

describe('pointInGeometry', () => {
  const square = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  it('inside, outside, and in a hole', () => {
    expect(pointInGeometry(1, 1, square)).toBe(true);
    expect(pointInGeometry(11, 1, square)).toBe(false);
    expect(pointInGeometry(5, 5, square)).toBe(false);
  });
  it('MultiPolygon and GeometryCollection; points and null are never "inside"', () => {
    const multi = { type: 'MultiPolygon', coordinates: [square.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 20]]]] };
    expect(pointInGeometry(25, 22, multi)).toBe(true);
    expect(pointInGeometry(1, 1, { type: 'GeometryCollection', geometries: [square] })).toBe(true);
    expect(pointInGeometry(0, 0, { type: 'Point', coordinates: [0, 0] })).toBe(false);
    expect(pointInGeometry(0, 0, null)).toBe(false);
  });
});

describe('app config', () => {
  const msg = "BirdBrain shows where you are on the map so you can see which land you're on.";
  it('has the When In Use string and no background location', () => {
    const e = appJson.expo;
    expect(e.ios.infoPlist.NSLocationWhenInUseUsageDescription).toBe(msg);
    expect(e.android.permissions).toEqual(expect.arrayContaining(['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']));
    const plugin = e.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-location');
    expect(plugin[1].locationWhenInUsePermission).toBe(msg);
    // false (not omitted) stops the plugin writing its default Always strings.
    expect(plugin[1].locationAlwaysAndWhenInUsePermission).toBe(false);
    expect(plugin[1].locationAlwaysPermission).toBe(false);
    const all = JSON.stringify(e);
    expect(all).not.toMatch(/ACCESS_BACKGROUND_LOCATION|NSLocationAlways/);
  });
});
