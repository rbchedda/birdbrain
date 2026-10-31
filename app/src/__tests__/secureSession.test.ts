import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { createSupabaseBackend } from '@/data/supabaseBackend';
import {
  chunkedSecureStore,
  CHUNK_SIZE,
  createSessionStorage,
  migrateFromAsyncStorage,
  safeKey,
  sessionKeys,
  supabaseStorageKey,
} from '@/lib/secureSession';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const URL_ = 'https://abcdefgh.supabase.co';
const KEY = 'sb-abcdefgh-auth-token';
const big = (n: number) => JSON.stringify({ access_token: 'x'.repeat(n), refresh_token: 'r' });

beforeEach(async () => {
  store.clear();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('chunked SecureStore adapter', () => {
  it('derives the supabase key and sanitizes keys', () => {
    expect(supabaseStorageKey(URL_)).toBe(KEY);
    expect(safeKey('a/b:c d')).toBe('a_b_c_d');
  });
  it('round-trips a small value in one chunk', async () => {
    await chunkedSecureStore.setItem(KEY, 'hello');
    expect(await chunkedSecureStore.getItem(KEY)).toBe('hello');
    expect(store.get(`${KEY}.n`)).toBe('1');
  });
  it('splits values over 2KB and reassembles them', async () => {
    const v = big(5000);
    await chunkedSecureStore.setItem(KEY, v);
    expect(Number(store.get(`${KEY}.n`))).toBe(Math.ceil(v.length / CHUNK_SIZE));
    expect(await chunkedSecureStore.getItem(KEY)).toBe(v);
  });
  it('shrinking leaves no stale chunks', async () => {
    await chunkedSecureStore.setItem(KEY, big(6000));
    await chunkedSecureStore.setItem(KEY, 'tiny');
    expect([...store.keys()].sort()).toEqual([`${KEY}.0`, `${KEY}.n`]);
    expect(await chunkedSecureStore.getItem(KEY)).toBe('tiny');
  });
  it('remove deletes the count and every chunk', async () => {
    await chunkedSecureStore.setItem(KEY, big(5000));
    await chunkedSecureStore.removeItem(KEY);
    expect(store.size).toBe(0);
    expect(await chunkedSecureStore.getItem(KEY)).toBeNull();
  });
  it('returns null for missing keys', async () => {
    expect(await chunkedSecureStore.getItem('nope')).toBeNull();
  });
});

describe('migration from AsyncStorage', () => {
  it('moves a present session and deletes the old copy', async () => {
    const v = big(4000);
    await AsyncStorage.setItem(KEY, v);
    await migrateFromAsyncStorage(sessionKeys(KEY));
    expect(await chunkedSecureStore.getItem(KEY)).toBe(v);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
  it('does nothing when there is no old session', async () => {
    await migrateFromAsyncStorage(sessionKeys(KEY));
    expect(store.size).toBe(0);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
  it('is idempotent and never overwrites an existing SecureStore session', async () => {
    await chunkedSecureStore.setItem(KEY, 'new');
    await AsyncStorage.setItem(KEY, 'old');
    await migrateFromAsyncStorage(sessionKeys(KEY));
    await migrateFromAsyncStorage(sessionKeys(KEY));
    expect(await chunkedSecureStore.getItem(KEY)).toBe('new');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
  it('keeps the AsyncStorage copy when the SecureStore write fails, without throwing', async () => {
    await AsyncStorage.setItem(KEY, 'old');
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(migrateFromAsyncStorage(sessionKeys(KEY))).resolves.toBeUndefined();
    expect(await AsyncStorage.getItem(KEY)).toBe('old');
    warn.mockRestore();
  });
  it('the native storage waits for migration before the first read', async () => {
    await AsyncStorage.setItem(KEY, 'session');
    const s = createSessionStorage(URL_, 'ios');
    expect(await s.getItem(KEY)).toBe('session');
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});

describe('sign-out clearing', () => {
  it('clear() removes the session, its chunks, and any leftover AsyncStorage copy', async () => {
    const s = createSessionStorage(URL_, 'android');
    await s.ready;
    await s.setItem(KEY, big(5000));
    await s.setItem(`${KEY}-code-verifier`, 'v');
    await AsyncStorage.setItem(`${KEY}-user`, 'u');
    await s.clear();
    expect(store.size).toBe(0);
    expect(await AsyncStorage.getItem(`${KEY}-user`)).toBeNull();
  });
  it('backend signOut and deleteAccount call clearStoredSession, even if signOut errors', async () => {
    const clear = jest.fn(async () => undefined);
    const sb = {
      auth: {
        signOut: jest.fn(async () => ({ error: { message: 'offline' } })),
      },
    } as never;
    const b = createSupabaseBackend(sb, { clearStoredSession: clear });
    await expect(b.signOut()).rejects.toBeTruthy();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('web fallback', () => {
  it('uses AsyncStorage (localStorage) and never touches SecureStore', async () => {
    const s = createSessionStorage(URL_, 'web');
    await s.setItem(KEY, big(5000));
    expect(await s.getItem(KEY)).toBe(big(5000));
    expect(await AsyncStorage.getItem(KEY)).toBe(big(5000));
    await s.clear();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
