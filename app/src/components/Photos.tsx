import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Notice, ui } from '@/components/ui';
import { backend } from '@/data';
import type { PhotoBucket } from '@/data/backend';
import { resolveLocalPhoto } from '@/lib/photoStore';
import { pickPhoto, type PhotoSource, type PickedPhoto } from '@/lib/photos';
import { colors, fonts, radius, space, touchTarget } from '@/theme/tokens';

/** Copy shown next to every photo picker: photos are never altered by the app. */
export const PHOTOS_AS_UPLOADED = 'Photos are shared as uploaded. Signs, gates, parking areas and plates can show where you were, so crop them out first.';

/**
 * Resolve what to show for a photo: a local copy on this device first, else a
 * short-lived signed URL for its storage path (RLS decides who can read it).
 */
export function usePhotoSource(bucket: PhotoBucket, path: string | null | undefined, localUri?: string | null) {
  const local = resolveLocalPhoto(localUri);
  const [remote, setRemote] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'missing'>(local ? 'ready' : path ? 'loading' : 'missing');
  useEffect(() => {
    if (local || !path) {
      setState(local ? 'ready' : 'missing');
      return;
    }
    let live = true;
    setState('loading');
    backend
      .photoUrl(bucket, path)
      .then((url) => {
        if (!live) return;
        setRemote(url);
        setState(url ? 'ready' : 'missing');
      })
      .catch(() => live && setState('missing'));
    return () => {
      live = false;
    };
  }, [bucket, path, local]);
  return { uri: local ?? remote, state };
}

/** A stored photo (post or diary). Renders nothing when it can't be read. */
export function StoredPhoto({
  bucket,
  path,
  localUri,
  label = 'Photo',
  testID,
  compact,
}: {
  bucket: PhotoBucket;
  path?: string | null;
  localUri?: string | null;
  label?: string;
  testID?: string;
  compact?: boolean;
}) {
  const { uri, state } = usePhotoSource(bucket, path, localUri);
  const [failed, setFailed] = useState(false);
  if (state === 'missing' || failed) return null;
  return (
    <View style={[styles.frame, compact && styles.compact]} testID={testID}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessible
          accessibilityLabel={label}
          onError={() => setFailed(true)}
        />
      ) : (
        <ActivityIndicator color={colors.muted} accessibilityLabel={`Loading ${label.toLowerCase()}`} />
      )}
    </View>
  );
}

/**
 * Camera / library picker with previews and remove buttons. Up to `max`
 * photos. Picked photos are copied into app storage and upload later (posts
 * on Share, diary entries with the backup queue).
 */
export function PhotoPicker({
  photos,
  max,
  onAdd,
  onRemove,
  note,
  bucket = 'diary-photos',
  pick = pickPhoto,
}: {
  /** Where already-uploaded photos (no local copy) are read from. */
  bucket?: PhotoBucket;
  photos: { id: string; localUri?: string | null; path?: string | null }[];
  max: number;
  onAdd: (p: PickedPhoto) => void;
  onRemove: (id: string) => void;
  note?: string;
  /** Injected in tests. */
  pick?: (source: PhotoSource) => Promise<PickedPhoto | null>;
}) {
  const [busy, setBusy] = useState<PhotoSource | null>(null);
  const [error, setError] = useState<string>();
  const full = photos.length >= max;

  const choose = async (source: PhotoSource) => {
    setError(undefined);
    setBusy(source);
    try {
      const p = await pick(source);
      if (p) onAdd(p);
    } catch (e) {
      setError((e as Error).message || 'Couldn’t add that photo. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: space.sm }} testID="photo-picker">
      {photos.length > 0 && (
        <View style={styles.thumbs}>
          {photos.map((p, i) => (
            <View key={p.id} style={styles.thumb} testID={`photo-preview-${i}`}>
              <StoredPhoto bucket={bucket} path={p.path ?? null} localUri={p.localUri ?? null} label={`Photo ${i + 1}`} compact />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                onPress={() => onRemove(p.id)}
                style={styles.remove}
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={colors.text} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {!full && (
        <View style={styles.row}>
          <Button label="Take photo" icon="camera-outline" busy={busy === 'camera'} disabled={!!busy} onPress={() => void choose('camera')} style={{ flex: 1 }} />
          <Button label="Choose photo" icon="images-outline" busy={busy === 'library'} disabled={!!busy} onPress={() => void choose('library')} style={{ flex: 1 }} />
        </View>
      )}
      <Text style={ui.muted}>
        {max > 1 ? `Up to ${max} photos. ` : 'One photo. '}
        {note ?? PHOTOS_AS_UPLOADED}
      </Text>
      {error && <Notice tone="error">{error}</Notice>}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 4 / 3,
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: { aspectRatio: 1, borderRadius: radius.sm },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  thumb: { width: 96, height: 96 },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: touchTarget - 16,
    height: touchTarget - 16,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,26,19,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: space.sm },
  label: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.text },
});
