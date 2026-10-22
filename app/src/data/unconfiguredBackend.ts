import type { Backend } from './backend';

export class BackendNotConfiguredError extends Error {
  constructor() {
    super('BirdBrain is not connected to a server. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in app/.env (or EXPO_PUBLIC_USE_SAMPLE_DATA=1 for offline sample data).');
    this.name = 'BackendNotConfiguredError';
  }
}

/** Used when neither Supabase config nor the sample-data dev flag is set. */
export function createUnconfiguredBackend(): Backend {
  const base: Partial<Backend> = {
    mode: 'unconfigured',
    getSession: async () => null,
    onSessionChange: () => () => {},
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop as keyof Backend];
      if (prop === 'then') return undefined;
      return async () => {
        throw new BackendNotConfiguredError();
      };
    },
  }) as Backend;
}
