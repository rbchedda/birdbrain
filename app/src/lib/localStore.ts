import AsyncStorage from '@react-native-async-storage/async-storage';

/** Small JSON wrapper over AsyncStorage (localStorage on web). Never throws on read. */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private browsing); the app keeps working in memory.
  }
}

const AGE_GATE_KEY = 'birdbrain.ageGate.v1';
export type AgeGateStatus = 'passed' | 'blocked' | null;

/** Result of the 13+ age gate on this device; null until answered. */
export const readAgeGate = () => readJson<AgeGateStatus>(AGE_GATE_KEY, null);
export const writeAgeGate = (status: Exclude<AgeGateStatus, null>) => writeJson(AGE_GATE_KEY, status);

const SHARE_KEY = 'birdbrain.shareToCommunity.v1';

/**
 * "Share to community" opt-in. Off by default: until the user turns it on, the
 * community feed stays hidden and new diary entries can only be saved private.
 */
export const readShareToCommunity = () => readJson<boolean>(SHARE_KEY, false);
export const writeShareToCommunity = (on: boolean) => writeJson(SHARE_KEY, on);
