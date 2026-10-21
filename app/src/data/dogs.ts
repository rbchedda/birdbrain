import { newClientId, readJson, updateJson } from '@/lib/localStore';

import type { Dog } from './types';

/** The hunter's saved dog roster. Private and kept on this device. */
const KEY = 'birdbrain.dogs.v1';

export function listDogs(): Promise<Dog[]> {
  return readJson<Dog[]>(KEY, []);
}

export async function saveDog(input: { id?: string; name: string; breed?: string | null }): Promise<Dog> {
  const name = input.name.trim();
  if (!name) throw new Error('Give your dog a name.');
  const dog: Dog = { id: input.id ?? newClientId(), name, breed: input.breed?.trim() || null };
  await updateJson<Dog[]>(KEY, [], (cur) =>
    cur.some((d) => d.id === dog.id) ? cur.map((d) => (d.id === dog.id ? dog : d)) : [...cur, dog],
  );
  return dog;
}

/** Removes from the roster only; past diary entries keep the dog's name and stats. */
export async function removeDog(id: string) {
  await updateJson<Dog[]>(KEY, [], (cur) => cur.filter((d) => d.id !== id));
}
