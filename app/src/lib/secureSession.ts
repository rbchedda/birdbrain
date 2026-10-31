/**
 * Auth session storage (audit L6). On iOS/Android the Supabase session lives in
 * the Keychain/Keystore via expo-secure-store instead of plain AsyncStorage.
 * SecureStore rejects values over ~2KB, so values are split into chunks:
 *   <key>.n -> chunk count, <key>.0 .. <key>.(n-1) -> chunks.
 * Web keeps using localStorage (AsyncStorage's web backend).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Stay well under SecureStore's 2048-byte limit (chars may be multi-byte). */
export const CHUNK_SIZE = 1800;

/** SecureStore keys allow only [A-Za-z0-9._-]; anything else becomes '_'. */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const countKey = (k: string) => `${safeKey(k)}.n`;
const chunkKey = (k: string, i: number) => `${safeKey(k)}.${i}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const n = raw == null ? 0 : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const chunkedSecureStore: SessionStorage = {
  async getItem(key) {
    const n = await readCount(key);
    if (n === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part == null) return null; // torn write: treat as no session
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key, value) {
    const old = await readCount(key);
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) parts.push(value.slice(i, i + CHUNK_SIZE));
    if (parts.length === 0) parts.push('');
    for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(chunkKey(key, i), parts[i]);
    await SecureStore.setItemAsync(countKey(key), String(parts.length));
    for (let i = parts.length; i < old; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  },
  async removeItem(key) {
    const n = await readCount(key);
    await SecureStore.deleteItemAsync(countKey(key));
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  },
};

/** Supabase's default storage key: sb-<project ref>-auth-token. */
export function supabaseStorageKey(supabaseUrl: string): string {
  let host = supabaseUrl;
  try {
    host = new URL(supabaseUrl).hostname;
  } catch {
    /* keep raw */
  }
  return `sb-${host.split('.')[0]}-auth-token`;
}

/** The session plus the PKCE verifier/user rows supabase-js keeps next to it. */
export const sessionKeys = (base: string) => [base, `${base}-code-verifier`, `${base}-user`];

/**
 * One-time move from AsyncStorage to SecureStore. Idempotent; never throws.
 * The AsyncStorage copy is deleted only after the SecureStore copy reads back.
 */
export async function migrateFromAsyncStorage(keys: string[], target: SessionStorage = chunkedSecureStore): Promise<void> {
  for (const key of keys) {
    try {
      const old = await AsyncStorage.getItem(key);
      if (old == null) continue;
      const existing = await target.getItem(key);
      if (existing == null) {
        await target.setItem(key, old);
        if ((await target.getItem(key)) !== old) continue; // keep old copy
      }
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.warn('[secureSession] migration skipped for one key; keeping AsyncStorage copy', (e as Error)?.message);
    }
  }
}

/**
 * The storage handed to createClient. On native every call waits for the
 * migration, so the client's first session read already sees the moved session.
 */
export function createSessionStorage(supabaseUrl: string, os: string = Platform.OS): SessionStorage & { ready: Promise<void>; clear(): Promise<void> } {
  const keys = sessionKeys(supabaseStorageKey(supabaseUrl));
  if (os === 'web') {
    return {
      ready: Promise.resolve(),
      getItem: (k) => AsyncStorage.getItem(k),
      setItem: (k, v) => AsyncStorage.setItem(k, v),
      removeItem: (k) => AsyncStorage.removeItem(k),
      clear: async () => {
        await AsyncStorage.multiRemove(keys);
      },
    };
  }
  const ready = migrateFromAsyncStorage(keys);
  const after = <T>(f: () => Promise<T>) => ready.then(f);
  return {
    ready,
    getItem: (k) => after(() => chunkedSecureStore.getItem(k)),
    setItem: (k, v) => after(() => chunkedSecureStore.setItem(k, v)),
    removeItem: (k) => after(() => chunkedSecureStore.removeItem(k)),
    clear: () =>
      after(async () => {
        for (const k of keys) {
          await chunkedSecureStore.removeItem(k).catch(() => undefined);
          await AsyncStorage.removeItem(k).catch(() => undefined);
        }
      }),
  };
}
