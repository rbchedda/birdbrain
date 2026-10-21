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

const queues = new Map<string, Promise<unknown>>();

/**
 * Read-modify-write a key, serialized per key so concurrent updates (a save
 * racing a sync) never drop each other's changes.
 */
export function updateJson<T>(key: string, fallback: T, fn: (current: T) => T): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(async () => {
    const next = fn(await readJson<T>(key, fallback));
    await writeJson(key, next);
    return next;
  });
  queues.set(key, run.catch(() => undefined));
  return run;
}

/** RFC 4122 v4 UUID, minted on the device so uploads are idempotent. */
export function newClientId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
