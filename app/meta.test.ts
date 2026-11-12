import { describe, it, expect } from 'vitest';
import { siteUrl, FALLBACK_SITE_URL } from './meta';

describe('siteUrl', () => {
    it('uses a valid absolute URL', () => {
        expect(siteUrl('https://www.manic-entanglement.com/').toString())
            .toBe('https://www.manic-entanglement.com/');
    });

    it('falls back when the variable is unset', () => {
        expect(siteUrl(undefined).toString()).toBe(FALLBACK_SITE_URL + '/');
        expect(siteUrl('').toString()).toBe(FALLBACK_SITE_URL + '/');
        expect(siteUrl('   ').toString()).toBe(FALLBACK_SITE_URL + '/');
    });

    it('falls back when the value is not a valid URL', () => {
        expect(siteUrl('not a url').toString()).toBe(FALLBACK_SITE_URL + '/');
        expect(siteUrl('/relative').toString()).toBe(FALLBACK_SITE_URL + '/');
    });
});
