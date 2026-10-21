import { Redirect } from 'expo-router';

/** Old /learn links: the Guide tab replaced it (Navigation v2). */
export default function LegacyLearn() {
  return <Redirect href="/guide" />;
}
