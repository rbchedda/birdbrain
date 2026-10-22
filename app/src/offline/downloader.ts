import { planPack, type PackManifest, type PackSpec } from './packs';
import { assertCacheable, PACK_SOURCES, tileUrl } from './sources';
import { tilePath, type TileStore } from './store';
import { tilesFor } from './tiles';

export class OfflineGateError extends Error {
  constructor() {
    super('Offline maps are included with Season Pass or Weekend Pass.');
    this.name = 'OfflineGateError';
  }
}

export interface DownloadHandle {
  cancel(): void;
  done: Promise<PackManifest>;
}

type Listener = (m: Record<string, PackManifest>) => void;

/**
 * Downloads tile packs into a TileStore. One running job per pack.
 * - progress: manifests update as tiles land (listeners are notified).
 * - cancel: stops after in-flight tiles finish; the pack is left 'paused'.
 * - resume: download() again; tiles already on disk are skipped.
 * - delete: removes the files and the manifest.
 */
export class PackDownloader {
  private manifests: Record<string, PackManifest> = {};
  private loaded: Promise<void> | null = null;
  private jobs = new Map<string, { cancelled: boolean }>();
  private listeners = new Set<Listener>();

  constructor(
    private store: TileStore,
    private opts: { concurrency?: number; now?: () => number } = {},
  ) {}

  load() {
    this.loaded ??= this.store.readManifests().then((m) => {
      // A job can't survive an app restart; anything mid-download is resumable.
      for (const k of Object.keys(m)) if (m[k].status === 'downloading') m[k] = { ...m[k], status: 'paused' };
      this.manifests = m;
      this.emit();
    });
    return this.loaded;
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    l(this.manifests);
    return () => void this.listeners.delete(l);
  }

  list() {
    return this.manifests;
  }

  isRunning(id: string) {
    return this.jobs.has(id);
  }

  private emit() {
    const snap = { ...this.manifests };
    this.listeners.forEach((l) => l(snap));
  }

  private async put(m: PackManifest) {
    this.manifests = { ...this.manifests, [m.spec.id]: m };
    this.emit();
    await this.store.writeManifests(this.manifests);
  }

  download(spec: PackSpec, allowed: boolean): DownloadHandle {
    if (!allowed) throw new OfflineGateError();
    if (!this.store.supported) throw new Error('Offline maps are available in the iOS and Android app.');
    const existing = this.jobs.get(spec.id);
    if (existing) throw new Error('This pack is already downloading.');
    // Refuse before any request if a source isn't cacheable (Esri, unknown hosts).
    for (const b of spec.basemaps) assertCacheable(PACK_SOURCES[b].url);

    const job = { cancelled: false };
    this.jobs.set(spec.id, job);
    const done = this.run(spec, job).finally(() => this.jobs.delete(spec.id));
    return { cancel: () => void (job.cancelled = true), done };
  }

  private async run(spec: PackSpec, job: { cancelled: boolean }): Promise<PackManifest> {
    await this.load();
    const now = this.opts.now ?? Date.now;
    const plan = planPack(spec);
    let m: PackManifest = {
      spec,
      status: 'downloading',
      total: plan.tiles,
      done: 0,
      bytes: 0,
      failed: 0,
      updatedAt: now(),
    };
    await this.put(m);

    const queue: { url: string; path: string }[] = [];
    for (const { source } of plan.sources) {
      for (const t of tilesFor(spec.bbox, source.minzoom, source.maxzoom)) {
        const url = tileUrl(source, t.z, t.x, t.y);
        assertCacheable(url);
        queue.push({ url, path: tilePath(spec.id, source.key, t.z, t.x, t.y) });
      }
    }

    let next = 0;
    let lastWrite = 0;
    const worker = async () => {
      while (!job.cancelled && next < queue.length) {
        const item = queue[next++];
        try {
          if (await this.store.exists(item.path)) {
            m.bytes += await this.store.size(item.path);
          } else {
            m.bytes += await this.store.download(item.url, item.path);
          }
          m.done += 1;
        } catch {
          m.failed += 1;
        }
        m = { ...m, updatedAt: now() };
        this.manifests = { ...this.manifests, [spec.id]: m };
        this.emit();
        if (m.done - lastWrite >= 50) {
          lastWrite = m.done;
          await this.store.writeManifests(this.manifests);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, this.opts.concurrency ?? 4) }, worker));

    if (job.cancelled) m = { ...m, status: 'paused' };
    else if (m.failed > 0) m = { ...m, status: 'error', error: `${m.failed} tiles failed. Resume to retry them.` };
    else m = { ...m, status: 'complete', error: undefined };
    await this.put({ ...m, updatedAt: now() });
    return this.manifests[spec.id];
  }

  cancel(id: string) {
    const job = this.jobs.get(id);
    if (job) job.cancelled = true;
  }

  async delete(id: string) {
    this.cancel(id);
    await this.load();
    await this.store.remove(id);
    const { [id]: _gone, ...rest } = this.manifests;
    this.manifests = rest;
    this.emit();
    await this.store.writeManifests(this.manifests);
  }
}
