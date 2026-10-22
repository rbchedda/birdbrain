import type { ReactNode } from 'react';

import { OnboardingConsent } from '@/components/OnboardingConsent';
import { useTermsConsent } from '@/lib/termsConsent';

/** Nothing (not even the map) renders until the current terms are accepted on this device. */
export function ConsentGate({ children }: { children: ReactNode }) {
  const consent = useTermsConsent();
  if (consent === 'loading') return null;
  if (consent === 'needed') return <OnboardingConsent />;
  return <>{children}</>;
}
