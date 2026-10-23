import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

/** Where the user is. Foreground, When In Use only: BirdBrain never asks for background location. */
export type MyLocation = { lng: number; lat: number; accuracy: number | null };
export type LocationStatus = 'idle' | 'asking' | 'granted' | 'denied' | 'unavailable';

export const LOCATION_DENIED_MESSAGE = 'Location is off for BirdBrain. Turn it on in Settings to see where you are on the map.';
export const LOCATION_UNAVAILABLE_MESSAGE = "Couldn't get your location. Check that location services are on and try again.";

type LocationApi = Pick<
  typeof Location,
  'getForegroundPermissionsAsync' | 'requestForegroundPermissionsAsync' | 'watchPositionAsync' | 'getCurrentPositionAsync'
>;

export function toMyLocation(p: Location.LocationObject): MyLocation {
  return { lng: p.coords.longitude, lat: p.coords.latitude, accuracy: p.coords.accuracy ?? null };
}

/** Ask for When In Use permission; never throws. */
export async function askForegroundPermission(api: LocationApi = Location): Promise<'granted' | 'denied'> {
  try {
    const current = await api.getForegroundPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'denied';
    const asked = await api.requestForegroundPermissionsAsync();
    return asked.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export const openLocationSettings = () => Linking.openSettings().catch(() => {});

/**
 * Starts watching position after `start()` (the 'center on me' tap) or right away
 * when permission was already granted. Stops on unmount.
 */
export function useMyLocation(api: LocationApi = Location) {
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [location, setLocation] = useState<MyLocation | null>(null);
  const sub = useRef<{ remove: () => void } | null>(null);
  const alive = useRef(true);

  const watch = useCallback(async () => {
    if (sub.current) return true;
    try {
      const s = await api.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3000 },
        (p) => alive.current && setLocation(toMyLocation(p)),
      );
      if (!alive.current) s.remove();
      else sub.current = s;
      return true;
    } catch {
      if (alive.current) setStatus('unavailable');
      return false;
    }
  }, [api]);

  /** Returns the latest fix (or null) so the caller can center on it. */
  const start = useCallback(async (): Promise<MyLocation | null> => {
    setStatus('asking');
    const permission = await askForegroundPermission(api);
    if (!alive.current) return null;
    if (permission !== 'granted') {
      setStatus('denied');
      return null;
    }
    setStatus('granted');
    if (!(await watch())) return null;
    try {
      const fix = toMyLocation(await api.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      if (alive.current) setLocation(fix);
      return fix;
    } catch {
      if (alive.current) setStatus('unavailable');
      return null;
    }
  }, [api, watch]);

  useEffect(() => {
    alive.current = true;
    // Show the dot without a prompt when the user already allowed location.
    api
      .getForegroundPermissionsAsync()
      .then((p) => {
        if (p.granted && alive.current) {
          setStatus('granted');
          watch();
        }
      })
      .catch(() => {});
    return () => {
      alive.current = false;
      sub.current?.remove();
      sub.current = null;
    };
  }, [api, watch]);

  return { status, location, start };
}
