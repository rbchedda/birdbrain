import { Redirect } from 'expo-router';

// Diary is home: the app opens on the Diary tab.
export default function Home() {
  return <Redirect href="/diary" />;
}
