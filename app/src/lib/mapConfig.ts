/**
 * Where the Terrain basemap's tiles and glyphs come from. One config value,
 * EXPO_PUBLIC_MAP_ASSETS_URL, points at a host laid out like
 * scripts/basemap/build.sh's output:
 *
 *   <base>/basemap/pa.pmtiles                 Protomaps PA extract
 *   <base>/dem/{z}/{x}/{y}.png                Terrarium DEM (AWS Terrain Tiles), z0–12
 *   <base>/fonts/{fontstack}/{range}.pbf      Inter Medium, Inter Medium Italic, Barlow Condensed Bold
 *
 * Dev: `npm run basemap:serve` serves it at http://<lan-ip>:8787.
 * Production host (Cloudflare R2) is BLOCKED; until then Terrain is only
 * offered when this is set.
 */
export interface MapAssets {
  pmtiles: string;
  dem: string;
  glyphs: string;
}

export function mapAssetsFrom(base: string | undefined | null): MapAssets | null {
  const b = (base ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(b)) return null;
  return {
    pmtiles: `${b}/basemap/pa.pmtiles`,
    dem: `${b}/dem/{z}/{x}/{y}.png`,
    glyphs: `${b}/fonts/{fontstack}/{range}.pbf`,
  };
}

export const mapAssets = mapAssetsFrom(process.env.EXPO_PUBLIC_MAP_ASSETS_URL);

/** DEM tiles stop at z12 (one shared fetch; MapLibre overzooms past it). */
export const DEM_MAXZOOM = 12;

/** Contour intervals in feet, [minor, major] by zoom (spec §2, z15 final 20/100). */
export const CONTOUR_THRESHOLDS_FT: Record<number, [number, number]> = {
  11: [500, 500],
  12: [100, 500],
  14: [40, 200],
  15: [20, 100],
};

export const DEM_ATTRIBUTION = '3DEP, GMTED2010 and SRTM terrain data courtesy of the U.S. Geological Survey · Terrain Tiles: Mapzen';
