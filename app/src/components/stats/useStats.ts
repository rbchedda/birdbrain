import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePending, useSignal } from '@/components/FieldSync';
import { refreshFromAccount, usePullState, useSession } from '@/data/hooks';
import { entriesForAccount, OWNER_KEY, PULLED_KEY } from '@/data/journal';
import { useProfileData } from '@/components/profile';
import { sampleEntries, sampleLookup, sampleRoster, SAMPLE_SEASON, SAMPLE_TODAY } from '@/data/statsSample';
import { ALL_TIME, buildStats, seasonsWithHunts, type Ctx, type Scope } from '@/data/statsCharts';
import { seasonOf } from '@/data/stats';
import { useEntitlements } from '@/entitlements/EntitlementsContext';
import { flags } from '@/lib/flags';
import { readJson, writeJson } from '@/lib/localStore';
import { todayET } from '@/lib/time';

/** Remembered per device (not per account): the season the Stats screens show. */
export const STATS_SCOPE_KEY = 'birdbrain.stats.scope.v1';

/**
 * Everything the Stats screens need: the hunt log (or the labelled sample),
 * the chosen season, the multi-year gate, and connectivity. Past seasons and
 * All time use the existing `multiYearStats` entitlement; nothing new is gated.
 */
export function useStatsData(sample: boolean) {
  const p = useProfileData();
  const { canUse, showUpgrade } = useEntitlements();
  const signal = useSignal();
  const pending = usePending();
  const session = useSession();
  const pull = usePullState();
  const [guestOwner, setGuestOwner] = useState<string | null>(null);
  const [pulledKey, setPulledKey] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void Promise.all([readJson<string | null>(OWNER_KEY, null), readJson<string | null>(PULLED_KEY, null)]).then(([o, k]) => {
      if (live) {
        setGuestOwner(o);
        setPulledKey(k);
      }
    });
    return () => {
      live = false;
    };
  }, [pull.phase, session?.userId]);
  // Opening Stats while signed in brings the account's hunts up to date (at most once a minute).
  useEffect(() => {
    if (!sample && session?.userId) void refreshFromAccount(false);
  }, [sample, session?.userId]);
  const [stored, setStored] = useState<Scope | null>(null);
  const [storedLoaded, setStoredLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    void readJson<Scope | null>(STATS_SCOPE_KEY, null).then((v) => {
      if (live) {
        setStored(v);
        setStoredLoaded(true);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const today = sample ? SAMPLE_TODAY : todayET();
  const current = seasonOf(today);
  const userId = session?.userId ?? null;
  const entries = useMemo(() => (sample ? sampleEntries() : entriesForAccount(p.entries, userId, guestOwner)), [sample, p.entries, userId, guestOwner]);
  const roster = sample ? sampleRoster : p.roster;
  const lookup = sample ? sampleLookup : p.lookup;
  const seasons = useMemo(() => seasonsWithHunts(entries, current), [entries, current]);
  const multiYear = sample || canUse('multiYearStats');

  let scope: Scope = sample ? SAMPLE_SEASON : current;
  if (!sample && stored && storedLoaded) {
    const known = stored === ALL_TIME || seasons.some((s) => s.season === stored);
    if (known && (stored === current || multiYear)) scope = stored;
  }

  const setScope = useCallback(
    (next: Scope) => {
      if (next !== current && !multiYear) {
        showUpgrade('multiYearStats');
        return false;
      }
      setStored(next);
      if (!sample) void writeJson(STATS_SCOPE_KEY, next);
      return true;
    },
    [current, multiYear, sample, showUpgrade],
  );
  // The sample is fixed to its own season; choosing another sample season stays in memory only.
  const [sampleScope, setSampleScope] = useState<Scope>(SAMPLE_SEASON);
  const activeScope = sample ? sampleScope : scope;

  const ctx: Ctx = useMemo(() => ({ lookup, roster, today, woodcockSeparate: flags.woodcockLog, compareLast: multiYear }), [lookup, roster, today, multiYear]);
  const model = useMemo(() => buildStats(entries, activeScope, ctx), [entries, activeScope, ctx]);
  // Signed in on a phone that has not restored this account yet: wait for the pull instead of showing an empty season.
  const owesRestore = !sample && !!userId && pulledKey !== undefined && pulledKey !== userId && pull.pulledFor !== userId;
  const restoring = owesRestore && pull.phase !== 'failed';
  const restoreFailed = owesRestore && pull.phase === 'failed';
  const loading = !sample && ((!!p.loading && !p.data) || !storedLoaded || session === undefined || pulledKey === undefined || (restoring && entries.length === 0));

  return {
    sample,
    loading,
    error: sample ? undefined : p.error,
    entries,
    ctx,
    current,
    scope: activeScope,
    setScope: sample ? (n: Scope) => (setSampleScope(n), true) : setScope,
    seasons,
    multiYear,
    model,
    online: signal.online,
    pending: pending.count,
    reload: p.reload,
    /** Signed out: hunts stay on this phone. Stats only follow an account once signed in. */
    guest: !sample && session === null,
    signedIn: !!userId,
    restoring,
    restoreFailed,
    restoreError: pull.error,
    retryRestore: () => void refreshFromAccount(),
  };
}
export type StatsData = ReturnType<typeof useStatsData>;
