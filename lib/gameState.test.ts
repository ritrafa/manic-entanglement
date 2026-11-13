// The shell's wallet-side rules (E72), tested on a real GameState with a
// minimal DOM stand-in: a mid-run reset drops the verified run's token (no
// proof is asked at the end and the HUD mark goes), loading a reptile
// restores its progress into the save (max/union, written at once, quiet
// when nothing is new), the wardrobe's picks are tracked per layer since the
// load, and a confirmed save drops the proofs it sent.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import GameState from './GameState';
import { loadSave, type SaveData } from '@/game/save';
import { DEFAULT_LOOK } from '@/game/sprite';
import { noGear } from '@/game/gear';
import type { NftProgress } from '@/game/nftProgress';

// --- the minimal DOM the shell's constructor touches ----------------------

interface FakeStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    dump(): Record<string, string>;
}

function makeStorage(): FakeStorage {
    const store: Record<string, string> = {};
    return {
        getItem: (key) => (key in store ? store[key] : null),
        setItem: (key, value) => { store[key] = String(value); },
        dump: () => ({ ...store }),
    };
}

let storage: FakeStorage;

beforeEach(() => {
    storage = makeStorage();
    const element = () => ({
        classList: { add: () => {}, remove: () => {} },
        style: { setProperty: () => {} },
        setAttribute: () => {},
        appendChild: () => {},
        querySelector: () => null,
        remove: () => {},
    });
    vi.stubGlobal('document', {
        addEventListener: () => {},
        removeEventListener: () => {},
        documentElement: { style: { setProperty: () => {} }, setAttribute: () => {} },
        getElementById: () => null,
        createElement: element,
        hidden: false,
    });
    vi.stubGlobal('window', {
        addEventListener: () => {},
        removeEventListener: () => {},
        localStorage: storage,
    });
    vi.stubGlobal('Image', class { src = ''; });
    // A run that begins starts the frame clock; no frames are drawn here.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// --- private fields, reached the way the tests must -----------------------

function readField<T>(gs: GameState, name: string): T {
    return (gs as unknown as Record<string, T>)[name];
}

function writeField(gs: GameState, name: string, value: unknown): void {
    (gs as unknown as Record<string, unknown>)[name] = value;
}

function storedSave(): SaveData {
    const raw = storage.getItem('manic-entanglement.save');
    expect(typeof raw).toBe('string');
    return loadSave({ getItem: () => raw, setItem: () => {} });
}

describe('a reset un-verifies the live run (E72)', () => {
    test('the token is dropped and the HUD mark goes with it', () => {
        const gs = new GameState();
        writeField(gs, 'activeToken', 'token.text');
        readField<(this: GameState) => void>(gs, 'publishHud').call(gs);
        expect(gs.getSnapshot().verified).toBe(true);

        gs.resetProgress();

        expect(readField(gs, 'activeToken')).toBeNull();
        expect(gs.getSnapshot().verified).toBe(false);
    });

    test('the ended run asks the server for no proof', async () => {
        const gs = new GameState();
        let verifyCalls = 0;
        vi.stubGlobal('fetch', (async () => {
            verifyCalls += 1;
            return new Response('{}');
        }) as typeof fetch);
        gs.run.start();
        writeField(gs, 'activeToken', 'token.text');

        gs.resetProgress();
        readField<(this: GameState) => void>(gs, 'rememberRunLog').call(gs);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(verifyCalls).toBe(0);
    });

    test('without the reset the same run does ask (the control)', async () => {
        const gs = new GameState();
        let verifyCalls = 0;
        vi.stubGlobal('fetch', (async () => {
            verifyCalls += 1;
            return new Response(JSON.stringify({ proof: 'not.a.real.proof' }));
        }) as typeof fetch);
        gs.run.start();
        writeField(gs, 'activeToken', 'token.text');

        readField<(this: GameState) => void>(gs, 'rememberRunLog').call(gs);
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(verifyCalls).toBe(1);
    });
});

describe('loading a reptile restores its progress (Q24, E72)', () => {
    function carriedProgress(): NftProgress {
        return {
            look: { ...DEFAULT_LOOK, Background: 'Void' },
            best: { descent: 9999 },
            totals: { kills: 40, deepest: 12 },
            feats: ['first-exit'],
            traits: [{ layer: 'Back', trait: 'Wings' }],
            gear: { ...noGear(), boots: 2 },
            synced: 1234,
        };
    }

    test('bests, totals, feats, traits and gear merge into the written save', () => {
        const gs = new GameState();
        // A local save that wins on one front and loses on the rest.
        writeField(gs, 'save', {
            ...readField<SaveData>(gs, 'save'),
            best: { descent: 500 },
            totals: { kills: 100 },
            gear: { ...noGear(), boots: 1, gloves: 3 },
        });

        expect(gs.restoreReptileProgress(carriedProgress())).toBe(true);

        const saved = storedSave();
        expect(saved.best.descent).toBe(9999);      // the better best wins
        expect(saved.totals.kills).toBe(100);        // maxima, both ways
        expect(saved.totals.deepest).toBe(12);
        expect(saved.feats).toContain('first-exit');
        expect(saved.pickedUp).toContainEqual({ layer: 'Back', trait: 'Wings' });
        expect(saved.gear.boots).toBe(2);            // per-kind max
        expect(saved.gear.gloves).toBe(3);           // the local one survives
        expect(gs.getSnapshot().feats).toContain('first-exit');
    });

    test('nothing new to restore stays quiet', () => {
        const gs = new GameState();
        expect(gs.restoreReptileProgress(carriedProgress())).toBe(true);
        expect(gs.restoreReptileProgress(carriedProgress())).toBe(false);
    });
});

describe('the wardrobe pick since load (E72)', () => {
    test('a pick lands per layer and a reload clears the tracking', () => {
        const gs = new GameState();
        gs.setReptile({ asset: 'Asset1111111111111111111111111111111111111', number: null, look: null });
        expect(gs.getSnapshot().hasReptile).toBe(true);
        expect(gs.getSnapshot().lookPickedSinceLoad).toBe(false);
        expect(gs.getLookPicks()).toEqual({});

        gs.setWardrobeLook({ ...gs.getSnapshot().look, Body: 'Blue' });
        expect(gs.getSnapshot().lookPickedSinceLoad).toBe(true);
        expect(gs.getLookPicks().Body).toBe('Blue');

        gs.setReptile({ asset: 'Asset1111111111111111111111111111111111111', number: null, look: null });
        expect(gs.getSnapshot().lookPickedSinceLoad).toBe(false);
        expect(gs.getLookPicks()).toEqual({});
    });

    test('a pick fitLook refuses is not a pick', () => {
        const gs = new GameState();
        gs.setReptile({ asset: null, number: null, look: null });
        // Crown needs the collector feat; without it the look cannot change.
        gs.setWardrobeLook({ ...gs.getSnapshot().look, Head: 'Crown' });
        expect(gs.getSnapshot().lookPickedSinceLoad).toBe(false);
        expect(gs.getLookPicks()).toEqual({});
    });
});

describe('a confirmed save drops the proofs it sent (E72)', () => {
    test('only the sent texts leave the list', () => {
        const gs = new GameState();
        writeField(gs, 'save', {
            ...readField<SaveData>(gs, 'save'),
            pendingProofs: ['one.a', 'two.b', 'three.c'],
        });
        expect(gs.getPendingProofs()).toEqual(['one.a', 'two.b', 'three.c']);

        gs.removePendingProofs(['two.b', 'absent.d']);

        expect(gs.getPendingProofs()).toEqual(['one.a', 'three.c']);
        expect(storedSave().pendingProofs).toEqual(['one.a', 'three.c']);
        expect(gs.getSnapshot().pendingProofs).toBe(2);
    });
});

describe('a connected run asks for its seed when the countdown starts', () => {
    test('the start call goes out at 3, not at go, and the HUD knows a wallet is linked', () => {
        vi.useFakeTimers();
        try {
            const gs = new GameState();
            const calls: string[] = [];
            vi.stubGlobal('fetch', (async (url: string, init?: RequestInit) => {
                calls.push(`${init?.method ?? 'GET'} ${url}`);
                return new Response('{}', { status: 503 });
            }) as unknown as typeof fetch);

            gs.setWallet('11111111111111111111111111111111');
            expect(gs.getSnapshot().walletLinked).toBe(true);
            // Connecting wakes the start function once.
            expect(calls).toEqual(['GET /api/run/start']);

            expect(gs.startGame()).toBe(true);
            expect(calls).toEqual(['GET /api/run/start', 'POST /api/run/start']);

            gs.setWallet(null);
            expect(gs.getSnapshot().walletLinked).toBe(false);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    test('without a wallet the countdown asks nothing', () => {
        vi.useFakeTimers();
        try {
            const gs = new GameState();
            let calls = 0;
            vi.stubGlobal('fetch', (async () => { calls += 1; return new Response('{}'); }) as typeof fetch);
            expect(gs.startGame()).toBe(true);
            expect(calls).toBe(0);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});

const WALLET = '11111111111111111111111111111111';

/** Let the fake timers and the awaited fetches settle. */
async function settle(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('a start the server never answers asks the player (no silent unverified run)', () => {
    test('a failed start shows the prompt at go; Play unverified begins a local run', async () => {
        vi.useFakeTimers();
        try {
            const gs = new GameState();
            vi.stubGlobal('fetch', (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch);
            gs.setWallet(WALLET);
            expect(gs.startGame()).toBe(true);
            await settle(3100);

            expect(gs.getSnapshot().verifyPrompt).toBe('ask');

            gs.playUnverified();
            expect(gs.getSnapshot().verifyPrompt).toBeNull();
            expect(gs.getSnapshot().verified).toBe(false);
            expect(gs.run.phase).not.toBe('ready');
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    test('Retry that gets a token begins a verified run', async () => {
        vi.useFakeTimers();
        try {
            const gs = new GameState();
            let answer = false;
            vi.stubGlobal('fetch', (async (_url: string, init?: RequestInit) => {
                if (init?.method !== 'POST') return new Response(null, { status: 204 });
                if (!answer) throw new TypeError('offline');
                return Response.json({ token: 'tok.mac', seed: 42, start: { gear: {}, feats: [], pickedUp: [] } });
            }) as unknown as typeof fetch);
            gs.setWallet(WALLET);
            gs.startGame();
            await settle(3100);
            expect(gs.getSnapshot().verifyPrompt).toBe('ask');

            answer = true;
            const retry = gs.retryVerification();
            expect(gs.getSnapshot().verifyPrompt).toBe('retrying');
            await retry;

            expect(gs.getSnapshot().verifyPrompt).toBeNull();
            expect(gs.getSnapshot().verified).toBe(true);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });

    test('a server with verification switched off plays unverified without asking', async () => {
        vi.useFakeTimers();
        try {
            const gs = new GameState();
            vi.stubGlobal('fetch', (async () => Response.json({ error: 'verification off' }, { status: 503 })) as unknown as typeof fetch);
            gs.setWallet(WALLET);
            gs.startGame();
            await settle(3100);

            expect(gs.getSnapshot().verifyPrompt).toBeNull();
            expect(gs.getSnapshot().verified).toBe(false);
            expect(gs.run.phase).not.toBe('ready');
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});

describe('Settings can switch wallet and verification off', () => {
    test('off: no wallet is linked, nothing is asked of the server, the reptile is let go', () => {
        vi.useFakeTimers();
        try {
            const gs = new GameState();
            let calls = 0;
            vi.stubGlobal('fetch', (async () => { calls += 1; return new Response(null, { status: 204 }); }) as unknown as typeof fetch);
            gs.setWallet(WALLET);
            gs.setReptile({ asset: 'asset', number: '1', look: null });
            calls = 0;

            gs.setSetting('wallet', false);
            expect(gs.getSettings().wallet).toBe(false);
            expect(gs.getSnapshot().walletLinked).toBe(false);
            expect(gs.getSnapshot().hasReptile).toBe(false);

            // A late report from the closing wallet box links nothing either.
            gs.setWallet(WALLET);
            expect(gs.getSnapshot().walletLinked).toBe(false);
            gs.startGame();
            expect(calls).toBe(0);
        } finally {
            vi.clearAllTimers();
            vi.useRealTimers();
        }
    });
});
