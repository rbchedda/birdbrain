import * as Linking from 'expo-linking';

/** exp://…/--/auth/callback in Expo Go, birdbrain://auth/callback in builds. */
export const authRedirectUrl = () => Linking.createURL('/auth/callback');

export interface AuthRedirectParams {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  errorCode?: string;
  errorDescription?: string;
}

/** Read code/token/error params from the query and the #fragment (implicit flow puts tokens there). */
export function parseAuthRedirect(url: string | null | undefined, query: Record<string, string | string[] | undefined> = {}): AuthRedirectParams {
  const all = new Map<string, string>();
  const add = (k: string, v: string | string[] | undefined) => {
    const s = Array.isArray(v) ? v[0] : v;
    if (s) all.set(k, s);
  };
  Object.entries(query).forEach(([k, v]) => add(k, v));
  if (url) {
    for (const part of [url.split('#')[1], url.split('?')[1]?.split('#')[0]]) {
      if (!part) continue;
      for (const kv of part.split('&')) {
        const [k, v = ''] = kv.split('=');
        try {
          add(decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' ')));
        } catch {
          // Malformed param: ignore it rather than crash.
        }
      }
    }
  }
  return {
    code: all.get('code'),
    accessToken: all.get('access_token'),
    refreshToken: all.get('refresh_token'),
    error: all.get('error'),
    errorCode: all.get('error_code'),
    errorDescription: all.get('error_description'),
  };
}

/** Friendly copy for the sign-in screen; never shows raw provider errors. */
export function authRedirectMessage(p: { errorCode?: string; errorDescription?: string; error?: string } | Error): string {
  const text = p instanceof Error ? p.message : `${p.errorCode ?? ''} ${p.error ?? ''} ${p.errorDescription ?? ''}`;
  if (/expired|otp_expired|invalid.*(grant|flow|code)|code verifier/i.test(text))
    return 'That email link has expired or was already used. Sign in below. Your hunts are still saved on this phone.';
  if (/already (been )?(confirmed|registered|verified)|email_exists|user_already/i.test(text))
    return 'Your email is already confirmed. Sign in below. Your hunts are still saved on this phone.';
  return 'We couldn’t finish signing you in from that link. Sign in below. Your hunts are still saved on this phone.';
}
