import { ENV } from '../config/env';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verifies a Cloudflare Turnstile token server-side.
 *
 * @param token  - The turnstile response token from the frontend widget
 * @param ip     - Optional client IP address for additional validation
 * @returns true if the token is valid (human), false otherwise
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  ip?: string
): Promise<boolean> {
  // ─── DEV BYPASS ──────────────────────────────────────────────────────────
  // Skip Turnstile entirely in development mode so you can login without
  // the Cloudflare widget. Remove this block before going to production.
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Turnstile] ⚠️ DEV MODE — Turnstile verification skipped');
    return true;
  }
  // ─────────────────────────────────────────────────────────────────────────

  const secretKey = ENV.TURNSTILE?.SECRET_KEY?.trim();

  if (!secretKey) {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined) {
      console.warn('[Turnstile] ⚠️ TURNSTILE_SECRET_KEY not set — bypassing in dev mode');
      return true;
    }
    console.error('[Turnstile] ❌ TURNSTILE_SECRET_KEY is not defined');
    return false;
  }

  // If no token provided
  if (!token) {
    // In development: bypass if frontend widget is disabled (no NEXT_PUBLIC_TURNSTILE_SITE_KEY)
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Turnstile] ⚠️ No turnstile token provided — bypassing in dev mode');
      return true;
    }
    console.warn('[Turnstile] ⚠️ No turnstile token provided');
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (ip) {
      formData.append('remoteip', ip);
    }

    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const data = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };

    if (!data.success) {
      console.warn('[Turnstile] ❌ Validation failed:', data['error-codes']);
    } else {
      console.log('[Turnstile] ✓ Token verified successfully');
    }

    return data.success === true;
  } catch (error) {
    console.error('[Turnstile] ❌ Error verifying token:', error);
    return false;
  }
}
