import { Directory, File, Paths } from 'expo-file-system';

import { readJson, writeJson } from '@/lib/localStore';

import type { PackManifest } from './packs';
import type { TileStore } from './store';

const MANIFESTS = 'birdbrain.offlinePacks.v1';
const root = () => new Directory(Paths.document, 'offline-packs');

function fileAt(path: string) {
  return new File(root(), ...path.split('/'));
}

export const fileTileStore: TileStore = {
  supported: true,
  async download(url, path) {
    const file = fileAt(path);
    file.parentDirectory.create({ intermediates: true, idempotent: true });
    // A half-written tile from a killed download must not count as done.
    const part = new File(file.parentDirectory, `${file.name}.part`);
    if (part.exists) part.delete();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    part.create({ overwrite: true });
    part.write(bytes);
    if (file.exists) file.delete();
    part.move(file);
    return bytes.byteLength;
  },
  async exists(path) {
    return fileAt(path).exists;
  },
  async size(path) {
    const f = fileAt(path);
    return f.exists ? f.size ?? 0 : 0;
  },
  async readBase64(path) {
    const f = fileAt(path);
    return f.exists ? f.base64() : null;
  },
  async remove(dir) {
    const d = new Directory(root(), ...dir.split('/'));
    if (d.exists) d.delete();
  },
  readManifests: () => readJson<Record<string, PackManifest>>(MANIFESTS, {}),
  writeManifests: (m) => writeJson(MANIFESTS, m),
};
