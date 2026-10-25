import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenHeader } from "@/components/Screen";
import { Badge, PlanDayCard } from "@/components/spot/PlanParts";
import {
  OfflineDirections,
  openDirections,
} from "@/components/spot/SpotActions";
import { Button, Notice } from "@/components/ui";
import { useMyCrews } from "@/data/crew";
import { startPlansSyncOnce } from "@/data/hooks";
import { speciesLabel } from "@/data/types";
import {
  deletePlan,
  getPlan,
  onPlansChange,
  rememberPlace,
  updatePlan,
  type Plan,
} from "@/lib/plans";
import { planSeasonClosed } from "@/lib/spotPlan";
import { colors, fonts, space } from "@/theme/tokens";

/** Plan detail (spec 07): step 1 card, species, notes, reminder, share; Edit, Directions, Share/Unshare, Delete. */
export default function PlanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const { crews } = useMyCrews();
  useEffect(() => {
    startPlansSyncOnce();
    const load = () => getPlan(id).then(setPlan);
    load();
    return onPlansChange(load);
  }, [id]);

  if (plan === undefined) return <View style={styles.root} />;
  if (!plan) {
    return (
      <View style={styles.root}>
        <ScreenHeader back backFallback="/profile/plans" title="Plan" />
        <Text style={[styles.muted, { padding: space.lg }]}>
          This plan was deleted.
        </Text>
      </View>
    );
  }
  const crew = crews?.[0] ?? null;
  const confirmDelete = () =>
    Alert.alert(
      "Delete this plan?",
      `${plan.place.name}. This can’t be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deletePlan(plan.id);
            router.back();
          },
        },
      ],
    );
  return (
    <View style={styles.root}>
      <ScreenHeader
        back
        backFallback="/profile/plans"
        title={plan.place.name}
        subtitle={
          plan.readOnly
            ? "Crew plan · view only"
            : plan.crew
              ? "Hunt plan · shared with crew"
              : "Hunt plan · private"
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        {planSeasonClosed(plan.place, plan.date, plan.species) && (
          <Notice tone="error">
            Season closed on this date. PGC dates changed or the season ended;
            pick another day.
          </Notice>
        )}
        <PlanDayCard place={plan.place} date={plan.date} />
        <Field
          label="Species"
          value={
            plan.species.map((s) => speciesLabel[s]).join(", ") ||
            "Any open species"
          }
        />
        {!!plan.notes && <Field label="Notes" value={plan.notes} />}
        {plan.readOnly && (
          <Text style={styles.muted} testID="plan-read-only">
            Shared with you by {plan.crew?.name ?? "your crew"} · view only
          </Text>
        )}
        <Field
          label="Share"
          value={
            plan.crew
              ? `Shared · ${plan.crew.name}${plan.shareFailed ? " (not shared yet)" : ""}`
              : "Only you"
          }
        />
        <View style={styles.badges}>
          {plan.sync !== "synced" && (
            <Badge text="Saved on phone · waiting to sync" tone="tan" />
          )}
        </View>
        {!plan.readOnly && (
          <Button
            label="Edit"
            icon="create-outline"
            onPress={() => {
              rememberPlace(plan.place);
              router.push({
                pathname: "/spot/[id]/plan",
                params: { id: plan.place.id, plan: plan.id },
              });
            }}
          />
        )}
        <Button
          label="Directions"
          icon="navigate"
          onPress={() => setOffline(!openDirections(plan.place))}
        />
        {offline && (
          <OfflineDirections
            place={plan.place}
            me={null}
            onClose={() => setOffline(false)}
          />
        )}
        {plan.readOnly ? null : plan.crew ? (
          <Button
            label="Unshare"
            icon="people-outline"
            onPress={() => updatePlan(plan.id, { crew: null })}
          />
        ) : (
          crew && (
            <Button
              label={`Share with ${crew.name}`}
              icon="people-outline"
              onPress={() =>
                updatePlan(plan.id, { crew: { id: crew.id, name: crew.name } })
              }
            />
          )
        )}
        {!plan.readOnly && (
          <Button
            label="Delete"
            icon="trash-outline"
            variant="danger"
            onPress={confirmDelete}
          />
        )}
      </ScrollView>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.text}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ground },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  text: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
});
