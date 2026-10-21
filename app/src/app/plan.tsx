import { Redirect } from 'expo-router';

/** Old /plan links: the Guide tab replaced it (Navigation v2). */
export default function LegacyPlan() {
  return <Redirect href="/guide" />;
}
