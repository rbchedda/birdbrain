import { router } from 'expo-router';

import { SignInSheet } from '@/components/SignInSheet';

/** Copy for #31's sign-in sheet on the 'crews' gate. */
export const crewSignInTitle = 'Crews need an account';
export const crewSignInBody = 'Guests can browse, but starting, joining or opening a private crew takes a free account.';

export function CrewSignInSheet() {
  return (
    <SignInSheet
      title={crewSignInTitle}
      body={crewSignInBody}
      onDismiss={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
