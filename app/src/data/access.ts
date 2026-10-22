/**
 * Who controls the land under a place, derived from PGC's own attributes.
 * Shared by the ingest (ingest/arcgis.mjs stores it in places.properties.access_type)
 * and the app (which re-derives it for rows ingested before the field existed).
 * Plain TypeScript with erasable types only, so Node 22 can import it directly.
 *
 * null = unknown status: the app hides the place rather than guess.
 */
export type AccessType = 'state_game_land' | 'other_public' | 'enrolled_private';

export interface AccessInput {
  type: string;
  name: string;
  /** PGC pheasant layer `property_type`: "SGL", "Other Properties", or missing. */
  propertyType?: string | null;
  /** SGL number: from the stocking property name, or polygon overlap for dove fields. */
  sgl?: number | string | null;
  /** Dove field description (free text from PGC). */
  description?: string | null;
}

// PGC access programs (Hunter Access, Public Access Cooperator): private land, open under program terms.
const ENROLLED = /\b(hunter access|public access (property )?cooperator|cooperator)\b/i;
// Government or utility-reservoir land PGC lists under "Other Properties".
const PUBLIC = /\b(state park|state forest|national forest|national recreation area|county park|park|lake|reservoir|dam|fish hatchery|acoe)\b/i;

const hasSgl = (sgl: AccessInput['sgl']) => sgl !== null && sgl !== undefined && sgl !== '' && Number.isInteger(Number(sgl));

export function classifyAccess(p: AccessInput): AccessType | null {
  if (p.type === 'game_land') return 'state_game_land';
  if (p.type === 'stocking') {
    const t = (p.propertyType ?? '').trim();
    if (t === 'SGL') return hasSgl(p.sgl) ? 'state_game_land' : null;
    if (t === 'Other Properties') {
      if (ENROLLED.test(p.name)) return 'enrolled_private';
      if (PUBLIC.test(p.name)) return 'other_public';
      return null;
    }
    // Missing or unrecognised property_type: unknown, even if the name looks public.
    return null;
  }
  if (p.type === 'dove_field') {
    if (hasSgl(p.sgl)) return 'state_game_land';
    if (ENROLLED.test(p.description ?? '')) return 'enrolled_private';
    return null;
  }
  return null;
}

export const accessLabel: Record<AccessType, string> = {
  state_game_land: 'State Game Land',
  other_public: 'Other public land',
  enrolled_private: 'PGC access-program land (private)',
};
