import { Redirect } from 'expo-router';

/** Old deep link: the Plan/Learn tab is now the Guide tab. */
export default function OldGuideLink() {
  return <Redirect href="/guide" />;
}
