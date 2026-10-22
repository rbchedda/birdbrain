import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenHeader } from '@/components/Screen';
import { Button, Chip, Notice, SectionTitle, ui } from '@/components/ui';
import { backend } from '@/data';
import { usePlaces } from '@/data/hooks';
import type { Place } from '@/data/types';
import { Gated, useEntitlements } from '@/entitlements';
import {
  AREA_RADII_KM,
  areaPack,
  cachedOutline,
  formatBytes,
  offlinePacks,
  offlineSupported,
  planPack,
  saveOutline,
  sglPack,
  terrainPackSources,
  useOfflinePacks,
  type PackBasemap,
  type PackManifest,
  type PackSpec,
} from '@/offline';
import { colors, radius, space } from '@/theme/tokens';

const LIST_LIMIT = 25;
const BASEMAP_LABEL: Record<PackBasemap, string> = { topo: 'Standard', satellite: 'Satellite' };

async function outlineFor(place: Place) {
  const saved = await cachedOutline(place.id);
  if (saved) return saved;
  try {
    const { outline } = await backend.placeDetail(place.id);
    void saveOutline(place.id, outline);
    return outline;
  } catch {
    return null;
  }
}

function statusText(m: PackManifest, running: boolean) {
  const pct = m.total ? Math.floor((m.done / m.total) * 100) : 0;
  if (running) return `Downloading ${pct}% · ${formatBytes(m.bytes)}`;
  if (m.status === 'complete') return `Ready offline · ${formatBytes(m.bytes)}`;
  if (m.status === 'error') return `${m.error ?? 'Some tiles failed.'} ${pct}% saved.`;
  return `Paused at ${pct}% · ${formatBytes(m.bytes)}`;
}

function PackRow({ m }: { m: PackManifest }) {
  const { canUse } = useEntitlements();
  const running = offlinePacks.isRunning(m.spec.id);
  return (
    <View style={styles.card} testID={`pack-${m.spec.id}`}>
      <Text style={ui.body}>{m.spec.name}</Text>
      <Text style={ui.muted}>
        {m.spec.basemaps.map((b) => BASEMAP_LABEL[b]).join(' + ')} · {statusText(m, running)}
      </Text>
      <View style={ui.row}>
        {running ? (
          <Button label="Cancel" icon="pause-outline" onPress={() => offlinePacks.cancel(m.spec.id)} />
        ) : m.status !== 'complete' && canUse('offlineMaps') ? (
          <Button
            label="Resume"
            icon="play-outline"
            onPress={() => start(m.spec, canUse('offlineMaps'))}
          />
        ) : null}
        <Button label="Delete" icon="trash-outline" variant="danger" onPress={() => void offlinePacks.delete(m.spec.id)} />
      </View>
    </View>
  );
}

function start(spec: PackSpec, allowed: boolean) {
  try {
    void offlinePacks.download(spec, allowed).done.catch(() => {});
  } catch {
    // Gate or already running: the row state already explains it.
  }
}

export default function OfflineMapsScreen() {
  const { canUse } = useEntitlements();
  const { places } = usePlaces();
  const packs = useOfflinePacks();
  const [basemaps, setBasemaps] = useState<PackBasemap[]>(['topo']);
  const [mode, setMode] = useState<'sgl' | number>('sgl');
  const [query, setQuery] = useState('');

  const lands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places
      .filter((p) => p.type === 'game_land' && (!q || p.name.toLowerCase().includes(q) || (p.county ?? '').toLowerCase().includes(q)))
      .slice(0, LIST_LIMIT);
  }, [places, query]);

  const toggle = (b: PackBasemap) =>
    setBasemaps((cur) => (cur.includes(b) ? (cur.length > 1 ? cur.filter((x) => x !== b) : cur) : [...cur, b]));

  const specFor = async (place: Place): Promise<PackSpec> =>
    mode === 'sgl' ? sglPack(place, await outlineFor(place), basemaps) : areaPack(place.name, place.center, mode, basemaps);

  const preview = (place: Place) =>
    planPack(mode === 'sgl' ? sglPack(place, null, basemaps) : areaPack(place.name, place.center, mode, basemaps));

  const saved = Object.values(packs).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <View style={styles.root}>
      <ScreenHeader back title="Offline maps" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Notice>
          Game land boundaries, access labels and the map notice keep working offline for places you have opened. That is
          free. Packs add the Standard and Satellite basemaps for when you have no signal.
        </Notice>
        {!offlineSupported && <Notice>Offline maps are available in the iOS and Android app.</Notice>}

        {/* Not gated: with a lapsed pass, packs can still be seen and deleted to free storage. */}
        {saved.length > 0 && <SectionTitle>Your packs</SectionTitle>}
        {saved.map((m) => (
          <PackRow key={m.spec.id} m={m} />
        ))}

        <Gated feature="offlineMaps">

          <SectionTitle>New pack</SectionTitle>
          <View style={ui.row}>
            {(['topo', 'satellite'] as PackBasemap[]).map((b) => (
              <Chip key={b} label={BASEMAP_LABEL[b]} active={basemaps.includes(b)} onPress={() => toggle(b)} />
            ))}
          </View>
          {terrainPackSources() === null && <Text style={ui.muted}>Terrain packs are coming with the Terrain basemap.</Text>}
          <View style={ui.row}>
            <Chip label="Whole game land" active={mode === 'sgl'} onPress={() => setMode('sgl')} />
            {AREA_RADII_KM.map((km) => (
              <Chip key={km} label={`${km} km around`} active={mode === km} onPress={() => setMode(km)} />
            ))}
          </View>
          <TextInput
            style={ui.input}
            placeholder="Search game lands or counties"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search game lands"
          />
          {lands.map((p) => {
            const plan = preview(p);
            const id = (mode === 'sgl' ? sglPack(p, null, basemaps) : areaPack(p.name, p.center, mode, basemaps)).id;
            const have = packs[id];
            return (
              <View key={p.id} style={styles.card} testID={`offline-place-${p.id}`}>
                <Text style={ui.body}>{p.name}</Text>
                <Text style={ui.muted}>
                  About {formatBytes(plan.estBytes)} · {plan.tiles.toLocaleString()} tiles (estimate)
                </Text>
                {!have && (
                  <Button
                    label="Download"
                    icon="download-outline"
                    variant="primary"
                    disabled={!offlineSupported}
                    onPress={() => void specFor(p).then((spec) => start(spec, canUse('offlineMaps')))}
                  />
                )}
              </View>
            );
          })}
        </Gated>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.sm },
  card: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, gap: space.xs },
});
