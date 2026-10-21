import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old /log deep links: always the private Log hunt form. */
export default function LegacyLog() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  return <Redirect href={{ pathname: '/new/log', params: placeId ? { placeId } : {} }} />;
}
