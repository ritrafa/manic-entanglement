/**
 * The site's canonical base URL for share metadata, as a pure helper so the
 * fallback is testable without rendering the layout.
 *
 * `NEXT_PUBLIC_SITE_URL` is set on the deployment; when it is missing or not
 * a usable URL we fall back to the dev-server address instead of throwing.
 */
export const FALLBACK_SITE_URL = 'http://localhost:3000';

export function siteUrl(value: string | undefined): URL {
    if (typeof value === 'string' && value.trim() !== '') {
        try {
            return new URL(value);
        } catch {
            // Not a valid absolute URL: fall through to the dev fallback.
        }
    }
    return new URL(FALLBACK_SITE_URL);
}
