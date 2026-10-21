import { blurPoint } from '@/data/backend';
import { samplePlaces } from '@/data/places';
import { createSampleBackend } from '@/data/sampleBackend';
import { areaLabel, parsePoint, toEwkt } from '@/lib/geo';

function ewkbHex(lng: number, lat: number) {
  const view = new DataView(new ArrayBuffer(25));
  view.setUint8(0, 1);
  view.setUint32(1, 0x20000001, true); // Point with SRID flag
  view.setUint32(5, 4326, true);
  view.setFloat64(9, lng, true);
  view.setFloat64(17, lat, true);
  return Array.from(new Uint8Array(view.buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('geometry parsing', () => {
  it('reads GeoJSON points as PostgREST returns them', () => {
    const geojson = { type: 'Point', crs: { type: 'name', properties: { name: 'EPSG:4326' } }, coordinates: [-76.975, 40.05] };
    expect(parsePoint(geojson)).toEqual({ lng: -76.975, lat: 40.05 });
    expect(parsePoint(JSON.stringify(geojson))).toEqual({ lng: -76.975, lat: 40.05 });
  });

  it('reads hex EWKB points', () => {
    expect(parsePoint(ewkbHex(-77.5, 41.25))).toEqual({ lng: -77.5, lat: 41.25 });
  });

  it('writes EWKT for inserts', () => {
    expect(toEwkt({ lng: -76.2, lat: 40.1 })).toBe('SRID=4326;POINT(-76.2 40.1)');
  });
});

describe('location privacy', () => {
  it('blurs to the same grid cell centers as public.blur_point', () => {
    expect(blurPoint({ lng: -76.21, lat: 40.11 })).toEqual({ lng: -76.225, lat: 40.125 });
    expect(blurPoint({ lng: -77.0, lat: 40.0 })).toEqual({ lng: -76.975, lat: 40.025 });
  });

  it('labels a blurred area by county, never by place', () => {
    const label = areaLabel(blurPoint(samplePlaces[1].center), samplePlaces);
    expect(label).toBe('Near Lancaster County');
    expect(areaLabel(null, samplePlaces)).toBe('Location hidden');
  });
});

describe('sample backend', () => {
  it('pages the feed newest first with a created_at cursor', async () => {
    const b = createSampleBackend();
    const first = await b.feed(null, 3);
    expect(first.posts).toHaveLength(3);
    expect(first.next).toBe(first.posts[2].createdAt);
    const second = await b.feed(first.next, 3);
    expect(second.posts.map((p) => p.id)).not.toContain(first.posts[0].id);
    expect(second.next).toBeNull();
  });

  it('hides blocked authors’ posts and comments', async () => {
    const b = createSampleBackend();
    await b.setBlocked('sample-dana', true);
    const { posts } = await b.feed(null, 20);
    expect(posts.some((p) => p.author.id === 'sample-dana')).toBe(false);
    expect((await b.comments('p1')).some((c) => c.author.id === 'sample-dana')).toBe(false);
    await b.setBlocked('sample-dana', false);
  });

  it('delays new posts until next midnight Eastern or 12 hours, whichever is later', async () => {
    const now = new Date('2026-10-21T22:30:00Z'); // 6:30 PM EDT
    const b = createSampleBackend(() => now);
    const post = await b.createPost({
      species: 'pheasant',
      caption: 'evening hunt',
      huntedOn: '2026-10-21',
      counts: [],
      exact: null,
      location: 'blurred',
      audience: 'shared',
      groupSlug: null,
    });
    expect(post.publicAfter).toBe('2026-10-22T10:30:00.000Z'); // 12h beats midnight
    expect(post.area).toBeNull();
    await b.deletePost(post.id);
  });
});
