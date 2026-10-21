import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { ui } from "@/components/ui";
import type { BirdId } from "@/data/birds";
import { birdImages, licenseLabel } from "@/data/birdImages";
import credits from "../../assets/birds/CREDITS.json";
import { colors, fonts, radius, space } from "@/theme/tokens";

type Credit = { file: string; author: string; license: string };
const creditFor = (file: string) =>
  (credits as Credit[]).find((c) => c.file === file) ?? null;

/** Credit caption for a photo slot; placeholders say so until feat/guide-bird-photos adds licensed images. */
export function creditLine(file: string) {
  const c = creditFor(file);
  if (!c) return "Placeholder · licensed photo coming";
  return c.author
    ? `Photo: ${c.author} · ${licenseLabel(c.license)}`
    : `Photo: ${licenseLabel(c.license)}`;
}

/** A bird photo with its credit caption, or a grey placeholder when the slot has no licensed image yet. */
export function PhotoSlot({
  label,
  file,
  size = "tile",
}: {
  label: string;
  file: string;
  size?: "tile" | "full";
}) {
  const source = creditFor(file) ? birdImages[file] : undefined;
  return (
    <View style={styles.slotWrap}>
      {source ? (
        <Image
          source={source}
          resizeMode="cover"
          accessibilityLabel={`${label} photo`}
          testID={`photo-${file}`}
          style={[styles.slot, size === "full" && styles.slotFull]}
        />
      ) : (
        <View
          style={[styles.slot, size === "full" && styles.slotFull]}
          accessible
          accessibilityLabel={`${label} photo placeholder`}
          testID={`photo-${file}`}
        >
          <Text style={styles.slotText}>PHOTO</Text>
        </View>
      )}
      <Text
        style={styles.caption}
        numberOfLines={2}
        accessibilityRole="link"
        accessibilityLabel={`Photo credits: ${creditLine(file)}`}
        accessibilityHint="Opens the photo credits"
        onPress={() => router.push("/guide/credits")}
        testID={`caption-${file}`}
      >
        {creditLine(file)}
      </Text>
    </View>
  );
}

/** Bird ID tile (Guide) or full card (species detail): photo, field marks, look-alikes, credit. */
export function BirdCard({
  bird,
  variant = "tile",
}: {
  bird: BirdId;
  variant?: "tile" | "full";
}) {
  if (variant === "tile") {
    const photo = bird.photos[0];
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${bird.name} details`}
        onPress={() => router.push(`/guide/bird/${bird.key}`)}
        style={styles.tile}
      >
        <PhotoSlot label={photo.label} file={photo.file} />
        <Text style={styles.tileName}>
          {bird.photos.length > 1
            ? bird.photos.map((p) => p.label).join("/")
            : bird.name}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={[ui.card, { gap: space.sm }]} testID={`bird-${bird.key}`}>
      <View style={styles.photos}>
        {bird.photos.map((p) => (
          <View key={p.file} style={{ flex: 1 }}>
            <Text style={ui.muted}>{p.label}</Text>
            <PhotoSlot label={p.label} file={p.file} size="full" />
          </View>
        ))}
      </View>
      <Text style={styles.heading}>Field marks</Text>
      {bird.fieldMarks.map((m) => (
        <Text key={m} style={ui.body}>
          • {m}
        </Text>
      ))}
      <Text style={styles.heading}>Look-alikes</Text>
      {bird.lookAlikes.map((m) => (
        <Text key={m} style={ui.body}>
          • {m}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { width: 120, gap: space.xs },
  tileName: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  slotWrap: { gap: 2 },
  slot: {
    height: 90,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  slotFull: { height: 160 },
  slotText: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 1,
  },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  photos: { flexDirection: "row", gap: space.sm },
  heading: {
    fontFamily: fonts.headingSemi,
    fontSize: 18,
    color: colors.text,
    marginTop: space.sm,
  },
});
