import { assertPackId, planPack, type PackManifest, type PackSpec } from './packs';
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
type Job = { cancelled: boolean; cleared?: boolean; done?: Promise<unknown> };

export class PackDownloader {
  private manifests: Record<string, PackManifest> = {};
  private loaded: Promise<void> | null = null;
  private jobs = new Map<string, Job>();
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
    assertPackId(spec.id);
    if (!allowed) throw new OfflineGateError();
    if (!this.store.supported) throw new Error('Offline maps are available in the iOS and Android app.');
    const existing = this.jobs.get(spec.id);
    if (existing) throw new Error('This pack is already downloading.');
    // Refuse before any request if a source isn't cacheable (Esri, unknown hosts).
    for (const b of spec.basemaps) assertCacheable(PACK_SOURCES[b].url);

    const job: Job = { cancelled: false };
    this.jobs.set(spec.id, job);
    const done = this.run(spec, job).finally(() => this.jobs.delete(spec.id));
    job.done = done;
    return { cancel: () => void (job.cancelled = true), done };
  }

  private async run(spec: PackSpec, job: Job): Promise<PackManifest> {
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
          const bytes = (await this.store.exists(item.path))
            ? await this.store.size(item.path)
            : await this.store.download(item.url, item.path);
          // Read m only after the await: other workers replace it meanwhile.
          m = { ...m, bytes: m.bytes + bytes, done: m.done + 1, updatedAt: now() };
        } catch {
          m = { ...m, failed: m.failed + 1, updatedAt: now() };
        }
        if (job.cleared) return;
        this.manifests = { ...this.manifests, [spec.id]: m };
        this.emit();
        if (m.done - lastWrite >= 50) {
          lastWrite = m.done;
          await this.store.writeManifests(this.manifests);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, this.opts.concurrency ?? 4) }, worker));

    if (job.cleared) return { ...m, status: 'paused' };
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

  /** Not gated: a lapsed pass must still be able to free storage. */
  async delete(id: string) {
    assertPackId(id);
    this.cancel(id);
    await this.load();
    await this.store.remove(id);
    const { [id]: _gone, ...rest } = this.manifests;
    this.manifests = rest;
    this.emit();
    await this.store.writeManifests(this.manifests);
  }

  /** Sign-out / account deletion: cancel every job, remove all packs and the stored index. */
  async clear() {
    const running = [...this.jobs.values()];
    for (const job of running) Object.assign(job, { cancelled: true, cleared: true });
    await this.load();
    // Let in-flight tiles land first so nothing is written after the wipe.
    await Promise.allSettled(running.map((j) => j.done));
    this.manifests = {};
    this.emit();
    await this.store.clear();
  }
}
