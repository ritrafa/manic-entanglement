import { afterEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_LOOK,
    REPTILE_COLLECTION,
    findReptile,
    loadReptile,
    rpcUrl,
} from './reptile';
import { DEFAULT_LOOK as SPRITE_DEFAULT } from '@/game/sprite';

const FULL_LOOK = {
    Back: 'Wings',
    Body: 'Gold',
    Clothes: 'Robe',
    Eye: 'Scanner',
    Head: 'Crown',
};

/** An asset item as the RPC returns it, with overridable parts. */
function reptileItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        grouping: [{ group_value: REPTILE_COLLECTION }],
        plugins: {
            attributes: {
                data: {
                    attribute_list: Object.entries(FULL_LOOK).map(([key, value]) => ({ key, value })),
                },
            },
        },
        content: { files: [{ uri: 'https://img.example/reptile.png' }] },
        ...overrides,
    };
}

function fakeFetch(body: unknown, ok = true): typeof fetch {
    return (async () => ({
        ok,
        status: ok ? 200 : 500,
        json: async () => body,
    })) as unknown as typeof fetch;
}

const OWNER = 'TestOwner111111111111111111111111111111';

describe('rpcUrl', () => {
    const saved = process.env.NEXT_PUBLIC_RPC_URL;
    afterEach(() => {
        if (saved === undefined) delete process.env.NEXT_PUBLIC_RPC_URL;
        else process.env.NEXT_PUBLIC_RPC_URL = saved;
    });

    it('is null when the variable is unset', () => {
        delete process.env.NEXT_PUBLIC_RPC_URL;
        expect(rpcUrl()).toBeNull();
    });

    it('is null when the variable is empty', () => {
        process.env.NEXT_PUBLIC_RPC_URL = '';
        expect(rpcUrl()).toBeNull();
    });

    it('is null for a plain http:// URL', () => {
        process.env.NEXT_PUBLIC_RPC_URL = 'http://rpc.example/api';
        expect(rpcUrl()).toBeNull();
    });

    it('returns the https:// URL when set', () => {
        process.env.NEXT_PUBLIC_RPC_URL = 'https://rpc.example/api';
        expect(rpcUrl()).toBe('https://rpc.example/api');
    });
});

describe('findReptile', () => {
    it('returns null for non-list input', () => {
        expect(findReptile(undefined)).toBeNull();
        expect(findReptile(null)).toBeNull();
        expect(findReptile({})).toBeNull();
        expect(findReptile([])).toBeNull();
        expect(findReptile('reptile')).toBeNull();
        expect(findReptile(42)).toBeNull();
    });

    it('returns null when no item is from the collection', () => {
        const other = reptileItem({ grouping: [{ group_value: 'SomeOtherCollection1111111111111111111111111111' }] });
        expect(findReptile([other])).toBeNull();
        expect(findReptile([{}, { grouping: [] }, { grouping: null }, 'x'])).toBeNull();
    });

    it('returns null when items have no grouping', () => {
        expect(findReptile([{ plugins: { attributes: { data: { attribute_list: [] } } } }])).toBeNull();
    });

    it('returns the look when all five traits are present', () => {
        const found = findReptile([reptileItem()]);
        expect(found).not.toBeNull();
        expect(found!.look).toEqual(FULL_LOOK);
        expect(found!.image).toBe('https://img.example/reptile.png');
    });

    it('defaults a missing trait', () => {
        const list = Object.entries(FULL_LOOK)
            .filter(([key]) => key !== 'Body')
            .map(([key, value]) => ({ key, value }));
        const found = findReptile([reptileItem({
            plugins: { attributes: { data: { attribute_list: list } } },
        })]);
        expect(found!.look.Body).toBe(DEFAULT_LOOK.Body);
        expect(found!.look.Back).toBe(FULL_LOOK.Back);
    });

    it('defaults an unknown trait value', () => {
        const list = Object.entries({ ...FULL_LOOK, Body: 'Laser' })
            .map(([key, value]) => ({ key, value }));
        const found = findReptile([reptileItem({
            plugins: { attributes: { data: { attribute_list: list } } },
        })]);
        expect(found!.look.Body).toBe(DEFAULT_LOOK.Body);
        expect(found!.look.Head).toBe(FULL_LOOK.Head);
    });

    it('gives DEFAULT_LOOK when there is no attribute list at all', () => {
        const found = findReptile([reptileItem({ plugins: {} })]);
        expect(found!.look).toEqual(DEFAULT_LOOK);
        expect(found!.look).toEqual(SPRITE_DEFAULT);
        expect(findReptile([reptileItem({ plugins: null })])!.look).toEqual(DEFAULT_LOOK);
    });

    it('rejects a javascript: image and a numeric image', () => {
        const evil = reptileItem({
            content: { files: [{ uri: 'javascript:alert(1)' }] },
        });
        expect(findReptile([evil])!.image).toBeNull();
        const numeric = reptileItem({ content: { files: [{ uri: 42 }] } });
        expect(findReptile([numeric])!.image).toBeNull();
        const noFiles = reptileItem({ content: {} });
        expect(findReptile([noFiles])!.image).toBeNull();
    });

    it('finds the matching item among others', () => {
        const other = reptileItem({ grouping: [{ group_value: 'Other1111111111111111111111111111111111111111' }] });
        const found = findReptile([other, reptileItem()]);
        expect(found!.look).toEqual(FULL_LOOK);
    });
});

describe('loadReptile', () => {
    const saved = process.env.NEXT_PUBLIC_RPC_URL;
    afterEach(() => {
        if (saved === undefined) delete process.env.NEXT_PUBLIC_RPC_URL;
        else process.env.NEXT_PUBLIC_RPC_URL = saved;
    });

    function useEndpoint() {
        process.env.NEXT_PUBLIC_RPC_URL = 'https://rpc.example/api';
    }

    it('found: OK reply with a matching item', async () => {
        useEndpoint();
        const result = await loadReptile(OWNER, fakeFetch({
            result: { items: [reptileItem()] },
        }));
        expect(result).toEqual({ status: 'found', look: FULL_LOOK, image: 'https://img.example/reptile.png' });
    });

    it('none: OK reply with an empty list', async () => {
        useEndpoint();
        expect(await loadReptile(OWNER, fakeFetch({ result: { items: [] } })))
            .toEqual({ status: 'none' });
        // A reply without the expected shape is "none", not a crash.
        expect(await loadReptile(OWNER, fakeFetch({}))).toEqual({ status: 'none' });
        expect(await loadReptile(OWNER, fakeFetch(null))).toEqual({ status: 'none' });
    });

    it('error: status 500', async () => {
        useEndpoint();
        expect(await loadReptile(OWNER, fakeFetch({ result: { items: [reptileItem()] } }, false)))
            .toEqual({ status: 'error' });
    });

    it('error: rejected fetch', async () => {
        useEndpoint();
        const boom = (async () => { throw new Error('network down'); }) as unknown as typeof fetch;
        expect(await loadReptile(OWNER, boom)).toEqual({ status: 'error' });
    });

    it('error: body that is not JSON', async () => {
        useEndpoint();
        const notJson = (async () => ({
            ok: true,
            status: 200,
            json: async () => { throw new SyntaxError('Unexpected token <'); },
        })) as unknown as typeof fetch;
        expect(await loadReptile(OWNER, notJson)).toEqual({ status: 'error' });
    });

    it('error: no endpoint configured', async () => {
        delete process.env.NEXT_PUBLIC_RPC_URL;
        expect(await loadReptile(OWNER, fakeFetch({ result: { items: [reptileItem()] } })))
            .toEqual({ status: 'error' });
    });
});
